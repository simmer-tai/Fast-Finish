import * as THREE from 'three';
import { rand } from '../random.js';
import { camera } from '../core.js';
import { HEAVY_FX, SWING_MIN_SIDE, fxScene, hitFxTint, spawnHologramChains } from './hitFx.js';
import { DUMMY_HEIGHT, DUMMY_RADIUS } from '../enemy/body.js';
import { en, hitDir, hitPoint } from '../enemy/state.js';
import type { Skin } from '../weapons/skins.js';

// ---- 電撃の当たり ----
// 当たった所から、折れ曲がった細い稲妻を敵の体の表面に這わせる（体を縦の円柱とみなし、その面に貼り付ける）。
// 体が動けば一緒に動き、体の裏へ回った所は消える。外へ跳ねる短い稲妻も少し出す。
// 形を短い間隔で引き直し、明るさも点滅させてバチバチと見せる。少し遅れて、当たった所のまわりに小さな放電も残す。
// 出てすぐに折れ目が暴れ出し、ところどころ途切れて、散るように消える。
// 稲妻と同時に、同じ色のまっすぐな光の筋を放射状に飛ばす。
// 白い背景でも見えるよう、加算せずに重ねる（外側のにじみ・本体・芯の 3 層）

export interface ArcLook {
  glow: number; // 外側のにじみ
  body: number; // 稲妻の本体
  core: number; // 芯（白く光らせる）
}

const TRUNK_SEGS = 10; // 幹の折れ目の数
const FORK_SEGS = 4; // 枝の折れ目の数
const MAX_FORKS = 2;
const JAG = 0.13; // 折れ曲がりの強さ（長さに対する割合）
const FLICKER = [0.014, 0.026] as const; // 形を引き直す間隔（秒）
const SCATTER = 2.2; // 消える間際に折れ目がどれだけ暴れるか（JAG への上乗せの倍率）
const BREAK_FROM = 0.2; // 寿命のこの割合から途切れ始める
const DRIFT = 2.5; // 空中の稲妻が、1 秒に自分の長さの何倍だけ外へ流れるか
// 層ごとの太さ（大きさ 1 のときの m）と濃さ
const LAYERS = [
  { key: 'glow', width: 0.13, alpha: 0.55 },
  { key: 'body', width: 0.055, alpha: 1 },
  { key: 'core', width: 0.022, alpha: 1 },
] as const;
const REF_DIST = 1.6; // この距離で大きさ 1 倍（hitFx.ts と同じ）
const SKIN = DUMMY_RADIUS * 1.06; // 体の表面に這わせるときの半径（少しだけ浮かせて、体にめり込ませない）

interface Bolt {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
  width: number;
  age: number; // 負なら出るまでの待ち時間
  life: number;
  forks: number;
  shapeAt: number; // 次に形を引き直す age
  bright: number; // 今の形の明るさ（点滅）
  trunk: THREE.Vector3[];
  fork: THREE.Vector3[][];
  forkFrom: number[]; // 枝が幹のどの折れ目から出るか
  cut: boolean[]; // 幹の折れ目 i の手前の区間を描かない（途切れ）
  colors: Record<'glow' | 'body' | 'core', THREE.Color>;
  body: THREE.Object3D | null; // 這わせる体（敵の root）。null なら空中に出す
  follow: THREE.Object3D | null; // 空中の稲妻を付いて行かせる物（銃口など）
  anchor: THREE.Vector3; // 体（または follow）の前のフレームの位置（動いた分だけ稲妻も動かす）
}
const MAX_BOLTS = 48;
const bolts: Bolt[] = [];
const boltPool: Bolt[] = [];

// 放射状に飛ぶ光の筋。速く飛び出してすぐ失速し、尾を縮めながら消える
interface Ray {
  pos: THREE.Vector3; // 先頭
  vel: THREE.Vector3;
  len: number;
  width: number;
  age: number;
  life: number;
  pts: THREE.Vector3[]; // 先頭と尾
  colors: Bolt['colors'];
}
const MAX_RAYS = 48;
const RAY_DRAG = 7;
const rays: Ray[] = [];
const rayPool: Ray[] = [];

// -- 描く物 --
const PTS_PER_BOLT = TRUNK_SEGS + 1 + MAX_FORKS * (FORK_SEGS + 1);
const MAX_V = (MAX_BOLTS * PTS_PER_BOLT + MAX_RAYS * 2) * 2 * LAYERS.length;
const positions = new Float32Array(MAX_V * 3);
const tints = new Float32Array(MAX_V * 4);
const across = new Float32Array(MAX_V);
const indices = new Uint16Array(MAX_V * 3);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('tint', new THREE.BufferAttribute(tints, 4).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('across', new THREE.BufferAttribute(across, 1).setUsage(THREE.DynamicDrawUsage));
geo.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage));
const mesh = new THREE.Mesh(
  geo,
  new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 tint;
      attribute float across;
      varying vec4 vTint;
      varying float vAcross;
      void main() {
        vTint = tint;
        vAcross = across;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vTint;
      varying float vAcross;
      void main() {
        // 帯の縁の近くだけ透ける（真ん中は濃いまま）
        float x2 = vAcross * vAcross;
        gl_FragColor = vec4(vTint.rgb, vTint.a * (1.0 - x2 * x2));
      }
    `,
  }),
);
mesh.frustumCulled = false;
mesh.visible = false;
mesh.renderOrder = 1; // 加算の光より後に描き、白く飛ばされないようにする
fxScene.add(mesh);

// -- 形 --
const axisA = new THREE.Vector3();
const axisB = new THREE.Vector3();
const forkDir = new THREE.Vector3();
// from から dir へ len 伸びる折れ線を out に書く。折れ目は前の折れ目からの酔歩で、根元は動かさない
function zigzag(out: THREE.Vector3[], from: THREE.Vector3, dir: THREE.Vector3, len: number, jag = JAG) {
  axisA.set(Math.abs(dir.y) < 0.9 ? 0 : 1, Math.abs(dir.y) < 0.9 ? 1 : 0, 0).cross(dir).normalize();
  axisB.crossVectors(dir, axisA);
  let a = 0;
  let b = 0;
  const segs = out.length - 1;
  for (let i = 0; i <= segs; i++) {
    if (i > 0) {
      a = a * 0.45 + rand(-1, 1) * jag;
      b = b * 0.45 + rand(-1, 1) * jag;
    }
    out[i].copy(from).addScaledVector(dir, (len * i) / segs).addScaledVector(axisA, a * len).addScaledVector(axisB, b * len);
  }
}
// 点を体の円柱の面へ横に押し出し、高さは体の中に収める
function hug(pts: THREE.Vector3[], body: THREE.Object3D) {
  const c = body.position;
  for (const p of pts) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const r = Math.hypot(dx, dz);
    if (r > 1e-5) {
      p.x = c.x + (dx / r) * SKIN;
      p.z = c.z + (dz / r) * SKIN;
    }
    p.y = THREE.MathUtils.clamp(p.y, c.y + 0.1, c.y + DUMMY_HEIGHT - 0.05);
  }
}
function reshape(b: Bolt) {
  const t = Math.max(0, b.age / b.life);
  const jag = JAG * (1 + SCATTER * t * t);
  zigzag(b.trunk, b.origin, b.dir, b.len, jag);
  if (b.body) hug(b.trunk, b.body);
  // 途切れ: 寿命が進むほど抜ける区間を増やす
  const gap = THREE.MathUtils.clamp((t - BREAK_FROM) / (1 - BREAK_FROM), 0, 1) * 0.8;
  for (let i = 0; i < b.cut.length; i++) b.cut[i] = i > 0 && Math.random() < gap;
  for (let f = 0; f < b.forks; f++) {
    const from = 2 + Math.floor(Math.random() * (TRUNK_SEGS - 4));
    b.forkFrom[f] = from;
    forkDir.randomDirection().multiplyScalar(0.9).add(b.dir).normalize();
    zigzag(b.fork[f], b.trunk[from], forkDir, b.len * rand(0.25, 0.45), jag);
    if (b.body) hug(b.fork[f], b.body);
  }
  // ときどき暗く落として、点滅させる
  b.bright = Math.random() < 0.2 ? 0.45 : rand(0.85, 1);
}

// -- 出す --
const toCam = new THREE.Vector3();
const boltDir = new THREE.Vector3();
const flow = new THREE.Vector3();
const scatter = new THREE.Vector3();
function addBolt(
  origin: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, life: number, age: number, forks: number, look: ArcLook,
  body: THREE.Object3D | null = null, follow: THREE.Object3D | null = null,
) {
  if (bolts.length >= MAX_BOLTS) boltPool.push(bolts.shift()!);
  const b = boltPool.pop() ?? {
    origin: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, width: 0, age: 0, life: 0, forks: 0, shapeAt: 0, bright: 1,
    trunk: Array.from({ length: TRUNK_SEGS + 1 }, () => new THREE.Vector3()),
    fork: Array.from({ length: MAX_FORKS }, () => Array.from({ length: FORK_SEGS + 1 }, () => new THREE.Vector3())),
    forkFrom: Array(MAX_FORKS).fill(0),
    cut: Array(TRUNK_SEGS + 1).fill(false),
    colors: { glow: new THREE.Color(), body: new THREE.Color(), core: new THREE.Color() },
    body: null, follow: null, anchor: new THREE.Vector3(),
  };
  b.origin.copy(origin);
  b.dir.copy(dir).normalize();
  b.len = len;
  b.width = width;
  b.life = life;
  b.age = age;
  b.forks = Math.min(MAX_FORKS, forks);
  b.shapeAt = 0;
  b.colors.glow.setHex(look.glow);
  b.colors.body.setHex(look.body);
  b.colors.core.setHex(look.core);
  b.body = body;
  b.follow = follow;
  if (body) b.anchor.copy(body.position);
  else if (follow) follow.getWorldPosition(b.anchor);
  bolts.push(b);
}

function addRay(at: THREE.Vector3, dir: THREE.Vector3, speed: number, len: number, width: number, life: number, look: ArcLook) {
  if (rays.length >= MAX_RAYS) rayPool.push(rays.shift()!);
  const r = rayPool.pop() ?? {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), len: 0, width: 0, age: 0, life: 0,
    pts: [new THREE.Vector3(), new THREE.Vector3()],
    colors: { glow: new THREE.Color(), body: new THREE.Color(), core: new THREE.Color() },
  };
  r.pos.copy(at);
  r.vel.copy(dir).multiplyScalar(speed);
  r.len = len;
  r.width = width;
  r.age = 0;
  r.life = life;
  r.colors.glow.setHex(look.glow);
  r.colors.body.setHex(look.body);
  r.colors.core.setHex(look.core);
  rays.push(r);
}

const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
// at: 当たった場所、hitDir: 攻撃の向き（攻撃した側から敵の奥へ）、swing: 刃が動いていた向き（あれば）、fx: 攻撃の演出の強さ
// body: 当たった敵の root（稲妻をその体に這わせる）
const normal = new THREE.Vector3();
const around = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// スキンの当たり: applyHit（当たりの処理）の間だけ、スキンに合わせて当たりの演出を変える。
// 稲妻を出すスキン（arc）は、斬撃の線と光線を稲妻と同じ色にして斬撃の線を太くし、
// 当てた所（at。省けば hitPoint）から今の敵（en）の体に稲妻を走らせる。火花を強めるスキン（hitSparks）は火花を増やす
const arcTint = new THREE.Color();
const ARC_SLASH_WIDTH = 2;
export function hitWithArcs(
  skin: Pick<Skin, 'arc' | 'hitSparks' | 'hologram'>, fx: number, swing: THREE.Vector3 | undefined, applyHit: () => void, at: THREE.Vector3 = hitPoint,
) {
  const look = skin.arc;
  hitFxTint.sparks = skin.hitSparks ?? null;
  hitFxTint.color = look ? arcTint.setHex(look.body) : null;
  hitFxTint.slashWidth = look ? ARC_SLASH_WIDTH : 1;
  applyHit();
  hitFxTint.color = null;
  hitFxTint.slashWidth = 1;
  hitFxTint.sparks = null;
  if (skin.hologram) spawnHologramChains(at, hitDir, swing, fx, skin.hologram);
  if (look) spawnArcs(at, hitDir, swing, fx, look, en.root);
}

export function spawnArcs(
  at: THREE.Vector3, hitDir: THREE.Vector3, swing: THREE.Vector3 | undefined, fx: number, look: ArcLook, body: THREE.Object3D,
) {
  toCam.subVectors(camera.position, at);
  const dist = Math.max(toCam.length(), 1e-3);
  toCam.divideScalar(dist);
  camera.updateMatrixWorld();
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  const size = THREE.MathUtils.clamp(Math.sqrt(dist / REF_DIST), 0.7, 4);
  const heavy = fx >= HEAVY_FX;
  // 攻撃の向き: 刃が動いていた向きのうち画面に沿った成分（奥へ向かうと縮んで見えるので）。
  // 突きのように画面に沿った成分がほとんど無ければ、攻撃した側から敵の奥への向き
  if (swing && swing.lengthSq() > 1e-8) flow.copy(swing).addScaledVector(toCam, -swing.dot(toCam));
  else flow.set(0, 0, 0);
  if (flow.lengthSq() < SWING_MIN_SIDE ** 2 * (swing?.lengthSq() ?? 0) || flow.lengthSq() < 1e-8) flow.copy(hitDir);
  flow.normalize();

  // 当たった所から体の表面を這う稲妻。面に沿った向き（回り込む向きと上下）へ走らせ、攻撃の向きへ強く寄せる
  normal.set(at.x - body.position.x, 0, at.z - body.position.z);
  if (normal.lengthSq() < 1e-8) normal.copy(hitDir).negate();
  normal.y = 0;
  normal.normalize();
  around.crossVectors(UP, normal);
  const crawl = Math.round((1.5 + fx) * rand(0.8, 1.2));
  for (let i = 0; i < crawl; i++) {
    const a = Math.random() * Math.PI * 2;
    boltDir.copy(around).multiplyScalar(Math.cos(a)).addScaledVector(UP, Math.sin(a));
    boltDir.multiplyScalar(0.5).addScaledVector(flow, 1).addScaledVector(normal, -flow.dot(normal));
    addBolt(
      at, boltDir,
      rand(0.5, 1.1) * Math.sqrt(fx) * size,
      size,
      rand(0.09, 0.15) * (heavy ? 1.4 : 1),
      -rand(0, 0.03),
      Math.random() < 0.5 ? 0 : 1,
      look,
      body,
    );
  }
  // 体から攻撃の向きへ遠く伸びる稲妻。向きのばらつきは小さくし、目に刺さる向きは避ける
  const count = heavy ? 2 : 1;
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 4; tries++) {
      boltDir.randomDirection().multiplyScalar(0.3).add(flow).normalize();
      if (boltDir.dot(toCam) < 0.6) break;
    }
    addBolt(at, boltDir, rand(0.9, 1.8) * Math.sqrt(fx) * size, size, rand(0.08, 0.13) * (heavy ? 1.4 : 1), -rand(0, 0.02), 1, look);
  }
  // 稲妻と同時に、放射状に飛ぶ光の筋。画面に沿った向きへ散らし、攻撃の向きへ少し寄せる
  const rayCount = Math.round(rand(7, 10) * (heavy ? 1.4 : 1));
  for (let i = 0; i < rayCount; i++) {
    const a = ((i + Math.random() * 0.7) / rayCount) * Math.PI * 2; // 全周にむらなく
    boltDir.copy(camRight).multiplyScalar(Math.cos(a)).addScaledVector(camUp, Math.sin(a)).addScaledVector(flow, 0.35).normalize();
    addRay(at, boltDir, rand(7, 14) * Math.sqrt(fx) * size, rand(0.25, 0.5) * size, 0.8 * size, rand(0.12, 0.2) * (heavy ? 1.3 : 1), look);
  }
  // 遅れて、当たった所のまわりの体の上に短い放電を残す
  const after = heavy ? 2 : 1;
  for (let i = 0; i < after; i++) {
    scatter.randomDirection().multiplyScalar(0.12 * size).add(at);
    boltDir.randomDirection();
    addBolt(scatter, boltDir, rand(0.15, 0.35) * size, 0.7 * size, rand(0.05, 0.09), -rand(0.05, 0.14), 1, look, body);
  }
}

// 空振りで壁や床を叩いた所の放電（weapons/wallHit.ts）: 面に沿って短い稲妻を這わせ、光の筋を少しだけ散らす。
// 敵に当てたときより小さく短くする。n: 面の外向き、swing: 刃が動いていた向き（面に沿わせてあるもの。あれば）
const X_AXIS = new THREE.Vector3(1, 0, 0);
const wallSide = new THREE.Vector3();
const wallUp = new THREE.Vector3();
export function spawnWallArcs(at: THREE.Vector3, n: THREE.Vector3, swing: THREE.Vector3 | undefined, fx: number, look: ArcLook) {
  const size = THREE.MathUtils.clamp(Math.sqrt(Math.max(camera.position.distanceTo(at), 1e-3) / REF_DIST), 0.7, 4);
  // 面に沿った 2 つの向き
  wallSide.crossVectors(Math.abs(n.y) > 0.9 ? X_AXIS : UP, n).normalize();
  wallUp.crossVectors(n, wallSide);
  const crawl = Math.round((1 + fx) * rand(0.8, 1.2));
  for (let i = 0; i < crawl; i++) {
    const a = Math.random() * Math.PI * 2;
    boltDir.copy(wallSide).multiplyScalar(Math.cos(a)).addScaledVector(wallUp, Math.sin(a));
    if (swing) boltDir.addScaledVector(swing, 1.2);
    boltDir.addScaledVector(n, 0.08); // 面に埋もれないよう少しだけ浮かせる
    addBolt(at, boltDir, rand(0.3, 0.7) * Math.sqrt(fx) * size, 0.8 * size, rand(0.07, 0.12), -rand(0, 0.03), Math.random() < 0.5 ? 0 : 1, look);
  }
  const rayCount = Math.round(rand(4, 6));
  for (let i = 0; i < rayCount; i++) {
    const a = ((i + Math.random() * 0.7) / rayCount) * Math.PI * 2;
    boltDir.copy(wallSide).multiplyScalar(Math.cos(a)).addScaledVector(wallUp, Math.sin(a)).addScaledVector(n, 0.5).normalize();
    addRay(at, boltDir, rand(5, 9) * Math.sqrt(fx) * size, rand(0.15, 0.3) * size, 0.6 * size, rand(0.1, 0.16), look);
  }
}

// 銃口の放電: 撃った瞬間に、銃口から前と横へ短く細い稲妻を数本はじかせる。
// 銃は目の前にあるので、体に這わせる稲妻よりずっと細く短くし、銃口に付いて動かす（反動で銃が跳ねても置いていかれない）
const MUZZLE_ARC_WIDTH = 0.05; // LAYERS の太さに掛ける（にじみ 6.5 mm・本体 2.8 mm・芯 1.1 mm）
const muzzleAt = new THREE.Vector3();
const muzzleFwd = new THREE.Vector3();
export function spawnMuzzleArcs(muzzle: THREE.Object3D, look: ArcLook) {
  muzzle.updateWorldMatrix(true, false);
  muzzle.getWorldPosition(muzzleAt);
  muzzleFwd.set(0, 0, -1).transformDirection(muzzle.matrixWorld);
  const count = Math.round(rand(3, 5));
  for (let i = 0; i < count; i++) {
    boltDir.randomDirection().addScaledVector(muzzleFwd, 0.9).normalize();
    addBolt(
      muzzleAt, boltDir, rand(0.04, 0.1), MUZZLE_ARC_WIDTH, rand(0.05, 0.09), -rand(0, 0.025),
      Math.random() < 0.5 ? 0 : 1, look, null, muzzle,
    );
  }
}

// -- 進めて描く --
const tangent = new THREE.Vector3();
const side = new THREE.Vector3();
const eye = new THREE.Vector3();
let vCount = 0;
let iCount = 0;
// 折れ線をカメラへ向けた帯にする。根元から先へ細くしていく。body を渡すと、体の裏へ回った所を消す
function strip(pts: THREE.Vector3[], width: number, color: THREE.Color, alpha: number, body: THREE.Object3D | null, cut?: boolean[]) {
  const n = pts.length;
  const first = vCount;
  for (let i = 0; i < n; i++) {
    tangent.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
    eye.subVectors(camera.position, pts[i]);
    side.crossVectors(tangent, eye).normalize().multiplyScalar((width * (1 - 0.75 * (i / (n - 1)))) / 2);
    let facing = 1;
    if (body) {
      const rx = pts[i].x - body.position.x;
      const rz = pts[i].z - body.position.z;
      const d = (rx * eye.x + rz * eye.z) / (Math.hypot(rx, rz) * Math.hypot(eye.x, eye.z) || 1);
      facing = THREE.MathUtils.smoothstep(d, -0.1, 0.25);
    }
    for (const s of [1, -1]) {
      const v = vCount++;
      positions[v * 3] = pts[i].x + side.x * s;
      positions[v * 3 + 1] = pts[i].y + side.y * s;
      positions[v * 3 + 2] = pts[i].z + side.z * s;
      tints[v * 4] = color.r;
      tints[v * 4 + 1] = color.g;
      tints[v * 4 + 2] = color.b;
      tints[v * 4 + 3] = alpha * facing;
      across[v] = s;
    }
    if (i === 0 || cut?.[i]) continue;
    const a = first + (i - 1) * 2;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], iCount);
    iCount += 6;
  }
}

const moved = new THREE.Vector3();
export function updateArcs(dt: number) {
  let n = 0;
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[i];
    b.age += dt;
    if (b.age >= b.life) {
      boltPool.push(b);
      continue;
    }
    // 体が消えたら（倒した）体の上の稲妻も消す。体が動いたら一緒に動かす
    if (b.body && !b.body.visible) {
      boltPool.push(b);
      continue;
    }
    bolts[n++] = b;
    if (b.body) {
      moved.subVectors(b.body.position, b.anchor);
      b.anchor.copy(b.body.position);
      b.origin.add(moved);
      for (const p of b.trunk) p.add(moved);
      for (let f = 0; f < b.forks; f++) for (const p of b.fork[f]) p.add(moved);
    } else if (b.age >= 0) {
      // 空中の稲妻は外へ流れていく。付いて行く物があれば、それが動いた分も動かす
      moved.copy(b.dir).multiplyScalar(b.len * DRIFT * dt);
      if (b.follow) {
        b.follow.getWorldPosition(eye);
        moved.add(eye).sub(b.anchor);
        b.anchor.copy(eye);
      }
      b.origin.add(moved);
      for (const p of b.trunk) p.add(moved);
      for (let f = 0; f < b.forks; f++) for (const p of b.fork[f]) p.add(moved);
    }
    if (b.age >= 0 && b.age >= b.shapeAt) {
      reshape(b);
      b.shapeAt = b.age + rand(FLICKER[0], FLICKER[1]);
    }
  }
  bolts.length = n;

  const drag = Math.max(0, 1 - RAY_DRAG * dt);
  n = 0;
  for (let i = 0; i < rays.length; i++) {
    const r = rays[i];
    r.age += dt;
    if (r.age >= r.life) {
      rayPool.push(r);
      continue;
    }
    rays[n++] = r;
    r.pos.addScaledVector(r.vel, dt);
    r.vel.multiplyScalar(drag);
  }
  rays.length = n;

  vCount = 0;
  iCount = 0;
  // にじみ → 本体 → 芯の順に重ねる
  for (const layer of LAYERS) {
    for (const b of bolts) {
      if (b.age < 0) continue;
      const fade = b.bright * (1 - b.age / b.life) ** 0.4; // 終わり際まで濃さを保つ
      const w = layer.width * b.width;
      strip(b.trunk, w, b.colors[layer.key], layer.alpha * fade, b.body, b.cut);
      // 枝は途切れ始めた幹から根元が外れたものとして、途中で先に消す
      if (b.age / b.life < 0.6) {
        for (let f = 0; f < b.forks; f++) strip(b.fork[f], w * 0.6, b.colors[layer.key], layer.alpha * fade * 0.8, b.body);
      }
    }
    // 光の筋は先頭を太く、尾へ細くする。尾は飛ぶにつれて縮む
    for (const r of rays) {
      const t = r.age / r.life;
      const speed = r.vel.length();
      if (speed < 1e-4) continue;
      r.pts[0].copy(r.pos);
      r.pts[1].copy(r.pos).addScaledVector(r.vel, -(r.len * (1 - t)) / speed);
      strip(r.pts, layer.width * r.width * (1 - 0.5 * t), r.colors[layer.key], layer.alpha * (1 - t) ** 0.5, null);
    }
  }
  mesh.visible = iCount > 0;
  if (!mesh.visible) return;
  geo.setDrawRange(0, iCount);
  for (const name of ['position', 'tint', 'across'] as const) geo.getAttribute(name).needsUpdate = true;
  geo.index!.needsUpdate = true;
}

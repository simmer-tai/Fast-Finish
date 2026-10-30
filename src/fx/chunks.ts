import * as THREE from 'three';
import { floorAt, gridMaterial } from '../world/blocks.js';
import { player, position, velocity } from '../player/state.js';
import { options, type Quality } from '../ui/options.js';

// ---- 破片 ----
// 床や柱が砕けた欠片、ボスの装甲の破片。転がりながら跳ねて、床や箱の上に落ち着く。
// life を省いた破片は、ステージを出るまで床に残る。画質ごとの数（CHUNK_LIMIT）を超えたら、古いものから縮んで消える。
// 床に落ちている破片も、プレイヤーが歩いて蹴ったり、ボスの足や体・攻撃の風圧や衝撃波で跳ね飛ばされたりする
const MAX_CHUNKS = 500;
const CHUNK_LIMIT: Record<Quality, number> = { low: 150, medium: 300, high: MAX_CHUNKS };
const GRAVITY = 22;
const BOUNCE = 0.35; // 跳ね返るときに残す縦の速さの割合
const SKID = 0.6; // 跳ね返るときに残す横の速さの割合
const SETTLE_SPEED = 1.5; // 床に着いたとき、縦の速さがこれより遅ければ落ち着く
const SHRINK = 0.4; // 消える前のこの時間で縮む
const KICK_REACH = 0.25; // プレイヤーの足もとの、この距離（と破片の大きさ）に入った破片を蹴る
const KICK_SPEED = 0.7; // 蹴る速さ（プレイヤーの速さに掛ける）
const KICK_UP = 1.5; // 蹴ったときに上へ足す速さ
const KICK_MIN_SPEED = 1; // プレイヤーがこれより遅ければ蹴らない
const HEAVY = 0.5; // 一辺がこれより大きい破片ほど、押されても動きにくい

interface Chunk {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  q: THREE.Quaternion;
  axis: THREE.Vector3; // 回る軸
  spin: number; // 回る速さ (rad/s)
  size: THREE.Vector3;
  life: number; // 消えるまで（Infinity なら残る）
  age: number;
  rest: boolean; // 床に落ち着いた
  light: number;
}
const chunks: Chunk[] = [];

// 破片は小さいので、地形のグリッド（太線 5cm）だと線ばかりになる。細かく薄い線だけにする
const CHUNK_GRID = `
  float fine = gridLine(uv, 0.25, 0.006);
  diffuseColor.rgb *= 1.0 - fine * 0.18;
`;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), gridMaterial(CHUNK_GRID, undefined, 'part'), MAX_CHUNKS);
mesh.count = 0;
mesh.frustumCulled = false;
mesh.castShadow = mesh.receiveShadow = true;
{
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX_CHUNKS; i++) mesh.setColorAt(i, white);
}

// parent（ステージ）に破片を置く。ステージへ入るたびに呼ぶ
export function attachChunks(parent: THREE.Object3D) {
  chunks.length = 0;
  mesh.count = 0;
  parent.add(mesh);
}

export interface ChunkSpawn {
  count: number;
  size: [number, number]; // 一辺の長さの幅 (m)
  speed: [number, number]; // 飛び散る速さの幅 (m/s)
  up: number; // 上へ足す速さ
  dir?: THREE.Vector3; // 飛ばす向き（省けばまわりへ均等に）
  spread?: number; // 出す位置のばらつき (m)
  light: [number, number]; // 明るさの幅
  life?: number; // 省けば残る
}
const lerp = (r: [number, number]) => r[0] + (r[1] - r[0]) * Math.random();
// 破片に速さを足して動かす（大きいものほど動きにくい）
function kick(c: Chunk, vx: number, vy: number, vz: number) {
  const k = Math.min(1, HEAVY / Math.max(c.size.x, c.size.z));
  c.vel.x += vx * k;
  c.vel.y = Math.max(c.vel.y, vy * k);
  c.vel.z += vz * k;
  if (c.rest) {
    c.rest = false;
    c.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    c.spin = 3 + Math.random() * 8;
  }
}
// (x, z) から外へ吹き飛ばす（爆発・床を打つ・足を着く）。radius の外は動かさず、近いほど強い
export function pushChunks(x: number, z: number, radius: number, strength: number, up: number) {
  for (const c of chunks) {
    const dx = c.pos.x - x;
    const dz = c.pos.z - z;
    const d = Math.hypot(dx, dz);
    if (d > radius || c.pos.y > 3) continue;
    const f = 1 - d / radius;
    const nx = d > 1e-3 ? dx / d : Math.random() - 0.5;
    const nz = d > 1e-3 ? dz / d : Math.random() - 0.5;
    kick(c, nx * strength * f * (0.7 + 0.6 * Math.random()), up * f * (0.6 + 0.8 * Math.random()), nz * strength * f * (0.7 + 0.6 * Math.random()));
  }
}
// (x, z) のまわり radius にある破片を、(vx, vz) の速さで動く物が押しのける（ボスの体が滑る・歩く）
export function sweepChunks(x: number, z: number, radius: number, vx: number, vz: number) {
  const v = Math.hypot(vx, vz);
  if (v < 0.5) return;
  for (const c of chunks) {
    const dx = c.pos.x - x;
    const dz = c.pos.z - z;
    const d = Math.hypot(dx, dz);
    if (!c.rest || d > radius || c.pos.y > 2) continue;
    // 進む向きへ押しつつ、横へはじく
    const side = d > 1e-3 ? 0.6 * v : 0;
    kick(c, vx * 1.1 + (dx / Math.max(d, 1e-3)) * side, 1 + 0.15 * v, vz * 1.1 + (dz / Math.max(d, 1e-3)) * side);
  }
}
// 広がる衝撃波の輪（(x, z) から半径 r、幅 band）にかかった、床の上の破片を跳ね上げる
export function shockChunks(x: number, z: number, r: number, band: number, up: number) {
  for (const c of chunks) {
    if (!c.rest) continue;
    const dx = c.pos.x - x;
    const dz = c.pos.z - z;
    const d = Math.hypot(dx, dz);
    if (Math.abs(d - r) > band) continue;
    kick(c, (dx / Math.max(d, 1e-3)) * up * 0.4, up * (0.7 + 0.6 * Math.random()), (dz / Math.max(d, 1e-3)) * up * 0.4);
  }
}
// 範囲の床に、細かい瓦礫を散らしておく（画質ごとの数まで）
export function scatterRubble(minX: number, maxX: number, minZ: number, maxZ: number, count: number) {
  const limit = CHUNK_LIMIT[options.quality];
  for (let k = 0; k < count && chunks.length < limit; k++) {
    const s = 0.12 + 0.45 * Math.random() ** 2;
    const sy = s * (0.35 + 0.4 * Math.random());
    const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
    const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
    chunks.push({
      pos: new THREE.Vector3(x, floorAt(x, z, 0) + sy / 2, z),
      vel: new THREE.Vector3(),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0)),
      axis: new THREE.Vector3(0, 1, 0),
      spin: 0,
      size: new THREE.Vector3(s * (0.7 + 0.6 * Math.random()), sy, s * (0.7 + 0.6 * Math.random())),
      life: Infinity,
      age: 0,
      rest: true,
      light: 0.42 + 0.25 * Math.random(),
    });
  }
}
const tmpDir = new THREE.Vector3();
export function spawnChunks(at: THREE.Vector3, o: ChunkSpawn) {
  for (let k = 0; k < o.count; k++) {
    if (chunks.length >= MAX_CHUNKS) chunks.shift();
    tmpDir.set(Math.random() * 2 - 1, Math.random() * 0.6, Math.random() * 2 - 1).normalize();
    if (o.dir) tmpDir.add(o.dir).normalize();
    const s = lerp(o.size);
    const sp = o.spread ?? 0;
    chunks.push({
      pos: at.clone().add(new THREE.Vector3((Math.random() * 2 - 1) * sp, (Math.random() * 2 - 1) * sp, (Math.random() * 2 - 1) * sp)),
      vel: tmpDir.clone().multiplyScalar(lerp(o.speed)).setY(tmpDir.y * lerp(o.speed) + o.up),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spin: 4 + Math.random() * 10,
      // 平たい欠片が多くなるよう、縦を縮める
      size: new THREE.Vector3(s * (0.7 + 0.6 * Math.random()), s * (0.35 + 0.4 * Math.random()), s * (0.7 + 0.6 * Math.random())),
      life: o.life ?? Infinity,
      age: 0,
      rest: false,
      light: lerp(o.light),
    });
  }
}

const turn = new THREE.Quaternion();
const m = new THREE.Matrix4();
const scale = new THREE.Vector3();
const color = new THREE.Color();
const flat = new THREE.Euler();
export function updateChunks(dt: number) {
  if (!mesh.parent) return;
  // プレイヤーが歩いて・走って、足もとの破片を蹴る
  const pv = Math.hypot(velocity.x, velocity.z);
  if (player.onGround && pv > KICK_MIN_SPEED) {
    for (const c of chunks) {
      if (!c.rest || c.pos.y - c.size.y > position.y + 0.3) continue; // 蹴るのは床に落ち着いている破片だけ（続けて速さを足さない）
      const reach = KICK_REACH + Math.max(c.size.x, c.size.z) / 2;
      if (Math.abs(c.pos.x - position.x) > reach || Math.abs(c.pos.z - position.z) > reach) continue;
      kick(c, velocity.x * KICK_SPEED * (0.8 + 0.4 * Math.random()), KICK_UP + 0.1 * pv, velocity.z * KICK_SPEED * (0.8 + 0.4 * Math.random()));
    }
  }
  // 画質ごとの数を超えた分は、古いもの（配列の前）から縮めて消す。もう縮んでいるものも数に入れる
  for (let i = 0, over = chunks.length - CHUNK_LIMIT[options.quality]; i < over; i++) {
    const c = chunks[i];
    c.life = Math.min(c.life, c.age + SHRINK);
  }
  let n = 0;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    c.age += dt;
    if (c.age >= c.life) {
      chunks.splice(i, 1);
      continue;
    }
    if (!c.rest) {
      c.vel.y -= GRAVITY * dt;
      c.pos.addScaledVector(c.vel, dt);
      c.q.premultiply(turn.setFromAxisAngle(c.axis, c.spin * dt));
      const ground = floorAt(c.pos.x, c.pos.z, c.pos.y + c.size.y) + c.size.y / 2;
      if (c.pos.y < ground) {
        c.pos.y = ground;
        if (Math.abs(c.vel.y) < SETTLE_SPEED) {
          // 落ち着く: 平たい面を下にして寝かせる
          c.rest = true;
          c.q.setFromEuler(flat.set(0, Math.random() * Math.PI * 2, 0));
        } else {
          c.vel.y = -c.vel.y * BOUNCE;
          c.vel.x *= SKID;
          c.vel.z *= SKID;
          c.spin *= SKID;
        }
      }
    }
  }
  for (const c of chunks) {
    const shrink = Math.min(1, (c.life - c.age) / SHRINK);
    m.compose(c.pos, c.q, scale.copy(c.size).multiplyScalar(shrink));
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, color.setScalar(c.light));
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

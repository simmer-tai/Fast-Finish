import * as THREE from 'three';
import { rand } from '../random.js';
import { options, type Quality } from '../ui/options.js';

// ---- 当たりの光の演出 ----
// 中心の閃光・放射状に伸びる光線・斬撃に沿った光の線・光の粒を、加算で重ねる。
// 画面を暗くする後処理のあとに fxScene として描くので、光だけは暗くならない（後処理の強さは main.ts の updateHitFx で決める）

// 本体から受け取るもの
export interface HitFxEnv {
  camera: THREE.Camera;
  floorAt(x: number, z: number, y: number): number; // 破片が跳ねる床の高さ
  shardTint(): THREE.Color; // 破片の色（tint を渡さなかったとき）。描くたびに読む
  bodyHeight: number; // とどめで破片を割り出す、敵の体の高さと半径
  bodyRadius: number;
  hitStop: { normal: number; kill: number; finale: number }; // 暗転を保つ長さ
}
let env: HitFxEnv;
export function initHitFx(e: HitFxEnv) {
  env = e;
}
// 攻撃の定義のうち、光の演出に使うもの
interface HitFxDef {
  fx?: number;
  slash?: number;
  hitStop?: number;
}
const DEG = Math.PI / 180;

export const HIT_TINT = new THREE.Color(0xffffff); // 光の色（ゲームの配色に合わせて白一色）
export const HIT_CORE = new THREE.Color(0xffffff); // 中心の色
// 当たりの光線・斬撃の線・光の筋の色と、斬撃の線の太さの倍率を差し替える（スキンに合わせるとき）。当てる直前に入れ、終わったら戻す
export const hitFxTint = { color: null as THREE.Color | null, slashWidth: 1, sparks: null as HitSparks | null };
// スキンで強めた当たりの火花。count / life / size は元の火花の数・長さ・大きさ（飛ぶ速さも）の倍率。
// embers: 元の火花の数に対する、ゆっくり飛んで長く残り、落ちていく火の粉の割合。tint: 白から変わっていく色
export interface HitSparks { count: number; life: number; size: number; embers: number; tint: number }
// shed: 振っている間に刃から剥がれ落ちる数（1 秒あたり。剣だけ）
export interface HologramLook { color: number; core: number; count: number; size: number; life: number; shed?: number }
const hitSparkTint = new THREE.Color();
const HIT_RAYS = 9; // fx = 1 のときの放射状の光線の数
export const HEAVY_FX = 1.5; // fx がこれ以上の攻撃（締めの技）は長く・整った形で見せる
const QUICK_LIFE = 0.6; // それ以外の攻撃の光の長さの倍率
export const fxScene = new THREE.Scene();
const ADDITIVE = { transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false } as const;

const easeOut3 = (t: number) => 1 - (1 - t) ** 3;
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();

// -- 光線（伸びて飛んでいく細い光） --
// 先の尖った細い紡錘形の立体。y: 0（根元）〜1（先端）。正面を向いた面ほど明るくして、光る棒に見せる
interface Beam {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
  width: number;
  offset: number; // 根元を中心からどれだけ離すか
  tail: number; // 根元が追いかけて飛んでいく割合（0 なら根元は残る）
  reach: number; // 先端が伸び切るまでの速さ（寿命に対する倍率）
  age: number; // 負なら出るまでの待ち時間
  life: number;
  color: THREE.Color;
}
// 軽い画質では、火花・破片・光線の数を減らす（キルで一度に数百出るので、弱い PC ではその瞬間に引っかかる）
const FX_AMOUNT: Record<Quality, number> = { lowest: 0.15, low: 0.4, medium: 1, high: 1, ultra: 1 };
const fxCount = (n: number) => (n > 0 ? Math.max(1, Math.round(n * FX_AMOUNT[options.quality])) : 0);
// 最低画質だけで減らすもの。スキンの演出（ホログラム・葉・金粉・稲妻）は、見分けがつくよう普通の火花より多めに残す
const SKIN_FX_LOWEST = 0.35;
const FLARE_SIZE_LOWEST = 0.5;
export const fxLowest = () => options.quality === 'lowest';
const lowestOnly = (n: number, k: number) => (fxLowest() && n > 0 ? Math.max(1, Math.round(n * k)) : n);
export const fxLowestCount = (n: number) => lowestOnly(n, FX_AMOUNT.lowest);
export const skinFxCount = (n: number) => lowestOnly(n, SKIN_FX_LOWEST);
const BEAM_MAX = 192;
const beams: Beam[] = [];
const beamPool: Beam[] = [];
// 断面の半径（太さ 1 = 直径 1）を根元から先端へ: 根元は細く、先端の手前で最も太く、先端で尖る
const beamGeo = new THREE.LatheGeometry(
  [[0, 0], [0.12, 0.2], [0.32, 0.55], [0.5, 0.82], [0.3, 0.94], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y)),
  10,
);
const beamMesh = new THREE.InstancedMesh(
  beamGeo,
  new THREE.ShaderMaterial({
    ...ADDITIVE,
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vFacing;
      varying vec3 vColor;
      void main() {
        vAlong = position.y;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(1.0);
        #endif
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        // 軸ごとに伸縮しているので、法線は各軸の長さの 2 乗で割って向きを保つ
        mat3 m = mat3(instanceMatrix);
        m[0] /= dot(m[0], m[0]);
        m[1] /= dot(m[1], m[1]);
        m[2] /= dot(m[2], m[2]);
        vec3 n = normalize(normalMatrix * (m * normal));
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlong;
      varying float vFacing;
      varying vec3 vColor;
      void main() {
        // 輪郭ほど透け、芯は白く飛ばす
        float glow = pow(vFacing, 1.5);
        float core = pow(vFacing, 10.0);
        float along = smoothstep(0.0, 0.25, vAlong) * (0.35 + 0.65 * vAlong);
        float peak = max(vColor.r, max(vColor.g, vColor.b));
        gl_FragColor = vec4((vColor * glow + vec3(peak) * core) * along, 1.0);
      }
    `,
  }),
  BEAM_MAX,
);
beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < BEAM_MAX; i++) beamMesh.setColorAt(i, HIT_TINT); // instanceColor を作っておく
beamMesh.count = 0;
beamMesh.frustumCulled = false;
fxScene.add(beamMesh);

export function addBeam(origin: THREE.Vector3, dir: THREE.Vector3, opts: Partial<Omit<Beam, 'origin' | 'dir' | 'color'>> & { color: THREE.Color; keep?: boolean }) {
  if (!opts.keep && Math.random() > FX_AMOUNT[options.quality]) return; // まとめて出す光線を、軽い画質では間引く（keep は間引かない）
  if (beams.length >= BEAM_MAX) beamPool.push(beams.shift()!);
  const b = beamPool.pop() ?? {
    origin: new THREE.Vector3(), dir: new THREE.Vector3(), color: new THREE.Color(),
    len: 0, width: 0, offset: 0, tail: 0, reach: 0, age: 0, life: 0,
  };
  b.origin.copy(origin);
  b.dir.copy(dir).normalize();
  b.color.copy(opts.color);
  b.len = opts.len ?? 1;
  b.width = opts.width ?? 0.05;
  b.offset = opts.offset ?? 0;
  b.tail = opts.tail ?? 0.9;
  b.reach = opts.reach ?? 1.4;
  b.age = opts.age ?? 0;
  b.life = opts.life ?? 0.2;
  beams.push(b);
}

// -- カメラへ向けた板を、伸ばす向きに合わせて置く（火花で使う） --
const stripMatrix = new THREE.Matrix4();
const stripDir = new THREE.Vector3();
const stripSide = new THREE.Vector3();
const stripNormal = new THREE.Vector3();
function setStrip(from: THREE.Vector3, dir: THREE.Vector3, len: number, width: number) {
  stripDir.copy(dir);
  stripSide.subVectors(env.camera.position, from).cross(stripDir);
  if (stripSide.lengthSq() < 1e-8) stripSide.set(0, 1, 0).cross(stripDir);
  stripSide.normalize();
  stripNormal.crossVectors(stripDir, stripSide);
  stripMatrix.makeBasis(stripDir.multiplyScalar(len), stripSide.multiplyScalar(width), stripNormal);
  stripMatrix.setPosition(from);
  return stripMatrix;
}

// 立体の棒を、根元 from から dir の向きへ長さ len・太さ width で置く
const rodMatrix = new THREE.Matrix4();
const rodX = new THREE.Vector3();
const rodY = new THREE.Vector3();
const rodZ = new THREE.Vector3();
function setRod(from: THREE.Vector3, dir: THREE.Vector3, len: number, width: number) {
  rodY.copy(dir);
  rodX.set(0, 1, 0).cross(rodY);
  if (rodX.lengthSq() < 1e-6) rodX.set(1, 0, 0).cross(rodY);
  rodX.normalize();
  rodZ.crossVectors(rodX, rodY);
  rodMatrix.makeBasis(rodX.multiplyScalar(width), rodY.multiplyScalar(len), rodZ.multiplyScalar(width));
  rodMatrix.setPosition(from);
  return rodMatrix;
}

const beamFrom = new THREE.Vector3();
const beamColor = new THREE.Color();
function updateBeams(dt: number) {
  let n = 0;
  let drawn = 0;
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    b.age += dt;
    if (b.age >= b.life) {
      beamPool.push(b);
      continue;
    }
    beams[n++] = b;
    if (b.age < 0) continue;
    const t = b.age / b.life;
    const head = b.offset + b.len * easeOut3(Math.min(1, t * b.reach));
    const tail = b.offset + b.len * b.tail * t * t;
    const len = head - tail;
    if (len <= 1e-4) continue;
    beamFrom.copy(b.origin).addScaledVector(b.dir, tail);
    beamMesh.setMatrixAt(drawn, setRod(beamFrom, b.dir, len, b.width * (1 - t)));
    beamMesh.setColorAt(drawn, beamColor.copy(b.color).multiplyScalar(Math.sqrt(1 - t)));
    drawn++;
  }
  beams.length = n;
  beamMesh.count = drawn;
  beamMesh.instanceMatrix.needsUpdate = true;
  if (beamMesh.instanceColor) beamMesh.instanceColor.needsUpdate = true;
}

// -- 中心の閃光（カメラへ向けた板） --
const billboardVertex = /* glsl */ `
  uniform float uScale;
  uniform float uRot;
  uniform float uStretch; // 縦横の比。毎回変えて光芒の形を崩す
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float c = cos(uRot), s = sin(uRot);
    mv.xy += mat2(c, s, -s, c) * (position.xy * vec2(uStretch, 1.0 / uStretch)) * uScale;
    gl_Position = projectionMatrix * mv;
  }
`;
const billboardGeo = new THREE.PlaneGeometry(1, 1);

interface Burst { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; age: number; life: number; size: number; power: number }
function makeBursts(count: number, fragmentShader: string): Burst[] {
  return Array.from({ length: count }, () => {
    const mat = new THREE.ShaderMaterial({
      ...ADDITIVE,
      uniforms: {
        uScale: { value: 1 }, uRot: { value: 0 }, uStretch: { value: 1 }, uI: { value: 0 },
        uColor: { value: HIT_TINT }, uCore: { value: HIT_CORE },
      },
      vertexShader: billboardVertex,
      fragmentShader,
    });
    const mesh = new THREE.Mesh(billboardGeo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    fxScene.add(mesh);
    return { mesh, mat, age: Infinity, life: 1, size: 1, power: 1 };
  });
}

// 白い芯・色のついた光暈・十字と斜めの光芒
export const flares = makeBursts(4, /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uI;
  varying vec2 vUv;
  void main() {
    float r2 = dot(vUv, vUv);
    float core = exp(-r2 * 120.0);
    float halo = exp(-r2 * 10.0) * 0.3;
    vec2 a = abs(vUv);
    float star = exp(-a.x * 70.0) * exp(-a.y * 2.2) + exp(-a.y * 70.0) * exp(-a.x * 2.2);
    vec2 b = abs(mat2(0.7071, 0.7071, -0.7071, 0.7071) * vUv);
    float star2 = (exp(-b.x * 110.0) * exp(-b.y * 5.0) + exp(-b.y * 110.0) * exp(-b.x * 5.0)) * 0.6;
    float edge = 1.0 - smoothstep(0.8, 1.0, sqrt(r2));
    vec3 col = uCore * (core * 2.5 + star * 0.9) + uColor * (halo + star * 0.8 + star2);
    gl_FragColor = vec4(col * uI * edge, 1.0);
  }
`);

export function fireBurst(list: Burst[], at: THREE.Vector3, size: number, life: number, power: number, stretch = 1) {
  if (fxLowest()) size *= FLARE_SIZE_LOWEST; // 大きな閃光は画面全体を塗るので、最低画質では小さくする
  const b = list.reduce((a, c) => (c.age > a.age ? c : a)); // いちばん古いものを使い回す
  b.mesh.position.copy(at);
  b.mat.uniforms.uRot.value = Math.random() * Math.PI;
  b.mat.uniforms.uStretch.value = stretch;
  b.age = 0;
  b.life = life;
  b.size = size;
  b.power = power;
  return b;
}

function updateBursts(dt: number) {
  for (const f of flares) {
    f.age += dt;
    const t = f.age / f.life;
    f.mesh.visible = t >= 0 && t < 1;
    if (!f.mesh.visible) continue;
    // 一瞬で大きく開き、しぼみながら消える
    const pop = Math.min(1, f.age / 0.03);
    f.mat.uniforms.uScale.value = f.size * (0.4 + 0.8 * pop) * (1 - 0.5 * t);
    f.mat.uniforms.uI.value = f.power * (1 - t) ** 2;
  }
}

// -- 光の粒（火花） --
const SPARK_MAX = 256;
const SPARK_GRAVITY = 14;
const SPARK_DRAG = 5; // 空気抵抗。速く飛び出してすぐ失速させる
const SPARK_STRETCH = 0.04; // 速さ 1 m/s あたりの尾の長さ

interface Spark { pos: THREE.Vector3; vel: THREE.Vector3; age: number; life: number; width: number; tint: THREE.Color | null }
const sparks: Spark[] = [];
const sparkPool: Spark[] = [];

const sparkGeo = new THREE.BufferGeometry();
// +x が先頭。先頭寄りを太くして尾を細くする（根元が原点）
sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, 0.8, 0.5, 0, 0, 0, 0, 0.8, -0.5, 0], 3));
sparkGeo.setIndex([0, 1, 2, 0, 2, 3]);
const sparkMesh = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial({ ...ADDITIVE, side: THREE.DoubleSide }), SPARK_MAX);
sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < SPARK_MAX; i++) sparkMesh.setColorAt(i, HIT_CORE); // instanceColor を作っておく
sparkMesh.count = 0;
sparkMesh.frustumCulled = false;
fxScene.add(sparkMesh);

// swing（単位ベクトル）を渡すと、その向きへ寄せて飛ばす。tint を渡すと、白からその色へ変わって消える（スキンの色など）
export function spawnSparks(at: THREE.Vector3, hitDir: THREE.Vector3, count: number, lifeScale = 1, size = 1, swing?: THREE.Vector3, tint: THREE.Color | null = null) {
  count = fxCount(count);
  for (let i = 0; i < count; i++) {
    if (sparks.length >= SPARK_MAX) sparkPool.push(sparks.shift()!);
    const s = sparkPool.pop() ?? { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 0, width: 0, tint: null };
    s.pos.copy(at);
    // 攻撃した側へ跳ね返りつつ、横と上へ大きく散らす
    s.vel.randomDirection().addScaledVector(hitDir, -0.35);
    if (swing) s.vel.addScaledVector(swing, 1.3);
    s.vel.y += swing ? 0.15 : 0.4;
    s.vel.normalize().multiplyScalar((4 + Math.random() * 8) * size);
    s.age = 0;
    s.life = (0.15 + Math.random() * 0.3) * lifeScale;
    s.width = (0.012 + Math.random() * 0.018) * size;
    s.tint = tint;
    sparks.push(s);
  }
}

const sparkFrom = new THREE.Vector3();
const sparkDir = new THREE.Vector3();
const sparkColor = new THREE.Color();
function updateSparks(dt: number) {
  const drag = Math.max(0, 1 - SPARK_DRAG * dt);
  let n = 0;
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    s.age += dt;
    if (s.age >= s.life) {
      sparkPool.push(s);
      continue;
    }
    s.vel.y -= SPARK_GRAVITY * dt;
    s.vel.multiplyScalar(drag);
    s.pos.addScaledVector(s.vel, dt);
    sparks[n] = s;

    // 白から光の色へ変わりながら、短く細く暗くなって消える
    const t = s.age / s.life;
    const k = 1 - t;
    const speed = s.vel.length();
    const len = Math.max(0.03, speed * SPARK_STRETCH) * k;
    sparkDir.copy(s.vel).divideScalar(speed || 1);
    sparkFrom.copy(s.pos).addScaledVector(sparkDir, -len);
    sparkMesh.setMatrixAt(n, setStrip(sparkFrom, sparkDir, len, s.width * (0.4 + 0.6 * k)));
    const near = THREE.MathUtils.smoothstep(s.pos.distanceTo(env.camera.position), 0.5, 1.0); // 目の前に来た粒は大きく映りすぎるので消す
    sparkColor.lerpColors(HIT_CORE, s.tint ?? HIT_TINT, Math.min(1, t * 2)).multiplyScalar(1.6 * k * near);
    sparkMesh.setColorAt(n, sparkColor);
    n++;
  }
  sparks.length = n;
  sparkMesh.count = n;
  sparkMesh.instanceMatrix.needsUpdate = true;
  if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
}

// -- 三角形の破片 --
const SHARD_MAX = 256;
const SHARD_GRAVITY = 18;
const SHARD_DRAG = 2.5; // 火花より重く、遠くまで飛ぶ
const SHARD_BOUNCE = 0.35; // 床で跳ね返るときに残す速さ

interface Shard { pos: THREE.Vector3; vel: THREE.Vector3; quat: THREE.Quaternion; axis: THREE.Vector3; spin: number; scale: THREE.Vector3; age: number; life: number; tint: THREE.Color | null }
const shards: Shard[] = [];
const shardPool: Shard[] = [];

const shardGeo = new THREE.BufferGeometry();
// 少し歪んだ三角形。インスタンスごとに縦横の比を変えて形をばらつかせる
shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, -0.45, -0.35, 0, 0.55, -0.25, 0], 3));
// 敵の体のかけらに見えるよう、光の演出と違って加算にせず敵の色で塗る
const shardMesh = new THREE.InstancedMesh(shardGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthTest: false, depthWrite: false }), SHARD_MAX);
shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < SHARD_MAX; i++) shardMesh.setColorAt(i, HIT_CORE); // instanceColor を作っておく
shardMesh.count = 0;
shardMesh.frustumCulled = false;
fxScene.add(shardMesh);

// tint を渡すと、敵の色の代わりにその色で塗る（床のかけらなど）
export function spawnShards(at: THREE.Vector3, hitDir: THREE.Vector3, count: number, lifeScale = 1, size = 1, swing?: THREE.Vector3, tint: THREE.Color | null = null) {
  count = fxCount(count);
  for (let i = 0; i < count; i++) {
    if (shards.length >= SHARD_MAX) shardPool.push(shards.shift()!);
    const s = shardPool.pop() ?? {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), axis: new THREE.Vector3(),
      spin: 0, scale: new THREE.Vector3(), age: 0, life: 0, tint: null,
    };
    s.tint = tint;
    s.pos.copy(at);
    // 攻撃の向きへ抜けるように飛ばし、上へも跳ね上げる
    s.vel.randomDirection().addScaledVector(hitDir, 0.6);
    if (swing) s.vel.addScaledVector(swing, 1.1);
    s.vel.y += swing ? 0.35 : 0.6;
    s.vel.normalize().multiplyScalar(rand(3, 9) * size);
    s.quat.setFromAxisAngle(s.axis.randomDirection(), Math.random() * Math.PI * 2);
    s.axis.randomDirection();
    s.spin = rand(10, 30) * (Math.random() < 0.5 ? -1 : 1);
    const r = rand(0.04, 0.11) * size;
    s.scale.set(r * rand(0.6, 1.4), r * rand(0.6, 1.4), 1);
    s.age = 0;
    s.life = rand(0.45, 0.9) * lifeScale;
    shards.push(s);
  }
}

const shardRot = new THREE.Quaternion();
const shardMatrix = new THREE.Matrix4();
const shardColor = new THREE.Color();
const shardScale = new THREE.Vector3();
function updateShards(dt: number) {
  const drag = Math.max(0, 1 - SHARD_DRAG * dt);
  let n = 0;
  for (let i = 0; i < shards.length; i++) {
    const s = shards[i];
    s.age += dt;
    if (s.age >= s.life) {
      shardPool.push(s);
      continue;
    }
    s.vel.y -= SHARD_GRAVITY * dt;
    s.vel.multiplyScalar(drag);
    s.pos.addScaledVector(s.vel, dt);
    // 床に当たったら跳ねて、回転も落とす
    const floor = env.floorAt(s.pos.x, s.pos.z, s.pos.y + 0.05);
    if (s.pos.y < floor && s.vel.y < 0) {
      s.pos.y = floor;
      s.vel.y *= -SHARD_BOUNCE;
      s.vel.x *= 0.6;
      s.vel.z *= 0.6;
      s.spin *= 0.5;
    }
    s.quat.premultiply(shardRot.setFromAxisAngle(s.axis, s.spin * dt));
    shards[n] = s;

    // 最後の 4 割で縮んで消える。目の前に来た破片は大きく映りすぎるので縮めて消す
    const t = s.age / s.life;
    const k = Math.min(1, (1 - t) / 0.4);
    const near = THREE.MathUtils.smoothstep(s.pos.distanceTo(env.camera.position), 0.5, 1.0);
    shardMatrix.compose(s.pos, s.quat, shardScale.copy(s.scale).multiplyScalar(k * near));
    shardMesh.setMatrixAt(n, shardMatrix);
    // 敵の色で塗り、回転で面がこちらを向いたときに白くきらめかせる。向きによって明暗もつける
    toShardCam.subVectors(env.camera.position, s.pos).normalize();
    shardNormal.set(0, 0, 1).applyQuaternion(s.quat);
    const facing = Math.abs(shardNormal.dot(toShardCam));
    shardColor.copy(s.tint ?? env.shardTint()).multiplyScalar(0.6 + 0.5 * facing).lerp(HIT_CORE, 0.6 * facing ** 6);
    shardMesh.setColorAt(n, shardColor);
    n++;
  }
  shards.length = n;
  shardMesh.count = n;
  shardMesh.instanceMatrix.needsUpdate = true;
  if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
}
const toShardCam = new THREE.Vector3();
const shardNormal = new THREE.Vector3();

// -- Holographic polygon chains (skin hit effect) --
// A short zig-zag strip makes four connected triangles. The translucent face and
// bright wireframe share the same instances so they read as a projected mesh.
interface HoloChain {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  scale: THREE.Vector3;
  age: number;
  life: number;
  variant: number;
  color: THREE.Color;
  core: THREE.Color;
}
const HOLO_MAX = 192;
const holoChains: HoloChain[] = [];
const holoPool: HoloChain[] = [];
const HOLO_POINTS = [
  [-1, 0, -.55, .55, -.15, -.38, .22, .48, .58, -.44, 1, .12],
  [-1, -.18, -.7, .38, -.22, -.58, .08, .2, .67, -.2, 1, .42],
  [-1, .28, -.62, -.42, -.05, .54, .35, -.22, .72, .38, 1, -.12],
] as const;
const holoGeos = HOLO_POINTS.map((points) => {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  for (let i = 0; i < points.length; i += 2) positions.push(points[i], points[i + 1], 0);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
  return geo;
});
// 線も足さずに重ねる（白い床や壁の前でも消えないように）
const holoFillMat = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0.16, blending: THREE.NormalBlending,
  depthTest: false, depthWrite: false, side: THREE.DoubleSide,
});
const holoWireMat = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0.85, blending: THREE.NormalBlending,
  depthTest: false, depthWrite: false, side: THREE.DoubleSide, wireframe: true,
});
const holoFills = holoGeos.map((geo) => new THREE.InstancedMesh(geo, holoFillMat, HOLO_MAX));
const holoWires = holoGeos.map((geo) => new THREE.InstancedMesh(geo, holoWireMat, HOLO_MAX));
for (const mesh of [...holoFills, ...holoWires]) {
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  fxScene.add(mesh);
}

// 空きを取り出して並びに足す。向き・回転・色は決めておき、位置・速さ・大きさ・寿命は呼ぶ側が決める
function nextHolo(look: HologramLook) {
  if (holoChains.length >= HOLO_MAX) holoPool.push(holoChains.shift()!);
  const h = holoPool.pop() ?? {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), axis: new THREE.Vector3(),
    spin: 0, scale: new THREE.Vector3(), age: 0, life: 0, variant: 0, color: new THREE.Color(), core: new THREE.Color(),
  };
  h.axis.randomDirection();
  h.quat.setFromAxisAngle(h.axis, Math.random() * Math.PI * 2);
  h.spin = rand(5, 11) * (Math.random() < 0.5 ? -1 : 1);
  h.age = 0;
  h.variant = Math.floor(Math.random() * holoGeos.length);
  h.color.setHex(look.color);
  h.core.setHex(look.core);
  holoChains.push(h);
  return h;
}

// 振っている刃から剥がれ落ちるホログラム。命中のものより小さく遅く、振りの向きへ少し流れてすぐ消える。
// swing: 刃のその点の速さ（m/s）
export function spawnHologramShed(at: THREE.Vector3, swing: THREE.Vector3, look: HologramLook) {
  if (fxLowest() && Math.random() > SKIN_FX_LOWEST) return;
  const h = nextHolo(look);
  h.pos.copy(at);
  h.vel.randomDirection().multiplyScalar(rand(0.2, 0.7)).addScaledVector(swing, 0.12);
  const size = rand(0.3, 0.65) * look.size;
  h.scale.set(size * rand(0.7, 1.5), size * rand(0.55, 1.2), size);
  h.life = rand(0.35, 0.7) * look.life;
}

export function spawnHologramChains(at: THREE.Vector3, hitDir: THREE.Vector3, swing: THREE.Vector3 | undefined, fx: number, look: HologramLook) {
  const count = skinFxCount(Math.max(1, Math.round(look.count * Math.sqrt(fx))));
  for (let i = 0; i < count; i++) {
    const h = nextHolo(look);
    h.pos.copy(at).addScaledVector(hitDir, rand(-0.03, 0.04));
    h.vel.randomDirection().addScaledVector(hitDir, -0.35);
    if (swing) h.vel.addScaledVector(swing, 1.15);
    h.vel.y += rand(0.05, 0.35);
    h.vel.normalize().multiplyScalar(rand(1.8, 4.2) * Math.sqrt(fx));
    const size = rand(0.55, 1.35) * look.size * Math.sqrt(fx);
    h.scale.set(size * rand(0.7, 1.65), size * rand(0.55, 1.25), size);
    h.age = -rand(0, 0.045);
    h.life = rand(0.55, 1) * look.life;
  }
}

const holoMatrix = new THREE.Matrix4();
const holoRot = new THREE.Quaternion();
const holoScale = new THREE.Vector3();
const holoColor = new THREE.Color();
function updateHologramChains(dt: number) {
  let alive = 0;
  const drawn = holoGeos.map(() => 0);
  for (const h of holoChains) {
    h.age += dt;
    if (h.age >= h.life) {
      holoPool.push(h);
      continue;
    }
    holoChains[alive++] = h;
    if (h.age < 0) continue;
    const t = h.age / h.life;
    h.vel.multiplyScalar(Math.max(0, 1 - 5 * dt));
    h.vel.y -= 1.5 * dt; // ordinary hit debris pulls the hologram back into the game's physical feel
    h.pos.addScaledVector(h.vel, dt);
    h.quat.premultiply(holoRot.setFromAxisAngle(h.axis, h.spin * dt));
    const appear = Math.min(1, h.age / 0.045);
    const fade = (1 - t) ** 1.35;
    const index = drawn[h.variant]++;
    const scan = 0.88 + 0.12 * Math.sin(h.age * 85 + index * 2.1 + h.variant);
    holoMatrix.compose(h.pos, h.quat, holoScale.copy(h.scale).multiplyScalar(appear * fade));
    holoFills[h.variant].setMatrixAt(index, holoMatrix);
    holoWires[h.variant].setMatrixAt(index, holoMatrix);
    // 重ねて描くので色は暗くせず（暗くすると白い背景の前で黒ずむ）、消えるのは縮むことだけにまかせる
    holoFills[h.variant].setColorAt(index, holoColor.copy(h.color).multiplyScalar(scan));
    holoWires[h.variant].setColorAt(index, holoColor.copy(h.core).multiplyScalar(0.8 + 0.2 * scan));
  }
  holoChains.length = alive;
  for (let variant = 0; variant < holoGeos.length; variant++) {
    for (const mesh of [holoFills[variant], holoWires[variant]]) {
      mesh.count = drawn[variant];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

// -- 銀の葉（スキンの当たり） --
// 当てたところから銀の葉を弾けさせる。すぐに空気に止められ、左右に揺れて回りながらゆっくり舞い落ちる。
// 面がこちらを向いたときに白くきらめく。color: 葉の銀、count: 枚数、size: 葉の長さ (m)、life: 舞っている長さ (秒)
export interface LeafLook { color: number; count: number; size: number; life: number }
interface Leaf {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  sway: number; // 揺れの速さ
  phase: number;
  scale: number;
  age: number;
  life: number;
  color: THREE.Color;
}
const LEAF_MAX = 128;
const leaves: Leaf[] = [];
const leafPool: Leaf[] = [];
// 先の尖った葉。根元から先へ、両側を膨らませた形を扇に割る
const leafGeo = (() => {
  const pos: number[] = [0, -0.5, 0];
  const index: number[] = [];
  const N = 6;
  for (let i = 1; i < N; i++) {
    const y = -0.5 + i / N;
    const w = 0.32 * Math.sin((i / N) * Math.PI) ** 0.8;
    pos.push(-w, y, 0, w, y, 0);
  }
  pos.push(0, 0.5, 0);
  const tip = pos.length / 3 - 1;
  // 根元 → 1 段目
  index.push(0, 2, 1);
  for (let i = 0; i < N - 2; i++) {
    const l = 1 + i * 2, r = l + 1;
    index.push(l, r, r + 2, l, r + 2, l + 2);
  }
  index.push(tip - 2, tip - 1, tip);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  return geo;
})();
const leafMesh = new THREE.InstancedMesh(
  leafGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthTest: false, depthWrite: false }), LEAF_MAX,
);
leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
leafMesh.count = 0;
leafMesh.frustumCulled = false;
for (let i = 0; i < LEAF_MAX; i++) leafMesh.setColorAt(i, HIT_CORE); // instanceColor を作っておく
fxScene.add(leafMesh);
const leafSwing = new THREE.Vector3();

export function spawnLeaves(at: THREE.Vector3, hitDir: THREE.Vector3, swing: THREE.Vector3 | undefined, fx: number, look: LeafLook) {
  const count = skinFxCount(Math.max(1, Math.round(look.count * Math.sqrt(fx))));
  for (let i = 0; i < count; i++) {
    if (leaves.length >= LEAF_MAX) leafPool.push(leaves.shift()!);
    const l = leafPool.pop() ?? {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), axis: new THREE.Vector3(),
      spin: 0, sway: 0, phase: 0, scale: 0, age: 0, life: 0, color: new THREE.Color(),
    };
    l.pos.copy(at).addScaledVector(hitDir, rand(-0.03, 0.05));
    // 攻撃の向きへ抜けつつ、上へ吹き上げる
    l.vel.randomDirection().addScaledVector(hitDir, 0.5);
    if (swing && swing.lengthSq() > 1e-8) l.vel.addScaledVector(leafSwing.copy(swing).normalize(), 0.8);
    l.vel.y += 0.7;
    l.vel.normalize().multiplyScalar(rand(2.5, 6) * Math.sqrt(fx));
    l.axis.randomDirection();
    l.quat.setFromAxisAngle(l.axis, Math.random() * Math.PI * 2);
    l.axis.randomDirection();
    l.spin = rand(3, 8) * (Math.random() < 0.5 ? -1 : 1);
    l.sway = rand(4, 7);
    l.phase = Math.random() * Math.PI * 2;
    l.scale = rand(0.7, 1.3) * look.size;
    l.age = -rand(0, 0.03);
    l.life = rand(0.7, 1.2) * look.life;
    l.color.setHex(look.color).multiplyScalar(rand(0.85, 1.1));
    leaves.push(l);
  }
}

const leafRot = new THREE.Quaternion();
const leafMatrix = new THREE.Matrix4();
const leafScale = new THREE.Vector3();
const leafColor = new THREE.Color();
const leafNormal = new THREE.Vector3();
const toLeafCam = new THREE.Vector3();
function updateLeaves(dt: number) {
  // 速いうちは強く止め、落ちる速さは葉らしく遅いところで釣り合わせる
  const drag = Math.max(0, 1 - 4.5 * dt);
  let n = 0;
  for (const l of leaves) {
    l.age += dt;
    if (l.age >= l.life) {
      leafPool.push(l);
      continue;
    }
    leaves[n] = l;
    if (l.age < 0) {
      leafMesh.setMatrixAt(n, leafMatrix.makeScale(0, 0, 0));
      n++;
      continue;
    }
    l.vel.multiplyScalar(drag);
    l.vel.y -= 3 * dt;
    // 左右に揺れながら落ちる
    const s = Math.sin(l.age * l.sway + l.phase);
    l.pos.addScaledVector(l.vel, dt);
    l.pos.x += s * 0.35 * dt;
    l.pos.z += Math.cos(l.age * l.sway * 0.8 + l.phase) * 0.35 * dt;
    const floor = env.floorAt(l.pos.x, l.pos.z, l.pos.y + 0.05);
    if (l.pos.y < floor) {
      l.pos.y = floor;
      l.vel.set(0, 0, 0);
      l.spin *= 0.9;
    }
    l.quat.premultiply(leafRot.setFromAxisAngle(l.axis, (l.spin + s * 2) * dt));
    // 出るときにふくらみ、最後の 3 割で縮んで消える。目の前の葉は大きく映りすぎるので縮める
    const t = l.age / l.life;
    const k = Math.min(1, l.age / 0.05, (1 - t) / 0.3);
    const near = THREE.MathUtils.smoothstep(l.pos.distanceTo(env.camera.position), 0.4, 0.9);
    const sc = l.scale * k * near;
    leafMatrix.compose(l.pos, l.quat, leafScale.set(sc, sc, sc));
    leafMesh.setMatrixAt(n, leafMatrix);
    // 銀: 向きで明暗をつけ、面がこちらを向くと白くきらめく
    toLeafCam.subVectors(env.camera.position, l.pos).normalize();
    leafNormal.set(0, 0, 1).applyQuaternion(l.quat);
    const facing = Math.abs(leafNormal.dot(toLeafCam));
    leafColor.copy(l.color).multiplyScalar(0.45 + 0.6 * facing).lerp(HIT_CORE, 0.8 * facing ** 8);
    leafMesh.setColorAt(n, leafColor);
    n++;
  }
  leaves.length = n;
  leafMesh.count = n;
  leafMesh.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
}

// -- 紅線（スキンの当たり） --
// 当てたところを通る、振りの向きのまっすぐな線を空中に引く。光らせずに塗った線として重ねる。
// 真ん中から両端へ一気に伸び、白く出てすぐ紅に変わる。少し残ってから、真ん中から細くなって両端が最後に消える。
// 締めの技（fx が HEAVY_FX 以上）では、ヒットストップの間だけ画面ごと同じ向きに斬ってずらす（screenCut。後処理は main.ts の updateHitFx）
// len: 線の片側の長さ (m)、width: 太さの半分 (m)、life: 残る長さ (秒)
export interface CutLineLook { body: number; edge: number; len: number; width: number; life: number }
interface CutLine { matrix: THREE.Matrix4; age: number; life: number }
const CUT_LINE_MAX = 24;
const CUT_FLASH = 0.04; // 白く出ている長さ (秒)
const cutLines: CutLine[] = [];
const cutLinePool: CutLine[] = [];
const cutLineGeo = new THREE.PlaneGeometry(2, 2);
const cutLineT = new THREE.InstancedBufferAttribute(new Float32Array(CUT_LINE_MAX), 1);
const cutLineFlash = new THREE.InstancedBufferAttribute(new Float32Array(CUT_LINE_MAX), 1);
cutLineT.setUsage(THREE.DynamicDrawUsage);
cutLineFlash.setUsage(THREE.DynamicDrawUsage);
cutLineGeo.setAttribute('aT', cutLineT);
cutLineGeo.setAttribute('aFlash', cutLineFlash);
const cutLineMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uBody: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() } },
  vertexShader: /* glsl */ `
    attribute float aT;
    attribute float aFlash;
    varying vec2 vP;
    varying float vT;
    varying float vFlash;
    void main() {
      vP = position.xy;
      vT = aT;
      vFlash = aFlash;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uBody;
    uniform vec3 uEdge;
    varying vec2 vP;
    varying float vT;
    varying float vFlash;
    void main() {
      float x = abs(vP.x);
      // 真ん中から両端へ伸びる
      float grow = 1.0 - pow(1.0 - min(1.0, vT * 9.0), 3.0);
      // 消えるときは真ん中から細くなり、両端が最後に残る
      float fade = smoothstep(0.45, 1.0, vT);
      float w = 0.8 * (1.0 - fade * (2.0 - x)) * (1.0 - smoothstep(0.75, 1.0, x)) * (1.0 - smoothstep(grow - 0.03, grow, x));
      if (w <= 0.0) discard;
      float y = abs(vP.y);
      float aa = fwidth(vP.y);
      float a = 1.0 - smoothstep(w - aa, w + aa, y);
      if (a <= 0.0) discard;
      // 芯は紅、縁は暗い紅。出た瞬間は白
      vec3 col = mix(uBody, uEdge, smoothstep(w * 0.45, w * 0.8, y));
      gl_FragColor = vec4(mix(col, vec3(1.0), vFlash), a);
    }
  `,
});
const cutLineMesh = new THREE.InstancedMesh(cutLineGeo, cutLineMat, CUT_LINE_MAX);
cutLineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cutLineMesh.count = 0;
cutLineMesh.frustumCulled = false;
cutLineMesh.renderOrder = 2; // 光の線より手前に塗る
fxScene.add(cutLineMesh);

// 画面ごと斬る線。age: 出てからの時間、x / y: 画面上の通り道（0〜1）、angle: 画面上の向き（rad）
export const screenCut = { age: Infinity, x: 0.5, y: 0.5, angle: Math.PI / 4, color: new THREE.Color() };
const SCREEN_CUT_DEFAULT = Math.PI / 4; // 振りの向きがわからないときは「／」

const cutDir = new THREE.Vector3();
const cutSide = new THREE.Vector3();
const cutNdc = new THREE.Vector3();
export function spawnCutLine(at: THREE.Vector3, swing: THREE.Vector3 | undefined, fx: number, look: CutLineLook) {
  env.camera.updateMatrixWorld();
  camRight.setFromMatrixColumn(env.camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(env.camera.matrixWorld, 1);
  toCamera.subVectors(env.camera.position, at);
  const dist = Math.max(toCamera.length(), 1e-3);
  toCamera.divideScalar(dist);
  const size = THREE.MathUtils.clamp(Math.sqrt(dist / HIT_FX_REF_DIST), HIT_FX_MIN_SCALE, HIT_FX_MAX_SCALE);
  const heavy = fx >= HEAVY_FX;

  // 刃が動いていた向きのうち画面に沿った成分。突きのように奥へ向かう振りでは、横一文字（締めの技は「／」）にする
  let angle = heavy ? SCREEN_CUT_DEFAULT : rand(-8, 8) * DEG;
  if (swing && swing.lengthSq() > 1e-8) {
    cutDir.copy(swing).addScaledVector(toCamera, -swing.dot(toCamera));
    if (cutDir.lengthSq() > SWING_MIN_SIDE ** 2 * swing.lengthSq()) angle = Math.atan2(cutDir.dot(camUp), cutDir.dot(camRight));
  }
  cutDir.copy(camRight).multiplyScalar(Math.cos(angle)).addScaledVector(camUp, Math.sin(angle));
  cutSide.crossVectors(toCamera, cutDir).normalize();

  if (cutLines.length >= CUT_LINE_MAX) cutLinePool.push(cutLines.shift()!);
  const c = cutLinePool.pop() ?? { matrix: new THREE.Matrix4(), age: 0, life: 0 };
  const k = Math.sqrt(fx) * size;
  const half = look.len * k * (heavy ? 1.5 : rand(0.85, 1.1));
  c.matrix.makeBasis(cutDir.multiplyScalar(half), cutSide.multiplyScalar(look.width * k), toCamera);
  c.matrix.setPosition(at);
  c.age = 0;
  c.life = look.life * (heavy ? 1.5 : 1);
  cutLines.push(c);
  cutLineMat.uniforms.uBody.value.setHex(look.body);
  cutLineMat.uniforms.uEdge.value.setHex(look.edge);

  if (heavy) {
    cutNdc.copy(at).project(env.camera);
    screenCut.age = 0;
    screenCut.x = cutNdc.x * 0.5 + 0.5;
    screenCut.y = cutNdc.y * 0.5 + 0.5;
    screenCut.angle = angle;
    screenCut.color.setHex(look.body);
  }
}

function updateCutLines(dt: number) {
  screenCut.age += dt;
  let n = 0;
  for (const c of cutLines) {
    c.age += dt;
    if (c.age >= c.life) {
      cutLinePool.push(c);
      continue;
    }
    cutLines[n] = c;
    cutLineMesh.setMatrixAt(n, c.matrix);
    cutLineT.setX(n, c.age / c.life);
    cutLineFlash.setX(n, 1 - THREE.MathUtils.smoothstep(c.age, CUT_FLASH * 0.5, CUT_FLASH));
    n++;
  }
  cutLines.length = n;
  cutLineMesh.count = n;
  cutLineMesh.instanceMatrix.needsUpdate = true;
  cutLineT.needsUpdate = true;
  cutLineFlash.needsUpdate = true;
}

// -- 金の光の筋と金粉（スキンの当たり） --
// 命中点に、映画のレンズの光のような横一文字の金の筋を走らせ、細かな金粉を空中に漂わせる。
// 筋: 画面の横に沿って中心から両端へ一気に伸び、芯は白く外は金。すぐに細くなって消える。中心には小さな光の玉
// 金粉: 命中点から弾けたあと空気にすぐ止められ、ふわりと浮きながらゆっくり漂う。ひとつずつ瞬いて、最後は小さくなって消える
// 締めの技（fx が HEAVY_FX 以上）は筋を長く太くし、少し傾けた細い筋をもう 1 本重ねる
// color: 金、core: 芯の色、len: 筋の片側の長さ (m)、dust: 金粉の数、life: 金粉の漂う長さ (秒)
export interface GleamLook { color: number; core: number; len: number; dust: number; life: number }

// 筋: こちらを向いた横長の板に式で描く。足して光らせる
interface Streak { matrix: THREE.Matrix4; age: number; life: number }
const STREAK_MAX = 16;
const streaks: Streak[] = [];
const streakPool: Streak[] = [];
const streakGeo = new THREE.PlaneGeometry(2, 2);
const streakT = new THREE.InstancedBufferAttribute(new Float32Array(STREAK_MAX), 1);
streakT.setUsage(THREE.DynamicDrawUsage);
streakGeo.setAttribute('aT', streakT);
const streakMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color() }, uCore: { value: new THREE.Color() } },
  vertexShader: /* glsl */ `
    attribute float aT;
    varying vec2 vP;
    varying float vT;
    void main() {
      vP = position.xy;
      vT = aT;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uCore;
    varying vec2 vP;
    varying float vT;
    void main() {
      float t = vT;
      float x = abs(vP.x);
      float y = abs(vP.y);
      float grow = 1.0 - pow(1.0 - min(1.0, t * 8.0), 3.0); // 中心から両端へ一気に伸びる
      float fade = 1.0 - smoothstep(0.15, 1.0, t);
      float thin = mix(1.0, 0.25, smoothstep(0.1, 1.0, t)); // 伸びきったら細くなる
      // 両端へ向かって細く薄くなる筋
      float along = pow(max(0.0, 1.0 - x / max(grow, 1e-3)), 1.6);
      float line = exp(-y / (0.06 * thin * (0.3 + along))) * along;
      // 筋のまわりの薄いもや（金だけで、芯より広くにじませる）
      float haze = exp(-y * 2.2) * pow(max(0.0, 1.0 - x / max(grow, 1e-3)), 2.5) * 0.35;
      // 中心の光の玉
      float orb = exp(-(x * x * 500.0 + y * y * 7.0)) * (1.0 - smoothstep(0.0, 0.6, t)) * 1.5;
      float a = (line + orb + haze) * fade;
      if (a <= 0.004) discard;
      // 芯は白く、外ほど金
      vec3 col = mix(uColor, uCore, clamp(line * 1.3 + orb, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.25, y * 4.0)));
      gl_FragColor = vec4(col * a * 2.4, 1.0);
    }
  `,
});
const streakMesh = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_MAX);
streakMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
streakMesh.count = 0;
streakMesh.frustumCulled = false;
fxScene.add(streakMesh);

// 金粉: 点で描く。ひとつずつ大きさと瞬きの速さを変える
interface Mote { pos: THREE.Vector3; vel: THREE.Vector3; age: number; life: number; size: number; twinkle: number; phase: number }
const MOTE_MAX = 400;
const motes: Mote[] = [];
const motePool: Mote[] = [];
const motePos = new THREE.BufferAttribute(new Float32Array(MOTE_MAX * 3), 3);
const moteSize = new THREE.BufferAttribute(new Float32Array(MOTE_MAX), 1);
const moteGlow = new THREE.BufferAttribute(new Float32Array(MOTE_MAX), 1);
for (const a of [motePos, moteSize, moteGlow]) a.setUsage(THREE.DynamicDrawUsage);
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', motePos);
moteGeo.setAttribute('aSize', moteSize);
moteGeo.setAttribute('aGlow', moteGlow);
const moteMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color() }, uCore: { value: new THREE.Color() }, uScale: { value: 1 } },
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute float aGlow;
    uniform float uScale;
    varying float vGlow;
    void main() {
      vGlow = aGlow;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uScale / -mv.z, 1.5, 24.0); // aSize (m) を画面の画素へ
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uCore;
    varying float vGlow;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = exp(-d * d * 5.0) * vGlow;
      if (a <= 0.004) discard;
      vec3 col = mix(uColor, uCore, exp(-d * d * 18.0) * min(1.0, vGlow));
      gl_FragColor = vec4(col * a, 1.0);
    }
  `,
});
const moteMesh = new THREE.Points(moteGeo, moteMat);
const moteBuffer = new THREE.Vector2();
// 点の大きさは描く画面の高さの半分で割り出す（解像度が変わっても同じ見え方に）
moteMesh.onBeforeRender = (renderer) => (moteMat.uniforms.uScale.value = renderer.getDrawingBufferSize(moteBuffer).y / 2);
moteMesh.frustumCulled = false;
fxScene.add(moteMesh);

const gleamRight = new THREE.Vector3();
const gleamUp = new THREE.Vector3();
function addStreak(at: THREE.Vector3, angle: number, half: number, width: number, life: number) {
  if (streaks.length >= STREAK_MAX) streakPool.push(streaks.shift()!);
  const s = streakPool.pop() ?? { matrix: new THREE.Matrix4(), age: 0, life: 0 };
  gleamRight.copy(camRight).multiplyScalar(Math.cos(angle)).addScaledVector(camUp, Math.sin(angle));
  gleamUp.crossVectors(toCamera, gleamRight);
  s.matrix.makeBasis(gleamRight.multiplyScalar(half), gleamUp.multiplyScalar(width), toCamera);
  s.matrix.setPosition(at);
  s.age = 0;
  s.life = life;
  streaks.push(s);
}
export function spawnGleam(at: THREE.Vector3, hitDir: THREE.Vector3, fx: number, look: GleamLook) {
  env.camera.updateMatrixWorld();
  camRight.setFromMatrixColumn(env.camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(env.camera.matrixWorld, 1);
  toCamera.subVectors(env.camera.position, at);
  const dist = Math.max(toCamera.length(), 1e-3);
  toCamera.divideScalar(dist);
  const size = THREE.MathUtils.clamp(Math.sqrt(dist / HIT_FX_REF_DIST), HIT_FX_MIN_SCALE, HIT_FX_MAX_SCALE);
  const heavy = fx >= HEAVY_FX;
  const k = Math.sqrt(fx) * size;

  // 横一文字の筋（わずかに傾ける）。締めの技は長く太くし、傾けた細い筋を重ねる
  addStreak(at, rand(-2, 2) * DEG, look.len * k * (heavy ? 1.6 : rand(0.85, 1.1)), 0.09 * k * (heavy ? 1.4 : 1), heavy ? 0.55 : 0.38);
  if (heavy && !fxLowest()) addStreak(at, rand(8, 14) * DEG * (Math.random() < 0.5 ? -1 : 1), look.len * k * 0.8, 0.035 * k, 0.4);

  const count = skinFxCount(Math.round(look.dust * Math.sqrt(fx) * (heavy ? 1.8 : 1)));
  for (let i = 0; i < count; i++) {
    if (motes.length >= MOTE_MAX) motePool.push(motes.shift()!);
    const m = motePool.pop() ?? { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 0, size: 0, twinkle: 0, phase: 0 };
    m.pos.copy(at);
    // 弾の抜けた向きへ寄せて、全方向へ弾けさせる
    m.vel.randomDirection().addScaledVector(hitDir, 0.6).normalize().multiplyScalar(rand(0.8, 4.5) * Math.sqrt(fx) * Math.sqrt(size));
    m.age = -rand(0, 0.05);
    m.life = rand(0.6, 1.2) * look.life * (heavy ? 1.3 : 1);
    m.size = rand(0.006, 0.014) * Math.sqrt(size);
    m.twinkle = rand(10, 22);
    m.phase = Math.random() * Math.PI * 2;
    motes.push(m);
  }
  for (const mat of [streakMat, moteMat]) {
    mat.uniforms.uColor.value.setHex(look.color);
    mat.uniforms.uCore.value.setHex(look.core);
  }
}

function updateGleams(dt: number) {
  let n = 0;
  for (const s of streaks) {
    s.age += dt;
    if (s.age >= s.life) {
      streakPool.push(s);
      continue;
    }
    streaks[n] = s;
    streakMesh.setMatrixAt(n, s.matrix);
    streakT.setX(n, s.age / s.life);
    n++;
  }
  streaks.length = n;
  streakMesh.count = n;
  streakMesh.instanceMatrix.needsUpdate = true;
  streakT.needsUpdate = true;

  // 速いうちは強く止め、止まったあとはふわりと浮かせて漂わせる
  const drag = Math.max(0, 1 - 7 * dt);
  n = 0;
  for (const m of motes) {
    m.age += dt;
    if (m.age >= m.life) {
      motePool.push(m);
      continue;
    }
    motes[n] = m;
    let glow = 0;
    if (m.age >= 0) {
      m.vel.multiplyScalar(drag);
      m.vel.y += 0.25 * dt;
      m.pos.addScaledVector(m.vel, dt);
      m.pos.x += Math.sin(m.age * 2.3 + m.phase) * 0.05 * dt;
      m.pos.z += Math.cos(m.age * 1.9 + m.phase) * 0.05 * dt;
      const t = m.age / m.life;
      // 出た瞬間は強く光り、そのあとは瞬きながら小さくなって消える
      const burst = 1 + 2 * (1 - THREE.MathUtils.smoothstep(m.age, 0, 0.12));
      const tw = 0.55 + 0.45 * Math.sin(m.age * m.twinkle + m.phase);
      glow = burst * tw * (1 - THREE.MathUtils.smoothstep(t, 0.6, 1));
    }
    motePos.setXYZ(n, m.pos.x, m.pos.y, m.pos.z);
    moteSize.setX(n, m.size);
    moteGlow.setX(n, glow);
    n++;
  }
  motes.length = n;
  moteGeo.setDrawRange(0, n);
  moteMesh.visible = n > 0;
  motePos.needsUpdate = true;
  moteSize.needsUpdate = true;
  moteGlow.needsUpdate = true;
}

// -- 画面全体の暗転の時間変化 --
// age: 当たってからの時間、hold: ヒットストップの長さ（この間は暗転を保つ）、power: 暗転の強さ
export const impact = { age: Infinity, hold: 0, power: 0 };

// 演出は空間に置くので、遠いほど小さく映る。ただし遠くの当たりが見えなくならないよう、
// 実際の大きさは距離の平方根で少し大きくする（近いと小さめ、遠いと大きめ）
const HIT_FX_REF_DIST = 1.6; // この距離で大きさ 1 倍
const HIT_FX_MIN_SCALE = 0.7;
const HIT_FX_MAX_SCALE = 4;

// 刀の振りの向きへ流す演出
export const SWING_MIN_SIDE = 0.35; // 振りのうち画面に沿った成分がこの割合より小さければ（突きなど）向きを使わない
const SWING_AHEAD = 1.3; // 斬撃の線の、斬り抜けた側の長さの倍率
const SWING_BEHIND = 0.3; // 振り始めの側の長さの倍率
const SWING_STREAKS = 6; // fx = 1 のときに斬り抜けた向きへ噴き出す光の筋の数
const SWING_SPREAD = 0.45; // 光の筋の広がり（大きいほど扇が開く）
const swingFlow = new THREE.Vector3();

const rayDir = new THREE.Vector3();
const toCamera = new THREE.Vector3();
export function spawnHitFx(at: THREE.Vector3, hitDir: THREE.Vector3, def: HitFxDef, swing?: THREE.Vector3) {
  const fx = def.fx ?? 1;
  const tint = hitFxTint.color ?? HIT_TINT;
  env.camera.updateMatrixWorld();
  camRight.setFromMatrixColumn(env.camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(env.camera.matrixWorld, 1);
  toCamera.subVectors(env.camera.position, at);
  const dist = Math.max(toCamera.length(), 1e-3);
  toCamera.divideScalar(dist);
  const size = THREE.MathUtils.clamp(Math.sqrt(dist / HIT_FX_REF_DIST), HIT_FX_MIN_SCALE, HIT_FX_MAX_SCALE);

  // 刃が動いていた向きのうち、画面に沿った成分。突きのように奥へ向かう振りでは使わない
  let flow: THREE.Vector3 | undefined;
  if (swing && swing.lengthSq() > 1e-8) {
    swingFlow.copy(swing).addScaledVector(toCamera, -swing.dot(toCamera));
    if (swingFlow.lengthSq() > SWING_MIN_SIDE ** 2 * swing.lengthSq()) flow = swingFlow.normalize();
  }

  // 連打で何度も出る通常の攻撃は、短く・毎回形を変えてうるさくならないようにする。締めの技はじっくり見せる
  const heavy = fx >= HEAVY_FX;
  const lifeK = heavy ? 1 : QUICK_LIFE;

  // 中心の閃光: 大きさ・縦横比・向きを毎回変える
  fireBurst(flares, at, 1.1 * Math.sqrt(fx) * size * rand(0.7, 1.25), (0.14 + 0.04 * fx) * lifeK, 0.6 + 0.25 * fx, heavy ? 1 : rand(0.55, 1.6));

  // 放射状の光線: 当たった場所から空間の全方向へ、攻撃した側へ少し寄せて飛ばす
  // 通常の攻撃は本数・長さをばらばらにする
  const rays = Math.round(HIT_RAYS * fx * (heavy ? 1.2 : rand(0.6, 1.2)));
  for (let i = 0; i < rays; i++) {
    // 目に刺さる向きは避ける
    for (let tries = 0; tries < 4; tries++) {
      rayDir.randomDirection().addScaledVector(hitDir, -0.5);
      if (flow) rayDir.addScaledVector(flow, 0.6);
      rayDir.normalize();
      if (rayDir.dot(toCamera) < 0.6) break;
    }
    const len = heavy
      ? (Math.random() < 0.3 ? 1.8 : 0.7 + Math.random() * 0.7) * fx
      : (0.25 + Math.random() ** 2 * 1.4) * fx; // 短いものが多く、ときどき長いもの
    addBeam(at, rayDir, {
      color: tint,
      len: len * size,
      width: rand(0.03, 0.08) * Math.sqrt(fx) * size,
      offset: rand(0.06, 0.16) * size,
      tail: 0.9,
      reach: rand(1.3, 2),
      life: rand(0.14, 0.24) * lifeK,
      age: -Math.random() * 0.02 * lifeK,
    });
  }

  // 斬撃に沿って走る光の線（突きは視線の奥へ向かうので、代わりに横一文字の光を出す）。
  // 刃の向きがわかるときは実際に振った向きへ線を引き、斬り抜けた側へ長く、振り始めの側は短くする
  const slash = flow ? Math.atan2(flow.dot(camUp), flow.dot(camRight)) / DEG : def.slash ?? 0;
  const jitter = flow ? (heavy ? 4 : 10) : heavy ? 8 : 22;
  const lowest = fxLowest();
  const lines = lowest || (def.slash === undefined && !flow) || heavy || Math.random() < 0.6 ? 1 : 2; // ときどき 2 本に割る
  for (let l = 0; l < lines; l++) {
    const a = (slash + (Math.random() - 0.5) * jitter) * DEG;
    rayDir.copy(camRight).multiplyScalar(Math.cos(a)).addScaledVector(camUp, Math.sin(a));
    // 線の中心を少しずらして、左右の長さも変える
    const shift = l > 0 ? rand(-0.08, 0.08) * size : 0;
    lineOrigin.copy(at).addScaledVector(camRight, -Math.sin(a) * shift).addScaledVector(camUp, Math.cos(a) * shift);
    const thin = (l > 0 ? 0.5 : 1) * size * hitFxTint.slashWidth;
    const baseLen = (def.slash === undefined ? 3.2 : 2.6) * fx * thin;
    for (const sign of [1, -1]) {
      lineDir.copy(rayDir).multiplyScalar(sign);
      const ahead = flow ? (sign > 0 ? SWING_AHEAD : SWING_BEHIND) : 1;
      const len = baseLen * ahead * (heavy ? 1 : rand(0.45, 1.1));
      const life = (def.slash === undefined ? 0.24 : 0.2) * lifeK * rand(0.8, 1.1);
      // 最低画質でも、どこを斬ったかわかるよう斬撃の線だけは必ず出す
      addBeam(lineOrigin, lineDir, { color: tint, len, width: rand(0.07, 0.12) * thin, tail: 0.5, reach: 3, life, keep: lowest });
      addBeam(lineOrigin, lineDir, { color: HIT_CORE, len: len * 0.85, width: 0.035 * thin, tail: 0.5, reach: 3, life: life * 0.8 });
    }
  }

  // 斬り抜けた向きへ、細い光の筋を扇状に噴き出させる（刃が通り過ぎたあとに勢いが抜けていくように）
  if (flow) {
    const streaks = Math.round(SWING_STREAKS * fx * (heavy ? 1.2 : rand(0.7, 1.2)));
    for (let i = 0; i < streaks; i++) {
      for (let tries = 0; tries < 4; tries++) {
        rayDir.randomDirection().multiplyScalar(SWING_SPREAD).add(flow).normalize();
        if (rayDir.dot(toCamera) < 0.5) break;
      }
      addBeam(at, rayDir, {
        color: tint,
        len: rand(0.5, 1.5) * fx * size,
        width: rand(0.02, 0.05) * Math.sqrt(fx) * size,
        offset: rand(0.1, 0.3) * size,
        tail: 1,
        reach: rand(1.6, 2.4),
        life: rand(0.16, 0.28) * lifeK,
        age: -rand(0.01, 0.04) * lifeK, // 刃が抜けてから少し遅れて出す
      });
    }
  }

  const sk = hitFxTint.sparks;
  const sparkCount = 16 * fx * (heavy ? 1 : rand(0.5, 1.1));
  if (sk) {
    hitSparkTint.setHex(sk.tint);
    spawnSparks(at, hitDir, Math.round(sparkCount * sk.count), lifeK * sk.life, size * sk.size, flow, hitSparkTint);
    spawnSparks(at, hitDir, Math.round(sparkCount * sk.embers), lifeK * sk.life * 2.5, size * 0.4, flow, hitSparkTint);
  } else spawnSparks(at, hitDir, Math.round(sparkCount), lifeK, size, flow);
  spawnShards(at, hitDir, Math.round(8 * fx * (heavy ? 1.3 : rand(0.6, 1.1))), heavy ? 1.3 : 1, size, flow);

  impact.age = 0;
  impact.hold = def.hitStop ?? env.hitStop.normal;
  // 遠くの当たりで画面全体が暗くならないよう、離れるほど弱める。最低画質では普通の当たりで暗くしない（全画面の処理を動かさない）
  impact.power = lowest ? 0 : fx * THREE.MathUtils.clamp(HIT_FX_REF_DIST / dist, 0.2, 1);
}
// とどめ: 体じゅうから破片を噴き出させ、大きな閃光・全方向への長い光線・腰の高さに広がる光の輪を重ねる
const killCenter = new THREE.Vector3();
const killPoint = new THREE.Vector3();
export function spawnKillFx(root: THREE.Vector3, dir: THREE.Vector3) {
  killCenter.set(root.x, root.y + 1, root.z);
  toCamera.subVectors(env.camera.position, killCenter).normalize();

  // 体の形に沿って、足元から頭まで破片を割り出す
  for (let i = 0; i < 18; i++) {
    const y = root.y + 0.1 + (i / 17) * (env.bodyHeight - 0.15);
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * env.bodyRadius;
    killPoint.set(root.x + Math.cos(a) * r, y, root.z + Math.sin(a) * r);
    spawnShards(killPoint, dir, 8, rand(1.8, 2.6), rand(1.2, 1.8));
  }
  spawnSparks(killCenter, dir, 70, 2.2, 1.7);

  // 閃光を 2 枚: 大きく長いものと、鋭く短いもの
  fireBurst(flares, killCenter, 5, 0.45, 2.6, 1);
  if (!fxLowest()) fireBurst(flares, killCenter, 2.4, 0.2, 2, rand(1.6, 2.2));

  // 全方向への長い光線（目に刺さる向きは避ける）
  for (let i = 0; i < 28; i++) {
    for (let tries = 0; tries < 4; tries++) {
      rayDir.randomDirection().addScaledVector(dir, 0.4).normalize();
      if (rayDir.dot(toCamera) < 0.5) break;
    }
    addBeam(killCenter, rayDir, {
      color: HIT_TINT,
      len: rand(2.5, 6),
      width: rand(0.08, 0.18),
      offset: rand(0.1, 0.3),
      tail: 0.95,
      reach: rand(1.4, 2.2),
      life: rand(0.35, 0.6),
      age: -Math.random() * 0.05,
    });
  }

  // 水平に広がる衝撃の輪
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + Math.random() * 0.1;
    rayDir.set(Math.cos(a), rand(-0.03, 0.06), Math.sin(a)).normalize();
    addBeam(killPoint.set(root.x, root.y + rand(0.15, 0.4), root.z), rayDir, {
      color: HIT_TINT,
      len: rand(3, 4.5),
      width: rand(0.05, 0.09),
      offset: 0.3,
      tail: 1,
      reach: 1.2,
      life: rand(0.5, 0.65),
    });
  }

  impact.age = 0;
  impact.hold = env.hitStop.kill;
  impact.power = 2.5;
}

// ライフルのヘッドショット: 頭の所に鋭い閃光を置き、弾の抜けた向きへ細く長い光線と破片を噴き、
// 弾の向きを軸に頭のまわりへ光の輪を広げる。kill なら倍に増やし、遅れて広がる輪をもう 1 つ足す
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const headSide = new THREE.Vector3();
const headUp = new THREE.Vector3();
export function spawnHeadshotFx(at: THREE.Vector3, dir: THREE.Vector3, kill: boolean) {
  const k = kill ? 1 : 0.5;
  fireBurst(flares, at, kill ? 3.2 : 1.8, 0.22, 2.6, rand(2, 2.6));
  if (!fxLowest()) fireBurst(flares, at, 1.2, 0.08, 3, 1);
  spawnSparks(at, dir, Math.round(60 * k), 1.6, 1.2);
  spawnShards(at, dir, Math.round(30 * k), 1.8, 1.3);
  for (let i = 0; i < 18 * k; i++) {
    rayDir.randomDirection().multiplyScalar(0.18).add(dir).normalize();
    addBeam(at, rayDir, {
      color: HIT_TINT,
      len: rand(4, 9),
      width: rand(0.03, 0.08),
      offset: rand(0.05, 0.2),
      tail: 0.95,
      reach: rand(2, 3),
      life: rand(0.25, 0.45),
      age: -Math.random() * 0.03,
    });
  }
  headSide.crossVectors(dir, Math.abs(dir.y) > 0.9 ? X_AXIS : Y_AXIS).normalize();
  headUp.crossVectors(headSide, dir);
  for (let ring = 0; ring < (kill ? 2 : 1); ring++) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + ring * 0.13;
      rayDir.copy(headSide).multiplyScalar(Math.cos(a)).addScaledVector(headUp, Math.sin(a));
      addBeam(at, rayDir, {
        color: HIT_TINT,
        len: rand(0.9, 1.3) + ring * 0.8,
        width: rand(0.03, 0.05),
        offset: 0.15 + ring * 0.3,
        tail: 1,
        reach: 1 + ring * 0.5,
        life: rand(0.3, 0.38),
        age: -ring * 0.08,
      });
    }
  }
  impact.age = 0;
  if (!fxLowest()) impact.power = Math.max(impact.power, 2 * k + 1); // 最低画質では、キルの暗転だけを残す
}

// ライフルの命中: 金色の火花を、弾の抜けた向きへ散らす。遠くの当たりでも見えるよう、離れるほど大きくする
const GOLD_SPARK = new THREE.Color(0xffa018);
export function spawnGoldSparks(at: THREE.Vector3, dir: THREE.Vector3, kill: boolean) {
  const size = THREE.MathUtils.clamp(Math.sqrt(at.distanceTo(env.camera.position) / HIT_FX_REF_DIST), HIT_FX_MIN_SCALE, HIT_FX_MAX_SCALE);
  spawnSparks(at, dir, Math.round(18 * (kill ? 1.6 : 1)), 1.4, size, undefined, GOLD_SPARK);
}

// 最後の 1 体: とどめの演出に重ねて、天へ伸びる光の柱・時間差で広がる 3 重の輪・さらに大きな閃光を足す
export function spawnFinaleFx(root: THREE.Vector3, dir: THREE.Vector3) {
  // 天へ伸びる柱: 束ねた太い光線を、わずかに散らして真上へ
  for (let i = 0; i < 10; i++) {
    rayDir.set(rand(-0.06, 0.06), 1, rand(-0.06, 0.06)).normalize();
    addBeam(killPoint.set(root.x, root.y, root.z), rayDir, {
      color: HIT_TINT,
      len: rand(14, 26),
      width: rand(0.12, 0.3),
      offset: 0,
      tail: 1,
      reach: rand(1.5, 2.2),
      life: rand(0.9, 1.3),
      age: -rand(0, 0.04),
    });
  }
  // 足元から時間差で広がる輪。外側の輪ほど遅れて、遠くまで届く
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + ring * 0.4 + Math.random() * 0.08;
      rayDir.set(Math.cos(a), rand(-0.02, 0.04), Math.sin(a)).normalize();
      addBeam(killPoint.set(root.x, root.y + 0.08 + ring * 0.05, root.z), rayDir, {
        color: HIT_TINT,
        len: rand(5, 7) + ring * 3,
        width: rand(0.06, 0.1),
        offset: 0.4 + ring * 0.8,
        tail: 1,
        reach: 1.6 + ring * 0.6,
        life: rand(0.8, 1.0),
        age: -ring * 0.12,
      });
    }
  }
  // 斬り抜けた向きへ噴き出す、長い光線の束
  for (let i = 0; i < 16; i++) {
    rayDir.randomDirection().multiplyScalar(0.35).add(dir).normalize();
    addBeam(killCenter, rayDir, {
      color: HIT_TINT,
      len: rand(6, 12),
      width: rand(0.1, 0.22),
      offset: rand(0.2, 0.5),
      tail: 0.95,
      reach: rand(1.8, 2.6),
      life: rand(0.6, 0.9),
      age: -Math.random() * 0.06,
    });
  }
  spawnSparks(killCenter, dir, 120, 3.2, 2.2);
  fireBurst(flares, killCenter, 9, 0.9, 3, 1);
  if (!fxLowest()) fireBurst(flares, killCenter, 4, 0.4, 2.4, rand(2.4, 3));
  impact.hold = env.hitStop.finale;
  impact.power = 4;
}

const lineOrigin = new THREE.Vector3();
const lineDir = new THREE.Vector3();

// 粒と光を進める
export function updateHitParticles(dt: number, flareDt = dt) {
  updateBeams(dt);
  updateBursts(flareDt);
  updateSparks(dt);
  updateShards(dt);
  updateHologramChains(dt);
  updateLeaves(dt);
  updateCutLines(dt);
  updateGleams(dt);
}
// 光が 1 つでも出ているか。出ていなければ、光を重ねる描画ごと飛ばせる
export const hitFxVisible = () => fxScene.children.some((o) => o.visible && (!(o instanceof THREE.InstancedMesh) || o.count > 0));

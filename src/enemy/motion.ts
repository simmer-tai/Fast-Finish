import * as THREE from 'three';
import * as sfx from '../audio.js';
import { env } from './env.js';
import {
  AXE_LAUNCH_ENEMY_SPEED, DEFAULT_KNOCK, ENEMY_HIT_RECOVER, RESPAWN_RISE_TIME, WALL_SLAM_BOUNCE, en, enemies,
  type Enemy,
} from './state.js';
import { STAGGER_SUBSTEP, addImpulse } from './stagger.js';
import { DEG, UP } from '../math.js';
import { DUMMY_ANKLE_Y, DUMMY_HEIGHT, DUMMY_RADIUS } from './body.js';
import { blocks, floorAt, ramps, type Block } from '../world/blocks.js';
import { playBounds } from '../world/arena.js';
import { GRAVITY } from '../player/config.js';
import { position } from '../player/state.js';
import { rand } from '../random.js';
import { impact, spawnSparks } from '../fx/hitFx.js';
import { moverThreat } from '../world/movers.js';
import { camera } from '../core.js';

// ---- 打ち上げられた敵 ----
// 斧の打ち上げで真上へ飛び、プレイヤーと同じ重力で落ちる。浮いている間は歩かず撃たない。
// 叩きつけられて速く落ちてきたら、地面で重く鳴って小さく跳ねる
export const ENEMY_SLAM_LAND = 15; // これより速く着地したら、叩きつけられた着地にする
export const ENEMY_SLAM_BOUNCE = 2.5;
export const enemyLandAt = new THREE.Vector3();
export function updateEnemyAir(dt: number) {
  en.airVel -= GRAVITY * dt;
  en.airY += en.airVel * dt;
  if (en.airY <= 0) {
    const impact = -en.airVel;
    en.airY = 0;
    en.airVel = 0;
    if (en.spiked) {
      en.spiked = false;
      if (impact > ENEMY_SLAM_LAND) env.slamIntoFloor();
    } else if (impact > ENEMY_SLAM_LAND) {
      en.airVel = ENEMY_SLAM_BOUNCE;
      en.airY = 1e-3;
      sfx.playAxeGround(0.7);
      env.addTrauma(0.2);
      enemyLandAt.set(en.root.position.x, en.baseY + 0.05, en.root.position.z);
      spawnSparks(enemyLandAt, UP, 10, 0.8, 0.8);
      en.pelvisSpring.v.y -= 2; // 膝が沈む
    }
  }
  en.root.position.y = en.baseY + en.airY;
}

// ---- 飛び移る ----
// 今いる所から to の床へ、少し跳ね上がってから重力で落ちて着く（ストライカーの飛び降り、リフトへの飛び乗り）。
// 横へは着くまでの時間で一定に進む。浮いている間は脚を縮め、着く少し前から伸ばして床を迎える
export const LEAP_HOP = 3.5; // 踏み切るときに跳ね上がる速さ (m/s)
export function startLeap(to: THREE.Vector3) {
  const p = en.root.position;
  en.dropFrom.copy(p);
  en.dropTo.copy(to);
  en.dropT = 0;
  en.dropDur = (LEAP_HOP + Math.sqrt(LEAP_HOP ** 2 + 2 * GRAVITY * Math.max(0, p.y - to.y))) / GRAVITY;
  en.vel.set(0, 0, 0);
  en.knockVel.set(0, 0, 0);
  en.airY = en.airVel = 0;
  en.pelvisSpring.v.y -= 1.2; // 膝を沈めて踏み切る
}
// 着いたフレームだけ true を返す
const leapSparkAt = new THREE.Vector3();
export function updateLeap(dt: number): boolean {
  const p = en.root.position;
  en.dropT = Math.min(en.dropT + dt, en.dropDur);
  const u = en.dropT / en.dropDur;
  p.x = THREE.MathUtils.lerp(en.dropFrom.x, en.dropTo.x, u);
  p.z = THREE.MathUtils.lerp(en.dropFrom.z, en.dropTo.z, u);
  const y = en.dropFrom.y + LEAP_HOP * en.dropT - 0.5 * GRAVITY * en.dropT ** 2;
  en.baseY = Math.max(en.dropTo.y, y);
  p.y = en.baseY + en.airY;
  en.airPose = Math.min(1, en.dropT / 0.12) * THREE.MathUtils.clamp((en.baseY - en.dropTo.y) / 1.2, 0, 1);
  if (u < 1) return false;
  // 着地: 速さに応じて膝を深く沈め、上体を前へ倒し込む
  const impact = GRAVITY * en.dropDur - LEAP_HOP;
  en.baseY = en.dropTo.y;
  p.y = en.baseY + en.airY;
  en.pelvisSpring.v.y -= Math.min(3, impact * 0.18);
  addImpulse(en.leanSpring, LEG_FWD_X, Math.min(2, impact * 0.12));
  spawnSparks(leapSparkAt.set(p.x, en.baseY + 0.05, p.z), UP, 6, 0.6, 0.5);
  const s = enemySoundAt(Math.hypot(position.x - p.x, position.z - p.z));
  sfx.playStrikerLand(impact, s.volume, s.pan);
  return true;
}
// 敵のいる向きの左右と距離から、音の左右と大きさを決める
const panTmp = new THREE.Vector3();
export function enemySoundAt(dist: number) {
  camera.updateMatrixWorld();
  panTmp.copy(en.root.position).applyMatrix4(camera.matrixWorldInverse);
  const pan = THREE.MathUtils.clamp(panTmp.x / Math.max(Math.hypot(panTmp.x, panTmp.z), 1e-3), -1, 1) * 0.8;
  return { volume: THREE.MathUtils.clamp(3 / Math.max(dist, 1), 0.3, 1), pan };
}

// ---- 床への叩きつけ ----
// 打ち上げて浮いている敵に斧の振り下ろしが当たると、真下へ一気に叩き落とす。
// 床に着いた瞬間に重い一撃になり、床がひび割れて、体は反り返ったまま潰れるように跳ねてから起き上がる
export const ENEMY_SPIKE_SPEED = 38; // 叩き落とす速さ (m/s)。自分の急降下より速く、先に床へ着く
export const ENEMY_SPIKE_BOUNCE = 4.5; // 床で跳ね返る速さ (m/s)
export function spikeEnemy() {
  if (env.isHeld()) return;
  en.spiked = true;
  en.airVel = -ENEMY_SPIKE_SPEED;
  en.knockVel.set(0, 0, 0); // 横へは流さず、真下へ落とす
  en.flung = false;
  en.airTiltVel.x -= AIR_TILT_KICK * 1.5; // 打たれた勢いで、さらに大きく反り返る
  en.gunSpring.v.x -= 4;
  addImpulse(en.headSpring, LEG_FWD_X, 4);
}

// 打ち上げで浮いている間の見た目: 腹を突き上げられて上体が後ろへ反り返りながら回り、脚は縮んで垂れる。
// 落ち始めたら足から降りるよう起き直り、着地で行き過ぎて揺れ戻る。
// 回すのは見た目の入れ物（shake）だけで、体の中ほどを中心にする（足もとを中心にすると振り子に見える）
export const AIR_TILT_BACK = 70 * DEG; // 上がっている間に反り返る角度
export const AIR_TILT_KICK = 7; // 打ち上げた瞬間に後ろへ回し始める速さ (rad/s)
export const AIR_TILT_ROLL = 18 * DEG; // 左右へ傾ける角度の最大
export const AIR_TILT_RIGHT = 2.5; // 落ちるとき、足もとまでこの高さ (m) を切ったら起き直り始める
export const AIR_TILT_K = 45;
export const AIR_TILT_D = 7;
export const AIR_PIVOT_Y = 1.0;
export const FLING_TILT = 75 * DEG; // 横へ吹き飛ばされて浮いている間に倒れ込む角度の最大
export const FLING_TILT_SPEED = 14; // この速さ (m/s) で最も深く倒れ込む
export const AIR_TUCK = [new THREE.Vector3(0, 0.36, 0.06), new THREE.Vector3(0, 0.22, 0.14)]; // 浮いている間の足の寄せ（右、左）
export function launchEnemy() {
  en.airVel = AXE_LAUNCH_ENEMY_SPEED;
  en.airTiltVel.x -= AIR_TILT_KICK;
  en.airRoll = rand(-1, 1) * AIR_TILT_ROLL;
  en.airTiltVel.z += en.airRoll * 4;
  en.gunSpring.v.x -= 6; // 銃を持った腕が跳ね上がる
  addImpulse(en.headSpring, LEG_FWD_X, 3); // 首は遅れて前へ残る
}
export const LEG_FWD_X = new THREE.Vector3(1, 0, 0);
export function updateEnemyTumble(dt: number) {
  const air = en.airY > 0;
  // 上がっている間は反り返り、落ち始めたら地面が近づくほど起き直る（叩き落とされている間は反り返ったまま）
  const w = !air ? 0 : en.airVel > 0 || en.spiked ? 1 : THREE.MathUtils.clamp(en.airY / AIR_TILT_RIGHT, 0, 1);
  // 横へ吹き飛ばされて浮いている間は、飛ぶ向きへ上体から倒れ込む（速いほど深く）
  let tx = -AIR_TILT_BACK;
  let tz = en.airRoll;
  const flySpeed = Math.hypot(en.knockVel.x, en.knockVel.z);
  if (air && en.flung && flySpeed > 0.5) {
    tumbleTmp.copy(en.knockVel).applyQuaternion(moveInvQ.copy(en.root.quaternion).invert());
    const a = FLING_TILT * Math.min(1, flySpeed / FLING_TILT_SPEED);
    tx = (tumbleTmp.z / flySpeed) * a;
    tz = (-tumbleTmp.x / flySpeed) * a + en.airRoll * 0.5;
  }
  const n = Math.max(1, Math.ceil(dt / STAGGER_SUBSTEP));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    en.airTiltVel.x += ((tx * w - en.airTilt.x) * AIR_TILT_K - en.airTiltVel.x * AIR_TILT_D) * h;
    en.airTiltVel.z += ((tz * w - en.airTilt.z) * AIR_TILT_K - en.airTiltVel.z * AIR_TILT_D) * h;
    en.airTilt.addScaledVector(en.airTiltVel, h);
  }
  // 脚は浮いたらすぐ縮め、着いたら素早く伸ばして立つ
  en.airPose += ((air && en.airY > 0.05 ? 1 : 0) - en.airPose) * Math.min(1, dt * (air ? 10 : 18));
}
// shake の向きと位置（揺れの分を足す前）を、打ち上げの回転にする
export const tumbleQ = new THREE.Quaternion();
export const tumbleE = new THREE.Euler();
export const tumblePivot = new THREE.Vector3();
export const tumbleTmp = new THREE.Vector3();
export function poseEnemyTumble(e: Enemy) {
  if (e.airTilt.lengthSq() < 1e-8) {
    e.shake.quaternion.identity();
    e.shake.position.set(0, 0, 0);
    return;
  }
  e.shake.quaternion.copy(tumbleQ.setFromEuler(tumbleE.set(e.airTilt.x, 0, e.airTilt.z)));
  tumblePivot.set(0, AIR_PIVOT_Y, 0);
  e.shake.position.copy(tumblePivot).sub(tumbleTmp.copy(tumblePivot).applyQuaternion(tumbleQ));
}

// ---- 敵の移動 ----
// ステージの敵は、歩ける所から次の立ち位置を選んで歩き、着いたら少し立ち止まる（歩きながらも撃つ）。
// プレイヤーとの間合いを保つよう、遠ければ寄り、近すぎれば下がり、程よければ横へ回り込む。
// 歩ける所は、今の床と同じ高さの床があり、体の高さに壁や柱が無い所。行き先までの線の上も同じ条件で確かめる。
// よろけている間・起き上がる途中・鎖鎌で掛けられている間・突進の的になっている間は止まる
export const ENEMY_WALK_SPEED = 2.6; // m/s
export const ENEMY_WALK_ACCEL = 8; // 歩く速さへ近づく速さ（残りの差に掛ける割合 /s）
export const ENEMY_STEP_MIN = 3; // 一度に歩く距離
export const ENEMY_STEP_MAX = 8;
export const ENEMY_KEEP_NEAR = 7; // プレイヤーとの間合い
export const ENEMY_KEEP_FAR = 22;
export const ENEMY_WAIT_MIN = 0.8; // 着いてから立ち止まる時間
export const ENEMY_WAIT_MAX = 2.2;
export const ENEMY_APART = 1.6; // ほかの敵とこれより近づかない
export const ENEMY_PLAYER_GAP = 1.4; // プレイヤーがこれより近くにいたら止まる
export const ENEMY_WALL_GAP = 0.25; // 壁や柱からこれだけ離れて歩く
export const ENEMY_STRIDE = 0.6; // 1 歩で進む距離（足を前後に振る幅）
export const ENEMY_WALK_LIFT = 0.1; // 振り出す足を上げる高さ
export const ENEMY_WALK_BOB = 0.03; // 足を開いたときに腰が沈む量
export const moveWant = new THREE.Vector3();
export const moveInvQ = new THREE.Quaternion();

// (x, z) に en が立てるか
export function enemyCanStand(x: number, z: number): boolean {
  return enemyCanStandAt(x, z, en.baseY);
}
// 足もとの高さ y の床の (x, z) に、敵が立てるか
export function enemyCanStandAt(x: number, z: number, y: number): boolean {
  if (x < playBounds.minX || x > playBounds.maxX || z < playBounds.minZ || z > playBounds.maxZ) return false;
  if (Math.abs(floorAt(x, z, y + 0.05) - y) > 0.01) return false;
  return !enemyBlockedAt(x, z, y);
}

// 足もとの高さ y で (x, z) に立った敵の体が、箱や坂（を囲む箱）に掛かるか。足もとの床と、頭より上の物は除く
export function enemyBlockedAt(x: number, z: number, y: number): boolean {
  const r = DUMMY_RADIUS + ENEMY_WALL_GAP;
  const hit = (b: Block) => {
    if (b.h <= y + 0.2 || (b.y0 ?? 0) >= y + DUMMY_HEIGHT) return false;
    const dx = x - THREE.MathUtils.clamp(x, b.minX, b.maxX);
    const dz = z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
    return dx * dx + dz * dz < r * r;
  };
  return blocks.some(hit) || ramps.some(hit);
}

// ---- 斧で吹き飛ばされた敵 ----
// 当たった向きへ滑るように押し下げられ、足を踏ん張って速さを殺していく。壁や段差の縁に着いたらそこで止まる。
// 吹き飛んでいる間は歩かない（向かっていた先は選び直す）
export const ENEMY_KNOCK_FRICTION = 6; // 速さが減っていく割合 (1/s)。滑る距離はおよそ 速さ / これ
export const ENEMY_KNOCK_STOP = 0.4; // これより遅くなったら止める (m/s)
export const ENEMY_KNOCK_AIR_FRICTION = 0.4; // 浮いている間の速さの減り方 (1/s)
export const ENEMY_KNOCK_FLUNG_FRICTION = 2; // 大きく吹き飛ばされて床を滑っている間の速さの減り方 (1/s)
export const AXE_KNOCKBACK = 4; // 吹き飛ばす速さ (m/s)。knock = DEFAULT_KNOCK のときの量で、knock に比例させる
export function knockEnemy(dir: THREE.Vector3, knock: number) {
  if (env.isHeld()) return;
  en.knockVel.set(dir.x, 0, dir.z).normalize().multiplyScalar(AXE_KNOCKBACK * (knock / DEFAULT_KNOCK));
  en.vel.set(0, 0, 0);
  en.moving = false;
  en.dodgeT = 0;
  en.waitT = Math.max(en.waitT, rand(ENEMY_WAIT_MIN, ENEMY_WAIT_MAX) * 0.5);
}
// バットのチャージで吹き飛ばした敵が、ほかの敵に当たったら巻き込む
export const BODY_SLAM_GAP = 0.15; // 体どうしがこれだけ近づいたら当たり (m)
export const BODY_SLAM_KEEP = 0.3; // ぶつかった後に、ぶつけた側に残す速さの割合
function flungInto(): Enemy | null {
  const p = en.root.position;
  const k = en.knockVel;
  for (const e of enemies) {
    if (e === en || !e.alive || e.riseTime < RESPAWN_RISE_TIME) continue;
    const q = e.root.position;
    if (Math.abs(q.y + e.airY - (p.y)) > DUMMY_HEIGHT) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    if (dx * dx + dz * dz > (DUMMY_RADIUS * 2 + BODY_SLAM_GAP) ** 2) continue;
    if (dx * k.x + dz * k.z <= 0) continue; // 離れていく向きの相手は除く
    return e;
  }
  return null;
}
export function updateEnemyKnock(dt: number) {
  const k = en.knockVel;
  if (!en.flung) en.batFlung = false;
  if (k.lengthSq() === 0) return;
  if (env.isHeld()) {
    k.set(0, 0, 0);
    en.flung = false;
    return;
  }
  const p = en.root.position;
  const nx = p.x + k.x * dt;
  const nz = p.z + k.z * dt;
  if (enemyCanStand(nx, nz)) {
    p.x = nx;
    p.z = nz;
    if (en.batFlung) {
      const other = flungInto();
      if (other && env.slamIntoEnemy(other)) k.multiplyScalar(BODY_SLAM_KEEP);
      if (!en.alive) return;
    }
    // 浮いている間は踏ん張れないので、ほとんど速さが落ちない
    k.multiplyScalar(Math.exp(-(en.airY > 0 ? ENEMY_KNOCK_AIR_FRICTION : en.flung ? ENEMY_KNOCK_FLUNG_FRICTION : ENEMY_KNOCK_FRICTION) * dt));
    if (k.lengthSq() < ENEMY_KNOCK_STOP ** 2) {
      k.set(0, 0, 0);
      en.flung = false;
    }
  } else {
    const slam = en.flung && enemyWallAt(nx, nz) && env.slamIntoWall();
    // 叩きつけられたら、壁から少しだけ跳ね返る
    if (slam) k.multiplyScalar(-WALL_SLAM_BOUNCE / k.length());
    else k.set(0, 0, 0);
    en.flung = false;
  }
}

// (x, z) で en の体が壁や柱（ステージの端を含む）に掛かるか。段差の縁で止まったときは壁にしない
export function enemyWallAt(x: number, z: number): boolean {
  if (x < playBounds.minX || x > playBounds.maxX || z < playBounds.minZ || z > playBounds.maxZ) return true;
  return enemyBlockedAt(x, z, en.baseY + en.airY);
}


// 今いる所から (x, z) まで、まっすぐ歩いて行けるか
export function enemyPathClear(x: number, z: number): boolean {
  const p = en.root.position;
  const n = Math.ceil(Math.hypot(x - p.x, z - p.z) / 0.5);
  for (let i = 1; i <= n; i++) if (!enemyCanStand(p.x + ((x - p.x) * i) / n, p.z + ((z - p.z) * i) / n)) return false;
  return true;
}

// ほかの敵のいる所と向かう先から、十分に離れているか
export function enemyApartAt(x: number, z: number): boolean {
  const gap = ENEMY_APART * 1.5;
  return enemies.every((e) =>
    e === en || !e.alive ||
    (Math.hypot(e.root.position.x - x, e.root.position.z - z) >= gap && (!e.moving || Math.hypot(e.moveTo.x - x, e.moveTo.z - z) >= gap)));
}

// 次の立ち位置を選ぶ。間合いに合わせた向きで探し、見つからなければどの向きでも探す
const enemyPlayerTarget = new THREE.Vector3();
export function pickMoveTarget(): boolean {
  const p = en.root.position;
  if (!env.targetPlayer(enemyPlayerTarget)) return false;
  const toPlayer = Math.atan2(enemyPlayerTarget.x - p.x, enemyPlayerTarget.z - p.z);
  const dist = Math.hypot(enemyPlayerTarget.x - p.x, enemyPlayerTarget.z - p.z);
  let base = toPlayer + (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2); // 程よい間合いなら横へ回り込む
  let spread = 45 * DEG;
  if (dist > ENEMY_KEEP_FAR) {
    base = toPlayer;
    spread = 50 * DEG;
  } else if (dist < ENEMY_KEEP_NEAR) {
    base = toPlayer + Math.PI;
    spread = 60 * DEG;
  }
  for (let tries = 0; tries < 18; tries++) {
    if (tries === 10) spread = Math.PI;
    const a = base + rand(-spread, spread);
    const len = rand(ENEMY_STEP_MIN, ENEMY_STEP_MAX);
    const x = p.x + Math.sin(a) * len;
    const z = p.z + Math.cos(a) * len;
    if (!enemyCanStand(x, z) || !enemyApartAt(x, z) || !enemyPathClear(x, z)) continue;
    en.moveTo.set(x, en.baseY, z);
    return true;
  }
  return false;
}


export const ENEMY_DODGE_ACCEL = 25; // 車をよけて走るときの加速
export const ENEMY_RETREAT_NEAR = 4; // プレイヤーがこれより近いと、立ち止まる時間を縮めてすぐ下がり始める
export const ENEMY_MOVE_LEAN = 0.025; // 速さ 1 m/s あたりに上体を傾ける角度 (rad)
export const ENEMY_ACCEL_LEAN = 0.012; // 加速 1 m/s² あたりに上体を傾ける角度 (rad)
export const ENEMY_MAX_MOVE_LEAN = 0.25;
export const leanWant = new THREE.Vector3();

// ---- 走ってくる車をよける ----
// 車の道のりを少し先まで読み、通る所にいたら車の進む向きと直角に、車から離れる側へ走って逃げる（その側に立てなければ逆へ）
export const CAR_LOOK = 1.2; // これだけ先までに車が来る所にいたら、よける (s)
export const CAR_MARGIN = 0.5; // 車とこれだけは離れる
export const CAR_EVADE_SPEED = 7; // よける速さ (m/s)
const evadeDir = new THREE.Vector3();
export function carEvadeDir(): THREE.Vector3 | null {
  const p = en.root.position;
  if (!moverThreat(p.x, p.z, p.y, DUMMY_HEIGHT, DUMMY_RADIUS + CAR_MARGIN, CAR_LOOK, evadeDir)) return null;
  if (!enemyCanStand(p.x + evadeDir.x, p.z + evadeDir.z)) evadeDir.negate();
  return evadeDir;
}

export function updateEnemyMove(dt: number) {
  if (!en.mobile) return;
  const p = en.root.position;
  if (!env.targetPlayer(enemyPlayerTarget)) enemyPlayerTarget.copy(position);
  moveWant.set(0, 0, 0);
  const halted = en.riseTime < RESPAWN_RISE_TIME || en.flashT < ENEMY_HIT_RECOVER || env.isHeld() || env.playerHp() <= 0 || en.airY > 0
    || en.knockVel.lengthSq() > ENEMY_KNOCK_STOP ** 2;
  if (halted) en.dodgeT = 0;
  const evade = halted ? null : carEvadeDir();
  if (evade) {
    en.dodgeVel.copy(evade).multiplyScalar(CAR_EVADE_SPEED);
    en.dodgeT = Math.max(en.dodgeT, 0.15); // 車が来なくなるまで、毎フレーム延ばす
    en.moving = false;
  }
  const playerDist = Math.hypot(enemyPlayerTarget.x - p.x, enemyPlayerTarget.z - p.z);
  if (en.dodgeT > 0) {
    en.dodgeT -= dt;
    moveWant.copy(en.dodgeVel);
    if (en.dodgeT <= 0) en.waitT = rand(0.3, 0.7); // 着地して一息おく
  } else if (!halted && en.moving) {
    const dx = en.moveTo.x - p.x;
    const dz = en.moveTo.z - p.z;
    const d = Math.hypot(dx, dz);
    // 行く手のすぐ先に、ほかの敵かプレイヤーがいたら止まる
    const blocked =
      Math.hypot(enemyPlayerTarget.x - p.x, enemyPlayerTarget.z - p.z) < ENEMY_PLAYER_GAP ||
      enemies.some((e) => {
        if (e === en || !e.alive) return false;
        const ox = e.root.position.x - p.x;
        const oz = e.root.position.z - p.z;
        return Math.hypot(ox, oz) < ENEMY_APART && ox * dx + oz * dz > 0;
      });
    if (d < 0.15 || blocked) {
      en.moving = false;
      en.waitT = rand(ENEMY_WAIT_MIN, ENEMY_WAIT_MAX);
    } else {
      moveWant.set(dx / d, 0, dz / d).multiplyScalar(Math.min(ENEMY_WALK_SPEED * en.speedMul, d * 3)); // 着く手前で緩める
    }
  } else if (!halted) {
    // 詰め寄られたら、のんびり立ち止まらずに下がり始める
    en.waitT -= dt * (playerDist < ENEMY_RETREAT_NEAR ? 4 : 1);
    if (en.waitT <= 0) {
      en.moving = pickMoveTarget();
      if (!en.moving) en.waitT = 0.5; // 行ける所が無ければ、少し待って探し直す
    }
  }
  en.vel.lerp(moveWant, 1 - Math.exp(-(en.dodgeT > 0 ? ENEMY_DODGE_ACCEL : ENEMY_WALK_ACCEL) * dt));
  // 次の 1 歩の先に立てなければ止まる
  const nx = p.x + en.vel.x * dt;
  const nz = p.z + en.vel.z * dt;
  if (enemyCanStand(nx, nz)) {
    p.x = nx;
    p.z = nz;
  } else {
    en.vel.set(0, 0, 0);
    en.moving = false;
    en.dodgeT = 0;
  }
}

// ---- 足取りと上体の傾き（歩き・吹き飛ばされての踏ん張り） ----
// 歩いている間は速さに合わせて足を振り、進む速さと速さの変わり目の向きへ上体を傾ける。
// 吹き飛ばされて床を滑っている間は、押された向きへ小刻みに後ずさって（たたらを踏んで）踏ん張る。
// 上体は押された向きへ大きく流れ、腰を落とし、銃を持った腕は狙いを外れて跳ね上がる。
// 速いほど足を引きずって床をこすり、止まりきる瞬間に上体が揺り戻して体勢を立て直す
export const STUMBLE_MIN = 1.2; // 床を滑る速さがこれを超えたら踏ん張る (m/s)
export const STUMBLE_FULL = 6; // この速さで踏ん張りが最も強くなる
export const STUMBLE_CADENCE = 4.5; // 後ずさる足の運びの最高（歩きの速さに直した値, m/s）
export const STUMBLE_LEAN = 0.035; // 滑る速さ 1 m/s あたりに上体を流す角度 (rad)
export const STUMBLE_MAX_LEAN = 0.5;
export const STUMBLE_RECOVER = 1.8; // 止まりきったときに上体を揺り戻す勢い (rad/s)
export const SKID_SPEED = 5; // これより速く滑っていたら床をこする火花を出す
export const SKID_INTERVAL = 0.05;
export const gaitDir = new THREE.Vector3();
export const skidAt = new THREE.Vector3();
export const skidBack = new THREE.Vector3();
export function updateEnemyGait(dt: number) {
  moveInvQ.copy(en.root.quaternion).invert();
  const knockSpeed = en.airY > 0 ? 0 : Math.hypot(en.knockVel.x, en.knockVel.z);
  const stumbleWant = knockSpeed > STUMBLE_MIN ? Math.min(1, knockSpeed / STUMBLE_FULL) : 0;
  const recovered = en.stumbling && stumbleWant === 0 && en.airY <= 0;
  if (stumbleWant > 0.3) en.stumbling = true;
  else if (stumbleWant === 0) en.stumbling = false;
  en.stumble += (stumbleWant - en.stumble) * Math.min(1, dt * (stumbleWant > en.stumble ? 20 : 6));

  // 上体: 歩きの速さと加速の向きへ。踏ん張っている間は、押されている向きへ大きく流す
  // ストライカーは速く走って向きを変えるので、速さの変わり目で上体をあおられすぎないよう控えめにする
  leanWant.subVectors(en.vel, en.prevVel).divideScalar(Math.max(dt, 1e-4)).multiplyScalar(ENEMY_ACCEL_LEAN * (en.kind === 'striker' ? 0.3 : 1))
    .addScaledVector(en.vel, ENEMY_MOVE_LEAN).applyQuaternion(moveInvQ);
  en.prevVel.copy(en.vel);
  leanWant.set(leanWant.z, 0, -leanWant.x); // 傾ける向き → 回転ベクトル（+Z へ傾けるのは +X 軸まわり）
  if (leanWant.length() > ENEMY_MAX_MOVE_LEAN) leanWant.setLength(ENEMY_MAX_MOVE_LEAN);
  if (knockSpeed > 0) {
    gaitDir.copy(en.knockVel).applyQuaternion(moveInvQ);
    const a = Math.min(STUMBLE_MAX_LEAN, knockSpeed * STUMBLE_LEAN);
    leanWant.x += (gaitDir.z / knockSpeed) * a;
    leanWant.z -= (gaitDir.x / knockSpeed) * a;
  }
  en.poseLean.lerp(leanWant, 1 - Math.exp(-(knockSpeed > 0 ? 18 : 10) * dt));
  // 止まりきったら、流れていた上体を逆へ揺り戻す
  if (recovered) {
    en.leanSpring.v.addScaledVector(en.poseLean, -STUMBLE_RECOVER / Math.max(en.poseLean.length(), 1e-3));
    en.pelvisSpring.v.y -= 0.5;
  }

  // 足: 歩きの速さか、踏ん張って後ずさる足の運びの速い方に合わせて振る（体はプレイヤーへ向けたまま、横や後ろへも歩く）
  const walkSpeed = Math.hypot(en.vel.x, en.vel.z);
  const stumbleSpeed = Math.min(knockSpeed, STUMBLE_CADENCE) * en.stumble;
  const speed = Math.max(walkSpeed, stumbleSpeed);
  en.walk += (Math.min(1, (speed / ENEMY_WALK_SPEED) * 1.5) - en.walk) * Math.min(1, dt * (en.stumble > 0.1 ? 16 : 8));
  en.walkPhase += (speed / en.stride) * Math.PI * dt;
  if (stumbleSpeed > walkSpeed && knockSpeed > 0.2) en.walkDir.copy(en.knockVel).applyQuaternion(moveInvQ).setY(0).normalize();
  else if (walkSpeed > 0.2) en.walkDir.copy(en.vel).applyQuaternion(moveInvQ).setY(0).normalize();

  // 速く滑っている間は、足が床をこすって火花が後ろへ散る
  en.skidT -= dt;
  if (knockSpeed > SKID_SPEED && en.skidT <= 0) {
    en.skidT = SKID_INTERVAL;
    const f = en.footState[Math.random() < 0.5 ? 0 : 1];
    skidAt.copy(f.pos).setY(0.03).applyMatrix4(en.root.matrixWorld);
    skidBack.copy(en.knockVel).negate().normalize().setY(0.35);
    spawnSparks(skidAt, skidBack, 2, 0.4, 0.45);
  }
}

// 歩いている間の足: 左右の足を半周期ずらして前後に振り、前へ振り出す間だけ持ち上げる
export function walkFeet() {
  if (en.kind === 'striker') return runFeet();
  for (const f of en.footState) {
    const ph = en.walkPhase + (f.side > 0 ? Math.PI : 0);
    f.pos.copy(f.rest).addScaledVector(en.walkDir, Math.sin(ph) * en.stride * 0.5 * en.walk);
    f.pos.y = DUMMY_ANKLE_Y + Math.max(0, Math.cos(ph)) * ENEMY_WALK_LIFT * en.walk;
    f.from.copy(f.pos);
    f.to.copy(f.pos);
    f.t = 1;
  }
}

// ストライカーの走り: 1 周期を、足を着いて後ろへ流す間と、浮かせて前へ振り出す間に分ける（歩きを速回しして前後に揺するのではなく）。
// 足を出す幅は、構えで落とした腰から脚が届く範囲に収める（届かないと腰が毎歩がくっと沈む）。振り出す足は高く上げてから前へ運ぶ
export const RUN_STANCE = 0.45; // 1 周期のうち足を着いている割合
export const RUN_REACH = 0.36; // 足を前後へ出す幅（片側, m）
export const RUN_LIFT = 0.2; // 振り出す足を上げる高さ
function runFeet() {
  for (const f of en.footState) {
    const u = ((((en.walkPhase + (f.side > 0 ? Math.PI : 0)) / (2 * Math.PI)) % 1) + 1) % 1;
    let x = RUN_REACH * (1 - (2 * u) / RUN_STANCE); // 着いている間は前から後ろへまっすぐ流す
    let lift = 0;
    if (u >= RUN_STANCE) {
      const w = (u - RUN_STANCE) / (1 - RUN_STANCE);
      x = RUN_REACH * (2 * w * w * (3 - 2 * w) - 1); // 後ろから前へ、ゆっくり出てゆっくり着く
      lift = Math.sin(Math.PI * w) * RUN_LIFT * (1 - 0.4 * w); // 振り出しの前半で高く上げる
    }
    f.pos.copy(f.rest).addScaledVector(en.walkDir, x * en.walk);
    f.pos.y = DUMMY_ANKLE_Y + lift * en.walk;
    f.from.copy(f.pos);
    f.to.copy(f.pos);
    f.t = 1;
  }
}

import * as THREE from 'three';
import * as sfx from '../audio.js';
import { DEG, UP, wrapAngle } from '../math.js';
import { camera } from '../core.js';
import { env } from './env.js';
import { DEFAULT_KNOCK, ENEMY_HIT_RECOVER, RESPAWN_RISE_TIME, en, enemies, hitDir, type StrikePhase } from './state.js';
import { ENEMY_KNOCK_STOP, LEG_FWD_X, enemyBlockedAt, enemyCanStand, enemyCanStandAt, enemyPathClear, knockEnemy } from './motion.js';
import { addImpulse, solveDummyLegs, staggerDummy } from './stagger.js';
import { floorAt } from '../world/blocks.js';
import { GRAVITY } from '../player/config.js';
import { playBounds } from '../world/arena.js';
import { castWorld } from '../world/raycast.js';
import { player, position, velocity } from '../player/state.js';
import { game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
import { PARRY_ANGLE, PARRY_HIT_STOP, parryActive, parryState } from '../combat/parry.js';
import { spawnSparks } from '../fx/hitFx.js';

// ---- ストライカー ----
// 右腕が刃の近接型。間合いを保たずに走って詰め寄り、届く所まで来たら刃を振りかぶって（縁が光る）、踏み込みながら袈裟に斬る。
// 斬り終えた後は少しの間、刃を振り抜いたまま動けない（ここが反撃の機会）。打たれ弱く、当てられると構えが崩れて追い直す。
// 刀やクナイを振っている最中に斬撃を受けると、パリィで弾き返して大きくよろめかせる。
// 段: chase（追う）→ windup（振りかぶる）→ slash（斬る）→ recover（振り抜いたまま止まる）→ chase
export const STRIKER_HP = 60;
export const STRIKER_STRIDE = 1.35; // 1 歩で進む距離。走る速さで割った分が足の運びの速さになる（7.5 m/s で 1 秒に約 2.8 周）
export const STRIKER_RUN_SPEED = 7.5; // m/s。プレイヤーの歩き (8) よりわずかに遅い
export const STRIKER_ACCEL = 6; // 走る速さへ近づく速さ（残りの差に掛ける割合 /s）
export const STRIKER_TURN_RATE = 9; // 向き直るばねの速さ (rad/s)
export const STRIKER_TURN_MAX = 7; // 追っている間に向き直る最高の角速度 (rad/s)
export const STRIKER_FACE_NEAR = 5; // プレイヤーがこれより近ければ、走りながらもプレイヤーを向く
export const STRIKER_FACE_FAR = 9; // これより遠ければ、進む向きを向いて走る
export const STRIKER_TURN_WINDUP = 4; // 振りかぶっている間は、追う向きを鈍らせる（横へ回り込めば外せる）
export const STRIKER_STOP = 1.3; // プレイヤーにこれより近づかない
export const STRIKER_REACH = 2.8; // この距離まで詰めたら振りかぶる
export const STRIKER_WINDUP = 0.42; // 振りかぶってから斬り始めるまで（見てから避けられる長さ）
export const STRIKER_CREEP = 1.5; // 振りかぶっている間に、にじり寄る速さ
export const STRIKER_SLASH = 0.18; // 斬る長さ
export const STRIKER_HIT_AT = 0.07; // 斬り始めてからこの時刻に当たりを調べる
export const STRIKER_LUNGE = 9; // 斬りながら前へ踏み込む速さ (m/s)。終わりへ向けて緩める
export const STRIKER_RECOVER = 0.7; // 振り抜いたまま止まっている長さ
export const STRIKER_PARRY_STUN = 0.9; // パリィされたら、止まっている長さをこれだけ足す
export const STRIKER_HIT_RANGE = 3; // 当たる距離（体の中心どうし、水平）
export const STRIKER_HIT_ANGLE = 70 * DEG; // 体の正面からこの角度の内側にいれば当たる
export const STRIKER_HIT_LOW = -0.6; // プレイヤーの足もとが、敵の足もとからこの高さの間にいれば当たる
export const STRIKER_HIT_HIGH = 1.9;
export const STRIKER_DAMAGE = 22;
export const STRIKER_PUSH = 7; // 斬られたプレイヤーを押し飛ばす速さ (m/s)
export const STRIKER_REPATH = 0.15; // 行き先を選び直す間隔
export const STRIKER_DROP_BELOW = 0.6; // プレイヤーの足もとがこれより低ければ、飛び降りて追う
export const STRIKER_DROP_MAX = 9; // これより高い所からは飛び降りない
export const STRIKER_DROP_REACH = 0.45; // 縁のマスの中心にここまで寄ったら踏み切る
export const STRIKER_DROP_HOP = 3.5; // 踏み切るときに跳ね上がる速さ (m/s)
export const STRIKER_VAULT = 1.2; // 縁にあるこの高さまでの手すりは跳び越える
export const STRIKER_APART = 1.4; // ほかの敵とこれより近づいたら押し離す
export const STRIKER_APART_PUSH = 5; // 重なりかけたときに離れる速さ (m/s)

// ---- 道のり ----
// 床を 1m の格子に分け、敵が立てるマスを調べておく。プレイヤーのいるマスから歩いて何マスかを数えておき、
// 追うときは数が減っていく向きへ数マス先まで辿って、まっすぐ歩いて行ける一番先のマスへ向かう（棚の列を回り込める）。
// プレイヤーが棚の上などにいて床から届かないときは、その真下のまわりのマスへ向かう
const NAV_CELL = 1;
const NAV_LOOK = 10; // 何マス先まで辿るか
const NAV_SEED = [2.5, 6]; // プレイヤーのマスに立てないとき、この半径の内の立てるマスから数える（近い方から試す）
interface Nav {
  y: number; // 調べた床の高さ
  minX: number;
  minZ: number;
  nx: number;
  nz: number;
  open: Uint8Array; // 立てるマス
  dist: Int32Array; // プレイヤーまでのマスの数（-1 = 届かない）
  from: number; // 数えたときのプレイヤーのマス（-1 = まだ）
  fromY: number;
  drops: Map<number, THREE.Vector3>; // 縁のマスと、そこから飛び降りる先の足もと
}
// 床の高さごとに調べておく（棚の上・中二階・床は別の格子）。1 つ作るのに数十 ms かかるので、ステージに入るときにまとめて作る
const navs = new Map<number, Nav>();
let navLevels: number[] = []; // 調べておく床の高さ。飛び降りる先もこの高さの床に限る（荷の山の上などへは降りない）
// ステージを入れ替えたら、箱と動ける範囲を入れた後に呼ぶ
export function resetStrikerNav(levels: number[]) {
  navs.clear();
  navLevels = levels;
  for (const y of levels) navFor(y);
}
const DROP_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DROP_STEPS = [1.2, 1.8, 2.5]; // 縁のマスの中心から、降りる先を探す距離 (m)
function navFor(y: number): Nav {
  const had = navs.get(y);
  if (had) return had;
  const minX = playBounds.minX;
  const minZ = playBounds.minZ;
  const nx = Math.max(1, Math.floor((playBounds.maxX - minX) / NAV_CELL));
  const nz = Math.max(1, Math.floor((playBounds.maxZ - minZ) / NAV_CELL));
  const open = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) open[j * nx + i] = enemyCanStandAt(minX + (i + 0.5) * NAV_CELL, minZ + (j + 0.5) * NAV_CELL, y) ? 1 : 0;
  // 縁: 隣が立てないマスから、外へ少し出た所の床が低く、そこに立てて、縁の上に高い壁が無ければ飛び降りられる
  const drops = new Map<number, THREE.Vector3>();
  if (y > 0.5) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        if (!open[c]) continue;
        const cx = minX + (i + 0.5) * NAV_CELL;
        const cz = minZ + (j + 0.5) * NAV_CELL;
        let best: THREE.Vector3 | null = null;
        for (const [dx, dz] of DROP_DIRS) {
          const ni = i + dx;
          const nj = j + dz;
          if (ni >= 0 && nj >= 0 && ni < nx && nj < nz && open[nj * nx + ni]) continue; // 隣も同じ高さの床
          if (enemyBlockedAt(cx + dx * 0.6, cz + dz * 0.6, y + STRIKER_VAULT - 0.2)) continue; // 縁に高い壁
          for (const k of DROP_STEPS) {
            const x = cx + dx * k;
            const z = cz + dz * k;
            const f = floorAt(x, z, y + 0.05);
            if (f > y - STRIKER_DROP_BELOW || y - f > STRIKER_DROP_MAX || !navLevels.includes(f) || !enemyCanStandAt(x, z, f)) continue;
            if (!best || f < best.y) best = new THREE.Vector3(x, f, z);
            break;
          }
        }
        if (best) drops.set(c, best);
      }
    }
  }
  const n: Nav = { y, minX, minZ, nx, nz, open, dist: new Int32Array(nx * nz).fill(-1), from: -1, fromY: NaN, drops };
  navs.set(y, n);
  return n;
}
const navCell = (n: Nav, x: number, z: number) => {
  const i = Math.floor((x - n.minX) / NAV_CELL);
  const j = Math.floor((z - n.minZ) / NAV_CELL);
  return i < 0 || j < 0 || i >= n.nx || j >= n.nz ? -1 : j * n.nx + i;
};
const navQueue: number[] = [];
// プレイヤーのいるマスから数え直す（プレイヤーが別のマスへ移ったときだけ）
function countNav(n: Nav) {
  const from = navCell(n, position.x, position.z);
  if (from === n.from && position.y === n.fromY) return;
  n.from = from;
  n.fromY = position.y;
  n.dist.fill(-1);
  navQueue.length = 0;
  if (from >= 0 && n.open[from] && Math.abs(position.y - n.y) < 0.5) {
    n.dist[from] = 0;
    navQueue.push(from);
  } else {
    for (const r of NAV_SEED) {
      const cr = Math.ceil(r / NAV_CELL);
      const pi = Math.floor((position.x - n.minX) / NAV_CELL);
      const pj = Math.floor((position.z - n.minZ) / NAV_CELL);
      for (let j = pj - cr; j <= pj + cr; j++) {
        for (let i = pi - cr; i <= pi + cr; i++) {
          if (i < 0 || j < 0 || i >= n.nx || j >= n.nz) continue;
          const c = j * n.nx + i;
          if (!n.open[c] || Math.hypot(n.minX + (i + 0.5) * NAV_CELL - position.x, n.minZ + (j + 0.5) * NAV_CELL - position.z) > r) continue;
          n.dist[c] = 0;
          navQueue.push(c);
        }
      }
      if (navQueue.length > 0) break;
    }
  }
  for (let q = 0; q < navQueue.length; q++) {
    const c = navQueue[q];
    const i = c % n.nx;
    const d = n.dist[c] + 1;
    for (const nb of [i > 0 ? c - 1 : -1, i < n.nx - 1 ? c + 1 : -1, c - n.nx, c + n.nx]) {
      if (nb < 0 || nb >= n.open.length || !n.open[nb] || n.dist[nb] >= 0) continue;
      n.dist[nb] = d;
      navQueue.push(nb);
    }
  }
}
const navPath: number[] = [];
const navToPlayer = (n: Nav, c: number) =>
  Math.hypot(n.minX + ((c % n.nx) + 0.5) * NAV_CELL - position.x, n.minZ + (Math.floor(c / n.nx) + 0.5) * NAV_CELL - position.z);
// en の次の行き先を moveTo に入れる。行ける所が無ければ false
function pickChaseTarget(): boolean {
  en.dropCell = -1;
  if (position.y < en.baseY - STRIKER_DROP_BELOW) return pickDropTarget();
  const p = en.root.position;
  // 近くて、まっすぐ行ければそのままプレイヤーへ
  const dx = position.x - p.x;
  const dz = position.z - p.z;
  const d = Math.hypot(dx, dz);
  if (Math.abs(position.y - en.baseY) < 0.5 && d < 14) {
    const gx = position.x - (dx / d) * STRIKER_STOP;
    const gz = position.z - (dz / d) * STRIKER_STOP;
    if (enemyPathClear(gx, gz)) {
      en.moveTo.set(gx, en.baseY, gz);
      return true;
    }
  }
  const n = navFor(en.baseY);
  countNav(n);
  let c = navCell(n, p.x, p.z);
  // 今のマスの中心が柱に掛かっている（棚の支柱の脇に入り込んだ）ときは、まわりのまっすぐ行けるマスのうち一番近道のマスから辿る
  if (c >= 0 && n.dist[c] < 0) {
    const ci = c % n.nx;
    const cj = Math.floor(c / n.nx);
    let best = -1;
    for (let j = cj - 2; j <= cj + 2; j++) {
      for (let i = ci - 2; i <= ci + 2; i++) {
        const nb = j * n.nx + i;
        if (i < 0 || j < 0 || i >= n.nx || j >= n.nz || n.dist[nb] < 0 || (best >= 0 && n.dist[nb] >= n.dist[best])) continue;
        if (enemyPathClear(n.minX + (i + 0.5) * NAV_CELL, n.minZ + (j + 0.5) * NAV_CELL)) best = nb;
      }
    }
    if (best < 0) return false;
    c = best;
  }
  if (c < 0 || n.dist[c] < 0) return false;
  // 数が減っていく向きへ辿る（入り込んだ所から抜け出すときは、選んだマスも行き先の候補にする）
  navPath.length = 0;
  if (c !== navCell(n, p.x, p.z)) navPath.push(c);
  for (let s = 0; s < NAV_LOOK && n.dist[c] > 0; s++) {
    const i = c % n.nx;
    let next = -1;
    for (const nb of [i > 0 ? c - 1 : -1, i < n.nx - 1 ? c + 1 : -1, c - n.nx, c + n.nx]) {
      if (nb < 0 || nb >= n.dist.length || n.dist[nb] < 0 || n.dist[nb] >= n.dist[c]) continue;
      // 近道が並ぶときは、プレイヤーにまっすぐ近い方へ（乱数で選ぶとジグザグに走る）
      if (next < 0 || navToPlayer(n, nb) < navToPlayer(n, next)) next = nb;
    }
    if (next < 0) break;
    navPath.push((c = next));
  }
  // まっすぐ歩いて行ける一番先のマス。どこへも斜めに抜けられない（荷の角をかすめる）ときは、
  // 今のマスの中心へ寄ってから格子に沿って進む（入り込んだ所からは、選んだマスへ）
  for (let k = navPath.length - 1; k >= 0; k--) {
    const x = n.minX + ((navPath[k] % n.nx) + 0.5) * NAV_CELL;
    const z = n.minZ + (Math.floor(navPath[k] / n.nx) + 0.5) * NAV_CELL;
    if (enemyPathClear(x, z)) {
      en.moveTo.set(x, en.baseY, z);
      return true;
    }
  }
  const here = n.open[navCell(n, p.x, p.z)] ? navCell(n, p.x, p.z) : navPath[0];
  if (here === undefined) return false;
  en.moveTo.set(n.minX + ((here % n.nx) + 0.5) * NAV_CELL, en.baseY, n.minZ + (Math.floor(here / n.nx) + 0.5) * NAV_CELL);
  return true;
}

// ---- 飛び降りる ----
// プレイヤーが下にいるときは、今の床を歩いて行ける縁のうち、歩く道のりと降りた先からプレイヤーまでの距離の和が一番小さい縁を選んで走る。
// 縁に着いたら小さく跳ね上がって踏み切り、放物線を描いて下の床へ降りる（落ちる間は脚を縮め、着く前に伸ばす）
let dropPrev = new Int32Array(0); // 道のりを辿るための、1 つ手前のマス（-2 = まだ着いていない）
const dropQueue: number[] = [];
const dropPath: number[] = [];
function pickDropTarget(): boolean {
  const p = en.root.position;
  const n = navFor(en.baseY);
  if (n.drops.size === 0) return false;
  const start = navCell(n, p.x, p.z);
  if (start < 0 || !n.open[start]) return false;
  if (dropPrev.length !== n.open.length) dropPrev = new Int32Array(n.open.length);
  dropPrev.fill(-2);
  dropPrev[start] = -1;
  dropQueue.length = 0;
  dropQueue.push(start);
  const steps = new Map<number, number>([[start, 0]]);
  let best = -1;
  let bestCost = Infinity;
  for (let q = 0; q < dropQueue.length; q++) {
    const c = dropQueue[q];
    const d = steps.get(c)!;
    const to = n.drops.get(c);
    if (to) {
      // 降りた先がプレイヤーより高ければ、もう一度降りることになるので遠回りとして数える
      const cost = d * NAV_CELL + Math.hypot(to.x - position.x, to.z - position.z) + (to.y > position.y + STRIKER_DROP_BELOW ? 15 : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    const i = c % n.nx;
    for (const nb of [i > 0 ? c - 1 : -1, i < n.nx - 1 ? c + 1 : -1, c - n.nx, c + n.nx]) {
      if (nb < 0 || nb >= n.open.length || !n.open[nb] || dropPrev[nb] !== -2) continue;
      dropPrev[nb] = c;
      steps.set(nb, d + 1);
      dropQueue.push(nb);
    }
  }
  if (best < 0) return false;
  en.dropCell = best;
  en.dropTo.copy(n.drops.get(best)!);
  const center = (c: number, out: THREE.Vector3) => out.set(n.minX + ((c % n.nx) + 0.5) * NAV_CELL, en.baseY, n.minZ + (Math.floor(c / n.nx) + 0.5) * NAV_CELL);
  center(best, en.dropFrom);
  // 縁から戻りながら、まっすぐ歩いて行ける一番先のマスへ向かう
  dropPath.length = 0;
  for (let c = best; c >= 0; c = dropPrev[c]) dropPath.push(c);
  for (const c of dropPath) {
    center(c, en.moveTo);
    if (enemyPathClear(en.moveTo.x, en.moveTo.z)) return true;
  }
  center(start, en.moveTo);
  return true;
}
function startDrop() {
  const p = en.root.position;
  const h = en.baseY - en.dropTo.y;
  setPhase('drop');
  en.dropFrom.copy(p);
  en.dropT = 0;
  en.dropDur = (STRIKER_DROP_HOP + Math.sqrt(STRIKER_DROP_HOP ** 2 + 2 * GRAVITY * h)) / GRAVITY;
  en.dropCell = -1;
  en.vel.set(0, 0, 0);
  en.pelvisSpring.v.y -= 1.2; // 膝を沈めて踏み切る
}
function updateDrop(dt: number) {
  const p = en.root.position;
  en.dropT = Math.min(en.dropT + dt, en.dropDur);
  const u = en.dropT / en.dropDur;
  p.x = THREE.MathUtils.lerp(en.dropFrom.x, en.dropTo.x, u);
  p.z = THREE.MathUtils.lerp(en.dropFrom.z, en.dropTo.z, u);
  const y = en.dropFrom.y + STRIKER_DROP_HOP * en.dropT - 0.5 * GRAVITY * en.dropT ** 2;
  en.baseY = Math.max(en.dropTo.y, y);
  p.y = en.baseY + en.airY;
  // 跳んだらすぐ脚を縮め、着く少し前から伸ばして床を迎える
  en.airPose = Math.min(1, en.dropT / 0.12) * THREE.MathUtils.clamp((en.baseY - en.dropTo.y) / 1.2, 0, 1);
  if (u < 1) return;
  // 着地: 速さに応じて膝を深く沈め、上体を前へ倒し込む
  const impact = GRAVITY * en.dropDur - STRIKER_DROP_HOP;
  en.baseY = en.dropTo.y;
  p.y = en.baseY + en.airY;
  en.pelvisSpring.v.y -= Math.min(3, impact * 0.18);
  addImpulse(en.leanSpring, LEG_FWD_X, Math.min(2, impact * 0.12));
  spawnSparks(sparkAt.set(p.x, en.baseY + 0.05, p.z), UP, 6, 0.6, 0.5);
  const s = soundAt(Math.hypot(position.x - p.x, position.z - p.z));
  sfx.playStrikerLand(impact, s.volume, s.pan);
  setPhase('chase');
  en.waitT = 0;
}

// ---- 姿勢 ----
// 腕と上体の姿勢を数の並びで持ち、段ごとの狙う姿勢へ追いかける（斬る間は速く、戻るときはゆっくり）。
// 並び: 右腕（刃）の前後・開き・肘、左腕の前後・開き・肘、上体のひねり・前傾、腰を落とす量。
// 腕の前後は負で前へ上がり、開きは負で右（-X）へ開く。ひねりは負で右肩を引く
const STRIKER_POSES = {
  // 刃を後ろ下へ引いて、低く前傾して構える（デザイン案の構え）
  ready: [0.55, -0.3, -0.2, -0.9, -0.1, -1.1, -0.3, 0.3, 0.12],
  // 刃を右肩の上へ高く振りかぶり、右肩を引いて体をねじる。左腕は前へ出して間合いを測る
  windup: [-2.7, -0.45, -1.3, -1.2, 0.25, -0.7, -0.75, 0.12, 0.2],
  // 右上から左下へ振り抜いた所。体は左へねじり切って深く沈む
  slash: [-0.9, 1.0, -0.1, 0.5, 0.35, -1.4, 0.65, 0.5, 0.28],
  // 飛び降りている間: 刃を後ろへ大きく引き、左腕を前へ出して釣り合いを取る
  leap: [0.9, -0.5, -0.4, -1.4, 0.5, -0.6, -0.2, 0.25, 0],
} as const;
export const strikerRestPose = () => [...STRIKER_POSES.ready];
const STRIKER_RUN_SWING = 0.3; // 走るときに左腕を振る角度
const STRIKER_RUN_RISE = 0.6; // 走っている間は、構えで落とした腰をこの割合だけ戻す
const poseQ = new THREE.Quaternion();
const poseE = new THREE.Euler();
// applyDummyPose（よろめきと足取り）の後に呼んで、腕と上体を上書きする
// 姿勢は 1 つずつのばねで追いかけ、動き出しと止まり際をなめらかにする。w は速さ (rad/s)、z は減衰（1 で行き過ぎない）。
// 斬るときだけ減衰を弱めて、振り抜いた先でわずかに行き過ぎて戻る
const POSE_SPRING = {
  ready: { w: 9, z: 1 },
  windup: { w: 11, z: 1 },
  slash: { w: 26, z: 0.7 },
  settle: { w: 6, z: 1 }, // 振り抜いた形から構えへ戻る
};
const POSE_SUBSTEP = 1 / 240;
export function poseStriker(dt: number) {
  const t = en.strikeT;
  let want: readonly number[] = STRIKER_POSES.ready;
  let s = POSE_SPRING.ready;
  if (en.strikePhase === 'windup') {
    want = STRIKER_POSES.windup;
    s = POSE_SPRING.windup;
  } else if (en.strikePhase === 'drop') {
    want = STRIKER_POSES.leap;
    s = POSE_SPRING.windup;
  } else if (en.strikePhase === 'slash' || (en.strikePhase === 'recover' && t < STRIKER_RECOVER * 0.4)) {
    want = STRIKER_POSES.slash; // 振り抜いた後も、その形をしばらく残す
    s = POSE_SPRING.slash;
  } else if (en.strikePhase === 'recover') {
    s = POSE_SPRING.settle;
  }
  const p = en.strikePose;
  const v = en.strikePoseVel;
  const n = Math.max(1, Math.ceil(dt / POSE_SUBSTEP));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < p.length; i++) {
      v[i] += (s.w * s.w * (want[i] - p[i]) - 2 * s.z * s.w * v[i]) * h;
      p[i] += v[i] * h;
    }
  }
  // 両腕は肩の線ごと上体に付いていく（銃撃役のように狙いへ向けて打ち消さない）。よろめきの跳ね上がりだけ足す
  en.gunRig.rotation.set(en.gunSpring.x.x, 0, 0);
  const swing = en.strikePhase === 'chase' ? Math.sin(en.walkPhase) * STRIKER_RUN_SWING * en.walk : 0;
  en.arms[0].rotation.set(p[0] - swing * 0.2, 0, p[1]);
  en.forearms[0].rotation.set(p[2], 0, 0);
  en.arms[1].rotation.set(p[3] + swing, 0, p[4]);
  en.forearms[1].rotation.set(p[5], 0, 0);
  // 上体のひねりと前傾を背骨に足し、首はその大半を戻して頭をプレイヤーへ向けたままにする
  en.spine.quaternion.multiply(poseQ.setFromEuler(poseE.set(p[7], p[6], 0)));
  en.neck.quaternion.multiply(poseQ.setFromEuler(poseE.set(-p[7] * 0.7, -p[6] * 0.8, 0)));
  en.pelvis.position.y -= p[8] * (1 - STRIKER_RUN_RISE * en.walk); // 走っている間は腰を上げて、脚を伸ばして走る
  solveDummyLegs();
  // 刃の縁: ふだんはかすかに、振りかぶると明滅しながら強く光り、斬り終えると消えていく
  if (en.edgeMat) {
    let glow = 0.15;
    if (en.strikePhase === 'windup') glow = 0.4 + 0.6 * Math.min(1, t / 0.15) * (0.75 + 0.25 * Math.sin(t * 60));
    else if (en.strikePhase === 'slash') glow = 1;
    else if (en.strikePhase === 'recover') glow = 0.15 + 0.85 * Math.max(0, 1 - t / 0.25);
    en.edgeMat.emissiveIntensity = glow;
  }
}

// ---- 向き ----
// 追っている間は素早くプレイヤーへ向き直る。振りかぶっている間は鈍くなり、斬っている間は向きを変えない
// 向きは角速度を持たせて回し、急に向きが切り替わらないようにする。遠くから走ってくる間は、プレイヤーではなく進む向きへ体を向ける
export function updateStrikerFace(dt: number) {
  const max = en.strikePhase === 'chase' || en.strikePhase === 'drop' ? STRIKER_TURN_MAX : en.strikePhase === 'windup' ? STRIKER_TURN_WINDUP : en.strikePhase === 'recover' ? 1.5 : 0;
  const dx = position.x - en.root.position.x;
  const dz = position.z - en.root.position.z;
  let want = Math.atan2(dx, dz);
  const speed = Math.hypot(en.vel.x, en.vel.z);
  if (en.strikePhase === 'chase' && speed > 1) {
    const run = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), STRIKER_FACE_NEAR, STRIKER_FACE_FAR) * THREE.MathUtils.smoothstep(speed, 1, 4);
    want += wrapAngle(Math.atan2(en.vel.x, en.vel.z) - want) * run;
  }
  const w = STRIKER_TURN_RATE;
  en.turnVel += (w * w * wrapAngle(want - en.yaw) - 2 * w * en.turnVel) * Math.min(dt, 0.05);
  en.turnVel = THREE.MathUtils.clamp(en.turnVel, -max, max);
  en.yaw = wrapAngle(en.yaw + en.turnVel * dt);
  en.root.quaternion.setFromAxisAngle(UP, en.yaw);
  en.aimYaw = en.aimPitch = 0;
}

// ---- 動き ----
const want = new THREE.Vector3();
const sepTmp = new THREE.Vector3();
const chest = new THREE.Vector3();
const toPlayer = new THREE.Vector3();
function setPhase(phase: StrikePhase, t = 0) {
  en.strikePhase = phase;
  en.strikeT = t;
  en.strikeHit = false;
}
// 出てくるとき（起き上がるとき）に呼ぶ
export function resetStriker() {
  setPhase('chase');
  en.dropCell = -1;
  en.strikePose = strikerRestPose();
  en.strikePoseVel.fill(0);
  en.turnVel = 0;
  en.waitT = 0;
  if (en.edgeMat) en.edgeMat.emissiveIntensity = 0.15;
}
// 振りかぶってよいか: 届く距離と高さにいて、間に壁が無い
function canStrike(dist: number): boolean {
  const dy = position.y - en.baseY;
  if (dist > STRIKER_REACH || dy < STRIKER_HIT_LOW || dy > STRIKER_HIT_HIGH) return false;
  chest.set(en.root.position.x, en.baseY + 1.3, en.root.position.z);
  toPlayer.set(position.x, position.y + player.eyeHeight - 0.35, position.z).sub(chest);
  const d = toPlayer.length();
  return castWorld(chest, toPlayer.divideScalar(d), d) >= d;
}
// 敵のいる向きの左右と距離から、音の左右と大きさを決める
const panTmp = new THREE.Vector3();
function soundAt(dist: number) {
  camera.updateMatrixWorld();
  panTmp.copy(en.root.position).applyMatrix4(camera.matrixWorldInverse);
  const pan = THREE.MathUtils.clamp(panTmp.x / Math.max(Math.hypot(panTmp.x, panTmp.z), 1e-3), -1, 1) * 0.8;
  return { volume: THREE.MathUtils.clamp(3 / Math.max(dist, 1), 0.3, 1), pan };
}

export function updateStrikerMove(dt: number) {
  if (!en.mobile) return;
  const p = en.root.position;
  const dist = Math.hypot(position.x - p.x, position.z - p.z);
  const halted = en.riseTime < RESPAWN_RISE_TIME || en.flashT < ENEMY_HIT_RECOVER || env.isHeld() || env.playerHp() <= 0 || en.airY > 0
    || en.knockVel.lengthSq() > ENEMY_KNOCK_STOP ** 2;
  en.strikeT += dt;
  // 飛び降りている間は、当てられても止まらずに降りきる
  if (en.strikePhase === 'drop') {
    updateDrop(dt);
    return;
  }
  want.set(0, 0, 0);
  let accel = STRIKER_ACCEL;
  if (halted) {
    // 当てられたら構えが崩れる。斬り始めていても、当たる前なら止める
    if (en.strikePhase === 'windup' || (en.strikePhase === 'slash' && !en.strikeHit)) setPhase('chase');
  } else if (en.strikePhase === 'chase') {
    if (en.dropCell >= 0 && Math.hypot(en.dropFrom.x - p.x, en.dropFrom.z - p.z) < STRIKER_DROP_REACH) {
      startDrop();
      return;
    }
    if (canStrike(dist)) {
      setPhase('windup');
      const s = soundAt(dist);
      sfx.playStrikerWindup(s.volume, s.pan);
    } else {
      en.waitT -= dt;
      if (en.waitT <= 0 || Math.hypot(en.moveTo.x - p.x, en.moveTo.z - p.z) < 0.3) {
        en.waitT = STRIKER_REPATH;
        en.moving = pickChaseTarget();
      }
      if (en.moving) {
        const dx = en.moveTo.x - p.x;
        const dz = en.moveTo.z - p.z;
        const d = Math.hypot(dx, dz);
        // 緩めるのはプレイヤーの前で止まるときだけ（曲がり角の行き先ごとに緩めると、走りが途切れる）
        const last = Math.hypot(en.moveTo.x - position.x, en.moveTo.z - position.z) < STRIKER_STOP + 0.5;
        if (d > 0.05 && dist > STRIKER_STOP) want.set(dx / d, 0, dz / d).multiplyScalar(Math.min(STRIKER_RUN_SPEED * en.speedMul, last ? d * 4 + 1 : Infinity));
      }
    }
  } else if (en.strikePhase === 'windup') {
    if (dist > STRIKER_STOP + 0.3) want.set(Math.sin(en.yaw), 0, Math.cos(en.yaw)).multiplyScalar(STRIKER_CREEP);
    accel = 10;
    if (en.strikeT >= STRIKER_WINDUP) {
      setPhase('slash');
      sfx.playStrikerSlash(soundAt(dist).volume);
    }
  } else if (en.strikePhase === 'slash') {
    const u = en.strikeT / STRIKER_SLASH;
    if (dist > 0.9) want.set(Math.sin(en.yaw), 0, Math.cos(en.yaw)).multiplyScalar(STRIKER_LUNGE * Math.max(0, 1 - u));
    accel = 30;
    if (!en.strikeHit && en.strikeT >= STRIKER_HIT_AT) {
      en.strikeHit = true;
      strikePlayer();
    }
    if (en.strikePhase === 'slash' && en.strikeT >= STRIKER_SLASH) setPhase('recover');
  } else if (en.strikeT >= STRIKER_RECOVER) {
    setPhase('chase');
    en.waitT = 0;
  }
  // ほかの敵と重ならないよう、近いほど強く押し離す（囲むときは横へ散る）
  if (!halted && en.strikePhase !== 'slash') {
    for (const e of enemies) {
      if (e === en || !e.alive) continue;
      const ox = p.x - e.root.position.x;
      const oz = p.z - e.root.position.z;
      const d = Math.hypot(ox, oz);
      if (d < STRIKER_APART && d > 1e-3) want.addScaledVector(sepTmp.set(ox / d, 0, oz / d), STRIKER_APART_PUSH * (1 - d / STRIKER_APART));
    }
  }
  en.vel.lerp(want, 1 - Math.exp(-accel * dt));
  const nx = p.x + en.vel.x * dt;
  const nz = p.z + en.vel.z * dt;
  // 柱の角などに当たったら、壁に沿って片方の向きだけでも進む
  if (enemyCanStand(nx, nz)) {
    p.x = nx;
    p.z = nz;
  } else if (enemyCanStand(nx, p.z)) {
    p.x = nx;
    en.vel.z = 0;
  } else if (enemyCanStand(p.x, nz)) {
    p.z = nz;
    en.vel.x = 0;
  } else {
    en.vel.set(0, 0, 0);
    en.waitT = 0; // 行き先を選び直す
  }
}

// ---- 斬撃が当たる ----
// 体の正面の扇の内にプレイヤーがいれば斬られる。刀やクナイを振っている最中で、こちらを向いていればパリィになる
const look = new THREE.Vector3();
const sparkAt = new THREE.Vector3();
function strikePlayer() {
  const p = en.root.position;
  const dx = position.x - p.x;
  const dz = position.z - p.z;
  const dist = Math.hypot(dx, dz);
  const dy = position.y - en.baseY;
  const rel = Math.abs(wrapAngle(Math.atan2(dx, dz) - en.yaw));
  if (game.playerHp <= 0 || dist > STRIKER_HIT_RANGE || rel > STRIKER_HIT_ANGLE || dy < STRIKER_HIT_LOW || dy > STRIKER_HIT_HIGH) return;
  if (!canStrike(0)) return; // 間に壁がある
  camera.getWorldDirection(look);
  toPlayer.set(-dx, 0, -dz).normalize(); // プレイヤーから敵への向き
  const facing = Math.acos(THREE.MathUtils.clamp((look.x * toPlayer.x + look.z * toPlayer.z) / Math.max(Math.hypot(look.x, look.z), 1e-3), -1, 1));
  if (parryActive() && facing < PARRY_ANGLE) {
    parryStrike(dist);
    return;
  }
  hooks.damagePlayer(STRIKER_DAMAGE);
  en.hitPlayer = true;
  sfx.playStrikerCut();
  sfx.playHurt();
  hooks.addTrauma(0.5);
  // 刃は敵の右上から左下へ抜ける。こちらから見ると左上から右下へ、視点ごとなぎ払われる
  kickVel.x += 2.5 * DEG * 22;
  kickVel.z -= 4 * DEG * 22;
  velocity.x += (dx / Math.max(dist, 1e-3)) * STRIKER_PUSH;
  velocity.z += (dz / Math.max(dist, 1e-3)) * STRIKER_PUSH;
}

// パリィ: 刃と刃がぶつかって一瞬止まり、敵は押し返されて大きくよろめき、長く無防備になる
function parryStrike(dist: number) {
  const p = en.root.position;
  sparkAt.set(position.x, position.y + player.eyeHeight - 0.3, position.z).lerp(chest.set(p.x, en.baseY + 1.4, p.z), 0.4);
  game.hitStop = Math.max(game.hitStop, PARRY_HIT_STOP);
  game.hitStopTotal = game.hitStop;
  game.hitStopShakesDummy = false;
  parryState.parryFxAge = 0;
  spawnSparks(sparkAt, look.copy(toPlayer).negate().setY(0.4).normalize(), 16, 0.9, 0.8);
  sfx.playParry(PARRY_HIT_STOP);
  hooks.addTrauma(0.2);
  kickVel.x += 0.8 * DEG * 22;
  hitDir.set(p.x - position.x, 0, p.z - position.z).normalize();
  staggerDummy(DEFAULT_KNOCK * 1.8, sparkAt);
  knockEnemy(hitDir, DEFAULT_KNOCK * 1.4 * Math.max(0.6, 1 - dist / STRIKER_HIT_RANGE));
  setPhase('recover', -STRIKER_PARRY_STUN);
  en.strikeHit = true;
  en.parried = true; // とどめの加点に PARRY を付ける
}

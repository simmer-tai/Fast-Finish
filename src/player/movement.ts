import * as THREE from 'three';
import {
  MANTLE_FACING, MANTLE_KEEP, MANTLE_REACH, MANTLE_TIME_BASE, MANTLE_TIME_PER_METER, PLAYER_RADIUS, WALLRUN_MAX_TIME,
  WALLRUN_MIN_HEIGHT, WALLRUN_MIN_SPEED, WALLRUN_START_LIFT,
} from './config.js';
import {
  forward, lastWallNormal, mantleDir, mantleFrom, mantlePrev, mantleTo, player, position, velocity, wallNormal,
  wallProbe, wallTangent, wish,
} from './state.js';
import { keys, padMove } from '../input.js';
import { easeInOutCubic, easeOutCubic } from '../ease.js';
import { blocks, rampTop, type Block, type Ramp } from '../world/blocks.js';

// ---- プレイヤーの移動・当たり判定・よじ登り・壁走り ----

// よじ登りと壁走りの始まり・終わりに、本体のカメラ演出や音を鳴らす
export interface MovementHooks {
  onMantleStart(): void;
  onMantleEnd(): void;
  onWallRunStart(): void;
}
let hooks: MovementHooks;
export function initMovement(h: MovementHooks) {
  hooks = h;
}

export function moveToward(current: number, target: number, maxDelta: number) {
  return Math.abs(target - current) <= maxDelta ? target : current + Math.sign(target - current) * maxDelta;
}

// 水平速度の向きを dir へ最大 maxAngle だけ回す（速さは変えない）
export function rotateHorizontalToward(dir: THREE.Vector3, maxAngle: number) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 1e-6) return;
  const cur = Math.atan2(velocity.z, velocity.x);
  const diff = Math.atan2(Math.sin(Math.atan2(dir.z, dir.x) - cur), Math.cos(Math.atan2(dir.z, dir.x) - cur));
  const ang = cur + THREE.MathUtils.clamp(diff, -maxAngle, maxAngle);
  velocity.x = Math.cos(ang) * speed;
  velocity.z = Math.sin(ang) * speed;
}

// 入力方向 dir（正規化済み）へ水平速度を近づける。
// 進行方向から大きく外れていなければ「向きを曲げる」ので、曲がっても勢いが落ちない。
// 真逆へ切り返したときだけ、ベクトルごと近づけて減速させる。
export function steerHorizontal(dir: THREE.Vector3, maxSpeed: number, accel: number, turnRate: number, overspeedDecay: number, dt: number) {
  const speed = Math.hypot(velocity.x, velocity.z);
  const targetSpeed = speed > maxSpeed ? Math.max(maxSpeed, speed - overspeedDecay * dt) : maxSpeed;
  const dot = speed > 0 ? (velocity.x * dir.x + velocity.z * dir.z) / speed : -1;
  if (speed < 1 || dot < -0.5) {
    const dx = dir.x * targetSpeed - velocity.x;
    const dz = dir.z * targetSpeed - velocity.z;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      const k = Math.min(1, (accel * dt) / len);
      velocity.x += dx * k;
      velocity.z += dz * k;
    }
    return;
  }
  rotateHorizontalToward(dir, turnRate * dt);
  const newSpeed = moveToward(speed, targetSpeed, accel * dt);
  velocity.x *= newSpeed / speed;
  velocity.z *= newSpeed / speed;
}

export function setHorizontalSpeed(s: number) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 1e-6) return;
  velocity.x *= s / speed;
  velocity.z *= s / speed;
}

// 円柱との当たり判定: 上から落ちてきたら上面に乗り、横からなら押し出す
export function collideCylinder(cx: number, cz: number, r: number, h: number, prevY: number) {
  const dx = position.x - cx;
  const dz = position.z - cz;
  const dist = Math.hypot(dx, dz);
  if (prevY >= h - 1e-4 && position.y < h && velocity.y <= 0 && dist < r + PLAYER_RADIUS * 0.5) {
    player.landImpact = Math.max(player.landImpact, -velocity.y);
    position.y = h;
    velocity.y = 0;
    player.onGround = true;
    return;
  }
  if (position.y >= h) return;
  const minDist = r + PLAYER_RADIUS;
  if (dist >= minDist || dist < 1e-6) return;
  const nx = dx / dist;
  const nz = dz / dist;
  position.x = cx + nx * minDist;
  position.z = cz + nz * minDist;
  // 壁へ向かう成分だけ消して、沿う方向の勢いは残す
  const vn = velocity.x * nx + velocity.z * nz;
  if (vn < 0) {
    velocity.x -= nx * vn;
    velocity.z -= nz * vn;
  }
}

// 箱との当たり判定: 上から落ちてきたら上面に乗り、横からなら一番近い面から押し出す
// プレイヤーの頭の高さ（足もとから）。浮いた箱の下をくぐれるかどうかに使う。
// スライディング中と、低い箱の下に入っている間（車の下でスライディングが止まったときなど）は低い方を使う
export const PLAYER_HEAD = 1.8;
export const PLAYER_HEAD_LOW = 0.7;
const headNow = () => (player.sliding || player.underCover ? PLAYER_HEAD_LOW : PLAYER_HEAD);
export function collideBox(b: Block, prevY: number) {
  const px = THREE.MathUtils.clamp(position.x, b.minX, b.maxX);
  const pz = THREE.MathUtils.clamp(position.z, b.minZ, b.maxZ);
  const dx = position.x - px;
  const dz = position.z - pz;
  const dist = Math.hypot(dx, dz);
  if (prevY >= b.h - 1e-4 && position.y < b.h && velocity.y <= 0 && dist < PLAYER_RADIUS * 0.5) {
    player.landImpact = Math.max(player.landImpact, -velocity.y);
    position.y = b.h;
    velocity.y = 0;
    player.onGround = true;
    return;
  }
  // 浮いた箱の下から頭をぶつけたら、底面で止める
  const y0 = b.y0 ?? 0;
  const head = headNow();
  if (y0 > 0 && prevY + head <= y0 + 1e-4 && position.y + head > y0 && dist < PLAYER_RADIUS * 0.5) {
    position.y = y0 - head;
    if (velocity.y > 0) velocity.y = 0;
    return;
  }
  if (position.y >= b.h || position.y + head <= y0 || dist >= PLAYER_RADIUS) return;
  // 坂に立っているときは、坂の上の端につながる床の縁（坂の傾きの分だけのわずかな段）を上る
  if (player.groundRamp && b.h - position.y <= RAMP_LIP) {
    position.y = b.h;
    velocity.y = 0;
    player.onGround = true;
    return;
  }
  pushOutOfBox(b, px, pz, dx, dz, dist);
}

// 箱の側面から外へ押し出す（(px, pz) は箱の上でいちばん近い点、(dx, dz) はそこからの差、dist はその長さ）
export function pushOutOfBox(b: Block, px: number, pz: number, dx: number, dz: number, dist: number) {
  let nx: number;
  let nz: number;
  if (dist > 1e-6) {
    nx = dx / dist;
    nz = dz / dist;
    position.x = px + nx * PLAYER_RADIUS;
    position.z = pz + nz * PLAYER_RADIUS;
  } else {
    // 中心が箱の中に入ってしまったら、一番浅い面の外へ出す
    const pen = [position.x - b.minX, b.maxX - position.x, position.z - b.minZ, b.maxZ - position.z];
    const k = pen.indexOf(Math.min(...pen));
    nx = k === 0 ? -1 : k === 1 ? 1 : 0;
    nz = k === 2 ? -1 : k === 3 ? 1 : 0;
    if (nx !== 0) position.x = (nx < 0 ? b.minX : b.maxX) + nx * PLAYER_RADIUS;
    else position.z = (nz < 0 ? b.minZ : b.maxZ) + nz * PLAYER_RADIUS;
  }
  // 壁へ向かう成分だけ消して、沿う方向の勢いは残す
  const vn = velocity.x * nx + velocity.z * nz;
  if (vn < 0) {
    velocity.x -= nx * vn;
    velocity.z -= nz * vn;
  }
}

// 坂との当たり判定: 上面の近くにいれば上面に立たせ（上り坂ではめり込んだ分を押し上げ、下り坂では浮いた分を吸い付ける）、
// 上面より十分低い所から横に触れたら、箱の側面と同じように押し出す。立ったら groundRamp に入れる
export const RAMP_STEP = 0.6; // 上面からこれだけ下にめり込んでいても、上面へ押し上げる（上り坂を速く走るとき）
export const RAMP_SNAP = 0.6; // 坂に立っていたら、上面からこれだけ浮いても上面へ吸い付ける（下り坂を速く走るとき）
export const RAMP_LIP = 0.3; // 坂に立っているときに上る段の高さ（坂の上の端と、つながる床の縁との差）
export const RAMP_SLIDE_GRAVITY = 40; // スライディング中に坂を下る向きへ掛かる加速度 = これ × 勾配
export function collideRamp(r: Ramp, prevY: number, stick: boolean) {
  const px = THREE.MathUtils.clamp(position.x, r.minX, r.maxX);
  const pz = THREE.MathUtils.clamp(position.z, r.minZ, r.maxZ);
  const dx = position.x - px;
  const dz = position.z - pz;
  const dist = Math.hypot(dx, dz);
  if (dist >= PLAYER_RADIUS) return;
  const top = rampTop(r, px, pz);
  if (
    dist < PLAYER_RADIUS * 0.5 && velocity.y <= 0 && position.y <= top + (stick ? RAMP_SNAP : 1e-4)
    && (position.y >= top - RAMP_STEP || prevY >= top - 1e-4)
  ) {
    if (position.y < top) player.landImpact = Math.max(player.landImpact, -velocity.y);
    position.y = top;
    velocity.y = 0;
    player.onGround = true;
    player.groundRamp = r;
    return;
  }
  const head = headNow();
  if (position.y >= top - RAMP_STEP || position.y + head <= r.y0) return;
  pushOutOfBox(r, px, pz, dx, dz, dist);
}

// 壁の方を向いて W を押しているか（nx, nz は体から壁へ向かう水平の向き）
export function facingLedge(nx: number, nz: number): boolean {
  return (keys.has('KeyW') || padMove.y > 0.5) && forward.x * nx + forward.z * nz >= MANTLE_FACING;
}

// 空中で箱の側面に触れ、そちらを向いて W を押していて、上面に手が届くならよじ登り始める
// 足もとの高さ y で (x, z) に立ったとき、頭の上が浮いた箱でふさがっていないか（柱の上面が屋根の底に接しているときなど）
export function hasHeadroom(x: number, z: number, y: number): boolean {
  for (const b of blocks) {
    const y0 = b.y0 ?? 0;
    if (y0 <= 0 || y0 >= y + PLAYER_HEAD || b.h <= y) continue;
    if (x > b.minX - PLAYER_RADIUS && x < b.maxX + PLAYER_RADIUS && z > b.minZ - PLAYER_RADIUS && z < b.maxZ + PLAYER_RADIUS) return false;
  }
  return true;
}

// 足もとの高さ y で (x, z) にいるとき、立った頭の高さより低い浮いた箱の下に入っているか。
// 箱の側面に押し当てられているだけ（体の円がちょうど接している）のときは入っていないとみなす
export function underLowBox(x: number, z: number, y: number): boolean {
  for (const b of blocks) {
    const y0 = b.y0 ?? 0;
    if (y0 <= y || y0 >= y + PLAYER_HEAD || b.h <= y) continue;
    const dx = x - THREE.MathUtils.clamp(x, b.minX, b.maxX);
    const dz = z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
    if (Math.hypot(dx, dz) < PLAYER_RADIUS - 1e-3) return true;
  }
  return false;
}

export function tryMantleBox(b: Block, speedBefore: number): boolean {
  const px = THREE.MathUtils.clamp(position.x, b.minX, b.maxX);
  const pz = THREE.MathUtils.clamp(position.z, b.minZ, b.maxZ);
  const dx = px - position.x;
  const dz = pz - position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > PLAYER_RADIUS + 0.05 || dist < 1e-6) return false;
  const climb = b.h - position.y;
  if (climb <= 0 || climb > MANTLE_REACH) return false;
  const nx = dx / dist;
  const nz = dz / dist;
  if (!facingLedge(nx, nz)) return false;

  // 縁から少し内側へ乗る。乗る所の上が別の箱（屋根など）でふさがっていれば登らない
  mantleTo.set(
    THREE.MathUtils.clamp(px + nx * PLAYER_RADIUS, b.minX, b.maxX),
    b.h,
    THREE.MathUtils.clamp(pz + nz * PLAYER_RADIUS, b.minZ, b.maxZ),
  );
  if (!hasHeadroom(mantleTo.x, mantleTo.z, b.h)) return false;
  mantleFrom.copy(position);
  startMantle(nx, nz, climb, speedBefore);
  return true;
}

export function startMantle(nx: number, nz: number, climb: number, speedBefore: number) {
  mantleDir.set(nx, 0, nz);
  player.mantleExitSpeed = speedBefore * MANTLE_KEEP;
  player.mantleDuration = MANTLE_TIME_BASE + climb * MANTLE_TIME_PER_METER;
  player.mantleTime = 0;
  player.dashTime = 0;
  player.sliding = false;
  player.wallRunning = false;
  player.onGround = false;
  hooks.onMantleStart();
}

export function updateMantle(dt: number) {
  player.mantleTime += dt;
  const u = Math.min(1, player.mantleTime / player.mantleDuration);
  // 先に体を引き上げ、縁を越えたあたりから前へ乗り出す
  const up = easeOutCubic(Math.min(1, u / 0.7));
  const fwd = easeInOutCubic(THREE.MathUtils.clamp((u - 0.4) / 0.6, 0, 1));
  mantlePrev.copy(position);
  position.set(
    mantleFrom.x + (mantleTo.x - mantleFrom.x) * fwd,
    mantleFrom.y + (mantleTo.y - mantleFrom.y) * up,
    mantleFrom.z + (mantleTo.z - mantleFrom.z) * fwd,
  );
  if (u >= 1) {
    player.mantleTime = -1;
    velocity.set(mantleDir.x * player.mantleExitSpeed, 0, mantleDir.z * player.mantleExitSpeed);
    player.onGround = true;
    hooks.onMantleEnd();
  } else {
    // 視野や揺れの演出が実際の動きに合うよう、移動量から速度を出しておく
    velocity.subVectors(position, mantlePrev).divideScalar(dt);
  }
}

// 体の横に触れている箱の側面を探し、その外向きの法線を out に入れる。
// 上端が足元から minAbove 以上高い壁だけを見る
export function findWall(minAbove: number, out: THREE.Vector3): boolean {
  for (const b of blocks) {
    if (b.h - position.y < minAbove) continue;
    if ((b.y0 ?? 0) > position.y + 1) continue; // 底面が胸より高い浮いた箱は壁にしない
    const dx = position.x - THREE.MathUtils.clamp(position.x, b.minX, b.maxX);
    const dz = position.z - THREE.MathUtils.clamp(position.z, b.minZ, b.maxZ);
    if ((dx === 0 && dz === 0) || Math.hypot(dx, dz) > PLAYER_RADIUS + 0.05) continue;
    // 角に触れているときは近い方の面とみなす
    if (Math.abs(dx) >= Math.abs(dz)) out.set(Math.sign(dx), 0, 0);
    else out.set(0, 0, Math.sign(dz));
    return true;
  }
  return false;
}

// 空中で壁に沿って十分な速さで動き、前へ入力していれば壁走りを始める
export function tryStartWallRun(): boolean {
  if (!findWall(WALLRUN_MIN_HEIGHT, wallProbe)) return false;
  if (player.hasLastWall && wallProbe.dot(lastWallNormal) > 0.7) return false;
  const vn = velocity.x * wallProbe.x + velocity.z * wallProbe.z;
  const tx = velocity.x - wallProbe.x * vn;
  const tz = velocity.z - wallProbe.z * vn;
  const along = Math.hypot(tx, tz);
  if (along < WALLRUN_MIN_SPEED) return false;
  wallTangent.set(tx / along, 0, tz / along);
  if (wish.dot(wallTangent) < 0.3 || wish.dot(wallProbe) > 0.5) return false;

  player.wallRunning = true;
  player.wallRunTime = 0;
  wallNormal.copy(wallProbe);
  velocity.x = wallTangent.x * along;
  velocity.z = wallTangent.z * along;
  velocity.y = THREE.MathUtils.clamp(velocity.y, 0, WALLRUN_START_LIFT);
  hooks.onWallRunStart();
  return true;
}

// 同じ壁に触れたまま、前へ入力して勢いが残っている間だけ走り続ける
export function canKeepWallRun(): boolean {
  if (player.onGround || player.wallRunTime > WALLRUN_MAX_TIME) return false;
  if (wish.dot(wallTangent) <= 0 || wish.dot(wallNormal) > 0.5) return false;
  if (Math.hypot(velocity.x, velocity.z) < WALLRUN_MIN_SPEED * 0.5) return false; // 前の壁にぶつかった等
  return findWall(0.3, wallProbe) && wallProbe.dot(wallNormal) > 0.9;
}

export function endWallRun() {
  player.wallRunning = false;
  lastWallNormal.copy(wallNormal);
  player.hasLastWall = true;
}

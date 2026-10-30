import * as THREE from 'three';
import { enemies, type Enemy } from '../enemy/state.js';
import { raycastBoss, type BossPart } from '../enemy/boss.js';
import { blocks, rampUpDir, ramps, type Block, type Ramp } from './blocks.js';

// ---- 光線の当たり判定 ----
// 投げた武器や照準の先が、壁・床・敵のどこに当たるか
export const throwRaycaster = new THREE.Raycaster();
// 当たり判定: 地面と柱は計算で直接求め（柱 1000 本をメッシュの交差判定に回すと重い）、敵だけメッシュで調べる
// normal は壁・床に当たったときの面の外向き（敵に当たったときは使わない）。boss はボスの機体に当たったときの部位
export const castHit = { point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), enemy: null as Enemy | null, part: null as THREE.Object3D | null, boss: null as BossPart | null };
let rayExit = 0; // rayBox で、光線が箱から出る距離
export function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: Block, far: number) {
  let tmin = 0;
  let tmax = far;
  const ix = 1 / d.x;
  const iy = 1 / d.y;
  const iz = 1 / d.z;
  let t1 = (b.minX - o.x) * ix;
  let t2 = (b.maxX - o.x) * ix;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = ((b.y0 ?? 0) - o.y) * iy;
  t2 = (b.h - o.y) * iy;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (b.minZ - o.z) * iz;
  t2 = (b.maxZ - o.z) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  rayExit = tmax;
  return tmin <= tmax ? tmin : -1;
}
// 坂: 囲む箱を通る区間を、斜面より下の側に絞る
export function rayRamp(o: THREE.Vector3, d: THREE.Vector3, r: Ramp, far: number) {
  let tmin = rayBox(o, d, r, far);
  if (tmin < 0) return -1;
  let tmax = rayExit;
  // 斜面の下側: y - y0 - kx (x - ax) - kz (z - az) <= 0（(ax, az) は低い端）
  const u = rampUpDir(r);
  const kx = u.x * u.slope;
  const kz = u.z * u.slope;
  const ax = u.x < 0 ? r.maxX : r.minX;
  const az = u.z < 0 ? r.maxZ : r.minZ;
  const fo = o.y - r.y0 - kx * (o.x - ax) - kz * (o.z - az);
  const fd = d.y - kx * d.x - kz * d.z;
  if (Math.abs(fd) < 1e-9) {
    if (fo > 0) return -1;
  } else if (fd > 0) tmax = Math.min(tmax, -fo / fd);
  else tmin = Math.max(tmin, -fo / fd);
  return tmin <= tmax ? tmin : -1;
}
// 地面と柱だけを調べ、最初に当たるまでの距離を返す（なければ far のまま）
let hitBlock: Block | null = null; // castWorld で最後に当たった箱（地面なら null）
let hitRamp: Ramp | null = null;
// castWorld で最後に当たった箱（地面や坂なら null）
export const lastHitBlock = () => hitBlock;
export function castWorld(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
  let best = far;
  hitBlock = null;
  hitRamp = null;
  if (dir.y < -1e-6) {
    const t = -origin.y / dir.y;
    if (t >= 0 && t < best) best = t;
  }
  for (const b of blocks) {
    if (b.noRay) continue;
    const t = rayBox(origin, dir, b, best);
    if (t >= 0) {
      best = t;
      hitBlock = b;
    }
  }
  for (const r of ramps) {
    const t = rayRamp(origin, dir, r, best);
    if (t >= 0) {
      best = t;
      hitBlock = null;
      hitRamp = r;
    }
  }
  return best;
}

// castWorld で当たった所 p の面の外向きを out に入れる。箱は p にいちばん近い面、坂は斜面の上ならその傾き
function worldNormal(p: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3) {
  out.set(0, 1, 0);
  if (hitRamp) {
    const r = hitRamp;
    const u = rampUpDir(r);
    const kx = u.x * u.slope;
    const kz = u.z * u.slope;
    const ax = u.x < 0 ? r.maxX : r.minX;
    const az = u.z < 0 ? r.maxZ : r.minZ;
    if (Math.abs(p.y - r.y0 - kx * (p.x - ax) - kz * (p.z - az)) < 1e-3) return void out.set(-kx, 1, -kz).normalize();
  }
  const b = hitBlock ?? hitRamp;
  if (!b) return;
  const dx = Math.min(Math.abs(p.x - b.minX), Math.abs(p.x - b.maxX));
  const dy = Math.min(Math.abs(p.y - (b.y0 ?? 0)), Math.abs(p.y - b.h));
  const dz = Math.min(Math.abs(p.z - b.minZ), Math.abs(p.z - b.maxZ));
  if (dx <= dy && dx <= dz) out.set(-Math.sign(dir.x) || 1, 0, 0);
  else if (dy <= dz) out.set(0, -Math.sign(dir.y) || 1, 0);
  else out.set(0, 0, -Math.sign(dir.z) || 1);
}
export function castThrow(origin: THREE.Vector3, dir: THREE.Vector3, far: number): boolean {
  let best = castWorld(origin, dir, far);
  let found = best < far;
  castHit.enemy = null;
  throwRaycaster.set(origin, dir);
  for (const e of enemies) {
    if (!e.alive) continue;
    throwRaycaster.far = best;
    const hit = throwRaycaster.intersectObjects(e.parts, false)[0];
    if (!hit) continue;
    best = hit.distance;
    found = true;
    castHit.enemy = e;
    castHit.part = hit.object;
  }
  castHit.boss = null;
  const onBoss = raycastBoss(origin, dir, best);
  if (onBoss) {
    best = onBoss.dist;
    found = true;
    castHit.enemy = null;
    castHit.boss = onBoss.part;
    castHit.part = onBoss.object;
  }
  if (found) castHit.point.copy(origin).addScaledVector(dir, best);
  if (found && !castHit.enemy) worldNormal(castHit.point, dir, castHit.normal);
  return found;
}

import * as THREE from 'three';
import { camera, controls } from '../core.js';
import { THROW_RANGE } from '../weapons/kunai.js';
import { enemies, type Enemy } from '../enemy/state.js';
import { castWorld } from '../world/raycast.js';
import { game } from '../game/state.js';

// ---- エイムアシスト（パッドで、クナイと銃を構えているときだけ） ----
// 照準の近くにいる敵の胸を探し、視点を遅くする / 寄せる / 撃った弾を向ける。
// 効く範囲は敵の周りの半径 (m) で決めるので、近い敵ほど画面上で広く、遠い敵ほど狭くなる
export const ASSIST_RADIUS = 1.1; // 視点を遅くし、寄せ始める範囲（胸からの半径, m）
export const ASSIST_SNAP = 0.55; // 撃った弾を胸へ向ける範囲（ASSIST_RADIUS に対する割合）
export const ASSIST_SLOW = 0.3; // 胸の真上にいるときの視点の速さの倍率（範囲の端では 1）
export const ASSIST_PULL = 6; // スティックを倒しきっている間、胸とのずれを 1 秒にどれだけ詰めるか (1/s)
export const ASSIST_CHEST = 0.55; // 胸の高さ（腰の骨から首の骨までの割合）
export const assistTarget = { point: new THREE.Vector3(), angle: 0, size: 0, yaw: 0, pitch: 0, enemy: null as Enemy | null };
export const assistNeck = new THREE.Vector3();
export const assistDir = new THREE.Vector3();
export const assistInv = new THREE.Quaternion();
export function findAssistTarget(): typeof assistTarget | null {
  if (!game.usingPad || !controls.isLocked || (game.shownWeapon !== 'kunai' && game.shownWeapon !== 'handgun')) return null;
  let best: typeof assistTarget | null = null;
  let bestScore = 1;
  assistInv.copy(camera.quaternion).invert();
  for (const e of enemies) {
    if (!e.alive) continue;
    e.spine.getWorldPosition(assistDir);
    e.neck.getWorldPosition(assistNeck);
    assistDir.lerp(assistNeck, ASSIST_CHEST);
    const chest = assistNeck.copy(assistDir);
    assistDir.sub(camera.position);
    const dist = assistDir.length();
    if (dist < 0.5 || dist > THROW_RANGE) continue;
    assistDir.divideScalar(dist);
    const size = Math.atan2(ASSIST_RADIUS, dist); // 範囲の見かけの大きさ (rad)
    // 照準（-Z）から見たずれ。yaw は右が +、pitch は上が +
    assistDir.applyQuaternion(assistInv);
    const angle = Math.acos(THREE.MathUtils.clamp(-assistDir.z, -1, 1));
    const score = angle / size;
    if (score >= bestScore) continue;
    // 壁の向こうの敵には効かせない
    assistDir.subVectors(chest, camera.position).divideScalar(dist);
    if (castWorld(camera.position, assistDir, dist) < dist - 0.3) continue;
    assistDir.applyQuaternion(assistInv);
    bestScore = score;
    best = assistTarget;
    best.point.copy(chest);
    best.enemy = e;
    best.angle = angle;
    best.size = size;
    best.yaw = Math.atan2(assistDir.x, -assistDir.z);
    best.pitch = Math.atan2(assistDir.y, Math.hypot(assistDir.x, assistDir.z));
  }
  return best;
}

// 敵の胸の位置（エイムアシストと同じ高さ）
export function enemyChest(e: Enemy, out: THREE.Vector3) {
  e.spine.getWorldPosition(out);
  e.neck.getWorldPosition(assistNeck);
  return out.lerp(assistNeck, ASSIST_CHEST);
}

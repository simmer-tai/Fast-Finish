import * as THREE from 'three';
import { camera, controls } from '../core.js';
import { enemies, type Enemy } from '../enemy/state.js';
import { game } from '../game/state.js';
import { castWorld } from '../world/raycast.js';
import { enemyChest } from './aimAssist.js';
import { isDown } from './down.js';
import { turnView } from './look.js';

const RANGE = 14;
const ACQUIRE_ANGLE = Math.PI / 3;
const point = new THREE.Vector3();
const direction = new THREE.Vector3();
const projected = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const viewAngles = new THREE.Euler(0, 0, 0, 'YXZ');
let locked: Enemy | null = null;
let manualLookDelay = 0;
const marker = document.createElement('div');
marker.style.cssText = 'position:fixed;z-index:10;width:24px;height:24px;border:2px solid white;border-radius:50%;box-shadow:0 0 3px #000, inset 0 0 3px #000;transform:translate(-50%,-50%);pointer-events:none;display:none';
document.body.appendChild(marker);

export function isMeleeLockWeapon() {
  return game.shownWeapon !== 'handgun' && game.shownWeapon !== 'bow';
}

function visible(enemy: Enemy): boolean {
  if (!enemy.alive || !enemies.includes(enemy)) return false;
  enemyChest(enemy, point);
  direction.subVectors(point, camera.position);
  const distance = direction.length();
  if (distance < 0.1 || distance > RANGE) return false;
  direction.divideScalar(distance);
  return castWorld(camera.position, direction, distance) >= distance - 0.3;
}

export function clearLockOn() {
  locked = null;
  marker.style.display = 'none';
}

function findTarget() {
  inverse.copy(camera.quaternion).invert();
  let bestScore = Infinity;
  for (const enemy of enemies) {
    if (!visible(enemy)) continue;
    const distance = point.distanceTo(camera.position);
    direction.applyQuaternion(inverse);
    const angle = Math.acos(THREE.MathUtils.clamp(-direction.z, -1, 1));
    const score = angle / ACQUIRE_ANGLE + distance / RANGE * 0.35;
    if (angle < ACQUIRE_ANGLE && score < bestScore) {
      bestScore = score;
      locked = enemy;
    }
  }
}

// 攻撃の押し始めだけ、近くの敵へ視点を少し寄せる。
export function assistMeleeAttack() {
  if (!game.usingPad || !isMeleeLockWeapon() || isDown()) return;
  inverse.copy(camera.quaternion).invert();
  let best: Enemy | null = null;
  let bestScore = Infinity;
  for (const enemy of enemies) {
    if (!visible(enemy)) continue;
    const distance = point.distanceTo(camera.position);
    if (distance > 5) continue;
    direction.applyQuaternion(inverse);
    const angle = Math.acos(THREE.MathUtils.clamp(-direction.z, -1, 1));
    const score = angle + distance * 0.05;
    if (angle < Math.PI / 4 && score < bestScore) { best = enemy; bestScore = score; }
  }
  if (!best || !visible(best)) return;
  viewAngles.setFromQuaternion(camera.quaternion);
  const targetYaw = Math.atan2(-direction.x, -direction.z);
  const targetPitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  const yaw = Math.atan2(Math.sin(viewAngles.y - targetYaw), Math.cos(viewAngles.y - targetYaw));
  turnView(THREE.MathUtils.clamp(yaw * 0.5, -0.22, 0.22), THREE.MathUtils.clamp((viewAngles.x - targetPitch) * 0.5, -0.12, 0.12));
}

export function updateLockOn(dt: number, lookInput: number): boolean {
  if (!controls.isLocked || !game.usingPad || !isMeleeLockWeapon() || isDown()) {
    clearLockOn();
    return false;
  }
  if (lookInput > 0) {
    manualLookDelay = 0.25;
    clearLockOn();
    return false;
  }
  manualLookDelay = Math.max(0, manualLookDelay - dt);
  if (manualLookDelay > 0) {
    clearLockOn();
    return false;
  }
  if (locked && !visible(locked)) clearLockOn();
  if (!locked) findTarget();
  if (!locked || !visible(locked)) return false;
  // 背後にいる敵も、ワールド座標の方角から水平・垂直を別々に求める。
  // カメラ基準の上下角は、敵が背後へ回ったとき上下が反転してしまう。
  viewAngles.setFromQuaternion(camera.quaternion);
  const targetYaw = Math.atan2(-direction.x, -direction.z);
  const targetPitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  const yaw = Math.atan2(Math.sin(viewAngles.y - targetYaw), Math.cos(viewAngles.y - targetYaw));
  const pitch = viewAngles.x - targetPitch;
  const pull = 1 - Math.exp(-5 * dt);
  turnView(yaw * pull, pitch * pull);
  camera.updateMatrixWorld();
  projected.copy(point).project(camera);
  marker.style.display = projected.z < 1 ? 'block' : 'none';
  marker.style.left = `${(projected.x + 1) * 50}%`;
  marker.style.top = `${(1 - projected.y) * 50}%`;
  return true;
}

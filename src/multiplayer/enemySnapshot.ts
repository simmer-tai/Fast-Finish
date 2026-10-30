import * as THREE from 'three';
import { enemies, type Enemy } from '../enemy/state.js';

// ボスの増援は銃撃役だけ。見た目の骨と当たりの位置、体力をホストから受け取る。
export type AddSnapshot = { id: number; alive: boolean; visible: boolean; hp: number; bones: number[][] };
const spawnIds = new WeakMap<Enemy, number>();
let nextSpawnId = 1;
export function markAddSpawn(e: Enemy) { spawnIds.set(e, nextSpawnId++); }
export function addSpawnId(e: Enemy) { return spawnIds.get(e) ?? 0; }
function bones(e: Enemy): THREE.Object3D[] {
  return [e.root, e.shake, e.pelvis, e.spine, e.neck, e.gunRig, ...e.arms, ...e.forearms, ...e.thighs, ...e.shins, ...e.feet, e.gun];
}
export function captureAdds(): AddSnapshot[] {
  return enemies.map((e) => ({ id: addSpawnId(e), alive: e.alive, visible: e.root.visible, hp: e.hp,
    bones: bones(e).map((o) => [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z]) }));
}
export function isAddSnapshots(value: unknown): value is AddSnapshot[] {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000;
  return Array.isArray(value) && value.length <= 32 && value.every((e) => e && typeof e === 'object' && Number.isSafeInteger(e.id) && e.id >= 0 && typeof e.alive === 'boolean'
    && typeof e.visible === 'boolean' && finite(e.hp) && Array.isArray(e.bones) && e.bones.length === 17
    && e.bones.every((b: unknown) => Array.isArray(b) && b.length === 10 && b.every(finite)));
}
const target = new THREE.Quaternion();
export function applyAddSnapshot(e: Enemy, snapshot: AddSnapshot, dt: number) {
  const blend = 1 - Math.exp(-14 * dt);
  bones(e).forEach((o, i) => {
    const b = snapshot.bones[i];
    o.position.x += (b[0] - o.position.x) * blend; o.position.y += (b[1] - o.position.y) * blend; o.position.z += (b[2] - o.position.z) * blend;
    target.set(b[3], b[4], b[5], b[6]); if (target.lengthSq() > 1e-8) o.quaternion.slerp(target.normalize(), blend);
    o.scale.set(b[7], b[8], b[9]);
  });
  e.alive = snapshot.alive; e.hp = snapshot.hp; e.root.visible = snapshot.visible;
  e.yaw = e.root.rotation.y;
  e.root.updateMatrixWorld(true);
}

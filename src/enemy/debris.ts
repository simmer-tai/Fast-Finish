import * as THREE from 'three';
import { env } from './env.js';
import { RESPAWN_TIME, en } from './state.js';
import { floorAt } from '../world/blocks.js';
import { rand } from '../random.js';

// ---- 倒したときにバラバラになる体 ----
// 骨ごと（頭・胸・腰・上腕・前腕・太もも・すね・足）と銃を 1 つの塊にして、倒した瞬間の姿勢のまま写し取って飛ばす。
// 部品のジオメトリとマテリアルは本体と共有する（とどめの白い光りもそのまま乗る）
export const DEBRIS_GRAVITY = 18;
export const DEBRIS_BOUNCE = 0.3;
export const DEBRIS_SHRINK = 0.4; // 起き上がる前のこの時間で縮んで消える
export interface Debris { obj: THREE.Group; vel: THREE.Vector3; axis: THREE.Vector3; spin: number; radius: number }
export const debrisBox = new THREE.Box3();
export const debrisSize = new THREE.Vector3();
export const debrisInv = new THREE.Matrix4();
export const debrisRot = new THREE.Quaternion();

// heavy = true（斧）なら、散らばりを抑えて攻撃の向き（と刃の振り抜けた向き）へまとめて吹き飛ばす
export const debrisPush = new THREE.Vector3();
export function breakDummy(dir: THREE.Vector3, heavy = false, swing?: THREE.Vector3) {
  clearDebris();
  debrisPush.copy(dir);
  if (heavy && swing && swing.lengthSq() > 1e-6) debrisPush.addScaledVector(swing.clone().normalize(), 0.7).normalize();
  en.root.updateMatrixWorld(true);
  // 部品を、いちばん近い塊の根元ごとに分ける
  const groups = new Map<THREE.Object3D, THREE.Mesh[]>();
  en.root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    let root = o.parent;
    while (root && !en.debrisRootSet.has(root)) root = root.parent;
    if (!root) return;
    let list = groups.get(root);
    if (!list) groups.set(root, (list = []));
    list.push(o as THREE.Mesh);
  });
  for (const [root, meshes] of groups) {
    // 塊の中心を回転の中心にする（骨の原点は関節なので、そのまま回すと振り子のように見える）
    debrisBox.makeEmpty();
    for (const m of meshes) debrisBox.expandByObject(m);
    const obj = new THREE.Group();
    debrisBox.getCenter(obj.position);
    root.getWorldQuaternion(obj.quaternion);
    obj.updateMatrixWorld();
    debrisInv.copy(obj.matrixWorld).invert();
    for (const m of meshes) {
      const c = new THREE.Mesh(m.geometry, m.material);
      c.matrix.multiplyMatrices(debrisInv, m.matrixWorld).decompose(c.position, c.quaternion, c.scale);
      obj.add(c);
    }
    env.scene.add(obj);
    debrisBox.getSize(debrisSize);
    // 体の中心から外へ、攻撃の向きへ押し出し、上へ跳ね上げる
    const vel = new THREE.Vector3(obj.position.x - en.root.position.x, 0, obj.position.z - en.root.position.z);
    if (vel.lengthSq() < 1e-6) vel.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    if (heavy) {
      vel.normalize().multiplyScalar(rand(0.4, 1.2)).addScaledVector(debrisPush, rand(6, 10));
      vel.y = Math.max(vel.y, 0) + rand(1.5, 3.5) + (obj.position.y - en.root.position.y) * 0.6;
    } else {
      vel.normalize().multiplyScalar(rand(1.5, 3.5)).addScaledVector(dir, rand(2.5, 5.5));
      vel.y = rand(2, 5.5) + obj.position.y * 1.2; // 上の部品ほど高く飛ぶ
    }
    en.debris.push({
      obj,
      vel,
      axis: new THREE.Vector3().randomDirection(),
      spin: rand(6, 16) * (Math.random() < 0.5 ? -1 : 1),
      radius: Math.min(debrisSize.x, debrisSize.y, debrisSize.z) * 0.5,
    });
  }
}

export function clearDebris() {
  for (const d of en.debris) d.obj.removeFromParent();
  en.debris.length = 0;
}

export function updateDebris(dt: number) {
  const shrink = THREE.MathUtils.clamp((RESPAWN_TIME - en.deadTime) / DEBRIS_SHRINK, 0, 1);
  for (const d of en.debris) {
    const p = d.obj.position;
    d.vel.y -= DEBRIS_GRAVITY * dt;
    p.addScaledVector(d.vel, dt);
    d.obj.quaternion.premultiply(debrisRot.setFromAxisAngle(d.axis, d.spin * dt));
    // 床で跳ねて、転がりながら止まる
    const floor = floorAt(p.x, p.z, p.y) + d.radius;
    if (p.y < floor) {
      p.y = floor;
      if (d.vel.y < 0) d.vel.y *= -DEBRIS_BOUNCE;
      if (d.vel.y < 0.5) d.vel.y = 0;
      d.vel.x *= 0.7;
      d.vel.z *= 0.7;
      d.spin *= 0.6;
    }
    d.obj.scale.setScalar(Math.max(0.001, shrink));
  }
}

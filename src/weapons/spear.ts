import * as THREE from 'three';
import { loftRings } from '../geometry.js';

// ---- 武器: 槍 ----
// 刀の刃を付けた槍。角棒の鍔の上面から、剣と同じ作りの片刃（棟が平ら、鎬で最も厚く、刃先で薄い）を立て、
// 切っ先は刃先側を斜めに落として棟寄りに尖らせる。刃はわずかに棟の側へ反る。
// 柄は八角で、両手で握る 2 か所に巻き。柄の先は短い六角の口金、柄尻は六角の石突きと短い錐。
// モデルでは +Y が切っ先、+X が刃先の向きで、原点は両手で握る間（柄の中ほど。振るときはここを支点に回す）

export interface SpearMats {
  metal: THREE.Material; // 刃と金具
  shaft: THREE.Material; // 柄
  wrap: THREE.Material; // 握りの巻き
}

const SHAFT_LEN = 1.3;
const SHAFT_R = 0.0125;
const COLLAR_LEN = 0.022; // 柄の先の六角の口金
const GUARD_H = 0.014; // 鍔の厚み（柄の向き）
const GUARD_W = 0.088; // 鍔の幅
const GUARD_D = 0.022; // 鍔の奥行き
const BLADE_LEN = 0.42; // 鍔の上から切っ先まで
const TIP_LEN = 0.075; // 切っ先の長さ
const BLADE_W = 0.05; // 刃の幅（棟から刃先まで）
const BLADE_T = 0.011; // 鎬の所の厚み
const SORI = 0.012; // 反り: 刃の胴の終わりで棟の側へ寄る量
const WRAP_LEN = 0.18;
const WRAP_YS = [-0.3, -0.75]; // 巻きの中心（柄の先からの高さ）。上が右手、下が左手
const HOLD_Y = (WRAP_YS[0] + WRAP_YS[1]) / 2; // 両手の間 = 回す支点

// 柄の先から測った高さ
const BLADE_BASE = COLLAR_LEN + GUARD_H - 0.002; // 鍔に少し埋めて、すき間なくつなぐ
export const SPEAR_TIP_Y = BLADE_BASE + BLADE_LEN - HOLD_Y; // 原点から切っ先まで
export const SPEAR_BLADE_BASE_Y = BLADE_BASE - HOLD_Y; // 原点から刃の付け根まで
export const SPEAR_BUTT_Y = -SHAFT_LEN - 0.065 - HOLD_Y; // 原点から石突きの先まで（負）

// 刃の断面: 棟（-X）は平らな面、鎬（少し棟寄り）で最も厚く、刃先（+X）で 0。dx は反りで横へずらす量
const section = (y: number, w: number, t: number, dx: number) => [
  new THREE.Vector3(dx - w / 2, y, t * 0.35),
  new THREE.Vector3(dx - w * 0.1, y, t / 2),
  new THREE.Vector3(dx + w / 2, y, 0),
  new THREE.Vector3(dx - w * 0.1, y, -t / 2),
  new THREE.Vector3(dx - w / 2, y, -t * 0.35),
];

// +Y 方向が切っ先になるよう組み立てる（原点は握る位置）
export function createSpear(mats: SpearMats): THREE.Group {
  const spear = new THREE.Group();
  // 部位には名前を付けておく（スキンの飾りが隠したり差し替えたりする）
  const part = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.y = y - HOLD_Y;
    spear.add(m);
    return m;
  };

  // 刃: 根元から刃の胴の終わりまで断面を並べ、反りの分だけ棟の側へずらしていく。最後に切っ先の 1 点
  const body = BLADE_LEN - TIP_LEN;
  const N = 8;
  const rings: THREE.Vector3[][] = [];
  for (let k = 0; k <= N; k++) {
    const s = k / N;
    rings.push(section(BLADE_BASE + body * s, BLADE_W * (1.05 - 0.15 * s), BLADE_T * (1 - 0.15 * s), -SORI * s * s));
  }
  const tipX = -SORI * (BLADE_LEN / body) ** 2 - BLADE_W * 0.38;
  rings.push([new THREE.Vector3(tipX, BLADE_BASE + BLADE_LEN, 0)]);
  part('blade', loftRings(rings), mats.metal, 0);

  part('guard', new THREE.BoxGeometry(GUARD_W, GUARD_H, GUARD_D), mats.metal, COLLAR_LEN + GUARD_H / 2);
  part('collar', new THREE.CylinderGeometry(0.0145, 0.0155, COLLAR_LEN, 6), mats.metal, COLLAR_LEN / 2);
  part('shaft', new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, SHAFT_LEN, 8), mats.shaft, -SHAFT_LEN / 2);
  WRAP_YS.forEach((y, i) => part(`wrap${i}`, new THREE.CylinderGeometry(0.0142, 0.0142, WRAP_LEN, 8), mats.wrap, y));
  part('butt', new THREE.CylinderGeometry(0.0145, 0.0155, 0.03, 6), mats.metal, -SHAFT_LEN - 0.015);
  part('spike', new THREE.ConeGeometry(0.0125, 0.035, 6), mats.metal, -SHAFT_LEN - 0.03 - 0.0175).rotation.x = Math.PI;
  return spear;
}

// 一人称での構え（カメラ基準）。両手で柄の中ほどを持ち、腰だめに穂先を前へ向ける。
// 柄は画面の右下から中ほどへ斜めに渡し、穂先は少し上げる。刃先（ローカル +X）は下へ向ける
export const SPEAR_VIEW_MODEL_POS = new THREE.Vector3(0.14, -0.32, -0.42);
export const SPEAR_REST_TIP = new THREE.Vector3(-0.25, 0.3, -1).normalize();
export const SPEAR_REST_QUAT = new THREE.Quaternion();
{
  const tip = SPEAR_REST_TIP;
  const edgeDir = new THREE.Vector3(0, -1, 0).addScaledVector(tip, tip.y).normalize();
  const faceDir = new THREE.Vector3().crossVectors(edgeDir, tip);
  SPEAR_REST_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edgeDir, tip, faceDir));
}

// 手に持たせた槍。userData.rest が構えの向き（攻撃の動きはこの下に足す）
export function createHeldSpear(mats: SpearMats): THREE.Group {
  const held = new THREE.Group();
  const rest = new THREE.Group();
  rest.quaternion.copy(SPEAR_REST_QUAT);
  held.add(rest);
  const spear = createSpear(mats);
  rest.add(spear);
  held.userData.rest = rest;
  held.userData.spear = spear;
  return held;
}

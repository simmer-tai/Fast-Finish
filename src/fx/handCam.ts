import * as THREE from 'three';
import { SICKLE_VIEW_MODEL_POS } from '../weapons/chainSickle.js';
import { AXE_VIEW_MODEL_POS } from '../weapons/battleAxe.js';
import { type WeaponId } from '../weapons/ids.js';
import { SWORD_VIEW_MODEL_POS } from '../weapons/sword.js';
import {
  GUN_VIEW_MODEL_POS, VIEW_MODEL_POS, axeRest, axeViewModel, gunTwirl, gunViewModel,
  kunaiRest, sickleViewModel, swordRest, swordViewModel, viewModel,
} from '../weapons/viewModels.js';
import { reloadPosOff } from '../weapons/handgunCombat.js';
import { grappleHooks, sickleBodyPos } from '../weapons/sickleCombat.js';
import { game } from '../game/state.js';

// ---- 手元につられる視線 ----
// 構えた武器の手元が画面の中で動くと、視線をその向きへ少しだけつられさせる。
// 手元の位置から、ゆっくり追いかける基準を引いた分だけ向ける（振った瞬間は大きく、構えを変えたままなら正面へ戻る）。
// 歩きの揺れ・視点移動の遅れ・持ち替えの上げ下げは数えない（構えの根元 = ビューモデルより手前で測る）
export const HAND_CAM_GAIN = new THREE.Vector3(0.12, 0.15, 0.08); // 手元 1 m のずれあたりの角度 (rad): 縦, 横, 傾き
export const HAND_CAM_MAX = 0.035; // 向ける角度の上限 (rad)
export const HAND_CAM_FOLLOW = 4; // 基準が手元に追いつく速さ (1/秒)
export const HAND_CAM_STIFF = 140; // ばねの硬さ
export const HAND_CAM_DAMP = 17; // ばねの減衰
export const handCam = new THREE.Vector3(); // 今の視線のずれ (rad): x = 縦, y = 横, z = 傾き
export const handCamVel = new THREE.Vector3();
export const handCamBase = new THREE.Vector3();
export const handCamPos = new THREE.Vector3();
export const handCamTmp = new THREE.Vector3();
let handCamWeapon: WeaponId | null = null;
export const HAND_PROBE_KUNAI = new THREE.Vector3(0, 0.1, 0); // 握りから切っ先へ少し寄った所（回転も拾う）
export const HAND_PROBE_SWORD = new THREE.Vector3(0, 0.35, 0);
export const HAND_PROBE_GUN = new THREE.Vector3(0, 0, -0.1);
export const HAND_PROBE_SICKLE = new THREE.Vector3(0, 0.1, 0);
export const HAND_PROBE_AXE = new THREE.Vector3(0, 0.6, 0);

// frame 座標の点 local を、root の手前まで親をたどって root の座標へ移す（root 自身の揺れは入れない）
export function probeToRoot(frame: THREE.Object3D, root: THREE.Object3D, local: THREE.Vector3, out: THREE.Vector3) {
  out.copy(local);
  for (let o: THREE.Object3D | null = frame; o && o !== root; o = o.parent) {
    o.updateMatrix();
    out.applyMatrix4(o.matrix);
  }
  return out;
}

// 今の武器の手元の位置（カメラ基準、構えの根元を基本位置に置いた値）
export function measureHand(out: THREE.Vector3) {
  switch (game.shownWeapon) {
    case 'kunai':
      return probeToRoot(kunaiRest, viewModel, HAND_PROBE_KUNAI, out).add(VIEW_MODEL_POS);
    case 'sword':
      return probeToRoot(swordRest, swordViewModel, HAND_PROBE_SWORD, out).add(SWORD_VIEW_MODEL_POS);
    case 'handgun':
      return probeToRoot(gunTwirl, gunViewModel, HAND_PROBE_GUN, out).add(GUN_VIEW_MODEL_POS).add(reloadPosOff);
    case 'sickle':
      // 両手の鎌の真ん中と、振りにつられた体のひねり
      probeToRoot(grappleHooks[0].rest, sickleViewModel, HAND_PROBE_SICKLE, out);
      out.add(probeToRoot(grappleHooks[1].rest, sickleViewModel, HAND_PROBE_SICKLE, handCamTmp)).multiplyScalar(0.5);
      return out.add(SICKLE_VIEW_MODEL_POS).add(sickleBodyPos);
    case 'axe':
      return probeToRoot(axeRest, axeViewModel, HAND_PROBE_AXE, out).add(AXE_VIEW_MODEL_POS);
  }
}

export function updateHandCam(dt: number) {
  if (dt <= 0) return;
  measureHand(handCamPos);
  // 持ち替えた直後は手元が飛ぶので、基準をそこへ合わせ直す
  if (handCamWeapon !== game.shownWeapon) {
    handCamWeapon = game.shownWeapon;
    handCamBase.copy(handCamPos);
  }
  handCamBase.lerp(handCamPos, Math.min(1, dt * HAND_CAM_FOLLOW));
  const dx = handCamPos.x - handCamBase.x;
  const dy = handCamPos.y - handCamBase.y;
  // 右へ動いたら右を、上へ動いたら上を向き、振った向きへ少し傾ける
  const tx = THREE.MathUtils.clamp(dy * HAND_CAM_GAIN.x, -HAND_CAM_MAX, HAND_CAM_MAX);
  const ty = THREE.MathUtils.clamp(-dx * HAND_CAM_GAIN.y, -HAND_CAM_MAX, HAND_CAM_MAX);
  const tz = THREE.MathUtils.clamp(-dx * HAND_CAM_GAIN.z, -HAND_CAM_MAX, HAND_CAM_MAX);

  // ばね（大きな dt で暴れないよう細かく刻む）
  const steps = Math.ceil(dt / (1 / 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    handCamVel.x += (HAND_CAM_STIFF * (tx - handCam.x) - HAND_CAM_DAMP * handCamVel.x) * h;
    handCamVel.y += (HAND_CAM_STIFF * (ty - handCam.y) - HAND_CAM_DAMP * handCamVel.y) * h;
    handCamVel.z += (HAND_CAM_STIFF * (tz - handCam.z) - HAND_CAM_DAMP * handCamVel.z) * h;
    handCam.addScaledVector(handCamVel, h);
  }
}

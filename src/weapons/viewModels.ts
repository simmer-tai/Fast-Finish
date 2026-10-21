import * as THREE from 'three';
import { camera, renderer, scene } from '../core.js';
import { SICKLE_VIEW_MODEL_POS, createHeldSickle } from './chainSickle.js';
import { AXE_VIEW_MODEL_POS, createHeldAxe } from './battleAxe.js';
import { CHAKRAM_VIEW_MODEL_POS, createHeldChakram } from './chakram.js';
import { REST_TIP, createKunai } from './kunai.js';
import { createRevolver } from './revolver.js';
import { SWORD_STAND_QUAT, SWORD_VIEW_MODEL_POS, createSword } from './sword.js';
import { createWeaponMats } from './materials.js';

// ---- 武器の手元のモデル ----
// 一人称視点で構えて見せるモデルをカメラの子にして組む。動き（揺れ・攻撃の構え）は main.ts で付ける

// ---- 武器: クナイ ----（モデルとマテリアルは weapons/ 以下）
export const weaponMats = createWeaponMats(renderer);
export const kunaiMat = weaponMats.kunai;

// 一人称視点で右手に構えて見せる（カメラの子にする）
scene.add(camera);
export const viewModel = new THREE.Group();
export const VIEW_MODEL_POS = new THREE.Vector3(0.2, -0.2, -0.35);
viewModel.position.copy(VIEW_MODEL_POS);
camera.add(viewModel);

// 階層: viewModel（揺れ） → attackPivot（攻撃の構え） → kunaiRest（構えの向き）
//       → spinPivot（輪を中心にした回転） → kunai
export const attackPivot = new THREE.Group();
viewModel.add(attackPivot);
export const kunaiRest = new THREE.Group();
attackPivot.add(kunaiRest);

{
  const toCamera = VIEW_MODEL_POS.clone().negate();
  const faceDir = toCamera.addScaledVector(REST_TIP, -toCamera.dot(REST_TIP)).normalize();
  const sideDir = new THREE.Vector3().crossVectors(REST_TIP, faceDir);
  kunaiRest.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sideDir, REST_TIP, faceDir));
}

export const kunai = createKunai(weaponMats);
// 輪に指を掛けてくるくる回せるよう、回転の中心を輪に置く
export const spinPivot = new THREE.Group();
spinPivot.position.y = kunai.userData.ringY;
kunai.position.y = -kunai.userData.ringY;
spinPivot.add(kunai);
kunaiRest.add(spinPivot);

// 左手: 指の間に 3 本挟んで扇状に構える（右手の構えを左右反転した位置・向き）
export const LEFT_VIEW_MODEL_POS = new THREE.Vector3(-0.26, -0.21, -0.36);
export const leftViewModel = new THREE.Group();
leftViewModel.position.copy(LEFT_VIEW_MODEL_POS);
camera.add(leftViewModel);
export const leftKunaiRest = new THREE.Group();
leftViewModel.add(leftKunaiRest);
{
  const tip = new THREE.Vector3(0.3, 0.85, -0.42).normalize();
  const toCamera = LEFT_VIEW_MODEL_POS.clone().negate();
  const faceDir = toCamera.addScaledVector(tip, -toCamera.dot(tip)).normalize();
  const sideDir = new THREE.Vector3().crossVectors(tip, faceDir);
  leftKunaiRest.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sideDir, tip, faceDir));
}
// 輪のあたりを握り込み、柄を指の間で少しずつずらして、切っ先側が開くようにする
// 輪を中心に回せるよう、各クナイは輪に原点を置いた fanPivot の子にする
export const LEFT_FAN_ANGLES = [-22, 0, 22].map((a) => THREE.MathUtils.degToRad(-a));
export const leftFanPivots: THREE.Group[] = [];
export const leftKunais: THREE.Group[] = [];
for (const [i, angle] of LEFT_FAN_ANGLES.entries()) {
  const fanPivot = new THREE.Group();
  fanPivot.position.set((i - 1) * 0.011, 0, (i - 1) * -0.004);
  fanPivot.rotation.z = angle;
  const k = createKunai(weaponMats);
  k.position.y = -k.userData.ringY;
  fanPivot.add(k);
  leftKunaiRest.add(fanPivot);
  leftFanPivots.push(fanPivot);
  leftKunais.push(k);
}

// ---- 武器: ハンドガン（リボルバー） ----
// 右手で構えて見せる。銃口を照準の少し内側へ向ける
export const GUN_VIEW_MODEL_POS = new THREE.Vector3(0.15, -0.13, -0.3);
export const gunViewModel = new THREE.Group();
gunViewModel.position.copy(GUN_VIEW_MODEL_POS);
camera.add(gunViewModel);
// 階層: gunViewModel（揺れ・反動・装填） → gunTwirl（構えの向き。原点はトリガーに掛けた指）
//       → gunSpin（指を軸にした縦回転） → revolver
export const GUN_REST_ROT = new THREE.Euler(0.04, 0.07, 0);
export const TRIGGER_FINGER = new THREE.Vector3(0, -0.05, -0.002); // トリガーガードの中、トリガーのすぐ前
export const gunTwirl = new THREE.Group();
gunTwirl.rotation.copy(GUN_REST_ROT);
gunTwirl.position.copy(TRIGGER_FINGER).applyEuler(GUN_REST_ROT);
gunViewModel.add(gunTwirl);
export const gunSpin = new THREE.Group();
gunTwirl.add(gunSpin);
export const revolver = createRevolver(weaponMats);
revolver.position.copy(TRIGGER_FINGER).negate();
gunSpin.add(revolver);
gunViewModel.visible = false;

// ---- 敵の武器: 自動拳銃 ----

// ---- 武器: 剣 ----
// 右手で柄を握り、刃を前上方へ立てて構える
export const swordViewModel = new THREE.Group();
swordViewModel.position.copy(SWORD_VIEW_MODEL_POS);
camera.add(swordViewModel);
export const swordRest = new THREE.Group();
swordViewModel.add(swordRest);
swordRest.quaternion.copy(SWORD_STAND_QUAT);
export const swordRestQuat = SWORD_STAND_QUAT.clone(); // 今の移動状態での構えの向き（攻撃していないときはこの向きで持つ）
export const sword = createSword(weaponMats);
// 握った手を軸に、刃の面の中で剣を回す（くるくる回す動きに使う）
export const swordSpin = new THREE.Group();
swordRest.add(swordSpin);
swordSpin.add(sword);
swordViewModel.visible = false;

// ---- 武器: 鎖鎌 ----
// 刃と金具はクナイと同じ黒光り、柄は剣の柄と同じ色。握りの巻きは一段暗くする
// 左右の手に 1 本ずつ持つ。揺れは 2 本まとめて付ける
export const sickleViewModel = new THREE.Group();
sickleViewModel.position.copy(SICKLE_VIEW_MODEL_POS);
camera.add(sickleViewModel);
export const sickleMats = { metal: kunaiMat, shaft: weaponMats.swordHilt, wrap: weaponMats.sickleWrap };
export const rightSickle = createHeldSickle(sickleMats, 1);
export const leftSickle = createHeldSickle(sickleMats, -1);
sickleViewModel.add(rightSickle, leftSickle);
sickleViewModel.visible = false;

// ---- 武器: バトルアックス ----
// 頭はクナイと同じ黒光り、柄は鎖鎌の巻きと同じ暗い色。両手で握る
export const axeViewModel = new THREE.Group();
// 視点を回したときの揺れ（重さで遅れて付いてくる）
export const AXE_SWAY_GAIN = 1.4;
export const AXE_SWAY_STIFF = 90;
export const AXE_SWAY_DAMP = 11;
axeViewModel.position.copy(AXE_VIEW_MODEL_POS);
camera.add(axeViewModel);
export const heldAxe = createHeldAxe({ metal: kunaiMat, grip: weaponMats.sickleWrap });
export const axeRest = heldAxe.userData.rest as THREE.Group;
export const heldAxeModel = heldAxe.userData.axe as THREE.Group;
axeViewModel.add(heldAxe);
axeViewModel.visible = false;

// ---- 武器: チャクラム ----
// 全体をクナイと同じ黒光りにする。右手で持つ
export const chakramViewModel = new THREE.Group();
chakramViewModel.position.copy(CHAKRAM_VIEW_MODEL_POS);
camera.add(chakramViewModel);
export const heldChakram = createHeldChakram({ metal: kunaiMat });
export const chakramRest = heldChakram.userData.rest as THREE.Group;
chakramViewModel.add(heldChakram);
chakramViewModel.visible = false;

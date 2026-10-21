import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  SICKLE_VIEW_MODEL_POS, createChainSickle, createHeldSickle, createLongChain, layChain, layLongChain,
} from './weapons/chainSickle.js';
import { AXE_REST_QUAT, AXE_VIEW_MODEL_POS, createHeldAxe } from './weapons/battleAxe.js';
import { CHAKRAM_VIEW_MODEL_POS, createHeldChakram } from './weapons/chakram.js';
import * as sfx from './audio.js';
import { ensureAudio, playGrip, playHit, playRing, playSwish, type HitKind } from './audio.js';
import { showKillScore, totalScore, updateScoreHud, type KillBonus } from './score.js';
import { finalScore, fmtTime, showResult, skipResult } from './result.js';
import { gameOverChoice, showGameOverView, stepGameOverMenu } from './gameOver.js';
import type { StageBox, StageLayout, StageRamp } from './stage.js';
import { buildStation } from './station.js';
import { buildWarehouse } from './warehouse.js';
import { buildParking } from './parking.js';
import { createStageTitle, STAGE_TITLE_END } from './stageTitle.js';
import { PAD, pollPad } from './gamepad.js';
import { WEAPON_KEYS, type WeaponId } from './weapons/ids.js';
import { mulberry32, rand } from './random.js';
import {
  DUMMY_ANKLE_Y, DUMMY_FOREARM, DUMMY_HEIGHT, DUMMY_LEG_X, DUMMY_RADIUS, DUMMY_SHIN, DUMMY_THIGH, DUMMY_UPPER_ARM,
  buildEnemyBody, type EnemyBody,
} from './enemy/body.js';
import { updateControlsHud } from './ui/controlsHud.js';
import { GROUND_REVEAL_ALL, groundReveal, riseOrigin, withGroundReveal } from './world/reveal.js';
import {
  RISE_BASE_HEIGHT, RISE_BASE_TIME, RISE_FILL_DONE, RISE_FILL_START, RISE_SLAM_HEIGHT, RISE_WAVE, arenaRiseEnd,
  resetArenaRiseEnd, riseDelayAt, riseLines, riseMeshes, risers,
} from './world/rise.js';
import {
  ARENA_GRID_MAJOR, ARENA_GRID_MINOR, STRUCT_GRID, TERRAIN_GRID, addBoxes, addRamps, blocks, boxColor, boxGeo,
  boxMatrix, gridMaterial, rampMatrix, rampTop, rampUpDir, ramps, wedgeGeo, type Block, type Ramp,
} from './world/blocks.js';
import { ARENA_HALF, BORDER_HEIGHT, arenaRoot, borderMat, borderUniforms, groundLineMat } from './world/arena.js';
import { ImpactFxShader, SpeedFxShader } from './fx/postShaders.js';
import {
  HEAVY_FX, HIT_TINT, addBeam, fireBurst, flares, fxScene, hitFxVisible, impact, initHitFx,
  spawnFinaleFx, spawnHitFx, spawnKillFx, spawnShards, spawnSparks, updateHitParticles,
} from './fx/hitFx.js';
import { addSlashScar, clearScars, updateScars, type Scar } from './fx/scars.js';
import { createWeaponMats } from './weapons/materials.js';
import { createKunai } from './weapons/kunai.js';
import { createRevolver, createRound } from './weapons/revolver.js';
import { createPistol } from './weapons/pistol.js';
import {
  SWORD_BLADE_BASE_Y, SWORD_RUN_QUAT, SWORD_SLIDE_QUAT, SWORD_STAND_QUAT, SWORD_TIP_Y, SWORD_VIEW_MODEL_POS, createSword,
} from './weapons/sword.js';
import { initOptions, onOptionsClick, onOptionsKey, options, renderOptions, type Quality } from './ui/options.js';
import { hidePicker, onPickerClick, onPickerKey, openPicker, pickerOpen, selectedLoadout } from './ui/weaponPicker.js';
import { loadBest, saveBest } from './records.js';
import { env, initEnemyEnv } from './enemy/env.js';
import {
  DEFAULT_KNOCK, ENEMY_HIT_RECOVER, RESPAWN_RISE_TIME, RESPAWN_TIME, en, enemies, hitDir, setEn, type Enemy,
} from './enemy/state.js';
import { isOnDummy, resetDummyStagger, spring, staggerDummy, updateDummyStagger } from './enemy/stagger.js';
import { breakDummy, clearDebris, updateDebris } from './enemy/debris.js';
import {
  AIR_TILT_KICK, ENEMY_SPIKE_BOUNCE, ENEMY_WAIT_MAX, ENEMY_WAIT_MIN, knockEnemy, launchEnemy, playerEye, playerLook,
  poseEnemyTumble, spikeEnemy, updateEnemyAir, updateEnemyGait, updateEnemyKnock, updateEnemyMove, updateEnemyTumble,
} from './enemy/motion.js';
import { DEG, UP } from './math.js';
import { floorAt } from './world/blocks.js';
import { playBounds } from './world/arena.js';
import {
  AIR_ACCEL, AIR_TURN_RATE, BASE_FOV, DASH_CHARGES, DASH_COOLDOWN, DASH_EXIT_SPEED, DASH_RECHARGE, DASH_SPEED,
  DASH_TIME, EYE_HEIGHT, FOV_SPEED_MAX, GRAVITY, GROUND_ACCEL, GROUND_FRICTION, GROUND_TURN_RATE, JUMP_SPEED,
  MAX_FOV_BONUS, OVERSPEED_DECAY, PLAYER_RADIUS, SLIDE_BOOST, SLIDE_BOOST_COOLDOWN, SLIDE_BOOST_MAX, SLIDE_END_SPEED,
  SLIDE_EYE_HEIGHT, SLIDE_FRICTION, SLIDE_START_SPEED, SLIDE_TURN_RATE, SPRINT_SPEED, WALK_SPEED, WALLJUMP_OUT,
  WALLJUMP_UP, WALLRUN_ACCEL, WALLRUN_GRAVITY, WALLRUN_MAX_FALL, WALLRUN_ROLL, WALLRUN_SPEED,
} from './player/config.js';
import { dashDir, forward, player, position, right, velocity, wallNormal, wallTangent, wish } from './player/state.js';
import {
  RAMP_SLIDE_GRAVITY, canKeepWallRun, collideBox, collideCylinder, collideRamp, endWallRun, hasHeadroom,
  initMovement, moveToward, rotateHorizontalToward, setHorizontalSpeed, steerHorizontal, tryMantle, tryMantleBox,
  tryStartWallRun, updateMantle,
} from './player/movement.js';
import { keys, padMove, pressed } from './input.js';
import { easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, easeOutQuart, linear, type Ease } from './ease.js';
import { REST_TIP } from './weapons/kunai.js';
import {
  ATTACKS, COMBO_RESET, DASH_SLASH, GROUND_COMBO, SLASH_1, SLIDE_UP, type AttackDef, type HitDef, type Pose,
  type SwishDef, type V3,
} from './weapons/kunaiAttacks.js';
import {
  CHARGE_POS, CHARGE_TIP, SWORD_ATTACKS, SWORD_BUFFER, SWORD_CHARGE_SLASH, SWORD_COMBO, SWORD_COMBO_RESET,
  SWORD_HIT_ANGLE, SWORD_ISSEN, SWORD_KESA, SWORD_REACH, SWORD_SWEEP, SWORD_THRUST, SWORD_TIP, type SwordAttackDef,
  type SwordKey,
} from './weapons/swordAttacks.js';
import {
  AXE_AIR, AXE_ATTACKS, AXE_BITE_SLOW, AXE_BITE_TIME, AXE_BUFFER, AXE_CHANNELS, AXE_COMBO, AXE_COMBO_RESET,
  AXE_DRIVE, AXE_DRIVE_LIFT, AXE_DRIVE_SPEED, AXE_FLING_LIFT, AXE_FLING_SPEED, AXE_HIT_ANGLE, AXE_JOLT_DAMP,
  AXE_JOLT_KICK, AXE_JOLT_STIFF, AXE_KABUTO, AXE_KESA, AXE_LAUNCH, AXE_REACH, AXE_RUSH, AXE_RUSH_EXIT,
  AXE_RUSH_REACH, AXE_RUSH_SPEED, AXE_RUSH_TIME, AXE_SWEEP, AXE_WHEEL_CUT, AXE_WHEEL_END, AXE_WHEEL_HIT,
  AXE_WHEEL_LIFT, AXE_WHEEL_START, AXE_WHEEL_SWISH, type AxeAttackDef,
} from './weapons/axeAttacks.js';

// ---- 基本セットアップ ----
// 画面のアンチエイリアスは後処理のマルチサンプル描画で行うので、キャンバス側では持たない
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// 地面が遠くで背景に溶け込むよう、背景と霧を同じ色にする
const WORLD_COLOR = 0xc8c8c8;
scene.background = new THREE.Color(WORLD_COLOR);
scene.fog = new THREE.Fog(WORLD_COLOR, 20, 150);

const camera = new THREE.PerspectiveCamera(BASE_FOV,window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, EYE_HEIGHT, 5);

// ---- ライト ----
// 空からの光に、太陽の向きの光を 1 つ足して影を落とす。影は L キーで切り替えて見比べられる。
// 影の届く範囲は視点のまわりだけにして、視点についていく（遠くは霧に溶けるので要らない）
const HEMI_INTENSITY = 2.3; // 影なし
const HEMI_WITH_SUN = 1.75; // 影ありのときは、太陽の分だけ空の光を弱めて明るさを揃える
const SUN_INTENSITY = 1.1;
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.3).normalize(); // 太陽のある向き
const SHADOW_HALF = 50; // 影を落とす範囲の半幅 (m)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, HEMI_WITH_SUN);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const shadowParamOff = new URLSearchParams(location.search).get('shadow') === '0';
let shadowsOn = !shadowParamOff;
function setShadows(on: boolean) {
  shadowsOn = on;
  sun.visible = on;
  hemiLight.intensity = on ? HEMI_WITH_SUN : HEMI_INTENSITY;
}
setShadows(shadowsOn);
// 描くたびに、太陽を視点の真上の方へ置き直す。影がちらつかないよう、1m 刻みでしか動かさない
scene.onBeforeRender = (_r, _s, cam) => {
  // 床のグリッドも視点についていかせる。線は 1m 間隔なので、1m 刻みで動かせば線の位置は変わらない
  grid.position.x = Math.round(cam.position.x);
  grid.position.z = Math.round(cam.position.z);
  if (!shadowsOn) return;
  sun.target.position.set(Math.round(cam.position.x), 0, Math.round(cam.position.z));
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 120);
};

// ---- ステージ ----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshLambertMaterial({ color: 0xffffff }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// 霧は奥行き 150m で背景色になり切るので、視野が最も広いときの画面の端まで見ても 500m 先は見えない。
// 視点のまわり 1000m 四方だけ描き、視点についていかせる
const grid = new THREE.GridHelper(1000, 1000, 0x000000, 0x000000);
grid.position.y = 0.01;
const gridMat = grid.material as THREE.Material;
gridMat.opacity = 0.1;
gridMat.transparent = true;
scene.add(grid);
withGroundReveal(gridMat);

// ---- 敵 ----（体の組み立ては enemy/body.ts）

// ---- 地面の目印: 速さを体感させるための柱と足場 ----
// 5m ごとの濃いグリッド
const grid10 = new THREE.GridHelper(2000, 400, 0x000000, 0x000000);
grid10.position.y = 0.02;
const grid10Mat = grid10.material as THREE.Material;
grid10Mat.opacity = 0.18;
grid10Mat.transparent = true;
withGroundReveal(grid10Mat);
scene.add(grid10);

// ---- アリーナ ----（訓練場の配置は world/arena.ts、箱と坂は world/blocks.ts、せり上がりは world/rise.ts）
scene.add(arenaRoot);

// ---- 武器: クナイ ----（モデルとマテリアルは weapons/ 以下）
const weaponMats = createWeaponMats(renderer);
const kunaiMat = weaponMats.kunai;

// 一人称視点で右手に構えて見せる（カメラの子にする）
scene.add(camera);
const viewModel = new THREE.Group();
const VIEW_MODEL_POS = new THREE.Vector3(0.2, -0.2, -0.35);
viewModel.position.copy(VIEW_MODEL_POS);
camera.add(viewModel);

// 階層: viewModel（揺れ） → attackPivot（攻撃の構え） → kunaiRest（構えの向き）
//       → spinPivot（輪を中心にした回転） → kunai
const attackPivot = new THREE.Group();
viewModel.add(attackPivot);
const kunaiRest = new THREE.Group();
attackPivot.add(kunaiRest);

{
  const toCamera = VIEW_MODEL_POS.clone().negate();
  const faceDir = toCamera.addScaledVector(REST_TIP, -toCamera.dot(REST_TIP)).normalize();
  const sideDir = new THREE.Vector3().crossVectors(REST_TIP, faceDir);
  kunaiRest.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sideDir, REST_TIP, faceDir));
}

const kunai = createKunai(weaponMats);
// 輪に指を掛けてくるくる回せるよう、回転の中心を輪に置く
const spinPivot = new THREE.Group();
spinPivot.position.y = kunai.userData.ringY;
kunai.position.y = -kunai.userData.ringY;
spinPivot.add(kunai);
kunaiRest.add(spinPivot);

// 左手: 指の間に 3 本挟んで扇状に構える（右手の構えを左右反転した位置・向き）
const LEFT_VIEW_MODEL_POS = new THREE.Vector3(-0.26, -0.21, -0.36);
const leftViewModel = new THREE.Group();
leftViewModel.position.copy(LEFT_VIEW_MODEL_POS);
camera.add(leftViewModel);
const leftKunaiRest = new THREE.Group();
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
const LEFT_FAN_ANGLES = [-22, 0, 22].map((a) => THREE.MathUtils.degToRad(-a));
const leftFanPivots: THREE.Group[] = [];
const leftKunais: THREE.Group[] = [];
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
const GUN_VIEW_MODEL_POS = new THREE.Vector3(0.15, -0.13, -0.3);
const gunViewModel = new THREE.Group();
gunViewModel.position.copy(GUN_VIEW_MODEL_POS);
camera.add(gunViewModel);
// 階層: gunViewModel（揺れ・反動・装填） → gunTwirl（構えの向き。原点はトリガーに掛けた指）
//       → gunSpin（指を軸にした縦回転） → revolver
const GUN_REST_ROT = new THREE.Euler(0.04, 0.07, 0);
const TRIGGER_FINGER = new THREE.Vector3(0, -0.05, -0.002); // トリガーガードの中、トリガーのすぐ前
const gunTwirl = new THREE.Group();
gunTwirl.rotation.copy(GUN_REST_ROT);
gunTwirl.position.copy(TRIGGER_FINGER).applyEuler(GUN_REST_ROT);
gunViewModel.add(gunTwirl);
const gunSpin = new THREE.Group();
gunTwirl.add(gunSpin);
const revolver = createRevolver(weaponMats);
revolver.position.copy(TRIGGER_FINGER).negate();
gunSpin.add(revolver);
gunViewModel.visible = false;

// ---- 敵の武器: 自動拳銃 ----
// 敵に拳銃を両手で構えさせる（アイソセレス・スタンス）。
// 銃は体の正面、右目の少し下の高さに置き、腕は 2 関節の IK で手をグリップへ届かせる。
// 右手がグリップを握り、左手はその左下から包むように添える。肘は軽く曲げて下外側へ逃がす
function attachEnemyGun(body: EnemyBody) {
  const gun = createPistol(weaponMats);
  gun.rotation.y = Math.PI; // 銃口（-Z）を敵の正面（+Z）へ
  gun.position.set(-0.04, 1.6, 0.6).sub(body.gunRig.userData.origin);
  gun.rotation.x = -0.03; // 銃口をわずかに上げて照準線を水平に
  body.gunRig.add(gun);
  {
    // グリップの握る所（銃の座標で後ろへ 0.04、下へ 0.06）を敵の座標へ
    const grip = new THREE.Vector3(0, -0.06, 0.04).applyEuler(gun.rotation).add(gun.position);
    const hands = [grip, grip.clone().add(new THREE.Vector3(0.04, -0.015, 0.012))];
    const shoulder = new THREE.Vector3();
    const toHand = new THREE.Vector3();
    const bend = new THREE.Vector3();
    const elbow = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const DOWN = new THREE.Vector3(0, -1, 0);
    const upperQ = new THREE.Quaternion();
    const foreQ = new THREE.Quaternion();
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const arm = body.arms[i];
      shoulder.copy(arm.position);
      toHand.subVectors(hands[i], shoulder);
      const d = Math.min(toHand.length(), DUMMY_UPPER_ARM + DUMMY_FOREARM - 1e-3);
      toHand.normalize();
      // 余弦定理で肩の開き角を出し、肘を「下外側」の向きへ出す
      const cosA = (DUMMY_UPPER_ARM ** 2 + d * d - DUMMY_FOREARM ** 2) / (2 * DUMMY_UPPER_ARM * d);
      const a = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
      bend.set(0.6 * side, -1, -0.2);
      bend.addScaledVector(toHand, -bend.dot(toHand)).normalize();
      elbow.copy(shoulder).addScaledVector(toHand, Math.cos(a) * DUMMY_UPPER_ARM).addScaledVector(bend, Math.sin(a) * DUMMY_UPPER_ARM);
      upperQ.setFromUnitVectors(DOWN, dir.subVectors(elbow, shoulder).normalize());
      arm.quaternion.copy(upperQ);
      // 前腕は肘から手へ。上腕の回転を打ち消してローカルの向きにする
      foreQ.setFromUnitVectors(DOWN, dir.subVectors(hands[i], elbow).normalize());
      body.forearms[i].quaternion.copy(upperQ.invert()).multiply(foreQ);
    }
  }
  return gun;
}

// ---- 武器: 剣 ----
// 右手で柄を握り、刃を前上方へ立てて構える
const swordViewModel = new THREE.Group();
swordViewModel.position.copy(SWORD_VIEW_MODEL_POS);
camera.add(swordViewModel);
const swordRest = new THREE.Group();
swordViewModel.add(swordRest);
swordRest.quaternion.copy(SWORD_STAND_QUAT);
const swordRestQuat = SWORD_STAND_QUAT.clone(); // 今の移動状態での構えの向き（攻撃していないときはこの向きで持つ）
let swordRunPose = 0; // 0 = 縦に立てた構え, 1 = 走るときの前へ倒した構え
let swordSlidePose = 0; // 1 = スライディング中の横に寝かせた構え
const sword = createSword(weaponMats);
// 握った手を軸に、刃の面の中で剣を回す（くるくる回す動きに使う）
const swordSpin = new THREE.Group();
swordRest.add(swordSpin);
swordSpin.add(sword);
swordViewModel.visible = false;

// ---- 武器: 鎖鎌 ----
// 刃と金具はクナイと同じ黒光り、柄は剣の柄と同じ色。握りの巻きは一段暗くする
// 左右の手に 1 本ずつ持つ。揺れは 2 本まとめて付ける
const sickleViewModel = new THREE.Group();
sickleViewModel.position.copy(SICKLE_VIEW_MODEL_POS);
camera.add(sickleViewModel);
const sickleMats = { metal: kunaiMat, shaft: weaponMats.swordHilt, wrap: weaponMats.sickleWrap };
const rightSickle = createHeldSickle(sickleMats, 1);
const leftSickle = createHeldSickle(sickleMats, -1);
sickleViewModel.add(rightSickle, leftSickle);
sickleViewModel.visible = false;

// ---- 武器: バトルアックス ----
// 頭はクナイと同じ黒光り、柄は鎖鎌の巻きと同じ暗い色。両手で握る
const axeViewModel = new THREE.Group();
// 視点を回したときの揺れ（重さで遅れて付いてくる）
const AXE_SWAY_GAIN = 1.4;
const AXE_SWAY_STIFF = 90;
const AXE_SWAY_DAMP = 11;
let axeSwayX = 0;
let axeSwayY = 0;
let axeSwayVelX = 0;
let axeSwayVelY = 0;
axeViewModel.position.copy(AXE_VIEW_MODEL_POS);
camera.add(axeViewModel);
const heldAxe = createHeldAxe({ metal: kunaiMat, grip: weaponMats.sickleWrap });
const axeRest = heldAxe.userData.rest as THREE.Group;
const heldAxeModel = heldAxe.userData.axe as THREE.Group;
axeViewModel.add(heldAxe);
axeViewModel.visible = false;

// ---- 武器: チャクラム ----
// 全体をクナイと同じ黒光りにする。右手で持つ
const chakramViewModel = new THREE.Group();
chakramViewModel.position.copy(CHAKRAM_VIEW_MODEL_POS);
camera.add(chakramViewModel);
const heldChakram = createHeldChakram({ metal: kunaiMat });
const chakramRest = heldChakram.userData.rest as THREE.Group;
chakramViewModel.add(heldChakram);
chakramViewModel.visible = false;

// ---- 武器の切り替え ----
// 持ち替えは「今の武器を下げる → 入れ替える → 新しい武器を上げる」
let wantWeapon: WeaponId = 'kunai'; // 数字キーで選んだ武器
let shownWeapon: WeaponId = 'kunai'; // 今手に持っている武器
let holster = 0; // 0 = 構えている, 1 = 画面の下へ下げきった
const HOLSTER_TIME = 0.14;

// ---- 操作 ----
// PointerLockControls はマウスの移動量をそのまま足すので、Chrome がまれに送ってくる
// 異常に大きな移動量で視点が飛ぶ。生のマウス入力を使い、飛んだ値は捨てる自前の実装にする
const LOOK_SPEED = 0.002;

// ---- オプション ----（値と画面は ui/options.ts）
// LinearToneMapping は露出を掛けるだけなので、明るさ 1 なら今までと同じ見た目になる
renderer.toneMapping = THREE.LinearToneMapping;
function applyBrightness() {
  renderer.toneMappingExposure = options.brightness;
}
applyBrightness();
// isLocked は「プレイ中」の意味で使う。マウスではポインターロックと一緒に切り替わり、
// パッドで始めたときはロックなしでプレイ中にする（padPlaying）
const controls = { isLocked: false };
let menuRedraw = true; // 止まっているメニューの画面で、次のフレームに 1 度だけ描き直す
let padPlaying = false;
let fromPad = false; // パッドのボタンから送ったキー操作を処理している間だけ true
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
let skipNextMove = false;
let recentMove = 0; // 直近の移動量のならし
async function lockPointer() {
  try {
    // OS のマウス加速を通さない生の移動量。これを使うと飛びの原因そのものが起きにくい
    await document.body.requestPointerLock({ unadjustedMovement: true });
  } catch {
    try {
      await document.body.requestPointerLock();
    } catch {
      // 連続クリック等で弾かれたときは、もう一度クリックしてもらう
    }
  }
}
// タイトル / 一時停止の画面。最初はタイトル、一度始めたら Esc で出る一時停止の画面として使い回す
const overlay = document.getElementById('overlay')!;
function startFromOverlay() {
  ensureAudio(); // 音はユーザー操作の中でしか始められない
  showPanel(null);
  // パッドのボタンはブラウザがユーザー操作とみなさないので、ポインターロックを始められない。ロックなしで始める
  if (fromPad) {
    padPlaying = true;
    setPlaying(true);
  } else {
    lockPointer();
  }
}
// 一時停止にする。ロック中なら外せば pointerlockchange から止まる
function pauseGame() {
  if (document.pointerLockElement) return document.exitPointerLock();
  padPlaying = false;
  setPlaying(false);
}
const PANELS = ['options'] as const;
function showPanel(name: (typeof PANELS)[number] | null) {
  for (const n of PANELS) {
    overlay.classList.toggle(`show-${n}`, n === name);
    for (const b of overlay.querySelectorAll(`[data-action="${n}"]`)) b.classList.toggle('active', n === name);
  }
}
function togglePanel(name: (typeof PANELS)[number]) {
  const on = !overlay.classList.contains(`show-${name}`);
  showPanel(on ? name : null);
  if (on) sfx.playUiOpen();
  else sfx.playUiBack();
  if (on && name === 'options') renderOptions();
}
initOptions({ onBrightness: applyBrightness, onQuality: applyQuality, onClose: () => togglePanel('options') });
// タイトルでは、本編（GAME）か訓練場（TRAINING）かを選ぶ。今の場所は訓練場として使う
const overlayPrompt = overlay.querySelector('.foot .prompt')!;
// ---- ステージ選択 ----
// GAME を押すと、ステージと難易度を選ぶ画面を出す。START でそのステージへ入る。
// 難易度は次に開いたときのために覚えておく
const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
const DIFFICULTY_STORE = 'fast-finish.difficulty';
const overlayStatus = overlay.querySelector('.foot .status')!;
const stageButtons = [...overlay.querySelectorAll<HTMLElement>('.stage-list [data-stage]')];
const difficultyButtons = [...overlay.querySelectorAll<HTMLElement>('.si-diff [data-difficulty]')];
const stageSelectable = (i: number) => stageButtons[i]?.getAttribute('aria-disabled') !== 'true';
let stageIndex = 0;
let difficultyIndex = 1;
try {
  const saved = DIFFICULTIES.indexOf(localStorage.getItem(DIFFICULTY_STORE) as (typeof DIFFICULTIES)[number]);
  if (saved >= 0) difficultyIndex = saved;
} catch {
  // 保存できない環境では毎回 NORMAL から
}
function selectStage(i: number) {
  stageIndex = i;
  stageButtons.forEach((b, j) => b.classList.toggle('active', j === i));
  showStageInfo();
  if (overlay.classList.contains('select-stage')) showStagePreview(selectedStageId());
  showStageBest();
}
// 選んでいるステージ。まだ入れないもの（LOCKED）は null
function selectedStageId(): StageId | null {
  const id = stageButtons[stageIndex]?.dataset.stage;
  return id && id in STAGE_BUILDERS ? (id as StageId) : null;
}
// 詳細欄の番号と名前を、選んでいるステージのボタンから写す。選び直したときは、番号と名前を出し直しの動きで入れ替える
const stageInfo = overlay.querySelector<HTMLElement>('.stage-info')!;
const stageInfoNo = stageInfo.querySelector<HTMLElement>('.si-no')!;
const stageInfoTitle = stageInfo.querySelector<HTMLElement>('.si-title')!;
function showStageInfo() {
  const btn = stageButtons[stageIndex];
  if (!btn) return;
  const no = btn.querySelector('.no')?.textContent ?? '';
  if (stageInfoNo.dataset.no === no) return;
  stageInfoNo.dataset.no = stageInfoNo.textContent = no;
  stageInfoTitle.querySelector('b')!.textContent = btn.querySelector('span:not(.no)')?.textContent ?? '';
  stageInfoTitle.querySelector('span')!.textContent = btn.querySelector('small')?.textContent ?? '';
  // 動きを頭からやり直す（見出しの入りと、番号の線の数字の持ち上がり）
  const head = stageInfo.querySelector<HTMLElement>('.si-head')!;
  head.style.animation = 'none';
  stageInfoNo.classList.add('swap');
  void head.offsetWidth;
  head.style.animation = '';
  stageInfoNo.classList.remove('swap');
}
function selectDifficulty(i: number) {
  difficultyIndex = i;
  difficultyButtons.forEach((b, j) => b.classList.toggle('active', j === i));
  showStageBest();
  try {
    localStorage.setItem(DIFFICULTY_STORE, DIFFICULTIES[i]);
  } catch {
    // 覚えられなくても選ぶことはできる
  }
}
// ステージ選択の BEST に、選んでいるステージと難易度の自己ベストを出す
const bestTimeEl = overlay.querySelector<HTMLElement>('[data-best="time"]')!;
const bestScoreEl = overlay.querySelector<HTMLElement>('[data-best="score"]')!;
function showStageBest() {
  const id = stageButtons[stageIndex]?.dataset.stage;
  const best = id ? loadBest(id, DIFFICULTIES[difficultyIndex]) : null;
  bestTimeEl.textContent = best ? fmtTime(best.time) : '--:--.--';
  bestScoreEl.textContent = best ? Math.round(best.score).toLocaleString('en-US') : '—';
  bestTimeEl.classList.toggle('set', !!best);
  bestScoreEl.classList.toggle('set', !!best);
}
selectStage(stageIndex);
selectDifficulty(difficultyIndex);
function setStageSelect(on: boolean) {
  overlay.classList.toggle('select-stage', on);
  hidePicker();
  showStagePreview(on ? selectedStageId() : null);
  overlayPrompt.textContent = on ? 'SELECT STAGE' : 'SELECT MODE';
  overlayStatus.textContent = on ? 'ESC — BACK' : 'ESC — PAUSE';
  // START を押したのにロックできずに戻ったときは、訓練場へ入る設定に戻す
  if (!on) {
    pendingStage = null;
    transitionLabel.textContent = 'TRAINING';
    overlayKicker = 'FAST FINISH — TRAINING';
  }
}
// 上下で、選べるステージだけを渡り歩く。端より先へは進まない
function stepStage(dir: number) {
  for (let i = stageIndex + dir; i >= 0 && i < stageButtons.length; i += dir) {
    if (!stageSelectable(i)) continue;
    sfx.playUiHover();
    return selectStage(i);
  }
  sfx.playUiDenied();
}
function stepDifficulty(dir: number) {
  const i = THREE.MathUtils.clamp(difficultyIndex + dir, 0, DIFFICULTIES.length - 1);
  if (i === difficultyIndex) return sfx.playUiDenied();
  sfx.playUiHover();
  selectDifficulty(i);
}
const transitionLabel = document.querySelector('#transition .label')!;
let overlayKicker = 'FAST FINISH — TRAINING'; // 入った後の一時停止の画面に出す、今いる場所
function startStage() {
  const id = selectedStageId();
  if (!id) return sfx.playUiDenied();
  sfx.playUiSelect();
  pendingStage = id;
  const name = id.toUpperCase();
  transitionLabel.textContent = name;
  overlayKicker = `FAST FINISH — ${name} / ${DIFFICULTIES[difficultyIndex].toUpperCase()}`;
  startFromOverlay();
}
function onStageSelectClick(target: HTMLElement) {
  if (pickerOpen()) return onPickerClick(target);
  if (target.closest('[data-action="weapon-open"]')) return openPicker();
  if (target.closest('[data-action="stage-back"]')) {
    sfx.playUiBack();
    return setStageSelect(false);
  }
  if (target.closest('[data-action="stage-start"]')) return startStage();
  const stage = target.closest<HTMLElement>('[data-stage]');
  if (stage) {
    const i = stageButtons.indexOf(stage);
    if (!stageSelectable(i)) return sfx.playUiDenied();
    if (i !== stageIndex) sfx.playUiSelect();
    return selectStage(i);
  }
  const diff = target.closest<HTMLElement>('[data-difficulty]');
  if (diff) {
    const i = difficultyButtons.indexOf(diff);
    if (i !== difficultyIndex) sfx.playUiSelect();
    return selectDifficulty(i);
  }
}
function onStageSelectKey(e: KeyboardEvent) {
  if (pickerOpen()) return onPickerKey(e);
  switch (e.code) {
    case 'Escape':
      sfx.playUiBack();
      return setStageSelect(false);
    case 'Enter':
    case 'NumpadEnter':
      e.preventDefault();
      return startStage();
    case 'ArrowUp':
    case 'KeyW':
      e.preventDefault();
      return stepStage(-1);
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      return stepStage(1);
    case 'ArrowLeft':
    case 'KeyA':
      e.preventDefault();
      return stepDifficulty(-1);
    case 'ArrowRight':
    case 'KeyD':
      e.preventDefault();
      return stepDifficulty(1);
    // 武器の選択画面を開く（パッドの Y も Q として届く）
    case 'KeyQ':
      return openPicker();
  }
}
// タイトルへ戻る。ゲームの状態はあちこちの変数に散らばっているので、読み込み直して最初からにする。
// 画面を靄で覆いきってから読み込むので、切り替わりの継ぎ目は見えない
function quitToTitle() {
  if (overlay.classList.contains('quitting')) return;
  overlay.classList.add('quitting');
  setTimeout(() => location.reload(), 380);
}
// 倒れたステージをやり直す。タイトルへ戻るのと同じく読み込み直し、そのステージを選んだステージ選択から始める
// （ポインターロックと音はユーザー操作が無いと始められないので、入るのは START を押してから）
const RETRY_STORE = 'fast-finish.retry';
function retryStage() {
  try {
    sessionStorage.setItem(RETRY_STORE, String(stageIndex));
  } catch {
    // 覚えておけない環境では、ただタイトルへ戻る
  }
  quitToTitle();
}
function restoreRetry() {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(RETRY_STORE);
    sessionStorage.removeItem(RETRY_STORE);
  } catch {
    return;
  }
  const i = Number(saved);
  if (saved === null || !stageSelectable(i)) return;
  selectStage(i);
  setStageSelect(true);
}
function decideGameOver(choice: 'retry' | 'title') {
  sfx.playUiSelect();
  if (choice === 'retry') retryStage();
  else quitToTitle();
}
overlay.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('[data-action="title"]')) {
    sfx.playUiSelect();
    return quitToTitle();
  }
  if (target.closest('[data-action="options"]')) return togglePanel('options');
  if (target.closest('.options')) return onOptionsClick(target);
  // 結果の画面では TITLE 以外を受け付けない（倒しきった勢いのクリックで何か起きないように）
  if (overlay.classList.contains('result')) return;
  if (overlay.classList.contains('over')) {
    if (target.closest('[data-action="retry"]')) decideGameOver('retry');
    return;
  }
  if (overlay.classList.contains('title')) {
    if (overlay.classList.contains('select-stage')) return onStageSelectClick(target);
    if (target.closest('[data-action="game"]')) {
      sfx.playUiOpen();
      return setStageSelect(true);
    }
    // タイトルでは、項目以外をクリックしても何もしない
    if (target.closest('[aria-disabled="true"]')) return sfx.playUiDenied();
    if (target.closest('[data-action="training"]')) {
      sfx.playUiSelect();
      return startFromOverlay();
    }
    return;
  }
  sfx.playUiSelect();
  startFromOverlay();
});
// 項目に乗ったら小さく鳴らす（同じ項目の中を動いている間は鳴らさない。選べない項目は鳴らさない）
let hoveredButton: Element | null = null;
overlay.addEventListener('mouseover', (e) => {
  const button = (e.target as HTMLElement).closest('.menu button, .si-diff button, .sw-slot, .sw-rows button, .sw-win .menu button, .opt button');
  if (button === hoveredButton) return;
  hoveredButton = button;
  if (button && button.getAttribute('aria-disabled') !== 'true') sfx.playUiHover();
});
// UI の音はユーザー操作の中でしか始められないので、最初に触れたときに用意する
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => sfx.ensureUiAudio(), { capture: true });
window.addEventListener('keydown', (e) => {
  if (controls.isLocked || overlay.classList.contains('hidden')) return;
  if (overlay.classList.contains('select-stage')) return onStageSelectKey(e);
  if (overlay.classList.contains('show-options')) return onOptionsKey(e);
  if (overlay.classList.contains('result')) {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'KeyQ') return;
    e.preventDefault();
    if (skipResult()) return; // 演出の途中なら、まず最後まで飛ばす
    sfx.playUiSelect();
    return quitToTitle();
  }
  // ゲームオーバー: 上下で選んで ENTER で決める。R はやり直し、Q はタイトルへすぐ
  if (overlay.classList.contains('over')) {
    const dir = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 }[e.code];
    if (dir) {
      e.preventDefault();
      if (stepGameOverMenu(dir)) sfx.playUiHover();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      decideGameOver(gameOverChoice());
    } else if (e.code === 'KeyR') {
      decideGameOver('retry');
    } else if (e.code === 'KeyQ') {
      decideGameOver('title');
    }
    return;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    sfx.playUiSelect();
    startFromOverlay(); // タイトルでは TRAINING、一時停止では RESUME
  } else if (e.code === 'KeyQ' && overlay.classList.contains('pause')) {
    sfx.playUiSelect();
    quitToTitle();
  } else if (e.code === 'KeyO') {
    togglePanel('options');
  }
});
// 訓練場へ入るときは、タイトルをすぐには消さずに払い出す。切り替えの帯で覆いきったら（switchToStage）、
// 一時停止の画面に作り替える
function endOverlayLeave() {
  if (!overlay.classList.contains('leaving')) return;
  overlay.classList.remove('leaving');
  overlay.classList.toggle('hidden', controls.isLocked);
  // 一度始めたら、以降は一時停止の画面にする
  overlay.classList.replace('title', 'pause');
  overlay.classList.remove('select-stage');
  overlay.querySelector('[data-action="start"] .label')!.textContent = 'RESUME';
  overlay.querySelector('.kicker')!.textContent = overlayKicker;
  overlayStatus.textContent = 'ESC — PAUSE';
  overlayPrompt.textContent = 'CLICK TO RESUME';
}
function setPlaying(on: boolean) {
  document.body.classList.toggle('pad-playing', on && padPlaying); // パッドで遊んでいる間はカーソルを隠す
  if (controls.isLocked === on) return;
  controls.isLocked = on;
  menuRedraw = true;
  // 止めている間は音も HUD の動きも止める
  sfx.setAudioPaused(!controls.isLocked);
  document.body.classList.toggle('paused', !controls.isLocked);
  if (controls.isLocked && overlay.classList.contains('title') && !overlay.classList.contains('leaving')) {
    overlay.classList.add('leaving');
    startStageIntro();
  } else {
    // 払い出しの途中で止められたら、その場で一時停止の画面にする
    endOverlayLeave();
    overlay.classList.toggle('hidden', controls.isLocked);
    if (!controls.isLocked && !overlay.classList.contains('quitting') && !overlay.classList.contains('result') && !overlay.classList.contains('over')) sfx.playUiPause();
  }
}
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === document.body;
  // パッドで遊んでいる途中にクリックでロックしたら、そこからはマウスで遊んでいる扱いにする
  if (locked) padPlaying = false;
  setPlaying(locked);
  // ロック直後の最初の移動量は、カーソルの飛びを含むことがあるので捨てる
  skipNextMove = true;
  recentMove = 0;
});
// 視点を回す（ラジアン）。マウスとパッドの右スティックで共用する
function turnView(yaw: number, pitch: number) {
  if (isDown()) return; // 倒れている間は見回せない
  lookEuler.setFromQuaternion(camera.quaternion);
  lookEuler.y -= yaw;
  lookEuler.x -= pitch;
  viewSpin += yaw;
  lookEuler.x = THREE.MathUtils.clamp(lookEuler.x, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
  lookEuler.z = 0;
  camera.quaternion.setFromEuler(lookEuler);
}
// ズーム中は視野の狭さに合わせて視点の動きを細かくし、狙いを付けやすくする
const zoomLookScale = () => Math.min(1, camera.fov / BASE_FOV);
document.addEventListener('mousemove', (e) => {
  // パッドで遊んでいる間（ロックなし）は、カーソルの動きで視点を回さない
  if (document.pointerLockElement !== document.body) return;
  if (skipNextMove) {
    skipNextMove = false;
    return;
  }
  const move = Math.hypot(e.movementX, e.movementY);
  // 直前までの動きから急に桁違いの値が来たら、手の動きではないとみなして捨てる
  if (move > 250 && move > recentMove * 8 + 50) return;
  recentMove += (move - recentMove) * 0.3;
  if (move > 2) usingPad = false; // マウスに持ち替えたらエイムアシストを切る

  const look = LOOK_SPEED * options.mouseSens * zoomLookScale();
  turnView(e.movementX * look, e.movementY * look);
});

window.addEventListener('keydown', (e) => {
  if (!controls.isLocked) return; // タイトル / 一時停止の間のキーはゲームに渡さない
  // ロックしていないと Esc でロックが外れないので、自分で一時停止にする
  if (e.code === 'Escape' && padPlaying) return pauseGame();
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);
  if (WEAPON_KEYS[e.code]) wantWeapon = WEAPON_KEYS[e.code];
  if (e.code === 'KeyR' && !e.repeat) reloadQueued = tossPressed = true;
  // 聴き比べ用: G で銃声の案を切り替え、その場で 1 発鳴らす
  // 影の見比べ: L で切り替える
  if (e.code === 'KeyL' && !e.repeat) {
    setShadows(!shadowsOn);
    showToast(`影: ${shadowsOn ? 'あり' : 'なし'}`);
  }
  if (e.code === 'KeyG' && !e.repeat) {
    showToast(`銃声: ${sfx.cycleGunVariant()}`);
    sfx.playGunshot();
  }
  // 体力ゲージの確認用: H でダメージ、J で回復
  if (e.code === 'KeyH') damagePlayer(12);
  if (e.code === 'KeyJ') healPlayer(25);
});

const toast = document.createElement('div');
toast.style.cssText =
  'position:fixed;left:50%;top:18%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;' +
  'background:rgba(0,0,0,0.6);color:#fff;font:15px sans-serif;pointer-events:none;opacity:0;transition:opacity 0.3s';
document.body.appendChild(toast);
let toastTimer = 0;
function showToast(text: string) {
  toast.textContent = text;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.style.opacity = '0'), 1200);
}
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
// ロックしていればよそへ移ったときにロックが外れて止まる。パッドで遊んでいる間は自分で止める
window.addEventListener('blur', () => {
  if (padPlaying) pauseGame();
});
const isSprintKey = (code: string) => code === 'ShiftLeft' || code === 'ShiftRight';

let attackPressed = false;
let attackHeld = false; // 左クリックを押し続けているか
document.addEventListener('mousedown', (e) => {
  // パッドで遊んでいる途中でマウスに持ち替えたら、そのクリックでロックする
  if (padPlaying && !document.pointerLockElement) lockPointer();
  if (controls.isLocked && e.button === 0) {
    attackPressed = true;
    attackHeld = true;
  }
  if (controls.isLocked && e.button === 2) throwHeld = throwPressed = focusPressed = axeLaunchPressed = deadEyePressed = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) attackHeld = false;
  if (e.button === 2) throwHeld = false;
});
window.addEventListener('blur', () => (attackHeld = false));
document.addEventListener('contextmenu', (e) => e.preventDefault());
let throwHeld = false; // 右クリックを押し続けているか

// 視点を動かしたときにクナイを遅れてついてこさせるための量
let lookSwayX = 0;
let lookSwayY = 0;
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== document.body) return;
  lookSwayX = THREE.MathUtils.clamp(lookSwayX + e.movementX * 0.0005, -0.06, 0.06);
  lookSwayY = THREE.MathUtils.clamp(lookSwayY + e.movementY * 0.0005, -0.06, 0.06);
});

// ---- ゲームパッドの割り当て ----
// ボタンはキーに置き換えて keys / pressed に入れ、キーボードと同じ処理を通す
const PAD_KEYS: [number, string][] = [
  [PAD.A, 'Space'], // ジャンプ
  [PAD.B, 'KeyC'], // スライド
  [PAD.L3, 'ShiftLeft'], // ダッシュ
];
const PAD_WEAPONS: [number, WeaponId][] = [
  [PAD.UP, 'kunai'],
  [PAD.RIGHT, 'handgun'],
  [PAD.DOWN, 'sword'],
  [PAD.LEFT, 'sickle'],
];
const WEAPON_ORDER: WeaponId[] = ['kunai', 'handgun', 'sword', 'sickle', 'axe', 'chakram']; // LB / RB で順に回す
// タイトル / 一時停止の画面では、メニューのキー操作に置き換える
const PAD_MENU_KEYS: [number, string][] = [
  [PAD.A, 'Enter'],
  [PAD.START, 'Enter'],
  [PAD.B, 'Escape'],
  [PAD.Y, 'KeyQ'], // 一時停止からタイトルへ
  [PAD.X, 'KeyO'], // オプション
  [PAD.UP, 'ArrowUp'],
  [PAD.DOWN, 'ArrowDown'],
  [PAD.LEFT, 'ArrowLeft'],
  [PAD.RIGHT, 'ArrowRight'],
  [PAD.LB, 'PageUp'], // 武器の選択画面でカーソルを動かす
  [PAD.RB, 'PageDown'],
];
const PAD_LOOK_SPEED = 4.2; // 右スティックを倒しきったときの視点の速さ (rad/s)
const PAD_LOOK_CURVE = 2.2; // 小さく倒したときに細かく狙えるよう、倒した量を累乗して使う
const PAD_SPRINT = 0.9; // 左スティックをこれ以上倒すと走る
let padSprint = false;

function sendPadKey(code: string) {
  fromPad = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
  fromPad = false;
}

// 毎フレーム、ゲームの更新の前に呼ぶ（dt は実時間。視点の速さはスローの影響を受けない）
// パッドの遅れを調べる: ?pad で、入力が届く間隔とフレームの間隔を 1 秒ごとに左上へ出す
const padDebug = new URLSearchParams(location.search).has('pad') ? document.createElement('div') : null;
if (padDebug) {
  padDebug.style.cssText =
    'position:fixed;left:12px;top:12px;z-index:100;padding:6px 10px;background:rgba(0,0,0,0.6);color:#fff;' +
    'font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre;pointer-events:none';
  document.body.appendChild(padDebug);
}
// エイムアシストの状態は毎フレーム書き換える
const padAssistEl = padDebug ? document.createElement('div') : null;
if (padAssistEl) {
  padAssistEl.style.cssText = padDebug!.style.cssText.replace('top:12px', 'top:64px');
  document.body.appendChild(padAssistEl);
}
let padLastStamp = 0;
let padDebugT = 0;
const padGaps: number[] = [];
const frameGaps: number[] = [];
function updatePadDebug(dt: number, stamp: number) {
  if (!padDebug) return;
  frameGaps.push(dt * 1000);
  // 時刻が変わったときだけ新しい入力が届いている（スティックを動かしている間に見る）
  if (stamp && stamp !== padLastStamp) {
    if (padLastStamp) padGaps.push(stamp - padLastStamp);
    padLastStamp = stamp;
  }
  padDebugT += dt;
  if (padDebugT < 1) return;
  padDebugT = 0;
  const fmt = (a: number[]) =>
    a.length ? `平均 ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1)} / 最大 ${Math.max(...a).toFixed(1)} ms` : '—';
  padDebug.textContent =
    `入力  ${fmt(padGaps)}  (${padGaps.length} 回/秒)\n` +
    `描画  ${fmt(frameGaps)}  (${frameGaps.length} fps, 50ms 超え ${frameGaps.filter((v) => v > 50).length})`;
  padGaps.length = frameGaps.length = 0;
}

function updatePad(dt: number) {
  const pad = pollPad();
  updatePadDebug(dt, pad.timestamp);
  // 離したことはどの画面でも反映する（押したまま一時停止して、そこで離すこともある）
  for (const [b, code] of PAD_KEYS) if (pad.up[b]) keys.delete(code);
  if (pad.up[PAD.RT]) attackHeld = false;
  if (pad.up[PAD.LT]) throwHeld = false;
  padMove.x = padMove.y = 0;
  padSprint = false;
  if (!pad.connected) return;

  if (!controls.isLocked) {
    if (overlay.classList.contains('hidden') || overlay.classList.contains('leaving')) return;
    for (const [b, code] of PAD_MENU_KEYS) if (pad.down[b]) return sendPadKey(code);
    return;
  }
  if (pad.down[PAD.START]) return pauseGame();

  for (const [b, code] of PAD_KEYS) {
    if (!pad.down[b]) continue;
    keys.add(code);
    pressed.add(code);
  }
  if (pad.down[PAD.RT]) attackPressed = attackHeld = true;
  if (pad.down[PAD.LT]) throwHeld = throwPressed = focusPressed = axeLaunchPressed = deadEyePressed = true;
  if (pad.down[PAD.X]) reloadQueued = tossPressed = true;
  const cycle = (pad.down[PAD.RB] ? 1 : 0) - (pad.down[PAD.LB] ? 1 : 0);
  if (cycle) wantWeapon = WEAPON_ORDER[(WEAPON_ORDER.indexOf(wantWeapon) + cycle + WEAPON_ORDER.length) % WEAPON_ORDER.length];
  for (const [b, id] of PAD_WEAPONS) if (pad.down[b]) wantWeapon = id;

  padMove.x = pad.lx;
  padMove.y = -pad.ly;
  padSprint = Math.hypot(pad.lx, pad.ly) >= PAD_SPRINT;

  const m = Math.hypot(pad.rx, pad.ry);
  if (m > 0 || padSprint || pad.lx || pad.ly || pad.down.some(Boolean)) usingPad = true;
  const target = findAssistTarget();
  // 敵の近くでは視点を遅くし、スティックか体を動かしている間だけ照準を胸へ寄せる（止まっていると勝手には動かさない）
  let slow = 1;
  if (target) {
    const near = 1 - target.angle / target.size; // 範囲の端で 0、胸の真上で 1
    slow = 1 - (1 - ASSIST_SLOW) * near;
    const active = Math.min(1, Math.max(m, Math.hypot(pad.lx, pad.ly)));
    const pull = 1 - Math.exp(-ASSIST_PULL * active * dt);
    if (pull > 0) turnView(target.yaw * pull, -target.pitch * pull);
  }
  if (padAssistEl) {
    padAssistEl.textContent = !usingPad
      ? 'アシスト  切（マウス操作中）'
      : shownWeapon !== 'kunai' && shownWeapon !== 'handgun'
        ? 'アシスト  切（クナイ / 銃以外）'
        : target
          ? `アシスト  ● 捕捉中  ずれ ${(target.angle / DEG).toFixed(1)}° / 範囲 ${(target.size / DEG).toFixed(1)}°  速さ ×${slow.toFixed(2)}${target.angle < target.size * ASSIST_SNAP ? '  弾補正' : ''}`
          : 'アシスト  ○ 範囲外';
  }
  if (m > 0) {
    const k = (Math.pow(m, PAD_LOOK_CURVE) / m) * PAD_LOOK_SPEED * options.padSens * dt * zoomLookScale() * slow;
    turnView(pad.rx * k, pad.ry * k);
    // マウスと同じく、回した量の 1/4 だけ武器を遅らせる
    lookSwayX = THREE.MathUtils.clamp(lookSwayX + pad.rx * k * 0.25, -0.06, 0.06);
    lookSwayY = THREE.MathUtils.clamp(lookSwayY + pad.ry * k * 0.25, -0.06, 0.06);
  }
}

// ---- HUD: ダッシュの残り回数（クロスヘア左右の円弧。左が 1 回目、右が 2 回目） ----
const dashGauges = [...document.querySelectorAll<SVGPathElement>('#crosshair .gauge')];
// ---- HUD: 鎖鎌の引き寄せの残り回数（クロスヘアの下の斜めの帯 2 本。左から使い、左から溜まる）。鎖鎌を構えている間だけ出す ----
const hookHud = document.getElementById('hookgauge')!;
const hookCells = [...hookHud.querySelectorAll<HTMLElement>('.cell')];
const hookFills = hookCells.map((c) => c.querySelector<HTMLElement>('.f')!);
let hookShown = -1; // 表示に反映済みの残り回数
function updateHookHud() {
  hookHud.style.opacity = shownWeapon === 'sickle' ? '1' : '0';
  hookHud.classList.toggle('empty', hookEmptyFlash > 0);
  for (let i = 0; i < hookCells.length; i++) {
    const fill = i < hookCharges ? 1 : i === hookCharges ? hookRecharge / HOOK_RECHARGE : 0;
    hookFills[i].style.transform = `scaleX(${fill.toFixed(3)})`;
    hookCells[i].classList.toggle('ready', i < hookCharges);
    // 溜まりきった帯を光らせる（最初の表示では光らせない）
    if (hookShown >= 0 && i >= hookShown && i < hookCharges) {
      hookCells[i].classList.remove('gain');
      void hookCells[i].offsetWidth; // 続けて溜まったときも頭から再生し直す
      hookCells[i].classList.add('gain');
    }
  }
  hookShown = hookCharges;
}

// ---- HUD: 体力（左下の斜めのバー。削れた分は白く残り、少し遅れて減る） ----
const PLAYER_MAX_HP = 100;
const HP_CHIP_HOLD = 0.45; // 白い残りが減り始めるまでの時間
const HP_CHIP_DRAIN = 75; // 白い残りが減る速さ (HP/秒)
const HP_LOW = 30; // これ以下でバーを点滅させる
const HP_HEAVY = 25; // これ以上のダメージは大きく揺らす
let playerHp = PLAYER_MAX_HP;
let hpShown = PLAYER_MAX_HP; // 表示中の量。減るときは即座に、回復は滑らかに追いつく
let hpChip = PLAYER_MAX_HP; // 白く残っている所までの量
let hpChipHold = 0;
let hpCount = PLAYER_MAX_HP; // 数字に出している量。減るときは一気に数え下ろす
const HP_COUNT_SPEED = 140; // 数え下ろす速さ (HP/秒)
const hpHud = document.getElementById('hp')!;
const hpNumRow = hpHud.querySelector<HTMLElement>('.num')!;
const hpNum = hpNumRow.querySelector<HTMLElement>('span')!;
const hpBar = hpHud.querySelector<HTMLElement>('.bar')!;
const hpFill = hpBar.querySelector<HTMLElement>('.f')!;
const hpChipBar = hpBar.querySelector<HTMLElement>('.c')!;
const hurtFlash = document.querySelector<HTMLElement>('#hurt .flash')!;
const hurtLow = document.querySelector<HTMLElement>('#hurt .low')!;
// 曲面 HUD の傾き（index.html の --hud-yaw / --hud-pitch）。被弾時はここから一瞬深く傾ける
const hudStyle = getComputedStyle(document.getElementById('hud')!);
const HUD_YAW = parseFloat(hudStyle.getPropertyValue('--hud-yaw')) || 0;
const HUD_PITCH = parseFloat(hudStyle.getPropertyValue('--hud-pitch')) || 0;

// 左右の HUD を、殴られて奥へ押し込まれたように傾けてから戻す。side は左が 1、右が -1
function kickHudPanel(el: HTMLElement, side: number, kick: number, duration: number) {
  const tf = (pitch: number, yaw: number, z: number) =>
    `rotateX(${HUD_PITCH + pitch}deg) rotateY(${side * (HUD_YAW + yaw)}deg) translateZ(${z}px)`;
  el.animate(
    [
      { transform: tf(kick * 0.4, kick, -kick * 3) },
      { transform: tf(-kick * 0.1, -kick * 0.25, 0), offset: 0.35 },
      { transform: tf(0, 0, 0) },
    ],
    { duration, easing: 'cubic-bezier(.2, .8, .3, 1)' },
  );
}

function damagePlayer(amount: number) {
  if (playerHp <= 0 || amount <= 0) return;
  if (stageRun?.running) stageRun.damage += amount;
  const before = playerHp;
  // ステージでは 0 で倒れる。訓練場（と倒しきった後）は死なず、1 で耐えて被弾の演出だけを出す
  playerHp = Math.max(stageRun?.running ? 0 : 1, playerHp - amount);
  hpShown = playerHp;
  if (playerHp <= 0) downPlayer();
  hpChipHold = HP_CHIP_HOLD;

  // バーを揺らす（斜めの形は保ったまま）
  const heavy = amount >= HP_HEAVY;
  const amp = heavy ? 14 : 6;
  hpBar.animate(
    [
      { transform: 'skewX(-24deg) translate(0, 0)' },
      { transform: `skewX(-24deg) translate(${-amp}px, ${amp * 0.4}px)` },
      { transform: `skewX(-24deg) translate(${amp * 0.8}px, ${-amp * 0.3}px)` },
      { transform: `skewX(-24deg) translate(${-amp * 0.4}px, 0)` },
      { transform: 'skewX(-24deg) translate(0, 0)' },
    ],
    { duration: heavy ? 360 : 260, easing: 'ease-out' },
  );
  // 数字を叩かれたように一瞬大きくし、ダメージ量を横に飛ばす
  hpNum.animate(
    [
      { transform: `translate(0, 0) scale(${heavy ? 1.22 : 1.12})` },
      { transform: 'translate(-4px, 2px) scale(1.04)', offset: 0.35 },
      { transform: 'translate(0, 0) scale(1)' },
    ],
    { duration: heavy ? 320 : 240, easing: 'ease-out' },
  );
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.textContent = `−${Math.round(amount)}`;
  hpNumRow.appendChild(pop);
  pop.animate(
    [
      { transform: `translate(0, 8px) scale(${heavy ? 1.5 : 1.25})`, opacity: 1 },
      { transform: 'translate(22px, -26px) scale(1)', opacity: 1, offset: 0.35 },
      { transform: 'translate(36px, -48px) scale(0.95)', opacity: 0 },
    ],
    { duration: 720, easing: 'cubic-bezier(.2, .8, .3, 1)' },
  ).onfinish = () => pop.remove();
  // 削れた所の真ん中に斬り傷の線を走らせる
  const cut = document.createElement('div');
  cut.className = 'cut';
  cut.style.left = `calc(${(((before + playerHp) / 2) / PLAYER_MAX_HP) * 100}% - 1px)`;
  hpBar.appendChild(cut);
  cut.animate(
    [
      { transform: 'skewX(24deg) rotate(28deg) scaleY(0)', opacity: 1 },
      { transform: 'skewX(24deg) rotate(28deg) scaleY(1.2)', opacity: 1, offset: 0.3 },
      { transform: 'skewX(24deg) rotate(28deg) scaleY(1.4)', opacity: 0 },
    ],
    { duration: heavy ? 420 : 320, easing: 'ease-out' },
  ).onfinish = () => cut.remove();
  hpFill.animate([{ filter: 'brightness(3.5)' }, { filter: 'brightness(1)' }], { duration: heavy ? 260 : 160 });
  // 画面の縁を一瞬暗く絞り、曲面 HUD ごと押し込む
  hurtFlash.animate([{ opacity: heavy ? 1 : 0.6 }, { opacity: 0 }], { duration: heavy ? 650 : 420, easing: 'ease-out' });
  kickHudPanel(hpHud, 1, heavy ? 9 : 4.5, heavy ? 520 : 380);
  kickHudPanel(weaponHud, -1, heavy ? 5 : 2.5, heavy ? 520 : 380);
  // HUD 全体も殴られた向きへ弾き、奥へ押し込む
  const kick = heavy ? 420 : 220;
  const ang = Math.random() * Math.PI * 2;
  hudImpulse(Math.cos(ang) * kick, Math.sin(ang) * kick * 0.6 + kick * 0.4, heavy ? -0.5 : -0.25);
}

function healPlayer(amount: number) {
  if (playerHp <= 0 || amount <= 0) return;
  playerHp = Math.min(PLAYER_MAX_HP, playerHp + amount);
  hpChip = Math.max(hpChip, playerHp);
}

// dt は実時間（スローやヒットストップ中も白い残りは同じ速さで減らす）
function updateHpHud(dt: number) {
  if (hpShown > playerHp) hpShown = playerHp;
  else {
    hpShown += (playerHp - hpShown) * Math.min(1, dt * 7);
    if (playerHp - hpShown < 0.05) hpShown = playerHp;
  }
  hpChipHold -= dt;
  if (hpChipHold <= 0 && hpChip > hpShown) hpChip = Math.max(hpShown, hpChip - HP_CHIP_DRAIN * dt);
  if (hpChip < hpShown) hpChip = hpShown;

  hpFill.style.width = `${(hpShown / PLAYER_MAX_HP) * 100}%`;
  hpChipBar.style.width = `${(hpChip / PLAYER_MAX_HP) * 100}%`;
  hpCount = hpCount > hpShown ? Math.max(hpShown, hpCount - HP_COUNT_SPEED * dt) : hpShown;
  hpNum.textContent = String(Math.ceil(hpCount));
  hpHud.classList.toggle('low', playerHp <= HP_LOW);
  hurtLow.classList.toggle('on', playerHp <= HP_LOW);
}

// ---- 倒れる ----
// ステージで体力が尽きたら、時間を測るのをやめて操作を取り上げ、世界を白黒のスローにしたまま視点を床へ崩す。
// 倒れきってからゲームオーバーの画面を出す（そこからはやり直すかタイトルへ戻るだけ）
const DOWN_SLOW_SCALE = 0.15; // 倒れている間の時間の速さ
const DOWN_SLOW_IN = 0.25; // そこまで落とす時間（実時間）
const DOWN_FALL_TIME = 1.1; // 視点が床へ崩れきるまで（実時間）
const DOWN_EYE = 0.35; // 崩れきったときの目の高さ
const DOWN_ROLL = 0.55; // 崩れきったときの傾き (rad)
const DOWN_PITCH = -0.18; // 崩れきったときにうつむく量 (rad)
const GAMEOVER_DELAY = 2.6; // 倒れてから画面を出すまで（実時間）
let downT = -1; // 倒れてからの実時間。-1 = 倒れていない
const isDown = () => downT >= 0;
function downPlayer() {
  if (isDown() || !stageRun) return;
  downT = 0;
  stageRun.running = false;
  hitStop = Math.max(hitStop, 0.14);
  hitStopTotal = hitStop;
  addTrauma(1);
  fovKick += 10;
  if (deadEye !== 'off') endDeadEye();
  sfx.playDeath();
  document.body.classList.add('player-down');
}
// 0（倒れた瞬間）〜 1（崩れきった）
function downFall() {
  if (!isDown()) return 0;
  const k = Math.min(1, downT / DOWN_FALL_TIME);
  return 1 - (1 - k) ** 3;
}
function downSlowFactor() {
  if (!isDown()) return 1;
  return THREE.MathUtils.lerp(1, DOWN_SLOW_SCALE, Math.min(1, downT / DOWN_SLOW_IN));
}
// 倒れている間は、押したものを全部捨てる（押しっぱなしの移動も、溜めた攻撃も効かせない）
function dropPlayerInput() {
  keys.clear();
  pressed.clear();
  attackPressed = attackHeld = throwHeld = throwPressed = focusPressed = axeLaunchPressed = deadEyePressed = false;
  reloadQueued = tossPressed = false;
  padMove.x = padMove.y = 0;
  padSprint = false;
}
function updatePlayerDown(realDt: number) {
  if (!isDown()) return;
  const shown = downT >= GAMEOVER_DELAY;
  downT += realDt;
  dropPlayerInput();
  if (!shown && downT >= GAMEOVER_DELAY && stageRun) showGameOver(stageRun);
}
// 一時停止の画面をゲームオーバーの画面に作り替えて止める。記録は残さない
function showGameOver(run: StageRun) {
  const button = stageButtons[stageIndex];
  overlay.classList.add('over');
  overlayStatus.textContent = '';
  overlayPrompt.textContent = 'ENTER — RETRY';
  showGameOverView({
    stageNo: button.querySelector('.no')!.textContent!,
    stageName: button.dataset.stage!.toUpperCase(),
    difficulty: DIFFICULTIES[difficultyIndex].toUpperCase(),
    time: run.time,
    kills: run.kills,
    quota: run.quota,
    score: totalScore(),
  });
  pauseGame();
}

// ---- プレイヤー物理 ----
// 状態は player/state.ts、移動・当たり判定・よじ登り・壁走りは player/movement.ts
initMovement({ onMantleStart, onMantleEnd, onWallRunStart });
function update(dt: number) {
  const locked = controls.isLocked;

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();

  wish.set(0, 0, 0);
  axeSlamRecover = Math.max(0, axeSlamRecover - dt);
  const stuck = axeSlamRecover > 0; // 叩きつけの硬直中は、歩く・跳ぶ・ダッシュ・スライディングを受け付けない
  if (locked && !stuck) {
    if (keys.has('KeyW')) wish.add(forward);
    if (keys.has('KeyS')) wish.sub(forward);
    if (keys.has('KeyD')) wish.add(right);
    if (keys.has('KeyA')) wish.sub(right);
    // キーを押していなければパッドの左スティック。速さは倒した量ではなく、倒しきったら走るかどうかで決める
    if (wish.lengthSq() === 0) wish.addScaledVector(forward, padMove.y).addScaledVector(right, padMove.x);
    if (wish.lengthSq() > 0) wish.normalize();
  }
  const hasWish = wish.lengthSq() > 0;
  const sprinting = locked && (keys.has('ShiftLeft') || keys.has('ShiftRight') || padSprint);
  const maxSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  const slideKey = locked && keys.has('KeyC');
  if (!slideKey) player.slideLock = false;

  // ---- ダッシュ ----
  player.dashCooldown -= dt;
  player.slideBoostCooldown -= dt;
  if ((player.onGround || player.wallRunning) && player.dashCharges < DASH_CHARGES) {
    player.dashRecharge += dt;
    if (player.dashRecharge >= DASH_RECHARGE) {
      player.dashRecharge = 0;
      player.dashCharges++;
    }
  }
  if (locked && !stuck && player.mantleTime < 0 && rushTime < 0 && chargeDashTime <= 0 && [...pressed].some(isSprintKey) && player.dashCharges > 0 && player.dashCooldown <= 0) {
    dashDir.copy(hasWish ? wish : forward);
    player.dashSpeedBefore = Math.hypot(velocity.x, velocity.z);
    player.dashTime = DASH_TIME;
    player.dashCooldown = DASH_COOLDOWN;
    player.dashCharges--;
    player.dashRecharge = 0;
    player.sliding = false;
    if (player.wallRunning) endWallRun();
    onDash();
  }

  // ---- スライディングの開始・終了 ----
  const hSpeed = Math.hypot(velocity.x, velocity.z);
  if (!player.sliding && !stuck && slideKey && !player.slideLock && player.onGround && player.dashTime <= 0 && hSpeed >= SLIDE_START_SPEED) {
    player.sliding = true;
    if (player.slideBoostCooldown <= 0) {
      setHorizontalSpeed(Math.max(hSpeed, Math.min(hSpeed + SLIDE_BOOST, SLIDE_BOOST_MAX)));
      player.slideBoostCooldown = SLIDE_BOOST_COOLDOWN;
    }
    onSlideStart();
  } else if (player.sliding) {
    if (!slideKey || !player.onGround) {
      player.sliding = false;
    } else if (hSpeed < SLIDE_END_SPEED) {
      player.sliding = false;
      player.slideLock = true;
    }
  }

  // ---- 水平移動 ----
  if (rushTime >= 0) {
    updateRush(dt);
  } else if (chargeDashTime > 0) {
    updateChargeDash(dt);
  } else if (player.dashTime > 0) {
    player.dashTime -= dt;
    velocity.x = dashDir.x * DASH_SPEED;
    velocity.z = dashDir.z * DASH_SPEED;
    velocity.y = 0; // ダッシュ中は落ちない
    if (player.dashTime <= 0) {
      const exit = Math.max(DASH_EXIT_SPEED, player.dashSpeedBefore);
      velocity.x = dashDir.x * exit;
      velocity.z = dashDir.z * exit;
    }
  } else if (player.wallRunning) {
    // 壁に沿って走る。遅ければ加速し、速ければ勢いをそのまま保つ。壁へ少し押し付けて離れないようにする
    player.wallRunTime += dt;
    const speed = hSpeed < WALLRUN_SPEED ? moveToward(hSpeed, WALLRUN_SPEED, WALLRUN_ACCEL * dt) : hSpeed;
    velocity.x = wallTangent.x * speed - wallNormal.x;
    velocity.z = wallTangent.z * speed - wallNormal.z;
  } else if (player.sliding) {
    // 少しずつ減速しながら、ゆるく曲がれる
    if (hasWish && velocity.x * wish.x + velocity.z * wish.z > 0) rotateHorizontalToward(wish, SLIDE_TURN_RATE * dt);
    setHorizontalSpeed(Math.max(0, hSpeed - SLIDE_FRICTION * dt));
    // 坂では、下る向きへ加速する（上る向きなら早く止まる）
    if (player.groundRamp) {
      const u = rampUpDir(player.groundRamp);
      velocity.x -= u.x * RAMP_SLIDE_GRAVITY * u.slope * dt;
      velocity.z -= u.z * RAMP_SLIDE_GRAVITY * u.slope * dt;
    }
  } else if (player.onGround) {
    if (hasWish) steerHorizontal(wish, maxSpeed, GROUND_ACCEL, GROUND_TURN_RATE, OVERSPEED_DECAY, dt);
    else setHorizontalSpeed(Math.max(0, hSpeed - GROUND_FRICTION * dt));
  } else if (hasWish) {
    // 空中: 入力がなければ勢いをそのまま保つ
    steerHorizontal(wish, maxSpeed, AIR_ACCEL, AIR_TURN_RATE, 0, dt);
  }

  // ---- ジャンプ（スライディング中も可。勢いはそのまま） ----
  if (locked && !stuck && player.onGround && player.dashTime <= 0 && rushTime < 0 && chargeDashTime <= 0 && keys.has('Space')) {
    velocity.y = JUMP_SPEED;
    player.onGround = false;
    player.sliding = false;
    sfx.playJump();
  }

  // ---- 壁ジャンプ: 走る勢いは残したまま、壁から斜め上へ跳ぶ ----
  // 押しっぱなしで飛びついた直後に跳ねないよう、押した瞬間だけ受け付ける
  if (locked && player.wallRunning && pressed.has('Space')) {
    velocity.x += wallNormal.x * WALLJUMP_OUT;
    velocity.z += wallNormal.z * WALLJUMP_OUT;
    velocity.y = WALLJUMP_UP;
    endWallRun();
    onWallJump();
  }

  if (player.dashTime <= 0 && rushTime < 0 && chargeDashTime <= 0) velocity.y -=(player.wallRunning ? WALLRUN_GRAVITY : GRAVITY) * dt;
  if (player.wallRunning) velocity.y = Math.max(velocity.y, -WALLRUN_MAX_FALL);
  // 鎖鎌が掛かっている間は、ここまでの速度を引き寄せる向きへ置き換える
  if (grapple?.phase === 'pull') updateGrapplePull(dt);

  // ---- 移動と当たり判定 ----
  const wasOnGround = player.onGround;
  player.landImpact = 0;
  if (player.mantleTime >= 0) {
    // よじ登り中は決まった軌道で動かす（上で計算した速度は使わない）
    updateMantle(dt);
  } else {
    const prevY = position.y;
    position.addScaledVector(velocity, dt);
    player.onGround = false;
    player.groundRamp = null;

    for (const e of enemies) if (e.alive) collideCylinder(e.root.position.x, e.root.position.z, DUMMY_RADIUS, e.root.position.y + DUMMY_HEIGHT, prevY);
    // 坂を先に調べる（坂に立っていれば、続く箱の判定で坂の上の端の段を上れる）
    for (const r of ramps) collideRamp(r, prevY, wasOnGround);
    for (const b of blocks) collideBox(b, prevY);

    // 外周壁の外へは出さない（外へ向かう速度だけ消す）
    if (position.x < playBounds.minX || position.x > playBounds.maxX) {
      position.x = THREE.MathUtils.clamp(position.x, playBounds.minX, playBounds.maxX);
      velocity.x = 0;
    }
    if (position.z < playBounds.minZ || position.z > playBounds.maxZ) {
      position.z = THREE.MathUtils.clamp(position.z, playBounds.minZ, playBounds.maxZ);
      velocity.z = 0;
    }

    if (position.y <= 0) {
      player.landImpact = Math.max(player.landImpact, -velocity.y);
      position.y = 0;
      velocity.y = 0;
      player.onGround = true;
    }

    if (player.wallRunning && !canKeepWallRun()) endWallRun();
    if (player.onGround) player.hasLastWall = false;

    // よじ登れる縁があればそちらを優先し、なければ壁走りを試す
    if (locked && !player.onGround && rushTime < 0) {
      // 鎖鎌で引き寄せた勢いは、よじ登った後へ持ち越さない（引き寄せる前の速さまでに抑える）
      const mantleSpeed = grapple && grapple.pullTime > 0 ? Math.min(hSpeed, grapple.speedBefore) : hSpeed;
      let mantled = enemies.some((e) => e.alive && tryMantle(e.root.position.x, e.root.position.z, DUMMY_RADIUS, e.root.position.y + DUMMY_HEIGHT, mantleSpeed));
      for (const b of blocks) {
        if (mantled) break;
        mantled = tryMantleBox(b, mantleSpeed);
      }
      // 引き寄せの最中は壁走りを始めない（壁沿いに引かれる速さを壁走りが拾ってしまう）
      if (!mantled && !player.wallRunning && player.dashTime <= 0 && chargeDashTime <= 0 && grapple?.phase !== 'pull') tryStartWallRun();
    }
  }

  borderUniforms.uPlayer.value.set(position.x, position.y + 1.2, position.z);
  if (player.onGround && !wasOnGround) onLand(player.landImpact);

  pressed.clear();

  for (let i = 0; i < dashGauges.length; i++) {
    // 使える分は満タン、回復中の 1 本は進み具合、それ以外は空
    const fill = i < player.dashCharges ? 1 : i === player.dashCharges ? player.dashRecharge / DASH_RECHARGE : 0;
    // pathLength=100 なので、塗る長さ = fill * 100
    dashGauges[i].style.strokeDasharray = `${(fill * 100).toFixed(1)} 100`;
    dashGauges[i].style.opacity = fill > 0 ? '1' : '0'; // 0 だと丸い線端が点として残るので消す
  }
  updateHookHud();

  updateCamera(dt);
  updateWeaponSwitch(dt);
  updateViewModel(dt);
  updateAttack(dt);
  updateSwordAttack(dt);
  updateAxeAttack(dt);
  updateThrow(dt);
  updateSickleMelee(dt);
  updateGrapple(dt);
  updateGun(dt);
  updateHandCam(dt);
}

// ---- カメラ演出 ----
let trauma = 0; // 画面揺れの強さ (0〜1)
let shakeTime = 0;
let fovKick = 0;
let landDip = 0; // 着地で視点が沈む量（負の値）
let landDipVel = 0;
let roll = 0;
// 高いところからの着地の揺れ。trauma より短く強く、画面と手元をまとめて揺らす
const LAND_SHAKE_TIME = 0.16; // 揺れが収まるまでの時間 (秒)
let landShake = 0; // 揺れの強さ (0〜1)
let landShakeT = 1; // 着地からの経過の割合 (0〜1)。1 で揺れなし

function addTrauma(amount: number) {
  trauma = Math.min(1, trauma + amount);
}

function onDash() {
  addTrauma(0.2);
  sfx.playDash();
  fovKick = 8;
  sinceDash = 0;
  upgradeAttackOnDash();
  // 振っていなければ、右手のクナイを輪に掛けた指でくるりと一周回す
  if (kunaiReady() && !attack) {
    dashSpinTime = 0;
    firedDashSpinGrip = false;
    playRing();
  }
  // ハンドガンは、トリガーに掛けた指を軸に縦にくるりと一周回す（装填後より速く）
  if (gunReady() && !gunReloading && twirlT < 0) startTwirl(DASH_TWIRL_TIME);
  // 剣は、握った手を軸に縦にくるくると 2 回転させる
  if (swordReady() && !swordAttack && swordHold < 0) startSwordTwirl();
  // 鎖鎌は、確率で鎌を宙へ投げ回し、そうでなければ両手の鎌を前回りにくるりと回す
  if (!tossOnDash()) twirlSickles();
  // 斧は、柄を軸にくるりと一回転させる
  if (shownWeapon === 'axe' && wantWeapon === 'axe' && holster === 0 && !axeAttack) {
    axeSpinTime = 0;
    playSwish({ at: 0, dur: 0.22, f0: 380, f1: 1200, gain: 0.14 }, 'axe');
  }
}

// ダッシュの直前に振り始めた普段の攻撃は、ダッシュ技に差し替える（ほぼ同時押しでもダッシュ技が出るように）
const DASH_ATTACK_GRACE = 0.12;
function upgradeAttackOnDash() {
  if (player.sliding) return;
  // クナイ
  if (attack && attackTime < DASH_ATTACK_GRACE && !firedImpact) {
    const i = GROUND_COMBO.indexOf(attack);
    if (i >= 0) {
      comboStep = i;
      startAttack(DASH_SLASH);
    }
  }
  // 剣: 押してまだ離していない（普段の攻撃か溜めかを決める前）か、振り始めたばかり
  if (swordHold >= 0 && !swordAttack && swordHold < DASH_ATTACK_GRACE) {
    swordHold = -1;
    startSwordAttack(SWORD_THRUST);
  } else if (swordAttack && swordTime < DASH_ATTACK_GRACE && !swordFiredImpact) {
    const i = SWORD_COMBO.indexOf(swordAttack);
    if (i >= 0) {
      swordComboStep = i;
      startSwordAttack(SWORD_THRUST);
    }
  }
  // 鎖鎌
  if (sickleMelee && sickleMelee.t < DASH_ATTACK_GRACE && sickleMelee.fired === 0) {
    const i = SICKLE_COMBO.indexOf(sickleMelee.def);
    const j = SICKLE_AIR_COMBO.indexOf(sickleMelee.def);
    if (i >= 0) sickleCombo = i;
    if (j >= 0) sickleAirCombo = j;
    if (i >= 0 || j >= 0) startSickleMove(SICKLE_DASH);
  }
  // 斧: 普段の攻撃は突進振り下ろし、打ち上げは突き飛ばしへ
  if (axeAttack && axeTime < DASH_ATTACK_GRACE && !axeFiredImpact && !player.wallRunning) {
    const i = AXE_COMBO.indexOf(axeAttack);
    if (i >= 0 && (player.onGround || !axeRushAirUsed)) {
      axeComboStep = i;
      startAxeAttack(AXE_RUSH);
    } else if (axeAttack === AXE_LAUNCH && axeSlamRecover <= 0) {
      startAxeAttack(AXE_DRIVE);
    }
  }
}

function onSlideStart() {
  addTrauma(0.15);
  sfx.playSlideStart();
  // 鎖鎌は、両手の鎌を前回りにくるりと回しながら低い構えへ移る
  twirlSickles();
}

function onMantleStart() {
  addTrauma(0.1);
  sfx.playMantleStart();
}

function onMantleEnd() {
  sfx.playMantleEnd();
  // 縁に体を乗せたときに軽く沈み、うなずくように視線を下げる
  landDipVel = Math.min(landDipVel, -1.5);
  kickVel.x -= 1.2 * DEG * 22;
}

function onWallRunStart() {
  addTrauma(0.08);
  sfx.playWallRunStart();
}

function onWallJump() {
  addTrauma(0.1);
  sfx.playWallJump();
  fovKick = Math.max(fovKick, 4);
}

function onLand(impact: number) {
  sfx.playLand(impact);
  landDipVel = Math.min(landDipVel, -impact * 0.5);
  // 普通のジャンプ程度では揺らさず、高いところから落ちたときだけ揺らす。高いほど強く
  const k = THREE.MathUtils.clamp((impact - 7) / 10, 0, 1);
  if (k > 0 && (landShakeT >= 1 || k >= landShake * (1 - landShakeT) ** 2)) {
    landShake = k;
    landShakeT = 0;
  }
}

// 着地の揺れの今の強さ（始めが一番強く、すぐに収まる）
function landShakeAmount() {
  return landShakeT >= 1 ? 0 : landShake * (1 - landShakeT) ** 2;
}

function updateCamera(dt: number) {
  const hSpeed = Math.hypot(velocity.x, velocity.z);

  // 速いほど視野を広げる
  fovKick = moveToward(fovKick, 0, dt * 30);
  const speedT = THREE.MathUtils.clamp((hSpeed - WALK_SPEED) / (FOV_SPEED_MAX - WALK_SPEED), 0, 1);
  // 居合の構えの間はズームする（スロー中でも実時間の速さで寄せる）
  const targetFov = BASE_FOV + speedT * MAX_FOV_BONUS + fovKick - focusZoom * FOCUS_ZOOM - swordChargeBlend * CHARGE_ZOOM
    - deadEyeBlend * DEADEYE_ZOOM;
  camera.fov += (targetFov - camera.fov) * Math.min(1, Math.max(dt, realDt) * 8);
  camera.updateProjectionMatrix();

  // 着地の沈み込み（ばねで戻す）
  landDipVel += (-150 * landDip - 18 * landDipVel) * dt;
  landDip = Math.max(-0.5, landDip + landDipVel * dt);

  // スライディングで視点を下げる
  player.eyeHeight += ((player.sliding ? SLIDE_EYE_HEIGHT : EYE_HEIGHT) - player.eyeHeight) * Math.min(1, dt * 12);

  // 横移動とスライディングでカメラを傾ける。壁走り中は壁と反対側へ傾ける
  const lateral = (velocity.x * right.x + velocity.z * right.z) / SPRINT_SPEED;
  const wallRoll = player.wallRunning ? -(wallNormal.x * right.x + wallNormal.z * right.z) * WALLRUN_ROLL : 0;
  const targetRoll = -lateral * 0.025 + (player.sliding ? 0.07 : 0) + wallRoll;
  roll += (targetRoll - roll) * Math.min(1, dt * 8);

  trauma = Math.max(0, trauma - dt * 1.5);
  shakeTime += dt;
  landShakeT = Math.min(1, landShakeT + dt / LAND_SHAKE_TIME);

  const landJolt = landShakeAmount() * 0.06 * Math.sin(shakeTime * 91.7 + 3.3);
  // 倒れたら目の高さを床近くまで崩す
  const eye = THREE.MathUtils.lerp(player.eyeHeight, DOWN_EYE, downFall());
  camera.position.set(position.x, position.y + eye + landDip + landJolt, position.z);
}

// 描画の直前にだけ揺れと傾きを足す（PointerLockControls の視点を壊さないよう、描画後に戻す）
const savedQuat = new THREE.Quaternion();
const shakeEuler = new THREE.Euler();
const shakeQuat = new THREE.Quaternion();
function applyCameraOffset() {
  savedQuat.copy(camera.quaternion);
  const s = trauma * trauma;
  const t = shakeTime;
  const ls = landShakeAmount();
  shakeEuler.set(
    s * 0.04 * Math.sin(t * 47.3 + 1.3) + kick.x - ls * 0.09 * Math.abs(Math.sin(t * 97.1 + 0.4)),
    s * 0.04 * Math.sin(t * 53.1 + 4.1) + kick.y + ls * 0.05 * Math.sin(t * 89.3 + 2.2),
    roll + s * 0.05 * Math.sin(t * 41.7 + 2.7) + kick.z + ls * 0.07 * Math.sin(t * 103.7 + 5.1) + handCam.z,
  );
  shakeEuler.x += handCam.x + DOWN_PITCH * downFall();
  shakeEuler.y += handCam.y;
  shakeEuler.z += DOWN_ROLL * downFall();
  camera.quaternion.multiply(shakeQuat.setFromEuler(shakeEuler));
}

// ---- 手元につられる視線 ----
// 構えた武器の手元が画面の中で動くと、視線をその向きへ少しだけつられさせる。
// 手元の位置から、ゆっくり追いかける基準を引いた分だけ向ける（振った瞬間は大きく、構えを変えたままなら正面へ戻る）。
// 歩きの揺れ・視点移動の遅れ・持ち替えの上げ下げは数えない（構えの根元 = ビューモデルより手前で測る）
const HAND_CAM_GAIN = new THREE.Vector3(0.12, 0.15, 0.08); // 手元 1 m のずれあたりの角度 (rad): 縦, 横, 傾き
const HAND_CAM_MAX = 0.035; // 向ける角度の上限 (rad)
const HAND_CAM_FOLLOW = 4; // 基準が手元に追いつく速さ (1/秒)
const HAND_CAM_STIFF = 140; // ばねの硬さ
const HAND_CAM_DAMP = 17; // ばねの減衰
const handCam = new THREE.Vector3(); // 今の視線のずれ (rad): x = 縦, y = 横, z = 傾き
const handCamVel = new THREE.Vector3();
const handCamBase = new THREE.Vector3();
const handCamPos = new THREE.Vector3();
const handCamTmp = new THREE.Vector3();
let handCamWeapon: WeaponId | null = null;
const HAND_PROBE_KUNAI = new THREE.Vector3(0, 0.1, 0); // 握りから切っ先へ少し寄った所（回転も拾う）
const HAND_PROBE_SWORD = new THREE.Vector3(0, 0.35, 0);
const HAND_PROBE_GUN = new THREE.Vector3(0, 0, -0.1);
const HAND_PROBE_SICKLE = new THREE.Vector3(0, 0.1, 0);
const HAND_PROBE_AXE = new THREE.Vector3(0, 0.6, 0);
const HAND_PROBE_CHAKRAM = new THREE.Vector3(0, 0, 0);

// frame 座標の点 local を、root の手前まで親をたどって root の座標へ移す（root 自身の揺れは入れない）
function probeToRoot(frame: THREE.Object3D, root: THREE.Object3D, local: THREE.Vector3, out: THREE.Vector3) {
  out.copy(local);
  for (let o: THREE.Object3D | null = frame; o && o !== root; o = o.parent) {
    o.updateMatrix();
    out.applyMatrix4(o.matrix);
  }
  return out;
}

// 今の武器の手元の位置（カメラ基準、構えの根元を基本位置に置いた値）
function measureHand(out: THREE.Vector3) {
  switch (shownWeapon) {
    case 'kunai':
      return probeToRoot(kunaiRest, viewModel, HAND_PROBE_KUNAI, out).add(VIEW_MODEL_POS);
    case 'sword':
      return probeToRoot(swordRest, swordViewModel, HAND_PROBE_SWORD, out).add(SWORD_VIEW_MODEL_POS);
    case 'handgun':
      return probeToRoot(gunTwirl, gunViewModel, HAND_PROBE_GUN, out).add(GUN_VIEW_MODEL_POS).add(reloadPosOff);
    case 'sickle':
      // 両手の鎌の真ん中と、振りにつられた体のひねり
      probeToRoot(hooks[0].rest, sickleViewModel, HAND_PROBE_SICKLE, out);
      out.add(probeToRoot(hooks[1].rest, sickleViewModel, HAND_PROBE_SICKLE, handCamTmp)).multiplyScalar(0.5);
      return out.add(SICKLE_VIEW_MODEL_POS).add(sickleBodyPos);
    case 'axe':
      return probeToRoot(axeRest, axeViewModel, HAND_PROBE_AXE, out).add(AXE_VIEW_MODEL_POS);
    case 'chakram':
      return probeToRoot(chakramRest, chakramViewModel, HAND_PROBE_CHAKRAM, out).add(CHAKRAM_VIEW_MODEL_POS);
  }
}

function updateHandCam(dt: number) {
  if (dt <= 0) return;
  measureHand(handCamPos);
  // 持ち替えた直後は手元が飛ぶので、基準をそこへ合わせ直す
  if (handCamWeapon !== shownWeapon) {
    handCamWeapon = shownWeapon;
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

// ---- HUD の慣性 ----
// 画面の HUD を、体に付けた板がばねで吊ってあるように動かす。動いた向きの逆へ遅れてずれ、
// 速さが変わった瞬間（ダッシュ・ジャンプ・着地）には押されて弾み、前へ速く進むほど外へ広がる。
// 衝撃は hudImpulse で直接足し、画面揺れ（trauma・着地の揺れ）にも合わせて小刻みに震える
const HUD_LAG = 0.7; // 速さ 1 m/s あたりのずれ (px)
const HUD_LAG_MAX = 16; // 速さによるずれの上限 (px)
const HUD_PUSH = 22; // 速さの変化 1 m/s あたりに弾く速さ (px/秒)
const HUD_PUSH_MAX = 520; // 1 フレームで弾く速さの上限 (px/秒)。ワープなどで飛ばないように
const HUD_SPREAD = 0.0018; // 前へ 1 m/s あたりに広がる割合
const HUD_STIFF = 150; // ばねの硬さ
const HUD_DAMP = 15; // ばねの減衰
const HUD_OFFSET_MAX = 34; // ずれの上限 (px)
const HUD_SCALE_MAX = 0.05; // 広がり・縮みの上限
const hudLayer = document.getElementById('hud')!;
const scoreLayer = document.getElementById('score')!;
const hudOff = new THREE.Vector3(); // x, y はずれ (px)、z は広がり (割合)
const hudVel = new THREE.Vector3();
const hudPrevVel = new THREE.Vector3();
const hudDv = new THREE.Vector3();
let hudPrevValid = false;

// 衝撃で HUD を弾く。x, y は画面の向き (px/秒、y は下が正)、z は広がり（負で奥へ押し込む）
function hudImpulse(x: number, y: number, z = 0) {
  hudVel.x += x;
  hudVel.y += y;
  hudVel.z += z;
}

// dt は実時間（スロー中も同じ速さでばねを戻す）
function updateHudSway(dt: number) {
  if (dt <= 0) return;
  // 速さを、今向いている向きの横・前・上に分ける
  const lateral = velocity.x * right.x + velocity.z * right.z;
  const ahead = velocity.x * forward.x + velocity.z * forward.z;

  // 速さが変わった分だけ、遅れる向きへ弾く（右へ加速したら左へ、着地で上向きに止まったら下へ）
  if (hudPrevValid) {
    hudDv.subVectors(velocity, hudPrevVel);
    const dLat = hudDv.x * right.x + hudDv.z * right.z;
    const dAhead = hudDv.x * forward.x + hudDv.z * forward.z;
    hudVel.x += THREE.MathUtils.clamp(-dLat * HUD_PUSH, -HUD_PUSH_MAX, HUD_PUSH_MAX);
    hudVel.y += THREE.MathUtils.clamp(hudDv.y * HUD_PUSH, -HUD_PUSH_MAX, HUD_PUSH_MAX);
    hudVel.z += THREE.MathUtils.clamp(-dAhead * HUD_PUSH * 0.0009, -0.4, 0.4);
  }
  hudPrevVel.copy(velocity);
  hudPrevValid = true;

  // 速さに応じた落ち着き先: 動く向きの逆へずらし、前へ速いほど外へ広げる
  const tx = THREE.MathUtils.clamp(-lateral * HUD_LAG, -HUD_LAG_MAX, HUD_LAG_MAX);
  const ty = THREE.MathUtils.clamp(velocity.y * HUD_LAG, -HUD_LAG_MAX, HUD_LAG_MAX);
  const tz = THREE.MathUtils.clamp(Math.max(0, ahead) * HUD_SPREAD, 0, HUD_SCALE_MAX * 0.6);

  // ばね（大きな dt で暴れないよう細かく刻む）
  const steps = Math.ceil(dt / (1 / 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    hudVel.x += (HUD_STIFF * (tx - hudOff.x) - HUD_DAMP * hudVel.x) * h;
    hudVel.y += (HUD_STIFF * (ty - hudOff.y) - HUD_DAMP * hudVel.y) * h;
    hudVel.z += (HUD_STIFF * (tz - hudOff.z) - HUD_DAMP * hudVel.z) * h;
    hudOff.x += hudVel.x * h;
    hudOff.y += hudVel.y * h;
    hudOff.z += hudVel.z * h;
  }
  hudOff.x = THREE.MathUtils.clamp(hudOff.x, -HUD_OFFSET_MAX, HUD_OFFSET_MAX);
  hudOff.y = THREE.MathUtils.clamp(hudOff.y, -HUD_OFFSET_MAX, HUD_OFFSET_MAX);
  hudOff.z = THREE.MathUtils.clamp(hudOff.z, -HUD_SCALE_MAX, HUD_SCALE_MAX);

  // 画面揺れに合わせた小刻みな震え（ばねには入れず、見た目にだけ足す）
  const s = trauma * trauma;
  const ls = landShakeAmount();
  const t = shakeTime;
  const jx = s * 7 * Math.sin(t * 47.3 + 0.7) + ls * 4 * Math.sin(t * 89.3 + 2.2);
  const jy = s * 7 * Math.sin(t * 53.1 + 2.9) + ls * 9 * Math.abs(Math.sin(t * 97.1 + 0.4));

  const x = hudOff.x + jx;
  const y = hudOff.y + jy;
  // 板ごとずらして少し傾け、消失点は逆へ動かして曲面の向きが変わったように見せる
  hudLayer.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  hudLayer.style.scale = (1 + hudOff.z).toFixed(4);
  hudLayer.style.rotate = `${(x * 0.04).toFixed(3)}deg`;
  hudLayer.style.perspectiveOrigin = `calc(50% - ${(x * 3).toFixed(1)}px) calc(50% - ${(y * 3).toFixed(1)}px)`;
  // 照準の横に出るスコアは、照準から離れすぎないよう控えめに
  scoreLayer.style.translate = `${(x * 0.5).toFixed(2)}px ${(y * 0.5).toFixed(2)}px`;
}

// ---- ビューモデル（クナイ）の動き ----
let bobPhase = 0;
let bobAmount = 0;
let dashPull = 0;
let slidePose = 0;
let mantlePose = 0;
let chargePose = 0;
let throwPunch = 0;
let leftEmpty = 0;

// クナイの技が使えるのは、クナイを構えきっていて、持ち替えを頼まれていないときだけ
const kunaiReady = () => shownWeapon === 'kunai' && wantWeapon === 'kunai' && holster === 0;

function updateWeaponSwitch(dt: number) {
  // 振りや溜め、投げの途中では持ち替えず、終わるのを待つ
  const kunaiBusy = attack !== null || charging || pendingThrows.length > 0;
  const swordBusy = swordAttack !== null || rushTime >= 0 || swordHold >= 0 || chargeDashTime > 0;
  const busy = (shownWeapon === 'kunai' && kunaiBusy) || (shownWeapon === 'sword' && swordBusy) || grapple !== null
    || sickleMelee !== null || (shownWeapon === 'axe' && axeAttack !== null);
  if (isDown()) {
    holster = Math.min(1, holster + realDt / (HOLSTER_TIME * 2)); // 倒れたら武器を画面の下へ落とす
  } else if (wantWeapon !== shownWeapon && !busy) {
    holster = Math.min(1, holster + dt / HOLSTER_TIME);
    if (holster === 1) {
      shownWeapon = wantWeapon;
      sfx.playEquip(shownWeapon);
    }
  } else if (wantWeapon === shownWeapon) {
    holster = Math.max(0, holster - dt / HOLSTER_TIME);
  }
  const isKunai = shownWeapon === 'kunai';
  viewModel.visible = isKunai;
  leftViewModel.visible = isKunai;
  gunViewModel.visible = shownWeapon === 'handgun';
  swordViewModel.visible = shownWeapon === 'sword';
  sickleViewModel.visible = shownWeapon === 'sickle';
  axeViewModel.visible = shownWeapon === 'axe';
  chakramViewModel.visible = shownWeapon === 'chakram';
}

const handJoltPos = new THREE.Vector3();
function updateViewModel(dt: number) {
  const hSpeed = Math.hypot(velocity.x, velocity.z);
  const target = (player.onGround || player.wallRunning) && !player.sliding ? Math.min(hSpeed / SPRINT_SPEED, 1) : 0;
  bobAmount += (target - bobAmount) * Math.min(1, dt * 10);
  const prevBob = bobPhase;
  bobPhase += dt * (4 + Math.min(hSpeed, SPRINT_SPEED) * 1.2);
  // 視点の揺れが半周進むたびに 1 歩。地上か壁走り中で、ある程度動いているときだけ
  if (target > 0.1 && Math.floor(bobPhase / Math.PI) > Math.floor(prevBob / Math.PI)) {
    sfx.playFootstep(THREE.MathUtils.clamp((hSpeed - WALK_SPEED * 0.5) / (SPRINT_SPEED - WALK_SPEED * 0.5), 0, 1));
  }

  // ダッシュ中は手前へ引き、スライディング中は低く構える
  dashPull += ((player.dashTime > 0 ? 1 : 0) - dashPull) * Math.min(1, dt * (player.dashTime > 0 ? 30 : 8));
  slidePose += ((player.sliding ? 1 : 0) - slidePose) * Math.min(1, dt * 10);
  // よじ登り中は手を縁に掛けるので、クナイを下げてよける
  mantlePose += ((player.mantleTime >= 0 ? 1 : 0) - mantlePose) * Math.min(1, dt * 14);

  // 視点移動の遅れは時間で戻す
  lookSwayX += -lookSwayX * Math.min(1, dt * 10);
  lookSwayY += -lookSwayY * Math.min(1, dt * 10);

  const speedBack = Math.min(Math.max(hSpeed - SPRINT_SPEED, 0) / 10, 1) * 0.03;

  // 攻撃中は移動による構えの変化を弱め、振りの形を崩さない
  attackWeight += ((attack ? 1 : 0) - attackWeight) * Math.min(1, dt * (attack ? 20 : 6));
  const calm = 1 - attackWeight * 0.8;
  const bob = bobAmount * calm;
  const pull = dashPull * calm;
  const slideP = slidePose * calm;
  const mantleP = mantlePose * calm;

  viewModel.position.set(
    VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bob - lookSwayX * 0.5 + slideP * 0.03,
    VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bob - Math.min(velocity.y, 0) * 0.002
      + lookSwayY * 0.5 + landDip * 0.3 - pull * 0.04 - slideP * 0.03 - mantleP * 0.12,
    VIEW_MODEL_POS.z + pull * 0.1 + speedBack,
  );
  viewModel.rotation.set(
    -pull * 0.35 + lookSwayY * 2 - mantleP * 0.5,
    -lookSwayX * 2,
    slideP * 0.35 + roll,
  );

  // 左手は振りに加わらないので、移動の揺れだけ右手と左右対称に付ける
  // 溜めている間は少し前へ出して持ち上げ（水平に回すクナイが顔へ近づきすぎないように）、
  // 投げた瞬間は前へ突き出し、補充中は画面の下へ隠す
  chargePose += ((charging ? 1 : 0) - chargePose) * Math.min(1, dt * 30);
  throwPunch += -throwPunch * Math.min(1, dt * 9);
  const empty = reloading && pendingThrows.length === 0; // 最後の 1 本を放ってから下げる
  leftEmpty += ((empty ? 1 : 0) - leftEmpty) * Math.min(1, dt * (empty ? 6 : 14));
  leftViewModel.position.set(
    LEFT_VIEW_MODEL_POS.x - Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03
      + chargePose * 0.03 + throwPunch * 0.05,
    LEFT_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
      + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12
      + chargePose * 0.03 + throwPunch * 0.03 - leftEmpty * 0.15,
    LEFT_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack - chargePose * 0.04 - throwPunch * 0.12,
  );
  leftViewModel.rotation.set(
    -dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5 + chargePose * 0.25 - throwPunch * 0.4 - leftEmpty * 0.6,
    -lookSwayX * 2,
    slidePose * 0.35 + roll - chargePose * 0.2,
  );

  // ハンドガンは右手のクナイと同じ揺れ方をさせる
  gunViewModel.position.set(
    GUN_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03,
    GUN_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
      + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12,
    GUN_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack,
  );
  gunViewModel.rotation.set(
    -dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5,
    -lookSwayX * 2,
    slidePose * 0.35 + roll,
  );

  // 剣は歩く速さを超えて走っている間、前へ倒した構えに移る。スライディング中は横に寝かせる
  const running = hSpeed > WALK_SPEED + 1;
  swordRunPose += ((running ? 1 : 0) - swordRunPose) * Math.min(1, dt * (running ? 8 : 6));
  swordSlidePose += ((player.sliding ? 1 : 0) - swordSlidePose) * Math.min(1, dt * (player.sliding ? 12 : 8));
  swordRestQuat.slerpQuaternions(SWORD_STAND_QUAT, SWORD_RUN_QUAT, swordRunPose).slerp(SWORD_SLIDE_QUAT, swordSlidePose);

  // 剣もクナイと同じ揺れ方をさせる。振っている間は揺れを弱めて振りの形を崩さない
  swordAttackWeight += ((swordAttack ? 1 : 0) - swordAttackWeight) * Math.min(1, dt * (swordAttack ? 20 : 6));
  const swordCalm = 1 - swordAttackWeight * 0.8;
  const sBob = bobAmount * swordCalm;
  const sPull = dashPull * swordCalm;
  const sSlide = slidePose * swordCalm;
  swordViewModel.position.set(
    SWORD_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * sBob - lookSwayX * 0.5 + sSlide * 0.03,
    SWORD_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * sBob - Math.min(velocity.y, 0) * 0.002
      + lookSwayY * 0.5 + landDip * 0.3 - sPull * 0.04 - sSlide * 0.03 - mantlePose * 0.12
      + swordSlidePose * 0.1, // スライディング中は寝かせた刀を持ち上げる
    SWORD_VIEW_MODEL_POS.z + sPull * 0.1 + speedBack,
  );
  swordViewModel.rotation.set(
    -sPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5,
    -lookSwayX * 2,
    sSlide * 0.35 + roll,
  );

  // 鎖鎌もハンドガンと同じ揺れ方をさせる
  sickleViewModel.position.set(
    SICKLE_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03,
    SICKLE_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
      + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12 + sickleBodyPos.y,
    SICKLE_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack,
  );
  sickleViewModel.position.x += sickleBodyPos.x;
  sickleViewModel.rotation.set(
    -dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5 + sickleBodyRot.x,
    -lookSwayX * 2 + sickleBodyRot.y,
    slidePose * 0.35 + roll + sickleBodyRot.z,
  );

  // バトルアックスもハンドガンと同じ揺れ方をさせる。重いので揺れは少し大きめ。振っている間は揺れを弱めて振りの形を崩さない。
  // 視点を回したときの揺れは、重さで遅れて付いてきて少し行き過ぎる（ばねで追わせる）
  axeSwayVelX += ((lookSwayX * AXE_SWAY_GAIN - axeSwayX) * AXE_SWAY_STIFF - axeSwayVelX * AXE_SWAY_DAMP) * dt;
  axeSwayVelY += ((lookSwayY * AXE_SWAY_GAIN - axeSwayY) * AXE_SWAY_STIFF - axeSwayVelY * AXE_SWAY_DAMP) * dt;
  axeSwayX += axeSwayVelX * dt;
  axeSwayY += axeSwayVelY * dt;
  axeAttackWeight += ((axeAttack ? 1 : 0) - axeAttackWeight) * Math.min(1, dt * (axeAttack ? 20 : 6));
  const axeCalm = 1 - axeAttackWeight * 0.8;
  const aBob = bobAmount * axeCalm;
  const aPull = dashPull * axeCalm;
  const aSlide = slidePose * axeCalm;
  axeViewModel.position.set(
    AXE_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.016 * aBob - axeSwayX * 0.5 + aSlide * 0.03,
    AXE_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.016 * aBob - Math.min(velocity.y, 0) * 0.002
      + axeSwayY * 0.5 + landDip * 0.35 - aPull * 0.04 - aSlide * 0.03 - mantlePose * 0.12,
    AXE_VIEW_MODEL_POS.z + aPull * 0.1 + speedBack,
  );
  axeViewModel.rotation.set(
    -aPull * 0.35 + axeSwayY * 2 - mantlePose * 0.5,
    -axeSwayX * 2,
    aSlide * 0.35 + roll,
  );

  // チャクラムもハンドガンと同じ揺れ方をさせる
  chakramViewModel.position.set(
    CHAKRAM_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03,
    CHAKRAM_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
      + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12,
    CHAKRAM_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack,
  );
  chakramViewModel.rotation.set(
    -dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5,
    -lookSwayX * 2,
    slidePose * 0.35 + roll,
  );

  // 高いところからの着地で、手元も画面と一緒に強く揺らす
  const ls = landShakeAmount();
  if (ls > 0) {
    const t = shakeTime;
    handJoltPos.set(
      ls * 0.025 * Math.sin(t * 83.9 + 1.7),
      -ls * 0.05 * Math.abs(Math.sin(t * 95.3 + 0.9)),
      ls * 0.02 * Math.sin(t * 77.1 + 4.4),
    );
    const rx = -ls * 0.25 * Math.abs(Math.sin(t * 88.7 + 2.6));
    const rz = ls * 0.18 * Math.sin(t * 101.3 + 0.2);
    for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel, chakramViewModel]) {
      vm.position.add(handJoltPos);
      vm.rotation.x += rx;
      vm.rotation.z += rz;
    }
  }

  // 撃った反動で手前へ跳ね上げる。装填中は装填の動き（キーフレーム）を足す
  gunViewModel.position.z += gunRecoil * 0.1;
  gunViewModel.position.y += gunRecoil * 0.02;
  gunViewModel.rotation.x += gunRecoil * 0.6;
  gunViewModel.position.add(reloadPosOff);
  gunViewModel.rotation.x += reloadRotOff.x * DEG;
  gunViewModel.rotation.y += reloadRotOff.y * DEG;
  gunViewModel.rotation.z += reloadRotOff.z * DEG;

  // 持ち替え中は手元を画面の下へ下げる
  const h = holster * holster * (3 - 2 * holster);
  for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel, chakramViewModel]) {
    vm.position.y -= h * 0.25;
    vm.rotation.x -= h * 0.9;
  }
}

// ---- 近接攻撃（クナイ） ----
// 振りはキーフレームで作る。各 key は「構えの位置」「拳の向き」「輪を中心にした回転」を持ち、
// 位置は Catmull-Rom で滑らかな弧に、向きは球面補間でつなぐ。

const ATTACK_BUFFER = 0.25; // cancel のこの秒数前から次の入力を受け付けておく
const DASH_ATTACK_WINDOW = 0.3; // ダッシュ後この時間内ならダッシュ斬りになる

let attack: AttackDef | null = null;
let attackTime = 0;
let attackQueued = false;
let attackWeight = 0;
let comboStep = 0;
let comboTimer = 0;
let sinceDash = 99;
let firedSwishes = 0;
let firedImpact = false;
let firedLunge = false;
let firedRing = false;
let firedGrip = false;

const newPose = (): Pose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), spin: 0 });
const restPose = newPose();
// ダッシュしたときに構えたまま輪を軸に一周回す
const DASH_SPIN_TIME = 0.32;
const DASH_SPIN_GRIP = 0.24; // 握り直して「チャキッ」と鳴らす時間
let dashSpinTime = Infinity; // 回し始めてからの時間（回していないときは Infinity）
let firedDashSpinGrip = true;
const fromPose = newPose(); // 攻撃を始めた瞬間の構え（そこから滑らかにつなぐ）
const curPose = newPose();
const tmpPose = newPose();

function copyPose(out: Pose, p: Pose) {
  out.pos.copy(p.pos);
  out.quat.copy(p.quat);
  out.spin = p.spin;
}

function catmullRom(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

function evalAttack(def: AttackDef, t: number, out: Pose) {
  const keys = def.keys;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const e = k0.ease(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
  const kPrev = keys[Math.max(0, i - 1)];
  const kNext = keys[Math.min(keys.length - 1, i + 2)];
  catmullRom(kPrev.pos, k0.pos, k1.pos, kNext.pos, e, out.pos);
  // 切っ先の向きも曲線でつなぎ、key の所で軌跡が折れないようにする
  catmullRom(kPrev.tip, k0.tip, k1.tip, kNext.tip, e, evalTip);
  evalTip.normalize();
  out.quat.setFromUnitVectors(REST_TIP, evalTip);
  const roll = k0.roll + (k1.roll - k0.roll) * e;
  if (roll !== 0) out.quat.premultiply(evalRoll.setFromAxisAngle(evalTip, roll * DEG));
  out.spin = k0.spin + (k1.spin - k0.spin) * e;
}
const evalTip = new THREE.Vector3();
const evalRoll = new THREE.Quaternion();

// 溜めの key までの間に、攻撃開始時の構えから滑らかに移る
function attackPoseAt(def: AttackDef, t: number, out: Pose) {
  evalAttack(def, t, tmpPose);
  const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
  out.pos.lerpVectors(fromPose.pos, tmpPose.pos, w);
  out.quat.slerpQuaternions(fromPose.quat, tmpPose.quat, w);
  out.spin = fromPose.spin + (tmpPose.spin - fromPose.spin) * w;
}

function applyPose(p: Pose) {
  attackPivot.position.copy(p.pos);
  attackPivot.quaternion.copy(p.quat);
  spinPivot.rotation.z = p.spin * DEG;
}

function startAttack(def: AttackDef) {
  copyPose(fromPose, curPose);
  fromPose.spin = ((((fromPose.spin + 180) % 360) + 360) % 360) - 180; // 回した分を巻き戻さないように
  attack = def;
  attackTime = 0;
  attackQueued = false;
  firedSwishes = 0;
  firedImpact = false;
  firedLunge = false;
  firedRing = false;
  firedGrip = false;
  lastTrailSample = -Infinity;
  // ダッシュで回している途中に振ったら、回すのをやめて攻撃へつなぐ
  dashSpinTime = Infinity;
  firedDashSpinGrip = true;
  endKunaiSlideSpin();
}

function chooseAttack(): AttackDef {
  if (player.sliding) return SLIDE_UP;
  if (player.dashTime > 0 || sinceDash < DASH_ATTACK_WINDOW) return DASH_SLASH;
  const def = GROUND_COMBO[comboStep];
  comboStep = (comboStep + 1) % GROUND_COMBO.length;
  return def;
}

// カメラの反動（ばね）
const kick = new THREE.Vector3();
const kickVel = new THREE.Vector3();
const kickTmp = new THREE.Vector3();
const lungeDir = new THREE.Vector3();

// 攻撃の踏み込み: 向いている水平の向きへ押し出す。地上は摩擦で止まるのでそのまま足すが、空中は減速しないので、
// 足し続けると振るたびに際限なく速くなる。空中では、その向きの速さが踏み込みの分に届いていないときだけ、届くまで補う
const AIR_LUNGE_SCALE = 0.4;
function applyLunge(amount: number) {
  camera.getWorldDirection(lungeDir);
  lungeDir.y = 0;
  if (lungeDir.lengthSq() < 1e-6) return;
  lungeDir.normalize();
  let add = amount;
  if (!player.onGround) {
    const along = velocity.x * lungeDir.x + velocity.z * lungeDir.z;
    add = Math.max(0, amount * AIR_LUNGE_SCALE - along);
  }
  velocity.x += lungeDir.x * add;
  velocity.z += lungeDir.z * add;
}

function updateAttack(dt: number) {
  sinceDash += dt;
  trailNow += dt;

  if (attackPressed) {
    attackPressed = false;
    if (!kunaiReady()) {
      if (shownWeapon === 'handgun') fireQueued = true;
      else if (shownWeapon === 'sword') swordPressed = true;
      else if (shownWeapon === 'sickle') sicklePressed = true;
      else if (shownWeapon === 'axe') axePressed = true;
    } else if (!attack) startAttack(chooseAttack());
    else if (attackTime >= attack.cancel - ATTACK_BUFFER) attackQueued = true;
  }

  if (attack) {
    attackTime += dt;
    const def = attack;

    while (firedSwishes < def.swishes.length && attackTime >= def.swishes[firedSwishes].at) {
      playSwish(def.swishes[firedSwishes++]);
    }
    if (def.ring !== undefined && !firedRing && attackTime >= def.ring) {
      firedRing = true;
      playRing();
    }
    if (def.grip !== undefined && !firedGrip && attackTime >= def.grip) {
      firedGrip = true;
      playGrip();
      kickVel.x += -0.25 * DEG * 22; // 握り込んだ手応えをカメラにもほんの少し
    }
    if (!firedLunge && attackTime >= def.trails[0][0]) {
      firedLunge = true;
      applyLunge(def.lunge);
    }
    if (!firedImpact && attackTime >= def.impact) {
      firedImpact = true;
      kickVel.x += def.kick[0] * DEG * 22;
      kickVel.y += def.kick[1] * DEG * 22;
      kickVel.z += def.kick[2] * DEG * 22;
      addTrauma(0.06);
      fovKick += def.fovPunch ?? 0;
      tryHitDummy(def);
    }

    if (attackQueued && attackTime >= def.cancel) {
      startAttack(chooseAttack());
    } else if (attackTime >= def.duration) {
      attack = null;
      comboTimer = COMBO_RESET;
    }
  } else if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) comboStep = 0;
  }

  kickTmp.copy(kick).multiplyScalar(-220).addScaledVector(kickVel, -20);
  kickVel.addScaledVector(kickTmp, dt);
  kick.addScaledVector(kickVel, dt);

  updateKunaiSlideSpin(dt);
  if (attack) {
    sampleTrail();
    attackPoseAt(attack, attackTime, curPose);
  } else {
    copyPose(curPose, restPose);
    dashSpinTime += dt;
    if (dashSpinTime < DASH_SPIN_TIME) curPose.spin = -360 * easeOutCubic(dashSpinTime / DASH_SPIN_TIME);
    if (!firedDashSpinGrip && dashSpinTime >= DASH_SPIN_GRIP) {
      firedDashSpinGrip = true;
      playGrip();
    }
    curPose.spin -= kunaiSlideSpin / DEG;
  }
  applyPose(curPose);
  sampleKunaiSlideTrail(dt);
  updateTrailMesh();
  worldSlow = worldSlowFactor(dt);
  updateEnemies(dt * worldSlow);
}

// ---- 被弾の演出 ----
const HIT_REACH = 2.2; // 敵の中心までこの距離なら当たる
const HIT_ANGLE = 60 * DEG; // 視線からこの角度以内なら当たる
const DEFAULT_HIT_STOP = 0.06;
let hitStop = 0; // 残りの停止時間。この間はゲームの時間を進めない
const FLASH_HOLD = 0.05; // 真っ白のまま保つ時間
const FLASH_FADE = 0.12; // そこから元の色へ戻る時間

// 体力: 0 になると体ごと砕け散り、しばらくするとその場で生えるように起き上がる
const DUMMY_MAX_HP = 100;
const HIT_DAMAGE: Record<HitKind, number> = { kunai: 14, sword: 18, throw: 15, bullet: 30, axe: 24 }; // fx = 1 のときの量
const SICKLE_DAMAGE_SCALE = 0.85; // 鎖鎌の近接は刀と同じ 'sword' の量に、これを掛けて少し抑える
const KILL_HIT_STOP = 0.16; // とどめの一撃は長く止める
const KILL_SLOW_SCALE = 0.25; // 砕けた直後は時間をゆっくりにして、飛び散る破片を見せる
const KILL_SLOW_HOLD = 0.55; // スローを保つ実時間
const KILL_SLOW_RELEASE = 0.45; // そこから元の速さへ戻す実時間
// ステージ最後の 1 体: 長く止め、白黒の反転から始めて、深く長いスローで砕けるさまを見せきる
const FINALE_HIT_STOP = 0.42;
const FINALE_SLOW_SCALE = 0.1;
const FINALE_SLOW_HOLD = 1.5;
const FINALE_SLOW_RELEASE = 0.9;
const FINALE_INVERT_TIME = 0.08; // 白黒を反転させておく実時間
let finale = false; // 最後の 1 体を倒したあと
let killSlowTime = Infinity; // 倒してからの実時間
const hitLook = new THREE.Vector3();

function tryHitDummy(def: AttackDef) {
  if (!dummyInReach(HIT_REACH, HIT_ANGLE)) return;
  findHitPoint(def, hitPoint);
  applyDummyHit(def, hitPoint, 'kunai');
}

// 攻撃の届く範囲（距離と視線からの角度）にいる敵のうち、いちばん近いものを en にする。いれば hitDir に攻撃の向きを入れる
function dummyInReach(reach: number, angle: number): boolean {
  let best: Enemy | null = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    setEn(e);
    if (!inReachOf(reach, angle)) continue;
    const d = Math.hypot(e.root.position.x - position.x, e.root.position.z - position.z);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  if (!best) return false;
  setEn(best);
  return inReachOf(reach, angle); // hitDir を選んだ敵への向きで入れ直す
}
// en が攻撃の届く範囲にいるか。いれば hitDir に攻撃の向きを入れる
function inReachOf(reach: number, angle: number): boolean {
  if (!en.alive) return false;
  hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
  const dist = hitDir.length();
  if (dist > reach + DUMMY_RADIUS) return false;
  if (position.y - en.root.position.y > DUMMY_HEIGHT + 0.5) return false;
  camera.getWorldDirection(hitLook);
  hitLook.y = 0;
  if (dist > 1e-4) {
    hitDir.divideScalar(dist);
    if (hitLook.lengthSq() > 1e-6 && hitLook.normalize().angleTo(hitDir) > angle) return false;
  } else {
    hitDir.copy(hitLook).normalize();
  }
  return true;
}
const hitPoint = new THREE.Vector3();

// swing は刃が動いていた向き（ワールド座標）。渡すと、光の線や飛び散るものを斬り抜けた向きへ流す
const hitDamage = (def: HitDef, kind: HitKind) => HIT_DAMAGE[kind] * (def.dmg ?? def.fx ?? 1);
// 投げ物と弾が頭（首から上）に当たったら、ダメージを大きくする
const HEADSHOT_HEIGHT = 1.55; // 敵の足元からの高さ
const HEADSHOT_MULT = 2.5;

// 当たりの反応と演出。hitDir（攻撃した側から敵の奥への水平の向き）は呼ぶ前に入れておく
// scar = false なら切り跡を残さない（刃の当たらない衝撃波など）。dmgScale はダメージだけに掛ける倍率
function applyDummyHit(def: HitDef, at: THREE.Vector3, kind: HitKind, swing?: THREE.Vector3, scar = true, dmgScale = 1) {
  const headshot = (kind === 'throw' || kind === 'bullet') && at.y - en.root.position.y >= HEADSHOT_HEIGHT;
  staggerDummy(def.knock ?? DEFAULT_KNOCK, at, swing);
  en.flashT = 0;
  hitStop = Math.max(hitStop, def.hitStop ?? DEFAULT_HIT_STOP);
  hitStopTotal = hitStop;
  hitStopShakesDummy = true;
  shakeEnemy = en;

  // 空振りとの差をはっきりさせるため、当たったときだけ画面を大きく揺らして反動も足す
  const fx = def.fx ?? 1;
  addTrauma(HIT_TRAUMA * fx);
  kickVel.x += def.kick[0] * DEG * 12 * fx;
  kickVel.y += def.kick[1] * DEG * 12 * fx;
  kickVel.z += def.kick[2] * DEG * 12 * fx;
  playHit(fx, kind);
  spawnHitFx(at, hitDir, def, swing);
  if (scar && (kind === 'kunai' || kind === 'sword' || kind === 'axe')) addSlashScar(en, camera, at, hitDir, def, kind, swing);

  const damage = hitDamage(def, kind) * dmgScale * (headshot ? HEADSHOT_MULT : 1);
  en.hp -= damage;
  if (def !== SWORD_ISSEN && def !== DEADEYE_HIT) chargeFocus(damage); // 一閃・デッドアイそのものでは溜めない
  countHit(en.hp <= 0);
  trackHitProcess(def, kind);
  if (en.hp <= 0) {
    countChain();
    countMulti(def);
    showKillScore(killBonuses(def, headshot)); // 倒した瞬間の体勢で数えるので、killDummy で状態が変わる前に
    killDummy(kind, swing);
    showHitMarker(true);
  } else {
    showHitMarker(fx >= HEAVY_FX || headshot);
  }
}

function killDummy(kind?: HitKind, swing?: THREE.Vector3) {
  en.alive = false;
  en.deadTime = 0;
  sinceKill = 0;
  finale = !!stageRun?.running && stageRun.kills + 1 >= stageRun.quota;
  hitStop = Math.max(hitStop, finale ? FINALE_HIT_STOP : KILL_HIT_STOP);
  hitStopTotal = hitStop;
  killSlowTime = 0;
  addTrauma(finale ? 1 : 0.45);
  fovKick += finale ? 18 : 9;
  // 刺さっていたクナイは砕ける前に抜いて手元へ戻す
  for (const t of thrown) if (t.phase === 'stuck' && isOnDummy(t.mesh)) startReturn(t);
  breakDummy(hitDir, kind === 'axe', swing);
  en.root.visible = false;
  spawnKillFx(en.root.position, hitDir);
  if (finale) {
    spawnFinaleFx(en.root.position, hitDir);
    sfx.playFinale(FINALE_HIT_STOP);
    finaleHud.classList.add('on');
    document.body.classList.add('finale'); // キルスコアを FINISH の帯の上へ逃がす
  } else {
    sfx.playKill();
  }
  rewardKill();
  countStageKill();
  startleAllies();
}

// 仲間が倒されたら、近くの敵はびくっと身をすくめ、首をそちらへ振り、構えを解いて立ち位置を変え始める
const STARTLE_RANGE = 16;
const STARTLE_DUCK = 0.7; // 腰を沈める勢い (m/s)
const STARTLE_LOOK = 4; // 首を振る勢い (rad/s)
function startleAllies() {
  const dead = en;
  const at = dead.root.position;
  for (const e of enemies) {
    if (e === dead || !e.alive || e.riseTime < RESPAWN_RISE_TIME) continue;
    const dx = at.x - e.root.position.x;
    const dz = at.z - e.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d > STARTLE_RANGE) continue;
    const k = 1 - (d / STARTLE_RANGE) * 0.6; // 近いほど大きく驚く
    const rel = wrapAngle(Math.atan2(dx, dz) - e.yaw);
    e.pelvisSpring.v.y -= STARTLE_DUCK * k;
    e.headSpring.v.y += Math.sign(rel) * Math.min(Math.abs(rel), 1) * STARTLE_LOOK * k;
    e.gunSpring.v.x -= 1.2 * k;
    e.cooldown = Math.max(e.cooldown, rand(0.35, 0.6));
    if (!e.moving && e.dodgeT <= 0) e.waitT = Math.min(e.waitT, rand(0.15, 0.4));
  }
  setEn(dead);
}

// 倒したご褒美: ダッシュを満タンにし、鎖鎌の引き寄せを 1 回分戻し、少し回復し、今の進む向きへ勢いを足す（止まらずに次へ向かえるように）
const KILL_HEAL = 15;
const KILL_BOOST = 5; // 水平の速さへ足す量
const KILL_BOOST_MAX = 30; // 勢いを足してもこれ以上は速くしない
function rewardKill() {
  player.dashCharges = DASH_CHARGES;
  player.dashRecharge = 0;
  hookCharges = Math.min(HOOK_CHARGES, hookCharges + 1); // 鎖鎌の引き寄せは 1 回分だけ戻す
  if (hookCharges >= HOOK_CHARGES) hookRecharge = 0;
  healPlayer(KILL_HEAL);
  if (player.mantleTime >= 0) return;
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 1) {
    // ほとんど止まっていたら、向いている方へ押し出す
    camera.getWorldDirection(hitLook);
    hitLook.y = 0;
    if (hitLook.lengthSq() < 1e-6) return;
    hitLook.normalize();
    velocity.x = hitLook.x * KILL_BOOST;
    velocity.z = hitLook.z * KILL_BOOST;
  } else if (speed < KILL_BOOST_MAX) {
    setHorizontalSpeed(Math.min(speed + KILL_BOOST, KILL_BOOST_MAX));
  }
}

// 連続撃破: 起き上がってから、または前の敵を倒してから CHAIN_WINDOW 秒以内に倒すと、連続の数を増やす
const CHAIN_WINDOW = 3;
const CHAIN_STEP = 0.5; // 連続 1 回ごとに倍率へ足す量
const CHAIN_MAX = 2;
let killChain = 1; // 今の連続の数（1 = 連続していない）
function countChain() {
  killChain = en.riseTime <= CHAIN_WINDOW || sinceKill <= CHAIN_WINDOW ? killChain + 1 : 1;
}

// 倒すまでの過程を en に記録する。当たりを処理するたびに呼ぶ
const SPIN_WINDOW = 0.7; // 前の当たりからこの時間内に 1 回転して当てると SPIN
let viewSpin = 0; // 前の当たりから視点を左右へ回した量（向きを含む, rad）
let lastAnyHitAt = -Infinity; // どの敵かを問わず、最後に当てた時刻（実時間）
function trackHitProcess(def: HitDef, kind: HitKind) {
  const now = performance.now() / 1000;
  // 投げたクナイや撃った弾は、着く前に持ち替えていても、放った武器で数える
  en.weapons.add(kind === 'throw' ? 'kunai' : def === BULLET_HIT || def === DEADEYE_HIT ? 'handgun' : shownWeapon);
  if (en.hits > 0 && now - en.lastHitAt > HIT_COUNT_WINDOW) en.comboKept = false;
  if (now - lastAnyHitAt <= SPIN_WINDOW && Math.abs(viewSpin) >= Math.PI * 2) en.spun = true;
  if (def === PARRY_RETURN_HIT) en.parried = true;
  en.hits++;
  en.lastHitAt = lastAnyHitAt = now;
  viewSpin = 0;
}

// 同時撃破: 前の敵を倒してから MULTI_WINDOW 秒以内（ゲーム内の時間）に同じ技で倒すと、同時に倒した数を増やす
const MULTI_WINDOW = 0.15;
const MULTI_STEP = 1; // 1 体増えるごとに倍率へ足す量
const MULTI_MAX = 2;
let multiKill = 1; // 今の同時撃破の数（1 = 単独）
let lastKillDef: HitDef | null = null;
function countMulti(def: HitDef) {
  multiKill = def === lastKillDef && sinceKill <= MULTI_WINDOW ? multiKill + 1 : 1;
  lastKillDef = def;
}

// とどめの倒し方ごとに、スコアの倍率へ足す量
const LONG_SHOT_DIST = 12; // これより遠くから倒すと遠距離の加点。さらに 6 m 離れるごとに 0.5 ずつ増やす
const LONG_SHOT_MAX = 2;
const SPEED_KILL_MIN = 20; // 倒した瞬間の水平の速さがこれ以上なら速さの加点
const SPEED_KILL_HIGH = 30; // これ以上なら加点を倍にする
const killAt = new THREE.Vector3();
function killBonuses(def: HitDef, headshot: boolean): KillBonus[] {
  const out: KillBonus[] = [];
  if (headshot) out.push({ label: 'HEADSHOT', add: 1 });
  if (multiKill > 1) out.push({ label: 'MULTI KILL', detail: `×${multiKill}`, add: Math.min(MULTI_MAX, (multiKill - 1) * MULTI_STEP) });
  if (en.weapons.size >= 2) out.push({ label: 'SWITCH', detail: `${en.weapons.size} WEAPONS`, add: 1 });
  if (def === PARRY_RETURN_HIT) out.push({ label: 'PARRY KILL', add: 2 });
  else if (en.parried) out.push({ label: 'PARRY', add: 1 }); // とどめ以外でパリィを当てていた（PARRY KILL とは重ねない）
  if (en.hits >= 2 && en.comboKept) out.push({ label: 'COMBO', detail: `${en.hits} HITS`, add: 1 });
  if (en.spun) out.push({ label: '360', add: 1 });
  if (!en.hitPlayer) out.push({ label: 'NO DAMAGE', add: 0.5 });
  if (player.sliding || def === SLIDE_UP || def === SWORD_SWEEP) out.push({ label: 'SLIDE KILL', add: 1 });
  if (def === SWORD_ISSEN) out.push({ label: 'IAI', add: 1 });
  if (def === DEADEYE_HIT) out.push({ label: 'DEAD EYE', add: 1 });
  if (def === DASH_SLASH || def === AXE_DRIVE || def === SWORD_THRUST || def === SICKLE_DASH_HIT || def === SICKLE_DASH_LAST) out.push({ label: 'DASH KILL', add: 0.5 });
  if (def === SWORD_CHARGE_SLASH) out.push({ label: 'CHARGED', add: 0.5 });
  if (def === AXE_SHOCK_HIT) out.push({ label: 'SHOCKWAVE', add: 0.5 });
  if (def === WALL_SLAM_HIT) out.push({ label: 'WALL SLAM', add: 1 });
  if (def === FLOOR_SLAM_HIT) out.push({ label: 'GROUND SLAM', add: 1 });
  if (en.airY > 0.5) out.push({ label: 'JUGGLE', add: 1 });
  if (def === SICKLE_PULL_HIT || def === SICKLE_PULL_LAST || def === GRAPPLE_STICK_HIT) out.push({ label: 'HOOK KILL', add: 1 });
  if (player.wallRunning) out.push({ label: 'WALL RUN', add: 1 });
  else if (!player.onGround && player.mantleTime < 0) out.push({ label: 'AERIAL', add: 0.5 });
  const dist = camera.position.distanceTo(killAt.set(en.root.position.x, en.root.position.y + LOCK_HEIGHT, en.root.position.z));
  if (dist >= LONG_SHOT_DIST) {
    const add = Math.min(LONG_SHOT_MAX, 0.5 + Math.floor((dist - LONG_SHOT_DIST) / 6) * 0.5);
    out.push({ label: 'LONG SHOT', detail: `${Math.round(dist)}M`, add });
  }
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed >= SPEED_KILL_MIN) {
    out.push({ label: 'SPEED KILL', detail: `${Math.round(speed)}M/S`, add: speed >= SPEED_KILL_HIGH ? 1 : 0.5 });
  }
  if (killChain > 1) {
    out.push({ label: 'CHAIN', detail: `×${killChain}`, add: Math.min(CHAIN_MAX, (killChain - 1) * CHAIN_STEP) });
  }
  return out;
}

function respawnDummy() {
  if (enemySpawns.length > 0) placeDummy(pickSpawn());
  en.alive = true;
  en.hp = DUMMY_MAX_HP;
  en.airY = 0;
  en.airVel = 0;
  en.airTilt.set(0, 0, 0);
  en.airTiltVel.set(0, 0, 0);
  en.airPose = 0;
  en.spiked = false;
  en.root.position.y = en.baseY;
  resetDummyStagger();
  clearDebris();
  clearScars(en);
  en.root.visible = true;
  en.riseTime = 0;
  en.flashT = 0;
  en.cooldown = ENEMY_FIRST_SHOT;
  en.speedMul = rand(0.85, 1.2);
  en.dodgeCool = rand(1, 3);
  en.hits = 0;
  en.lastHitAt = -Infinity;
  en.comboKept = true;
  en.parried = en.spun = en.hitPlayer = false;
  en.weapons.clear();
  // 足元から小さく光を散らして、現れたことを知らせる
  spawnSparks(respawnAt.set(en.root.position.x, en.root.position.y + 0.05, en.root.position.z), UP, 14, 1.2, 0.8);
}
const respawnAt = new THREE.Vector3();

// ---- ステージでの敵の出現 ----
// ステージでは、難易度で決まる数の敵を同時に出す。始めの敵はステージの組み上がりには加えず、操作を返してから 1 体ずつ間を空けて
// 出現位置に現れる。倒された敵は、しばらくして別の出現位置から起き上がる。
// 出現位置は、プレイヤーから近すぎず遠すぎない所から選び、倒された所と、ほかの敵のすぐ近くには出さない。
// 訓練場では出現位置を持たず、その場で起き上がる
const SPAWN_NEAR = 12;
const SPAWN_FAR = 50;
const SPAWN_APART = 4; // ほかの敵からこれより近い出現位置は使わない
const STAGE_ENEMY_COUNT = { easy: 2, normal: 3, hard: 4 } as const;
const STAGE_SPAWN_FIRST = 0.6; // 操作を返してから最初の敵が現れるまで
const STAGE_SPAWN_GAP = 0.8; // 次の敵が現れるまでの間

// ---- ステージのクリア ----
// 難易度で決まる数を倒したら終わり。時間は操作を返してから最後の 1 体を倒すまでの実時間で測る（一時停止の間は数えない）。
// 残りの数より多くは湧かせないので、最後の 1 体を倒すと場に敵はいなくなる。とどめのスローの余韻を見せてから結果を出す
const STAGE_KILL_QUOTA = { easy: 10, normal: 15, hard: 20 } as const;
const RESULT_DELAY = 3.2; // 倒しきってから結果を出すまで（実時間）。最後の 1 体の長いスローを見せきってから
const finaleHud = document.getElementById('finale')!;
document.fonts.load('800 100px "Barlow Condensed"', 'FINISH'); // 出す瞬間に別の字形で一瞬出ないよう、太字を先に読み込んでおく
document.fonts.load('600 100px "Oswald"', 'FASTFINISH'); // ステージの始まりのタイトルの字も先に読み込んでおく
interface StageRun {
  quota: number;
  kills: number;
  time: number;
  damage: number; // 受けたダメージの合計（1 で耐えた分も、受けた量のまま数える）
  running: boolean; // 時間を測っている間
  clearedT: number; // 倒しきってからの実時間。-1 = まだ / もう結果を出した
}
let stageRun: StageRun | null = null; // 訓練場では null
const runHud = document.querySelector<HTMLElement>('#total .run')!;
const runTime = runHud.querySelector<HTMLElement>('.time')!;
// 残りの敵の数は画面の中央下に大きく出す
const remainHud = document.getElementById('remain')!;
const remainNum = remainHud.querySelector<HTMLElement>('.num')!;
function beginStageRun() {
  stageRun = { quota: STAGE_KILL_QUOTA[DIFFICULTIES[difficultyIndex]], kills: 0, time: 0, damage: 0, running: false, clearedT: -1 };
  runTime.textContent = fmtTime(0);
  runHud.hidden = false;
  remainNum.textContent = String(stageRun.quota);
  remainHud.hidden = false;
}
// まだ湧かせてよいか。倒した数と場にいる数を足して、倒す数に届いたら湧かせない
function canSpawnEnemy() {
  return !stageRun || stageRun.kills + enemies.filter((e) => e.alive).length < stageRun.quota;
}
function countStageKill() {
  if (!stageRun?.running) return;
  stageRun.kills++;
  remainNum.textContent = String(stageRun.quota - stageRun.kills);
  // 減った瞬間に大きく叩きつけてから収める
  remainNum.animate(
    [{ transform: 'scale(1.5)', filter: 'brightness(3)' }, { transform: 'none', filter: 'none' }],
    { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
  );
  if (stageRun.kills < stageRun.quota) return;
  stageRun.running = false;
  stageRun.clearedT = 0;
  runHud.classList.add('clear');
  remainHud.classList.add('clear');
}
function updateStageRun(realDt: number) {
  if (!stageRun) return;
  if (stageRun.running) {
    stageRun.time += realDt;
    runTime.textContent = fmtTime(stageRun.time);
  } else if (stageRun.clearedT >= 0) {
    stageRun.clearedT += realDt;
    if (stageRun.clearedT >= RESULT_DELAY) showStageResult(stageRun);
  }
}
// 一時停止の画面を結果の画面に作り替えて止める。ここからはタイトルへ戻ることしかできない。
// 自己ベストと比べてから記録し直す
function showStageResult(run: StageRun) {
  run.clearedT = -1;
  const button = stageButtons[stageIndex];
  const stage = button.dataset.stage!;
  const difficulty = DIFFICULTIES[difficultyIndex];
  const score = finalScore(totalScore(), run.time, run.kills);
  const best = loadBest(stage, difficulty);
  const newTime = !best || run.time < best.time;
  const newScore = !best || score > best.score;
  saveBest(stage, difficulty, { time: newTime ? run.time : best.time, score: newScore ? score : best.score });
  overlay.classList.add('result');
  overlayStatus.textContent = '';
  overlayPrompt.textContent = 'ENTER — SKIP';
  showResult(
    {
      stageNo: button.querySelector('.no')!.textContent!,
      stageName: stage.toUpperCase(),
      difficulty: difficulty.toUpperCase(),
      time: run.time,
      kills: run.kills,
      damage: Math.round(run.damage),
      score,
      newTime,
      newScore,
    },
    () => (overlayPrompt.textContent = 'ENTER — TITLE'),
  );
  pauseGame();
}
let enemySpawns: StageLayout['enemySpawns'] = [];
// en を出す出現位置を選ぶ
function pickSpawn(): number {
  const off = (i: number) => {
    const d = Math.hypot(enemySpawns[i].x - position.x, enemySpawns[i].z - position.z);
    return Math.max(SPAWN_NEAR - d, d - SPAWN_FAR); // 0 以下なら程よい距離
  };
  const crowded = (i: number) =>
    enemies.some((e) => e !== en && e.alive && Math.hypot(e.root.position.x - enemySpawns[i].x, e.root.position.z - enemySpawns[i].z) < SPAWN_APART);
  const all = enemySpawns.map((_, i) => i);
  let cands = all.filter((i) => i !== en.spawnIndex && !crowded(i));
  if (cands.length === 0) cands = all.filter((i) => i !== en.spawnIndex);
  if (cands.length === 0) cands = all;
  const good = cands.filter((i) => off(i) <= 0);
  if (good.length > 0) return good[Math.floor(Math.random() * good.length)];
  // 程よい所が無ければ、程よい距離に一番近い所
  return cands.reduce((a, b) => (off(b) < off(a) ? b : a));
}
// en を出現位置へ移し、プレイヤーの方を向かせる。着いたらまず少し立ち止まってから歩き出す
function placeDummy(i: number) {
  en.spawnIndex = i;
  const s = enemySpawns[i];
  en.baseY = s.y;
  en.root.position.set(s.x, s.y, s.z);
  en.yaw = Math.atan2(position.x - s.x, position.z - s.z);
  en.root.quaternion.setFromAxisAngle(UP, en.yaw);
  en.aimYaw = en.aimPitch = 0;
  en.moving = false;
  en.waitT = rand(ENEMY_WAIT_MIN, ENEMY_WAIT_MAX);
  en.vel.set(0, 0, 0);
  en.knockVel.set(0, 0, 0);
  en.flung = false;
  en.walk = 0;
}

// とどめの印: 今持っている武器の基本の一撃で倒せるまで削れたら、敵の体を画面上で囲む
function finishMarkHp(): number {
  switch (shownWeapon) {
    case 'kunai': return hitDamage(SLASH_1, 'kunai');
    case 'handgun': return hitDamage(BULLET_HIT, 'bullet');
    case 'sword': return hitDamage(SWORD_KESA, 'sword');
    case 'sickle': return hitDamage(SICKLE_KESA_HIT, 'sword') * SICKLE_DAMAGE_SCALE;
    case 'axe': return hitDamage(AXE_KESA, 'axe');
    case 'chakram': return 0; // 技がまだ無いので印は出さない
  }
}
const FINISH_MARK_PAD = 6; // 体のまわりに空ける余白 (px)
const FINISH_MARK_MIN = 28; // 遠くても括弧どうしが重ならない大きさ (px)
const FINISH_MARK_EDGE = 24; // 近づいて画面からはみ出すときも、画面の端からこれだけ内側に収める (px)
const finishBox = new THREE.Box3();
const finishCorner = new THREE.Vector3();
// カメラの揺れを足した後、描画の直前に呼ぶ（印が敵からずれないように）
function updateFinishMark() {
  for (const e of enemies) {
    setEn(e);
    updateFinishMarkOf();
  }
  updateThreatMarks();
}

// ---- 画面外の敵の印 ----
// 画面に映っていない敵の向きを、クロスヘアのまわりのくさびで示す。向きは、カメラから見た敵の胸の位置の上下左右から決める
// （後ろにいる敵も、振り向く向きに出る）。近いほど濃く、撃つ直前の敵は大きくする
const THREAT_RADIUS = 64; // クロスヘアの中心からの距離 (px)
const THREAT_NEAR = 10; // これより近ければいちばん濃い (m)
const THREAT_FAR = 45; // これより遠ければいちばん薄い
const THREAT_EDGE = 0.92; // 画面の端からこれだけ内側（-1..1 の座標）に映っていれば、見えているとみなす
const THREAT_AIMING = 0.4; // 次に撃つまでがこれより短い敵は「撃つ直前」として大きくする (s)
const threatPos = new THREE.Vector3();
const threatNdc = new THREE.Vector3();
function updateThreatMarks() {
  camera.updateMatrixWorld();
  for (const e of enemies) {
    const el = e.threatEl;
    threatPos.set(e.root.position.x, e.root.position.y + LOCK_HEIGHT, e.root.position.z);
    threatNdc.copy(threatPos).project(camera);
    const onScreen = threatNdc.z < 1 && Math.abs(threatNdc.x) < THREAT_EDGE && Math.abs(threatNdc.y) < THREAT_EDGE;
    if (!e.alive || !e.root.visible || onScreen) {
      el.style.opacity = '0';
      continue;
    }
    const dist = threatPos.distanceTo(camera.position);
    threatPos.applyMatrix4(camera.matrixWorldInverse); // カメラの座標（x が右、y が上、-z が前）
    // 上から時計回りの角度。前にいれば画面の上下左右の向き、後ろにいれば上から見下ろした向き（左右はそのまま、真後ろは真下）にする
    // （後ろの敵の高さで上を指すと、上を見ればいいように見えてしまう）
    const angle = threatPos.z < 0 ? Math.atan2(threatPos.x, threatPos.y) : Math.atan2(threatPos.x, -threatPos.z);
    const near = 1 - THREE.MathUtils.clamp((dist - THREAT_NEAR) / (THREAT_FAR - THREAT_NEAR), 0, 1);
    const aiming = e.cooldown < THREAT_AIMING;
    el.style.opacity = String(aiming ? 1 : 0.3 + 0.55 * near);
    el.style.transform = `rotate(${angle}rad) translateY(${-THREAT_RADIUS}px) scale(${aiming ? 1.4 : 1})`;
  }
}
// en のとどめの印を出す
function updateFinishMarkOf() {
  let show = en.alive && en.hp <= finishMarkHp() && en.riseTime >= RESPAWN_RISE_TIME;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (show) {
    camera.updateMatrixWorld();
    finishBox.setFromObject(en.shake);
    for (let i = 0; i < 8 && show; i++) {
      finishCorner.set(
        i & 1 ? finishBox.max.x : finishBox.min.x,
        i & 2 ? finishBox.max.y : finishBox.min.y,
        i & 4 ? finishBox.max.z : finishBox.min.z,
      ).project(camera);
      if (finishCorner.z > 1) show = false; // カメラの後ろに回った
      x0 = Math.min(x0, finishCorner.x);
      x1 = Math.max(x1, finishCorner.x);
      y0 = Math.min(y0, finishCorner.y);
      y1 = Math.max(y1, finishCorner.y);
    }
    if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) show = false; // 画面の外
  }
  en.finishEl.classList.toggle('show', show);
  if (!show) return;
  const w = window.innerWidth, h = window.innerHeight;
  const cx = ((x0 + x1) / 4 + 0.5) * w;
  const cy = (0.5 - (y0 + y1) / 4) * h;
  const bw = Math.max(FINISH_MARK_MIN, ((x1 - x0) / 2) * w + FINISH_MARK_PAD * 2);
  const bh = Math.max(FINISH_MARK_MIN, ((y1 - y0) / 2) * h + FINISH_MARK_PAD * 2);
  // 近づいて画面からはみ出す分は、画面の内側へ寄せて四隅が必ず見えるようにする
  const left = Math.max(FINISH_MARK_EDGE, cx - bw / 2);
  const top = Math.max(FINISH_MARK_EDGE, cy - bh / 2);
  const right = Math.min(w - FINISH_MARK_EDGE, cx + bw / 2);
  const bottom = Math.min(h - FINISH_MARK_EDGE, cy + bh / 2);
  const side = Math.min(right - left, bottom - top);
  en.finishEl.style.left = `${left}px`;
  en.finishEl.style.top = `${top}px`;
  en.finishEl.style.width = `${Math.max(0, right - left)}px`;
  en.finishEl.style.height = `${Math.max(0, bottom - top)}px`;
  // 大きく囲むほど角を長く太くして、細い線が画面の端で埋もれないようにする
  const arm = THREE.MathUtils.clamp(side * 0.2, 10, 44);
  en.finishEl.style.setProperty('--arm', `${arm}px`);
  en.finishEl.style.setProperty('--w', `${THREE.MathUtils.clamp(arm * 0.12, 2.5, 4.5)}px`);
}

// 倒したときに時間へ掛ける倍率（実時間で進める）
function killSlowFactor(dt: number) {
  killSlowTime += dt;
  const [scale, hold, release] = finale
    ? [FINALE_SLOW_SCALE, FINALE_SLOW_HOLD, FINALE_SLOW_RELEASE]
    : [KILL_SLOW_SCALE, KILL_SLOW_HOLD, KILL_SLOW_RELEASE];
  const u = THREE.MathUtils.clamp((killSlowTime - hold) / release, 0, 1);
  return THREE.MathUtils.lerp(scale, 1, u * u);
}
// 最後の 1 体を倒したときの白黒: 倒してから結果を出すまでずっと白黒のままにする（結果の画面もその画のまま）
function finaleMono() {
  return finale ? 1 : 0;
}

// ヒットストップ中は敵の見た目だけを小刻みに震わせ、止まった画に衝撃を残す
const HIT_TRAUMA = 0.18; // fx = 1 のときに当たりで足す画面の揺れ
const DUMMY_SHAKE = 0.05; // 震えの幅 (m)
let hitStopTotal = 0;
let hitStopShakesDummy = true; // パリィで止めたときは敵を震わせない
let shakeSide = 1;
let shakeEnemy: Enemy | null = null; // 震わせる敵（最後に当てた敵）
function updateDummyShake() {
  for (const e of enemies) poseEnemyTumble(e);
  if (hitStop <= 0 || !hitStopShakesDummy || !shakeEnemy) return;
  setEn(shakeEnemy);
  // 左右へ交互に振り、止まりきる前に弱めていく
  const k = DUMMY_SHAKE * Math.min(1, hitStop / Math.max(hitStopTotal, 1e-3));
  shakeSide = -shakeSide;
  const side = shakeSide * k * (0.6 + Math.random() * 0.4);
  // dummy は傾いているので、ローカルの横向きで揺らす
  dummyShakeOff.set(-hitDir.z * side, (Math.random() - 0.5) * k * 0.4, hitDir.x * side);
  en.shake.position.add(dummyShakeOff.applyQuaternion(dummyShakeInv.copy(en.root.quaternion).invert()));
}
const dummyShakeInv = new THREE.Quaternion();
const dummyShakeOff = new THREE.Vector3();

// 照準のヒットマーカー: 照準の周りに斜めの 4 本線を一瞬出す（締めの技は大きく）
const hitMarker = document.getElementById('hitmarker')!;
function showHitMarker(heavy: boolean) {
  hitMarker.classList.remove('show', 'heavy');
  void hitMarker.offsetWidth; // アニメーションを最初からやり直す
  hitMarker.classList.add('show');
  if (heavy) hitMarker.classList.add('heavy');
}

// ヒット数: 前の当たりから HIT_COUNT_WINDOW 秒以内に当てると数を足し、2 から照準の左に出す。
// 表示が消える長さ（#hits のアニメーション）と同じにして、数が見えている間だけつながるようにする
const HIT_COUNT_WINDOW = 1;
const hitsEl = document.getElementById('hits')!;
let hitCount = 0;
let lastHitAt = -Infinity;
function countHit(killed: boolean) {
  const now = performance.now() / 1000;
  hitCount = now - lastHitAt <= HIT_COUNT_WINDOW ? hitCount + 1 : 1;
  lastHitAt = killed ? -Infinity : now; // 倒したら次の敵は 1 から数え直す
  if (hitCount < 2) return;
  hitsEl.textContent = String(hitCount);
  hitsEl.classList.remove('show');
  void hitsEl.offsetWidth; // アニメーションを最初からやり直す
  hitsEl.classList.add('show');
}

// クナイは手元にあって敵まで届かないので、視点から切っ先を通る線が敵に当たる所を「当たった場所」にする。
// 線が敵を外れているときは、敵の輪郭のうち切っ先にいちばん近い所にする
const hitPose = newPose();
const hitRay = new THREE.Ray();
const hitTip = new THREE.Vector3();
const hitAxisA = new THREE.Vector3();
const hitAxisB = new THREE.Vector3();
const hitOnRay = new THREE.Vector3();
const hitOnAxis = new THREE.Vector3();
const hitOffset = new THREE.Vector3();
function findHitPoint(def: AttackDef, out: THREE.Vector3) {
  attackPoseAt(def, attackTime, hitPose);
  applyPose(hitPose);
  camera.updateMatrixWorld();
  kunai.updateWorldMatrix(true, false);
  hitPointFromTip(hitTip.copy(TRAIL_TIP).applyMatrix4(kunai.matrixWorld), out);
}

// 視点から tip（ワールド座標）を通る線が敵に当たる所。外れていれば敵の輪郭のうち線に最も近い所
function hitPointFromTip(tip: THREE.Vector3, out: THREE.Vector3) {
  hitRay.origin.copy(camera.position);
  hitRay.direction.subVectors(tip, camera.position).normalize();

  // 敵を縦の円柱とみなす（頭の分も含めて、少し内側の高さに収める）
  hitAxisA.set(en.root.position.x, en.root.position.y + 0.25, en.root.position.z);
  hitAxisB.set(en.root.position.x, en.root.position.y + DUMMY_HEIGHT - 0.15, en.root.position.z);
  hitRay.distanceSqToSegment(hitAxisA, hitAxisB, hitOnRay, hitOnAxis);

  // 軸から線までの横のずれを半径に収め、攻撃した側の表面へ押し出す
  hitOffset.subVectors(hitOnRay, hitOnAxis);
  hitOffset.y = 0;
  hitOffset.addScaledVector(hitDir, -hitOffset.dot(hitDir)); // 奥行きの成分は捨てて、横のずれだけにする
  if (hitOffset.length() > DUMMY_RADIUS) hitOffset.setLength(DUMMY_RADIUS);
  const depth = Math.sqrt(Math.max(0, DUMMY_RADIUS ** 2 - hitOffset.lengthSq()));
  out.copy(hitOnAxis).add(hitOffset).addScaledVector(hitDir, -depth);
}

// ---- 切り跡 ----（fx/scars.ts）

// ---- 敵 ----
// 状態は enemy/state.ts、よろめきと表情は enemy/stagger.ts、砕けた体は enemy/debris.ts、
// 打ち上げ・吹き飛び・移動・横っ飛び・足取りは enemy/motion.ts。作る・消す・毎フレーム回すのはここ
initEnemyEnv({
  scene,
  addTrauma,
  isHeld: enemyHeld,
  playerHp: () => playerHp,
  slamIntoFloor: slamEnemyIntoFloor,
  slamIntoWall: slamEnemyIntoWall,
});

// とどめの印は 1 体ずつ別の要素で出す（ページにある 1 つを型にして複製する）
const finishTemplate = document.getElementById('finish')!;
const threatsEl = document.getElementById('threats')!;

function createEnemy(mobile: boolean): Enemy {
  const body = buildEnemyBody();
  const gun = attachEnemyGun(body);
  const muzzle = gun.userData.muzzle as THREE.Object3D;
  const muzzleFx = muzzleFlash.clone();
  muzzleFx.visible = false;
  muzzle.add(muzzleFx);
  const springs = [spring(55, 8), spring(150, 12), spring(110, 10), spring(240, 14), spring(180, 13)];
  const finishEl = finishTemplate.cloneNode(true) as HTMLElement;
  finishEl.removeAttribute('id');
  finishTemplate.after(finishEl);
  const threatEl = threatsEl.appendChild(document.createElement('i'));
  const e: Enemy = {
    ...body,
    gun,
    muzzle,
    muzzleFx,
    pelvisSpring: springs[0],
    leanSpring: springs[1],
    twistSpring: springs[2],
    headSpring: springs[3],
    gunSpring: springs[4],
    springs,
    prevLeanVel: new THREE.Vector3(),
    prevTwistVel: 0,
    footState: [-1, 1].map((side) => {
      const rest = new THREE.Vector3(DUMMY_LEG_X * side, DUMMY_ANKLE_Y, 0);
      return { rest, pos: rest.clone(), from: rest.clone(), to: rest.clone(), t: 1, side };
    }),
    scars: [],
    debris: [],
    debrisRootSet: new Set([
      body.pelvis, body.spine, body.neck, ...body.thighs, ...body.shins, ...body.feet, ...body.arms, ...body.forearms, gun,
    ]),
    finishEl,
    threatEl,
    yaw: 0,
    aimYaw: 0,
    aimPitch: 0,
    hp: DUMMY_MAX_HP,
    alive: true,
    deadTime: 0,
    riseTime: Infinity,
    flashT: Infinity,
    cooldown: ENEMY_FIRST_SHOT,
    flashAge: Infinity,
    riseDelay: 0,
    baseY: 0,
    spawnIndex: -1,
    mobile,
    moving: false,
    moveTo: new THREE.Vector3(),
    waitT: 0,
    vel: new THREE.Vector3(),
    knockVel: new THREE.Vector3(),
    flung: false,
    walk: 0,
    walkPhase: 0,
    walkDir: new THREE.Vector3(0, 0, 1),
    airY: 0,
    airVel: 0,
    airTilt: new THREE.Vector3(),
    airTiltVel: new THREE.Vector3(),
    airRoll: 0,
    airPose: 0,
    spiked: false,
    poseLean: new THREE.Vector3(),
    prevVel: new THREE.Vector3(),
    brace: 0,
    idleT: Math.random() * 10,
    speedMul: 1,
    aimedAt: 0,
    dodgeT: 0,
    dodgeCool: rand(1, 3),
    dodgeVel: new THREE.Vector3(),
    stumble: 0,
    stumbling: false,
    skidT: 0,
    hits: 0,
    lastHitAt: -Infinity,
    comboKept: true,
    parried: false,
    spun: false,
    hitPlayer: false,
    weapons: new Set(),
  };
  scene.add(e.root);
  enemies.push(e);
  return e;
}

function removeEnemy(e: Enemy) {
  setEn(e);
  for (const t of thrown) if (t.phase === 'stuck' && isOnDummy(t.mesh)) startReturn(t);
  clearDebris();
  clearScars(en);
  e.root.removeFromParent();
  e.finishEl.remove();
  e.threatEl.remove();
  enemies.splice(enemies.indexOf(e), 1);
}

// 敵を全員ぶん進め、飛んでいる敵の弾を進める
let sinceKill = Infinity; // 最後に倒してからの時間
function updateEnemies(dt: number) {
  sinceKill += dt;
  camera.getWorldPosition(playerEye);
  camera.getWorldDirection(playerLook);
  for (const e of enemies) {
    setEn(e);
    updateDummy(dt);
  }
  updateEnemyBullets(dt);
}

function updateDummy(dt: number) {
  if (en.alive) {
    en.idleT += dt;
    if (en.airY > 0 || en.airVel > 0) updateEnemyAir(dt);
    updateEnemyTumble(dt);
    updateEnemyKnock(dt);
    updateEnemyMove(dt);
    updateEnemyGait(dt);
    updateDummyAim(dt);
    updateDummyStagger(dt);
  } else {
    en.deadTime += dt;
    updateDebris(dt);
    if (en.deadTime >= RESPAWN_TIME && canSpawnEnemy()) respawnDummy();
  }
  updateScars(en, dt);

  // 起き上がり: 地面から伸びるように縦に大きくなり、少し行き過ぎて収まる
  en.riseTime += dt;
  const rise = Math.min(1, en.riseTime / RESPAWN_RISE_TIME);
  const s = rise < 1 ? 1 + 1.7 * (rise - 1) ** 3 + 0.7 * (rise - 1) ** 2 : 1;
  en.root.scale.set(1, Math.max(0.001, s), 1);

  // 当たった瞬間は真っ白にして、すぐ元の色へ戻す
  en.flashT += dt;
  const fade = THREE.MathUtils.clamp((en.flashT - FLASH_HOLD) / FLASH_FADE, 0, 1);
  for (const m of en.mats) m.emissiveIntensity = (1 - fade) * (1 - fade);

  updateEnemyFire(dt);
}

// ---- 床と壁への叩きつけ ----（当たりの処理を呼ぶので本体に置く。敵の動きは enemy/motion.ts）
const FLOOR_SLAM_HIT: HitDef = { kick: [-2, 0, 0], slash: 0, knock: 420, hitStop: 0.14, fx: 1.4 };
const floorSlamAt = new THREE.Vector3();
function slamEnemyIntoFloor() {
  floorSlamAt.set(en.root.position.x, en.baseY, en.root.position.z);
  sfx.playAxeGround(1.4);
  addTrauma(0.35);
  spawnAxeShock(floorSlamAt, 2.2, 0.4);
  spawnSparks(floorSlamAt, UP, 16, 1, 1.1);
  en.airVel = ENEMY_SPIKE_BOUNCE;
  en.airY = 1e-3;
  en.pelvisSpring.v.y -= 6; // 体ごと床へ潰れる
  en.airTiltVel.x -= AIR_TILT_KICK; // 反り返ったまま床に打ち付けられる
  // 体の、床に打ち付けられた背中のあたりを打つ
  hitDir.copy(UP);
  floorSlamAt.y += 0.5;
  applyDummyHit(FLOOR_SLAM_HIT, floorSlamAt, 'axe', undefined, false);
}
// ---- 壁への叩きつけ ----
// 斧の突進で前へ飛ばした敵が壁に当たると、その速さに応じた重い一撃になる。叩きつけたら true
const WALL_SLAM_MIN = 5; // これより遅く当たったら叩きつけにしない (m/s)
const WALL_SLAM_FULL = 18; // これ以上の速さで最も重くなる
const WALL_SLAM_HIT: HitDef = { kick: [-1.5, 0, 0], slash: 0, hitStop: 0.12 };
const wallSlamAt = new THREE.Vector3();
function slamEnemyIntoWall(): boolean {
  const speed = en.knockVel.length();
  if (speed < WALL_SLAM_MIN) return false;
  const p = THREE.MathUtils.clamp((speed - WALL_SLAM_MIN) / (WALL_SLAM_FULL - WALL_SLAM_MIN), 0, 1);
  hitDir.copy(en.knockVel).divideScalar(speed);
  WALL_SLAM_HIT.fx = 0.9 + 0.8 * p;
  WALL_SLAM_HIT.knock = 300 + 200 * p;
  // 体の、壁に打ち付けられた側
  wallSlamAt.copy(en.root.position).addScaledVector(hitDir, DUMMY_RADIUS);
  wallSlamAt.y += 1.0;
  sfx.playAxeGround(0.8 + 0.6 * p);
  spawnSparks(wallSlamAt, hitDir, 12, 0.9, 1);
  applyDummyHit(WALL_SLAM_HIT, wallSlamAt, 'axe', undefined, false);
  return true;
}
// 鎖鎌で掛けられているか、突進の的になっているか
function enemyHeld(): boolean {
  return (grapple?.enemy === en && grapple.phase !== 'back') || (rushTime >= 0 && rushEnemy === en);
}
// ---- 投擲（左手のクナイ） ----
// 右クリックを押している間、左手のクナイを寝かせて輪を中心に水平にくるくる回して溜め、
// 離すと溜めた段階の本数を投げる
const THROW_STAGE_TIME = 0.4; // この時間ごとに投げる本数が 1 本増える（最大で左手の 3 本）
const THROW_ORDER = [[1], [0, 2], [1, 0, 2]]; // 本数ごとに、左手のどのクナイをどの順で放つか
const THROW_SPEED = 55;
const THROW_STAGGER = 0.035; // 1 本ずつずらして放つ間隔
const THROW_RELOAD = 0.45; // 投げ終えてから左手に新しいクナイが戻るまで
const THROW_RANGE = 150;
const MISS_MARGIN = 0.05; // 狙った所を過ぎてもこの時間何にも当たらなければ引き返す
const MISS_RETURN_MAX = 0.6; // 空を狙ったときなど、遠くても最長この時間で引き返す
const STUCK_HOLD = 0.12; // 刺さったクナイが抜けて戻り始めるまで（刺さった手応えが見える最小限）
const RETURN_SPEED = 110; // 戻ってくるときの最高速度
const RETURN_ACCEL = 900; // 戻り始めてから最高速度へ達するまでの加速
const RETURN_TURN = 25; // 戻る向きへ曲がる速さ（大きいほどまっすぐ手元へ向かう）
const RETURN_ROLL = 25; // 戻ってくる間に長い軸まわりに回る速さ (rad/s)
const CATCH_DIST = 0.5; // 左手からこの距離まで来たら受け止める
const RETURN_SWISH: SwishDef = { at: 0, dur: 0.2, f0: 1400, f1: 600, gain: 0.06 };
const BLADE_TIP = 0.17; // クナイの原点（刃の付け根）から切っ先まで
const STICK_DEPTH = 0.05; // 刺さったときに埋まる深さ
// 少しだけホーミング: 放つ瞬間に照準の近くにいた敵の胸へ、飛びながらゆるく曲がる
const HOMING_CONE = 7 * (Math.PI / 180); // 照準からこの角度以内の敵を狙う
const HOMING_TURN = 3; // 曲がる速さの上限 (rad/s)。55 m/s なら半径 18 m ほどの弧
const HOMING_GIVE_UP = 60 * (Math.PI / 180); // 狙いがこれ以上横や後ろへ外れたら追うのをやめる
// 数本が続けて当たるたびに時間を止めるとカクつくので、投擲ではヒットストップを使わない
const THROW_HIT: HitDef = { kick: [-1.5, 0, 0], knock: 140, hitStop: 0, fx: 0.7 };
const THROW_SWISH: SwishDef = { at: 0, dur: 0.16, f0: 900, f1: 2800, gain: 0.1 };
// 投げたクナイが敵に刺さったら、世界（敵・敵の弾・破片）の時間だけ一瞬遅くする。プレイヤーはそのまま動ける
const WORLD_SLOW_SCALE = 0.25;
const WORLD_SLOW_HOLD = 0.3; // この間は遅いまま
const WORLD_SLOW_RELEASE = 0.2; // この時間をかけて元の速さへ戻す
const WORLD_SLOW_COOLDOWN = 0.5; // 明けてからこの間は、刺さってもかけ直さない
const WORLD_SLOW_RING_TIME = 0.3; // 入った瞬間の歪みの輪が画面の端まで広がる時間

const SPIN_START = Math.PI / 2 + 0.3; // 回し始めの切っ先の向き（真上から見て、前のやや右）
const SPIN_PHASES = [0.4, 0, -0.4]; // 回すときの各クナイの角度のずれ（重なってよいので少しだけ開く）
const SPIN_JITTER = 0.0015; // 回している間の震えの大きさ（1 段目、ローカル座標）
const SPIN_TRAIL_STEP = 0.08; // 回転の軌跡を取る角度の刻み (rad)
const SPIN_TRAIL_LIFE = 0.12;
const SPIN_TRAIL_TIP = new THREE.Vector3(0, 0.175, 0); // クナイのローカル座標（切っ先に揃える）
const SPIN_TRAIL_BASE = new THREE.Vector3(0, 0.07, 0);
const FLIGHT_TRAIL_LIFE = 0.15;
const FLIGHT_TRAIL_WIDTH = 0.02; // 飛んでいるクナイの軌跡の半分の幅

// ---- 軌跡の帯 ----
// 時刻つきの 2 点（tip, base）を順に並べて帯にする。古いものほど細くなり、根元側から削れて消える
const RIBBON_COLOR = new THREE.Color(0x2a2a2a);
const RIBBON_EDGE_COLOR = new THREE.Color(0x000000);
const RIBBON_CORE_COLOR = new THREE.Color(0x000000); // 切っ先の縁のいちばん外側の細い芯
// 武器ごとの軌跡の見た目。数値はどれも帯の幅に対する割合（0 = 根元, 1 = 切っ先）
interface RibbonStyle {
  taper: number; // 消える直前に根元を切っ先へ寄せる割合（大きいほど古い側が尖る）
  cut: number; // 消える直前までに根元側から削る割合
  edge: number; // 黒い縁が始まる位置（小さいほど縁が太い）
  core: number; // 芯が始まる位置（小さいほど芯が太い）
  body: [number, number]; // 本体の濃さ（根元側, 切っ先側）
  bodyColor?: THREE.Color; // 本体の色（省略で濃いグレー）。黒い縁と芯はそのまま
}
const RIBBON_BLACK = new THREE.Color(0x000000);
// クナイ: 細く鋭く。古い側を強く尖らせ、素早く削る。本体は黒の半透明
const KUNAI_RIBBON: RibbonStyle = { taper: 0.7, cut: 0.95, edge: 0.74, core: 0.92, body: [0.12, 0.3], bodyColor: RIBBON_BLACK };
// 剣: 幅広の弧をそのまま見せる。尖らせ方は緩く、切っ先の黒い縁と芯は細く
const SWORD_RIBBON: RibbonStyle = { taper: 0.3, cut: 0.75, edge: 0.92, core: 0.98, body: [0.3, 0.5] };
// 斧: 太く濃く、黒い縁を厚くして重さを出す（寿命は短め）
const AXE_RIBBON: RibbonStyle = { taper: 0.4, cut: 0.7, edge: 0.68, core: 0.95, body: [0.4, 0.62] };
// 斧の空中の叩きつけ: 地上の振りよりさらに太く濃く。黒い縁を厚く、芯もはっきり通す
const AXE_SLAM_RIBBON: RibbonStyle = { taper: 0.25, cut: 0.6, edge: 0.6, core: 0.93, body: [0.5, 0.75] };
// 鎌: 曲線を活かして芯を目立たせる。本体は黒の半透明
const SICKLE_RIBBON: RibbonStyle = { taper: 0.6, cut: 0.85, edge: 0.8, core: 0.9, body: [0.12, 0.28], bodyColor: RIBBON_BLACK };
const taperedBase = new THREE.Vector3();
// fade（1 = 新しい, 0 = 消える）に合わせて根元を切っ先へ寄せる
function taperBase(base: THREE.Vector3, tip: THREE.Vector3, fade: number, taper: number) {
  return taperedBase.copy(base).lerp(tip, (1 - fade) * taper);
}
// style を省くと、飛んでいるクナイの筋（中央が濃く、両側へ抜ける帯）になる
function makeRibbonMaterial(style?: RibbonStyle) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: style?.bodyColor ?? RIBBON_COLOR },
      uEdgeColor: { value: RIBBON_EDGE_COLOR },
      uCoreColor: { value: RIBBON_CORE_COLOR },
      uCut: { value: style?.cut ?? 0 },
      uEdge: { value: style?.edge ?? 0 },
      uCore: { value: style?.core ?? 0 },
      uBody: { value: new THREE.Vector2(...(style?.body ?? [0, 0])) },
    },
    defines: style ? {} : { SYMMETRIC: '' },
    vertexShader: /* glsl */ `
      attribute float aFade;
      attribute float aSide;
      varying float vFade;
      varying float vSide;
      void main() {
        vFade = aFade;
        vSide = aSide;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uEdgeColor;
      uniform vec3 uCoreColor;
      uniform float uCut;
      uniform float uEdge;
      uniform float uCore;
      uniform vec2 uBody;
      varying float vFade;
      varying float vSide;
      void main() {
      #ifdef SYMMETRIC
        // 飛んでいるクナイの筋: 中央が濃く、両側へ抜ける
        float a = vFade * vFade * (1.0 - abs(vSide * 2.0 - 1.0)) * 0.85;
        gl_FragColor = vec4(uEdgeColor, a);
      #else
        // 斬撃・回転の軌跡: 透けて薄れるのではなく、古いほど根元側から境目のくっきりした線で削れる。
        // 切っ先側の黒い縁は最後まで残し、そのいちばん外側に細い芯を通す
        float cut = (1.0 - vFade) * uCut;
        float body = smoothstep(cut, cut + 0.05, vSide);
        if (body <= 0.0) discard;
        float edge = smoothstep(uEdge, uEdge + 0.06, vSide);
        float core = smoothstep(uCore, uCore + 0.03, vSide);
        // 縁と芯は本体より少し濃いだけにとどめ、切っ先が真っ黒に潰れないようにする
        float edgeA = max(uBody.y, 0.5);
        float coreA = max(uBody.y, 0.65);
        float a = body * mix(mix(mix(uBody.x, uBody.y, vSide), edgeA, edge), coreA, core) * smoothstep(0.0, 0.15, vFade);
        gl_FragColor = vec4(mix(mix(uColor, uEdgeColor, edge), uCoreColor, core), a);
      #endif
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 4,
  });
  mat.userData.taper = style?.taper ?? 0;
  return mat;
}
const spinRibbonMat = makeRibbonMaterial(KUNAI_RIBBON);
const flightRibbonMat = makeRibbonMaterial();

interface RibbonSample { tip: THREE.Vector3; base: THREE.Vector3; time: number; join: boolean }
class Ribbon {
  readonly mesh: THREE.Mesh;
  private samples: RibbonSample[] = [];
  private pool: RibbonSample[] = [];
  private join = false;
  private geo = new THREE.BufferGeometry();
  private positions: THREE.BufferAttribute;
  private fade: THREE.BufferAttribute;
  private index: THREE.BufferAttribute;

  private taper: number;

  constructor(private max: number, private life: number, material: THREE.Material) {
    this.taper = material.userData.taper ?? 0;
    this.positions = new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.fade = new THREE.BufferAttribute(new Float32Array(max * 2), 1).setUsage(THREE.DynamicDrawUsage);
    const side = new THREE.BufferAttribute(new Float32Array(max * 2), 1);
    for (let i = 0; i < max; i++) side.setX(i * 2 + 1, 1);
    this.index = new THREE.BufferAttribute(new Uint16Array((max - 1) * 6), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.positions);
    this.geo.setAttribute('aFade', this.fade);
    this.geo.setAttribute('aSide', side);
    this.geo.setIndex(this.index);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  get empty() {
    return this.samples.length === 0;
  }

  push(tip: THREE.Vector3, base: THREE.Vector3, time: number) {
    const s = this.samples.length >= this.max
      ? this.samples.shift()!
      : this.pool.pop() ?? { tip: new THREE.Vector3(), base: new THREE.Vector3(), time: 0, join: false };
    s.tip.copy(tip);
    s.base.copy(base);
    s.time = time;
    s.join = this.join;
    this.join = true;
    this.samples.push(s);
  }

  // 次に足す点を前の点とつながない
  cut() {
    this.join = false;
  }

  update(now: number) {
    const { samples } = this;
    while (samples.length && now - samples[0].time > this.life) this.pool.push(samples.shift()!);
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const f = 1 - (now - s.time) / this.life;
      const base = taperBase(s.base, s.tip, f, this.taper);
      this.positions.setXYZ(i * 2, base.x, base.y, base.z);
      this.positions.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
      this.fade.setX(i * 2, f);
      this.fade.setX(i * 2 + 1, f);
    }
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (!samples[i + 1].join) continue;
      const a = i * 2;
      this.index.setX(idx++, a);
      this.index.setX(idx++, a + 1);
      this.index.setX(idx++, a + 2);
      this.index.setX(idx++, a + 1);
      this.index.setX(idx++, a + 3);
      this.index.setX(idx++, a + 2);
    }
    this.geo.setDrawRange(0, idx);
    this.positions.needsUpdate = true;
    this.fade.needsUpdate = true;
    this.index.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
  }
}

let throwClock = 0;
let charging = false;
let chargeTime = 0;
let chargeStage = 0;
let fanSpin = 0; // 左手のクナイを輪を中心に回している角度
let fanSpinSpeed = 0;
let spinBlend = 0; // 0 = 扇の構え, 1 = 寝かせて水平に回す構え
let reloading = false;
let reloadTime = 0;
const pendingThrows: { at: number; index: number }[] = [];
const throwAim = new THREE.Vector3();

// 回す構え: 切っ先を水平に寝かせ、刃の平たい面を上へ向けて、縦の軸まわりに回す
// （leftViewModel の空間で組み、扇の構えと同じ leftKunaiRest の空間へ直して補間する）
const restFanQuats = leftFanPivots.map((p) => p.quaternion.clone());
const restFanPos = leftFanPivots.map((p) => p.position.clone());
const SPIN_LAY = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)),
);
const leftRestInv = leftKunaiRest.quaternion.clone().invert();
leftKunaiRest.updateMatrix();
for (const k of leftKunais) k.updateMatrix();
const spinYaw = new THREE.Quaternion();
const spinQuat = new THREE.Quaternion();
function fanPose(i: number, spin: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
  spinYaw.setFromAxisAngle(UP, SPIN_START + SPIN_PHASES[i] - spin);
  spinQuat.copy(leftRestInv).multiply(spinYaw).multiply(SPIN_LAY);
  outQuat.slerpQuaternions(restFanQuats[i], spinQuat, spinBlend);
  // 回すときは輪を 1 か所に集める（重なってよい）
  outPos.copy(restFanPos[i]).multiplyScalar(1 - spinBlend);
}

// 回転の軌跡は手と一緒に動くよう leftViewModel の空間に置く
const spinRibbons = leftKunais.map(() => {
  const r = new Ribbon(128, SPIN_TRAIL_LIFE, spinRibbonMat);
  leftViewModel.add(r.mesh);
  return r;
});
const spinPos = new THREE.Vector3();
const spinRot = new THREE.Quaternion();
const spinScale = new THREE.Vector3(1, 1, 1);
const spinPivotMat = new THREE.Matrix4();
const spinSampleMat = new THREE.Matrix4();
const spinTip = new THREE.Vector3();
const spinBase = new THREE.Vector3();
function sampleSpinTrail(i: number, spin: number, time: number) {
  fanPose(i, spin, spinPos, spinRot);
  spinPivotMat.compose(spinPos, spinRot, spinScale);
  spinSampleMat.multiplyMatrices(leftKunaiRest.matrix, spinPivotMat).multiply(leftKunais[i].matrix);
  spinTip.copy(SPIN_TRAIL_TIP).applyMatrix4(spinSampleMat);
  spinBase.copy(SPIN_TRAIL_BASE).applyMatrix4(spinSampleMat);
  spinRibbons[i].push(spinTip, spinBase, time);
}

// ---- スライディング中のクナイ回し（右手） ----
// 滑っている間は輪に掛けた指を軸に縦にくるくる回し続けて軌跡を残し、滑り終えたら勢いのまま
// 次の一周の所まで回って、少し行き過ぎてから握りに収める
const KUNAI_SLIDE_SPIN_SPEED = 22; // rad/s（約 3.5 回転/秒）
let kunaiSlideSpin = 0; // 回した角度 (rad)
let kunaiSlideSpinPrev = 0; // 前のフレームの角度（軌跡を刻むため）
let kunaiSlideSpinVel = 0;
let kunaiSlideSpinTarget = NaN; // 回し終えて止める角度（滑っている間は未定）
// 軌跡は手と一緒に動くよう viewModel の空間に置く
const slideSpinRibbon = new Ribbon(128, SPIN_TRAIL_LIFE, spinRibbonMat);
viewModel.add(slideSpinRibbon.mesh);
const slideTrailTip = new THREE.Vector3();
const slideTrailBase = new THREE.Vector3();

function updateKunaiSlideSpin(dt: number) {
  kunaiSlideSpinPrev = kunaiSlideSpin;
  const spinning = player.sliding && kunaiReady() && !attack;
  if (spinning) {
    kunaiSlideSpinVel += (KUNAI_SLIDE_SPIN_SPEED - kunaiSlideSpinVel) * Math.min(1, dt * 12);
    kunaiSlideSpinTarget = NaN;
  } else if (kunaiSlideSpin !== 0 || kunaiSlideSpinVel !== 0) {
    // ハンドガンと同じく、勢いで届く先の一周の所へばねで引き寄せる
    if (Number.isNaN(kunaiSlideSpinTarget)) {
      kunaiSlideSpinTarget = Math.ceil((kunaiSlideSpin + kunaiSlideSpinVel * 0.12) / TAU) * TAU;
    }
    const target = kunaiSlideSpinTarget;
    kunaiSlideSpinVel += ((target - kunaiSlideSpin) * 500 - kunaiSlideSpinVel * 28) * dt;
    if (Math.abs(target - kunaiSlideSpin) < 0.005 && Math.abs(kunaiSlideSpinVel) < 0.2) {
      endKunaiSlideSpin();
      playGrip(); // 握り直した「チャキッ」
      return;
    }
  } else {
    return;
  }
  kunaiSlideSpin += kunaiSlideSpinVel * dt;
  // 半周ごとに小さな風切り音
  if (spinning && Math.floor(kunaiSlideSpin / Math.PI) > Math.floor(kunaiSlideSpinPrev / Math.PI)) {
    playSwish(SLIDE_SPIN_SWISH);
  }
}

function endKunaiSlideSpin() {
  kunaiSlideSpin = 0;
  kunaiSlideSpinPrev = 0;
  kunaiSlideSpinVel = 0;
  kunaiSlideSpinTarget = NaN;
}

// applyPose の後に呼ぶ。1 フレームで大きく回るので、角度を細かく刻んで弧を滑らかにする
function sampleKunaiSlideTrail(dt: number) {
  const from = kunaiSlideSpinPrev;
  const to = kunaiSlideSpin;
  if (attack || Math.abs(kunaiSlideSpinVel) < 3 || to === from) {
    slideSpinRibbon.cut();
  } else {
    const finalZ = spinPivot.rotation.z;
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) / SPIN_TRAIL_STEP));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      spinPivot.rotation.z = finalZ + (to - (from + (to - from) * u));
      kunai.updateWorldMatrix(true, false);
      viewModel.worldToLocal(slideTrailTip.copy(SPIN_TRAIL_TIP).applyMatrix4(kunai.matrixWorld));
      viewModel.worldToLocal(slideTrailBase.copy(SPIN_TRAIL_BASE).applyMatrix4(kunai.matrixWorld));
      slideSpinRibbon.push(slideTrailTip, slideTrailBase, trailNow - dt * (1 - u));
    }
    spinPivot.rotation.z = finalZ;
  }
  slideSpinRibbon.update(trailNow);
}

// fly: 投げて飛んでいる / stuck: 刺さっている / back: 抜けてプレイヤーの手元へ戻っている
type ThrownPhase = 'fly' | 'stuck' | 'back';
interface Thrown {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  age: number;
  missAt: number; // 何にも当たらなければ引き返し始める age
  phase: ThrownPhase;
  spin: number;
  trail: Ribbon | null;
  target: Enemy | null; // ホーミングで追う敵
}
const thrown: Thrown[] = [];
const thrownTemplate = createKunai(weaponMats);
const throwRaycaster = new THREE.Raycaster();
const throwDir = new THREE.Vector3();
const throwFrom = new THREE.Vector3();
const KUNAI_AXIS = new THREE.Vector3(0, 1, 0);

// 当たり判定: 地面と柱は計算で直接求め（柱 1000 本をメッシュの交差判定に回すと重い）、敵だけメッシュで調べる
const castHit = { point: new THREE.Vector3(), enemy: null as Enemy | null, part: null as THREE.Object3D | null };
let rayExit = 0; // rayBox で、光線が箱から出る距離
function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: Block, far: number) {
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
function rayRamp(o: THREE.Vector3, d: THREE.Vector3, r: Ramp, far: number) {
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
function castWorld(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
  let best = far;
  if (dir.y < -1e-6) {
    const t = -origin.y / dir.y;
    if (t >= 0 && t < best) best = t;
  }
  for (const b of blocks) {
    const t = rayBox(origin, dir, b, best);
    if (t >= 0) best = t;
  }
  for (const r of ramps) {
    const t = rayRamp(origin, dir, r, best);
    if (t >= 0) best = t;
  }
  return best;
}
function castThrow(origin: THREE.Vector3, dir: THREE.Vector3, far: number): boolean {
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
  if (found) castHit.point.copy(origin).addScaledVector(dir, best);
  return found;
}

function cancelCharge() {
  charging = false;
  fanSpinSpeed = 0;
}

// 照準の先で最初に当たる所（なければ射程の端）を狙う。手元から放っても照準へ集まるようにする
function findThrowAim(out: THREE.Vector3) {
  // パッドでは、照準のすぐ近くに敵がいれば胸へ向けて飛ばす
  const target = findAssistTarget();
  if (target && target.angle < target.size * ASSIST_SNAP) return void out.copy(target.point);
  camera.getWorldDirection(throwDir);
  if (castThrow(camera.position, throwDir, THROW_RANGE)) out.copy(castHit.point);
  else out.copy(camera.position).addScaledVector(throwDir, THROW_RANGE);
}

// ---- エイムアシスト（パッドで、クナイと銃を構えているときだけ） ----
// 照準の近くにいる敵の胸を探し、視点を遅くする / 寄せる / 撃った弾を向ける。
// 効く範囲は敵の周りの半径 (m) で決めるので、近い敵ほど画面上で広く、遠い敵ほど狭くなる
const ASSIST_RADIUS = 1.1; // 視点を遅くし、寄せ始める範囲（胸からの半径, m）
const ASSIST_SNAP = 0.55; // 撃った弾を胸へ向ける範囲（ASSIST_RADIUS に対する割合）
const ASSIST_SLOW = 0.3; // 胸の真上にいるときの視点の速さの倍率（範囲の端では 1）
const ASSIST_PULL = 6; // スティックを倒しきっている間、胸とのずれを 1 秒にどれだけ詰めるか (1/s)
const ASSIST_CHEST = 0.55; // 胸の高さ（腰の骨から首の骨までの割合）
let usingPad = false; // 最後に触ったのがパッドか（マウスを触ったら外れる）
const assistTarget = { point: new THREE.Vector3(), angle: 0, size: 0, yaw: 0, pitch: 0, enemy: null as Enemy | null };
const assistNeck = new THREE.Vector3();
const assistDir = new THREE.Vector3();
const assistInv = new THREE.Quaternion();
function findAssistTarget(): typeof assistTarget | null {
  if (!usingPad || !controls.isLocked || (shownWeapon !== 'kunai' && shownWeapon !== 'handgun')) return null;
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
function enemyChest(e: Enemy, out: THREE.Vector3) {
  e.spine.getWorldPosition(out);
  e.neck.getWorldPosition(assistNeck);
  return out.lerp(assistNeck, ASSIST_CHEST);
}

// 照準から HOMING_CONE 以内で、いちばん照準に近い敵（壁の向こうは除く）
const homingDir = new THREE.Vector3();
const homingAim = new THREE.Vector3();
function findHomingTarget(): Enemy | null {
  camera.getWorldDirection(homingAim);
  let best: Enemy | null = null;
  let bestAngle = HOMING_CONE;
  for (const e of enemies) {
    if (!e.alive) continue;
    homingDir.subVectors(enemyChest(e, homingDir), camera.position);
    const dist = homingDir.length();
    if (dist < 0.5 || dist > THROW_RANGE) continue;
    homingDir.divideScalar(dist);
    const angle = homingDir.angleTo(homingAim);
    if (angle >= bestAngle) continue;
    if (castWorld(camera.position, homingDir, dist) < dist - 0.3) continue;
    bestAngle = angle;
    best = e;
  }
  return best;
}

// 狙った敵の胸へ、このフレームで曲がれる分だけ向きを寄せる
const homingWant = new THREE.Vector3();
function steerThrown(t: Thrown, dt: number) {
  const e = t.target;
  if (!e) return;
  if (!e.alive) return void (t.target = null);
  homingWant.subVectors(enemyChest(e, homingWant), t.mesh.position).normalize();
  const angle = t.vel.angleTo(homingWant);
  if (angle > HOMING_GIVE_UP) return void (t.target = null);
  if (angle < 1e-4) return;
  const speed = t.vel.length();
  const k = Math.min(1, (HOMING_TURN * dt) / angle);
  // 今の向きから狙いの向きへ、角度で k の割合だけ回す
  homingDir.copy(t.vel).divideScalar(speed);
  homingDir.lerp(homingWant, k).normalize();
  t.vel.copy(homingDir).multiplyScalar(speed);
}

function releaseThrow() {
  const order = THROW_ORDER[chargeStage - 1];
  charging = false;
  order.forEach((index, n) => pendingThrows.push({ at: throwClock + n * THROW_STAGGER, index }));
  reloading = true;
  reloadTime = THROW_RELOAD + (order.length - 1) * THROW_STAGGER;
}

// 飛んでいる軌跡の帯は、進む向きと視線の両方に直交する向きへ幅を持たせる
const flightSide = new THREE.Vector3();
const flightA = new THREE.Vector3();
const flightB = new THREE.Vector3();
function sampleFlightTrail(t: Thrown, at: THREE.Vector3, dir: THREE.Vector3) {
  if (!t.trail) return;
  flightSide.subVectors(at, camera.position).cross(dir);
  if (flightSide.lengthSq() < 1e-8) flightSide.set(0, 1, 0);
  flightSide.setLength(FLIGHT_TRAIL_WIDTH);
  flightA.copy(at).add(flightSide);
  flightB.copy(at).sub(flightSide);
  t.trail.push(flightA, flightB, throwClock);
}

function launchKunai(index: number) {
  const hand = leftKunais[index];
  hand.updateWorldMatrix(true, false);
  throwFrom.setFromMatrixPosition(hand.matrixWorld);
  hand.visible = false;
  spinRibbons[index].cut();

  // 1 本ずつ、放つ瞬間の照準の先へまっすぐ飛ばす（重力も回転もなし）
  findThrowAim(throwAim);
  throwDir.subVectors(throwAim, throwFrom).normalize();

  const mesh = thrownTemplate.clone();
  mesh.position.copy(throwFrom);
  scene.add(mesh);
  const trail = new Ribbon(64, FLIGHT_TRAIL_LIFE, flightRibbonMat);
  scene.add(trail.mesh);
  const vel = throwDir.clone().multiplyScalar(THROW_SPEED);
  const target = findHomingTarget();
  let reach = throwFrom.distanceTo(throwAim);
  if (target) reach = Math.max(reach, throwFrom.distanceTo(enemyChest(target, homingWant)) * 1.2);
  const missAt = Math.min(MISS_RETURN_MAX, reach / THROW_SPEED + MISS_MARGIN);
  const t: Thrown = { mesh, vel, age: 0, missAt, phase: 'fly', spin: 0, trail, target };
  orientThrown(t, throwDir);
  sampleFlightTrail(t, throwFrom, throwDir);
  thrown.push(t);

  throwPunch = 1;
  kickVel.x += 1.2 * DEG * 22;
  kickVel.y += -0.6 * DEG * 22;
  sfx.playThrow(THROW_SWISH);
}

function orientThrown(t: Thrown, dir: THREE.Vector3) {
  t.mesh.quaternion.setFromUnitVectors(KUNAI_AXIS, dir);
  t.mesh.rotateY(t.spin);
}

function removeThrown(i: number) {
  thrown[i].mesh.removeFromParent();
  thrown[i].trail?.dispose();
  thrown.splice(i, 1);
}

function stickThrown(t: Thrown, at: THREE.Vector3, onDummy: Enemy | null, dir: THREE.Vector3) {
  t.phase = 'stuck';
  t.age = 0;
  t.mesh.position.copy(at).addScaledVector(dir, STICK_DEPTH - BLADE_TIP);
  orientThrown(t, dir);
  sampleFlightTrail(t, at, dir);
  if (onDummy) {
    setEn(onDummy);
    // 敵に刺さったものは、刺さった部位の骨に付けて、よろめきや震えに一緒についていく
    (castHit.part?.parent ?? en.shake).attach(t.mesh);
    hitDir.set(dir.x, 0, dir.z);
    if (hitDir.lengthSq() < 1e-6) hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
    hitDir.normalize();
    applyDummyHit(THROW_HIT, at, 'throw');
    startWorldSlow();
  } else {
    sfx.playStick(); // 壁や地面に刺さった「カッ」
  }
}

let worldSlowAge = Infinity; // 世界のスローをかけてからの時間（プレイヤーの時間で進める）
let worldSlow = 1; // 今フレームの世界の時間の速さ
let worldSlowRingAge = Infinity; // スローに入ってからの時間（歪みの輪に使う）

// 遅いままの間に刺さったら、残りを最大へ戻すだけ（時間は足さない）。戻りかけと明けた直後は何もしない
function startWorldSlow() {
  if (worldSlowAge < WORLD_SLOW_HOLD) {
    worldSlowAge = 0;
  } else if (worldSlowAge >= WORLD_SLOW_HOLD + WORLD_SLOW_RELEASE + WORLD_SLOW_COOLDOWN) {
    worldSlowAge = 0;
    worldSlowRingAge = 0; // 輪と音は、入ったときだけ（かけ直しでは出さない）
    sfx.playWorldSlow(WORLD_SLOW_HOLD, WORLD_SLOW_RELEASE);
  }
}

// 時間を進め、世界の時間に掛ける速さを返す
function worldSlowFactor(dt: number) {
  worldSlowAge += dt;
  worldSlowRingAge += dt;
  const u = THREE.MathUtils.clamp((worldSlowAge - WORLD_SLOW_HOLD) / WORLD_SLOW_RELEASE, 0, 1);
  return THREE.MathUtils.lerp(WORLD_SLOW_SCALE, 1, u * u);
}

// 刺さった所から抜く（または飛んでいる途中で引き返す）。ここからは何にも当たらず手元へ向かう
function startReturn(t: Thrown) {
  if (t.phase === 'stuck') {
    scene.attach(t.mesh); // 敵に刺さっていたものは敵から外す（見た目の位置は保つ）
    playRing(0.9, 0.25, 0.05); // 抜けた「キン」
    t.vel.set(0, 0, 0);
  }
  t.phase = 'back';
  t.age = 0;
  if (!t.trail) {
    t.trail = new Ribbon(64, FLIGHT_TRAIL_LIFE, flightRibbonMat);
    scene.add(t.trail.mesh);
  } else {
    t.trail.cut();
  }
  playSwish(RETURN_SWISH);
}

const catchPoint = new THREE.Vector3();
const returnWant = new THREE.Vector3();
const backDir = new THREE.Vector3();
function updateReturn(t: Thrown, dt: number): boolean {
  leftKunaiRest.getWorldPosition(catchPoint);
  returnWant.subVectors(catchPoint, t.mesh.position);
  const dist = returnWant.length();
  // 動き出しはゆっくり、だんだん速く。向きは手元へ少しずつ曲げていく
  const speed = Math.min(RETURN_SPEED, t.vel.length() + RETURN_ACCEL * dt);
  returnWant.setLength(speed);
  t.vel.lerp(returnWant, Math.min(1, dt * RETURN_TURN));
  const step = t.vel.length() * dt;
  if (dist < CATCH_DIST || step >= dist) {
    playRing(1.9, 0.3, 0.04); // 受け止めた「チャキッ」
    return true;
  }
  throwDir.copy(t.vel).normalize();
  t.mesh.position.addScaledVector(throwDir, step);
  // 輪の側を先にして、引き戻されるように飛ぶ。長い軸まわりにくるくる回す
  t.spin += RETURN_ROLL * dt;
  orientThrown(t, backDir.copy(throwDir).negate());
  sampleFlightTrail(t, t.mesh.position, throwDir);
  return false;
}

const stickPoint = new THREE.Vector3();
function updateThrown(dt: number) {
  for (let i = thrown.length - 1; i >= 0; i--) {
    const t = thrown[i];
    t.age += dt;
    if (t.trail) {
      t.trail.update(throwClock);
      // 刺さった後、軌跡が消えきったら片付ける
      if (t.phase === 'stuck' && t.trail.empty) {
        t.trail.dispose();
        t.trail = null;
      }
    }
    if (t.phase === 'stuck') {
      if (t.age > STUCK_HOLD) startReturn(t);
      continue;
    }
    if (t.phase === 'fly' && t.age > t.missAt) startReturn(t);
    if (t.phase === 'back') {
      if (updateReturn(t, dt)) removeThrown(i);
      continue;
    }
    steerThrown(t, dt);
    const step = t.vel.length() * dt;
    throwDir.copy(t.vel).normalize();
    // 切っ先からこのフレームで進む分だけ線を伸ばし、途中で当たるものを探す（速くてもすり抜けない）
    throwFrom.copy(t.mesh.position).addScaledVector(throwDir, BLADE_TIP);
    if (castThrow(throwFrom, throwDir, step)) {
      stickPoint.copy(castHit.point);
      stickThrown(t, stickPoint, castHit.enemy, throwDir);
      continue;
    }
    t.mesh.position.addScaledVector(throwDir, step);
    orientThrown(t, throwDir);
    sampleFlightTrail(t, t.mesh.position, throwDir);
  }
}

// ---- 鎖鎌（左クリックの近接は updateSickleMelee）: 右クリックで構えてすぐ投げる。建物に掛かったら鎖をたぐって自分を引き寄せる ----
// 掛かったら自動で引き始め、近くまで寄ったら放す。引いている間に右クリックで放し、スペースで放して跳ぶ
const GRAPPLE_RANGE = 25;
const GRAPPLE_SPREAD = 0.25; // 2 本の刺さる所を、照準の先から左右へずらす距離
const GRAPPLE_ENEMY_SPREAD = 0.1; // 敵に掛けるときは狭く
// 振りかぶり: 手を持ち上げて手前へ引き、柄の先を後ろへ倒す
const AIM_HAND_LIFT = new THREE.Vector3(0.04, 0.1, 0.1); // 手を動かす量（右手の値で、左手は x が逆）
const AIM_TILT = 0.9; // 柄の先を後ろへ倒す角度 (rad)
const AIM_ROLL = -0.3; // 外へ傾ける角度 (rad。右手の値で、左手は逆向き)
// 投げ: 離したら、鎖を持った手を軸に鎌を縦に 1 周回して勢いをつけ（上 → 前 → 下 → 後ろ → 上）、前へ振り出す所で放す
const QUICK_AIM_TIME = 0.1; // 右クリックしてから振りかぶって回し始めるまで (s)
const HOOK_STAGGER = 0; // 右手が回し始めてから左手が回し始めるまで (s)。0 なら両手同時
const WINDUP_TIME = 0.18; // 振りかぶった所から 1 周して放すまで (s)。だんだん速く回す
const WINDUP_RADIUS = 0.15; // 回している間の、握りの先から頭の付け根までの鎖の長さ
const WINDUP_REACH = 0.3; // 回し始めのこの割合で、手元の構えから鎖の先へ鎌を送り出す
const WINDUP_SWISH: SwishDef = { at: 0, dur: WINDUP_TIME, f0: 300, f1: 1300, gain: 0.04 };
const THROW_PUNCH_POS = new THREE.Vector3(0, 0.02, -0.12); // 投げた手を前へ突き出す量
const GRAPPLE_FLY_SPEED = 75;
const GRAPPLE_TUMBLE = 22; // 飛んでいる間の縦回転のおよその速さ (rad/s)。刃先から刺さるよう、着く瞬間にちょうど回りきる速さへ合わせる
const GRAPPLE_STICK_DEPTH = 0.06; // 柄の先が壁に食い込む深さ
const FLY_WAVE = 0.05; // 伸びていく鎖の波の大きさ（鎖の長さに対する割合）
// 刺さった・引き寄せ
const STICK_WOBBLE = 0.35; // 刺さった鎌が揺れる角度 (rad)
const TWANG_AMP = 0.06; // 刺さって張った鎖の震えの大きさ (m)
const PULL_TREMBLE = 0.006; // 引いている間の鎖の細かい震え (m)
// 引き寄せは加速ではなく、決まった時間で目的地まで一気に飛ぶ（動き出しが最も速く、着く直前だけ緩む）
const ZIP_SPEED = 80; // 平均の速さ。かかる時間 = 距離 / これ
const ZIP_MIN_TIME = 0.08; // 近くてもこれだけはかける (s)
const ZIP_STOP = 1.4; // 掛かった所のこれだけ手前で止まる（引く点からの距離）
const ZIP_FOV = 10; // 飛んでいる間に広げる視野 (度)
const ZIP_JUMP_MAX_SPEED = 23; // 飛んでいる途中でジャンプして抜けたとき、残す水平の速さの上限（引き寄せる前の方が速ければそちら）
const GRAPPLE_PULL_HEIGHT = 1.0; // 足元からこの高さの点を、掛かった所へ引き寄せる
const HAUL_POS = new THREE.Vector3(0, -0.03, 0.1); // 引き寄せる間、両手を手前へ引く量
// 着いた時・戻る時
const ARRIVE_KEEP = 0.25; // 着いたとき、引かれてきた勢いをこれだけ残す
const VAULT_REACH = 3.2; // 建物の上面がこの高さ以内なら、縁を越えて上に乗る
const VAULT_CLEAR = 0.5; // 上面よりこれだけ高く跳ぶ
const VAULT_FORWARD = 4; // 上に乗るとき、建物の方へ進む速さ
const WALL_KICK_UP = 9; // 上面が遠ければ、壁を蹴ってこの速さで上へ跳ぶ
const WALL_KICK_OUT = 3; // 同じく、壁から離れる速さ
const GRAPPLE_RETURN_SPEED = 60;
const RETURN_TUMBLE = 20; // 戻る間の縦回転 (rad/s)
const CATCH_TWIRL_TIME = 0.3; // 受け止めた鎌を手の中で 1 回転させる時間 (s)
const GRAPPLE_AXIS = new THREE.Vector3(0, 1, 0);
const TUMBLE_AXIS = new THREE.Vector3(0, 0, 1);

// 片手ぶんの鎌。投げている間は手元の鎌の頭（head）を隠して、握りだけを手に残し、
// 飛ぶ頭（sickle）と、握りの先から頭の付け根まで伸びる長い鎖を見せる
interface GrappleHook {
  side: number; // 1 = 右手, -1 = 左手
  hand: THREE.Group; // 持っているときの鎌（原点 = 握る位置）
  handPos: THREE.Vector3; // 普段の構えでの hand の位置
  rest: THREE.Group; // hand の中で鎌を構える向き（原点 = 握る位置）。振りかぶりや受け止めての回転はここだけに掛ける
  restQuat: THREE.Quaternion; // 普段の構えの向き
  held: THREE.Group; // 手元の鎌（rest の子）。頭と握りに分かれる
  head: THREE.Group; // 手元の鎌の頭（外れて飛ぶ側）。投げる前に回すときは、これだけを握りから離して動かす
  shortChain: THREE.Group; // 振りかぶって頭を回す間だけ見せる、握りの先から頭までの短い鎖
  point: number; // 頭が離れている間、握りの先を鎖の向きへ向ける割合 (0〜1)
  aim: number; // 0 = 普段の構え, 1 = 振りかぶりきった
  slide: number; // 0 = 普段の構え, 1 = スライディング中の低い構え
  launchIn: number; // 回し始めるまでの残り時間。負なら回す予定はない
  windT: number; // 回し始めてからの時間。負なら回していない
  thrown: boolean; // 投げてから手元に戻るまで
  punch: number; // 投げた手の突き出し (1 → 0)
  yank: number; // 引き寄せる間、手を手前へ引いている量 (0〜1)
  catchT: number; // 受け止めてからの時間。負なら回していない
  toss: SickleToss | null; // 宙へ投げ回している
  sickle: THREE.Group;
  chain: THREE.InstancedMesh;
  dir: THREE.Vector3; // 柄の先を向ける向き（飛ぶ向き、刺さった向き、戻るときは手元と反対）
  flyLeft: number; // 着くまでに残りどれだけ飛ぶか
  flyTotal: number;
  spin: number; // 縦回転の角度
  spinRate: number;
  stuckTime: number; // 刺さってからの時間。負なら刺さっていない
  back: boolean; // 手元へ戻っている
  twang: number; // 鎖の震え (1 → 0)
}
function createHook(hand: THREE.Group, side: number): GrappleHook {
  const sickle = createChainSickle(sickleMats, true); // 飛ぶのは頭だけ
  sickle.visible = false;
  scene.add(sickle);
  const chain = createLongChain(kunaiMat, GRAPPLE_RANGE + 5);
  chain.visible = false;
  scene.add(chain);
  return {
    side, hand, handPos: hand.position.clone(), rest: hand.userData.rest,
    restQuat: (hand.userData.rest as THREE.Group).quaternion.clone(), shortChain: hand.userData.chain,
    held: hand.userData.sickle, head: hand.userData.sickle.userData.head, point: 0,
    aim: 0, slide: 0, launchIn: -1, windT: -1, thrown: false, punch: 0, yank: 0, catchT: -1, toss: null,
    sickle, chain, dir: new THREE.Vector3(), flyLeft: 0, flyTotal: 0, spin: 0, spinRate: 0, stuckTime: -1, back: false, twang: 0,
  };
}
const hooks = [createHook(rightSickle, 1), createHook(leftSickle, -1)];

// fly: 飛んでいる / pull: 2 本とも掛かって引き寄せている / back: 外れたか放したので手元へ戻っている
interface Grapple {
  phase: 'fly' | 'pull' | 'back';
  target: THREE.Vector3; // 引き寄せる先（照準の先で建物に当たった所）
  block: Block | null; // 掛かった建物
  enemy: Enemy | null; // 掛かった敵（引き寄せきったら斬る）
  struck: boolean; // 敵に刺さった当たりをもう出した
  aimed: boolean; // target と block を決めたか（最初の 1 本を放す瞬間に決める）
  pullTime: number;
  zipFrom: THREE.Vector3; // 引き寄せ始めの足元
  zipTo: THREE.Vector3; // 引き寄せ終わりの足元
  zipDur: number;
  speedBefore: number; // 引き寄せ始める前の水平の速さ
}
let grapple: Grapple | null = null;
let throwPressed = false; // 右クリックを押した瞬間
let grappleClock = 0;
const grappleHand = new THREE.Vector3();
const grappleButt = new THREE.Vector3();
const grappleStep = new THREE.Vector3();
const grappleRight = new THREE.Vector3();
const hookTarget = new THREE.Vector3();
const pullFrom = new THREE.Vector3();
const pullDir = new THREE.Vector3();
const zipWant = new THREE.Vector3();
const handTurn = new THREE.Euler();
const windRadial = new THREE.Vector3();
const windTangent = new THREE.Vector3();
const windFace = new THREE.Vector3();
const windQuat = new THREE.Quaternion();
const GRIP_POINT = 0.75; // 頭が離れている間、握りの先を鎖の向きへ向ける強さ
const chainHang = new THREE.Vector3();
const gripTip = new THREE.Vector3();
const restInv = new THREE.Quaternion();
const pointDir = new THREE.Vector3();
const pointFrom = new THREE.Vector3();
const gripUp = new THREE.Vector3();
const pointQuat = new THREE.Quaternion();
const pointBlend = new THREE.Quaternion();
const tumbleBasis = new THREE.Matrix4();
const bendSide = new THREE.Vector3();
const tumbleSide = new THREE.Vector3();
const tumbleFront = new THREE.Vector3();
const tumbleQuat = new THREE.Quaternion();
const capPoint = new THREE.Vector3();

const sickleReady = () => shownWeapon === 'sickle' && wantWeapon === 'sickle' && holster === 0;

// 引き寄せの回数: 建物か敵に掛かるたびに 1 消費（外れたら消費しない）。時間で 1 本ずつ戻り、倒すと 1 本戻る。
// 残りが無いときは振りかぶれない
const HOOK_CHARGES = 2;
const HOOK_RECHARGE = 4; // 1 回分回復する時間 (s)
let hookCharges = HOOK_CHARGES;
let hookRecharge = 0;
let hookEmptyFlash = 0; // 残りが無いのに投げようとしたとき、ゲージを点滅させる残り時間
const HOOK_EMPTY_FLASH = 0.35;
function updateHookCharges(dt: number) {
  hookEmptyFlash = Math.max(0, hookEmptyFlash - dt);
  if (hookCharges >= HOOK_CHARGES) {
    hookRecharge = 0;
    return;
  }
  hookRecharge += dt;
  if (hookRecharge >= HOOK_RECHARGE) {
    hookRecharge -= HOOK_RECHARGE;
    hookCharges++;
    if (hookCharges >= HOOK_CHARGES) hookRecharge = 0;
  }
}

// 建物だけを調べ、最初に当たるまでの距離を返す（なければ far のまま）。当たった建物は hitBlock に入れる
let hitBlock: Block | null = null;
function castBlocks(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
  let best = far;
  hitBlock = null;
  for (const b of blocks) {
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
      hitBlock = r;
    }
  }
  return best;
}

// 右クリック: 振りかぶってすぐ両手で鎌を回し始める。狙う先は、最初の 1 本を放す瞬間の照準で決める（aimGrapple）
function startThrow() {
  grapple = {
    phase: 'fly', target: new THREE.Vector3(), block: null, enemy: null, struck: false, aimed: false,
    pullTime: 0, zipFrom: new THREE.Vector3(), zipTo: new THREE.Vector3(), zipDur: 0, speedBefore: 0,
  };
  for (const h of hooks) h.launchIn = QUICK_AIM_TIME + (h.side > 0 ? 0 : HOOK_STAGGER);
}

// 照準の先を調べて、鎌の飛ぶ先を決める。地面より手前で敵か建物に当たったときだけ掛かる
function aimGrapple(g: Grapple) {
  camera.getWorldDirection(throwDir);
  const blockT = castBlocks(camera.position, throwDir, GRAPPLE_RANGE);
  const groundT = throwDir.y < -1e-6 ? -camera.position.y / throwDir.y : Infinity;
  const enemyT = castDummy(camera.position, throwDir, GRAPPLE_RANGE);
  g.enemy = enemyT < blockT && enemyT < groundT ? castEnemy : null;
  let hooked = g.enemy || (blockT < GRAPPLE_RANGE && blockT < groundT);
  // 掛かるときだけ 1 消費する。残りが無ければ（振りかぶった後に使い切ったなど）掛からずに戻ってくる
  if (hooked && hookCharges > 0) {
    hookCharges--;
  } else if (hooked) {
    hooked = false;
    g.enemy = null;
  }
  g.target.copy(camera.position).addScaledVector(throwDir, Math.min(blockT, groundT, enemyT));
  g.block = hooked && !g.enemy ? hitBlock : null;
  g.aimed = true;
  grappleRight.crossVectors(throwDir, camera.up).normalize();
}

// 敵を縦の円柱とみなし、線が当たるまでの距離を返す（当たらなければ Infinity）。狙いやすいよう、当たりは少し太くする
const GRAPPLE_ENEMY_RADIUS = DUMMY_RADIUS + 0.3;
const castOnRay = new THREE.Vector3();
const castOnAxis = new THREE.Vector3();
let castEnemy: Enemy | null = null; // castDummy で当たった敵
function castDummy(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
  let best = Infinity;
  castEnemy = null;
  for (const e of enemies) {
    setEn(e);
    const t = castEnemyBody(origin, dir, far);
    if (t < best) {
      best = t;
      castEnemy = e;
    }
  }
  return best;
}
// en に当たるまでの距離
function castEnemyBody(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
  if (!en.alive) return Infinity;
  hitRay.origin.copy(origin);
  hitRay.direction.copy(dir);
  hitAxisA.set(en.root.position.x, en.root.position.y + 0.3, en.root.position.z);
  hitAxisB.set(en.root.position.x, en.root.position.y + DUMMY_HEIGHT - 0.1, en.root.position.z);
  const d2 = hitRay.distanceSqToSegment(hitAxisA, hitAxisB, castOnRay, castOnAxis);
  if (d2 > GRAPPLE_ENEMY_RADIUS ** 2) return Infinity;
  // 体の表面（線と軸の最も近い所から、手前へ半径の分）
  const t = castOnRay.distanceTo(origin) - Math.sqrt(Math.max(0, DUMMY_RADIUS ** 2 - d2));
  return t > 0.5 && t < far ? t : Infinity;
}

// 飛んでいる鎌の向き: 柄の先を dir へ向け、dir と水平な横軸に直交する面で縦に spin だけ回す
function orientTumble(h: GrappleHook, extra = 0) {
  tumbleSide.crossVectors(h.dir, UP);
  if (tumbleSide.lengthSq() < 1e-6) tumbleSide.set(1, 0, 0);
  tumbleSide.normalize();
  tumbleFront.crossVectors(h.dir, tumbleSide);
  h.sickle.quaternion.setFromRotationMatrix(tumbleBasis.makeBasis(tumbleFront, h.dir, tumbleSide));
  h.sickle.quaternion.multiply(tumbleQuat.setFromAxisAngle(TUMBLE_AXIS, h.spin + extra));
}

function launchHook(h: GrappleHook) {
  h.launchIn = -1;
  h.windT = -1;
  if (!grapple || grapple.phase === 'back') return; // 先に投げた方が外れていたら、こちらは投げない
  if (!grapple.aimed) aimGrapple(grapple); // 放す瞬間の照準で狙う
  h.thrown = true;
  h.back = false;
  h.stuckTime = -1;
  h.twang = 0;
  h.punch = 1;
  // 回している頭の位置から、照準の先の少し左右へまっすぐ飛ばす
  h.head.getWorldPosition(grappleHand);
  h.sickle.position.copy(grappleHand);
  // 敵に掛けるときは、2 本とも体に刺さるよう狭く広げる
  hookTarget.copy(grapple.target).addScaledVector(grappleRight, (grapple.enemy ? GRAPPLE_ENEMY_SPREAD : GRAPPLE_SPREAD) * h.side);
  h.dir.subVectors(hookTarget, grappleHand);
  // 柄の先が当たる所で止まるよう、握りの位置が進む距離はその分短くする
  h.flyLeft = h.flyTotal = Math.max(0, h.dir.length() - h.sickle.userData.capTip + GRAPPLE_STICK_DEPTH);
  h.dir.normalize();
  // 着く瞬間にちょうど回りきって、柄の先から刺さる回転の速さにする
  const flyTime = h.flyLeft / GRAPPLE_FLY_SPEED;
  const turns = Math.max(1, Math.round((flyTime * GRAPPLE_TUMBLE) / (Math.PI * 2)));
  h.spin = 0;
  h.spinRate = flyTime > 1e-3 ? (turns * Math.PI * 2) / flyTime : 0;
  orientTumble(h);
  if (h.side > 0 || HOOK_STAGGER > 0) {
    // 両手同時なら音は 1 つだけ
    sfx.playThrow(THROW_SWISH);
    sfx.playChain('throw');
  }
  kickVel.x += 0.5 * DEG * 22;
}

// 放す。arrived なら掛かった所まで寄りきったので、縁を越えて上へ乗るか、壁を蹴って上へ跳ぶ
function releaseGrapple(arrived: boolean) {
  if (!grapple) return;
  if (arrived && grapple.enemy) {
    arriveEnemy();
    return;
  }
  if (arrived) arriveGrapple(grapple);
  if (grapple.phase === 'pull') playRing(0.9, 0.25, 0.05); // 抜けた「キン」
  grapple.phase = 'back';
  for (const h of hooks) {
    // まだ投げていない方は投げずに手に残す
    h.launchIn = -1;
    h.windT = -1;
    if (h.thrown && !h.back) startHookBack(h);
  }
  playSwish(RETURN_SWISH);
  sfx.playChain('reel');
}

// 敵の前まで寄りきった: 勢いを止め、刺さっていた頭を一気にたぐって握りに組み付け、そのまま挟み斬りへ
const GRAPPLE_STICK_HIT: HitDef = { kick: [-0.6, 0, 0], knock: 160, hitStop: 0.04, fx: 0.6 };
function arriveEnemy() {
  velocity.multiplyScalar(0.15);
  velocity.y = Math.max(velocity.y, 1.5); // 少しだけ浮かせて、斬る間に落ちすぎないように
  for (const h of hooks) {
    h.launchIn = -1;
    h.windT = -1;
    h.thrown = false;
    h.back = false;
    h.stuckTime = -1;
  }
  grapple = null;
  playGrip(); // 頭が握りに組み付く「ガチッ」
  playSwish(RETURN_SWISH);
  startSickleMove(SICKLE_PULL);
}

function startHookBack(h: GrappleHook) {
  h.back = true;
  h.stuckTime = -1;
  h.spin = 0;
  h.spinRate = RETURN_TUMBLE;
}

function arriveGrapple(g: Grapple) {
  velocity.multiplyScalar(ARRIVE_KEEP);
  pullDir.set(g.target.x - position.x, 0, g.target.z - position.z);
  if (pullDir.lengthSq() > 1e-6) pullDir.normalize();
  const b = g.block;
  // 上面の上が別の箱でふさがっている（屋根を支える柱の上など）なら、乗れないので壁を蹴る方にする
  const topOpen =
    !!b && hasHeadroom(THREE.MathUtils.clamp(g.target.x, b.minX, b.maxX), THREE.MathUtils.clamp(g.target.z, b.minZ, b.maxZ), b.h);
  if (b && topOpen && b.h - position.y < VAULT_REACH) {
    // 上面が近い: 縁を越える高さまで跳び、建物の方へ進んで上に乗る
    velocity.y = Math.sqrt(2 * GRAVITY * Math.max(0.3, b.h - position.y + VAULT_CLEAR));
    velocity.x += pullDir.x * VAULT_FORWARD;
    velocity.z += pullDir.z * VAULT_FORWARD;
    sfx.playMantleStart();
  } else {
    // 上面が遠い: 壁を蹴って上へ跳ぶ
    velocity.y = Math.max(velocity.y, WALL_KICK_UP);
    velocity.x -= pullDir.x * WALL_KICK_OUT;
    velocity.z -= pullDir.z * WALL_KICK_OUT;
    sfx.playWallJump();
    addTrauma(0.08);
  }
}

// 引き寄せ: 移動の当たり判定の前に呼び、このフレームで進むべき所へ届く速度に置き換える。
// 当たり判定はそのまま通すので、途中で何かに阻まれたらそこで止まる
function updateGrapplePull(dt: number) {
  if (!grapple) return;
  if (player.dashTime > 0 || player.mantleTime >= 0 || rushTime >= 0 || chargeDashTime > 0) {
    releaseGrapple(false);
    return;
  }
  if (pressed.has('Space')) {
    // 飛んでいる途中の速さ（動き出しは平均の 2 倍）をそのまま持ち越さない。引き寄せる前より速い分は ZIP_JUMP_MAX_SPEED まで
    const h = Math.hypot(velocity.x, velocity.z);
    const keep = Math.min(h, Math.max(grapple.speedBefore, ZIP_JUMP_MAX_SPEED));
    if (h > 1e-6) {
      velocity.x *= keep / h;
      velocity.z *= keep / h;
    }
    releaseGrapple(false);
    velocity.y = Math.max(velocity.y, JUMP_SPEED);
    sfx.playJump();
    return;
  }
  if (grapple.pullTime === 0) {
    // 引き始め: 引く点が掛かった所の手前 ZIP_STOP に来る足元の位置まで、一気に飛ぶ道筋を決める
    pullFrom.set(position.x, position.y + GRAPPLE_PULL_HEIGHT, position.z);
    pullDir.subVectors(grapple.target, pullFrom);
    const travel = Math.max(0, pullDir.length() - ZIP_STOP);
    pullDir.normalize();
    grapple.zipFrom.copy(position);
    grapple.zipTo.copy(position).addScaledVector(pullDir, travel);
    grapple.zipDur = Math.max(ZIP_MIN_TIME, travel / ZIP_SPEED);
    grapple.speedBefore = Math.hypot(velocity.x, velocity.z);
    sfx.playDash(); // 「シュッ」
  } else if (grapple.pullTime >= grapple.zipDur) {
    releaseGrapple(true);
    return;
  }
  grapple.pullTime = Math.min(grapple.pullTime + dt, grapple.zipDur);
  const u = grapple.pullTime / grapple.zipDur;
  zipWant.lerpVectors(grapple.zipFrom, grapple.zipTo, 1 - (1 - u) ** 2);
  velocity.subVectors(zipWant, position).divideScalar(Math.max(dt, 1e-4));
  player.onGround = false;
  player.sliding = false;
}

function updateGrapple(dt: number) {
  grappleClock += dt;
  updateHookCharges(dt);
  if (throwPressed && controls.isLocked) {
    if (grapple && grapple.phase !== 'back') {
      releaseGrapple(false);
    } else if (!grapple && !sickleMelee && sickleReady()) {
      if (hookCharges > 0) {
        playRing(0.8, 0.5, 0.1); // 構えた「チャッ」
        sfx.playChain('ready');
        startThrow();
      } else {
        hookEmptyFlash = HOOK_EMPTY_FLASH;
        playRing(0.5, 0.25, 0.04); // 残りが無い鈍い「カッ」
      }
    }
  }
  throwPressed = false;

  for (const h of hooks) {
    if (h.launchIn >= 0) {
      h.launchIn -= dt;
      if (h.launchIn < 0) {
        h.windT = 0;
        if (h.side > 0 || HOOK_STAGGER > 0) {
          // 両手同時なら音は 1 つだけ
          playSwish(WINDUP_SWISH);
          playRing(1.4, 0.35, 0.03); // 継ぎ目が外れる「カチン」
          sfx.playChain('windup');
        }
      }
    } else if (h.windT >= 0) {
      h.windT += dt;
      if (h.windT >= WINDUP_TIME) {
        h.windT = WINDUP_TIME;
        poseHand(h, 0, true); // 回しきった所（真上で前へ振り出す瞬間）に鎌を置いてから放す
        launchHook(h);
      }
    }
  }

  if (grapple?.phase === 'fly' && hooks.every((h) => h.thrown && h.stuckTime >= 0)) {
    // 2 本とも刺さった: 次のフレームから、掛かった所へ一気に飛ぶ
    grapple.phase = 'pull';
    if (player.wallRunning) endWallRun();
    sfx.playStick();
    sfx.playChain('pull');
    addTrauma(0.15);
    kickVel.x -= 1.5 * DEG * 22;
  }
  if (grapple?.phase === 'pull') fovKick = Math.max(fovKick, ZIP_FOV);
  if (grapple?.enemy && grapple.aimed && grapple.phase !== 'back' && !grapple.enemy.alive) releaseGrapple(false); // 掛けた敵が先に倒れた

  for (const h of hooks) {
    if (h.thrown) updateHook(h, dt);
    poseHand(h, dt, h.launchIn >= 0 || h.windT >= 0); // 投げるまでは振りかぶったまま
    if (h.thrown) layHookChain(h);
  }
  if (grapple && grapple.phase !== 'pull' && hooks.every((h) => !h.thrown && h.launchIn < 0 && h.windT < 0)) grapple = null;
}

// 手元の鎌: 普段の構え・振りかぶり・投げた手の突き出し・鎖をたぐる手・受け止めての 1 回転
function poseHand(h: GrappleHook, dt: number, aiming: boolean) {
  h.aim += ((aiming ? 1 : 0) - h.aim) * Math.min(1, dt * 14);
  h.punch = Math.max(0, h.punch - dt * 6);
  const p = h.hand.position.copy(h.handPos);
  p.x += AIM_HAND_LIFT.x * h.side * h.aim;
  p.y += AIM_HAND_LIFT.y * h.aim;
  p.z += AIM_HAND_LIFT.z * h.aim;
  p.addScaledVector(THROW_PUNCH_POS, Math.sin(h.punch * Math.PI) * (h.punch > 0 ? 1 : 0));
  // 引き寄せる間は、両手でグッと鎖を手前へ引く
  h.yank += ((grapple?.phase === 'pull' && h.thrown ? 1 : 0) - h.yank) * Math.min(1, dt * (h.yank < 0.5 ? 30 : 10));
  p.addScaledVector(HAUL_POS, h.yank);
  // 受け止めた鎌を、握った手を軸に前へ 1 回転させる
  let twirl = 0;
  if (h.catchT >= 0) {
    h.catchT += dt;
    const u = Math.min(1, h.catchT / CATCH_TWIRL_TIME);
    twirl = -Math.PI * 2 * (1 - (1 - u) ** 3);
    if (u >= 1) h.catchT = -1;
  }
  // 振りかぶり: 柄の先を後ろへ倒し、外へ少し傾ける。回すのは鎌だけで、握った所を軸にする
  handTurn.set(AIM_TILT * h.aim + (h.catchT >= 0 ? twirl : 0), 0, AIM_ROLL * h.side * h.aim);
  h.rest.quaternion.setFromEuler(handTurn).multiply(h.restQuat);
  h.rest.position.set(0, 0, 0);
  applyMeleeHandPose(h, p);
  applySlidePose(h, p, dt);
  applyToss(h, p, dt);
  // 頭は普段は握りに組んだまま
  h.head.position.set(0, 0, 0);
  h.head.quaternion.identity();
  const joint = h.sickle.userData.chainAnchor as THREE.Vector3; // 継ぎ目（頭の付け根 = 握りの先）

  if (h.windT >= 0) {
    // 投げる前の 1 周: 継ぎ目を外し、握りの先から短い鎖で頭を体の横で縦に回す。振りかぶった向き（後ろ上）から始めて、
    // だんだん速く 1 周し、真上で前へ振り出す。回し始めに、組んだ所から鎖の先へ頭を送り出す
    const u = Math.min(1, h.windT / WINDUP_TIME);
    const angle = -AIM_TILT + (Math.PI * 2 + AIM_TILT) * u * u;
    windRadial.set(0, Math.cos(angle), -Math.sin(angle));
    windTangent.set(0, -Math.sin(angle), -Math.cos(angle));
    windFace.crossVectors(windTangent, windRadial);
    windQuat.setFromRotationMatrix(tumbleBasis.makeBasis(windTangent, windRadial, windFace));
    const k = THREE.MathUtils.smoothstep(u, 0, WINDUP_REACH);
    // 手の座標で決めた頭の置き方（握りの先を中心に、鎖の長さ WINDUP_RADIUS で回す）を、rest の座標へ直す
    gripTip.copy(joint).applyQuaternion(h.rest.quaternion);
    restInv.copy(h.rest.quaternion).invert();
    h.head.quaternion.slerp(windQuat.premultiply(restInv), k);
    h.head.position.copy(windRadial).multiplyScalar(WINDUP_RADIUS - joint.y).add(gripTip).applyQuaternion(restInv).multiplyScalar(k);
    // 鎖: 握りの先から頭の付け根まで
    chainHang.copy(joint).applyQuaternion(h.head.quaternion).add(h.head.position).applyQuaternion(h.rest.quaternion);
    layChain(h.shortChain, [gripTip, chainHang]);
    h.shortChain.visible = k > 0.02;
  } else {
    h.shortChain.visible = false;
  }

  const out = h.thrown;
  h.point +=((out ? 1 : 0) - h.point) * Math.min(1, dt * 12);
  if (out && h.point > 0.01) {
    // 頭が離れている間は、鎖に引かれて握りの先が鎖の向きへ向く（手前へ向く鎖には向けない）
    h.sickle.updateMatrixWorld();
    pointDir.copy(joint).applyMatrix4(h.sickle.matrixWorld);
    h.hand.updateWorldMatrix(true, false);
    pointFrom.copy(joint).applyQuaternion(h.rest.quaternion).applyMatrix4(h.hand.matrixWorld);
    h.hand.getWorldQuaternion(pointQuat).invert();
    pointDir.sub(pointFrom).applyQuaternion(pointQuat);
    if (pointDir.lengthSq() > 1e-6) {
      pointDir.normalize();
      gripUp.set(0, 1, 0).applyQuaternion(h.rest.quaternion);
      const w = GRIP_POINT * h.point * THREE.MathUtils.clamp((0.3 - pointDir.z) / 0.6, 0, 1);
      pointQuat.setFromUnitVectors(gripUp, pointDir);
      h.rest.quaternion.premultiply(pointBlend.identity().slerp(pointQuat, w));
    }
  }

  h.head.visible = !out;
  h.sickle.visible = h.chain.visible = out;
}

// 手元の鎌の握りの先（ワールド座標）。長い鎖はここから伸びる
function gripTipWorld(h: GrappleHook, out: THREE.Vector3): THREE.Vector3 {
  h.held.updateWorldMatrix(true, false);
  return out.copy(h.sickle.userData.chainAnchor as THREE.Vector3).applyMatrix4(h.held.matrixWorld);
}

function updateHook(h: GrappleHook, dt: number) {
  gripTipWorld(h, grappleHand);
  h.twang *= Math.exp(-dt * 6);
  if (h.back) {
    // 壁から抜けて縦に回りながら、握りの先へまっすぐ戻る
    grappleStep.subVectors(grappleHand, h.sickle.position);
    const dist = grappleStep.length();
    const step = GRAPPLE_RETURN_SPEED * dt;
    if (step >= dist) {
      h.thrown = false;
      h.back = false;
      h.catchT = 0;
      playGrip(); // 握りに組み付いた「ガチッ」
      return;
    }
    h.sickle.position.addScaledVector(grappleStep, step / dist);
    h.dir.copy(grappleStep).negate().normalize(); // 柄の先を手元と反対へ向けたまま戻る
    h.spin += h.spinRate * dt;
    orientTumble(h);
  } else if (h.stuckTime >= 0) {
    // 刺さった鎌は、食い込んだ所を軸に小さく揺れて止まる
    h.stuckTime += dt;
    const st = h.stuckTime;
    orientTumble(h, STICK_WOBBLE * Math.exp(-st * 8) * Math.sin(st * 40));
  } else {
    const step = Math.min(h.flyLeft, GRAPPLE_FLY_SPEED * dt);
    h.sickle.position.addScaledVector(h.dir, step);
    h.flyLeft -= step;
    h.spin += h.spinRate * dt;
    if (h.flyLeft <= 0) {
      h.spin = 0; // ちょうど回りきって、柄の先が前を向いている
      if (grapple?.enemy && grapple.phase === 'fly') {
        // 敵に刺さった: 最初の 1 本で軽く当たりを出し、鎖がビンと張る
        h.stuckTime = 0;
        h.twang = 1;
        sfx.playChain('taut');
        capPoint.copy(h.dir).multiplyScalar(h.sickle.userData.capTip).add(h.sickle.position);
        if (!grapple.struck && grapple.enemy.alive) {
          setEn(grapple.enemy);
          grapple.struck = true;
          hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
          if (hitDir.lengthSq() < 1e-6) hitDir.set(h.dir.x, 0, h.dir.z);
          hitDir.normalize();
          applyDummyHit(GRAPPLE_STICK_HIT, capPoint, 'throw');
        }
      } else if (grapple?.block) {
        // 刺さった: 鎖がビンと張り、小さな火花を散らす
        h.stuckTime = 0;
        h.twang = 1;
        capPoint.copy(h.dir).multiplyScalar(h.sickle.userData.capTip).add(h.sickle.position);
        spawnSparks(capPoint, h.dir, 5, 0.6, 0.6);
        playRing(0.7, 0.35, 0.12);
        sfx.playChain('taut');
      } else {
        // 外れた（地面か射程の端）: そのまま戻る
        startHookBack(h);
        sfx.playChain('reel');
        if (grapple && grapple.phase === 'fly') grapple.phase = 'back';
      }
    }
    orientTumble(h);
  }

}

// 長い鎖: 頭の付け根から握りの先まで。伸びていく間は波打ち、刺さったらビンと張って震え、戻る間はまっすぐ。
// 握りの向きが決まった後（poseHand の後）に並べる
function layHookChain(h: GrappleHook) {
  gripTipWorld(h, grappleHand);
  h.sickle.updateMatrixWorld();
  grappleButt.copy(h.sickle.userData.chainAnchor).applyMatrix4(h.sickle.matrixWorld);
  const len = grappleButt.distanceTo(grappleHand);
  bendSide.subVectors(grappleHand, grappleButt).cross(UP);
  if (bendSide.lengthSq() < 1e-8) bendSide.set(1, 0, 0);
  bendSide.normalize();
  const wave = !h.back && h.stuckTime < 0 && h.flyTotal > 0 ? len * FLY_WAVE * (h.flyLeft / h.flyTotal) : 0;
  const twang = TWANG_AMP * h.twang;
  const tremble = grapple?.phase === 'pull' ? PULL_TREMBLE : 0;
  const clock = grappleClock;
  layLongChain(h.chain, grappleButt, grappleHand, wave + twang + tremble > 0 ? (t, out) => {
    const env = Math.sin(Math.PI * t); // 両端は動かさない
    const k = wave * Math.sin(Math.PI * 5 * t - clock * 25)
      + twang * Math.sin(clock * 70)
      + tremble * Math.sin(clock * 95 + t * 20);
    out.addScaledVector(bendSide, env * k);
  } : undefined);
}

// ---- 鎖鎌の近接: 左クリック ----
// 近接では鎖を出さず、手元の鎌で斬る。手首で鎌をくるくる回す技を多く混ぜる
// 地上で押すたびに: 右の袈裟の引き斬り → 左の水平の引っ掛け → 両手の交差斬り → 右の鎌を前回りに回し続ける風車斬り
// ダッシュ直後: 両手の鎌を前へ突き出して回しながら突っ込む / スライディング中: 鎌を寝かせて柄ごと回しながら足元を薙ぐ /
// 空中: 両手の鎌を頭上から前へ 1 回転させて叩きつける
const SICKLE_BUFFER = 0.12; // 次の段への先行入力を受け付ける、cancel より前の時間
const SICKLE_COMBO_RESET = 0.6; // 振り終えてからこれだけ押さなければ 1 段目へ戻す

// 手の動きのキー（右手の値。左手は鏡写し）
//   pos: 手の位置のずれ / rot: 鎌の向きの回転（カメラ基準の x, y, z 軸まわり, rad）
//   spin: 握りを軸に、刃の面の中で鎌を回す角度（度。負で前回り = 柄の先が前へ倒れて刃先から回る）
//   roll: 柄を軸に鎌を回す角度（度）
// キーの間は、時間に沿って速さが途切れない 3 次曲線でつなぐ（行き過ぎない単調な補間）。
// 向きが反転するキー（振りかぶりの頂点、振り抜いた先）では自然に速さが 0 になって止まり、それ以外は止まらずに通り抜ける。
// stop を付けたキーは、そこで必ず一度止まる。最初と最後のキーも止まる
// arc を付けたキーは rot の代わりに、振る面と、その面の中での柄の向きから鎌の向きを決める（arcQuat）。
// arc を付けたキーどうしの間は、柄の角度そのものを補間して向きを毎回組み直すので、間でも刃が必ず軌道の先頭を向く
// yaw を付けたキーは、柄ごと水平に寝かせた横振り（arc の特別な場合。sweepArc）
interface HandKeyDef { t: number; pos?: V3; rot?: V3; arc?: ArcDef; yaw?: number; spin?: number; roll?: number; stop?: boolean }
const HAND_CHANNELS = 13; // 位置 xyz, 回転 xyz, spin, roll, arc の重み, arc の面の傾き・面の向き・柄の角度・刃の面の傾け
const ARC_CH = 8;
interface HandKey { t: number; v: number[]; m: number[] } // 各チャンネルの値と、そこでの速さ（/s）
interface HandPose { pos: THREE.Vector3; rot: THREE.Vector3; spin: number; roll: number }
const newHandPose = (): HandPose => ({ pos: new THREE.Vector3(), rot: new THREE.Vector3(), spin: 0, roll: 0 });
function makeHandKeys(defs: HandKeyDef[]): HandKey[] {
  const arcs = defs.map((k) => k.arc ?? (k.yaw !== undefined ? sweepArc(k.yaw) : undefined));
  // arc の無いキーは、arc の値を一番近い arc のキー（前を優先）から借りる（重み 0 なので向きには効かず、移り変わりの間だけ混ざる）
  const borrow = (i: number): ArcDef => {
    for (let j = i; j >= 0; j--) if (arcs[j]) return arcs[j]!;
    for (let j = i; j < arcs.length; j++) if (arcs[j]) return arcs[j]!;
    return [0, 0, 0];
  };
  const keys = defs.map((k, i): HandKey => {
    const p = k.pos ?? [0, 0, 0];
    const arc = arcs[i];
    const r = arc ? arcRot(arc) : k.rot ?? [0, 0, 0];
    const a = arc ?? borrow(i);
    return {
      t: k.t,
      v: [p[0], p[1], p[2], r[0], r[1], r[2], (k.spin ?? 0) * DEG, (k.roll ?? 0) * DEG,
        arc ? 1 : 0, a[0] * DEG, a[1] * DEG, a[2] * DEG, a[3] ?? 0],
      m: Array(HAND_CHANNELS).fill(0),
    };
  });
  // 各キーでの速さ（Steffen の方法）: 前後で向きが変わるなら 0、そうでなければ前後の傾きのうち小さい方に抑える
  for (let i = 1; i < keys.length - 1; i++) {
    if (defs[i].stop) continue;
    const h0 = keys[i].t - keys[i - 1].t;
    const h1 = keys[i + 1].t - keys[i].t;
    for (let c = 0; c < HAND_CHANNELS; c++) {
      const d0 = (keys[i].v[c] - keys[i - 1].v[c]) / h0;
      const d1 = (keys[i + 1].v[c] - keys[i].v[c]) / h1;
      if (d0 * d1 <= 0) continue;
      const mid = (d0 * h1 + d1 * h0) / (h0 + h1);
      keys[i].m[c] = 2 * Math.sign(d0) * Math.min(Math.abs(d0), Math.abs(d1), 0.5 * Math.abs(mid));
    }
  }
  return keys;
}
// 振る面での鎌の向き（右手の値）: [面の傾き, 面の向き, 柄の角度（以上は度）, 刃の面の傾け（省略で 0）]
//   面: 前（カメラ基準の -Z）と「上」を含む面。面の傾きは「上」を右へ倒す角度（0 = 縦の面、90 = 水平な面）、
//       面の向きは面ごと内側（右手なら左）へ向ける角度
//   柄の角度: 0 で柄が面の「上」、90 で前、180 で「下」を向く。増える向きに回すと頭が上 → 前 → 下と回る
// 刃は柄に直交して角度が増える向き（回る向き）へ張り出すので、角度を増やして振ると刃先が先頭で弧を描き、刃の面が軌道に沿う。
// 振りは柄の角度を大きく回して、頭が手首を軸に手より大きく速く回るようにする（手と一緒に平行移動するだけだと振っている感じが出ない）。
// 一人称で刃が線に見える面（横振り）では、刃の傾けで刃の面を少しだけカメラ側へ向ける
type ArcDef = [number, number, number] | [number, number, number, number];
const SWING_FACE_TILT = 0.3;
const arcU = new THREE.Vector3();
const arcF = new THREE.Vector3();
const arcN = new THREE.Vector3();
const arcX = new THREE.Vector3();
const arcY = new THREE.Vector3();
const arcZ = new THREE.Vector3();
const arcBasis = new THREE.Matrix4();
const arcYawQuat = new THREE.Quaternion();
const arcRestInv = hooks[0].restQuat.clone().invert();
const ARC_UP = new THREE.Vector3(0, 1, 0);
// 構えからの回転（applyHandRotation で構えの向きに前から掛けるもの）を out に入れる。角度は rad
function arcQuat(roll: number, yaw: number, angle: number, tilt: number, out: THREE.Quaternion): THREE.Quaternion {
  arcYawQuat.setFromAxisAngle(ARC_UP, yaw);
  arcU.set(Math.sin(roll), Math.cos(roll), 0).applyQuaternion(arcYawQuat); // 面の「上」
  arcF.set(0, 0, -1).applyQuaternion(arcYawQuat); // 面の「前」
  arcN.crossVectors(arcU, arcF); // 面の法線（カメラのある側）
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  arcY.copy(arcU).multiplyScalar(c).addScaledVector(arcF, s); // 柄の先の向き
  arcX.copy(arcU).multiplyScalar(-s).addScaledVector(arcF, c).addScaledVector(arcN, tilt); // 刃の向き（回る向き）
  arcX.addScaledVector(arcY, -arcX.dot(arcY)).normalize();
  arcZ.crossVectors(arcX, arcY);
  out.setFromRotationMatrix(arcBasis.makeBasis(arcX, arcY, arcZ));
  return out.multiply(arcRestInv);
}
// 回転を、カメラ基準の x, y, z 軸まわりの角に直す。同じ向きを表す 2 通りのうち、各角を ±π に収めて小さい方を選ぶ
const wrapPi = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const canonEuler = new THREE.Euler();
function quatToRot(q: THREE.Quaternion, out: V3): V3 {
  canonEuler.setFromQuaternion(q, 'XYZ');
  const a0 = wrapPi(canonEuler.x), a1 = wrapPi(canonEuler.y), a2 = wrapPi(canonEuler.z);
  const b0 = wrapPi(canonEuler.x + Math.PI), b1 = wrapPi(Math.PI - canonEuler.y), b2 = wrapPi(canonEuler.z + Math.PI);
  if (Math.abs(a0) + Math.abs(a1) + Math.abs(a2) <= Math.abs(b0) + Math.abs(b1) + Math.abs(b2)) out.splice(0, 3, a0, a1, a2);
  else out.splice(0, 3, b0, b1, b2);
  return out;
}
const arcTmpQuat = new THREE.Quaternion();
const arcRot = (a: ArcDef): V3 => quatToRot(arcQuat(a[0] * DEG, a[1] * DEG, a[2] * DEG, a[3] ?? 0, arcTmpQuat), [0, 0, 0]);
// 横振り: 柄ごと水平に寝かせ、柄の向きを yaw（度。カメラ基準で 0 = 前、90 = 右、右手の値）にする。
// 刃は yaw が減る向き（右 → 前 → 左と回る向き）へ張り出す
const sweepArc = (yawDeg: number): ArcDef => [90, 0, 90 - yawDeg, SWING_FACE_TILT];
// 普段の構えを arc で表したもの（構えから回し始める技の最初のキーに使う）
const REST_ARC: ArcDef = (() => {
  const s = new THREE.Vector3(0, 1, 0).applyQuaternion(hooks[0].restQuat);
  const b = new THREE.Vector3(1, 0, 0).applyQuaternion(hooks[0].restQuat);
  const n = new THREE.Vector3().crossVectors(s, b);
  const roll = Math.asin(n.y);
  const yaw = Math.atan2(n.z, -n.x);
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const u = new THREE.Vector3().crossVectors(f, n);
  return [roll / DEG, yaw / DEG, Math.atan2(s.dot(f), s.dot(u)) / DEG];
})();

// 同じ動きを少し遅らせ、少し下げる（両手の技で、もう片方の手を揃えすぎないように）
const lagHandKeys = (defs: HandKeyDef[], delay: number, drop: number): HandKey[] => makeHandKeys(defs.map((k, i) => ({
  ...k,
  t: i === 0 ? 0 : k.t + delay,
  pos: k.pos ? [k.pos[0], k.pos[1] - drop, k.pos[2]] : undefined,
})));
const handVals = Array<number>(HAND_CHANNELS).fill(0);
const evalArcQuat = new THREE.Quaternion();
const evalEulerQuat = new THREE.Quaternion();
const evalEuler = new THREE.Euler();
const evalRot: V3 = [0, 0, 0];
function evalHandKeys(keys: HandKey[], t: number, side: number, out: HandPose) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const h = b.t - a.t;
  const s = THREE.MathUtils.clamp((t - a.t) / h, 0, 1);
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = (s3 - 2 * s2 + s) * h;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = (s3 - s2) * h;
  for (let c = 0; c < HAND_CHANNELS; c++) handVals[c] = h00 * a.v[c] + h10 * a.m[c] + h01 * b.v[c] + h11 * b.m[c];
  // arc のキーの間は、補間した柄の角度から向きを組み直す。arc とそうでないキーの間は、両方の向きを重みで混ぜる
  const w = THREE.MathUtils.clamp(handVals[ARC_CH], 0, 1);
  if (w > 1e-4) {
    arcQuat(handVals[ARC_CH + 1], handVals[ARC_CH + 2], handVals[ARC_CH + 3], handVals[ARC_CH + 4], evalArcQuat);
    if (w < 1 - 1e-4) {
      evalEulerQuat.setFromEuler(evalEuler.set(handVals[3], handVals[4], handVals[5]));
      evalArcQuat.copy(evalEulerQuat.slerp(evalArcQuat, w));
    }
    quatToRot(evalArcQuat, evalRot);
    handVals[3] = evalRot[0];
    handVals[4] = evalRot[1];
    handVals[5] = evalRot[2];
  }
  out.pos.set(handVals[0] * side, handVals[1], handVals[2]);
  out.rot.set(handVals[3], handVals[4] * side, handVals[5] * side);
  out.spin = handVals[6];
  out.roll = handVals[7] * side;
}

// 技の定義
interface SickleImpact {
  t: number;
  hand: 'main' | 'off'; // どちらの手の刃で当てるか
  hit: HitDef;
  swing: V3; // 刃が動く向き（カメラ基準、右手の値）
}
interface SickleMoveDef {
  main: 'right' | 'left'; // 主に振る手
  keys: HandKey[];
  offKeys?: HandKey[]; // もう片方の手も振る技。なければ、振りに合わせて少し引いて構えるだけ
  time: number;
  cancel: number;
  trails: [number, number][]; // 刃の軌跡を残す時間帯
  impacts: SickleImpact[];
  reach: number;
  angle: number;
  lunge: number; // 踏み込む速さ (m/s)
  lungeAt: number;
  swishes: SwishDef[];
  rings?: [number, number][]; // 鎌を回したときの金属音（時間, 高さ）
  grips?: number[]; // 握り直す「チャキッ」
  dip?: number; // 叩きつけで体ごと沈む強さ
  windKick?: V3; // 振り始めに逆向きへ付けるカメラの反動（度）
  fovPunch?: number; // 最後の当たりの瞬間に広げる視野（度）
  body?: [number, number]; // 振る手につられて、両手ごと体をひねる強さ（横, 縦）
}

// 振りは大きく: 振りかぶりで一瞬溜めてから、画面を横切るほど大きく振り抜き、勢いの余りで少し止めてから戻す。
// 振りの本体は 0.08 秒ほどかけて数コマで見えるようにし、振り抜いた後は減速のキーを挟んで、段々に速さを落として止める

// 1 段目（右）: 右上へ引き絞って一瞬溜め、刃先を引っ掛けるように左下まで大きく斬り下ろす。
// 振る面は「上」を右へ倒した斜めの面（右上 → 左下）。溜めでは柄を右肩の後ろへ倒して刃先を上へ向け、
// 振り下ろしで柄が前 → 左下へ回り、刃先が常に軌道の先頭を行く
const KESA_ROLL = 38;
const SICKLE_KESA_HIT: HitDef = { kick: [-0.8, 2.2, -2.4], knock: 240, hitStop: 0.065, fx: 1.05, slash: 40 };
const SICKLE_KESA: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys([
    { t: 0 },
    { t: 0.08, pos: [0.06, 0.16, 0.02], arc: [KESA_ROLL, 8, -50] },
    { t: 0.12, pos: [0.08, 0.2, 0.03], arc: [KESA_ROLL, 8, -62] }, // 一瞬溜める（柄が右肩の後ろ、刃先が上）
    { t: 0.16, pos: [-0.06, 0.06, -0.17], arc: [KESA_ROLL, 12, 55] }, // 正面を通過（ここで刃先が掛かる）
    { t: 0.2, pos: [-0.28, -0.12, -0.13], arc: [KESA_ROLL, 16, 128] },
    { t: 0.25, pos: [-0.36, -0.2, -0.07], arc: [KESA_ROLL, 18, 156] }, // 減速
    { t: 0.32, pos: [-0.39, -0.23, -0.03], arc: [KESA_ROLL, 18, 164] }, // 振り抜いた勢いの余り
    { t: 0.42, pos: [-0.08, -0.04, 0], rot: [0.12, 0.1, 0.05] },
    { t: 0.52 },
  ]),
  time: 0.52,
  cancel: 0.25,
  trails: [[0.12, 0.3]],
  impacts: [{ t: 0.16, hand: 'main', hit: SICKLE_KESA_HIT, swing: [-1, -0.7, -0.2] }],
  reach: 2.3,
  angle: 65 * DEG,
  lunge: 3,
  lungeAt: 0.12,
  swishes: [
    { at: 0.12, dur: 0.2, f0: 380, f1: 2000, gain: 0.42 },
    { at: 0.13, dur: 0.14, f0: 900, f1: 3000, gain: 0.1 },
  ],
  windKick: [0.6, -0.8, 1.2],
  body: [0.5, 0.35],
};

// 2 段目（左）: 鎌を横に寝かせて左へ引き絞り、外から水平に引っ掛けて右まで大きく薙ぎ、そのまま手前へ引き抜く
const SICKLE_HOOK_HIT: HitDef = { kick: [-0.4, -2.6, 1.6], knock: 250, hitStop: 0.065, fx: 1.1, slash: -6 };
const SICKLE_HOOK: SickleMoveDef = {
  main: 'left',
  keys: makeHandKeys([
    { t: 0 },
    { t: 0.075, pos: [0.1, 0.04, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
    { t: 0.115, pos: [0.12, 0.05, 0.03], yaw: 125 },
    { t: 0.145, pos: [0.04, 0.04, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
    { t: 0.17, pos: [-0.08, 0.03, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
    { t: 0.195, pos: [-0.2, 0.04, -0.15], yaw: -20 },
    { t: 0.235, pos: [-0.28, 0.06, -0.08], yaw: -48 }, // 減速
    { t: 0.3, pos: [-0.31, 0.07, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
    { t: 0.41, pos: [-0.06, 0, 0.02], rot: [0.05, 0.15, -0.1] },
    { t: 0.5 },
  ]),
  time: 0.5,
  cancel: 0.245,
  trails: [[0.115, 0.29]],
  impacts: [{ t: 0.175, hand: 'main', hit: SICKLE_HOOK_HIT, swing: [-1, 0.05, 0.3] }],
  reach: 2.3,
  angle: 65 * DEG,
  lunge: 3,
  lungeAt: 0.11,
  swishes: [
    { at: 0.13, dur: 0.19, f0: 450, f1: 2300, gain: 0.4 },
    { at: 0.14, dur: 0.14, f0: 1000, f1: 3200, gain: 0.08 },
  ],
  windKick: [0.2, 1.0, -0.8],
  body: [0.55, 0.3],
};

// 3 段目（両手）: 両腕を外の上へ大きく開いて溜め、正面で X 字に交差させて斬り下ろし、交差したまま一瞬止める。
// 振る面は袈裟と同じ斜めの面を左右で鏡写しにしたもの
const CROSS_ROLL = 42;
const CROSS_KEYS: HandKeyDef[] = [
  { t: 0 },
  { t: 0.09, pos: [0.1, 0.18, 0], arc: [CROSS_ROLL, 6, -55] },
  { t: 0.14, pos: [0.12, 0.21, 0.01], arc: [CROSS_ROLL, 6, -66] },
  { t: 0.18, pos: [-0.06, 0.06, -0.18], arc: [CROSS_ROLL, 12, 60] },
  { t: 0.22, pos: [-0.3, -0.01, -0.13], arc: [CROSS_ROLL, 18, 130] },
  { t: 0.27, pos: [-0.37, -0.05, -0.08], arc: [CROSS_ROLL, 20, 148] }, // 減速
  { t: 0.36, pos: [-0.39, -0.07, -0.06], arc: [CROSS_ROLL, 20, 153] }, // 交差したまま止める
  { t: 0.47, pos: [0.02, -0.02, 0.02], rot: [0.15, -0.05, -0.05] },
  { t: 0.57 },
];
const SICKLE_CROSS_HIT_R: HitDef = { kick: [-0.8, 1.4, -1.4], knock: 200, hitStop: 0.03, fx: 0.9, slash: 50 };
const SICKLE_CROSS_HIT_L: HitDef = { kick: [-2.0, -1.4, 1.4], knock: 320, hitStop: 0.09, fx: 1.35, slash: -50 };
const SICKLE_CROSS: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys(CROSS_KEYS),
  offKeys: lagHandKeys(CROSS_KEYS, 0.015, 0.03),
  time: 0.57,
  cancel: 0.36,
  trails: [[0.14, 0.34]],
  impacts: [
    { t: 0.18, hand: 'main', hit: SICKLE_CROSS_HIT_R, swing: [-1, -0.7, -0.2] },
    { t: 0.195, hand: 'off', hit: SICKLE_CROSS_HIT_L, swing: [-1, -0.7, -0.2] },
  ],
  reach: 2.4,
  angle: 70 * DEG,
  lunge: 4,
  lungeAt: 0.135,
  swishes: [
    { at: 0.135, dur: 0.24, f0: 300, f1: 1500, gain: 0.5 },
    { at: 0.15, dur: 0.16, f0: 900, f1: 2900, gain: 0.12 },
  ],
  rings: [[0.37, 0.9]],
  windKick: [1.4, 0, 0],
  fovPunch: 4,
  dip: 1.5,
  body: [0, 0.6],
};

// 4 段目（右）: 手首を返して鎌を後ろへ引き、前へ突き出しながら握りを軸に前回りで 2 周回して何度も斬り、
// 回し止めて左下まで大きく引き斬る。
// 縦の面で柄の角度を回し続け、当たる瞬間ごとに頭が前を通って振り下ろされるようにする。最後の 1 周で面を斜めへ倒して左下へ斬り抜く
const SICKLE_WHEEL_HIT: HitDef = { kick: [-1.0, 0.4, 0], knock: 120, hitStop: 0.025, fx: 0.6, slash: -75 };
const SICKLE_WHEEL_LAST: HitDef = { kick: [-2.6, 1.2, -1.2], knock: 380, hitStop: 0.11, fx: 1.55, slash: -70 };
const SICKLE_WHEEL: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys([
    { t: 0 },
    { t: 0.06, pos: [0.04, 0.1, 0.06], arc: [0, 10, -20] }, // 手首を返して柄を後ろへ倒す
    { t: 0.12, pos: [-0.08, 0.06, -0.14], arc: [0, 12, 230] },
    { t: 0.16, pos: [-0.1, 0.02, -0.18], arc: [0, 12, 420] }, // 1 回目: 頭が前を通って振り下ろされる
    { t: 0.21, pos: [-0.12, -0.02, -0.22], arc: [0, 12, 600] },
    { t: 0.25, pos: [-0.13, 0.02, -0.23], arc: [0, 12, 780] }, // 2 回目
    { t: 0.3, pos: [-0.14, 0.06, -0.24], arc: [10, 14, 950] },
    { t: 0.38, pos: [-0.3, -0.22, -0.16], arc: [36, 18, 1225] }, // 面を斜めへ倒し、左下へ引き斬る
    { t: 0.5, pos: [-0.33, -0.26, -0.1], arc: [36, 18, 1238] },
    { t: 0.64 },
  ]),
  time: 0.64,
  cancel: 0.46,
  trails: [[0.12, 0.42]],
  impacts: [
    { t: 0.16, hand: 'main', hit: SICKLE_WHEEL_HIT, swing: [0, -1, 0.3] },
    { t: 0.25, hand: 'main', hit: SICKLE_WHEEL_HIT, swing: [0, -1, 0.3] },
    { t: 0.37, hand: 'main', hit: SICKLE_WHEEL_LAST, swing: [-0.5, -1, 0.2] },
  ],
  reach: 2.4,
  angle: 55 * DEG,
  lunge: 3.5,
  lungeAt: 0.12,
  swishes: [
    { at: 0.12, dur: 0.1, f0: 700, f1: 2400, gain: 0.22 },
    { at: 0.21, dur: 0.1, f0: 800, f1: 2600, gain: 0.25 },
    { at: 0.3, dur: 0.16, f0: 350, f1: 1700, gain: 0.5 },
  ],
  rings: [[0.05, 1.2], [0.44, 0.9]],
  grips: [0.51],
  windKick: [0.8, -0.4, 0.6],
  fovPunch: 5,
  body: [0.35, 0.3],
};

// ダッシュ直後（両手）: 両手の鎌を前へ大きく突き出し、前回りに回し続けながら突っ込む
const DASH_SPIN_KEYS: HandKeyDef[] = [
  { t: 0 },
  { t: 0.06, pos: [0.04, 0.06, 0.04], rot: [0.28, 0, -0.1] },
  { t: 0.1, pos: [-0.1, 0.03, -0.24], rot: [-0.2, 0.35, 0], spin: -180 },
  { t: 0.22, pos: [-0.13, -0.03, -0.27], rot: [-0.2, 0.35, 0.1], spin: -720 },
  { t: 0.34, pos: [-0.13, 0.03, -0.27], rot: [-0.2, 0.35, -0.1], spin: -1260 },
  { t: 0.42, pos: [-0.06, -0.08, -0.12], rot: [-0.1, 0.1, 0], spin: -1440 },
  { t: 0.56, spin: -1440 },
];
const SICKLE_DASH_HIT: HitDef = { kick: [-0.8, 0, 0], knock: 110, hitStop: 0.025, fx: 0.55 };
const SICKLE_DASH_LAST: HitDef = { kick: [-2.2, 0, 0], knock: 340, hitStop: 0.1, fx: 1.35 };
const SICKLE_DASH: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys(DASH_SPIN_KEYS),
  offKeys: lagHandKeys(DASH_SPIN_KEYS, 0.03, 0.02), // 少しずらして、左右の刃が交互に通るように
  time: 0.56,
  cancel: 0.42,
  trails: [[0.1, 0.42]],
  impacts: [
    { t: 0.14, hand: 'main', hit: SICKLE_DASH_HIT, swing: [0, -1, 0.3] },
    { t: 0.21, hand: 'off', hit: SICKLE_DASH_HIT, swing: [0, -1, 0.3] },
    { t: 0.28, hand: 'main', hit: SICKLE_DASH_HIT, swing: [0, -1, 0.3] },
    { t: 0.36, hand: 'off', hit: SICKLE_DASH_LAST, swing: [0, -1, 0.3] },
  ],
  reach: 2.8,
  angle: 50 * DEG,
  lunge: 9,
  lungeAt: 0.09,
  swishes: [
    { at: 0.1, dur: 0.12, f0: 600, f1: 2200, gain: 0.25 },
    { at: 0.18, dur: 0.12, f0: 650, f1: 2400, gain: 0.25 },
    { at: 0.26, dur: 0.12, f0: 700, f1: 2600, gain: 0.27 },
    { at: 0.33, dur: 0.16, f0: 400, f1: 1700, gain: 0.42 },
  ],
  rings: [[0.44, 1]],
  windKick: [0.8, 0, 0],
  fovPunch: 6,
  body: [0, 0.3],
};

// スライディング中（右）: 鎌を柄ごと水平に寝かせて右の低い所へ引き、足元を左まで大きく薙ぐ
const SICKLE_SLIDE_HIT: HitDef = { kick: [0.5, 2.8, 0.8], knock: 290, hitStop: 0.075, fx: 1.25, slash: 6 };
const SICKLE_SLIDE: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys([
    { t: 0 },
    { t: 0.075, pos: [0.1, -0.04, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
    { t: 0.115, pos: [0.12, -0.03, 0.03], yaw: 125 },
    { t: 0.145, pos: [0.04, -0.04, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
    { t: 0.17, pos: [-0.08, -0.05, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
    { t: 0.195, pos: [-0.2, -0.04, -0.15], yaw: -20 },
    { t: 0.235, pos: [-0.28, -0.02, -0.08], yaw: -48 }, // 減速
    { t: 0.3, pos: [-0.31, -0.01, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
    { t: 0.48 },
  ]),
  time: 0.48,
  cancel: 0.3,
  trails: [[0.12, 0.3]],
  impacts: [{ t: 0.175, hand: 'main', hit: SICKLE_SLIDE_HIT, swing: [-1, 0, 0.1] }],
  reach: 2.4,
  angle: 70 * DEG,
  lunge: 0,
  lungeAt: 0,
  swishes: [{ at: 0.13, dur: 0.24, f0: 280, f1: 1400, gain: 0.5 }],
  rings: [[0.23, 1.1]],
  windKick: [0, -1.0, 0.6],
  body: [0.55, 0.25],
};

// 空中 4 段目（両手）: 両手を頭上高く振り上げながら鎌を前回りに 1 回転させて頭上の後ろで構え、
// そのまま回る勢いで足元まで叩きつける。縦の面で柄の角度を回し続けるので、刃先が常に軌道の先頭を行く
const AIR_KEYS: HandKeyDef[] = [
  { t: 0, arc: REST_ARC },
  { t: 0.09, pos: [0.04, 0.2, 0], arc: [2, 10, 245] }, // 振り上げながら、頭が前 → 下 → 後ろと回る
  { t: 0.14, pos: [0.04, 0.23, 0.01], arc: [2, 10, 318] }, // 頭上の後ろで、刃先が上を向く
  { t: 0.18, pos: [0, 0.02, -0.16], arc: [2, 12, 420] },
  { t: 0.22, pos: [-0.03, -0.2, -0.17], arc: [2, 14, 498] },
  { t: 0.27, pos: [-0.045, -0.26, -0.12], arc: [2, 14, 515] }, // 減速
  { t: 0.36, pos: [-0.05, -0.28, -0.1], arc: [2, 14, 520] },
  { t: 0.5 },
];
const SICKLE_AIR_HIT: HitDef = { kick: [-3.2, 0, 0], knock: 380, hitStop: 0.11, fx: 1.5, slash: 88 };
const SICKLE_AIR: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys(AIR_KEYS),
  offKeys: lagHandKeys(AIR_KEYS, 0.01, 0.01),
  time: 0.5,
  cancel: 0.34,
  trails: [[0.14, 0.27]],
  impacts: [{ t: 0.2, hand: 'main', hit: SICKLE_AIR_HIT, swing: [0, -1, -0.3] }],
  reach: 2.5,
  angle: 60 * DEG,
  lunge: 2,
  lungeAt: 0.14,
  swishes: [
    { at: 0.14, dur: 0.22, f0: 280, f1: 1300, gain: 0.55 },
    { at: 0.15, dur: 0.14, f0: 900, f1: 3000, gain: 0.12 },
  ],
  windKick: [1.8, 0, 0],
  fovPunch: 5,
  dip: 3,
  body: [0, 0.8],
};

// 空中 1 段目（右）: 鎌を柄ごと水平に寝かせて右へ引き、右から左まで水平に薙ぐ
const SICKLE_AIR_SWEEP_HIT: HitDef = { kick: [-0.2, 2.4, 1.0], knock: 240, hitStop: 0.06, fx: 1.0, slash: 2 };
const SICKLE_AIR_SWEEP: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys([
    { t: 0 },
    { t: 0.075, pos: [0.1, 0.05, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
    { t: 0.115, pos: [0.12, 0.06, 0.03], yaw: 125 },
    { t: 0.145, pos: [0.04, 0.05, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
    { t: 0.17, pos: [-0.08, 0.04, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
    { t: 0.195, pos: [-0.2, 0.05, -0.15], yaw: -20 },
    { t: 0.235, pos: [-0.28, 0.07, -0.08], yaw: -48 }, // 減速
    { t: 0.3, pos: [-0.31, 0.08, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
    { t: 0.42, pos: [-0.06, 0, 0], rot: [0.05, 0.1, -0.1] },
    { t: 0.5 },
  ]),
  time: 0.5,
  cancel: 0.25,
  trails: [[0.12, 0.3]],
  impacts: [{ t: 0.175, hand: 'main', hit: SICKLE_AIR_SWEEP_HIT, swing: [-1, 0, 0.2] }],
  reach: 2.4,
  angle: 70 * DEG,
  lunge: 2,
  lungeAt: 0.12,
  swishes: [{ at: 0.13, dur: 0.22, f0: 320, f1: 1600, gain: 0.45 }],
  rings: [[0.24, 1.1]],
  windKick: [0, -1.0, 0.5],
  body: [0.55, 0.2],
};

// 空中 2 段目（左）: 鎌を外の下へ引いて刃先を前へ倒し、内の上へ大きく斬り上げる
const SICKLE_AIR_RISE_HIT: HitDef = { kick: [1.0, -1.6, 1.6], knock: 250, hitStop: 0.065, fx: 1.1, slash: 45 };
const SICKLE_AIR_RISE: SickleMoveDef = {
  main: 'left',
  keys: makeHandKeys([
    { t: 0 },
    { t: 0.08, pos: [0.08, -0.12, 0.02], rot: [-0.5, -0.4, -0.3] },
    { t: 0.12, pos: [0.09, -0.14, 0.03], rot: [-0.6, -0.45, -0.35] },
    { t: 0.16, pos: [-0.04, 0, -0.18], rot: [0.05, 0.25, 0.15] },
    { t: 0.2, pos: [-0.2, 0.14, -0.15], rot: [0.25, 0.55, 0.4] },
    { t: 0.25, pos: [-0.25, 0.19, -0.12], rot: [0.32, 0.65, 0.48] }, // 減速
    { t: 0.32, pos: [-0.27, 0.21, -0.1], rot: [0.35, 0.7, 0.5] },
    { t: 0.42, pos: [-0.05, 0.02, 0], rot: [0.05, 0.1, 0.05] },
    { t: 0.5 },
  ]),
  time: 0.5,
  cancel: 0.25,
  trails: [[0.12, 0.3]],
  impacts: [{ t: 0.16, hand: 'main', hit: SICKLE_AIR_RISE_HIT, swing: [-1, 0.8, -0.1] }],
  reach: 2.4,
  angle: 65 * DEG,
  lunge: 2,
  lungeAt: 0.12,
  swishes: [
    { at: 0.12, dur: 0.2, f0: 420, f1: 2200, gain: 0.42 },
    { at: 0.13, dur: 0.14, f0: 1000, f1: 3200, gain: 0.08 },
  ],
  windKick: [-1.0, 0.6, -0.8],
  body: [0.5, 0.4],
};

// 空中 3 段目（両手）: 両手の鎌を前へ広げて突き出し、左右で半周ずらして前回りに回し続け、交互に何度も斬る
const AIR_WHEEL_KEYS: HandKeyDef[] = [
  { t: 0 },
  { t: 0.06, pos: [0.05, 0.08, 0.02], rot: [0.3, 0, -0.15] },
  { t: 0.1, pos: [-0.04, 0.02, -0.2], rot: [-0.3, 0.2, -0.1], spin: -180 },
  { t: 0.2, pos: [-0.05, -0.04, -0.22], rot: [-0.3, 0.2, -0.02], spin: -720 },
  { t: 0.3, pos: [-0.05, 0.02, -0.22], rot: [-0.3, 0.2, -0.18], spin: -1260 },
  { t: 0.38, pos: [-0.03, -0.06, -0.1], rot: [-0.15, 0.1, 0], spin: -1440 },
  { t: 0.52, spin: -1440 },
];
const SICKLE_AIR_WHEEL_HIT: HitDef = { kick: [-0.8, 0, 0], knock: 110, hitStop: 0.025, fx: 0.55, slash: -80 };
const SICKLE_AIR_WHEEL_LAST: HitDef = { kick: [-1.8, 0, 0], knock: 300, hitStop: 0.08, fx: 1.2, slash: -80 };
const SICKLE_AIR_WHEEL: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys(AIR_WHEEL_KEYS),
  offKeys: lagHandKeys(AIR_WHEEL_KEYS, 0.045, 0.02), // 半周ほど遅らせて、左右の刃が交互に通るように
  time: 0.56,
  cancel: 0.4,
  trails: [[0.1, 0.4]],
  impacts: [
    { t: 0.13, hand: 'main', hit: SICKLE_AIR_WHEEL_HIT, swing: [0, -1, 0.3] },
    { t: 0.19, hand: 'off', hit: SICKLE_AIR_WHEEL_HIT, swing: [0, -1, 0.3] },
    { t: 0.25, hand: 'main', hit: SICKLE_AIR_WHEEL_HIT, swing: [0, -1, 0.3] },
    { t: 0.33, hand: 'off', hit: SICKLE_AIR_WHEEL_LAST, swing: [0, -1, 0.3] },
  ],
  reach: 2.5,
  angle: 55 * DEG,
  lunge: 2,
  lungeAt: 0.1,
  swishes: [
    { at: 0.1, dur: 0.12, f0: 650, f1: 2300, gain: 0.22 },
    { at: 0.17, dur: 0.12, f0: 700, f1: 2500, gain: 0.22 },
    { at: 0.24, dur: 0.12, f0: 750, f1: 2700, gain: 0.24 },
    { at: 0.31, dur: 0.16, f0: 400, f1: 1700, gain: 0.4 },
  ],
  rings: [[0.42, 1]],
  windKick: [0.6, 0, 0],
  fovPunch: 3,
  body: [0, 0.3],
};

// 右クリックで敵を引き寄せきった所（両手）: 両腕を外へ大きく開いて刃を寝かせ、正面で水平に挟むように斬る
const PULL_KEYS: HandKeyDef[] = [
  { t: 0 },
  { t: 0.075, pos: [0.1, 0.04, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
  { t: 0.115, pos: [0.12, 0.05, 0.03], yaw: 125 },
  { t: 0.145, pos: [0.04, 0.04, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
  { t: 0.17, pos: [-0.08, 0.03, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
  { t: 0.195, pos: [-0.2, 0.04, -0.15], yaw: -20 },
  { t: 0.235, pos: [-0.28, 0.06, -0.08], yaw: -48 }, // 減速
  { t: 0.3, pos: [-0.31, 0.07, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
  { t: 0.44, pos: [-0.04, 0, 0.01], rot: [0.05, 0.1, -0.1] },
  { t: 0.54 },
];
const SICKLE_PULL_HIT: HitDef = { kick: [-0.6, 1.2, 0.8], knock: 220, hitStop: 0.04, fx: 1.0, slash: 4 };
const SICKLE_PULL_LAST: HitDef = { kick: [-2.4, -1.6, -1.0], knock: 400, hitStop: 0.12, fx: 1.6, slash: -4 };
const SICKLE_PULL: SickleMoveDef = {
  main: 'right',
  keys: makeHandKeys(PULL_KEYS),
  offKeys: lagHandKeys(PULL_KEYS, 0.012, 0.05), // 左は少し低く通して、刃どうしがぶつからないように
  time: 0.54,
  cancel: 0.34,
  trails: [[0.115, 0.3]],
  impacts: [
    { t: 0.175, hand: 'main', hit: SICKLE_PULL_HIT, swing: [-1, 0, 0.2] },
    { t: 0.187, hand: 'off', hit: SICKLE_PULL_LAST, swing: [-1, 0, 0.2] },
  ],
  reach: 3,
  angle: 80 * DEG,
  lunge: 0,
  lungeAt: 0,
  swishes: [
    { at: 0.13, dur: 0.22, f0: 300, f1: 1500, gain: 0.5 },
    { at: 0.14, dur: 0.16, f0: 900, f1: 3000, gain: 0.12 },
  ],
  rings: [[0.33, 0.9]],
  windKick: [0.4, 0, 0],
  fovPunch: 6,
  body: [0, 0.3],
};

const SICKLE_COMBO = [SICKLE_KESA, SICKLE_HOOK, SICKLE_CROSS, SICKLE_WHEEL];
// 空中で押すたびに: 右の横薙ぎ → 左の斬り上げ → 両手の車輪 → 叩きつけ。着地するか間が空くと 1 段目へ戻る
const SICKLE_AIR_COMBO = [SICKLE_AIR_SWEEP, SICKLE_AIR_RISE, SICKLE_AIR_WHEEL, SICKLE_AIR];

// 刃の軌跡: 左右の手ごとに、カメラに付けて残す
const SICKLE_TRAIL_LIFE = 0.17;
const sickleTrails = [new Ribbon(240, SICKLE_TRAIL_LIFE, makeRibbonMaterial(SICKLE_RIBBON)), new Ribbon(240, SICKLE_TRAIL_LIFE, makeRibbonMaterial(SICKLE_RIBBON))];
for (const r of sickleTrails) camera.add(r.mesh);

interface SickleMelee {
  def: SickleMoveDef;
  h: GrappleHook; // 主に振る手
  t: number;
  fired: number; // 当たりを確かめ終えた impacts の数
  swishes: number;
  rings: number;
  grips: number;
  lunged: boolean;
  trailT: number; // 軌跡を最後に取った時間
}
let sickleMelee: SickleMelee | null = null;
let sicklePressed = false;
let sickleQueued = false;
let sickleCombo = 0;
let sickleComboTimer = 0;
let sickleAirCombo = 0;

// 近接の間の手の位置のずれと鎌の回転（poseHand で普段の構えに足す）。hooks と同じ並び
interface MeleeHandPose { cur: HandPose; want: HandPose; snap: boolean }
const meleeHands: MeleeHandPose[] = hooks.map(() => ({ cur: newHandPose(), want: newHandPose(), snap: false }));
const handPoseOf = (h: GrappleHook) => meleeHands[hooks.indexOf(h)];
const meleeFrom: HandPose[] = hooks.map(() => newHandPose()); // 技を始めた瞬間の構え
const MOVE_BLEND = 0.08; // 直前の構えから技の動きへ移りきるまで (s)
// 直前の構えのずれを、技の出だしに足して少しずつ消す
function addMoveBlend(i: number, t: number, out: HandPose) {
  const w = 1 - THREE.MathUtils.smootherstep(t, 0, MOVE_BLEND);
  if (w <= 0) return;
  const f = meleeFrom[i];
  out.pos.addScaledVector(f.pos, w);
  out.rot.addScaledVector(f.rot, w);
  out.spin += f.spin * w;
  out.roll += f.roll * w;
}
const otherHook = (h: GrappleHook) => hooks[h === hooks[0] ? 1 : 0];
// 振っていない方の手は、振りに合わせて少し引いて構え直す（体をひねった反動）
const OFF_HAND_POS: V3 = [0.09, -0.09, 0.08]; // 右手の値。振る手が大きく横切るので、外の下へよけるように引く
const OFF_HAND_TILT = 0.35;

const meleeTip = new THREE.Vector3();
const meleeFwdDir = new THREE.Vector3();
const meleeBase = new THREE.Vector3();
const meleeTrailOuter = new THREE.Vector3();
const meleeSwing = new THREE.Vector3();
const meleeEuler = new THREE.Euler();
const meleeQuat = new THREE.Quaternion();
const meleeAxisQuat = new THREE.Quaternion();
const meleeTmpPose = newHandPose();
const SPIN_AXIS = new THREE.Vector3(0, 0, 1); // 鎌の座標で、刃の面に垂直な軸
const ROLL_AXIS = new THREE.Vector3(0, 1, 0); // 鎌の座標で、柄の軸

function chooseSickleMove(): SickleMoveDef {
  if (player.sliding) return SICKLE_SLIDE;
  if (player.dashTime > 0 || sinceDash < DASH_ATTACK_WINDOW) return SICKLE_DASH;
  if (sickleComboTimer <= 0) sickleCombo = sickleAirCombo = 0;
  if (!player.onGround && !player.wallRunning) {
    const def = SICKLE_AIR_COMBO[sickleAirCombo];
    sickleAirCombo = (sickleAirCombo + 1) % SICKLE_AIR_COMBO.length;
    return def;
  }
  sickleAirCombo = 0;
  const def = SICKLE_COMBO[sickleCombo];
  sickleCombo = (sickleCombo + 1) % SICKLE_COMBO.length;
  return def;
}

function startSickleMove(def: SickleMoveDef) {
  const h = def.main === 'right' ? hooks[0] : hooks[1];
  sickleMelee = { def, h, t: 0, fired: 0, swishes: 0, rings: 0, grips: 0, lunged: false, trailT: -Infinity };
  sickleQueued = false;
  for (const k of hooks) k.catchT = -1;
  for (const r of sickleTrails) r.cut();
  // 技の出だしは、直前の構え（前の技の振り抜きなど）から溶け込ませる
  for (const [i, p] of meleeHands.entries()) {
    const f = meleeFrom[i];
    f.pos.copy(p.cur.pos);
    f.rot.copy(p.cur.rot);
    f.spin = wrapPi(p.cur.spin);
    f.roll = wrapPi(p.cur.roll);
  }
  sickleBodyHand = hooks.indexOf(h);
  sickleBodyK = def.body ?? [0, 0];
  if (def.windKick) {
    kickVel.x += def.windKick[0] * DEG * 10;
    kickVel.y += def.windKick[1] * DEG * 10;
    kickVel.z += def.windKick[2] * DEG * 10;
  }
}

// 体のひねり: 振る手の動きにつられて、両手の構えごと横へずらして傾け、上下にも振る（updateViewModel で足す）
const sickleBodyPos = new THREE.Vector3();
const sickleBodyRot = new THREE.Vector3();
let sickleBodyHand = 0;
let sickleBodyK: [number, number] = [0, 0];
function updateSickleBody() {
  const p = meleeHands[sickleBodyHand].cur.pos;
  const [kx, ky] = sickleBodyK;
  sickleBodyPos.set(p.x * kx * 0.4, p.y * ky * 0.3, 0);
  sickleBodyRot.set(p.y * ky * 0.6, -p.x * kx * 0.5, -p.x * kx * 0.7);
}

// 手元の鎌の向きに、近接の回転を足す: カメラ基準の回転を前から、回す・柄を軸に回すを鎌の座標で後ろから掛ける
function applyHandRotation(h: GrappleHook, pose: HandPose) {
  if (pose.rot.lengthSq() > 1e-10) h.rest.quaternion.premultiply(meleeQuat.setFromEuler(meleeEuler.set(pose.rot.x, pose.rot.y, pose.rot.z)));
  if (pose.spin !== 0) h.rest.quaternion.multiply(meleeAxisQuat.setFromAxisAngle(SPIN_AXIS, pose.spin));
  if (pose.roll !== 0) h.rest.quaternion.multiply(meleeAxisQuat.setFromAxisAngle(ROLL_AXIS, pose.roll));
}

// 手元の鎌を、キーの時間 t の構えに置き、刃先のワールド座標を meleeTip に、軌跡の帯の外側・内側を meleeTrailOuter / meleeBase に入れる
// （軌跡と当たりの位置を求めるときに使う。本当の構えは、この後の poseHand で meleeHands から組み直す）
function setHandPoseAt(h: GrappleHook, keys: HandKey[], t: number) {
  evalHandKeys(keys, t, h.side, meleeTmpPose);
  h.hand.position.copy(h.handPos).add(meleeTmpPose.pos);
  h.rest.quaternion.copy(h.restQuat);
  applyHandRotation(h, meleeTmpPose);
  h.rest.position.set(0, 0, 0);
  h.held.updateWorldMatrix(true, false);
  meleeTip.copy(h.sickle.userData.bladeTip as THREE.Vector3).applyMatrix4(h.held.matrixWorld);
  meleeTrailOuter.copy(h.sickle.userData.trailOuter as THREE.Vector3).applyMatrix4(h.held.matrixWorld);
  meleeBase.copy(h.sickle.userData.trailInner as THREE.Vector3).applyMatrix4(h.held.matrixWorld);
}

// 振っている手（両手の技なら両方）
function swingingHands(m: SickleMelee): [GrappleHook, HandKey[]][] {
  const out: [GrappleHook, HandKey[]][] = [[m.h, m.def.keys]];
  if (m.def.offKeys) out.push([otherHook(m.h), m.def.offKeys]);
  return out;
}

function sampleSickleTrails(m: SickleMelee) {
  for (const [from, to] of m.def.trails) {
    const end = Math.min(to, m.t);
    for (let s = Math.max(from, m.trailT + TRAIL_STEP * 2); s <= end; s += TRAIL_STEP * 2) {
      const gap = s - m.trailT > TRAIL_STEP * 3; // 別の時間帯の軌跡とはつながない
      for (const [h, keys] of swingingHands(m)) {
        const ribbon = sickleTrails[hooks.indexOf(h)];
        if (gap) ribbon.cut();
        setHandPoseAt(h, keys, s);
        camera.worldToLocal(meleeTrailOuter);
        camera.worldToLocal(meleeBase);
        ribbon.push(meleeTrailOuter, meleeBase, trailNow - (m.t - s));
      }
      m.trailT = s;
    }
  }
}

function trySickleHit(m: SickleMelee, imp: SickleImpact) {
  if (!dummyInReach(m.def.reach, m.def.angle)) return;
  const h = imp.hand === 'main' ? m.h : otherHook(m.h);
  setHandPoseAt(h, imp.hand === 'main' ? m.def.keys : m.def.offKeys!, imp.t);
  hitPointFromTip(meleeTip, hitPoint);
  camera.updateMatrixWorld();
  meleeSwing.set(imp.swing[0] * h.side, imp.swing[1], imp.swing[2]).transformDirection(camera.matrixWorld);
  applyDummyHit(imp.hit, hitPoint, 'sword', meleeSwing, true, SICKLE_DAMAGE_SCALE);
}

function updateSickleMelee(dt: number) {
  sickleComboTimer -= dt;
  updateTossInput();
  updateSlideDir(dt);
  if (player.onGround && !sickleMelee) sickleAirCombo = 0; // 着地したら空中の連携は 1 段目から
  for (const p of meleeHands) {
    p.want.pos.set(0, 0, 0);
    p.want.rot.set(0, 0, 0);
    p.want.spin = 0;
    p.want.roll = 0;
    p.snap = false;
  }
  stepSickleMelee(dt);
  // キーで動かす手はそのまま、それ以外はなめらかに寄せる（回す角度は近い向きから戻す）
  const k = 1 - Math.exp(-dt * 16);
  for (const p of meleeHands) {
    if (p.snap) {
      p.cur.pos.copy(p.want.pos);
      p.cur.rot.copy(p.want.rot);
      p.cur.spin = p.want.spin;
      p.cur.roll = p.want.roll;
    } else {
      p.cur.pos.lerp(p.want.pos, k);
      p.cur.rot.lerp(p.want.rot, k);
      p.cur.spin = wrapPi(p.cur.spin) * (1 - k);
      p.cur.roll = wrapPi(p.cur.roll) * (1 - k);
    }
  }
  updateSickleBody();
  for (const r of sickleTrails) r.update(trailNow);
}

function stepSickleMelee(dt: number) {
  const ready = sickleReady() && controls.isLocked && !grapple;
  if (sicklePressed) {
    sicklePressed = false;
    if (ready) {
      const m = sickleMelee;
      if (!m) startSickleMove(chooseSickleMove());
      else if (m.t >= m.def.cancel - SICKLE_BUFFER) sickleQueued = true;
    }
  }
  if (sickleMelee && !sickleReady()) sickleMelee = null; // 持ち替えなどで構えを解いた
  const m = sickleMelee;
  if (!m) return;
  const def = m.def;
  m.t += dt;

  while (m.swishes < def.swishes.length && m.t >= def.swishes[m.swishes].at) playSwish(def.swishes[m.swishes++], 'sickle');
  const rings = def.rings ?? [];
  while (m.rings < rings.length && m.t >= rings[m.rings][0]) playRing(rings[m.rings++][1] * 1.3, 0.6, 0.3);
  const grips = def.grips ?? [];
  while (m.grips < grips.length && m.t >= grips[m.grips]) {
    m.grips++;
    playGrip();
  }
  if (!m.lunged && m.t >= def.lungeAt) {
    m.lunged = true;
    if (def.lunge > 0) applyLunge(def.lunge);
  }

  sampleSickleTrails(m);
  while (m.fired < def.impacts.length && m.t >= def.impacts[m.fired].t) {
    const imp = def.impacts[m.fired++];
    // 当たっても外れても、振り抜いた勢いをカメラへ
    kickVel.x += imp.hit.kick[0] * DEG * 22;
    kickVel.y += imp.hit.kick[1] * DEG * 22;
    kickVel.z += imp.hit.kick[2] * DEG * 22;
    addTrauma(0.07 * (imp.hit.fx ?? 1));
    if (m.fired === def.impacts.length) {
      landDipVel -= def.dip ?? 0;
      fovKick += def.fovPunch ?? 0;
    }
    trySickleHit(m, imp);
  }

  // 手の構え
  const t = Math.min(m.t, def.time);
  const hp = handPoseOf(m.h);
  evalHandKeys(def.keys, t, m.h.side, hp.want);
  addMoveBlend(hooks.indexOf(m.h), m.t, hp.want);
  hp.snap = true;
  const o = otherHook(m.h);
  const op = handPoseOf(o);
  if (def.offKeys) {
    evalHandKeys(def.offKeys, t, o.side, op.want);
  } else {
    // 振っていない方の手: 振り出しから振り抜くまで、少し引いて構える
    const env = Math.sin(Math.PI * THREE.MathUtils.clamp((m.t - 0.02) / 0.4, 0, 1)) ** 2; // 出入りとも速さ 0 から
    op.want.pos.set(OFF_HAND_POS[0] * o.side * env, OFF_HAND_POS[1] * env, OFF_HAND_POS[2] * env);
    op.want.rot.set(OFF_HAND_TILT * env, 0, 0);
    op.want.spin = op.want.roll = 0;
  }
  addMoveBlend(hooks.indexOf(o), m.t, op.want);
  op.snap = true;

  if (sickleQueued && m.t >= def.cancel) {
    sickleComboTimer = SICKLE_COMBO_RESET;
    startSickleMove(chooseSickleMove());
  } else if (m.t >= def.time) {
    sickleMelee = null;
    sickleComboTimer = SICKLE_COMBO_RESET;
  }
}

// ダッシュした瞬間、構えている鎌を両手で前回りにくるりと回す
function twirlSickles() {
  if (!sickleReady() || sickleMelee || grapple || tossing()) return;
  for (const h of hooks) if (!h.thrown) h.catchT = 0;
  playSwish({ at: 0, dur: 0.18, f0: 600, f1: 2000, gain: 0.12 }, 'sickle');
  playRing(1.7, 0.3, 0.06);
  sfx.playChain('ready');
}

// スライディング中の構え: 滑る向き（視線から見た前・後ろ・右・左）で構えを変え、斜めなら混ぜる。
// 滑る速さに応じて、地面の振動で細かく震わせる。振っている間・投げている間は外す
interface SlidePoseDef { pos: V3; rot: V3; spin?: number } // 右手の値（左手は鏡写し）
const SLIDE_FWD: SlidePoseDef = { pos: [0.02, 0.06, -0.03], rot: [-0.4, 0.05, 0.65] }; // 前: 両手の鎌を内側へ寝かせて低く構える
const SLIDE_BACK: SlidePoseDef = { pos: [-0.03, 0.08, -0.03], rot: [0.05, 0, 0.35], spin: 20 }; // 後ろ: のけぞって鎌を高く上げる
const SLIDE_LEAD: SlidePoseDef = { pos: [-0.06, -0.01, -0.09], rot: [-0.65, -0.15, -0.25] }; // 横（滑っていく側の手）: 鎌を前へ倒して突き出す
const SLIDE_TRAIL: SlidePoseDef = { pos: [-0.1, 0.08, 0.02], rot: [0.1, 0.3, 0.9] }; // 横（反対の手）: 胸の前へ引き寄せて寝かせる
const SLIDE_TREMBLE = 0.0025; // 震えの大きさ (m)。この速さ以上で最大
const SLIDE_TREMBLE_SPEED = 15;
const SLIDE_DIR_RATE = 10; // 滑る向きの変化に構えが追いつく速さ (1/s)
let slideFwd = 1; // 滑る向きの、視線の前への成分（なめらかにしたもの）
let slideRight = 0; // 同じく右への成分
const slideTmpPose = newHandPose();
const slideMix = [0, 0, 0, 0, 0, 0, 0];

// 滑る向きを、視線から見た前と右の成分にしてなめらかに追う（updateSickleMelee から毎フレーム呼ぶ）
let slideDirFresh = true; // 次に滑り出したら、向きをなめらかにせずすぐ合わせる
function updateSlideDir(dt: number) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (!player.sliding) slideDirFresh = true;
  if (!player.sliding || speed < 0.5) return;
  camera.getWorldDirection(meleeFwdDir);
  meleeFwdDir.y = 0;
  if (meleeFwdDir.lengthSq() < 1e-6) return;
  meleeFwdDir.normalize();
  const f = (velocity.x * meleeFwdDir.x + velocity.z * meleeFwdDir.z) / speed;
  const r = (velocity.x * -meleeFwdDir.z + velocity.z * meleeFwdDir.x) / speed;
  const k = slideDirFresh ? 1 : 1 - Math.exp(-dt * SLIDE_DIR_RATE);
  slideDirFresh = false;
  slideFwd += (f - slideFwd) * k;
  slideRight += (r - slideRight) * k;
}

function applySlidePose(h: GrappleHook, handPos: THREE.Vector3, dt: number) {
  const want = player.sliding && !sickleMelee && !h.thrown && h.windT < 0 && h.launchIn < 0 ? 1 : 0;
  h.slide += (want - h.slide) * Math.min(1, dt * (want ? 14 : 8));
  const w = h.slide;
  if (w < 1e-3) return;
  // 前・後ろ・滑っていく側・反対側の重み（合計 1）
  const wF = Math.max(0, slideFwd);
  const wB = Math.max(0, -slideFwd);
  const wR = Math.max(0, slideRight);
  const wL = Math.max(0, -slideRight);
  const sum = Math.max(1e-4, wF + wB + wR + wL);
  const lead = (h.side > 0 ? wR : wL) / sum;
  const trail = (h.side > 0 ? wL : wR) / sum;
  slideMix.fill(0);
  for (const [def, k] of [[SLIDE_FWD, wF / sum], [SLIDE_BACK, wB / sum], [SLIDE_LEAD, lead], [SLIDE_TRAIL, trail]] as const) {
    if (k <= 0) continue;
    for (let i = 0; i < 3; i++) {
      slideMix[i] += def.pos[i] * k;
      slideMix[3 + i] += def.rot[i] * k;
    }
    slideMix[6] += (def.spin ?? 0) * DEG * k;
  }
  const shake = SLIDE_TREMBLE * w * Math.min(1, Math.hypot(velocity.x, velocity.z) / SLIDE_TREMBLE_SPEED);
  handPos.x += slideMix[0] * h.side * w + (Math.random() * 2 - 1) * shake;
  handPos.y += slideMix[1] * w + (Math.random() * 2 - 1) * shake;
  handPos.z += slideMix[2] * w;
  slideTmpPose.rot.set(slideMix[3] * w, slideMix[4] * h.side * w, slideMix[5] * h.side * w);
  slideTmpPose.spin = slideMix[6] * w;
  applyHandRotation(h, slideTmpPose);
}

// ---- 投げ回し: 鎌を宙へ回しながら放り上げて受け止める ----
// R キーを押すたびに: 右手の片手投げ → 左右の持ち替え投げ（空中で交差させて反対の手で受け止める）→ 左手の片手投げ。
// ダッシュしたときも、確率でどれかを投げる（外れたら手元でくるりと回すだけ）。投げている途中で攻撃や右クリックをしたら、
// 時間を速めて素早く手元へ戻す
interface SickleToss {
  t: number;
  to: SickleHookRef; // 受け止める手（自分なら片手投げ、反対の手なら持ち替え）
  apex: number; // 投げ上げる高さ (m)
  turns: number; // 宙で回る数（前回り）
  depth: number; // 持ち替えで 2 本がぶつからないよう、奥・手前へずらす量 (m)
  inward: number; // 宙で内側（画面の中央寄り）へ寄せる量 (m)。片手投げが画面の端で見切れないように
  hurry: boolean; // 攻撃などで急いで戻している
}
type SickleHookRef = 0 | 1; // hooks の添字
const TOSS_RELEASE = 0.05; // 手を沈めて放すまで
const TOSS_FLIGHT = 0.3; // 宙にある時間
const TOSS_SETTLE = 0.12; // 受け止めて手が沈み、戻るまで
const TOSS_DASH_CHANCE = 0.3; // ダッシュしたときに投げる確率
const TOSS_HURRY = 4; // 急いで戻すときの時間の速さ
const TOSS_DIP = 0.04; // 放す前と受け止めたときに手が沈む量
const TOSS_PIVOT = new THREE.Vector3(0, 0.12, 0); // 宙で回る中心（鎌の重心あたり、握る位置からの高さ）
let tossPressed = false;
let tossVariant = 0;
const tossOffset = new THREE.Vector3();
const tossQuat = new THREE.Quaternion();
const tossBase = new THREE.Quaternion();
const tossPivotA = new THREE.Vector3();
const tossPivotB = new THREE.Vector3();
const TOSS_SPIN_AXIS = new THREE.Vector3(0, 0, 1);

const tossing = () => hooks.some((h) => h.toss);
const canToss = () => sickleReady() && !sickleMelee && !grapple && !tossing() && hooks.every((h) => !h.thrown);

function startToss(h: GrappleHook, to: GrappleHook, apex: number, turns: number, depth = 0, inward = 0) {
  h.toss = { t: 0, to: hooks.indexOf(to) as SickleHookRef, apex, turns, depth, inward, hurry: false };
  h.catchT = -1;
}

function startTossVariant(variant: number) {
  if (variant === 0) startToss(hooks[0], hooks[0], 0.32, 2, -0.1, 0.14);
  else if (variant === 2) startToss(hooks[1], hooks[1], 0.32, 2, -0.1, 0.14);
  else {
    // 持ち替え: 右は高く手前を、左は低く奥を通して、空中で交差させる
    startToss(hooks[0], hooks[1], 0.3, 1, -0.04);
    startToss(hooks[1], hooks[0], 0.2, 1, 0.05);
  }
  setTimeout(() => playSwish({ at: 0, dur: 0.2, f0: 500, f1: 1600, gain: 0.12 }, 'sword'), TOSS_RELEASE * 1000);
}

// 毎フレーム、updateSickleMelee から呼ぶ: R キーで投げ、攻撃などが始まったら急いで戻す
function updateTossInput() {
  if (tossPressed && shownWeapon === 'sickle' && canToss()) {
    startTossVariant(tossVariant);
    tossVariant = (tossVariant + 1) % 3;
  }
  tossPressed = false;
  if (sickleMelee || grapple || !sickleReady()) for (const h of hooks) if (h.toss) h.toss.hurry = true;
}

// ダッシュした瞬間: 確率でどれかを投げる。投げたら true
function tossOnDash(): boolean {
  if (!canToss() || Math.random() >= TOSS_DASH_CHANCE) return false;
  startTossVariant(Math.floor(Math.random() * 3));
  return true;
}

// poseHand から呼ぶ: 投げている鎌を、手の座標で宙に置く。放す前は手を沈め、受け止めたら手が沈んでから戻る
function applyToss(h: GrappleHook, handPos: THREE.Vector3, dt: number) {
  const tz = h.toss;
  if (!tz) return;
  tz.t += dt * (tz.hurry ? TOSS_HURRY : 1);
  const to = hooks[tz.to];
  const end = TOSS_RELEASE + TOSS_FLIGHT;
  if (tz.t < TOSS_RELEASE) {
    // 放す前: 手を沈めて鎌を少し後ろへ倒す
    const k = Math.sin((tz.t / TOSS_RELEASE) * Math.PI * 0.5);
    handPos.y -= TOSS_DIP * k;
    h.rest.quaternion.premultiply(tossQuat.setFromAxisAngle(TOSS_SPIN_AXIS.set(1, 0, 0), 0.3 * k));
    return;
  }
  if (tz.t < end) {
    // 宙: 放物線で受け止める手まで飛び、重心を中心に前回りする（受け止める直前に回りきる）
    const u = (tz.t - TOSS_RELEASE) / TOSS_FLIGHT;
    tossOffset.subVectors(to.handPos, h.handPos).multiplyScalar(u);
    tossOffset.y += 4 * tz.apex * u * (1 - u);
    tossOffset.z += tz.depth * Math.sin(Math.PI * u);
    tossOffset.x -= tz.inward * h.side * Math.sin(Math.PI * u);
    tossBase.copy(h.rest.quaternion);
    if (to !== h) tossBase.slerp(to.restQuat, u); // 持ち替えは、受け止める手の構えの向きへ移る
    const spin = -Math.PI * 2 * tz.turns * (1 - (1 - u) ** 1.6);
    h.rest.quaternion.copy(tossBase).multiply(tossQuat.setFromAxisAngle(TOSS_SPIN_AXIS.set(0, 0, 1), spin));
    // 重心を中心に回す: 回す前と後で重心が同じ所に来るよう、握る位置をずらす
    tossPivotA.copy(TOSS_PIVOT).applyQuaternion(tossBase);
    tossPivotB.copy(TOSS_PIVOT).applyQuaternion(h.rest.quaternion);
    h.rest.position.copy(tossOffset).add(tossPivotA).sub(tossPivotB);
    return;
  }
  // 受け止めた: 両方の手がそれぞれ自分の鎌を持った状態に戻る（2 本は同じ形なので、持ち替えても見分けはつかない）
  const settle = (tz.t - end) / TOSS_SETTLE;
  if (settle === 0 || tz.t - dt * (tz.hurry ? TOSS_HURRY : 1) < end) {
    playGrip(); // 受け止めた「チャキッ」
    kickVel.x -= 0.3 * DEG * 22;
  }
  // 受け止めた手が沈む（片手投げは自分の手、持ち替えは両手とも何かを受け止めている）
  handPos.y -= TOSS_DIP * Math.sin(Math.PI * Math.min(1, settle));
  if (settle >= 1) h.toss = null;
}

// poseHand から呼ぶ: 近接の手の動きを、普段の構えに足す
function applyMeleeHandPose(h: GrappleHook, handPos: THREE.Vector3) {
  const p = handPoseOf(h).cur;
  handPos.add(p.pos);
  applyHandRotation(h, p);
}

function updateThrow(dt: number) {
  throwClock += dt;

  if (charging && !controls.isLocked) cancelCharge();
  if (throwHeld && controls.isLocked && !charging && !reloading && kunaiReady()) {
    charging = true;
    chargeTime = 0;
    chargeStage = 1;
    fanSpin = 0;
    sfx.playCharge(0);
  }
  if (charging) {
    chargeTime += dt;
    const stage = Math.min(THROW_ORDER.length, 1 + Math.floor(chargeTime / THROW_STAGE_TIME));
    if (stage > chargeStage) {
      // 1 段溜まるごとに高い金属音と小さな揺れで知らせる
      chargeStage = stage;
      sfx.playCharge(stage);
      addTrauma(stage === THROW_ORDER.length ? 0.06 : 0.03);
    }
    if (!throwHeld) releaseThrow();
  }

  // 溜めるほど速く回す。輪が半周するたびに小さく鳴らす
  spinBlend += ((charging ? 1 : 0) - spinBlend) * Math.min(1, dt * 35);
  const spinTarget = charging ? 14 + 10 * (chargeStage - 1) : 0;
  fanSpinSpeed += (spinTarget - fanSpinSpeed) * Math.min(1, dt * 20);
  const prevSpin = fanSpin;
  fanSpin += fanSpinSpeed * dt;
  if (charging && Math.floor(fanSpin / Math.PI) > Math.floor(prevSpin / Math.PI)) playRing(1.3, 0.25, 0.08);
  // 回している間は小刻みに震わせる（溜めるほど強く）。軌跡は fanPose から直接取るので震えない
  const jitter = charging ? spinBlend * SPIN_JITTER * (1 + 0.6 * (chargeStage - 1)) : 0;
  for (const [i, pivot] of leftFanPivots.entries()) {
    fanPose(i, fanSpin, pivot.position, pivot.quaternion);
    if (jitter > 0) {
      pivot.position.x += (Math.random() * 2 - 1) * jitter;
      pivot.position.y += (Math.random() * 2 - 1) * jitter;
      pivot.position.z += (Math.random() * 2 - 1) * jitter;
    }
  }

  // 回転の軌跡: 1 フレームで大きく回るので、角度を細かく刻んで弧を滑らかにする
  const spinning = spinBlend > 0.3 && fanSpinSpeed > 3;
  const steps = spinning ? Math.max(1, Math.ceil((fanSpin - prevSpin) / SPIN_TRAIL_STEP)) : 0;
  for (const [i, ribbon] of spinRibbons.entries()) {
    if (!spinning || !leftKunais[i].visible) {
      ribbon.cut();
    } else {
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        sampleSpinTrail(i, prevSpin + (fanSpin - prevSpin) * u, throwClock - dt * (1 - u));
      }
    }
    ribbon.update(throwClock);
  }

  while (pendingThrows.length > 0 && throwClock >= pendingThrows[0].at) {
    launchKunai(pendingThrows.shift()!.index);
  }

  if (reloading) {
    reloadTime -= dt;
    if (reloadTime <= 0) {
      // 手を下げている間に新しい 3 本へ持ち替えたことにする
      reloading = false;
      fanSpinSpeed = 0;
      for (const k of leftKunais) k.visible = true;
    }
  }

  updateThrown(dt);
}

// ---- 当たりの光の演出 ----（光線・閃光・火花・破片は fx/hitFx.ts）
// 画面全体の暗転・白黒・スローの後処理は、ここでゲームの状態から決める
const HIT_DIM = 0.38; // fx = 1 のときに画面を暗くする量
initHitFx({
  camera,
  floorAt,
  shardTint: () => en.mat.color,
  bodyHeight: DUMMY_HEIGHT,
  bodyRadius: DUMMY_RADIUS,
  hitStop: { normal: DEFAULT_HIT_STOP, kill: KILL_HIT_STOP, finale: FINALE_HIT_STOP },
});

function updateHitFx(dt: number) {
  updateAxeShocks(dt);
  updateHitParticles(dt);

  impact.age += dt;
  const u = impactFxPass.uniforms;
  // ヒットストップの間は暗いまま保ち、明けてから戻す
  const after = Math.max(0, impact.age - impact.hold);
  const env = impact.age < impact.hold ? 1 : Math.max(0, 1 - after / 0.22) ** 2;
  u.uDim.value = Math.max(Math.min(0.7, HIT_DIM * impact.power) * env, Math.max(focusBlend, deadEyeBlend) * FOCUS_DIM);

  // パリィ: 止まっている間は白黒のまま、最初の一瞬だけ白黒を反転させ、スローが明けるのに合わせて色を戻す
  // 最後の 1 体を倒したときも同じ白黒を使う
  u.uMono.value = Math.max(parryMono(), finaleMono(), downFall()); // 倒れたときも白黒にしていく
  u.uDim.value = Math.max(u.uDim.value, downFall() * 0.35);
  u.uInvert.value = parryFxAge < PARRY_INVERT_TIME || (finale && killSlowTime < FINALE_INVERT_TIME) ? 1 : 0;
  // 世界のスロー: 遅さに合わせて色を抜き、入った瞬間だけ輪を広げる
  // 一瞬で切り替えず、少しなめらかに寄せる
  const slowWant = (1 - worldSlow) / (1 - WORLD_SLOW_SCALE);
  u.uSlow.value += (slowWant - u.uSlow.value) * Math.min(1, dt * 18);
  const ring = worldSlowRingAge / WORLD_SLOW_RING_TIME;
  u.uRing.value = easeOutCubic(Math.min(ring, 1)) * 1.1;
  u.uRingAmt.value = ring < 1 ? (1 - ring) ** 2 : 0;
  // 効果が無いときは全画面の処理ごと飛ばす
  impactFxPass.enabled = u.uDim.value > 0.001 || u.uMono.value > 0.001 || u.uSlow.value > 0.001 || u.uRingAmt.value > 0.001;
  // 光が 1 つも出ていないときは、光を重ねる描画ごと飛ばす
  // 光が 1 つも出ていないときは、光を重ねる描画ごと飛ばす
  hitFxRenderPass.enabled = hitFxVisible();
}

// ---- 斬撃の軌跡 ----
// 1 フレームの間にも振りは大きく進むので、ポーズを細かい時間刻みで計算し直して弧を滑らかにする
const TRAIL_STEP = 1 / 240;
const TRAIL_LIFE = 0.1; // 軌跡が消えるまでの時間
const TRAIL_MAX = 128;
// クナイのローカル座標。切っ先（0.17）からはみ出すと、縁の線が刃から離れて浮いて見えるので、ほぼ切っ先に揃える
const TRAIL_TIP = new THREE.Vector3(0, 0.175, 0);
const TRAIL_BASE = new THREE.Vector3(0, 0.06, 0);
const TRAIL_BASE_THIN = new THREE.Vector3(0, 0.13, 0);
interface TrailSample {
  tip: THREE.Vector3;
  base: THREE.Vector3;
  time: number;
}
const trailSamples: TrailSample[] = [];
let trailNow = 0;
let lastTrailSample = -Infinity;

const trailPositions = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 3), 3);
trailPositions.setUsage(THREE.DynamicDrawUsage);
const trailFade = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2), 1);
trailFade.setUsage(THREE.DynamicDrawUsage);
const trailSide = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2), 1);
for (let i = 0; i < TRAIL_MAX; i++) trailSide.setX(i * 2 + 1, 1);
const trailIndex = new THREE.BufferAttribute(new Uint16Array((TRAIL_MAX - 1) * 6), 1);
trailIndex.setUsage(THREE.DynamicDrawUsage);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', trailPositions);
trailGeo.setAttribute('aFade', trailFade);
trailGeo.setAttribute('aSide', trailSide);
trailGeo.setIndex(trailIndex);
// 他の武器の軌跡と同じ帯の見た目にする
const trailMesh = new THREE.Mesh(trailGeo, makeRibbonMaterial(KUNAI_RIBBON));
trailMesh.frustumCulled = false;
trailMesh.renderOrder = 10;
camera.add(trailMesh);

function kunaiPointsInCamera(tip: THREE.Vector3, base: THREE.Vector3, thin: boolean) {
  kunai.updateWorldMatrix(true, false);
  camera.worldToLocal(tip.copy(TRAIL_TIP).applyMatrix4(kunai.matrixWorld));
  camera.worldToLocal(base.copy(thin ? TRAIL_BASE_THIN : TRAIL_BASE).applyMatrix4(kunai.matrixWorld));
}

function sampleTrail() {
  if (!attack) return;
  for (const [from, to, thin = false] of attack.trails) {
    const end = Math.min(to, attackTime);
    for (let s = Math.max(from, lastTrailSample + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
      attackPoseAt(attack, s, tmpSamplePose);
      applyPose(tmpSamplePose);
      const sample = trailSamples.length >= TRAIL_MAX ? trailSamples.shift()! : { tip: new THREE.Vector3(), base: new THREE.Vector3(), time: 0 };
      kunaiPointsInCamera(sample.tip, sample.base, thin);
      sample.time = trailNow - (attackTime - s);
      trailSamples.push(sample);
      lastTrailSample = s;
    }
  }
}
const tmpSamplePose = newPose();

function updateTrailMesh() {
  while (trailSamples.length && trailNow - trailSamples[0].time > TRAIL_LIFE) trailSamples.shift();
  const n = trailSamples.length;
  for (let i = 0; i < n; i++) {
    const s = trailSamples[i];
    const fade = 1 - (trailNow - s.time) / TRAIL_LIFE;
    const base = taperBase(s.base, s.tip, fade, KUNAI_RIBBON.taper);
    trailPositions.setXYZ(i * 2, base.x, base.y, base.z);
    trailPositions.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
    trailFade.setX(i * 2, fade);
    trailFade.setX(i * 2 + 1, fade);
  }
  // 時間が飛んでいる所（別の振り）はつながない
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (trailSamples[i + 1].time - trailSamples[i].time > TRAIL_STEP * 1.5) continue;
    const a = i * 2;
    trailIndex.setX(idx++, a);
    trailIndex.setX(idx++, a + 1);
    trailIndex.setX(idx++, a + 2);
    trailIndex.setX(idx++, a + 1);
    trailIndex.setX(idx++, a + 3);
    trailIndex.setX(idx++, a + 2);
  }
  trailGeo.setDrawRange(0, idx);
  trailPositions.needsUpdate = true;
  trailFade.needsUpdate = true;
  trailIndex.needsUpdate = true;
}

// ---- 近接攻撃（剣） ----

let swordAttack: SwordAttackDef | null = null;
let swordTime = 0;
let swordQueued = false;
let swordPressed = false;
let swordAttackWeight = 0;
let swordComboStep = 0;
let swordComboTimer = 0;
let swordFiredSwishes = 0;
let swordFiredGrips = 0;
let swordFiredRings = 0;
let swordFiredImpact = false;
let swordFiredLunge = false;
// ダッシュしたときに、握った手を軸に刀を縦に 2 回転させる
const SWORD_TWIRL_TIME = 0.5;
const SWORD_TWIRL_TURNS = 2;
const SWORD_TWIRL_GRIP = 0.42;
let swordTwirlTime = Infinity;
let swordTwirlGripped = true;

const swordReady = () => shownWeapon === 'sword' && wantWeapon === 'sword' && holster === 0;

// ---- 溜め斬り（左クリック長押し） ----
// 押してすぐ離せば普段の攻撃。CHARGE_DELAY より長く押すと刀を引いて溜め始め、溜めきってから離すと
// 視線の方向へ短くダッシュしながら薙ぎ払う。溜めきる前に離したら普段の攻撃になる
const CHARGE_DELAY = 0.18;
const CHARGE_TIME = 0.5; // 溜め始めてから溜めきるまで
const CHARGE_DASH_SPEED = 40;
const CHARGE_DASH_TIME = 0.13; // 40 m/s × 0.13 s ≈ 5 m
const CHARGE_DASH_EXIT = 9; // 斬り抜けた後に残す勢い
const CHARGE_ZOOM = 6; // 溜めている間に狭める視野（度）
let swordHold = -1; // 左クリックを押してからの時間。負なら押していない（または普段の攻撃を始めた）
let swordChargeBlend = 0; // 0 = 普段の構え, 1 = 溜めの構え
let chargeDashTime = 0;
const chargeDashDir = new THREE.Vector3();
const swordChargePos = new THREE.Vector3();
const SWORD_CHARGE_QUAT = new THREE.Quaternion();
{
  const tip = new THREE.Vector3(...CHARGE_TIP).normalize();
  // 刃はこれから振る向き（右前）へ向ける
  const edge = new THREE.Vector3(0.7, 0, -0.7).addScaledVector(tip, -new THREE.Vector3(0.7, 0, -0.7).dot(tip)).normalize();
  SWORD_CHARGE_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, tip, new THREE.Vector3().crossVectors(edge, tip)));
}
const swordCharged = () => swordHold >= CHARGE_DELAY + CHARGE_TIME;

function startChargeSlash() {
  // 視線の方向へ踏み込む。地上で下を向いていても地面へ潜らないよう、下向きの分は捨てる
  camera.getWorldDirection(chargeDashDir);
  if (player.onGround && chargeDashDir.y < 0) chargeDashDir.y = 0;
  if (chargeDashDir.lengthSq() < 1e-4) chargeDashDir.copy(forward);
  chargeDashDir.normalize();
  chargeDashTime = CHARGE_DASH_TIME;
  player.sliding = false;
  player.dashTime = 0;
  if (player.wallRunning) endWallRun();
  if (chargeDashDir.y > 0) player.onGround = false;
  fovKick += 10;
  addTrauma(0.25);
  sfx.playRush();
  startSwordAttack(SWORD_CHARGE_SLASH);
}

// update() の移動の中で呼ぶ。ダッシュ中は落ちず、終わったら少しだけ勢いを残す
function updateChargeDash(dt: number) {
  chargeDashTime -= dt;
  const speed = chargeDashTime > 0 ? CHARGE_DASH_SPEED : CHARGE_DASH_EXIT;
  velocity.copy(chargeDashDir).multiplyScalar(speed);
}

// ---- 居合の構え（右クリックで発動） ----
// 右クリックを押すと一定時間、刀を右上に構えて時間がゆっくり流れる。視線の先の敵をロックオンし、
// 左クリックで敵の目の前まで一気に突進して一閃を浴びせる。
// 構えるには、敵を攻撃して溜まる居合のゲージが満タンになっている必要がある（構えると空になる）
const FOCUS_TIME_SCALE = 0.2; // 構えている間の時間の速さ
const FOCUS_MAX = 3; // 構えていられる長さ（実時間の秒）。過ぎると解く
const FOCUS_DIM = 0.3; // 構えている間に画面を暗く・色を薄くする量
const FOCUS_ZOOM = 22; // 構えている間に狭める視野（度）
const LOCK_RANGE = 24;
const LOCK_ANGLE = 14 * DEG; // 視線からこの角度以内の敵をロックオンする
const LOCK_HEIGHT = 1.1; // 敵のこの高さを狙う
const RUSH_SPEED = 90;
const RUSH_STOP = 1.5; // 敵の中心からこの距離で止まって斬る
const RUSH_MAX_TIME = 0.6;
const RUSH_EXIT_SPEED = 5; // 斬りつけた後に残す勢い
const FOCUS_CHARGE_DAMAGE = 150; // 敵へ与えたダメージがこの量になるとゲージが満タンになる（どの武器でも溜まる）
const FOCUS_EMPTY_FLASH = 0.35;

let focusing = false;
let focusTime = 0;
let focusCharge = 0; // 居合のゲージ (0〜1)。1 で構えられる
let focusEmptyFlash = 0; // 溜まっていないのに構えようとしたとき、ゲージを震わせる残り時間
let focusShownReady = false; // 表示に反映済みの「満タン」
let focusPressed = false; // 右クリックを押した瞬間（居合の構えを始める）
let focusBlend = 0; // 0 = 普段の構え, 1 = 居合の構え（実時間で動かす）
let focusLocked = false;
let focusZoom = 0; // 構えている間のズームの効き (0〜1)。突進を始めたら一気に戻して、視野が開く勢いにする
let timeScale = 1; // ゲーム全体の時間の速さ（ループで dt に掛ける）
let realDt = 0; // スローに関係なく実際に経った時間
let rushTime = -1; // 突進を始めてからの時間。負なら突進していない
let rushArrived = false;
const rushTarget = new THREE.Vector3();
const rushDir = new THREE.Vector3();
const lockPoint = new THREE.Vector3();
const lockTo = new THREE.Vector3();
const lockLook = new THREE.Vector3();
const lockScreen = new THREE.Vector3();
const lockonEl = document.getElementById('lockon')!;
const focusHud = document.getElementById('focusgauge')!;
const focusFill = focusHud.querySelector<HTMLElement>('.f')!;

// 居合の構え: 柄を右肩の前に上げ、刀を立てて少し後ろへ寝かせる。刃は前へ向ける
const SWORD_FOCUS_POS = new THREE.Vector3(0.08, 0.22, -0.06);
const SWORD_FOCUS_QUAT = new THREE.Quaternion();
{
  const tip = new THREE.Vector3(0.35, 0.8, 0.5).normalize();
  const edge = new THREE.Vector3(-0.15, 0, -1).addScaledVector(tip, -new THREE.Vector3(-0.15, 0, -1).dot(tip)).normalize();
  SWORD_FOCUS_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, tip, new THREE.Vector3().crossVectors(edge, tip)));
}

let lockEnemy: Enemy | null = null; // ロックオンしている敵
let rushEnemy: Enemy | null = null; // 突進している先の敵
// 照準からの角度がいちばん小さい敵にロックオンする（間に壁や別の敵がある敵は選ばない）
function canLockOn(): boolean {
  lockEnemy = null;
  let bestAngle = LOCK_ANGLE;
  camera.getWorldDirection(lockLook);
  for (const e of enemies) {
    if (!e.alive) continue;
    lockTo.set(e.root.position.x, e.root.position.y + LOCK_HEIGHT, e.root.position.z).sub(camera.position);
    const dist = lockTo.length();
    if (dist > LOCK_RANGE || dist < 1e-3) continue;
    lockTo.divideScalar(dist);
    const angle = lockLook.angleTo(lockTo);
    if (angle > bestAngle) continue;
    e.root.updateMatrixWorld();
    if (!castThrow(camera.position, lockTo, dist + 1) || castHit.enemy !== e) continue;
    bestAngle = angle;
    lockEnemy = e;
  }
  if (lockEnemy) lockPoint.set(lockEnemy.root.position.x, lockEnemy.root.position.y + LOCK_HEIGHT, lockEnemy.root.position.z);
  return lockEnemy !== null;
}

// 敵へ与えたダメージの分だけゲージを溜める。構えている間と突進中は溜めない
function chargeFocus(damage: number) {
  if (focusing || rushTime >= 0) return;
  focusCharge = Math.min(1, focusCharge + damage / FOCUS_CHARGE_DAMAGE);
}

function startFocus() {
  focusing = true;
  focusTime = 0;
  focusCharge = 0;
  focusLocked = false;
  swordTwirlTime = Infinity;
  sfx.playFocusStart();
}

function endFocus() {
  focusing = false;
  focusLocked = false;
}

function startRush() {
  endFocus();
  setEn(rushEnemy = lockEnemy ?? en);
  // 敵の手前（こちら側）で止まる位置へ、空中からでもまっすぐ飛び込む
  rushDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
  const d = rushDir.length();
  if (d > 1e-4) rushDir.divideScalar(d);
  else camera.getWorldDirection(rushDir).setY(0).normalize();
  rushTarget.copy(en.root.position).addScaledVector(rushDir, -RUSH_STOP);
  if (d < RUSH_STOP) rushTarget.set(position.x, en.root.position.y, position.z);
  rushTime = 0;
  rushArrived = false;
  timeScale = 1; // スローを一気に解く
  player.sliding = false;
  player.dashTime = 0;
  if (player.wallRunning) endWallRun();
  fovKick += 14;
  addTrauma(0.3);
  kickVel.x += 1.2 * DEG * 22;
  sfx.playRush();
}

// update() の移動の中で呼ぶ。止まる位置へ RUSH_SPEED でまっすぐ向かい、届く 1 歩はぴったり合わせる
function updateRush(dt: number) {
  rushTime += dt;
  setEn(rushEnemy ?? en);
  // 突進しながら視線を敵へ吸い寄せる
  lockTo.set(en.root.position.x, en.root.position.y + LOCK_HEIGHT, en.root.position.z).sub(camera.position);
  lookEuler.setFromQuaternion(camera.quaternion);
  const k = 1 - Math.exp(-dt * 25);
  const yaw = Math.atan2(-lockTo.x, -lockTo.z);
  lookEuler.y += Math.atan2(Math.sin(yaw - lookEuler.y), Math.cos(yaw - lookEuler.y)) * k;
  lookEuler.x += (Math.atan2(lockTo.y, Math.hypot(lockTo.x, lockTo.z)) - lookEuler.x) * k;
  lookEuler.z = 0;
  camera.quaternion.setFromEuler(lookEuler);
  rushDir.subVectors(rushTarget, position);
  const d = rushDir.length();
  if (d <= RUSH_SPEED * dt || rushTime >= RUSH_MAX_TIME) {
    velocity.copy(rushDir).divideScalar(Math.max(dt, 1e-4));
    rushArrived = true;
  } else {
    velocity.copy(rushDir).multiplyScalar(RUSH_SPEED / d);
  }
}

function finishRush() {
  rushTime = -1;
  rushArrived = false;
  setEn(rushEnemy ?? en);
  rushDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z).normalize();
  velocity.set(rushDir.x * RUSH_EXIT_SPEED, 0, rushDir.z * RUSH_EXIT_SPEED);
  startSwordAttack(SWORD_ISSEN);
}

// 構え・ロックオン・突進の状態を進める（実時間で動かす）
function updateFocus() {
  const can = controls.isLocked && swordReady() && !swordAttack && rushTime < 0 && swordHold < 0;
  if (focusPressed && can && !focusing) {
    if (focusCharge >= 1) startFocus();
    else {
      focusEmptyFlash = FOCUS_EMPTY_FLASH;
      playRing(0.5, 0.25, 0.04); // 溜まっていない鈍い「カッ」
    }
  } else if (!can && focusing) endFocus();
  focusPressed = false;
  focusEmptyFlash = Math.max(0, focusEmptyFlash - realDt);

  if (focusing) {
    focusTime += realDt;
    if (focusTime >= FOCUS_MAX) endFocus();
  }
  if (focusing) {
    const lock = canLockOn();
    if (lock && !focusLocked) sfx.playLockOn(); // ロックオンした瞬間に「キン」
    focusLocked = lock;
  }
  if (rushArrived) finishRush();

  // スローは滑らかにかけ、解くときは突進で一気に戻す
  const targetScale = focusing || deadEye !== 'off' ? FOCUS_TIME_SCALE : 1;
  timeScale += (targetScale - timeScale) * Math.min(1, realDt * 10);
  if (Math.abs(timeScale - targetScale) < 0.01) timeScale = targetScale;
  const holdPose = focusing || rushTime >= 0;
  focusBlend += ((holdPose ? 1 : 0) - focusBlend) * Math.min(1, realDt * (holdPose ? 14 : 8));
  focusZoom += ((focusing ? 1 : 0) - focusZoom) * Math.min(1, realDt * (focusing ? 6 : 20));

  // クロスヘアの下の帯: 普段は溜まり具合、構えている間は構えていられる残り時間
  const fill = focusing
    ? Math.max(0, 1 - focusTime / FOCUS_MAX)
    : deadEye === 'mark' ? Math.max(0, 1 - deadEyeT / DEADEYE_MAX) : focusCharge;
  const ready = focusing || deadEye === 'mark' || focusCharge >= 1;
  focusHud.classList.toggle('show', focusing || shownWeapon === 'sword' || shownWeapon === 'handgun');
  focusHud.classList.toggle('ready', ready);
  focusHud.classList.toggle('empty', focusEmptyFlash > 0);
  focusFill.style.transform = `scaleX(${fill.toFixed(3)})`;
  if (ready && !focusShownReady && !focusing && deadEye === 'off') {
    focusHud.classList.remove('gain');
    void focusHud.offsetWidth;
    focusHud.classList.add('gain'); // 満タンになった瞬間に光らせる
  }
  focusShownReady = ready;

  // ロックオンの印を敵に重ねる
  lockonEl.classList.toggle('show', focusing && focusLocked);
  if (focusing && focusLocked) {
    lockScreen.copy(lockPoint).project(camera);
    lockonEl.style.left = `${((lockScreen.x + 1) / 2) * window.innerWidth}px`;
    lockonEl.style.top = `${((1 - lockScreen.y) / 2) * window.innerHeight}px`;
  }
}

interface SwordPose { pos: THREE.Vector3; quat: THREE.Quaternion; spin: number }
const newSwordPose = (): SwordPose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), spin: 0 });
const swordFrom = newSwordPose(); // 攻撃を始めた瞬間の構え
const swordCur = newSwordPose();
const swordTmp = newSwordPose();
const swordRestTip = new THREE.Vector3();
const swordRestEdge = new THREE.Vector3();
const swordEvalTip = new THREE.Vector3();
const swordEvalEdge = new THREE.Vector3();
const swordEvalFace = new THREE.Vector3();
const swordBasis = new THREE.Matrix4();

function evalSwordAttack(def: SwordAttackDef, t: number, out: SwordPose) {
  // 構えの key は、今の構えの向きを使う
  swordRestEdge.set(1, 0, 0).applyQuaternion(swordRestQuat);
  swordRestTip.set(0, 1, 0).applyQuaternion(swordRestQuat);
  const keys = def.keys;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const kPrev = keys[Math.max(0, i - 1)];
  const kNext = keys[Math.min(keys.length - 1, i + 2)];
  const e = k0.ease(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
  const tip = (k: SwordKey) => k.tip ?? swordRestTip;
  const edge = (k: SwordKey) => k.edge ?? swordRestEdge;
  catmullRom(kPrev.pos, k0.pos, k1.pos, kNext.pos, e, out.pos);
  // 切っ先と刃の向きも曲線でつなぎ、key の所で軌跡が折れないようにする
  catmullRom(tip(kPrev), tip(k0), tip(k1), tip(kNext), e, swordEvalTip);
  catmullRom(edge(kPrev), edge(k0), edge(k1), edge(kNext), e, swordEvalEdge);
  swordEvalTip.normalize();
  swordEvalEdge.addScaledVector(swordEvalTip, -swordEvalEdge.dot(swordEvalTip));
  if (swordEvalEdge.lengthSq() < 1e-8) swordEvalEdge.set(0, 0, -1).addScaledVector(swordEvalTip, swordEvalTip.z);
  swordEvalEdge.normalize();
  swordEvalFace.crossVectors(swordEvalEdge, swordEvalTip);
  out.quat.setFromRotationMatrix(swordBasis.makeBasis(swordEvalEdge, swordEvalTip, swordEvalFace));
  out.spin = k0.spin + (k1.spin - k0.spin) * e;
}

// 振りかぶりの key までの間に、攻撃開始時の構えから滑らかに移る
function swordPoseAt(def: SwordAttackDef, t: number, out: SwordPose) {
  evalSwordAttack(def, t, swordTmp);
  const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
  out.pos.lerpVectors(swordFrom.pos, swordTmp.pos, w);
  out.quat.slerpQuaternions(swordFrom.quat, swordTmp.quat, w);
  out.spin = swordFrom.spin + (swordTmp.spin - swordFrom.spin) * w;
}

function applySwordPose(p: SwordPose) {
  swordRest.position.copy(p.pos);
  swordRest.quaternion.copy(p.quat);
  swordSpin.rotation.z = p.spin * DEG;
}

function startSwordAttack(def: SwordAttackDef) {
  swordFrom.pos.copy(swordCur.pos);
  swordFrom.quat.copy(swordCur.quat);
  swordFrom.spin = ((((swordCur.spin + 180) % 360) + 360) % 360) - 180; // 回した分を巻き戻さないように
  swordAttack = def;
  // ダッシュで回している途中に振ったら、回すのをやめて攻撃へつなぐ
  swordTwirlTime = Infinity;
  swordTwirlGripped = true;
  swordTime = 0;
  swordQueued = false;
  swordFiredSwishes = 0;
  swordFiredGrips = 0;
  swordFiredRings = 0;
  swordFiredImpact = false;
  swordFiredLunge = false;
  swordHitLanded = false;
  swordLastTrail = -Infinity;
  swordRibbon.cut();
  if (def.windKick) {
    kickVel.x += def.windKick[0] * DEG * 10;
    kickVel.y += def.windKick[1] * DEG * 10;
    kickVel.z += def.windKick[2] * DEG * 10;
  }
}

// スライディング中・ダッシュ直後の技。この状況では長押しの溜めを待たず、押した瞬間に振る
function specialSwordAttack(): SwordAttackDef | null {
  if (player.sliding) return SWORD_SWEEP;
  if (player.dashTime > 0 || sinceDash < DASH_ATTACK_WINDOW) return SWORD_THRUST;
  return null;
}

function chooseSwordAttack(): SwordAttackDef {
  const special = specialSwordAttack();
  if (special) return special;
  const def = SWORD_COMBO[swordComboStep];
  swordComboStep = (swordComboStep + 1) % SWORD_COMBO.length;
  return def;
}

// 剣の切っ先が敵を捉えた場所を当たりの位置にする
const swordHitTip = new THREE.Vector3();
const swordSwing = new THREE.Vector3();
const SWING_SAMPLE = 1 / 120; // 刃の動く向きを、この時間だけ前後のポーズの差から求める
function swordTipAt(def: SwordAttackDef, t: number, out: THREE.Vector3) {
  swordPoseAt(def, t, swordTmpHit);
  applySwordPose(swordTmpHit);
  sword.updateWorldMatrix(true, false);
  return out.copy(SWORD_TRAIL_TIP).applyMatrix4(sword.matrixWorld);
}
function trySwordHit(def: SwordAttackDef): boolean {
  if (!dummyInReach(def.reach ?? SWORD_REACH, SWORD_HIT_ANGLE)) return false;
  camera.updateMatrixWorld();
  swordTipAt(def, Math.max(0, swordTime - SWING_SAMPLE), swordSwing);
  swordSwing.subVectors(swordTipAt(def, swordTime + SWING_SAMPLE, swordHitTip), swordSwing);
  swordTipAt(def, swordTime, swordHitTip);
  hitPointFromTip(swordHitTip, hitPoint);
  applyDummyHit(def, hitPoint, 'sword', swordSwing);
  return true;
}
const swordTmpHit = newSwordPose();
let swordHitLanded = false;

function updateSwordAttack(dt: number) {
  updateFocus();
  if (swordPressed) {
    swordPressed = false;
    if (focusing) {
      if (focusLocked) startRush();
    } else if (swordReady() && rushTime < 0) {
      if (!swordAttack) {
        const special = specialSwordAttack();
        if (special) startSwordAttack(special);
        else swordHold = 0; // 離すまで、普段の攻撃か溜め斬りかを決めない
      } else {
        if (swordTime >= swordAttack.cancel - SWORD_BUFFER) swordQueued = true;
        swordHold = 0; // 振っている間も押し続けているかを見て、振り終えたら溜めへ移る
      }
    }
  }

  // 長押しの溜め
  if (swordHold >= 0) {
    if (!controls.isLocked || !swordReady() || focusing || rushTime >= 0) {
      swordHold = -1;
    } else if (swordAttack) {
      // 振っている最中に押した: すぐ離せば次の段へつなぎ、押し続けていれば振り終えたところで溜めの構えへ
      swordHold += dt;
      if (!attackHeld) {
        swordHold = -1;
        if (swordTime >= swordAttack.cancel - SWORD_BUFFER) swordQueued = true;
      } else if (swordHold >= CHARGE_DELAY && swordTime >= swordAttack.cancel) {
        swordExit.pos.copy(swordCur.pos);
        swordExit.quat.copy(swordCur.quat);
        swordExit.spin = ((((swordCur.spin + 180) % 360) + 360) % 360) - 180;
        swordExitBlend = 1;
        swordAttack = null;
        swordQueued = false;
        swordComboTimer = SWORD_COMBO_RESET;
        swordHold = CHARGE_DELAY - 1e-4; // 次のフレームで溜めの構えに入る（溜める時間はここから数える）
      }
    } else {
      const wasStance = swordHold >= CHARGE_DELAY;
      const wasCharged = swordCharged();
      swordHold += dt;
      if (!wasStance && swordHold >= CHARGE_DELAY) {
        swordTwirlTime = Infinity; // ダッシュで回している途中でも、溜めの構えへ移る
        playGrip();
        playSwish({ at: 0, dur: 0.25, f0: 250, f1: 800, gain: 0.25 }, 'sword');
      }
      if (!wasCharged && swordCharged()) {
        sfx.playCharge(2); // 溜めきった「キン」
        addTrauma(0.1);
      }
      if (!attackHeld) {
        const charged = swordCharged();
        swordHold = -1;
        if (charged) startChargeSlash();
        else startSwordAttack(chooseSwordAttack());
      }
    }
  }

  if (swordAttack) {
    swordTime += dt;
    const def = swordAttack;

    while (swordFiredSwishes < def.swishes.length && swordTime >= def.swishes[swordFiredSwishes].at) {
      playSwish(def.swishes[swordFiredSwishes++], 'sword');
    }
    const grips = def.grips ?? [];
    while (swordFiredGrips < grips.length && swordTime >= grips[swordFiredGrips]) {
      swordFiredGrips++;
      playGrip();
    }
    const rings = def.rings ?? [];
    while (swordFiredRings < rings.length && swordTime >= rings[swordFiredRings][0]) {
      playRing(rings[swordFiredRings++][1], 0.8, 0.5);
    }
    if (!swordFiredLunge && swordTime >= def.lungeAt) {
      swordFiredLunge = true;
      applyLunge(def.lunge);
    }
    if (!swordFiredImpact && swordTime >= def.impact) {
      swordFiredImpact = true;
      kickVel.x += def.kick[0] * DEG * 22;
      kickVel.y += def.kick[1] * DEG * 22;
      kickVel.z += def.kick[2] * DEG * 22;
      addTrauma(0.08);
      fovKick += def.fovPunch ?? 0;
      landDipVel -= def.dip ?? 0;
      swordHitLanded = trySwordHit(def);
    } else if (swordFiredImpact && !swordHitLanded && def.hitUntil !== undefined && swordTime <= def.hitUntil) {
      swordHitLanded = trySwordHit(def);
    }

    // 押し続けている間は、離すか溜めに移るまで次の段を待つ
    if (swordQueued && swordTime >= def.cancel && !(swordHold >= 0 && attackHeld)) {
      startSwordAttack(chooseSwordAttack());
    } else if (swordTime >= def.duration) {
      swordAttack = null;
      swordComboTimer = SWORD_COMBO_RESET;
    }
  } else if (swordComboTimer > 0) {
    swordComboTimer -= dt;
    if (swordComboTimer <= 0) swordComboStep = 0;
  }
  // 持ち替えたら最初の段から
  if (shownWeapon !== 'sword') {
    swordAttack = null;
    swordComboStep = 0;
    swordTwirlTime = Infinity;
    if (focusing) endFocus();
    rushTime = -1;
    rushArrived = false;
    swordHold = -1;
    chargeDashTime = 0;
  }

  const stance = swordHold >= CHARGE_DELAY;
  swordChargeBlend += ((stance ? 1 : 0) - swordChargeBlend) * Math.min(1, dt * (stance ? 14 : 10));

  if (swordAttack) {
    swordExitBlend = 0;
    sampleSwordTrail();
    swordPoseAt(swordAttack, swordTime, swordCur);
  } else {
    const prev = swordTwirlTime;
    swordTwirlTime += dt;
    if (swordTwirlTime < SWORD_TWIRL_TIME) sampleTwirlTrail(prev, swordTwirlTime);
    swordTwirlPose(swordTwirlTime, swordCur);
    if (!swordTwirlGripped && swordTwirlTime >= SWORD_TWIRL_GRIP) {
      swordTwirlGripped = true;
      playGrip();
    }
    // 居合の構え。構えている間はゆっくり呼吸するように上下させる
    if (focusBlend > 1e-3) {
      const w = easeInOutCubic(focusBlend);
      swordFocusPos.copy(SWORD_FOCUS_POS);
      swordFocusPos.y += Math.sin(performance.now() * 0.004) * 0.004;
      swordCur.pos.lerp(swordFocusPos, w);
      swordCur.quat.slerp(SWORD_FOCUS_QUAT, w);
      swordCur.spin *= 1 - w;
    }
    // 溜めの構え。溜まるにつれて少しずつ引き絞り、溜めきったら刀を小刻みに震わせる
    if (swordChargeBlend > 1e-3) {
      const w = easeInOutCubic(swordChargeBlend);
      const u = THREE.MathUtils.clamp((swordHold - CHARGE_DELAY) / CHARGE_TIME, 0, 1);
      swordChargePos.set(CHARGE_POS[0] + 0.03 * u, CHARGE_POS[1] + 0.01 * u, CHARGE_POS[2] + 0.04 * u);
      if (swordCharged()) {
        const n = performance.now();
        swordChargePos.x += Math.sin(n * 0.09) * 0.0025;
        swordChargePos.y += Math.sin(n * 0.11 + 1) * 0.0025;
      }
      swordCur.pos.lerp(swordChargePos, w);
      swordCur.quat.slerp(SWORD_CHARGE_QUAT, w);
      swordCur.spin *= 1 - w;
    }
    // 振りの途中から溜めへ移ったときは、振っていた形から滑らかにつなぐ
    if (swordExitBlend > 0) {
      swordExitBlend = Math.max(0, swordExitBlend - dt / SWORD_EXIT_TIME);
      const w = easeInOutCubic(swordExitBlend);
      swordCur.pos.lerp(swordExit.pos, w);
      swordCur.quat.slerp(swordExit.quat, w);
      swordCur.spin += (swordExit.spin - swordCur.spin) * w;
    }
  }
  applySwordPose(swordCur);
  swordRibbon.update(trailNow);
}

const swordFocusPos = new THREE.Vector3();
const SWORD_EXIT_TIME = 0.15;
const swordExit = newSwordPose();
let swordExitBlend = 0;

// ダッシュ時の回転。回している間は縦に立てた構えの面で回し（走る構えのまま回すと画面を覆うので）、
// 回し終わりに今の構えへ戻す
function swordTwirlPose(t: number, out: SwordPose) {
  out.pos.set(0, 0, 0);
  if (t >= SWORD_TWIRL_TIME) {
    out.quat.copy(swordRestQuat);
    out.spin = 0;
    return;
  }
  const u = t / SWORD_TWIRL_TIME;
  const w = THREE.MathUtils.smoothstep(u, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(u, 0.7, 1));
  out.quat.slerpQuaternions(swordRestQuat, SWORD_STAND_QUAT, w);
  out.pos.set(0.02, 0.04, -0.04).multiplyScalar(w); // 少し前へ出して回す
  out.spin = -360 * SWORD_TWIRL_TURNS * easeOutCubic(u);
}

function startSwordTwirl() {
  swordTwirlTime = 0;
  swordTwirlGripped = false;
  swordRibbon.cut();
  playSwish({ at: 0, dur: 0.18, f0: 600, f1: 2200, gain: 0.2 }, 'sword');
  setTimeout(() => playSwish({ at: 0, dur: 0.2, f0: 500, f1: 1800, gain: 0.14 }, 'sword'), 150);
}

// 回している間の軌跡（勢いのある前半だけ）
function sampleTwirlTrail(from: number, to: number) {
  const end = Math.min(to, SWORD_TWIRL_TIME * 0.8);
  for (let s = Math.max(from + TRAIL_STEP, 0); s <= end; s += TRAIL_STEP) {
    swordTwirlPose(s, swordTrailPose);
    pushSwordTrail(swordTrailPose, trailNow - (to - s));
  }
}

function pushSwordTrail(p: SwordPose, time: number) {
  applySwordPose(p);
  sword.updateWorldMatrix(true, false);
  camera.worldToLocal(swordTrailTip.copy(SWORD_TRAIL_TIP).applyMatrix4(sword.matrixWorld));
  camera.worldToLocal(swordTrailBase.copy(SWORD_TRAIL_BASE).applyMatrix4(sword.matrixWorld));
  swordRibbon.push(swordTrailTip, swordTrailBase, time);
}

// 剣の軌跡: クナイの軌跡と同じ見た目で、刃の根元から切っ先の少し先まで、刃全体の幅で残す
const SWORD_TRAIL_TIP = new THREE.Vector3(0, SWORD_TIP + 0.03, 0); // 剣のローカル座標
const SWORD_TRAIL_BASE = new THREE.Vector3(0, SWORD_BLADE_BASE_Y + 0.01, 0);
const swordRibbon = new Ribbon(240, 0.2, makeRibbonMaterial(SWORD_RIBBON));
camera.add(swordRibbon.mesh);
let swordLastTrail = -Infinity;
const swordTrailPose = newSwordPose();
const swordTrailTip = new THREE.Vector3();
const swordTrailBase = new THREE.Vector3();
function sampleSwordTrail() {
  const def = swordAttack;
  if (!def) return;
  for (const [from, to] of def.trails) {
    const end = Math.min(to, swordTime);
    for (let s = Math.max(from, swordLastTrail + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
      if (s - swordLastTrail > TRAIL_STEP * 1.5) swordRibbon.cut(); // 別の時間帯の軌跡とはつながない
      swordPoseAt(def, s, swordTrailPose);
      pushSwordTrail(swordTrailPose, trailNow - (swordTime - s));
      swordLastTrail = s;
    }
  }
}

// ---- 近接攻撃（斧） ----
const axeDriveDir = new THREE.Vector3();
const axeRushDir = new THREE.Vector3();

// ---- 振り終わりの戻し: 柄を手の中で一回転させて構えへ叩き込む ----

let axeLaunchPressed = false; // 右クリックを押した瞬間（打ち上げ）
let axeLaunchQueued = false;
let axeRushAirUsed = false; // 今の空中で突進を使った（着地・壁走りまで 1 回）
let axeRushTime = -1; // 突進を始めてからの時間。負なら突進していない
const axeWheelHits = new Set<Enemy>(); // 今の 1 周で斬りつけた敵

let axeAttack: AxeAttackDef | null = null;
// ダッシュしたら、柄を軸にくるりと一回転させる（頭の位置はそのまま）
const AXE_DASH_SPIN_TIME = 0.42;
const AXE_Y = new THREE.Vector3(0, 1, 0);
let axeSpinTime = Infinity;
const axeSpinQuat = new THREE.Quaternion();
let axeTime = 0;
let axeQueued = false;
let axePressed = false;
let axeAttackWeight = 0;
let axeComboStep = 0;
let axeComboTimer = 0;
let axeFiredSwishes = 0;
let axeFiredGrips = 0;
let axeFiredKicks = 0;
let axeFiredImpact = false;
let axeFiredLunge = false;
let axeFiredGround = false;
let axeHitLanded = false;
let axeBite = 0;

// ---- 斧の勢い: 速く動いているほど、高くから落ちるほど一撃が重くなる ----
// 振り始めと刃が当たる瞬間の水平の速さのうち大きい方で、威力・吹き飛ばし・振りの速さを決める。
// 止まって振ると威力が下がり、ただ重くて遅い武器になる
const AXE_POWER_MIN_SPEED = WALK_SPEED; // これ以下の速さでは勢いが 0
const AXE_POWER_FULL_SPEED = 28; // これ以上の速さで勢いが 1（ダッシュ中・ダッシュ直後）
const AXE_POWER_FALL_MIN = 1.5; // 叩きつけで落ちた高さ (m)。これ以下なら勢いが 0
const AXE_POWER_FALL_FULL = 8; // これ以上落ちれば勢いが 1
const AXE_POWER_LOW = 0.85; // 勢い 0 のときの威力の倍率
const AXE_POWER_HIGH = 1.5; // 勢い 1 のときの威力の倍率
const AXE_POWER_HASTE = 0.2; // 勢い 1 のとき、振りをこれだけ速める
// ---- 右クリックの打ち上げ ----
// 地上で右クリックを押すと打ち上げ。当たった敵は真上へ飛び、自分も同じくらい跳び上がる。空中で当たった敵は叩きつけで地面へ叩き落とす
const AXE_LAUNCH_SELF_SPEED = 11.5;
const AXE_LAUNCH_KEEP = 0.3; // 打ち上げたとき、自分の水平の速さをこれだけ残す（敵から離れていかないように）
// 右クリックを押し続けていれば、振りかぶった所（AXE_LAUNCH_COCK）で止めて構え、離したら振り上げる
const AXE_LAUNCH_COCK = AXE_LAUNCH.keys[2].t; // 構えで止める時間 = 構えの key（AXE_TIME_SCALE を掛けた後の時間）
const AXE_STANCE_TREMBLE = 0.0018; // 構えている間に手元が震える大きさ (m)
let axeStance = false; // 打ち上げの構えで止めている
let axeCocked = false; // 構えきった（握り直しの音を鳴らした）
let axeLaunchedAir = false; // 打ち上げで自分も跳び上がり、まだ着地していない（この間だけ叩きつけが出る）
const axeDashing = () => player.dashTime > 0 || sinceDash < DASH_ATTACK_WINDOW;
const axeLaunchable = () => player.onGround && !player.sliding && !player.wallRunning && !axeDashing();

let axePower = 0; // 今の攻撃の勢い (0..1)
let axeSmashFromY = NaN; // 空中の叩きつけで落ち始めた高さ（足元）。着地するまで NaN 以外
// 空中の叩きつけで着地したあと、斧を床に打ち込んだ重さで少しだけ動けなくなる（歩く・跳ぶ・ダッシュ・次の攻撃）
const AXE_SLAM_RECOVER = 0.3;
let axeSlamRecover = 0; // 残りの硬直の時間
const axeHits = new Set<Enemy>(); // 今の攻撃で当てた敵（同じ敵に二度当てない）
const axeSpeedPower = () => THREE.MathUtils.clamp(
  (Math.hypot(velocity.x, velocity.z) - AXE_POWER_MIN_SPEED) / (AXE_POWER_FULL_SPEED - AXE_POWER_MIN_SPEED), 0, 1);
const axeFallPower = (fall: number) => THREE.MathUtils.clamp(
  (fall - AXE_POWER_FALL_MIN) / (AXE_POWER_FALL_FULL - AXE_POWER_FALL_MIN), 0, 1);
// 勢いを乗せた当たり（使い回す）
const axePoweredHit: HitDef = { kick: [0, 0, 0] };
function poweredAxeHit(def: HitDef, power: number): HitDef {
  const m = AXE_POWER_LOW + (AXE_POWER_HIGH - AXE_POWER_LOW) * power;
  axePoweredHit.kick = def.kick;
  axePoweredHit.slash = def.slash;
  axePoweredHit.fx = (def.fx ?? 1) * m;
  axePoweredHit.knock = (def.knock ?? DEFAULT_KNOCK) * m;
  axePoweredHit.hitStop = (def.hitStop ?? DEFAULT_HIT_STOP) * (0.85 + 0.35 * power);
  return axePoweredHit;
}

// ---- 叩きつけの衝撃波: 空中の叩きつけで着地したとき、まわりの敵をまとめて吹き飛ばす ----
// 高くから落ちるほど広く強くなる。刃で直接当てた敵には当てない（浮いていれば床への叩きつけが代わりに当たる）
const AXE_SHOCK_RADIUS_LOW = 3;
const AXE_SHOCK_RADIUS_HIGH = 7;
const AXE_SHOCK_FX_LOW = 0.6; // 中心での威力（勢い 0）。端では半分になる
const AXE_SHOCK_FX_HIGH = 1.4;
const AXE_SHOCK_HIT: HitDef = { kick: [-1.2, 0, 0], slash: 0, hitStop: 0.07 };
const axeShockAt = new THREE.Vector3();
function axeShockwave(fall: number) {
  const p = axeFallPower(fall);
  const radius = AXE_SHOCK_RADIUS_LOW + (AXE_SHOCK_RADIUS_HIGH - AXE_SHOCK_RADIUS_LOW) * p;
  sfx.playAxeGround(1 + 0.6 * p);
  addTrauma(0.3 + 0.4 * p);
  landDipVel -= 1.2 + 1.6 * p;
  kickVel.x -= (1.5 + 2 * p) * DEG * 22;
  spawnAxeShock(position, radius, p);
  for (const e of enemies) {
    if (!e.alive || axeHits.has(e)) continue;
    if (Math.abs(e.root.position.y - position.y) > 1.5) continue;
    setEn(e);
    hitDir.set(e.root.position.x - position.x, 0, e.root.position.z - position.z);
    const dist = hitDir.length();
    if (dist > radius + DUMMY_RADIUS) continue;
    if (dist > 1e-4) hitDir.divideScalar(dist);
    else hitDir.set(1, 0, 0);
    const near = 1 - 0.5 * Math.min(1, dist / radius);
    AXE_SHOCK_HIT.fx = (AXE_SHOCK_FX_LOW + (AXE_SHOCK_FX_HIGH - AXE_SHOCK_FX_LOW) * p) * near;
    AXE_SHOCK_HIT.knock = (300 + 250 * p) * near;
    // 足元の、こちらを向いた側を打つ
    axeShockAt.copy(e.root.position).addScaledVector(hitDir, -DUMMY_RADIUS);
    axeShockAt.y += 0.4;
    applyDummyHit(AXE_SHOCK_HIT, axeShockAt, 'axe', undefined, false);
    if (e.alive) knockEnemy(hitDir, AXE_SHOCK_HIT.knock); // 中心から外へ吹き飛ばす
  }
}

// 衝撃波の見た目
// 地面: 波打ちながら走る縁・あとを追う 2 本目の輪・波が通った所だけ光る床のグリッド・中心の焦げ跡・枝分かれして走るひび
// 空間: 縁から立ち上がる光の壁・縁から時間差で噴き上がる土煙の筋・地を這う光線・床のかけら・横に潰れた閃光
const AXE_SHOCK_LIFE = 0.55; // 波が広がりきるまで
const AXE_SHOCK_ECHO = 0.1; // 2 本目の輪の遅れ（波の時間に対する割合）
const AXE_SHOCK_WALL = 0.45; // 光の壁の高さ（勢い 0）。勢い 1 で倍
const AXE_CRACK_LIFE = 1.8; // ひびと焦げ跡が冷えて消えるまで
const AXE_CRACK_HEAT = 3.5; // ひびが白熱から冷える速さ
const AXE_CRACK_MAX_SEG = 220;
const AXE_CHUNK_TINT = new THREE.Color(0xa8a8a8); // 床のかけらの色
// 波の縁が中心から dist まで届く時間（半径は easeOutCubic で広がる）
const axeShockReach = (dist: number, radius: number) => (1 - Math.cbrt(Math.max(0, 1 - dist / radius))) * AXE_SHOCK_LIFE;

const AXE_SHOCK_HASH = /* glsl */ `
  float hash1(float n) { return fract(sin(n * 12.9898 + uSeed) * 43758.5453); }
  // 角度方向の滑らかな揺らぎ。cells 個で一周してつながる
  float ringNoise(float a01, float cells) {
    float x = a01 * cells;
    float i = floor(x);
    float f = fract(x);
    return mix(hash1(mod(i, cells)), hash1(mod(i + 1.0, cells)), f * f * (3.0 - 2.0 * f));
  }
`;
// 地面の円盤: 白い光と暗い焦げを、乗算済みアルファで 1 枚に重ねる
const axeShockDiscGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const makeAxeShockDiscMat = () => new THREE.ShaderMaterial({
  transparent: true, premultipliedAlpha: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  uniforms: {
    uCenter: { value: new THREE.Vector2() }, uFront: { value: 0 }, uEcho: { value: -1 }, uRadius: { value: 1 },
    uFade: { value: 0 }, uScorch: { value: 0 }, uSeed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vXZ;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vXZ = w.xz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec2 uCenter;
    uniform float uFront;
    uniform float uEcho;
    uniform float uRadius;
    uniform float uFade;
    uniform float uScorch;
    uniform float uSeed;
    varying vec2 vXZ;
    ${AXE_SHOCK_HASH}
    float gridAxis(float p, float cell, float width) {
      float px = fwidth(p);
      float d = abs(fract(p / cell - 0.5) - 0.5) * cell;
      float w = max(width, px);
      return clamp((w * 0.5 - d) / px + 0.5, 0.0, 1.0) * (width / w);
    }
    void main() {
      vec2 p = vXZ - uCenter;
      float d = length(p);
      float a01 = atan(p.y, p.x) / 6.2831853 + 0.5;
      // 縁を波打たせ、広がるほど崩す
      float dd = d + (ringNoise(a01, 28.0) - 0.5) * 0.35 * (uFront / uRadius) + (ringNoise(a01, 9.0) - 0.5) * 0.2;
      float behind = uFront - dd; // 正なら波が通り過ぎた所
      float inside = step(0.0, behind);
      float edge = behind < 0.0 ? exp(behind * 45.0) : exp(-behind * 9.0);
      float wash = inside * exp(-behind * 2.0);
      float echo = uEcho > 0.0 ? exp(-abs(uEcho - dd) * 30.0) * 0.55 : 0.0;
      // 波の内側を外へ流れる放射状の筋
      float streak = smoothstep(0.6, 1.0, ringNoise(a01, 110.0)) * smoothstep(0.3, 1.2, d) * wash;
      // 波が通った所だけ、床のグリッドを光らせる
      float minor = max(gridAxis(vXZ.x, ${ARENA_GRID_MINOR.toFixed(2)}, 0.03), gridAxis(vXZ.y, ${ARENA_GRID_MINOR.toFixed(2)}, 0.03));
      float major = max(gridAxis(vXZ.x, ${ARENA_GRID_MAJOR.toFixed(2)}, 0.08), gridAxis(vXZ.y, ${ARENA_GRID_MAJOR.toFixed(2)}, 0.08));
      float grid = max(minor * 0.55, major) * inside * exp(-behind * 1.1);
      float limit = 1.0 - smoothstep(uRadius * 0.9, uRadius * 1.08, d);
      float light = clamp(edge + wash * 0.3 + echo + streak * 0.45 + grid * 0.85, 0.0, 1.0) * uFade * limit;
      // 中心の焦げ跡: 縁をぎざぎざにした暗い円
      float scorchR = 0.9 + 0.35 * ringNoise(a01, 13.0);
      float scorch = (1.0 - smoothstep(scorchR * 0.35, scorchR, d)) * 0.42 * uScorch;
      gl_FragColor = vec4(vec3(light), 1.0 - (1.0 - light) * (1.0 - scorch));
    }
  `,
});
// 光の壁: 波の縁に沿って立つ筒。上の縁は角度ごとに高さを変えてぎざぎざにする
const axeShockWallGeo = new THREE.CylinderGeometry(1, 1, 1, 72, 1, true).translate(0, 0.5, 0);
const makeAxeShockWallMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uFade: { value: 0 }, uSeed: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uFade;
    uniform float uSeed;
    varying vec2 vUv;
    ${AXE_SHOCK_HASH}
    void main() {
      float top = 0.35 + 0.65 * ringNoise(vUv.x, 40.0);
      float band = smoothstep(0.55, 1.0, ringNoise(vUv.x, 150.0)); // 縦に走る明るい筋
      float h = vUv.y / mix(top, 1.0, band * 0.5);
      float a = (1.0 - smoothstep(0.0, 1.0, h)) * (0.55 + 0.45 * band);
      a *= a * uFade;
      gl_FragColor = vec4(vec3(1.0), a);
    }
  `,
});
// ひび: 地面に平たく置いた細い帯。中心から縁が届いた所まで走り、白熱から冷えて暗い割れ目になる
const axeCrackIndex = new Uint16Array(AXE_CRACK_MAX_SEG * 6);
for (let i = 0; i < AXE_CRACK_MAX_SEG; i++) axeCrackIndex.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
const makeAxeCrackMat = () => new THREE.ShaderMaterial({
  transparent: true, premultipliedAlpha: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  uniforms: { uReach: { value: 0 }, uHeat: { value: 1 }, uFade: { value: 1 } },
  vertexShader: /* glsl */ `
    attribute float aDist;
    attribute float aSide;
    varying float vDist;
    varying float vSide;
    void main() {
      vDist = aDist;
      vSide = aSide;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uReach;
    uniform float uHeat;
    uniform float uFade;
    varying float vDist;
    varying float vSide;
    void main() {
      float shown = 1.0 - smoothstep(uReach - 0.15, uReach, vDist);
      float across = abs(vSide);
      float core = 1.0 - smoothstep(0.3, 0.6, across);
      float glow = 1.0 - across;
      // 走ったばかりの先端ほど熱い
      float heat = uHeat * (0.6 + 0.4 * smoothstep(uReach - 1.5, uReach, vDist));
      float k = shown * uFade;
      vec3 col = vec3(heat * (core + glow * 0.6));
      float a = core * 0.8 + glow * heat * 0.35;
      gl_FragColor = vec4(col * k, clamp(a, 0.0, 1.0) * k);
    }
  `,
});

interface AxeShock {
  disc: THREE.Mesh; discMat: THREE.ShaderMaterial;
  wall: THREE.Mesh; wallMat: THREE.ShaderMaterial;
  cracks: THREE.Mesh; crackGeo: THREE.BufferGeometry; crackMat: THREE.ShaderMaterial;
  age: number; radius: number; power: number;
}
const axeShocks: AxeShock[] = [];
function newAxeShock(): AxeShock {
  const discMat = makeAxeShockDiscMat();
  const disc = new THREE.Mesh(axeShockDiscGeo, discMat);
  disc.renderOrder = 2;
  const wallMat = makeAxeShockWallMat();
  const wall = new THREE.Mesh(axeShockWallGeo, wallMat);
  wall.renderOrder = 4;
  const crackGeo = new THREE.BufferGeometry();
  crackGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AXE_CRACK_MAX_SEG * 4 * 3), 3));
  crackGeo.setAttribute('aDist', new THREE.BufferAttribute(new Float32Array(AXE_CRACK_MAX_SEG * 4), 1));
  crackGeo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(AXE_CRACK_MAX_SEG * 4), 1));
  crackGeo.setIndex(new THREE.BufferAttribute(axeCrackIndex, 1));
  const crackMat = makeAxeCrackMat();
  const cracks = new THREE.Mesh(crackGeo, crackMat);
  cracks.renderOrder = 3;
  cracks.frustumCulled = false;
  for (const m of [disc, wall, cracks]) {
    m.visible = false;
    scene.add(m);
  }
  const s: AxeShock = { disc, discMat, wall, wallMat, cracks, crackGeo, crackMat, age: Infinity, radius: 1, power: 0 };
  axeShocks.push(s);
  return s;
}

// 中心から外へ、向きを揺らしながら伸ばす。途中でときどき枝分かれさせる
let axeCrackSegs = 0;
function growAxeCrack(geo: THREE.BufferGeometry, x: number, z: number, ang: number, len: number, width: number, branch: boolean) {
  const pos = geo.attributes.position.array as Float32Array;
  const dist = geo.attributes.aDist.array as Float32Array;
  const side = geo.attributes.aSide.array as Float32Array;
  const out = ang;
  let walked = 0;
  while (walked < len && axeCrackSegs < AXE_CRACK_MAX_SEG) {
    const step = rand(0.16, 0.36);
    ang += rand(-0.5, 0.5) + (out - ang) * 0.35; // 外向きから大きく外れないよう引き戻す
    const nx = x + Math.cos(ang) * step;
    const nz = z + Math.sin(ang) * step;
    const w0 = Math.max(0.005, width * (1 - walked / len));
    const w1 = Math.max(0.005, width * (1 - (walked + step) / len));
    const sx = -Math.sin(ang);
    const sz = Math.cos(ang);
    const i = axeCrackSegs * 4;
    pos.set([x + sx * w0, 0, z + sz * w0, x - sx * w0, 0, z - sz * w0, nx + sx * w1, 0, nz + sz * w1, nx - sx * w1, 0, nz - sz * w1], i * 3);
    const d0 = Math.hypot(x, z);
    const d1 = Math.hypot(nx, nz);
    dist.set([d0, d0, d1, d1], i);
    side.set([1, -1, 1, -1], i);
    axeCrackSegs++;
    if (branch && walked > 0.3 && Math.random() < 0.22) {
      growAxeCrack(geo, nx, nz, ang + rand(0.5, 1.0) * (Math.random() < 0.5 ? -1 : 1), (len - walked) * rand(0.35, 0.7), w1 * 0.8, false);
    }
    x = nx;
    z = nz;
    walked += step;
  }
}

const axeShockDir = new THREE.Vector3();
function spawnAxeShock(at: THREE.Vector3, radius: number, power: number) {
  const s = axeShocks.find((r) => r.age >= AXE_CRACK_LIFE) ?? newAxeShock();
  s.age = 0;
  s.radius = radius;
  s.power = power;
  const seed = Math.random() * 100;

  s.disc.position.set(at.x, at.y + 0.03, at.z);
  s.disc.scale.setScalar(radius * 1.1);
  s.discMat.uniforms.uCenter.value.set(at.x, at.z);
  s.discMat.uniforms.uRadius.value = radius;
  s.discMat.uniforms.uSeed.value = seed;
  s.wall.position.set(at.x, at.y, at.z);
  s.wall.rotation.y = Math.random() * Math.PI * 2;
  s.wallMat.uniforms.uSeed.value = seed + 7;

  // ひび: 高くから落ちるほど本数を増やし、長く太くする
  axeCrackSegs = 0;
  const count = 7 + Math.round(5 * power);
  const a0 = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = a0 + (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
    const r0 = rand(0.15, 0.35);
    growAxeCrack(s.crackGeo, Math.cos(a) * r0, Math.sin(a) * r0, a, radius * rand(0.3, 0.6), 0.045 + 0.035 * power, true);
  }
  s.crackGeo.setDrawRange(0, axeCrackSegs * 6);
  for (const name of ['position', 'aDist', 'aSide']) (s.crackGeo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  s.cracks.position.set(at.x, at.y + 0.035, at.z);

  for (const m of [s.disc, s.wall, s.cracks]) m.visible = true;
  updateAxeShock(s, 0);

  // 足元の閃光: 横に潰して、地面を叩いた形にする
  const flash = fireBurst(flares, axeShockAt.set(at.x, at.y + 0.15, at.z), 3 + 2.5 * power, 0.3, 2.2, 2.6);
  flash.mat.uniforms.uRot.value = 0;
  fireBurst(flares, axeShockAt, 1.4 + power, 0.14, 2.5, 1);

  // 地を這う光線
  const rays = 30 + Math.round(14 * power);
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + Math.random() * 0.12;
    axeShockDir.set(Math.cos(a), rand(0, 0.05), Math.sin(a));
    addBeam(axeShockAt.set(at.x, at.y + rand(0.05, 0.2), at.z), axeShockDir, {
      color: HIT_TINT,
      len: radius * rand(0.6, 1),
      width: rand(0.04, 0.08) * (1 + 0.5 * power),
      offset: 0.3,
      tail: 1,
      reach: 1.3,
      life: rand(0.4, 0.55),
    });
  }
  // 波の縁が届いた所から、時間差で噴き上がる土煙の筋
  const jets = 18 + Math.round(16 * power);
  for (let i = 0; i < jets; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = radius * Math.sqrt(rand(0.04, 0.9));
    axeShockDir.set(Math.cos(a) * rand(0.15, 0.5), 1, Math.sin(a) * rand(0.15, 0.5));
    addBeam(axeShockAt.set(at.x + Math.cos(a) * d, at.y, at.z + Math.sin(a) * d), axeShockDir, {
      color: HIT_TINT,
      len: rand(0.5, 1.3) * (1 + power) * (1 - 0.5 * d / radius),
      width: rand(0.03, 0.07),
      tail: 1,
      reach: rand(1.6, 2.4),
      life: rand(0.25, 0.4),
      age: -axeShockReach(d, radius),
    });
  }
  // 床のかけらと火花を、足元の輪から外へ跳ね上げる
  const chunks = 16 + Math.round(16 * power);
  for (let i = 0; i < chunks; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = rand(0.3, 1.2);
    axeShockAt.set(at.x + Math.cos(a) * d, at.y + 0.05, at.z + Math.sin(a) * d);
    hitLook.set(Math.cos(a), rand(0.6, 1.4), Math.sin(a));
    spawnShards(axeShockAt, hitLook, 1, rand(0.8, 1.3), rand(0.8, 1.4) * (1 + 0.4 * power), undefined, AXE_CHUNK_TINT);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    axeShockAt.set(at.x + Math.cos(a) * 0.6, at.y + 0.1, at.z + Math.sin(a) * 0.6);
    hitLook.set(-Math.cos(a), 0.3, -Math.sin(a));
    spawnSparks(axeShockAt, hitLook, 1 + Math.round(power), 0.9, 0.8);
  }
}
function updateAxeShock(s: AxeShock, dt: number) {
  s.age += dt;
  if (s.age >= AXE_CRACK_LIFE) {
    s.disc.visible = s.wall.visible = s.cracks.visible = false;
    return;
  }
  const u = Math.min(1, s.age / AXE_SHOCK_LIFE);
  const front = s.radius * easeOutCubic(u);
  const echoU = (s.age / AXE_SHOCK_LIFE - AXE_SHOCK_ECHO) / (1 - AXE_SHOCK_ECHO);
  const du = s.discMat.uniforms;
  du.uFront.value = front;
  du.uEcho.value = echoU > 0 && echoU < 1 ? s.radius * 0.85 * easeOutCubic(echoU) : -1;
  du.uFade.value = (1 - u) ** 1.5;
  const cool = s.age / AXE_CRACK_LIFE;
  du.uScorch.value = Math.min(1, s.age / 0.05) * (1 - THREE.MathUtils.smoothstep(cool, 0.5, 1));

  // 壁は一気に立ち上がり、広がりながら低く薄くなる
  s.wall.visible = u < 1;
  const h = AXE_SHOCK_WALL * (1 + s.power) * Math.min(1, s.age / 0.04) * (1 - u) ** 0.6;
  s.wall.scale.set(Math.max(0.01, front), Math.max(0.01, h), Math.max(0.01, front));
  s.wallMat.uniforms.uFade.value = 0.6 * (1 - u) ** 2;

  const cu = s.crackMat.uniforms;
  cu.uReach.value = s.radius * easeOutCubic(Math.min(1, u * 1.4));
  cu.uHeat.value = Math.exp(-s.age * AXE_CRACK_HEAT);
  cu.uFade.value = 1 - THREE.MathUtils.smoothstep(cool, 0.55, 1);
}
function updateAxeShocks(dt: number) {
  for (const s of axeShocks) if (s.age < AXE_CRACK_LIFE) updateAxeShock(s, dt);
}
const axeJolt = new THREE.Vector3();
const axeJoltVel = new THREE.Vector3();

const axeReady = () => shownWeapon === 'axe' && wantWeapon === 'axe' && holster === 0;

interface AxePose { pos: THREE.Vector3; quat: THREE.Quaternion }
const newAxePose = (): AxePose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion().copy(AXE_REST_QUAT) });
const axeFrom = newAxePose(); // 攻撃を始めた瞬間の構え
const axeCur = newAxePose();
const axeTmp = newAxePose();
const axeTmpHit = newAxePose();
const axeTrailPose = newAxePose();
const axeEvalTurn = new THREE.Vector3();
const axeEvalV = new Array<number>(AXE_CHANNELS).fill(0);

// 手の位置と回転の積み重ねを同じ曲線でつなぎ、区間の始まりの key の向きから、積み重ねの差の分だけ回す
function evalAxeAttack(def: AxeAttackDef, t: number, out: AxePose) {
  const keys = def.keys;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const h = k1.t - k0.t;
  const u = THREE.MathUtils.clamp((t - k0.t) / h, 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const a0 = 2 * u3 - 3 * u2 + 1;
  const b0 = (u3 - 2 * u2 + u) * h;
  const a1 = -2 * u3 + 3 * u2;
  const b1 = (u3 - u2) * h;
  for (let c = 0; c < AXE_CHANNELS; c++) {
    axeEvalV[c] = a0 * k0.v[c] + b0 * k0.slope[c] + a1 * k1.v[c] + b1 * k1.slope[c];
  }
  const v = axeEvalV;
  out.pos.set(v[0], v[1], v[2]);
  axeEvalTurn.set(v[3] - k0.v[3], v[4] - k0.v[4], v[5] - k0.v[5]);
  const angle = axeEvalTurn.length();
  if (angle < 1e-9) out.quat.copy(k0.quat);
  else out.quat.setFromAxisAngle(axeEvalTurn.divideScalar(angle), angle).multiply(k0.quat);
}

// 振りかぶりの key までの間に、攻撃開始時の構えから滑らかに移る
function axePoseAt(def: AxeAttackDef, t: number, out: AxePose) {
  evalAxeAttack(def, t, axeTmp);
  const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
  out.pos.lerpVectors(axeFrom.pos, axeTmp.pos, w);
  out.quat.slerpQuaternions(axeFrom.quat, axeTmp.quat, w);
}

function applyAxePose(p: AxePose) {
  axeRest.position.copy(p.pos);
  axeRest.quaternion.copy(p.quat);
}

function startAxeAttack(def: AxeAttackDef) {
  axeFrom.pos.copy(axeCur.pos);
  axeFrom.quat.copy(axeCur.quat);
  axeAttack = def;
  axeRushTime = -1;
  if (def === AXE_RUSH) startAxeRush();
  axeSpinTime = Infinity; // 回している途中に振ったら、回すのはやめる
  axeTime = 0;
  axeQueued = false;
  axeFiredSwishes = 0;
  axeFiredGrips = 0;
  axeFiredKicks = 0;
  axeFiredImpact = false;
  axeFiredLunge = false;
  axeFiredGround = false;
  axeHitLanded = false;
  axeBite = 0;
  axePower = axeSpeedPower();
  axeHits.clear();
  axeStance = false;
  axeLastTrail = -Infinity;
  axeRibbon.cut();
  axeSlamRibbon.cut();
  axeSlamHold = 0;
  if (def.windKick) {
    kickVel.x += def.windKick[0] * DEG * 10;
    kickVel.y += def.windKick[1] * DEG * 10;
    kickVel.z += def.windKick[2] * DEG * 10;
  }
}

function chooseAxeAttack(): AxeAttackDef {
  if (player.sliding) return AXE_SWEEP;
  // ダッシュ中・ダッシュ直後は突進振り下ろし（空中では 1 回だけ）
  if ((player.dashTime > 0 || sinceDash < DASH_ATTACK_WINDOW) && !player.wallRunning && (player.onGround || !axeRushAirUsed)) return AXE_RUSH;
  // 空中の叩きつけは、打ち上げで跳び上がっている間だけ（1 回の打ち上げにつき 1 回）
  if (axeLaunchedAir && !player.onGround && !player.wallRunning) {
    axeLaunchedAir = false;
    return AXE_AIR;
  }
  const def = AXE_COMBO[axeComboStep];
  axeComboStep = (axeComboStep + 1) % AXE_COMBO.length;
  return def;
}

// ---- 吸い寄せ: 踏み込むとき、前にいる敵の方へ少しだけ引き寄せる ----
// 照準の近くにいる一番近い敵へ向けて、届く距離まで寄るぶんの速さを足す（足す速さには上限がある）。
// 敵の方へまっすぐ寄るので、少し外れた向きで振っても当たりやすい
const AXE_PULL_RANGE = 3.5; // 届く距離（AXE_REACH）より、さらにこれだけ先の敵まで引き寄せる (m)
const AXE_PULL_ANGLE = 35 * DEG; // 照準からこの角度の内側にいる敵だけ
const AXE_PULL_STOP = 0.6; // 届く距離のこの割合まで寄ったら、それ以上は引き寄せない
const AXE_PULL_GAIN = 2; // 残りの距離 1m あたりに足す速さ (m/s)
const AXE_PULL_MAX = 5; // 足す速さの上限 (m/s)
const axePullLook = new THREE.Vector3();
const axePullDir = new THREE.Vector3();
function pullTowardAxeTarget() {
  camera.getWorldDirection(axePullLook);
  axePullLook.y = 0;
  if (axePullLook.lengthSq() < 1e-6) return;
  axePullLook.normalize();
  let best: Enemy | null = null;
  let bestDist = AXE_REACH + AXE_PULL_RANGE + DUMMY_RADIUS;
  for (const e of enemies) {
    if (!e.alive || e.riseTime < RESPAWN_RISE_TIME) continue;
    if (Math.abs(e.root.position.y - position.y) > DUMMY_HEIGHT + 0.5) continue;
    axePullDir.set(e.root.position.x - position.x, 0, e.root.position.z - position.z);
    const d = axePullDir.length();
    if (d >= bestDist || d < 1e-4) continue;
    if (axePullDir.divideScalar(d).angleTo(axePullLook) > AXE_PULL_ANGLE) continue;
    best = e;
    bestDist = d;
  }
  if (!best) return;
  const gap = bestDist - DUMMY_RADIUS - AXE_REACH * AXE_PULL_STOP;
  if (gap <= 0) return;
  axePullDir.set(best.root.position.x - position.x, 0, best.root.position.z - position.z).normalize();
  // 今その向きへ出ている速さを差し引いて、足りないぶんだけ足す（ダッシュ中などに速くなりすぎないように）
  const want = Math.min(AXE_PULL_MAX, gap * AXE_PULL_GAIN);
  const along = velocity.x * axePullDir.x + velocity.z * axePullDir.z;
  const add = Math.max(0, want - Math.max(0, along) * 0.5);
  velocity.x += axePullDir.x * add;
  velocity.z += axePullDir.z * add;
}

// 敵を dir（水平）へ大きく吹き飛ばす（壁に当たれば叩きつけ）。速さは勢いに応じて増やす
function flingEnemy(dir: THREE.Vector3, speed: number, lift: number, power: number) {
  if (enemyHeld()) return;
  const m = AXE_POWER_LOW + (AXE_POWER_HIGH - AXE_POWER_LOW) * power;
  en.knockVel.copy(dir).multiplyScalar(speed * m / AXE_POWER_LOW);
  en.flung = true;
  en.airVel = Math.max(en.airVel, lift);
  en.vel.set(0, 0, 0);
  en.moving = false;
  en.spiked = false;
}

// 刃先の中ほどが敵を捉えた場所を当たりの位置にする
const AXE_HIT_EDGE = new THREE.Vector3(0.27, 0.93, 0); // 斧のローカル座標
const axeHitTip = new THREE.Vector3();
const axeSwing = new THREE.Vector3();
function axeEdgeAt(def: AxeAttackDef, t: number, out: THREE.Vector3) {
  axePoseAt(def, t, axeTmpHit);
  applyAxePose(axeTmpHit);
  heldAxeModel.updateWorldMatrix(true, false);
  return out.copy(AXE_HIT_EDGE).applyMatrix4(heldAxeModel.matrixWorld);
}
// 回しながらの斬りつけ: 届く範囲にいる敵（今の 1 周でまだ当てていないもの）すべてに軽く当てる
function tryAxeWheelHit(): boolean {
  let any = false;
  for (const e of enemies) {
    if (axeWheelHits.has(e)) continue;
    setEn(e);
    if (!inReachOf(AXE_REACH, AXE_HIT_ANGLE)) continue;
    if (!any) {
      camera.updateMatrixWorld();
      axeEdgeAt(AXE_RUSH, Math.max(0, axeTime - SWING_SAMPLE), axeSwing);
      axeSwing.subVectors(axeEdgeAt(AXE_RUSH, axeTime + SWING_SAMPLE, axeHitTip), axeSwing);
      axeEdgeAt(AXE_RUSH, axeTime, axeHitTip);
    }
    any = true;
    axeWheelHits.add(e);
    hitPointFromTip(axeHitTip, hitPoint);
    const hit = poweredAxeHit(AXE_WHEEL_HIT, axePower);
    applyDummyHit(hit, hitPoint, 'axe', axeSwing);
    if (!e.alive) continue;
    if (e.airY > 0.3) {
      e.airVel = Math.max(e.airVel, AXE_WHEEL_LIFT);
      e.spiked = false;
    }
    else knockEnemy(hitDir, hit.knock ?? DEFAULT_KNOCK);
  }
  if (any) {
    axeBite = AXE_BITE_TIME * 0.5;
    axeJoltVel.copy(axeSwing).transformDirection(camera.matrixWorldInverse).multiplyScalar(-AXE_JOLT_KICK * 0.5);
  }
  return any;
}

// 届く範囲にいる敵（今の攻撃でまだ当てていないもの）すべてに当てる
function tryAxeHit(def: AxeAttackDef): boolean {
  let any = false;
  const speedPower = axeSpeedPower();
  for (const e of enemies) {
    if (axeHits.has(e)) continue;
    setEn(e);
    if (!inReachOf(def.reach ?? AXE_REACH, AXE_HIT_ANGLE)) continue;
    if (!any) {
      camera.updateMatrixWorld();
      axeEdgeAt(def, Math.max(0, axeTime - SWING_SAMPLE), axeSwing);
      axeSwing.subVectors(axeEdgeAt(def, axeTime + SWING_SAMPLE, axeHitTip), axeSwing);
      axeEdgeAt(def, axeTime, axeHitTip);
    }
    any = true;
    axeHits.add(e);
    // 勢い: 振り始めと今の速さ、叩きつけなら敵の足元までの高さ
    // 突進振り下ろしは、突進の速さではなく出す前の速さで決める
    let power = def === AXE_RUSH ? axePower : Math.max(axePower, speedPower);
    if (!Number.isNaN(axeSmashFromY)) power = Math.max(power, axeFallPower(axeSmashFromY - e.root.position.y));
    hitPointFromTip(axeHitTip, hitPoint);
    const hit = poweredAxeHit(def, power);
    applyDummyHit(hit, hitPoint, 'axe', axeSwing);
    if (!e.alive) continue;
    // 打ち上げは真上へ飛ばし、振り下ろし（空中の叩きつけ・兜割り）は浮いている敵を床へ叩き落とすので、横へは吹き飛ばさない
    if (def === AXE_RUSH && e.airY > 0.3) flingEnemy(axeRushDir, AXE_FLING_SPEED, AXE_FLING_LIFT, power);
    else if (def === AXE_DRIVE) {
      camera.getWorldDirection(axeDriveDir);
      axeDriveDir.y = 0;
      if (axeDriveDir.lengthSq() < 1e-6) axeDriveDir.set(0, 0, -1);
      flingEnemy(axeDriveDir.normalize(), AXE_DRIVE_SPEED, AXE_DRIVE_LIFT, power);
    }
    else if ((def === AXE_AIR || def === AXE_KABUTO) && e.airY > 0.2) spikeEnemy();
    else if (def !== AXE_LAUNCH && def !== AXE_AIR) knockEnemy(hitDir, hit.knock ?? DEFAULT_KNOCK);
    if (def === AXE_LAUNCH) launchEnemy();
  }
  if (!any) return false;
  if (def === AXE_LAUNCH && player.onGround) { // 構えたまま跳んで空中で振ったときは、自分は跳び上がらない
    velocity.y = AXE_LAUNCH_SELF_SPEED;
    velocity.x *= AXE_LAUNCH_KEEP;
    velocity.z *= AXE_LAUNCH_KEEP;
    player.onGround = false;
    player.sliding = false;
    axeLaunchedAir = true;
  }
  // 刃が食い込んで振りが重くなり、手元は振っていた向きと逆へ跳ね返される
  axeBite = AXE_BITE_TIME;
  axeJoltVel.copy(axeSwing).transformDirection(camera.matrixWorldInverse).multiplyScalar(-AXE_JOLT_KICK);
  return true;
}

function startAxeRush() {
  axeRushTime = 0;
  axeWheelHits.clear();
  if (!player.onGround) axeRushAirUsed = true;
  camera.getWorldDirection(axeRushDir);
  axeRushDir.y = 0;
  if (axeRushDir.lengthSq() < 1e-6) axeRushDir.set(0, 0, -1);
  axeRushDir.normalize();
}
function endAxeRush() {
  axeRushTime = -1;
  const h = Math.hypot(velocity.x, velocity.z);
  if (h > AXE_RUSH_EXIT) {
    velocity.x *= AXE_RUSH_EXIT / h;
    velocity.z *= AXE_RUSH_EXIT / h;
  }
}
// 突進振り下ろしの、axeTime を進めた直後に呼ぶ。before は進める前の axeTime
// 突進している間: 照準の向きへ一定の速さで進み（空中では高さを保つ）、届く所に敵を捉えるか時間が来たらやめる。
// 回転の 1 周の間は、頭が前を通るたびに斬りつけ、突進が続いていれば 1 周の始まりへ戻って回し続ける
function updateAxeRush(dt: number, before: number) {
  if (axeRushTime >= 0) {
    axeRushTime += dt;
    camera.getWorldDirection(axeRushDir);
    axeRushDir.y = 0;
    if (axeRushDir.lengthSq() > 1e-6) axeRushDir.normalize();
    velocity.x = axeRushDir.x * AXE_RUSH_SPEED;
    velocity.z = axeRushDir.z * AXE_RUSH_SPEED;
    if (!player.onGround) velocity.y = Math.max(velocity.y, 0);
    let caught = axeRushTime >= AXE_RUSH_TIME;
    for (const e of enemies) {
      setEn(e);
      if (!caught && inReachOf(AXE_RUSH_REACH, AXE_HIT_ANGLE)) caught = true;
    }
    if (caught) endAxeRush();
  }
  if (before < AXE_WHEEL_CUT && axeTime >= AXE_WHEEL_CUT) {
    if (tryAxeWheelHit()) axeHitLanded = true;
    axeWheelHits.clear();
  }
  if (axeRushTime >= 0 && axeTime >= AXE_WHEEL_END) {
    const period = AXE_WHEEL_END - AXE_WHEEL_START;
    axeTime -= period;
    axeLastTrail -= period; // 軌跡を途切れさせずに続ける
    playSwish(AXE_WHEEL_SWISH, 'axe');
  }
}

function startAxeLaunch() {
  axeLaunchQueued = false;
  axeQueued = false;
  startAxeAttack(AXE_LAUNCH);
  axeStance = true; // 右クリックを押している間は振りかぶった所で構えておく
  axeCocked = false;
}

function updateAxeAttack(dt: number) {
  // 右クリック: 打ち上げ（地上だけ）
  if (axeLaunchPressed) {
    axeLaunchPressed = false;
    // ダッシュ中・ダッシュ直後なら突き飛ばし（地上でも空中でも）
    if (axeReady() && axeDashing() && !player.wallRunning && axeAttack !== AXE_DRIVE && axeSlamRecover <= 0) {
      if (!axeAttack || axeTime >= axeAttack.cancel) {
        axeLaunchQueued = false;
        startAxeAttack(AXE_DRIVE);
      }
    } else if (axeReady() && axeLaunchable() && axeAttack !== AXE_LAUNCH) {
      if (axeSlamRecover > 0) {
        axeLaunchQueued = true; // 硬直が解けたら出す
        axeQueued = false;
      } else if (!axeAttack || axeTime >= axeAttack.cancel) startAxeLaunch();
      else if (axeTime >= axeAttack.cancel - AXE_BUFFER) {
        axeLaunchQueued = true;
        axeQueued = false;
      }
    }
  }
  if (axePressed) {
    axePressed = false;
    if (axeReady()) {
      if (!axeAttack && axeSlamRecover <= 0) startAxeAttack(chooseAxeAttack());
      else if (!axeAttack) axeQueued = true; // 硬直が解けたら出す
      else if (axeTime >= axeAttack.cancel - AXE_BUFFER) {
        axeQueued = true;
        axeLaunchQueued = false;
      }
    }
  }

  if (axeAttack) {
    const def = axeAttack;
    // 食い込んでいる間は、振りの時間をゆっくり進める（急に元の速さへ戻ると引っかかって見えるので、なめらかに戻す）
    const axeTimeBefore = axeTime;
    const r = 1 - Math.max(0, axeBite) / AXE_BITE_TIME;
    axeBite -= dt;
    // 勢いがあるほど速く振る
    axeTime += dt * (AXE_BITE_SLOW + (1 - AXE_BITE_SLOW) * r * r * (3 - 2 * r)) * (1 + AXE_POWER_HASTE * axePower);
    // 打ち上げの構え: 押している間は振りかぶった所で止める。離したら、その瞬間の速さも勢いに数えて振り上げる
    if (axeStance) {
      if (throwHeld && controls.isLocked) {
        if (axeTime >= AXE_LAUNCH_COCK) {
          axeTime = AXE_LAUNCH_COCK;
          if (!axeCocked) {
            axeCocked = true;
            playGrip();
            addTrauma(0.06);
          }
        }
      } else {
        axeStance = false;
        axePower = Math.max(axePower, axeSpeedPower());
      }
    }

    if (def === AXE_RUSH) updateAxeRush(dt, axeTimeBefore);

    while (axeFiredSwishes < def.swishes.length && axeTime >= def.swishes[axeFiredSwishes].at) {
      playSwish(def.swishes[axeFiredSwishes++], 'axe');
    }
    const grips = def.grips ?? [];
    while (axeFiredGrips < grips.length && axeTime >= grips[axeFiredGrips]) {
      axeFiredGrips++;
      playGrip();
    }
    const kicks = def.kicks ?? [];
    while (axeFiredKicks < kicks.length && axeTime >= kicks[axeFiredKicks][0]) {
      const k = kicks[axeFiredKicks++][1];
      kickVel.x += k[0] * DEG * 10;
      kickVel.y += k[1] * DEG * 10;
      kickVel.z += k[2] * DEG * 10;
    }
    if (!axeFiredLunge && axeTime >= def.lungeAt) {
      axeFiredLunge = true;
      applyLunge(def.lunge);
      if (def !== AXE_AIR && def !== AXE_RUSH) pullTowardAxeTarget();
      if (def.drop && !player.onGround) {
        velocity.y = Math.min(velocity.y, -def.drop);
        axeSmashFromY = position.y; // 着地したらここからの高さで衝撃波を出す
      }
    }
    if (!axeFiredImpact && axeTime >= def.impact) {
      axeFiredImpact = true;
      kickVel.x += def.kick[0] * DEG * 22;
      kickVel.y += def.kick[1] * DEG * 22;
      kickVel.z += def.kick[2] * DEG * 22;
      addTrauma(0.1);
      fovKick += def.fovPunch ?? 0;
      landDipVel -= def.dip ?? 0;
      axeHitLanded = tryAxeHit(def);
    } else if (axeFiredImpact && def.hitUntil !== undefined && axeTime <= def.hitUntil) {
      // 落ちている途中で届いた敵にも、1 体ずつ当てていく
      if (tryAxeHit(def)) axeHitLanded = true;
    }
    // 空振りでも、足が着いていれば地面を叩いた重さを返す（空中の叩きつけは着地の衝撃波が代わりに返す）
    if (def.ground && !def.drop && axeFiredImpact && !axeFiredGround && !axeHitLanded && player.onGround
      && axeTime <= (def.hitUntil ?? def.impact) + 0.05) {
      axeFiredGround = true;
      sfx.playAxeGround(def.ground);
      addTrauma(0.25 * def.ground);
      landDipVel -= 1.2 * def.ground;
      kickVel.x -= 1.5 * DEG * 22 * def.ground;
    }

    if (axeLaunchQueued && axeTime >= def.cancel && axeSlamRecover <= 0) {
      if (axeLaunchable()) startAxeLaunch();
      else axeLaunchQueued = false;
    } else if (axeQueued && axeTime >= def.cancel && axeSlamRecover <= 0) {
      startAxeAttack(chooseAxeAttack());
    } else if (axeTime >= def.duration) {
      axeAttack = null;
      axeComboTimer = AXE_COMBO_RESET;
    }
  } else if (axeSlamRecover <= 0 && axeReady() && (axeQueued || axeLaunchQueued)) {
    // 硬直の間に押していた攻撃を、解けたら出す
    if (axeLaunchQueued && axeLaunchable()) startAxeLaunch();
    else if (axeQueued) startAxeAttack(chooseAxeAttack());
    axeQueued = axeLaunchQueued = false;
  } else if (axeComboTimer > 0) {
    axeComboTimer -= dt;
    if (axeComboTimer <= 0) axeComboStep = 0;
  }
  if (axeLaunchedAir && (player.onGround || player.wallRunning || shownWeapon !== 'axe' || grapple !== null)) axeLaunchedAir = false;
  if (player.onGround || player.wallRunning) axeRushAirUsed = false;
  // 叩きつけで落ちている途中に着地したら衝撃波（攻撃の時間が過ぎてから着いても出す）
  if (!Number.isNaN(axeSmashFromY)) {
    if (player.onGround) {
      axeShockwave(axeSmashFromY - position.y);
      axeSmashFromY = NaN;
      axeSlamRecover = AXE_SLAM_RECOVER;
    } else if (player.wallRunning || shownWeapon !== 'axe' || grapple !== null) {
      axeSmashFromY = NaN;
    }
  }
  // 持ち替えたら最初の段から
  if (shownWeapon !== 'axe') {
    axeAttack = null;
    axeComboStep = 0;
    axeStance = false;
    axeSpinTime = Infinity;
    axeLaunchQueued = false;
    axeRushTime = -1;
  }

  if (axeAttack) {
    sampleAxeTrail();
    axePoseAt(axeAttack, axeTime, axeCur);
    // 持ち上げた重さに耐えて、手元が小刻みに震える
    const strain = axeAttack.strain;
    if (strain && axeTime > strain[0] && axeTime < strain[1]) {
      const u = (axeTime - strain[0]) / (strain[1] - strain[0]);
      const a = 0.0025 * Math.sin(Math.PI * u) * (0.4 + 0.6 * u);
      axeCur.pos.x += Math.sin(axeTime * 61) * a;
      axeCur.pos.y += Math.sin(axeTime * 79 + 1.3) * a;
    }
    // 構えている間は、持ち上げた重さに耐えて手元が震え続ける（止まっている axeTime ではなく実時間で揺らす）
    if (axeStance && axeCocked) {
      const s = trailNow;
      axeCur.pos.x += Math.sin(s * 61) * AXE_STANCE_TREMBLE;
      axeCur.pos.y += Math.sin(s * 79 + 1.3) * AXE_STANCE_TREMBLE;
    }
  } else {
    axeCur.pos.set(0, 0, 0);
    axeCur.quat.copy(AXE_REST_QUAT);
    if (axeSpinTime < AXE_DASH_SPIN_TIME) {
      axeSpinTime += dt;
      const u = Math.min(1, axeSpinTime / AXE_DASH_SPIN_TIME);
      axeCur.quat.multiply(axeSpinQuat.setFromAxisAngle(AXE_Y, -Math.PI * 2 * easeOutCubic(u)));
    }
  }
  // 当たって跳ね返された手元を、ばねで戻す
  axeJoltVel.addScaledVector(axeJolt, -AXE_JOLT_STIFF * dt).multiplyScalar(Math.max(0, 1 - AXE_JOLT_DAMP * dt));
  axeJolt.addScaledVector(axeJoltVel, dt);
  axeRest.position.copy(axeCur.pos).add(axeJolt);
  axeRest.quaternion.copy(axeCur.quat);
  axeRibbon.update(trailNow);
  // 叩きつけの軌跡: 振り終えてから着地するまでは時計を止めて、振り下ろした弧を残したまま落ちる。
  // 着地すると時計が進み、衝撃と一緒に削れて消える
  const falling = axeAttack === AXE_AIR && axeTime >= AXE_AIR.trails[0][1] && !Number.isNaN(axeSmashFromY);
  if (falling && axeSlamHold < AXE_SLAM_TRAIL_HOLD) axeSlamHold += dt;
  else axeSlamClock += dt;
  axeSlamRibbon.update(axeSlamClock);
}

// 斧の軌跡: 刃先の端から端までの幅で残す。重い一撃なので剣より少し長く残す
const AXE_TRAIL_TIP = new THREE.Vector3(0.23, 1.1, 0); // 斧のローカル座標
const AXE_TRAIL_BASE = new THREE.Vector3(0.25, 0.7, 0); // 太い帯で重さを見せる
const axeRibbon = new Ribbon(200, 0.12, makeRibbonMaterial(AXE_RIBBON));
camera.add(axeRibbon.mesh);
// 空中の叩きつけだけは、刃先の外まで広げた太い帯を、長めに残す
const AXE_SLAM_TRAIL_TIP = new THREE.Vector3(0.23, 1.16, 0);
const AXE_SLAM_TRAIL_BASE = new THREE.Vector3(0.25, 0.6, 0);
const AXE_SLAM_TRAIL_LIFE = 0.2;
const AXE_SLAM_TRAIL_HOLD = 0.45; // 落ちている間に軌跡を止めておく最長の時間（着地しないまま残り続けないように）
const axeSlamRibbon = new Ribbon(200, AXE_SLAM_TRAIL_LIFE, makeRibbonMaterial(AXE_SLAM_RIBBON));
camera.add(axeSlamRibbon.mesh);
let axeSlamClock = 0; // 叩きつけの軌跡の時計（落ちている間は止める）
let axeSlamHold = 0; // 今の叩きつけで時計を止めていた時間
let axeLastTrail = -Infinity;
const axeTrailTip = new THREE.Vector3();
const axeTrailBase = new THREE.Vector3();
function pushAxeTrail(p: AxePose, time: number, slam: boolean) {
  applyAxePose(p);
  heldAxeModel.updateWorldMatrix(true, false);
  camera.worldToLocal(axeTrailTip.copy(slam ? AXE_SLAM_TRAIL_TIP : AXE_TRAIL_TIP).applyMatrix4(heldAxeModel.matrixWorld));
  camera.worldToLocal(axeTrailBase.copy(slam ? AXE_SLAM_TRAIL_BASE : AXE_TRAIL_BASE).applyMatrix4(heldAxeModel.matrixWorld));
  (slam ? axeSlamRibbon : axeRibbon).push(axeTrailTip, axeTrailBase, time);
}
function sampleAxeTrail() {
  const def = axeAttack;
  if (!def) return;
  for (const [from, to] of def.trails) {
    const end = Math.min(to, axeTime);
    for (let s = Math.max(from, axeLastTrail + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
      if (s - axeLastTrail > TRAIL_STEP * 1.5) axeRibbon.cut(); // 別の時間帯の軌跡とはつながない
      axePoseAt(def, s, axeTrailPose);
      if (def === AXE_AIR) pushAxeTrail(axeTrailPose, axeSlamClock - (axeTime - s), true);
      else pushAxeTrail(axeTrailPose, trailNow - (axeTime - s), false);
      axeLastTrail = s;
    }
  }
}

// ---- ハンドガンの射撃 ----
// 左クリックで 1 発ずつ撃つ。弾は銃口から照準の先へまっすぐ飛ぶ速い弾で、光の尾（曳光）を引く
const GUN_AMMO = 6;
const GUN_FIRE_INTERVAL = 0.26; // 連射の最短間隔。一発ごとの重さが伝わるよう、少し間を空ける
const BULLET_SPEED = 220; // m/s
const BULLET_RANGE = 250;
const TRACER_LEN = 3; // 光の尾の最大の長さ (m)
const TRACER_WIDTH = 0.012;
const MUZZLE_FLASH_LIFE = 0.06;
const GUN_RECOIL_HOLD = 0.035; // 跳ね上がった頂点で一瞬止める時間。重い一撃の「溜め」になる
const BULLET_HIT: HitDef = { kick: [-0.8, 0, 0], knock: 80, hitStop: 0.025, fx: 0.55 };

let gunAmmo = GUN_AMMO;
let gunCooldown = 0;
let gunRecoil = 0; // 撃った瞬間に 1 にして、頂点で一瞬止めてから重たく戻す
let gunRecoilHold = 0;
let fireQueued = false;
let reloadQueued = false;
let cylinderTarget = 0;
let cylinderSpin = 0; // 装填の最後に指で弾いて空回しする速さ (rad/s)
let muzzleFlashAge = Infinity;
const chamberLive = Array<boolean>(6).fill(true); // 薬室ごとに、まだ撃っていない弾が入っているか

const gunMuzzle = revolver.userData.muzzle as THREE.Object3D;
const gunCylinder = revolver.userData.cylinder as THREE.Group;
const gunCrane = revolver.userData.crane as THREE.Group;
const gunEjector = revolver.userData.ejectorRod as THREE.Mesh;
const chamberRounds = revolver.userData.chamberRounds as THREE.Group[];
const speedLoader = revolver.userData.loader as THREE.Group;
const loaderRounds = revolver.userData.loaderRounds as THREE.Group[];
const CYL_REAR = (revolver.userData.cylLen as number) / 2;
const EJECTOR_Z = gunEjector.position.z;
const CHAMBER_STEP = Math.PI / 3;
const gunReady = () => shownWeapon === 'handgun' && wantWeapon === 'handgun' && holster === 0;

// マズルフラッシュ: 銃口の正面に丸い光、銃身の向きに沿って前へ伸びる十字の光
function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,235,1)');
  grad.addColorStop(0.25, 'rgba(255,215,130,0.9)');
  grad.addColorStop(0.6, 'rgba(255,150,50,0.35)');
  grad.addColorStop(1, 'rgba(255,110,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const flashMat = new THREE.MeshBasicMaterial({
  map: makeFlashTexture(),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const muzzleFlash = new THREE.Group();
{
  muzzleFlash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), flashMat));
  for (const r of [0, Math.PI / 2]) {
    const long = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.2), flashMat);
    long.rotation.set(-Math.PI / 2, r, 0, 'ZXY'); // 長い向きを銃身（-Z）に合わせる
    long.position.z = -0.08;
    muzzleFlash.add(long);
  }
}
muzzleFlash.visible = false;
gunMuzzle.add(muzzleFlash);

interface Bullet {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  traveled: number;
  tail: number;
  hit: boolean;
  mesh: THREE.Mesh;
  parried?: boolean; // パリィで弾き返した弾（遅く太く白く飛び、当たると大きく効く）
  from?: Enemy; // 撃った敵（パリィで弾き返す先）
  deadEye?: boolean; // デッドアイで撃った弾
  // 撃った瞬間にクロスヘアが捉えていた敵と、そこまでの距離。銃口はクロスヘアから少しずれているので、
  // 体の縁を狙うと銃口からの線では体をかすめることがある。その所まで何にも当たらずに来たら、この敵に当てる
  aimEnemy?: Enemy;
  aimDist?: number;
}
const bullets: Bullet[] = [];
const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5); // 原点から +Z へ伸びる
const tracerMat = new THREE.MeshBasicMaterial({
  color: 0xffe0a0,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const TRACER_AXIS = new THREE.Vector3(0, 0, 1);
const bulletFrom = new THREE.Vector3();
const bulletAim = new THREE.Vector3();
const bulletBack = new THREE.Vector3();

// 照準の先で最初に当たる所（なければ射程の端）を out に入れ、当たる敵を返す。
// パッドでは照準のすぐ近くに敵がいれば胸を狙う
function findGunAim(out: THREE.Vector3): Enemy | null {
  const target = findAssistTarget();
  if (target && target.angle < target.size * ASSIST_SNAP) {
    out.copy(target.point);
    return target.enemy;
  }
  camera.getWorldDirection(throwDir);
  if (castThrow(camera.position, throwDir, BULLET_RANGE)) {
    out.copy(castHit.point);
    return castHit.enemy;
  }
  out.copy(camera.position).addScaledVector(throwDir, BULLET_RANGE);
  return null;
}

// at を渡すとそこへ向けて撃つ（デッドアイ。target はその敵）。省くと照準の先へ
function fireGun(at?: THREE.Vector3, target?: Enemy) {
  // 回している途中でも、撃てば即座に構え直す
  if (twirlT >= 0) endTwirl(false);
  endSlideSpin();
  slideSpinHold = SLIDE_SPIN_HOLD;
  gunAmmo--;
  gunCooldown = GUN_FIRE_INTERVAL;

  // 画面のクロスヘアは揺れと反動を足した向きを指しているので、狙いも銃口もその向きで求める
  applyCameraOffset();
  camera.updateMatrixWorld(true);
  bulletFrom.setFromMatrixPosition(gunMuzzle.matrixWorld);
  let aimEnemy: Enemy | null = target ?? null;
  if (at) bulletAim.copy(at);
  else aimEnemy = findGunAim(bulletAim);
  camera.quaternion.copy(savedQuat);
  camera.updateMatrixWorld(true);
  const aimDist = bulletFrom.distanceTo(bulletAim);
  const dir = bulletAim.sub(bulletFrom).normalize().clone();
  const mesh = new THREE.Mesh(tracerGeo, tracerMat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  bullets.push({
    pos: bulletFrom.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, deadEye: !!at,
    aimEnemy: aimEnemy ?? undefined, aimDist,
  });

  // 反動: 銃を跳ね上げ、視点も少し上へ蹴る
  gunRecoil = 1;
  gunRecoilHold = GUN_RECOIL_HOLD;
  kickVel.x += 3.6 * DEG * 22;
  kickVel.y += (Math.random() - 0.5) * 0.8 * DEG * 22;
  addTrauma(0.13);
  fovKick = Math.max(fovKick, 3);

  muzzleFlashAge = 0;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  muzzleFlash.scale.setScalar(1.1 + Math.random() * 0.4);
  // 銃身の真後ろ（いちばん上）にある薬室を撃ったことにして、次の薬室へ回す
  const top = (((-Math.round(cylinderTarget / CHAMBER_STEP)) % 6) + 6) % 6;
  chamberLive[top] = false;
  cylinderTarget += CHAMBER_STEP;
  sfx.playGunshot();
}

// ---- 装填 ----
// 手首を返してシリンダーを振り出す → 銃口を上へ向けてエジェクターロッドを押し、薬莢をまとめて落とす
// → 銃口を下へ向けてスピードローダーで 6 発を一度に差し込む → シリンダーを指で弾いて空回しし、
// 手首のスナップで閉じる
interface GunKey { t: number; pos: V3; rot: V3; ease?: Ease } // pos: 構えからのずれ (m)、rot: 上下・左右・傾き（度）
const RELOAD_KEYS = [
  { t: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
  { t: 0.12, pos: [-0.03, 0.01, 0.01], rot: [10, 8, 42] }, // 傾けながら振り出す
  { t: 0.24, pos: [-0.04, 0.015, 0], rot: [18, 10, 52] },
  { t: 0.36, pos: [-0.05, 0.045, 0.02], rot: [72, 10, 22] }, // 銃口を上へ
  { t: 0.5, pos: [-0.05, 0.05, 0.02], rot: [76, 10, 20] },
  { t: 0.64, pos: [-0.06, -0.02, -0.01], rot: [-42, 15, 34] }, // 銃口を下へ
  { t: 0.84, pos: [-0.06, -0.026, -0.01], rot: [-48, 15, 34] },
  { t: 0.88, pos: [-0.06, -0.035, -0.01], rot: [-52, 15, 34] }, // 差し込んだ勢いで沈む
  { t: 1.0, pos: [-0.045, 0, 0], rot: [-5, 10, 46] },
  { t: 1.1, pos: [-0.015, 0.012, 0], rot: [6, 3, -8] }, // スナップで閉じる
  { t: 1.32, pos: [0, 0, 0], rot: [0, 0, 0] },
].map((k): { t: number; pos: THREE.Vector3; rot: THREE.Vector3; ease: Ease } => ({
  t: k.t,
  pos: new THREE.Vector3(...(k.pos as V3)),
  rot: new THREE.Vector3(...(k.rot as V3)),
  ease: (k as GunKey).ease ?? easeInOutCubic,
}));
const GUN_RELOAD_TIME = RELOAD_KEYS[RELOAD_KEYS.length - 1].t;
const CRANE_OPEN = 105 * DEG;

// 装填の途中で一度だけ起こす出来事（時間順）
const RELOAD_EVENTS: { at: number; fn: () => void }[] = [
  { at: 0.13, fn: onCraneOpen },
  { at: 0.42, fn: ejectCasings },
  { at: 0.84, fn: seatSpeedLoader },
  { at: 0.88, fn: sfx.playLoaderRelease }, // つまみをひねって弾を放す
  { at: 0.95, fn: spinCylinder },
  { at: 1.06, fn: onCraneClose },
  { at: 1.12, fn: startTwirl }, // 閉じたスナップの勢いのまま、トリガーを軸に縦に一回転
];

// ---- 装填後のガンスピン ----
// 銃口を下へ振り出すように素早く回し始め、一周したところで少し行き過ぎてから握りに収める
const TWIRL_TIME = 0.5;
const DASH_TWIRL_TIME = 0.38;
let twirlT = -1; // 回している間の経過時間。負なら回していない
let twirlDuration = TWIRL_TIME;
function startTwirl(duration = TWIRL_TIME) {
  twirlT = 0;
  twirlDuration = duration;
  // 速く回すほど風切り音も短く高く
  const k = TWIRL_TIME / duration;
  playSwish({ at: 0, dur: 0.32 / k, f0: 500 * k, f1: 1700 * k, gain: 0.12 }, 'gun');
}
function updateTwirl(dt: number) {
  if (twirlT < 0) return;
  twirlT += dt;
  const u = Math.min(1, twirlT / twirlDuration);
  twirlAngle = -Math.PI * 2 * easeOutBack(u);
  // 回している間は銃を少し持ち上げて前へ出し、指先で回している感じを出す
  const lift = Math.sin(u * Math.PI);
  gunSpin.position.set(0, lift * 0.015, -lift * 0.01);
  if (u >= 1) endTwirl(true);
}
// ---- スライディング中のガンスピン ----
// 滑っている間はトリガーに掛けた指を軸に水平にくるくる回し続け、滑り終えたら勢いのまま
// 次の一周の所まで回って、少し行き過ぎてから握りに収める
const SLIDE_SPIN_SPEED = 17; // rad/s（約 2.7 回転/秒）
const SLIDE_SPIN_HOLD = 0.5; // 撃った後、この時間は回し始めない（撃ちながら滑れるように）
const SLIDE_SPIN_SWISH: SwishDef = { at: 0, dur: 0.12, f0: 700, f1: 1500, gain: 0.05 };
const TAU = Math.PI * 2;
let slideSpin = 0; // 回した角度
let slideSpinVel = 0;
let slideSpinHold = 0;
let slideSpinTarget = NaN; // 回し終えて止める角度（滑っている間は未定）
let twirlAngle = 0; // 装填後の縦回転の角度
// 回すときは銃を横倒しに寝かせる（左の側面が上、グリップが画面の内側）。
// 寝かせるとトリガーに掛けた指が縦になるので、水平の回転がそのまま指を軸にした回転になる
const SLIDE_LAY_ANGLE = -90 * DEG;
let slideLay = 0; // 0 = 構え, 1 = 寝かせきった
const gunSpinQuat = new THREE.Quaternion();
const gunSpinTmp = new THREE.Quaternion();
const gunSpinEuler = new THREE.Euler();
function applyGunSpin(dt: number) {
  const laying = slideSpinVel !== 0 && Number.isNaN(slideSpinTarget); // 回している間は寝かせ、収めながら起こす
  slideLay += ((laying ? 1 : 0) - slideLay) * Math.min(1, dt * (laying ? 16 : 10));
  // 水平の回転 → 寝かせ → 縦回転 の順に重ねる
  gunSpinQuat.setFromEuler(gunSpinEuler.set(0, slideSpin, 0));
  gunSpinQuat.multiply(gunSpinTmp.setFromEuler(gunSpinEuler.set(0, 0, SLIDE_LAY_ANGLE * slideLay)));
  gunSpinQuat.multiply(gunSpinTmp.setFromEuler(gunSpinEuler.set(twirlAngle, 0, 0)));
  gunSpin.quaternion.copy(gunSpinQuat);
}
function updateSlideSpin(dt: number) {
  slideSpinHold = Math.max(0, slideSpinHold - dt);
  const spinning = player.sliding && gunReady() && !gunReloading && twirlT < 0 && slideSpinHold <= 0;
  if (spinning) {
    slideSpinVel += (SLIDE_SPIN_SPEED - slideSpinVel) * Math.min(1, dt * 12);
    slideSpinTarget = NaN;
  } else if (slideSpin !== 0 || slideSpinVel !== 0) {
    // 勢いで届く先の一周の所へ、ばねで引き寄せる（少し行き過ぎて戻る）。
    // 行き過ぎたときに次の一周を狙い直さないよう、止める所は回し終えた瞬間に決める
    if (Number.isNaN(slideSpinTarget)) slideSpinTarget = Math.ceil((slideSpin + slideSpinVel * 0.12) / TAU) * TAU;
    const target = slideSpinTarget;
    slideSpinVel += ((target - slideSpin) * 500 - slideSpinVel * 28) * dt;
    if (Math.abs(target - slideSpin) < 0.005 && Math.abs(slideSpinVel) < 0.2) {
      endSlideSpin();
      playRing(1.3, 0.35, 0.04); // 握りに収まった「パシッ」
      return;
    }
  } else {
    return;
  }
  const prev = slideSpin;
  slideSpin += slideSpinVel * dt;
  // 半周ごとに小さな風切り音
  if (spinning && Math.floor(slideSpin / Math.PI) > Math.floor(prev / Math.PI)) playSwish(SLIDE_SPIN_SWISH, 'gun');
}
function endSlideSpin() {
  slideSpin = 0;
  slideSpinVel = 0;
  slideSpinTarget = NaN;
  slideLay = 0; // 撃ったときは寝かせた銃もすぐ起こす
}

function endTwirl(caught: boolean) {
  twirlT = -1;
  twirlAngle = 0;
  gunSpin.position.set(0, 0, 0);
  if (caught) {
    playRing(1.3, 0.35, 0.04); // 握りに収まった「パシッ」
    kickVel.x -= 0.6 * DEG * 22;
  }
}

let gunReloading = false;
let gunReloadT = 0;
let reloadEvent = 0;
const reloadPosOff = new THREE.Vector3();
const reloadRotOff = new THREE.Vector3();

const ramp = (t: number, a: number, b: number, ease: Ease = easeInOutCubic) => ease(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));

function evalReloadPose(t: number) {
  const keys = RELOAD_KEYS;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const e = k0.ease(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
  const kPrev = keys[Math.max(0, i - 1)];
  const kNext = keys[Math.min(keys.length - 1, i + 2)];
  catmullRom(kPrev.pos, k0.pos, k1.pos, kNext.pos, e, reloadPosOff);
  catmullRom(kPrev.rot, k0.rot, k1.rot, kNext.rot, e, reloadRotOff);
}

// 装填の時間 t に合わせて、クレーン・エジェクター・スピードローダーを動かす
function poseReloadParts(t: number) {
  const swing = ramp(t, 0.1, 0.22, easeOutBack) - ramp(t, 1.0, 1.07, easeInQuad);
  gunCrane.rotation.z = swing * CRANE_OPEN;

  const eject = ramp(t, 0.38, 0.42, easeOutCubic) - ramp(t, 0.46, 0.58);
  gunEjector.position.z = EJECTOR_Z + eject * 0.022;
  for (const r of chamberRounds) r.position.z = CYL_REAR + eject * 0.022;

  const inT = ramp(t, 0.6, 0.84, easeOutCubic);
  const outT = ramp(t, 0.9, 1.04, easeInQuad);
  speedLoader.visible = t > 0.6 && t < 1.04;
  speedLoader.position.z = CYL_REAR + (1 - inT) * 0.07 + outT * 0.12;
  speedLoader.position.x = gunCylinder.position.x + (1 - inT) * 0.015;
  speedLoader.rotation.z = gunCylinder.rotation.z + ramp(t, 0.86, 0.9) * 0.5;
}

function startReload() {
  gunReloading = true;
  gunReloadT = 0;
  reloadEvent = 0;
  fireQueued = false;
  for (const r of loaderRounds) r.visible = true;
}

function endReload() {
  gunReloading = false;
  reloadPosOff.set(0, 0, 0);
  reloadRotOff.set(0, 0, 0);
  poseReloadParts(0);
  speedLoader.visible = false;
  if (cylinderSpin > 0) {
    cylinderSpin = 0;
    cylinderTarget = Math.ceil(gunCylinder.rotation.z / CHAMBER_STEP) * CHAMBER_STEP;
  }
}

function onCraneOpen() {
  sfx.playCraneOpen();
  kickVel.z += 1.2 * DEG * 22;
}

// エジェクターロッドで押し出した薬莢を、今の位置と向きのまま世界へ放り出す
const casingPos = new THREE.Vector3();
const casingQuat = new THREE.Quaternion();
const casingScale = new THREE.Vector3();
const gunBack = new THREE.Vector3();
function ejectCasings() {
  revolver.updateWorldMatrix(true, true);
  gunBack.set(0, 0, 1).transformDirection(revolver.matrixWorld); // 銃の後ろ向き（今は真下に近い）
  for (const [i, r] of chamberRounds.entries()) {
    r.matrixWorld.decompose(casingPos, casingQuat, casingScale);
    const vel = gunBack.clone().multiplyScalar(1.2 + Math.random() * 0.8).add(velocity);
    vel.x += (Math.random() - 0.5) * 0.6;
    vel.z += (Math.random() - 0.5) * 0.6;
    spawnCasing(chamberLive[i], casingPos, casingQuat, vel);
    r.visible = false;
  }
  gunAmmo = 0;
  sfx.playEject();
  kickVel.x += 0.8 * DEG * 22;
}

function seatSpeedLoader() {
  for (const [i, r] of chamberRounds.entries()) {
    r.visible = true;
    chamberLive[i] = true;
  }
  for (const r of loaderRounds) r.visible = false;
  gunAmmo = GUN_AMMO;
  sfx.playSeat();
  kickVel.x -= 1 * DEG * 22;
}

// 指で弾いてシリンダーを空回しする（ラチェットのカリカリ音つき）
function spinCylinder() {
  cylinderSpin = 32;
  sfx.playCylinderSpin();
}

function onCraneClose() {
  // 閉じた瞬間に空回しを止め、次の薬室の位置にぴたりと合わせる
  cylinderSpin = 0;
  cylinderTarget = Math.ceil(gunCylinder.rotation.z / CHAMBER_STEP) * CHAMBER_STEP;
  sfx.playCraneClose();
  kickVel.z -= 2 * DEG * 22;
  addTrauma(0.04);
}

// ---- デッドアイ ----
// 居合と同じゲージを使う。右クリック（ZL）を押している間は時間が遅くなり、照準でなぞった敵に印を付ける（残弾の数まで）。
// 同じ敵に照準を留めていれば印を重ねる。離すか、撃つか、弾の数だけ付けると、印へ視点を振りながら一気に撃ち抜く
const DEADEYE_MAX = 3; // 印を付けていられる長さ（実時間の秒）。過ぎると撃つ
const DEADEYE_RANGE = 60;
const DEADEYE_RESTACK = 0.22; // 同じ敵に照準を留めたとき、次の印を重ねるまで（実時間）
const DEADEYE_FULL_DELAY = 0.15; // 弾の数だけ付けたら、この間をおいて撃ち始める（実時間）
const DEADEYE_SHOT_GAP = 0.09; // 撃つ間隔（実時間）。間に次の印へ視点を振る
const DEADEYE_AFTER = 0.3; // 撃ち終えてからスローを解くまで（実時間）
const DEADEYE_ZOOM = 8; // 印を付けている間に狭める視野（度）
const DEADEYE_TURN = 30; // 次の印へ視点を寄せる速さ (1/s)
const DEADEYE_STACK_OFFSET = 9; // 同じ敵に重ねた印を、画面上でずらす量 (px)
const DEADEYE_HIT: HitDef = { kick: [-1, 0, 0], knock: 120, hitStop: 0.03, fx: 1 };

interface DeadEyeMark { enemy: Enemy; local: THREE.Vector3; el: HTMLElement; done: boolean; stack: number }
let deadEye: 'off' | 'mark' | 'fire' | 'after' = 'off';
let deadEyePressed = false; // 右クリックを押した瞬間
let deadEyeT = 0; // 今の段に入ってからの時間（実時間）
let deadEyeFullT = 0;
let deadEyeBlend = 0; // 画面を暗くし、視野を狭める効き (0〜1)
let deadEyeOver: Enemy | null = null; // 照準が今乗っている敵
let deadEyeDwell = 0;
const deadEyeMarks: DeadEyeMark[] = [];
const deadEyeLook = new THREE.Vector3();
const deadEyeAt = new THREE.Vector3();
const deadEyeScreen = new THREE.Vector3();

function startDeadEye() {
  deadEye = 'mark';
  deadEyeT = deadEyeFullT = deadEyeDwell = 0;
  deadEyeOver = null;
  if (twirlT >= 0) endTwirl(false);
  endSlideSpin();
  sfx.playDeadEyeStart();
}

function endDeadEye() {
  deadEye = 'off';
  for (const m of deadEyeMarks) m.el.remove();
  deadEyeMarks.length = 0;
}

function addDeadEyeMark(e: Enemy, at: THREE.Vector3) {
  e.root.updateMatrixWorld();
  const el = document.createElement('div');
  el.className = 'deadeye-mark';
  el.innerHTML =
    '<svg viewBox="0 0 20 20"><path class="br" d="M-9 0 V-9 H0 M20 -9 H29 V0 M29 20 V29 H20 M0 29 H-9 V20" />' +
    '<path class="x" d="M4 4 L16 16 M16 4 L4 16" /></svg>';
  document.body.appendChild(el);
  // ずらし量は付けた時に決めておく（先の印を撃って消しても、残りの印が跳ばないように）
  const stack = deadEyeMarks.filter((m) => !m.done && m.enemy === e).length;
  deadEyeMarks.push({ enemy: e, local: e.root.worldToLocal(at.clone()), el, done: false, stack });
  sfx.playDeadEyeMark(deadEyeMarks.length);
}

const markWorld = (m: DeadEyeMark, out: THREE.Vector3) => m.enemy.root.localToWorld(out.copy(m.local));

// 照準の先の敵に印を付ける。パッドでは照準のすぐ近くの敵の胸にも付ける
function markUnderCrosshair() {
  camera.getWorldDirection(deadEyeLook);
  let e: Enemy | null = null;
  if (castThrow(camera.position, deadEyeLook, DEADEYE_RANGE) && castHit.enemy) {
    e = castHit.enemy;
    deadEyeAt.copy(castHit.point);
  } else {
    const t = findAssistTarget();
    if (t && t.angle < t.size * ASSIST_SNAP) {
      e = t.enemy;
      deadEyeAt.copy(t.point);
    }
  }
  if (e !== deadEyeOver) {
    deadEyeOver = e;
    deadEyeDwell = 0;
    if (e) addDeadEyeMark(e, deadEyeAt);
  } else if (e) {
    deadEyeDwell += realDt;
    if (deadEyeDwell >= DEADEYE_RESTACK) {
      deadEyeDwell = 0;
      addDeadEyeMark(e, deadEyeAt);
    }
  }
}

// 視点を at へ寄せる（居合の突進と同じやり方）
function turnViewTo(at: THREE.Vector3, k: number) {
  lockTo.subVectors(at, camera.position);
  lookEuler.setFromQuaternion(camera.quaternion);
  const yaw = Math.atan2(-lockTo.x, -lockTo.z);
  lookEuler.y += wrapAngle(yaw - lookEuler.y) * k;
  lookEuler.x += (Math.atan2(lockTo.y, Math.hypot(lockTo.x, lockTo.z)) - lookEuler.x) * k;
  lookEuler.z = 0;
  camera.quaternion.setFromEuler(lookEuler);
}

// 実時間で進める。updateGun の頭で呼ぶ（クリックを普段の射撃より先に拾う）
function updateDeadEye() {
  const pressed = deadEyePressed;
  deadEyePressed = false;
  if (deadEye !== 'off' && (!gunReady() || !controls.isLocked || playerHp <= 0)) endDeadEye();

  if (deadEye === 'off') {
    if (pressed && gunReady() && !gunReloading && controls.isLocked) {
      if (focusCharge >= 1 && gunAmmo > 0) startDeadEye();
      else {
        focusEmptyFlash = FOCUS_EMPTY_FLASH;
        playRing(0.5, 0.25, 0.04); // 溜まっていない鈍い「カッ」
      }
    }
  } else if (deadEye === 'mark') {
    deadEyeT += realDt;
    const left = deadEyeMarks.length < gunAmmo;
    if (left) markUnderCrosshair();
    else deadEyeFullT += realDt;
    if (fireQueued || !throwHeld || deadEyeT >= DEADEYE_MAX || deadEyeFullT >= DEADEYE_FULL_DELAY) {
      if (deadEyeMarks.length === 0) endDeadEye(); // 1 つも付けずに離したら、ゲージは減らさない
      else {
        deadEye = 'fire';
        deadEyeT = DEADEYE_SHOT_GAP * 0.5; // 最初の 1 発は少し早く
        focusCharge = 0;
        sfx.playDeadEyeFire();
      }
    }
  } else if (deadEye === 'fire') {
    // 先の弾で倒した敵に残った印は飛ばす
    const m = deadEyeMarks.find((d) => !d.done && d.enemy.alive);
    if (!m) {
      deadEye = 'after';
      deadEyeT = 0;
    } else {
      markWorld(m, deadEyeAt);
      turnViewTo(deadEyeAt, 1 - Math.exp(-realDt * DEADEYE_TURN));
      deadEyeT += realDt;
      if (deadEyeT >= DEADEYE_SHOT_GAP && gunAmmo > 0) {
        deadEyeT = 0;
        m.done = true;
        m.el.remove();
        fireGun(deadEyeAt, m.enemy);
      }
    }
  } else {
    deadEyeT += realDt;
    if (deadEyeT >= DEADEYE_AFTER) endDeadEye();
  }
  // 印を付けている間と撃っている間は、普段の射撃と装填を受け付けない
  if (deadEye !== 'off') fireQueued = reloadQueued = false;

  const on = deadEye === 'mark' || deadEye === 'fire';
  deadEyeBlend += ((on ? 1 : 0) - deadEyeBlend) * Math.min(1, realDt * (on ? 8 : 6));
}

// 印を敵の体に重ねる。同じ敵に重ねた印は少しずつずらす。
// 揺れと反動を足したカメラで描くので、applyCameraOffset の後に呼ぶ（でないと撃つたびに印が敵からずれる）
function placeDeadEyeMarks() {
  camera.updateMatrixWorld();
  for (const m of deadEyeMarks) {
    if (m.done) continue;
    if (!m.enemy.alive) {
      m.done = true;
      m.el.remove();
      continue;
    }
    deadEyeScreen.copy(markWorld(m, deadEyeAt)).project(camera);
    m.el.style.display = deadEyeScreen.z > 1 ? 'none' : '';
    const x = ((deadEyeScreen.x + 1) / 2) * window.innerWidth + m.stack * DEADEYE_STACK_OFFSET;
    const y = ((1 - deadEyeScreen.y) / 2) * window.innerHeight + m.stack * DEADEYE_STACK_OFFSET;
    m.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}

// ---- 落ちた薬莢 ----
const CASING_MAX = 48;
const CASING_LIFE = 8;
const CASING_GRAVITY = 15;
const CASING_RADIUS = 0.005;
interface Casing { mesh: THREE.Group; vel: THREE.Vector3; spin: THREE.Vector3; age: number; bounces: number }
const casings: Casing[] = [];
function spawnCasing(live: boolean, at: THREE.Vector3, quat: THREE.Quaternion, vel: THREE.Vector3) {
  const mesh = createRound(weaponMats, live);
  mesh.position.copy(at);
  mesh.quaternion.copy(quat);
  scene.add(mesh);
  const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30);
  casings.push({ mesh, vel, spin, age: 0, bounces: 0 });
  if (casings.length > CASING_MAX) casings.shift()!.mesh.removeFromParent();
}

const casingEuler = new THREE.Euler();
const casingRot = new THREE.Quaternion();
function updateCasings(dt: number) {
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i];
    c.age += dt;
    if (c.age > CASING_LIFE) {
      c.mesh.removeFromParent();
      casings.splice(i, 1);
      continue;
    }
    if (c.bounces >= 4 && c.vel.lengthSq() < 0.01) continue; // 転がり終えたら止める
    c.vel.y -= CASING_GRAVITY * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.quaternion.premultiply(casingRot.setFromEuler(casingEuler.set(c.spin.x * dt, c.spin.y * dt, c.spin.z * dt)));
    const p = c.mesh.position;
    const floor = floorAt(p.x, p.z, p.y) + CASING_RADIUS;
    if (p.y < floor) {
      p.y = floor;
      const impact = -c.vel.y;
      c.vel.y = impact * 0.35;
      c.vel.x *= 0.6;
      c.vel.z *= 0.6;
      c.spin.multiplyScalar(0.6);
      if (c.bounces < 3 && impact > 0.8) {
        // 跳ねるたびに小さく「チン」。遠いほど小さく
        const near = THREE.MathUtils.clamp(2 / Math.max(p.distanceTo(camera.position), 0.5), 0, 1);
        sfx.playCasing(near * Math.min(1, impact / 3));
      }
      c.bounces++;
      if (c.bounces >= 4) {
        c.vel.set(0, 0, 0);
        // 最後は横倒しに寝かせる
        c.mesh.quaternion.setFromEuler(casingEuler.set(Math.PI / 2, Math.random() * Math.PI * 2, 0, 'YXZ'));
      }
    }
  }
}

function updateBullets(dt: number) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const step = (b.parried ? PARRY_RETURN_SPEED : BULLET_SPEED) * dt;
    const maxTail = b.parried ? PARRY_TRACER_LEN : TRACER_LEN;
    if (b.hit) {
      // 当たった後は、頭を当たった所に止めたまま尾だけを縮めて消す
      b.tail -= step;
    } else if (b.traveled >= BULLET_RANGE) {
      b.tail -= step;
      b.pos.addScaledVector(b.dir, step);
    } else if (castThrow(b.pos, b.dir, step)) {
      b.hit = true;
      const moved = b.pos.distanceTo(castHit.point);
      b.tail = Math.min(maxTail, b.tail + moved);
      b.pos.copy(castHit.point);
      onBulletHit(castHit.point, b.dir, castHit.enemy, b.parried, b.deadEye);
    } else if (b.aimEnemy?.alive && b.traveled + step >= b.aimDist!) {
      // 狙った所まで来た: クロスヘアが捉えていた敵に当てる
      b.hit = true;
      const moved = b.aimDist! - b.traveled;
      b.tail = Math.min(maxTail, b.tail + moved);
      b.pos.addScaledVector(b.dir, moved);
      onBulletHit(b.pos.clone(), b.dir, b.aimEnemy, b.parried, b.deadEye);
    } else {
      b.pos.addScaledVector(b.dir, step);
      b.traveled += step;
      b.tail = Math.min(maxTail, b.tail + step);
    }
    if (b.tail <= 0) {
      b.mesh.removeFromParent();
      bullets.splice(i, 1);
      continue;
    }
    // 尾は頭から後ろへ伸ばす
    b.mesh.position.copy(b.pos);
    b.mesh.quaternion.setFromUnitVectors(TRACER_AXIS, bulletBack.copy(b.dir).negate());
    const width = b.parried ? PARRY_TRACER_WIDTH : TRACER_WIDTH;
    b.mesh.scale.set(width, width, b.tail);
  }
}

function onBulletHit(at: THREE.Vector3, dir: THREE.Vector3, onDummy: Enemy | null, parried = false, deadEyeShot = false) {
  if (onDummy) {
    setEn(onDummy);
    hitDir.set(dir.x, 0, dir.z);
    if (hitDir.lengthSq() < 1e-6) hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
    hitDir.normalize();
    applyDummyHit(parried ? PARRY_RETURN_HIT : deadEyeShot ? DEADEYE_HIT : BULLET_HIT, at, 'bullet');
    if (parried) parryReturnAge = 0;
  } else {
    // 壁や地面: 火花を散らして小さく「チュン」
    spawnSparks(at, dir, 6 + Math.floor(Math.random() * 4), 0.6, 0.5);
    sfx.playRicochet();
  }
}

// ---- 敵の射撃 ----
// 敵は体ごとプレイヤーの方へゆっくり向き直り、追いきれない分を銃と両腕で振って狙う。
// 狙いは少し遅れてついてくるので、動き続けていれば外れる。銃口が狙いに収まったら一定の間隔で撃つ。
// 弾は自分の銃より遅く、光の尾がはっきり見えるので、見てからかわせる
const ENEMY_TURN_RATE = 3; // 体が向き直る速さ（残りの角度に掛ける割合 /s）
const ENEMY_TURN_MAX = 2.5; // 体が向き直る最高の角速度 (rad/s)
const ENEMY_AIM_RATE = 6; // 銃が狙いへ追いつく速さ（大きいほど遅れが小さい）
const ENEMY_AIM_YAW_MAX = 40 * DEG;
const ENEMY_AIM_PITCH_MAX = 40 * DEG;
const ENEMY_GUN_Y = 1.6; // 銃を構えている高さ（狙いの上下の角度の基準）
const ENEMY_FIRST_SHOT = 1.2; // 現れてから最初に撃つまで
const ENEMY_FIRE_MIN = 1.1; // 撃つ間隔
const ENEMY_FIRE_MAX = 1.8;
const ENEMY_FIRE_CONE = 5 * DEG; // 銃口の向きと狙いのずれがこれ以内なら撃つ
const ENEMY_SPREAD = 0.8 * DEG;
const ENEMY_STAGGER_LIMIT = 0.12; // 銃がこれ以上跳ね上がっている間（よろめいている間）は撃たない (rad)
const ENEMY_LEAN_LIMIT = 6 * DEG; // 上体がこれ以上反っている間も撃たない
const ENEMY_RECOIL = 3.5; // 撃ったときに銃口を跳ね上げる角速度
const ENEMY_BULLET_SPEED = 40; // m/s
const ENEMY_BULLET_RANGE = 120;
const ENEMY_BULLET_DAMAGE = 12;
const ENEMY_TRACER_LEN = 2.2;
const ENEMY_TRACER_WIDTH = 0.022;
const ENEMY_HIT_RADIUS = PLAYER_RADIUS * 0.8;
const ENEMY_FLASH_SCALE = 2; // 遠くからでも見えるよう、マズルフラッシュを大きくする
const ENEMY_BRACE_TIME = 0.4; // 撃つこの時間前から構え始める
const ENEMY_BRACE_RATE = 9; // 構えへ近づく速さ（解くときはこの半分）
const ENEMY_BRACE_READY = 0.8; // 構えがここまで進むまでは撃たない

const enemyTracerMat = new THREE.MeshBasicMaterial({
  color: 0xffb080,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const enemyBullets: Bullet[] = [];
const enemyTarget = new THREE.Vector3();
const enemyFrom = new THREE.Vector3();
const enemyFwd = new THREE.Vector3();
const enemyTo = new THREE.Vector3();
const enemyNext = new THREE.Vector3();
const enemyOnPath = new THREE.Vector3();
const enemyOnBody = new THREE.Vector3();
const enemyPath = new THREE.Line3();
const enemyBody = new THREE.Line3();
const enemyPan = new THREE.Vector3();

const wrapAngle = (a: number) => THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
// 狙う所: プレイヤーの胸
function aimTarget(out: THREE.Vector3) {
  return out.set(position.x, position.y + player.eyeHeight - 0.35, position.z);
}

function updateDummyAim(dt: number) {
  aimTarget(enemyTarget);
  const dx = enemyTarget.x - en.root.position.x;
  const dz = enemyTarget.z - en.root.position.z;
  const want = Math.atan2(dx, dz);
  const turn = wrapAngle(want - en.yaw) * Math.min(1, dt * ENEMY_TURN_RATE);
  en.yaw = wrapAngle(en.yaw + THREE.MathUtils.clamp(turn, -ENEMY_TURN_MAX * dt, ENEMY_TURN_MAX * dt));
  en.root.quaternion.setFromAxisAngle(UP, en.yaw);

  const yaw = THREE.MathUtils.clamp(wrapAngle(want - en.yaw), -ENEMY_AIM_YAW_MAX, ENEMY_AIM_YAW_MAX);
  const pitch = THREE.MathUtils.clamp(
    Math.atan2(enemyTarget.y - (en.root.position.y + ENEMY_GUN_Y), Math.hypot(dx, dz)),
    -ENEMY_AIM_PITCH_MAX,
    ENEMY_AIM_PITCH_MAX,
  );
  const k = 1 - Math.exp(-ENEMY_AIM_RATE * dt);
  en.aimYaw += (yaw - en.aimYaw) * k;
  en.aimPitch += (pitch - en.aimPitch) * k;
}

function updateEnemyFire(dt: number) {
  en.flashAge += dt;
  en.muzzleFx.visible = en.flashAge < MUZZLE_FLASH_LIFE;
  en.cooldown -= dt;
  // 撃つ少し前から腰を落として構える。構えきるまでは撃たない（見てからかわせる合図）
  const canAim = en.alive && playerHp > 0 && en.riseTime >= RESPAWN_RISE_TIME && en.flashT >= ENEMY_HIT_RECOVER && en.airY <= 0
    && en.dodgeT <= 0;
  const braceWant = canAim && en.cooldown < ENEMY_BRACE_TIME ? 1 : 0;
  en.brace += (braceWant - en.brace) * Math.min(1, dt * (braceWant > en.brace ? ENEMY_BRACE_RATE : ENEMY_BRACE_RATE * 0.5));
  if (!canAim || en.cooldown > 0 || en.brace < ENEMY_BRACE_READY) return;
  // 攻撃を受けてよろけている間は撃たない。当たってからしばらくと、上体の反りや銃の跳ね上がりが残っている間
  if (Math.abs(en.gunSpring.x.x) > ENEMY_STAGGER_LIMIT || en.leanSpring.x.length() > ENEMY_LEAN_LIMIT) return;
  if (en.footState.some((f) => f.t < 1)) return; // 踏ん張って足を踏み出している最中

  en.muzzle.updateWorldMatrix(true, false);
  enemyFrom.setFromMatrixPosition(en.muzzle.matrixWorld);
  enemyFwd.set(0, 0, -1).transformDirection(en.muzzle.matrixWorld); // 銃口は -Z
  enemyTo.subVectors(aimTarget(enemyTarget), enemyFrom);
  const dist = enemyTo.length();
  enemyTo.divideScalar(dist);
  if (enemyFwd.angleTo(enemyTo) > ENEMY_FIRE_CONE) return;
  if (castWorld(enemyFrom, enemyTo, dist) < dist) return; // 柱の陰にいる間は撃たない

  // 狙いの遅れを残すため、プレイヤーへではなく銃口の向きへ撃つ
  const dir = enemyFwd.clone();
  dir.x += (Math.random() * 2 - 1) * ENEMY_SPREAD;
  dir.y += (Math.random() * 2 - 1) * ENEMY_SPREAD;
  dir.z += (Math.random() * 2 - 1) * ENEMY_SPREAD;
  dir.normalize();
  const mesh = new THREE.Mesh(tracerGeo, enemyTracerMat);
  mesh.frustumCulled = false;
  mesh.visible = false; // 尾が伸びるまで出さない
  scene.add(mesh);
  enemyBullets.push({ pos: enemyFrom.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, from: en });

  en.cooldown = THREE.MathUtils.lerp(ENEMY_FIRE_MIN, ENEMY_FIRE_MAX, Math.random());
  en.flashAge = 0;
  en.muzzleFx.rotation.z = Math.random() * Math.PI;
  en.muzzleFx.scale.setScalar(ENEMY_FLASH_SCALE * (1 + Math.random() * 0.3));
  en.gunSpring.v.x -= ENEMY_RECOIL;
  // 敵のいる向きの左右から鳴らす（前後は分からないので、真横でも振りきらない）
  camera.updateMatrixWorld();
  enemyPan.copy(en.root.position).applyMatrix4(camera.matrixWorldInverse);
  const pan = THREE.MathUtils.clamp(enemyPan.x / Math.max(Math.hypot(enemyPan.x, enemyPan.z), 1e-3), -1, 1) * 0.8;
  sfx.playGunshot(THREE.MathUtils.clamp(4 / Math.max(dist, 1), 0.25, 0.8), pan);
}

function updateEnemyBullets(dt: number) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    const step = ENEMY_BULLET_SPEED * dt;
    if (b.hit || b.traveled >= ENEMY_BULLET_RANGE) {
      b.tail -= step;
      if (!b.hit) b.pos.addScaledVector(b.dir, step);
    } else {
      // この 1 歩の間に、まず壁、その手前でプレイヤーの体（縦の線分の周り）に当たるかを調べる
      const wall = castWorld(b.pos, b.dir, step);
      enemyNext.copy(b.pos).addScaledVector(b.dir, wall);
      enemyPath.set(b.pos, enemyNext);
      enemyBody.start.set(position.x, position.y + 0.15, position.z);
      enemyBody.end.set(position.x, position.y + player.eyeHeight + 0.05, position.z);
      if (playerHp > 0 && tryParry(b)) {
        b.mesh.removeFromParent();
        enemyBullets.splice(i, 1);
        continue;
      }
      closestSegmentPoints(enemyPath, enemyBody, enemyOnPath, enemyOnBody);
      if (playerHp > 0 && enemyOnPath.distanceTo(enemyOnBody) < ENEMY_HIT_RADIUS) {
        b.hit = true;
        b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + b.pos.distanceTo(enemyOnPath));
        b.pos.copy(enemyOnPath);
        if (b.from) b.from.hitPlayer = true;
        onPlayerShot(b.dir);
      } else if (wall < step) {
        b.hit = true;
        b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + wall);
        b.pos.copy(enemyNext);
        spawnSparks(enemyNext, b.dir, 6 + Math.floor(Math.random() * 4), 0.6, 0.5);
        sfx.playRicochet();
      } else {
        b.pos.copy(enemyNext);
        b.traveled += step;
        b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + step);
      }
    }
    if (b.tail <= 0) {
      b.mesh.removeFromParent();
      enemyBullets.splice(i, 1);
      continue;
    }
    b.mesh.visible = true;
    b.mesh.position.copy(b.pos);
    b.mesh.quaternion.setFromUnitVectors(TRACER_AXIS, bulletBack.copy(b.dir).negate());
    b.mesh.scale.set(ENEMY_TRACER_WIDTH, ENEMY_TRACER_WIDTH, b.tail);
  }
}

// ---- パリィ ----
// クナイや刀を振っている間（斬撃の軌跡が出ている前後）に、正面から体へ向かってくる弾が間合いへ入ったら弾き返す。
// 弾き返した弾は敵の胸へまっすぐ飛び、自分の銃弾と同じように当たる
const PARRY_RANGE = 1.6; // 胸からこの距離まで来た弾を弾く (m)
const PARRY_THREAT = 0.7; // 弾の進む線が体の芯からこれ以上離れていれば外れる弾なので弾かない (m)
const PARRY_ANGLE = 80 * DEG; // 視線からこの角度以内の向きから来た弾だけを弾く
const PARRY_EARLY = 0.05; // 軌跡が出る少し前から
const PARRY_LATE = 0.08; // 軌跡が消えた少し後まで
const PARRY_HIT_STOP = 0.18; // 世界を止める長さ（実時間）。この間は画面を白黒にする
const PARRY_INVERT_TIME = 0.035; // 弾いた瞬間だけ白黒を反転させる
// 止まったあと、いきなり戻さずスローを挟み、跳ね返った弾が敵へ飛んでいくのを見せる（どれも実時間）
const PARRY_SLOW_SCALE = 0.3;
const PARRY_SLOW_HOLD = 0.25;
const PARRY_SLOW_RELEASE = 0.35;
const PARRY_FX_FADE = PARRY_SLOW_HOLD + PARRY_SLOW_RELEASE; // 色はスローが明けるのに合わせて戻す
// 跳ね返した弾: 自分の一撃だと分かるよう、遅く太く白い光の尾で飛ばす
const PARRY_RETURN_SPEED = 60; // m/s（スローの間は目で追える）
const PARRY_TRACER_LEN = 4;
const PARRY_TRACER_WIDTH = 0.05;
const PARRY_RETURN_HIT: HitDef = { kick: [-1.6, 0, 0], knock: 420, hitStop: 0.12, fx: 1.6 };
const PARRY_RETURN_MONO = 0.07; // 返した弾が当たった瞬間も、ごく短く白黒にする
const PARRY_RETURN_MONO_FADE = 0.15;
const parryTracerMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
let parryFxAge = Infinity; // 弾いてからの実時間
let parryReturnAge = Infinity; // 返した弾が当たってからの実時間

// 実時間を進め、ゲームの時間に掛ける速さを返す（止まっている間はヒットストップが止めるので 1）
function parrySlowFactor(realDt: number) {
  parryFxAge += realDt;
  parryReturnAge += realDt;
  const t = parryFxAge - PARRY_HIT_STOP;
  if (t < 0) return 1;
  const u = THREE.MathUtils.clamp((t - PARRY_SLOW_HOLD) / PARRY_SLOW_RELEASE, 0, 1);
  return THREE.MathUtils.lerp(PARRY_SLOW_SCALE, 1, u * u);
}

function parryMono() {
  const after = Math.max(0, parryFxAge - PARRY_HIT_STOP);
  const main = parryFxAge < PARRY_HIT_STOP ? 1 : Math.max(0, 1 - after / PARRY_FX_FADE) ** 2;
  const rAfter = Math.max(0, parryReturnAge - PARRY_RETURN_MONO);
  const ret = parryReturnAge < PARRY_RETURN_MONO ? 1 : Math.max(0, 1 - rAfter / PARRY_RETURN_MONO_FADE);
  return Math.max(main, ret);
}
const PARRY_SPREAD = 1.5 * DEG;
const parryChest = new THREE.Vector3();
const parryLook = new THREE.Vector3();
const parryAt = new THREE.Vector3();
const parryAim = new THREE.Vector3();
const parryRay = new THREE.Line3();
const inParryWindow = (t: number, [a, b]: readonly [number, number, boolean?]) => t >= a - PARRY_EARLY && t <= b + PARRY_LATE;

function parryActive(): boolean {
  // クナイは指先で回す細い軌跡を除いた、本当に振っている間だけ
  if (attack && shownWeapon === 'kunai') return attack.trails.some((w) => !w[2] && inParryWindow(attackTime, w));
  if (swordAttack && shownWeapon === 'sword') return swordAttack.trails.some((w) => inParryWindow(swordTime, w));
  return false;
}

// enemyPath（この 1 歩で弾が進む線分）が入っている前提で呼ぶ
function tryParry(b: Bullet): boolean {
  if (!parryActive()) return false;
  aimTarget(parryChest);
  enemyPath.closestPointToPoint(parryChest, true, parryAt);
  if (parryAt.distanceTo(parryChest) > PARRY_RANGE) return false;
  camera.getWorldDirection(parryLook);
  if (parryLook.angleTo(b.dir) < Math.PI - PARRY_ANGLE) return false;
  // このまま進んでも体に当たらない弾は放っておく
  parryRay.start.copy(b.pos);
  parryRay.end.copy(b.pos).addScaledVector(b.dir, ENEMY_BULLET_RANGE);
  closestSegmentPoints(parryRay, enemyBody, enemyOnPath, enemyOnBody);
  if (enemyOnPath.distanceTo(enemyOnBody) > PARRY_THREAT) return false;

  // 弾いた所: 間合いの縁まで来ていればそこ、まだ手前ならこの 1 歩の中で胸に最も近い所
  if (b.pos.distanceTo(parryChest) <= PARRY_RANGE) parryAt.copy(b.pos);
  const dir = new THREE.Vector3();
  const shooter = b.from;
  if (shooter?.alive) dir.set(shooter.root.position.x, shooter.root.position.y + 1.3, shooter.root.position.z).sub(parryAt).normalize();
  else dir.copy(b.dir).negate();
  dir.x += (Math.random() * 2 - 1) * PARRY_SPREAD;
  dir.y += (Math.random() * 2 - 1) * PARRY_SPREAD;
  dir.z += (Math.random() * 2 - 1) * PARRY_SPREAD;
  dir.normalize();
  const mesh = new THREE.Mesh(tracerGeo, parryTracerMat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  bullets.push({ pos: parryAt.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, parried: true });

  // 演出: 一瞬止めて火花を散らし、金属の「キン」
  hitStop = Math.max(hitStop, PARRY_HIT_STOP);
  hitStopTotal = hitStop;
  hitStopShakesDummy = false;
  parryFxAge = 0;
  spawnSparks(parryAt, parryAim.copy(dir), 12 + Math.floor(Math.random() * 5), 0.8, 0.7);
  sfx.playParry(PARRY_HIT_STOP);
  addTrauma(0.15);
  kickVel.x += 0.8 * DEG * 22;
  return true;
}

// 2 本の線分の、互いにいちばん近い点
const segD1 = new THREE.Vector3();
const segD2 = new THREE.Vector3();
const segR = new THREE.Vector3();
function closestSegmentPoints(a: THREE.Line3, b: THREE.Line3, outA: THREE.Vector3, outB: THREE.Vector3) {
  segD1.subVectors(a.end, a.start);
  segD2.subVectors(b.end, b.start);
  segR.subVectors(a.start, b.start);
  const aa = segD1.dot(segD1);
  const ee = segD2.dot(segD2);
  const f = segD2.dot(segR);
  let s = 0;
  let t = 0;
  if (aa < 1e-9) {
    t = THREE.MathUtils.clamp(f / ee, 0, 1);
  } else {
    const c = segD1.dot(segR);
    const bb = segD1.dot(segD2);
    const denom = aa * ee - bb * bb;
    s = denom > 1e-9 ? THREE.MathUtils.clamp((bb * f - c * ee) / denom, 0, 1) : 0;
    t = (bb * s + f) / ee;
    if (t < 0) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / aa, 0, 1);
    } else if (t > 1) {
      t = 1;
      s = THREE.MathUtils.clamp((bb - c) / aa, 0, 1);
    }
  }
  outA.copy(a.start).addScaledVector(segD1, s);
  outB.copy(b.start).addScaledVector(segD2, t);
}

// 撃たれた: 体力を削り、撃たれた向きへ視点を弾く
function onPlayerShot(dir: THREE.Vector3) {
  damagePlayer(ENEMY_BULLET_DAMAGE);
  sfx.playHurt();
  addTrauma(0.35);
  camera.getWorldDirection(enemyTo);
  // 正面から撃たれたら視点が上へ、横からなら撃たれた向きへねじれる
  const side = enemyTo.x * dir.z - enemyTo.z * dir.x;
  kickVel.x += 2.5 * DEG * 22;
  kickVel.z += side * 3 * DEG * 22;
}

const ammoPips = [...document.querySelectorAll<HTMLElement>('#ammo i')];
const ammoHud = document.getElementById('ammo')!;
const weaponHud = document.getElementById('weapon')!;
const weaponName = weaponHud.querySelector<HTMLElement>('.name span')!;
const weaponIcons = [...weaponHud.querySelectorAll<SVGElement>('.icon svg')];
const WEAPON_LABELS: Record<WeaponId, string> = { kunai: 'KUNAI', handgun: 'HANDGUN', sword: 'SWORD', sickle: 'CHAIN SICKLE', axe: 'BATTLE AXE', chakram: 'CHAKRAM' };
let weaponHudShown: WeaponId | null = null;
// 右下の武器表示: 構えている武器のアイコンと名前。持ち替えたら差し込み直す
function updateWeaponHud() {
  if (weaponHudShown === shownWeapon) return;
  const first = weaponHudShown === null;
  weaponHudShown = shownWeapon;
  weaponName.textContent = WEAPON_LABELS[shownWeapon];
  for (const svg of weaponIcons) svg.classList.toggle('on', svg.dataset.w === shownWeapon);
  if (first) return;
  const icon = weaponIcons.find((svg) => svg.dataset.w === shownWeapon)!;
  for (const el of [weaponName, icon]) {
    el.classList.remove('in');
    void el.getBoundingClientRect(); // 続けて持ち替えても頭から流し直す
    el.classList.add('in');
  }
}
// ---- 右の操作一覧 ----（ui/controlsHud.ts）

function updateGun(dt: number) {
  gunCooldown = Math.max(0, gunCooldown - dt);
  updateDeadEye();
  // 頂点で一瞬止めたあと、腕で反動を押し戻すように重たく戻す
  if (gunRecoilHold > 0) gunRecoilHold -= dt;
  else gunRecoil += -gunRecoil * Math.min(1, dt * 8);

  if (!gunReady()) {
    // 持ち替えたら装填は最初からやり直す（薬莢を落とした後なら弾は空のまま）
    if (gunReloading) endReload();
    if (twirlT >= 0) endTwirl(false);
    endSlideSpin();
    fireQueued = false;
    reloadQueued = false;
  }
  if (reloadQueued) {
    reloadQueued = false;
    if (!gunReloading && gunAmmo < GUN_AMMO) startReload();
  }
  if (gunReloading) {
    // 装填中のクリックは溜めない（終わった瞬間に勝手に撃たないように）
    fireQueued = false;
    const prevT = gunReloadT;
    gunReloadT += dt;
    while (reloadEvent < RELOAD_EVENTS.length && gunReloadT >= RELOAD_EVENTS[reloadEvent].at) {
      RELOAD_EVENTS[reloadEvent++].fn();
    }
    if (prevT < GUN_RELOAD_TIME && gunReloadT >= GUN_RELOAD_TIME) {
      endReload();
    } else {
      evalReloadPose(gunReloadT);
      poseReloadParts(gunReloadT);
    }
  } else if (fireQueued && gunCooldown <= 0) {
    fireQueued = false;
    if (gunAmmo > 0) fireGun();
    else startReload();
  }
  // 撃ち尽くしたら、反動が収まったところで自動で装填する
  if (gunReady() && !gunReloading && gunAmmo === 0 && gunCooldown <= 0) startReload();

  // シリンダーは撃つたびに次の薬室へ素早く回す。弾いたときは惰性で回り続ける
  if (cylinderSpin > 0) {
    gunCylinder.rotation.z += cylinderSpin * dt;
    cylinderSpin *= Math.exp(-2 * dt);
    cylinderTarget = gunCylinder.rotation.z;
  } else {
    // 一発ごとに次の薬室へ回る動きが目で追えるよう、少しゆっくり寄せる
    gunCylinder.rotation.z += (cylinderTarget - gunCylinder.rotation.z) * Math.min(1, dt * 14);
  }

  updateTwirl(dt);
  updateSlideSpin(dt);
  applyGunSpin(dt);
  updateCasings(dt);

  muzzleFlashAge += dt;
  muzzleFlash.visible = muzzleFlashAge < MUZZLE_FLASH_LIFE;

  updateBullets(dt);

  ammoHud.classList.toggle('hidden', shownWeapon !== 'handgun');
  ammoHud.classList.toggle('reloading', gunReloading);
  // 印を付けた分の弾は、撃つ順に右から光らせる
  const marked = deadEye === 'mark' ? deadEyeMarks.length : deadEyeMarks.filter((m) => !m.done).length;
  ammoPips.forEach((p, i) => {
    p.classList.toggle('spent', i >= gunAmmo);
    p.classList.toggle('marked', i < gunAmmo && i >= gunAmmo - marked);
  });
  updateWeaponHud();
  updateControlsHud(shownWeapon, usingPad);
}

// ---- ポストエフェクト ----（シェーダーは fx/postShaders.ts）
// 周辺ブラー・ビネット・集中線: これより速いと効果が出始め、SPEED_FX_FULL で最大になる
const SPEED_FX_START = SPRINT_SPEED - 1;
const SPEED_FX_FULL = 30;
const MAX_RADIAL_BLUR = 0.07; // 画面端で中心方向へぼかす量
const MAX_VIGNETTE = 0.3;

// MSAA を保つため、マルチサンプルのレンダーターゲットで描く
const composerTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio(),
  { type: THREE.HalfFloatType, samples: 4 },
);
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
const speedFxPass = new ShaderPass(SpeedFxShader);
composer.addPass(speedFxPass);
const impactFxPass = new ShaderPass(ImpactFxShader);
composer.addPass(impactFxPass);
// どちらも最初は効果が無いので止めておく（動き出したら update 側で点ける）
speedFxPass.enabled = false;
impactFxPass.enabled = false;
// 当たりの光は暗転のあとに重ねる（奥行きは見ず、常に手前に描く）
const hitFxRenderPass = new RenderPass(fxScene, camera);
hitFxRenderPass.clear = false;
composer.addPass(hitFxRenderPass);
composer.addPass(new OutputPass());

let speedFx = 0;
function updateSpeedFx(dt: number) {
  const hSpeed = Math.hypot(velocity.x, velocity.z);
  let target = THREE.MathUtils.clamp((hSpeed - SPEED_FX_START) / (SPEED_FX_FULL - SPEED_FX_START), 0, 1);
  if (player.dashTime > 0) target = 1;
  // 強くなるときは素早く、弱まるときはゆっくり
  speedFx += (target - speedFx) * Math.min(1, dt * (target > speedFx ? 12 : 4));
  if (target === 0 && speedFx < 0.002) speedFx = 0;
  // 効果が無いときは全画面の処理（ブラーの 10 回読み）ごと飛ばす
  speedFxPass.enabled = speedFx > 0;

  const u = speedFxPass.uniforms;
  u.uTime.value += dt;
  u.uBlur.value = speedFx * MAX_RADIAL_BLUR;
  u.uVignette.value = speedFx * MAX_VIGNETTE;
  u.uLines.value = speedFx;
}

// ---- 攻撃モーションの確認用 ----
// ?attack=slash1&t=0.15 … その時点の 1 フレームを描く（軌跡つき）
// ?attack=slash1&onion  … 振り全体のクナイを重ねて描く（青 → 赤 の順に時間が進む）
// ?attack=slash1&t=0.2&near … 敵の目の前で振る（当たりの演出の確認用。ヒットストップは無視する）
function runAttackDebug(def: AttackDef, params: URLSearchParams) {
  overlay.classList.add('hidden');
  document.body.classList.remove('on-title');
  const step = 1 / 120;
  if (params.has('near')) position.set(en.root.position.x, 0, en.root.position.z + 1.6);
  for (let i = 0; i < 30; i++) update(step); // 着地させて落ち着かせる
  startAttack(def);
  const tEnd = Number(params.get('t') ?? def.duration);
  if (!params.has('onion')) {
    while (attack && attackTime + step <= tEnd) {
      update(step);
      updateHitFx(step);
    }
  }

  if (params.has('onion')) {
    camera.updateMatrixWorld();
    const toCamera = camera.matrixWorld.clone().invert();
    const from = Number(params.get('from') ?? 0);
    const interval = Number(params.get('step') ?? 0.02);
    for (let s = from; s <= tEnd + 1e-6; s += interval) {
      attackPoseAt(def, s, tmpPose);
      applyPose(tmpPose);
      kunai.updateWorldMatrix(true, false);
      const ghost = kunai.clone();
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.66 * (1 - (s - from) / (tEnd - from)), 0.9, 0.5) });
      ghost.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = mat;
      });
      ghost.matrixAutoUpdate = false;
      ghost.matrix.multiplyMatrices(toCamera, kunai.matrixWorld);
      camera.add(ghost);
    }
    kunai.visible = false;
  }

  updateSpeedFx(0);
  // 1 回だけの描画は表示前に消えることがあるので、止めた状態のまま描き続ける
  renderer.setAnimationLoop(() => {
    applyCameraOffset();
    composer.render(0);
    camera.quaternion.copy(savedQuat);
  });
}

// 剣の攻撃を確かめる: ?sword=kesa&t=0.2（その時間で止める）、&onion（軌道を色の違う剣で重ねて描く）
function runSwordDebug(def: SwordAttackDef, params: URLSearchParams) {
  overlay.classList.add('hidden');
  document.body.classList.remove('on-title');
  wantWeapon = shownWeapon = 'sword';
  const step = 1 / 120;
  if (params.has('near')) position.set(en.root.position.x, 0, en.root.position.z + 1.6);
  for (let i = 0; i < 30; i++) update(step);
  startSwordAttack(def);
  const tEnd = Number(params.get('t') ?? def.duration);
  if (!params.has('onion')) {
    while (swordAttack && swordTime + step <= tEnd) {
      update(step);
      updateHitFx(step);
    }
  } else {
    camera.updateMatrixWorld();
    const toCamera = camera.matrixWorld.clone().invert();
    const from = Number(params.get('from') ?? 0);
    const interval = Number(params.get('step') ?? 0.02);
    for (let s = from; s <= tEnd + 1e-6; s += interval) {
      swordPoseAt(def, s, swordTrailPose);
      applySwordPose(swordTrailPose);
      sword.updateWorldMatrix(true, false);
      const ghost = sword.clone();
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.66 * (1 - (s - from) / (tEnd - from)), 0.9, 0.5) });
      ghost.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = mat;
      });
      ghost.matrixAutoUpdate = false;
      ghost.matrix.multiplyMatrices(toCamera, sword.matrixWorld);
      camera.add(ghost);
    }
    sword.visible = false;
  }
  updateSpeedFx(0);
  renderer.setAnimationLoop(() => {
    applyCameraOffset();
    composer.render(0);
    camera.quaternion.copy(savedQuat);
  });
}

// 斧の攻撃を確かめる: ?axe=kesa&t=0.4（その時間で止める）、&onion（軌道を色の違う斧で重ねて描く）、&near（敵の目の前で振る）
function runAxeDebug(def: AxeAttackDef, params: URLSearchParams) {
  overlay.classList.add('hidden');
  document.body.classList.remove('on-title');
  wantWeapon = shownWeapon = 'axe';
  const step = 1 / 120;
  if (params.has('near')) position.set(en.root.position.x, 0, en.root.position.z + 1.8);
  for (let i = 0; i < 30; i++) update(step);
  startAxeAttack(def);
  const tEnd = Number(params.get('t') ?? def.duration);
  if (!params.has('onion')) {
    while (axeAttack && axeTime + step <= tEnd) {
      update(step);
      updateHitFx(step);
    }
  } else {
    camera.updateMatrixWorld();
    const toCamera = camera.matrixWorld.clone().invert();
    const from = Number(params.get('from') ?? 0);
    const interval = Number(params.get('step') ?? 0.02);
    for (let s = from; s <= tEnd + 1e-6; s += interval) {
      axePoseAt(def, s, axeTrailPose);
      applyAxePose(axeTrailPose);
      heldAxeModel.updateWorldMatrix(true, false);
      const ghost = heldAxeModel.clone();
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.66 * (1 - (s - from) / (tEnd - from)), 0.9, 0.5) });
      ghost.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = mat;
      });
      ghost.matrixAutoUpdate = false;
      ghost.matrix.multiplyMatrices(toCamera, heldAxeModel.matrixWorld);
      camera.add(ghost);
    }
    heldAxeModel.visible = false;
  }
  updateSpeedFx(0);
  renderer.setAnimationLoop(() => {
    applyCameraOffset();
    composer.render(0);
    camera.quaternion.copy(savedQuat);
  });
}

// 居合の構えを確かめる: ?focus=0.5（構えてからの実時間）&rush=0.2（突進を始めてからの時間。省くと構えたまま）
// ステージの見た目を確かめる: ?stage=station / warehouse / parking（組み上がった状態を始めの位置から見る）。
// &x=0&y=1.6&z=4（目の位置。省くと始めの位置）&yaw=0&pitch=0（度。yaw は左へ回すと正）
// &sim=5 で、その秒数だけゲームを進めてから見る（敵の歩きを確かめる。1 秒ごとの敵の位置を console に出す）
function runStageDebug(params: URLSearchParams) {
  overlay.classList.add('hidden');
  document.body.classList.remove('on-title');
  enterStage(params.get('stage') as StageId);
  applyStageRise(Infinity);
  const num = (k: string, v: number) => (params.has(k) ? Number(params.get(k)) : v);
  // &px=0&py=0&pz=0（足もとの位置）&vx=0&vy=0&vz=0（速度）で、プレイヤーを置いてから進める（坂などの当たり判定を確かめる）。
  // 0.1 秒ごとのプレイヤーの位置を console に出す
  const placed = ['px', 'py', 'pz'].some((k) => params.has(k));
  if (placed) {
    position.set(num('px', position.x), num('py', position.y), num('pz', position.z));
    velocity.set(num('vx', 0), num('vy', 0), num('vz', 0));
  }
  if (params.has('sim')) {
    const step = 1 / 60;
    const log: string[] = [];
    const playerLog: string[] = [];
    const r = (v: number) => v.toFixed(1);
    for (let i = 0; i * step < num('sim', 0); i++) {
      update(step);
      if (i % 60 === 0) log.push(`${r(i * step)}s hp=${playerHp} ` + enemies.map((e) => `(${r(e.root.position.x)},${r(e.root.position.y)},${r(e.root.position.z)}${e.moving ? ' walk' : ''})`).join(' '));
      if (placed && i % 6 === 0) playerLog.push(`${r(i * step)}s (${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}) v=(${r(velocity.x)},${r(velocity.y)},${r(velocity.z)})${player.onGround ? ' ground' : ''}${player.groundRamp ? ' ramp' : ''}`);
    }
    console.log('ENEMY_LOG\n' + log.join('\n'));
    if (placed) console.log('PLAYER_LOG\n' + playerLog.join('\n'));
  }
  camera.position.set(num('x', position.x), num('y', position.y + EYE_HEIGHT), num('z', position.z));
  camera.quaternion.setFromEuler(new THREE.Euler(num('pitch', 0) * DEG, num('yaw', 0) * DEG, 0, 'YXZ'));
  setViewModelsVisible(false);
  // &title=0.3 で、タイトルを出してからその時間の見た目にする
  if (params.has('title')) {
    titleT = Math.min(Number(params.get('title')), STAGE_TITLE_END - 0.01);
    stageTitle.start();
    stageTitle.update(titleT);
  }
  renderer.setAnimationLoop(() => {
    renderTitleMask();
    updateFinishMark();
    composer.render(0);
  });
}

function runFocusDebug(params: URLSearchParams) {
  overlay.classList.add('hidden');
  document.body.classList.remove('on-title');
  wantWeapon = shownWeapon = 'sword';
  controls.isLocked = true;
  const step = 1 / 120;
  position.set(en.root.position.x + 1.5, 0, en.root.position.z + 9);
  for (let i = 0; i < 30; i++) update(step);
  throwHeld = focusPressed = true;
  focusCharge = 1;
  const tick = () => {
    realDt = step;
    update(step * timeScale);
    updateHitFx(step);
  };
  for (let t = 0; t < Number(params.get('focus') ?? 0.5); t += step) tick();
  if (params.has('rush')) {
    swordPressed = true;
    for (let t = 0; t < Number(params.get('rush')); t += step) tick();
  }
  controls.isLocked = false;
  updateSpeedFx(0);
  renderer.setAnimationLoop(() => {
    applyCameraOffset();
    composer.render(0);
    camera.quaternion.copy(savedQuat);
  });
}

// 鎖鎌の引き寄せを確かめる: ?grapple（高さ 2m の台の正面へまっすぐ投げ、W を押したまま引き寄せる）。
// 毎フレームの位置と速さを console に出す。&dist=8（台からの距離）&pitch=0（見下ろす角度、度）&now（W を押さない）
function runGrappleDebug(params: URLSearchParams) {
  overlay.classList.add('hidden');
  document.body.classList.remove('on-title');
  wantWeapon = shownWeapon = 'sickle';
  controls.isLocked = true;
  const step = 1 / Number(params.get('fps') ?? 120);
  const wAt = Number(params.get('wAt') ?? 0); // W を押し始める時刻 (s)
  // 台 (10..15, 15..20, 高さ 2) の z = 15 の面を、正面 (+z) から見る
  position.set(12.5, 0, 15 - Number(params.get('dist') ?? 8));
  lookEuler.set(-Number(params.get('pitch') ?? 0) * DEG, Math.PI, 0);
  camera.quaternion.setFromEuler(lookEuler);
  for (let i = 0; i < 30; i++) update(step);
  throwHeld = throwPressed = true;
  const log: string[] = [];
  for (let t = 0; t < 2; t += step) {
    if (t >= 0.2) throwHeld = false;
    if (!params.has('now') && t >= wAt) keys.add('KeyW');
    if (params.has('shift')) keys.add('ShiftLeft');
    update(step);
    const r = (v: number) => v.toFixed(2);
    log.push(`${r(t)} ${grapple?.phase ?? '-'} pos(${r(position.x)},${r(position.y)},${r(position.z)}) vel(${r(velocity.x)},${r(velocity.y)},${r(velocity.z)}) h=${r(Math.hypot(velocity.x, velocity.z))} mantle=${r(player.mantleTime)} ground=${player.onGround}`);
  }
  console.log('GRAPPLE_LOG\n' + log.join('\n'));
  keys.clear();
  controls.isLocked = false;
}

// ---- 訓練場へ入る演出 ----
// タイトルの間は、まだ何も生えていない床を高いところから見下ろしておく。TRAINING を選ぶと、
// 斜めの帯が画面を覆い（#transition）、その裏でプレイヤーを始めの位置へ移す。帯が抜けると、
// まわりのステージが地面から伸び上がる。アリーナの中が伸びきったら操作を返す（遠くの柱はその後も伸び続ける）。
// 見回すのは帯が抜けた直後からできる
const TITLE_CAM_POS = new THREE.Vector3(0, 24, 50);
const TITLE_CAM_QUAT = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(TITLE_CAM_POS, new THREE.Vector3(0, 0, -8), UP),
);
const INTRO_SWITCH_TIME = 0.4; // 帯が画面を覆いきって、裏で場面を入れ替える時刻
const INTRO_REVEAL_TIME = 0.65; // 帯が抜け始める時刻
const INTRO_APPEAR_TIME = 0.8; // 帯が抜け始めてから、広げた視野が元へ戻るまで
const INTRO_FOV_BONUS = 10;
const INTRO_RISE_DELAY = INTRO_REVEAL_TIME - INTRO_SWITCH_TIME; // 帯が抜け始めると同時に伸び始める
const RISE_LINE_DELAY = 0.55; // 境界線を引き始める時刻
const RISE_LINE_TIME = 0.7;
const RISE_DUMMY_TIME = 0.6;
let introT = -1; // 演出の経過時間。-1 = 演出中でない
let riseT = -1; // せり上がりの経過時間。-1 = 伸びきった（または伸びていない）
const riseMatrix = new THREE.Matrix4();

function setViewModelsVisible(v: boolean) {
  viewModel.visible = leftViewModel.visible = gunViewModel.visible = swordViewModel.visible = sickleViewModel.visible = axeViewModel.visible = v;
}

// 床に広がる輪: 円くくり抜かれて広がるグリッドの縁に、細い線を引いて輪郭をはっきりさせる
const RISE_RING_MAX = 160; // ここまで広がったら消す
const riseRingMat = new THREE.ShaderMaterial({
  uniforms: { uRadius: { value: 0 }, uRiseOrigin: riseOrigin, uColor: { value: new THREE.Color(0x333333) } },
  vertexShader: /* glsl */ `
    varying vec2 vPos;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vPos = w.xz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uRadius;
    uniform vec2 uRiseOrigin;
    uniform vec3 uColor;
    varying vec2 vPos;
    void main() {
      float d = distance(vPos, uRiseOrigin);
      float w = 0.12 + uRadius * 0.012; // 遠くへ行くほど速いので、線も太らせる
      float front = 1.0 - smoothstep(0.0, w, abs(d - uRadius));
      float a = front * 0.5 * (1.0 - smoothstep(30.0, ${RISE_RING_MAX.toFixed(1)}, uRadius));
      if (a < 0.003) discard;
      gl_FragColor = vec4(uColor, a);
    }
  `,
  transparent: true,
  depthWrite: false,
});
const riseRing = new THREE.Mesh(new THREE.PlaneGeometry(2 * RISE_RING_MAX, 2 * RISE_RING_MAX), riseRingMat);
riseRing.rotation.x = -Math.PI / 2;
riseRing.position.set(riseOrigin.value.x, 0.025, riseOrigin.value.y);
riseRing.visible = false;
scene.add(riseRing);

// t はせり上がりを始めてからの時間（負なら何も出ていない）。すべて伸びきったら true
let riseSlamDone = false;
function applyStageRise(t: number) {
  let done = true;
  // 輪の半径は、その時刻に影が落ち始める距離（遅れ = RISE_WAVE * √距離 の逆）
  const ringR = t > 0 ? (t / RISE_WAVE) ** 2 : 0;
  riseRing.visible = t > 0 && ringR < RISE_RING_MAX;
  riseRingMat.uniforms.uRadius.value = ringR;
  groundReveal.value = t === Infinity ? GROUND_REVEAL_ALL : ringR;
  let slams = 0;
  for (const r of risers) {
    const { b } = r;
    const s = t - r.delay; // 底面の枠が浮かんでからの時間
    const k = THREE.MathUtils.clamp((s - RISE_BASE_TIME) / r.dur, 0, 1); // 骨組みの伸び
    const f = THREE.MathUtils.clamp((s - RISE_BASE_TIME - r.dur * RISE_FILL_START) / r.fillDur, 0, 1); // 面の埋まり
    if (f < 1) done = false;
    // 箱は原点が底面の角なので、高さだけ縮めれば底面から伸びるように見える。まだのものは潰して消す
    const y0 = b.y0 ?? 0;
    let h = 0;
    if (s >= 0) h = Math.max(RISE_BASE_HEIGHT, (b.h - y0) * easeOutCubic(k));
    if (h <= 0) riseMatrix.makeScale(0, 0, 0);
    else if (r.ramp) rampMatrix(r.ramp, h, riseMatrix);
    else riseMatrix.makeScale(b.maxX - b.minX, h, b.maxZ - b.minZ).setPosition(b.minX, y0, b.minZ);
    r.mesh.setMatrixAt(r.index, riseMatrix);
    const fill = f >= 1 ? RISE_FILL_DONE : f > 0 ? y0 + (b.h - y0) * easeInOutCubic(f) : -1;
    (r.mesh.geometry.getAttribute('aFill') as THREE.InstancedBufferAttribute).setX(r.index, fill);
    // 高い柱が組み上がった瞬間に、ずしりと揺らす
    if (!r.slammed && f >= 1 && b.h >= RISE_SLAM_HEIGHT && t !== Infinity) {
      r.slammed = true;
      slams++;
    }
  }
  // 揺らすのは入場ごとに 1 度だけ（高い箱がいくつも順に組み上がるステージで、揺れと音が続かないように）
  if (slams > 0 && !riseSlamDone) {
    riseSlamDone = true;
    addTrauma(0.32);
    sfx.playStageSettle();
  }
  for (const mesh of riseMeshes) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.getAttribute('aFill').needsUpdate = true;
  }
  const lk = THREE.MathUtils.clamp((t - RISE_LINE_DELAY) / RISE_LINE_TIME, 0, 1);
  if (lk < 1) done = false;
  for (const line of riseLines) {
    const { width, height } = (line.geometry as THREE.PlaneGeometry).parameters;
    const e = Math.max(easeOutQuart(lk), 1e-4);
    line.scale.set(width > height ? e : 1, width > height ? 1 : e, 1);
    line.visible = lk > 0;
  }
  // 敵は床の下から迫り上がってくる
  for (const e of enemies) {
    const dk = THREE.MathUtils.clamp((t - e.riseDelay) / RISE_DUMMY_TIME, 0, 1);
    if (dk < 1) done = false;
    e.root.position.y = e.baseY - (DUMMY_HEIGHT + 0.1) * (1 - easeOutQuart(dk));
  }
  return done;
}

function updateStageRise(dt: number) {
  if (riseT < 0) return;
  riseT += dt;
  if (applyStageRise(riseT - INTRO_RISE_DELAY)) {
    applyStageRise(Infinity); // 床のグリッドを果てまで出しきる
    riseT = -1;
    sfx.stopStageRise();
  }
}

// ---- ステージへ入る ----
// 訓練場（アリーナ）を丸ごと外し、選んだステージの箱を置き直す。タイトルへ戻ると読み込み直すので、
// 1 度入ったら訓練場へ戻す処理は持たない。敵は操作を返してから出す
type StageId = 'station' | 'warehouse' | 'parking';
const STAGE_BUILDERS: Record<StageId, () => StageLayout> = { station: buildStation, warehouse: buildWarehouse, parking: buildParking };
let pendingStage: StageId | null = null; // 次の入場で入るステージ。null = 訓練場
// 当たり判定では、同じ幅・同じ高さで z 方向に継ぎ目なく並んだ箱を 1 つにまとめる。
// 別々のままだと、継ぎ目をまたいだときに、まだ乗っていない側の箱の側面に押し返されてつっかえる
function mergeBoxes(list: Block[]): Block[] {
  const out: Block[] = [];
  const sorted = [...list].sort((a, b) => a.minX - b.minX || a.maxX - b.maxX || a.h - b.h || (a.y0 ?? 0) - (b.y0 ?? 0) || b.maxZ - a.maxZ);
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && last.minX === b.minX && last.maxX === b.maxX && last.h === b.h && (last.y0 ?? 0) === (b.y0 ?? 0) && last.minZ === b.maxZ) last.minZ = b.minZ;
    else out.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.h, y0: b.y0 });
  }
  return out;
}

const stageLooks = { terrain: TERRAIN_GRID, struct: STRUCT_GRID } as const;
type StageLook = Pick<StageBox, 'look' | 'gridOrigin'>;
const stageMaterial = (b: StageLook) =>
  b.look === 'plain' ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : gridMaterial(stageLooks[b.look], b.gridOrigin);
// 線の引き方と格子の起点が同じ箱ごとに分ける（1 つのメッシュにまとめる単位）
function groupStageBoxes<T extends StageLook>(list: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const b of list) {
    const o = b.gridOrigin;
    const key = `${b.look}|${o ? `${o.x},${o.y},${o.z}` : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.values()];
}
function addStageLines(layout: StageLayout, parent: THREE.Object3D) {
  return layout.lines.map((l) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.d), groundLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(l.x, l.y, l.z);
    parent.add(line);
    return line;
  });
}

function enterStage(id: StageId) {
  const layout = STAGE_BUILDERS[id]();
  scene.remove(arenaRoot);
  blocks.length = 0;
  ramps.length = 0;
  risers.length = 0;
  riseMeshes.clear();
  riseLines.length = 0;
  resetArenaRiseEnd();

  const { start, bounds } = layout;
  riseOrigin.value.set(start.x, start.z);
  riseRing.position.set(start.x, 0.025, start.z);
  position.set(start.x, start.y, start.z);
  // 訓練場の的を外し、難易度で決まる数の敵を用意する。倒された後と同じ扱いにしておき、
  // ゲームの時間が進み始めてから（操作を返してから）、起き上がりの仕組み（respawnDummy）で 1 体ずつ出現位置に現れさせる。
  // 出現位置の無いステージ（作りかけ）では敵を出さず、時間も測らずに歩き回るだけにする
  while (enemies.length > 0) removeEnemy(enemies[0]);
  enemySpawns = layout.enemySpawns;
  const hasEnemies = enemySpawns.length > 0;
  for (let i = 0; hasEnemies && i < STAGE_ENEMY_COUNT[DIFFICULTIES[difficultyIndex]]; i++) {
    setEn(createEnemy(true));
    en.alive = false;
    en.root.visible = false;
    en.deadTime = RESPAWN_TIME - (STAGE_SPAWN_FIRST + i * STAGE_SPAWN_GAP);
    en.riseDelay = -1e9; // ステージの組み上がりでは動かさない（足もとの高さのままにする）
  }
  velocity.set(0, 0, 0);
  playBounds.minX = bounds.minX + PLAYER_RADIUS;
  playBounds.maxX = bounds.maxX - PLAYER_RADIUS;
  playBounds.minZ = bounds.minZ + PLAYER_RADIUS;
  playBounds.maxZ = bounds.maxZ - PLAYER_RADIUS;

  const root = new THREE.Group();
  scene.add(root);
  stageRoot = root;
  if (hasEnemies) beginStageRun();
  // 見た目の箱は、線の引き方と格子の起点ごとに 1 つのメッシュにまとめる。遠景は操作を返すのを待たないので別にする
  for (const [list, inArena] of [[[...layout.boxes, ...layout.decor], true], [layout.scenery, false]] as const) {
    for (const group of groupStageBoxes(list)) addBoxes(group, stageMaterial(group[0]), (b) => b.light, root, inArena);
  }
  for (const group of groupStageBoxes(layout.ramps ?? [])) addRamps(group, stageMaterial(group[0]), root);
  blocks.push(...mergeBoxes([...layout.boxes, ...layout.colliders]));
  ramps.push(...(layout.ramps ?? []));
  for (const line of addStageLines(layout, root)) riseLines.push(line);
  // 前後の端（線路が続いていく先）に、近づくと浮かぶ境界の壁を立てる
  const width = bounds.maxX - bounds.minX;
  for (const z of [bounds.minZ, bounds.maxZ]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, BORDER_HEIGHT), borderMat);
    wall.position.set((bounds.minX + bounds.maxX) / 2, BORDER_HEIGHT / 2, z);
    root.add(wall);
  }
  applyStageRise(-Infinity);
}

// タイトルの見た目にする: カメラを見下ろしの位置へ置き、ステージをすべて地面の下へしまう
function setupTitleStage() {
  camera.position.copy(TITLE_CAM_POS);
  camera.quaternion.copy(TITLE_CAM_QUAT);
  setViewModelsVisible(false);
  applyStageRise(-Infinity);
}

// ---- ステージ選択の背景 ----
// ステージ選択の間は、選んでいるステージの景色を地面から伸ばして見せ、カメラをそのステージの view へ寄せて左右にゆっくり流す。
// 見た目だけの箱なので、当たり判定もせり上がりの登録も持たない。選び直すと今の景色を沈めてから次を伸ばし、
// 戻るとタイトルの見下ろしへカメラを返す。入るときは帯で覆いきった裏で外す
const PREVIEW_GROW_TIME = 0.55; // 景色が伸びきる / 沈みきるまで
const PREVIEW_CAM_TIME = 0.9; // カメラが寄りきるまで
const PREVIEW_SWAY = 3; // カメラを左右へ流す幅 (m)
const PREVIEW_SWAY_SPEED = 0.15; // 流す速さ (rad/s)
const PREVIEW_REVEAL = 220; // 伸びきったときに床のグリッドを出す半径 (m)
const TITLE_RISE_ORIGIN = riseOrigin.value.clone();
const previews = new Map<StageId, { root: THREE.Group; layout: StageLayout }>();
let previewShown: StageId | null = null; // 今出ている景色（沈めている途中も含む）
let previewWant: StageId | null = null; // 出したい景色。null = タイトルへ戻す
let previewK = 0; // 景色の伸び具合 (0..1)
let previewTime = 0; // カメラを流す時間
let previewCamK = 1; // カメラの寄せ具合 (0..1)。1 で寄りきった
const previewCamFromPos = new THREE.Vector3();
const previewCamFromQuat = new THREE.Quaternion();
const previewEye = new THREE.Vector3();
const previewLook = new THREE.Vector3();
const previewQuat = new THREE.Quaternion();
const previewMatrix = new THREE.Matrix4();

function getStagePreview(id: StageId) {
  let p = previews.get(id);
  if (p) return p;
  const layout = STAGE_BUILDERS[id]();
  const root = new THREE.Group();
  for (const group of groupStageBoxes([...layout.boxes, ...layout.decor, ...layout.scenery])) {
    const mesh = new THREE.InstancedMesh(boxGeo, stageMaterial(group[0]), group.length);
    group.forEach((b, i) => {
      const y0 = b.y0 ?? 0;
      mesh.setMatrixAt(i, boxMatrix.makeScale(b.maxX - b.minX, b.h - y0, b.maxZ - b.minZ).setPosition(b.minX, y0, b.minZ));
      mesh.setColorAt(i, boxColor.setHSL(0, 0, b.light));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  for (const group of groupStageBoxes(layout.ramps ?? [])) {
    const mesh = new THREE.InstancedMesh(wedgeGeo, stageMaterial(group[0]), group.length);
    group.forEach((r, i) => {
      mesh.setMatrixAt(i, rampMatrix(r, r.h - r.y0, boxMatrix));
      mesh.setColorAt(i, boxColor.setHSL(0, 0, r.light));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  addStageLines(layout, root);
  root.visible = false;
  scene.add(root);
  p = { root, layout };
  previews.set(id, p);
  return p;
}

// 初めて選んだときに組むと引っかかるので、タイトルを見ている間の空き時間に 1 つずつ組んでおく
function prebuildStagePreviews() {
  const ids = stageButtons.map((b) => b.dataset.stage).filter((id): id is StageId => !!id && id in STAGE_BUILDERS);
  const idle = (fn: () => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200);
  const next = () => {
    const id = ids.shift();
    if (!id) return;
    getStagePreview(id);
    idle(next);
  };
  idle(next);
}

// ステージ選択で選んでいるステージを背景に出す（null でタイトルへ戻す）
function showStagePreview(id: StageId | null) {
  if (id === previewWant) return;
  previewWant = id;
  previewCamFromPos.copy(camera.position);
  previewCamFromQuat.copy(camera.quaternion);
  previewCamK = 0;
  if (id) getStagePreview(id); // 沈めている間に組んでおく
}

// 画が動いたかを返す（動いていなければ描き直さなくてよい）
function updateStagePreview(dt: number) {
  if (!previewWant && !previewShown && previewCamK >= 1) return false;
  // 武器の選択画面で覆っている間は、組み上がって寄りきっていれば揺らさずに止めて描き直さない（閉じたら続きから揺れる）
  if (pickerOpen() && previewShown === previewWant && previewK >= 1 && previewCamK >= 1) return false;
  previewTime += dt;
  // 景色: 出したいものと違うものが出ていれば沈め、沈みきったら入れ替えて伸ばす
  if (previewShown !== previewWant) {
    previewK = Math.max(0, previewK - dt / PREVIEW_GROW_TIME);
    if (previewK <= 0 || !previewShown) {
      if (previewShown) previews.get(previewShown)!.root.visible = false;
      previewShown = previewWant;
      previewK = 0;
      if (previewShown) {
        const { root, layout } = previews.get(previewShown)!;
        root.visible = true;
        riseOrigin.value.set(layout.start.x, layout.start.z);
      } else {
        riseOrigin.value.copy(TITLE_RISE_ORIGIN);
      }
    }
  } else if (previewShown) {
    previewK = Math.min(1, previewK + dt / PREVIEW_GROW_TIME);
  }
  if (previewShown) {
    const e = easeOutQuart(previewK);
    previews.get(previewShown)!.root.scale.y = Math.max(e, 1e-3);
    groundReveal.value = e * PREVIEW_REVEAL;
  } else {
    groundReveal.value = 0;
  }
  // カメラ: 寄せる先は、選んでいるステージの view を左右に流したもの。無ければタイトルの見下ろし
  if (previewWant) {
    const { eye, target } = previews.get(previewWant)!.layout.view;
    previewLook.set(target.x, target.y, target.z);
    previewEye.set(eye.x + Math.sin(previewTime * PREVIEW_SWAY_SPEED) * PREVIEW_SWAY, eye.y, eye.z);
    previewQuat.setFromRotationMatrix(previewMatrix.lookAt(previewEye, previewLook, UP));
  } else {
    previewEye.copy(TITLE_CAM_POS);
    previewQuat.copy(TITLE_CAM_QUAT);
  }
  previewCamK = Math.min(1, previewCamK + dt / PREVIEW_CAM_TIME);
  const c = easeInOutCubic(previewCamK);
  camera.position.lerpVectors(previewCamFromPos, previewEye, c);
  camera.quaternion.slerpQuaternions(previewCamFromQuat, previewQuat, c);
  return true;
}

// 景色をすべて外し、床のグリッドと波の中心をタイトルのときに戻す
function clearStagePreview() {
  for (const { root } of previews.values()) root.visible = false;
  previewShown = previewWant = null;
  previewK = 0;
  previewCamK = 1;
  riseOrigin.value.copy(TITLE_RISE_ORIGIN);
}

const transitionFx = document.getElementById('transition')!;
let introSwitched = false;
function startStageIntro() {
  introT = 0;
  introSwitched = false;
  transitionFx.classList.add('on');
  sfx.playTransition();
}

// 帯で覆いきった裏で、タイトルを消してプレイヤーを始めの位置へ移し、正面を水平に見る
function switchToStage() {
  introSwitched = true;
  clearStagePreview();
  if (pendingStage) {
    enterStage(pendingStage);
    wantWeapon = shownWeapon = selectedLoadout(); // 選んだ武器を構えた状態で始める
    holster = 0;
  }
  endOverlayLeave();
  camera.position.set(position.x, position.y + EYE_HEIGHT, position.z);
  camera.quaternion.identity();
  camera.fov = BASE_FOV + INTRO_FOV_BONUS;
  camera.updateProjectionMatrix();
  riseT = 0;
  sfx.playStageRise(INTRO_RISE_DELAY);
}

function updateStageIntro(dt: number) {
  introT += dt;
  if (!introSwitched) {
    if (introT >= INTRO_SWITCH_TIME) switchToStage();
    return;
  }
  // 帯が抜けるのに合わせて、少し広げた視野から元へ縮めて像を結ぶ
  const k = THREE.MathUtils.clamp((introT - INTRO_REVEAL_TIME) / INTRO_APPEAR_TIME, 0, 1);
  camera.fov = BASE_FOV + (1 - easeOutQuart(k)) * INTRO_FOV_BONUS;
  camera.updateProjectionMatrix();
  // ゲームの時間は止めているので、柱が収まったときの揺れはここで進めて収める
  trauma = Math.max(0, trauma - dt * 1.5);
  shakeTime += dt;
  const arenaDone = riseT < 0 || riseT - INTRO_RISE_DELAY >= arenaRiseEnd;
  if (titleT >= 0) {
    titleT += dt;
    // 叩きつけた瞬間に視野をぐっと絞り、すぐ戻す
    camera.fov = BASE_FOV - TITLE_FOV_PUNCH * (1 - easeOutQuart(Math.min(1, titleT / TITLE_FOV_BACK)));
    camera.updateProjectionMatrix();
    if (stageTitle.update(titleT)) finishStageIntro();
  } else if (pendingStage) {
    // ステージでは、組み上がりきった瞬間にタイトルを叩きつけてから操作を返す。
    // 叩きつけの少し前から高まる音を鳴らし始め、鳴り終わる瞬間に叩きつける
    const untilAppear = INTRO_REVEAL_TIME + INTRO_APPEAR_TIME - introT;
    const untilBuilt = riseT < 0 ? 0 : arenaRiseEnd - (riseT - INTRO_RISE_DELAY);
    if (titleRiserT < 0 && Math.max(untilAppear, untilBuilt) <= sfx.TITLE_RISER_TIME) {
      titleRiserT = 0;
      sfx.playTitleRiser();
    }
    if (titleRiserT >= 0) titleRiserT += dt;
    if (k >= 1 && arenaDone && titleRiserT >= sfx.TITLE_RISER_TIME) startStageTitle();
  } else if (k >= 1 && arenaDone) {
    finishStageIntro();
  }
}

// ---- ステージの始まりのタイトル ----
const TITLE_FOV_PUNCH = 7;
const TITLE_FOV_BACK = 0.4;
const stageTitle = createStageTitle(camera, renderer);
let stageRoot: THREE.Object3D | null = null; // 入ったステージの箱を持つ親（タイトルのマスクを描くのに使う）
function renderTitleMask() {
  if (titleT >= 0 && stageRoot) stageTitle.renderMask([stageRoot], scene);
}
let titleT = -1; // タイトルを出してからの時間。-1 = 出していない
let titleRiserT = -1; // 叩きつけの前の高まる音を鳴らしてからの時間。-1 = まだ鳴らしていない
function startStageTitle() {
  titleT = 0;
  stageTitle.start();
  stageTitle.update(0);
  sfx.playTitleSlam();
  addTrauma(0.55);
}

function finishStageIntro() {
  introT = -1;
  titleT = -1;
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  // 武器を画面の下から構える
  holster = 1;
  // 演出の間に押されたキーは捨てる（押しっぱなしの移動はそのまま効かせる）
  pressed.clear();
  attackPressed = false;
  document.body.classList.remove('on-title');
  if (stageRun) stageRun.running = true; // 操作を返したところから時間を測る
}

// 訓練場の的: 動かずに、倒されてもその場で起き上がる
setEn(createEnemy(false));
en.root.position.set(0, 0, -10);
en.riseDelay = riseDelayAt(0, -10);

// ---- ループ ----
const debugParams = new URLSearchParams(location.search);
const debugAttack = ATTACKS[debugParams.get('attack') ?? ''];
const debugSword = SWORD_ATTACKS[debugParams.get('sword') ?? ''];
const debugAxe = AXE_ATTACKS[debugParams.get('axe') ?? ''];
if (debugAttack) {
  runAttackDebug(debugAttack, debugParams);
} else if (debugSword) {
  runSwordDebug(debugSword, debugParams);
} else if (debugAxe) {
  runAxeDebug(debugAxe, debugParams);
} else if ((debugParams.get('stage') ?? '') in STAGE_BUILDERS) {
  runStageDebug(debugParams);
} else if (debugParams.has('focus')) {
  runFocusDebug(debugParams);
} else if (debugParams.has('grapple')) {
  runGrappleDebug(debugParams);
} else {
  // スコアの演出を確かめる: ?score で、倒し方の組み合わせを変えながら繰り返し出す
  if (debugParams.has('score')) {
    const demos: KillBonus[][] = [
      [],
      [{ label: 'SLIDE KILL', add: 1 }],
      [{ label: 'PARRY KILL', add: 2 }, { label: 'SLIDE KILL', add: 1 }, { label: 'AERIAL', add: 0.5 }],
      [{ label: 'LONG SHOT', detail: '27M', add: 1.5 }, { label: 'WALL RUN', add: 1 }],
    ];
    let demo = 0;
    const next = () => showKillScore(demos[demo++ % demos.length]);
    next();
    setInterval(next, 3500);
  }
  setupTitleStage();
  prebuildStagePreviews();
  restoreRetry();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const rawFrame = clock.getDelta();
    const realFrame = Math.min(rawFrame, 0.05);
    // パッドの視点は「倒している時間 × 速さ」で回すので、重いフレームで時間を切ると回り足りずに引っかかる。
    // 視点だけは実際にかかった時間で回す（タブを離れていたときの大きな飛びだけは抑える）
    updatePad(Math.min(rawFrame, 0.25));
    // タイトルと一時停止の間はゲームの時間を止める。画が止まっている間は描き直さず、キャンバスに残った画を見せておく
    if (!controls.isLocked) {
      pressed.clear();
      attackPressed = false;
      if (updateStagePreview(realFrame) || menuRedraw) {
        menuRedraw = false;
        applyCameraOffset();
        composer.render(0);
        camera.quaternion.copy(savedQuat);
      }
      return;
    }
    updateStageRise(realFrame);
    // 訓練場へ入る演出の間は、ゲームの時間を進めない（見回すことだけできる）
    if (introT >= 0) {
      updateStageIntro(realFrame);
      applyCameraOffset();
      renderTitleMask();
      composer.render(realFrame);
      camera.quaternion.copy(savedQuat);
      return;
    }
    updateStageRun(realFrame);
    updatePlayerDown(realFrame);
    // 倒した直後とパリィの後、倒れた後のスローは、演出も含めて全体にかける
    const slow = killSlowFactor(realFrame) * parrySlowFactor(realFrame) * downSlowFactor();
    const dt = realFrame * slow;
    if (hitStop > 0) {
      // ヒットストップ中は全体を止める（入力は溜めておき、揺れだけ続ける）
      hitStop -= realFrame;
      shakeTime += realFrame;
    } else {
      realDt = realFrame;
      update(dt * timeScale);
    }
    updateDummyShake();
    updateHitFx(dt); // 光の演出はヒットストップ中も動かして、止まった画に勢いを残す
    updateSpeedFx(dt);
    updateHpHud(realFrame);
    updateScoreHud(realFrame);
    updateHudSway(realFrame);
    sfx.updateAudio({
      speed: controls.isLocked ? Math.hypot(velocity.x, velocity.z) : 0,
      airborne: !player.onGround && !player.wallRunning,
      sliding: player.sliding && controls.isLocked,
      focusing,
      timeScale: timeScale * slow * worldSlow, // 世界だけのスローでも音はこもらせる
    });
    applyCameraOffset();
    updateFinishMark();
    placeDeadEyeMarks();
    composer.render(dt);
    camera.quaternion.copy(savedQuat);
  });
}

// ---- 画質 ----
// maxRatio: 描画の解像度（画面の画素に対する倍率の上限）、msaa: アンチエイリアスのサンプル数
const QUALITY_PRESETS: Record<Quality, { maxRatio: number; shadows: boolean; shadowMap: number; msaa: number }> = {
  low: { maxRatio: 0.75, shadows: false, shadowMap: 1024, msaa: 0 },
  medium: { maxRatio: 1, shadows: true, shadowMap: 1024, msaa: 2 },
  high: { maxRatio: 2, shadows: true, shadowMap: 2048, msaa: 4 },
};
function applyQuality() {
  const q = QUALITY_PRESETS[options.quality];
  const ratio = Math.min(window.devicePixelRatio, q.maxRatio);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  // サンプル数は描き込み先を作り直さないと変わらない（捨てておけば次に描くときに作り直される）
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    if (rt.samples === q.msaa) continue;
    rt.samples = q.msaa;
    rt.dispose();
  }
  composer.setPixelRatio(ratio);
  if (sun.shadow.mapSize.x !== q.shadowMap) {
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  setShadows(q.shadows && !shadowParamOff);
}
applyQuality();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  speedFxPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  impactFxPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  menuRedraw = true; // 大きさを変えるとキャンバスが消えるので、止まっている画面でも描き直す
});

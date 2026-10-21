import * as THREE from 'three';
import * as sfx from './audio.js';
import { ensureAudio, playHit, type HitKind } from './audio.js';
import { showKillScore, totalScore, updateScoreHud, type KillBonus } from './score.js';
import { finalScore, fmtTime, showResult, skipResult } from './result.js';
import { gameOverChoice, showGameOverView, stepGameOverMenu } from './gameOver.js';
import type { StageBox, StageLayout, StageRamp } from './stage.js';
import { buildStation } from './station.js';
import { buildWarehouse } from './warehouse.js';
import { buildParking } from './parking.js';
import { STAGE_TITLE_END, createStageTitle } from './stageTitle.js';
import { WEAPON_KEYS } from './weapons/ids.js';
import { rand } from './random.js';
import { DUMMY_ANKLE_Y, DUMMY_HEIGHT, DUMMY_LEG_X, DUMMY_RADIUS, buildEnemyBody } from './enemy/body.js';
import { updateControlsHud } from './ui/controlsHud.js';
import { GROUND_REVEAL_ALL, groundReveal, riseOrigin, withGroundReveal } from './world/reveal.js';
import {
  RISE_BASE_HEIGHT, RISE_BASE_TIME, RISE_FILL_DONE, RISE_FILL_START, RISE_SLAM_HEIGHT, RISE_WAVE, arenaRiseEnd,
  resetArenaRiseEnd, riseDelayAt, riseLines, riseMeshes, risers,
} from './world/rise.js';
import {
  STRUCT_GRID, TERRAIN_GRID, addBoxes, addRamps, blocks, boxColor, boxGeo, boxMatrix, floorAt, gridMaterial,
  rampMatrix, rampUpDir, ramps, wedgeGeo, type Block,
} from './world/blocks.js';
import { BORDER_HEIGHT, arenaRoot, borderMat, borderUniforms, groundLineMat, playBounds } from './world/arena.js';
import {
  HEAVY_FX, hitFxVisible, impact, initHitFx, spawnFinaleFx, spawnHitFx, spawnKillFx, spawnSparks, updateHitParticles,
} from './fx/hitFx.js';
import { addSlashScar, clearScars, updateScars } from './fx/scars.js';
import { initOptions, onOptionsClick, onOptionsKey, options, renderOptions, type Quality } from './ui/options.js';
import { hidePicker, onPickerClick, onPickerKey, openPicker, pickerOpen, selectedLoadout } from './ui/weaponPicker.js';
import { loadBest, saveBest } from './records.js';
import { env, initEnemyEnv } from './enemy/env.js';
import {
  DEFAULT_KNOCK, RESPAWN_RISE_TIME, RESPAWN_TIME, en, enemies, hitDir, hitLook, setEn, type Enemy,
} from './enemy/state.js';
import { isOnDummy, resetDummyStagger, spring, staggerDummy, updateDummyStagger } from './enemy/stagger.js';
import { breakDummy, clearDebris, updateDebris } from './enemy/debris.js';
import {
  AIR_TILT_KICK, ENEMY_SPIKE_BOUNCE, ENEMY_WAIT_MAX, ENEMY_WAIT_MIN, playerEye, playerLook, poseEnemyTumble,
  updateEnemyAir, updateEnemyGait, updateEnemyKnock, updateEnemyMove, updateEnemyTumble,
} from './enemy/motion.js';
import { DEG, UP, wrapAngle } from './math.js';
import {
  AIR_ACCEL, AIR_TURN_RATE, BASE_FOV, DASH_CHARGES, DASH_COOLDOWN, DASH_EXIT_SPEED, DASH_RECHARGE, DASH_SPEED,
  DASH_TIME, EYE_HEIGHT, GRAVITY, GROUND_ACCEL, GROUND_FRICTION, GROUND_TURN_RATE, JUMP_SPEED, OVERSPEED_DECAY,
  PLAYER_RADIUS, SLIDE_BOOST, SLIDE_BOOST_COOLDOWN, SLIDE_BOOST_MAX, SLIDE_END_SPEED, SLIDE_FRICTION,
  SLIDE_START_SPEED, SLIDE_TURN_RATE, SPRINT_SPEED, WALK_SPEED, WALLJUMP_OUT, WALLJUMP_UP, WALLRUN_ACCEL,
  WALLRUN_GRAVITY, WALLRUN_MAX_FALL, WALLRUN_SPEED,
} from './player/config.js';
import {
  dashDir, forward, lookEuler, player, position, right, velocity, wallNormal, wallTangent, wish,
} from './player/state.js';
import {
  RAMP_SLIDE_GRAVITY, canKeepWallRun, collideBox, collideCylinder, collideRamp, endWallRun, initMovement, moveToward,
  rotateHorizontalToward, setHorizontalSpeed, steerHorizontal, tryMantle, tryMantleBox, tryStartWallRun,
  updateMantle,
} from './player/movement.js';
import { keys, padMove, pressed } from './input.js';
import { easeInOutCubic, easeOutCubic, easeOutQuart } from './ease.js';
import { ATTACKS, DASH_SLASH, SLASH_1, SLIDE_UP, type AttackDef, type HitDef } from './weapons/kunaiAttacks.js';
import {
  SWORD_ATTACKS, SWORD_CHARGE_SLASH, SWORD_ISSEN, SWORD_KESA, SWORD_SWEEP, SWORD_THRUST, type SwordAttackDef,
} from './weapons/swordAttacks.js';
import { AXE_ATTACKS, AXE_DRIVE, AXE_KESA, type AxeAttackDef } from './weapons/axeAttacks.js';
import { camera, controls, renderer, scene } from './core.js';
import { DEFAULT_HIT_STOP, game, kickVel } from './game/state.js';
import {
  axeViewModel, gunViewModel, heldAxeModel, kunai, leftViewModel, sickleViewModel, sword, swordViewModel, viewModel,
} from './weapons/viewModels.js';
import {
  AXE_SHOCK_HIT, applyAxePose, axePoseAt, axeState, axeTrailPose, spawnAxeShock, startAxeAttack, updateAxeAttack,
  updateAxeShocks,
} from './weapons/axeCombat.js';
import { initGameHooks } from './game/hooks.js';
import {
  FOCUS_DIM, LOCK_HEIGHT, applySwordPose, chargeFocus, startSwordAttack, swordPoseAt, swordState, swordTrailPose,
  updateChargeDash, updateRush, updateSwordAttack,
} from './weapons/swordCombat.js';
import {
  BULLET_HIT, DEADEYE_HIT, GUN_AMMO, GUN_RELOAD_TIME, MUZZLE_FLASH_LIFE, PARRY_RETURN_HIT, RELOAD_EVENTS,
  applyGunSpin, deadEyeMarks, endDeadEye, endReload, endSlideSpin, endTwirl, evalReloadPose, fireGun, gunCylinder,
  gunReady, gunState, muzzleFlash, placeDeadEyeMarks, poseReloadParts, startReload, updateBullets, updateCasings,
  updateDeadEye, updateSlideSpin, updateTwirl,
} from './weapons/handgunCombat.js';
import {
  GRAPPLE_STICK_HIT, HOOK_CHARGES, SICKLE_DAMAGE_SCALE, SICKLE_DASH_HIT, SICKLE_DASH_LAST, SICKLE_KESA_HIT,
  SICKLE_PULL_HIT, SICKLE_PULL_LAST, sickleState, updateGrapple, updateGrapplePull, updateSickleMelee,
} from './weapons/sickleCombat.js';
import {
  WORLD_SLOW_RING_TIME, WORLD_SLOW_SCALE, applyLunge, applyPose, attackPoseAt, kunaiState, startAttack, startReturn,
  thrown, tmpPose, updateAttack, updateKunaiPose, updateThrow, worldSlowFactor,
} from './weapons/kunaiCombat.js';
import { ammoHud, ammoPips, updateWeaponHud } from './ui/weaponHud.js';
import { ENEMY_FIRST_SHOT, attachEnemyGun, updateDummyAim, updateEnemyBullets, updateEnemyFire } from './enemy/fire.js';
import { PARRY_INVERT_TIME, parryMono, parrySlowFactor, parryState } from './combat/parry.js';
import { updateHudSway } from './ui/hudSway.js';
import { updateHandCam } from './fx/handCam.js';
import {
  addTrauma, applyCameraOffset, cameraFx, onDash, onLand, onMantleEnd, onMantleStart, onSlideStart, onWallJump,
  onWallRunStart, restoreCameraOffset, savedQuat, updateCamera, updateKick,
} from './fx/camera.js';
import { GAMEOVER_DELAY, downFall, downSlowFactor, isDown } from './player/down.js';
import { dashGauges, healPlayer, showPlayerDamage, updateHookHud, updateHpHud } from './ui/hud.js';
import { updateViewModel, updateWeaponSwitch, viewState } from './weapons/viewModelMotion.js';
import { composer, hitFxRenderPass, impactFxPass, speedFxPass, updateSpeedFx } from './fx/post.js';
import { overlay } from './ui/overlay.js';
import { turnView, zoomLookScale } from './player/look.js';
import { padState, updatePad } from './player/padControls.js';

// ---- 基本セットアップ ----
// レンダラー・シーン・カメラは core.ts、武器や演出をまたいで共有している値は game/state.ts

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

// ---- 武器の手元のモデル ----（weapons/viewModels.ts）

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
let menuRedraw = true; // 止まっているメニューの画面で、次のフレームに 1 度だけ描き直す
let padPlaying = false;
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
function startFromOverlay() {
  ensureAudio(); // 音はユーザー操作の中でしか始められない
  showPanel(null);
  // パッドのボタンはブラウザがユーザー操作とみなさないので、ポインターロックを始められない。ロックなしで始める
  if (padState.fromPad) {
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
  } else if (e.code === 'KeyG' && !e.repeat) {
    // 聴き比べ用: G で UI の音の案を切り替え、決定の音を鳴らす
    showToast(`UI の音: ${sfx.cycleUiVariant()}`);
    sfx.playUiSelect();
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
  if (move > 2) game.usingPad = false; // マウスに持ち替えたらエイムアシストを切る

  const look = LOOK_SPEED * options.mouseSens * zoomLookScale();
  turnView(e.movementX * look, e.movementY * look);
});

window.addEventListener('keydown', (e) => {
  if (!controls.isLocked) return; // タイトル / 一時停止の間のキーはゲームに渡さない
  // ロックしていないと Esc でロックが外れないので、自分で一時停止にする
  if (e.code === 'Escape' && padPlaying) return pauseGame();
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);
  if (WEAPON_KEYS[e.code]) game.wantWeapon = WEAPON_KEYS[e.code];
  if (e.code === 'KeyR' && !e.repeat) gunState.reloadQueued = sickleState.tossPressed = true;
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

document.addEventListener('mousedown', (e) => {
  // パッドで遊んでいる途中でマウスに持ち替えたら、そのクリックでロックする
  if (padPlaying && !document.pointerLockElement) lockPointer();
  if (controls.isLocked && e.button === 0) {
    game.attackPressed = true;
    game.attackHeld = true;
  }
  if (controls.isLocked && e.button === 1) {
    e.preventDefault(); // 自動スクロールを出さない
    axeState.axeDrivePressed = true;
  }
  if (controls.isLocked && e.button === 2) game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = gunState.deadEyePressed = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) game.attackHeld = false;
  if (e.button === 2) game.throwHeld = false;
});
window.addEventListener('blur', () => (game.attackHeld = false));
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== document.body) return;
  viewState.lookSwayX = THREE.MathUtils.clamp(viewState.lookSwayX + e.movementX * 0.0005, -0.06, 0.06);
  viewState.lookSwayY = THREE.MathUtils.clamp(viewState.lookSwayY + e.movementY * 0.0005, -0.06, 0.06);
});

// ---- ゲームパッドの割り当て ----（player/padControls.ts）

// ---- HUD: ダッシュ・鎖鎌の残り回数と体力 ----（ui/hud.ts。体力を減らす処理は damagePlayer）

function damagePlayer(amount: number) {
  if (game.playerHp <= 0 || amount <= 0) return;
  if (stageRun?.running) stageRun.damage += amount;
  const before = game.playerHp;
  // ステージでは 0 で倒れる。訓練場（と倒しきった後）は死なず、1 で耐えて被弾の演出だけを出す
  game.playerHp = Math.max(stageRun?.running ? 0 : 1, game.playerHp - amount);
  if (game.playerHp <= 0) downPlayer();
  showPlayerDamage(amount, before);
}

// ---- 倒れる ----
function downPlayer() {
  if (isDown() || !stageRun) return;
  game.downT = 0;
  stageRun.running = false;
  game.hitStop = Math.max(game.hitStop, 0.14);
  game.hitStopTotal = game.hitStop;
  addTrauma(1);
  game.fovKick += 10;
  if (game.deadEye !== 'off') endDeadEye();
  sfx.playDeath();
  document.body.classList.add('player-down');
}
// 倒れている間は、押したものを全部捨てる（押しっぱなしの移動も、溜めた攻撃も効かせない）
function dropPlayerInput() {
  keys.clear();
  pressed.clear();
  game.attackPressed = game.attackHeld = game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = axeState.axeDrivePressed = gunState.deadEyePressed = false;
  gunState.reloadQueued = sickleState.tossPressed = false;
  padMove.x = padMove.y = 0;
  padState.padSprint = false;
}
function updatePlayerDown(realDt: number) {
  if (!isDown()) return;
  const shown = game.downT >= GAMEOVER_DELAY;
  game.downT += game.realDt;
  dropPlayerInput();
  if (!shown && game.downT >= GAMEOVER_DELAY && stageRun) showGameOver(stageRun);
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
  axeState.axeSlamRecover = Math.max(0, axeState.axeSlamRecover - dt);
  const stuck = axeState.axeSlamRecover > 0; // 叩きつけの硬直中は、歩く・跳ぶ・ダッシュ・スライディングを受け付けない
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
  const sprinting = locked && (keys.has('ShiftLeft') || keys.has('ShiftRight') || padState.padSprint);
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
  if (locked && !stuck && player.mantleTime < 0 && swordState.rushTime < 0 && swordState.chargeDashTime <= 0 && [...pressed].some(isSprintKey) && player.dashCharges > 0 && player.dashCooldown <= 0) {
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
  if (swordState.rushTime >= 0) {
    updateRush(dt);
  } else if (swordState.chargeDashTime > 0) {
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
  if (locked && !stuck && player.onGround && player.dashTime <= 0 && swordState.rushTime < 0 && swordState.chargeDashTime <= 0 && keys.has('Space')) {
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

  if (player.dashTime <= 0 && swordState.rushTime < 0 && swordState.chargeDashTime <= 0) velocity.y -=(player.wallRunning ? WALLRUN_GRAVITY : GRAVITY) * dt;
  if (player.wallRunning) velocity.y = Math.max(velocity.y, -WALLRUN_MAX_FALL);
  // 鎖鎌が掛かっている間は、ここまでの速度を引き寄せる向きへ置き換える
  if (sickleState.grapple?.phase === 'pull') updateGrapplePull(dt);

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
    if (locked && !player.onGround && swordState.rushTime < 0) {
      // 鎖鎌で引き寄せた勢いは、よじ登った後へ持ち越さない（引き寄せる前の速さまでに抑える）
      const mantleSpeed = sickleState.grapple && sickleState.grapple.pullTime > 0 ? Math.min(hSpeed, sickleState.grapple.speedBefore) : hSpeed;
      let mantled = enemies.some((e) => e.alive && tryMantle(e.root.position.x, e.root.position.z, DUMMY_RADIUS, e.root.position.y + DUMMY_HEIGHT, mantleSpeed));
      for (const b of blocks) {
        if (mantled) break;
        mantled = tryMantleBox(b, mantleSpeed);
      }
      // 引き寄せの最中は壁走りを始めない（壁沿いに引かれる速さを壁走りが拾ってしまう）
      if (!mantled && !player.wallRunning && player.dashTime <= 0 && swordState.chargeDashTime <= 0 && sickleState.grapple?.phase !== 'pull') tryStartWallRun();
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
  updateKick(dt);
  updateKunaiPose(dt);
  kunaiState.worldSlow = worldSlowFactor(dt);
  updateEnemies(dt * kunaiState.worldSlow);
  updateSwordAttack(dt);
  updateAxeAttack(dt);
  updateThrow(dt);
  updateSickleMelee(dt);
  updateGrapple(dt);
  updateGun(dt);
  updateHandCam(dt);
}

// ---- カメラ演出 ----（fx/camera.ts）

// ---- 手元につられる視線 ----（fx/handCam.ts）

// ---- HUD の慣性 ----（ui/hudSway.ts）

// ---- 手元の武器の動き ----（持ち替え・揺れ・構えの切り替えは weapons/viewModelMotion.ts）

// ---- 被弾の演出 ----
const FLASH_HOLD = 0.05; // 真っ白のまま保つ時間
const FLASH_FADE = 0.12; // そこから元の色へ戻る時間

// 体力: 0 になると体ごと砕け散り、しばらくするとその場で生えるように起き上がる
const DUMMY_MAX_HP = 100;
const HIT_DAMAGE: Record<HitKind, number> = { kunai: 14, sword: 18, throw: 15, bullet: 30, axe: 24 }; // fx = 1 のときの量
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
  game.hitStop = Math.max(game.hitStop, def.hitStop ?? DEFAULT_HIT_STOP);
  game.hitStopTotal = game.hitStop;
  game.hitStopShakesDummy = true;
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
  game.hitStop = Math.max(game.hitStop, finale ? FINALE_HIT_STOP : KILL_HIT_STOP);
  game.hitStopTotal = game.hitStop;
  killSlowTime = 0;
  addTrauma(finale ? 1 : 0.45);
  game.fovKick += finale ? 18 : 9;
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
  sickleState.hookCharges = Math.min(HOOK_CHARGES, sickleState.hookCharges + 1); // 鎖鎌の引き寄せは 1 回分だけ戻す
  if (sickleState.hookCharges >= HOOK_CHARGES) sickleState.hookRecharge = 0;
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
let lastAnyHitAt = -Infinity; // どの敵かを問わず、最後に当てた時刻（実時間）
function trackHitProcess(def: HitDef, kind: HitKind) {
  const now = performance.now() / 1000;
  // 投げたクナイや撃った弾は、着く前に持ち替えていても、放った武器で数える
  en.weapons.add(kind === 'throw' ? 'kunai' : def === BULLET_HIT || def === DEADEYE_HIT ? 'handgun' : game.shownWeapon);
  if (en.hits > 0 && now - en.lastHitAt > HIT_COUNT_WINDOW) en.comboKept = false;
  if (now - lastAnyHitAt <= SPIN_WINDOW && Math.abs(game.viewSpin) >= Math.PI * 2) en.spun = true;
  if (def === PARRY_RETURN_HIT) en.parried = true;
  en.hits++;
  en.lastHitAt = lastAnyHitAt = now;
  game.viewSpin = 0;
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
    stageRun.time += game.realDt;
    runTime.textContent = fmtTime(stageRun.time);
  } else if (stageRun.clearedT >= 0) {
    stageRun.clearedT += game.realDt;
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
  switch (game.shownWeapon) {
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
let shakeSide = 1;
let shakeEnemy: Enemy | null = null; // 震わせる敵（最後に当てた敵）
function updateDummyShake() {
  for (const e of enemies) poseEnemyTumble(e);
  if (game.hitStop <= 0 || !game.hitStopShakesDummy || !shakeEnemy) return;
  setEn(shakeEnemy);
  // 左右へ交互に振り、止まりきる前に弱めていく
  const k = DUMMY_SHAKE * Math.min(1, game.hitStop / Math.max(game.hitStopTotal, 1e-3));
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

// 刃先の位置から敵の表面の当たった所を求める（hitPointFromTip）ための作業用
const hitRay = new THREE.Ray();
const hitAxisA = new THREE.Vector3();
const hitAxisB = new THREE.Vector3();
const hitOnRay = new THREE.Vector3();
const hitOnAxis = new THREE.Vector3();
const hitOffset = new THREE.Vector3();

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
  playerHp: () => game.playerHp,
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
  return (sickleState.grapple?.enemy === en && sickleState.grapple.phase !== 'back') || (swordState.rushTime >= 0 && swordState.rushEnemy === en);
}
// ---- エイムアシスト ----（player/aimAssist.ts）

// ---- 鎖鎌 ----（weapons/sickleCombat.ts）

// ---- クナイ ----（weapons/kunaiCombat.ts）

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
  u.uDim.value = Math.max(Math.min(0.7, HIT_DIM * impact.power) * env, Math.max(swordState.focusBlend, gunState.deadEyeBlend) * FOCUS_DIM);

  // パリィ: 止まっている間は白黒のまま、最初の一瞬だけ白黒を反転させ、スローが明けるのに合わせて色を戻す
  // 最後の 1 体を倒したときも同じ白黒を使う
  u.uMono.value = Math.max(parryMono(), finaleMono(), downFall()); // 倒れたときも白黒にしていく
  u.uDim.value = Math.max(u.uDim.value, downFall() * 0.35);
  u.uInvert.value = parryState.parryFxAge < PARRY_INVERT_TIME || (finale && killSlowTime < FINALE_INVERT_TIME) ? 1 : 0;
  // 世界のスロー: 遅さに合わせて色を抜き、入った瞬間だけ輪を広げる
  // 一瞬で切り替えず、少しなめらかに寄せる
  const slowWant = (1 - kunaiState.worldSlow) / (1 - WORLD_SLOW_SCALE);
  u.uSlow.value += (slowWant - u.uSlow.value) * Math.min(1, dt * 18);
  const ring = kunaiState.worldSlowRingAge / WORLD_SLOW_RING_TIME;
  u.uRing.value = easeOutCubic(Math.min(ring, 1)) * 1.1;
  u.uRingAmt.value = ring < 1 ? (1 - ring) ** 2 : 0;
  // 効果が無いときは全画面の処理ごと飛ばす
  impactFxPass.enabled = u.uDim.value > 0.001 || u.uMono.value > 0.001 || u.uSlow.value > 0.001 || u.uRingAmt.value > 0.001;
  // 光が 1 つも出ていないときは、光を重ねる描画ごと飛ばす
  // 光が 1 つも出ていないときは、光を重ねる描画ごと飛ばす
  hitFxRenderPass.enabled = hitFxVisible();
}

// ---- 剣の攻撃 ----（weapons/swordCombat.ts）

// ---- 斧の攻撃 ----（weapons/axeCombat.ts）
// 武器のファイルから本体の処理を呼ぶためのフック
initGameHooks({
  addTrauma,
  applyHit: applyDummyHit,
  enemyHeld,
  inReachOf,
  dummyInReach,
  hitPointFromTip,
  applyLunge,
  grappling: () => sickleState.grapple !== null, applyCameraOffset, restoreCameraOffset, damagePlayer, pauseGame,
});

// ---- ハンドガン ----（weapons/handgunCombat.ts）

// ---- 敵の銃 ----（自動拳銃の持たせ方と敵の射撃は enemy/fire.ts）

// ---- パリィ ----（combat/parry.ts）

// ---- 右の操作一覧 ----（ui/controlsHud.ts）

function updateGun(dt: number) {
  gunState.gunCooldown = Math.max(0, gunState.gunCooldown - dt);
  updateDeadEye();
  // 頂点で一瞬止めたあと、腕で反動を押し戻すように重たく戻す
  if (gunState.gunRecoilHold > 0) gunState.gunRecoilHold -= dt;
  else gunState.gunRecoil += -gunState.gunRecoil * Math.min(1, dt * 8);

  if (!gunReady()) {
    // 持ち替えたら装填は最初からやり直す（薬莢を落とした後なら弾は空のまま）
    if (gunState.gunReloading) endReload();
    if (gunState.twirlT >= 0) endTwirl(false);
    endSlideSpin();
    gunState.fireQueued = false;
    gunState.reloadQueued = false;
  }
  if (gunState.reloadQueued) {
    gunState.reloadQueued = false;
    if (!gunState.gunReloading && gunState.gunAmmo < GUN_AMMO) startReload();
  }
  if (gunState.gunReloading) {
    // 装填中のクリックは溜めない（終わった瞬間に勝手に撃たないように）
    gunState.fireQueued = false;
    const prevT = gunState.gunReloadT;
    gunState.gunReloadT += dt;
    while (gunState.reloadEvent < RELOAD_EVENTS.length && gunState.gunReloadT >= RELOAD_EVENTS[gunState.reloadEvent].at) {
      RELOAD_EVENTS[gunState.reloadEvent++].fn();
    }
    if (prevT < GUN_RELOAD_TIME && gunState.gunReloadT >= GUN_RELOAD_TIME) {
      endReload();
    } else {
      evalReloadPose(gunState.gunReloadT);
      poseReloadParts(gunState.gunReloadT);
    }
  } else if (gunState.fireQueued && gunState.gunCooldown <= 0) {
    gunState.fireQueued = false;
    if (gunState.gunAmmo > 0) fireGun();
    else startReload();
  }
  // 撃ち尽くしたら、反動が収まったところで自動で装填する
  if (gunReady() && !gunState.gunReloading && gunState.gunAmmo === 0 && gunState.gunCooldown <= 0) startReload();

  // シリンダーは撃つたびに次の薬室へ素早く回す。弾いたときは惰性で回り続ける
  if (gunState.cylinderSpin > 0) {
    gunCylinder.rotation.z += gunState.cylinderSpin * dt;
    gunState.cylinderSpin *= Math.exp(-2 * dt);
    gunState.cylinderTarget = gunCylinder.rotation.z;
  } else {
    // 一発ごとに次の薬室へ回る動きが目で追えるよう、少しゆっくり寄せる
    gunCylinder.rotation.z += (gunState.cylinderTarget - gunCylinder.rotation.z) * Math.min(1, dt * 14);
  }

  updateTwirl(dt);
  updateSlideSpin(dt);
  applyGunSpin(dt);
  updateCasings(dt);

  gunState.muzzleFlashAge += dt;
  muzzleFlash.visible = gunState.muzzleFlashAge < MUZZLE_FLASH_LIFE;

  updateBullets(dt);

  ammoHud.classList.toggle('hidden', game.shownWeapon !== 'handgun');
  ammoHud.classList.toggle('reloading', gunState.gunReloading);
  // 印を付けた分の弾は、撃つ順に右から光らせる
  const marked = game.deadEye === 'mark' ? deadEyeMarks.length : deadEyeMarks.filter((m) => !m.done).length;
  ammoPips.forEach((p, i) => {
    p.classList.toggle('spent', i >= gunState.gunAmmo);
    p.classList.toggle('marked', i < gunState.gunAmmo && i >= gunState.gunAmmo - marked);
  });
  updateWeaponHud();
  updateControlsHud(game.shownWeapon, game.usingPad);
}

// ---- ポストエフェクト ----（fx/post.ts）

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
    while (kunaiState.attack && kunaiState.attackTime + step <= tEnd) {
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
  game.wantWeapon = game.shownWeapon = 'sword';
  const step = 1 / 120;
  if (params.has('near')) position.set(en.root.position.x, 0, en.root.position.z + 1.6);
  for (let i = 0; i < 30; i++) update(step);
  startSwordAttack(def);
  const tEnd = Number(params.get('t') ?? def.duration);
  if (!params.has('onion')) {
    while (swordState.swordAttack && swordState.swordTime + step <= tEnd) {
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
  game.wantWeapon = game.shownWeapon = 'axe';
  const step = 1 / 120;
  if (params.has('near')) position.set(en.root.position.x, 0, en.root.position.z + 1.8);
  for (let i = 0; i < 30; i++) update(step);
  startAxeAttack(def);
  const tEnd = Number(params.get('t') ?? def.duration);
  if (!params.has('onion')) {
    while (axeState.axeAttack && axeState.axeTime + step <= tEnd) {
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
      if (i % 60 === 0) log.push(`${r(i * step)}s hp=${game.playerHp} ` + enemies.map((e) => `(${r(e.root.position.x)},${r(e.root.position.y)},${r(e.root.position.z)}${e.moving ? ' walk' : ''})`).join(' '));
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
  game.wantWeapon = game.shownWeapon = 'sword';
  controls.isLocked = true;
  const step = 1 / 120;
  position.set(en.root.position.x + 1.5, 0, en.root.position.z + 9);
  for (let i = 0; i < 30; i++) update(step);
  game.throwHeld = swordState.focusPressed = true;
  swordState.focusCharge = 1;
  const tick = () => {
    game.realDt = step;
    update(step * game.timeScale);
    updateHitFx(step);
  };
  for (let t = 0; t < Number(params.get('focus') ?? 0.5); t += step) tick();
  if (params.has('rush')) {
    swordState.swordPressed = true;
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
  game.wantWeapon = game.shownWeapon = 'sickle';
  controls.isLocked = true;
  const step = 1 / Number(params.get('fps') ?? 120);
  const wAt = Number(params.get('wAt') ?? 0); // W を押し始める時刻 (s)
  // 台 (10..15, 15..20, 高さ 2) の z = 15 の面を、正面 (+z) から見る
  position.set(12.5, 0, 15 - Number(params.get('dist') ?? 8));
  lookEuler.set(-Number(params.get('pitch') ?? 0) * DEG, Math.PI, 0);
  camera.quaternion.setFromEuler(lookEuler);
  for (let i = 0; i < 30; i++) update(step);
  game.throwHeld = sickleState.throwPressed = true;
  const log: string[] = [];
  for (let t = 0; t < 2; t += step) {
    if (t >= 0.2) game.throwHeld = false;
    if (!params.has('now') && t >= wAt) keys.add('KeyW');
    if (params.has('shift')) keys.add('ShiftLeft');
    update(step);
    const r = (v: number) => v.toFixed(2);
    log.push(`${r(t)} ${sickleState.grapple?.phase ?? '-'} pos(${r(position.x)},${r(position.y)},${r(position.z)}) vel(${r(velocity.x)},${r(velocity.y)},${r(velocity.z)}) h=${r(Math.hypot(velocity.x, velocity.z))} mantle=${r(player.mantleTime)} ground=${player.onGround}`);
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
    game.wantWeapon = game.shownWeapon = selectedLoadout(); // 選んだ武器を構えた状態で始める
    game.holster = 0;
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
  cameraFx.trauma = Math.max(0, cameraFx.trauma - dt * 1.5);
  cameraFx.shakeTime += dt;
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
  game.holster = 1;
  // 演出の間に押されたキーは捨てる（押しっぱなしの移動はそのまま効かせる）
  pressed.clear();
  game.attackPressed = false;
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
      game.attackPressed = false;
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
    if (game.hitStop > 0) {
      // ヒットストップ中は全体を止める（入力は溜めておき、揺れだけ続ける）
      game.hitStop -= realFrame;
      cameraFx.shakeTime += realFrame;
    } else {
      game.realDt = realFrame;
      update(dt * game.timeScale);
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
      focusing: swordState.focusing,
      timeScale: game.timeScale * slow * kunaiState.worldSlow, // 世界だけのスローでも音はこもらせる
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

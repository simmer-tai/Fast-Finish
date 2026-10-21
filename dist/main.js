import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SICKLE_VIEW_MODEL_POS } from './weapons/chainSickle.js';
import { AXE_VIEW_MODEL_POS } from './weapons/battleAxe.js';
import { CHAKRAM_VIEW_MODEL_POS } from './weapons/chakram.js';
import * as sfx from './audio.js';
import { ensureAudio, playGrip, playHit, playRing, playSwish } from './audio.js';
import { showKillScore, totalScore, updateScoreHud } from './score.js';
import { finalScore, fmtTime, showResult, skipResult } from './result.js';
import { gameOverChoice, showGameOverView, stepGameOverMenu } from './gameOver.js';
import { buildStation } from './station.js';
import { buildWarehouse } from './warehouse.js';
import { buildParking } from './parking.js';
import { STAGE_TITLE_END, createStageTitle } from './stageTitle.js';
import { PAD, pollPad } from './gamepad.js';
import { WEAPON_KEYS } from './weapons/ids.js';
import { rand } from './random.js';
import { DUMMY_ANKLE_Y, DUMMY_FOREARM, DUMMY_HEIGHT, DUMMY_LEG_X, DUMMY_RADIUS, DUMMY_UPPER_ARM, buildEnemyBody, } from './enemy/body.js';
import { updateControlsHud } from './ui/controlsHud.js';
import { GROUND_REVEAL_ALL, groundReveal, riseOrigin, withGroundReveal } from './world/reveal.js';
import { RISE_BASE_HEIGHT, RISE_BASE_TIME, RISE_FILL_DONE, RISE_FILL_START, RISE_SLAM_HEIGHT, RISE_WAVE, arenaRiseEnd, resetArenaRiseEnd, riseDelayAt, riseLines, riseMeshes, risers, } from './world/rise.js';
import { STRUCT_GRID, TERRAIN_GRID, addBoxes, addRamps, blocks, boxColor, boxGeo, boxMatrix, floorAt, gridMaterial, rampMatrix, rampUpDir, ramps, wedgeGeo, } from './world/blocks.js';
import { BORDER_HEIGHT, arenaRoot, borderMat, borderUniforms, groundLineMat, playBounds } from './world/arena.js';
import { ImpactFxShader, SpeedFxShader } from './fx/postShaders.js';
import { HEAVY_FX, fxScene, hitFxVisible, impact, initHitFx, spawnFinaleFx, spawnHitFx, spawnKillFx, spawnSparks, updateHitParticles, } from './fx/hitFx.js';
import { addSlashScar, clearScars, updateScars } from './fx/scars.js';
import { REST_TIP, THROW_RANGE, createKunai } from './weapons/kunai.js';
import { createPistol } from './weapons/pistol.js';
import { SWORD_RUN_QUAT, SWORD_SLIDE_QUAT, SWORD_STAND_QUAT, SWORD_VIEW_MODEL_POS } from './weapons/sword.js';
import { initOptions, onOptionsClick, onOptionsKey, options, renderOptions } from './ui/options.js';
import { hidePicker, onPickerClick, onPickerKey, openPicker, pickerOpen, selectedLoadout } from './ui/weaponPicker.js';
import { loadBest, saveBest } from './records.js';
import { initEnemyEnv } from './enemy/env.js';
import { DEFAULT_KNOCK, ENEMY_HIT_RECOVER, RESPAWN_RISE_TIME, RESPAWN_TIME, en, enemies, hitDir, hitLook, hitPoint, setEn, } from './enemy/state.js';
import { isOnDummy, resetDummyStagger, spring, staggerDummy, updateDummyStagger } from './enemy/stagger.js';
import { breakDummy, clearDebris, updateDebris } from './enemy/debris.js';
import { AIR_TILT_KICK, ENEMY_SPIKE_BOUNCE, ENEMY_WAIT_MAX, ENEMY_WAIT_MIN, playerEye, playerLook, poseEnemyTumble, updateEnemyAir, updateEnemyGait, updateEnemyKnock, updateEnemyMove, updateEnemyTumble, } from './enemy/motion.js';
import { DEG, UP, catmullRom, wrapAngle } from './math.js';
import { AIR_ACCEL, AIR_TURN_RATE, BASE_FOV, DASH_CHARGES, DASH_COOLDOWN, DASH_EXIT_SPEED, DASH_RECHARGE, DASH_SPEED, DASH_TIME, EYE_HEIGHT, FOV_SPEED_MAX, GRAVITY, GROUND_ACCEL, GROUND_FRICTION, GROUND_TURN_RATE, JUMP_SPEED, MAX_FOV_BONUS, OVERSPEED_DECAY, PLAYER_MAX_HP, PLAYER_RADIUS, SLIDE_BOOST, SLIDE_BOOST_COOLDOWN, SLIDE_BOOST_MAX, SLIDE_END_SPEED, SLIDE_EYE_HEIGHT, SLIDE_FRICTION, SLIDE_START_SPEED, SLIDE_TURN_RATE, SPRINT_SPEED, WALK_SPEED, WALLJUMP_OUT, WALLJUMP_UP, WALLRUN_ACCEL, WALLRUN_GRAVITY, WALLRUN_MAX_FALL, WALLRUN_ROLL, WALLRUN_SPEED, } from './player/config.js';
import { dashDir, forward, lookEuler, player, position, right, velocity, wallNormal, wallTangent, wish, } from './player/state.js';
import { RAMP_SLIDE_GRAVITY, canKeepWallRun, collideBox, collideCylinder, collideRamp, endWallRun, initMovement, moveToward, rotateHorizontalToward, setHorizontalSpeed, steerHorizontal, tryMantle, tryMantleBox, tryStartWallRun, updateMantle, } from './player/movement.js';
import { keys, padMove, pressed } from './input.js';
import { easeInOutCubic, easeOutCubic, easeOutQuart } from './ease.js';
import { ATTACKS, COMBO_RESET, DASH_SLASH, GROUND_COMBO, RETURN_SWISH, SLASH_1, SLIDE_UP, THROW_SWISH, } from './weapons/kunaiAttacks.js';
import { SWORD_ATTACKS, SWORD_CHARGE_SLASH, SWORD_COMBO, SWORD_ISSEN, SWORD_KESA, SWORD_SWEEP, SWORD_THRUST, } from './weapons/swordAttacks.js';
import { AXE_ATTACKS, AXE_COMBO, AXE_DRIVE, AXE_KESA, AXE_LAUNCH, AXE_RUSH, } from './weapons/axeAttacks.js';
import { camera, controls, renderer, scene } from './core.js';
import { DASH_ATTACK_WINDOW, DEFAULT_HIT_STOP, game, kick, kickVel } from './game/state.js';
import { AXE_SWAY_DAMP, AXE_SWAY_GAIN, AXE_SWAY_STIFF, GUN_VIEW_MODEL_POS, LEFT_VIEW_MODEL_POS, VIEW_MODEL_POS, attackPivot, axeRest, axeViewModel, chakramRest, chakramViewModel, gunTwirl, gunViewModel, heldAxeModel, kunai, kunaiRest, leftFanPivots, leftKunaiRest, leftKunais, leftViewModel, sickleViewModel, spinPivot, sword, swordRest, swordRestQuat, swordViewModel, viewModel, weaponMats, } from './weapons/viewModels.js';
import { KUNAI_RIBBON, Ribbon, TRAIL_STEP, flightRibbonMat, makeRibbonMaterial, spinRibbonMat, taperBase, } from './fx/ribbons.js';
import { AXE_SHOCK_HIT, applyAxePose, axePoseAt, axeState, axeTrailPose, spawnAxeShock, startAxeAttack, updateAxeAttack, updateAxeShocks, } from './weapons/axeCombat.js';
import { initGameHooks } from './game/hooks.js';
import { castHit, castThrow, castWorld } from './world/raycast.js';
import { CHARGE_ZOOM, FOCUS_DIM, FOCUS_ZOOM, LOCK_HEIGHT, applySwordPose, chargeFocus, startSwordAttack, startSwordTwirl, swordPoseAt, swordReady, swordState, swordTrailPose, updateChargeDash, updateRush, updateSwordAttack, } from './weapons/swordCombat.js';
import { ASSIST_PULL, ASSIST_SLOW, ASSIST_SNAP, enemyChest, findAssistTarget } from './player/aimAssist.js';
import { BULLET_HIT, DASH_TWIRL_TIME, DEADEYE_HIT, DEADEYE_ZOOM, GUN_AMMO, GUN_RELOAD_TIME, MUZZLE_FLASH_LIFE, PARRY_RETURN_HIT, RELOAD_EVENTS, SLIDE_SPIN_SWISH, TAU, TRACER_AXIS, applyGunSpin, bulletBack, bullets, deadEyeMarks, endDeadEye, endReload, endSlideSpin, endTwirl, evalReloadPose, fireGun, gunCylinder, gunReady, gunState, muzzleFlash, placeDeadEyeMarks, poseReloadParts, reloadPosOff, reloadRotOff, startReload, startTwirl, tracerGeo, updateBullets, updateCasings, updateDeadEye, updateSlideSpin, updateTwirl, } from './weapons/handgunCombat.js';
import { GRAPPLE_STICK_HIT, HOOK_CHARGES, HOOK_RECHARGE, SICKLE_AIR_COMBO, SICKLE_COMBO, SICKLE_DAMAGE_SCALE, SICKLE_DASH, SICKLE_DASH_HIT, SICKLE_DASH_LAST, SICKLE_KESA_HIT, SICKLE_PULL_HIT, SICKLE_PULL_LAST, grappleHooks, sickleBodyPos, sickleBodyRot, sickleState, startSickleMove, tossOnDash, twirlSickles, updateGrapple, updateGrapplePull, updateSickleMelee, } from './weapons/sickleCombat.js';
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
function setShadows(on) {
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
    if (!shadowsOn)
        return;
    sun.target.position.set(Math.round(cam.position.x), 0, Math.round(cam.position.z));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 120);
};
// ---- ステージ ----
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0xffffff }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// 霧は奥行き 150m で背景色になり切るので、視野が最も広いときの画面の端まで見ても 500m 先は見えない。
// 視点のまわり 1000m 四方だけ描き、視点についていかせる
const grid = new THREE.GridHelper(1000, 1000, 0x000000, 0x000000);
grid.position.y = 0.01;
const gridMat = grid.material;
gridMat.opacity = 0.1;
gridMat.transparent = true;
scene.add(grid);
withGroundReveal(gridMat);
// ---- 敵 ----（体の組み立ては enemy/body.ts）
// ---- 地面の目印: 速さを体感させるための柱と足場 ----
// 5m ごとの濃いグリッド
const grid10 = new THREE.GridHelper(2000, 400, 0x000000, 0x000000);
grid10.position.y = 0.02;
const grid10Mat = grid10.material;
grid10Mat.opacity = 0.18;
grid10Mat.transparent = true;
withGroundReveal(grid10Mat);
scene.add(grid10);
// ---- アリーナ ----（訓練場の配置は world/arena.ts、箱と坂は world/blocks.ts、せり上がりは world/rise.ts）
scene.add(arenaRoot);
// ---- 武器の手元のモデル ----（weapons/viewModels.ts）
// 構えの切り替え具合と、斧の重さで遅れる揺れ
let swordRunPose = 0; // 0 = 縦に立てた構え, 1 = 走るときの前へ倒した構え
let swordSlidePose = 0; // 1 = スライディング中の横に寝かせた構え
let axeSwayX = 0;
let axeSwayY = 0;
let axeSwayVelX = 0;
let axeSwayVelY = 0;
// ---- 敵の武器: 自動拳銃 ----
// 敵に拳銃を両手で構えさせる（アイソセレス・スタンス）。
// 銃は体の正面、右目の少し下の高さに置き、腕は 2 関節の IK で手をグリップへ届かせる。
// 右手がグリップを握り、左手はその左下から包むように添える。肘は軽く曲げて下外側へ逃がす
function attachEnemyGun(body) {
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
// ---- 武器の切り替え ----
// 持ち替えは「今の武器を下げる → 入れ替える → 新しい武器を上げる」
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
let menuRedraw = true; // 止まっているメニューの画面で、次のフレームに 1 度だけ描き直す
let padPlaying = false;
let fromPad = false; // パッドのボタンから送ったキー操作を処理している間だけ true
let skipNextMove = false;
let recentMove = 0; // 直近の移動量のならし
async function lockPointer() {
    try {
        // OS のマウス加速を通さない生の移動量。これを使うと飛びの原因そのものが起きにくい
        await document.body.requestPointerLock({ unadjustedMovement: true });
    }
    catch {
        try {
            await document.body.requestPointerLock();
        }
        catch {
            // 連続クリック等で弾かれたときは、もう一度クリックしてもらう
        }
    }
}
// タイトル / 一時停止の画面。最初はタイトル、一度始めたら Esc で出る一時停止の画面として使い回す
const overlay = document.getElementById('overlay');
function startFromOverlay() {
    ensureAudio(); // 音はユーザー操作の中でしか始められない
    showPanel(null);
    // パッドのボタンはブラウザがユーザー操作とみなさないので、ポインターロックを始められない。ロックなしで始める
    if (fromPad) {
        padPlaying = true;
        setPlaying(true);
    }
    else {
        lockPointer();
    }
}
// 一時停止にする。ロック中なら外せば pointerlockchange から止まる
function pauseGame() {
    if (document.pointerLockElement)
        return document.exitPointerLock();
    padPlaying = false;
    setPlaying(false);
}
const PANELS = ['options'];
function showPanel(name) {
    for (const n of PANELS) {
        overlay.classList.toggle(`show-${n}`, n === name);
        for (const b of overlay.querySelectorAll(`[data-action="${n}"]`))
            b.classList.toggle('active', n === name);
    }
}
function togglePanel(name) {
    const on = !overlay.classList.contains(`show-${name}`);
    showPanel(on ? name : null);
    if (on)
        sfx.playUiOpen();
    else
        sfx.playUiBack();
    if (on && name === 'options')
        renderOptions();
}
initOptions({ onBrightness: applyBrightness, onQuality: applyQuality, onClose: () => togglePanel('options') });
// タイトルでは、本編（GAME）か訓練場（TRAINING）かを選ぶ。今の場所は訓練場として使う
const overlayPrompt = overlay.querySelector('.foot .prompt');
// ---- ステージ選択 ----
// GAME を押すと、ステージと難易度を選ぶ画面を出す。START でそのステージへ入る。
// 難易度は次に開いたときのために覚えておく
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const DIFFICULTY_STORE = 'fast-finish.difficulty';
const overlayStatus = overlay.querySelector('.foot .status');
const stageButtons = [...overlay.querySelectorAll('.stage-list [data-stage]')];
const difficultyButtons = [...overlay.querySelectorAll('.si-diff [data-difficulty]')];
const stageSelectable = (i) => stageButtons[i]?.getAttribute('aria-disabled') !== 'true';
let stageIndex = 0;
let difficultyIndex = 1;
try {
    const saved = DIFFICULTIES.indexOf(localStorage.getItem(DIFFICULTY_STORE));
    if (saved >= 0)
        difficultyIndex = saved;
}
catch {
    // 保存できない環境では毎回 NORMAL から
}
function selectStage(i) {
    stageIndex = i;
    stageButtons.forEach((b, j) => b.classList.toggle('active', j === i));
    showStageInfo();
    if (overlay.classList.contains('select-stage'))
        showStagePreview(selectedStageId());
    showStageBest();
}
// 選んでいるステージ。まだ入れないもの（LOCKED）は null
function selectedStageId() {
    const id = stageButtons[stageIndex]?.dataset.stage;
    return id && id in STAGE_BUILDERS ? id : null;
}
// 詳細欄の番号と名前を、選んでいるステージのボタンから写す。選び直したときは、番号と名前を出し直しの動きで入れ替える
const stageInfo = overlay.querySelector('.stage-info');
const stageInfoNo = stageInfo.querySelector('.si-no');
const stageInfoTitle = stageInfo.querySelector('.si-title');
function showStageInfo() {
    const btn = stageButtons[stageIndex];
    if (!btn)
        return;
    const no = btn.querySelector('.no')?.textContent ?? '';
    if (stageInfoNo.dataset.no === no)
        return;
    stageInfoNo.dataset.no = stageInfoNo.textContent = no;
    stageInfoTitle.querySelector('b').textContent = btn.querySelector('span:not(.no)')?.textContent ?? '';
    stageInfoTitle.querySelector('span').textContent = btn.querySelector('small')?.textContent ?? '';
    // 動きを頭からやり直す（見出しの入りと、番号の線の数字の持ち上がり）
    const head = stageInfo.querySelector('.si-head');
    head.style.animation = 'none';
    stageInfoNo.classList.add('swap');
    void head.offsetWidth;
    head.style.animation = '';
    stageInfoNo.classList.remove('swap');
}
function selectDifficulty(i) {
    difficultyIndex = i;
    difficultyButtons.forEach((b, j) => b.classList.toggle('active', j === i));
    showStageBest();
    try {
        localStorage.setItem(DIFFICULTY_STORE, DIFFICULTIES[i]);
    }
    catch {
        // 覚えられなくても選ぶことはできる
    }
}
// ステージ選択の BEST に、選んでいるステージと難易度の自己ベストを出す
const bestTimeEl = overlay.querySelector('[data-best="time"]');
const bestScoreEl = overlay.querySelector('[data-best="score"]');
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
function setStageSelect(on) {
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
function stepStage(dir) {
    for (let i = stageIndex + dir; i >= 0 && i < stageButtons.length; i += dir) {
        if (!stageSelectable(i))
            continue;
        sfx.playUiHover();
        return selectStage(i);
    }
    sfx.playUiDenied();
}
function stepDifficulty(dir) {
    const i = THREE.MathUtils.clamp(difficultyIndex + dir, 0, DIFFICULTIES.length - 1);
    if (i === difficultyIndex)
        return sfx.playUiDenied();
    sfx.playUiHover();
    selectDifficulty(i);
}
const transitionLabel = document.querySelector('#transition .label');
let overlayKicker = 'FAST FINISH — TRAINING'; // 入った後の一時停止の画面に出す、今いる場所
function startStage() {
    const id = selectedStageId();
    if (!id)
        return sfx.playUiDenied();
    sfx.playUiSelect();
    pendingStage = id;
    const name = id.toUpperCase();
    transitionLabel.textContent = name;
    overlayKicker = `FAST FINISH — ${name} / ${DIFFICULTIES[difficultyIndex].toUpperCase()}`;
    startFromOverlay();
}
function onStageSelectClick(target) {
    if (pickerOpen())
        return onPickerClick(target);
    if (target.closest('[data-action="weapon-open"]'))
        return openPicker();
    if (target.closest('[data-action="stage-back"]')) {
        sfx.playUiBack();
        return setStageSelect(false);
    }
    if (target.closest('[data-action="stage-start"]'))
        return startStage();
    const stage = target.closest('[data-stage]');
    if (stage) {
        const i = stageButtons.indexOf(stage);
        if (!stageSelectable(i))
            return sfx.playUiDenied();
        if (i !== stageIndex)
            sfx.playUiSelect();
        return selectStage(i);
    }
    const diff = target.closest('[data-difficulty]');
    if (diff) {
        const i = difficultyButtons.indexOf(diff);
        if (i !== difficultyIndex)
            sfx.playUiSelect();
        return selectDifficulty(i);
    }
}
function onStageSelectKey(e) {
    if (pickerOpen())
        return onPickerKey(e);
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
    if (overlay.classList.contains('quitting'))
        return;
    overlay.classList.add('quitting');
    setTimeout(() => location.reload(), 380);
}
// 倒れたステージをやり直す。タイトルへ戻るのと同じく読み込み直し、そのステージを選んだステージ選択から始める
// （ポインターロックと音はユーザー操作が無いと始められないので、入るのは START を押してから）
const RETRY_STORE = 'fast-finish.retry';
function retryStage() {
    try {
        sessionStorage.setItem(RETRY_STORE, String(stageIndex));
    }
    catch {
        // 覚えておけない環境では、ただタイトルへ戻る
    }
    quitToTitle();
}
function restoreRetry() {
    let saved = null;
    try {
        saved = sessionStorage.getItem(RETRY_STORE);
        sessionStorage.removeItem(RETRY_STORE);
    }
    catch {
        return;
    }
    const i = Number(saved);
    if (saved === null || !stageSelectable(i))
        return;
    selectStage(i);
    setStageSelect(true);
}
function decideGameOver(choice) {
    sfx.playUiSelect();
    if (choice === 'retry')
        retryStage();
    else
        quitToTitle();
}
overlay.addEventListener('click', (e) => {
    const target = e.target;
    if (target.closest('[data-action="title"]')) {
        sfx.playUiSelect();
        return quitToTitle();
    }
    if (target.closest('[data-action="options"]'))
        return togglePanel('options');
    if (target.closest('.options'))
        return onOptionsClick(target);
    // 結果の画面では TITLE 以外を受け付けない（倒しきった勢いのクリックで何か起きないように）
    if (overlay.classList.contains('result'))
        return;
    if (overlay.classList.contains('over')) {
        if (target.closest('[data-action="retry"]'))
            decideGameOver('retry');
        return;
    }
    if (overlay.classList.contains('title')) {
        if (overlay.classList.contains('select-stage'))
            return onStageSelectClick(target);
        if (target.closest('[data-action="game"]')) {
            sfx.playUiOpen();
            return setStageSelect(true);
        }
        // タイトルでは、項目以外をクリックしても何もしない
        if (target.closest('[aria-disabled="true"]'))
            return sfx.playUiDenied();
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
let hoveredButton = null;
overlay.addEventListener('mouseover', (e) => {
    const button = e.target.closest('.menu button, .si-diff button, .sw-slot, .sw-rows button, .sw-win .menu button, .opt button');
    if (button === hoveredButton)
        return;
    hoveredButton = button;
    if (button && button.getAttribute('aria-disabled') !== 'true')
        sfx.playUiHover();
});
// UI の音はユーザー操作の中でしか始められないので、最初に触れたときに用意する
for (const type of ['pointerdown', 'keydown'])
    window.addEventListener(type, () => sfx.ensureUiAudio(), { capture: true });
window.addEventListener('keydown', (e) => {
    if (controls.isLocked || overlay.classList.contains('hidden'))
        return;
    if (overlay.classList.contains('select-stage'))
        return onStageSelectKey(e);
    if (overlay.classList.contains('show-options'))
        return onOptionsKey(e);
    if (overlay.classList.contains('result')) {
        if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'KeyQ')
            return;
        e.preventDefault();
        if (skipResult())
            return; // 演出の途中なら、まず最後まで飛ばす
        sfx.playUiSelect();
        return quitToTitle();
    }
    // ゲームオーバー: 上下で選んで ENTER で決める。R はやり直し、Q はタイトルへすぐ
    if (overlay.classList.contains('over')) {
        const dir = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 }[e.code];
        if (dir) {
            e.preventDefault();
            if (stepGameOverMenu(dir))
                sfx.playUiHover();
        }
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            decideGameOver(gameOverChoice());
        }
        else if (e.code === 'KeyR') {
            decideGameOver('retry');
        }
        else if (e.code === 'KeyQ') {
            decideGameOver('title');
        }
        return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        sfx.playUiSelect();
        startFromOverlay(); // タイトルでは TRAINING、一時停止では RESUME
    }
    else if (e.code === 'KeyQ' && overlay.classList.contains('pause')) {
        sfx.playUiSelect();
        quitToTitle();
    }
    else if (e.code === 'KeyO') {
        togglePanel('options');
    }
});
// 訓練場へ入るときは、タイトルをすぐには消さずに払い出す。切り替えの帯で覆いきったら（switchToStage）、
// 一時停止の画面に作り替える
function endOverlayLeave() {
    if (!overlay.classList.contains('leaving'))
        return;
    overlay.classList.remove('leaving');
    overlay.classList.toggle('hidden', controls.isLocked);
    // 一度始めたら、以降は一時停止の画面にする
    overlay.classList.replace('title', 'pause');
    overlay.classList.remove('select-stage');
    overlay.querySelector('[data-action="start"] .label').textContent = 'RESUME';
    overlay.querySelector('.kicker').textContent = overlayKicker;
    overlayStatus.textContent = 'ESC — PAUSE';
    overlayPrompt.textContent = 'CLICK TO RESUME';
}
function setPlaying(on) {
    document.body.classList.toggle('pad-playing', on && padPlaying); // パッドで遊んでいる間はカーソルを隠す
    if (controls.isLocked === on)
        return;
    controls.isLocked = on;
    menuRedraw = true;
    // 止めている間は音も HUD の動きも止める
    sfx.setAudioPaused(!controls.isLocked);
    document.body.classList.toggle('paused', !controls.isLocked);
    if (controls.isLocked && overlay.classList.contains('title') && !overlay.classList.contains('leaving')) {
        overlay.classList.add('leaving');
        startStageIntro();
    }
    else {
        // 払い出しの途中で止められたら、その場で一時停止の画面にする
        endOverlayLeave();
        overlay.classList.toggle('hidden', controls.isLocked);
        if (!controls.isLocked && !overlay.classList.contains('quitting') && !overlay.classList.contains('result') && !overlay.classList.contains('over'))
            sfx.playUiPause();
    }
}
document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === document.body;
    // パッドで遊んでいる途中にクリックでロックしたら、そこからはマウスで遊んでいる扱いにする
    if (locked)
        padPlaying = false;
    setPlaying(locked);
    // ロック直後の最初の移動量は、カーソルの飛びを含むことがあるので捨てる
    skipNextMove = true;
    recentMove = 0;
});
// 視点を回す（ラジアン）。マウスとパッドの右スティックで共用する
function turnView(yaw, pitch) {
    if (isDown())
        return; // 倒れている間は見回せない
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
    if (document.pointerLockElement !== document.body)
        return;
    if (skipNextMove) {
        skipNextMove = false;
        return;
    }
    const move = Math.hypot(e.movementX, e.movementY);
    // 直前までの動きから急に桁違いの値が来たら、手の動きではないとみなして捨てる
    if (move > 250 && move > recentMove * 8 + 50)
        return;
    recentMove += (move - recentMove) * 0.3;
    if (move > 2)
        game.usingPad = false; // マウスに持ち替えたらエイムアシストを切る
    const look = LOOK_SPEED * options.mouseSens * zoomLookScale();
    turnView(e.movementX * look, e.movementY * look);
});
window.addEventListener('keydown', (e) => {
    if (!controls.isLocked)
        return; // タイトル / 一時停止の間のキーはゲームに渡さない
    // ロックしていないと Esc でロックが外れないので、自分で一時停止にする
    if (e.code === 'Escape' && padPlaying)
        return pauseGame();
    if (!e.repeat)
        pressed.add(e.code);
    keys.add(e.code);
    if (WEAPON_KEYS[e.code])
        game.wantWeapon = WEAPON_KEYS[e.code];
    if (e.code === 'KeyR' && !e.repeat)
        gunState.reloadQueued = sickleState.tossPressed = true;
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
    if (e.code === 'KeyH')
        damagePlayer(12);
    if (e.code === 'KeyJ')
        healPlayer(25);
});
const toast = document.createElement('div');
toast.style.cssText =
    'position:fixed;left:50%;top:18%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;' +
        'background:rgba(0,0,0,0.6);color:#fff;font:15px sans-serif;pointer-events:none;opacity:0;transition:opacity 0.3s';
document.body.appendChild(toast);
let toastTimer = 0;
function showToast(text) {
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.style.opacity = '0'), 1200);
}
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
// ロックしていればよそへ移ったときにロックが外れて止まる。パッドで遊んでいる間は自分で止める
window.addEventListener('blur', () => {
    if (padPlaying)
        pauseGame();
});
const isSprintKey = (code) => code === 'ShiftLeft' || code === 'ShiftRight';
let attackPressed = false;
document.addEventListener('mousedown', (e) => {
    // パッドで遊んでいる途中でマウスに持ち替えたら、そのクリックでロックする
    if (padPlaying && !document.pointerLockElement)
        lockPointer();
    if (controls.isLocked && e.button === 0) {
        attackPressed = true;
        game.attackHeld = true;
    }
    if (controls.isLocked && e.button === 2)
        game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = gunState.deadEyePressed = true;
});
document.addEventListener('mouseup', (e) => {
    if (e.button === 0)
        game.attackHeld = false;
    if (e.button === 2)
        game.throwHeld = false;
});
window.addEventListener('blur', () => (game.attackHeld = false));
document.addEventListener('contextmenu', (e) => e.preventDefault());
// 視点を動かしたときにクナイを遅れてついてこさせるための量
let lookSwayX = 0;
let lookSwayY = 0;
document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== document.body)
        return;
    lookSwayX = THREE.MathUtils.clamp(lookSwayX + e.movementX * 0.0005, -0.06, 0.06);
    lookSwayY = THREE.MathUtils.clamp(lookSwayY + e.movementY * 0.0005, -0.06, 0.06);
});
// ---- ゲームパッドの割り当て ----
// ボタンはキーに置き換えて keys / pressed に入れ、キーボードと同じ処理を通す
const PAD_KEYS = [
    [PAD.A, 'Space'], // ジャンプ
    [PAD.B, 'KeyC'], // スライド
    [PAD.L3, 'ShiftLeft'], // ダッシュ
];
const PAD_WEAPONS = [
    [PAD.UP, 'kunai'],
    [PAD.RIGHT, 'handgun'],
    [PAD.DOWN, 'sword'],
    [PAD.LEFT, 'sickle'],
];
const WEAPON_ORDER = ['kunai', 'handgun', 'sword', 'sickle', 'axe', 'chakram']; // LB / RB で順に回す
// タイトル / 一時停止の画面では、メニューのキー操作に置き換える
const PAD_MENU_KEYS = [
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
function sendPadKey(code) {
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
    padAssistEl.style.cssText = padDebug.style.cssText.replace('top:12px', 'top:64px');
    document.body.appendChild(padAssistEl);
}
let padLastStamp = 0;
let padDebugT = 0;
const padGaps = [];
const frameGaps = [];
function updatePadDebug(dt, stamp) {
    if (!padDebug)
        return;
    frameGaps.push(dt * 1000);
    // 時刻が変わったときだけ新しい入力が届いている（スティックを動かしている間に見る）
    if (stamp && stamp !== padLastStamp) {
        if (padLastStamp)
            padGaps.push(stamp - padLastStamp);
        padLastStamp = stamp;
    }
    padDebugT += dt;
    if (padDebugT < 1)
        return;
    padDebugT = 0;
    const fmt = (a) => a.length ? `平均 ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1)} / 最大 ${Math.max(...a).toFixed(1)} ms` : '—';
    padDebug.textContent =
        `入力  ${fmt(padGaps)}  (${padGaps.length} 回/秒)\n` +
            `描画  ${fmt(frameGaps)}  (${frameGaps.length} fps, 50ms 超え ${frameGaps.filter((v) => v > 50).length})`;
    padGaps.length = frameGaps.length = 0;
}
function updatePad(dt) {
    const pad = pollPad();
    updatePadDebug(dt, pad.timestamp);
    // 離したことはどの画面でも反映する（押したまま一時停止して、そこで離すこともある）
    for (const [b, code] of PAD_KEYS)
        if (pad.up[b])
            keys.delete(code);
    if (pad.up[PAD.RT])
        game.attackHeld = false;
    if (pad.up[PAD.LT])
        game.throwHeld = false;
    padMove.x = padMove.y = 0;
    padSprint = false;
    if (!pad.connected)
        return;
    if (!controls.isLocked) {
        if (overlay.classList.contains('hidden') || overlay.classList.contains('leaving'))
            return;
        for (const [b, code] of PAD_MENU_KEYS)
            if (pad.down[b])
                return sendPadKey(code);
        return;
    }
    if (pad.down[PAD.START])
        return pauseGame();
    for (const [b, code] of PAD_KEYS) {
        if (!pad.down[b])
            continue;
        keys.add(code);
        pressed.add(code);
    }
    if (pad.down[PAD.RT])
        attackPressed = game.attackHeld = true;
    if (pad.down[PAD.LT])
        game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = gunState.deadEyePressed = true;
    if (pad.down[PAD.X])
        gunState.reloadQueued = sickleState.tossPressed = true;
    const cycle = (pad.down[PAD.RB] ? 1 : 0) - (pad.down[PAD.LB] ? 1 : 0);
    if (cycle)
        game.wantWeapon = WEAPON_ORDER[(WEAPON_ORDER.indexOf(game.wantWeapon) + cycle + WEAPON_ORDER.length) % WEAPON_ORDER.length];
    for (const [b, id] of PAD_WEAPONS)
        if (pad.down[b])
            game.wantWeapon = id;
    padMove.x = pad.lx;
    padMove.y = -pad.ly;
    padSprint = Math.hypot(pad.lx, pad.ly) >= PAD_SPRINT;
    const m = Math.hypot(pad.rx, pad.ry);
    if (m > 0 || padSprint || pad.lx || pad.ly || pad.down.some(Boolean))
        game.usingPad = true;
    const target = findAssistTarget();
    // 敵の近くでは視点を遅くし、スティックか体を動かしている間だけ照準を胸へ寄せる（止まっていると勝手には動かさない）
    let slow = 1;
    if (target) {
        const near = 1 - target.angle / target.size; // 範囲の端で 0、胸の真上で 1
        slow = 1 - (1 - ASSIST_SLOW) * near;
        const active = Math.min(1, Math.max(m, Math.hypot(pad.lx, pad.ly)));
        const pull = 1 - Math.exp(-ASSIST_PULL * active * dt);
        if (pull > 0)
            turnView(target.yaw * pull, -target.pitch * pull);
    }
    if (padAssistEl) {
        padAssistEl.textContent = !game.usingPad
            ? 'アシスト  切（マウス操作中）'
            : game.shownWeapon !== 'kunai' && game.shownWeapon !== 'handgun'
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
const dashGauges = [...document.querySelectorAll('#crosshair .gauge')];
// ---- HUD: 鎖鎌の引き寄せの残り回数（クロスヘアの下の斜めの帯 2 本。左から使い、左から溜まる）。鎖鎌を構えている間だけ出す ----
const hookHud = document.getElementById('hookgauge');
const hookCells = [...hookHud.querySelectorAll('.cell')];
const hookFills = hookCells.map((c) => c.querySelector('.f'));
let hookShown = -1; // 表示に反映済みの残り回数
function updateHookHud() {
    hookHud.style.opacity = game.shownWeapon === 'sickle' ? '1' : '0';
    hookHud.classList.toggle('empty', sickleState.hookEmptyFlash > 0);
    for (let i = 0; i < hookCells.length; i++) {
        const fill = i < sickleState.hookCharges ? 1 : i === sickleState.hookCharges ? sickleState.hookRecharge / HOOK_RECHARGE : 0;
        hookFills[i].style.transform = `scaleX(${fill.toFixed(3)})`;
        hookCells[i].classList.toggle('ready', i < sickleState.hookCharges);
        // 溜まりきった帯を光らせる（最初の表示では光らせない）
        if (hookShown >= 0 && i >= hookShown && i < sickleState.hookCharges) {
            hookCells[i].classList.remove('gain');
            void hookCells[i].offsetWidth; // 続けて溜まったときも頭から再生し直す
            hookCells[i].classList.add('gain');
        }
    }
    hookShown = sickleState.hookCharges;
}
// ---- HUD: 体力（左下の斜めのバー。削れた分は白く残り、少し遅れて減る） ----
const HP_CHIP_HOLD = 0.45; // 白い残りが減り始めるまでの時間
const HP_CHIP_DRAIN = 75; // 白い残りが減る速さ (HP/秒)
const HP_LOW = 30; // これ以下でバーを点滅させる
const HP_HEAVY = 25; // これ以上のダメージは大きく揺らす
let hpShown = PLAYER_MAX_HP; // 表示中の量。減るときは即座に、回復は滑らかに追いつく
let hpChip = PLAYER_MAX_HP; // 白く残っている所までの量
let hpChipHold = 0;
let hpCount = PLAYER_MAX_HP; // 数字に出している量。減るときは一気に数え下ろす
const HP_COUNT_SPEED = 140; // 数え下ろす速さ (HP/秒)
const hpHud = document.getElementById('hp');
const hpNumRow = hpHud.querySelector('.num');
const hpNum = hpNumRow.querySelector('span');
const hpBar = hpHud.querySelector('.bar');
const hpFill = hpBar.querySelector('.f');
const hpChipBar = hpBar.querySelector('.c');
const hurtFlash = document.querySelector('#hurt .flash');
const hurtLow = document.querySelector('#hurt .low');
// 曲面 HUD の傾き（index.html の --hud-yaw / --hud-pitch）。被弾時はここから一瞬深く傾ける
const hudStyle = getComputedStyle(document.getElementById('hud'));
const HUD_YAW = parseFloat(hudStyle.getPropertyValue('--hud-yaw')) || 0;
const HUD_PITCH = parseFloat(hudStyle.getPropertyValue('--hud-pitch')) || 0;
// 左右の HUD を、殴られて奥へ押し込まれたように傾けてから戻す。side は左が 1、右が -1
function kickHudPanel(el, side, kick, duration) {
    const tf = (pitch, yaw, z) => `rotateX(${HUD_PITCH + pitch}deg) rotateY(${side * (HUD_YAW + yaw)}deg) translateZ(${z}px)`;
    el.animate([
        { transform: tf(kick * 0.4, kick, -kick * 3) },
        { transform: tf(-kick * 0.1, -kick * 0.25, 0), offset: 0.35 },
        { transform: tf(0, 0, 0) },
    ], { duration, easing: 'cubic-bezier(.2, .8, .3, 1)' });
}
function damagePlayer(amount) {
    if (game.playerHp <= 0 || amount <= 0)
        return;
    if (stageRun?.running)
        stageRun.damage += amount;
    const before = game.playerHp;
    // ステージでは 0 で倒れる。訓練場（と倒しきった後）は死なず、1 で耐えて被弾の演出だけを出す
    game.playerHp = Math.max(stageRun?.running ? 0 : 1, game.playerHp - amount);
    hpShown = game.playerHp;
    if (game.playerHp <= 0)
        downPlayer();
    hpChipHold = HP_CHIP_HOLD;
    // バーを揺らす（斜めの形は保ったまま）
    const heavy = amount >= HP_HEAVY;
    const amp = heavy ? 14 : 6;
    hpBar.animate([
        { transform: 'skewX(-24deg) translate(0, 0)' },
        { transform: `skewX(-24deg) translate(${-amp}px, ${amp * 0.4}px)` },
        { transform: `skewX(-24deg) translate(${amp * 0.8}px, ${-amp * 0.3}px)` },
        { transform: `skewX(-24deg) translate(${-amp * 0.4}px, 0)` },
        { transform: 'skewX(-24deg) translate(0, 0)' },
    ], { duration: heavy ? 360 : 260, easing: 'ease-out' });
    // 数字を叩かれたように一瞬大きくし、ダメージ量を横に飛ばす
    hpNum.animate([
        { transform: `translate(0, 0) scale(${heavy ? 1.22 : 1.12})` },
        { transform: 'translate(-4px, 2px) scale(1.04)', offset: 0.35 },
        { transform: 'translate(0, 0) scale(1)' },
    ], { duration: heavy ? 320 : 240, easing: 'ease-out' });
    const pop = document.createElement('div');
    pop.className = 'pop';
    pop.textContent = `−${Math.round(amount)}`;
    hpNumRow.appendChild(pop);
    pop.animate([
        { transform: `translate(0, 8px) scale(${heavy ? 1.5 : 1.25})`, opacity: 1 },
        { transform: 'translate(22px, -26px) scale(1)', opacity: 1, offset: 0.35 },
        { transform: 'translate(36px, -48px) scale(0.95)', opacity: 0 },
    ], { duration: 720, easing: 'cubic-bezier(.2, .8, .3, 1)' }).onfinish = () => pop.remove();
    // 削れた所の真ん中に斬り傷の線を走らせる
    const cut = document.createElement('div');
    cut.className = 'cut';
    cut.style.left = `calc(${(((before + game.playerHp) / 2) / PLAYER_MAX_HP) * 100}% - 1px)`;
    hpBar.appendChild(cut);
    cut.animate([
        { transform: 'skewX(24deg) rotate(28deg) scaleY(0)', opacity: 1 },
        { transform: 'skewX(24deg) rotate(28deg) scaleY(1.2)', opacity: 1, offset: 0.3 },
        { transform: 'skewX(24deg) rotate(28deg) scaleY(1.4)', opacity: 0 },
    ], { duration: heavy ? 420 : 320, easing: 'ease-out' }).onfinish = () => cut.remove();
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
function healPlayer(amount) {
    if (game.playerHp <= 0 || amount <= 0)
        return;
    game.playerHp = Math.min(PLAYER_MAX_HP, game.playerHp + amount);
    hpChip = Math.max(hpChip, game.playerHp);
}
// dt は実時間（スローやヒットストップ中も白い残りは同じ速さで減らす）
function updateHpHud(dt) {
    if (hpShown > game.playerHp)
        hpShown = game.playerHp;
    else {
        hpShown += (game.playerHp - hpShown) * Math.min(1, dt * 7);
        if (game.playerHp - hpShown < 0.05)
            hpShown = game.playerHp;
    }
    hpChipHold -= dt;
    if (hpChipHold <= 0 && hpChip > hpShown)
        hpChip = Math.max(hpShown, hpChip - HP_CHIP_DRAIN * dt);
    if (hpChip < hpShown)
        hpChip = hpShown;
    hpFill.style.width = `${(hpShown / PLAYER_MAX_HP) * 100}%`;
    hpChipBar.style.width = `${(hpChip / PLAYER_MAX_HP) * 100}%`;
    hpCount = hpCount > hpShown ? Math.max(hpShown, hpCount - HP_COUNT_SPEED * dt) : hpShown;
    hpNum.textContent = String(Math.ceil(hpCount));
    hpHud.classList.toggle('low', game.playerHp <= HP_LOW);
    hurtLow.classList.toggle('on', game.playerHp <= HP_LOW);
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
    if (isDown() || !stageRun)
        return;
    downT = 0;
    stageRun.running = false;
    game.hitStop = Math.max(game.hitStop, 0.14);
    hitStopTotal = game.hitStop;
    addTrauma(1);
    game.fovKick += 10;
    if (game.deadEye !== 'off')
        endDeadEye();
    sfx.playDeath();
    document.body.classList.add('player-down');
}
// 0（倒れた瞬間）〜 1（崩れきった）
function downFall() {
    if (!isDown())
        return 0;
    const k = Math.min(1, downT / DOWN_FALL_TIME);
    return 1 - (1 - k) ** 3;
}
function downSlowFactor() {
    if (!isDown())
        return 1;
    return THREE.MathUtils.lerp(1, DOWN_SLOW_SCALE, Math.min(1, downT / DOWN_SLOW_IN));
}
// 倒れている間は、押したものを全部捨てる（押しっぱなしの移動も、溜めた攻撃も効かせない）
function dropPlayerInput() {
    keys.clear();
    pressed.clear();
    attackPressed = game.attackHeld = game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = gunState.deadEyePressed = false;
    gunState.reloadQueued = sickleState.tossPressed = false;
    padMove.x = padMove.y = 0;
    padSprint = false;
}
function updatePlayerDown(realDt) {
    if (!isDown())
        return;
    const shown = downT >= GAMEOVER_DELAY;
    downT += game.realDt;
    dropPlayerInput();
    if (!shown && downT >= GAMEOVER_DELAY && stageRun)
        showGameOver(stageRun);
}
// 一時停止の画面をゲームオーバーの画面に作り替えて止める。記録は残さない
function showGameOver(run) {
    const button = stageButtons[stageIndex];
    overlay.classList.add('over');
    overlayStatus.textContent = '';
    overlayPrompt.textContent = 'ENTER — RETRY';
    showGameOverView({
        stageNo: button.querySelector('.no').textContent,
        stageName: button.dataset.stage.toUpperCase(),
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
function update(dt) {
    const locked = controls.isLocked;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    wish.set(0, 0, 0);
    axeState.axeSlamRecover = Math.max(0, axeState.axeSlamRecover - dt);
    const stuck = axeState.axeSlamRecover > 0; // 叩きつけの硬直中は、歩く・跳ぶ・ダッシュ・スライディングを受け付けない
    if (locked && !stuck) {
        if (keys.has('KeyW'))
            wish.add(forward);
        if (keys.has('KeyS'))
            wish.sub(forward);
        if (keys.has('KeyD'))
            wish.add(right);
        if (keys.has('KeyA'))
            wish.sub(right);
        // キーを押していなければパッドの左スティック。速さは倒した量ではなく、倒しきったら走るかどうかで決める
        if (wish.lengthSq() === 0)
            wish.addScaledVector(forward, padMove.y).addScaledVector(right, padMove.x);
        if (wish.lengthSq() > 0)
            wish.normalize();
    }
    const hasWish = wish.lengthSq() > 0;
    const sprinting = locked && (keys.has('ShiftLeft') || keys.has('ShiftRight') || padSprint);
    const maxSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;
    const slideKey = locked && keys.has('KeyC');
    if (!slideKey)
        player.slideLock = false;
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
        if (player.wallRunning)
            endWallRun();
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
    }
    else if (player.sliding) {
        if (!slideKey || !player.onGround) {
            player.sliding = false;
        }
        else if (hSpeed < SLIDE_END_SPEED) {
            player.sliding = false;
            player.slideLock = true;
        }
    }
    // ---- 水平移動 ----
    if (swordState.rushTime >= 0) {
        updateRush(dt);
    }
    else if (swordState.chargeDashTime > 0) {
        updateChargeDash(dt);
    }
    else if (player.dashTime > 0) {
        player.dashTime -= dt;
        velocity.x = dashDir.x * DASH_SPEED;
        velocity.z = dashDir.z * DASH_SPEED;
        velocity.y = 0; // ダッシュ中は落ちない
        if (player.dashTime <= 0) {
            const exit = Math.max(DASH_EXIT_SPEED, player.dashSpeedBefore);
            velocity.x = dashDir.x * exit;
            velocity.z = dashDir.z * exit;
        }
    }
    else if (player.wallRunning) {
        // 壁に沿って走る。遅ければ加速し、速ければ勢いをそのまま保つ。壁へ少し押し付けて離れないようにする
        player.wallRunTime += dt;
        const speed = hSpeed < WALLRUN_SPEED ? moveToward(hSpeed, WALLRUN_SPEED, WALLRUN_ACCEL * dt) : hSpeed;
        velocity.x = wallTangent.x * speed - wallNormal.x;
        velocity.z = wallTangent.z * speed - wallNormal.z;
    }
    else if (player.sliding) {
        // 少しずつ減速しながら、ゆるく曲がれる
        if (hasWish && velocity.x * wish.x + velocity.z * wish.z > 0)
            rotateHorizontalToward(wish, SLIDE_TURN_RATE * dt);
        setHorizontalSpeed(Math.max(0, hSpeed - SLIDE_FRICTION * dt));
        // 坂では、下る向きへ加速する（上る向きなら早く止まる）
        if (player.groundRamp) {
            const u = rampUpDir(player.groundRamp);
            velocity.x -= u.x * RAMP_SLIDE_GRAVITY * u.slope * dt;
            velocity.z -= u.z * RAMP_SLIDE_GRAVITY * u.slope * dt;
        }
    }
    else if (player.onGround) {
        if (hasWish)
            steerHorizontal(wish, maxSpeed, GROUND_ACCEL, GROUND_TURN_RATE, OVERSPEED_DECAY, dt);
        else
            setHorizontalSpeed(Math.max(0, hSpeed - GROUND_FRICTION * dt));
    }
    else if (hasWish) {
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
    if (player.dashTime <= 0 && swordState.rushTime < 0 && swordState.chargeDashTime <= 0)
        velocity.y -= (player.wallRunning ? WALLRUN_GRAVITY : GRAVITY) * dt;
    if (player.wallRunning)
        velocity.y = Math.max(velocity.y, -WALLRUN_MAX_FALL);
    // 鎖鎌が掛かっている間は、ここまでの速度を引き寄せる向きへ置き換える
    if (sickleState.grapple?.phase === 'pull')
        updateGrapplePull(dt);
    // ---- 移動と当たり判定 ----
    const wasOnGround = player.onGround;
    player.landImpact = 0;
    if (player.mantleTime >= 0) {
        // よじ登り中は決まった軌道で動かす（上で計算した速度は使わない）
        updateMantle(dt);
    }
    else {
        const prevY = position.y;
        position.addScaledVector(velocity, dt);
        player.onGround = false;
        player.groundRamp = null;
        for (const e of enemies)
            if (e.alive)
                collideCylinder(e.root.position.x, e.root.position.z, DUMMY_RADIUS, e.root.position.y + DUMMY_HEIGHT, prevY);
        // 坂を先に調べる（坂に立っていれば、続く箱の判定で坂の上の端の段を上れる）
        for (const r of ramps)
            collideRamp(r, prevY, wasOnGround);
        for (const b of blocks)
            collideBox(b, prevY);
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
        if (player.wallRunning && !canKeepWallRun())
            endWallRun();
        if (player.onGround)
            player.hasLastWall = false;
        // よじ登れる縁があればそちらを優先し、なければ壁走りを試す
        if (locked && !player.onGround && swordState.rushTime < 0) {
            // 鎖鎌で引き寄せた勢いは、よじ登った後へ持ち越さない（引き寄せる前の速さまでに抑える）
            const mantleSpeed = sickleState.grapple && sickleState.grapple.pullTime > 0 ? Math.min(hSpeed, sickleState.grapple.speedBefore) : hSpeed;
            let mantled = enemies.some((e) => e.alive && tryMantle(e.root.position.x, e.root.position.z, DUMMY_RADIUS, e.root.position.y + DUMMY_HEIGHT, mantleSpeed));
            for (const b of blocks) {
                if (mantled)
                    break;
                mantled = tryMantleBox(b, mantleSpeed);
            }
            // 引き寄せの最中は壁走りを始めない（壁沿いに引かれる速さを壁走りが拾ってしまう）
            if (!mantled && !player.wallRunning && player.dashTime <= 0 && swordState.chargeDashTime <= 0 && sickleState.grapple?.phase !== 'pull')
                tryStartWallRun();
        }
    }
    borderUniforms.uPlayer.value.set(position.x, position.y + 1.2, position.z);
    if (player.onGround && !wasOnGround)
        onLand(player.landImpact);
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
let landDip = 0; // 着地で視点が沈む量（負の値）
let roll = 0;
// 高いところからの着地の揺れ。trauma より短く強く、画面と手元をまとめて揺らす
const LAND_SHAKE_TIME = 0.16; // 揺れが収まるまでの時間 (秒)
let landShake = 0; // 揺れの強さ (0〜1)
let landShakeT = 1; // 着地からの経過の割合 (0〜1)。1 で揺れなし
function addTrauma(amount) {
    trauma = Math.min(1, trauma + amount);
}
function onDash() {
    addTrauma(0.2);
    sfx.playDash();
    game.fovKick = 8;
    game.sinceDash = 0;
    upgradeAttackOnDash();
    // 振っていなければ、右手のクナイを輪に掛けた指でくるりと一周回す
    if (kunaiReady() && !attack) {
        dashSpinTime = 0;
        firedDashSpinGrip = false;
        playRing();
    }
    // ハンドガンは、トリガーに掛けた指を軸に縦にくるりと一周回す（装填後より速く）
    if (gunReady() && !gunState.gunReloading && gunState.twirlT < 0)
        startTwirl(DASH_TWIRL_TIME);
    // 剣は、握った手を軸に縦にくるくると 2 回転させる
    if (swordReady() && !swordState.swordAttack && swordState.swordHold < 0)
        startSwordTwirl();
    // 鎖鎌は、確率で鎌を宙へ投げ回し、そうでなければ両手の鎌を前回りにくるりと回す
    if (!tossOnDash())
        twirlSickles();
    // 斧は、柄を軸にくるりと一回転させる
    if (game.shownWeapon === 'axe' && game.wantWeapon === 'axe' && game.holster === 0 && !axeState.axeAttack) {
        axeState.axeSpinTime = 0;
        playSwish({ at: 0, dur: 0.22, f0: 380, f1: 1200, gain: 0.14 }, 'axe');
    }
}
// ダッシュの直前に振り始めた普段の攻撃は、ダッシュ技に差し替える（ほぼ同時押しでもダッシュ技が出るように）
const DASH_ATTACK_GRACE = 0.12;
function upgradeAttackOnDash() {
    if (player.sliding)
        return;
    // クナイ
    if (attack && attackTime < DASH_ATTACK_GRACE && !firedImpact) {
        const i = GROUND_COMBO.indexOf(attack);
        if (i >= 0) {
            comboStep = i;
            startAttack(DASH_SLASH);
        }
    }
    // 剣: 押してまだ離していない（普段の攻撃か溜めかを決める前）か、振り始めたばかり
    if (swordState.swordHold >= 0 && !swordState.swordAttack && swordState.swordHold < DASH_ATTACK_GRACE) {
        swordState.swordHold = -1;
        startSwordAttack(SWORD_THRUST);
    }
    else if (swordState.swordAttack && swordState.swordTime < DASH_ATTACK_GRACE && !swordState.swordFiredImpact) {
        const i = SWORD_COMBO.indexOf(swordState.swordAttack);
        if (i >= 0) {
            swordState.swordComboStep = i;
            startSwordAttack(SWORD_THRUST);
        }
    }
    // 鎖鎌
    if (sickleState.sickleMelee && sickleState.sickleMelee.t < DASH_ATTACK_GRACE && sickleState.sickleMelee.fired === 0) {
        const i = SICKLE_COMBO.indexOf(sickleState.sickleMelee.def);
        const j = SICKLE_AIR_COMBO.indexOf(sickleState.sickleMelee.def);
        if (i >= 0)
            sickleState.sickleCombo = i;
        if (j >= 0)
            sickleState.sickleAirCombo = j;
        if (i >= 0 || j >= 0)
            startSickleMove(SICKLE_DASH);
    }
    // 斧: 普段の攻撃は突進振り下ろし、打ち上げは突き飛ばしへ
    if (axeState.axeAttack && axeState.axeTime < DASH_ATTACK_GRACE && !axeState.axeFiredImpact && !player.wallRunning) {
        const i = AXE_COMBO.indexOf(axeState.axeAttack);
        if (i >= 0 && (player.onGround || !axeState.axeRushAirUsed)) {
            axeState.axeComboStep = i;
            startAxeAttack(AXE_RUSH);
        }
        else if (axeState.axeAttack === AXE_LAUNCH && axeState.axeSlamRecover <= 0) {
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
    game.landDipVel = Math.min(game.landDipVel, -1.5);
    kickVel.x -= 1.2 * DEG * 22;
}
function onWallRunStart() {
    addTrauma(0.08);
    sfx.playWallRunStart();
}
function onWallJump() {
    addTrauma(0.1);
    sfx.playWallJump();
    game.fovKick = Math.max(game.fovKick, 4);
}
function onLand(impact) {
    sfx.playLand(impact);
    game.landDipVel = Math.min(game.landDipVel, -impact * 0.5);
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
function updateCamera(dt) {
    const hSpeed = Math.hypot(velocity.x, velocity.z);
    // 速いほど視野を広げる
    game.fovKick = moveToward(game.fovKick, 0, dt * 30);
    const speedT = THREE.MathUtils.clamp((hSpeed - WALK_SPEED) / (FOV_SPEED_MAX - WALK_SPEED), 0, 1);
    // 居合の構えの間はズームする（スロー中でも実時間の速さで寄せる）
    const targetFov = BASE_FOV + speedT * MAX_FOV_BONUS + game.fovKick - swordState.focusZoom * FOCUS_ZOOM - swordState.swordChargeBlend * CHARGE_ZOOM
        - gunState.deadEyeBlend * DEADEYE_ZOOM;
    camera.fov += (targetFov - camera.fov) * Math.min(1, Math.max(dt, game.realDt) * 8);
    camera.updateProjectionMatrix();
    // 着地の沈み込み（ばねで戻す）
    game.landDipVel += (-150 * landDip - 18 * game.landDipVel) * dt;
    landDip = Math.max(-0.5, landDip + game.landDipVel * dt);
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
    shakeEuler.set(s * 0.04 * Math.sin(t * 47.3 + 1.3) + kick.x - ls * 0.09 * Math.abs(Math.sin(t * 97.1 + 0.4)), s * 0.04 * Math.sin(t * 53.1 + 4.1) + kick.y + ls * 0.05 * Math.sin(t * 89.3 + 2.2), roll + s * 0.05 * Math.sin(t * 41.7 + 2.7) + kick.z + ls * 0.07 * Math.sin(t * 103.7 + 5.1) + handCam.z);
    shakeEuler.x += handCam.x + DOWN_PITCH * downFall();
    shakeEuler.y += handCam.y;
    shakeEuler.z += DOWN_ROLL * downFall();
    camera.quaternion.multiply(shakeQuat.setFromEuler(shakeEuler));
}
// applyCameraOffset で足した揺れと傾きを戻す
function restoreCameraOffset() {
    camera.quaternion.copy(savedQuat);
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
let handCamWeapon = null;
const HAND_PROBE_KUNAI = new THREE.Vector3(0, 0.1, 0); // 握りから切っ先へ少し寄った所（回転も拾う）
const HAND_PROBE_SWORD = new THREE.Vector3(0, 0.35, 0);
const HAND_PROBE_GUN = new THREE.Vector3(0, 0, -0.1);
const HAND_PROBE_SICKLE = new THREE.Vector3(0, 0.1, 0);
const HAND_PROBE_AXE = new THREE.Vector3(0, 0.6, 0);
const HAND_PROBE_CHAKRAM = new THREE.Vector3(0, 0, 0);
// frame 座標の点 local を、root の手前まで親をたどって root の座標へ移す（root 自身の揺れは入れない）
function probeToRoot(frame, root, local, out) {
    out.copy(local);
    for (let o = frame; o && o !== root; o = o.parent) {
        o.updateMatrix();
        out.applyMatrix4(o.matrix);
    }
    return out;
}
// 今の武器の手元の位置（カメラ基準、構えの根元を基本位置に置いた値）
function measureHand(out) {
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
        case 'chakram':
            return probeToRoot(chakramRest, chakramViewModel, HAND_PROBE_CHAKRAM, out).add(CHAKRAM_VIEW_MODEL_POS);
    }
}
function updateHandCam(dt) {
    if (dt <= 0)
        return;
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
const hudLayer = document.getElementById('hud');
const scoreLayer = document.getElementById('score');
const hudOff = new THREE.Vector3(); // x, y はずれ (px)、z は広がり (割合)
const hudVel = new THREE.Vector3();
const hudPrevVel = new THREE.Vector3();
const hudDv = new THREE.Vector3();
let hudPrevValid = false;
// 衝撃で HUD を弾く。x, y は画面の向き (px/秒、y は下が正)、z は広がり（負で奥へ押し込む）
function hudImpulse(x, y, z = 0) {
    hudVel.x += x;
    hudVel.y += y;
    hudVel.z += z;
}
// dt は実時間（スロー中も同じ速さでばねを戻す）
function updateHudSway(dt) {
    if (dt <= 0)
        return;
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
const kunaiReady = () => game.shownWeapon === 'kunai' && game.wantWeapon === 'kunai' && game.holster === 0;
function updateWeaponSwitch(dt) {
    // 振りや溜め、投げの途中では持ち替えず、終わるのを待つ
    const kunaiBusy = attack !== null || charging || pendingThrows.length > 0;
    const swordBusy = swordState.swordAttack !== null || swordState.rushTime >= 0 || swordState.swordHold >= 0 || swordState.chargeDashTime > 0;
    const busy = (game.shownWeapon === 'kunai' && kunaiBusy) || (game.shownWeapon === 'sword' && swordBusy) || sickleState.grapple !== null
        || sickleState.sickleMelee !== null || (game.shownWeapon === 'axe' && axeState.axeAttack !== null);
    if (isDown()) {
        game.holster = Math.min(1, game.holster + game.realDt / (HOLSTER_TIME * 2)); // 倒れたら武器を画面の下へ落とす
    }
    else if (game.wantWeapon !== game.shownWeapon && !busy) {
        game.holster = Math.min(1, game.holster + dt / HOLSTER_TIME);
        if (game.holster === 1) {
            game.shownWeapon = game.wantWeapon;
            sfx.playEquip(game.shownWeapon);
        }
    }
    else if (game.wantWeapon === game.shownWeapon) {
        game.holster = Math.max(0, game.holster - dt / HOLSTER_TIME);
    }
    const isKunai = game.shownWeapon === 'kunai';
    viewModel.visible = isKunai;
    leftViewModel.visible = isKunai;
    gunViewModel.visible = game.shownWeapon === 'handgun';
    swordViewModel.visible = game.shownWeapon === 'sword';
    sickleViewModel.visible = game.shownWeapon === 'sickle';
    axeViewModel.visible = game.shownWeapon === 'axe';
    chakramViewModel.visible = game.shownWeapon === 'chakram';
}
const handJoltPos = new THREE.Vector3();
function updateViewModel(dt) {
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
    viewModel.position.set(VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bob - lookSwayX * 0.5 + slideP * 0.03, VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bob - Math.min(velocity.y, 0) * 0.002
        + lookSwayY * 0.5 + landDip * 0.3 - pull * 0.04 - slideP * 0.03 - mantleP * 0.12, VIEW_MODEL_POS.z + pull * 0.1 + speedBack);
    viewModel.rotation.set(-pull * 0.35 + lookSwayY * 2 - mantleP * 0.5, -lookSwayX * 2, slideP * 0.35 + roll);
    // 左手は振りに加わらないので、移動の揺れだけ右手と左右対称に付ける
    // 溜めている間は少し前へ出して持ち上げ（水平に回すクナイが顔へ近づきすぎないように）、
    // 投げた瞬間は前へ突き出し、補充中は画面の下へ隠す
    chargePose += ((charging ? 1 : 0) - chargePose) * Math.min(1, dt * 30);
    throwPunch += -throwPunch * Math.min(1, dt * 9);
    const empty = reloading && pendingThrows.length === 0; // 最後の 1 本を放ってから下げる
    leftEmpty += ((empty ? 1 : 0) - leftEmpty) * Math.min(1, dt * (empty ? 6 : 14));
    leftViewModel.position.set(LEFT_VIEW_MODEL_POS.x - Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03
        + chargePose * 0.03 + throwPunch * 0.05, LEFT_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12
        + chargePose * 0.03 + throwPunch * 0.03 - leftEmpty * 0.15, LEFT_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack - chargePose * 0.04 - throwPunch * 0.12);
    leftViewModel.rotation.set(-dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5 + chargePose * 0.25 - throwPunch * 0.4 - leftEmpty * 0.6, -lookSwayX * 2, slidePose * 0.35 + roll - chargePose * 0.2);
    // ハンドガンは右手のクナイと同じ揺れ方をさせる
    gunViewModel.position.set(GUN_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03, GUN_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12, GUN_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack);
    gunViewModel.rotation.set(-dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5, -lookSwayX * 2, slidePose * 0.35 + roll);
    // 剣は歩く速さを超えて走っている間、前へ倒した構えに移る。スライディング中は横に寝かせる
    const running = hSpeed > WALK_SPEED + 1;
    swordRunPose += ((running ? 1 : 0) - swordRunPose) * Math.min(1, dt * (running ? 8 : 6));
    swordSlidePose += ((player.sliding ? 1 : 0) - swordSlidePose) * Math.min(1, dt * (player.sliding ? 12 : 8));
    swordRestQuat.slerpQuaternions(SWORD_STAND_QUAT, SWORD_RUN_QUAT, swordRunPose).slerp(SWORD_SLIDE_QUAT, swordSlidePose);
    // 剣もクナイと同じ揺れ方をさせる。振っている間は揺れを弱めて振りの形を崩さない
    swordState.swordAttackWeight += ((swordState.swordAttack ? 1 : 0) - swordState.swordAttackWeight) * Math.min(1, dt * (swordState.swordAttack ? 20 : 6));
    const swordCalm = 1 - swordState.swordAttackWeight * 0.8;
    const sBob = bobAmount * swordCalm;
    const sPull = dashPull * swordCalm;
    const sSlide = slidePose * swordCalm;
    swordViewModel.position.set(SWORD_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * sBob - lookSwayX * 0.5 + sSlide * 0.03, SWORD_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * sBob - Math.min(velocity.y, 0) * 0.002
        + lookSwayY * 0.5 + landDip * 0.3 - sPull * 0.04 - sSlide * 0.03 - mantlePose * 0.12
        + swordSlidePose * 0.1, // スライディング中は寝かせた刀を持ち上げる
    SWORD_VIEW_MODEL_POS.z + sPull * 0.1 + speedBack);
    swordViewModel.rotation.set(-sPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5, -lookSwayX * 2, sSlide * 0.35 + roll);
    // 鎖鎌もハンドガンと同じ揺れ方をさせる
    sickleViewModel.position.set(SICKLE_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03, SICKLE_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12 + sickleBodyPos.y, SICKLE_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack);
    sickleViewModel.position.x += sickleBodyPos.x;
    sickleViewModel.rotation.set(-dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5 + sickleBodyRot.x, -lookSwayX * 2 + sickleBodyRot.y, slidePose * 0.35 + roll + sickleBodyRot.z);
    // バトルアックスもハンドガンと同じ揺れ方をさせる。重いので揺れは少し大きめ。振っている間は揺れを弱めて振りの形を崩さない。
    // 視点を回したときの揺れは、重さで遅れて付いてきて少し行き過ぎる（ばねで追わせる）
    axeSwayVelX += ((lookSwayX * AXE_SWAY_GAIN - axeSwayX) * AXE_SWAY_STIFF - axeSwayVelX * AXE_SWAY_DAMP) * dt;
    axeSwayVelY += ((lookSwayY * AXE_SWAY_GAIN - axeSwayY) * AXE_SWAY_STIFF - axeSwayVelY * AXE_SWAY_DAMP) * dt;
    axeSwayX += axeSwayVelX * dt;
    axeSwayY += axeSwayVelY * dt;
    axeState.axeAttackWeight += ((axeState.axeAttack ? 1 : 0) - axeState.axeAttackWeight) * Math.min(1, dt * (axeState.axeAttack ? 20 : 6));
    const axeCalm = 1 - axeState.axeAttackWeight * 0.8;
    const aBob = bobAmount * axeCalm;
    const aPull = dashPull * axeCalm;
    const aSlide = slidePose * axeCalm;
    axeViewModel.position.set(AXE_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.016 * aBob - axeSwayX * 0.5 + aSlide * 0.03, AXE_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.016 * aBob - Math.min(velocity.y, 0) * 0.002
        + axeSwayY * 0.5 + landDip * 0.35 - aPull * 0.04 - aSlide * 0.03 - mantlePose * 0.12, AXE_VIEW_MODEL_POS.z + aPull * 0.1 + speedBack);
    axeViewModel.rotation.set(-aPull * 0.35 + axeSwayY * 2 - mantlePose * 0.5, -axeSwayX * 2, aSlide * 0.35 + roll);
    // チャクラムもハンドガンと同じ揺れ方をさせる
    chakramViewModel.position.set(CHAKRAM_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - lookSwayX * 0.5 + slidePose * 0.03, CHAKRAM_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + lookSwayY * 0.5 + landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12, CHAKRAM_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack);
    chakramViewModel.rotation.set(-dashPull * 0.35 + lookSwayY * 2 - mantlePose * 0.5, -lookSwayX * 2, slidePose * 0.35 + roll);
    // 高いところからの着地で、手元も画面と一緒に強く揺らす
    const ls = landShakeAmount();
    if (ls > 0) {
        const t = shakeTime;
        handJoltPos.set(ls * 0.025 * Math.sin(t * 83.9 + 1.7), -ls * 0.05 * Math.abs(Math.sin(t * 95.3 + 0.9)), ls * 0.02 * Math.sin(t * 77.1 + 4.4));
        const rx = -ls * 0.25 * Math.abs(Math.sin(t * 88.7 + 2.6));
        const rz = ls * 0.18 * Math.sin(t * 101.3 + 0.2);
        for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel, chakramViewModel]) {
            vm.position.add(handJoltPos);
            vm.rotation.x += rx;
            vm.rotation.z += rz;
        }
    }
    // 撃った反動で手前へ跳ね上げる。装填中は装填の動き（キーフレーム）を足す
    gunViewModel.position.z += gunState.gunRecoil * 0.1;
    gunViewModel.position.y += gunState.gunRecoil * 0.02;
    gunViewModel.rotation.x += gunState.gunRecoil * 0.6;
    gunViewModel.position.add(reloadPosOff);
    gunViewModel.rotation.x += reloadRotOff.x * DEG;
    gunViewModel.rotation.y += reloadRotOff.y * DEG;
    gunViewModel.rotation.z += reloadRotOff.z * DEG;
    // 持ち替え中は手元を画面の下へ下げる
    const h = game.holster * game.holster * (3 - 2 * game.holster);
    for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel, chakramViewModel]) {
        vm.position.y -= h * 0.25;
        vm.rotation.x -= h * 0.9;
    }
}
// ---- 近接攻撃（クナイ） ----
// 振りはキーフレームで作る。各 key は「構えの位置」「拳の向き」「輪を中心にした回転」を持ち、
// 位置は Catmull-Rom で滑らかな弧に、向きは球面補間でつなぐ。
const ATTACK_BUFFER = 0.25; // cancel のこの秒数前から次の入力を受け付けておく
let attack = null;
let attackTime = 0;
let attackQueued = false;
let attackWeight = 0;
let comboStep = 0;
let comboTimer = 0;
let firedSwishes = 0;
let firedImpact = false;
let firedLunge = false;
let firedRing = false;
let firedGrip = false;
const newPose = () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), spin: 0 });
const restPose = newPose();
// ダッシュしたときに構えたまま輪を軸に一周回す
const DASH_SPIN_TIME = 0.32;
const DASH_SPIN_GRIP = 0.24; // 握り直して「チャキッ」と鳴らす時間
let dashSpinTime = Infinity; // 回し始めてからの時間（回していないときは Infinity）
let firedDashSpinGrip = true;
const fromPose = newPose(); // 攻撃を始めた瞬間の構え（そこから滑らかにつなぐ）
const curPose = newPose();
const tmpPose = newPose();
function copyPose(out, p) {
    out.pos.copy(p.pos);
    out.quat.copy(p.quat);
    out.spin = p.spin;
}
function evalAttack(def, t, out) {
    const keys = def.keys;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t)
        i++;
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
    if (roll !== 0)
        out.quat.premultiply(evalRoll.setFromAxisAngle(evalTip, roll * DEG));
    out.spin = k0.spin + (k1.spin - k0.spin) * e;
}
const evalTip = new THREE.Vector3();
const evalRoll = new THREE.Quaternion();
// 溜めの key までの間に、攻撃開始時の構えから滑らかに移る
function attackPoseAt(def, t, out) {
    evalAttack(def, t, tmpPose);
    const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
    out.pos.lerpVectors(fromPose.pos, tmpPose.pos, w);
    out.quat.slerpQuaternions(fromPose.quat, tmpPose.quat, w);
    out.spin = fromPose.spin + (tmpPose.spin - fromPose.spin) * w;
}
function applyPose(p) {
    attackPivot.position.copy(p.pos);
    attackPivot.quaternion.copy(p.quat);
    spinPivot.rotation.z = p.spin * DEG;
}
function startAttack(def) {
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
function chooseAttack() {
    if (player.sliding)
        return SLIDE_UP;
    if (player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW)
        return DASH_SLASH;
    const def = GROUND_COMBO[comboStep];
    comboStep = (comboStep + 1) % GROUND_COMBO.length;
    return def;
}
const kickTmp = new THREE.Vector3();
const lungeDir = new THREE.Vector3();
// 攻撃の踏み込み: 向いている水平の向きへ押し出す。地上は摩擦で止まるのでそのまま足すが、空中は減速しないので、
// 足し続けると振るたびに際限なく速くなる。空中では、その向きの速さが踏み込みの分に届いていないときだけ、届くまで補う
const AIR_LUNGE_SCALE = 0.4;
function applyLunge(amount) {
    camera.getWorldDirection(lungeDir);
    lungeDir.y = 0;
    if (lungeDir.lengthSq() < 1e-6)
        return;
    lungeDir.normalize();
    let add = amount;
    if (!player.onGround) {
        const along = velocity.x * lungeDir.x + velocity.z * lungeDir.z;
        add = Math.max(0, amount * AIR_LUNGE_SCALE - along);
    }
    velocity.x += lungeDir.x * add;
    velocity.z += lungeDir.z * add;
}
function updateAttack(dt) {
    game.sinceDash += dt;
    game.trailNow += dt;
    if (attackPressed) {
        attackPressed = false;
        if (!kunaiReady()) {
            if (game.shownWeapon === 'handgun')
                gunState.fireQueued = true;
            else if (game.shownWeapon === 'sword')
                swordState.swordPressed = true;
            else if (game.shownWeapon === 'sickle')
                sickleState.sicklePressed = true;
            else if (game.shownWeapon === 'axe')
                axeState.axePressed = true;
        }
        else if (!attack)
            startAttack(chooseAttack());
        else if (attackTime >= attack.cancel - ATTACK_BUFFER)
            attackQueued = true;
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
            game.fovKick += def.fovPunch ?? 0;
            tryHitDummy(def);
        }
        if (attackQueued && attackTime >= def.cancel) {
            startAttack(chooseAttack());
        }
        else if (attackTime >= def.duration) {
            attack = null;
            comboTimer = COMBO_RESET;
        }
    }
    else if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0)
            comboStep = 0;
    }
    kickTmp.copy(kick).multiplyScalar(-220).addScaledVector(kickVel, -20);
    kickVel.addScaledVector(kickTmp, dt);
    kick.addScaledVector(kickVel, dt);
    updateKunaiSlideSpin(dt);
    if (attack) {
        sampleTrail();
        attackPoseAt(attack, attackTime, curPose);
    }
    else {
        copyPose(curPose, restPose);
        dashSpinTime += dt;
        if (dashSpinTime < DASH_SPIN_TIME)
            curPose.spin = -360 * easeOutCubic(dashSpinTime / DASH_SPIN_TIME);
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
const FLASH_HOLD = 0.05; // 真っ白のまま保つ時間
const FLASH_FADE = 0.12; // そこから元の色へ戻る時間
// 体力: 0 になると体ごと砕け散り、しばらくするとその場で生えるように起き上がる
const DUMMY_MAX_HP = 100;
const HIT_DAMAGE = { kunai: 14, sword: 18, throw: 15, bullet: 30, axe: 24 }; // fx = 1 のときの量
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
function tryHitDummy(def) {
    if (!dummyInReach(HIT_REACH, HIT_ANGLE))
        return;
    findHitPoint(def, hitPoint);
    applyDummyHit(def, hitPoint, 'kunai');
}
// 攻撃の届く範囲（距離と視線からの角度）にいる敵のうち、いちばん近いものを en にする。いれば hitDir に攻撃の向きを入れる
function dummyInReach(reach, angle) {
    let best = null;
    let bestDist = Infinity;
    for (const e of enemies) {
        setEn(e);
        if (!inReachOf(reach, angle))
            continue;
        const d = Math.hypot(e.root.position.x - position.x, e.root.position.z - position.z);
        if (d < bestDist) {
            bestDist = d;
            best = e;
        }
    }
    if (!best)
        return false;
    setEn(best);
    return inReachOf(reach, angle); // hitDir を選んだ敵への向きで入れ直す
}
// en が攻撃の届く範囲にいるか。いれば hitDir に攻撃の向きを入れる
function inReachOf(reach, angle) {
    if (!en.alive)
        return false;
    hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
    const dist = hitDir.length();
    if (dist > reach + DUMMY_RADIUS)
        return false;
    if (position.y - en.root.position.y > DUMMY_HEIGHT + 0.5)
        return false;
    camera.getWorldDirection(hitLook);
    hitLook.y = 0;
    if (dist > 1e-4) {
        hitDir.divideScalar(dist);
        if (hitLook.lengthSq() > 1e-6 && hitLook.normalize().angleTo(hitDir) > angle)
            return false;
    }
    else {
        hitDir.copy(hitLook).normalize();
    }
    return true;
}
// swing は刃が動いていた向き（ワールド座標）。渡すと、光の線や飛び散るものを斬り抜けた向きへ流す
const hitDamage = (def, kind) => HIT_DAMAGE[kind] * (def.dmg ?? def.fx ?? 1);
// 投げ物と弾が頭（首から上）に当たったら、ダメージを大きくする
const HEADSHOT_HEIGHT = 1.55; // 敵の足元からの高さ
const HEADSHOT_MULT = 2.5;
// 当たりの反応と演出。hitDir（攻撃した側から敵の奥への水平の向き）は呼ぶ前に入れておく
// scar = false なら切り跡を残さない（刃の当たらない衝撃波など）。dmgScale はダメージだけに掛ける倍率
function applyDummyHit(def, at, kind, swing, scar = true, dmgScale = 1) {
    const headshot = (kind === 'throw' || kind === 'bullet') && at.y - en.root.position.y >= HEADSHOT_HEIGHT;
    staggerDummy(def.knock ?? DEFAULT_KNOCK, at, swing);
    en.flashT = 0;
    game.hitStop = Math.max(game.hitStop, def.hitStop ?? DEFAULT_HIT_STOP);
    hitStopTotal = game.hitStop;
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
    if (scar && (kind === 'kunai' || kind === 'sword' || kind === 'axe'))
        addSlashScar(en, camera, at, hitDir, def, kind, swing);
    const damage = hitDamage(def, kind) * dmgScale * (headshot ? HEADSHOT_MULT : 1);
    en.hp -= damage;
    if (def !== SWORD_ISSEN && def !== DEADEYE_HIT)
        chargeFocus(damage); // 一閃・デッドアイそのものでは溜めない
    countHit(en.hp <= 0);
    trackHitProcess(def, kind);
    if (en.hp <= 0) {
        countChain();
        countMulti(def);
        showKillScore(killBonuses(def, headshot)); // 倒した瞬間の体勢で数えるので、killDummy で状態が変わる前に
        killDummy(kind, swing);
        showHitMarker(true);
    }
    else {
        showHitMarker(fx >= HEAVY_FX || headshot);
    }
}
function killDummy(kind, swing) {
    en.alive = false;
    en.deadTime = 0;
    sinceKill = 0;
    finale = !!stageRun?.running && stageRun.kills + 1 >= stageRun.quota;
    game.hitStop = Math.max(game.hitStop, finale ? FINALE_HIT_STOP : KILL_HIT_STOP);
    hitStopTotal = game.hitStop;
    killSlowTime = 0;
    addTrauma(finale ? 1 : 0.45);
    game.fovKick += finale ? 18 : 9;
    // 刺さっていたクナイは砕ける前に抜いて手元へ戻す
    for (const t of thrown)
        if (t.phase === 'stuck' && isOnDummy(t.mesh))
            startReturn(t);
    breakDummy(hitDir, kind === 'axe', swing);
    en.root.visible = false;
    spawnKillFx(en.root.position, hitDir);
    if (finale) {
        spawnFinaleFx(en.root.position, hitDir);
        sfx.playFinale(FINALE_HIT_STOP);
        finaleHud.classList.add('on');
        document.body.classList.add('finale'); // キルスコアを FINISH の帯の上へ逃がす
    }
    else {
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
        if (e === dead || !e.alive || e.riseTime < RESPAWN_RISE_TIME)
            continue;
        const dx = at.x - e.root.position.x;
        const dz = at.z - e.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d > STARTLE_RANGE)
            continue;
        const k = 1 - (d / STARTLE_RANGE) * 0.6; // 近いほど大きく驚く
        const rel = wrapAngle(Math.atan2(dx, dz) - e.yaw);
        e.pelvisSpring.v.y -= STARTLE_DUCK * k;
        e.headSpring.v.y += Math.sign(rel) * Math.min(Math.abs(rel), 1) * STARTLE_LOOK * k;
        e.gunSpring.v.x -= 1.2 * k;
        e.cooldown = Math.max(e.cooldown, rand(0.35, 0.6));
        if (!e.moving && e.dodgeT <= 0)
            e.waitT = Math.min(e.waitT, rand(0.15, 0.4));
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
    if (sickleState.hookCharges >= HOOK_CHARGES)
        sickleState.hookRecharge = 0;
    healPlayer(KILL_HEAL);
    if (player.mantleTime >= 0)
        return;
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < 1) {
        // ほとんど止まっていたら、向いている方へ押し出す
        camera.getWorldDirection(hitLook);
        hitLook.y = 0;
        if (hitLook.lengthSq() < 1e-6)
            return;
        hitLook.normalize();
        velocity.x = hitLook.x * KILL_BOOST;
        velocity.z = hitLook.z * KILL_BOOST;
    }
    else if (speed < KILL_BOOST_MAX) {
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
function trackHitProcess(def, kind) {
    const now = performance.now() / 1000;
    // 投げたクナイや撃った弾は、着く前に持ち替えていても、放った武器で数える
    en.weapons.add(kind === 'throw' ? 'kunai' : def === BULLET_HIT || def === DEADEYE_HIT ? 'handgun' : game.shownWeapon);
    if (en.hits > 0 && now - en.lastHitAt > HIT_COUNT_WINDOW)
        en.comboKept = false;
    if (now - lastAnyHitAt <= SPIN_WINDOW && Math.abs(viewSpin) >= Math.PI * 2)
        en.spun = true;
    if (def === PARRY_RETURN_HIT)
        en.parried = true;
    en.hits++;
    en.lastHitAt = lastAnyHitAt = now;
    viewSpin = 0;
}
// 同時撃破: 前の敵を倒してから MULTI_WINDOW 秒以内（ゲーム内の時間）に同じ技で倒すと、同時に倒した数を増やす
const MULTI_WINDOW = 0.15;
const MULTI_STEP = 1; // 1 体増えるごとに倍率へ足す量
const MULTI_MAX = 2;
let multiKill = 1; // 今の同時撃破の数（1 = 単独）
let lastKillDef = null;
function countMulti(def) {
    multiKill = def === lastKillDef && sinceKill <= MULTI_WINDOW ? multiKill + 1 : 1;
    lastKillDef = def;
}
// とどめの倒し方ごとに、スコアの倍率へ足す量
const LONG_SHOT_DIST = 12; // これより遠くから倒すと遠距離の加点。さらに 6 m 離れるごとに 0.5 ずつ増やす
const LONG_SHOT_MAX = 2;
const SPEED_KILL_MIN = 20; // 倒した瞬間の水平の速さがこれ以上なら速さの加点
const SPEED_KILL_HIGH = 30; // これ以上なら加点を倍にする
const killAt = new THREE.Vector3();
function killBonuses(def, headshot) {
    const out = [];
    if (headshot)
        out.push({ label: 'HEADSHOT', add: 1 });
    if (multiKill > 1)
        out.push({ label: 'MULTI KILL', detail: `×${multiKill}`, add: Math.min(MULTI_MAX, (multiKill - 1) * MULTI_STEP) });
    if (en.weapons.size >= 2)
        out.push({ label: 'SWITCH', detail: `${en.weapons.size} WEAPONS`, add: 1 });
    if (def === PARRY_RETURN_HIT)
        out.push({ label: 'PARRY KILL', add: 2 });
    else if (en.parried)
        out.push({ label: 'PARRY', add: 1 }); // とどめ以外でパリィを当てていた（PARRY KILL とは重ねない）
    if (en.hits >= 2 && en.comboKept)
        out.push({ label: 'COMBO', detail: `${en.hits} HITS`, add: 1 });
    if (en.spun)
        out.push({ label: '360', add: 1 });
    if (!en.hitPlayer)
        out.push({ label: 'NO DAMAGE', add: 0.5 });
    if (player.sliding || def === SLIDE_UP || def === SWORD_SWEEP)
        out.push({ label: 'SLIDE KILL', add: 1 });
    if (def === SWORD_ISSEN)
        out.push({ label: 'IAI', add: 1 });
    if (def === DEADEYE_HIT)
        out.push({ label: 'DEAD EYE', add: 1 });
    if (def === DASH_SLASH || def === AXE_DRIVE || def === SWORD_THRUST || def === SICKLE_DASH_HIT || def === SICKLE_DASH_LAST)
        out.push({ label: 'DASH KILL', add: 0.5 });
    if (def === SWORD_CHARGE_SLASH)
        out.push({ label: 'CHARGED', add: 0.5 });
    if (def === AXE_SHOCK_HIT)
        out.push({ label: 'SHOCKWAVE', add: 0.5 });
    if (def === WALL_SLAM_HIT)
        out.push({ label: 'WALL SLAM', add: 1 });
    if (def === FLOOR_SLAM_HIT)
        out.push({ label: 'GROUND SLAM', add: 1 });
    if (en.airY > 0.5)
        out.push({ label: 'JUGGLE', add: 1 });
    if (def === SICKLE_PULL_HIT || def === SICKLE_PULL_LAST || def === GRAPPLE_STICK_HIT)
        out.push({ label: 'HOOK KILL', add: 1 });
    if (player.wallRunning)
        out.push({ label: 'WALL RUN', add: 1 });
    else if (!player.onGround && player.mantleTime < 0)
        out.push({ label: 'AERIAL', add: 0.5 });
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
    if (enemySpawns.length > 0)
        placeDummy(pickSpawn());
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
const STAGE_ENEMY_COUNT = { easy: 2, normal: 3, hard: 4 };
const STAGE_SPAWN_FIRST = 0.6; // 操作を返してから最初の敵が現れるまで
const STAGE_SPAWN_GAP = 0.8; // 次の敵が現れるまでの間
// ---- ステージのクリア ----
// 難易度で決まる数を倒したら終わり。時間は操作を返してから最後の 1 体を倒すまでの実時間で測る（一時停止の間は数えない）。
// 残りの数より多くは湧かせないので、最後の 1 体を倒すと場に敵はいなくなる。とどめのスローの余韻を見せてから結果を出す
const STAGE_KILL_QUOTA = { easy: 10, normal: 15, hard: 20 };
const RESULT_DELAY = 3.2; // 倒しきってから結果を出すまで（実時間）。最後の 1 体の長いスローを見せきってから
const finaleHud = document.getElementById('finale');
document.fonts.load('800 100px "Barlow Condensed"', 'FINISH'); // 出す瞬間に別の字形で一瞬出ないよう、太字を先に読み込んでおく
document.fonts.load('600 100px "Oswald"', 'FASTFINISH'); // ステージの始まりのタイトルの字も先に読み込んでおく
let stageRun = null; // 訓練場では null
const runHud = document.querySelector('#total .run');
const runTime = runHud.querySelector('.time');
// 残りの敵の数は画面の中央下に大きく出す
const remainHud = document.getElementById('remain');
const remainNum = remainHud.querySelector('.num');
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
    if (!stageRun?.running)
        return;
    stageRun.kills++;
    remainNum.textContent = String(stageRun.quota - stageRun.kills);
    // 減った瞬間に大きく叩きつけてから収める
    remainNum.animate([{ transform: 'scale(1.5)', filter: 'brightness(3)' }, { transform: 'none', filter: 'none' }], { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
    if (stageRun.kills < stageRun.quota)
        return;
    stageRun.running = false;
    stageRun.clearedT = 0;
    runHud.classList.add('clear');
    remainHud.classList.add('clear');
}
function updateStageRun(realDt) {
    if (!stageRun)
        return;
    if (stageRun.running) {
        stageRun.time += game.realDt;
        runTime.textContent = fmtTime(stageRun.time);
    }
    else if (stageRun.clearedT >= 0) {
        stageRun.clearedT += game.realDt;
        if (stageRun.clearedT >= RESULT_DELAY)
            showStageResult(stageRun);
    }
}
// 一時停止の画面を結果の画面に作り替えて止める。ここからはタイトルへ戻ることしかできない。
// 自己ベストと比べてから記録し直す
function showStageResult(run) {
    run.clearedT = -1;
    const button = stageButtons[stageIndex];
    const stage = button.dataset.stage;
    const difficulty = DIFFICULTIES[difficultyIndex];
    const score = finalScore(totalScore(), run.time, run.kills);
    const best = loadBest(stage, difficulty);
    const newTime = !best || run.time < best.time;
    const newScore = !best || score > best.score;
    saveBest(stage, difficulty, { time: newTime ? run.time : best.time, score: newScore ? score : best.score });
    overlay.classList.add('result');
    overlayStatus.textContent = '';
    overlayPrompt.textContent = 'ENTER — SKIP';
    showResult({
        stageNo: button.querySelector('.no').textContent,
        stageName: stage.toUpperCase(),
        difficulty: difficulty.toUpperCase(),
        time: run.time,
        kills: run.kills,
        damage: Math.round(run.damage),
        score,
        newTime,
        newScore,
    }, () => (overlayPrompt.textContent = 'ENTER — TITLE'));
    pauseGame();
}
let enemySpawns = [];
// en を出す出現位置を選ぶ
function pickSpawn() {
    const off = (i) => {
        const d = Math.hypot(enemySpawns[i].x - position.x, enemySpawns[i].z - position.z);
        return Math.max(SPAWN_NEAR - d, d - SPAWN_FAR); // 0 以下なら程よい距離
    };
    const crowded = (i) => enemies.some((e) => e !== en && e.alive && Math.hypot(e.root.position.x - enemySpawns[i].x, e.root.position.z - enemySpawns[i].z) < SPAWN_APART);
    const all = enemySpawns.map((_, i) => i);
    let cands = all.filter((i) => i !== en.spawnIndex && !crowded(i));
    if (cands.length === 0)
        cands = all.filter((i) => i !== en.spawnIndex);
    if (cands.length === 0)
        cands = all;
    const good = cands.filter((i) => off(i) <= 0);
    if (good.length > 0)
        return good[Math.floor(Math.random() * good.length)];
    // 程よい所が無ければ、程よい距離に一番近い所
    return cands.reduce((a, b) => (off(b) < off(a) ? b : a));
}
// en を出現位置へ移し、プレイヤーの方を向かせる。着いたらまず少し立ち止まってから歩き出す
function placeDummy(i) {
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
function finishMarkHp() {
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
            finishCorner.set(i & 1 ? finishBox.max.x : finishBox.min.x, i & 2 ? finishBox.max.y : finishBox.min.y, i & 4 ? finishBox.max.z : finishBox.min.z).project(camera);
            if (finishCorner.z > 1)
                show = false; // カメラの後ろに回った
            x0 = Math.min(x0, finishCorner.x);
            x1 = Math.max(x1, finishCorner.x);
            y0 = Math.min(y0, finishCorner.y);
            y1 = Math.max(y1, finishCorner.y);
        }
        if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1)
            show = false; // 画面の外
    }
    en.finishEl.classList.toggle('show', show);
    if (!show)
        return;
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
function killSlowFactor(dt) {
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
let shakeEnemy = null; // 震わせる敵（最後に当てた敵）
function updateDummyShake() {
    for (const e of enemies)
        poseEnemyTumble(e);
    if (game.hitStop <= 0 || !hitStopShakesDummy || !shakeEnemy)
        return;
    setEn(shakeEnemy);
    // 左右へ交互に振り、止まりきる前に弱めていく
    const k = DUMMY_SHAKE * Math.min(1, game.hitStop / Math.max(hitStopTotal, 1e-3));
    shakeSide = -shakeSide;
    const side = shakeSide * k * (0.6 + Math.random() * 0.4);
    // dummy は傾いているので、ローカルの横向きで揺らす
    dummyShakeOff.set(-hitDir.z * side, (Math.random() - 0.5) * k * 0.4, hitDir.x * side);
    en.shake.position.add(dummyShakeOff.applyQuaternion(dummyShakeInv.copy(en.root.quaternion).invert()));
}
const dummyShakeInv = new THREE.Quaternion();
const dummyShakeOff = new THREE.Vector3();
// 照準のヒットマーカー: 照準の周りに斜めの 4 本線を一瞬出す（締めの技は大きく）
const hitMarker = document.getElementById('hitmarker');
function showHitMarker(heavy) {
    hitMarker.classList.remove('show', 'heavy');
    void hitMarker.offsetWidth; // アニメーションを最初からやり直す
    hitMarker.classList.add('show');
    if (heavy)
        hitMarker.classList.add('heavy');
}
// ヒット数: 前の当たりから HIT_COUNT_WINDOW 秒以内に当てると数を足し、2 から照準の左に出す。
// 表示が消える長さ（#hits のアニメーション）と同じにして、数が見えている間だけつながるようにする
const HIT_COUNT_WINDOW = 1;
const hitsEl = document.getElementById('hits');
let hitCount = 0;
let lastHitAt = -Infinity;
function countHit(killed) {
    const now = performance.now() / 1000;
    hitCount = now - lastHitAt <= HIT_COUNT_WINDOW ? hitCount + 1 : 1;
    lastHitAt = killed ? -Infinity : now; // 倒したら次の敵は 1 から数え直す
    if (hitCount < 2)
        return;
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
function findHitPoint(def, out) {
    attackPoseAt(def, attackTime, hitPose);
    applyPose(hitPose);
    camera.updateMatrixWorld();
    kunai.updateWorldMatrix(true, false);
    hitPointFromTip(hitTip.copy(TRAIL_TIP).applyMatrix4(kunai.matrixWorld), out);
}
// 視点から tip（ワールド座標）を通る線が敵に当たる所。外れていれば敵の輪郭のうち線に最も近い所
function hitPointFromTip(tip, out) {
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
    if (hitOffset.length() > DUMMY_RADIUS)
        hitOffset.setLength(DUMMY_RADIUS);
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
const finishTemplate = document.getElementById('finish');
const threatsEl = document.getElementById('threats');
function createEnemy(mobile) {
    const body = buildEnemyBody();
    const gun = attachEnemyGun(body);
    const muzzle = gun.userData.muzzle;
    const muzzleFx = muzzleFlash.clone();
    muzzleFx.visible = false;
    muzzle.add(muzzleFx);
    const springs = [spring(55, 8), spring(150, 12), spring(110, 10), spring(240, 14), spring(180, 13)];
    const finishEl = finishTemplate.cloneNode(true);
    finishEl.removeAttribute('id');
    finishTemplate.after(finishEl);
    const threatEl = threatsEl.appendChild(document.createElement('i'));
    const e = {
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
function removeEnemy(e) {
    setEn(e);
    for (const t of thrown)
        if (t.phase === 'stuck' && isOnDummy(t.mesh))
            startReturn(t);
    clearDebris();
    clearScars(en);
    e.root.removeFromParent();
    e.finishEl.remove();
    e.threatEl.remove();
    enemies.splice(enemies.indexOf(e), 1);
}
// 敵を全員ぶん進め、飛んでいる敵の弾を進める
let sinceKill = Infinity; // 最後に倒してからの時間
function updateEnemies(dt) {
    sinceKill += dt;
    camera.getWorldPosition(playerEye);
    camera.getWorldDirection(playerLook);
    for (const e of enemies) {
        setEn(e);
        updateDummy(dt);
    }
    updateEnemyBullets(dt);
}
function updateDummy(dt) {
    if (en.alive) {
        en.idleT += dt;
        if (en.airY > 0 || en.airVel > 0)
            updateEnemyAir(dt);
        updateEnemyTumble(dt);
        updateEnemyKnock(dt);
        updateEnemyMove(dt);
        updateEnemyGait(dt);
        updateDummyAim(dt);
        updateDummyStagger(dt);
    }
    else {
        en.deadTime += dt;
        updateDebris(dt);
        if (en.deadTime >= RESPAWN_TIME && canSpawnEnemy())
            respawnDummy();
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
    for (const m of en.mats)
        m.emissiveIntensity = (1 - fade) * (1 - fade);
    updateEnemyFire(dt);
}
// ---- 床と壁への叩きつけ ----（当たりの処理を呼ぶので本体に置く。敵の動きは enemy/motion.ts）
const FLOOR_SLAM_HIT = { kick: [-2, 0, 0], slash: 0, knock: 420, hitStop: 0.14, fx: 1.4 };
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
const WALL_SLAM_HIT = { kick: [-1.5, 0, 0], slash: 0, hitStop: 0.12 };
const wallSlamAt = new THREE.Vector3();
function slamEnemyIntoWall() {
    const speed = en.knockVel.length();
    if (speed < WALL_SLAM_MIN)
        return false;
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
function enemyHeld() {
    return (sickleState.grapple?.enemy === en && sickleState.grapple.phase !== 'back') || (swordState.rushTime >= 0 && swordState.rushEnemy === en);
}
// ---- 投擲（左手のクナイ） ----
// 右クリックを押している間、左手のクナイを寝かせて輪を中心に水平にくるくる回して溜め、
// 離すと溜めた段階の本数を投げる
const THROW_STAGE_TIME = 0.4; // この時間ごとに投げる本数が 1 本増える（最大で左手の 3 本）
const THROW_ORDER = [[1], [0, 2], [1, 0, 2]]; // 本数ごとに、左手のどのクナイをどの順で放つか
const THROW_SPEED = 55;
const THROW_STAGGER = 0.035; // 1 本ずつずらして放つ間隔
const THROW_RELOAD = 0.45; // 投げ終えてから左手に新しいクナイが戻るまで
const MISS_MARGIN = 0.05; // 狙った所を過ぎてもこの時間何にも当たらなければ引き返す
const MISS_RETURN_MAX = 0.6; // 空を狙ったときなど、遠くても最長この時間で引き返す
const STUCK_HOLD = 0.12; // 刺さったクナイが抜けて戻り始めるまで（刺さった手応えが見える最小限）
const RETURN_SPEED = 110; // 戻ってくるときの最高速度
const RETURN_ACCEL = 900; // 戻り始めてから最高速度へ達するまでの加速
const RETURN_TURN = 25; // 戻る向きへ曲がる速さ（大きいほどまっすぐ手元へ向かう）
const RETURN_ROLL = 25; // 戻ってくる間に長い軸まわりに回る速さ (rad/s)
const CATCH_DIST = 0.5; // 左手からこの距離まで来たら受け止める
const BLADE_TIP = 0.17; // クナイの原点（刃の付け根）から切っ先まで
const STICK_DEPTH = 0.05; // 刺さったときに埋まる深さ
// 少しだけホーミング: 放つ瞬間に照準の近くにいた敵の胸へ、飛びながらゆるく曲がる
const HOMING_CONE = 7 * (Math.PI / 180); // 照準からこの角度以内の敵を狙う
const HOMING_TURN = 3; // 曲がる速さの上限 (rad/s)。55 m/s なら半径 18 m ほどの弧
const HOMING_GIVE_UP = 60 * (Math.PI / 180); // 狙いがこれ以上横や後ろへ外れたら追うのをやめる
// 数本が続けて当たるたびに時間を止めるとカクつくので、投擲ではヒットストップを使わない
const THROW_HIT = { kick: [-1.5, 0, 0], knock: 140, hitStop: 0, fx: 0.7 };
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
// （軌跡の帯は fx/ribbons.ts）
let throwClock = 0;
let charging = false;
let chargeTime = 0;
let chargeStage = 0;
let fanSpin = 0; // 左手のクナイを輪を中心に回している角度
let fanSpinSpeed = 0;
let spinBlend = 0; // 0 = 扇の構え, 1 = 寝かせて水平に回す構え
let reloading = false;
let reloadTime = 0;
const pendingThrows = [];
const throwAim = new THREE.Vector3();
// 回す構え: 切っ先を水平に寝かせ、刃の平たい面を上へ向けて、縦の軸まわりに回す
// （leftViewModel の空間で組み、扇の構えと同じ leftKunaiRest の空間へ直して補間する）
const restFanQuats = leftFanPivots.map((p) => p.quaternion.clone());
const restFanPos = leftFanPivots.map((p) => p.position.clone());
const SPIN_LAY = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
const leftRestInv = leftKunaiRest.quaternion.clone().invert();
leftKunaiRest.updateMatrix();
for (const k of leftKunais)
    k.updateMatrix();
const spinYaw = new THREE.Quaternion();
const spinQuat = new THREE.Quaternion();
function fanPose(i, spin, outPos, outQuat) {
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
function sampleSpinTrail(i, spin, time) {
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
function updateKunaiSlideSpin(dt) {
    kunaiSlideSpinPrev = kunaiSlideSpin;
    const spinning = player.sliding && kunaiReady() && !attack;
    if (spinning) {
        kunaiSlideSpinVel += (KUNAI_SLIDE_SPIN_SPEED - kunaiSlideSpinVel) * Math.min(1, dt * 12);
        kunaiSlideSpinTarget = NaN;
    }
    else if (kunaiSlideSpin !== 0 || kunaiSlideSpinVel !== 0) {
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
    }
    else {
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
function sampleKunaiSlideTrail(dt) {
    const from = kunaiSlideSpinPrev;
    const to = kunaiSlideSpin;
    if (attack || Math.abs(kunaiSlideSpinVel) < 3 || to === from) {
        slideSpinRibbon.cut();
    }
    else {
        const finalZ = spinPivot.rotation.z;
        const steps = Math.max(1, Math.ceil(Math.abs(to - from) / SPIN_TRAIL_STEP));
        for (let s = 1; s <= steps; s++) {
            const u = s / steps;
            spinPivot.rotation.z = finalZ + (to - (from + (to - from) * u));
            kunai.updateWorldMatrix(true, false);
            viewModel.worldToLocal(slideTrailTip.copy(SPIN_TRAIL_TIP).applyMatrix4(kunai.matrixWorld));
            viewModel.worldToLocal(slideTrailBase.copy(SPIN_TRAIL_BASE).applyMatrix4(kunai.matrixWorld));
            slideSpinRibbon.push(slideTrailTip, slideTrailBase, game.trailNow - dt * (1 - u));
        }
        spinPivot.rotation.z = finalZ;
    }
    slideSpinRibbon.update(game.trailNow);
}
const thrown = [];
const thrownTemplate = createKunai(weaponMats);
const throwDir = new THREE.Vector3();
const throwFrom = new THREE.Vector3();
const KUNAI_AXIS = new THREE.Vector3(0, 1, 0);
function cancelCharge() {
    charging = false;
    fanSpinSpeed = 0;
}
// 照準の先で最初に当たる所（なければ射程の端）を狙う。手元から放っても照準へ集まるようにする
function findThrowAim(out) {
    // パッドでは、照準のすぐ近くに敵がいれば胸へ向けて飛ばす
    const target = findAssistTarget();
    if (target && target.angle < target.size * ASSIST_SNAP)
        return void out.copy(target.point);
    camera.getWorldDirection(throwDir);
    if (castThrow(camera.position, throwDir, THROW_RANGE))
        out.copy(castHit.point);
    else
        out.copy(camera.position).addScaledVector(throwDir, THROW_RANGE);
}
// ---- エイムアシスト ----（player/aimAssist.ts）
// 照準から HOMING_CONE 以内で、いちばん照準に近い敵（壁の向こうは除く）
const homingDir = new THREE.Vector3();
const homingAim = new THREE.Vector3();
function findHomingTarget() {
    camera.getWorldDirection(homingAim);
    let best = null;
    let bestAngle = HOMING_CONE;
    for (const e of enemies) {
        if (!e.alive)
            continue;
        homingDir.subVectors(enemyChest(e, homingDir), camera.position);
        const dist = homingDir.length();
        if (dist < 0.5 || dist > THROW_RANGE)
            continue;
        homingDir.divideScalar(dist);
        const angle = homingDir.angleTo(homingAim);
        if (angle >= bestAngle)
            continue;
        if (castWorld(camera.position, homingDir, dist) < dist - 0.3)
            continue;
        bestAngle = angle;
        best = e;
    }
    return best;
}
// 狙った敵の胸へ、このフレームで曲がれる分だけ向きを寄せる
const homingWant = new THREE.Vector3();
function steerThrown(t, dt) {
    const e = t.target;
    if (!e)
        return;
    if (!e.alive)
        return void (t.target = null);
    homingWant.subVectors(enemyChest(e, homingWant), t.mesh.position).normalize();
    const angle = t.vel.angleTo(homingWant);
    if (angle > HOMING_GIVE_UP)
        return void (t.target = null);
    if (angle < 1e-4)
        return;
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
function sampleFlightTrail(t, at, dir) {
    if (!t.trail)
        return;
    flightSide.subVectors(at, camera.position).cross(dir);
    if (flightSide.lengthSq() < 1e-8)
        flightSide.set(0, 1, 0);
    flightSide.setLength(FLIGHT_TRAIL_WIDTH);
    flightA.copy(at).add(flightSide);
    flightB.copy(at).sub(flightSide);
    t.trail.push(flightA, flightB, throwClock);
}
function launchKunai(index) {
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
    if (target)
        reach = Math.max(reach, throwFrom.distanceTo(enemyChest(target, homingWant)) * 1.2);
    const missAt = Math.min(MISS_RETURN_MAX, reach / THROW_SPEED + MISS_MARGIN);
    const t = { mesh, vel, age: 0, missAt, phase: 'fly', spin: 0, trail, target };
    orientThrown(t, throwDir);
    sampleFlightTrail(t, throwFrom, throwDir);
    thrown.push(t);
    throwPunch = 1;
    kickVel.x += 1.2 * DEG * 22;
    kickVel.y += -0.6 * DEG * 22;
    sfx.playThrow(THROW_SWISH);
}
function orientThrown(t, dir) {
    t.mesh.quaternion.setFromUnitVectors(KUNAI_AXIS, dir);
    t.mesh.rotateY(t.spin);
}
function removeThrown(i) {
    thrown[i].mesh.removeFromParent();
    thrown[i].trail?.dispose();
    thrown.splice(i, 1);
}
function stickThrown(t, at, onDummy, dir) {
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
        if (hitDir.lengthSq() < 1e-6)
            hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
        hitDir.normalize();
        applyDummyHit(THROW_HIT, at, 'throw');
        startWorldSlow();
    }
    else {
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
    }
    else if (worldSlowAge >= WORLD_SLOW_HOLD + WORLD_SLOW_RELEASE + WORLD_SLOW_COOLDOWN) {
        worldSlowAge = 0;
        worldSlowRingAge = 0; // 輪と音は、入ったときだけ（かけ直しでは出さない）
        sfx.playWorldSlow(WORLD_SLOW_HOLD, WORLD_SLOW_RELEASE);
    }
}
// 時間を進め、世界の時間に掛ける速さを返す
function worldSlowFactor(dt) {
    worldSlowAge += dt;
    worldSlowRingAge += dt;
    const u = THREE.MathUtils.clamp((worldSlowAge - WORLD_SLOW_HOLD) / WORLD_SLOW_RELEASE, 0, 1);
    return THREE.MathUtils.lerp(WORLD_SLOW_SCALE, 1, u * u);
}
// 刺さった所から抜く（または飛んでいる途中で引き返す）。ここからは何にも当たらず手元へ向かう
function startReturn(t) {
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
    }
    else {
        t.trail.cut();
    }
    playSwish(RETURN_SWISH);
}
const catchPoint = new THREE.Vector3();
const returnWant = new THREE.Vector3();
const backDir = new THREE.Vector3();
function updateReturn(t, dt) {
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
function updateThrown(dt) {
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
            if (t.age > STUCK_HOLD)
                startReturn(t);
            continue;
        }
        if (t.phase === 'fly' && t.age > t.missAt)
            startReturn(t);
        if (t.phase === 'back') {
            if (updateReturn(t, dt))
                removeThrown(i);
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
// ---- 鎖鎌 ----（weapons/sickleCombat.ts）
// ---- 投擲の毎フレームの処理（左手のクナイ） ----
function updateThrow(dt) {
    throwClock += dt;
    if (charging && !controls.isLocked)
        cancelCharge();
    if (game.throwHeld && controls.isLocked && !charging && !reloading && kunaiReady()) {
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
        if (!game.throwHeld)
            releaseThrow();
    }
    // 溜めるほど速く回す。輪が半周するたびに小さく鳴らす
    spinBlend += ((charging ? 1 : 0) - spinBlend) * Math.min(1, dt * 35);
    const spinTarget = charging ? 14 + 10 * (chargeStage - 1) : 0;
    fanSpinSpeed += (spinTarget - fanSpinSpeed) * Math.min(1, dt * 20);
    const prevSpin = fanSpin;
    fanSpin += fanSpinSpeed * dt;
    if (charging && Math.floor(fanSpin / Math.PI) > Math.floor(prevSpin / Math.PI))
        playRing(1.3, 0.25, 0.08);
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
        }
        else {
            for (let s = 1; s <= steps; s++) {
                const u = s / steps;
                sampleSpinTrail(i, prevSpin + (fanSpin - prevSpin) * u, throwClock - dt * (1 - u));
            }
        }
        ribbon.update(throwClock);
    }
    while (pendingThrows.length > 0 && throwClock >= pendingThrows[0].at) {
        launchKunai(pendingThrows.shift().index);
    }
    if (reloading) {
        reloadTime -= dt;
        if (reloadTime <= 0) {
            // 手を下げている間に新しい 3 本へ持ち替えたことにする
            reloading = false;
            fanSpinSpeed = 0;
            for (const k of leftKunais)
                k.visible = true;
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
function updateHitFx(dt) {
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
const TRAIL_LIFE = 0.1; // 軌跡が消えるまでの時間
const TRAIL_MAX = 128;
// クナイのローカル座標。切っ先（0.17）からはみ出すと、縁の線が刃から離れて浮いて見えるので、ほぼ切っ先に揃える
const TRAIL_TIP = new THREE.Vector3(0, 0.175, 0);
const TRAIL_BASE = new THREE.Vector3(0, 0.06, 0);
const TRAIL_BASE_THIN = new THREE.Vector3(0, 0.13, 0);
const trailSamples = [];
let lastTrailSample = -Infinity;
const trailPositions = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 3), 3);
trailPositions.setUsage(THREE.DynamicDrawUsage);
const trailFade = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2), 1);
trailFade.setUsage(THREE.DynamicDrawUsage);
const trailSide = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2), 1);
for (let i = 0; i < TRAIL_MAX; i++)
    trailSide.setX(i * 2 + 1, 1);
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
function kunaiPointsInCamera(tip, base, thin) {
    kunai.updateWorldMatrix(true, false);
    camera.worldToLocal(tip.copy(TRAIL_TIP).applyMatrix4(kunai.matrixWorld));
    camera.worldToLocal(base.copy(thin ? TRAIL_BASE_THIN : TRAIL_BASE).applyMatrix4(kunai.matrixWorld));
}
function sampleTrail() {
    if (!attack)
        return;
    for (const [from, to, thin = false] of attack.trails) {
        const end = Math.min(to, attackTime);
        for (let s = Math.max(from, lastTrailSample + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
            attackPoseAt(attack, s, tmpSamplePose);
            applyPose(tmpSamplePose);
            const sample = trailSamples.length >= TRAIL_MAX ? trailSamples.shift() : { tip: new THREE.Vector3(), base: new THREE.Vector3(), time: 0 };
            kunaiPointsInCamera(sample.tip, sample.base, thin);
            sample.time = game.trailNow - (attackTime - s);
            trailSamples.push(sample);
            lastTrailSample = s;
        }
    }
}
const tmpSamplePose = newPose();
function updateTrailMesh() {
    while (trailSamples.length && game.trailNow - trailSamples[0].time > TRAIL_LIFE)
        trailSamples.shift();
    const n = trailSamples.length;
    for (let i = 0; i < n; i++) {
        const s = trailSamples[i];
        const fade = 1 - (game.trailNow - s.time) / TRAIL_LIFE;
        const base = taperBase(s.base, s.tip, fade, KUNAI_RIBBON.taper);
        trailPositions.setXYZ(i * 2, base.x, base.y, base.z);
        trailPositions.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
        trailFade.setX(i * 2, fade);
        trailFade.setX(i * 2 + 1, fade);
    }
    // 時間が飛んでいる所（別の振り）はつながない
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
        if (trailSamples[i + 1].time - trailSamples[i].time > TRAIL_STEP * 1.5)
            continue;
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
    grappling: () => sickleState.grapple !== null, applyCameraOffset, restoreCameraOffset,
});
// ---- ハンドガン ----（weapons/handgunCombat.ts）
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
const enemyBullets = [];
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
// 狙う所: プレイヤーの胸
function aimTarget(out) {
    return out.set(position.x, position.y + player.eyeHeight - 0.35, position.z);
}
function updateDummyAim(dt) {
    aimTarget(enemyTarget);
    const dx = enemyTarget.x - en.root.position.x;
    const dz = enemyTarget.z - en.root.position.z;
    const want = Math.atan2(dx, dz);
    const turn = wrapAngle(want - en.yaw) * Math.min(1, dt * ENEMY_TURN_RATE);
    en.yaw = wrapAngle(en.yaw + THREE.MathUtils.clamp(turn, -ENEMY_TURN_MAX * dt, ENEMY_TURN_MAX * dt));
    en.root.quaternion.setFromAxisAngle(UP, en.yaw);
    const yaw = THREE.MathUtils.clamp(wrapAngle(want - en.yaw), -ENEMY_AIM_YAW_MAX, ENEMY_AIM_YAW_MAX);
    const pitch = THREE.MathUtils.clamp(Math.atan2(enemyTarget.y - (en.root.position.y + ENEMY_GUN_Y), Math.hypot(dx, dz)), -ENEMY_AIM_PITCH_MAX, ENEMY_AIM_PITCH_MAX);
    const k = 1 - Math.exp(-ENEMY_AIM_RATE * dt);
    en.aimYaw += (yaw - en.aimYaw) * k;
    en.aimPitch += (pitch - en.aimPitch) * k;
}
function updateEnemyFire(dt) {
    en.flashAge += dt;
    en.muzzleFx.visible = en.flashAge < MUZZLE_FLASH_LIFE;
    en.cooldown -= dt;
    // 撃つ少し前から腰を落として構える。構えきるまでは撃たない（見てからかわせる合図）
    const canAim = en.alive && game.playerHp > 0 && en.riseTime >= RESPAWN_RISE_TIME && en.flashT >= ENEMY_HIT_RECOVER && en.airY <= 0
        && en.dodgeT <= 0;
    const braceWant = canAim && en.cooldown < ENEMY_BRACE_TIME ? 1 : 0;
    en.brace += (braceWant - en.brace) * Math.min(1, dt * (braceWant > en.brace ? ENEMY_BRACE_RATE : ENEMY_BRACE_RATE * 0.5));
    if (!canAim || en.cooldown > 0 || en.brace < ENEMY_BRACE_READY)
        return;
    // 攻撃を受けてよろけている間は撃たない。当たってからしばらくと、上体の反りや銃の跳ね上がりが残っている間
    if (Math.abs(en.gunSpring.x.x) > ENEMY_STAGGER_LIMIT || en.leanSpring.x.length() > ENEMY_LEAN_LIMIT)
        return;
    if (en.footState.some((f) => f.t < 1))
        return; // 踏ん張って足を踏み出している最中
    en.muzzle.updateWorldMatrix(true, false);
    enemyFrom.setFromMatrixPosition(en.muzzle.matrixWorld);
    enemyFwd.set(0, 0, -1).transformDirection(en.muzzle.matrixWorld); // 銃口は -Z
    enemyTo.subVectors(aimTarget(enemyTarget), enemyFrom);
    const dist = enemyTo.length();
    enemyTo.divideScalar(dist);
    if (enemyFwd.angleTo(enemyTo) > ENEMY_FIRE_CONE)
        return;
    if (castWorld(enemyFrom, enemyTo, dist) < dist)
        return; // 柱の陰にいる間は撃たない
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
function updateEnemyBullets(dt) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        const step = ENEMY_BULLET_SPEED * dt;
        if (b.hit || b.traveled >= ENEMY_BULLET_RANGE) {
            b.tail -= step;
            if (!b.hit)
                b.pos.addScaledVector(b.dir, step);
        }
        else {
            // この 1 歩の間に、まず壁、その手前でプレイヤーの体（縦の線分の周り）に当たるかを調べる
            const wall = castWorld(b.pos, b.dir, step);
            enemyNext.copy(b.pos).addScaledVector(b.dir, wall);
            enemyPath.set(b.pos, enemyNext);
            enemyBody.start.set(position.x, position.y + 0.15, position.z);
            enemyBody.end.set(position.x, position.y + player.eyeHeight + 0.05, position.z);
            if (game.playerHp > 0 && tryParry(b)) {
                b.mesh.removeFromParent();
                enemyBullets.splice(i, 1);
                continue;
            }
            closestSegmentPoints(enemyPath, enemyBody, enemyOnPath, enemyOnBody);
            if (game.playerHp > 0 && enemyOnPath.distanceTo(enemyOnBody) < ENEMY_HIT_RADIUS) {
                b.hit = true;
                b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + b.pos.distanceTo(enemyOnPath));
                b.pos.copy(enemyOnPath);
                if (b.from)
                    b.from.hitPlayer = true;
                onPlayerShot(b.dir);
            }
            else if (wall < step) {
                b.hit = true;
                b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + wall);
                b.pos.copy(enemyNext);
                spawnSparks(enemyNext, b.dir, 6 + Math.floor(Math.random() * 4), 0.6, 0.5);
                sfx.playRicochet();
            }
            else {
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
// 実時間を進め、ゲームの時間に掛ける速さを返す（止まっている間はヒットストップが止めるので 1）
function parrySlowFactor(realDt) {
    parryFxAge += game.realDt;
    game.parryReturnAge += game.realDt;
    const t = parryFxAge - PARRY_HIT_STOP;
    if (t < 0)
        return 1;
    const u = THREE.MathUtils.clamp((t - PARRY_SLOW_HOLD) / PARRY_SLOW_RELEASE, 0, 1);
    return THREE.MathUtils.lerp(PARRY_SLOW_SCALE, 1, u * u);
}
function parryMono() {
    const after = Math.max(0, parryFxAge - PARRY_HIT_STOP);
    const main = parryFxAge < PARRY_HIT_STOP ? 1 : Math.max(0, 1 - after / PARRY_FX_FADE) ** 2;
    const rAfter = Math.max(0, game.parryReturnAge - PARRY_RETURN_MONO);
    const ret = game.parryReturnAge < PARRY_RETURN_MONO ? 1 : Math.max(0, 1 - rAfter / PARRY_RETURN_MONO_FADE);
    return Math.max(main, ret);
}
const PARRY_SPREAD = 1.5 * DEG;
const parryChest = new THREE.Vector3();
const parryLook = new THREE.Vector3();
const parryAt = new THREE.Vector3();
const parryAim = new THREE.Vector3();
const parryRay = new THREE.Line3();
const inParryWindow = (t, [a, b]) => t >= a - PARRY_EARLY && t <= b + PARRY_LATE;
function parryActive() {
    // クナイは指先で回す細い軌跡を除いた、本当に振っている間だけ
    if (attack && game.shownWeapon === 'kunai')
        return attack.trails.some((w) => !w[2] && inParryWindow(attackTime, w));
    if (swordState.swordAttack && game.shownWeapon === 'sword')
        return swordState.swordAttack.trails.some((w) => inParryWindow(swordState.swordTime, w));
    return false;
}
// enemyPath（この 1 歩で弾が進む線分）が入っている前提で呼ぶ
function tryParry(b) {
    if (!parryActive())
        return false;
    aimTarget(parryChest);
    enemyPath.closestPointToPoint(parryChest, true, parryAt);
    if (parryAt.distanceTo(parryChest) > PARRY_RANGE)
        return false;
    camera.getWorldDirection(parryLook);
    if (parryLook.angleTo(b.dir) < Math.PI - PARRY_ANGLE)
        return false;
    // このまま進んでも体に当たらない弾は放っておく
    parryRay.start.copy(b.pos);
    parryRay.end.copy(b.pos).addScaledVector(b.dir, ENEMY_BULLET_RANGE);
    closestSegmentPoints(parryRay, enemyBody, enemyOnPath, enemyOnBody);
    if (enemyOnPath.distanceTo(enemyOnBody) > PARRY_THREAT)
        return false;
    // 弾いた所: 間合いの縁まで来ていればそこ、まだ手前ならこの 1 歩の中で胸に最も近い所
    if (b.pos.distanceTo(parryChest) <= PARRY_RANGE)
        parryAt.copy(b.pos);
    const dir = new THREE.Vector3();
    const shooter = b.from;
    if (shooter?.alive)
        dir.set(shooter.root.position.x, shooter.root.position.y + 1.3, shooter.root.position.z).sub(parryAt).normalize();
    else
        dir.copy(b.dir).negate();
    dir.x += (Math.random() * 2 - 1) * PARRY_SPREAD;
    dir.y += (Math.random() * 2 - 1) * PARRY_SPREAD;
    dir.z += (Math.random() * 2 - 1) * PARRY_SPREAD;
    dir.normalize();
    const mesh = new THREE.Mesh(tracerGeo, parryTracerMat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    bullets.push({ pos: parryAt.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, parried: true });
    // 演出: 一瞬止めて火花を散らし、金属の「キン」
    game.hitStop = Math.max(game.hitStop, PARRY_HIT_STOP);
    hitStopTotal = game.hitStop;
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
function closestSegmentPoints(a, b, outA, outB) {
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
    }
    else {
        const c = segD1.dot(segR);
        const bb = segD1.dot(segD2);
        const denom = aa * ee - bb * bb;
        s = denom > 1e-9 ? THREE.MathUtils.clamp((bb * f - c * ee) / denom, 0, 1) : 0;
        t = (bb * s + f) / ee;
        if (t < 0) {
            t = 0;
            s = THREE.MathUtils.clamp(-c / aa, 0, 1);
        }
        else if (t > 1) {
            t = 1;
            s = THREE.MathUtils.clamp((bb - c) / aa, 0, 1);
        }
    }
    outA.copy(a.start).addScaledVector(segD1, s);
    outB.copy(b.start).addScaledVector(segD2, t);
}
// 撃たれた: 体力を削り、撃たれた向きへ視点を弾く
function onPlayerShot(dir) {
    damagePlayer(ENEMY_BULLET_DAMAGE);
    sfx.playHurt();
    addTrauma(0.35);
    camera.getWorldDirection(enemyTo);
    // 正面から撃たれたら視点が上へ、横からなら撃たれた向きへねじれる
    const side = enemyTo.x * dir.z - enemyTo.z * dir.x;
    kickVel.x += 2.5 * DEG * 22;
    kickVel.z += side * 3 * DEG * 22;
}
const ammoPips = [...document.querySelectorAll('#ammo i')];
const ammoHud = document.getElementById('ammo');
const weaponHud = document.getElementById('weapon');
const weaponName = weaponHud.querySelector('.name span');
const weaponIcons = [...weaponHud.querySelectorAll('.icon svg')];
const WEAPON_LABELS = { kunai: 'KUNAI', handgun: 'HANDGUN', sword: 'SWORD', sickle: 'CHAIN SICKLE', axe: 'BATTLE AXE', chakram: 'CHAKRAM' };
let weaponHudShown = null;
// 右下の武器表示: 構えている武器のアイコンと名前。持ち替えたら差し込み直す
function updateWeaponHud() {
    if (weaponHudShown === game.shownWeapon)
        return;
    const first = weaponHudShown === null;
    weaponHudShown = game.shownWeapon;
    weaponName.textContent = WEAPON_LABELS[game.shownWeapon];
    for (const svg of weaponIcons)
        svg.classList.toggle('on', svg.dataset.w === game.shownWeapon);
    if (first)
        return;
    const icon = weaponIcons.find((svg) => svg.dataset.w === game.shownWeapon);
    for (const el of [weaponName, icon]) {
        el.classList.remove('in');
        void el.getBoundingClientRect(); // 続けて持ち替えても頭から流し直す
        el.classList.add('in');
    }
}
// ---- 右の操作一覧 ----（ui/controlsHud.ts）
function updateGun(dt) {
    gunState.gunCooldown = Math.max(0, gunState.gunCooldown - dt);
    updateDeadEye();
    // 頂点で一瞬止めたあと、腕で反動を押し戻すように重たく戻す
    if (gunState.gunRecoilHold > 0)
        gunState.gunRecoilHold -= dt;
    else
        gunState.gunRecoil += -gunState.gunRecoil * Math.min(1, dt * 8);
    if (!gunReady()) {
        // 持ち替えたら装填は最初からやり直す（薬莢を落とした後なら弾は空のまま）
        if (gunState.gunReloading)
            endReload();
        if (gunState.twirlT >= 0)
            endTwirl(false);
        endSlideSpin();
        gunState.fireQueued = false;
        gunState.reloadQueued = false;
    }
    if (gunState.reloadQueued) {
        gunState.reloadQueued = false;
        if (!gunState.gunReloading && gunState.gunAmmo < GUN_AMMO)
            startReload();
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
        }
        else {
            evalReloadPose(gunState.gunReloadT);
            poseReloadParts(gunState.gunReloadT);
        }
    }
    else if (gunState.fireQueued && gunState.gunCooldown <= 0) {
        gunState.fireQueued = false;
        if (gunState.gunAmmo > 0)
            fireGun();
        else
            startReload();
    }
    // 撃ち尽くしたら、反動が収まったところで自動で装填する
    if (gunReady() && !gunState.gunReloading && gunState.gunAmmo === 0 && gunState.gunCooldown <= 0)
        startReload();
    // シリンダーは撃つたびに次の薬室へ素早く回す。弾いたときは惰性で回り続ける
    if (gunState.cylinderSpin > 0) {
        gunCylinder.rotation.z += gunState.cylinderSpin * dt;
        gunState.cylinderSpin *= Math.exp(-2 * dt);
        gunState.cylinderTarget = gunCylinder.rotation.z;
    }
    else {
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
// ---- ポストエフェクト ----（シェーダーは fx/postShaders.ts）
// 周辺ブラー・ビネット・集中線: これより速いと効果が出始め、SPEED_FX_FULL で最大になる
const SPEED_FX_START = SPRINT_SPEED - 1;
const SPEED_FX_FULL = 30;
const MAX_RADIAL_BLUR = 0.07; // 画面端で中心方向へぼかす量
const MAX_VIGNETTE = 0.3;
// MSAA を保つため、マルチサンプルのレンダーターゲットで描く
const composerTarget = new THREE.WebGLRenderTarget(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
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
function updateSpeedFx(dt) {
    const hSpeed = Math.hypot(velocity.x, velocity.z);
    let target = THREE.MathUtils.clamp((hSpeed - SPEED_FX_START) / (SPEED_FX_FULL - SPEED_FX_START), 0, 1);
    if (player.dashTime > 0)
        target = 1;
    // 強くなるときは素早く、弱まるときはゆっくり
    speedFx += (target - speedFx) * Math.min(1, dt * (target > speedFx ? 12 : 4));
    if (target === 0 && speedFx < 0.002)
        speedFx = 0;
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
function runAttackDebug(def, params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    const step = 1 / 120;
    if (params.has('near'))
        position.set(en.root.position.x, 0, en.root.position.z + 1.6);
    for (let i = 0; i < 30; i++)
        update(step); // 着地させて落ち着かせる
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
                if (o instanceof THREE.Mesh)
                    o.material = mat;
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
function runSwordDebug(def, params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'sword';
    const step = 1 / 120;
    if (params.has('near'))
        position.set(en.root.position.x, 0, en.root.position.z + 1.6);
    for (let i = 0; i < 30; i++)
        update(step);
    startSwordAttack(def);
    const tEnd = Number(params.get('t') ?? def.duration);
    if (!params.has('onion')) {
        while (swordState.swordAttack && swordState.swordTime + step <= tEnd) {
            update(step);
            updateHitFx(step);
        }
    }
    else {
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
                if (o instanceof THREE.Mesh)
                    o.material = mat;
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
function runAxeDebug(def, params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'axe';
    const step = 1 / 120;
    if (params.has('near'))
        position.set(en.root.position.x, 0, en.root.position.z + 1.8);
    for (let i = 0; i < 30; i++)
        update(step);
    startAxeAttack(def);
    const tEnd = Number(params.get('t') ?? def.duration);
    if (!params.has('onion')) {
        while (axeState.axeAttack && axeState.axeTime + step <= tEnd) {
            update(step);
            updateHitFx(step);
        }
    }
    else {
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
                if (o instanceof THREE.Mesh)
                    o.material = mat;
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
function runStageDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    enterStage(params.get('stage'));
    applyStageRise(Infinity);
    const num = (k, v) => (params.has(k) ? Number(params.get(k)) : v);
    // &px=0&py=0&pz=0（足もとの位置）&vx=0&vy=0&vz=0（速度）で、プレイヤーを置いてから進める（坂などの当たり判定を確かめる）。
    // 0.1 秒ごとのプレイヤーの位置を console に出す
    const placed = ['px', 'py', 'pz'].some((k) => params.has(k));
    if (placed) {
        position.set(num('px', position.x), num('py', position.y), num('pz', position.z));
        velocity.set(num('vx', 0), num('vy', 0), num('vz', 0));
    }
    if (params.has('sim')) {
        const step = 1 / 60;
        const log = [];
        const playerLog = [];
        const r = (v) => v.toFixed(1);
        for (let i = 0; i * step < num('sim', 0); i++) {
            update(step);
            if (i % 60 === 0)
                log.push(`${r(i * step)}s hp=${game.playerHp} ` + enemies.map((e) => `(${r(e.root.position.x)},${r(e.root.position.y)},${r(e.root.position.z)}${e.moving ? ' walk' : ''})`).join(' '));
            if (placed && i % 6 === 0)
                playerLog.push(`${r(i * step)}s (${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}) v=(${r(velocity.x)},${r(velocity.y)},${r(velocity.z)})${player.onGround ? ' ground' : ''}${player.groundRamp ? ' ramp' : ''}`);
        }
        console.log('ENEMY_LOG\n' + log.join('\n'));
        if (placed)
            console.log('PLAYER_LOG\n' + playerLog.join('\n'));
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
function runFocusDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'sword';
    controls.isLocked = true;
    const step = 1 / 120;
    position.set(en.root.position.x + 1.5, 0, en.root.position.z + 9);
    for (let i = 0; i < 30; i++)
        update(step);
    game.throwHeld = swordState.focusPressed = true;
    swordState.focusCharge = 1;
    const tick = () => {
        game.realDt = step;
        update(step * game.timeScale);
        updateHitFx(step);
    };
    for (let t = 0; t < Number(params.get('focus') ?? 0.5); t += step)
        tick();
    if (params.has('rush')) {
        swordState.swordPressed = true;
        for (let t = 0; t < Number(params.get('rush')); t += step)
            tick();
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
function runGrappleDebug(params) {
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
    for (let i = 0; i < 30; i++)
        update(step);
    game.throwHeld = sickleState.throwPressed = true;
    const log = [];
    for (let t = 0; t < 2; t += step) {
        if (t >= 0.2)
            game.throwHeld = false;
        if (!params.has('now') && t >= wAt)
            keys.add('KeyW');
        if (params.has('shift'))
            keys.add('ShiftLeft');
        update(step);
        const r = (v) => v.toFixed(2);
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
const TITLE_CAM_QUAT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(TITLE_CAM_POS, new THREE.Vector3(0, 0, -8), UP));
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
function setViewModelsVisible(v) {
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
function applyStageRise(t) {
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
        if (f < 1)
            done = false;
        // 箱は原点が底面の角なので、高さだけ縮めれば底面から伸びるように見える。まだのものは潰して消す
        const y0 = b.y0 ?? 0;
        let h = 0;
        if (s >= 0)
            h = Math.max(RISE_BASE_HEIGHT, (b.h - y0) * easeOutCubic(k));
        if (h <= 0)
            riseMatrix.makeScale(0, 0, 0);
        else if (r.ramp)
            rampMatrix(r.ramp, h, riseMatrix);
        else
            riseMatrix.makeScale(b.maxX - b.minX, h, b.maxZ - b.minZ).setPosition(b.minX, y0, b.minZ);
        r.mesh.setMatrixAt(r.index, riseMatrix);
        const fill = f >= 1 ? RISE_FILL_DONE : f > 0 ? y0 + (b.h - y0) * easeInOutCubic(f) : -1;
        r.mesh.geometry.getAttribute('aFill').setX(r.index, fill);
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
    if (lk < 1)
        done = false;
    for (const line of riseLines) {
        const { width, height } = line.geometry.parameters;
        const e = Math.max(easeOutQuart(lk), 1e-4);
        line.scale.set(width > height ? e : 1, width > height ? 1 : e, 1);
        line.visible = lk > 0;
    }
    // 敵は床の下から迫り上がってくる
    for (const e of enemies) {
        const dk = THREE.MathUtils.clamp((t - e.riseDelay) / RISE_DUMMY_TIME, 0, 1);
        if (dk < 1)
            done = false;
        e.root.position.y = e.baseY - (DUMMY_HEIGHT + 0.1) * (1 - easeOutQuart(dk));
    }
    return done;
}
function updateStageRise(dt) {
    if (riseT < 0)
        return;
    riseT += dt;
    if (applyStageRise(riseT - INTRO_RISE_DELAY)) {
        applyStageRise(Infinity); // 床のグリッドを果てまで出しきる
        riseT = -1;
        sfx.stopStageRise();
    }
}
const STAGE_BUILDERS = { station: buildStation, warehouse: buildWarehouse, parking: buildParking };
let pendingStage = null; // 次の入場で入るステージ。null = 訓練場
// 当たり判定では、同じ幅・同じ高さで z 方向に継ぎ目なく並んだ箱を 1 つにまとめる。
// 別々のままだと、継ぎ目をまたいだときに、まだ乗っていない側の箱の側面に押し返されてつっかえる
function mergeBoxes(list) {
    const out = [];
    const sorted = [...list].sort((a, b) => a.minX - b.minX || a.maxX - b.maxX || a.h - b.h || (a.y0 ?? 0) - (b.y0 ?? 0) || b.maxZ - a.maxZ);
    for (const b of sorted) {
        const last = out[out.length - 1];
        if (last && last.minX === b.minX && last.maxX === b.maxX && last.h === b.h && (last.y0 ?? 0) === (b.y0 ?? 0) && last.minZ === b.maxZ)
            last.minZ = b.minZ;
        else
            out.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.h, y0: b.y0 });
    }
    return out;
}
const stageLooks = { terrain: TERRAIN_GRID, struct: STRUCT_GRID };
const stageMaterial = (b) => b.look === 'plain' ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : gridMaterial(stageLooks[b.look], b.gridOrigin);
// 線の引き方と格子の起点が同じ箱ごとに分ける（1 つのメッシュにまとめる単位）
function groupStageBoxes(list) {
    const groups = new Map();
    for (const b of list) {
        const o = b.gridOrigin;
        const key = `${b.look}|${o ? `${o.x},${o.y},${o.z}` : ''}`;
        groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    return [...groups.values()];
}
function addStageLines(layout, parent) {
    return layout.lines.map((l) => {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.d), groundLineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(l.x, l.y, l.z);
        parent.add(line);
        return line;
    });
}
function enterStage(id) {
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
    while (enemies.length > 0)
        removeEnemy(enemies[0]);
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
    if (hasEnemies)
        beginStageRun();
    // 見た目の箱は、線の引き方と格子の起点ごとに 1 つのメッシュにまとめる。遠景は操作を返すのを待たないので別にする
    for (const [list, inArena] of [[[...layout.boxes, ...layout.decor], true], [layout.scenery, false]]) {
        for (const group of groupStageBoxes(list))
            addBoxes(group, stageMaterial(group[0]), (b) => b.light, root, inArena);
    }
    for (const group of groupStageBoxes(layout.ramps ?? []))
        addRamps(group, stageMaterial(group[0]), root);
    blocks.push(...mergeBoxes([...layout.boxes, ...layout.colliders]));
    ramps.push(...(layout.ramps ?? []));
    for (const line of addStageLines(layout, root))
        riseLines.push(line);
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
const previews = new Map();
let previewShown = null; // 今出ている景色（沈めている途中も含む）
let previewWant = null; // 出したい景色。null = タイトルへ戻す
let previewK = 0; // 景色の伸び具合 (0..1)
let previewTime = 0; // カメラを流す時間
let previewCamK = 1; // カメラの寄せ具合 (0..1)。1 で寄りきった
const previewCamFromPos = new THREE.Vector3();
const previewCamFromQuat = new THREE.Quaternion();
const previewEye = new THREE.Vector3();
const previewLook = new THREE.Vector3();
const previewQuat = new THREE.Quaternion();
const previewMatrix = new THREE.Matrix4();
function getStagePreview(id) {
    let p = previews.get(id);
    if (p)
        return p;
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
    const ids = stageButtons.map((b) => b.dataset.stage).filter((id) => !!id && id in STAGE_BUILDERS);
    const idle = (fn) => 'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200);
    const next = () => {
        const id = ids.shift();
        if (!id)
            return;
        getStagePreview(id);
        idle(next);
    };
    idle(next);
}
// ステージ選択で選んでいるステージを背景に出す（null でタイトルへ戻す）
function showStagePreview(id) {
    if (id === previewWant)
        return;
    previewWant = id;
    previewCamFromPos.copy(camera.position);
    previewCamFromQuat.copy(camera.quaternion);
    previewCamK = 0;
    if (id)
        getStagePreview(id); // 沈めている間に組んでおく
}
// 画が動いたかを返す（動いていなければ描き直さなくてよい）
function updateStagePreview(dt) {
    if (!previewWant && !previewShown && previewCamK >= 1)
        return false;
    // 武器の選択画面で覆っている間は、組み上がって寄りきっていれば揺らさずに止めて描き直さない（閉じたら続きから揺れる）
    if (pickerOpen() && previewShown === previewWant && previewK >= 1 && previewCamK >= 1)
        return false;
    previewTime += dt;
    // 景色: 出したいものと違うものが出ていれば沈め、沈みきったら入れ替えて伸ばす
    if (previewShown !== previewWant) {
        previewK = Math.max(0, previewK - dt / PREVIEW_GROW_TIME);
        if (previewK <= 0 || !previewShown) {
            if (previewShown)
                previews.get(previewShown).root.visible = false;
            previewShown = previewWant;
            previewK = 0;
            if (previewShown) {
                const { root, layout } = previews.get(previewShown);
                root.visible = true;
                riseOrigin.value.set(layout.start.x, layout.start.z);
            }
            else {
                riseOrigin.value.copy(TITLE_RISE_ORIGIN);
            }
        }
    }
    else if (previewShown) {
        previewK = Math.min(1, previewK + dt / PREVIEW_GROW_TIME);
    }
    if (previewShown) {
        const e = easeOutQuart(previewK);
        previews.get(previewShown).root.scale.y = Math.max(e, 1e-3);
        groundReveal.value = e * PREVIEW_REVEAL;
    }
    else {
        groundReveal.value = 0;
    }
    // カメラ: 寄せる先は、選んでいるステージの view を左右に流したもの。無ければタイトルの見下ろし
    if (previewWant) {
        const { eye, target } = previews.get(previewWant).layout.view;
        previewLook.set(target.x, target.y, target.z);
        previewEye.set(eye.x + Math.sin(previewTime * PREVIEW_SWAY_SPEED) * PREVIEW_SWAY, eye.y, eye.z);
        previewQuat.setFromRotationMatrix(previewMatrix.lookAt(previewEye, previewLook, UP));
    }
    else {
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
    for (const { root } of previews.values())
        root.visible = false;
    previewShown = previewWant = null;
    previewK = 0;
    previewCamK = 1;
    riseOrigin.value.copy(TITLE_RISE_ORIGIN);
}
const transitionFx = document.getElementById('transition');
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
function updateStageIntro(dt) {
    introT += dt;
    if (!introSwitched) {
        if (introT >= INTRO_SWITCH_TIME)
            switchToStage();
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
        if (stageTitle.update(titleT))
            finishStageIntro();
    }
    else if (pendingStage) {
        // ステージでは、組み上がりきった瞬間にタイトルを叩きつけてから操作を返す。
        // 叩きつけの少し前から高まる音を鳴らし始め、鳴り終わる瞬間に叩きつける
        const untilAppear = INTRO_REVEAL_TIME + INTRO_APPEAR_TIME - introT;
        const untilBuilt = riseT < 0 ? 0 : arenaRiseEnd - (riseT - INTRO_RISE_DELAY);
        if (titleRiserT < 0 && Math.max(untilAppear, untilBuilt) <= sfx.TITLE_RISER_TIME) {
            titleRiserT = 0;
            sfx.playTitleRiser();
        }
        if (titleRiserT >= 0)
            titleRiserT += dt;
        if (k >= 1 && arenaDone && titleRiserT >= sfx.TITLE_RISER_TIME)
            startStageTitle();
    }
    else if (k >= 1 && arenaDone) {
        finishStageIntro();
    }
}
// ---- ステージの始まりのタイトル ----
const TITLE_FOV_PUNCH = 7;
const TITLE_FOV_BACK = 0.4;
const stageTitle = createStageTitle(camera, renderer);
let stageRoot = null; // 入ったステージの箱を持つ親（タイトルのマスクを描くのに使う）
function renderTitleMask() {
    if (titleT >= 0 && stageRoot)
        stageTitle.renderMask([stageRoot], scene);
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
    attackPressed = false;
    document.body.classList.remove('on-title');
    if (stageRun)
        stageRun.running = true; // 操作を返したところから時間を測る
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
}
else if (debugSword) {
    runSwordDebug(debugSword, debugParams);
}
else if (debugAxe) {
    runAxeDebug(debugAxe, debugParams);
}
else if ((debugParams.get('stage') ?? '') in STAGE_BUILDERS) {
    runStageDebug(debugParams);
}
else if (debugParams.has('focus')) {
    runFocusDebug(debugParams);
}
else if (debugParams.has('grapple')) {
    runGrappleDebug(debugParams);
}
else {
    // スコアの演出を確かめる: ?score で、倒し方の組み合わせを変えながら繰り返し出す
    if (debugParams.has('score')) {
        const demos = [
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
        if (game.hitStop > 0) {
            // ヒットストップ中は全体を止める（入力は溜めておき、揺れだけ続ける）
            game.hitStop -= realFrame;
            shakeTime += realFrame;
        }
        else {
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
            timeScale: game.timeScale * slow * worldSlow, // 世界だけのスローでも音はこもらせる
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
const QUALITY_PRESETS = {
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
        if (rt.samples === q.msaa)
            continue;
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

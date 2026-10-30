import * as THREE from 'three';
import { broadcastBossBreak, broadcastBossVictory, broadcastPartyDefeat, confirmRemoteHit, initMultiplayer, isMultiplayerGuest, latestAdds, latestBossSnapshot, latestMissiles, leaveMultiplayer, multiplayerPartyDown, multiplayerPartySize, remotePlayers, returnToMultiplayerLobby, sendAddHit, sendAddKill, sendKunaiBossHit, startMultiplayer, updateMultiplayer } from './multiplayer/connectionTest.js';
import { applyBossSnapshot } from './multiplayer/bossSnapshot.js';
import { addSpawnId, applyAddSnapshot, markAddSpawn } from './multiplayer/enemySnapshot.js';
import { remoteMissileBlast, remoteMissileHurt, remoteMissileParry, remoteMissileShotDown, updateRemoteMissileEffects, updateRemoteMissiles } from './enemy/bossMissiles.js';
import * as sfx from './audio.js';
import { ensureAudio, playHit } from './audio.js';
import { resetScore, showKillScore, totalScore, updateScoreHud } from './score.js';
import { CLIP_ASPECT, noteReplayKill, playReplay, prepareReplayFrame, resetReplay, startReplay } from './fx/replayClip.js';
import { finalScore, fmtTime, killPar, showResult, skipResult } from './result.js';
import { gameOverChoice, showGameOverView, stepGameOverMenu } from './gameOver.js';
import { buildStation } from './station.js';
import { buildWarehouse } from './warehouse.js';
import { buildParking } from './parking.js';
import { buildLift } from './lift.js';
import { buildMall } from './mall.js';
import { buildRuins } from './ruins.js';
import { BOSS_LIMBS, boss, bossDangers, bossEntranceLeft, bossEntranceView, bossMeleeTarget, clearBoss, damageBoss, endBossEntrance, remoteBossImpact, remoteBossSlam, showRemoteBossBreak, spawnBoss, startBossEntrance, updateBoss, updateBossEntrance, updateRemoteBossDebris } from './enemy/boss.js';
import { updateQuake } from './fx/quake.js';
import { STAGE_TITLE_END, createStageTitle } from './stageTitle.js';
import { WEAPON_KEYS } from './weapons/ids.js';
import { updateMeleePull } from './weapons/meleePull.js';
import { ARROW_DMG_MAX, ARROW_HIT, ARROW_RICOCHET_DMG, BOW_RICOCHET_STOCK, bowState, gainRicochetArrow, updateBow } from './weapons/bowCombat.js';
import { BAT_ATTACKS, BAT_CHARGE_LIFT, BAT_SWING_1, batState, startBatAttack, updateBat } from './weapons/batCombat.js';
import { SPEAR_ATTACKS, SPEAR_GUARD_SLOW, SPEAR_TWIRL_1, spearHolds, spearState, spearThrow, startSpearAttack, updateSpear } from './weapons/spearCombat.js';
import { rand } from './random.js';
import { DUMMY_ANKLE_Y, DUMMY_HEIGHT, DUMMY_LEG_X, DUMMY_RADIUS, buildEnemyBody, buildStrikerBody } from './enemy/body.js';
import { updateControlsHud } from './ui/controlsHud.js';
import { GROUND_REVEAL_ALL, groundReveal, riseOrigin, withGroundReveal } from './world/reveal.js';
import { RISE_BASE_HEIGHT, RISE_BASE_TIME, RISE_FILL_DONE, RISE_FILL_START, RISE_PULSE_TIME, RISE_SLAM_HEIGHT, RISE_WAVE, arenaRiseEnd, resetArenaRiseEnd, riseDelayAt, riseLines, riseMeshes, risers, } from './world/rise.js';
import { STRUCT_GRID, TERRAIN_GRID, addBoxes, addRamps, blocks, boxColor, boxGeo, boxMatrix, boxMatrixFor, floorAt, gridMaterial, groundArea, octagonXGeo, octagonZGeo, rampMatrix, rampUpDir, ramps, wedgeGeo, } from './world/blocks.js';
import { castWorld } from './world/raycast.js';
import { addMover, clearMovers, moverHazardAt, moverThreat, updateMovers } from './world/movers.js';
import { boardLedge, setShaft, shaftCopies, updateBoarding, updateShaft } from './world/shaft.js';
import { liftDangers, setLiftTraps, updateLiftTraps } from './world/liftTraps.js';
import { updateDangerHud } from './ui/dangerHud.js';
import { BORDER_HEIGHT, arenaRoot, borderMat, borderUniforms, groundLineMat, playBounds } from './world/arena.js';
import { HEAVY_FX, hitFxVisible, impact, initHitFx, spawnFinaleFx, spawnHitFx, spawnKillFx, spawnSparks, updateHitParticles, } from './fx/hitFx.js';
import { addSlashScar, clearScars, updateScars } from './fx/scars.js';
import { updateArcs } from './fx/arcs.js';
import { initOptions, onOptionsClick, onOptionsKey, options, renderOptions } from './ui/options.js';
import { hidePicker, onPickerClick, onPickerKey, openPicker, pickerOpen, selectedLoadout } from './ui/weaponPicker.js';
import { loadBest, saveBest } from './records.js';
import { addXp, loadXp } from './mastery.js';
import { initEnemyEnv } from './enemy/env.js';
import { DEFAULT_KNOCK, RESPAWN_RISE_TIME, RESPAWN_TIME, en, enemies, hitDir, hitLook, setEn, } from './enemy/state.js';
import { STRIKER_HP, STRIKER_STRIDE, poseStriker, resetStriker, resetStrikerNav, strikerRestPose, updateStrikerFace, updateStrikerMove, } from './enemy/striker.js';
import { SNIPER_HP, SNIPER_SPAWN_NEAR, attachSniperRifle, createSniperLaser, resetSniper, updateSniperAim, updateSniperFire, } from './enemy/sniper.js';
import { isOnDummy, resetDummyStagger, spring, staggerDummy, updateDummyStagger } from './enemy/stagger.js';
import { breakDummy, clearDebris, updateDebris } from './enemy/debris.js';
import { AIR_TILT_KICK, ENEMY_SPIKE_BOUNCE, ENEMY_STRIDE, ENEMY_WAIT_MAX, ENEMY_WAIT_MIN, enemyCanStand, knockEnemy, launchEnemy, poseEnemyTumble, spikeEnemy, updateEnemyAir, updateEnemyGait, updateEnemyKnock, updateEnemyMove, updateEnemyTumble, } from './enemy/motion.js';
import { DEG, UP, wrapAngle } from './math.js';
import { AIR_ACCEL, AIR_TURN_RATE, BASE_FOV, DASH_CHARGES, DASH_COOLDOWN, DASH_EXIT_SPEED, DASH_RECHARGE, DASH_SPEED, AIR_JUMP_SPEED, DASH_TIME, EYE_HEIGHT, PLAYER_GRAVITY, GROUND_ACCEL, GROUND_FRICTION, GROUND_TURN_RATE, JUMP_SPEED, OVERSPEED_DECAY, PLAYER_MAX_HP, PLAYER_RADIUS, SLIDE_BOOST, SLIDE_BOOST_COOLDOWN, SLIDE_BOOST_MAX, SLIDE_END_SPEED, SLIDE_FRICTION, SLIDE_START_SPEED, SLIDE_TURN_RATE, SPRINT_SPEED, WALK_SPEED, WALLJUMP_OUT, WALLJUMP_UP, WALLRUN_ACCEL, WALLRUN_GRAVITY, WALLRUN_MAX_FALL, WALLRUN_SPEED, } from './player/config.js';
import { dashDir, forward, lookEuler, player, position, right, velocity, wallNormal, wallTangent, wish, } from './player/state.js';
import { RAMP_SLIDE_GRAVITY, canKeepWallRun, collideBox, collideCylinder, collideRamp, endWallRun, initMovement, moveToward, underLowBox, rotateHorizontalToward, setHorizontalSpeed, steerHorizontal, tryMantleBox, tryStartWallRun, updateMantle, } from './player/movement.js';
import { keys, padMove, pressed } from './input.js';
import { easeInOutCubic, easeOutCubic, easeOutQuart } from './ease.js';
import { spawnRiseRipple, updateRiseRipples } from './fx/riseRipples.js';
import { ATTACKS, DASH_SLASH, SLASH_1, SLIDE_UP } from './weapons/kunaiAttacks.js';
import { SWORD_ATTACKS, SWORD_CHARGE_SLASH, SWORD_ISSEN, SWORD_KESA, SWORD_SWEEP, SWORD_THRUST, } from './weapons/swordAttacks.js';
import { AXE_ATTACKS, AXE_DRIVE, AXE_DRIVE_LIFT, AXE_DRIVE_SPEED, AXE_FLING_LIFT, AXE_FLING_SPEED, AXE_KESA, AXE_LAUNCH, AXE_WHEEL_HIT, AXE_WHEEL_LIFT } from './weapons/axeAttacks.js';
import { camera, controls, renderer, scene } from './core.js';
import { DEFAULT_HIT_STOP, game, kickVel } from './game/state.js';
import { axeViewModel, batViewModel, bowViewModel, gunViewModel, heldAxeModel, kunai, leftViewModel, sickleViewModel, sword, swordViewModel, viewModel, } from './weapons/viewModels.js';
import { AXE_SHOCK_HIT, applyAxePose, axeHitSource, axePoseAt, axePoweredHit, axeState, axeTrailPose, flingEnemy, poweredAxeHit, spawnAxeShock, startAxeAttack, updateAxeAttack, updateAxeShocks, } from './weapons/axeCombat.js';
import { initGameHooks } from './game/hooks.js';
import { FOCUS_DIM, LOCK_HEIGHT, applySwordPose, chargeFocus, startSwordAttack, swordPoseAt, swordState, swordTrailPose, updateChargeDash, updateRush, updateSwordAttack, } from './weapons/swordCombat.js';
import { BAT_RETURN_HIT, BULLET_HIT, BULLET_RANGE, DEADEYE_HIT, GUN_AMMO, GUN_RELOAD_TIME, MUZZLE_FLASH_LIFE, PARRY_RETURN_HIT, RELOAD_EVENTS, isParryReturn, applyGunSpin, deadEyeMarks, endDeadEye, endGunDraw, endReload, endSlideSpin, endTwirl, evalReloadPose, fireGun, gunCylinder, gunReady, gunState, muzzleFlash, placeDeadEyeMarks, poseReloadParts, startReload, updateBullets, updateCasings, updateDeadEye, updateGunDraw, updateSlideSpin, updateTwirl, } from './weapons/handgunCombat.js';
import { GRAPPLE_STICK_HIT, HOOK_CHARGES, SICKLE_DAMAGE_SCALE, SICKLE_DASH_HIT, SICKLE_DASH_LAST, SICKLE_KESA_HIT, SICKLE_PULL_HIT, SICKLE_PULL_LAST, sickleState, updateGrapple, updateGrapplePull, updateSickleMelee, } from './weapons/sickleCombat.js';
import * as sickleHits from './weapons/sickleCombat.js';
import { GUARD_HIT, PIN_HIT, RUSH_HIT, SKEWER_FIRST, SKEWER_GAP, SKEWER_HIT, YANK_SPEED } from './weapons/spearCombat.js';
import { THROW_HIT, WORLD_SLOW_RING_TIME, WORLD_SLOW_SCALE, applyLunge, applyPose, attackPoseAt, kunaiState, startAttack, startReturn, thrown, tmpPose, updateAttack, updateKunaiPose, updateThrow, worldSlowFactor, } from './weapons/kunaiCombat.js';
import { THROW_RANGE } from './weapons/kunai.js';
import { ammoHud, ammoPips, updateWeaponHud } from './ui/weaponHud.js';
import { ENEMY_FIRST_SHOT, attachEnemyGun, onPlayerShot, showRemoteBossParry, spawnRemoteBossShot, updateDummyAim, updateEnemyBullets, updateEnemyFire } from './enemy/fire.js';
import { PARRY_INVERT_TIME, parryMono, parrySlowFactor, parryState } from './combat/parry.js';
import { rumble } from './player/rumble.js';
import { updateHudSway } from './ui/hudSway.js';
import { updateBossHud } from './ui/bossHud.js';
import { setLetterbox } from './ui/letterbox.js';
import { updateHandCam } from './fx/handCam.js';
import { addTrauma, applyCameraOffset, cameraFx, onDash, onLand, onMantleEnd, onMantleStart, onSlideStart, onWallJump, onWallRunStart, restoreCameraOffset, savedQuat, updateCamera, updateKick, } from './fx/camera.js';
import { GAMEOVER_DELAY, downFall, downSlowFactor, isDown } from './player/down.js';
import { dashGauges, healPlayer, showPlayerDamage, updateBowHud, updateHookHud, updateHpHud } from './ui/hud.js';
import { updateViewModel, updateWeaponSwitch, viewState } from './weapons/viewModelMotion.js';
import { composer, hitFxRenderPass, impactFxPass, speedFxPass, updateSpeedFx } from './fx/post.js';
import { overlay } from './ui/overlay.js';
import { turnView, zoomLookScale } from './player/look.js';
import { padState, updatePad } from './player/padControls.js';
import { beginPerfFrame, endPerfFrame } from './ui/perfHud.js';
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
// 地面と床のグリッドを出す / 消す（宙に浮いたリフトのステージでは消す）
function showGround(on) {
    ground.visible = grid.visible = grid10.visible = on;
}
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
let multiplayerRun = false; // 接続試験で RUINS に入った後はメニューを開いても時間を進める
let multiplayerSessionLost = false;
let multiplayerRemoteAddPoints = 0;
let multiplayerResult = null;
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
function startFromOverlay() {
    ensureAudio(); // 音はユーザー操作の中でしか始められない
    showPanel(null);
    // パッドのボタンはブラウザがユーザー操作とみなさないので、ポインターロックを始められない。ロックなしで始める
    if (padState.fromPad) {
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
    game.difficulty = DIFFICULTIES[i];
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
function startStage(remote = false) {
    const id = selectedStageId();
    if (!id)
        return sfx.playUiDenied();
    sfx.playUiSelect();
    pendingStage = id;
    const name = id.toUpperCase();
    transitionLabel.textContent = name;
    overlayKicker = `FAST FINISH — ${name} / ${DIFFICULTIES[difficultyIndex].toUpperCase()}`;
    if (remote) {
        ensureAudio();
        showPanel(null);
        padPlaying = true;
        setPlaying(true);
    }
    else
        startFromOverlay();
}
function enterMultiplayerStage(remote) {
    const i = stageButtons.findIndex((button) => button.dataset.stage === 'ruins');
    if (i < 0)
        return;
    if (remote)
        selectDifficulty(DIFFICULTIES.indexOf(game.difficulty));
    multiplayerRun = true;
    overlay.classList.remove('select-multiplayer');
    selectStage(i);
    startStage(remote);
}
initMultiplayer(() => enterMultiplayerStage(true), (event) => {
    sharedBossBreakTime = 0;
    healPlayer(KILL_HEAL);
    showRemoteBossBreak(event.part, event.down);
    spawnKillFx(new THREE.Vector3(...event.at), new THREE.Vector3(...event.dir));
    sfx.playKill();
}, onRemoteKunaiBossHit, spawnRemoteBossShot, (dir, damage) => onPlayerShot(new THREE.Vector3(...dir), damage), remoteMissileBlast, remoteMissileHurt, remoteBossSlam, remoteBossImpact, onMultiplayerBossVictory, onMultiplayerPartyDefeat, showRemoteBossParry, remoteMissileParry, remoteMissileShotDown, onRemoteAddHit, rewardKill, onMultiplayerDisconnect, onGuestHitConfirmed);
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
            e.preventDefault();
            return startStage();
        case 'ArrowUp':
            e.preventDefault();
            return stepStage(-1);
        case 'ArrowDown':
            e.preventDefault();
            return stepStage(1);
        case 'ArrowLeft':
            e.preventDefault();
            return stepDifficulty(-1);
        case 'ArrowRight':
            e.preventDefault();
            return stepDifficulty(1);
        // 武器の選択画面を開く（パッドの Y）
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
    if (choice === 'retry' && multiplayerRun)
        returnToLobby();
    else if (choice === 'retry')
        retryStage();
    else
        quitToTitle();
}
function returnToLobby() {
    if (!returnToMultiplayerLobby()) {
        showToast('部屋との接続が切れました');
        return;
    }
    multiplayerRun = false;
    multiplayerSessionLost = false;
    multiplayerRemoteAddPoints = 0;
    multiplayerResult = null;
    guestHitPending.clear();
    remoteWeaponHolds.clear();
    game.playerHp = PLAYER_MAX_HP;
    game.downT = -1;
    game.hitStop = 0;
    game.timeScale = 1;
    game.deadEye = 'off';
    game.weaponLocked = false;
    swordState.focusCharge = 0;
    swordState.focusing = false;
    swordState.rushTime = -1;
    swordState.swordAttack = null;
    gunState.gunAmmo = GUN_AMMO;
    gunState.gunReloading = false;
    player.dashCharges = DASH_CHARGES;
    player.dashTime = 0;
    player.dashCooldown = 0;
    player.mantleTime = -1;
    player.sliding = false;
    player.wallRunning = false;
    player.eyeHeight = EYE_HEIGHT;
    finale = false;
    killSlowTime = Infinity;
    sharedBossBreakTime = Infinity;
    finaleHud.classList.remove('on');
    runHud.classList.remove('clear');
    remainHud.classList.remove('clear');
    document.body.classList.remove('result-shown', 'player-down', 'finale', 'pad-playing');
    document.body.classList.add('on-title');
    overlay.classList.remove('result', 'over', 'pause', 'hidden', 'leaving', 'quitting');
    overlay.classList.add('title', 'select-multiplayer');
    overlayPrompt.textContent = '';
    resetScore();
    resetReplay();
    setupTitleStage();
    menuRedraw = true;
}
overlay.addEventListener('click', (e) => {
    const target = e.target;
    // 結果の演出の途中なら、どこを押しても最後まで飛ばす
    if (overlay.classList.contains('result') && skipResult())
        return;
    if (target.closest('[data-action="multiplayer-lobby"]') && multiplayerRun) {
        sfx.playUiSelect();
        return returnToLobby();
    }
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
        if (overlay.classList.contains('select-multiplayer')) {
            // 参加者は後でホストの通知から始まるため、ユーザー操作のある準備ボタンでゲーム音を起こしておく。
            if (target.closest('[data-connect="ready"]'))
                ensureAudio();
            if (target.closest('[data-action="multiplayer-back"]')) {
                leaveMultiplayer();
                overlay.classList.remove('select-multiplayer');
                overlayPrompt.textContent = 'SELECT MODE';
                sfx.playUiBack();
            }
            else if (target.closest('[data-action="multiplayer-start"]')) {
                if (startMultiplayer())
                    enterMultiplayerStage(false);
            }
            return;
        }
        if (overlay.classList.contains('select-stage'))
            return onStageSelectClick(target);
        if (target.closest('[data-action="multiplayer"]')) {
            showPanel(null);
            overlay.classList.add('select-multiplayer');
            overlayPrompt.textContent = 'CO-OP';
            sfx.playUiOpen();
            return;
        }
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
// メニューはマウスとパッドで操作する。キーボードは受け付けず、パッドのボタンを置き換えたキー（PAD_MENU_KEYS）だけを通す
let padMenuTarget = null;
function onPadMenuKey(e, selector) {
    const items = Array.from(overlay.querySelectorAll(selector)).filter((item) => item.getClientRects().length > 0 && !item.closest('[hidden]') &&
        !item.matches(':disabled, [aria-disabled="true"]'));
    if (!items.length)
        return;
    let index = items.indexOf(padMenuTarget);
    const dir = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.code];
    if (dir) {
        index = index < 0 ? 0 : (index + dir + items.length) % items.length;
        padMenuTarget?.classList.remove('pad-focus');
        padMenuTarget = items[index];
        padMenuTarget.classList.add('pad-focus');
        padMenuTarget.scrollIntoView({ block: 'nearest' });
        sfx.playUiHover();
        e.preventDefault();
    }
    else if (e.code === 'Enter') {
        const target = index < 0 ? items[0] : items[index];
        padMenuTarget?.classList.remove('pad-focus');
        padMenuTarget = null;
        target.click();
        e.preventDefault();
    }
}
window.addEventListener('keydown', (e) => {
    if (controls.isLocked || overlay.classList.contains('hidden') || !padState.fromPad)
        return;
    if (overlay.classList.contains('show-options'))
        return onOptionsKey(e);
    if (overlay.classList.contains('select-multiplayer')) {
        if (e.code === 'Escape')
            return overlay.querySelector('[data-action="multiplayer-back"]')?.click();
        return onPadMenuKey(e, '.multiplayer button');
    }
    if (overlay.classList.contains('select-stage'))
        return onStageSelectKey(e);
    if (overlay.classList.contains('result')) {
        if (e.code !== 'Enter' && e.code !== 'Escape' && e.code !== 'KeyQ')
            return;
        e.preventDefault();
        if (skipResult())
            return; // 演出の途中なら、まず最後まで飛ばす
        sfx.playUiSelect();
        return multiplayerRun ? returnToLobby() : quitToTitle();
    }
    // ゲームオーバー: 上下で選んで A で決める。Y はタイトルへすぐ
    if (overlay.classList.contains('over')) {
        const dir = { ArrowUp: -1, ArrowDown: 1 }[e.code];
        if (dir) {
            e.preventDefault();
            if (stepGameOverMenu(dir))
                sfx.playUiHover();
        }
        else if (e.code === 'Enter') {
            e.preventDefault();
            decideGameOver(gameOverChoice());
        }
        else if (e.code === 'Escape' || e.code === 'KeyQ') {
            decideGameOver('title');
        }
        return;
    }
    if (e.code === 'Escape' && overlay.classList.contains('pause')) {
        e.preventDefault();
        padMenuTarget?.classList.remove('pad-focus');
        padMenuTarget = null;
        sfx.playUiBack();
        startFromOverlay();
    }
    else if (e.code === 'KeyQ' && overlay.classList.contains('pause')) {
        sfx.playUiSelect();
        quitToTitle();
    }
    else if (e.code === 'KeyO') {
        togglePanel('options');
    }
    else if (overlay.classList.contains('title') || overlay.classList.contains('pause')) {
        onPadMenuKey(e, overlay.classList.contains('title') ? '.modes button' : '.main button');
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
    overlayPrompt.textContent = 'CLICK TO RESUME';
}
function setPlaying(on) {
    document.body.classList.toggle('pad-playing', on && padPlaying); // パッドで遊んでいる間はカーソルを隠す
    if (controls.isLocked === on)
        return;
    controls.isLocked = on;
    menuRedraw = true;
    // マルチプレイではメニューを開いても世界と音を進める
    sfx.setAudioPaused(!controls.isLocked && !multiplayerRun);
    document.body.classList.toggle('paused', !controls.isLocked && !multiplayerRun);
    if (!on) {
        keys.clear();
        pressed.clear();
        game.attackHeld = game.attackPressed = game.throwHeld = false;
        sickleState.throwPressed = swordState.focusPressed = false;
        axeState.axeLaunchPressed = axeState.axeDrivePressed = gunState.deadEyePressed = gunState.reloadQueued = false;
        bowState.aimPressed = bowState.volleyHeld = spearThrow.aimPressed = spearThrow.pressed = viewState.inspectPressed = false;
    }
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
    if (WEAPON_KEYS[e.code] && !game.weaponLocked)
        game.wantWeapon = WEAPON_KEYS[e.code];
    if (e.code === 'KeyR' && !e.repeat)
        gunState.reloadQueued = true;
    if (e.code === 'KeyT' && !e.repeat)
        viewState.inspectPressed = true; // 武器を眺める
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
    // ?devmode のときだけ: 0 で無敵を切り替える
    if (e.code === 'Digit0' && !e.repeat && DEV_MODE) {
        invincible = !invincible;
        showToast(`無敵: ${invincible ? 'オン' : 'オフ'}`);
    }
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
document.addEventListener('mousedown', (e) => {
    // パッドで遊んでいる途中でマウスに持ち替えたら、そのクリックでロックする
    if (padPlaying && !document.pointerLockElement)
        lockPointer();
    if (controls.isLocked && e.button === 0) {
        game.attackPressed = true;
        game.attackHeld = true;
    }
    if (controls.isLocked && e.button === 1) {
        e.preventDefault(); // 自動スクロールを出さない
        axeState.axeDrivePressed = bowState.volleyHeld = spearThrow.pressed = true;
    }
    if (controls.isLocked && e.button === 2)
        game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = gunState.deadEyePressed = bowState.aimPressed = spearThrow.aimPressed = true;
});
document.addEventListener('mouseup', (e) => {
    if (e.button === 0)
        game.attackHeld = false;
    if (e.button === 1)
        bowState.volleyHeld = false;
    if (e.button === 2)
        game.throwHeld = false;
});
window.addEventListener('blur', () => (game.attackHeld = bowState.volleyHeld = false));
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== document.body)
        return;
    viewState.lookSwayX = THREE.MathUtils.clamp(viewState.lookSwayX + e.movementX * 0.0005, -0.06, 0.06);
    viewState.lookSwayY = THREE.MathUtils.clamp(viewState.lookSwayY + e.movementY * 0.0005, -0.06, 0.06);
});
// ---- ゲームパッドの割り当て ----（player/padControls.ts）
// ---- HUD: ダッシュ・鎖鎌の残り回数と体力 ----（ui/hud.ts。体力を減らす処理は damagePlayer）
const DEV_MODE = new URLSearchParams(location.search).has('devmode');
let invincible = false; // ?devmode で 0 キーを押すと切り替わる。体力が減らない
function damagePlayer(amount) {
    if (game.playerHp <= 0 || amount <= 0 || invincible)
        return;
    rumble('damage');
    if (stageRun?.running)
        stageRun.damage += amount;
    const before = game.playerHp;
    // ステージでは 0 で倒れる。訓練場（と倒しきった後）は死なず、1 で耐えて被弾の演出だけを出す
    game.playerHp = Math.max(stageRun?.running ? 0 : 1, game.playerHp - amount);
    if (game.playerHp <= 0)
        downPlayer();
    showPlayerDamage(amount, before);
}
// ---- 倒れる ----
function downPlayer() {
    if (isDown() || !stageRun)
        return;
    game.downT = 0;
    if (!multiplayerRun)
        stageRun.running = false;
    game.hitStop = Math.max(game.hitStop, 0.14);
    game.hitStopTotal = game.hitStop;
    addTrauma(1);
    game.fovKick += 10;
    if (game.deadEye !== 'off')
        endDeadEye();
    sfx.playDeath();
    document.body.classList.add('player-down');
}
// 倒れている間は、押したものを全部捨てる（押しっぱなしの移動も、溜めた攻撃も効かせない）
function dropPlayerInput() {
    keys.clear();
    pressed.clear();
    game.attackPressed = game.attackHeld = game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = axeState.axeDrivePressed = gunState.deadEyePressed = bowState.aimPressed = bowState.volleyHeld = spearThrow.pressed = spearThrow.aimPressed = false;
    gunState.reloadQueued = false;
    padMove.x = padMove.y = 0;
    padState.padSprint = false;
}
function updatePlayerDown(realDt) {
    if (!isDown())
        return;
    const shown = game.downT >= GAMEOVER_DELAY;
    game.downT += game.realDt;
    dropPlayerInput();
    if (!multiplayerRun && !shown && game.downT >= GAMEOVER_DELAY && stageRun)
        showGameOver(stageRun);
    if (multiplayerRun && stageRun?.running && game.downT >= GAMEOVER_DELAY && multiplayerPartyDown()) {
        broadcastPartyDefeat();
        onMultiplayerPartyDefeat();
    }
}
// 一時停止の画面をゲームオーバーの画面に作り替えて止める。記録は残さない
function showGameOver(run) {
    const button = stageButtons[stageIndex];
    overlay.classList.add('over');
    overlay.querySelector('.go-menu [data-action="retry"] span').textContent = multiplayerRun ? 'LOBBY' : 'RETRY';
    overlayPrompt.textContent = '';
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
    const sprinting = locked && (keys.has('ShiftLeft') || keys.has('ShiftRight') || padState.padSprint);
    // 槍の風車受けで回している間は遅くなる
    const maxSpeed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * THREE.MathUtils.lerp(1, SPEAR_GUARD_SLOW, game.shownWeapon === 'spear' ? spearState.guard : 0);
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
    if (player.onGround || player.wallRunning || player.mantleTime >= 0)
        player.airJump = true;
    const canJump = locked && !stuck && player.dashTime <= 0 && swordState.rushTime < 0 && swordState.chargeDashTime <= 0;
    if (canJump && player.onGround && keys.has('Space')) {
        velocity.y = JUMP_SPEED;
        player.onGround = false;
        player.sliding = false;
        sfx.playJump();
    }
    else if (locked && player.wallRunning && pressed.has('Space')) {
        // ---- 壁ジャンプ: 走る勢いは残したまま、壁から斜め上へ跳ぶ ----
        // 押しっぱなしで飛びついた直後に跳ねないよう、押した瞬間だけ受け付ける
        velocity.x += wallNormal.x * WALLJUMP_OUT;
        velocity.z += wallNormal.z * WALLJUMP_OUT;
        velocity.y = WALLJUMP_UP;
        endWallRun();
        onWallJump();
    }
    else if (canJump && player.airJump && !player.onGround && player.mantleTime < 0 && !sickleState.grapple?.pulled && pressed.has('Space')) {
        // ---- 二段ジャンプ: 弱め。上昇中に押しても、今の上向きの速さより速くはしない ----
        velocity.y = Math.max(velocity.y, AIR_JUMP_SPEED);
        player.airJump = false;
        sfx.playJump();
    }
    if (player.dashTime <= 0 && swordState.rushTime < 0 && swordState.chargeDashTime <= 0)
        velocity.y -= (player.wallRunning ? WALLRUN_GRAVITY : PLAYER_GRAVITY) * dt;
    if (player.wallRunning)
        velocity.y = Math.max(velocity.y, -WALLRUN_MAX_FALL);
    // 鎖鎌が掛かっている間は、ここまでの速度を引き寄せる向きへ置き換える
    if (sickleState.grapple?.phase === 'pull')
        updateGrapplePull(dt);
    // 剣の踏み込みで、狙った敵の方へ寄る
    if (player.mantleTime < 0)
        updateMeleePull(dt);
    // 動く物を先に動かし、上に立っていれば一緒に運ぶ（世界だけのスローは前のフレームの値を使う）
    updateMovers(dt * kunaiState.worldSlow);
    updateShaft(dt * kunaiState.worldSlow, !!stageRun?.running);
    updateLiftTraps(dt * kunaiState.worldSlow, !!stageRun?.running);
    if (multiplayerRun && isMultiplayerGuest()) {
        const snapshot = latestBossSnapshot();
        if (snapshot)
            applyBossSnapshot(snapshot, game.realDt);
        updateRemoteMissiles(latestMissiles(), game.realDt);
        updateRemoteMissileEffects(dt);
        updateRemoteBossDebris(dt);
        updateQuake(dt);
    }
    else
        updateBoss(dt * kunaiState.worldSlow);
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
        // 低い浮いた箱（車）の下に入っているか。スライディング中は、少し先（0.25 秒後の位置）が下なら視点を先に下げ始める
        player.underCover = underLowBox(position.x, position.z, position.y);
        player.lowEye = player.underCover
            || (player.sliding && underLowBox(position.x + velocity.x * 0.25, position.z + velocity.z * 0.25, position.y));
        // よじ登れる縁があればそちらを優先し、なければ壁走りを試す
        if (locked && !player.onGround && swordState.rushTime < 0) {
            // 鎖鎌で引き寄せた勢いは、よじ登った後へ持ち越さない（引き寄せる前の速さまでに抑える）
            const mantleSpeed = sickleState.grapple && sickleState.grapple.pullTime > 0 ? Math.min(hSpeed, sickleState.grapple.speedBefore) : hSpeed;
            // 敵にはよじ登らない（箱だけ）
            let mantled = false;
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
    updateBowHud();
    updateCamera(dt);
    updateWeaponSwitch(dt);
    updateViewModel(dt);
    updateAttack(dt);
    updateKick(dt);
    updateKunaiPose(dt);
    const skillWorldSlow = worldSlowFactor(dt);
    kunaiState.worldSlow = multiplayerRun ? 1 : skillWorldSlow;
    updateEnemies(dt * kunaiState.worldSlow);
    updateSwordAttack(dt);
    updateAxeAttack(dt);
    updateThrow(dt);
    updateBow(dt);
    updateBat(dt);
    updateSpear(dt);
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
const HIT_DAMAGE = { kunai: 14, sword: 18, throw: 15, bullet: 30, axe: 24, bat: 20 }; // fx = 1 のときの量
const KILL_HIT_STOP = 0.1; // とどめの一撃を短く止める
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
let sharedBossBreakTime = Infinity; // ホストの部位破壊を全員に知らせてからの実時間
// 攻撃の届く範囲（距離と視線からの角度）にいる敵のうち、いちばん近いものを en にする。いれば hitDir に攻撃の向きを入れる。
// ボスの機体が届く範囲にあって、どの敵よりも近ければボスを選ぶ（bossHitPart に部位を入れる）
function dummyInReach(reach, angle) {
    const onEnemy = enemyInReach(reach, angle);
    const enemyDist = onEnemy ? Math.hypot(en.root.position.x - position.x, en.root.position.z - position.z) - DUMMY_RADIUS : Infinity;
    if (bossInReach(reach, angle) && Math.hypot(bossHitAt.x - position.x, bossHitAt.z - position.z) <= enemyDist)
        return true;
    bossHitPart = null;
    return onEnemy && inReachOf(reach, angle); // hitDir を選んだ敵への向きで入れ直す
}
function enemyInReach(reach, angle) {
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
function applyDummyHit(def, at, kind, swing, scar = true, dmgScale = 1, remote = false) {
    if (multiplayerRun && isMultiplayerGuest() && stageRun?.boss) {
        sendGuestHit(def, at, kind, 'core', kind === 'kunai' || kind === 'sword' || kind === 'axe' || (kind === 'bat' && def !== BAT_RETURN_HIT) ? dmgScale * BOSS_MELEE_MULT : dmgScale, enemies.indexOf(en), swing);
        return;
    }
    const headshot = (kind === 'throw' || kind === 'bullet') && at.y - en.root.position.y >= HEADSHOT_HEIGHT;
    staggerDummy(def.knock ?? DEFAULT_KNOCK, at, swing);
    en.flashT = 0;
    game.hitStop = Math.max(game.hitStop, def.hitStop ?? DEFAULT_HIT_STOP);
    game.hitStopTotal = game.hitStop;
    game.hitStopShakesDummy = true;
    shakeEnemy = en;
    // 空振りとの差をはっきりさせるため、当たったときだけ画面を大きく揺らして反動も足す
    const fx = def.fx ?? 1;
    if (!remote) {
        addTrauma(HIT_TRAUMA * fx);
        kickVel.x += def.kick[0] * DEG * 12 * fx;
        kickVel.y += def.kick[1] * DEG * 12 * fx;
        kickVel.z += def.kick[2] * DEG * 12 * fx;
    }
    playHit(fx, kind);
    spawnHitFx(at, hitDir, def, swing);
    if (!remote && scar && (kind === 'kunai' || kind === 'sword' || kind === 'axe'))
        addSlashScar(en, camera, at, hitDir, def, kind, swing);
    // 結果に出すヘッドショット率は、自分で狙って当てた弾と矢だけで数える（デッドアイと跳ね返した弾は除く）
    if (!remote && stageRun?.running && (def === BULLET_HIT || def === ARROW_HIT)) {
        stageRun.aimedHits++;
        if (headshot)
            stageRun.headshots++;
    }
    const damage = hitDamage(def, kind) * dmgScale * (headshot ? HEADSHOT_MULT : 1);
    en.hp -= damage;
    if (!remote && def !== SWORD_ISSEN && def !== DEADEYE_HIT)
        chargeFocus(damage); // 一閃・デッドアイそのものでは溜めない
    if (!remote) {
        countHit(en.hp <= 0);
        trackHitProcess(def, kind);
    }
    if (en.hp <= 0) {
        if (!remote) {
            countChain();
            countMulti(def);
            scoreKill(showKillScore(killBonuses(def, headshot)), highlightWeight(def, kind));
        }
        killDummy(kind, swing, remote);
        if (!remote)
            showHitMarker(true, true);
    }
    else {
        if (!remote)
            showHitMarker(fx >= HEAVY_FX || headshot);
    }
}
// ハイライトに選ぶときの重み。ゲージ技（一閃・デッドアイ）がいちばん重く、操作一覧に名前のある技がその次
const HIGHLIGHT_GAUGE = 3;
const HIGHLIGHT_SKILL = 1.5;
function highlightWeight(def, kind) {
    if (def === SWORD_ISSEN || def === DEADEYE_HIT)
        return HIGHLIGHT_GAUGE;
    const axeSkill = kind === 'axe' && (def === AXE_DRIVE || axeState.axeAttack === AXE_LAUNCH || axeState.axeAttack === AXE_DRIVE);
    const skill = kind === 'throw' || // クナイの溜め投げ
        def === SWORD_CHARGE_SLASH ||
        def === GRAPPLE_STICK_HIT || def === SICKLE_PULL_HIT || def === SICKLE_PULL_LAST || // 鎖を投げる・引き寄せ
        axeSkill || // 打ち上げ・突き飛ばし
        bowState.ricochetHitting || bowState.volleyHitting;
    return skill ? HIGHLIGHT_SKILL : 1;
}
// 倒した点数を、今持っている武器の熟練度の XP に足し、結果で流すハイライトの候補にする（ステージだけ。訓練場では入らない）。
// ハイライトは点数 × weight でいちばん大きいキルを選ぶ
function scoreKill(pts, weight = 1) {
    if (!stageRun)
        return;
    noteReplayKill(pts * weight);
    if (multiplayerRun)
        return; // 協力戦の共有点を、ホスト個人の武器熟練度には加えない
    const xp = Math.round(pts); // 保存する値と結果に出す値をそろえるため、整数で足す
    addXp(game.shownWeapon, xp);
    stageRun.xp += xp;
}
// ---- ボスへの当たり ----（状態とダメージの決まりは enemy/boss.ts）
// 近接の武器は dummyInReach → hitPointFromTip → applyHit の順に呼ぶので、dummyInReach でボスを選んだら部位を覚えておき、
// 続く 2 つをボスへ回す（applyHit で忘れる）
let bossHitPart = null;
const bossHitAt = new THREE.Vector3();
const bossLook = new THREE.Vector3();
function bossInReach(reach, angle) {
    camera.getWorldDirection(bossLook);
    const t = bossMeleeTarget(reach, angle, camera.position, bossLook);
    bossHitPart = t?.part ?? null;
    if (!t)
        return false;
    bossHitAt.copy(t.point);
    hitDir.set(t.point.x - position.x, 0, t.point.z - position.z);
    if (hitDir.lengthSq() < 1e-6)
        hitDir.set(bossLook.x, 0, bossLook.z);
    hitDir.normalize();
    return true;
}
function applyHit(def, at, kind, swing, scar = true, dmgScale = 1) {
    const part = bossHitPart;
    bossHitPart = null;
    if (part)
        applyBossHit(def, at, kind, part, swing, dmgScale * BOSS_MELEE_MULT); // dummyInReach で選んだ = 近接
    else
        applyDummyHit(def, at, kind, swing, scar, dmgScale);
}
function hitBoss(def, at, kind, part, dir, dmgScale = 1, swing = dir) {
    hitDir.set(dir.x, 0, dir.z);
    if (hitDir.lengthSq() < 1e-6)
        hitDir.set(at.x - position.x, 0, at.z - position.z);
    hitDir.normalize();
    // ここへ来るのは投げ物・弾・矢と、ボスへの一閃（近接）だけ
    const melee = kind === 'sword';
    applyBossHit(def, at, kind, part, swing, dmgScale * (melee ? BOSS_MELEE_MULT : 1));
}
// 近接の攻撃がボスに与えるダメージの倍率（大きな機体に踏み込んで斬る危なさに見合わせる）
const BOSS_MELEE_MULT = 2;
// ---- ボスの点数 ----
// 点の元は本体に与えたダメージだけ: 本体の体力を削った割合 × BOSS_CORE_POINTS と、倒したときの BOSS_KILL_POINTS。
// 何周しても素点の合計は変わらないので、時間をかけて稼ぐことはできない（部位を故障させても点は入らない）。
// 当てた瞬間の技と動きの加点を、その一撃の点にだけ掛ける。しゃがみ込みが終わるとき（起き上がる・倒した）に、その間の点をまとめて 1 回出す。
// まとめた加点は一撃ごとの点で重みを付けて均す（出す点数が、一撃ごとの点 × 倍率の和に一致する）
const BOSS_CORE_POINTS = 3000;
const BOSS_KILL_POINTS = 2000;
const BOSS_PAR = { easy: 90, normal: 150, hard: 210 }; // 結果の時間の倍率が ×1.0 になる基準タイム（秒。目安）
const BOSS_RANK_SCALE = 25; // ランクのしきい値（1 体あたり）に掛ける数（S = 15,000）
const bossTally = { pts: 0, weight: 1, adds: new Map() }; // adds = 加点ごとの「一撃の点 × 倍率」の和。weight = その間でいちばん重いハイライトの重み
function tallyBoss(pts, bonuses, weight) {
    bossTally.pts += pts;
    bossTally.weight = Math.max(bossTally.weight, weight);
    for (const b of bonuses) {
        const e = bossTally.adds.get(b.label);
        if (e)
            e.add += pts * b.add;
        else
            bossTally.adds.set(b.label, { add: pts * b.add, detail: b.detail });
    }
}
function flushBossTally() {
    const pts = bossTally.pts;
    if (pts <= 0)
        return;
    const bonuses = [...bossTally.adds].map(([label, e]) => ({ label, detail: e.detail, add: e.add / pts })).filter((b) => b.add >= 0.05);
    scoreKill(showKillScore(bonuses, pts), bossTally.weight);
    bossTally.pts = 0;
    bossTally.weight = 1;
    bossTally.adds.clear();
}
// 部位を削ったときは敵に当てたときと同じ手応え。故障させた・しゃがみ込ませたときは倒したときの重さ。
// ダメージが通らない所（故障済みの部位、部位が残っているうちの本体、止まった後の機体）には、小さく弾かれた音だけ返す（当たりの光は出さない）
function remoteSickleHits() {
    const hits = [sickleHits.SICKLE_KESA_HIT, sickleHits.SICKLE_HOOK_HIT, sickleHits.SICKLE_CROSS_HIT_R, sickleHits.SICKLE_CROSS_HIT_L,
        sickleHits.SICKLE_WHEEL_HIT, sickleHits.SICKLE_WHEEL_LAST, sickleHits.SICKLE_DASH_HIT, sickleHits.SICKLE_DASH_LAST,
        sickleHits.SICKLE_SLIDE_HIT, sickleHits.SICKLE_AIR_HIT, sickleHits.SICKLE_AIR_SWEEP_HIT, sickleHits.SICKLE_AIR_RISE_HIT,
        sickleHits.SICKLE_AIR_WHEEL_HIT, sickleHits.SICKLE_AIR_WHEEL_LAST, sickleHits.SICKLE_PULL_HIT, sickleHits.SICKLE_PULL_LAST];
    return Object.fromEntries(hits.map((def, i) => [String(i), def]));
}
const remoteWeaponHolds = new Map();
function registerRemoteHold(enemy, owner, kind) {
    const existing = remoteWeaponHolds.get(enemy);
    if (existing && existing.owner !== owner)
        return;
    remoteWeaponHolds.set(enemy, { owner, spawnId: addSpawnId(enemy), kind, created: performance.now(), pinApplied: false });
}
function updateRemoteWeaponHolds() {
    const players = remotePlayers();
    for (const [enemy, hold] of remoteWeaponHolds) {
        const p = players.find((item) => item.id === hold.owner);
        const index = enemies.indexOf(enemy);
        if (!enemy.alive || index < 0 || addSpawnId(enemy) !== hold.spawnId || !p) {
            remoteWeaponHolds.delete(enemy);
            continue;
        }
        if (hold.kind === 'grapple') {
            if (p.grapple?.[0] === index && p.grapple[1] === hold.spawnId)
                continue;
        }
        else {
            const spearIndex = p.spear.held.findIndex(([i, id]) => i === index && id === hold.spawnId);
            if ((p.spear.phase === 'flying' || p.spear.phase === 'stuck') && spearIndex >= 0) {
                const [x, y, z] = p.spear.tip, [dx, , dz] = p.spear.dir;
                if (Math.hypot(x - p.x, y - p.y, z - p.z) <= 160 && Math.hypot(x - enemy.root.position.x, z - enemy.root.position.z) <= 10) {
                    const back = SKEWER_FIRST + SKEWER_GAP * spearIndex;
                    enemy.root.position.x = x - dx * back;
                    enemy.root.position.z = z - dz * back;
                    enemy.vel.set(0, 0, 0);
                    enemy.knockVel.set(0, 0, 0);
                    enemy.moving = false;
                    enemy.cooldown = Math.max(enemy.cooldown, 0.4);
                    continue;
                }
            }
            if (p.spear.phase === 'returning' || p.spear.phase === 'none') {
                if (performance.now() - hold.created < 300)
                    continue;
                enemy.knockVel.set(p.x - enemy.root.position.x, 0, p.z - enemy.root.position.z);
                if (enemy.knockVel.lengthSq() > 1e-6)
                    enemy.knockVel.normalize().multiplyScalar(YANK_SPEED);
            }
        }
        if (performance.now() - hold.created >= 300)
            remoteWeaponHolds.delete(enemy);
    }
}
function onRemoteKunaiBossHit(hit, attacker, enemy) {
    if (!stageRun?.running || !stageRun.boss || !boss.rig?.root.visible || boss.entering)
        return;
    const thrown = hit.attack === 'throw';
    const ranged = {
        bullet: { def: BULLET_HIT, kind: 'bullet', maxScale: 1 },
        deadeye: { def: DEADEYE_HIT, kind: 'bullet', maxScale: 1 },
        arrow: { def: ARROW_HIT, kind: 'bullet', maxScale: ARROW_DMG_MAX * ARROW_RICOCHET_DMG ** 2 },
        parry: { def: PARRY_RETURN_HIT, kind: 'bullet', maxScale: 1 },
        batted: { def: BAT_RETURN_HIT, kind: 'bat', maxScale: 1 },
        hook: { def: GRAPPLE_STICK_HIT, kind: 'throw', maxScale: 1 },
        'spear:skewer': { def: SKEWER_HIT, kind: 'sword', maxScale: BOSS_MELEE_MULT },
        'spear:pin': { def: PIN_HIT, kind: 'sword', maxScale: BOSS_MELEE_MULT },
    };
    const rangedHit = Object.hasOwn(ranged, hit.attack) ? ranged[hit.attack] : undefined;
    const [weapon, name] = hit.attack.split(':');
    const meleeSets = {
        sword: { defs: SWORD_ATTACKS, kind: 'sword' }, bat: { defs: BAT_ATTACKS, kind: 'bat' },
        spear: { defs: { ...SPEAR_ATTACKS, guard: GUARD_HIT, rushHit: RUSH_HIT }, kind: 'sword' },
        sickle: { defs: remoteSickleHits(), kind: 'sword' },
        axe: { defs: { ...AXE_ATTACKS, wheel: AXE_WHEEL_HIT, shock: AXE_SHOCK_HIT }, kind: 'axe' },
    };
    const melee = Object.hasOwn(meleeSets, weapon) && name && Object.hasOwn(meleeSets[weapon].defs, name) ? meleeSets[weapon] : undefined;
    const scale = hit.scale ?? 1;
    if ((!thrown && !rangedHit && !melee && !Object.hasOwn(ATTACKS, hit.attack)) || !(hit.part === 'core' || BOSS_LIMBS.some((part) => part === hit.part)))
        return;
    if (rangedHit ? scale <= 0 || scale > rangedHit.maxScale : melee
        ? (weapon === 'axe' ? (name === 'shock' ? !enemy || scale < 0.3 || scale > 1.4 || hit.force === undefined : scale < 0 || scale > 1) : scale <= 0 || scale > 4 || (weapon === 'sickle' ? scale !== BOSS_MELEE_MULT * SICKLE_DAMAGE_SCALE : weapon !== 'spear' && scale !== BOSS_MELEE_MULT))
        : scale !== 1)
        return;
    const at = new THREE.Vector3(...hit.at);
    // 投擲は発射後にもプレイヤーが移動できるため、同期遅れを含む余裕を持たせる。
    const reach = rangedHit ? BULLET_RANGE + 50 : thrown ? THROW_RANGE + 10 : 10;
    if (at.distanceTo(enemy ? enemy.root.position : boss.pos) > (enemy ? 3 : 10) || Math.hypot(at.x - attacker.x, at.y - attacker.y, at.z - attacker.z) > reach)
        return;
    hitDir.set(at.x - attacker.x, 0, at.z - attacker.z).normalize();
    const def = rangedHit?.def ?? (melee ? melee.defs[name] : thrown ? THROW_HIT : ATTACKS[hit.attack]);
    if (weapon === 'axe' && name === 'shock') {
        AXE_SHOCK_HIT.fx = scale;
        AXE_SHOCK_HIT.knock = hit.force;
    }
    const resolved = weapon === 'axe' && melee && name !== 'shock' ? poweredAxeHit(def, scale) : def;
    const kind = rangedHit?.kind ?? (melee ? melee.kind : thrown ? 'throw' : 'kunai');
    const amount = weapon === 'axe' && melee ? BOSS_MELEE_MULT : rangedHit || melee ? scale : thrown ? 1 : BOSS_MELEE_MULT;
    if (enemy) {
        const old = en;
        setEn(enemy);
        const adjusted = !rangedHit || hit.attack === 'spear:skewer' || hit.attack === 'spear:pin' ? (thrown ? amount : amount / BOSS_MELEE_MULT) : amount;
        const hpBefore = enemy.hp;
        const headshot = (kind === 'throw' || kind === 'bullet') && at.y - enemy.root.position.y >= HEADSHOT_HEIGHT;
        const damage = hitDamage(resolved, kind) * adjusted * (headshot ? HEADSHOT_MULT : 1);
        applyDummyHit(resolved, at, kind, undefined, false, adjusted, true);
        if (enemy.alive)
            applyRemoteAddReaction(weapon, name, scale, resolved, attacker);
        if (enemy.alive && hit.attack === 'spear:skewer')
            registerRemoteHold(enemy, attacker.id, 'spear');
        if (enemy.alive && hit.attack === 'hook')
            registerRemoteHold(enemy, attacker.id, 'grapple');
        if (hit.attack === 'spear:pin') {
            const hold = remoteWeaponHolds.get(enemy);
            if (hold)
                hold.pinApplied = true;
        }
        if (enemy.hp < hpBefore && hit.requestId)
            confirmRemoteHit(attacker.id, { id: hit.requestId, damage, result: enemy.alive ? 'hit' : 'kill' });
        if (!enemy.alive) {
            multiplayerRemoteAddPoints += 100;
            sendAddKill(attacker.id);
        }
        setEn(old);
    }
    else {
        const result = applyBossHit(resolved, at, kind, hit.part, undefined, amount, true);
        if (result && hit.requestId)
            confirmRemoteHit(attacker.id, { id: hit.requestId, damage: result === 'locked' || result === 'idle' ? 0 : hitDamage(resolved, kind) * amount,
                result: result === 'locked' || result === 'idle' ? 'blocked' : result === 'break' || result === 'down' || result === 'kill' ? result : 'hit' });
    }
}
function onRemoteAddHit(hit, attacker) {
    const enemy = enemies[hit.index];
    if (!enemy?.alive || addSpawnId(enemy) !== hit.spawnId)
        return;
    if (hit.attack === 'spear:pin') {
        const hold = remoteWeaponHolds.get(enemy);
        if (!hold || hold.kind !== 'spear' || hold.owner !== attacker.id || hold.pinApplied)
            return;
    }
    onRemoteKunaiBossHit(hit, attacker, enemy);
}
function applyRemoteAddReaction(weapon, name, power, def, attacker) {
    if (enemyHeld())
        return;
    const look = new THREE.Vector3(attacker.lookX, 0, attacker.lookZ);
    if (look.lengthSq() < 1e-6)
        look.copy(hitDir);
    look.normalize();
    if (weapon === 'bat') {
        const fling = BAT_ATTACKS[name]?.fling;
        if (fling) {
            en.knockVel.copy(look).multiplyScalar(fling);
            en.flung = en.batFlung = true;
            en.airVel = Math.max(en.airVel, BAT_CHARGE_LIFT);
            en.vel.set(0, 0, 0);
            en.moving = false;
            en.spiked = false;
        }
        else
            knockEnemy(hitDir, def.knock ?? DEFAULT_KNOCK);
    }
    else if (weapon === 'axe') {
        if (name === 'shock')
            knockEnemy(hitDir, def.knock ?? DEFAULT_KNOCK);
        else if (name === 'wheel') {
            if (en.airY > 0.3) {
                en.airVel = Math.max(en.airVel, AXE_WHEEL_LIFT);
                en.spiked = false;
            }
            else
                knockEnemy(hitDir, def.knock ?? DEFAULT_KNOCK);
        }
        else if (name === 'rush' && en.airY > 0.3)
            flingEnemy(look, AXE_FLING_SPEED, AXE_FLING_LIFT, power);
        else if (name === 'drive')
            flingEnemy(look, AXE_DRIVE_SPEED, AXE_DRIVE_LIFT, power);
        else if ((name === 'air' || name === 'kabuto') && en.airY > 0.2)
            spikeEnemy();
        else if (name !== 'launch' && name !== 'air')
            knockEnemy(hitDir, def.knock ?? DEFAULT_KNOCK);
        if (name === 'launch')
            launchEnemy();
    }
    else if (weapon === 'spear' && name !== 'skewer' && name !== 'pin')
        knockEnemy(hitDir, def.knock ?? DEFAULT_KNOCK);
}
const guestHitPending = new Map();
function onGuestHitConfirmed(confirmation) {
    const hit = guestHitPending.get(confirmation.id);
    if (!hit)
        return;
    guestHitPending.delete(confirmation.id);
    if (confirmation.result === 'blocked') {
        if (hit.boss)
            sfx.playBossArmor();
        return;
    }
    const fx = hit.def.fx ?? 1;
    addTrauma(HIT_TRAUMA * fx);
    kickVel.x += hit.def.kick[0] * DEG * 12 * fx;
    kickVel.y += hit.def.kick[1] * DEG * 12 * fx;
    kickVel.z += hit.def.kick[2] * DEG * 12 * fx;
    playHit(fx, hit.kind);
    if (hit.boss)
        sfx.playBossPlate(fx);
    spawnHitFx(hit.at, hit.dir, hit.def, hit.swing);
    if (hit.charge)
        chargeFocus(confirmation.damage);
    const heavy = confirmation.result === 'break' || confirmation.result === 'down' || confirmation.result === 'kill';
    if (heavy && !(hit.boss && confirmation.result !== 'kill')) {
        spawnKillFx(hit.at, hit.dir);
        sfx.playKill();
    }
    showHitMarker(heavy || fx >= HEAVY_FX, confirmation.result === 'kill');
}
function sendGuestHit(def, at, kind, part, dmgScale, addIndex, swing) {
    const send = (hit) => {
        let id = null;
        if (addIndex === undefined)
            id = sendKunaiBossHit(hit);
        else {
            const snapshot = latestAdds()[addIndex];
            if (snapshot?.alive && snapshot.id > 0)
                id = sendAddHit({ ...hit, index: addIndex, spawnId: snapshot.id });
        }
        if (id === null)
            return;
        const now = performance.now();
        for (const [key, pending] of guestHitPending)
            if (now - pending.sent > 10000)
                guestHitPending.delete(key);
        const copy = { ...def, kick: [def.kick[0], def.kick[1], def.kick[2]] };
        guestHitPending.set(id, { def: copy, at: at.clone(), dir: hitDir.clone(), swing: swing?.clone(), kind,
            boss: addIndex === undefined, charge: def !== SWORD_ISSEN && def !== DEADEYE_HIT, sent: now });
    };
    {
        if (kind === 'kunai') {
            const attack = Object.keys(ATTACKS).find((key) => ATTACKS[key] === def);
            if (attack)
                send({ attack, part, at: [at.x, at.y, at.z] });
        }
        else if (kind === 'throw' && def === THROW_HIT) {
            send({ attack: 'throw', part, at: [at.x, at.y, at.z] });
        }
        else if (kind === 'throw' && def === GRAPPLE_STICK_HIT) {
            send({ attack: 'hook', part, at: [at.x, at.y, at.z], scale: dmgScale });
        }
        else if (kind === 'bullet' || kind === 'bat') {
            const attack = def === BULLET_HIT ? 'bullet' : def === DEADEYE_HIT ? 'deadeye' : def === ARROW_HIT ? 'arrow'
                : def === PARRY_RETURN_HIT ? 'parry' : def === BAT_RETURN_HIT ? 'batted' : null;
            if (attack)
                send({ attack, part, at: [at.x, at.y, at.z], scale: dmgScale });
        }
        if (kind === 'sword' && def === SKEWER_HIT)
            send({ attack: 'spear:skewer', part, at: [at.x, at.y, at.z], scale: dmgScale });
        if (kind === 'sword' && def === PIN_HIT && addIndex !== undefined)
            send({ attack: 'spear:pin', part, at: [at.x, at.y, at.z], scale: dmgScale });
        if (kind === 'axe' && def === axePoweredHit) {
            const defs = { ...AXE_ATTACKS, wheel: AXE_WHEEL_HIT };
            const name = Object.keys(defs).find((key) => defs[key] === axeHitSource.def);
            if (name)
                send({ attack: `axe:${name}`, part, at: [at.x, at.y, at.z], scale: axeHitSource.power });
        }
        if (kind === 'axe' && def === AXE_SHOCK_HIT && addIndex !== undefined) {
            send({ attack: 'axe:shock', part, at: [at.x, at.y, at.z], scale: def.fx ?? 1, force: def.knock ?? DEFAULT_KNOCK });
        }
        const meleeSets = [
            { name: 'sword', kind: 'sword', defs: SWORD_ATTACKS }, { name: 'bat', kind: 'bat', defs: BAT_ATTACKS },
            { name: 'spear', kind: 'sword', defs: { ...SPEAR_ATTACKS, guard: GUARD_HIT, rushHit: RUSH_HIT } },
            { name: 'sickle', kind: 'sword', defs: remoteSickleHits() },
        ];
        for (const set of meleeSets) {
            if (kind !== set.kind)
                continue;
            const name = Object.keys(set.defs).find((key) => set.defs[key] === def);
            if (name) {
                send({ attack: `${set.name}:${name}`, part, at: [at.x, at.y, at.z], scale: dmgScale });
                break;
            }
        }
        return;
    }
}
function applyBossHit(def, at, kind, part, swing, dmgScale = 1, remote = false) {
    if (multiplayerRun && isMultiplayerGuest()) {
        sendGuestHit(def, at, kind, part, dmgScale, undefined, swing);
        return;
    }
    const fx = def.fx ?? 1;
    const damage = hitDamage(def, kind) * dmgScale;
    const coreBefore = boss.coreHp;
    const result = damageBoss(part, damage);
    let killSoundChain = 1;
    if (result === 'locked' || result === 'idle') {
        sfx.playBossArmor(); // 通らないことだけ分かるよう、小さく弾かれた音を鳴らす
        return result;
    }
    if (stageRun?.running && (result === 'core' || result === 'kill')) {
        const pts = ((coreBefore - boss.coreHp) / boss.coreMax) * BOSS_CORE_POINTS + (result === 'kill' ? BOSS_KILL_POINTS : 0);
        tallyBoss(pts, remote ? [] : bossBonuses(def), highlightWeight(def, kind));
        if (result === 'kill') {
            killSoundChain = showKillChain();
            flushBossTally();
            stageRun.kills++;
            breakAdds();
        }
    }
    game.hitStop = Math.max(game.hitStop, def.hitStop ?? DEFAULT_HIT_STOP);
    game.hitStopTotal = game.hitStop;
    game.hitStopShakesDummy = false;
    if (!remote) {
        addTrauma(HIT_TRAUMA * fx);
        kickVel.x += def.kick[0] * DEG * 12 * fx;
        kickVel.y += def.kick[1] * DEG * 12 * fx;
        kickVel.z += def.kick[2] * DEG * 12 * fx;
    }
    playHit(fx, kind);
    sfx.playBossPlate(fx);
    spawnHitFx(at, hitDir, def, swing);
    if (!remote && def !== SWORD_ISSEN && def !== DEADEYE_HIT)
        chargeFocus(damage);
    if (result === 'break' || result === 'down' || result === 'kill') {
        if (result !== 'kill')
            healPlayer(KILL_HEAL);
        if (multiplayerRun && result !== 'kill' && broadcastBossBreak({ part: part, at: [at.x, at.y, at.z], dir: [hitDir.x, hitDir.y, hitDir.z], down: result === 'down' }))
            sharedBossBreakTime = 0;
        const last = result === 'kill';
        finale = last && !!stageRun?.running;
        game.hitStop = Math.max(game.hitStop, last ? FINALE_HIT_STOP : KILL_HIT_STOP);
        game.hitStopTotal = game.hitStop;
        killSlowTime = 0;
        if (!remote) {
            addTrauma(last ? 1 : result === 'down' ? 0.7 : 0.45);
            game.fovKick += last ? 18 : 9;
        }
        spawnKillFx(at, hitDir);
        if (last)
            sfx.playFinale(FINALE_HIT_STOP, killSoundChain);
        else
            sfx.playKill();
        if (finale) {
            spawnFinaleFx(at, hitDir);
            finaleHud.classList.add('on');
            document.body.classList.add('finale');
            clearStageRun();
        }
        if (!remote)
            showHitMarker(true, result === 'kill');
    }
    else {
        if (!remote)
            showHitMarker(fx >= HEAVY_FX);
    }
    return result;
}
function killDummy(kind, swing, remote = false) {
    en.alive = false;
    en.deadTime = 0;
    const killSoundChain = remote ? 1 : showKillChain();
    sinceKill = 0;
    finale = !!stageRun?.running && !stageRun.boss && stageRun.kills + 1 >= stageRun.quota;
    game.hitStop = Math.max(game.hitStop, finale ? FINALE_HIT_STOP : KILL_HIT_STOP);
    game.hitStopTotal = game.hitStop;
    killSlowTime = 0;
    if (!remote) {
        addTrauma(finale ? 1 : 0.45);
        game.fovKick += finale ? 18 : 9;
    }
    // 刺さっていたクナイは砕ける前に抜いて手元へ戻す
    for (const t of thrown)
        if (t.phase === 'stuck' && isOnDummy(t.mesh))
            startReturn(t);
    breakDummy(hitDir, kind === 'bat' ? 'launch' : kind === 'axe' ? 'heavy' : 'normal', swing);
    en.root.visible = false;
    spawnKillFx(en.root.position, hitDir);
    if (finale) {
        spawnFinaleFx(en.root.position, hitDir);
        sfx.playFinale(FINALE_HIT_STOP, killSoundChain);
        finaleHud.classList.add('on');
        document.body.classList.add('finale'); // キルスコアを FINISH の帯の上へ逃がす
    }
    else {
        sfx.playKill(killSoundChain);
    }
    if (!remote)
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
// 倒したご褒美: ダッシュを満タンにし、鎖鎌の引き寄せと弓の跳弾矢（跳弾矢で倒したときは除く）を 1 回分戻し、少し回復し、今の進む向きへ勢いを足す（止まらずに次へ向かえるように）
const KILL_HEAL = 15;
const KILL_BOOST = 5; // 水平の速さへ足す量
const KILL_BOOST_MAX = 30; // 勢いを足してもこれ以上は速くしない
function rewardKill() {
    player.dashCharges = DASH_CHARGES;
    player.dashRecharge = 0;
    player.airJump = true;
    sickleState.hookCharges = Math.min(HOOK_CHARGES, sickleState.hookCharges + 1); // 鎖鎌の引き寄せは 1 回分だけ戻す
    if (sickleState.hookCharges >= HOOK_CHARGES)
        sickleState.hookRecharge = 0;
    gainRicochetArrow();
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
let lastAnyHitAt = -Infinity; // どの敵かを問わず、最後に当てた時刻（実時間）
function trackHitProcess(def, kind) {
    const now = performance.now() / 1000;
    // 投げたクナイや撃った弾は、着く前に持ち替えていても、放った武器で数える
    en.weapons.add(kind === 'throw' ? 'kunai' : def === BULLET_HIT || def === DEADEYE_HIT ? 'handgun' : game.shownWeapon);
    if (en.hits > 0 && now - en.lastHitAt > HIT_COUNT_WINDOW)
        en.comboKept = false;
    if (now - lastAnyHitAt <= SPIN_WINDOW && Math.abs(game.viewSpin) >= Math.PI * 2)
        en.spun = true;
    if (isParryReturn(def))
        en.parried = true;
    en.hits++;
    en.lastHitAt = lastAnyHitAt = now;
    game.viewSpin = 0;
}
// 同時撃破: 前の敵を倒してから MULTI_WINDOW 秒以内（ゲーム内の時間）に同じ技で倒すと、同時に倒した数を増やす。
// 矢とデッドアイは数えない（3 本射ちと、印を付けて続けて撃つデッドアイは、狙わなくても揃ってしまうので）。
// デッドアイで続けて倒した分は、DEAD EYE の加点を増やす
const MULTI_WINDOW = 0.15;
const MULTI_STEP = 1; // 1 体増えるごとに倍率へ足す量
const MULTI_MAX = 2;
let multiKill = 1; // 今の同時撃破の数（1 = 単独）
let lastKillDef = null;
function countMulti(def) {
    const counts = def !== ARROW_HIT && def !== DEADEYE_HIT;
    multiKill = counts && def === lastKillDef && sinceKill <= MULTI_WINDOW ? multiKill + 1 : 1;
    lastKillDef = def;
    if (def === DEADEYE_HIT)
        game.deadEyeKills++;
}
// とどめの倒し方ごとに、スコアの倍率へ足す量
const LONG_SHOT_DIST = 15; // これより遠くから倒すと遠距離の加点。さらに LONG_SHOT_STEP 離れるごとに 0.5 ずつ増やす
const LONG_SHOT_STEP = 8;
const LONG_SHOT_MAX = 2;
const DEADEYE_STEP = 0.5; // デッドアイで 2 体目から 1 体ごとに DEAD EYE へ足す量
const DEADEYE_BONUS_MAX = 2;
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
    if (isParryReturn(def))
        out.push({ label: 'PARRY KILL', add: 2 });
    else if (en.parried)
        out.push({ label: 'PARRY', add: 1 }); // とどめ以外でパリィを当てていた（PARRY KILL とは重ねない）
    if (en.hits >= 2 && en.comboKept)
        out.push({ label: 'COMBO', detail: `${en.hits} HITS`, add: 1 });
    if (en.spun)
        out.push({ label: '360', add: 1 });
    if (!en.hitPlayer)
        out.push({ label: 'NO DAMAGE', add: 0.5 });
    moveBonuses(def, out);
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
        const add = Math.min(LONG_SHOT_MAX, 0.5 + Math.floor((dist - LONG_SHOT_DIST) / LONG_SHOT_STEP) * 0.5);
        out.push({ label: 'LONG SHOT', detail: `${Math.round(dist)}M`, add });
    }
    speedBonus(out);
    if (killChain > 1) {
        out.push({ label: 'CHAIN', detail: `×${killChain}`, add: Math.min(CHAIN_MAX, (killChain - 1) * CHAIN_STEP) });
    }
    return out;
}
// ボスの本体に当てたときの加点。敵ごとの加点（コンボなど）は数えず、技と動きの加点だけ
function bossBonuses(def) {
    const out = [];
    if (isParryReturn(def))
        out.push({ label: 'PARRY', add: 1 });
    moveBonuses(def, out);
    if (player.wallRunning)
        out.push({ label: 'WALL RUN', add: 1 });
    else if (!player.onGround && player.mantleTime < 0)
        out.push({ label: 'AERIAL', add: 0.5 });
    speedBonus(out);
    return out;
}
// 当てた技とそのときの動きで決まる加点
function moveBonuses(def, out) {
    if (player.sliding || def === SLIDE_UP || def === SWORD_SWEEP)
        out.push({ label: 'SLIDE KILL', add: 1 });
    if (def === SWORD_ISSEN)
        out.push({ label: 'IAI', add: 1 });
    if (def === DEADEYE_HIT) {
        const n = Math.max(1, game.deadEyeKills);
        out.push({ label: 'DEAD EYE', detail: n > 1 ? `×${n}` : undefined, add: Math.min(DEADEYE_BONUS_MAX, 1 + (n - 1) * DEADEYE_STEP) });
    }
    if (def === DASH_SLASH || def === AXE_DRIVE || def === SWORD_THRUST || def === SICKLE_DASH_HIT || def === SICKLE_DASH_LAST)
        out.push({ label: 'DASH KILL', add: 0.5 });
    if (def === SWORD_CHARGE_SLASH)
        out.push({ label: 'CHARGED', add: 0.5 });
    if (def === AXE_SHOCK_HIT)
        out.push({ label: 'SHOCKWAVE', add: 0.5 });
    if (def === WALL_SLAM_HIT)
        out.push({ label: 'WALL SLAM', add: 1 });
    if (def === BODY_SLAM_HIT)
        out.push({ label: 'BODY SLAM', add: 1 });
    if (def === FLOOR_SLAM_HIT)
        out.push({ label: 'GROUND SLAM', add: 1 });
}
function speedBonus(out) {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed >= SPEED_KILL_MIN) {
        out.push({ label: 'SPEED KILL', detail: `${Math.round(speed)}M/S`, add: speed >= SPEED_KILL_HIGH ? 1 : 0.5 });
    }
}
function respawnDummy() {
    if (stageRun?.boss)
        stageRun.adds--;
    if (stageRun) {
        const kind = pickEnemyKind();
        if (kind !== en.kind)
            rebuildEnemy(kind);
        if (kind === stageLead)
            stageRun.leads++;
        else if (kind === stageGuest)
            stageRun.guests++;
        stageRun.spawned[kind]++;
    }
    if (multiplayerRun && stageRun?.boss && !isMultiplayerGuest())
        markAddSpawn(en);
    if (enemySpawns.length > 0)
        placeDummy(pickSpawn());
    boardLedge(); // リフトのステージでは、上の足場に乗せる
    en.alive = true;
    en.hp = enemyMaxHp(en.kind);
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
    en.hits = 0;
    en.lastHitAt = -Infinity;
    en.comboKept = true;
    en.parried = en.spun = en.hitPlayer = false;
    en.weapons.clear();
    if (en.kind === 'striker')
        resetStriker();
    if (en.kind === 'sniper')
        resetSniper();
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
const STAGE_ENEMY_COUNT = { easy: 3, normal: 5, hard: 7 };
const STAGE_SPAWN_FIRST = 0.6; // 操作を返してから最初の敵が現れるまで
const STAGE_SPAWN_GAP = 0.8; // 次の敵が現れるまでの間
// ステージの主役の敵（StageLayout の lead）を、倒す数のうちどれだけ混ぜるかと、同時に何体まで出すか。
// easy でも 1 体だけ出して、そのステージの特徴を見せる。normal は 2 割、hard は 3〜4 割
const STAGE_LEAD_COUNT = { easy: 1, normal: 3, hard: 7 };
const STAGE_LEAD_AT_ONCE = { easy: 1, normal: 1, hard: 2 };
// 脇役の敵（StageLayout の guest）は主役より少なく、同時には 1 体まで
const STAGE_GUEST_COUNT = { easy: 1, normal: 2, hard: 3 };
let stageLead; // 今のステージの主役（無ければ銃撃役だけ）
let stageGuest; // 今のステージの脇役（無ければ混ぜない）
let stageMix; // 今のステージの、難易度ごとの種類の割合（あれば主役と脇役の代わりに使う）
// 次に出す敵の種類。残りの出番に主役と脇役の残りを散らして混ぜ、終わりまでに数が揃うようにする
function pickEnemyKind() {
    if (!stageRun || stageRun.boss)
        return 'gunner'; // ボスの増援は銃撃役だけ
    const difficulty = DIFFICULTIES[difficultyIndex];
    const mix = stageMix?.[difficulty];
    if (mix) {
        // 割合から決まる数の残りに比べて選ぶ（終わりまでに数が揃う）
        const kinds = Object.keys(mix);
        const rest = kinds.map((k) => Math.max(0, Math.round(mix[k] * stageRun.quota) - stageRun.spawned[k]));
        let r = Math.random() * rest.reduce((a, b) => a + b, 0);
        for (let i = 0; i < kinds.length; i++)
            if ((r -= rest[i]) < 0)
                return kinds[i];
        return kinds[0];
    }
    const alive = enemies.filter((e) => e.alive);
    const left = (kind, count, atOnce, used) => !kind || alive.filter((e) => e.kind === kind).length >= atOnce ? 0 : Math.max(0, count - used);
    const leadLeft = left(stageLead, STAGE_LEAD_COUNT[difficulty], STAGE_LEAD_AT_ONCE[difficulty], stageRun.leads);
    const guestLeft = left(stageGuest, STAGE_GUEST_COUNT[difficulty], 1, stageRun.guests);
    const turns = stageRun.quota - stageRun.kills - alive.length; // この 1 体を含めた残りの出番
    const r = Math.random() * turns;
    if (r < leadLeft)
        return stageLead;
    if (r < leadLeft + guestLeft)
        return stageGuest;
    return 'gunner';
}
// ---- ステージのクリア ----
// 難易度で決まる数を倒したら終わり。時間は操作を返してから最後の 1 体を倒すまでの実時間で測る（一時停止の間は数えない）。
// 残りの数より多くは湧かせないので、最後の 1 体を倒すと場に敵はいなくなる。とどめのスローの余韻を見せてから結果を出す
const STAGE_KILL_QUOTA = { easy: 10, normal: 15, hard: 20 };
const RESULT_DELAY = 3.2; // 倒しきってから結果を出すまで（実時間）。最後の 1 体の長いスローを見せきってから
const BOSS_RESULT_DELAY = 6.5; // ボスは止まってから爆発し、残骸が落ちきるまで見せる
const finaleHud = document.getElementById('finale');
document.fonts.load('800 100px "Barlow Condensed"', 'FINISH'); // 出す瞬間に別の字形で一瞬出ないよう、太字を先に読み込んでおく
document.fonts.load('600 100px "Oswald"', 'FASTFINISH'); // ステージの始まりのタイトルの字も先に読み込んでおく
let stageRun = null; // 訓練場では null
const runHud = document.querySelector('#total .run');
const runTime = runHud.querySelector('.time');
// 残りの敵の数は画面の中央下に大きく出す
const remainHud = document.getElementById('remain');
const remainNum = remainHud.querySelector('.num');
// ボスのステージでは、ボスを倒したら終わり（倒す数は 1）。残りの数は出さない（ボスの体力の帯がある）。点数の決め方は applyBossHit の上
function beginStageRun(bossStage = false) {
    resetKillChainDisplay();
    resetReplay();
    stageRun = {
        quota: bossStage ? 1 : STAGE_KILL_QUOTA[DIFFICULTIES[difficultyIndex]],
        kills: 0, time: 0, damage: 0, leads: 0, guests: 0, spawned: { gunner: 0, striker: 0, sniper: 0 }, aimedHits: 0, headshots: 0, running: false, clearedT: -1,
        resultDelay: bossStage ? BOSS_RESULT_DELAY : RESULT_DELAY,
        boss: bossStage,
        adds: 0,
        xp: 0,
    };
    bossTally.pts = 0;
    bossTally.weight = 1;
    bossTally.adds.clear();
    runTime.textContent = fmtTime(0);
    runHud.hidden = false;
    remainNum.textContent = String(stageRun.quota);
    remainHud.hidden = bossStage;
    bowState.ricochetStock = BOW_RICOCHET_STOCK;
}
// まだ湧かせてよいか。倒した数と場にいる数を足して、倒す数に届いたら湧かせない
function canSpawnEnemy() {
    if (stageRun?.boss)
        return stageRun.adds > 0; // ボスのステージでは、呼ばれた分だけ
    return !stageRun || stageRun.kills + enemies.filter((e) => e.alive).length < stageRun.quota;
}
function countStageKill() {
    if (!stageRun?.running || stageRun.boss)
        return; // ボスの増援は倒す数に数えない
    stageRun.kills++;
    remainNum.textContent = String(stageRun.quota - stageRun.kills);
    // 減った瞬間に大きく叩きつけてから収める
    remainNum.animate([{ transform: 'scale(1.5)', filter: 'brightness(3)' }, { transform: 'none', filter: 'none' }], { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
    if (stageRun.kills >= stageRun.quota)
        clearStageRun();
}
// ---- ボスの増援 ----
// ボスのステージでは始めに敵を出さず、ボスが信号弾を打ち上げたときだけ、銃撃役を間を空けて出現位置から起き上がらせる。
// 倒しても倒す数には数えない（ボスを倒したら終わり）。倒したご褒美の回復（rewardKill）が、ボス戦での回復の手段になる
const ADD_FIRST = 0.3; // 信号弾が弾けてから 1 体目が起き上がり始めるまで
const ADD_GAP = 0.45; // 次の 1 体まで
function callAdds(count) {
    if (!stageRun?.running)
        return;
    const dead = enemies.filter((e) => !e.alive);
    for (const e of dead)
        e.deadTime = -Infinity; // 呼んだ分のほかは起き上がらせない
    for (let i = 0; i < count; i++) {
        let e = dead[i];
        if (!e) {
            e = createEnemy(true);
            e.alive = false;
            e.root.visible = false;
            e.riseDelay = -1e9; // ステージの組み上がりの動きはさせない
        }
        e.deadTime = RESPAWN_TIME - (ADD_FIRST + i * ADD_GAP);
    }
    stageRun.adds += count;
}
// 場にいる増援と、呼ばれてまだ現れていない増援の数
function addsAlive() {
    return stageRun?.boss ? enemies.filter((e) => e.alive).length + stageRun.adds : 0;
}
// ボスを倒したら、残っている増援も崩す（とどめの余韻の間に撃たれないように）
function breakAdds() {
    if (stageRun)
        stageRun.adds = 0;
    const keep = en;
    for (const e of enemies) {
        e.deadTime = -Infinity;
        if (!e.alive)
            continue;
        setEn(e);
        e.alive = false;
        for (const t of thrown)
            if (t.phase === 'stuck' && isOnDummy(t.mesh))
                startReturn(t);
        breakDummy(hitDir);
        e.root.visible = false;
    }
    setEn(keep);
}
function clearStageRun() {
    if (!stageRun?.running)
        return;
    if (multiplayerRun && stageRun.boss && !isMultiplayerGuest()) {
        multiplayerResult = { score: totalScore() + multiplayerRemoteAddPoints, time: stageRun.time };
        broadcastBossVictory(multiplayerResult.score, multiplayerResult.time);
    }
    stageRun.running = false;
    stageRun.clearedT = 0;
    runHud.classList.add('clear');
    remainHud.classList.add('clear');
}
function onMultiplayerBossVictory(score, time) {
    if (!stageRun?.running || !stageRun.boss)
        return;
    multiplayerResult = { score, time };
    stageRun.time = time;
    stageRun.kills++;
    finale = true;
    killSlowTime = 0;
    finaleHud.classList.add('on');
    document.body.classList.add('finale');
    sfx.playFinale(FINALE_HIT_STOP, 1);
    breakAdds();
    clearStageRun();
}
function onMultiplayerPartyDefeat() {
    if (!stageRun?.running)
        return;
    stageRun.running = false;
    showGameOver(stageRun);
}
function onMultiplayerDisconnect(hostLost) {
    if (!multiplayerRun || overlay.classList.contains('result') || overlay.classList.contains('over') || (stageRun && stageRun.clearedT >= 0))
        return;
    if (!hostLost) {
        showToast('参加者が退出しました');
        return;
    }
    multiplayerSessionLost = true;
    pauseGame();
    sfx.setAudioPaused(true);
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:20000;display:grid;place-items:center;background:rgba(30,30,30,.85);color:white;font:600 18px "IBM Plex Sans JP",sans-serif;text-align:center';
    const box = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '接続が切れました';
    const note = document.createElement('p');
    note.textContent = 'ホストとの接続が終了しました。';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'タイトルへ戻る';
    back.style.cssText = 'padding:12px 24px;border:1px solid white;background:transparent;color:white;font:inherit;cursor:pointer';
    back.addEventListener('click', () => quitToTitle());
    box.append(title, note, back);
    dialog.appendChild(box);
    document.body.appendChild(dialog);
    back.focus();
}
function updateStageRun(realDt) {
    if (!stageRun)
        return;
    if (stageRun.boss && bossTally.pts > 0 && boss.phase !== 'down')
        flushBossTally(); // しゃがみ込みが終わったら、その間の点を出す
    if (stageRun.running) {
        stageRun.time += game.realDt;
        runTime.textContent = fmtTime(stageRun.time);
    }
    else if (stageRun.clearedT >= 0) {
        stageRun.clearedT += game.realDt;
        if (stageRun.clearedT >= stageRun.resultDelay)
            showStageResult(stageRun);
    }
}
// 結果に出す熟練度。ステージでは持ち替えられないので、今持っている武器で稼いだことになる。名前は武器の選択画面の行から写す
function masteryResult(run) {
    const id = game.shownWeapon;
    const row = document.querySelector(`#overlay .sw-rows [data-weapon="${id}"]`);
    return { name: row?.dataset.name ?? id.toUpperCase(), ja: row?.dataset.ja ?? '', before: Math.max(0, loadXp(id) - run.xp), gained: run.xp };
}
// 一時停止の画面を結果の画面に作り替えて止める。ここからはタイトルへ戻ることしかできない。
// 自己ベストと比べてから記録し直す
function showStageResult(run) {
    run.clearedT = -1;
    const button = stageButtons[stageIndex];
    const stage = button.dataset.stage;
    const difficulty = DIFFICULTIES[difficultyIndex];
    const bossStage = run.boss;
    const baseScore = multiplayerRun && multiplayerResult ? multiplayerResult.score : totalScore();
    const score = finalScore(baseScore, run.time, bossStage ? BOSS_PAR[difficulty] : killPar(run.kills));
    const best = loadBest(stage, difficulty);
    const newTime = !multiplayerRun && (!best || run.time < best.time);
    const newScore = !multiplayerRun && (!best || score > best.score);
    if (!multiplayerRun)
        saveBest(stage, difficulty, { time: newTime ? run.time : best.time, score: newScore ? score : best.score });
    overlay.classList.add('result');
    overlay.querySelector('[data-action="multiplayer-lobby"]').hidden = !multiplayerRun;
    overlayPrompt.textContent = 'CLICK TO SKIP';
    showResult({
        stageNo: button.querySelector('.no').textContent,
        stageName: stage.toUpperCase(),
        difficulty: difficulty.toUpperCase(),
        time: run.time,
        kills: run.kills,
        rankScale: bossStage ? BOSS_RANK_SCALE : run.kills,
        damage: Math.round(run.damage),
        headshotRate: run.aimedHits > 0 ? run.headshots / run.aimedHits : null,
        score,
        newTime,
        newScore,
        mastery: masteryResult(run),
        clip: startReplay() ? { aspect: CLIP_ASPECT, play: playReplay } : undefined,
    }, () => (overlayPrompt.textContent = ''));
    pauseGame();
}
let enemySpawns = [];
const STRIKER_SPAWN_FAR = 32; // ストライカーを隠れた所から出すときは、これより近い所から選ぶ
const spawnEye = new THREE.Vector3();
const spawnDir = new THREE.Vector3();
// 出現位置 i に立った敵の胸が、プレイヤーの目から壁に隠れているか
function spawnHidden(i) {
    const s = enemySpawns[i];
    camera.getWorldPosition(spawnEye);
    spawnDir.set(s.x, s.y + 1.3, s.z).sub(spawnEye);
    const d = spawnDir.length();
    return castWorld(spawnEye, spawnDir.divideScalar(d), d) < d - 0.5;
}
// 起き上がりきるまでの間に、走る車がそこを通るか（起き上がっている間はよけられない）
const SPAWN_CAR_AHEAD = RESPAWN_RISE_TIME + 1.5;
const spawnCarDir = new THREE.Vector3();
const carComing = (i) => {
    const s = enemySpawns[i];
    return moverThreat(s.x, s.z, s.y, DUMMY_HEIGHT, DUMMY_RADIUS + 1, SPAWN_CAR_AHEAD, spawnCarDir);
};
// en を出す出現位置を選ぶ
function pickSpawn() {
    const off = (i) => {
        const d = Math.hypot(enemySpawns[i].x - position.x, enemySpawns[i].z - position.z);
        return Math.max(SPAWN_NEAR - d, d - SPAWN_FAR); // 0 以下なら程よい距離
    };
    const crowded = (i) => enemies.some((e) => e !== en && e.alive && Math.hypot(e.root.position.x - enemySpawns[i].x, e.root.position.z - enemySpawns[i].z) < SPAWN_APART)
        || carComing(i);
    const sniper = en.kind === 'sniper';
    const all = enemySpawns.map((_, i) => i).filter((i) => sniper || !enemySpawns[i].perch);
    let cands = all.filter((i) => i !== en.spawnIndex && !crowded(i));
    if (cands.length === 0)
        cands = all.filter((i) => i !== en.spawnIndex);
    if (cands.length === 0)
        cands = all;
    const good = cands.filter((i) => off(i) <= 0);
    // ストライカーは、プレイヤーから見えない所（棚の陰）を選んで、近くから飛び出させる
    if (en.kind === 'striker') {
        const hidden = good.filter((i) => spawnHidden(i) && Math.hypot(enemySpawns[i].x - position.x, enemySpawns[i].z - position.z) < STRIKER_SPAWN_FAR);
        if (hidden.length > 0)
            return hidden[Math.floor(Math.random() * hidden.length)];
    }
    // 狙撃手は、遠くてプレイヤーから見える所を選ぶ。高い所（perch）があればそちらを先に
    if (sniper) {
        const far = cands.filter((i) => !spawnHidden(i) && Math.hypot(enemySpawns[i].x - position.x, enemySpawns[i].z - position.z) >= SNIPER_SPAWN_NEAR);
        const perches = far.filter((i) => enemySpawns[i].perch);
        const from = perches.length > 0 ? perches : far;
        if (from.length > 0)
            return from[Math.floor(Math.random() * from.length)];
    }
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
    en.batFlung = false;
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
        case 'bow': return hitDamage(ARROW_HIT, 'bullet') * ARROW_DMG_MAX; // 引ききった 1 本
        case 'bat': return hitDamage(BAT_SWING_1, 'bat');
        case 'spear': return hitDamage(SPEAR_TWIRL_1, 'sword');
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
    updateDangerHud([...liftDangers(), ...bossDangers()]);
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
        const aiming = e.kind === 'striker' ? e.strikePhase === 'windup' || e.strikePhase === 'slash'
            : e.kind === 'sniper' ? e.charge >= 0 : e.cooldown < THREAT_AIMING;
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
let shakeSide = 1;
let shakeEnemy = null; // 震わせる敵（最後に当てた敵）
function updateDummyShake() {
    if (multiplayerRun && isMultiplayerGuest() && stageRun?.boss)
        return;
    for (const e of enemies)
        poseEnemyTumble(e);
    if (game.hitStop <= 0 || !game.hitStopShakesDummy || !shakeEnemy)
        return;
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
const hitMarker = document.getElementById('hitmarker');
function showHitMarker(heavy, killed = false) {
    rumble(killed ? 'kill' : heavy ? 'heavy' : 'hit');
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
const killChainEl = document.getElementById('kill-chain');
let displayedKills = 0;
let lastDisplayedKill = -Infinity;
function resetKillChainDisplay() {
    displayedKills = 0;
    lastDisplayedKill = -Infinity;
    killChainEl.classList.remove('show');
}
function showKillChain() {
    const now = performance.now() / 1000;
    displayedKills = now - lastDisplayedKill <= CHAIN_WINDOW ? displayedKills + 1 : 1;
    lastDisplayedKill = now;
    if (displayedKills < 2)
        return displayedKills;
    killChainEl.textContent = `${displayedKills} KILLS`;
    killChainEl.classList.remove('show');
    void killChainEl.offsetWidth;
    killChainEl.classList.add('show');
    return displayedKills;
}
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
// 刃先の位置から敵の表面の当たった所を求める（hitPointFromTip）ための作業用
const hitRay = new THREE.Ray();
const hitAxisA = new THREE.Vector3();
const hitAxisB = new THREE.Vector3();
const hitOnRay = new THREE.Vector3();
const hitOnAxis = new THREE.Vector3();
const hitOffset = new THREE.Vector3();
// 視点から tip（ワールド座標）を通る線が敵に当たる所。外れていれば敵の輪郭のうち線に最も近い所
function hitPointFromTip(tip, out) {
    // ボスは、選んだときに求めた機体の表面の点に当てる
    if (bossHitPart) {
        out.copy(bossHitAt);
        return;
    }
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
    playerHp: () => game.playerHp > 0 || (multiplayerRun && remotePlayers().length > 0) ? 1 : 0,
    targetPlayer: (out) => {
        let distance = game.playerHp > 0 ? Math.hypot(position.x - en.root.position.x, position.z - en.root.position.z) : Infinity;
        if (distance < Infinity)
            out.set(position.x, position.y + player.eyeHeight - 0.35, position.z);
        if (multiplayerRun)
            for (const remote of remotePlayers()) {
                const d = Math.hypot(remote.x - en.root.position.x, remote.z - en.root.position.z);
                if (d < distance) {
                    distance = d;
                    out.set(remote.x, remote.y + remote.eyeHeight - 0.35, remote.z);
                }
            }
        return distance < Infinity;
    },
    slamIntoFloor: slamEnemyIntoFloor,
    slamIntoWall: slamEnemyIntoWall,
    slamIntoEnemy: slamEnemyIntoEnemy,
});
// とどめの印は 1 体ずつ別の要素で出す（ページにある 1 つを型にして複製する）
const finishTemplate = document.getElementById('finish');
const threatsEl = document.getElementById('threats');
// 敵を作って場に出す
function createEnemy(mobile, kind = 'gunner') {
    const e = buildEnemy(mobile, kind);
    enemies.push(e);
    return e;
}
// 敵を 1 体組む（場の一覧には入れない）。ストライカーは銃を持たないので、銃と銃口は空の入れ物にする。狙撃手はライフルを持つ
function buildEnemy(mobile, kind) {
    const striker = kind === 'striker';
    const body = striker ? buildStrikerBody() : buildEnemyBody();
    const gun = striker ? new THREE.Group() : kind === 'sniper' ? attachSniperRifle(body) : attachEnemyGun(body);
    const muzzle = striker ? new THREE.Object3D() : gun.userData.muzzle;
    const muzzleFx = striker ? new THREE.Object3D() : muzzleFlash.clone();
    muzzleFx.visible = false;
    muzzle.add(muzzleFx);
    const springs = [spring(55, 8), spring(150, 12), spring(110, 10), spring(240, 14), spring(180, 13)];
    const finishEl = finishTemplate.cloneNode(true);
    finishEl.removeAttribute('id');
    finishTemplate.after(finishEl);
    const threatEl = threatsEl.appendChild(document.createElement('i'));
    const e = {
        ...body,
        kind,
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
        hp: enemyMaxHp(kind),
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
        batFlung: false,
        walk: 0,
        walkPhase: 0,
        walkDir: new THREE.Vector3(0, 0, 1),
        stride: striker ? STRIKER_STRIDE : ENEMY_STRIDE,
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
        dodgeT: 0,
        dodgeVel: new THREE.Vector3(),
        stumble: 0,
        stumbling: false,
        skidT: 0,
        strikePhase: 'chase',
        strikeT: 0,
        strikeHit: false,
        strikePose: strikerRestPose(),
        strikePoseVel: strikerRestPose().map(() => 0),
        turnVel: 0,
        dropCell: -1,
        dropFrom: new THREE.Vector3(),
        dropTo: new THREE.Vector3(),
        dropT: 0,
        dropDur: 0,
        ride: 'none',
        rideLedge: -1,
        rideY: 0,
        rideSlot: 0,
        charge: -1,
        laser: kind === 'sniper' ? createSniperLaser() : null,
        hits: 0,
        lastHitAt: -Infinity,
        comboKept: true,
        parried: false,
        spun: false,
        hitPlayer: false,
        weapons: new Set(),
    };
    scene.add(e.root);
    return e;
}
const enemyMaxHp = (kind) => (kind === 'striker' ? STRIKER_HP : kind === 'sniper' ? SNIPER_HP : DUMMY_MAX_HP);
// 敵を場から片付ける（一覧からは外さない）
function disposeEnemy(e) {
    setEn(e);
    for (const t of thrown)
        if (t.phase === 'stuck' && isOnDummy(t.mesh))
            startReturn(t);
    clearDebris();
    clearScars(en);
    e.root.removeFromParent();
    e.laser?.removeFromParent();
    e.finishEl.remove();
    e.threatEl.remove();
}
function removeEnemy(e) {
    disposeEnemy(e);
    enemies.splice(enemies.indexOf(e), 1);
}
// 倒されて出番を待っている en を、別の種類の体に作り替える（一覧の同じ場所に入れ、en を新しい方にする）
function rebuildEnemy(kind) {
    const old = en;
    disposeEnemy(old);
    const e = buildEnemy(old.mobile, kind);
    e.alive = false;
    e.spawnIndex = old.spawnIndex;
    e.riseDelay = old.riseDelay;
    e.baseY = old.baseY;
    e.root.position.copy(old.root.position);
    enemies[enemies.indexOf(old)] = e;
    setEn(e);
}
// 敵を全員ぶん進め、飛んでいる敵の弾を進める
let sinceKill = Infinity; // 最後に倒してからの時間
function updateEnemies(dt) {
    sinceKill += dt;
    if (multiplayerRun && isMultiplayerGuest() && stageRun?.boss) {
        const snapshots = latestAdds();
        while (enemies.length > snapshots.length)
            removeEnemy(enemies[enemies.length - 1]);
        snapshots.forEach((snapshot, i) => {
            let e = enemies[i];
            if (!e) {
                e = createEnemy(true, 'gunner');
                e.root.visible = false;
            }
            applyAddSnapshot(e, snapshot, e.root.visible ? game.realDt : 1);
        });
        updateEnemyBullets(dt);
        return;
    }
    if (multiplayerRun && stageRun?.boss)
        updateRemoteWeaponHolds();
    for (const e of enemies) {
        setEn(e);
        hitByMover();
        updateDummy(dt);
    }
    updateEnemyBullets(dt);
}
// ---- 車にはねられる ----
// 敵はふだん走ってくる車をよける（enemy/motion.ts）。それでも触れたときは、プレイヤーの攻撃でよけられなかった敵
// （当てられた直後か、打ち上げられている）だけが、車の進む向きへはね飛ばされて砕ける。
// ほかは車の横へ押しのけるだけにして、ひとりでに車で倒れることはない
const CAR_HIT = { kick: [-1.2, 0, 0], slash: 0, knock: 500, hitStop: 0.1, fx: 1.2, dmg: 99 };
const CAR_KILL_WINDOW = 1.5; // 当てられてからこれだけの間に車に触れたら、はねられる (s)
const CAR_SHOVE = 2; // 押しのけたときによろける速さ (m/s)。壁への叩きつけにならない遅さ
const carHitAt = new THREE.Vector3();
const carShoveDir = new THREE.Vector3();
function hitByMover() {
    if (!en.alive)
        return;
    const p = en.root.position;
    const v = moverHazardAt(p.x, p.z, p.y, DUMMY_HEIGHT, DUMMY_RADIUS);
    if (!v)
        return;
    if (en.flashT >= CAR_KILL_WINDOW && en.airY <= 0) {
        shoveFromCar();
        return;
    }
    hitDir.copy(v).normalize();
    carHitAt.copy(p).addScaledVector(hitDir, -DUMMY_RADIUS);
    carHitAt.y += 1;
    sfx.playAxeGround(1);
    applyDummyHit(CAR_HIT, carHitAt, 'axe', undefined, false);
}
// 車の横の、立てる所まで押し出す（車から離れる側に無ければ逆の側）
function shoveFromCar() {
    const p = en.root.position;
    if (!moverThreat(p.x, p.z, p.y, DUMMY_HEIGHT, DUMMY_RADIUS, 0, carShoveDir))
        return;
    for (const side of [1, -1]) {
        for (let d = 0.2; d <= 4; d += 0.2) {
            const x = p.x + carShoveDir.x * side * d;
            const z = p.z + carShoveDir.z * side * d;
            if (!enemyCanStand(x, z))
                continue;
            p.x = x;
            p.z = z;
            en.knockVel.copy(carShoveDir).multiplyScalar(side * CAR_SHOVE);
            en.moving = false;
            return;
        }
    }
}
function updateDummy(dt) {
    if (en.alive) {
        en.idleT += dt;
        const boarding = updateBoarding(dt); // リフトの足場に乗っている / 飛び乗っている間は、歩かずに運ばれる
        if (!boarding && (en.airY > 0 || en.airVel > 0))
            updateEnemyAir(dt);
        updateEnemyTumble(dt);
        if (!boarding) {
            updateEnemyKnock(dt);
            if (en.kind === 'striker')
                updateStrikerMove(dt);
            else if (en.kind === 'gunner')
                updateEnemyMove(dt); // 狙撃手は出た所から動かない
        }
        updateEnemyGait(dt);
        if (en.kind === 'striker')
            updateStrikerFace(dt);
        else if (en.kind === 'sniper')
            updateSniperAim(dt);
        else
            updateDummyAim(dt);
        updateDummyStagger(dt);
        if (en.kind === 'striker')
            poseStriker(dt);
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
    if (en.kind === 'gunner')
        updateEnemyFire(dt);
    else if (en.kind === 'sniper')
        updateSniperFire(dt);
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
// ---- 敵どうしの衝突 ----
// バットのチャージで吹き飛ばした敵がほかの敵に当たると、壁と同じく速さに応じた重い一撃を両方に入れる。
// 当てられた敵も同じ向きへ吹き飛び、さらに先の敵を巻き込んでいく
const BODY_SLAM_PASS = 0.75; // 当てられた敵へ渡す速さの割合
const BODY_SLAM_LIFT = 3; // 当てられた敵を浮かせる速さ (m/s)
const BODY_SLAM_HIT = { kick: [-1.2, 0, 0], slash: 0, hitStop: 0.1 };
const bodySlamAt = new THREE.Vector3();
const bodySlamDir = new THREE.Vector3();
function slamEnemyIntoEnemy(other) {
    const flier = en;
    const speed = flier.knockVel.length();
    if (speed < WALL_SLAM_MIN)
        return false;
    const p = THREE.MathUtils.clamp((speed - WALL_SLAM_MIN) / (WALL_SLAM_FULL - WALL_SLAM_MIN), 0, 1);
    bodySlamDir.copy(flier.knockVel).divideScalar(speed);
    BODY_SLAM_HIT.fx = 0.9 + 0.8 * p;
    BODY_SLAM_HIT.knock = 300 + 200 * p;
    // 2 体がぶつかった所
    bodySlamAt.addVectors(flier.root.position, other.root.position).multiplyScalar(0.5);
    bodySlamAt.y += 1.0 + flier.airY;
    sfx.playAxeGround(0.8 + 0.6 * p);
    spawnSparks(bodySlamAt, bodySlamDir, 12, 0.9, 1);
    // ぶつけられた側: 同じ向きへ吹き飛ばして、さらに先を巻き込ませる
    setEn(other);
    hitDir.copy(bodySlamDir);
    applyDummyHit(BODY_SLAM_HIT, bodySlamAt, 'bat', undefined, false);
    if (en.alive && !enemyHeld()) {
        en.knockVel.copy(bodySlamDir).multiplyScalar(speed * BODY_SLAM_PASS);
        en.flung = en.batFlung = true;
        en.airVel = Math.max(en.airVel, BODY_SLAM_LIFT);
        en.vel.set(0, 0, 0);
        en.moving = false;
    }
    // ぶつけた側: 正面から止められる
    setEn(flier);
    hitDir.copy(bodySlamDir);
    applyDummyHit(BODY_SLAM_HIT, bodySlamAt, 'bat', undefined, false);
    return true;
}
// 鎖鎌で掛けられているか、突進の的になっているか
function enemyHeld() {
    return remoteWeaponHolds.has(en) || (sickleState.grapple?.enemy === en && sickleState.grapple.phase !== 'back') || (swordState.rushTime >= 0 && swordState.rushEnemy === en) || spearHolds(en);
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
function updateHitFx(dt) {
    updateAxeShocks(dt);
    updateHitParticles(dt);
    updateArcs(dt);
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
    applyHit,
    enemyHeld,
    inReachOf,
    dummyInReach,
    bossInReach,
    bossTargeted: () => bossHitPart !== null,
    hitBoss,
    hitPointFromTip,
    applyLunge,
    grappling: () => sickleState.grapple !== null, applyCameraOffset, restoreCameraOffset, damagePlayer, pauseGame, callAdds, addsAlive,
});
// ---- ハンドガン ----（weapons/handgunCombat.ts）
// ---- 敵の銃 ----（自動拳銃の持たせ方と敵の射撃は enemy/fire.ts）
// ---- パリィ ----（combat/parry.ts）
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
        if (gunState.drawT >= 0)
            endGunDraw();
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
    // 撃ち尽くしたら、反動が収まったところで自動で装填する（取り出しの途中なら終わるのを待つ）
    if (gunReady() && !gunState.gunReloading && gunState.gunAmmo === 0 && gunState.gunCooldown <= 0 && gunState.drawT < 0)
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
    updateGunDraw(dt);
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
// バットの攻撃を確かめる: ?bat=swing1&t=0.2（その時間で止める）
function runBatDebug(def, params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'bat';
    const step = 1 / 120;
    if (params.has('near'))
        position.set(en.root.position.x, 0, en.root.position.z + 1.6);
    for (let i = 0; i < 30; i++)
        update(step);
    startBatAttack(def);
    const tEnd = Number(params.get('t') ?? def.duration);
    while (batState.attack && batState.time + step <= tEnd) {
        update(step);
        updateHitFx(step);
    }
    updateSpeedFx(0);
    renderer.setAnimationLoop(() => {
        applyCameraOffset();
        composer.render(0);
        camera.quaternion.copy(savedQuat);
    });
}
// 槍の攻撃を確かめる: ?spear=sweep1&t=0.25（その時間で止める）
function runSpearDebug(def, params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'spear';
    const step = 1 / 120;
    if (params.has('near'))
        position.set(en.root.position.x, 0, en.root.position.z + 2.6);
    for (let i = 0; i < 30; i++)
        update(step);
    startSpearAttack(def);
    const tEnd = Number(params.get('t') ?? def.duration);
    while (spearState.attack && spearState.time + step <= tEnd) {
        update(step);
        updateHitFx(step);
    }
    updateSpeedFx(0);
    renderer.setAnimationLoop(() => {
        applyCameraOffset();
        composer.render(0);
        camera.quaternion.copy(savedQuat);
    });
}
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
// ステージの見た目を確かめる: ?stage=station / warehouse / lift / mall / ruins / parking（組み上がった状態を始めの位置から見る）。
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
// 狙撃手の構えと照準線を確かめる: ?sniper&t=1（狙い始めてからの時間。1.45 を過ぎるとロックして線が点滅する）&yaw=40（回り込んで見る角度）。
// 訓練場の的を狙撃手に作り替えて、8m 先のプレイヤーを狙わせたところで止める
function runSniperDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    setEn(enemies[0]);
    rebuildEnemy('sniper');
    en.alive = true;
    resetSniper();
    const yaw = Number(params.get('yaw') ?? 0) * DEG;
    const at = en.root.position;
    position.set(at.x + 1.5, 0, at.z + 8);
    const step = 1 / 120;
    for (let i = 0; i < 60; i++)
        update(step);
    en.cooldown = 0;
    update(step);
    const t = Number(params.get('t') ?? 1);
    while (en.charge >= 0 && en.charge < t)
        update(step);
    setViewModelsVisible(false);
    camera.position.set(at.x + Math.sin(yaw) * 3.2, 1.5, at.z + Math.cos(yaw) * 3.2);
    camera.lookAt(at.x, 1.3, at.z);
    renderer.setAnimationLoop(() => composer.render(0));
}
// ストライカーの姿勢を確かめる: ?striker=ready / windup / slash（その姿勢で止める）&yaw=40（正面から右へ回り込んで見る角度）
// &t=0.1 は段に入ってからの時間（振りかぶりの刃の縁の光り方が変わる）。訓練場の的をストライカーに作り替えて、動かさずに置く。
// &run=7.5 で、その速さでその場を走らせ、t 秒走ったところで止める（走りの足の運びを確かめる）
function runStrikerDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    setEn(enemies[0]);
    rebuildEnemy('striker');
    en.alive = true;
    resetStriker();
    const phase = params.get('striker');
    const yaw = Number(params.get('yaw') ?? 0) * DEG;
    const at = en.root.position;
    position.set(at.x, 0, at.z + 3.5); // 敵はこちらを向くので、プレイヤーは正面に置き、カメラだけを回り込ませる
    const step = 1 / 120;
    for (let i = 0; i < 30; i++)
        update(step);
    if (phase === 'windup' || phase === 'slash')
        en.strikePhase = phase;
    const run = Number(params.get('run') ?? 0);
    en.strikeT = Number(params.get('t') ?? 0.3);
    en.vel.set(0, 0, run);
    for (let i = 0; i < (run ? en.strikeT / step : 60); i++)
        update(step);
    setViewModelsVisible(false);
    camera.position.set(at.x + Math.sin(yaw) * 3.2, 1.3, at.z + Math.cos(yaw) * 3.2);
    camera.lookAt(at.x, 1.0, at.z);
    renderer.setAnimationLoop(() => composer.render(0));
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
// 弓の構えを確かめる: ?bow（弓を構えて立った姿で止める）。&t=0.3 でその時間だけ引いて止め、
// さらに &fly=0.1 で離して、射ってからその時間で止める。&volley を付けるとホイールの 3 本射ち、&ricochet を付けると右クリックの跳弾矢で引く
function runBowDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'bow';
    controls.isLocked = true;
    const step = 1 / 120;
    position.set(en.root.position.x, 0, en.root.position.z + 9); // 照準が敵の胸を指す所
    for (let i = 0; i < 60; i++)
        update(step);
    const hold = (on) => {
        if (params.has('volley'))
            bowState.volleyHeld = on;
        else if (params.has('ricochet'))
            game.throwHeld = on;
        else
            game.attackHeld = on;
    };
    if (params.has('t')) {
        hold(true);
        for (let t = 0; t < Number(params.get('t')); t += step)
            update(step);
    }
    if (params.has('fly')) {
        hold(false);
        for (let t = 0; t < Number(params.get('fly')); t += step)
            update(step);
    }
    controls.isLocked = false;
    renderer.setAnimationLoop(() => composer.render(0));
}
// 鎖鎌の取り出しを確かめる: ?sickleDraw&t=0.2（クナイから持ち替えて、取り出し始めてからその時間で止める）
function runSickleDrawDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'kunai';
    const step = 1 / 120;
    for (let i = 0; i < 30; i++)
        update(step);
    game.wantWeapon = 'sickle';
    while (sickleState.drawT === Infinity)
        update(step);
    const tEnd = Number(params.get('t') ?? 0.2);
    while (sickleState.drawT + step <= tEnd)
        update(step);
    updateSpeedFx(0);
    renderer.setAnimationLoop(() => {
        applyCameraOffset();
        composer.render(0);
        camera.quaternion.copy(savedQuat);
    });
}
// 弓の取り出しを確かめる: ?bowEquip&t=0.2（クナイから持ち替えて、取り出し始めてからその時間で止める）
function runBowEquipDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'kunai';
    const step = 1 / 120;
    for (let i = 0; i < 30; i++)
        update(step);
    game.wantWeapon = 'bow';
    while (bowState.equipT === Infinity)
        update(step);
    const tEnd = Number(params.get('t') ?? 0.2);
    while (bowState.equipT + step <= tEnd)
        update(step);
    updateSpeedFx(0);
    renderer.setAnimationLoop(() => {
        applyCameraOffset();
        composer.render(0);
        camera.quaternion.copy(savedQuat);
    });
}
// バットの取り出しを確かめる: ?batEquip&t=0.2（クナイから持ち替えて、取り出し始めてからその時間で止める）
function runBatEquipDebug(params) {
    overlay.classList.add('hidden');
    document.body.classList.remove('on-title');
    game.wantWeapon = game.shownWeapon = 'kunai';
    const step = 1 / 120;
    for (let i = 0; i < 30; i++)
        update(step);
    game.wantWeapon = 'bat';
    while (batState.equipT === Infinity)
        update(step);
    const tEnd = Number(params.get('t') ?? 0.2);
    while (batState.equipT + step <= tEnd)
        update(step);
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
    viewModel.visible = leftViewModel.visible = gunViewModel.visible = swordViewModel.visible = sickleViewModel.visible = axeViewModel.visible = bowViewModel.visible = batViewModel.visible = v;
}
// 床に広がる輪: 円くくり抜かれて広がるグリッドの縁に、細い線を引いて輪郭をはっきりさせる。
// その内側を、少し遅れたこだまの輪が 2 本、細く薄く追いかける
const RISE_RING_MAX = 160; // ここまで広がったら消す
const RISE_RING_ECHO = 0.07; // こだまの輪の遅れ (s)
const riseRingMat = new THREE.ShaderMaterial({
    uniforms: { uRadius: { value: new THREE.Vector3() }, uRiseOrigin: riseOrigin, uColor: { value: new THREE.Color(0x333333) } },
    vertexShader: /* glsl */ `
    varying vec2 vPos;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vPos = w.xz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
    fragmentShader: /* glsl */ `
    uniform vec3 uRadius;
    uniform vec2 uRiseOrigin;
    uniform vec3 uColor;
    varying vec2 vPos;
    float ring(float d, float r, float thin) {
      if (r <= 0.0) return 0.0;
      float w = (0.12 + r * 0.012) * thin; // 遠くへ行くほど速いので、線も太らせる
      return (1.0 - smoothstep(0.0, w, abs(d - r))) * (1.0 - smoothstep(30.0, ${RISE_RING_MAX.toFixed(1)}, r));
    }
    void main() {
      float d = distance(vPos, uRiseOrigin);
      float a = max(ring(d, uRadius.x, 1.0) * 0.5, max(ring(d, uRadius.y, 0.6) * 0.28, ring(d, uRadius.z, 0.4) * 0.15));
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
const stageProps = []; // 入ったステージに置いた、ボスの機体
function applyStageRise(t) {
    let done = true;
    // 輪の半径は、その時刻に影が落ち始める距離（遅れ = RISE_WAVE * √距離 の逆）
    const ringAt = (tt) => (tt > 0 ? (tt / RISE_WAVE) ** 2 : 0);
    const ringR = ringAt(t);
    riseRing.visible = t > 0 && ringAt(t - 2 * RISE_RING_ECHO) < RISE_RING_MAX;
    riseRingMat.uniforms.uRadius.value.set(ringR, ringAt(t - RISE_RING_ECHO), ringAt(t - 2 * RISE_RING_ECHO));
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
            boxMatrixFor(b, h, riseMatrix);
        r.mesh.setMatrixAt(r.index, riseMatrix);
        const top = b.h + (b.slope?.rise ?? 0); // 傾けた箱は、高い端の上面まで埋める
        const fill = f >= 1 ? RISE_FILL_DONE : f > 0 ? y0 + (top - y0) * easeInOutCubic(f) : -1;
        r.mesh.geometry.getAttribute('aFill').setX(r.index, fill);
        // 埋めきった瞬間から、縁を太く濃く引いて細く戻す
        const since = s - RISE_BASE_TIME - r.dur * RISE_FILL_START - r.fillDur;
        const pulse = since >= 0 && since < RISE_PULSE_TIME ? (1 - since / RISE_PULSE_TIME) ** 2 : 0;
        if (pulse > 0)
            done = false;
        r.mesh.geometry.getAttribute('aPulse').setX(r.index, pulse);
        // 高い柱が組み上がった瞬間に、ずしりと揺らして、足もとから波紋を広げる
        if (!r.slammed && f >= 1 && b.h >= RISE_SLAM_HEIGHT && t !== Infinity) {
            r.slammed = true;
            slams++;
            spawnRiseRipple(b, t);
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
        mesh.geometry.getAttribute('aPulse').needsUpdate = true;
    }
    if (updateRiseRipples(t))
        done = false;
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
    // ボスの機体は、ステージの箱が組み上がりきってから現れる
    for (const prop of stageProps)
        prop.visible = t >= arenaRiseEnd;
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
const STAGE_BUILDERS = { station: buildStation, warehouse: buildWarehouse, parking: buildParking, lift: buildLift, mall: buildMall, ruins: buildRuins };
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
// local なら格子を面に付けたまま動かせる（動く物に使う）
const stageMaterial = (b, local = false) => b.look === 'plain' ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : gridMaterial(stageLooks[b.look], b.gridOrigin, local);
const stageGeo = (b) => (b.shape === 'octagonZ' ? octagonZGeo : b.shape === 'octagonX' ? octagonXGeo : boxGeo);
// 線の引き方と格子の起点、形が同じ箱ごとに分ける（1 つのメッシュにまとめる単位）
function groupStageBoxes(list) {
    const groups = new Map();
    for (const b of list) {
        const o = b.gridOrigin;
        const key = `${b.look}|${o ? `${o.x},${o.y},${o.z}` : ''}|${b.shape ?? ''}`;
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
    if (stageRoot) {
        scene.remove(stageRoot);
        stageRoot = null;
    }
    scene.remove(arenaRoot);
    blocks.length = 0;
    ramps.length = 0;
    clearMovers();
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
    stageLead = layout.lead;
    stageGuest = layout.guest;
    stageMix = layout.mix;
    const hasEnemies = enemySpawns.length > 0;
    // リフトでは難易度にかかわらず同じ数の敵を出す。
    const enemyCount = layout.shaft ? STAGE_ENEMY_COUNT.normal : STAGE_ENEMY_COUNT[DIFFICULTIES[difficultyIndex]];
    for (let i = 0; hasEnemies && !layout.boss && i < enemyCount; i++) {
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
    if (hasEnemies || layout.boss)
        beginStageRun(!!layout.boss);
    // 見た目の箱は、線の引き方と格子の起点ごとに 1 つのメッシュにまとめる。遠景は操作を返すのを待たないので別にする
    for (const [list, inArena] of [[[...layout.boxes, ...layout.decor], true], [layout.scenery, false]]) {
        for (const group of groupStageBoxes(list))
            addBoxes(group, stageMaterial(group[0]), (b) => b.light, root, inArena, stageGeo(group[0]));
    }
    for (const group of groupStageBoxes((layout.ramps ?? []).filter((r) => !r.hidden)))
        addRamps(group, stageMaterial(group[0]), root);
    blocks.push(...mergeBoxes([...layout.boxes, ...layout.colliders]));
    ramps.push(...(layout.ramps ?? []));
    // 動く物: 部品ごとに親を分けて、親ごと動かす
    for (const m of layout.movers ?? []) {
        const roots = m.parts.map((p) => {
            const partRoot = new THREE.Group();
            root.add(partRoot);
            for (const group of groupStageBoxes([...p.boxes, ...p.decor]))
                addBoxes(group, stageMaterial(group[0], true), (b) => b.light, partRoot, true, stageGeo(group[0]));
            return partRoot;
        });
        addMover(m, roots);
    }
    // 昇り続けるリフトのシャフト: 区切りを上下に並べて 1 つの親にまとめ、親ごと下へ流す。地面は消す
    const shaft = layout.shaft;
    let shaftRoot = null;
    if (shaft) {
        shaftRoot = new THREE.Group();
        root.add(shaftRoot);
        for (const [list, shadow] of [[shaft.walls, false], [shaft.tile, true]]) {
            for (const group of groupStageBoxes(shaftCopies(list, shaft.period))) {
                const mesh = addBoxes(group, stageMaterial(group[0], true), (b) => b.light, shaftRoot, false, stageGeo(group[0]));
                mesh.castShadow = shadow;
            }
        }
    }
    setShaft(shaft ?? null, shaftRoot);
    setLiftTraps(shaft ?? null, DIFFICULTIES[difficultyIndex], bounds, root);
    showGround(!shaft);
    // リフトの床の外は底なし（倒した敵の破片は落ちていく）。床の板は動ける範囲より少し広い
    groundArea.value = shaft ? { minX: bounds.minX - 0.4, maxX: bounds.maxX + 0.4, minZ: bounds.minZ - 0.4, maxZ: bounds.maxZ + 0.4 } : null;
    for (const line of addStageLines(layout, root))
        riseLines.push(line);
    stageProps.length = 0;
    clearBoss();
    if (layout.boss) {
        // ボスが突き破る外壁: 壊れる前と後を、ほかの箱とは別のメッシュにして、突き破った瞬間に入れ替える
        const wall = { intact: new THREE.Group(), broken: new THREE.Group() };
        const breach = layout.boss.breach;
        for (const [list, g] of [[breach?.intact ?? [], wall.intact], [breach?.broken ?? [], wall.broken]]) {
            root.add(g);
            for (const group of groupStageBoxes(list))
                addBoxes(group, stageMaterial(group[0]), (b) => b.light, g, true, stageGeo(group[0]));
        }
        wall.broken.visible = false;
        stageProps.push(spawnBoss(root, layout.boss, bounds, wall, multiplayerRun ? multiplayerPartySize() : 1));
    }
    // 前後の端（線路が続いていく先）に、近づくと浮かぶ境界の壁を立てる
    const width = bounds.maxX - bounds.minX;
    for (const z of [bounds.minZ, bounds.maxZ]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, BORDER_HEIGHT), borderMat);
        wall.position.set((bounds.minX + bounds.maxX) / 2, BORDER_HEIGHT / 2, z);
        root.add(wall);
    }
    // ストライカーの道のりは、床と出現位置の高さの分を入る前（暗転の間）に調べておく（遊んでいる途中で調べると引っかかる）
    resetStrikerNav(stageLead === 'striker' || stageGuest === 'striker' || DIFFICULTIES.some((d) => stageMix?.[d].striker) ? [...new Set([0, ...enemySpawns.map((s) => s.y)])] : []);
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
    // 動く物は動き出す前の位置に置いておく
    const movers = (layout.movers ?? []).flatMap((m) => m.parts.flatMap((p) => [...p.boxes, ...p.decor]));
    const shaft = layout.shaft ? shaftCopies([...layout.shaft.walls, ...layout.shaft.tile], layout.shaft.period) : [];
    for (const group of groupStageBoxes([...layout.boxes, ...layout.decor, ...layout.scenery, ...movers, ...shaft])) {
        const mesh = new THREE.InstancedMesh(stageGeo(group[0]), stageMaterial(group[0]), group.length);
        group.forEach((b, i) => {
            mesh.setMatrixAt(i, boxMatrixFor(b, b.h - (b.y0 ?? 0), boxMatrix));
            mesh.setColorAt(i, boxColor.setHSL(0, 0, b.light));
        });
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
    }
    for (const group of groupStageBoxes((layout.ramps ?? []).filter((r) => !r.hidden))) {
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
                showGround(!layout.shaft);
            }
            else {
                riseOrigin.value.copy(TITLE_RISE_ORIGIN);
                showGround(true);
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
        game.weaponLocked = true;
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
    updateBossEntrance(dt);
    setLetterbox(bossEntranceView.bars);
    // 帯が抜けるのに合わせて、少し広げた視野から元へ縮めて像を結ぶ（ボスの登場では、その演出の視野を足す）
    const k = THREE.MathUtils.clamp((introT - INTRO_REVEAL_TIME) / INTRO_APPEAR_TIME, 0, 1);
    camera.fov = BASE_FOV + (1 - easeOutQuart(k)) * INTRO_FOV_BONUS + bossEntranceView.fov;
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
        if (stageTitle.update(titleT))
            finishStageIntro();
    }
    else if (pendingStage) {
        // ステージでは、組み上がりきった瞬間にタイトルを叩きつけてから操作を返す。
        // 叩きつけの少し前から高まる音を鳴らし始め、鳴り終わる瞬間に叩きつける
        const untilAppear = INTRO_REVEAL_TIME + INTRO_APPEAR_TIME - introT;
        const untilBuilt = riseT < 0 ? 0 : arenaRiseEnd - (riseT - INTRO_RISE_DELAY);
        // ボスのいるステージでは、組み上がりきってからボスが降ってくる。タイトルはボスが砲を向けた瞬間に叩きつける
        if (bossEntranceLeft() === Infinity && k >= 1 && arenaDone)
            startBossEntrance();
        if (titleRiserT < 0 && Math.max(untilAppear, untilBuilt, bossEntranceLeft()) <= sfx.TITLE_RISER_TIME) {
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
    endBossEntrance();
    setLetterbox(0);
    titleT = -1;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    // 武器を画面の下から構える
    game.holster = 1;
    // 演出の間に押されたキーは捨てる（押しっぱなしの移動はそのまま効かせる）
    pressed.clear();
    game.attackPressed = false;
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
const debugBat = BAT_ATTACKS[debugParams.get('bat') ?? ''];
const debugSpear = SPEAR_ATTACKS[debugParams.get('spear') ?? ''];
if (debugAttack) {
    runAttackDebug(debugAttack, debugParams);
}
else if (debugSword) {
    runSwordDebug(debugSword, debugParams);
}
else if (debugAxe) {
    runAxeDebug(debugAxe, debugParams);
}
else if (debugBat) {
    runBatDebug(debugBat, debugParams);
}
else if (debugSpear) {
    runSpearDebug(debugSpear, debugParams);
}
else if ((debugParams.get('stage') ?? '') in STAGE_BUILDERS) {
    runStageDebug(debugParams);
}
else if (debugParams.has('striker')) {
    runStrikerDebug(debugParams);
}
else if (debugParams.has('sniper')) {
    runSniperDebug(debugParams);
}
else if (debugParams.has('focus')) {
    runFocusDebug(debugParams);
}
else if (debugParams.has('bow')) {
    runBowDebug(debugParams);
}
else if (debugParams.has('grapple')) {
    runGrappleDebug(debugParams);
}
else if (debugParams.has('bowEquip')) {
    runBowEquipDebug(debugParams);
}
else if (debugParams.has('batEquip')) {
    runBatEquipDebug(debugParams);
}
else if (debugParams.has('sickleDraw')) {
    runSickleDrawDebug(debugParams);
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
        endPerfFrame(rawFrame); // 前のフレームの分を数えてから、このフレームの数え直しを始める
        beginPerfFrame();
        const realFrame = Math.min(rawFrame, 0.05);
        updateMultiplayer(realFrame);
        if (multiplayerSessionLost)
            return;
        // パッドの視点は「倒している時間 × 速さ」で回すので、重いフレームで時間を切ると回り足りずに引っかかる。
        // 視点だけは実際にかかった時間で回す（タブを離れていたときの大きな飛びだけは抑える）
        updatePad(Math.min(rawFrame, 0.25));
        // ひとり用の一時停止とタイトルは止める。マルチプレイのメニュー中は入力だけ止め、世界を進める
        if (!controls.isLocked) {
            pressed.clear();
            game.attackPressed = false;
            const runningBehindMenu = multiplayerRun && !multiplayerSessionLost && (overlay.classList.contains('pause') || overlay.classList.contains('leaving')) && !overlay.classList.contains('over') && !overlay.classList.contains('result');
            if (!runningBehindMenu) {
                if (updateStagePreview(realFrame) || menuRedraw) {
                    menuRedraw = false;
                    applyCameraOffset();
                    composer.render(0);
                    camera.quaternion.copy(savedQuat);
                }
                return;
            }
        }
        updateStageRise(realFrame);
        // 訓練場へ入る演出の間は、ゲームの時間を進めない（見回すことだけできる）
        if (introT >= 0) {
            updateStageIntro(realFrame);
            updateHitFx(realFrame); // ボスの登場で出す火花や床のひび
            applyCameraOffset();
            renderTitleMask();
            composer.render(realFrame);
            camera.quaternion.copy(savedQuat);
            return;
        }
        updateStageRun(realFrame);
        updatePlayerDown(realFrame);
        // 倒した直後とパリィの後、倒れた後のスローは、演出も含めて全体にかける
        const killSlow = killSlowFactor(realFrame);
        const parrySlow = parrySlowFactor(realFrame);
        const downSlow = downSlowFactor();
        sharedBossBreakTime += realFrame;
        const sharedElapsed = Math.max(0, sharedBossBreakTime - KILL_HIT_STOP);
        const sharedRelease = THREE.MathUtils.clamp((sharedElapsed - KILL_SLOW_HOLD) / KILL_SLOW_RELEASE, 0, 1);
        const sharedSlow = THREE.MathUtils.lerp(KILL_SLOW_SCALE, 1, sharedRelease * sharedRelease);
        const slow = multiplayerRun ? sharedSlow : killSlow * parrySlow * downSlow;
        const dt = realFrame * slow;
        if (multiplayerRun)
            game.hitStop = 0; // 個人のヒットストップは共有世界を止めない
        if (multiplayerRun ? sharedBossBreakTime < KILL_HIT_STOP : game.hitStop > 0) {
            // ヒットストップ中は全体を止める（入力は溜めておき、揺れだけ続ける）
            if (!multiplayerRun)
                game.hitStop -= realFrame;
            cameraFx.shakeTime += realFrame;
        }
        else {
            game.realDt = realFrame;
            update(dt * (multiplayerRun ? 1 : game.timeScale));
        }
        updateDummyShake();
        updateHitFx(dt); // 光の演出はヒットストップ中も動かして、止まった画に勢いを残す
        updateSpeedFx(dt);
        updateHpHud(realFrame);
        updateBossHud();
        updateScoreHud(realFrame);
        updateHudSway(realFrame);
        sfx.updateAudio({
            speed: controls.isLocked ? Math.hypot(velocity.x, velocity.z) : 0,
            airborne: !player.onGround && !player.wallRunning,
            sliding: player.sliding && controls.isLocked,
            focusing: swordState.focusing,
            timeScale: (multiplayerRun ? 1 : game.timeScale) * slow * kunaiState.worldSlow, // 世界だけのスローでも音はこもらせる
        });
        applyCameraOffset();
        updateFinishMark();
        placeDeadEyeMarks();
        prepareReplayFrame(realFrame, !!stageRun && (stageRun.running || stageRun.clearedT >= 0));
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

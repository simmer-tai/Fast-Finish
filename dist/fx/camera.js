import * as THREE from 'three';
import * as sfx from '../audio.js?v=e316db84';
import { playRing, playSwish } from '../audio.js?v=e316db84';
import { DEG } from '../math.js?v=e316db84';
import { camera } from '../core.js?v=e316db84';
import { DASH_SLASH, GROUND_COMBO } from '../weapons/kunaiAttacks.js?v=e316db84';
import { SWORD_COMBO, SWORD_THRUST } from '../weapons/swordAttacks.js?v=e316db84';
import { AXE_COMBO, AXE_DRIVE, AXE_LAUNCH, AXE_RUSH } from '../weapons/axeAttacks.js?v=e316db84';
import { axeState, startAxeAttack } from '../weapons/axeCombat.js?v=e316db84';
import { CHARGE_ZOOM, FOCUS_ZOOM, startSwordAttack, startSwordTwirl, swordReady, swordState, } from '../weapons/swordCombat.js?v=e316db84';
import { DASH_TWIRL_TIME, DEADEYE_ZOOM, gunReady, gunState, startTwirl } from '../weapons/handgunCombat.js?v=e316db84';
import { SICKLE_AIR_COMBO, SICKLE_COMBO, SICKLE_DASH, sickleState, startSickleMove, twirlSickles, } from '../weapons/sickleCombat.js?v=e316db84';
import { kunaiReady, kunaiState, startAttack } from '../weapons/kunaiCombat.js?v=e316db84';
import { BOW_ZOOM, bowState } from '../weapons/bowCombat.js?v=e316db84';
import { SCOPE_ZOOM, scopeView } from '../weapons/rifleCombat.js?v=e316db84';
import { handCam } from './handCam.js?v=e316db84';
import { player, position, right, velocity, wallNormal } from '../player/state.js?v=e316db84';
import { BASE_FOV, EYE_HEIGHT, FOV_SPEED_MAX, LOW_EYE_HEIGHT, MAX_FOV_BONUS, SLIDE_EYE_HEIGHT, SPRINT_SPEED, WALK_SPEED, WALLRUN_ROLL, } from '../player/config.js?v=e316db84';
import { moveToward } from '../player/movement.js?v=e316db84';
import { DOWN_EYE, DOWN_PITCH, DOWN_ROLL, downFall } from '../player/down.js?v=e316db84';
import { game, kick, kickVel } from '../game/state.js?v=e316db84';
import { rumble } from '../player/rumble.js?v=e316db84';
import { shipSway } from '../world/sea.js?v=e316db84';
// ---- カメラ演出 ----
// 本体からも読み書きする値
export const cameraFx = {
    trauma: 0, // 画面揺れの強さ (0〜1)
    realDecay: false, // 揺れをスローに関わらず実時間で収める（ヘッドショットの深いスローで揺れが残り続けないように）
    shakeTime: 0,
    landDip: 0, // 着地で視点が沈む量（負の値）
    roll: 0,
    inspect: new THREE.Vector3(), // 武器を眺めている間の視線のずれ (rad): x = 縦, y = 横, z = 傾き（weapons/viewModelMotion.ts）
    inspectZoom: 0, // 武器を眺めている間に視野を狭める量（度）
};
// 高いところからの着地の揺れ。trauma より短く強く、画面と手元をまとめて揺らす
export const LAND_SHAKE_TIME = 0.16; // 揺れが収まるまでの時間 (秒)
let landShake = 0; // 揺れの強さ (0〜1)
let landShakeT = 1; // 着地からの経過の割合 (0〜1)。1 で揺れなし
export function addTrauma(amount) {
    cameraFx.trauma = Math.min(1, cameraFx.trauma + amount);
}
export function onDash() {
    rumble('dash');
    addTrauma(0.2);
    sfx.playDash();
    game.fovKick = 8;
    game.sinceDash = 0;
    upgradeAttackOnDash();
    // 振っていなければ、右手のクナイを輪に掛けた指でくるりと一周回す
    if (kunaiReady() && !kunaiState.attack) {
        kunaiState.dashSpinTime = 0;
        kunaiState.firedDashSpinGrip = false;
        playRing();
    }
    // ハンドガンは、トリガーに掛けた指を軸に縦にくるりと一周回す（装填後より速く）
    if (gunReady() && !gunState.gunReloading && gunState.twirlT < 0 && gunState.drawT < 0)
        startTwirl(DASH_TWIRL_TIME);
    // 剣は、握った手を軸に縦にくるくると 2 回転させる
    if (swordReady() && !swordState.swordAttack && swordState.swordHold < 0)
        startSwordTwirl();
    twirlSickles();
    // 斧は、柄を軸にくるりと一回転させる
    if (game.shownWeapon === 'axe' && game.wantWeapon === 'axe' && game.holster === 0 && !axeState.axeAttack) {
        axeState.axeSpinTime = 0;
        playSwish({ at: 0, dur: 0.22, f0: 380, f1: 1200, gain: 0.14 }, 'axe');
    }
}
// ダッシュの直前に振り始めた普段の攻撃は、ダッシュ技に差し替える（ほぼ同時押しでもダッシュ技が出るように）
export const DASH_ATTACK_GRACE = 0.12;
export function upgradeAttackOnDash() {
    if (player.sliding)
        return;
    // クナイ
    if (kunaiState.attack && kunaiState.attackTime < DASH_ATTACK_GRACE && !kunaiState.firedImpact) {
        const i = GROUND_COMBO.indexOf(kunaiState.attack);
        if (i >= 0) {
            kunaiState.comboStep = i;
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
    // 斧: 普段の攻撃は突進振り下ろし、打ち上げは突き飛ばしへ（突き飛ばしをダッシュ＋ZL で出すパッドだけ）
    if (axeState.axeAttack && axeState.axeTime < DASH_ATTACK_GRACE && !axeState.axeFiredImpact && !player.wallRunning) {
        const i = AXE_COMBO.indexOf(axeState.axeAttack);
        if (i >= 0 && (player.onGround || !axeState.axeRushAirUsed)) {
            axeState.axeComboStep = i;
            startAxeAttack(AXE_RUSH);
        }
        else if (axeState.axeAttack === AXE_LAUNCH && game.usingPad && axeState.axeSlamRecover <= 0) {
            startAxeAttack(AXE_DRIVE);
        }
    }
}
export function onSlideStart() {
    addTrauma(0.15);
    sfx.playSlideStart();
    // 鎖鎌は、両手の鎌を前回りにくるりと回しながら低い構えへ移る
    twirlSickles();
}
export function onMantleStart() {
    addTrauma(0.1);
    sfx.playMantleStart();
}
export function onMantleEnd() {
    sfx.playMantleEnd();
    // 縁に体を乗せたときに軽く沈み、うなずくように視線を下げる
    game.landDipVel = Math.min(game.landDipVel, -1.5);
    kickVel.x -= 1.2 * DEG * 22;
}
export function onWallRunStart() {
    addTrauma(0.08);
    sfx.playWallRunStart();
}
export function onWallJump() {
    addTrauma(0.1);
    sfx.playWallJump();
    game.fovKick = Math.max(game.fovKick, 4);
}
export function onLand(impact) {
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
export function landShakeAmount() {
    return landShakeT >= 1 ? 0 : landShake * (1 - landShakeT) ** 2;
}
// スコープの倍率は、画面の幅（視野の tan）を割って掛ける。前のフレームで掛けた倍率を外してから、普段の視野を寄せる
let scopeMul = 1;
const zoomFov = (fov, mul) => 2 * Math.atan(Math.tan((fov / 2) * DEG) / mul) / DEG;
export function updateCamera(dt) {
    const hSpeed = Math.hypot(velocity.x, velocity.z);
    // 速いほど視野を広げる
    game.fovKick = moveToward(game.fovKick, 0, dt * 30);
    const speedT = THREE.MathUtils.clamp((hSpeed - WALK_SPEED) / (FOV_SPEED_MAX - WALK_SPEED), 0, 1);
    // 居合の構えの間と、弓を引いている間はズームする（スロー中でも実時間の速さで寄せる）
    const targetFov = BASE_FOV + speedT * MAX_FOV_BONUS + game.fovKick - swordState.focusZoom * FOCUS_ZOOM - swordState.swordChargeBlend * CHARGE_ZOOM
        - gunState.deadEyeBlend * DEADEYE_ZOOM - bowState.draw * BOW_ZOOM * (1 - 0.6 * bowState.sidePose) // 3 本射ちはあまり寄せない
        - cameraFx.inspectZoom;
    let fov = zoomFov(camera.fov, 1 / scopeMul);
    fov += (targetFov - fov) * Math.min(1, Math.max(dt, game.realDt) * 8);
    scopeMul = 1 + (SCOPE_ZOOM - 1) * scopeView();
    camera.fov = zoomFov(fov, scopeMul);
    camera.updateProjectionMatrix();
    // 着地の沈み込み（ばねで戻す）
    game.landDipVel += (-150 * cameraFx.landDip - 18 * game.landDipVel) * dt;
    cameraFx.landDip = Math.max(-0.5, cameraFx.landDip + game.landDipVel * dt);
    // スライディングで視点を下げる。車の下などをくぐるときはさらに下げる
    const eyeTarget = player.lowEye ? LOW_EYE_HEIGHT : player.sliding ? SLIDE_EYE_HEIGHT : EYE_HEIGHT;
    player.eyeHeight += (eyeTarget - player.eyeHeight) * Math.min(1, dt * (player.lowEye ? 20 : 12));
    // 横移動とスライディングでカメラを傾ける。壁走り中は壁と反対側へ傾ける
    const lateral = (velocity.x * right.x + velocity.z * right.z) / SPRINT_SPEED;
    const wallRoll = player.wallRunning ? -(wallNormal.x * right.x + wallNormal.z * right.z) * WALLRUN_ROLL : 0;
    const targetRoll = -lateral * 0.025 + (player.sliding ? 0.07 : 0) + wallRoll;
    cameraFx.roll += (targetRoll - cameraFx.roll) * Math.min(1, dt * 8);
    cameraFx.trauma = Math.max(0, cameraFx.trauma - (cameraFx.realDecay ? Math.max(dt, game.realDt) : dt) * 1.5);
    cameraFx.shakeTime += dt;
    landShakeT = Math.min(1, landShakeT + dt / LAND_SHAKE_TIME);
    const landJolt = landShakeAmount() * 0.06 * Math.sin(cameraFx.shakeTime * 91.7 + 3.3);
    // 倒れたら目の高さを床近くまで崩す
    const eye = THREE.MathUtils.lerp(player.eyeHeight, DOWN_EYE, downFall());
    camera.position.set(position.x, position.y + eye + cameraFx.landDip + landJolt, position.z);
}
// 描画の直前にだけ揺れと傾きを足す（PointerLockControls の視点を壊さないよう、描画後に戻す）
export const savedQuat = new THREE.Quaternion();
export const shakeEuler = new THREE.Euler();
export const shakeQuat = new THREE.Quaternion();
export function applyCameraOffset() {
    savedQuat.copy(camera.quaternion);
    // スコープの倍率で揺れも大きく見えるので、覗いている間は倍率で割り、見た目の揺れを覗いていないときと揃える
    const s = cameraFx.trauma * cameraFx.trauma / scopeMul;
    const t = cameraFx.shakeTime;
    const ls = landShakeAmount();
    shakeEuler.set(s * 0.04 * Math.sin(t * 47.3 + 1.3) + kick.x - ls * 0.09 * Math.abs(Math.sin(t * 97.1 + 0.4)), s * 0.04 * Math.sin(t * 53.1 + 4.1) + kick.y + ls * 0.05 * Math.sin(t * 89.3 + 2.2), cameraFx.roll + s * 0.05 * Math.sin(t * 41.7 + 2.7) + kick.z + ls * 0.07 * Math.sin(t * 103.7 + 5.1) + handCam.z);
    shakeEuler.x += handCam.x + DOWN_PITCH * downFall() + cameraFx.inspect.x;
    shakeEuler.y += handCam.y + cameraFx.inspect.y;
    shakeEuler.z += DOWN_ROLL * downFall() + cameraFx.inspect.z;
    camera.quaternion.multiply(shakeQuat.setFromEuler(shakeEuler));
    // 船の揺れ（SHIP）: 視点のまわりではなく、世界の軸のまわりに傾ける
    camera.quaternion.premultiply(shipSway.view);
}
// applyCameraOffset で足した揺れと傾きを戻す
export function restoreCameraOffset() {
    camera.quaternion.copy(savedQuat);
}
// 攻撃の反動（kick）をばねで元へ戻す
export const kickTmp = new THREE.Vector3();
export function updateKick(dt) {
    kickTmp.copy(kick).multiplyScalar(-220).addScaledVector(kickVel, -20);
    kickVel.addScaledVector(kickTmp, dt);
    kick.addScaledVector(kickVel, dt);
}
export function resetCameraEffects() {
    landShake = 0;
    landShakeT = 1;
    scopeMul = 1;
}

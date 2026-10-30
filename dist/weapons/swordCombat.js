import * as THREE from 'three';
import * as sfx from '../audio.js';
import { playGrip, playRing, playSwish } from '../audio.js';
import { easeInOutCubic, easeOutCubic } from '../ease.js';
import { DEG, catmullRom } from '../math.js';
import { camera, controls } from '../core.js';
import { SWORD_BLADE_BASE_Y, SWORD_STAND_QUAT } from './sword.js';
import { CHARGE_POS, CHARGE_TIP, SWORD_BUFFER, SWORD_CHARGE_SLASH, SWORD_COMBO, SWORD_COMBO_RESET, SWORD_HIT_ANGLE, SWORD_ISSEN, SWORD_REACH, SWORD_SWEEP, SWORD_THRUST, SWORD_TIP, } from './swordAttacks.js';
import { sword, swordRest, swordRestQuat, swordSpin } from './viewModels.js';
import { onSkinChange, skinFx, skinOf } from './skins.js';
import { hitWithArcs } from '../fx/arcs.js';
import { Ribbon, SWORD_RIBBON, TRAIL_STEP, makeRibbonMaterial, tintRibbon } from '../fx/ribbons.js';
import { en, enemies, hitPoint, setEn } from '../enemy/state.js';
import { castHit, castThrow } from '../world/raycast.js';
import { boss, bossPartOpen, bossTargetAt, bossTargetCount, bossTargetPart } from '../enemy/boss.js';
import { forward, lookEuler, player, position, velocity } from '../player/state.js';
import { endWallRun } from '../player/movement.js';
import { DASH_ATTACK_WINDOW, DEADEYE_MAX, SWING_SAMPLE, game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
import { tryWallHit } from './wallHit.js';
import { startMeleePull, stopMeleePull } from './meleePull.js';
// ---- 剣の攻撃 ----
// 振り・溜め斬り・居合（構えと突進）。技の定義は swordAttacks.ts
// 本体からも読み書きする値
export const swordState = {
    swordAttack: null,
    swordTime: 0,
    swordPressed: false,
    swordAttackWeight: 0,
    swordComboStep: 0,
    swordFiredImpact: false,
    swordHold: -1, // 左クリックを押してからの時間。負なら押していない（または普段の攻撃を始めた）
    swordChargeBlend: 0, // 0 = 普段の構え, 1 = 溜めの構え
    chargeDashTime: 0,
    focusing: false,
    focusCharge: 0, // 居合のゲージ (0〜1)。1 で構えられる
    focusEmptyFlash: 0, // 溜まっていないのに構えようとしたとき、ゲージを震わせる残り時間
    focusPressed: false, // 右クリックを押した瞬間（居合の構えを始める）
    focusBlend: 0, // 0 = 普段の構え, 1 = 居合の構え（実時間で動かす）
    focusZoom: 0, // 構えている間のズームの効き (0〜1)。突進を始めたら一気に戻して、視野が開く勢いにする
    rushTime: -1, // 突進を始めてからの時間。負なら突進していない
    rushEnemy: null, // 突進している先の敵
};
// ---- 近接攻撃（剣） ----
let swordQueued = false;
let swordComboTimer = 0;
let swordFiredSwishes = 0;
let swordFiredGrips = 0;
let swordFiredRings = 0;
// 振りの風切り音。スキンに音があればそちら（爪は光る刃のうなりを重ねる）
const swordSwish = () => skinOf('sword').swish ?? 'sword';
let swordFiredLunge = false;
export const SWORD_ATTACK_SPEED = 1.2; // 振りを進める速さの倍率（技の定義の時間をまとめて縮める）
// 踏み込みで照準の近くの敵へ寄る（meleePull.ts）。速さ × 時間が寄れる距離の上限
export const SWORD_PULL_SPEED = 12; // (m/s)
export const SWORD_PULL_TIME = 0.18; // (s)
// ダッシュしたときに、握った手を軸に刀を縦に 2 回転させる
export const SWORD_TWIRL_TIME = 0.5;
export const SWORD_TWIRL_TURNS = 2;
export const SWORD_TWIRL_GRIP = 0.42;
let swordTwirlTime = Infinity;
let swordTwirlGripped = true;
export const swordReady = () => game.shownWeapon === 'sword' && game.wantWeapon === 'sword' && game.holster === 0;
// ---- 溜め斬り（左クリック長押し） ----
// 押してすぐ離せば普段の攻撃。CHARGE_DELAY より長く押すと刀を引いて溜め始め、溜めきってから離すと
// 視線の方向へ短くダッシュしながら薙ぎ払う。溜めきる前に離したら普段の攻撃になる
export const CHARGE_DELAY = 0.18;
export const CHARGE_TIME = 0.5; // 溜め始めてから溜めきるまで
export const CHARGE_DASH_SPEED = 40;
export const CHARGE_DASH_TIME = 0.13; // 40 m/s × 0.13 s ≈ 5 m
export const CHARGE_DASH_EXIT = 9; // 斬り抜けた後に残す勢い
export const CHARGE_ZOOM = 6; // 溜めている間に狭める視野（度）
export const chargeDashDir = new THREE.Vector3();
export const swordChargePos = new THREE.Vector3();
export const SWORD_CHARGE_QUAT = new THREE.Quaternion();
{
    const tip = new THREE.Vector3(...CHARGE_TIP).normalize();
    // 刃はこれから振る向き（右前）へ向ける
    const edge = new THREE.Vector3(0.7, 0, -0.7).addScaledVector(tip, -new THREE.Vector3(0.7, 0, -0.7).dot(tip)).normalize();
    SWORD_CHARGE_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, tip, new THREE.Vector3().crossVectors(edge, tip)));
}
export const swordCharged = () => swordState.swordHold >= CHARGE_DELAY + CHARGE_TIME;
export function startChargeSlash() {
    // 視線の方向へ踏み込む。地上で下を向いていても地面へ潜らないよう、下向きの分は捨てる
    camera.getWorldDirection(chargeDashDir);
    if (player.onGround && chargeDashDir.y < 0)
        chargeDashDir.y = 0;
    if (chargeDashDir.lengthSq() < 1e-4)
        chargeDashDir.copy(forward);
    chargeDashDir.normalize();
    swordState.chargeDashTime = CHARGE_DASH_TIME;
    player.sliding = false;
    player.dashTime = 0;
    if (player.wallRunning)
        endWallRun();
    if (chargeDashDir.y > 0)
        player.onGround = false;
    game.fovKick += 10;
    hooks.addTrauma(0.25);
    sfx.playRush();
    startSwordAttack(SWORD_CHARGE_SLASH);
}
// update() の移動の中で呼ぶ。ダッシュ中は落ちず、終わったら少しだけ勢いを残す
export function updateChargeDash(dt) {
    swordState.chargeDashTime -= dt;
    const speed = swordState.chargeDashTime > 0 ? CHARGE_DASH_SPEED : CHARGE_DASH_EXIT;
    velocity.copy(chargeDashDir).multiplyScalar(speed);
}
// ---- 居合の構え（右クリックで発動） ----
// 右クリックを押すと一定時間、刀を右上に構えて時間がゆっくり流れる。視線の先の敵をロックオンし、
// 左クリックで敵の目の前まで一気に突進して一閃を浴びせる。
// 構えるには、敵を攻撃して溜まる居合のゲージが満タンになっている必要がある（構えると空になる）
export const FOCUS_TIME_SCALE = 0.2; // 構えている間の時間の速さ
export const FOCUS_MAX = 3; // 構えていられる長さ（実時間の秒）。過ぎると解く
export const FOCUS_DIM = 0.3; // 構えている間に画面を暗く・色を薄くする量
export const FOCUS_ZOOM = 22; // 構えている間に狭める視野（度）
export const LOCK_RANGE = 24;
export const LOCK_ANGLE = 14 * DEG; // 視線からこの角度以内の敵をロックオンする
export const LOCK_HEIGHT = 1.1; // 敵のこの高さを狙う
export const RUSH_SPEED = 90;
export const RUSH_STOP = 1.5; // 敵の中心からこの距離で止まって斬る
export const RUSH_MAX_TIME = 0.6;
export const RUSH_EXIT_SPEED = 5; // 斬りつけた後に残す勢い
export const FOCUS_CHARGE_DAMAGE = 150; // 敵へ与えたダメージがこの量になるとゲージが満タンになる（どの武器でも溜まる）
export const FOCUS_EMPTY_FLASH = 0.35;
let focusTime = 0;
let focusShownReady = false; // 表示に反映済みの「満タン」
let focusLocked = false;
let rushArrived = false;
export const rushTarget = new THREE.Vector3();
export const rushDir = new THREE.Vector3();
export const lockPoint = new THREE.Vector3();
export const lockTo = new THREE.Vector3();
export const lockLook = new THREE.Vector3();
export const lockScreen = new THREE.Vector3();
export const lockonEl = document.getElementById('lockon');
export const focusHud = document.getElementById('focusgauge');
export const focusFill = focusHud.querySelector('.f');
const focusKey = document.getElementById('focuskey');
// 居合の構え: 柄を右肩の前に上げ、刀を立てて少し後ろへ寝かせる。刃は前へ向ける
export const SWORD_FOCUS_POS = new THREE.Vector3(0.08, 0.22, -0.06);
export const SWORD_FOCUS_QUAT = new THREE.Quaternion();
{
    const tip = new THREE.Vector3(0.35, 0.8, 0.5).normalize();
    const edge = new THREE.Vector3(-0.15, 0, -1).addScaledVector(tip, -new THREE.Vector3(-0.15, 0, -1).dot(tip)).normalize();
    SWORD_FOCUS_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, tip, new THREE.Vector3().crossVectors(edge, tip)));
}
let lockEnemy = null; // ロックオンしている敵
let lockBoss = -1; // ロックオンしているボスの目印（-1 = ボスではない）。突進の間も覚えておく
// ロックオンしている所（敵なら胸の高さ、ボスなら目印の今の位置）
function lockedAt(out) {
    if (lockBoss >= 0)
        return bossTargetAt(lockBoss, out);
    setEn(swordState.rushEnemy ?? lockEnemy ?? en);
    return out.set(en.root.position.x, en.root.position.y + LOCK_HEIGHT, en.root.position.z);
}
// 照準からの角度がいちばん小さい敵にロックオンする（間に壁や別の敵がある敵は選ばない）。
// ボスは、今ダメージが通る部位の目印も候補にする（間に機体の別の部品があってもよい）
export function canLockOn() {
    lockEnemy = null;
    lockBoss = -1;
    let bestAngle = LOCK_ANGLE;
    camera.getWorldDirection(lockLook);
    for (const e of enemies) {
        if (!e.alive)
            continue;
        lockTo.set(e.root.position.x, e.root.position.y + LOCK_HEIGHT, e.root.position.z).sub(camera.position);
        const dist = lockTo.length();
        if (dist > LOCK_RANGE || dist < 1e-3)
            continue;
        lockTo.divideScalar(dist);
        const angle = lockLook.angleTo(lockTo);
        if (angle > bestAngle)
            continue;
        e.root.updateMatrixWorld();
        if (!castThrow(camera.position, lockTo, dist + 1) || castHit.enemy !== e)
            continue;
        bestAngle = angle;
        lockEnemy = e;
    }
    for (let i = 0, n = bossTargetCount(); i < n; i++) {
        if (!bossPartOpen(bossTargetPart(i)))
            continue;
        lockTo.copy(bossTargetAt(i, lockAt)).sub(camera.position);
        const dist = lockTo.length();
        if (dist > LOCK_RANGE || dist < 1e-3)
            continue;
        lockTo.divideScalar(dist);
        const angle = lockLook.angleTo(lockTo);
        if (angle > bestAngle)
            continue;
        if (!castThrow(camera.position, lockTo, dist + 1) || !castHit.boss)
            continue;
        bestAngle = angle;
        lockEnemy = null;
        lockBoss = i;
    }
    if (lockEnemy || lockBoss >= 0)
        lockedAt(lockPoint);
    return lockEnemy !== null || lockBoss >= 0;
}
const lockAt = new THREE.Vector3();
let issenBoss = -1; // 突進の後の一閃を当てるボスの目印（-1 = ボスではない）
const issenDir = new THREE.Vector3();
const BOSS_RUSH_STOP = 0.8; // ボスへの突進は、目印のこれだけ手前（RUSH_STOP に足す）で止まる（目印は機体の表面より少し内側）
// 敵へ与えたダメージの分だけゲージを溜める。構えている間と突進中は溜めない
export function chargeFocus(damage) {
    if (swordState.focusing || swordState.rushTime >= 0)
        return;
    swordState.focusCharge = Math.min(1, swordState.focusCharge + damage / FOCUS_CHARGE_DAMAGE);
}
// 振り・溜め・溜め斬りの踏み込みをやめる。振っていた形からは滑らかに戻す
function cancelSwordAttack() {
    if (swordState.swordAttack) {
        swordExit.pos.copy(swordCur.pos);
        swordExit.quat.copy(swordCur.quat);
        swordExit.spin = ((((swordCur.spin + 180) % 360) + 360) % 360) - 180;
        swordExitBlend = 1;
        swordState.swordAttack = null;
        swordComboTimer = SWORD_COMBO_RESET;
    }
    swordQueued = false;
    swordState.swordHold = -1;
    swordState.chargeDashTime = 0;
    stopMeleePull();
}
export function startFocus() {
    swordState.focusing = true;
    focusTime = 0;
    swordState.focusCharge = 0;
    focusLocked = false;
    swordTwirlTime = Infinity;
    sfx.playFocusStart();
    if (skinOf('sword').focus?.enterSpin)
        playSwish({ at: 0.02, dur: 0.3, f0: 250, f1: 1100, gain: 0.25 }, swordSwish());
}
export function endFocus() {
    swordState.focusing = false;
    focusLocked = false;
}
export function startRush() {
    endFocus();
    // ボスにロックオンしていれば、目印の真下の地面を的にする（一閃はその目印の部位へ当てる）
    swordState.rushEnemy = lockBoss >= 0 ? null : lockEnemy ?? en;
    issenBoss = lockBoss;
    const at = lockedAt(lockAt);
    const footY = lockBoss >= 0 ? boss.pos.y : en.root.position.y;
    const stop = RUSH_STOP + (lockBoss >= 0 ? BOSS_RUSH_STOP : 0);
    // 敵の手前（こちら側）で止まる位置へ、空中からでもまっすぐ飛び込む
    rushDir.set(at.x - position.x, 0, at.z - position.z);
    const d = rushDir.length();
    if (d > 1e-4)
        rushDir.divideScalar(d);
    else
        camera.getWorldDirection(rushDir).setY(0).normalize();
    rushTarget.set(at.x, footY, at.z).addScaledVector(rushDir, -stop);
    if (d < stop)
        rushTarget.set(position.x, footY, position.z);
    swordState.rushTime = 0;
    rushArrived = false;
    game.timeScale = 1; // スローを一気に解く
    player.sliding = false;
    player.dashTime = 0;
    if (player.wallRunning)
        endWallRun();
    game.fovKick += 14;
    hooks.addTrauma(0.3);
    kickVel.x += 1.2 * DEG * 22;
    sfx.playRush();
    // 専用の突進の形を持つスキンは、刀を振り上げる音と刃の光を足す
    if (skinOf('sword').focus?.rush) {
        playSwish({ at: 0, dur: 0.16, f0: 400, f1: 1800, gain: 0.3 }, swordSwish());
        skinFx.flare = 1;
    }
}
// update() の移動の中で呼ぶ。止まる位置へ RUSH_SPEED でまっすぐ向かい、届く 1 歩はぴったり合わせる
export function updateRush(dt) {
    swordState.rushTime += dt;
    // 突進しながら視線を敵へ吸い寄せる
    lockTo.copy(lockedAt(lockAt)).sub(camera.position);
    lookEuler.setFromQuaternion(camera.quaternion);
    const k = 1 - Math.exp(-dt * 25);
    const yaw = Math.atan2(-lockTo.x, -lockTo.z);
    lookEuler.y += Math.atan2(Math.sin(yaw - lookEuler.y), Math.cos(yaw - lookEuler.y)) * k;
    lookEuler.x += (Math.atan2(lockTo.y, Math.hypot(lockTo.x, lockTo.z)) - lookEuler.x) * k;
    lookEuler.z = 0;
    camera.quaternion.setFromEuler(lookEuler);
    rushDir.subVectors(rushTarget, position);
    const d = rushDir.length();
    if (d <= RUSH_SPEED * dt || swordState.rushTime >= RUSH_MAX_TIME) {
        velocity.copy(rushDir).divideScalar(Math.max(dt, 1e-4));
        rushArrived = true;
    }
    else {
        velocity.copy(rushDir).multiplyScalar(RUSH_SPEED / d);
    }
}
export function finishRush() {
    swordState.rushTime = -1;
    rushArrived = false;
    const at = lockedAt(lockAt);
    rushDir.set(at.x - position.x, 0, at.z - position.z).normalize();
    velocity.set(rushDir.x * RUSH_EXIT_SPEED, 0, rushDir.z * RUSH_EXIT_SPEED);
    startSwordAttack(SWORD_ISSEN);
}
// 構え・ロックオン・突進の状態を進める（実時間で動かす）
export function updateFocus() {
    // 振っている途中・溜めている途中でも、それをやめてすぐ構えられる
    const can = controls.isLocked && swordReady() && swordState.rushTime < 0;
    if (swordState.focusPressed && can && !swordState.focusing) {
        if (swordState.focusCharge >= 1) {
            cancelSwordAttack();
            startFocus();
        }
        else {
            swordState.focusEmptyFlash = FOCUS_EMPTY_FLASH;
            playRing(0.5, 0.25, 0.04); // 溜まっていない鈍い「カッ」
        }
    }
    else if (!can && swordState.focusing)
        endFocus();
    swordState.focusPressed = false;
    swordState.focusEmptyFlash = Math.max(0, swordState.focusEmptyFlash - game.realDt);
    if (swordState.focusing) {
        focusTime += game.realDt;
        if (focusTime >= FOCUS_MAX)
            endFocus();
    }
    if (swordState.focusing) {
        const lock = canLockOn();
        if (lock && !focusLocked)
            sfx.playLockOn(); // ロックオンした瞬間に「キン」
        focusLocked = lock;
    }
    if (rushArrived)
        finishRush();
    // スローは滑らかにかけ、解くときは突進で一気に戻す
    const targetScale = swordState.focusing || game.deadEye !== 'off' ? FOCUS_TIME_SCALE : 1;
    game.timeScale += (targetScale - game.timeScale) * Math.min(1, game.realDt * 10);
    if (Math.abs(game.timeScale - targetScale) < 0.01)
        game.timeScale = targetScale;
    const holdPose = swordState.focusing || swordState.rushTime >= 0;
    swordState.focusBlend += ((holdPose ? 1 : 0) - swordState.focusBlend) * Math.min(1, game.realDt * (holdPose ? 14 : 8));
    swordState.focusZoom += ((swordState.focusing ? 1 : 0) - swordState.focusZoom) * Math.min(1, game.realDt * (swordState.focusing ? 6 : 20));
    // クロスヘアの下の帯: 普段は溜まり具合、構えている間は構えていられる残り時間
    const fill = swordState.focusing
        ? Math.max(0, 1 - focusTime / FOCUS_MAX)
        : game.deadEye === 'mark' ? Math.max(0, 1 - game.deadEyeT / DEADEYE_MAX) : swordState.focusCharge;
    const ready = swordState.focusing || game.deadEye === 'mark' || swordState.focusCharge >= 1;
    const gaugeShown = swordState.focusing || game.shownWeapon === 'sword' || game.shownWeapon === 'handgun';
    focusHud.classList.toggle('show', gaugeShown);
    // 満タンで、まだ使っていない間だけ、押すボタンを帯の左に出す
    focusKey.classList.toggle('show', gaugeShown && swordState.focusCharge >= 1 && !swordState.focusing && game.deadEye === 'off');
    focusHud.classList.toggle('ready', ready);
    focusHud.classList.toggle('empty', swordState.focusEmptyFlash > 0);
    focusFill.style.transform = `scaleX(${fill.toFixed(3)})`;
    if (ready && !focusShownReady && !swordState.focusing && game.deadEye === 'off') {
        focusHud.classList.remove('gain');
        void focusHud.offsetWidth;
        focusHud.classList.add('gain'); // 満タンになった瞬間に光らせる
    }
    focusShownReady = ready;
    // ロックオンの印を敵に重ねる
    lockonEl.classList.toggle('show', swordState.focusing && focusLocked);
    if (swordState.focusing && focusLocked) {
        lockScreen.copy(lockPoint).project(camera);
        lockonEl.style.left = `${((lockScreen.x + 1) / 2) * window.innerWidth}px`;
        lockonEl.style.top = `${((1 - lockScreen.y) / 2) * window.innerHeight}px`;
    }
}
export const newSwordPose = () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), spin: 0 });
export const swordFrom = newSwordPose(); // 攻撃を始めた瞬間の構え
export const swordCur = newSwordPose();
export const swordTmp = newSwordPose();
export const swordRestTip = new THREE.Vector3();
export const swordRestEdge = new THREE.Vector3();
export const swordEvalTip = new THREE.Vector3();
export const swordEvalEdge = new THREE.Vector3();
export const swordEvalFace = new THREE.Vector3();
export const swordBasis = new THREE.Matrix4();
export function evalSwordAttack(def, t, out) {
    // 構えの key は、今の構えの向きを使う
    swordRestEdge.set(1, 0, 0).applyQuaternion(swordRestQuat);
    swordRestTip.set(0, 1, 0).applyQuaternion(swordRestQuat);
    const keys = def.keys;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t)
        i++;
    const k0 = keys[i];
    const k1 = keys[i + 1];
    const kPrev = keys[Math.max(0, i - 1)];
    const kNext = keys[Math.min(keys.length - 1, i + 2)];
    const e = k0.ease(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
    const tip = (k) => k.tip ?? swordRestTip;
    const edge = (k) => k.edge ?? swordRestEdge;
    catmullRom(kPrev.pos, k0.pos, k1.pos, kNext.pos, e, out.pos);
    // 切っ先と刃の向きも曲線でつなぎ、key の所で軌跡が折れないようにする
    catmullRom(tip(kPrev), tip(k0), tip(k1), tip(kNext), e, swordEvalTip);
    catmullRom(edge(kPrev), edge(k0), edge(k1), edge(kNext), e, swordEvalEdge);
    swordEvalTip.normalize();
    swordEvalEdge.addScaledVector(swordEvalTip, -swordEvalEdge.dot(swordEvalTip));
    if (swordEvalEdge.lengthSq() < 1e-8)
        swordEvalEdge.set(0, 0, -1).addScaledVector(swordEvalTip, swordEvalTip.z);
    swordEvalEdge.normalize();
    swordEvalFace.crossVectors(swordEvalEdge, swordEvalTip);
    out.quat.setFromRotationMatrix(swordBasis.makeBasis(swordEvalEdge, swordEvalTip, swordEvalFace));
    out.spin = k0.spin + (k1.spin - k0.spin) * e;
}
// 振りかぶりの key までの間に、攻撃開始時の構えから滑らかに移る
export function swordPoseAt(def, t, out) {
    evalSwordAttack(def, t, swordTmp);
    const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
    out.pos.lerpVectors(swordFrom.pos, swordTmp.pos, w);
    out.quat.slerpQuaternions(swordFrom.quat, swordTmp.quat, w);
    out.spin = swordFrom.spin + (swordTmp.spin - swordFrom.spin) * w;
}
export function applySwordPose(p) {
    swordRest.position.copy(p.pos);
    swordRest.quaternion.copy(p.quat);
    swordSpin.rotation.z = p.spin * DEG;
}
export function startSwordAttack(def) {
    if (def.fromFirstKey) {
        evalSwordAttack(def, 0, swordFrom);
    }
    else {
        swordFrom.pos.copy(swordCur.pos);
        swordFrom.quat.copy(swordCur.quat);
        swordFrom.spin = ((((swordCur.spin + 180) % 360) + 360) % 360) - 180; // 回した分を巻き戻さないように
    }
    swordState.swordAttack = def;
    // ダッシュで回している途中に振ったら、回すのをやめて攻撃へつなぐ
    swordTwirlTime = Infinity;
    swordTwirlGripped = true;
    swordState.swordTime = 0;
    swordQueued = false;
    swordFiredSwishes = 0;
    swordFiredGrips = 0;
    swordFiredRings = 0;
    swordState.swordFiredImpact = false;
    swordFiredLunge = false;
    stopMeleePull();
    swordHitLanded = false;
    swordHits.clear();
    swordBossHit = false;
    swordLastTrail = -Infinity;
    swordRibbon.cut();
    if (def.windKick) {
        kickVel.x += def.windKick[0] * DEG * 10;
        kickVel.y += def.windKick[1] * DEG * 10;
        kickVel.z += def.windKick[2] * DEG * 10;
    }
}
// スライディング中・ダッシュ直後の技。この状況では長押しの溜めを待たず、押した瞬間に振る
export function specialSwordAttack() {
    if (player.sliding)
        return SWORD_SWEEP;
    if (player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW)
        return SWORD_THRUST;
    return null;
}
export function chooseSwordAttack() {
    const special = specialSwordAttack();
    if (special)
        return special;
    const def = SWORD_COMBO[swordState.swordComboStep];
    swordState.swordComboStep = (swordState.swordComboStep + 1) % SWORD_COMBO.length;
    return def;
}
// 剣の切っ先が敵を捉えた場所を当たりの位置にする
export const swordHitTip = new THREE.Vector3();
export const swordSwing = new THREE.Vector3();
export function swordTipAt(def, t, out) {
    swordPoseAt(def, t, swordTmpHit);
    applySwordPose(swordTmpHit);
    sword.updateWorldMatrix(true, false);
    return out.copy(SWORD_TRAIL_TIP).applyMatrix4(sword.matrixWorld);
}
export function trySwordHit(def) {
    // ボスへの一閃は、届く範囲を測らずにロックオンした目印の部位へ当てる（高い所の腕にも届かせる）
    if (def === SWORD_ISSEN && issenBoss >= 0) {
        const i = issenBoss;
        issenBoss = -1;
        camera.updateMatrixWorld();
        swordTipAt(def, Math.max(0, swordState.swordTime - SWING_SAMPLE), swordSwing);
        swordSwing.subVectors(swordTipAt(def, swordState.swordTime + SWING_SAMPLE, swordHitTip), swordSwing);
        bossTargetAt(i, hitPoint);
        issenDir.subVectors(hitPoint, camera.position);
        hitWithArcs(skinOf('sword'), def.fx ?? 1, swordSwing, () => hooks.hitBoss(def, hitPoint, 'sword', bossTargetPart(i), issenDir, 1, swordSwing));
        skinFx.flare = 1;
        return true;
    }
    // 届く範囲にいる敵（今の振りでまだ当てていないもの）すべてに当てる
    const reach = def.reach ?? SWORD_REACH;
    let any = false;
    const hitOne = () => {
        if (!any) {
            // 当たったら吸い寄せをやめる（ヒットストップの後に位置だけ前へずれると、敵が瞬間移動したように見える）
            stopMeleePull();
            camera.updateMatrixWorld();
            swordTipAt(def, Math.max(0, swordState.swordTime - SWING_SAMPLE), swordSwing);
            swordSwing.subVectors(swordTipAt(def, swordState.swordTime + SWING_SAMPLE, swordHitTip), swordSwing);
            swordTipAt(def, swordState.swordTime, swordHitTip);
        }
        any = true;
        hooks.hitPointFromTip(swordHitTip, hitPoint);
        // 稲妻を出すスキンは、当たりの斬撃の線と光線も稲妻と同じ色にし、斬撃の線を太くする
        hitWithArcs(skinOf('sword'), def.fx ?? 1, swordSwing, () => hooks.applyHit(def, hitPoint, 'sword', swordSwing));
        skinFx.flare = 1; // スキンの飾りを光らせる（金継ぎの継ぎ目など）
    };
    for (const e of enemies) {
        if (swordHits.has(e))
            continue;
        setEn(e);
        if (!hooks.inReachOf(reach, SWORD_HIT_ANGLE))
            continue;
        swordHits.add(e);
        hitOne();
    }
    // ボスの機体（1 回の振りで 1 回）
    if (!swordBossHit && hooks.bossInReach(reach, SWORD_HIT_ANGLE)) {
        swordBossHit = true;
        hitOne();
    }
    return any;
}
const swordHits = new Set(); // 今の振りで当てた敵
let swordBossHit = false;
export const swordTmpHit = newSwordPose();
let swordHitLanded = false;
export function updateSwordAttack(dt) {
    updateFocus();
    if (swordState.swordPressed) {
        swordState.swordPressed = false;
        if (swordState.focusing) {
            if (focusLocked)
                startRush();
        }
        else if (swordReady() && swordState.rushTime < 0) {
            if (!swordState.swordAttack) {
                const special = specialSwordAttack();
                if (special)
                    startSwordAttack(special);
                else
                    swordState.swordHold = 0; // 離すまで、普段の攻撃か溜め斬りかを決めない
            }
            else {
                if (swordState.swordTime >= swordState.swordAttack.cancel - SWORD_BUFFER)
                    swordQueued = true;
                swordState.swordHold = 0; // 振っている間も押し続けているかを見て、振り終えたら溜めへ移る
            }
        }
    }
    // 長押しの溜め
    if (swordState.swordHold >= 0) {
        if (!controls.isLocked || !swordReady() || swordState.focusing || swordState.rushTime >= 0) {
            swordState.swordHold = -1;
        }
        else if (swordState.swordAttack) {
            // 振っている最中に押した: すぐ離せば次の段へつなぎ、押し続けていれば振り終えたところで溜めの構えへ
            swordState.swordHold += dt;
            if (!game.attackHeld) {
                swordState.swordHold = -1;
                if (swordState.swordTime >= swordState.swordAttack.cancel - SWORD_BUFFER)
                    swordQueued = true;
            }
            else if (swordState.swordHold >= CHARGE_DELAY && swordState.swordTime >= swordState.swordAttack.cancel) {
                swordExit.pos.copy(swordCur.pos);
                swordExit.quat.copy(swordCur.quat);
                swordExit.spin = ((((swordCur.spin + 180) % 360) + 360) % 360) - 180;
                swordExitBlend = 1;
                swordState.swordAttack = null;
                swordQueued = false;
                swordComboTimer = SWORD_COMBO_RESET;
                swordState.swordHold = CHARGE_DELAY - 1e-4; // 次のフレームで溜めの構えに入る（溜める時間はここから数える）
            }
        }
        else {
            const wasStance = swordState.swordHold >= CHARGE_DELAY;
            const wasCharged = swordCharged();
            swordState.swordHold += dt;
            if (!wasStance && swordState.swordHold >= CHARGE_DELAY) {
                swordTwirlTime = Infinity; // ダッシュで回している途中でも、溜めの構えへ移る
                playGrip();
                playSwish({ at: 0, dur: 0.25, f0: 250, f1: 800, gain: 0.25 }, swordSwish());
            }
            if (!wasCharged && swordCharged()) {
                sfx.playCharge(2); // 溜めきった「キン」
                hooks.addTrauma(0.1);
            }
            if (!game.attackHeld) {
                const charged = swordCharged();
                swordState.swordHold = -1;
                if (charged)
                    startChargeSlash();
                else
                    startSwordAttack(chooseSwordAttack());
            }
        }
    }
    if (swordState.swordAttack) {
        swordState.swordTime += dt * SWORD_ATTACK_SPEED;
        const def = swordState.swordAttack;
        while (swordFiredSwishes < def.swishes.length && swordState.swordTime >= def.swishes[swordFiredSwishes].at) {
            playSwish(def.swishes[swordFiredSwishes++], swordSwish());
        }
        const grips = def.grips ?? [];
        while (swordFiredGrips < grips.length && swordState.swordTime >= grips[swordFiredGrips]) {
            swordFiredGrips++;
            playGrip();
        }
        const rings = def.rings ?? [];
        while (swordFiredRings < rings.length && swordState.swordTime >= rings[swordFiredRings][0]) {
            playRing(rings[swordFiredRings++][1], 0.8, 0.5);
        }
        if (!swordFiredLunge && swordState.swordTime >= def.lungeAt) {
            swordFiredLunge = true;
            hooks.applyLunge(def.lunge);
            if (def.lunge > 0)
                startMeleePull(def.reach ?? SWORD_REACH, SWORD_PULL_SPEED, SWORD_PULL_TIME); // 踏み込む技だけ（連撃・突き）
        }
        if (!swordState.swordFiredImpact && swordState.swordTime >= def.impact) {
            swordState.swordFiredImpact = true;
            kickVel.x += def.kick[0] * DEG * 22;
            kickVel.y += def.kick[1] * DEG * 22;
            kickVel.z += def.kick[2] * DEG * 22;
            hooks.addTrauma(0.08);
            game.fovKick += def.fovPunch ?? 0;
            game.landDipVel -= def.dip ?? 0;
            swordHitLanded = trySwordHit(def);
            if (!swordHitLanded) {
                // 空振り: 壁や床に届いていれば弾かれる（あとで届いた敵には、そのまま当たる）
                camera.updateMatrixWorld();
                swordTipAt(def, Math.max(0, swordState.swordTime - SWING_SAMPLE), swordSwing);
                swordSwing.subVectors(swordTipAt(def, swordState.swordTime + SWING_SAMPLE, swordHitTip), swordSwing);
                tryWallHit('sword', def.reach ?? SWORD_REACH, 'blade', swordSwing, def.fx ?? 1);
            }
        }
        else if (swordState.swordFiredImpact && def.hitUntil !== undefined && swordState.swordTime <= def.hitUntil) {
            if (trySwordHit(def))
                swordHitLanded = true; // 当てたあとも、届いた別の敵には当てる
        }
        // 押し続けている間は、離すか溜めに移るまで次の段を待つ
        if (swordQueued && swordState.swordTime >= def.cancel && !(swordState.swordHold >= 0 && game.attackHeld)) {
            startSwordAttack(chooseSwordAttack());
        }
        else if (swordState.swordTime >= def.duration) {
            swordState.swordAttack = null;
            swordComboTimer = SWORD_COMBO_RESET;
        }
    }
    else if (swordComboTimer > 0) {
        swordComboTimer -= dt;
        if (swordComboTimer <= 0)
            swordState.swordComboStep = 0;
    }
    // 持ち替えたら最初の段から
    if (game.shownWeapon !== 'sword') {
        swordState.swordAttack = null;
        swordState.swordComboStep = 0;
        swordTwirlTime = Infinity;
        if (swordState.focusing)
            endFocus();
        swordState.rushTime = -1;
        rushArrived = false;
        swordState.swordHold = -1;
        swordState.chargeDashTime = 0;
    }
    const stance = swordState.swordHold >= CHARGE_DELAY;
    swordState.swordChargeBlend += ((stance ? 1 : 0) - swordState.swordChargeBlend) * Math.min(1, dt * (stance ? 14 : 10));
    skinFx.focus = swordState.focusBlend; // スキンの飾りを構えに合わせて光らせる
    if (swordState.swordAttack) {
        swordExitBlend = 0;
        sampleSwordTrail();
        swordPoseAt(swordState.swordAttack, swordState.swordTime, swordCur);
    }
    else {
        const prev = swordTwirlTime;
        swordTwirlTime += dt;
        if (swordTwirlTime < SWORD_TWIRL_TIME)
            sampleTwirlTrail(prev, swordTwirlTime);
        swordTwirlPose(swordTwirlTime, swordCur);
        if (!swordTwirlGripped && swordTwirlTime >= SWORD_TWIRL_GRIP) {
            swordTwirlGripped = true;
            playGrip();
        }
        // 居合の構え。構えている間はゆっくり呼吸するように上下させる
        // スキンが専用の構えを持っていれば、そちらで構える
        if (swordState.focusBlend > 1e-3) {
            const w = easeInOutCubic(swordState.focusBlend);
            const focus = skinOf('sword').focus;
            swordFocusPos.copy(focus?.pos ?? SWORD_FOCUS_POS);
            swordFocusPos.y += Math.sin(performance.now() * 0.004) * 0.004;
            swordCur.pos.lerp(swordFocusPos, w);
            swordCur.quat.slerp(focus?.quat ?? SWORD_FOCUS_QUAT, w);
            swordCur.spin *= 1 - w;
            // スキン専用の動き（見た目だけ。構え・突進・振りの時間と当たりは変えない）
            // 構えに入るときは、手の中で刀を回しながら構える（enterSpin から 0 へ減らして、同じ向きに 1 回転させる）
            if (focus?.enterSpin && swordState.focusing) {
                swordCur.spin += focus.enterSpin * (1 - easeOutCubic(Math.min(1, focusTime / FOCUS_ENTER_SPIN_TIME)));
            }
            // 突進中は、構え → スキンの形 → 一閃の振りかぶり（最初の key）へ寄せる。振り始めの形が振りかぶりに近いので、そのまま振りへつながる
            if (focus?.rush && swordState.rushTime >= 0) {
                const p = 1 - Math.exp(-swordState.rushTime / RUSH_POSE_TIME);
                evalSwordAttack(SWORD_ISSEN, SWORD_ISSEN.keys[1].t, rushDraw);
                if (p < 0.5) {
                    const u = easeInOutCubic(p * 2);
                    swordCur.pos.lerp(focus.rush.pos, u);
                    swordCur.quat.slerp(focus.rush.quat, u);
                }
                else {
                    const u = easeInOutCubic((p - 0.5) * 2);
                    swordCur.pos.lerpVectors(focus.rush.pos, rushDraw.pos, u);
                    swordCur.quat.slerpQuaternions(focus.rush.quat, rushDraw.quat, u);
                }
            }
        }
        // 溜めの構え。溜まるにつれて少しずつ引き絞り、溜めきったら刀を小刻みに震わせる
        if (swordState.swordChargeBlend > 1e-3) {
            const w = easeInOutCubic(swordState.swordChargeBlend);
            const u = THREE.MathUtils.clamp((swordState.swordHold - CHARGE_DELAY) / CHARGE_TIME, 0, 1);
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
    swordRibbon.update(game.trailNow);
}
export const swordFocusPos = new THREE.Vector3();
const rushDraw = newSwordPose(); // 一閃の振りかぶりの形（突進中にスキンの形から寄せる先）
const FOCUS_ENTER_SPIN_TIME = 0.4; // 構えに入るときに手の中で回す時間（実時間の秒）
const RUSH_POSE_TIME = 0.05; // 突進中にスキンの形を通って振りかぶりへ寄せる速さ（時定数）
export const SWORD_EXIT_TIME = 0.15;
export const swordExit = newSwordPose();
let swordExitBlend = 0;
// ダッシュ時の回転。回している間は縦に立てた構えの面で回し（走る構えのまま回すと画面を覆うので）、
// 回し終わりに今の構えへ戻す
export function swordTwirlPose(t, out) {
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
export function startSwordTwirl() {
    swordTwirlTime = 0;
    swordTwirlGripped = false;
    swordRibbon.cut();
    playSwish({ at: 0, dur: 0.18, f0: 600, f1: 2200, gain: 0.2 }, swordSwish());
    setTimeout(() => playSwish({ at: 0, dur: 0.2, f0: 500, f1: 1800, gain: 0.14 }, swordSwish()), 150);
}
// 回している間の軌跡（勢いのある前半だけ）
export function sampleTwirlTrail(from, to) {
    const end = Math.min(to, SWORD_TWIRL_TIME * 0.8);
    for (let s = Math.max(from + TRAIL_STEP, 0); s <= end; s += TRAIL_STEP) {
        swordTwirlPose(s, swordTrailPose);
        pushSwordTrail(swordTrailPose, game.trailNow - (to - s));
    }
}
export function pushSwordTrail(p, time) {
    applySwordPose(p);
    sword.updateWorldMatrix(true, false);
    camera.worldToLocal(swordTrailTip.copy(SWORD_TRAIL_TIP).applyMatrix4(sword.matrixWorld));
    camera.worldToLocal(swordTrailBase.copy(SWORD_TRAIL_BASE).applyMatrix4(sword.matrixWorld));
    swordRibbon.push(swordTrailTip, swordTrailBase, time);
}
// 剣の軌跡: クナイの軌跡と同じ見た目で、刃の根元から切っ先の少し先まで、刃全体の幅で残す
export const SWORD_TRAIL_TIP = new THREE.Vector3(0, SWORD_TIP + 0.03, 0); // 剣のローカル座標
export const SWORD_TRAIL_BASE = new THREE.Vector3(0, SWORD_BLADE_BASE_Y + 0.01, 0);
export const swordRibbon = new Ribbon(240, 0.2, makeRibbonMaterial(SWORD_RIBBON));
camera.add(swordRibbon.mesh);
// スキンが軌跡の色を持つときは、その色にする
tintRibbon(swordRibbon, skinOf('sword').trail);
onSkinChange((id, skin) => id === 'sword' && tintRibbon(swordRibbon, skin.trail));
let swordLastTrail = -Infinity;
export const swordTrailPose = newSwordPose();
export const swordTrailTip = new THREE.Vector3();
export const swordTrailBase = new THREE.Vector3();
export function sampleSwordTrail() {
    const def = swordState.swordAttack;
    if (!def)
        return;
    for (const [from, to] of def.trails) {
        const end = Math.min(to, swordState.swordTime);
        for (let s = Math.max(from, swordLastTrail + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
            if (s - swordLastTrail > TRAIL_STEP * 1.5)
                swordRibbon.cut(); // 別の時間帯の軌跡とはつながない
            swordPoseAt(def, s, swordTrailPose);
            pushSwordTrail(swordTrailPose, game.trailNow - (swordState.swordTime - s));
            swordLastTrail = s;
        }
    }
}

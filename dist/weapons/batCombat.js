import * as THREE from 'three';
import * as sfx from '../audio.js';
import { playSwish } from '../audio.js';
import { easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, linear } from '../ease.js';
import { DEG, catmullRom } from '../math.js';
import { camera, controls } from '../core.js';
import { BAT_REST_QUAT, BAT_REST_TIP, BAT_TIP_Y, BAT_VIEW_MODEL_POS, batQuat } from './bat.js';
import { batModel, batRest } from './viewModels.js';
import { AXE_RIBBON, Ribbon, TRAIL_STEP, makeRibbonMaterial } from '../fx/ribbons.js';
import { DEFAULT_KNOCK, en, hitDir, hitPoint } from '../enemy/state.js';
import { knockEnemy } from '../enemy/motion.js';
import { SWING_SAMPLE, game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
function makeBatAttack(def) {
    const keys = def.keys.map((k) => ({
        t: k.t,
        pos: new THREE.Vector3(...(k.pos ?? [0, 0, 0])),
        tip: k.tip ? new THREE.Vector3(...k.tip).normalize() : BAT_REST_TIP.clone(),
        ease: k.ease ?? easeInOutCubic,
    }));
    return { ...def, keys, duration: keys[keys.length - 1].t, lungeAt: def.lungeAt ?? def.trails[0][0] };
}
export const BAT_REACH = 2.6;
export const BAT_HIT_ANGLE = 65 * DEG; // 横に大きく振るので横にも広く当たる
export const BAT_BUFFER = 0.3;
export const BAT_COMBO_RESET = 0.4;
// 1 段目: 右肩の後ろへ引いて溜め、手を先に出して胴を遅らせながら、正面を右から左へ水平に振り抜く。
// 振り抜いたバットは左肩の上へ巻き付ける
export const BAT_SWING_1 = makeBatAttack({
    keys: [
        { t: 0 },
        { t: 0.09, pos: [0.06, 0.12, 0.1], tip: [0.55, 0.45, 0.7], ease: easeOutCubic }, // 右肩の後ろへ引く
        { t: 0.15, pos: [0.08, 0.13, 0.12], tip: [0.65, 0.35, 0.68], ease: easeInQuad }, // さらに引き絞って溜める
        { t: 0.175, pos: [-0.08, 0.1, -0.08], tip: [0.6, 0.05, -0.8], ease: linear }, // 手が先に出て、胴が右から回ってくる
        { t: 0.2, pos: [-0.22, 0.1, -0.1], tip: [-0.3, 0.02, -0.95], ease: linear }, // 正面で捉える
        { t: 0.235, pos: [-0.36, 0.12, -0.02], tip: [-0.95, 0.1, -0.1], ease: easeOutCubic }, // 左へ振り抜く
        { t: 0.36, pos: [-0.38, 0.2, 0.06], tip: [-0.7, 0.55, 0.4] }, // 左肩の上へ巻き付ける
        { t: 0.62 },
    ],
    trails: [[0.15, 0.27]],
    impact: 0.195,
    kick: [-0.6, 2.4, -1.2],
    windKick: [0.3, -0.8, 0.5],
    lunge: 3.5,
    cancel: 0.3,
    swishes: [{ at: 0.14, dur: 0.2, f0: 220, f1: 1100, gain: 0.6 }],
    knock: 320,
    hitStop: 0.08,
    fx: 1.2,
    dmg: 1.2, // 横・切り返し・叩きつけ・横の 4 発で倒しきる（24 + 24 + 40 + 24 = 112）
});
// 2 段目: 振り抜いた左からそのまま返し、左から右へ手の甲側で振り抜く
export const BAT_SWING_2 = makeBatAttack({
    keys: [
        { t: 0 },
        { t: 0.08, pos: [-0.32, 0.14, 0.04], tip: [-0.75, 0.4, 0.5], ease: easeOutCubic }, // 左肩の後ろへ返す
        { t: 0.13, pos: [-0.34, 0.15, 0.06], tip: [-0.8, 0.3, 0.52], ease: easeInQuad },
        { t: 0.16, pos: [-0.24, 0.08, -0.08], tip: [-0.65, 0.0, -0.75], ease: linear },
        { t: 0.185, pos: [-0.06, 0.07, -0.1], tip: [0.25, -0.02, -0.97], ease: linear }, // 正面で捉える
        { t: 0.22, pos: [0.08, 0.08, -0.04], tip: [0.95, 0.05, -0.2], ease: easeOutCubic }, // 右へ振り抜く
        { t: 0.34, pos: [0.1, 0.14, 0.04], tip: [0.7, 0.45, 0.45] },
        { t: 0.6 },
    ],
    trails: [[0.13, 0.26]],
    impact: 0.18,
    kick: [-0.6, -2.4, 1.2],
    windKick: [0.3, 0.8, -0.5],
    lunge: 3.5,
    cancel: 0.3,
    swishes: [{ at: 0.125, dur: 0.19, f0: 240, f1: 1200, gain: 0.6 }],
    knock: 320,
    hitStop: 0.08,
    fx: 1.2,
    dmg: 1.2,
});
// 3 段目（締め）: 頭の後ろまで高く振りかぶり、溜めきってから真上から叩きつける。叩いた形でしばらく止めてから戻す
export const BAT_SMASH = makeBatAttack({
    keys: [
        { t: 0 },
        { t: 0.16, pos: [-0.12, 0.34, 0.08], tip: [0.1, 0.6, 0.8], ease: easeOutCubic }, // 頭の後ろへ振りかぶる
        { t: 0.3, pos: [-0.13, 0.37, 0.11], tip: [0.08, 0.45, 0.89], ease: easeInQuad }, // じわりと引き絞る
        { t: 0.335, pos: [-0.16, 0.26, -0.16], tip: [0.0, 0.9, -0.45], ease: linear }, // 真上を通過
        { t: 0.365, pos: [-0.18, 0.02, -0.22], tip: [-0.02, -0.4, -0.92], ease: easeOutCubic }, // 叩きつける
        { t: 0.47, pos: [-0.17, -0.08, -0.18], tip: [-0.03, -0.8, -0.6], ease: easeOutBack }, // 振り切って止める
        { t: 0.66, pos: [-0.15, -0.06, -0.16], tip: [-0.03, -0.75, -0.66] }, // 残心
        { t: 1.0 },
    ],
    trails: [[0.3, 0.44]],
    impact: 0.355,
    lungeAt: 0.31,
    kick: [-3.4, 0, 0],
    windKick: [1.5, 0, 0],
    lunge: 6,
    cancel: 0.62,
    fovPunch: -7,
    dip: 1.6,
    swishes: [{ at: 0.3, dur: 0.22, f0: 180, f1: 950, gain: 0.75 }],
    knock: 460,
    hitStop: 0.14,
    fx: 1.6,
    dmg: 2,
});
// ---- チャージ攻撃（左クリック長押し） ----
// 押してすぐ離せば普段の攻撃。BAT_CHARGE_DELAY より長く押すと右肩の後ろへ深く引いて溜め始め、
// 溜めきってから離すと、踏み込みながら全身で水平に振り抜いて敵をかっ飛ばす。溜めきる前に離したら普段の攻撃
export const BAT_CHARGE_DELAY = 0.18;
export const BAT_CHARGE_TIME = 0.6; // 溜め始めてから溜めきるまで
const CHARGE_POS = [0.12, 0.08, 0.14]; // 溜めの構え: 握りを右肩の後ろへ引き、先端を背中の側へ寝かせる
const CHARGE_TIP = [0.6, 0.25, 0.76];
export const BAT_CHARGE_FLING = 22;
export const BAT_CHARGE_LIFT = 4; // かっ飛ばすときに浮かせる速さ (m/s)
export const BAT_CHARGE_SWING = makeBatAttack({
    keys: [
        { t: 0 },
        { t: 0.03, pos: [0.13, 0.09, 0.15], tip: [0.62, 0.24, 0.75], ease: easeInQuad }, // 溜めの形からさらにひと絞り
        { t: 0.065, pos: [-0.06, 0.1, -0.08], tip: [0.65, 0.02, -0.76], ease: linear }, // 手が先に出て、胴が右から回ってくる
        { t: 0.09, pos: [-0.22, 0.1, -0.12], tip: [-0.3, 0.0, -0.95], ease: linear }, // 正面で芯に捉える
        { t: 0.13, pos: [-0.38, 0.12, -0.02], tip: [-0.95, 0.08, -0.1], ease: easeOutCubic }, // 左へ振り抜く
        { t: 0.3, pos: [-0.4, 0.22, 0.06], tip: [-0.7, 0.55, 0.4] }, // 左肩の上へ巻き付けて見送る
        { t: 0.8 },
    ],
    trails: [[0.03, 0.17]],
    impact: 0.085,
    lungeAt: 0.02,
    kick: [-1, 3.4, -2],
    lunge: 6,
    cancel: 0.5,
    fovPunch: 8,
    swishes: [{ at: 0.01, dur: 0.18, f0: 200, f1: 1300, gain: 0.85 }],
    knock: 600,
    hitStop: 0.16,
    fx: 1.8,
    dmg: 1.6, // 当てただけで 32。壁や敵に叩きつければさらに入る
    fling: BAT_CHARGE_FLING,
});
export const BAT_COMBO = [BAT_SWING_1, BAT_SWING_2, BAT_SMASH];
export const BAT_ATTACKS = { swing1: BAT_SWING_1, swing2: BAT_SWING_2, smash: BAT_SMASH, charge: BAT_CHARGE_SWING };
// 本体からも読み書きする値
export const batState = {
    attack: null,
    time: 0,
    pressed: false,
    comboStep: 0,
    equipT: Infinity, // 取り出し始めてからの時間（取り出していないときは Infinity）
    hold: -1, // 左クリックを押してからの時間。負なら押していない（または普段の攻撃を始めた）
    chargeBlend: 0, // 0 = 普段の構え, 1 = 溜めの構え
};
export const batCharged = () => batState.hold >= BAT_CHARGE_DELAY + BAT_CHARGE_TIME;
let queued = false;
let comboTimer = 0;
let firedSwishes = 0;
let firedImpact = false;
let firedLunge = false;
let pressedInEquip = false; // 取り出しの途中で押した。取り出し終えたら振る
export const batReady = () => game.shownWeapon === 'bat' && game.wantWeapon === 'bat' && game.holster === 0;
const newBatPose = () => ({ pos: new THREE.Vector3(), tip: BAT_REST_TIP.clone() });
const batFrom = newBatPose(); // 攻撃を始めた瞬間の構え
const batCur = newBatPose();
const batTmp = newBatPose();
function evalBatAttack(def, t, out) {
    const keys = def.keys;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t)
        i++;
    const k0 = keys[i];
    const k1 = keys[i + 1];
    const kPrev = keys[Math.max(0, i - 1)];
    const kNext = keys[Math.min(keys.length - 1, i + 2)];
    const e = k0.ease(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
    catmullRom(kPrev.pos, k0.pos, k1.pos, kNext.pos, e, out.pos);
    catmullRom(kPrev.tip, k0.tip, k1.tip, kNext.tip, e, out.tip);
    out.tip.normalize();
}
// 振りかぶりの key までの間に、攻撃開始時の構えから滑らかに移る
export function batPoseAt(def, t, out) {
    evalBatAttack(def, t, batTmp);
    const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
    out.pos.lerpVectors(batFrom.pos, batTmp.pos, w);
    out.tip.lerpVectors(batFrom.tip, batTmp.tip, w).normalize();
}
const batGrip = new THREE.Vector3();
export function applyBatPose(p) {
    batRest.position.copy(p.pos);
    batQuat(batGrip.copy(BAT_VIEW_MODEL_POS).add(p.pos), p.tip, batRest.quaternion);
}
export function startBatAttack(def) {
    batFrom.pos.copy(batCur.pos);
    batFrom.tip.copy(batCur.tip);
    batState.attack = def;
    batState.time = 0;
    queued = false;
    firedSwishes = 0;
    firedImpact = false;
    firedLunge = false;
    lastTrail = -Infinity;
    batRibbon.cut();
    if (def.windKick) {
        kickVel.x += def.windKick[0] * DEG * 10;
        kickVel.y += def.windKick[1] * DEG * 10;
        kickVel.z += def.windKick[2] * DEG * 10;
    }
}
function chooseBatAttack() {
    const def = BAT_COMBO[batState.comboStep];
    batState.comboStep = (batState.comboStep + 1) % BAT_COMBO.length;
    return def;
}
// 胴のいちばん太い所（芯）が敵を捉えた場所を当たりの位置にする
const BAT_SWEET = new THREE.Vector3(0, 0.58, 0); // バットのローカル座標
const batHitAt = new THREE.Vector3();
const batSwing = new THREE.Vector3();
function batPointAt(def, t, out) {
    batPoseAt(def, t, batTmpHit);
    applyBatPose(batTmpHit);
    batModel.updateWorldMatrix(true, false);
    return out.copy(BAT_SWEET).applyMatrix4(batModel.matrixWorld);
}
const batTmpHit = newBatPose();
function tryBatHit(def) {
    if (!hooks.dummyInReach(BAT_REACH, BAT_HIT_ANGLE))
        return;
    camera.updateMatrixWorld();
    batPointAt(def, Math.max(0, batState.time - SWING_SAMPLE), batSwing);
    batSwing.subVectors(batPointAt(def, batState.time + SWING_SAMPLE, batHitAt), batSwing);
    batPointAt(def, batState.time, batHitAt);
    hooks.hitPointFromTip(batHitAt, hitPoint);
    hooks.applyHit(def, hitPoint, 'bat', batSwing);
    if (!en.alive)
        return;
    if (def.fling)
        flingBatEnemy(def.fling);
    else
        knockEnemy(hitDir, def.knock ?? DEFAULT_KNOCK); // 普通の振りは、当たった向きへ押し下げる
}
// 当たった敵を視線の向き（水平）へかっ飛ばす。狙った先の壁や敵へぶつけられるよう、振りの向きではなく視線に合わせる
const flingDir = new THREE.Vector3();
function flingBatEnemy(speed) {
    if (hooks.enemyHeld())
        return;
    camera.getWorldDirection(flingDir).setY(0);
    if (flingDir.lengthSq() < 1e-6)
        return;
    en.knockVel.copy(flingDir.normalize()).multiplyScalar(speed);
    en.flung = en.batFlung = true;
    en.airVel = Math.max(en.airVel, BAT_CHARGE_LIFT);
    en.vel.set(0, 0, 0);
    en.moving = false;
    en.spiked = false;
}
function updateBatAttack(dt) {
    if (batState.pressed) {
        batState.pressed = false;
        if (batReady()) {
            if (batState.equipT !== Infinity)
                pressedInEquip = true;
            else {
                if (batState.attack && batState.time >= batState.attack.cancel - BAT_BUFFER)
                    queued = true;
                batState.hold = 0; // 離すまで、普段の攻撃か溜めかを決めない（振っている間も押し続けているかを見る）
            }
        }
    }
    if (pressedInEquip && batState.equipT === Infinity) {
        pressedInEquip = false;
        if (batReady())
            batState.hold = 0; // 取り出しの間に押していた: 押し続けていれば、そのまま溜めへ
    }
    // 長押しの溜め
    if (batState.hold >= 0) {
        if (!controls.isLocked || !batReady()) {
            batState.hold = -1;
        }
        else if (batState.attack) {
            // 振っている最中に押した: すぐ離せば次の段へつなぎ、押し続けていれば振り終えたところで溜めの構えへ
            batState.hold += dt;
            if (!game.attackHeld) {
                batState.hold = -1;
                if (batState.time >= batState.attack.cancel - BAT_BUFFER)
                    queued = true;
            }
            else if (batState.hold >= BAT_CHARGE_DELAY && batState.time >= batState.attack.cancel) {
                batExit.pos.copy(batCur.pos);
                batExit.tip.copy(batCur.tip);
                batExitBlend = 1;
                batState.attack = null;
                queued = false;
                comboTimer = BAT_COMBO_RESET;
                batState.hold = BAT_CHARGE_DELAY - 1e-4; // 次のフレームで溜めの構えに入る（溜める時間はここから数える）
            }
        }
        else {
            const wasStance = batState.hold >= BAT_CHARGE_DELAY;
            const wasCharged = batCharged();
            batState.hold += dt;
            if (!wasStance && batState.hold >= BAT_CHARGE_DELAY) {
                sfx.playBatGrip(); // 握り込む「ガチッ」
                playSwish({ at: 0, dur: 0.25, f0: 200, f1: 600, gain: 0.25 }, 'bat');
            }
            if (!wasCharged && batCharged()) {
                sfx.playCharge(2); // 溜めきった「キン」
                hooks.addTrauma(0.1);
            }
            if (!game.attackHeld) {
                const charged = batCharged();
                batState.hold = -1;
                startBatAttack(charged ? BAT_CHARGE_SWING : chooseBatAttack());
            }
        }
    }
    if (batState.attack) {
        batState.time += dt;
        const def = batState.attack;
        while (firedSwishes < def.swishes.length && batState.time >= def.swishes[firedSwishes].at) {
            playSwish(def.swishes[firedSwishes++], 'bat');
        }
        if (!firedLunge && batState.time >= def.lungeAt) {
            firedLunge = true;
            hooks.applyLunge(def.lunge);
        }
        if (!firedImpact && batState.time >= def.impact) {
            firedImpact = true;
            kickVel.x += def.kick[0] * DEG * 22;
            kickVel.y += def.kick[1] * DEG * 22;
            kickVel.z += def.kick[2] * DEG * 22;
            hooks.addTrauma(0.08);
            game.fovKick += def.fovPunch ?? 0;
            game.landDipVel -= def.dip ?? 0;
            tryBatHit(def);
        }
        // 押し続けている間は、離すか溜めに移るまで次の段を待つ
        if (queued && batState.time >= def.cancel && !(batState.hold >= 0 && game.attackHeld)) {
            startBatAttack(chooseBatAttack());
        }
        else if (batState.time >= def.duration) {
            batState.attack = null;
            comboTimer = BAT_COMBO_RESET;
        }
    }
    else if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0)
            batState.comboStep = 0;
    }
    // 持ち替えたら最初の段から
    if (game.shownWeapon !== 'bat') {
        batState.attack = null;
        batState.comboStep = 0;
        batState.hold = -1;
        pressedInEquip = false;
    }
    const stance = batState.hold >= BAT_CHARGE_DELAY;
    batState.chargeBlend += ((stance ? 1 : 0) - batState.chargeBlend) * Math.min(1, dt * (stance ? 14 : 10));
}
const batExit = newBatPose(); // 振りの途中から溜めへ移ったときの、振っていた形
let batExitBlend = 0;
const BAT_EXIT_TIME = 0.15;
const chargePos = new THREE.Vector3();
const chargeTip = new THREE.Vector3();
// ---- 取り出し ----
// 持ち替えたとき: 右肩の後ろに担いだバットを、画面の右下から手を上げながら頭の上を越えて前へ振り下ろす。
// 切っ先を正面の少し左（照準の方）へ向けた所でぴたりと止め（予告ホームランの指し）、
// 手首で返して起こし、少し肩の側へ行き過ぎてから「ガチッ」と握り直して構えに収まる
export const BAT_EQUIP_SWING = 0.24; // 振り下ろして正面を指すまで
export const BAT_EQUIP_HOLD = 0.06; // 正面を指して止めている間
export const BAT_EQUIP_SET = 0.28; // 返して構えに収まるまで
export const BAT_EQUIP_TIME = BAT_EQUIP_SWING + BAT_EQUIP_HOLD + BAT_EQUIP_SET;
const BAT_EQUIP_GRIP = BAT_EQUIP_SWING + BAT_EQUIP_HOLD + BAT_EQUIP_SET * 0.37; // 構えの向きまで戻った瞬間（easeOutBack が 1 に届く所）
const SHOULDER_PITCH = 130 * DEG; // 担いだ向き（構えから切っ先を後ろへ倒す角度）
const POINT_PITCH = -75 * DEG; // 正面を指した向き（構えから切っ先を前へ倒す角度）
const POINT_YAW = 20 * DEG; // 正面を指すときに切っ先を左（照準の方）へ寄せる角度
const EQUIP_SWISH = { at: 0, dur: 0.26, f0: 200, f1: 900, gain: 0.16 };
export function startBatEquip() {
    batState.equipT = 0;
    sfx.playSwish(EQUIP_SWISH, 'axe'); // 太い胴が空気を押しのける「ブォン」
}
function updateBatEquip(dt) {
    if (batState.equipT === Infinity)
        return;
    if (game.shownWeapon !== 'bat') {
        batState.equipT = Infinity;
        return;
    }
    const prev = batState.equipT;
    const t = (batState.equipT += dt);
    const at = (k) => prev < k && t >= k;
    if (at(BAT_EQUIP_SWING))
        kickVel.x -= 1.2 * DEG * 22; // 振り下ろしを止めた重み
    if (at(BAT_EQUIP_GRIP)) {
        sfx.playBatGrip();
        kickVel.x += 0.4 * DEG * 22;
    }
    if (t >= BAT_EQUIP_TIME)
        batState.equipT = Infinity;
}
// 取り出しの形: 構えからの切っ先の倒れ（pitch: + で後ろ、- で前）と左右の寄せ（yaw: + で左）、手の位置のずれ
export const batEquipOff = new THREE.Vector3();
const swingQuat = new THREE.Quaternion();
const yawQuat = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
function poseBatEquip() {
    const t = batState.equipT;
    let pitch = 0;
    let yaw = 0;
    let reach = 0; // 1 = 振り下ろしについて手を前へ伸ばしきった
    if (t < BAT_EQUIP_SWING) {
        const s = easeInOutCubic(t / BAT_EQUIP_SWING);
        pitch = THREE.MathUtils.lerp(SHOULDER_PITCH, POINT_PITCH, s);
        yaw = POINT_YAW * s * s;
        reach = s;
    }
    else if (t < BAT_EQUIP_SWING + BAT_EQUIP_HOLD) {
        pitch = POINT_PITCH;
        yaw = POINT_YAW;
        reach = 1;
    }
    else if (t < BAT_EQUIP_TIME) {
        const back = 1 - easeOutBack((t - BAT_EQUIP_SWING - BAT_EQUIP_HOLD) / BAT_EQUIP_SET);
        pitch = POINT_PITCH * back;
        yaw = POINT_YAW * back;
        reach = Math.max(0, back);
    }
    // 手は右下から上がってきて、振り下ろしにつれて前へ・少し内側へ伸びる
    const rise = 1 - easeOutCubic(THREE.MathUtils.clamp(t / 0.2, 0, 1));
    batEquipOff.set(0.05 * rise - 0.03 * reach, -0.2 * rise - 0.03 * reach, 0.05 * rise - 0.07 * reach);
    yawQuat.setFromAxisAngle(Y_AXIS, yaw);
    swingQuat.setFromAxisAngle(X_AXIS, pitch);
    batRest.position.set(0, 0, 0);
    batRest.quaternion.copy(yawQuat).multiply(swingQuat).multiply(BAT_REST_QUAT);
}
// ---- 毎フレームの処理 ----
export function updateBat(dt) {
    updateBatEquip(dt);
    updateBatAttack(dt);
    if (batState.attack) {
        batExitBlend = 0;
        sampleBatTrail();
        batPoseAt(batState.attack, batState.time, batCur);
        applyBatPose(batCur);
    }
    else if (batState.equipT !== Infinity) {
        batCur.pos.set(0, 0, 0);
        batCur.tip.copy(BAT_REST_TIP);
        poseBatEquip();
    }
    else {
        batCur.pos.set(0, 0, 0);
        batCur.tip.copy(BAT_REST_TIP);
        // 溜めの構え。溜まるにつれて少しずつ引き絞り、溜めきったらバットを小刻みに震わせる
        if (batState.chargeBlend > 1e-3) {
            const w = easeInOutCubic(batState.chargeBlend);
            const u = THREE.MathUtils.clamp((batState.hold - BAT_CHARGE_DELAY) / BAT_CHARGE_TIME, 0, 1);
            chargePos.set(CHARGE_POS[0] + 0.03 * u, CHARGE_POS[1] + 0.01 * u, CHARGE_POS[2] + 0.04 * u);
            chargeTip.set(...CHARGE_TIP);
            chargeTip.x += 0.1 * u;
            chargeTip.normalize();
            if (batCharged()) {
                const n = performance.now();
                chargePos.x += Math.sin(n * 0.09) * 0.0025;
                chargePos.y += Math.sin(n * 0.11 + 1) * 0.0025;
            }
            batCur.pos.lerp(chargePos, w);
            batCur.tip.lerp(chargeTip, w).normalize();
        }
        // 振りの途中から溜めへ移ったときは、振っていた形から滑らかにつなぐ
        if (batExitBlend > 0) {
            batExitBlend = Math.max(0, batExitBlend - dt / BAT_EXIT_TIME);
            const w = easeInOutCubic(batExitBlend);
            batCur.pos.lerp(batExit.pos, w);
            batCur.tip.lerp(batExit.tip, w).normalize();
        }
        batEquipOff.set(0, 0, 0);
        applyBatPose(batCur);
    }
    batRibbon.update(game.trailNow);
}
// 振りの軌跡: 胴の太り始めから先端の少し先まで
const BAT_TRAIL_TIP = new THREE.Vector3(0, BAT_TIP_Y + 0.03, 0); // バットのローカル座標
const BAT_TRAIL_BASE = new THREE.Vector3(0, 0.36, 0);
export const batRibbon = new Ribbon(240, 0.2, makeRibbonMaterial(AXE_RIBBON));
camera.add(batRibbon.mesh);
let lastTrail = -Infinity;
const batTrailPose = newBatPose();
const batTrailTip = new THREE.Vector3();
const batTrailBase = new THREE.Vector3();
function sampleBatTrail() {
    const def = batState.attack;
    if (!def)
        return;
    for (const [from, to] of def.trails) {
        const end = Math.min(to, batState.time);
        for (let s = Math.max(from, lastTrail + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
            if (s - lastTrail > TRAIL_STEP * 1.5)
                batRibbon.cut(); // 別の時間帯の軌跡とはつながない
            batPoseAt(def, s, batTrailPose);
            applyBatPose(batTrailPose);
            batModel.updateWorldMatrix(true, false);
            camera.worldToLocal(batTrailTip.copy(BAT_TRAIL_TIP).applyMatrix4(batModel.matrixWorld));
            camera.worldToLocal(batTrailBase.copy(BAT_TRAIL_BASE).applyMatrix4(batModel.matrixWorld));
            batRibbon.push(batTrailTip, batTrailBase, game.trailNow - (batState.time - s));
            lastTrail = s;
        }
    }
}

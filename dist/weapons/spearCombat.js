import * as THREE from 'three';
import * as sfx from '../audio.js';
import { playSwish } from '../audio.js';
import { easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, linear } from '../ease.js';
import { DEG, catmullRom } from '../math.js';
import { camera, controls, scene } from '../core.js';
import { SPEAR_BLADE_BASE_Y, SPEAR_BUTT_Y, SPEAR_REST_TIP, SPEAR_TIP_Y, createSpear } from './spear.js';
import { skinMats, spearModel, spearRest } from './viewModels.js';
import { Ribbon, SWORD_RIBBON, TRAIL_STEP, makeRibbonMaterial, tintRibbon } from '../fx/ribbons.js';
import { hitWithArcs } from '../fx/arcs.js';
import { dressModel, onSkinChange, skinFx, skinOf } from './skins.js';
import { DEFAULT_KNOCK, enemies, hitDir, hitPoint, setEn } from '../enemy/state.js';
import { knockEnemy } from '../enemy/motion.js';
import { SWING_SAMPLE, game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
import { tryWallHit } from './wallHit.js';
import { castHit, castThrow } from '../world/raycast.js';
import { player, velocity } from '../player/state.js';
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
// 刃先の向き: 左へ薙ぐなら、切っ先を上から見て左回りに回す向き（= 上 × 切っ先）
function edgeOf(e, tip) {
    if (e === undefined)
        return DOWN.clone();
    if (e === 'left')
        return new THREE.Vector3().crossVectors(UP, tip).normalize();
    if (e === 'right')
        return new THREE.Vector3().crossVectors(tip, UP).normalize();
    if ('about' in e)
        return new THREE.Vector3().crossVectors(new THREE.Vector3(...e.about), tip).normalize();
    return new THREE.Vector3(...e).normalize();
}
function makeSpearAttack(def) {
    const keys = def.keys.map((k) => {
        const tip = k.tip ? new THREE.Vector3(...k.tip).normalize() : SPEAR_REST_TIP.clone();
        return { t: k.t, pos: new THREE.Vector3(...(k.pos ?? [0, 0, 0])), tip, edge: edgeOf(k.edge, tip), ease: k.ease ?? easeInOutCubic };
    });
    return { ...def, keys, duration: keys[keys.length - 1].t, lungeAt: def.lungeAt ?? def.hits[0][0] - 0.04 };
}
const spinAxis = new THREE.Vector3();
function spinTip(s, u) {
    spinAxis.set(...s.axis).normalize();
    const v = new THREE.Vector3(...s.from).normalize().applyAxisAngle(spinAxis, u * s.turns * Math.PI * 2);
    return [v.x, v.y, v.z];
}
const spinPos = (s, u) => {
    const [a, b] = [s.pos, s.pos1 ?? s.pos];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};
// 回し始めの key（t0 の 1 つ）。ここへ振りかぶってから回す
const spinStart = (s, ease = easeOutCubic) => ({ t: s.t0, pos: s.pos, tip: s.from, edge: { about: s.axis }, ease });
// 回している間の key。60 度ごとに置いて、同じ速さで回す
function spinKeys(s) {
    const n = Math.max(2, Math.ceil(s.turns * 6));
    const keys = [];
    for (let k = 1; k <= n; k++) {
        const u = k / n;
        keys.push({ t: s.t0 + (s.t1 - s.t0) * u, pos: spinPos(s, u), tip: spinTip(s, u), edge: { about: s.axis }, ease: linear });
    }
    return keys;
}
// 回し終えてから少しだけ回り続けて止まる key
const spinSettle = (s, t, more = 0.08) => ({ t, pos: s.pos1 ?? s.pos, tip: spinTip(s, 1 + more / s.turns), edge: { about: s.axis }, ease: easeOutCubic });
// 穂先か石突きが正面（視線から PASS_CONE の内）を通る時間帯。ここで当たりを調べる
const PASS_CONE = Math.cos(50 * DEG);
function spinPasses(s, scale = 1) {
    const out = [];
    const N = 240;
    let from = -1;
    for (let i = 0; i <= N; i++) {
        const u = i / N;
        const z = spinTip(s, u)[2];
        const front = z < -PASS_CONE || z > PASS_CONE; // 穂先（-Z）か石突き（切っ先の逆）が前
        const t = s.t0 + (s.t1 - s.t0) * u;
        if (front && from < 0)
            from = t;
        if ((!front || i === N) && from >= 0) {
            // 回し始めや回し終えの、構えたまま正面を向いている一瞬は数えない（振り抜いて通ったときだけ当てる）
            if (t - from > 0.03)
                out.push([from, t, scale]);
            from = -1;
        }
    }
    return out;
}
// 正面を通るたびに鳴らす風切り音
const passSwishes = (w, gain = 0.45) => w.map(([a]) => ({ at: Math.max(0, a - 0.04), dur: 0.12, f0: 220, f1: 950, gain }));
export const SPEAR_REACH = 3.4; // 剣（2.9）・斧（2.8）より長い
export const SPEAR_SWEEP_ANGLE = 85 * DEG; // 薙ぎは横に広く当たる
export const SPEAR_BUFFER = 0.3;
export const SPEAR_COMBO_RESET = 0.45;
// 1 段目: 穂先を右の後ろへ引いてから、少し傾けた水平の面で右から左へひと回りと少し回す。
// 穂先 → 石突き → 穂先の順に正面を通る
const TWIRL_1 = { t0: 0.1, t1: 0.4, axis: [0.12, 1, 0.08], from: [0.55, 0.15, 0.82], turns: 1.2, pos: [0.08, 0.02, 0.04], pos1: [-0.06, 0, 0] };
const TWIRL_1_HITS = spinPasses(TWIRL_1);
export const SPEAR_TWIRL_1 = makeSpearAttack({
    keys: [{ t: 0 }, spinStart(TWIRL_1), ...spinKeys(TWIRL_1), spinSettle(TWIRL_1, 0.5), { t: 0.78 }],
    trails: [[TWIRL_1.t0, TWIRL_1.t1 + 0.06]],
    hits: TWIRL_1_HITS,
    reach: SPEAR_REACH,
    angle: SPEAR_SWEEP_ANGLE,
    impact: TWIRL_1_HITS[0][0],
    passKick: [0, 0.9, -0.8],
    kick: [-0.3, 1.6, -1.6],
    windKick: [0.2, -1, 0.8],
    lunge: 2.5,
    cancel: 0.46,
    swishes: passSwishes(TWIRL_1_HITS),
    knock: 220,
    hitStop: 0.05,
    fx: 1,
    dmg: 1.05,
});
// 2 段目: 左の後ろへ流れた穂先から、逆の傾きの面で左から右へひと回りと少し回す
const TWIRL_2 = { t0: 0.1, t1: 0.4, axis: [-0.12, -1, 0.1], from: [-0.55, 0.05, 0.82], turns: 1.2, pos: [-0.06, 0.0, 0.04], pos1: [0.06, 0.02, 0] };
const TWIRL_2_HITS = spinPasses(TWIRL_2);
export const SPEAR_TWIRL_2 = makeSpearAttack({
    keys: [{ t: 0 }, spinStart(TWIRL_2), ...spinKeys(TWIRL_2), spinSettle(TWIRL_2, 0.5), { t: 0.78 }],
    trails: [[TWIRL_2.t0, TWIRL_2.t1 + 0.06]],
    hits: TWIRL_2_HITS,
    reach: SPEAR_REACH,
    angle: SPEAR_SWEEP_ANGLE,
    impact: TWIRL_2_HITS[0][0],
    passKick: [0, -0.9, 0.8],
    kick: [-0.3, -1.6, 1.6],
    windKick: [0.2, 1, -0.8],
    lunge: 2.5,
    cancel: 0.46,
    swishes: passSwishes(TWIRL_2_HITS),
    knock: 220,
    hitStop: 0.05,
    fx: 1,
    dmg: 1.05,
});
// 3 段目: 体の右で槍を縦に回す風車。穂先を後ろの下へ引いてから、前の下 → 前の上へと斬り上げる向きに 1 回転半
const WHEEL = { t0: 0.1, t1: 0.46, axis: [1, 0, 0.1], from: [0.1, -0.7, 0.7], turns: 1.5, pos: [0.08, 0.02, -0.04] };
const WHEEL_HITS = spinPasses(WHEEL);
export const SPEAR_WHEEL = makeSpearAttack({
    keys: [{ t: 0 }, spinStart(WHEEL), ...spinKeys(WHEEL), spinSettle(WHEEL, 0.56), { t: 0.85 }],
    trails: [[WHEEL.t0, WHEEL.t1 + 0.06]],
    hits: WHEEL_HITS,
    reach: SPEAR_REACH,
    angle: 70 * DEG,
    impact: WHEEL_HITS[WHEEL_HITS.length - 1][0],
    passKick: [-1, 0, 0],
    kick: [1.8, 0, 0.6],
    windKick: [-0.6, 0, 0],
    lunge: 2.5,
    cancel: 0.52,
    swishes: passSwishes(WHEEL_HITS),
    knock: 260,
    hitStop: 0.05,
    fx: 1,
    dmg: 1.05,
});
// 4 段目: 両手を頭の上へ上げ、槍を水平に頭上で 2 回転させる。周りぐるりの敵に、穂先と石突きが通るたびに当たる
const HELI = { t0: 0.14, t1: 0.6, axis: [0, 1, 0], from: [0.7, -0.25, 0.65], turns: 2, pos: [0.0, 0.42, 0.12] };
const HELI_HITS = spinPasses(HELI);
export const SPEAR_HELI = makeSpearAttack({
    keys: [{ t: 0 }, spinStart(HELI), ...spinKeys(HELI), spinSettle(HELI, 0.7, 0.12), { t: 1.0 }],
    trails: [[HELI.t0, HELI.t1 + 0.06]],
    hits: HELI_HITS,
    reach: SPEAR_REACH,
    angle: Math.PI,
    impact: HELI_HITS[0][0],
    passKick: [0, 0.7, -0.4],
    kick: [-0.6, 1.4, -1],
    windKick: [0.6, 0, 0],
    lunge: 1.5,
    cancel: 0.66,
    swishes: passSwishes(HELI_HITS, 0.5),
    knock: 200,
    hitStop: 0.04,
    fx: 1,
    dmg: 0.85,
});
// 5 段目（締め）: 体の右で風車を 2 回してから、穂先を右の後ろ上へ高く振りかぶり、右上から左下へ斜めに叩き斬る。
// 斬ったら穂先を左下に止めて残心。風車でも正面を通るたびに軽く当たる
const FINISH_WHEEL = { t0: 0.06, t1: 0.5, axis: [1, 0, 0], from: [0.0, 0.3, -1], turns: 2, pos: [0.06, 0.05, -0.07] };
const SLAM_AXIS = [-0.45, 0.26, 0.07]; // 叩き斬りの回る軸（右上の後ろ → 左下の前を通る面に直交）
const SLAM = [0.64, 0.72];
export const SPEAR_FINISHER = makeSpearAttack({
    keys: [
        { t: 0 },
        spinStart(FINISH_WHEEL, easeOutCubic),
        ...spinKeys(FINISH_WHEEL),
        { t: 0.56, pos: [0.1, 0.1, 0.04], tip: [0.4, 0.85, 0.35], edge: { about: [1, 0, 0] }, ease: easeOutCubic }, // 右の後ろ上へ振りかぶる
        { t: 0.62, pos: [0.12, 0.12, 0.1], tip: [0.5, 0.75, 0.45], edge: { about: SLAM_AXIS }, ease: easeInQuad }, // 引き絞る
        { t: 0.66, pos: [0.04, 0.04, -0.08], tip: [0.35, 0.3, -0.9], edge: { about: SLAM_AXIS }, ease: linear },
        { t: 0.7, pos: [-0.08, -0.06, -0.1], tip: [-0.4, -0.5, -0.75], edge: { about: SLAM_AXIS }, ease: easeOutCubic }, // 叩き斬る
        { t: 0.78, pos: [-0.1, -0.08, -0.08], tip: [-0.5, -0.6, -0.6], edge: { about: SLAM_AXIS }, ease: easeOutBack }, // 振り切って止める
        { t: 0.96, pos: [-0.1, -0.08, -0.08], tip: [-0.5, -0.58, -0.62], edge: { about: SLAM_AXIS } }, // 残心
        { t: 1.28 },
    ],
    trails: [[FINISH_WHEEL.t0, FINISH_WHEEL.t1], [0.62, 0.74]],
    hits: [...spinPasses(FINISH_WHEEL, 0.25), SLAM],
    reach: 3.6,
    angle: 75 * DEG,
    impact: 0.68,
    passKick: [-0.6, 0, 0],
    lungeAt: 0.62,
    kick: [-3.2, -0.8, 2],
    windKick: [0.4, 0, 0],
    lunge: 5,
    cancel: 0.94,
    fovPunch: -8,
    dip: 1.4,
    swishes: [...passSwishes(spinPasses(FINISH_WHEEL), 0.3), { at: 0.62, dur: 0.16, f0: 220, f1: 1100, gain: 0.8 }],
    knock: 560,
    hitStop: 0.16,
    fx: 1.7,
    dmg: 4,
});
// ---- 溜め攻撃（左クリック長押し） ----
// 押してすぐ離せば普段の攻撃。SPEAR_CHARGE_DELAY より長く押すと穂先を右の後ろへ引いて溜め始め（石突きが左の手前へ出る）、
// 溜めきってから離すと、水平に 2 回転して周りをまとめて薙ぐ。穂先と石突きが通るたびに周りぐるりの敵に当たる
export const SPEAR_CHARGE_DELAY = 0.18;
export const SPEAR_CHARGE_TIME = 0.55;
const CHARGE_POS = [0.12, 0.0, 0.07];
const CHARGE_TIP = [0.62, 0.0, 0.78];
const CHARGE_SPIN = { t0: 0.03, t1: 0.43, axis: [0, 1, 0], from: [0.6, 0.02, 0.8], turns: 2, pos: [0.12, 0, 0.06], pos1: [-0.02, 0.01, -0.04] };
const CHARGE_HITS = spinPasses(CHARGE_SPIN);
export const SPEAR_SPIN = makeSpearAttack({
    keys: [{ t: 0 }, spinStart(CHARGE_SPIN, easeInQuad), ...spinKeys(CHARGE_SPIN), spinSettle(CHARGE_SPIN, 0.55, 0.1), { t: 0.9 }],
    trails: [[CHARGE_SPIN.t0, CHARGE_SPIN.t1 + 0.06]],
    hits: CHARGE_HITS,
    reach: 3.6,
    angle: Math.PI,
    impact: CHARGE_HITS[0][0],
    passKick: [0, 1.2, -0.8],
    lungeAt: 0.02,
    kick: [-0.6, 3, -2],
    lunge: 3,
    cancel: 0.6,
    fovPunch: 6,
    swishes: passSwishes(CHARGE_HITS, 0.7),
    knock: 420,
    hitStop: 0.08,
    fx: 1.4,
    dmg: 1.2,
});
export const SPEAR_COMBO = [SPEAR_TWIRL_1, SPEAR_TWIRL_2, SPEAR_WHEEL, SPEAR_HELI, SPEAR_FINISHER];
export const SPEAR_ATTACKS = {
    twirl1: SPEAR_TWIRL_1, twirl2: SPEAR_TWIRL_2, wheel: SPEAR_WHEEL, heli: SPEAR_HELI, finisher: SPEAR_FINISHER, spin: SPEAR_SPIN,
};
// 本体からも読み書きする値
export const spearState = {
    attack: null,
    time: 0,
    pressed: false,
    comboStep: 0,
    hold: -1, // 左クリックを押してからの時間。負なら押していない（または普段の攻撃を始めた）
    chargeBlend: 0, // 0 = 普段の構え, 1 = 溜めの構え
    guard: 0, // 風車受けの回り具合。0 = 構え, 1 = 回しきっている
    guardAngle: 0, // 風車受けで回した角度 (rad)
    guardGauge: 1, // 風車受けのゲージ (0〜1)。回している間は減り、回していない間は溜まる
};
export const spearCharged = () => spearState.hold >= SPEAR_CHARGE_DELAY + SPEAR_CHARGE_TIME;
const spearSwish = () => skinOf('spear').swish ?? 'axe'; // 振りの風切り音（スキンが音を持てばその音）
let queued = false;
let comboTimer = 0;
let firedSwishes = 0;
let firedImpact = false;
let firedLunge = false;
let landedAny = false; // 今の攻撃でどれかに当たった
let triedWall = false;
let hitWindow = -1; // いま当たりを調べている時間帯
const spearHits = new Set(); // 今の時間帯で当てた敵
let spearBossHit = false;
export const spearReady = () => game.shownWeapon === 'spear' && game.wantWeapon === 'spear' && game.holster === 0 && spearThrow.phase === 'none';
const newSpearPose = () => ({ pos: new THREE.Vector3(), tip: SPEAR_REST_TIP.clone(), edge: DOWN.clone() });
const spearFrom = newSpearPose(); // 攻撃を始めた瞬間の構え
const spearCur = newSpearPose();
const spearTmp = newSpearPose();
function evalSpearAttack(def, t, out) {
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
    out.edge.lerpVectors(k0.edge, k1.edge, e);
}
// 振りかぶりの key までの間に、攻撃開始時の構えから滑らかに移る
export function spearPoseAt(def, t, out) {
    evalSpearAttack(def, t, spearTmp);
    const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
    out.pos.lerpVectors(spearFrom.pos, spearTmp.pos, w);
    out.tip.lerpVectors(spearFrom.tip, spearTmp.tip, w).normalize();
    out.edge.lerpVectors(spearFrom.edge, spearTmp.edge, w);
}
// 切っ先をローカル +Y、刃先をローカル +X に向ける。刃先は切っ先に直交するよう直す
const basis = new THREE.Matrix4();
const edgeDir = new THREE.Vector3();
const faceDir = new THREE.Vector3();
export function applySpearPose(p) {
    spearRest.position.copy(p.pos);
    edgeDir.copy(p.edge).addScaledVector(p.tip, -p.edge.dot(p.tip));
    if (edgeDir.lengthSq() < 1e-8)
        edgeDir.set(1, 0, 0).addScaledVector(p.tip, -p.tip.x); // 刃先の向きが切っ先と重なったら右へ
    edgeDir.normalize();
    faceDir.crossVectors(edgeDir, p.tip);
    spearRest.quaternion.setFromRotationMatrix(basis.makeBasis(edgeDir, p.tip, faceDir));
}
export function startSpearAttack(def) {
    spearFrom.pos.copy(spearCur.pos);
    spearFrom.tip.copy(spearCur.tip);
    spearFrom.edge.copy(spearCur.edge);
    spearState.attack = def;
    spearState.time = 0;
    queued = false;
    firedSwishes = 0;
    firedImpact = false;
    firedLunge = false;
    landedAny = false;
    triedWall = false;
    hitWindow = -1;
    spearHits.clear();
    spearBossHit = false;
    lastTrail = -Infinity;
    spearRibbon.cut();
    buttRibbon.cut();
    if (def.windKick) {
        kickVel.x += def.windKick[0] * DEG * 10;
        kickVel.y += def.windKick[1] * DEG * 10;
        kickVel.z += def.windKick[2] * DEG * 10;
    }
}
function chooseSpearAttack() {
    const def = SPEAR_COMBO[spearState.comboStep];
    spearState.comboStep = (spearState.comboStep + 1) % SPEAR_COMBO.length;
    return def;
}
// ---- 当たり ----
// 正面にあるほうの端（刃の中ほどか、石突きの近く）が敵を捉えた場所を当たりの位置にする
const BLADE_HIT_LOCAL = new THREE.Vector3(0, (SPEAR_BLADE_BASE_Y + SPEAR_TIP_Y) / 2, 0); // 槍のローカル座標
const BUTT_HIT_LOCAL = new THREE.Vector3(0, SPEAR_BUTT_Y + 0.1, 0);
const BUTT_DMG = 0.7; // 石突きで打ったときのダメージの倍率
const spearHitAt = new THREE.Vector3();
const spearSwing = new THREE.Vector3();
const spearTmpHit = newSpearPose();
function spearPointAt(def, t, local, out) {
    spearPoseAt(def, t, spearTmpHit);
    applySpearPose(spearTmpHit);
    spearModel.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(spearModel.matrixWorld);
}
// 届く範囲にいる敵（今の時間帯でまだ当てていないもの）すべてに当てる。時間帯の間ずっと調べるので、
// 振りが通り過ぎる間に範囲へ入った敵にも当たる
function trySpearHit(def, scale) {
    let any = false;
    let dmgScale = scale;
    const hitOne = () => {
        if (!any) {
            camera.updateMatrixWorld();
            spearPoseAt(def, spearState.time, spearTmpHit);
            const butt = spearTmpHit.tip.z > 0; // 切っ先が後ろ = 石突きが前
            const local = butt ? BUTT_HIT_LOCAL : BLADE_HIT_LOCAL;
            if (butt)
                dmgScale *= BUTT_DMG;
            spearPointAt(def, Math.max(0, spearState.time - SWING_SAMPLE), local, spearSwing);
            spearSwing.subVectors(spearPointAt(def, spearState.time + SWING_SAMPLE, local, spearHitAt), spearSwing);
            spearPointAt(def, spearState.time, local, spearHitAt);
        }
        any = true;
        hooks.hitPointFromTip(spearHitAt, hitPoint);
        hitWithArcs(skinOf('spear'), def.fx ?? 1, spearSwing, () => hooks.applyHit(def, hitPoint, 'sword', spearSwing, undefined, dmgScale));
        skinFx.flare = 1; // スキンの飾りを光らせる
    };
    for (const e of enemies) {
        if (spearHits.has(e))
            continue;
        setEn(e);
        if (!hooks.inReachOf(def.reach, def.angle))
            continue;
        spearHits.add(e);
        hitOne();
        if (e.alive && !hooks.enemyHeld())
            knockEnemy(hitDir, def.knock ?? DEFAULT_KNOCK);
    }
    // ボスの機体（時間帯ごとに 1 回）
    if (!spearBossHit && hooks.bossInReach(def.reach, def.angle)) {
        spearBossHit = true;
        hitOne();
    }
    if (any)
        landedAny = true;
}
function updateSpearAttack(dt) {
    if (spearState.pressed) {
        spearState.pressed = false;
        if (spearState.guard > SPEAR_GUARD_ON && spearReady()) {
            startSpearRush(); // 回しているときは振らずに突進突き
        }
        else if (spearReady() && !rushBusy()) {
            if (spearState.attack && spearState.time >= spearState.attack.cancel - SPEAR_BUFFER)
                queued = true;
            spearState.hold = 0; // 離すまで、普段の攻撃か溜めかを決めない（振っている間も押し続けているかを見る）
        }
    }
    // 長押しの溜め
    if (spearState.hold >= 0) {
        if (!controls.isLocked || !spearReady()) {
            spearState.hold = -1;
        }
        else if (spearState.attack) {
            // 振っている最中に押した: すぐ離せば次の段へつなぎ、押し続けていれば振り終えたところで溜めの構えへ
            spearState.hold += dt;
            if (!game.attackHeld) {
                spearState.hold = -1;
                if (spearState.time >= spearState.attack.cancel - SPEAR_BUFFER)
                    queued = true;
            }
            else if (spearState.hold >= SPEAR_CHARGE_DELAY && spearState.time >= spearState.attack.cancel) {
                spearExit.pos.copy(spearCur.pos);
                spearExit.tip.copy(spearCur.tip);
                spearExit.edge.copy(spearCur.edge);
                spearExitBlend = 1;
                spearState.attack = null;
                queued = false;
                comboTimer = SPEAR_COMBO_RESET;
                spearState.hold = SPEAR_CHARGE_DELAY - 1e-4; // 次のフレームで溜めの構えに入る（溜める時間はここから数える）
            }
        }
        else {
            const wasStance = spearState.hold >= SPEAR_CHARGE_DELAY;
            const wasCharged = spearCharged();
            spearState.hold += dt;
            if (!wasStance && spearState.hold >= SPEAR_CHARGE_DELAY) {
                playSwish({ at: 0, dur: 0.25, f0: 200, f1: 600, gain: 0.25 }, spearSwish());
            }
            if (!wasCharged && spearCharged()) {
                sfx.playCharge(2); // 溜めきった「キン」
                hooks.addTrauma(0.1);
            }
            if (!game.attackHeld) {
                const charged = spearCharged();
                spearState.hold = -1;
                startSpearAttack(charged ? SPEAR_SPIN : chooseSpearAttack());
            }
        }
    }
    if (spearState.attack) {
        spearState.time += dt;
        const def = spearState.attack;
        const t = spearState.time;
        while (firedSwishes < def.swishes.length && t >= def.swishes[firedSwishes].at) {
            playSwish(def.swishes[firedSwishes++], spearSwish());
        }
        if (!firedLunge && t >= def.lungeAt) {
            firedLunge = true;
            hooks.applyLunge(def.lunge);
        }
        if (!firedImpact && t >= def.impact) {
            firedImpact = true;
            kickVel.x += def.kick[0] * DEG * 22;
            kickVel.y += def.kick[1] * DEG * 22;
            kickVel.z += def.kick[2] * DEG * 22;
            hooks.addTrauma(0.06);
            game.fovKick += def.fovPunch ?? 0;
            game.landDipVel -= def.dip ?? 0;
        }
        // 当たりの時間帯: 入るたびに当てた敵を数え直し、小さく反動を付ける
        const w = def.hits.findIndex(([a, b]) => t >= a && t <= b + dt);
        if (w >= 0) {
            if (w !== hitWindow) {
                hitWindow = w;
                spearHits.clear();
                spearBossHit = false;
                if (def.passKick) {
                    kickVel.x += def.passKick[0] * DEG * 10;
                    kickVel.y += def.passKick[1] * DEG * 10;
                    kickVel.z += def.passKick[2] * DEG * 10;
                }
            }
            trySpearHit(def, def.hits[w][2] ?? 1);
        }
        // 何にも当たらずに回し終えたら、壁や床に届いていれば弾かれる
        const lastHit = def.hits[def.hits.length - 1][1];
        if (!triedWall && !landedAny && t > lastHit) {
            triedWall = true;
            camera.updateMatrixWorld();
            spearPointAt(def, Math.max(0, def.impact - SWING_SAMPLE), BLADE_HIT_LOCAL, spearSwing);
            spearSwing.subVectors(spearPointAt(def, def.impact + SWING_SAMPLE, BLADE_HIT_LOCAL, spearHitAt), spearSwing);
            tryWallHit('spear', def.reach * 0.8, 'blade', spearSwing, def.fx ?? 1);
        }
        // 押し続けている間は、離すか溜めに移るまで次の段を待つ
        if (queued && t >= def.cancel && !(spearState.hold >= 0 && game.attackHeld)) {
            startSpearAttack(chooseSpearAttack());
        }
        else if (t >= def.duration) {
            spearState.attack = null;
            comboTimer = SPEAR_COMBO_RESET;
        }
    }
    else if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0)
            spearState.comboStep = 0;
    }
    // 持ち替えたら最初の段から
    if (game.shownWeapon !== 'spear') {
        spearState.attack = null;
        spearState.comboStep = 0;
        spearState.hold = -1;
        spearState.guard = 0;
    }
    const stance = spearState.hold >= SPEAR_CHARGE_DELAY;
    spearState.chargeBlend += ((stance ? 1 : 0) - spearState.chargeBlend) * Math.min(1, dt * (stance ? 14 : 10));
}
// ---- 風車受け（右クリック長押し） ----
// 押している間、体の前の右寄りで、視線にほぼ直交する面で槍を回し続ける（押し始めは回りながら速くなる）。
// 回りきっている間は、正面から体へ向かってくる弾を弾き返す（パリィと同じ。combat/parry.ts）。
// 穂先か石突きが半回転ごとに上を通るたび、近くの正面の敵に軽く当てて押し返す。回している間は歩くのが遅くなる。
// 振っている途中で押したら、すぐ振るのをやめて回し始める。
// 回していられるのはゲージの分だけ（クロスヘアの下の帯）。回している間は減り、やめて少しすると溜まり直す。
// 使い切ったら、ある程度溜まるまで回せない（押すと帯が震える）
export const SPEAR_GUARD_SPIN = 3.4 * Math.PI * 2; // 回す速さ (rad/s)
const GUARD_GAUGE_TIME = 2.5; // 満タンから回し続けていられる時間 (s)
const GUARD_REFILL_TIME = 3.5; // 空から満タンまで溜まる時間 (s)
const GUARD_REFILL_DELAY = 0.5; // やめてから溜まり始めるまで (s)
const GUARD_RESUME = 0.3; // 使い切ったあと、ここまで溜まると回せる
let guardSpent = false; // 使い切って、溜まり直すのを待っている
let guardIdle = 0; // 回すのをやめてからの時間
let guardHeldPrev = false;
let guardEmptyFlash = 0;
let guardShownReady = true;
const guardHud = document.getElementById('spingauge');
const guardFill = guardHud.querySelector('.f');
export const SPEAR_GUARD_ON = 0.6; // guard がこれを超えたら弾を弾き、敵を打ち払う
export const SPEAR_GUARD_SLOW = 0.55; // 回しきっているときの歩く速さの倍率
const GUARD_AXIS = new THREE.Vector3(0.35, 0.15, -1).normalize(); // 回す面の軸（ほぼ視線の向き）
const GUARD_BASE = new THREE.Vector3(0, 1, 0).addScaledVector(GUARD_AXIS, -GUARD_AXIS.y).normalize(); // 回し始めの切っ先の向き（上）
const GUARD_POS = new THREE.Vector3(0.06, -0.06, -0.06); // 支点を少し前の右下へ
const GUARD_REACH = 2.4;
const GUARD_ANGLE = 60 * DEG;
export const GUARD_HIT = { kick: [-0.2, 0, 0], knock: 300, hitStop: 0.03, fx: 0.8, dmg: 0.35 };
const GUARD_SWISH = { at: 0, dur: 0.1, f0: 240, f1: 800, gain: 0.25 };
const guardPose = newSpearPose();
const guardEdgeWorld = new THREE.Vector3();
function guardPoseAt(angle, out) {
    out.pos.copy(GUARD_POS);
    out.tip.copy(GUARD_BASE).applyAxisAngle(GUARD_AXIS, angle);
    out.edge.crossVectors(GUARD_AXIS, out.tip);
}
// ---- 突進突き（風車受けの最中に左クリック） ----
// 回すのをやめて、いったん少し引いてから穂先を照準へまっすぐ突き出し、見ている向き（上下も含む）へ一定の速さで突っ込む。上を見れば飛び上がり、下を見れば斜めに降りる。
// 突き出している間、穂先の前の細い範囲に入った敵を 1 体につき 1 回ずつ貫いて押し飛ばす（止まらずに抜ける）。ゲージを少し使う
const RUSH_TIME = 0.32; // 突っ込む長さ
const RUSH_END = 0.2; // 突っ込み終えてから構えに戻りきるまで。戻っている途中でも、攻撃・溜め・風車受けへすぐ移れる
const RUSH_PULL = 0.035; // 引いている長さ
const RUSH_THRUST = 0.07; // 引いた所から突き出しきるまで
const RUSH_SPEED = 44; // (m/s)。0.32 秒で約 14m
const RUSH_EXIT = 8; // やめたときに残す水平の速さの上限 (m/s)。勢いを少し残して滑り込む
const RUSH_EXIT_UP = 4; // やめたときに残す上向きの速さの上限 (m/s)
const RUSH_COST = 0.15; // 始めたときに使うゲージ
const RUSH_REACH = 3.2;
const RUSH_ANGLE = 28 * DEG;
export const RUSH_HIT = { kick: [-1.2, 0, 0], knock: 700, hitStop: 0.06, fx: 1.3, dmg: 2.4 };
const RUSH_TIP = new THREE.Vector3(-0.02, 0.05, -1).normalize(); // 支点から照準の少し先を指す向き
const RUSH_PULL_POS = new THREE.Vector3(0.02, 0, 0.1); // 引いた所
const RUSH_OUT_POS = new THREE.Vector3(-0.03, 0.04, -0.4); // 突き出した所
let rushT = -1; // 突進突きを始めてからの時間。負なら突いていない
let rushMoving = false;
const rushBusy = () => rushT >= 0 && rushT < RUSH_PULL + RUSH_TIME; // 引いて突っ込んでいる間（ほかの操作を受け付けない）
let rushBoss = false;
const rushHits = new Set();
const rushDir = new THREE.Vector3();
const rushFwd = new THREE.Vector3();
const rushPos = new THREE.Vector3();
function startSpearRush() {
    // 回していた形から突きの形へつなぐ
    spearExit.pos.copy(spearCur.pos);
    spearExit.tip.copy(spearCur.tip);
    spearExit.edge.copy(spearCur.edge);
    spearExitBlend = 1;
    spearState.guard = 0;
    spearState.guardAngle = 0;
    rushT = 0;
    rushMoving = false;
    rushBoss = false;
    rushHits.clear();
    spearRibbon.cut();
    buttRibbon.cut();
    spearState.guardGauge = Math.max(0, spearState.guardGauge - RUSH_COST);
}
function stopRushMove() {
    rushMoving = false;
    const h = Math.hypot(velocity.x, velocity.z);
    if (h > RUSH_EXIT) {
        velocity.x *= RUSH_EXIT / h;
        velocity.z *= RUSH_EXIT / h;
    }
    velocity.y = THREE.MathUtils.clamp(velocity.y, -RUSH_EXIT, RUSH_EXIT_UP); // 上へ突っ込んだあとは少しだけ浮く
}
function updateSpearRush(dt) {
    if (rushT < 0)
        return;
    if (!spearReady() || !controls.isLocked) {
        if (rushMoving)
            stopRushMove();
        rushT = -1;
        return;
    }
    const before = rushT;
    rushT += dt;
    // 突き出す瞬間に地面を蹴って飛び出す（剣の突進と同じ踏み込みの音）
    if (before < RUSH_PULL && rushT >= RUSH_PULL) {
        rushMoving = true;
        hooks.addTrauma(0.22);
        game.fovKick += 14;
        kickVel.x += -3 * DEG * 10;
        sfx.playRush();
        playSwish({ at: 0, dur: 0.22, f0: 220, f1: 1100, gain: 0.4 }, spearSwish());
    }
    if (rushMoving) {
        // 突っ込んでいる間は視野を広げたまま、画面を細かく揺らし続ける
        game.fovKick = Math.max(game.fovKick, 12);
        hooks.addTrauma(0.8 * dt);
        camera.getWorldDirection(rushDir);
        // 地面に立っていて下を向いているときは、床へめり込まないよう水平に進む
        if (player.onGround && rushDir.y < 0)
            rushDir.y = 0;
        if (rushDir.lengthSq() < 1e-6)
            rushDir.set(0, 0, -1);
        rushDir.normalize();
        velocity.copy(rushDir).multiplyScalar(RUSH_SPEED);
        rushHit();
        if (rushT >= RUSH_PULL + RUSH_TIME)
            stopRushMove();
    }
    // 突っ込み終えたあとは、次の攻撃・溜め・風車受けへ移ったら構えへ戻すのをやめる（今の形から滑らかにつなぐ）
    if (!rushMoving && rushT >= RUSH_PULL + RUSH_TIME && (spearState.attack || spearState.hold >= 0 || spearState.guard > 0)) {
        spearExit.pos.copy(spearCur.pos);
        spearExit.tip.copy(spearCur.tip);
        spearExit.edge.copy(spearCur.edge);
        spearExitBlend = 1;
        rushT = -1;
    }
    if (rushT >= RUSH_PULL + RUSH_TIME + RUSH_END)
        rushT = -1;
}
// 穂先の前の細い範囲にいる敵を、1 体につき 1 回ずつ貫く
function rushHit() {
    camera.updateMatrixWorld();
    spearModel.updateWorldMatrix(true, false);
    spearHitAt.copy(BLADE_HIT_LOCAL).applyMatrix4(spearModel.matrixWorld);
    camera.getWorldDirection(rushFwd);
    for (const e of enemies) {
        if (rushHits.has(e))
            continue;
        setEn(e);
        if (!hooks.inReachOf(RUSH_REACH, RUSH_ANGLE))
            continue;
        rushHits.add(e);
        hooks.hitPointFromTip(spearHitAt, hitPoint);
        hitWithArcs(skinOf('spear'), RUSH_HIT.fx ?? 1, rushFwd, () => hooks.applyHit(RUSH_HIT, hitPoint, 'sword', rushFwd));
        skinFx.flare = 1;
        if (e.alive && !hooks.enemyHeld())
            knockEnemy(hitDir, RUSH_HIT.knock ?? DEFAULT_KNOCK);
    }
    if (!rushBoss && hooks.bossInReach(RUSH_REACH, RUSH_ANGLE)) {
        rushBoss = true;
        hooks.hitPointFromTip(spearHitAt, hitPoint);
        hitWithArcs(skinOf('spear'), RUSH_HIT.fx ?? 1, rushFwd, () => hooks.applyHit(RUSH_HIT, hitPoint, 'sword', rushFwd));
    }
}
// 引いて → 突き出して止め → 突っ込み終えたら構えへ戻す。刃先は下のまま
function applyRushPose(p) {
    if (rushT < 0)
        return;
    const t = rushT;
    if (t < RUSH_PULL) {
        rushPos.copy(RUSH_PULL_POS).multiplyScalar(easeOutCubic(t / RUSH_PULL));
    }
    else {
        rushPos.lerpVectors(RUSH_PULL_POS, RUSH_OUT_POS, easeOutCubic(Math.min(1, (t - RUSH_PULL) / RUSH_THRUST)));
    }
    const back = THREE.MathUtils.clamp((t - RUSH_PULL - RUSH_TIME) / RUSH_END, 0, 1);
    const w = 1 - easeInOutCubic(back);
    // 突っ込んでいる間は、風を受けて穂先が細かく震える
    if (rushMoving) {
        const n = performance.now();
        rushPos.x += Math.sin(n * 0.083) * 0.004;
        rushPos.y += Math.sin(n * 0.107 + 1) * 0.004;
    }
    p.pos.lerp(rushPos, w);
    p.tip.lerp(RUSH_TIP, w).normalize();
    p.edge.lerp(DOWN, w);
}
// 突き出している間、穂先の軌跡を残す
let rushTrailing = false;
function sampleRushTrail() {
    if (rushT < RUSH_PULL || rushT > RUSH_PULL + RUSH_THRUST + 0.04) {
        rushTrailing = false;
        return;
    }
    if (!rushTrailing) {
        rushTrailing = true;
        spearRibbon.cut();
    }
    spearModel.updateWorldMatrix(true, false);
    camera.worldToLocal(trailA.copy(SPEAR_TRAIL_TIP).applyMatrix4(spearModel.matrixWorld));
    camera.worldToLocal(trailB.copy(SPEAR_TRAIL_BASE).applyMatrix4(spearModel.matrixWorld));
    spearRibbon.push(trailA, trailB, game.trailNow);
}
// 半回転ごと: 近くの正面の敵すべてに軽く当てて押し返す
function guardPass() {
    const hit = GUARD_HIT;
    const reach = GUARD_REACH;
    const angle = GUARD_ANGLE;
    playSwish(GUARD_SWISH, spearSwish());
    kickVel.z += (Math.random() < 0.5 ? -0.3 : 0.3) * DEG * 10;
    guardPoseAt(spearState.guardAngle, guardPose);
    applySpearPose(guardPose);
    camera.updateMatrixWorld();
    spearModel.updateWorldMatrix(true, false);
    const butt = guardPose.tip.y < 0; // 上を通っているのが石突き
    spearHitAt.copy(butt ? BUTT_HIT_LOCAL : BLADE_HIT_LOCAL).applyMatrix4(spearModel.matrixWorld);
    guardEdgeWorld.copy(guardPose.edge).transformDirection(camera.matrixWorld);
    const scale = butt ? BUTT_DMG : 1;
    for (const e of enemies) {
        setEn(e);
        if (!hooks.inReachOf(reach, angle))
            continue;
        hooks.hitPointFromTip(spearHitAt, hitPoint);
        hitWithArcs(skinOf('spear'), hit.fx ?? 1, guardEdgeWorld, () => hooks.applyHit(hit, hitPoint, 'sword', guardEdgeWorld, undefined, scale));
        skinFx.flare = 1;
        if (e.alive && !hooks.enemyHeld())
            knockEnemy(hitDir, hit.knock ?? DEFAULT_KNOCK);
    }
    if (hooks.bossInReach(reach, angle)) {
        hooks.hitPointFromTip(spearHitAt, hitPoint);
        hitWithArcs(skinOf('spear'), hit.fx ?? 1, guardEdgeWorld, () => hooks.applyHit(hit, hitPoint, 'sword', guardEdgeWorld, undefined, scale));
        skinFx.flare = 1;
    }
}
function updateGuard(dt) {
    const atk = spearState.attack;
    // 使い切ったら、押し直しても溜まるまで回せない
    if (game.throwHeld && !guardHeldPrev && guardSpent && spearReady())
        guardEmptyFlash = 0.35;
    guardHeldPrev = game.throwHeld;
    updateSpearRush(dt);
    const want = !rushBusy() && game.throwHeld && !guardSpent && controls.isLocked && spearReady() && (atk !== null || spearState.hold < 0);
    if (want && atk) {
        // 振っている途中でも、すぐ振るのをやめて回し始める: 振っていた形から滑らかにつなぐ
        spearExit.pos.copy(spearCur.pos);
        spearExit.tip.copy(spearCur.tip);
        spearExit.edge.copy(spearCur.edge);
        spearExitBlend = 1;
        spearState.attack = null;
        queued = false;
        comboTimer = SPEAR_COMBO_RESET;
        spearState.hold = -1; // 振りながら左クリックを押し続けていても、溜めには移らない
    }
    spearState.guard += ((want ? 1 : 0) - spearState.guard) * Math.min(1, dt * (want ? 6 : 9));
    // ゲージ: 回そうとしている間は減り、やめて少しすると溜まる
    if (want) {
        guardIdle = 0;
        spearState.guardGauge = Math.max(0, spearState.guardGauge - dt / GUARD_GAUGE_TIME);
        if (spearState.guardGauge <= 0) {
            guardSpent = true;
            guardEmptyFlash = 0.35; // 使い切った瞬間も帯を震わせる
        }
    }
    else {
        guardIdle += dt;
        if (guardIdle >= GUARD_REFILL_DELAY)
            spearState.guardGauge = Math.min(1, spearState.guardGauge + dt / GUARD_REFILL_TIME);
        if (spearState.guardGauge >= GUARD_RESUME)
            guardSpent = false;
    }
    updateGuardHud(dt);
    if (spearState.guard < 0.01) {
        spearState.guard = 0;
        spearState.guardAngle = 0;
        return;
    }
    const prev = spearState.guardAngle;
    spearState.guardAngle += SPEAR_GUARD_SPIN * spearState.guard * spearState.guard * dt;
    if (spearState.guard > SPEAR_GUARD_ON && Math.floor(spearState.guardAngle / Math.PI) > Math.floor(prev / Math.PI))
        guardPass();
}
// ---- ダッシュの回し ----
// 構えているときにダッシュしたら、体の右で槍を縦に 1 回転させる（進む向きへ転がるように、穂先が下から後ろを通って上から前へ戻る）。
// 槍は長いので、回す面を外へ傾け、支点を右へ寄せて、両端がカメラから 0.4m ほど離れて通るようにしている。
// 角度は URL で試せる: ?dashAxis=1,-0.45,0（回す軸）&dashPos=0.12,-0.06,0（支点をずらす量）&dashTime=0.3（1 回転の時間）
const dashParams = new URLSearchParams(location.search);
const v3Param = (name, def) => {
    const v = dashParams.get(name)?.split(',').map(Number);
    return v && v.length === 3 && v.every(Number.isFinite) ? new THREE.Vector3(...v) : new THREE.Vector3(...def);
};
const DASH_SPIN_TIME = Number(dashParams.get('dashTime') ?? 0.3) || 0.3;
const DASH_SPIN_AXIS = v3Param('dashAxis', [1, -0.45, 0]).normalize();
const DASH_SPIN_POS = v3Param('dashPos', [0.12, -0.06, 0]); // 回している間は支点を右下へ
const DASH_SPIN_SWISH = { at: 0, dur: 0.12, f0: 260, f1: 900, gain: 0.3 };
let dashSpin = -1; // 回し始めてからの時間。負なら回していない
let wasDashing = false;
let dashSwishes = 0;
const dashEdge = new THREE.Vector3();
function updateDashSpin(dt) {
    const dashing = player.dashTime > 0;
    if (dashing && !wasDashing && spearReady() && !spearState.attack && spearState.hold < 0 && spearState.guard === 0) {
        dashSpin = 0;
        dashSwishes = 0;
        spearRibbon.cut();
        buttRibbon.cut();
    }
    wasDashing = dashing;
    if (dashSpin < 0)
        return;
    // 振り始め・溜め・風車受け・投げに移ったらやめる（振り始めは今の形から滑らかにつながる）
    if (spearState.attack || spearState.hold >= 0 || spearState.guard > 0 || !spearReady()) {
        dashSpin = -1;
        return;
    }
    dashSpin += dt;
    // 穂先と石突きが下を通るたびに風切り音
    while (dashSwishes < 2 && dashSpin >= dashSwishes * DASH_SPIN_TIME * 0.35) {
        playSwish(DASH_SPIN_SWISH, spearSwish());
        dashSwishes++;
    }
    if (dashSpin >= DASH_SPIN_TIME + 0.12)
        dashSpin = -1;
}
// 回し始めは速く、終わりで構えへ吸い付くように。回す面は構えの切っ先を軸に直交するよう倒した向きから始める
const dashFrom = new THREE.Vector3();
function applyDashSpin(p) {
    if (dashSpin < 0)
        return;
    const u = Math.min(1, dashSpin / DASH_SPIN_TIME);
    const inW = easeOutCubic(Math.min(1, dashSpin / 0.05));
    const outW = 1 - THREE.MathUtils.clamp((dashSpin - DASH_SPIN_TIME * 0.75) / (DASH_SPIN_TIME * 0.25 + 0.12), 0, 1);
    const w = easeInOutCubic(Math.min(inW, outW));
    dashFrom.copy(p.tip).addScaledVector(DASH_SPIN_AXIS, -p.tip.dot(DASH_SPIN_AXIS)).normalize();
    dashFrom.applyAxisAngle(DASH_SPIN_AXIS, -easeOutCubic(u) * Math.PI * 2);
    dashEdge.crossVectors(dashFrom, DASH_SPIN_AXIS).normalize(); // 刃先を回る向きへ
    p.tip.lerp(dashFrom, w).normalize();
    p.edge.lerp(dashEdge, w);
    p.pos.lerp(DASH_SPIN_POS, w);
}
// クロスヘアの下の帯: 槍を持っている間だけ出す。使える間は濃い墨、使い切って溜まり直している間は薄い墨
function updateGuardHud(dt) {
    guardEmptyFlash = Math.max(0, guardEmptyFlash - dt);
    const ready = !guardSpent;
    guardHud.classList.toggle('show', game.shownWeapon === 'spear');
    guardHud.classList.toggle('ready', ready);
    guardHud.classList.toggle('empty', guardEmptyFlash > 0);
    guardFill.style.transform = `scaleX(${spearState.guardGauge.toFixed(3)})`;
    if (ready && !guardShownReady) {
        guardHud.classList.remove('gain');
        void guardHud.offsetWidth;
        guardHud.classList.add('gain'); // また回せるようになった瞬間に光らせる
    }
    guardShownReady = ready;
}
const spearExit = newSpearPose(); // 振りの途中から溜めへ移ったときの、振っていた形
let spearExitBlend = 0;
const SPEAR_EXIT_TIME = 0.15;
const chargePos = new THREE.Vector3();
const chargeTip = new THREE.Vector3();
const chargeEdge = new THREE.Vector3();
// ---- 毎フレームの処理 ----
export function updateSpear(dt) {
    updateSpearAttack(dt);
    updateGuard(dt);
    updateSpearThrow(dt);
    updateDashSpin(dt);
    if (spearState.attack) {
        spearExitBlend = 0;
        sampleSpearTrail();
        spearPoseAt(spearState.attack, spearState.time, spearCur);
        applySpearPose(spearCur);
    }
    else {
        spearCur.pos.set(0, 0, 0);
        spearCur.tip.copy(SPEAR_REST_TIP);
        spearCur.edge.copy(DOWN);
        applyDashSpin(spearCur);
        // 溜めの構え。溜まるにつれて少しずつ引き絞り、溜めきったら槍を小刻みに震わせる
        if (spearState.chargeBlend > 1e-3) {
            const w = easeInOutCubic(spearState.chargeBlend);
            const u = THREE.MathUtils.clamp((spearState.hold - SPEAR_CHARGE_DELAY) / SPEAR_CHARGE_TIME, 0, 1);
            chargePos.set(CHARGE_POS[0] + 0.02 * u, CHARGE_POS[1], CHARGE_POS[2] + 0.04 * u);
            chargeTip.set(...CHARGE_TIP);
            chargeTip.z += 0.15 * u;
            chargeTip.normalize();
            chargeEdge.crossVectors(UP, chargeTip).normalize(); // 刃先は薙ぐ向き（左）へ
            if (spearCharged()) {
                const n = performance.now();
                chargePos.x += Math.sin(n * 0.09) * 0.0025;
                chargePos.y += Math.sin(n * 0.11 + 1) * 0.0025;
            }
            spearCur.pos.lerp(chargePos, w);
            spearCur.tip.lerp(chargeTip, w).normalize();
            spearCur.edge.lerp(chargeEdge, w);
        }
        applyRushPose(spearCur);
        // 振りの途中から溜めへ移ったときは、振っていた形から滑らかにつなぐ（突進突きも、回していた形からつなぐ）
        if (spearExitBlend > 0) {
            spearExitBlend = Math.max(0, spearExitBlend - dt / SPEAR_EXIT_TIME);
            const w = easeInOutCubic(spearExitBlend);
            spearCur.pos.lerp(spearExit.pos, w);
            spearCur.tip.lerp(spearExit.tip, w).normalize();
            spearCur.edge.lerp(spearExit.edge, w);
        }
        // 風車受け: 回す形へ寄せる
        if (spearState.guard > 0) {
            guardPoseAt(spearState.guardAngle, guardPose);
            const w = easeInOutCubic(spearState.guard);
            spearCur.pos.lerp(guardPose.pos, w);
            spearCur.tip.lerp(guardPose.tip, w).normalize();
            spearCur.edge.lerp(guardPose.edge, w);
        }
        // 投げる前の振りかぶり: 右肩の上へ引き上げる
        if (spearThrow.phase === 'windup') {
            const w = easeOutCubic(Math.min(1, spearThrow.t / SPEAR_THROW_WINDUP));
            spearCur.pos.lerp(THROW_POS, w);
            spearCur.tip.lerp(THROW_TIP, w).normalize();
            spearCur.edge.lerp(DOWN, w);
        }
        applySpearPose(spearCur);
        sampleGuardTrail();
        sampleRushTrail();
    }
    spearRibbon.update(game.trailNow);
    buttRibbon.update(game.trailNow);
}
// ---- 投げ槍（ホイール） ----
// ホイールで右肩の上へ振りかぶって投げる（振り・溜め・風車受けの途中でも、それをやめて投げる）。槍は視線の向きへまっすぐ飛び、少しずつ落ちる。
// 飛ぶ途中で当たった敵は穂先に刺したまま運ぶ（何体でも重ねて刺さる）。壁や床に刺さったら、刺した敵ごとそこへ縫い止めて大きく当てる。
// もう一度ホイールか右クリックで呼び戻す（刺さってから SPEAR_STUCK_TIME たてば自分で戻る）。呼び戻すと縫い止めた敵を手前へ引き寄せて放す。
// 投げている間は手に槍が無いので、ほかの攻撃と風車受けはできない
export const SPEAR_THROW_WINDUP = 0.14; // 振りかぶってから手を離すまで
const THROW_SPEED = 46; // m/s
const THROW_GRAVITY = 5; // 少しずつ落ちる (m/s²)
const RETURN_SPEED = 48;
export const SPEAR_STUCK_TIME = 3.5; // 刺さってから自分で戻るまで
export const SKEWER_GAP = 0.45; // 刺した敵どうしの間隔（穂先から順に後ろへ）
export const SKEWER_FIRST = 0.4; // 穂先から 1 体目の芯まで
const STICK_DEPTH = 0.16; // 壁へ穂先を埋める深さ
export const SKEWER_HIT = { kick: [-0.6, 0, 0], knock: 0, hitStop: 0.07, fx: 1.3, dmg: 1.4 };
export const PIN_HIT = { kick: [-1.6, 0, 0], knock: 0, hitStop: 0.14, fx: 1.9, dmg: 2.4 }; // 壁へ縫い止めた
export const YANK_SPEED = 9; // 呼び戻すとき、縫い止めた敵を手前へ引き寄せる速さ
const THROW_POS = new THREE.Vector3(0.1, 0.16, 0.2); // 振りかぶり: 支点を右肩の上の後ろへ
const THROW_TIP = new THREE.Vector3(-0.08, 0.22, -1).normalize();
export const spearThrow = {
    phase: 'none',
    t: 0, // 今の段階に入ってからの時間
    pressed: false, // ホイールを押した瞬間
    aimPressed: false, // 右クリック（パッドは LT）を押した瞬間。パッドはダッシュ中に押すと投げる
};
export const spearInHand = () => spearThrow.phase === 'none' || spearThrow.phase === 'windup';
let throwBuffered = false; // 取り出している途中に押した投げ（取り出し終えたら投げる）
const flying = createSpear({ metal: skinMats.spear.metal, shaft: skinMats.spear.trim, wrap: skinMats.spear.wrap });
flying.visible = false;
scene.add(flying);
// 形の飾りが付くスキン（爪など）を、投げた槍にも着せる
const dressFlying = () => dressModel(flying, skinOf('spear'), skinMats.spear);
dressFlying();
onSkinChange((id) => id === 'spear' && dressFlying());
const flyTip = new THREE.Vector3(); // 穂先の位置（ワールド）
const flyVel = new THREE.Vector3();
const flyDir = new THREE.Vector3(); // 穂先の向き
const skewered = [];
export const spearHolds = (e) => skewered.includes(e);
export function spearNetworkState() {
    return { phase: spearThrow.phase, tip: flyTip, dir: flyDir, held: skewered };
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const stepFrom = new THREE.Vector3();
const stepDir = new THREE.Vector3();
const throwLook = new THREE.Vector3();
function placeFlying() {
    flying.quaternion.setFromUnitVectors(Y_AXIS, flyDir);
    flying.position.copy(flyTip).addScaledVector(flyDir, -SPEAR_TIP_Y);
}
function releaseThrow() {
    camera.updateMatrixWorld();
    camera.getWorldDirection(throwLook);
    flyDir.copy(throwLook);
    flyVel.copy(throwLook).multiplyScalar(THROW_SPEED);
    flyTip.copy(camera.position).addScaledVector(throwLook, 0.3);
    spearThrow.phase = 'flying';
    spearThrow.t = 0;
    flying.visible = true;
    placeFlying();
    playSwish({ at: 0, dur: 0.22, f0: 300, f1: 1400, gain: 0.7 }, spearSwish());
    kickVel.x -= 1.2 * DEG * 22;
    hooks.addTrauma(0.06);
    game.fovKick += 4;
    // 投げた瞬間、目の前の敵も刺す（穂先の出だしより手前）
    skewerAlong(camera.position, throwLook, 0.3);
}
// from から dir へ len だけ進む間に当たった敵を刺す。壁や床、ボスに当たったら刺さって true
function skewerAlong(from, dir, len) {
    stepFrom.copy(from);
    let left = len;
    for (let guard = 0; guard < 8 && left > 0; guard++) {
        if (!castThrow(stepFrom, dir, left))
            return false;
        const d = castHit.point.distanceTo(stepFrom);
        const e = castHit.enemy;
        if (e) {
            if (!skewered.includes(e))
                skewer(e, castHit.point, dir);
            stepFrom.copy(castHit.point).addScaledVector(dir, 0.05);
            left -= d + 0.05;
            continue;
        }
        // 壁・床・ボス: そこへ刺さる
        flyTip.copy(castHit.point).addScaledVector(dir, STICK_DEPTH);
        if (castHit.boss) {
            const boss = castHit.boss;
            hitWithArcs(skinOf('spear'), SKEWER_HIT.fx ?? 1, dir, () => hooks.hitBoss(SKEWER_HIT, castHit.point, 'sword', boss, dir), castHit.point);
            skinFx.flare = 1;
        }
        stick(dir);
        return true;
    }
    return false;
}
function skewer(e, at, dir) {
    setEn(e);
    hitDir.set(dir.x, 0, dir.z);
    if (hitDir.lengthSq() < 1e-6)
        hitDir.set(0, 0, -1);
    hitDir.normalize();
    hitPoint.copy(at);
    hitWithArcs(skinOf('spear'), SKEWER_HIT.fx ?? 1, dir, () => hooks.applyHit(SKEWER_HIT, hitPoint, 'sword', dir));
    skinFx.flare = 1;
    if (!e.alive)
        return;
    skewered.push(e);
    e.moving = false;
    e.flung = e.batFlung = false;
    e.spiked = false;
}
function stick(dir) {
    spearThrow.phase = 'stuck';
    spearThrow.t = 0;
    flyDir.copy(dir);
    flyVel.set(0, 0, 0);
    placeFlying();
    sfx.playWallHit('blade', 1.4);
    hooks.addTrauma(0.14);
    // 縫い止めた敵に大きく当てる
    for (const e of [...skewered]) {
        if (!e.alive)
            continue;
        setEn(e);
        hitDir.set(dir.x, 0, dir.z);
        if (hitDir.lengthSq() < 1e-6)
            hitDir.set(0, 0, -1);
        hitDir.normalize();
        hitPoint.set(e.root.position.x, flyTip.y, e.root.position.z);
        hitWithArcs(skinOf('spear'), PIN_HIT.fx ?? 1, dir, () => hooks.applyHit(PIN_HIT, hitPoint, 'sword', dir));
        skinFx.flare = 1;
    }
}
function recall() {
    spearThrow.phase = 'returning';
    spearThrow.t = 0;
    playSwish({ at: 0, dur: 0.25, f0: 260, f1: 1100, gain: 0.5 }, spearSwish());
    // 縫い止めた敵を手前へ引き寄せて放す
    for (const e of skewered) {
        if (!e.alive)
            continue;
        e.knockVel.set(camera.position.x - e.root.position.x, 0, camera.position.z - e.root.position.z);
        if (e.knockVel.lengthSq() > 1e-6)
            e.knockVel.normalize().multiplyScalar(YANK_SPEED);
    }
    skewered.length = 0;
}
// 手元へ戻った: 槍を手に収め、右肩の上で受け止めた形から構えへ戻す
function catchSpear() {
    spearThrow.phase = 'none';
    flying.visible = false;
    skewered.length = 0;
    sfx.playBatGrip();
    kickVel.x += 0.8 * DEG * 22;
    spearExit.pos.copy(THROW_POS);
    spearExit.tip.copy(THROW_TIP);
    spearExit.edge.copy(DOWN);
    spearExitBlend = 1;
}
function updateSpearThrow(dt) {
    const press = spearThrow.pressed;
    const aim = spearThrow.aimPressed;
    spearThrow.pressed = spearThrow.aimPressed = false;
    if (game.shownWeapon !== 'spear' || game.wantWeapon !== 'spear')
        throwBuffered = false;
    if (game.shownWeapon !== 'spear') {
        // 持ち替えたら、投げていた槍はその場で手元へ戻す
        if (spearThrow.phase !== 'none') {
            recall();
            spearThrow.phase = 'none';
            flying.visible = false;
        }
        return;
    }
    const t = (spearThrow.t += dt);
    switch (spearThrow.phase) {
        case 'none': {
            const padThrow = aim && game.usingPad && player.dashTime > 0;
            // 振っている途中・溜め・風車受けの最中でも、すぐ投げる。取り出している途中に押したら、取り出し終えたところで投げる
            if (press || padThrow)
                throwBuffered = true;
            if (throwBuffered && spearReady()) {
                throwBuffered = false;
                // 今の形（振り・溜め・回し）から振りかぶりへ滑らかにつなぐ
                spearExit.pos.copy(spearCur.pos);
                spearExit.tip.copy(spearCur.tip);
                spearExit.edge.copy(spearCur.edge);
                spearExitBlend = 1;
                spearState.attack = null;
                spearState.hold = -1;
                spearState.chargeBlend = 0;
                spearState.guard = 0;
                queued = false;
                comboTimer = SPEAR_COMBO_RESET;
                spearThrow.phase = 'windup';
                spearThrow.t = 0;
                playSwish({ at: 0, dur: 0.16, f0: 200, f1: 500, gain: 0.2 }, spearSwish());
            }
            break;
        }
        case 'windup':
            if (t >= SPEAR_THROW_WINDUP)
                releaseThrow();
            break;
        case 'flying': {
            if (press || aim) {
                recall();
                break;
            }
            flyVel.y -= THROW_GRAVITY * dt;
            const step = flyVel.length() * dt;
            stepDir.copy(flyVel).normalize();
            flyDir.copy(stepDir);
            if (!skewerAlong(flyTip, stepDir, step))
                flyTip.addScaledVector(stepDir, step);
            if (spearThrow.phase === 'flying')
                placeFlying();
            break;
        }
        case 'stuck':
            if (press || aim || t >= SPEAR_STUCK_TIME)
                recall();
            break;
        case 'returning': {
            // 手元（胸の右）へ向かって飛ぶ。石突きを先にして、穂先は自分と逆の向きへ
            stepDir.set(0.2, -0.3, 0).applyQuaternion(camera.quaternion).add(camera.position).sub(flyTip);
            const dist = stepDir.length();
            const step = RETURN_SPEED * dt;
            if (dist <= step + 0.6) {
                catchSpear();
                break;
            }
            stepDir.divideScalar(dist);
            flyTip.addScaledVector(stepDir, step);
            flyDir.lerp(stepDir.negate(), Math.min(1, dt * 12)).normalize();
            placeFlying();
            break;
        }
    }
    // 刺した敵を穂先の後ろへ順に並べて運ぶ（縫い止めている間も）。刺さっている間は撃たせない
    for (let i = skewered.length - 1; i >= 0; i--) {
        const e = skewered[i];
        if (!e.alive) {
            skewered.splice(i, 1);
            continue;
        }
        const back = SKEWER_FIRST + SKEWER_GAP * i;
        e.root.position.x = flyTip.x - flyDir.x * back;
        e.root.position.z = flyTip.z - flyDir.z * back;
        e.vel.set(0, 0, 0);
        e.knockVel.set(0, 0, 0);
        e.moving = false;
        e.cooldown = Math.max(e.cooldown, 0.4);
    }
}
// 風車受けで回しきっている間も、穂先と石突きの軌跡を残す
let guardTrailing = false;
function sampleGuardTrail() {
    if (spearState.guard < SPEAR_GUARD_ON && !(dashSpin >= 0 && dashSpin < DASH_SPIN_TIME)) {
        guardTrailing = false;
        return;
    }
    if (!guardTrailing) {
        guardTrailing = true;
        spearRibbon.cut();
        buttRibbon.cut();
    }
    spearModel.updateWorldMatrix(true, false);
    camera.worldToLocal(trailA.copy(SPEAR_TRAIL_TIP).applyMatrix4(spearModel.matrixWorld));
    camera.worldToLocal(trailB.copy(SPEAR_TRAIL_BASE).applyMatrix4(spearModel.matrixWorld));
    spearRibbon.push(trailA, trailB, game.trailNow);
    camera.worldToLocal(trailA.copy(BUTT_TRAIL_END).applyMatrix4(spearModel.matrixWorld));
    camera.worldToLocal(trailB.copy(BUTT_TRAIL_IN).applyMatrix4(spearModel.matrixWorld));
    buttRibbon.push(trailA, trailB, game.trailNow);
}
// 振りの軌跡: 刃の付け根から切っ先の少し先までと、回しているときの石突きの側（柄尻から少し内側まで）
const SPEAR_TRAIL_TIP = new THREE.Vector3(0, SPEAR_TIP_Y + 0.03, 0); // 槍のローカル座標
const SPEAR_TRAIL_BASE = new THREE.Vector3(0, SPEAR_BLADE_BASE_Y, 0);
const BUTT_TRAIL_END = new THREE.Vector3(0, SPEAR_BUTT_Y, 0);
const BUTT_TRAIL_IN = new THREE.Vector3(0, SPEAR_BUTT_Y + 0.25, 0);
export const spearRibbon = new Ribbon(240, 0.2, makeRibbonMaterial(SWORD_RIBBON));
const buttRibbon = new Ribbon(240, 0.14, makeRibbonMaterial(SWORD_RIBBON));
camera.add(spearRibbon.mesh, buttRibbon.mesh);
// スキンが軌跡の色を持つときは、穂先と石突きの軌跡をその色にする
const tintSpearRibbons = () => {
    tintRibbon(spearRibbon, skinOf('spear').trail);
    tintRibbon(buttRibbon, skinOf('spear').trail);
};
tintSpearRibbons();
onSkinChange((id) => id === 'spear' && tintSpearRibbons());
let lastTrail = -Infinity;
const spearTrailPose = newSpearPose();
const trailA = new THREE.Vector3();
const trailB = new THREE.Vector3();
function sampleSpearTrail() {
    const def = spearState.attack;
    if (!def)
        return;
    for (const [from, to] of def.trails) {
        const end = Math.min(to, spearState.time);
        for (let s = Math.max(from, lastTrail + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
            if (s - lastTrail > TRAIL_STEP * 1.5) { // 別の時間帯の軌跡とはつながない
                spearRibbon.cut();
                buttRibbon.cut();
            }
            spearPoseAt(def, s, spearTrailPose);
            applySpearPose(spearTrailPose);
            spearModel.updateWorldMatrix(true, false);
            const at = game.trailNow - (spearState.time - s);
            camera.worldToLocal(trailA.copy(SPEAR_TRAIL_TIP).applyMatrix4(spearModel.matrixWorld));
            camera.worldToLocal(trailB.copy(SPEAR_TRAIL_BASE).applyMatrix4(spearModel.matrixWorld));
            spearRibbon.push(trailA, trailB, at);
            camera.worldToLocal(trailA.copy(BUTT_TRAIL_END).applyMatrix4(spearModel.matrixWorld));
            camera.worldToLocal(trailB.copy(BUTT_TRAIL_IN).applyMatrix4(spearModel.matrixWorld));
            buttRibbon.push(trailA, trailB, at);
            lastTrail = s;
        }
    }
}

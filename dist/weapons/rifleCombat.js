import * as THREE from 'three';
import * as sfx from '../audio.js?v=6b2d2aee';
import { camera, scene } from '../core.js?v=6b2d2aee';
import { DEG } from '../math.js?v=6b2d2aee';
import { DASH_ATTACK_WINDOW, game, kickVel } from '../game/state.js?v=6b2d2aee';
import { hooks } from '../game/hooks.js?v=6b2d2aee';
import { HEAVY_FX, spawnGleam, spawnGoldShards, spawnSparks } from '../fx/hitFx.js?v=6b2d2aee';
import { hitWithArcs, spawnMuzzleArcs } from '../fx/arcs.js?v=6b2d2aee';
import { addGlow } from '../fx/glow.js?v=6b2d2aee';
import { isDown } from '../player/down.js?v=6b2d2aee';
import { player, position } from '../player/state.js?v=6b2d2aee';
import { castThrow, castHit } from '../world/raycast.js?v=6b2d2aee';
import { en, hitDir, setEn } from '../enemy/state.js?v=6b2d2aee';
import { makeFlashTexture } from './handgunCombat.js?v=6b2d2aee';
import { createRound } from './revolver.js?v=6b2d2aee';
import { onSkinChange, skinFx, skinOf } from './skins.js?v=6b2d2aee';
import { rifleModel, weaponMats } from './viewModels.js?v=6b2d2aee';
// ---- スナイパーライフル ----
// 右クリック（パッドは LT）を押している間、スコープを目の前へ持ち上げて覗く。覗ききったらスコープの絵（ui/scopeOverlay.ts）に切り替え、
// 視野を SCOPE_ZOOM 倍に絞る（fx/camera.ts）。視点の速さは視野に合わせて落ちる（player/look.ts）
// 左クリックで 1 発撃ち、レバーを下げて戻すまで次は撃てない。弾は照準の先へ瞬時に届き、銃口から当たった所まで光の筋を残す
// 弾は RIFLE_MAG 発。R（パッドは X / Y）か撃ち切ったときに、銃を傾けて右の装填口へ 1 発ずつ押し込む。途中で撃てば、入れた分で撃てる。
// 撃ち切ってから込めたときは、最後にレバーを引いて薬室へ送る。倒すと弾が増える（addRifleRounds）
// スピンコック乱射: ホイールを押している間（パッドはダッシュ中・直後に LT）、まず 1 発撃ち、レバーの輪に掛けた指を軸に銃を縦に 1 回転させて
// レバーを送っては腰だめで撃つ。弾が尽きるか離すまで続ける。腰だめなので狙いはばらける
export const SCOPE_ZOOM = 3;
export const SCOPE_RAISE_TIME = 0.2; // 構えから覗ききるまで
const SCOPE_LOWER_TIME = 0.14; // 離してから構えへ戻すまで
export const SCOPE_VIEW_ON = 0.85; // 持ち上げがここを越えたら、手元のライフルを隠してスコープの絵に切り替える
// レバーの動き（撃ってからの時間）: 反動が収まるのを待って下げ、戻して次を撃てるようにする
export const LEVER_OPEN_AT = 0.22;
export const LEVER_OPEN_END = 0.4;
export const LEVER_CLOSE_END = 0.58;
export const RIFLE_CYCLE = 0.68; // 撃ってから次を撃てるまで
export const RIFLE_RANGE = 250;
const BEAM_TIME = 0.16; // 光の筋が細って消えるまで
const BEAM_WIDTH = 0.035;
const FLASH_TIME = 0.06;
export const RIFLE_MAG = 5;
export const SPIN_TIME = 0.26; // 1 回転（撃ってから次を撃つまで）
const SPIN_SPREAD = 2.6 * DEG; // 乱射の狙いのばらつき（照準からの角度の最大）
const SPIN_KICK = 0.55; // 乱射の 1 発の、視点の蹴り上げの割合
const RELOAD_ENTER = 0.26; // 銃を傾けて装填口を見せるまで
const RELOAD_INSERT = 0.42; // 1 発を押し込む間
const RELOAD_PUSH = 0.62; // 1 発のうち、装填口へ入りきる所（割合）
const RELOAD_EXIT = 0.22; // 構えへ戻すまで
export const rifleState = {
    scope: 0, // 持ち上げ具合（0 = 構え, 1 = 覗ききった）
    pressed: false, // 左クリック・RT を押した
    cycleT: Infinity, // 撃ってからの時間。RIFLE_CYCLE を越えたら次を撃てる
    recoil: 0, // 撃った反動（1 から 0 へ戻る）
    ammo: RIFLE_MAG,
    reloadQueued: false, // R・X / Y を押した
    reload: 'none',
    reloadT: 0, // 今の段に入ってからの時間
    reloadPose: 0, // 傾けた構えへの寄り具合（手元の動きに使う）
    insertPush: 0, // 押し込んだ瞬間に 1 から 0 へ戻る（銃を小さく揺らす）
    needLever: false, // 撃ち切ってから込めている（込め終わったらレバーを引く）
    gainT: Infinity, // 倒して弾が増えてからの時間（弾の表示を光らせる）
    gainFrom: 0, // 増える前の弾の数
    spinHeld: false, // ホイールを押している
    padSpin: false, // パッド: ダッシュ中・直後に LT を押した。LT を離すまで乱射を続ける
    spin: false, // 乱射の途中
    spinT: 0, // 今の 1 回転に入ってからの時間
    scopedShot: false, // 最後の 1 発をスコープを覗ききって撃ったか（頭でとどめを刺したときに弾が入るのはこのときだけ）
    equipT: Infinity, // 取り出し始めてからの時間（取り出していないときは Infinity）
};
// ---- 取り出し ----
// 持ち替えたとき: 画面の右下から、長い銃が顔を掃かないよう右下の前へ離して持ち上げながら、レバーの輪に掛けた指を軸に
// 銃を縦に 1 回転させる（回る勢いでレバーが開いて閉じる）。前を向いた所で止め、銃床を肩へ「ガッ」と引き付けて構えに収まる。
// 取り出している間は撃てない（押したのは捨てず、取り出し終えてから効かせる）
export const RIFLE_EQUIP_SPIN_FROM = 0.08; // 回し始め
export const RIFLE_EQUIP_SPIN_TO = 0.4; // 回し終えて前を向いた所
export const RIFLE_EQUIP_TIME = 0.6;
const RIFLE_EQUIP_SHOULDER = RIFLE_EQUIP_SPIN_TO + 0.06; // 肩へ引き付けた瞬間
export function startRifleEquip() {
    rifleState.equipT = 0;
}
function updateRifleEquip(dt) {
    if (rifleState.equipT === Infinity)
        return;
    if (game.shownWeapon !== 'rifle') {
        rifleState.equipT = Infinity;
        return;
    }
    const t0 = rifleState.equipT;
    const t = (rifleState.equipT += dt);
    const at = (k) => t0 < k && t >= k;
    const spinAt = (u) => RIFLE_EQUIP_SPIN_FROM + (RIFLE_EQUIP_SPIN_TO - RIFLE_EQUIP_SPIN_FROM) * u;
    if (at(RIFLE_EQUIP_SPIN_FROM))
        sfx.playSwish({ dur: (RIFLE_EQUIP_SPIN_TO - RIFLE_EQUIP_SPIN_FROM) * 0.9, f0: 380, f1: 1400, gain: 0.16 }, skinOf('rifle').swish ?? 'gun');
    if (at(spinAt(0.35)))
        sfx.playLever('open');
    if (at(spinAt(0.8)))
        sfx.playLever('close');
    if (at(RIFLE_EQUIP_SHOULDER)) {
        sfx.playRifleShoulder();
        kickVel.x += 0.6 * DEG * 22;
        hooks.addTrauma(0.05);
    }
    if (t >= RIFLE_EQUIP_TIME)
        rifleState.equipT = Infinity;
}
// 倒したときに弾を足す（上限まで）。込めている途中で満ちたら、構えへ戻す
export function addRifleRounds(n) {
    const before = rifleState.ammo;
    rifleState.ammo = Math.min(RIFLE_MAG, before + n);
    if (rifleState.ammo === before)
        return;
    rifleState.gainFrom = before;
    rifleState.gainT = 0;
    sfx.playRifleGain();
    if (rifleState.reload !== 'none' && rifleState.ammo >= RIFLE_MAG)
        finishInsert();
}
export const rifleReady = () => game.shownWeapon === 'rifle' && game.wantWeapon === 'rifle' && game.holster === 0 && !isDown() && rifleState.equipT === Infinity;
// マズルフラッシュ: ハンドガンの光を大きくし、前へ長く伸ばす（互いに読み込み合うので、ハンドガンの値は読み込みの最初に使わない）
const flashMat = new THREE.MeshBasicMaterial({
    map: makeFlashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
const rifleMuzzle = rifleModel.userData.muzzle;
const muzzleFlash = new THREE.Group();
{
    muzzleFlash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat));
    for (const r of [0, Math.PI / 2]) {
        const long = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.36), flashMat);
        long.rotation.set(-Math.PI / 2, r, 0, 'ZXY');
        long.position.z = -0.15;
        muzzleFlash.add(long);
    }
}
muzzleFlash.visible = false;
rifleMuzzle.add(muzzleFlash);
let flashAge = Infinity;
// 弾の光の尾の色を持つスキン（爪）は、マズルフラッシュもその色に寄せる
const tintFlash = () => {
    const trail = skinOf('rifle').trail;
    flashMat.color.setHex(trail ? trail.core : 0xffffff);
};
tintFlash();
onSkinChange((id) => id === 'rifle' && tintFlash());
const beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5); // 原点から +Z へ伸びる
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const BEAM_AXIS = new THREE.Vector3(0, 0, 1);
// スキンの色の光の筋（ハンドガンの光の尾と同じ作り）。白い背景でも見えるよう、足さずに重ね、白に近い細い芯を通す
const SKIN_BEAM_CORE = 0.35; // 芯の太さ（筋の太さに対する割合）
const SKIN_BEAM_GLOW = 1.6; // にじみの濃さ
const skinBeamMats = new Map();
const skinBeamMat = (trail) => {
    let mat = skinBeamMats.get(trail.body);
    if (!mat) {
        const color = new THREE.Color(trail.core).offsetHSL(0, 0, 0.12);
        skinBeamMats.set(trail.body, (mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })));
    }
    return mat;
};
const skinBeamCoreMat = new THREE.MeshBasicMaterial({ color: 0xffe2e2, transparent: true, depthWrite: false });
const beams = [];
const from = new THREE.Vector3();
const aim = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const beamDir = new THREE.Vector3();
// 当たった所への処理（ダメージ・倒す・ボスの部位）。enemy も boss も無ければ壁や床
export const RIFLE_HIT = { kick: [-1, 0, 0], knock: 120, hitStop: 0.03, fx: 1, dmg: 34 / 30 };
export const RIFLE_SCOPED_BODY_BONUS = 16; // 覗ききった胴体への射撃は 50 ダメージ
function onRifleHit(at, dir, enemy, part, boss) {
    void part; // 頭は共通の命中位置の高さで判定する
    // 稲妻を出すスキン（爪）は、当てた所から体に稲妻を走らせる
    const fx = RIFLE_HIT.fx ?? 1;
    // 金粉を漂わせるスキンは、金色の破片の代わりに金粉を見せる（破片は出さない）
    const gleam = skinOf('rifle').gleam;
    if (!enemy && boss) {
        hitWithArcs(skinOf('rifle'), fx, dir, () => hooks.hitBoss(RIFLE_HIT, at, 'bullet', boss, dir), at);
        if (!gleam)
            spawnGoldShards(at, dir, false);
    }
    else if (enemy) {
        setEn(enemy);
        hitDir.set(dir.x, 0, dir.z);
        if (hitDir.lengthSq() < 1e-6)
            hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
        hitDir.normalize();
        hitWithArcs(skinOf('rifle'), fx, dir, () => hooks.applyHit(RIFLE_HIT, at, 'bullet'), at);
        if (!gleam)
            spawnGoldShards(at, dir, !enemy.alive); // 倒した 1 発は多めに散らす
        else if (!enemy.alive)
            spawnGleam(at, dir, HEAVY_FX, gleam); // 倒した 1 発は光の筋を長く 2 本にし、金粉を増やす
    }
    else {
        spawnSparks(at, dir, 6 + Math.floor(Math.random() * 4), 0.6, 0.5);
        sfx.playRicochet();
    }
}
// 込める弾: 拳銃の弾を大きくして、手元のライフルの装填口へ動かす
const loadRound = createRound(weaponMats, true);
loadRound.scale.setScalar(1.6);
loadRound.visible = false;
rifleModel.add(loadRound);
const ROUND_FROM = new THREE.Vector3(0.06, -0.045, 0.0);
const ROUND_GATE = new THREE.Vector3(0.017, -0.012, -0.046);
const ROUND_IN = new THREE.Vector3(0.006, -0.012, -0.095);
const ROUND_TURN_FROM = new THREE.Euler(0.3, 0.7, 0.4); // 下から斜めに寄せてくる向き
function startReload() {
    rifleState.reload = 'enter';
    rifleState.reloadT = 0;
    rifleState.needLever = rifleState.ammo === 0;
    sfx.playRifleTilt();
}
function finishInsert() {
    rifleState.reload = 'exit';
    rifleState.reloadT = 0;
    loadRound.visible = false;
    sfx.playRifleShoulder();
}
function endReload() {
    rifleState.reload = 'none';
    loadRound.visible = false;
}
// 込める段を進める。1 発ごとに、下から装填口へ寄せて押し込む
function updateReload(dt) {
    rifleState.reloadT += dt;
    if (rifleState.reload === 'enter' && rifleState.reloadT >= RELOAD_ENTER) {
        rifleState.reload = 'insert';
        rifleState.reloadT = 0;
    }
    if (rifleState.reload === 'insert') {
        const k0 = (rifleState.reloadT - dt) / RELOAD_INSERT;
        const k = rifleState.reloadT / RELOAD_INSERT;
        if (k0 <= 0 && k > 0)
            sfx.playRifleRoundPick();
        if (k0 < RELOAD_PUSH * 0.75 && k >= RELOAD_PUSH * 0.75)
            sfx.playRifleGate();
        if (k < RELOAD_PUSH) {
            // 寄せる: 斜めの向きから装填口の向きへ起こしながら近づける
            const u = THREE.MathUtils.smoothstep(k, 0, RELOAD_PUSH * 0.75);
            // 形を作り直すスキンは、装填口の位置をモデルの userData に置く
            const gate = rifleModel.userData.roundGate ?? ROUND_GATE;
            loadRound.position.lerpVectors(ROUND_FROM, gate, u);
            loadRound.rotation.set(ROUND_TURN_FROM.x * (1 - u), ROUND_TURN_FROM.y * (1 - u), ROUND_TURN_FROM.z * (1 - u));
            if (k > RELOAD_PUSH * 0.75) {
                // 親指で奥へ押し込む
                const v = (k - RELOAD_PUSH * 0.75) / (RELOAD_PUSH * 0.25);
                loadRound.position.lerpVectors(gate, rifleModel.userData.roundIn ?? ROUND_IN, v * v);
            }
            loadRound.visible = true;
        }
        else if (loadRound.visible) {
            loadRound.visible = false;
            rifleState.ammo++;
            rifleState.insertPush = 1;
            sfx.playRifleLoad(rifleState.ammo / RIFLE_MAG);
        }
        if (k >= 1) {
            if (rifleState.ammo >= RIFLE_MAG)
                finishInsert();
            else
                rifleState.reloadT = 0;
        }
    }
    if (rifleState.reload === 'exit' && rifleState.reloadT >= RELOAD_EXIT) {
        endReload();
        // 撃ち切っていたら、レバーを引いて薬室へ送る（撃ったときのレバーの動きを、反動なしで流す）
        if (rifleState.needLever)
            rifleState.cycleT = LEVER_OPEN_AT - 0.04;
        rifleState.needLever = false;
    }
}
// spun: スピンコック乱射の 1 発（狙いをばらし、レバーの動きは回転のほうで見せる）
function fireRifle(spun = false) {
    if (rifleState.reload !== 'none')
        endReload(); // 込めている途中でも、入れた分で撃つ
    rifleState.ammo--;
    rifleState.scopedShot = rifleState.scope >= SCOPE_VIEW_ON;
    rifleState.cycleT = spun ? RIFLE_CYCLE : 0;
    rifleState.recoil = 1;
    // 狙いは画面のクロスヘア（揺れと反動を足した向き）から、光の筋は銃口から引く。覗いている間は銃口が画面に無いので、目の少し下から引く
    hooks.applyCameraOffset();
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(aimDir);
    if (spun) {
        // 照準のまわりの円の中へ、中心ほど多くばらす
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * SPIN_SPREAD;
        const side = new THREE.Vector3().crossVectors(aimDir, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(side, aimDir);
        aimDir.addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    const pierced = new Set();
    const hits = [];
    aim.copy(camera.position).addScaledVector(aimDir, RIFLE_RANGE);
    // 同じ始点から当たった敵を除いて調べると、重なった敵も取りこぼさない。
    while (true) {
        if (!castThrow(camera.position, aimDir, RIFLE_RANGE, pierced)) {
            aim.copy(camera.position).addScaledVector(aimDir, RIFLE_RANGE);
            break;
        }
        const { enemy, part, boss } = castHit;
        aim.copy(castHit.point);
        hits.push({ at: aim.clone(), enemy, part, boss });
        if (!enemy || boss || pierced.has(enemy))
            break;
        pierced.add(enemy);
    }
    if (rifleState.scope < SCOPE_VIEW_ON)
        from.setFromMatrixPosition(rifleMuzzle.matrixWorld);
    else
        from.set(0, -0.06, -0.3).applyMatrix4(camera.matrixWorld);
    hooks.restoreCameraOffset();
    camera.updateMatrixWorld(true);
    const trail = skinOf('rifle').trail;
    const mesh = new THREE.Mesh(beamGeo, trail ? skinBeamMat(trail) : beamMat);
    mesh.frustumCulled = false;
    mesh.position.copy(aim);
    mesh.quaternion.setFromUnitVectors(BEAM_AXIS, beamDir.subVectors(from, aim).normalize());
    mesh.scale.set(BEAM_WIDTH, BEAM_WIDTH, from.distanceTo(aim));
    scene.add(mesh);
    if (trail) {
        const core = new THREE.Mesh(beamGeo, skinBeamCoreMat);
        core.scale.set(SKIN_BEAM_CORE, SKIN_BEAM_CORE, 1);
        core.renderOrder = 1; // 筋の後に描いて、筋の中から透けて見せる
        mesh.add(core);
        if (trail.glow)
            addGlow(mesh, trail.body).strength = SKIN_BEAM_GLOW; // 筋が消えてシーンから外れたら、にじみの登録も外れる
    }
    beams.push({ mesh, age: 0 });
    skinFx.flare = 1; // スキンの飾りを光らせる
    // 稲妻を出すスキンは、マズルフラッシュに放電を交える（覗いている間は銃口が画面に無いので出さない）
    const arc = skinOf('rifle').arc;
    if (arc && rifleState.scope < SCOPE_VIEW_ON)
        spawnMuzzleArcs(rifleMuzzle, arc);
    for (const hit of hits)
        onRifleHit(hit.at, aimDir.clone(), hit.enemy, hit.part, hit.boss);
    // 反動: 拳銃より大きく視点を蹴り上げる。覗いているときはさらに強く跳ねて見える（視野が狭いので）
    const kick = spun ? SPIN_KICK : 1;
    kickVel.x += 7 * DEG * 22 * kick;
    kickVel.y += (Math.random() - 0.5) * 1.6 * DEG * 22 * kick;
    hooks.addTrauma(0.22 * kick);
    game.fovKick = Math.max(game.fovKick, 5);
    flashAge = 0;
    muzzleFlash.rotation.z = Math.random() * Math.PI;
    muzzleFlash.scale.setScalar(1 + Math.random() * 0.4);
    sfx.playRifleShot();
}
// 乱射を始める・続ける・やめる。1 回転し終えたところで、押していれば次を撃つ。離しても回している 1 回転は回しきる
function updateSpin(dt, ready) {
    if (game.throwHeld && !prevThrowHeld && game.usingPad && (player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW))
        rifleState.padSpin = true;
    if (!game.throwHeld)
        rifleState.padSpin = false;
    prevThrowHeld = game.throwHeld;
    const held = rifleState.spinHeld || rifleState.padSpin;
    if (!ready) {
        rifleState.spin = false;
        return;
    }
    if (!rifleState.spin) {
        if (!held || rifleState.cycleT < RIFLE_CYCLE || rifleState.scope > 0.3)
            return;
        if (rifleState.ammo === 0) {
            if (spinPressed(held))
                sfx.playDryFire();
            return;
        }
        rifleState.spin = true;
        rifleState.spinT = 0;
        fireRifle(true);
        return;
    }
    const t0 = rifleState.spinT;
    rifleState.spinT += dt;
    // 回し始めに風を切り、真下を過ぎたところでレバーが開いて、戻りながら閉じる
    if (t0 === 0)
        sfx.playSwish({ dur: SPIN_TIME * 0.9, f0: 420, f1: 1500, gain: 0.13 }, skinOf('rifle').swish ?? 'gun');
    if (t0 < SPIN_TIME * 0.35 && rifleState.spinT >= SPIN_TIME * 0.35)
        sfx.playLever('open');
    if (t0 < SPIN_TIME * 0.8 && rifleState.spinT >= SPIN_TIME * 0.8)
        sfx.playLever('close');
    if (rifleState.spinT < SPIN_TIME)
        return;
    if (held && rifleState.ammo > 0) {
        rifleState.spinT = 0;
        fireRifle(true);
    }
    else {
        rifleState.spin = false;
    }
}
let prevThrowHeld = false;
let prevSpinHeld = false;
const spinPressed = (held) => {
    const edge = held && !prevSpinHeld;
    prevSpinHeld = held;
    return edge;
};
export function updateRifle(dt) {
    updateRifleEquip(dt);
    const ready = rifleReady();
    updateSpin(dt, ready);
    if (!(rifleState.spinHeld || rifleState.padSpin))
        prevSpinHeld = false;
    const prev = rifleState.scope;
    rifleState.scope = THREE.MathUtils.clamp(prev + (ready && game.throwHeld && rifleState.reload === 'none' && !rifleState.spin && !rifleState.padSpin ? dt / SCOPE_RAISE_TIME : -dt / SCOPE_LOWER_TIME), 0, 1);
    if (prev === 0 && rifleState.scope > 0)
        sfx.playGrip(); // 頬を銃床に付ける
    // レバーを下げる・戻す音は、動きの節目で鳴らす
    const t0 = rifleState.cycleT;
    rifleState.cycleT += dt;
    if (t0 < LEVER_OPEN_AT && rifleState.cycleT >= LEVER_OPEN_AT)
        sfx.playLever('open');
    if (t0 < LEVER_OPEN_END && rifleState.cycleT >= LEVER_OPEN_END)
        sfx.playLever('close');
    rifleState.recoil = Math.max(0, rifleState.recoil - dt * 5);
    if (rifleState.pressed && rifleState.equipT === Infinity) { // 取り出しの途中に押したのは、取り出し終えてから撃つ
        rifleState.pressed = false;
        if (ready && !rifleState.spin && rifleState.cycleT >= RIFLE_CYCLE && rifleState.ammo > 0)
            fireRifle();
        else if (ready && rifleState.ammo === 0 && rifleState.reload === 'none')
            sfx.playDryFire();
    }
    if (rifleState.reloadQueued) {
        rifleState.reloadQueued = false;
        if (ready && !rifleState.spin && rifleState.reload === 'none' && rifleState.ammo < RIFLE_MAG && rifleState.cycleT >= RIFLE_CYCLE)
            startReload();
    }
    // 撃ち切ったら、レバーを戻し終えたところで込め始める
    if (ready && !rifleState.spin && rifleState.ammo === 0 && rifleState.reload === 'none' && rifleState.cycleT >= RIFLE_CYCLE)
        startReload();
    if (!ready && rifleState.reload !== 'none')
        endReload(); // 持ち替え・倒れたらやめる（込めた分は残す）
    if (rifleState.reload !== 'none')
        updateReload(dt);
    const posing = rifleState.reload === 'enter' || rifleState.reload === 'insert';
    rifleState.reloadPose += ((posing ? 1 : 0) - rifleState.reloadPose) * Math.min(1, dt * (posing ? 12 : 14));
    rifleState.insertPush = Math.max(0, rifleState.insertPush - dt * 7);
    rifleState.gainT += dt;
    flashAge += dt;
    muzzleFlash.visible = flashAge < FLASH_TIME && rifleState.scope < SCOPE_VIEW_ON;
    for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.age += dt;
        const k = 1 - b.age / BEAM_TIME;
        if (k <= 0) {
            b.mesh.removeFromParent();
            beams.splice(i, 1);
            continue;
        }
        b.mesh.scale.x = b.mesh.scale.y = BEAM_WIDTH * k * k;
    }
}
// 覗いている具合を視野と絵に使う形にする（覗ききる直前から一気に寄せる）
export const scopeView = () => THREE.MathUtils.smoothstep(rifleState.scope, SCOPE_VIEW_ON - 0.1, 1);
const initial_rifleState = snapshotRifleState(rifleState);
export function resetRifleCombat() {
    for (const b of beams)
        b.mesh.removeFromParent();
    beams.length = 0;
    muzzleFlash.visible = false;
    initial_rifleState();
    flashAge = Infinity;
    prevThrowHeld = false;
    prevSpinHeld = false;
}
function snapshotRifleState(state) {
    const initial = { ...state };
    return () => { Object.assign(state, initial); };
}

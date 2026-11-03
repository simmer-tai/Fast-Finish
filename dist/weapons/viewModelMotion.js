import { snapshotState } from '../game/resetState.js?v=9bd5fe3e';
import * as THREE from 'three';
import * as sfx from '../audio.js?v=9bd5fe3e';
import { DEG } from '../math.js?v=9bd5fe3e';
import { easeOutBack, easeOutCubic } from '../ease.js?v=9bd5fe3e';
import { SICKLE_VIEW_MODEL_POS } from './chainSickle.js?v=9bd5fe3e';
import { AXE_VIEW_MODEL_POS } from './battleAxe.js?v=9bd5fe3e';
import { BOW_AIM_POS, BOW_AIM_UNCANT, BOW_SLIDE_TURN, BOW_VIEW_MODEL_POS } from './bow.js?v=9bd5fe3e';
import { BAT_VIEW_MODEL_POS } from './bat.js?v=9bd5fe3e';
import { SPEAR_VIEW_MODEL_POS } from './spear.js?v=9bd5fe3e';
import { RIFLE_REST_ROT, RIFLE_SCOPE_EYE, RIFLE_VIEW_MODEL_POS } from './rifle.js?v=9bd5fe3e';
import { LEVER_CLOSE_END, LEVER_OPEN_AT, LEVER_OPEN_END, RIFLE_EQUIP_SPIN_FROM, RIFLE_EQUIP_SPIN_TO, RIFLE_EQUIP_TIME, SCOPE_VIEW_ON, SPIN_TIME, rifleState, startRifleEquip, } from './rifleCombat.js?v=9bd5fe3e';
import { batEquipOff, batState, startBatEquip } from './batCombat.js?v=9bd5fe3e';
import { spearInHand, spearState, spearThrow, startSpearEquip } from './spearCombat.js?v=9bd5fe3e';
import { BOW_EQUIP_SNAP, BOW_EQUIP_SPIN, BOW_EQUIP_TURN, bowState, startBowEquip } from './bowCombat.js?v=9bd5fe3e';
import { SWORD_RUN_QUAT, SWORD_SLIDE_QUAT, SWORD_STAND_QUAT, SWORD_VIEW_MODEL_POS } from './sword.js?v=9bd5fe3e';
import { AXE_SWAY_DAMP, AXE_SWAY_GAIN, AXE_SWAY_STIFF, GUN_VIEW_MODEL_POS, LEFT_VIEW_MODEL_POS, VIEW_MODEL_POS, axeViewModel, batViewModel, bowViewModel, spearViewModel, rifleViewModel, rifleRest, rifleModel, rifleSpin, gunViewModel, leftSickle, leftViewModel, rightSickle, sickleViewModel, swordRestQuat, swordViewModel, viewModel, } from './viewModels.js?v=9bd5fe3e';
import { axeState, startAxeAttack } from './axeCombat.js?v=9bd5fe3e';
import { AXE_DRAW } from './axeAttacks.js?v=9bd5fe3e';
import { startSwordAttack, swordState } from './swordCombat.js?v=9bd5fe3e';
import { SWORD_DRAW } from './swordAttacks.js?v=9bd5fe3e';
import { gunState, reloadPosOff, reloadRotOff, startGunDraw } from './handgunCombat.js?v=9bd5fe3e';
import { SICKLE_DRAW_TIME, sickleBodyPos, sickleBodyRot, sickleState, startSickleDraw } from './sickleCombat.js?v=9bd5fe3e';
import { DRAW_SPIN_END, KUNAI_DRAW_TIME, kunaiState, pendingThrows, startKunaiDraw } from './kunaiCombat.js?v=9bd5fe3e';
import { cameraFx, landShakeAmount } from '../fx/camera.js?v=9bd5fe3e';
import { player, velocity } from '../player/state.js?v=9bd5fe3e';
import { SPRINT_SPEED, WALK_SPEED } from '../player/config.js?v=9bd5fe3e';
import { isDown } from '../player/down.js?v=9bd5fe3e';
import { game } from '../game/state.js?v=9bd5fe3e';
import { skinOf } from './skins.js?v=9bd5fe3e';
// ---- 手元の武器の動き ----
// 武器の持ち替え・歩きや視点移動につれた揺れ・構えの切り替え
// 本体からも読み書きする値
export const viewState = {
    // 視点を動かしたときにクナイを遅れてついてこさせるための量（マウスとパッドの入力で足す）
    lookSwayX: 0,
    lookSwayY: 0,
    inspectPressed: false, // T を押した（武器を眺める）
};
// ---- ビューモデル（クナイ）の動き ----
// 持ち替えは「今の武器を下げる → 入れ替える → 新しい武器を上げる」
export const HOLSTER_TIME = 0.14;
// 構えの切り替え具合と、斧の重さで遅れる揺れ
let swordRunPose = 0; // 0 = 縦に立てた構え, 1 = 走るときの前へ倒した構え
let swordSlidePose = 0; // 1 = スライディング中の横に寝かせた構え
let bowSlidePose = 0; // 1 = スライディング中の、弓を横に寝かせた構え
let axeSwayX = 0;
let axeSwayY = 0;
let axeSwayVelX = 0;
let axeSwayVelY = 0;
let bobPhase = 0;
let bobAmount = 0;
let dashPull = 0;
let slidePose = 0;
let mantlePose = 0;
let chargePose = 0;
let leftEmpty = 0;
let spinPose = 0; // ライフルのスピンコック乱射の、右下の前へ離した持ち方への寄り具合
// 手元の武器を取り出す動きを始める。取り出しの動きが無い武器は holster = 1 のままにして、画面の下から持ち上げる
export function drawWeapon() {
    sfx.playEquip(game.shownWeapon);
    // 刀は下から持ち上げず、鞘から抜く動きで構える。クナイは指で回しながら振り上げて構える
    if (game.shownWeapon === 'sword') {
        game.holster = 0;
        startSwordAttack(SWORD_DRAW);
    }
    else if (game.shownWeapon === 'kunai') {
        game.holster = 0;
        startKunaiDraw();
    }
    else if (game.shownWeapon === 'axe') {
        // 斧は右肩の後ろから引き抜き、頭上を回して振り下ろしてから構える
        game.holster = 0;
        startAxeAttack(AXE_DRAW);
    }
    // リボルバーもホルスターから抜いて、指で回しながら構える
    if (game.shownWeapon === 'handgun') {
        game.holster = 0;
        startGunDraw();
    }
    // 鎖鎌は頭を鎖で回しながら振り上げ、握りへ組み戻して構える
    if (game.shownWeapon === 'sickle') {
        game.holster = 0;
        startSickleDraw();
    }
    // 弓は寝かせたまま回しながら振り上げ、立てた所で握り込んでから矢をつがえる
    if (game.shownWeapon === 'bow') {
        game.holster = 0;
        startBowEquip();
    }
    // バットは肩の後ろから頭の上を越えて前へ振り下ろし、正面を指してから手首で返して構える
    if (game.shownWeapon === 'bat') {
        game.holster = 0;
        startBatEquip();
    }
    // 槍は背中から引き抜いて体の右で風車を回し、照準へ突き出して止めてから構える
    if (game.shownWeapon === 'spear') {
        game.holster = 0;
        startSpearEquip();
    }
    // ライフルは右下から持ち上げながらスピンコックで 1 回転させ、レバーを送ってから肩へ引き付ける
    if (game.shownWeapon === 'rifle') {
        game.holster = 0;
        startRifleEquip();
    }
}
export function updateWeaponSwitch(dt) {
    // 振りや溜め、投げの途中では持ち替えず、終わるのを待つ
    const kunaiBusy = kunaiState.attack !== null || kunaiState.charging || pendingThrows.length > 0;
    // 抜刀・斧の取り出しの途中なら持ち替えてよい
    const swordBusy = (swordState.swordAttack !== null && swordState.swordAttack !== SWORD_DRAW) || swordState.rushTime >= 0 || swordState.swordHold >= 0 || swordState.chargeDashTime > 0;
    const busy = (game.shownWeapon === 'kunai' && kunaiBusy) || (game.shownWeapon === 'sword' && swordBusy) || sickleState.grapple !== null
        || sickleState.sickleMelee !== null || (game.shownWeapon === 'axe' && axeState.axeAttack !== null && axeState.axeAttack !== AXE_DRAW)
        || (game.shownWeapon === 'bat' && (batState.attack !== null || batState.hold >= 0))
        || (game.shownWeapon === 'spear' && (spearState.attack !== null || spearState.hold >= 0 || spearThrow.phase === 'windup'))
        || (game.shownWeapon === 'rifle' && rifleState.spin);
    if (isDown()) {
        game.holster = Math.min(1, game.holster + game.realDt / (HOLSTER_TIME * 2)); // 倒れたら武器を画面の下へ落とす
    }
    else if (game.wantWeapon !== game.shownWeapon && !busy) {
        game.holster = Math.min(1, game.holster + dt / HOLSTER_TIME);
        if (game.holster === 1) {
            game.shownWeapon = game.wantWeapon;
            drawWeapon();
        }
    }
    else if (game.wantWeapon === game.shownWeapon) {
        game.holster = Math.max(0, game.holster - dt / HOLSTER_TIME);
    }
    const isKunai = game.shownWeapon === 'kunai';
    viewModel.visible = isKunai;
    leftViewModel.visible = false; // クナイは右手の 1 本だけで投げる
    gunViewModel.visible = game.shownWeapon === 'handgun';
    swordViewModel.visible = game.shownWeapon === 'sword';
    sickleViewModel.visible = game.shownWeapon === 'sickle';
    axeViewModel.visible = game.shownWeapon === 'axe';
    bowViewModel.visible = game.shownWeapon === 'bow';
    batViewModel.visible = game.shownWeapon === 'bat';
    spearViewModel.visible = game.shownWeapon === 'spear' && spearInHand(); // 投げている間は手に無い
    rifleViewModel.visible = game.shownWeapon === 'rifle' && rifleState.scope < SCOPE_VIEW_ON; // 覗ききったらスコープの絵に替える
}
export const handJoltPos = new THREE.Vector3();
const rifleBase = new THREE.Vector3();
const LEVER_SWING = 0.95; // レバーを下げきった角度 (rad)
const RIFLE_SCOPE_POS = new THREE.Vector3(0, -RIFLE_SCOPE_EYE.y, -0.09 - RIFLE_SCOPE_EYE.z); // 覗くときの位置（接眼レンズを目の 9 cm 先に）
const bowBase = new THREE.Vector3();
export function updateViewModel(dt) {
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
    viewState.lookSwayX += -viewState.lookSwayX * Math.min(1, dt * 10);
    viewState.lookSwayY += -viewState.lookSwayY * Math.min(1, dt * 10);
    const speedBack = Math.min(Math.max(hSpeed - SPRINT_SPEED, 0) / 10, 1) * 0.03;
    // 攻撃中は移動による構えの変化を弱め、振りの形を崩さない
    kunaiState.attackWeight += ((kunaiState.attack ? 1 : 0) - kunaiState.attackWeight) * Math.min(1, dt * (kunaiState.attack ? 20 : 6));
    const calm = 1 - kunaiState.attackWeight * 0.8;
    const bob = bobAmount * calm;
    const pull = dashPull * calm;
    const slideP = slidePose * calm;
    const mantleP = mantlePose * calm;
    viewModel.position.set(VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bob - viewState.lookSwayX * 0.5 + slideP * 0.03, VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bob - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.5 + cameraFx.landDip * 0.3 - pull * 0.04 - slideP * 0.03 - mantleP * 0.12, VIEW_MODEL_POS.z + pull * 0.1 + speedBack);
    viewModel.rotation.set(-pull * 0.35 + viewState.lookSwayY * 2 - mantleP * 0.5, -viewState.lookSwayX * 2, slideP * 0.35 + cameraFx.roll);
    // 左手は振りに加わらないので、移動の揺れだけ右手と左右対称に付ける
    // 溜めている間は少し前へ出して持ち上げ（水平に回すクナイが顔へ近づきすぎないように）、
    // 投げた瞬間は前へ突き出し、補充中は画面の下へ隠す
    chargePose += ((kunaiState.charging ? 1 : 0) - chargePose) * Math.min(1, dt * 45);
    kunaiState.throwPunch += -kunaiState.throwPunch * Math.min(1, dt * 9);
    const empty = kunaiState.reloading && pendingThrows.length === 0; // 最後の 1 本を放ってから下げる
    leftEmpty += ((empty ? 1 : 0) - leftEmpty) * Math.min(1, dt * (empty ? 6 : 14));
    leftViewModel.position.set(LEFT_VIEW_MODEL_POS.x - Math.sin(bobPhase) * 0.012 * bobAmount - viewState.lookSwayX * 0.5 + slidePose * 0.03
        + chargePose * 0.03 + kunaiState.throwPunch * 0.05, LEFT_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.5 + cameraFx.landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12
        + chargePose * 0.03 + kunaiState.throwPunch * 0.03 - leftEmpty * 0.15, LEFT_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack - chargePose * 0.04 - kunaiState.throwPunch * 0.12);
    leftViewModel.rotation.set(-dashPull * 0.35 + viewState.lookSwayY * 2 - mantlePose * 0.5 + chargePose * 0.25 - kunaiState.throwPunch * 0.4 - leftEmpty * 0.6, -viewState.lookSwayX * 2, slidePose * 0.35 + cameraFx.roll - chargePose * 0.2);
    // ハンドガンは右手のクナイと同じ揺れ方をさせる
    gunViewModel.position.set(GUN_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - viewState.lookSwayX * 0.5 + slidePose * 0.03, GUN_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.5 + cameraFx.landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12, GUN_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack);
    gunViewModel.rotation.set(-dashPull * 0.35 + viewState.lookSwayY * 2 - mantlePose * 0.5, -viewState.lookSwayX * 2, slidePose * 0.35 + cameraFx.roll);
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
    swordViewModel.position.set(SWORD_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * sBob - viewState.lookSwayX * 0.5 + sSlide * 0.03, SWORD_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * sBob - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.5 + cameraFx.landDip * 0.3 - sPull * 0.04 - sSlide * 0.03 - mantlePose * 0.12
        + swordSlidePose * 0.1, // スライディング中は寝かせた刀を持ち上げる
    SWORD_VIEW_MODEL_POS.z + sPull * 0.1 + speedBack);
    swordViewModel.rotation.set(-sPull * 0.35 + viewState.lookSwayY * 2 - mantlePose * 0.5, -viewState.lookSwayX * 2, sSlide * 0.35 + cameraFx.roll);
    // 鎖鎌もハンドガンと同じ揺れ方をさせる
    sickleViewModel.position.set(SICKLE_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - viewState.lookSwayX * 0.5 + slidePose * 0.03, SICKLE_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.5 + cameraFx.landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12 + sickleBodyPos.y, SICKLE_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack);
    sickleViewModel.position.x += sickleBodyPos.x;
    sickleViewModel.rotation.set(-dashPull * 0.35 + viewState.lookSwayY * 2 - mantlePose * 0.5 + sickleBodyRot.x, -viewState.lookSwayX * 2 + sickleBodyRot.y, slidePose * 0.35 + cameraFx.roll + sickleBodyRot.z);
    // バトルアックスもハンドガンと同じ揺れ方をさせる。重いので揺れは少し大きめ。振っている間は揺れを弱めて振りの形を崩さない。
    // 視点を回したときの揺れは、重さで遅れて付いてきて少し行き過ぎる（ばねで追わせる）
    axeSwayVelX += ((viewState.lookSwayX * AXE_SWAY_GAIN - axeSwayX) * AXE_SWAY_STIFF - axeSwayVelX * AXE_SWAY_DAMP) * dt;
    axeSwayVelY += ((viewState.lookSwayY * AXE_SWAY_GAIN - axeSwayY) * AXE_SWAY_STIFF - axeSwayVelY * AXE_SWAY_DAMP) * dt;
    axeSwayX += axeSwayVelX * dt;
    axeSwayY += axeSwayVelY * dt;
    axeState.axeAttackWeight += ((axeState.axeAttack ? 1 : 0) - axeState.axeAttackWeight) * Math.min(1, dt * (axeState.axeAttack ? 20 : 6));
    const axeCalm = 1 - axeState.axeAttackWeight * 0.8;
    const aBob = bobAmount * axeCalm;
    const aPull = dashPull * axeCalm;
    const aSlide = slidePose * axeCalm;
    axeViewModel.position.set(AXE_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.016 * aBob - axeSwayX * 0.5 + aSlide * 0.03, AXE_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.016 * aBob - Math.min(velocity.y, 0) * 0.002
        + axeSwayY * 0.5 + cameraFx.landDip * 0.35 - aPull * 0.04 - aSlide * 0.03 - mantlePose * 0.12, AXE_VIEW_MODEL_POS.z + aPull * 0.1 + speedBack);
    axeViewModel.rotation.set(-aPull * 0.35 + axeSwayY * 2 - mantlePose * 0.5, -axeSwayX * 2, aSlide * 0.35 + cameraFx.roll);
    // 弓もハンドガンと同じ揺れ方をさせる。長い弓を伸ばした腕で持つので、ひねりは控えめにする。
    // 弦を引くと照準の近くへ寄せて傾きを起こし、揺れを弱める。射った瞬間は弓が前へ小さく跳ねる
    // スライディング中と 3 本射ちでは、上を右へ倒して弓を横に寝かせる（引いていても横のまま）
    bowSlidePose += ((player.sliding ? 1 : 0) - bowSlidePose) * Math.min(1, dt * (player.sliding ? 12 : 8));
    const side = Math.max(bowSlidePose, bowState.sidePose);
    const bSlide = side * side * (3 - 2 * side);
    const aim = bowState.aimPose * bowState.aimPose * (3 - 2 * bowState.aimPose);
    const bCalm = 1 - aim * 0.7;
    const bBob = bobAmount * bCalm;
    bowBase.lerpVectors(BOW_VIEW_MODEL_POS, BOW_AIM_POS, aim);
    bowViewModel.position.set(bowBase.x + Math.sin(bobPhase) * 0.012 * bBob - viewState.lookSwayX * 0.5 * bCalm + slidePose * 0.03, bowBase.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bBob - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.5 * bCalm + cameraFx.landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12, bowBase.z + dashPull * 0.1 + speedBack - bowState.release * 0.03);
    bowViewModel.rotation.set(-dashPull * 0.25 + viewState.lookSwayY * 1.2 * bCalm - mantlePose * 0.5 + bowState.release * 0.06, -viewState.lookSwayX * 1.2 * bCalm, cameraFx.roll + aim * BOW_AIM_UNCANT * (1 - bSlide) - bSlide * BOW_SLIDE_TURN);
    // バットもハンドガンと同じ揺れ方をさせる
    batViewModel.position.set(BAT_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - viewState.lookSwayX * 0.5 + slidePose * 0.03, BAT_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.5 + cameraFx.landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12, BAT_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack).add(batEquipOff); // 取り出しの手の動き（向きは batCombat.ts で batRest に入れる）
    batViewModel.rotation.set(-dashPull * 0.35 + viewState.lookSwayY * 2 - mantlePose * 0.5, -viewState.lookSwayX * 2, slidePose * 0.35 + cameraFx.roll);
    // 槍もバットと同じ揺れ方。長くて重いので、視点の振りに遅れて付いてくる分を少し小さくする
    spearViewModel.position.set(SPEAR_VIEW_MODEL_POS.x + Math.sin(bobPhase) * 0.012 * bobAmount - viewState.lookSwayX * 0.4 + slidePose * 0.03, SPEAR_VIEW_MODEL_POS.y + Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.4 + cameraFx.landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12, SPEAR_VIEW_MODEL_POS.z + dashPull * 0.1 + speedBack);
    spearViewModel.rotation.set(-dashPull * 0.25 + viewState.lookSwayY * 1.5 - mantlePose * 0.5, -viewState.lookSwayX * 1.5, slidePose * 0.35 + cameraFx.roll);
    // ライフルもハンドガンと同じ揺れ方。長いので、視点の振りに遅れて付いてくる分を少し小さくする。
    // スコープを覗くときは、接眼レンズを目の前へ、スコープの軸を視線に重ねるように持ち上げ、揺れを弱める
    const scope = rifleState.scope * rifleState.scope * (3 - 2 * rifleState.scope);
    const rCalm = 1 - scope * 0.85;
    rifleBase.lerpVectors(RIFLE_VIEW_MODEL_POS, RIFLE_SCOPE_POS, scope);
    rifleRest.rotation.set(RIFLE_REST_ROT.x * (1 - scope), RIFLE_REST_ROT.y * (1 - scope), 0);
    rifleViewModel.position.set(rifleBase.x + Math.sin(bobPhase) * 0.012 * bobAmount * rCalm - viewState.lookSwayX * 0.4 * rCalm + slidePose * 0.03 * rCalm, rifleBase.y + (Math.abs(Math.cos(bobPhase)) * 0.012 * bobAmount - Math.min(velocity.y, 0) * 0.002
        + viewState.lookSwayY * 0.4 + cameraFx.landDip * 0.3 - dashPull * 0.04 - slidePose * 0.03 - mantlePose * 0.12) * rCalm, rifleBase.z + (dashPull * 0.1 + speedBack) * rCalm);
    rifleViewModel.rotation.set((-dashPull * 0.25 + viewState.lookSwayY * 1.5 - mantlePose * 0.5) * rCalm, -viewState.lookSwayX * 1.5 * rCalm, (slidePose * 0.35 + cameraFx.roll) * rCalm);
    // 撃った反動: 銃床を肩へ押し戻しながら銃口を跳ね上げる
    const rk = rifleState.recoil * rifleState.recoil;
    rifleViewModel.position.z += rk * 0.09;
    rifleViewModel.position.y += rk * 0.015;
    rifleViewModel.rotation.x += rk * 0.28;
    // レバー: 前の付け根を軸に輪を下へ振り、戻す。その間は銃を少し右へ傾けて持ち上げ、レバーが見えるようにする
    const ct = rifleState.cycleT;
    const open = ct < LEVER_OPEN_AT ? 0 : ct < LEVER_OPEN_END ? easeOutBack((ct - LEVER_OPEN_AT) / (LEVER_OPEN_END - LEVER_OPEN_AT))
        : ct < LEVER_CLOSE_END ? 1 - THREE.MathUtils.smoothstep(ct, LEVER_OPEN_END, LEVER_CLOSE_END) : 0;
    const tilt = ct < LEVER_CLOSE_END + 0.1 ? Math.sin(THREE.MathUtils.clamp((ct - LEVER_OPEN_AT + 0.06) / (LEVER_CLOSE_END - LEVER_OPEN_AT + 0.16), 0, 1) * Math.PI) : 0;
    // スピンコック: 指を軸に銃口を下から前へ縦に 1 回転させる（勢いよく回し始めて、前を向く所で止める）。
    // 回る勢いでレバーが開き、銃口が上を過ぎて戻る間に閉じる。乱射の間は長い銃が顔を掃かないよう、右下の前へ離して持つ
    const sk = rifleState.spin ? Math.min(1, rifleState.spinT / SPIN_TIME) : 1;
    const turn = 1 - (1 - sk) ** 2.2;
    rifleSpin.rotation.x = rifleState.spin ? -turn * Math.PI * 2 : 0;
    const spinOpen = rifleState.spin ? Math.sin(Math.min(1, sk / 0.85) * Math.PI) : 0;
    spinPose += ((rifleState.spin ? 1 : 0) - spinPose) * Math.min(1, dt * (rifleState.spin ? 18 : 8));
    rifleViewModel.position.x += spinPose * 0.07;
    rifleViewModel.position.y -= spinPose * 0.07;
    rifleViewModel.position.z -= spinPose * 0.12;
    rifleViewModel.rotation.y += spinPose * 0.12;
    // 取り出し: 右下から持ち上げながら、右下の前へ離した持ち方でスピンコックを 1 回見せ、前を向いた所から肩へ引き付けて構えに収まる
    let equipOpen = 0;
    const ret = rifleState.equipT;
    if (ret !== Infinity) {
        const rise = 1 - easeOutCubic(Math.min(1, ret / 0.16));
        const s = THREE.MathUtils.clamp((ret - RIFLE_EQUIP_SPIN_FROM) / (RIFLE_EQUIP_SPIN_TO - RIFLE_EQUIP_SPIN_FROM), 0, 1);
        if (s < 1)
            rifleSpin.rotation.x = -(1 - (1 - s) ** 2.2) * Math.PI * 2;
        equipOpen = s > 0 ? Math.sin(Math.min(1, s / 0.85) * Math.PI) : 0;
        // 回し終えたら、少し行き過ぎてから構えに収まる（行き過ぎた分は肩へ押し付けた形）
        const away = ret < RIFLE_EQUIP_SPIN_TO ? 1 : 1 - easeOutBack((ret - RIFLE_EQUIP_SPIN_TO) / (RIFLE_EQUIP_TIME - RIFLE_EQUIP_SPIN_TO));
        rifleViewModel.position.x += away * 0.07 + rise * 0.05;
        rifleViewModel.position.y -= away * 0.07 + rise * 0.25;
        rifleViewModel.position.z -= away * 0.12;
        rifleViewModel.rotation.x -= rise * 0.5;
        rifleViewModel.rotation.y += away * 0.12;
        rifleViewModel.rotation.z -= rise * 0.3;
    }
    rifleModel.userData.lever.rotation.x = Math.max(open, spinOpen, equipOpen) * LEVER_SWING;
    rifleViewModel.rotation.z -= tilt * 0.22 * rCalm;
    rifleViewModel.rotation.x += tilt * 0.06 * rCalm;
    rifleViewModel.position.y += tilt * 0.02 * rCalm;
    // 込める: 右の装填口を上へ向けるように銃を左へ転がし、銃口を少し上げて手前へ寄せる。1 発押し込むたびに小さく揺れる
    const rl = rifleState.reloadPose * rifleState.reloadPose * (3 - 2 * rifleState.reloadPose);
    const push = rifleState.insertPush * rifleState.insertPush;
    rifleViewModel.position.x -= rl * 0.05;
    rifleViewModel.position.y += rl * 0.05 - push * 0.006;
    rifleViewModel.position.z += rl * 0.06 - push * 0.008;
    rifleViewModel.rotation.x += rl * 0.22 - push * 0.04;
    rifleViewModel.rotation.y += rl * 0.35;
    rifleViewModel.rotation.z += rl * 0.85 + push * 0.05;
    // 高いところからの着地で、手元も画面と一緒に強く揺らす
    const ls = landShakeAmount();
    if (ls > 0) {
        const t = cameraFx.shakeTime;
        handJoltPos.set(ls * 0.025 * Math.sin(t * 83.9 + 1.7), -ls * 0.05 * Math.abs(Math.sin(t * 95.3 + 0.9)), ls * 0.02 * Math.sin(t * 77.1 + 4.4));
        const rx = -ls * 0.25 * Math.abs(Math.sin(t * 88.7 + 2.6));
        const rz = ls * 0.18 * Math.sin(t * 101.3 + 0.2);
        for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel, bowViewModel, batViewModel, rifleViewModel]) {
            vm.position.add(handJoltPos);
            vm.rotation.x += rx;
            vm.rotation.z += rz;
        }
    }
    applyInspect(dt);
    // 撃った反動で手前へ跳ね上げる。装填中と取り出し中はその動き（キーフレーム）を足す
    gunViewModel.position.z += gunState.gunRecoil * 0.1;
    gunViewModel.position.y += gunState.gunRecoil * 0.02;
    gunViewModel.rotation.x += gunState.gunRecoil * 0.6;
    gunViewModel.position.add(reloadPosOff);
    gunViewModel.rotation.x += reloadRotOff.x * DEG;
    gunViewModel.rotation.y += reloadRotOff.y * DEG;
    gunViewModel.rotation.z += reloadRotOff.z * DEG;
    // 持ち替え中は手元を画面の下へ下げる
    const h = game.holster * game.holster * (3 - 2 * game.holster);
    for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel, bowViewModel, batViewModel, rifleViewModel]) {
        vm.position.y -= h * 0.25;
        vm.rotation.x -= h * 0.9;
    }
    // クナイの取り出し: 両手を外へひねった形で下から振り上げ、少し行き過ぎてから構えに収める。左手は少し遅れて上げる。
    // 右手は握り込んだ瞬間に切っ先を前へ小さく突き出す
    const dt0 = kunaiState.drawTime;
    if (dt0 < KUNAI_DRAW_TIME) {
        const rise = (t) => 1 - easeOutBack(THREE.MathUtils.clamp(t / 0.32, 0, 1));
        const r = rise(dt0);
        const g = (dt0 - DRAW_SPIN_END) / 0.16;
        const snap = g > 0 && g < 1 ? Math.sin(g * Math.PI) * (1 - g) : 0;
        viewModel.position.x += r * 0.06;
        viewModel.position.y -= r * 0.22;
        viewModel.position.z += r * 0.05 - snap * 0.025;
        viewModel.rotation.x -= r * 1.1 + snap * 0.3;
        viewModel.rotation.y += r * 0.4;
        viewModel.rotation.z -= r * 0.8;
        const l = rise(dt0 - 0.07);
        leftViewModel.position.x -= l * 0.06;
        leftViewModel.position.y -= l * 0.22;
        leftViewModel.position.z += l * 0.05;
        leftViewModel.rotation.x -= l * 1.1;
        leftViewModel.rotation.y -= l * 0.4;
        leftViewModel.rotation.z += l * 0.8;
    }
    // 弓の取り出し: 握りを軸に画面の奥の軸まわりで回しながら、左下から振り上げる。回っている間は奥へ離して
    // 長いリムが画面を塞がないようにし、回りが緩むにつれて手元へ引き寄せる。握り込んだら少し回り過ぎて戻り、前へ小さく突き出す
    const et = bowState.equipT;
    if (et < BOW_EQUIP_SPIN + BOW_EQUIP_SNAP) {
        const u = THREE.MathUtils.clamp(et / BOW_EQUIP_SPIN, 0, 1);
        const spin = (1 - u) ** 2; // 回りの残り（勢いよく回し始めて緩める）
        const r = 1 - easeOutBack(THREE.MathUtils.clamp(et / 0.3, 0, 1));
        const g = (et - BOW_EQUIP_SPIN) / BOW_EQUIP_SNAP;
        const snap = g > 0 && g < 1 ? Math.sin(g * Math.PI) * (1 - g) : 0;
        bowViewModel.position.x += r * 0.12;
        bowViewModel.position.y -= r * 0.4;
        bowViewModel.position.z -= spin * 0.35 + snap * 0.03;
        bowViewModel.rotation.x += r * 0.5 + snap * 0.12;
        bowViewModel.rotation.z += spin * BOW_EQUIP_TURN - snap * 0.25;
    }
}
const inspectKey = (t, [x, y, z], [pitch, spin, roll], yaw, [camX, camY, camZ], zoom) => ({
    t, pos: new THREE.Vector3(x, y, z), rot: new THREE.Vector3(pitch, spin, roll),
    cam: new THREE.Vector3(camX, camY, camZ), extra: new THREE.Vector3(yaw, zoom, 0),
});
const INSPECT_PATTERNS = [
    // 横に寝かせて眺める: 刃の軸まわりに回しながら持ち上げ、奥へ離して横に寝かせて刃の面に光を流す。
    // 切っ先をこちらへ向けて刃の筋を見通し、手首を返して裏を見せ、画面の中で大きく 1 回転させて納める
    {
        keys: [
            inspectKey(0, [0, 0, 0], [0, 0, 0], 0, [0, 0, 0], 0),
            inspectKey(0.4, [-0.02, 0.08, -0.06], [14, -190, 34], 0, [2, -2, 3], 1),
            inspectKey(0.85, [0.18, 0.1, -0.2], [6, -330, 78], 0, [-1, 2, -5], 2),
            inspectKey(1.7, [0.22, 0.11, -0.26], [4, -382, 82], 0, [-1.5, 3, -6], 3),
            inspectKey(2.2, [0.2, 0.12, -0.22], [2, -392, 80], 25, [-1, 4, -4], 4),
            inspectKey(2.5, [0.2, 0.11, -0.22], [2, -548, 80], 12, [1, 1, 5], 3),
            inspectKey(3.0, [0.21, 0.11, -0.24], [4, -566, 78], 0, [0, 0, 4], 3),
            inspectKey(3.3, [0.04, 0.02, -0.04], [-6, -720, 40], 0, [2, -1, -2], 1),
            inspectKey(3.8, [0, 0, 0], [0, -720, -360], 0, [0, 0, 0], 0),
        ],
        sounds: [[0, 'swish'], [2.3, 'swish'], [3.3, 'swish'], [3.75, 'grip']],
    },
    // 画面の中で回して逆へ寝かせる: 手を左へ寄せながら刀を画面の中で回し、切っ先を右へ向けて寝かせる。
    // 刃の軸まわりにゆっくり回して光を流し、切っ先を手前へ向けてから、回し上げて納める
    {
        keys: [
            inspectKey(0, [0, 0, 0], [0, 0, 0], 0, [0, 0, 0], 0),
            inspectKey(0.45, [-0.15, 0.08, -0.1], [8, -30, 150], 0, [1, -2, 4], 1),
            inspectKey(0.9, [-0.38, 0.1, -0.3], [4, -90, 266], 0, [-1, -3, -4], 2),
            inspectKey(1.9, [-0.4, 0.11, -0.33], [3, -160, 272], 0, [-1.5, -4, -5], 3),
            inspectKey(2.4, [-0.38, 0.13, -0.3], [8, -185, 272], -25, [-1, -3, -3], 3),
            inspectKey(2.9, [-0.2, 0.06, -0.15], [0, -280, 325], 0, [1, 1, 3], 1),
            inspectKey(3.3, [0, 0, 0], [0, -360, 360], 0, [0, 0, 0], 0),
        ],
        sounds: [[0, 'swish'], [0.4, 'swish'], [2.6, 'swish'], [3.25, 'grip']],
    },
    // 目の前に立てて見上げる: 刀を奥へ倒し気味に立てて正面へ置き（切っ先まで画面に収める）、刃の軸まわりにゆっくり回して面と刃先を見せる。
    // 切っ先をさらに奥へ倒して見上げ、手首を鋭く返して構えへ戻す
    {
        keys: [
            inspectKey(0, [0, 0, 0], [0, 0, 0], 0, [0, 0, 0], 0),
            inspectKey(0.5, [-0.2, 0.03, -0.2], [-20, -90, 2], 0, [1, 0, 1], 2),
            inspectKey(1.4, [-0.21, 0.0, -0.24], [-25, -200, -6], 0, [2, 1, -2], 3),
            inspectKey(2.0, [-0.2, -0.05, -0.28], [-38, -250, -4], 0, [5, 0, 0], 4),
            inspectKey(2.35, [-0.16, 0.03, -0.1], [6, -385, -10], 0, [-1, 0, 2], 2),
            inspectKey(2.8, [0, 0, 0], [0, -360, 0], 0, [0, 0, 0], 0),
        ],
        sounds: [[0, 'swish'], [2.05, 'swish'], [2.75, 'grip']],
    },
];
// ライフルは長いので専用の動き: 右手で握ったまま奥へ離し、銃口を左へ向けて横から全体を見せる（銃床は手の外の右へ抜ける）。
// 握りを右下に残したまま銃口を左上へ起こして奥へ倒し、少しためてから握りを軸に画面の中で 1 回転させ、その勢いで構えへ戻す
const RIFLE_INSPECT = [
    {
        keys: [
            inspectKey(0, [0, 0, 0], [0, 0, 0], 0, [0, 0, 0], 0),
            inspectKey(0.45, [0.07, 0.08, -0.42], [6, 88, -4], 0, [-1, -2, -1], 2),
            inspectKey(1.5, [0.09, 0.09, -0.45], [2, 92, 0], 0, [-1, -3, 0], 3),
            inspectKey(2.0, [0.03, -0.12, -0.38], [-25, 90, -55], 0, [1, -1, -2], 2),
            inspectKey(2.8, [0.02, -0.13, -0.4], [-28, 90, -60], 0, [1.5, -1, -3], 2),
            inspectKey(3.0, [0.01, -0.12, -0.38], [-26, 90, -40], 0, [1, -1, -2], 2),
            inspectKey(3.18, [0.01, -0.1, -0.3], [-20, 90, 250], 0, [-1, 0, 2], 1),
            inspectKey(3.42, [0, 0, 0], [0, 0, 360], 0, [0, 0, 0], 0),
        ],
        sounds: [[0, 'swish'], [1.6, 'swish'], [3.02, 'swish'], [3.38, 'grip']],
    },
];
let inspecting = INSPECT_PATTERNS[0];
const INSPECT_FADE = 0.12; // 途中でやめたときに構えへ戻す時間
let inspectT = -1; // 眺め始めてからの時間。負なら眺めていない
let inspectWeight = 0; // やめたときはこれを 0 へ下げて構えへ戻す
const inspectPos = new THREE.Vector3();
const inspectRot = new THREE.Vector3();
const inspectCam = new THREE.Vector3();
const inspectExtra = new THREE.Vector3();
const inspectQuat = new THREE.Quaternion();
const inspectAxisQuat = new THREE.Quaternion();
const NO_TURN = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
// キー i を通るときの速さ（前後のキーの差を時刻の差で割る。最初と最後は 0）
const slopeA = new THREE.Vector3();
const slopeB = new THREE.Vector3();
function slope(keys, i, ch, out) {
    if (i === 0 || i === keys.length - 1)
        return out.set(0, 0, 0);
    return out.subVectors(keys[i + 1][ch], keys[i - 1][ch]).divideScalar(keys[i + 1].t - keys[i - 1].t);
}
// キー i と i + 1 の間（u: 0〜1）を 3 次のエルミート曲線でつなぐ
function hermite(keys, i, u, ch, out) {
    const h = keys[i + 1].t - keys[i].t;
    slope(keys, i, ch, slopeA);
    slope(keys, i + 1, ch, slopeB);
    const u2 = u * u;
    const u3 = u2 * u;
    return out
        .copy(keys[i][ch]).multiplyScalar(2 * u3 - 3 * u2 + 1)
        .addScaledVector(slopeA, (u3 - 2 * u2 + u) * h)
        .addScaledVector(keys[i + 1][ch], 3 * u2 - 2 * u3)
        .addScaledVector(slopeB, (u3 - u2) * h);
}
// 今の武器が振り・溜め・取り出し・装填などの途中か（その間は眺めない）
function weaponBusy() {
    switch (game.shownWeapon) {
        case 'kunai': return kunaiState.attack !== null || kunaiState.charging || pendingThrows.length > 0 || kunaiState.drawTime < KUNAI_DRAW_TIME;
        case 'sword': return swordState.swordAttack !== null || swordState.focusing || swordState.rushTime >= 0 || swordState.swordHold >= 0 || swordState.chargeDashTime > 0;
        case 'handgun': return gunState.gunReloading || gunState.drawT >= 0;
        case 'sickle': return sickleState.grapple !== null || sickleState.sickleMelee !== null || sickleState.drawT < SICKLE_DRAW_TIME;
        case 'axe': return axeState.axeAttack !== null;
        case 'bow': return bowState.aimPose > 0.02 || bowState.equipT !== Infinity;
        case 'bat': return batState.attack !== null || batState.hold >= 0 || batState.equipT !== Infinity;
        case 'spear': return spearState.attack !== null || spearState.hold >= 0 || spearState.guard > 0 || spearThrow.phase !== 'none' || spearState.equipT !== Infinity;
        case 'rifle': return rifleState.scope > 0.01 || rifleState.cycleT < LEVER_CLOSE_END || rifleState.reload !== 'none' || rifleState.spin || rifleState.equipT !== Infinity;
    }
    return false;
}
const inspectRoot = () => {
    switch (game.shownWeapon) {
        case 'kunai': return viewModel;
        case 'handgun': return gunViewModel;
        case 'sword': return swordViewModel;
        case 'sickle': return sickleViewModel;
        case 'axe': return axeViewModel;
        case 'bow': return bowViewModel;
        case 'bat': return batViewModel;
        case 'spear': return spearViewModel;
        case 'rifle': return rifleViewModel;
    }
};
// 振りの風切り音は武器ごと（スキンが音を持てばその音）
const inspectSwish = () => {
    switch (game.shownWeapon) {
        case 'handgun': return skinOf('handgun').swish ?? 'gun';
        case 'bow': return 'kunai';
        case 'spear': return skinOf('spear').swish ?? 'sword';
        case 'rifle': return skinOf('rifle').swish ?? 'gun';
        default: return skinOf(game.shownWeapon).swish ?? game.shownWeapon;
    }
};
// 立てた刃の軸まわりに回してから（spin）、画面の奥の軸で寝かせ（roll）、横軸で起こし（pitch）、縦軸で切っ先を手前へ向ける（yaw）。
// やめるときは構えの向きへ回し戻す
function inspectTurn(side, w, out) {
    out.setFromAxisAngle(AXIS_Y, inspectExtra.x * side * DEG);
    out.multiply(inspectAxisQuat.setFromAxisAngle(AXIS_X, inspectRot.x * DEG));
    out.multiply(inspectAxisQuat.setFromAxisAngle(AXIS_Z, inspectRot.z * side * DEG));
    out.multiply(inspectAxisQuat.setFromAxisAngle(AXIS_Y, inspectRot.y * side * DEG));
    if (w < 1)
        out.slerpQuaternions(NO_TURN, out, w);
    return out;
}
function applyInspect(dt) {
    cameraFx.inspect.set(0, 0, 0);
    cameraFx.inspectZoom = 0;
    // 鎖鎌は右手の 1 本だけを回す（下）。眺めていないときは向きを戻しておく
    rightSickle.quaternion.identity();
    leftSickle.quaternion.identity();
    sickleState.inspectLower = 0;
    // 走る・スライディング・ダッシュの間は構えが変わるのでやめる
    const moving = Math.hypot(velocity.x, velocity.z) > WALK_SPEED + 1 || player.sliding || player.dashTime > 0;
    const blocked = weaponBusy() || moving || game.holster > 0 || game.wantWeapon !== game.shownWeapon || isDown();
    if (viewState.inspectPressed) {
        viewState.inspectPressed = false;
        if (!blocked && inspectT < 0) {
            // 前と違う動きを選ぶ
            const patterns = game.shownWeapon === 'rifle' ? RIFLE_INSPECT : INSPECT_PATTERNS;
            const others = patterns.filter((pt) => pt !== inspecting);
            const pool = others.length > 0 ? others : patterns;
            inspecting = pool[Math.floor(Math.random() * pool.length)];
            inspectT = 0;
            inspectWeight = 1;
            sfx.playGrip();
        }
    }
    if (inspectT < 0)
        return;
    if (blocked)
        inspectWeight = Math.max(0, inspectWeight - dt / INSPECT_FADE);
    const prev = inspectT;
    inspectT += dt;
    if (!blocked) {
        for (const [at, kind] of inspecting.sounds) {
            if (!(prev < at && inspectT >= at) && !(at === 0 && prev === 0))
                continue;
            if (kind === 'grip')
                sfx.playGrip();
            else
                sfx.playSwish({ at: 0, dur: 0.22, f0: 400, f1: 1600, gain: 0.18 }, inspectSwish());
        }
    }
    const keys = inspecting.keys;
    if (inspectT >= keys[keys.length - 1].t || inspectWeight <= 0) {
        inspectT = -1;
        return;
    }
    // キーの間を、キーの時刻に合わせた速さでつなぐ（つなぎ目で速さが跳ねない）。最初と最後は止まった所から動き出し、止まって終わる
    let i = 0;
    while (i < keys.length - 2 && inspectT >= keys[i + 1].t)
        i++;
    const u = (inspectT - keys[i].t) / (keys[i + 1].t - keys[i].t);
    hermite(keys, i, u, 'pos', inspectPos);
    hermite(keys, i, u, 'rot', inspectRot);
    hermite(keys, i, u, 'cam', inspectCam);
    hermite(keys, i, u, 'extra', inspectExtra);
    const vm = inspectRoot();
    if (!vm)
        return;
    const w = inspectWeight * inspectWeight * (3 - 2 * inspectWeight);
    // 画面の左寄りに構える武器（弓と斧）は反転する。手元の揺れで位置の符号が入れ替わらないよう、構えの位置ではなく武器で決める
    const side = game.shownWeapon === 'bow' || game.shownWeapon === 'axe' ? -1 : 1;
    vm.position.x += inspectPos.x * side * w;
    vm.position.y += inspectPos.y * w;
    vm.position.z += inspectPos.z * w;
    if (game.shownWeapon === 'sickle') {
        // 鎖鎌は左右の 2 本を両手の間を原点に持っているので、まとめて回すと 2 本が大きく振り回される。
        // 右手の 1 本だけを握った手を軸に回し、左手は下げて少し寝かせてよける（手の位置は鎖鎌の処理が毎フレーム決め直すが、向きは触らない）
        inspectTurn(1, w, rightSickle.quaternion);
        leftSickle.quaternion.setFromAxisAngle(AXIS_X, -0.5 * w);
        sickleState.inspectLower = w;
    }
    else {
        vm.quaternion.premultiply(inspectTurn(side, w, inspectQuat));
    }
    // クナイは右手で眺めるので、左手は下げてよける
    if (game.shownWeapon === 'kunai') {
        leftViewModel.position.y -= 0.12 * w;
        leftViewModel.rotation.x -= 0.4 * w;
    }
    cameraFx.inspect.set(inspectCam.x * DEG * w, inspectCam.y * side * DEG * w, inspectCam.z * side * DEG * w);
    cameraFx.inspectZoom = inspectExtra.y * w;
}
const initial_viewState = snapshotState(viewState);
export function resetViewModelMotion() {
    initial_viewState();
    swordRunPose = 0;
    swordSlidePose = 0;
    bowSlidePose = 0;
    axeSwayX = 0;
    axeSwayY = 0;
    axeSwayVelX = 0;
    axeSwayVelY = 0;
    bobPhase = 0;
    bobAmount = 0;
    dashPull = 0;
    slidePose = 0;
    mantlePose = 0;
    chargePose = 0;
    leftEmpty = 0;
    spinPose = 0;
    inspecting = INSPECT_PATTERNS[0];
    inspectT = -1;
    inspectWeight = 0;
}

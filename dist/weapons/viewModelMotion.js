import * as THREE from 'three';
import * as sfx from '../audio.js';
import { DEG } from '../math.js';
import { easeOutBack } from '../ease.js';
import { SICKLE_VIEW_MODEL_POS } from './chainSickle.js';
import { AXE_VIEW_MODEL_POS } from './battleAxe.js';
import { SWORD_RUN_QUAT, SWORD_SLIDE_QUAT, SWORD_STAND_QUAT, SWORD_VIEW_MODEL_POS } from './sword.js';
import { AXE_SWAY_DAMP, AXE_SWAY_GAIN, AXE_SWAY_STIFF, GUN_VIEW_MODEL_POS, LEFT_VIEW_MODEL_POS, VIEW_MODEL_POS, axeViewModel, gunViewModel, leftViewModel, sickleViewModel, swordRestQuat, swordViewModel, viewModel, } from './viewModels.js';
import { axeState, startAxeAttack } from './axeCombat.js';
import { AXE_DRAW } from './axeAttacks.js';
import { startSwordAttack, swordState } from './swordCombat.js';
import { SWORD_DRAW } from './swordAttacks.js';
import { gunState, reloadPosOff, reloadRotOff, startGunDraw } from './handgunCombat.js';
import { sickleBodyPos, sickleBodyRot, sickleState, startSickleDraw } from './sickleCombat.js';
import { DRAW_SPIN_END, KUNAI_DRAW_TIME, kunaiState, pendingThrows, startKunaiDraw } from './kunaiCombat.js';
import { cameraFx, landShakeAmount } from '../fx/camera.js';
import { player, velocity } from '../player/state.js';
import { SPRINT_SPEED, WALK_SPEED } from '../player/config.js';
import { isDown } from '../player/down.js';
import { game } from '../game/state.js';
// ---- 手元の武器の動き ----
// 武器の持ち替え・歩きや視点移動につれた揺れ・構えの切り替え
// 本体からも読み書きする値
export const viewState = {
    // 視点を動かしたときにクナイを遅れてついてこさせるための量（マウスとパッドの入力で足す）
    lookSwayX: 0,
    lookSwayY: 0,
};
// ---- ビューモデル（クナイ）の動き ----
// 持ち替えは「今の武器を下げる → 入れ替える → 新しい武器を上げる」
export const HOLSTER_TIME = 0.14;
// 構えの切り替え具合と、斧の重さで遅れる揺れ
let swordRunPose = 0; // 0 = 縦に立てた構え, 1 = 走るときの前へ倒した構え
let swordSlidePose = 0; // 1 = スライディング中の横に寝かせた構え
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
export function updateWeaponSwitch(dt) {
    // 振りや溜め、投げの途中では持ち替えず、終わるのを待つ
    const kunaiBusy = kunaiState.attack !== null || kunaiState.charging || pendingThrows.length > 0;
    // 抜刀・斧の取り出しの途中なら持ち替えてよい
    const swordBusy = (swordState.swordAttack !== null && swordState.swordAttack !== SWORD_DRAW) || swordState.rushTime >= 0 || swordState.swordHold >= 0 || swordState.chargeDashTime > 0;
    const busy = (game.shownWeapon === 'kunai' && kunaiBusy) || (game.shownWeapon === 'sword' && swordBusy) || sickleState.grapple !== null
        || sickleState.sickleMelee !== null || (game.shownWeapon === 'axe' && axeState.axeAttack !== null && axeState.axeAttack !== AXE_DRAW);
    if (isDown()) {
        game.holster = Math.min(1, game.holster + game.realDt / (HOLSTER_TIME * 2)); // 倒れたら武器を画面の下へ落とす
    }
    else if (game.wantWeapon !== game.shownWeapon && !busy) {
        game.holster = Math.min(1, game.holster + dt / HOLSTER_TIME);
        if (game.holster === 1) {
            game.shownWeapon = game.wantWeapon;
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
}
export const handJoltPos = new THREE.Vector3();
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
    chargePose += ((kunaiState.charging ? 1 : 0) - chargePose) * Math.min(1, dt * 30);
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
    // 高いところからの着地で、手元も画面と一緒に強く揺らす
    const ls = landShakeAmount();
    if (ls > 0) {
        const t = cameraFx.shakeTime;
        handJoltPos.set(ls * 0.025 * Math.sin(t * 83.9 + 1.7), -ls * 0.05 * Math.abs(Math.sin(t * 95.3 + 0.9)), ls * 0.02 * Math.sin(t * 77.1 + 4.4));
        const rx = -ls * 0.25 * Math.abs(Math.sin(t * 88.7 + 2.6));
        const rz = ls * 0.18 * Math.sin(t * 101.3 + 0.2);
        for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel]) {
            vm.position.add(handJoltPos);
            vm.rotation.x += rx;
            vm.rotation.z += rz;
        }
    }
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
    for (const vm of [viewModel, leftViewModel, gunViewModel, swordViewModel, sickleViewModel, axeViewModel]) {
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
}

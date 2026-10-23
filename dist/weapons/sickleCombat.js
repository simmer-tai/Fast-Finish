import * as THREE from 'three';
import * as sfx from '../audio.js';
import { playGrip, playRing, playSwish } from '../audio.js';
import { pressed } from '../input.js';
import { DEG, UP } from '../math.js';
import { easeOutBack } from '../ease.js';
import { camera, controls, scene } from '../core.js';
import { createChainSickle, createLongChain, layChain, layLongChain } from './chainSickle.js';
import { RETURN_SWISH, THROW_SWISH } from './kunaiAttacks.js';
import { kunaiMat, leftSickle, rightSickle, sickleMats } from './viewModels.js';
import { swordState } from './swordCombat.js';
import { spawnSparks } from '../fx/hitFx.js';
import { Ribbon, SICKLE_RIBBON, TRAIL_STEP, makeRibbonMaterial } from '../fx/ribbons.js';
import { DUMMY_HEIGHT, DUMMY_RADIUS } from '../enemy/body.js';
import { en, enemies, hitDir, hitPoint, setEn } from '../enemy/state.js';
import { blocks, ramps } from '../world/blocks.js';
import { rayBox, rayRamp } from '../world/raycast.js';
import { player, position, velocity } from '../player/state.js';
import { GRAVITY, JUMP_SPEED } from '../player/config.js';
import { endWallRun, hasHeadroom } from '../player/movement.js';
import { DASH_ATTACK_WINDOW, game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
// ---- 鎖鎌 ----
// 右クリックで投げて引き寄せる・左クリックの近接・R キーの投げ回し
// 引き寄せの回数: 建物か敵に掛かるたびに 1 消費（外れたら消費しない）。時間で 1 本ずつ戻り、倒すと 1 本戻る。
// 残りが無いときは振りかぶれない
export const HOOK_CHARGES = 2;
// 本体からも読み書きする値
export const sickleState = {
    grapple: null,
    throwPressed: false, // 右クリックを押した瞬間
    hookCharges: HOOK_CHARGES,
    hookRecharge: 0,
    hookEmptyFlash: 0, // 残りが無いのに投げようとしたとき、ゲージを点滅させる残り時間
    sickleMelee: null,
    sicklePressed: false,
    sickleCombo: 0,
    sickleAirCombo: 0,
    tossPressed: false,
    drawT: Infinity, // 取り出し始めてからの時間（取り出していないときは Infinity）
};
// ---- 鎖鎌（左クリックの近接は updateSickleMelee）: 右クリックで構えてすぐ投げる。建物に掛かったら鎖をたぐって自分を引き寄せる ----
// 掛かったら自動で引き始め、近くまで寄ったら放す。引いている間に右クリックで放し、スペースで放して跳ぶ
export const GRAPPLE_RANGE = 25;
export const GRAPPLE_SPREAD = 0.25; // 2 本の刺さる所を、照準の先から左右へずらす距離
export const GRAPPLE_ENEMY_SPREAD = 0.1; // 敵に掛けるときは狭く
// 振りかぶり: 手を持ち上げて手前へ引き、柄の先を後ろへ倒す
export const AIM_HAND_LIFT = new THREE.Vector3(0.04, 0.1, 0.1); // 手を動かす量（右手の値で、左手は x が逆）
export const AIM_TILT = 0.9; // 柄の先を後ろへ倒す角度 (rad)
export const AIM_ROLL = -0.3; // 外へ傾ける角度 (rad。右手の値で、左手は逆向き)
// 投げ: 離したら、鎖を持った手を軸に鎌を縦に 1 周回して勢いをつけ（上 → 前 → 下 → 後ろ → 上）、前へ振り出す所で放す
export const QUICK_AIM_TIME = 0.1; // 右クリックしてから振りかぶって回し始めるまで (s)
export const HOOK_STAGGER = 0; // 右手が回し始めてから左手が回し始めるまで (s)。0 なら両手同時
export const WINDUP_TIME = 0.18; // 振りかぶった所から 1 周して放すまで (s)。だんだん速く回す
export const WINDUP_RADIUS = 0.15; // 回している間の、握りの先から頭の付け根までの鎖の長さ
export const WINDUP_REACH = 0.3; // 回し始めのこの割合で、手元の構えから鎖の先へ鎌を送り出す
export const WINDUP_SWISH = { at: 0, dur: WINDUP_TIME, f0: 300, f1: 1300, gain: 0.04 };
export const THROW_PUNCH_POS = new THREE.Vector3(0, 0.02, -0.12); // 投げた手を前へ突き出す量
export const GRAPPLE_FLY_SPEED = 75;
export const GRAPPLE_TUMBLE = 22; // 飛んでいる間の縦回転のおよその速さ (rad/s)。刃先から刺さるよう、着く瞬間にちょうど回りきる速さへ合わせる
export const GRAPPLE_STICK_DEPTH = 0.06; // 柄の先が壁に食い込む深さ
export const FLY_WAVE = 0.05; // 伸びていく鎖の波の大きさ（鎖の長さに対する割合）
// 刺さった・引き寄せ
export const STICK_WOBBLE = 0.35; // 刺さった鎌が揺れる角度 (rad)
export const TWANG_AMP = 0.06; // 刺さって張った鎖の震えの大きさ (m)
export const PULL_TREMBLE = 0.006; // 引いている間の鎖の細かい震え (m)
// 引き寄せは加速ではなく、決まった時間で目的地まで一気に飛ぶ（動き出しが最も速く、着く直前だけ緩む）
export const ZIP_SPEED = 80; // 平均の速さ。かかる時間 = 距離 / これ
export const ZIP_MIN_TIME = 0.08; // 近くてもこれだけはかける (s)
export const ZIP_STOP = 1.4; // 掛かった所のこれだけ手前で止まる（引く点からの距離）
export const ZIP_FOV = 10; // 飛んでいる間に広げる視野 (度)
export const ZIP_JUMP_MAX_SPEED = 23; // 飛んでいる途中でジャンプして抜けたとき、残す水平の速さの上限（引き寄せる前の方が速ければそちら）
export const GRAPPLE_PULL_HEIGHT = 1.0; // 足元からこの高さの点を、掛かった所へ引き寄せる
export const HAUL_POS = new THREE.Vector3(0, -0.03, 0.1); // 引き寄せる間、両手を手前へ引く量
// 着いた時・戻る時
export const ARRIVE_KEEP = 0.25; // 着いたとき、引かれてきた勢いをこれだけ残す
export const VAULT_REACH = 3.2; // 建物の上面がこの高さ以内なら、縁を越えて上に乗る
export const VAULT_CLEAR = 0.5; // 上面よりこれだけ高く跳ぶ
export const VAULT_FORWARD = 4; // 上に乗るとき、建物の方へ進む速さ
export const WALL_KICK_UP = 9; // 上面が遠ければ、壁を蹴ってこの速さで上へ跳ぶ
export const WALL_KICK_OUT = 3; // 同じく、壁から離れる速さ
export const GRAPPLE_RETURN_SPEED = 60;
export const RETURN_TUMBLE = 20; // 戻る間の縦回転 (rad/s)
export const CATCH_TWIRL_TIME = 0.3; // 受け止めた鎌を手の中で 1 回転させる時間 (s)
export const GRAPPLE_AXIS = new THREE.Vector3(0, 1, 0);
export const TUMBLE_AXIS = new THREE.Vector3(0, 0, 1);
export function createHook(hand, side) {
    const sickle = createChainSickle(sickleMats, true); // 飛ぶのは頭だけ
    sickle.visible = false;
    scene.add(sickle);
    const chain = createLongChain(kunaiMat, GRAPPLE_RANGE + 5);
    chain.visible = false;
    scene.add(chain);
    return {
        side, hand, handPos: hand.position.clone(), rest: hand.userData.rest,
        restQuat: hand.userData.rest.quaternion.clone(), shortChain: hand.userData.chain,
        held: hand.userData.sickle, head: hand.userData.sickle.userData.head, point: 0,
        aim: 0, slide: 0, launchIn: -1, windT: -1, thrown: false, punch: 0, yank: 0, catchT: -1, toss: null,
        sickle, chain, dir: new THREE.Vector3(), flyLeft: 0, flyTotal: 0, spin: 0, spinRate: 0, stuckTime: -1, back: false, twang: 0,
    };
}
export const grappleHooks = [createHook(rightSickle, 1), createHook(leftSickle, -1)];
let grappleClock = 0;
export const grappleHand = new THREE.Vector3();
export const grappleButt = new THREE.Vector3();
export const grappleStep = new THREE.Vector3();
export const grappleRight = new THREE.Vector3();
export const hookTarget = new THREE.Vector3();
export const pullFrom = new THREE.Vector3();
export const pullDir = new THREE.Vector3();
export const zipWant = new THREE.Vector3();
export const handTurn = new THREE.Euler();
export const windRadial = new THREE.Vector3();
export const windTangent = new THREE.Vector3();
export const windFace = new THREE.Vector3();
export const windQuat = new THREE.Quaternion();
export const GRIP_POINT = 0.75; // 頭が離れている間、握りの先を鎖の向きへ向ける強さ
export const chainHang = new THREE.Vector3();
export const gripTip = new THREE.Vector3();
export const restInv = new THREE.Quaternion();
export const pointDir = new THREE.Vector3();
export const pointFrom = new THREE.Vector3();
export const gripUp = new THREE.Vector3();
export const pointQuat = new THREE.Quaternion();
export const pointBlend = new THREE.Quaternion();
export const tumbleBasis = new THREE.Matrix4();
export const bendSide = new THREE.Vector3();
export const tumbleSide = new THREE.Vector3();
export const tumbleFront = new THREE.Vector3();
export const tumbleQuat = new THREE.Quaternion();
export const capPoint = new THREE.Vector3();
export const sickleReady = () => game.shownWeapon === 'sickle' && game.wantWeapon === 'sickle' && game.holster === 0;
export const HOOK_RECHARGE = 4; // 1 回分回復する時間 (s)
export const HOOK_EMPTY_FLASH = 0.35;
export function updateHookCharges(dt) {
    sickleState.hookEmptyFlash = Math.max(0, sickleState.hookEmptyFlash - dt);
    if (sickleState.hookCharges >= HOOK_CHARGES) {
        sickleState.hookRecharge = 0;
        return;
    }
    sickleState.hookRecharge += dt;
    if (sickleState.hookRecharge >= HOOK_RECHARGE) {
        sickleState.hookRecharge -= HOOK_RECHARGE;
        sickleState.hookCharges++;
        if (sickleState.hookCharges >= HOOK_CHARGES)
            sickleState.hookRecharge = 0;
    }
}
// 建物だけを調べ、最初に当たるまでの距離を返す（なければ far のまま）。当たった建物は hitBlock に入れる
let hitBlock = null;
export function castBlocks(origin, dir, far) {
    let best = far;
    hitBlock = null;
    for (const b of blocks) {
        const t = rayBox(origin, dir, b, best);
        if (t >= 0) {
            best = t;
            hitBlock = b;
        }
    }
    for (const r of ramps) {
        const t = rayRamp(origin, dir, r, best);
        if (t >= 0) {
            best = t;
            hitBlock = r;
        }
    }
    return best;
}
// 右クリック: 振りかぶってすぐ両手で鎌を回し始める。狙う先は、最初の 1 本を放す瞬間の照準で決める（aimGrapple）
export function startThrow() {
    sickleState.grapple = {
        phase: 'fly', target: new THREE.Vector3(), block: null, enemy: null, struck: false, aimed: false,
        pullTime: 0, zipFrom: new THREE.Vector3(), zipTo: new THREE.Vector3(), zipDur: 0, speedBefore: 0,
    };
    for (const h of grappleHooks)
        h.launchIn = QUICK_AIM_TIME + (h.side > 0 ? 0 : HOOK_STAGGER);
}
// 照準の先を調べて、鎌の飛ぶ先を決める。地面より手前で敵か建物に当たったときだけ掛かる
export function aimGrapple(g) {
    camera.getWorldDirection(grappleAimDir);
    const blockT = castBlocks(camera.position, grappleAimDir, GRAPPLE_RANGE);
    const groundT = grappleAimDir.y < -1e-6 ? -camera.position.y / grappleAimDir.y : Infinity;
    const enemyT = castDummy(camera.position, grappleAimDir, GRAPPLE_RANGE);
    g.enemy = enemyT < blockT && enemyT < groundT ? castEnemy : null;
    let hooked = g.enemy || (blockT < GRAPPLE_RANGE && blockT < groundT);
    // 掛かるときだけ 1 消費する。残りが無ければ（振りかぶった後に使い切ったなど）掛からずに戻ってくる
    if (hooked && sickleState.hookCharges > 0) {
        sickleState.hookCharges--;
    }
    else if (hooked) {
        hooked = false;
        g.enemy = null;
    }
    g.target.copy(camera.position).addScaledVector(grappleAimDir, Math.min(blockT, groundT, enemyT));
    g.block = hooked && !g.enemy ? hitBlock : null;
    g.aimed = true;
    grappleRight.crossVectors(grappleAimDir, camera.up).normalize();
}
// 敵を縦の円柱とみなし、線が当たるまでの距離を返す（当たらなければ Infinity）。狙いやすいよう、当たりは少し太くする
export const GRAPPLE_ENEMY_RADIUS = DUMMY_RADIUS + 0.3;
export const grappleAimDir = new THREE.Vector3();
export const castRay = new THREE.Ray();
export const castAxisA = new THREE.Vector3();
export const castAxisB = new THREE.Vector3();
export const castOnRay = new THREE.Vector3();
export const castOnAxis = new THREE.Vector3();
let castEnemy = null; // castDummy で当たった敵
export function castDummy(origin, dir, far) {
    let best = Infinity;
    castEnemy = null;
    for (const e of enemies) {
        setEn(e);
        const t = castEnemyBody(origin, dir, far);
        if (t < best) {
            best = t;
            castEnemy = e;
        }
    }
    return best;
}
// en に当たるまでの距離
export function castEnemyBody(origin, dir, far) {
    if (!en.alive)
        return Infinity;
    castRay.origin.copy(origin);
    castRay.direction.copy(dir);
    castAxisA.set(en.root.position.x, en.root.position.y + 0.3, en.root.position.z);
    castAxisB.set(en.root.position.x, en.root.position.y + DUMMY_HEIGHT - 0.1, en.root.position.z);
    const d2 = castRay.distanceSqToSegment(castAxisA, castAxisB, castOnRay, castOnAxis);
    if (d2 > GRAPPLE_ENEMY_RADIUS ** 2)
        return Infinity;
    // 体の表面（線と軸の最も近い所から、手前へ半径の分）
    const t = castOnRay.distanceTo(origin) - Math.sqrt(Math.max(0, DUMMY_RADIUS ** 2 - d2));
    return t > 0.5 && t < far ? t : Infinity;
}
// 飛んでいる鎌の向き: 柄の先を dir へ向け、dir と水平な横軸に直交する面で縦に spin だけ回す
export function orientTumble(h, extra = 0) {
    tumbleSide.crossVectors(h.dir, UP);
    if (tumbleSide.lengthSq() < 1e-6)
        tumbleSide.set(1, 0, 0);
    tumbleSide.normalize();
    tumbleFront.crossVectors(h.dir, tumbleSide);
    h.sickle.quaternion.setFromRotationMatrix(tumbleBasis.makeBasis(tumbleFront, h.dir, tumbleSide));
    h.sickle.quaternion.multiply(tumbleQuat.setFromAxisAngle(TUMBLE_AXIS, h.spin + extra));
}
export function launchHook(h) {
    h.launchIn = -1;
    h.windT = -1;
    if (!sickleState.grapple || sickleState.grapple.phase === 'back')
        return; // 先に投げた方が外れていたら、こちらは投げない
    if (!sickleState.grapple.aimed)
        aimGrapple(sickleState.grapple); // 放す瞬間の照準で狙う
    h.thrown = true;
    h.back = false;
    h.stuckTime = -1;
    h.twang = 0;
    h.punch = 1;
    // 回している頭の位置から、照準の先の少し左右へまっすぐ飛ばす
    h.head.getWorldPosition(grappleHand);
    h.sickle.position.copy(grappleHand);
    // 敵に掛けるときは、2 本とも体に刺さるよう狭く広げる
    hookTarget.copy(sickleState.grapple.target).addScaledVector(grappleRight, (sickleState.grapple.enemy ? GRAPPLE_ENEMY_SPREAD : GRAPPLE_SPREAD) * h.side);
    h.dir.subVectors(hookTarget, grappleHand);
    // 柄の先が当たる所で止まるよう、握りの位置が進む距離はその分短くする
    h.flyLeft = h.flyTotal = Math.max(0, h.dir.length() - h.sickle.userData.capTip + GRAPPLE_STICK_DEPTH);
    h.dir.normalize();
    // 着く瞬間にちょうど回りきって、柄の先から刺さる回転の速さにする
    const flyTime = h.flyLeft / GRAPPLE_FLY_SPEED;
    const turns = Math.max(1, Math.round((flyTime * GRAPPLE_TUMBLE) / (Math.PI * 2)));
    h.spin = 0;
    h.spinRate = flyTime > 1e-3 ? (turns * Math.PI * 2) / flyTime : 0;
    orientTumble(h);
    if (h.side > 0 || HOOK_STAGGER > 0) {
        // 両手同時なら音は 1 つだけ
        sfx.playThrow(THROW_SWISH);
        sfx.playChain('throw');
    }
    kickVel.x += 0.5 * DEG * 22;
}
// 放す。arrived なら掛かった所まで寄りきったので、縁を越えて上へ乗るか、壁を蹴って上へ跳ぶ
export function releaseGrapple(arrived) {
    if (!sickleState.grapple)
        return;
    if (arrived && sickleState.grapple.enemy) {
        arriveEnemy();
        return;
    }
    if (arrived)
        arriveGrapple(sickleState.grapple);
    if (sickleState.grapple.phase === 'pull')
        playRing(0.9, 0.25, 0.05); // 抜けた「キン」
    sickleState.grapple.phase = 'back';
    for (const h of grappleHooks) {
        // まだ投げていない方は投げずに手に残す
        h.launchIn = -1;
        h.windT = -1;
        if (h.thrown && !h.back)
            startHookBack(h);
    }
    playSwish(RETURN_SWISH);
    sfx.playChain('reel');
}
// 敵の前まで寄りきった: 勢いを止め、刺さっていた頭を一気にたぐって握りに組み付け、そのまま挟み斬りへ
export const GRAPPLE_STICK_HIT = { kick: [-0.6, 0, 0], knock: 160, hitStop: 0.04, fx: 0.6 };
export function arriveEnemy() {
    velocity.multiplyScalar(0.15);
    velocity.y = Math.max(velocity.y, 1.5); // 少しだけ浮かせて、斬る間に落ちすぎないように
    for (const h of grappleHooks) {
        h.launchIn = -1;
        h.windT = -1;
        h.thrown = false;
        h.back = false;
        h.stuckTime = -1;
    }
    sickleState.grapple = null;
    playGrip(); // 頭が握りに組み付く「ガチッ」
    playSwish(RETURN_SWISH);
    startSickleMove(SICKLE_PULL);
}
export function startHookBack(h) {
    h.back = true;
    h.stuckTime = -1;
    h.spin = 0;
    h.spinRate = RETURN_TUMBLE;
}
export function arriveGrapple(g) {
    velocity.multiplyScalar(ARRIVE_KEEP);
    pullDir.set(g.target.x - position.x, 0, g.target.z - position.z);
    if (pullDir.lengthSq() > 1e-6)
        pullDir.normalize();
    const b = g.block;
    // 上面の上が別の箱でふさがっている（屋根を支える柱の上など）なら、乗れないので壁を蹴る方にする
    const topOpen = !!b && hasHeadroom(THREE.MathUtils.clamp(g.target.x, b.minX, b.maxX), THREE.MathUtils.clamp(g.target.z, b.minZ, b.maxZ), b.h);
    if (b && topOpen && b.h - position.y < VAULT_REACH) {
        // 上面が近い: 縁を越える高さまで跳び、建物の方へ進んで上に乗る
        velocity.y = Math.sqrt(2 * GRAVITY * Math.max(0.3, b.h - position.y + VAULT_CLEAR));
        velocity.x += pullDir.x * VAULT_FORWARD;
        velocity.z += pullDir.z * VAULT_FORWARD;
        sfx.playMantleStart();
    }
    else {
        // 上面が遠い: 壁を蹴って上へ跳ぶ
        velocity.y = Math.max(velocity.y, WALL_KICK_UP);
        velocity.x -= pullDir.x * WALL_KICK_OUT;
        velocity.z -= pullDir.z * WALL_KICK_OUT;
        sfx.playWallJump();
        hooks.addTrauma(0.08);
    }
}
// 引き寄せ: 移動の当たり判定の前に呼び、このフレームで進むべき所へ届く速度に置き換える。
// 当たり判定はそのまま通すので、途中で何かに阻まれたらそこで止まる
export function updateGrapplePull(dt) {
    if (!sickleState.grapple)
        return;
    if (player.dashTime > 0 || player.mantleTime >= 0 || swordState.rushTime >= 0 || swordState.chargeDashTime > 0) {
        releaseGrapple(false);
        return;
    }
    if (pressed.has('Space')) {
        // 飛んでいる途中の速さ（動き出しは平均の 2 倍）をそのまま持ち越さない。引き寄せる前より速い分は ZIP_JUMP_MAX_SPEED まで
        const h = Math.hypot(velocity.x, velocity.z);
        const keep = Math.min(h, Math.max(sickleState.grapple.speedBefore, ZIP_JUMP_MAX_SPEED));
        if (h > 1e-6) {
            velocity.x *= keep / h;
            velocity.z *= keep / h;
        }
        releaseGrapple(false);
        velocity.y = Math.max(velocity.y, JUMP_SPEED);
        sfx.playJump();
        return;
    }
    if (sickleState.grapple.pullTime === 0) {
        // 引き始め: 引く点が掛かった所の手前 ZIP_STOP に来る足元の位置まで、一気に飛ぶ道筋を決める
        pullFrom.set(position.x, position.y + GRAPPLE_PULL_HEIGHT, position.z);
        pullDir.subVectors(sickleState.grapple.target, pullFrom);
        const travel = Math.max(0, pullDir.length() - ZIP_STOP);
        pullDir.normalize();
        sickleState.grapple.zipFrom.copy(position);
        sickleState.grapple.zipTo.copy(position).addScaledVector(pullDir, travel);
        sickleState.grapple.zipDur = Math.max(ZIP_MIN_TIME, travel / ZIP_SPEED);
        sickleState.grapple.speedBefore = Math.hypot(velocity.x, velocity.z);
        sfx.playDash(); // 「シュッ」
    }
    else if (sickleState.grapple.pullTime >= sickleState.grapple.zipDur) {
        releaseGrapple(true);
        return;
    }
    sickleState.grapple.pullTime = Math.min(sickleState.grapple.pullTime + dt, sickleState.grapple.zipDur);
    const u = sickleState.grapple.pullTime / sickleState.grapple.zipDur;
    zipWant.lerpVectors(sickleState.grapple.zipFrom, sickleState.grapple.zipTo, 1 - (1 - u) ** 2);
    velocity.subVectors(zipWant, position).divideScalar(Math.max(dt, 1e-4));
    player.onGround = false;
    player.sliding = false;
}
export function updateGrapple(dt) {
    grappleClock += dt;
    updateHookCharges(dt);
    if (sickleState.throwPressed && controls.isLocked) {
        if (sickleState.grapple && sickleState.grapple.phase !== 'back') {
            releaseGrapple(false);
        }
        else if (!sickleState.grapple && !sickleState.sickleMelee && sickleReady()) {
            if (sickleState.hookCharges > 0) {
                playRing(0.8, 0.5, 0.1); // 構えた「チャッ」
                sfx.playChain('ready');
                startThrow();
            }
            else {
                sickleState.hookEmptyFlash = HOOK_EMPTY_FLASH;
                playRing(0.5, 0.25, 0.04); // 残りが無い鈍い「カッ」
            }
        }
    }
    sickleState.throwPressed = false;
    updateSickleDraw(dt);
    for (const h of grappleHooks) {
        if (h.launchIn >= 0) {
            h.launchIn -= dt;
            if (h.launchIn < 0) {
                h.windT = 0;
                if (h.side > 0 || HOOK_STAGGER > 0) {
                    // 両手同時なら音は 1 つだけ
                    playSwish(WINDUP_SWISH);
                    playRing(1.4, 0.35, 0.03); // 継ぎ目が外れる「カチン」
                    sfx.playChain('windup');
                }
            }
        }
        else if (h.windT >= 0) {
            h.windT += dt;
            if (h.windT >= WINDUP_TIME) {
                h.windT = WINDUP_TIME;
                poseHand(h, 0, true); // 回しきった所（真上で前へ振り出す瞬間）に鎌を置いてから放す
                launchHook(h);
            }
        }
    }
    if (sickleState.grapple?.phase === 'fly' && grappleHooks.every((h) => h.thrown && h.stuckTime >= 0)) {
        // 2 本とも刺さった: 次のフレームから、掛かった所へ一気に飛ぶ
        sickleState.grapple.phase = 'pull';
        if (player.wallRunning)
            endWallRun();
        sfx.playStick();
        sfx.playChain('pull');
        hooks.addTrauma(0.15);
        kickVel.x -= 1.5 * DEG * 22;
    }
    if (sickleState.grapple?.phase === 'pull')
        game.fovKick = Math.max(game.fovKick, ZIP_FOV);
    if (sickleState.grapple?.enemy && sickleState.grapple.aimed && sickleState.grapple.phase !== 'back' && !sickleState.grapple.enemy.alive)
        releaseGrapple(false); // 掛けた敵が先に倒れた
    for (const h of grappleHooks) {
        if (h.thrown)
            updateHook(h, dt);
        poseHand(h, dt, h.launchIn >= 0 || h.windT >= 0); // 投げるまでは振りかぶったまま
        if (h.thrown)
            layHookChain(h);
    }
    if (sickleState.grapple && sickleState.grapple.phase !== 'pull' && grappleHooks.every((h) => !h.thrown && h.launchIn < 0 && h.windT < 0))
        sickleState.grapple = null;
}
// 手元の鎌: 普段の構え・振りかぶり・投げた手の突き出し・鎖をたぐる手・受け止めての 1 回転
export function poseHand(h, dt, aiming) {
    h.aim += ((aiming ? 1 : 0) - h.aim) * Math.min(1, dt * 14);
    h.punch = Math.max(0, h.punch - dt * 6);
    const p = h.hand.position.copy(h.handPos);
    p.x += AIM_HAND_LIFT.x * h.side * h.aim;
    p.y += AIM_HAND_LIFT.y * h.aim;
    p.z += AIM_HAND_LIFT.z * h.aim;
    p.addScaledVector(THROW_PUNCH_POS, Math.sin(h.punch * Math.PI) * (h.punch > 0 ? 1 : 0));
    // 引き寄せる間は、両手でグッと鎖を手前へ引く
    h.yank += ((sickleState.grapple?.phase === 'pull' && h.thrown ? 1 : 0) - h.yank) * Math.min(1, dt * (h.yank < 0.5 ? 30 : 10));
    p.addScaledVector(HAUL_POS, h.yank);
    // 受け止めた鎌を、握った手を軸に前へ 1 回転させる
    let twirl = 0;
    if (h.catchT >= 0) {
        h.catchT += dt;
        const u = Math.min(1, h.catchT / CATCH_TWIRL_TIME);
        twirl = -Math.PI * 2 * (1 - (1 - u) ** 3);
        if (u >= 1)
            h.catchT = -1;
    }
    // 振りかぶり: 柄の先を後ろへ倒し、外へ少し傾ける。回すのは鎌だけで、握った所を軸にする
    handTurn.set(AIM_TILT * h.aim + (h.catchT >= 0 ? twirl : 0), 0, AIM_ROLL * h.side * h.aim);
    h.rest.quaternion.setFromEuler(handTurn).multiply(h.restQuat);
    h.rest.position.set(0, 0, 0);
    applyMeleeHandPose(h, p);
    applySlidePose(h, p, dt);
    applyToss(h, p, dt);
    applyDrawHandPose(h, p);
    // 頭は普段は握りに組んだまま
    h.head.position.set(0, 0, 0);
    h.head.quaternion.identity();
    const joint = h.sickle.userData.chainAnchor; // 継ぎ目（頭の付け根 = 握りの先）
    if (h.windT >= 0) {
        // 投げる前の 1 周: 継ぎ目を外し、握りの先から短い鎖で頭を体の横で縦に回す。振りかぶった向き（後ろ上）から始めて、
        // だんだん速く 1 周し、真上で前へ振り出す。回し始めに、組んだ所から鎖の先へ頭を送り出す
        const u = Math.min(1, h.windT / WINDUP_TIME);
        hangHead(h, -AIM_TILT + (Math.PI * 2 + AIM_TILT) * u * u, WINDUP_RADIUS, THREE.MathUtils.smoothstep(u, 0, WINDUP_REACH));
    }
    else if (sickleState.drawT < SICKLE_DRAW_TIME) {
        // 取り出し: 真下に垂らした頭を前回りに 1 周半ぶん回し、だんだん緩めて真上へ来た所で握りへ引き戻す
        const s = THREE.MathUtils.clamp(drawLocalT(h) / DRAW_SPIN_TIME, 0, 1);
        hangHead(h, Math.PI + DRAW_SWEEP * (1 - (1 - s) ** 2), DRAW_RADIUS, 1 - THREE.MathUtils.smoothstep(s, 1 - DRAW_DOCK, 1));
    }
    else {
        h.shortChain.visible = false;
    }
    const out = h.thrown;
    h.point += ((out ? 1 : 0) - h.point) * Math.min(1, dt * 12);
    if (out && h.point > 0.01) {
        // 頭が離れている間は、鎖に引かれて握りの先が鎖の向きへ向く（手前へ向く鎖には向けない）
        h.sickle.updateMatrixWorld();
        pointDir.copy(joint).applyMatrix4(h.sickle.matrixWorld);
        h.hand.updateWorldMatrix(true, false);
        pointFrom.copy(joint).applyQuaternion(h.rest.quaternion).applyMatrix4(h.hand.matrixWorld);
        h.hand.getWorldQuaternion(pointQuat).invert();
        pointDir.sub(pointFrom).applyQuaternion(pointQuat);
        if (pointDir.lengthSq() > 1e-6) {
            pointDir.normalize();
            gripUp.set(0, 1, 0).applyQuaternion(h.rest.quaternion);
            const w = GRIP_POINT * h.point * THREE.MathUtils.clamp((0.3 - pointDir.z) / 0.6, 0, 1);
            pointQuat.setFromUnitVectors(gripUp, pointDir);
            h.rest.quaternion.premultiply(pointBlend.identity().slerp(pointQuat, w));
        }
    }
    h.head.visible = !out;
    h.sickle.visible = h.chain.visible = out;
}
// 継ぎ目を外した頭を、握りの先から長さ radius の短い鎖で吊る。angle は手の縦の面での向き（0 = 真上、増えると前へ回る）、
// k は組んだ所 (0) から鎖の先 (1) への送り出し具合。rest の向きを決めた後に呼ぶ
export function hangHead(h, angle, radius, k) {
    const joint = h.sickle.userData.chainAnchor;
    windRadial.set(0, Math.cos(angle), -Math.sin(angle));
    windTangent.set(0, -Math.sin(angle), -Math.cos(angle));
    windFace.crossVectors(windTangent, windRadial);
    windQuat.setFromRotationMatrix(tumbleBasis.makeBasis(windTangent, windRadial, windFace));
    // 手の座標で決めた頭の置き方（握りの先を中心に、鎖の長さ radius で回す）を、rest の座標へ直す
    gripTip.copy(joint).applyQuaternion(h.rest.quaternion);
    restInv.copy(h.rest.quaternion).invert();
    h.head.quaternion.slerp(windQuat.premultiply(restInv), k);
    h.head.position.copy(windRadial).multiplyScalar(radius - joint.y).add(gripTip).applyQuaternion(restInv).multiplyScalar(k);
    // 鎖: 握りの先から頭の付け根まで
    chainHang.copy(joint).applyQuaternion(h.head.quaternion).add(h.head.position).applyQuaternion(h.rest.quaternion);
    layChain(h.shortChain, [gripTip, chainHang]);
    h.shortChain.visible = k > 0.02;
}
// 手元の鎌の握りの先（ワールド座標）。長い鎖はここから伸びる
export function gripTipWorld(h, out) {
    h.held.updateWorldMatrix(true, false);
    return out.copy(h.sickle.userData.chainAnchor).applyMatrix4(h.held.matrixWorld);
}
export function updateHook(h, dt) {
    gripTipWorld(h, grappleHand);
    h.twang *= Math.exp(-dt * 6);
    if (h.back) {
        // 壁から抜けて縦に回りながら、握りの先へまっすぐ戻る
        grappleStep.subVectors(grappleHand, h.sickle.position);
        const dist = grappleStep.length();
        const step = GRAPPLE_RETURN_SPEED * dt;
        if (step >= dist) {
            h.thrown = false;
            h.back = false;
            h.catchT = 0;
            playGrip(); // 握りに組み付いた「ガチッ」
            return;
        }
        h.sickle.position.addScaledVector(grappleStep, step / dist);
        h.dir.copy(grappleStep).negate().normalize(); // 柄の先を手元と反対へ向けたまま戻る
        h.spin += h.spinRate * dt;
        orientTumble(h);
    }
    else if (h.stuckTime >= 0) {
        // 刺さった鎌は、食い込んだ所を軸に小さく揺れて止まる
        h.stuckTime += dt;
        const st = h.stuckTime;
        orientTumble(h, STICK_WOBBLE * Math.exp(-st * 8) * Math.sin(st * 40));
    }
    else {
        const step = Math.min(h.flyLeft, GRAPPLE_FLY_SPEED * dt);
        h.sickle.position.addScaledVector(h.dir, step);
        h.flyLeft -= step;
        h.spin += h.spinRate * dt;
        if (h.flyLeft <= 0) {
            h.spin = 0; // ちょうど回りきって、柄の先が前を向いている
            if (sickleState.grapple?.enemy && sickleState.grapple.phase === 'fly') {
                // 敵に刺さった: 最初の 1 本で軽く当たりを出し、鎖がビンと張る
                h.stuckTime = 0;
                h.twang = 1;
                sfx.playChain('taut');
                capPoint.copy(h.dir).multiplyScalar(h.sickle.userData.capTip).add(h.sickle.position);
                if (!sickleState.grapple.struck && sickleState.grapple.enemy.alive) {
                    setEn(sickleState.grapple.enemy);
                    sickleState.grapple.struck = true;
                    hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
                    if (hitDir.lengthSq() < 1e-6)
                        hitDir.set(h.dir.x, 0, h.dir.z);
                    hitDir.normalize();
                    hooks.applyHit(GRAPPLE_STICK_HIT, capPoint, 'throw');
                }
            }
            else if (sickleState.grapple?.block) {
                // 刺さった: 鎖がビンと張り、小さな火花を散らす
                h.stuckTime = 0;
                h.twang = 1;
                capPoint.copy(h.dir).multiplyScalar(h.sickle.userData.capTip).add(h.sickle.position);
                spawnSparks(capPoint, h.dir, 5, 0.6, 0.6);
                playRing(0.7, 0.35, 0.12);
                sfx.playChain('taut');
            }
            else {
                // 外れた（地面か射程の端）: そのまま戻る
                startHookBack(h);
                sfx.playChain('reel');
                if (sickleState.grapple && sickleState.grapple.phase === 'fly')
                    sickleState.grapple.phase = 'back';
            }
        }
        orientTumble(h);
    }
}
// 長い鎖: 頭の付け根から握りの先まで。伸びていく間は波打ち、刺さったらビンと張って震え、戻る間はまっすぐ。
// 握りの向きが決まった後（poseHand の後）に並べる
export function layHookChain(h) {
    gripTipWorld(h, grappleHand);
    h.sickle.updateMatrixWorld();
    grappleButt.copy(h.sickle.userData.chainAnchor).applyMatrix4(h.sickle.matrixWorld);
    const len = grappleButt.distanceTo(grappleHand);
    bendSide.subVectors(grappleHand, grappleButt).cross(UP);
    if (bendSide.lengthSq() < 1e-8)
        bendSide.set(1, 0, 0);
    bendSide.normalize();
    const wave = !h.back && h.stuckTime < 0 && h.flyTotal > 0 ? len * FLY_WAVE * (h.flyLeft / h.flyTotal) : 0;
    const twang = TWANG_AMP * h.twang;
    const tremble = sickleState.grapple?.phase === 'pull' ? PULL_TREMBLE : 0;
    const clock = grappleClock;
    layLongChain(h.chain, grappleButt, grappleHand, wave + twang + tremble > 0 ? (t, out) => {
        const env = Math.sin(Math.PI * t); // 両端は動かさない
        const k = wave * Math.sin(Math.PI * 5 * t - clock * 25)
            + twang * Math.sin(clock * 70)
            + tremble * Math.sin(clock * 95 + t * 20);
        out.addScaledVector(bendSide, env * k);
    } : undefined);
}
// ---- 鎖鎌の近接: 左クリック ----
// 近接では鎖を出さず、手元の鎌で斬る。手首で鎌をくるくる回す技を多く混ぜる
// 地上で押すたびに: 右の袈裟の引き斬り → 左の水平の引っ掛け → 両手の交差斬り → 右の鎌を前回りに回し続ける風車斬り
// ダッシュ直後: 両手の鎌を前へ突き出して回しながら突っ込む / スライディング中: 鎌を寝かせて柄ごと回しながら足元を薙ぐ /
// 空中: 両手の鎌を頭上から前へ 1 回転させて叩きつける
export const SICKLE_BUFFER = 0.12; // 次の段への先行入力を受け付ける、cancel より前の時間
export const SICKLE_COMBO_RESET = 0.6; // 振り終えてからこれだけ押さなければ 1 段目へ戻す
export const HAND_CHANNELS = 13; // 位置 xyz, 回転 xyz, spin, roll, arc の重み, arc の面の傾き・面の向き・柄の角度・刃の面の傾け
export const ARC_CH = 8;
export const newHandPose = () => ({ pos: new THREE.Vector3(), rot: new THREE.Vector3(), spin: 0, roll: 0 });
export function makeHandKeys(defs) {
    const arcs = defs.map((k) => k.arc ?? (k.yaw !== undefined ? sweepArc(k.yaw) : undefined));
    // arc の無いキーは、arc の値を一番近い arc のキー（前を優先）から借りる（重み 0 なので向きには効かず、移り変わりの間だけ混ざる）
    const borrow = (i) => {
        for (let j = i; j >= 0; j--)
            if (arcs[j])
                return arcs[j];
        for (let j = i; j < arcs.length; j++)
            if (arcs[j])
                return arcs[j];
        return [0, 0, 0];
    };
    const keys = defs.map((k, i) => {
        const p = k.pos ?? [0, 0, 0];
        const arc = arcs[i];
        const r = arc ? arcRot(arc) : k.rot ?? [0, 0, 0];
        const a = arc ?? borrow(i);
        return {
            t: k.t,
            v: [p[0], p[1], p[2], r[0], r[1], r[2], (k.spin ?? 0) * DEG, (k.roll ?? 0) * DEG,
                arc ? 1 : 0, a[0] * DEG, a[1] * DEG, a[2] * DEG, a[3] ?? 0],
            m: Array(HAND_CHANNELS).fill(0),
        };
    });
    // 各キーでの速さ（Steffen の方法）: 前後で向きが変わるなら 0、そうでなければ前後の傾きのうち小さい方に抑える
    for (let i = 1; i < keys.length - 1; i++) {
        if (defs[i].stop)
            continue;
        const h0 = keys[i].t - keys[i - 1].t;
        const h1 = keys[i + 1].t - keys[i].t;
        for (let c = 0; c < HAND_CHANNELS; c++) {
            const d0 = (keys[i].v[c] - keys[i - 1].v[c]) / h0;
            const d1 = (keys[i + 1].v[c] - keys[i].v[c]) / h1;
            if (d0 * d1 <= 0)
                continue;
            const mid = (d0 * h1 + d1 * h0) / (h0 + h1);
            keys[i].m[c] = 2 * Math.sign(d0) * Math.min(Math.abs(d0), Math.abs(d1), 0.5 * Math.abs(mid));
        }
    }
    return keys;
}
export const SWING_FACE_TILT = 0.3;
export const arcU = new THREE.Vector3();
export const arcF = new THREE.Vector3();
export const arcN = new THREE.Vector3();
export const arcX = new THREE.Vector3();
export const arcY = new THREE.Vector3();
export const arcZ = new THREE.Vector3();
export const arcBasis = new THREE.Matrix4();
export const arcYawQuat = new THREE.Quaternion();
export const arcRestInv = grappleHooks[0].restQuat.clone().invert();
export const ARC_UP = new THREE.Vector3(0, 1, 0);
// 構えからの回転（applyHandRotation で構えの向きに前から掛けるもの）を out に入れる。角度は rad
export function arcQuat(roll, yaw, angle, tilt, out) {
    arcYawQuat.setFromAxisAngle(ARC_UP, yaw);
    arcU.set(Math.sin(roll), Math.cos(roll), 0).applyQuaternion(arcYawQuat); // 面の「上」
    arcF.set(0, 0, -1).applyQuaternion(arcYawQuat); // 面の「前」
    arcN.crossVectors(arcU, arcF); // 面の法線（カメラのある側）
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    arcY.copy(arcU).multiplyScalar(c).addScaledVector(arcF, s); // 柄の先の向き
    arcX.copy(arcU).multiplyScalar(-s).addScaledVector(arcF, c).addScaledVector(arcN, tilt); // 刃の向き（回る向き）
    arcX.addScaledVector(arcY, -arcX.dot(arcY)).normalize();
    arcZ.crossVectors(arcX, arcY);
    out.setFromRotationMatrix(arcBasis.makeBasis(arcX, arcY, arcZ));
    return out.multiply(arcRestInv);
}
// 回転を、カメラ基準の x, y, z 軸まわりの角に直す。同じ向きを表す 2 通りのうち、各角を ±π に収めて小さい方を選ぶ
export const wrapPi = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
export const canonEuler = new THREE.Euler();
export function quatToRot(q, out) {
    canonEuler.setFromQuaternion(q, 'XYZ');
    const a0 = wrapPi(canonEuler.x), a1 = wrapPi(canonEuler.y), a2 = wrapPi(canonEuler.z);
    const b0 = wrapPi(canonEuler.x + Math.PI), b1 = wrapPi(Math.PI - canonEuler.y), b2 = wrapPi(canonEuler.z + Math.PI);
    if (Math.abs(a0) + Math.abs(a1) + Math.abs(a2) <= Math.abs(b0) + Math.abs(b1) + Math.abs(b2))
        out.splice(0, 3, a0, a1, a2);
    else
        out.splice(0, 3, b0, b1, b2);
    return out;
}
export const arcTmpQuat = new THREE.Quaternion();
export const arcRot = (a) => quatToRot(arcQuat(a[0] * DEG, a[1] * DEG, a[2] * DEG, a[3] ?? 0, arcTmpQuat), [0, 0, 0]);
// 横振り: 柄ごと水平に寝かせ、柄の向きを yaw（度。カメラ基準で 0 = 前、90 = 右、右手の値）にする。
// 刃は yaw が減る向き（右 → 前 → 左と回る向き）へ張り出す
export const sweepArc = (yawDeg) => [90, 0, 90 - yawDeg, SWING_FACE_TILT];
// 普段の構えを arc で表したもの（構えから回し始める技の最初のキーに使う）
export const REST_ARC = (() => {
    const s = new THREE.Vector3(0, 1, 0).applyQuaternion(grappleHooks[0].restQuat);
    const b = new THREE.Vector3(1, 0, 0).applyQuaternion(grappleHooks[0].restQuat);
    const n = new THREE.Vector3().crossVectors(s, b);
    const roll = Math.asin(n.y);
    const yaw = Math.atan2(n.z, -n.x);
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const u = new THREE.Vector3().crossVectors(f, n);
    return [roll / DEG, yaw / DEG, Math.atan2(s.dot(f), s.dot(u)) / DEG];
})();
// 同じ動きを少し遅らせ、少し下げる（両手の技で、もう片方の手を揃えすぎないように）
export const lagHandKeys = (defs, delay, drop) => makeHandKeys(defs.map((k, i) => ({
    ...k,
    t: i === 0 ? 0 : k.t + delay,
    pos: k.pos ? [k.pos[0], k.pos[1] - drop, k.pos[2]] : undefined,
})));
export const handVals = Array(HAND_CHANNELS).fill(0);
export const evalArcQuat = new THREE.Quaternion();
export const evalEulerQuat = new THREE.Quaternion();
export const evalEuler = new THREE.Euler();
export const evalRot = [0, 0, 0];
export function evalHandKeys(keys, t, side, out) {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t)
        i++;
    const a = keys[i];
    const b = keys[i + 1];
    const h = b.t - a.t;
    const s = THREE.MathUtils.clamp((t - a.t) / h, 0, 1);
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = (s3 - 2 * s2 + s) * h;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = (s3 - s2) * h;
    for (let c = 0; c < HAND_CHANNELS; c++)
        handVals[c] = h00 * a.v[c] + h10 * a.m[c] + h01 * b.v[c] + h11 * b.m[c];
    // arc のキーの間は、補間した柄の角度から向きを組み直す。arc とそうでないキーの間は、両方の向きを重みで混ぜる
    const w = THREE.MathUtils.clamp(handVals[ARC_CH], 0, 1);
    if (w > 1e-4) {
        arcQuat(handVals[ARC_CH + 1], handVals[ARC_CH + 2], handVals[ARC_CH + 3], handVals[ARC_CH + 4], evalArcQuat);
        if (w < 1 - 1e-4) {
            evalEulerQuat.setFromEuler(evalEuler.set(handVals[3], handVals[4], handVals[5]));
            evalArcQuat.copy(evalEulerQuat.slerp(evalArcQuat, w));
        }
        quatToRot(evalArcQuat, evalRot);
        handVals[3] = evalRot[0];
        handVals[4] = evalRot[1];
        handVals[5] = evalRot[2];
    }
    out.pos.set(handVals[0] * side, handVals[1], handVals[2]);
    out.rot.set(handVals[3], handVals[4] * side, handVals[5] * side);
    out.spin = handVals[6];
    out.roll = handVals[7] * side;
}
// 振りは大きく: 振りかぶりで一瞬溜めてから、画面を横切るほど大きく振り抜き、勢いの余りで少し止めてから戻す。
// 振りの本体は 0.08 秒ほどかけて数コマで見えるようにし、振り抜いた後は減速のキーを挟んで、段々に速さを落として止める
// 1 段目（右）: 右上へ引き絞って一瞬溜め、刃先を引っ掛けるように左下まで大きく斬り下ろす。
// 振る面は「上」を右へ倒した斜めの面（右上 → 左下）。溜めでは柄を右肩の後ろへ倒して刃先を上へ向け、
// 振り下ろしで柄が前 → 左下へ回り、刃先が常に軌道の先頭を行く
export const KESA_ROLL = 38;
export const SICKLE_KESA_HIT = { kick: [-0.8, 2.2, -2.4], knock: 240, hitStop: 0.065, fx: 1.05, slash: 40 };
export const SICKLE_KESA = {
    main: 'right',
    keys: makeHandKeys([
        { t: 0 },
        { t: 0.08, pos: [0.06, 0.16, 0.02], arc: [KESA_ROLL, 8, -50] },
        { t: 0.12, pos: [0.08, 0.2, 0.03], arc: [KESA_ROLL, 8, -62] }, // 一瞬溜める（柄が右肩の後ろ、刃先が上）
        { t: 0.16, pos: [-0.06, 0.06, -0.17], arc: [KESA_ROLL, 12, 55] }, // 正面を通過（ここで刃先が掛かる）
        { t: 0.2, pos: [-0.28, -0.12, -0.13], arc: [KESA_ROLL, 16, 128] },
        { t: 0.25, pos: [-0.36, -0.2, -0.07], arc: [KESA_ROLL, 18, 156] }, // 減速
        { t: 0.32, pos: [-0.39, -0.23, -0.03], arc: [KESA_ROLL, 18, 164] }, // 振り抜いた勢いの余り
        { t: 0.42, pos: [-0.08, -0.04, 0], rot: [0.12, 0.1, 0.05] },
        { t: 0.52 },
    ]),
    time: 0.52,
    cancel: 0.25,
    trails: [[0.12, 0.3]],
    impacts: [{ t: 0.16, hand: 'main', hit: SICKLE_KESA_HIT, swing: [-1, -0.7, -0.2] }],
    reach: 2.3,
    angle: 65 * DEG,
    lunge: 3,
    lungeAt: 0.12,
    swishes: [
        { at: 0.12, dur: 0.2, f0: 380, f1: 2000, gain: 0.42 },
        { at: 0.13, dur: 0.14, f0: 900, f1: 3000, gain: 0.1 },
    ],
    windKick: [0.6, -0.8, 1.2],
    body: [0.5, 0.35],
};
// 2 段目（左）: 鎌を横に寝かせて左へ引き絞り、外から水平に引っ掛けて右まで大きく薙ぎ、そのまま手前へ引き抜く
export const SICKLE_HOOK_HIT = { kick: [-0.4, -2.6, 1.6], knock: 250, hitStop: 0.065, fx: 1.1, slash: -6 };
export const SICKLE_HOOK = {
    main: 'left',
    keys: makeHandKeys([
        { t: 0 },
        { t: 0.075, pos: [0.1, 0.04, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
        { t: 0.115, pos: [0.12, 0.05, 0.03], yaw: 125 },
        { t: 0.145, pos: [0.04, 0.04, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
        { t: 0.17, pos: [-0.08, 0.03, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
        { t: 0.195, pos: [-0.2, 0.04, -0.15], yaw: -20 },
        { t: 0.235, pos: [-0.28, 0.06, -0.08], yaw: -48 }, // 減速
        { t: 0.3, pos: [-0.31, 0.07, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
        { t: 0.41, pos: [-0.06, 0, 0.02], rot: [0.05, 0.15, -0.1] },
        { t: 0.5 },
    ]),
    time: 0.5,
    cancel: 0.245,
    trails: [[0.115, 0.29]],
    impacts: [{ t: 0.175, hand: 'main', hit: SICKLE_HOOK_HIT, swing: [-1, 0.05, 0.3] }],
    reach: 2.3,
    angle: 65 * DEG,
    lunge: 3,
    lungeAt: 0.11,
    swishes: [
        { at: 0.13, dur: 0.19, f0: 450, f1: 2300, gain: 0.4 },
        { at: 0.14, dur: 0.14, f0: 1000, f1: 3200, gain: 0.08 },
    ],
    windKick: [0.2, 1.0, -0.8],
    body: [0.55, 0.3],
};
// 3 段目（両手）: 両腕を外の上へ大きく開いて溜め、正面で X 字に交差させて斬り下ろし、交差したまま一瞬止める。
// 振る面は袈裟と同じ斜めの面を左右で鏡写しにしたもの
export const CROSS_ROLL = 42;
export const CROSS_KEYS = [
    { t: 0 },
    { t: 0.09, pos: [0.1, 0.18, 0], arc: [CROSS_ROLL, 6, -55] },
    { t: 0.14, pos: [0.12, 0.21, 0.01], arc: [CROSS_ROLL, 6, -66] },
    { t: 0.18, pos: [-0.06, 0.06, -0.18], arc: [CROSS_ROLL, 12, 60] },
    { t: 0.22, pos: [-0.3, -0.01, -0.13], arc: [CROSS_ROLL, 18, 130] },
    { t: 0.27, pos: [-0.37, -0.05, -0.08], arc: [CROSS_ROLL, 20, 148] }, // 減速
    { t: 0.36, pos: [-0.39, -0.07, -0.06], arc: [CROSS_ROLL, 20, 153] }, // 交差したまま止める
    { t: 0.47, pos: [0.02, -0.02, 0.02], rot: [0.15, -0.05, -0.05] },
    { t: 0.57 },
];
export const SICKLE_CROSS_HIT_R = { kick: [-0.8, 1.4, -1.4], knock: 200, hitStop: 0.03, fx: 0.9, slash: 50 };
export const SICKLE_CROSS_HIT_L = { kick: [-2.0, -1.4, 1.4], knock: 320, hitStop: 0.09, fx: 1.35, slash: -50 };
export const SICKLE_CROSS = {
    main: 'right',
    keys: makeHandKeys(CROSS_KEYS),
    offKeys: lagHandKeys(CROSS_KEYS, 0.015, 0.03),
    time: 0.57,
    cancel: 0.36,
    trails: [[0.14, 0.34]],
    impacts: [
        { t: 0.18, hand: 'main', hit: SICKLE_CROSS_HIT_R, swing: [-1, -0.7, -0.2] },
        { t: 0.195, hand: 'off', hit: SICKLE_CROSS_HIT_L, swing: [-1, -0.7, -0.2] },
    ],
    reach: 2.4,
    angle: 70 * DEG,
    lunge: 4,
    lungeAt: 0.135,
    swishes: [
        { at: 0.135, dur: 0.24, f0: 300, f1: 1500, gain: 0.5 },
        { at: 0.15, dur: 0.16, f0: 900, f1: 2900, gain: 0.12 },
    ],
    rings: [[0.37, 0.9]],
    windKick: [1.4, 0, 0],
    fovPunch: 4,
    dip: 1.5,
    body: [0, 0.6],
};
// 4 段目（右）: 手首を返して鎌を後ろへ引き、前へ突き出しながら握りを軸に前回りで 2 周回して何度も斬り、
// 回し止めて左下まで大きく引き斬る。
// 縦の面で柄の角度を回し続け、当たる瞬間ごとに頭が前を通って振り下ろされるようにする。最後の 1 周で面を斜めへ倒して左下へ斬り抜く
export const SICKLE_WHEEL_HIT = { kick: [-1.0, 0.4, 0], knock: 120, hitStop: 0.025, fx: 0.6, slash: -75 };
export const SICKLE_WHEEL_LAST = { kick: [-2.6, 1.2, -1.2], knock: 380, hitStop: 0.11, fx: 1.55, slash: -70 };
export const SICKLE_WHEEL = {
    main: 'right',
    keys: makeHandKeys([
        { t: 0 },
        { t: 0.06, pos: [0.04, 0.1, 0.06], arc: [0, 10, -20] }, // 手首を返して柄を後ろへ倒す
        { t: 0.12, pos: [-0.08, 0.06, -0.14], arc: [0, 12, 230] },
        { t: 0.16, pos: [-0.1, 0.02, -0.18], arc: [0, 12, 420] }, // 1 回目: 頭が前を通って振り下ろされる
        { t: 0.21, pos: [-0.12, -0.02, -0.22], arc: [0, 12, 600] },
        { t: 0.25, pos: [-0.13, 0.02, -0.23], arc: [0, 12, 780] }, // 2 回目
        { t: 0.3, pos: [-0.14, 0.06, -0.24], arc: [10, 14, 950] },
        { t: 0.38, pos: [-0.3, -0.22, -0.16], arc: [36, 18, 1225] }, // 面を斜めへ倒し、左下へ引き斬る
        { t: 0.5, pos: [-0.33, -0.26, -0.1], arc: [36, 18, 1238] },
        { t: 0.64 },
    ]),
    time: 0.64,
    cancel: 0.46,
    trails: [[0.12, 0.42]],
    impacts: [
        { t: 0.16, hand: 'main', hit: SICKLE_WHEEL_HIT, swing: [0, -1, 0.3] },
        { t: 0.25, hand: 'main', hit: SICKLE_WHEEL_HIT, swing: [0, -1, 0.3] },
        { t: 0.37, hand: 'main', hit: SICKLE_WHEEL_LAST, swing: [-0.5, -1, 0.2] },
    ],
    reach: 2.4,
    angle: 55 * DEG,
    lunge: 3.5,
    lungeAt: 0.12,
    swishes: [
        { at: 0.12, dur: 0.1, f0: 700, f1: 2400, gain: 0.22 },
        { at: 0.21, dur: 0.1, f0: 800, f1: 2600, gain: 0.25 },
        { at: 0.3, dur: 0.16, f0: 350, f1: 1700, gain: 0.5 },
    ],
    rings: [[0.05, 1.2], [0.44, 0.9]],
    grips: [0.51],
    windKick: [0.8, -0.4, 0.6],
    fovPunch: 5,
    body: [0.35, 0.3],
};
// ダッシュ直後（両手）: 両手の鎌を前へ大きく突き出し、前回りに回し続けながら突っ込む
export const DASH_SPIN_KEYS = [
    { t: 0 },
    { t: 0.06, pos: [0.04, 0.06, 0.04], rot: [0.28, 0, -0.1] },
    { t: 0.1, pos: [-0.1, 0.03, -0.24], rot: [-0.2, 0.35, 0], spin: -180 },
    { t: 0.22, pos: [-0.13, -0.03, -0.27], rot: [-0.2, 0.35, 0.1], spin: -720 },
    { t: 0.34, pos: [-0.13, 0.03, -0.27], rot: [-0.2, 0.35, -0.1], spin: -1260 },
    { t: 0.42, pos: [-0.06, -0.08, -0.12], rot: [-0.1, 0.1, 0], spin: -1440 },
    { t: 0.56, spin: -1440 },
];
export const SICKLE_DASH_HIT = { kick: [-0.8, 0, 0], knock: 110, hitStop: 0.025, fx: 0.55 };
export const SICKLE_DASH_LAST = { kick: [-2.2, 0, 0], knock: 340, hitStop: 0.1, fx: 1.35 };
export const SICKLE_DASH = {
    main: 'right',
    keys: makeHandKeys(DASH_SPIN_KEYS),
    offKeys: lagHandKeys(DASH_SPIN_KEYS, 0.03, 0.02), // 少しずらして、左右の刃が交互に通るように
    time: 0.56,
    cancel: 0.42,
    trails: [[0.1, 0.42]],
    impacts: [
        { t: 0.14, hand: 'main', hit: SICKLE_DASH_HIT, swing: [0, -1, 0.3] },
        { t: 0.21, hand: 'off', hit: SICKLE_DASH_HIT, swing: [0, -1, 0.3] },
        { t: 0.28, hand: 'main', hit: SICKLE_DASH_HIT, swing: [0, -1, 0.3] },
        { t: 0.36, hand: 'off', hit: SICKLE_DASH_LAST, swing: [0, -1, 0.3] },
    ],
    reach: 2.8,
    angle: 50 * DEG,
    lunge: 9,
    lungeAt: 0.09,
    swishes: [
        { at: 0.1, dur: 0.12, f0: 600, f1: 2200, gain: 0.25 },
        { at: 0.18, dur: 0.12, f0: 650, f1: 2400, gain: 0.25 },
        { at: 0.26, dur: 0.12, f0: 700, f1: 2600, gain: 0.27 },
        { at: 0.33, dur: 0.16, f0: 400, f1: 1700, gain: 0.42 },
    ],
    rings: [[0.44, 1]],
    windKick: [0.8, 0, 0],
    fovPunch: 6,
    body: [0, 0.3],
};
// スライディング中（右）: 鎌を柄ごと水平に寝かせて右の低い所へ引き、足元を左まで大きく薙ぐ
export const SICKLE_SLIDE_HIT = { kick: [0.5, 2.8, 0.8], knock: 290, hitStop: 0.075, fx: 1.25, slash: 6 };
export const SICKLE_SLIDE = {
    main: 'right',
    keys: makeHandKeys([
        { t: 0 },
        { t: 0.075, pos: [0.1, -0.04, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
        { t: 0.115, pos: [0.12, -0.03, 0.03], yaw: 125 },
        { t: 0.145, pos: [0.04, -0.04, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
        { t: 0.17, pos: [-0.08, -0.05, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
        { t: 0.195, pos: [-0.2, -0.04, -0.15], yaw: -20 },
        { t: 0.235, pos: [-0.28, -0.02, -0.08], yaw: -48 }, // 減速
        { t: 0.3, pos: [-0.31, -0.01, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
        { t: 0.48 },
    ]),
    time: 0.48,
    cancel: 0.3,
    trails: [[0.12, 0.3]],
    impacts: [{ t: 0.175, hand: 'main', hit: SICKLE_SLIDE_HIT, swing: [-1, 0, 0.1] }],
    reach: 2.4,
    angle: 70 * DEG,
    lunge: 0,
    lungeAt: 0,
    swishes: [{ at: 0.13, dur: 0.24, f0: 280, f1: 1400, gain: 0.5 }],
    rings: [[0.23, 1.1]],
    windKick: [0, -1.0, 0.6],
    body: [0.55, 0.25],
};
// 空中 4 段目（両手）: 両手を頭上高く振り上げながら鎌を前回りに 1 回転させて頭上の後ろで構え、
// そのまま回る勢いで足元まで叩きつける。縦の面で柄の角度を回し続けるので、刃先が常に軌道の先頭を行く
export const AIR_KEYS = [
    { t: 0, arc: REST_ARC },
    { t: 0.09, pos: [0.04, 0.2, 0], arc: [2, 10, 245] }, // 振り上げながら、頭が前 → 下 → 後ろと回る
    { t: 0.14, pos: [0.04, 0.23, 0.01], arc: [2, 10, 318] }, // 頭上の後ろで、刃先が上を向く
    { t: 0.18, pos: [0, 0.02, -0.16], arc: [2, 12, 420] },
    { t: 0.22, pos: [-0.03, -0.2, -0.17], arc: [2, 14, 498] },
    { t: 0.27, pos: [-0.045, -0.26, -0.12], arc: [2, 14, 515] }, // 減速
    { t: 0.36, pos: [-0.05, -0.28, -0.1], arc: [2, 14, 520] },
    { t: 0.5 },
];
export const SICKLE_AIR_HIT = { kick: [-3.2, 0, 0], knock: 380, hitStop: 0.11, fx: 1.5, slash: 88 };
export const SICKLE_AIR = {
    main: 'right',
    keys: makeHandKeys(AIR_KEYS),
    offKeys: lagHandKeys(AIR_KEYS, 0.01, 0.01),
    time: 0.5,
    cancel: 0.34,
    trails: [[0.14, 0.27]],
    impacts: [{ t: 0.2, hand: 'main', hit: SICKLE_AIR_HIT, swing: [0, -1, -0.3] }],
    reach: 2.5,
    angle: 60 * DEG,
    lunge: 2,
    lungeAt: 0.14,
    swishes: [
        { at: 0.14, dur: 0.22, f0: 280, f1: 1300, gain: 0.55 },
        { at: 0.15, dur: 0.14, f0: 900, f1: 3000, gain: 0.12 },
    ],
    windKick: [1.8, 0, 0],
    fovPunch: 5,
    dip: 3,
    body: [0, 0.8],
};
// 空中 1 段目（右）: 鎌を柄ごと水平に寝かせて右へ引き、右から左まで水平に薙ぐ
export const SICKLE_AIR_SWEEP_HIT = { kick: [-0.2, 2.4, 1.0], knock: 240, hitStop: 0.06, fx: 1.0, slash: 2 };
export const SICKLE_AIR_SWEEP = {
    main: 'right',
    keys: makeHandKeys([
        { t: 0 },
        { t: 0.075, pos: [0.1, 0.05, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
        { t: 0.115, pos: [0.12, 0.06, 0.03], yaw: 125 },
        { t: 0.145, pos: [0.04, 0.05, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
        { t: 0.17, pos: [-0.08, 0.04, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
        { t: 0.195, pos: [-0.2, 0.05, -0.15], yaw: -20 },
        { t: 0.235, pos: [-0.28, 0.07, -0.08], yaw: -48 }, // 減速
        { t: 0.3, pos: [-0.31, 0.08, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
        { t: 0.42, pos: [-0.06, 0, 0], rot: [0.05, 0.1, -0.1] },
        { t: 0.5 },
    ]),
    time: 0.5,
    cancel: 0.25,
    trails: [[0.12, 0.3]],
    impacts: [{ t: 0.175, hand: 'main', hit: SICKLE_AIR_SWEEP_HIT, swing: [-1, 0, 0.2] }],
    reach: 2.4,
    angle: 70 * DEG,
    lunge: 2,
    lungeAt: 0.12,
    swishes: [{ at: 0.13, dur: 0.22, f0: 320, f1: 1600, gain: 0.45 }],
    rings: [[0.24, 1.1]],
    windKick: [0, -1.0, 0.5],
    body: [0.55, 0.2],
};
// 空中 2 段目（左）: 鎌を外の下へ引いて刃先を前へ倒し、内の上へ大きく斬り上げる
export const SICKLE_AIR_RISE_HIT = { kick: [1.0, -1.6, 1.6], knock: 250, hitStop: 0.065, fx: 1.1, slash: 45 };
export const SICKLE_AIR_RISE = {
    main: 'left',
    keys: makeHandKeys([
        { t: 0 },
        { t: 0.08, pos: [0.08, -0.12, 0.02], rot: [-0.5, -0.4, -0.3] },
        { t: 0.12, pos: [0.09, -0.14, 0.03], rot: [-0.6, -0.45, -0.35] },
        { t: 0.16, pos: [-0.04, 0, -0.18], rot: [0.05, 0.25, 0.15] },
        { t: 0.2, pos: [-0.2, 0.14, -0.15], rot: [0.25, 0.55, 0.4] },
        { t: 0.25, pos: [-0.25, 0.19, -0.12], rot: [0.32, 0.65, 0.48] }, // 減速
        { t: 0.32, pos: [-0.27, 0.21, -0.1], rot: [0.35, 0.7, 0.5] },
        { t: 0.42, pos: [-0.05, 0.02, 0], rot: [0.05, 0.1, 0.05] },
        { t: 0.5 },
    ]),
    time: 0.5,
    cancel: 0.25,
    trails: [[0.12, 0.3]],
    impacts: [{ t: 0.16, hand: 'main', hit: SICKLE_AIR_RISE_HIT, swing: [-1, 0.8, -0.1] }],
    reach: 2.4,
    angle: 65 * DEG,
    lunge: 2,
    lungeAt: 0.12,
    swishes: [
        { at: 0.12, dur: 0.2, f0: 420, f1: 2200, gain: 0.42 },
        { at: 0.13, dur: 0.14, f0: 1000, f1: 3200, gain: 0.08 },
    ],
    windKick: [-1.0, 0.6, -0.8],
    body: [0.5, 0.4],
};
// 空中 3 段目（両手）: 両手の鎌を前へ広げて突き出し、左右で半周ずらして前回りに回し続け、交互に何度も斬る
export const AIR_WHEEL_KEYS = [
    { t: 0 },
    { t: 0.06, pos: [0.05, 0.08, 0.02], rot: [0.3, 0, -0.15] },
    { t: 0.1, pos: [-0.04, 0.02, -0.2], rot: [-0.3, 0.2, -0.1], spin: -180 },
    { t: 0.2, pos: [-0.05, -0.04, -0.22], rot: [-0.3, 0.2, -0.02], spin: -720 },
    { t: 0.3, pos: [-0.05, 0.02, -0.22], rot: [-0.3, 0.2, -0.18], spin: -1260 },
    { t: 0.38, pos: [-0.03, -0.06, -0.1], rot: [-0.15, 0.1, 0], spin: -1440 },
    { t: 0.52, spin: -1440 },
];
export const SICKLE_AIR_WHEEL_HIT = { kick: [-0.8, 0, 0], knock: 110, hitStop: 0.025, fx: 0.55, slash: -80 };
export const SICKLE_AIR_WHEEL_LAST = { kick: [-1.8, 0, 0], knock: 300, hitStop: 0.08, fx: 1.2, slash: -80 };
export const SICKLE_AIR_WHEEL = {
    main: 'right',
    keys: makeHandKeys(AIR_WHEEL_KEYS),
    offKeys: lagHandKeys(AIR_WHEEL_KEYS, 0.045, 0.02), // 半周ほど遅らせて、左右の刃が交互に通るように
    time: 0.56,
    cancel: 0.4,
    trails: [[0.1, 0.4]],
    impacts: [
        { t: 0.13, hand: 'main', hit: SICKLE_AIR_WHEEL_HIT, swing: [0, -1, 0.3] },
        { t: 0.19, hand: 'off', hit: SICKLE_AIR_WHEEL_HIT, swing: [0, -1, 0.3] },
        { t: 0.25, hand: 'main', hit: SICKLE_AIR_WHEEL_HIT, swing: [0, -1, 0.3] },
        { t: 0.33, hand: 'off', hit: SICKLE_AIR_WHEEL_LAST, swing: [0, -1, 0.3] },
    ],
    reach: 2.5,
    angle: 55 * DEG,
    lunge: 2,
    lungeAt: 0.1,
    swishes: [
        { at: 0.1, dur: 0.12, f0: 650, f1: 2300, gain: 0.22 },
        { at: 0.17, dur: 0.12, f0: 700, f1: 2500, gain: 0.22 },
        { at: 0.24, dur: 0.12, f0: 750, f1: 2700, gain: 0.24 },
        { at: 0.31, dur: 0.16, f0: 400, f1: 1700, gain: 0.4 },
    ],
    rings: [[0.42, 1]],
    windKick: [0.6, 0, 0],
    fovPunch: 3,
    body: [0, 0.3],
};
// 右クリックで敵を引き寄せきった所（両手）: 両腕を外へ大きく開いて刃を寝かせ、正面で水平に挟むように斬る
export const PULL_KEYS = [
    { t: 0 },
    { t: 0.075, pos: [0.1, 0.04, 0.02], yaw: 115 }, // 柄ごと水平に寝かせ、柄を右後ろへ向けて溜める
    { t: 0.115, pos: [0.12, 0.05, 0.03], yaw: 125 },
    { t: 0.145, pos: [0.04, 0.04, -0.12], yaw: 95 }, // 手が先に出て、頭は遅れてついてくる
    { t: 0.17, pos: [-0.08, 0.03, -0.18], yaw: 35 }, // 手首を返して、頭が一気に前を回る
    { t: 0.195, pos: [-0.2, 0.04, -0.15], yaw: -20 },
    { t: 0.235, pos: [-0.28, 0.06, -0.08], yaw: -48 }, // 減速
    { t: 0.3, pos: [-0.31, 0.07, -0.04], yaw: -60 }, // 柄が左斜め前を向くまで回って止まる
    { t: 0.44, pos: [-0.04, 0, 0.01], rot: [0.05, 0.1, -0.1] },
    { t: 0.54 },
];
export const SICKLE_PULL_HIT = { kick: [-0.6, 1.2, 0.8], knock: 220, hitStop: 0.04, fx: 1.0, slash: 4 };
export const SICKLE_PULL_LAST = { kick: [-2.4, -1.6, -1.0], knock: 400, hitStop: 0.12, fx: 1.6, slash: -4 };
export const SICKLE_PULL = {
    main: 'right',
    keys: makeHandKeys(PULL_KEYS),
    offKeys: lagHandKeys(PULL_KEYS, 0.012, 0.05), // 左は少し低く通して、刃どうしがぶつからないように
    time: 0.54,
    cancel: 0.34,
    trails: [[0.115, 0.3]],
    impacts: [
        { t: 0.175, hand: 'main', hit: SICKLE_PULL_HIT, swing: [-1, 0, 0.2] },
        { t: 0.187, hand: 'off', hit: SICKLE_PULL_LAST, swing: [-1, 0, 0.2] },
    ],
    reach: 3,
    angle: 80 * DEG,
    lunge: 0,
    lungeAt: 0,
    swishes: [
        { at: 0.13, dur: 0.22, f0: 300, f1: 1500, gain: 0.5 },
        { at: 0.14, dur: 0.16, f0: 900, f1: 3000, gain: 0.12 },
    ],
    rings: [[0.33, 0.9]],
    windKick: [0.4, 0, 0],
    fovPunch: 6,
    body: [0, 0.3],
};
export const SICKLE_COMBO = [SICKLE_KESA, SICKLE_HOOK, SICKLE_CROSS, SICKLE_WHEEL];
// 空中で押すたびに: 右の横薙ぎ → 左の斬り上げ → 両手の車輪 → 叩きつけ。着地するか間が空くと 1 段目へ戻る
export const SICKLE_AIR_COMBO = [SICKLE_AIR_SWEEP, SICKLE_AIR_RISE, SICKLE_AIR_WHEEL, SICKLE_AIR];
// 刃の軌跡: 左右の手ごとに、カメラに付けて残す
export const SICKLE_TRAIL_LIFE = 0.17;
export const sickleTrails = [new Ribbon(240, SICKLE_TRAIL_LIFE, makeRibbonMaterial(SICKLE_RIBBON)), new Ribbon(240, SICKLE_TRAIL_LIFE, makeRibbonMaterial(SICKLE_RIBBON))];
for (const r of sickleTrails)
    camera.add(r.mesh);
let sickleQueued = false;
let sickleComboTimer = 0;
export const meleeHands = grappleHooks.map(() => ({ cur: newHandPose(), want: newHandPose(), snap: false }));
export const handPoseOf = (h) => meleeHands[grappleHooks.indexOf(h)];
export const meleeFrom = grappleHooks.map(() => newHandPose()); // 技を始めた瞬間の構え
export const MOVE_BLEND = 0.08; // 直前の構えから技の動きへ移りきるまで (s)
// 直前の構えのずれを、技の出だしに足して少しずつ消す
export function addMoveBlend(i, t, out) {
    const w = 1 - THREE.MathUtils.smootherstep(t, 0, MOVE_BLEND);
    if (w <= 0)
        return;
    const f = meleeFrom[i];
    out.pos.addScaledVector(f.pos, w);
    out.rot.addScaledVector(f.rot, w);
    out.spin += f.spin * w;
    out.roll += f.roll * w;
}
export const otherHook = (h) => grappleHooks[h === grappleHooks[0] ? 1 : 0];
// 振っていない方の手は、振りに合わせて少し引いて構え直す（体をひねった反動）
export const OFF_HAND_POS = [0.09, -0.09, 0.08]; // 右手の値。振る手が大きく横切るので、外の下へよけるように引く
export const OFF_HAND_TILT = 0.35;
export const meleeTip = new THREE.Vector3();
export const meleeFwdDir = new THREE.Vector3();
export const meleeBase = new THREE.Vector3();
export const meleeTrailOuter = new THREE.Vector3();
export const meleeSwing = new THREE.Vector3();
export const meleeEuler = new THREE.Euler();
export const meleeQuat = new THREE.Quaternion();
export const meleeAxisQuat = new THREE.Quaternion();
export const meleeTmpPose = newHandPose();
export const SPIN_AXIS = new THREE.Vector3(0, 0, 1); // 鎌の座標で、刃の面に垂直な軸
export const ROLL_AXIS = new THREE.Vector3(0, 1, 0); // 鎌の座標で、柄の軸
export function chooseSickleMove() {
    if (player.sliding)
        return SICKLE_SLIDE;
    if (player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW)
        return SICKLE_DASH;
    if (sickleComboTimer <= 0)
        sickleState.sickleCombo = sickleState.sickleAirCombo = 0;
    if (!player.onGround && !player.wallRunning) {
        const def = SICKLE_AIR_COMBO[sickleState.sickleAirCombo];
        sickleState.sickleAirCombo = (sickleState.sickleAirCombo + 1) % SICKLE_AIR_COMBO.length;
        return def;
    }
    sickleState.sickleAirCombo = 0;
    const def = SICKLE_COMBO[sickleState.sickleCombo];
    sickleState.sickleCombo = (sickleState.sickleCombo + 1) % SICKLE_COMBO.length;
    return def;
}
export function startSickleMove(def) {
    const h = def.main === 'right' ? grappleHooks[0] : grappleHooks[1];
    sickleState.sickleMelee = { def, h, t: 0, fired: 0, swishes: 0, rings: 0, grips: 0, lunged: false, trailT: -Infinity };
    sickleQueued = false;
    for (const k of grappleHooks)
        k.catchT = -1;
    for (const r of sickleTrails)
        r.cut();
    // 技の出だしは、直前の構え（前の技の振り抜きなど）から溶け込ませる
    for (const [i, p] of meleeHands.entries()) {
        const f = meleeFrom[i];
        f.pos.copy(p.cur.pos);
        f.rot.copy(p.cur.rot);
        f.spin = wrapPi(p.cur.spin);
        f.roll = wrapPi(p.cur.roll);
    }
    sickleBodyHand = grappleHooks.indexOf(h);
    sickleBodyK = def.body ?? [0, 0];
    if (def.windKick) {
        kickVel.x += def.windKick[0] * DEG * 10;
        kickVel.y += def.windKick[1] * DEG * 10;
        kickVel.z += def.windKick[2] * DEG * 10;
    }
}
// 体のひねり: 振る手の動きにつられて、両手の構えごと横へずらして傾け、上下にも振る（updateViewModel で足す）
export const sickleBodyPos = new THREE.Vector3();
export const sickleBodyRot = new THREE.Vector3();
let sickleBodyHand = 0;
let sickleBodyK = [0, 0];
export function updateSickleBody() {
    const p = meleeHands[sickleBodyHand].cur.pos;
    const [kx, ky] = sickleBodyK;
    sickleBodyPos.set(p.x * kx * 0.4, p.y * ky * 0.3, 0);
    sickleBodyRot.set(p.y * ky * 0.6, -p.x * kx * 0.5, -p.x * kx * 0.7);
}
// 手元の鎌の向きに、近接の回転を足す: カメラ基準の回転を前から、回す・柄を軸に回すを鎌の座標で後ろから掛ける
export function applyHandRotation(h, pose) {
    if (pose.rot.lengthSq() > 1e-10)
        h.rest.quaternion.premultiply(meleeQuat.setFromEuler(meleeEuler.set(pose.rot.x, pose.rot.y, pose.rot.z)));
    if (pose.spin !== 0)
        h.rest.quaternion.multiply(meleeAxisQuat.setFromAxisAngle(SPIN_AXIS, pose.spin));
    if (pose.roll !== 0)
        h.rest.quaternion.multiply(meleeAxisQuat.setFromAxisAngle(ROLL_AXIS, pose.roll));
}
// 手元の鎌を、キーの時間 t の構えに置き、刃先のワールド座標を meleeTip に、軌跡の帯の外側・内側を meleeTrailOuter / meleeBase に入れる
// （軌跡と当たりの位置を求めるときに使う。本当の構えは、この後の poseHand で meleeHands から組み直す）
export function setHandPoseAt(h, keys, t) {
    evalHandKeys(keys, t, h.side, meleeTmpPose);
    h.hand.position.copy(h.handPos).add(meleeTmpPose.pos);
    h.rest.quaternion.copy(h.restQuat);
    applyHandRotation(h, meleeTmpPose);
    h.rest.position.set(0, 0, 0);
    h.held.updateWorldMatrix(true, false);
    meleeTip.copy(h.sickle.userData.bladeTip).applyMatrix4(h.held.matrixWorld);
    meleeTrailOuter.copy(h.sickle.userData.trailOuter).applyMatrix4(h.held.matrixWorld);
    meleeBase.copy(h.sickle.userData.trailInner).applyMatrix4(h.held.matrixWorld);
}
// 振っている手（両手の技なら両方）
export function swingingHands(m) {
    const out = [[m.h, m.def.keys]];
    if (m.def.offKeys)
        out.push([otherHook(m.h), m.def.offKeys]);
    return out;
}
export function sampleSickleTrails(m) {
    for (const [from, to] of m.def.trails) {
        const end = Math.min(to, m.t);
        for (let s = Math.max(from, m.trailT + TRAIL_STEP * 2); s <= end; s += TRAIL_STEP * 2) {
            const gap = s - m.trailT > TRAIL_STEP * 3; // 別の時間帯の軌跡とはつながない
            for (const [h, keys] of swingingHands(m)) {
                const ribbon = sickleTrails[grappleHooks.indexOf(h)];
                if (gap)
                    ribbon.cut();
                setHandPoseAt(h, keys, s);
                camera.worldToLocal(meleeTrailOuter);
                camera.worldToLocal(meleeBase);
                ribbon.push(meleeTrailOuter, meleeBase, game.trailNow - (m.t - s));
            }
            m.trailT = s;
        }
    }
}
export function trySickleHit(m, imp) {
    if (!hooks.dummyInReach(m.def.reach, m.def.angle))
        return;
    const h = imp.hand === 'main' ? m.h : otherHook(m.h);
    setHandPoseAt(h, imp.hand === 'main' ? m.def.keys : m.def.offKeys, imp.t);
    hooks.hitPointFromTip(meleeTip, hitPoint);
    camera.updateMatrixWorld();
    meleeSwing.set(imp.swing[0] * h.side, imp.swing[1], imp.swing[2]).transformDirection(camera.matrixWorld);
    hooks.applyHit(imp.hit, hitPoint, 'sword', meleeSwing, true, SICKLE_DAMAGE_SCALE);
}
export function updateSickleMelee(dt) {
    sickleComboTimer -= dt;
    updateTossInput();
    updateSlideDir(dt);
    if (player.onGround && !sickleState.sickleMelee)
        sickleState.sickleAirCombo = 0; // 着地したら空中の連携は 1 段目から
    for (const p of meleeHands) {
        p.want.pos.set(0, 0, 0);
        p.want.rot.set(0, 0, 0);
        p.want.spin = 0;
        p.want.roll = 0;
        p.snap = false;
    }
    stepSickleMelee(dt);
    // キーで動かす手はそのまま、それ以外はなめらかに寄せる（回す角度は近い向きから戻す）
    const k = 1 - Math.exp(-dt * 16);
    for (const p of meleeHands) {
        if (p.snap) {
            p.cur.pos.copy(p.want.pos);
            p.cur.rot.copy(p.want.rot);
            p.cur.spin = p.want.spin;
            p.cur.roll = p.want.roll;
        }
        else {
            p.cur.pos.lerp(p.want.pos, k);
            p.cur.rot.lerp(p.want.rot, k);
            p.cur.spin = wrapPi(p.cur.spin) * (1 - k);
            p.cur.roll = wrapPi(p.cur.roll) * (1 - k);
        }
    }
    updateSickleBody();
    for (const r of sickleTrails)
        r.update(game.trailNow);
}
export function stepSickleMelee(dt) {
    const ready = sickleReady() && controls.isLocked && !sickleState.grapple;
    if (sickleState.sicklePressed) {
        sickleState.sicklePressed = false;
        if (ready) {
            const m = sickleState.sickleMelee;
            if (!m)
                startSickleMove(chooseSickleMove());
            else if (m.t >= m.def.cancel - SICKLE_BUFFER)
                sickleQueued = true;
        }
    }
    if (sickleState.sickleMelee && !sickleReady())
        sickleState.sickleMelee = null; // 持ち替えなどで構えを解いた
    const m = sickleState.sickleMelee;
    if (!m)
        return;
    const def = m.def;
    m.t += dt;
    while (m.swishes < def.swishes.length && m.t >= def.swishes[m.swishes].at)
        playSwish(def.swishes[m.swishes++], 'sickle');
    const rings = def.rings ?? [];
    while (m.rings < rings.length && m.t >= rings[m.rings][0])
        playRing(rings[m.rings++][1] * 1.3, 0.6, 0.3);
    const grips = def.grips ?? [];
    while (m.grips < grips.length && m.t >= grips[m.grips]) {
        m.grips++;
        playGrip();
    }
    if (!m.lunged && m.t >= def.lungeAt) {
        m.lunged = true;
        if (def.lunge > 0)
            hooks.applyLunge(def.lunge);
    }
    sampleSickleTrails(m);
    while (m.fired < def.impacts.length && m.t >= def.impacts[m.fired].t) {
        const imp = def.impacts[m.fired++];
        // 当たっても外れても、振り抜いた勢いをカメラへ
        kickVel.x += imp.hit.kick[0] * DEG * 22;
        kickVel.y += imp.hit.kick[1] * DEG * 22;
        kickVel.z += imp.hit.kick[2] * DEG * 22;
        hooks.addTrauma(0.07 * (imp.hit.fx ?? 1));
        if (m.fired === def.impacts.length) {
            game.landDipVel -= def.dip ?? 0;
            game.fovKick += def.fovPunch ?? 0;
        }
        trySickleHit(m, imp);
    }
    // 手の構え
    const t = Math.min(m.t, def.time);
    const hp = handPoseOf(m.h);
    evalHandKeys(def.keys, t, m.h.side, hp.want);
    addMoveBlend(grappleHooks.indexOf(m.h), m.t, hp.want);
    hp.snap = true;
    const o = otherHook(m.h);
    const op = handPoseOf(o);
    if (def.offKeys) {
        evalHandKeys(def.offKeys, t, o.side, op.want);
    }
    else {
        // 振っていない方の手: 振り出しから振り抜くまで、少し引いて構える
        const env = Math.sin(Math.PI * THREE.MathUtils.clamp((m.t - 0.02) / 0.4, 0, 1)) ** 2; // 出入りとも速さ 0 から
        op.want.pos.set(OFF_HAND_POS[0] * o.side * env, OFF_HAND_POS[1] * env, OFF_HAND_POS[2] * env);
        op.want.rot.set(OFF_HAND_TILT * env, 0, 0);
        op.want.spin = op.want.roll = 0;
    }
    addMoveBlend(grappleHooks.indexOf(o), m.t, op.want);
    op.snap = true;
    if (sickleQueued && m.t >= def.cancel) {
        sickleComboTimer = SICKLE_COMBO_RESET;
        startSickleMove(chooseSickleMove());
    }
    else if (m.t >= def.time) {
        sickleState.sickleMelee = null;
        sickleComboTimer = SICKLE_COMBO_RESET;
    }
}
// ダッシュした瞬間、構えている鎌を両手で前回りにくるりと回す
export function twirlSickles() {
    if (!sickleReady() || sickleState.sickleMelee || sickleState.grapple || tossing())
        return;
    for (const h of grappleHooks)
        if (!h.thrown)
            h.catchT = 0;
    playSwish({ at: 0, dur: 0.18, f0: 600, f1: 2000, gain: 0.12 }, 'sickle');
    playRing(1.7, 0.3, 0.06);
    sfx.playChain('ready');
}
export const SLIDE_FWD = { pos: [0.02, 0.06, -0.03], rot: [-0.4, 0.05, 0.65] }; // 前: 両手の鎌を内側へ寝かせて低く構える
export const SLIDE_BACK = { pos: [-0.03, 0.08, -0.03], rot: [0.05, 0, 0.35], spin: 20 }; // 後ろ: のけぞって鎌を高く上げる
export const SLIDE_LEAD = { pos: [-0.06, -0.01, -0.09], rot: [-0.65, -0.15, -0.25] }; // 横（滑っていく側の手）: 鎌を前へ倒して突き出す
export const SLIDE_TRAIL = { pos: [-0.1, 0.08, 0.02], rot: [0.1, 0.3, 0.9] }; // 横（反対の手）: 胸の前へ引き寄せて寝かせる
export const SLIDE_TREMBLE = 0.0025; // 震えの大きさ (m)。この速さ以上で最大
export const SLIDE_TREMBLE_SPEED = 15;
export const SLIDE_DIR_RATE = 10; // 滑る向きの変化に構えが追いつく速さ (1/s)
let slideFwd = 1; // 滑る向きの、視線の前への成分（なめらかにしたもの）
let slideRight = 0; // 同じく右への成分
export const slideTmpPose = newHandPose();
export const slideMix = [0, 0, 0, 0, 0, 0, 0];
// 滑る向きを、視線から見た前と右の成分にしてなめらかに追う（updateSickleMelee から毎フレーム呼ぶ）
let slideDirFresh = true; // 次に滑り出したら、向きをなめらかにせずすぐ合わせる
export function updateSlideDir(dt) {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (!player.sliding)
        slideDirFresh = true;
    if (!player.sliding || speed < 0.5)
        return;
    camera.getWorldDirection(meleeFwdDir);
    meleeFwdDir.y = 0;
    if (meleeFwdDir.lengthSq() < 1e-6)
        return;
    meleeFwdDir.normalize();
    const f = (velocity.x * meleeFwdDir.x + velocity.z * meleeFwdDir.z) / speed;
    const r = (velocity.x * -meleeFwdDir.z + velocity.z * meleeFwdDir.x) / speed;
    const k = slideDirFresh ? 1 : 1 - Math.exp(-dt * SLIDE_DIR_RATE);
    slideDirFresh = false;
    slideFwd += (f - slideFwd) * k;
    slideRight += (r - slideRight) * k;
}
export function applySlidePose(h, handPos, dt) {
    const want = player.sliding && !sickleState.sickleMelee && !h.thrown && h.windT < 0 && h.launchIn < 0 ? 1 : 0;
    h.slide += (want - h.slide) * Math.min(1, dt * (want ? 14 : 8));
    const w = h.slide;
    if (w < 1e-3)
        return;
    // 前・後ろ・滑っていく側・反対側の重み（合計 1）
    const wF = Math.max(0, slideFwd);
    const wB = Math.max(0, -slideFwd);
    const wR = Math.max(0, slideRight);
    const wL = Math.max(0, -slideRight);
    const sum = Math.max(1e-4, wF + wB + wR + wL);
    const lead = (h.side > 0 ? wR : wL) / sum;
    const trail = (h.side > 0 ? wL : wR) / sum;
    slideMix.fill(0);
    for (const [def, k] of [[SLIDE_FWD, wF / sum], [SLIDE_BACK, wB / sum], [SLIDE_LEAD, lead], [SLIDE_TRAIL, trail]]) {
        if (k <= 0)
            continue;
        for (let i = 0; i < 3; i++) {
            slideMix[i] += def.pos[i] * k;
            slideMix[3 + i] += def.rot[i] * k;
        }
        slideMix[6] += (def.spin ?? 0) * DEG * k;
    }
    const shake = SLIDE_TREMBLE * w * Math.min(1, Math.hypot(velocity.x, velocity.z) / SLIDE_TREMBLE_SPEED);
    handPos.x += slideMix[0] * h.side * w + (Math.random() * 2 - 1) * shake;
    handPos.y += slideMix[1] * w + (Math.random() * 2 - 1) * shake;
    handPos.z += slideMix[2] * w;
    slideTmpPose.rot.set(slideMix[3] * w, slideMix[4] * h.side * w, slideMix[5] * h.side * w);
    slideTmpPose.spin = slideMix[6] * w;
    applyHandRotation(h, slideTmpPose);
}
export const TOSS_RELEASE = 0.05; // 手を沈めて放すまで
export const TOSS_FLIGHT = 0.3; // 宙にある時間
export const TOSS_SETTLE = 0.12; // 受け止めて手が沈み、戻るまで
export const TOSS_DASH_CHANCE = 0.3; // ダッシュしたときに投げる確率
export const TOSS_HURRY = 4; // 急いで戻すときの時間の速さ
export const TOSS_DIP = 0.04; // 放す前と受け止めたときに手が沈む量
export const TOSS_PIVOT = new THREE.Vector3(0, 0.12, 0); // 宙で回る中心（鎌の重心あたり、握る位置からの高さ）
let tossVariant = 0;
export const tossOffset = new THREE.Vector3();
export const tossQuat = new THREE.Quaternion();
export const tossBase = new THREE.Quaternion();
export const tossPivotA = new THREE.Vector3();
export const tossPivotB = new THREE.Vector3();
export const TOSS_SPIN_AXIS = new THREE.Vector3(0, 0, 1);
export const tossing = () => grappleHooks.some((h) => h.toss);
export const canToss = () => sickleReady() && !sickleState.sickleMelee && !sickleState.grapple && !tossing() && grappleHooks.every((h) => !h.thrown);
export function startToss(h, to, apex, turns, depth = 0, inward = 0) {
    h.toss = { t: 0, to: grappleHooks.indexOf(to), apex, turns, depth, inward, hurry: false };
    h.catchT = -1;
}
export function startTossVariant(variant) {
    if (variant === 0)
        startToss(grappleHooks[0], grappleHooks[0], 0.32, 2, -0.1, 0.14);
    else if (variant === 2)
        startToss(grappleHooks[1], grappleHooks[1], 0.32, 2, -0.1, 0.14);
    else {
        // 持ち替え: 右は高く手前を、左は低く奥を通して、空中で交差させる
        startToss(grappleHooks[0], grappleHooks[1], 0.3, 1, -0.04);
        startToss(grappleHooks[1], grappleHooks[0], 0.2, 1, 0.05);
    }
    setTimeout(() => playSwish({ at: 0, dur: 0.2, f0: 500, f1: 1600, gain: 0.12 }, 'sword'), TOSS_RELEASE * 1000);
}
// 毎フレーム、updateSickleMelee から呼ぶ: R キーで投げ、攻撃などが始まったら急いで戻す
export function updateTossInput() {
    if (sickleState.tossPressed && game.shownWeapon === 'sickle' && canToss()) {
        startTossVariant(tossVariant);
        tossVariant = (tossVariant + 1) % 3;
    }
    sickleState.tossPressed = false;
    if (sickleState.sickleMelee || sickleState.grapple || !sickleReady())
        for (const h of grappleHooks)
            if (h.toss)
                h.toss.hurry = true;
}
// ダッシュした瞬間: 確率でどれかを投げる。投げたら true
export function tossOnDash() {
    if (!canToss() || Math.random() >= TOSS_DASH_CHANCE)
        return false;
    startTossVariant(Math.floor(Math.random() * 3));
    return true;
}
// poseHand から呼ぶ: 投げている鎌を、手の座標で宙に置く。放す前は手を沈め、受け止めたら手が沈んでから戻る
export function applyToss(h, handPos, dt) {
    const tz = h.toss;
    if (!tz)
        return;
    tz.t += dt * (tz.hurry ? TOSS_HURRY : 1);
    const to = grappleHooks[tz.to];
    const end = TOSS_RELEASE + TOSS_FLIGHT;
    if (tz.t < TOSS_RELEASE) {
        // 放す前: 手を沈めて鎌を少し後ろへ倒す
        const k = Math.sin((tz.t / TOSS_RELEASE) * Math.PI * 0.5);
        handPos.y -= TOSS_DIP * k;
        h.rest.quaternion.premultiply(tossQuat.setFromAxisAngle(TOSS_SPIN_AXIS.set(1, 0, 0), 0.3 * k));
        return;
    }
    if (tz.t < end) {
        // 宙: 放物線で受け止める手まで飛び、重心を中心に前回りする（受け止める直前に回りきる）
        const u = (tz.t - TOSS_RELEASE) / TOSS_FLIGHT;
        tossOffset.subVectors(to.handPos, h.handPos).multiplyScalar(u);
        tossOffset.y += 4 * tz.apex * u * (1 - u);
        tossOffset.z += tz.depth * Math.sin(Math.PI * u);
        tossOffset.x -= tz.inward * h.side * Math.sin(Math.PI * u);
        tossBase.copy(h.rest.quaternion);
        if (to !== h)
            tossBase.slerp(to.restQuat, u); // 持ち替えは、受け止める手の構えの向きへ移る
        const spin = -Math.PI * 2 * tz.turns * (1 - (1 - u) ** 1.6);
        h.rest.quaternion.copy(tossBase).multiply(tossQuat.setFromAxisAngle(TOSS_SPIN_AXIS.set(0, 0, 1), spin));
        // 重心を中心に回す: 回す前と後で重心が同じ所に来るよう、握る位置をずらす
        tossPivotA.copy(TOSS_PIVOT).applyQuaternion(tossBase);
        tossPivotB.copy(TOSS_PIVOT).applyQuaternion(h.rest.quaternion);
        h.rest.position.copy(tossOffset).add(tossPivotA).sub(tossPivotB);
        return;
    }
    // 受け止めた: 両方の手がそれぞれ自分の鎌を持った状態に戻る（2 本は同じ形なので、持ち替えても見分けはつかない）
    const settle = (tz.t - end) / TOSS_SETTLE;
    if (settle === 0 || tz.t - dt * (tz.hurry ? TOSS_HURRY : 1) < end) {
        playGrip(); // 受け止めた「チャキッ」
        kickVel.x -= 0.3 * DEG * 22;
    }
    // 受け止めた手が沈む（片手投げは自分の手、持ち替えは両手とも何かを受け止めている）
    handPos.y -= TOSS_DIP * Math.sin(Math.PI * Math.min(1, settle));
    if (settle >= 1)
        h.toss = null;
}
// poseHand から呼ぶ: 近接の手の動きを、普段の構えに足す
export function applyMeleeHandPose(h, handPos) {
    const p = handPoseOf(h).cur;
    handPos.add(p.pos);
    applyHandRotation(h, p);
}
// ---- 取り出し ----
// 持ち替えたとき: 継ぎ目を外して頭を短い鎖で垂らしたまま、両手を下から外へ振り上げる。頭は体の横で前回りに 1 周半回り、
// だんだん緩めて真上へ来た所で握りへ「ガチッ」と組み戻し、刃を前へ小さく振り出して構える。左手は少し遅れる
export const SICKLE_DRAW_TIME = 0.62;
export const DRAW_STAGGER = 0.06; // 右手から左手までの遅れ (s)
export const DRAW_RISE = 0.3; // 下から構えの高さまで振り上げる時間
export const DRAW_SPIN_TIME = 0.42; // 回し始めてから組み戻すまで
export const DRAW_SWEEP = Math.PI * 3; // 回す角度（真下から始めて真上で終わる）
export const DRAW_RADIUS = 0.17; // 回している間の鎖の長さ
export const DRAW_DOCK = 0.3; // 回しの最後のこの割合で、頭を鎖の先から握りへ引き戻す
export const DRAW_SNAP_TIME = 0.16; // 組み戻してから、刃を前へ振り出して収めるまで
export const DRAW_SWISH = { at: 0, dur: 0.22, f0: 350, f1: 1500, gain: 0.07 };
const drawTmpPose = newHandPose();
const drawLocalT = (h) => sickleState.drawT - (h.side < 0 ? DRAW_STAGGER : 0);
export function startSickleDraw() {
    sickleState.drawT = 0;
    playSwish(DRAW_SWISH, 'sickle');
    playRing(1.4, 0.35, 0.03); // 継ぎ目が外れる「カチン」
    sfx.playChain('windup');
}
export function updateSickleDraw(dt) {
    if (sickleState.drawT >= SICKLE_DRAW_TIME)
        return;
    // 振り始めたり投げたりしたら、取り出しはやめてそちらの動きにする
    if (game.shownWeapon !== 'sickle' || sickleState.sickleMelee || sickleState.grapple || tossing()) {
        sickleState.drawT = Infinity;
        return;
    }
    const prev = sickleState.drawT;
    sickleState.drawT += dt;
    const t = sickleState.drawT;
    if (prev < DRAW_SPIN_TIME * 0.4 && t >= DRAW_SPIN_TIME * 0.4)
        playSwish(DRAW_SWISH, 'sickle'); // 2 周目の風切り
    for (const h of grappleHooks) {
        const dock = DRAW_SPIN_TIME + (h.side < 0 ? DRAW_STAGGER : 0);
        if (prev < dock && t >= dock) {
            playGrip(); // 組み戻した「ガチッ」。左手が少し遅れて 2 度鳴る
            kickVel.x -= 0.4 * DEG * 22;
        }
    }
    if (t >= SICKLE_DRAW_TIME)
        sickleState.drawT = Infinity;
}
// poseHand から呼ぶ: 下から外へひねった形で振り上げ、少し行き過ぎてから構えに収める。組み戻した瞬間に刃を前へ小さく振り出す
export function applyDrawHandPose(h, handPos) {
    if (sickleState.drawT >= SICKLE_DRAW_TIME)
        return;
    const t = drawLocalT(h);
    const r = 1 - easeOutBack(THREE.MathUtils.clamp(t / DRAW_RISE, 0, 1));
    const g = (t - DRAW_SPIN_TIME) / DRAW_SNAP_TIME;
    const snap = g > 0 && g < 1 ? Math.sin(g * Math.PI) * (1 - g) : 0;
    handPos.x += r * 0.08 * h.side;
    handPos.y -= r * 0.3;
    handPos.z += r * 0.05 - snap * 0.03;
    drawTmpPose.rot.set(-r * 1.0 - snap * 0.35, r * 0.4 * h.side, -r * 0.7 * h.side);
    applyHandRotation(h, drawTmpPose);
}
export const SICKLE_DAMAGE_SCALE = 0.85; // 鎖鎌の近接は刀と同じ 'sword' の量に、これを掛けて少し抑える

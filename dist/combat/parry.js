import * as THREE from 'three';
import * as sfx from '../audio.js';
import { DEG } from '../math.js';
import { camera, scene } from '../core.js';
import { swordState } from '../weapons/swordCombat.js';
import { batState } from '../weapons/batCombat.js';
import { SWORD_DRAW } from '../weapons/swordAttacks.js';
import { bullets, tracerGeo } from '../weapons/handgunCombat.js';
import { kunaiState } from '../weapons/kunaiCombat.js';
import { spawnSparks } from '../fx/hitFx.js';
import { ENEMY_BULLET_RANGE, aimTarget, enemyBody, enemyOnBody, enemyOnPath, enemyPath } from '../enemy/fire.js';
import { game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
// ---- パリィ ----
// クナイや刀を振っている間（斬撃の軌跡が出ている前後）に、正面から体へ向かってくる弾が間合いへ入ったら弾き返す。
// 弾き返した弾は敵の胸へまっすぐ飛び、自分の銃弾と同じように当たる
// 本体からも読み書きする値
export const parryState = {
    parryFxAge: Infinity, // 弾いてからの実時間
};
export const PARRY_RANGE = 1.6; // 胸からこの距離まで来た弾を弾く (m)
export const PARRY_THREAT = 0.7; // 弾の進む線が体の芯からこれ以上離れていれば外れる弾なので弾かない (m)
export const PARRY_ANGLE = 80 * DEG; // 視線からこの角度以内の向きから来た弾だけを弾く
export const PARRY_EARLY = 0.05; // 軌跡が出る少し前から
export const PARRY_LATE = 0.08; // 軌跡が消えた少し後まで
export const PARRY_HIT_STOP = 0.18; // 世界を止める長さ（実時間）。この間は画面を白黒にする
export const PARRY_INVERT_TIME = 0.035; // 弾いた瞬間だけ白黒を反転させる
// 止まったあと、いきなり戻さずスローを挟み、跳ね返った弾が敵へ飛んでいくのを見せる（どれも実時間）
export const PARRY_SLOW_SCALE = 0.3;
export const PARRY_SLOW_HOLD = 0.25;
export const PARRY_SLOW_RELEASE = 0.35;
export const PARRY_FX_FADE = PARRY_SLOW_HOLD + PARRY_SLOW_RELEASE; // 色はスローが明けるのに合わせて戻す
export const PARRY_RETURN_MONO = 0.07; // 返した弾が当たった瞬間も、ごく短く白黒にする
export const PARRY_RETURN_MONO_FADE = 0.15;
export const parryTracerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
// 実時間を進め、ゲームの時間に掛ける速さを返す（止まっている間はヒットストップが止めるので 1）
export function parrySlowFactor(realDt) {
    parryState.parryFxAge += game.realDt;
    game.parryReturnAge += game.realDt;
    const t = parryState.parryFxAge - PARRY_HIT_STOP;
    if (t < 0)
        return 1;
    const u = THREE.MathUtils.clamp((t - PARRY_SLOW_HOLD) / PARRY_SLOW_RELEASE, 0, 1);
    return THREE.MathUtils.lerp(PARRY_SLOW_SCALE, 1, u * u);
}
export function parryMono() {
    const after = Math.max(0, parryState.parryFxAge - PARRY_HIT_STOP);
    const main = parryState.parryFxAge < PARRY_HIT_STOP ? 1 : Math.max(0, 1 - after / PARRY_FX_FADE) ** 2;
    const rAfter = Math.max(0, game.parryReturnAge - PARRY_RETURN_MONO);
    const ret = game.parryReturnAge < PARRY_RETURN_MONO ? 1 : Math.max(0, 1 - rAfter / PARRY_RETURN_MONO_FADE);
    return Math.max(main, ret);
}
export const PARRY_SPREAD = 1.5 * DEG;
export const parryChest = new THREE.Vector3();
export const parryLook = new THREE.Vector3();
export const parryAt = new THREE.Vector3();
export const parryAim = new THREE.Vector3();
export const parryRay = new THREE.Line3();
export const inParryWindow = (t, [a, b]) => t >= a - PARRY_EARLY && t <= b + PARRY_LATE;
const batParrying = () => batState.attack !== null && game.shownWeapon === 'bat';
export function parryActive() {
    // クナイは指先で回す細い軌跡を除いた、本当に振っている間だけ
    if (kunaiState.attack && game.shownWeapon === 'kunai')
        return kunaiState.attack.trails.some((w) => !w[2] && inParryWindow(kunaiState.attackTime, w));
    // 剣は持ち替えの抜刀では弾かない
    if (swordState.swordAttack && swordState.swordAttack !== SWORD_DRAW && game.shownWeapon === 'sword')
        return swordState.swordAttack.trails.some((w) => inParryWindow(swordState.swordTime, w));
    // バットは振り抜いている間、弾を打ち返す
    if (batParrying())
        return batState.attack.trails.some((w) => inParryWindow(batState.time, w));
    return false;
}
// enemyPath（この 1 歩で弾が進む線分）が入っている前提で呼ぶ
export function tryParry(b) {
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
    const bat = batParrying(); // バットで打ち返した弾は打球にする（handgunCombat.ts）
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
    bullets.push({ pos: parryAt.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, parried: true, batted: bat });
    // 演出: 一瞬止めて火花を散らし、金属の「キン」
    game.hitStop = Math.max(game.hitStop, PARRY_HIT_STOP);
    game.hitStopTotal = game.hitStop;
    game.hitStopShakesDummy = false;
    parryState.parryFxAge = 0;
    spawnSparks(parryAt, parryAim.copy(dir), 12 + Math.floor(Math.random() * 5), 0.8, 0.7);
    sfx.playParry(PARRY_HIT_STOP);
    if (bat)
        sfx.playHit(1.3, 'bat'); // 芯で捉えた「ゴッ」を重ねる
    hooks.addTrauma(bat ? 0.25 : 0.15);
    kickVel.x += 0.8 * DEG * 22;
    return true;
}
// 2 本の線分の、互いにいちばん近い点
export const segD1 = new THREE.Vector3();
export const segD2 = new THREE.Vector3();
export const segR = new THREE.Vector3();
export function closestSegmentPoints(a, b, outA, outB) {
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

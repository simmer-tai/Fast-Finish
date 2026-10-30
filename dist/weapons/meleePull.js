import * as THREE from 'three';
import { DEG } from '../math.js';
import { camera } from '../core.js';
import { DUMMY_HEIGHT, DUMMY_RADIUS } from '../enemy/body.js';
import { RESPAWN_RISE_TIME, enemies } from '../enemy/state.js';
import { position, velocity } from '../player/state.js';
// ---- 吸い寄せ: 踏み込むとき、前にいる敵の方へ少しだけ引き寄せる（斧・剣） ----
// 照準の近くにいる一番近い敵へ向けて、届く距離まで寄る。
// 敵の方へまっすぐ寄るので、少し外れた向きで振っても当たりやすい
export const PULL_RANGE = 3.5; // 届く距離より、さらにこれだけ先の敵まで引き寄せる (m)
export const PULL_ANGLE = 35 * DEG; // 照準からこの角度の内側にいる敵だけ
export const PULL_STOP = 0.6; // 届く距離のこの割合まで寄ったら、それ以上は引き寄せない
export const PULL_GAIN = 2; // 残りの距離 1m あたりに足す速さ (m/s)
const pullLook = new THREE.Vector3();
const pullDir = new THREE.Vector3();
// 照準の近くにいる一番近い敵（届く距離 + PULL_RANGE の内側）
function findPullTarget(reach) {
    camera.getWorldDirection(pullLook);
    pullLook.y = 0;
    if (pullLook.lengthSq() < 1e-6)
        return null;
    pullLook.normalize();
    let best = null;
    let bestDist = reach + PULL_RANGE + DUMMY_RADIUS;
    for (const e of enemies) {
        if (!e.alive || e.riseTime < RESPAWN_RISE_TIME)
            continue;
        if (Math.abs(e.root.position.y - position.y) > DUMMY_HEIGHT + 0.5)
            continue;
        pullDir.set(e.root.position.x - position.x, 0, e.root.position.z - position.z);
        const d = pullDir.length();
        if (d >= bestDist || d < 1e-4)
            continue;
        if (pullDir.divideScalar(d).angleTo(pullLook) > PULL_ANGLE)
            continue;
        best = e;
        bestDist = d;
    }
    return best;
}
// 敵までの水平の向き（pullDir に入れる）と、届く距離の PULL_STOP まで寄るのに残っている距離
function gapTo(e, reach) {
    pullDir.set(e.root.position.x - position.x, 0, e.root.position.z - position.z);
    const d = pullDir.length();
    if (d < 1e-4)
        return 0;
    pullDir.divideScalar(d);
    return d - DUMMY_RADIUS - reach * PULL_STOP;
}
// 速さを一度だけ足す（斧）。地上では摩擦ですぐ止まるので、寄る量は小さい
// reach: 武器の届く距離、max: 足す速さの上限 (m/s)
export function pullTowardTarget(reach, max) {
    const best = findPullTarget(reach);
    if (!best)
        return;
    const gap = gapTo(best, reach);
    if (gap <= 0)
        return;
    // 今その向きへ出ている速さを差し引いて、足りないぶんだけ足す（ダッシュ中などに速くなりすぎないように）
    const want = Math.min(max, gap * PULL_GAIN);
    const along = velocity.x * pullDir.x + velocity.z * pullDir.z;
    const add = Math.max(0, want - Math.max(0, along) * 0.5);
    velocity.x += pullDir.x * add;
    velocity.z += pullDir.z * add;
}
// 少しの間、毎フレーム敵の方へ位置を動かす（剣）。速度は変えないので、寄り終わったあとに勢いは残らない
// 本体が水平移動を決めたあと、当たり判定の前に updateMeleePull を呼ぶ（めり込みは当たり判定が押し戻す）
const pullState = { enemy: null, reach: 0, speed: 0, time: 0 };
// reach: 武器の届く距離、speed: 寄る速さ (m/s)、time: 寄り続ける時間 (s)
export function startMeleePull(reach, speed, time) {
    pullState.enemy = findPullTarget(reach);
    pullState.reach = reach;
    pullState.speed = speed;
    pullState.time = time;
}
export function stopMeleePull() {
    pullState.enemy = null;
}
export function updateMeleePull(dt) {
    const e = pullState.enemy;
    if (!e)
        return;
    pullState.time -= dt;
    if (pullState.time < 0 || !e.alive) {
        pullState.enemy = null;
        return;
    }
    const gap = gapTo(e, pullState.reach);
    if (gap <= 0) {
        pullState.enemy = null;
        return;
    }
    const step = Math.min(gap, pullState.speed * dt);
    position.x += pullDir.x * step;
    position.z += pullDir.z * step;
}

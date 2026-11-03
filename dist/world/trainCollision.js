import { trainBody } from '../station.js';
import { PLAYER_RADIUS } from '../player/config.js';
import { player, position, velocity } from '../player/state.js';
// 移動前後を電車に対する相対座標で調べ、速い移動でも車体を通り抜けない。
export function collideTrain(start, oldOffsets, offsets) {
    let hit = false;
    for (let index = 0; index < 2; index++) {
        const side = index === 0 ? 1 : -1;
        const minX = (side > 0 ? trainBody.x0 : -trainBody.x1) - PLAYER_RADIUS;
        const maxX = (side > 0 ? trainBody.x1 : -trainBody.x0) + PLAYER_RADIUS;
        const newZ = offsets[index];
        // 編成が画面外から反対側の画面外へ戻る瞬間は、駅を横切る移動ではない。
        const oldZ = Math.abs(newZ - oldOffsets[index]) > 150 ? newZ : oldOffsets[index];
        // 屋根からの着地と、屋根上の移動は既存の箱判定に任せる。
        if (start.y >= trainBody.roof - 0.001 && (position.y >= trainBody.roof - 0.05 || velocity.y <= 0))
            continue;
        for (let i = 0; i < trainBody.count; i++) {
            const maxZ = trainBody.near - i * (trainBody.length + trainBody.gap) + PLAYER_RADIUS;
            const minZ = maxZ - 2 * PLAYER_RADIUS - trainBody.length;
            const sx = start.x, sz = start.z - oldZ;
            const ex = position.x, ez = position.z - newZ;
            const dx = ex - sx, dz = ez - sz;
            let enter = 0, exit = 1, axis = 0, normal = 0;
            for (const [p, d, lo, hi, a] of [[sx, dx, minX, maxX, 1], [sz, dz, minZ, maxZ, 2]]) {
                if (Math.abs(d) < 1e-9) {
                    if (p <= lo || p >= hi) {
                        exit = -1;
                        break;
                    }
                    continue;
                }
                const t1 = (lo - p) / d, t2 = (hi - p) / d;
                const entry = Math.min(t1, t2);
                if (entry > enter) {
                    enter = entry;
                    axis = a;
                    normal = d > 0 ? -1 : 1;
                }
                exit = Math.min(exit, Math.max(t1, t2));
            }
            if (exit < enter || enter > 1 || exit <= 0)
                continue;
            // 中に残った場合や走行中の先頭との接触は、線路方向に長く押さず近い側面へ出す。
            if (axis === 0 || (axis === 2 && Math.abs(newZ - oldZ) > 1e-6)) {
                axis = 1;
                normal = sx < (minX + maxX) / 2 ? -1 : 1;
            }
            if (axis === 1) {
                position.x = normal < 0 ? minX : maxX;
                if (velocity.x * normal < 0)
                    velocity.x = 0;
                // 線路からホームへ押し上げられた場合、ホームの箱の内部に入れない。
                if (normal === -side && position.y < trainBody.platform) {
                    position.y = trainBody.platform;
                    velocity.y = Math.max(0, velocity.y);
                    player.onGround = true;
                }
            }
            else {
                position.z = (normal < 0 ? minZ : maxZ) + newZ;
                if (velocity.z * normal < 0)
                    velocity.z = 0;
            }
            hit = true;
        }
    }
    if (hit && player.mantleTime >= 0)
        player.mantleTime = -1;
}

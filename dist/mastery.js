// ---- 武器の熟練度（レベル） ----
// XP はステージでその武器を使って倒したときの点数（倍率を掛けた後）を貯め、クリアしたときにまとめて足す。訓練場や、倒されて終わったステージでは入らない。
// 次のレベルまでの XP は LV1→2 が XP_FIRST で、上がるごとに XP_GROWTH 倍にし、XP_CAP を上限にする（仮の値。遊んでみて調整する）
// プレイヤーのレベルは、全部の武器の XP の合計で決める（貯め方は武器と同じ。別には保存しない）。上がり方は PLAYER_XP_FIRST と PLAYER_XP_GROWTH、上限は PLAYER_XP_CAP（仮の値）
import { WEAPON_IDS } from './weapons/ids.js';
const XP_FIRST = 3000;
const XP_GROWTH = 1.25;
const XP_CAP = 20000;
const PLAYER_XP_FIRST = 8000;
const PLAYER_XP_GROWTH = 1.2;
const PLAYER_XP_CAP = 60000;
const xpKey = (id) => `fast-finish.xp.${id}`;
export function loadXp(id) {
    try {
        const v = Number(localStorage.getItem(xpKey(id)));
        return Number.isFinite(v) && v > 0 ? v : 0;
    }
    catch {
        return 0;
    }
}
export function addXp(id, pts) {
    if (!(pts > 0))
        return;
    try {
        localStorage.setItem(xpKey(id), String(Math.round(loadXp(id) + pts)));
    }
    catch {
        // 保存できない環境では貯まらない
    }
}
export function masteryOf(xp, first = XP_FIRST, growth = XP_GROWTH, cap = XP_CAP) {
    let level = 1;
    let need = Math.min(cap, first);
    let into = xp;
    while (into >= need) {
        into -= need;
        level++;
        need = Math.min(cap, Math.round(need * growth));
    }
    return { level, into, need };
}
// そのレベルに上がるまでに貯める XP の合計（LV1 は 0）
export function xpToReach(level, first = XP_FIRST, growth = XP_GROWTH, cap = XP_CAP) {
    let total = 0;
    let need = Math.min(cap, first);
    for (let l = 1; l < level; l++) {
        total += need;
        need = Math.min(cap, Math.round(need * growth));
    }
    return total;
}
export const playerXp = () => WEAPON_IDS.reduce((s, w) => s + loadXp(w), 0);
export const playerMastery = () => masteryOf(playerXp(), PLAYER_XP_FIRST, PLAYER_XP_GROWTH, PLAYER_XP_CAP);
export const playerXpToReach = (level) => xpToReach(level, PLAYER_XP_FIRST, PLAYER_XP_GROWTH, PLAYER_XP_CAP);
// EMBLEM_LEVEL に届くと、その武器のアイコンをプレイヤーカードのエンブレムに使える（ui/playerCard.ts）
export const EMBLEM_LEVEL = 3;
export const MASTERY_REWARDS = {
    [EMBLEM_LEVEL]: { kind: 'emblem', name: 'EMBLEM' },
};
export const MASTERY_MILESTONE = 5;
// プレイヤーのレベルのご褒美。プレイヤーカードの背景とフレームを、低いレベルのうちに何枚かずつまとめて解放する（ここに無い部品は初めから選べる）。
// 決めていない節目は中身の分からないカードで出す
export const PLAYER_REWARDS = {
    2: { kind: 'card', name: 'CARD ×4', backgrounds: ['grid', 'stripe'], frames: ['bold', 'bracket'] },
    5: { kind: 'card', name: 'CARD ×4', backgrounds: ['halftone', 'band'], frames: ['ticks', 'rededge'] },
    7: { kind: 'card', name: 'CARD ×4', backgrounds: ['redline', 'ink', 'scan'], frames: ['hazard'] },
};
// プレイヤーカードの部品を解放するレベル（ご褒美に無ければ 0 = 初めから）
export function cardPartLevel(kind, id) {
    for (const [lv, r] of Object.entries(PLAYER_REWARDS))
        if ((kind === 'background' ? r?.backgrounds : r?.frames)?.includes(id))
            return Number(lv);
    return 0;
}

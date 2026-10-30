const XP_FIRST = 3000;
const XP_GROWTH = 1.25;
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
export function masteryOf(xp) {
    let level = 1;
    let need = XP_FIRST;
    let into = xp;
    while (into >= need) {
        into -= need;
        level++;
        need = Math.round(need * XP_GROWTH);
    }
    return { level, into, need };
}

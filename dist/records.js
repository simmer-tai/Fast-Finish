const bestKey = (stage, difficulty) => `fast-finish.best.${stage}.${difficulty}`;
export function loadBest(stage, difficulty) {
    try {
        const v = JSON.parse(localStorage.getItem(bestKey(stage, difficulty)) ?? 'null');
        return v && typeof v.time === 'number' && typeof v.score === 'number' ? v : null;
    }
    catch {
        return null;
    }
}
export function saveBest(stage, difficulty, best) {
    try {
        localStorage.setItem(bestKey(stage, difficulty), JSON.stringify(best));
    }
    catch {
        // 保存できない環境では、その場の結果だけ出す
    }
}
// 記録のあるステージと難易度を全部（訓練場は除く。プレイヤーカードの記録・称号・バッジに使う）
export function allBests() {
    const list = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const m = /^fast-finish\.best\.([^.]+)\.([^.]+)$/.exec(localStorage.key(i) ?? '');
            if (!m || m[1] === 'tutorial')
                continue;
            const v = JSON.parse(localStorage.getItem(m[0]) ?? 'null');
            if (v && typeof v.score === 'number')
                list.push({ stage: m[1], difficulty: m[2], score: v.score });
        }
    }
    catch {
        // 読めなければ記録なし
    }
    return list;
}

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

// ---- 自己ベスト（ステージと難易度ごと） ----
export interface StageBest {
  time: number;
  score: number;
}
const bestKey = (stage: string, difficulty: string) => `fast-finish.best.${stage}.${difficulty}`;
export function loadBest(stage: string, difficulty: string): StageBest | null {
  try {
    const v = JSON.parse(localStorage.getItem(bestKey(stage, difficulty)) ?? 'null');
    return v && typeof v.time === 'number' && typeof v.score === 'number' ? v : null;
  } catch {
    return null;
  }
}
export function saveBest(stage: string, difficulty: string, best: StageBest) {
  try {
    localStorage.setItem(bestKey(stage, difficulty), JSON.stringify(best));
  } catch {
    // 保存できない環境では、その場の結果だけ出す
  }
}
// 記録のあるステージと難易度を全部（訓練場は除く。プレイヤーカードの記録・称号・バッジに使う）
export function allBests() {
  const list: { stage: string; difficulty: string; score: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^fast-finish\.best\.([^.]+)\.([^.]+)$/.exec(localStorage.key(i) ?? '');
      if (!m || m[1] === 'tutorial') continue;
      const v = JSON.parse(localStorage.getItem(m[0]) ?? 'null');
      if (v && typeof v.score === 'number') list.push({ stage: m[1], difficulty: m[2], score: v.score });
    }
  } catch {
    // 読めなければ記録なし
  }
  return list;
}

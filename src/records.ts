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

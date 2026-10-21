// ---- イージング ----
export type Ease = (u: number) => number;
export const linear: Ease = (u) => u;
export const easeInQuad: Ease = (u) => u * u;
export const easeOutCubic: Ease = (u) => 1 - (1 - u) ** 3;
export const easeInOutCubic: Ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
// 行き過ぎてから戻る（u ≈ 0.37 で 1 に届き、少し越えて収まる）。握り直した瞬間の「決め」に使う
export const easeOutBack: Ease = (u) => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2;
export const easeOutQuart: Ease = (k) => 1 - (1 - k) ** 4;

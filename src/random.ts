// 毎回同じ配置になるよう固定シードの乱数を使う
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a 以上 b 未満の一様乱数
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

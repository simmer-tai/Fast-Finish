// ---- 武器の熟練度（レベル） ----
// XP はステージでその武器を使って倒したときの点数（倍率を掛けた後）をそのまま足す。訓練場では入らない。
// 次のレベルまでの XP は LV1→2 が XP_FIRST で、上がるごとに XP_GROWTH 倍にする（仮の値。遊んでみて調整する）
import type { WeaponId } from './weapons/ids.js';

const XP_FIRST = 3000;
const XP_GROWTH = 1.25;
const xpKey = (id: WeaponId) => `fast-finish.xp.${id}`;

export function loadXp(id: WeaponId): number {
  try {
    const v = Number(localStorage.getItem(xpKey(id)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}
export function addXp(id: WeaponId, pts: number) {
  if (!(pts > 0)) return;
  try {
    localStorage.setItem(xpKey(id), String(Math.round(loadXp(id) + pts)));
  } catch {
    // 保存できない環境では貯まらない
  }
}

export interface Mastery {
  level: number;
  into: number; // 今のレベルに入ってから貯めた XP
  need: number; // 今のレベルから次のレベルまでに要る XP
}
export function masteryOf(xp: number): Mastery {
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

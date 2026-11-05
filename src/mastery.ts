// ---- 武器の熟練度（レベル） ----
// XP はステージでその武器を使って倒したときの点数（倍率を掛けた後）を貯め、クリアしたときにまとめて足す。訓練場や、倒されて終わったステージでは入らない。
// 次のレベルまでの XP は LV1→2 が XP_FIRST で、上がるごとに XP_GROWTH 倍にし、XP_CAP を上限にする（仮の値。遊んでみて調整する）
// プレイヤーのレベルは、全部の武器の XP の合計で決める（貯め方は武器と同じ。別には保存しない）。上がり方は PLAYER_XP_FIRST と PLAYER_XP_GROWTH、上限は PLAYER_XP_CAP（仮の値）
import { WEAPON_IDS, type WeaponId } from './weapons/ids.js';

const XP_FIRST = 3000;
const XP_GROWTH = 1.25;
const XP_CAP = 20000;
const PLAYER_XP_FIRST = 8000;
const PLAYER_XP_GROWTH = 1.2;
const PLAYER_XP_CAP = 60000;
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
export function masteryOf(xp: number, first = XP_FIRST, growth = XP_GROWTH, cap = XP_CAP): Mastery {
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
export function xpToReach(level: number, first = XP_FIRST, growth = XP_GROWTH, cap = XP_CAP): number {
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
export const playerXpToReach = (level: number) => xpToReach(level, PLAYER_XP_FIRST, PLAYER_XP_GROWTH, PLAYER_XP_CAP);
// レベルごとのご褒美（ロードマップに出す）。{ 5: { kind: 'skin', name: 'GHOSTLINE' } } のように足す。
// 決めていない節目（5 の倍数）は中身の分からないカードで出す
export interface MasteryReward {
  kind: 'skin' | 'badge' | 'title' | 'emblem' | 'card';
  name: string;
  // card は、まとめて解放するプレイヤーカードの部品の id（ui/playerCard.ts の BACKGROUNDS / FRAMES）
  backgrounds?: string[];
  frames?: string[];
  skin?: string; // skin は、解放するスキンの id（weapons/skins.ts。ロードマップのカーソルで絵を出す）
  badge?: string; // badge は、解放するバッジの id（ui/cardHonors.ts。カードにその絵を出す）
  title?: string; // title は、解放する称号の id（ui/cardHonors.ts。ロードマップのカーソルで、それを付けたカードを出す）
}
// EMBLEM_LEVEL に届くと、その武器のアイコンをプレイヤーカードのエンブレムに使える（ui/playerCard.ts）
export const EMBLEM_LEVEL = 3;
export const MASTERY_REWARDS: Partial<Record<number, MasteryReward>> = {
  [EMBLEM_LEVEL]: { kind: 'emblem', name: 'EMBLEM' },
};
export const MASTERY_MILESTONE = 5;
// プレイヤーのレベルのご褒美。カード部品の未定の解放条件は cardParts.ts の pending で管理する。
// 決めていない節目は中身の分からないカードで出す
export const PLAYER_REWARDS: Partial<Record<number, MasteryReward>> = {};
// プレイヤーカードの部品を解放するレベル（ご褒美に無ければ 0 = 初めから）
export function cardPartLevel(kind: 'background' | 'frame', id: string) {
  for (const [lv, r] of Object.entries(PLAYER_REWARDS)) if ((kind === 'background' ? r?.backgrounds : r?.frames)?.includes(id)) return Number(lv);
  return 0;
}

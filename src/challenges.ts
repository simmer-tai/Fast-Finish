// ---- チャレンジ ----
// ロードマップ（遊んだ量。XP を貯めれば必ず進む）とは役割を分けて、腕前だけを測る。
// ミッション: 決まったステージ・難易度・武器に、特別なルールを 1 つ足して遊ぶ。ルールを守って倒しきると達成。
//   熟練度の XP は入れず、ステージの自己ベストも書き換えない（記録はミッションごとに別に持つ）。
//   達成するとご褒美のスキンを解放する（weapons/skins.ts の skinUnlocked がミッションの記録を見る）
// 実績: ふつうのステージとミッションの 1 回のプレイの中で、決まった離れ業をすると達成（訓練場とマルチプレイでは数えない）。
//   数を貯めるもの（〇〇を 100 体など）は XP の役目なので入れない
import type { WeaponId } from './weapons/ids.js';
import type { Difficulty } from './game/state.js';
import { localDev } from './localDev.js';

// ミッションのルール
export type MissionRule = { kind: 'noHeal' } | { kind: 'parkour'; gold: number; silver: number; bronze: number };

// 結果のランク（result.ts の RANKS と同じ文字）。付けたミッションは、倒しきったときにこれ以上でないと達成にしない
export type MissionRank = 'S' | 'SS' | 'SSS';

export interface Mission {
  id: string;
  group: string; // まとめる見出し（MISSION_GROUPS の id）。一覧では見出しを押すと、その中のミッションが開く
  name: string;
  ja: string;
  stage: string; // ステージ選択の data-stage
  difficulty: Difficulty;
  weapon: WeaponId;
  rule: MissionRule;
  rank?: MissionRank; // 無ければランクは問わない
  reward?: { skin: string; name: string; ja: string }; // 達成すると、weapon のこのスキン（weapons/skins.ts の id）を解放する
}

// ミッションの見出し。一覧に 1 行で出し、押すと中のミッション（武器ごと）を開く
export interface MissionGroup {
  id: string;
  name: string;
  ja: string;
  desc: string; // 見出しを選んだときの詳細に出す概要
  bonus?: { need: number; frame: string; name: string; ja: string }; // 中のミッションをどれか need 個達成すると、プレイヤーカードのこのフレーム（ui/cardParts.ts の id）を解放する
}
// パルクールはまだ公開しない。見出しとミッションを出すのはローカル開発時だけ（localDev.ts）
export const MISSION_GROUPS: MissionGroup[] = [
  ...(localDev ? [{ id: 'parkour', name: 'PARKOUR', ja: 'パルクール', desc: '敵のいないコースを走り、ゴールまでのタイムに挑戦する。' }] : []),
  {
    id: 'talon',
    name: 'TALON TRIAL',
    ja: '爪の試練',
    desc: '爪のスキンがある武器を持って LIFT（HARD）に挑む。回復なしで、ランク SS 以上で倒しきると、挑んだ武器の TALON スキンがもらえる。武器ごとに 1 つずつ。',
    bonus: { need: 3, frame: 'talon', name: 'TALON FRAME', ja: '爪のフレーム' },
  },
];
// 見出しの中で達成したミッションの数
export const groupDone = (id: string) => MISSIONS.filter((m) => m.group === id && loadMission(m.id)).length;
// そのフレームを追加のご褒美にしている見出し（無ければ、フレームはプレイヤーのレベルで解放する）
export const bonusGroupOf = (frame: string) => MISSION_GROUPS.find((g) => g.bonus?.frame === frame);

// 爪（TALON）の試練: LIFT（HARD）を、爪のスキンがある武器で、回復なしで、ランク SS 以上で倒しきると、その武器の爪がもらえる
const TALON_WEAPONS: [WeaponId, string][] = [
  ['kunai', 'クナイ'],
  ['handgun', 'リボルバー'],
  ['sword', '刀'],
  ['sickle', '鎖鎌'],
  ['axe', 'バトルアックス'],
  ['bow', '弓'],
  ['spear', '槍'],
  ['rifle', 'スナイパーライフル'],
];
// ?parkour（動きを確かめる URL）は公開版でもこれを使う
export const PARKOUR_MISSION: Mission = { id: 'parkour-01', group: 'parkour', name: 'PARKOUR 01', ja: 'パルクール 01', stage: 'parkour', difficulty: 'normal', weapon: 'kunai', rule: { kind: 'parkour', gold: 75, silver: 100, bronze: 150 } };
export const MISSIONS: Mission[] = [...TALON_WEAPONS.map(([weapon, ja]): Mission => ({
  id: `talon-${weapon}`,
  group: 'talon',
  name: 'TALON TRIAL',
  ja: `爪の試練 — ${ja}`,
  stage: 'lift',
  difficulty: 'hard',
  weapon,
  rule: { kind: 'noHeal' },
  rank: 'SS',
  reward: { skin: 'talon', name: 'TALON', ja: '爪' },
})), ...(localDev ? [PARKOUR_MISSION] : [])];

// ルールの説明（チャレンジの画面と、ミッションの始まり・失敗の画面に出す）
export const parkourTargets = (m: Mission) => m.rule.kind === 'parkour' ? `GOLD ${m.rule.gold}s / SILVER ${m.rule.silver}s / BRONZE ${m.rule.bronze}s` : '';
export const ruleText = (m: Mission) => m.rule.kind === 'parkour' ? `ゴールを目指す。${parkourTargets(m)}` : (m.rank ? `回復なしで、ランク ${m.rank} 以上で倒しきる` : '回復なしで倒しきる');
// 短い札（HUD とリストに出す）
export const ruleTag = (m: Mission) => m.rule.kind === 'parkour' ? 'TIME TRIAL' : (m.rank ? `NO HEAL / RANK ${m.rank}` : 'NO HEAL');
// ランクの文字が、ミッションの求める段に届いているか
const RANK_ORDER = ['C', 'B', 'A', 'S', 'SS', 'SSS'];
export const rankReached = (m: Mission, rank: string) => !m.rank || RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(m.rank);

// ミッションの記録。達成したときの最短の時間だけを持つ（記録が無ければ未達成）
const missionKey = (id: string) => `fast-finish.mission.${id}`;
export function loadMission(id: string): { time: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(missionKey(id)) ?? 'null');
    return v && typeof v.time === 'number' ? v : null;
  } catch {
    return null;
  }
}
// 達成を記録する。初めての達成か、最短を縮めたかを返す（結果の画面に出す）
export function saveMissionClear(id: string, time: number) {
  const best = loadMission(id);
  const first = !best;
  const newTime = !best || time < best.time;
  if (newTime) {
    try {
      localStorage.setItem(missionKey(id), JSON.stringify({ time }));
    } catch {
      // 保存できない環境では、その場の結果だけ出す
    }
  }
  return { first, newTime };
}

// 実績。絵は 24 四方で、線で描く（見た目は index.html の .ch-feat）
export interface Feat {
  id: string;
  name: string;
  ja: string;
  desc: string; // 達成の条件
  icon: string;
  tier: FeatTier; // 難しさ。もらえるバッジの枠がこの段で変わる（ui/cardHonors.ts の badgePlate）
}
// 難しさの段（1〜5）。チャレンジの画面とロッカーでは I〜V で出す
export type FeatTier = 1 | 2 | 3 | 4 | 5;
export const TIER_NAMES = ['I', 'II', 'III', 'IV', 'V'] as const;
// 判定は main.ts（とどめの加点と、ステージの結果から見る）。易しい順に並べる。
// 段の目安: I は一度やってみれば取れる技 / II は狙えば取れる / III は腕が要る / IV はかなりの腕 / V は極めた人だけ
export const FEATS: Feat[] = [
  // ---- I ----
  // とどめの加点に HEADSHOT
  { id: 'bullseye', name: 'BULLSEYE', ja: '眉間', desc: 'ヘッドショットで倒す', icon: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.6" class="fill"/>', tier: 1 },
  // とどめの加点に SLIDE KILL
  { id: 'slider', name: 'SLIDER', ja: '滑り込み', desc: 'スライディングで倒す', icon: '<path d="M3 18h12l6-4"/><path d="M5 14h6M3 10h5"/><circle cx="17" cy="8.5" r="2.2"/>', tier: 1 },
  // とどめの加点に PARRY KILL
  { id: 'counter', name: 'COUNTER', ja: '返し', desc: 'パリィで返した弾で倒す（PARRY KILL）', icon: '<path d="M4 7h10a6 6 0 0 1 0 12H8"/><path d="M8 3 4 7l4 4"/>', tier: 1 },
  // とどめの加点に AERIAL（WALL RUN も含める）
  { id: 'skyward', name: 'SKYWARD', ja: '空中戦', desc: '空中で倒す', icon: '<path d="M5 13l7-7 7 7"/><path d="M5 20l7-7 7 7"/>', tier: 1 },
  // バットで打ち返した弾（BAT_RETURN_HIT）で倒す
  { id: 'homerun', name: 'HOME RUN', ja: 'ホームラン', desc: 'バットで打ち返した弾で倒す（PARRY KILL）', icon: '<path d="M14.5 4.5a2.5 2.5 0 0 1 3.5 3.5L7.5 18.5 5 16z"/><path d="M3.5 17.5l2.5 2.5"/><circle cx="18.5" cy="17.5" r="2.2" class="fill"/>', tier: 1 },
  // ---- II ----
  // とどめの加点に WALL RUN
  { id: 'wallrunner', name: 'WALLRUNNER', ja: '壁走り', desc: '壁を走りながら倒す', icon: '<path d="M4 3v18"/><path d="M9 18l3-3M12 13l3-3M15 8l3-3"/>', tier: 2 },
  // 1 回のとどめで MULTI KILL ×2 以上
  { id: 'double', name: 'DOUBLE', ja: '二枚抜き', desc: '一度に 2 体を倒す（MULTI KILL ×2）', icon: '<path d="M7 20 15 4M12 20 20 4"/>', tier: 2 },
  // スタイルランクが A に届く
  { id: 'stylish', name: 'STYLISH', ja: '粋', desc: 'スタイルランク A に届く', icon: '<path d="M5 20 12 4l7 16"/><path d="M8.2 14h7.6"/>', tier: 2 },
  // CHAIN ×5 以上
  { id: 'chain', name: 'CHAIN', ja: '数珠つなぎ', desc: '途切れずに 5 体続けて倒す（CHAIN ×5）', icon: '<rect x="2.5" y="9" width="10" height="6" rx="3"/><rect x="11.5" y="9" width="10" height="6" rx="3"/>', tier: 2 },
  // ---- III ----
  // 1 回のとどめで MULTI KILL ×3 以上
  { id: 'triple', name: 'TRIPLE', ja: '三枚おろし', desc: '一度に 3 体以上を倒す（MULTI KILL ×3）', icon: '<path d="M5 20 13 4M10 20 18 4M15 20 21 8"/>', tier: 3 },
  // LONG SHOT が 40M 以上
  { id: 'farsight', name: 'FARSIGHT', ja: '千里眼', desc: '40M 以上離れた敵を倒す', icon: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.5" class="fill"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>', tier: 3 },
  // SPEED KILL の速いほう（加点が 1 のもの）
  { id: 'speedster', name: 'SPEEDSTER', ja: '疾風', desc: '全速力で駆け抜けながら倒す（SPEED KILL の最高段）', icon: '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>', tier: 3 },
  // 1 回のとどめで加点を 5 つ以上重ねる（STALE と RANK は数えない）
  { id: 'stacked', name: 'STACKED', ja: '盛り合わせ', desc: '1 回のとどめで加点を 5 つ重ねる', icon: '<path d="M4 20h16M6 16h12M8 12h8M10 8h4"/><path d="M12 2.5v3"/>', tier: 2 },
  // ハンドガンか弓で、狙って当てた弾と矢がすべて頭に当たったままクリア（結果のヘッドショット率 100%）
  { id: 'headhunter', name: 'HEADHUNTER', ja: '百発百中', desc: 'ヘッドショット率 100% でステージをクリアする', icon: '<circle cx="12" cy="9" r="5"/><path d="M5 21c1-4 3.8-6 7-6s6 2 7 6"/><path d="M12 1.5v3M12 13.5v-1M7.5 9h-3M19.5 9h-3"/>', tier: 3 },
  // ---- IV ----
  // スタイルランクが SS に届く
  { id: 'sstier', name: 'SS TIER', ja: '頂点', desc: 'スタイルランク SS に届く', icon: '<path d="M3 18 5 7l4.5 5L12 5l2.5 7L19 7l2 11z"/><path d="M3 21h18"/>', tier: 4 },
  // 1 回のデッドアイで 4 体以上を倒す
  { id: 'deadeye', name: 'QUICKDRAW', ja: '早撃ち', desc: '1 回のデッドアイで 4 体以上を倒す', icon: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', tier: 4 },
  // 1 回のステージで PARRY KILL を 5 回
  { id: 'reflector', name: 'REFLECTOR', ja: '返し名人', desc: '1 回のステージで PARRY KILL を 5 回', icon: '<path d="M3 5l8 7-8 7"/><path d="M21 5l-8 7 8 7"/>', tier: 4 },
  // NORMAL のステージをダメージを受けずにクリア
  { id: 'clean', name: 'CLEAN', ja: '潔白', desc: 'NORMAL をノーダメージでクリア', icon: '<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>', tier: 4 },
  // HARD のステージをダメージを受けずにクリア
  { id: 'flawless', name: 'FLAWLESS', ja: '完封', desc: 'HARD をノーダメージでクリア', icon: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>', tier: 4 },
  // 1 回のとどめで加点を 7 つ以上重ねる（STALE と RANK は数えない）
  { id: 'grandslam', name: 'GRAND SLAM', ja: '満漢全席', desc: '1 回のとどめで加点を 7 つ重ねる', icon: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/><circle cx="12" cy="12" r="2.5" class="fill"/>', tier: 3 },
  // ---- V ----
  // 1 回のデッドアイで 6 体以上を倒す
  { id: 'highnoon', name: 'HIGH NOON', ja: '六連', desc: '1 回のデッドアイで 6 体以上を倒す', icon: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="16.8" cy="9.25" r="1.8"/><circle cx="16.8" cy="14.75" r="1.8"/><circle cx="12" cy="17.5" r="1.8"/><circle cx="7.2" cy="14.75" r="1.8"/><circle cx="7.2" cy="9.25" r="1.8"/><circle cx="12" cy="12" r="1.2" class="fill"/>', tier: 5 },
  // HARD をダメージを受けずに、結果のランク SS 以上でクリア
  { id: 'untouchable', name: 'UNTOUCHABLE', ja: '無傷の頂', desc: 'HARD でノーダメージかつランク SS 以上をとる', icon: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6M12 9v12"/>', tier: 5 },
];

const featKey = (id: string) => `fast-finish.feat.${id}`;
export function featDone(id: string) {
  try {
    return localStorage.getItem(featKey(id)) === '1';
  } catch {
    return false;
  }
}
// 達成を記録する。初めての達成なら true（結果の画面に出す）
export function unlockFeat(id: string) {
  if (featDone(id)) return false;
  try {
    localStorage.setItem(featKey(id), '1');
  } catch {
    // 保存できない環境でも、その場では知らせる
  }
  return true;
}

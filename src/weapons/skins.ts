import * as THREE from 'three';
import { WEAPON_IDS, type WeaponId } from './ids.js';
import { loadXp, masteryOf } from '../mastery.js';
import { MISSIONS, loadMission } from '../challenges.js';
import type { WeaponMats } from './materials.js';
import type { SwishKind } from '../audio.js';
import type { ArcLook } from '../fx/arcs.js';
import type { CutLineLook, HitSparks, HologramLook, LeafLook, GleamLook } from '../fx/hitFx.js';
import { kintsugiSword } from './skinKintsugi.js';
import { protoRevolver } from './skinProto.js';
import { dressFiligreeRound, filigreeRevolver } from './skinFiligree.js';
import { redlineSword } from './skinRedline.js';
import { relicSword } from './skinRelic.js';
import { willowKunai } from './skinWillowKunai.js';
import { octagonRevolver } from './skinOctagonRevolver.js';
import { harvestSickle } from './skinHarvestSickle.js';
import { beardedAxe } from './skinBeardedAxe.js';
import { longbow } from './skinLongbow.js';
import { hexBat } from './skinHexBat.js';
import { jumonjiSpear } from './skinJumonjiSpear.js';
import { HOLO_FOCUS, ghostlineSword } from './skinGhostline.js';
import { ghostlineSickle } from './skinGhostlineSickle.js';
import { ghostlineAxe } from './skinGhostlineAxe.js';
import { ghostlineSpear } from './skinGhostlineSpear.js';
import { TALON_FOCUS, talonSword } from './skinTalon.js';
import { talonAxe } from './skinTalonAxe.js';
import { talonKunai } from './skinTalonKunai.js';
import { talonSickle } from './skinTalonSickle.js';
import { talonSpear } from './skinTalonSpear.js';
import { eclipseSpear } from './skinEclipseSpear.js';
import { dressTalonRound, talonRevolver } from './skinTalonGun.js';
import { dressTalonArrow, talonBow } from './skinTalonBow.js';
import { talonRifle } from './skinTalonRifle.js';
import { falconRifle } from './skinFalconRifle.js';
import { huntingRifle } from './skinHuntingRifle.js';

// ---- 武器のスキン ----
// 武器の色と質感を部位ごとに差し替える。部位は 3 つ:
//   metal: 刃・頭・胴など黒光りする所（リボルバーは銃身と枠）
//   trim:  剣の柄・鎖鎌の柄・弓のリム・矢の軸（リボルバーはシリンダーの溝）
//   wrap:  握りの巻き・グリップ
// 武器ごとに部位のマテリアルを持ち（ほかの武器や敵と共有しない）、スキンを替えたらその値を書き換える。
// 何も指定しない部位は元のマテリアル（materials.ts の値）に戻す。
// 色だけでなく形も足すスキンは decor を持つ（モデルの名前付きの部位を隠す・差し替える・飾りを足す。dressModel で着せ替える）

type SkinLook = { color: number; metalness: number; roughness: number; env?: number };
export type SkinPart = 'metal' | 'trim' | 'wrap';
export interface Skin {
  id: string;
  name: string;
  ja: string;
  swatch: string[]; // 選択画面の色見本（metal / trim / wrap の順）
  looks: Partial<Record<SkinPart, SkinLook>>;
  weapons?: WeaponId[]; // 選べる武器（無ければどの武器でも）
  unlock?: string; // 解放の条件（選択画面に出す）。無ければ最初から使える
  level?: number; // その武器の熟練度がこのレベルに届くと解放する（unlock には条件の文を入れる。ロードマップにも出る）
  decor?: SkinDecor;
  trail?: SkinTrail; // 斬撃の軌跡の色（剣・斧・鎖鎌・クナイ・槍。リボルバーは弾の光の尾、弓は飛ぶ矢の筋、クナイは投げたクナイの筋も）
  swish?: SwishKind; // 振りの風切り音（無ければ武器の元の音）
  arc?: ArcLook; // 当てたところに稲妻を走らせる（fx/arcs.ts。剣・斧・鎖鎌・リボルバー・弓・クナイ・槍）
  hitSparks?: HitSparks; // 敵に当てたときの火花を強める（fx/hitFx.ts。剣・斧・鎖鎌・リボルバー・弓・クナイ・槍）
  hologram?: HologramLook; // 命中点から散る、連結した三角ポリゴンのホログラム
  cutLine?: CutLineLook; // 命中点を通る振りの向きの紅い線。締めの技では画面ごと斬る
  leaves?: LeafLook; // 命中点から散って舞い落ちる葉
  gleam?: GleamLook; // 命中点に走る横一文字の光の筋と、漂う金粉
  spark?: number; // 近接の空振りで壁や床を叩いたときの火花の色（weapons/wallHit.ts。無ければ白）
  focus?: SkinFocus; // 一閃の構え（剣だけ。無ければ元の構え）
  round?: (round: THREE.Group, env: THREE.Texture | null) => void; // 弾の見た目（リボルバーだけ）。落ちた薬莢に着せる（銃の中の弾は decor が着せる）
  arrow?: (arrow: THREE.Group, env: THREE.Texture | null) => () => void; // 矢の見た目（弓だけ）。元に戻す関数を返す
}
// 剣の構えの形: 柄の位置（手元の基準からのずれ）と向き。swordCombat.ts の SWORD_FOCUS_POS / SWORD_FOCUS_QUAT と同じ決め方
export interface SkinPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}
// 一閃の構え。見た目だけを変え、構えていられる長さ・突進・振りの時間や当たりは元のまま
export interface SkinFocus extends SkinPose {
  enterSpin?: number; // 構えに入るときに、握った手を軸に刃の面の中で回す角度（度）
  rush?: SkinPose; // 突進中に通る形（構え → この形 → 一閃の振りかぶり）
}
// 斬撃の軌跡の色。本体と、切っ先側の縁と、そのいちばん外側の芯。無ければ元の灰色と黒。
// glow: 軌跡のまわりにも光をにじませる（fx/glow.ts）
export interface SkinTrail {
  body: number;
  edge: number;
  core: number;
  glow?: boolean;
}
export interface SkinDecor {
  // 飾りを組んで返す。parts: モデルの名前付きの部位（隠したりマテリアルを替えたりしてよい。外すときに元へ戻す）。
  // mats: その武器の部位のマテリアル（映り込みの envMap はこれから取る。描画の土台ごとに別の物なので）
  // model: モデルそのもの（userData の部品を動かすとき）。部位の外を書き換えたら、返す物の userData.undo に戻し方を入れる
  build(parts: Record<string, THREE.Mesh>, mats: SkinMats, model: THREE.Object3D): THREE.Object3D;
  // 振りの軌跡を取るたびに呼ぶ（剣だけ）。at: その瞬間の武器のカメラから見た行列、time: 軌跡の時刻（game.trailNow の目盛り）
  swing?(at: THREE.Matrix4, time: number): void;
}
// スキンの演出に渡す値。flare: 当てた瞬間に 1 にすると、飾りが光ってすぐに引く。focus: 一閃の構えの効き（0〜1）
export const skinFx = { flare: 0, focus: 0 };

// シリーズ: 同じ id のスキンを武器ごとに作り、共通の値をまとめて持たせる（形の飾りと振り音は武器ごと）
// 爪（TALON）: 黒い機械の地に、赤く光る刃先。軌跡も赤く光り、当てたところに赤い稲妻を走らせる
const TALON = {
  id: 'talon',
  name: 'TALON',
  ja: '爪',
  swatch: ['#0b0c0e', '#8c1515', '#1a1d21'],
  looks: {},
  unlock: 'チャレンジ「TALON TRIAL」: LIFT（HARD）を回復なしで倒しきる', // その武器のミッションを達成すると解放（challenges.ts の MISSIONS）
  // 光る刃先と同じ赤で、軌跡も光らせる。縁は一段暗く、芯は明るく
  trail: { body: 0xa81818, edge: 0x7a1010, core: 0xd02a2a, glow: true },
  // 刃先と同じ赤の稲妻。芯は白く光らせる
  arc: { glow: 0xc01010, body: 0xe01414, core: 0xffffff },
  spark: 0xe01414, // 壁を叩いた火花も稲妻と同じ赤
} satisfies Partial<Skin>;

// ホロライン（HOLOLINE）: くり抜いた黒い骨格に、シアンの光の帯の刃先とホログラム。軌跡は黒にシアンの細い線、破片はホログラム
const HOLOLINE = {
  id: 'ghostline',
  name: 'HOLOLINE',
  ja: 'ホロライン',
  swatch: ['#071117', '#1ec8ff', '#090d10'],
  looks: {
    metal: { color: 0x071117, metalness: 0.92, roughness: 0.2, env: 1.7 },
    trim: { color: 0x07131a, metalness: 0.75, roughness: 0.28, env: 1.2 },
    wrap: { color: 0x111b20, metalness: 0.35, roughness: 0.5 },
  },
  unlock: '条件は未定',
  // 刃と同じく、黒い軌跡の切っ先側にだけ細いシアンの線を通す。にじませると黒い本体まで暗いもやになるので光らせない
  trail: { body: 0x071117, edge: 0x071117, core: 0x5fe4ff },
  spark: 0x6fe8ff,
  hitSparks: { count: 2.4, life: 1.35, size: 1.1, embers: 0.8, tint: 0x6fe8ff },
  // 破片は薄く透けるガラスにシアンの線
  hologram: { color: 0x7fdcf2, core: 0xc4f8ff, count: 24, size: 0.09, life: 0.6, shed: 90 },
} satisfies Partial<Skin>;

// 色はそのまま形を作り直すスキン（遺物など）の共通の値。色見本は STANDARD と同じ
const SHAPE_ONLY = {
  swatch: ['#111', '#3b444c', '#23282d'],
  looks: {},
  unlock: '熟練度 LV5',
  level: 5,
} satisfies Partial<Skin>;

// 区切りに使うグリーンとマゼンタ（プレビュー動画の継ぎ目）は使わない
export const SKINS: Skin[] = [
  { id: 'standard', name: 'STANDARD', ja: '標準', swatch: ['#111', '#3b444c', '#23282d'], looks: {} },
  {
    id: 'eclipse',
    name: 'ECLIPSE',
    ja: '蝕',
    swatch: ['#0b0c0e', '#f2f4f5', '#1e2125'],
    looks: {
      metal: { color: 0x0b0c0e, metalness: 0.88, roughness: 0.2, env: 1.7 },
      trim: { color: 0x101114, metalness: 0.6, roughness: 0.4, env: 1.1 },
      wrap: { color: 0x1e2125, metalness: 0.2, roughness: 0.75 },
    },
    weapons: ['spear'],
    unlock: '条件は未定',
    decor: eclipseSpear,
    // 装甲の継ぎ目から漏れる白い光の残像。本体は灰色、縁は暗く、芯は白く光らせる
    trail: { body: 0x9aa0a6, edge: 0x3a3e42, core: 0xffffff, glow: true },
    spark: 0xe6edf0,
    hitSparks: { count: 1.5, life: 1.2, size: 1.1, embers: 0.6, tint: 0xffffff },
  },
  {
    id: 'kintsugi',
    name: 'KINTSUGI',
    ja: '金継ぎ',
    swatch: ['#0d0d0d', '#d6a84e', '#e8e2d2'],
    looks: { metal: { color: 0x0d0d0d, metalness: 0.7, roughness: 0.42, env: 1 } },
    weapons: ['sword'],
    unlock: '条件は未定',
    decor: kintsugiSword,
    spark: 0xd6a84e, // 壁を叩いた火花は継ぎ目の金
  },
  {
    id: 'redline',
    name: 'REDLINE',
    ja: '紅線',
    swatch: ['#a4a8ad', '#4a0a10', '#8b9196'],
    looks: {},
    weapons: ['sword'],
    unlock: '条件は未定',
    decor: redlineSword,
    // 赤黒い塗りの色で軌跡を引く（爪と違って光らせない）。縁は暗く、芯は刃先の色より少し明るく
    trail: { body: 0x4a0c14, edge: 0x22060a, core: 0x8c1a26 },
    spark: 0x8c1a26, // 壁を叩いた火花は軌跡の芯と同じ色
    // 敵に当てた火花を 2.5 倍に増やし、大きく速く長く飛ばす。白から赤へ変わり、ゆっくり落ちる火の粉も残す
    hitSparks: { count: 2.5, life: 1.6, size: 1.3, embers: 1.2, tint: 0xff3020 },
    // 命中点を通る紅い直線。芯は軌跡の芯、縁は軌跡の縁と同じ色で、光らせずに塗る
    cutLine: { body: 0x8c1a26, edge: 0x22060a, len: 1.1, width: 0.012, life: 0.42 },
  },
  {
    id: 'relic',
    name: 'RELIC',
    ja: '遺物',
    swatch: ['#111', '#111', '#3b444c'],
    looks: {}, // 色は元の剣のまま、形だけ替える
    weapons: ['sword'],
    unlock: '熟練度 LV5',
    level: 5,
    decor: relicSword,
  },
  // 遺物と同じく、色は元の武器のまま形を作り直す（古い時代の形。武器ごとに別の名前）
  { ...SHAPE_ONLY, id: 'willow', name: 'WILLOW', ja: '柳葉', weapons: ['kunai'], decor: willowKunai },
  { ...SHAPE_ONLY, id: 'octagon', name: 'OCTAGON', ja: '八角銃身', weapons: ['handgun'], decor: octagonRevolver },
  { ...SHAPE_ONLY, id: 'harvest', name: 'HARVEST', ja: '稲刈り', weapons: ['sickle'], decor: harvestSickle },
  { ...SHAPE_ONLY, id: 'bearded', name: 'BEARDED', ja: '髭斧', weapons: ['axe'], decor: beardedAxe },
  { ...SHAPE_ONLY, id: 'longbow', name: 'LONGBOW', ja: '長弓', weapons: ['bow'], decor: longbow },
  { ...SHAPE_ONLY, id: 'hexclub', name: 'HEXCLUB', ja: '六角棍', weapons: ['bat'], decor: hexBat },
  { ...SHAPE_ONLY, id: 'jumonji', name: 'JUMONJI', ja: '十文字', weapons: ['spear'], decor: jumonjiSpear },
  { ...SHAPE_ONLY, id: 'hunting', name: 'HUNTING', ja: 'ハンティング', weapons: ['rifle'], decor: huntingRifle },
  {
    ...HOLOLINE,
    weapons: ['sword'],
    decor: ghostlineSword,
    focus: HOLO_FOCUS, // 刀を縦に立て、光る刃先の線越しに敵を見る
  },
  { ...HOLOLINE, weapons: ['sickle'], decor: ghostlineSickle },
  { ...HOLOLINE, weapons: ['axe'], decor: ghostlineAxe },
  { ...HOLOLINE, weapons: ['spear'], decor: ghostlineSpear },
  {
    ...TALON,
    weapons: ['sword'],
    decor: talonSword,
    swish: 'talon', // 剣の振り音を、黒い機械の刀に合わせて低く暗く重くする
    focus: TALON_FOCUS, // 光る刃を目の高さのすぐ下に水平に掲げ、刃先越しに敵を見る
  },
  {
    ...TALON,
    weapons: ['kunai'],
    decor: talonKunai,
    swish: 'talonKunai', // クナイの振り音を低く暗くし、刃の鳴りを薄く敷く
  },
  {
    ...TALON,
    weapons: ['axe'],
    decor: talonAxe,
    swish: 'talonAxe', // 斧の振り音に、低く暗い金属の唸りを足す
  },
  {
    ...TALON,
    weapons: ['sickle'],
    decor: talonSickle,
    swish: 'talonSickle', // 鎌の鋭い振り音の下に、暗い刃の鳴りを敷く
  },
  {
    ...TALON,
    weapons: ['spear'],
    decor: talonSpear,
    swish: 'talonAxe', // 槍の振り音（斧と同じ）に、低く暗い金属の唸りを足す
  },
  {
    ...TALON,
    weapons: ['handgun'],
    // 銃身と枠は剣の爪と同じ黒、シリンダーの溝は暗い赤、グリップは爪の柄と同じ暗い色
    looks: {
      metal: { color: 0x0b0c0e, metalness: 0.85, roughness: 0.24, env: 1.5 },
      trim: { color: 0x7a1010, metalness: 0.5, roughness: 0.35 },
      wrap: { color: 0x1a1d21, metalness: 0.6, roughness: 0.45 },
    },
    decor: talonRevolver,
    round: dressTalonRound,
    swish: 'talonGun', // 回す音を低く暗くする
  },
  {
    ...TALON,
    weapons: ['bow'],
    // 柄とリムは剣の爪と同じ黒、握りは爪の柄と同じ暗い色
    looks: {
      metal: { color: 0x0b0c0e, metalness: 0.85, roughness: 0.24, env: 1.5 },
      trim: { color: 0x101215, metalness: 0.7, roughness: 0.32, env: 1.2 },
      wrap: { color: 0x1a1d21, metalness: 0.6, roughness: 0.45 },
    },
    decor: talonBow,
    arrow: dressTalonArrow,
  },
  {
    ...TALON,
    weapons: ['rifle'],
    // 銃身と機関部は剣の爪と同じ黒、スコープの台座と照星は一段明るい黒、銃床と先台は爪の柄と同じ暗い色
    looks: {
      metal: { color: 0x0b0c0e, metalness: 0.85, roughness: 0.24, env: 1.5 },
      trim: { color: 0x101215, metalness: 0.7, roughness: 0.32, env: 1.2 },
      wrap: { color: 0x1a1d21, metalness: 0.6, roughness: 0.45 },
    },
    decor: talonRifle,
    swish: 'talonGun', // スピンコックで回す音を低く暗くする
  },
  {
    id: 'falcon',
    name: 'FALCON',
    ja: '隼',
    swatch: ['#111214', '#c9a25a', '#e6e8ea'],
    // 銃の体は decor が白い陶器・黒い鋼・金で作り直す。ここで決めるのは残したスコープの色:
    // 筒は翼と同じ黒い鋼、台座と輪は背骨と同じ金
    looks: {
      metal: { color: 0x111214, metalness: 0.85, roughness: 0.26, env: 1.5 },
      trim: { color: 0xc9a25a, metalness: 1, roughness: 0.3, env: 1.4 },
      wrap: { color: 0xe6e8ea, metalness: 0, roughness: 0.4 },
    },
    weapons: ['rifle'],
    unlock: '条件は未定',
    decor: falconRifle,
    // 弾の筋は金に光らせる。縁は暗い金、芯は白
    trail: { body: 0xe0a83a, edge: 0x6a4a14, core: 0xfff4d8, glow: true },
    spark: 0xf2d79a,
    hitSparks: { count: 1.4, life: 1.2, size: 1, embers: 0.6, tint: 0xffc860 },
    // 命中点に横一文字の金の光の筋を走らせ、金粉を漂わせる（倒した 1 発は筋を長く 2 本にし、金粉を増やす。rifleCombat.ts）
    gleam: { color: 0xe8a830, core: 0xfff3d6, len: 1.3, dust: 36, life: 1.4 },
  },
  {
    id: 'proto',
    name: 'PROTO',
    ja: '試作機',
    swatch: ['#d3d6d9', '#a4a9ae', '#121416'],
    // 外殻の中から振り出すシリンダーも、外殻に近い白にする
    looks: { metal: { color: 0xc4c8cc, metalness: 0.2, roughness: 0.45, env: 0.6 } },
    weapons: ['handgun'],
    unlock: '条件は未定',
    decor: protoRevolver,
  },
  {
    id: 'filigree',
    name: 'FILIGREE',
    ja: '唐草',
    swatch: ['#1b1e23', '#d8dce0', '#efe6d2'],
    // 黒染めの本体に銀の蔓が絡む（decor が作り直す）。シリンダーは銀で溝は黒染めの鋼、グリップは象牙
    looks: {
      metal: { color: 0xc4c8cc, metalness: 1, roughness: 0.18, env: 1.6 },
      trim: { color: 0x14171b, metalness: 0.8, roughness: 0.3, env: 1.2 },
    },
    weapons: ['handgun'],
    unlock: '条件は未定',
    decor: filigreeRevolver,
    round: dressFiligreeRound,
    // 銀の弾丸の尾。本体は銀、縁は暗い銀、芯は白く光らせる
    trail: { body: 0xb4b9be, edge: 0x5e6368, core: 0xffffff, glow: true },
    spark: 0xf2eee4,
    // 当てた火花は白く、少し多く長く散らす
    hitSparks: { count: 1.8, life: 1.3, size: 1, embers: 0.5, tint: 0xfff6e8 },
    // 唐草の蔓と同じ銀の葉を散らす
    leaves: { color: 0xc4c8cc, count: 9, size: 0.07, life: 1.6 },
  },
];
// スキンで変わるもの（選択画面のタグ）。持っている値から決める
//   look: 色・形・弾や矢の見た目、hit: 軌跡・稲妻・火花、motion: 構え
export type SkinTag = 'look' | 'hit' | 'motion';
export function skinTags(s: Skin): SkinTag[] {
  const tags: SkinTag[] = [];
  if (Object.keys(s.looks).length || s.decor || s.round || s.arrow) tags.push('look');
  if (s.trail || s.arc || s.hitSparks || s.hologram || s.cutLine || s.leaves || s.gleam || s.spark !== undefined) tags.push('hit');
  if (s.focus) tags.push('motion');
  return tags;
}
export const skinsFor = (id: WeaponId) => SKINS.filter((s) => !s.weapons || s.weapons.includes(id));
// 作者の手元（localhost で開いたとき）と ?devmode を付けたときは全部使える（localhost でも ?new なら公開版と同じ）。公開版では条件の付いたスキンは解放するまで使えない。
// 熟練度で解放するスキンは、選べる武器（1 つ）の熟練度で決める。チャレンジのご褒美のスキンは、その武器のミッションを達成したら使える
const params = new URLSearchParams(location.search);
export const OWNER = (['localhost', '127.0.0.1'].includes(location.hostname) && !params.has('new')) || params.has('devmode');
export const skinUnlocked = (s: Skin) => {
  if (OWNER || !s.unlock) return true;
  if (s.id === 'falcon' && params.has('HGMR')) return true; // ?HGMR を付けると隼だけ使える（公開版でも効く）
  const weapon = s.weapons?.[0];
  if (weapon === undefined) return false;
  if (MISSIONS.some((m) => m.weapon === weapon && m.reward?.skin === s.id && loadMission(m.id))) return true;
  return s.level !== undefined && masteryOf(loadXp(weapon)).level >= s.level;
};
// 使えないスキンは STANDARD に読み替える（覚えていたスキンが使えないときも）
const skinById = (weapon: WeaponId, id: string | undefined) =>
  skinsFor(weapon).find((s) => s.id === id && skinUnlocked(s)) ?? SKINS[0];

// ---- 部位のマテリアル ----
export type SkinMats = Record<SkinPart, THREE.MeshStandardMaterial> & { base: Record<SkinPart, THREE.MeshStandardMaterial> };
// 部位ごとの元のマテリアル。リボルバーだけ別の色で組んであるので、そちらを元にする
const baseOf = (mats: WeaponMats, id: WeaponId): Record<SkinPart, THREE.MeshStandardMaterial> =>
  id === 'handgun'
    ? { metal: mats.gun, trim: mats.flute, wrap: mats.grip }
    : { metal: mats.kunai, trim: mats.swordHilt, wrap: mats.sickleWrap };
export function createSkinMats(mats: WeaponMats, id: WeaponId): SkinMats {
  const base = baseOf(mats, id);
  return { metal: base.metal.clone(), trim: base.trim.clone(), wrap: base.wrap.clone(), base };
}
export function applySkin(mats: SkinMats, skin: Skin) {
  for (const part of ['metal', 'trim', 'wrap'] as const) {
    const m = mats[part];
    m.copy(mats.base[part]);
    const look = skin.looks[part];
    if (!look) continue;
    m.color.setHex(look.color);
    m.metalness = look.metalness;
    m.roughness = look.roughness;
    if (look.env !== undefined) m.envMapIntensity = look.env;
  }
}
// 武器のモデルを組む関数に渡す、部位を差し替えたマテリアルの組
export function skinnedWeaponMats(mats: WeaponMats, s: SkinMats, id: WeaponId): WeaponMats {
  return id === 'handgun'
    ? { ...mats, gun: s.metal, flute: s.trim, grip: s.wrap }
    : { ...mats, kunai: s.metal, swordHilt: s.trim, sickleWrap: s.wrap };
}

// ---- 形の飾り ----
// モデル（名前付きの部位を持つ）にスキンの飾りを着せる。前の飾りは外して捨て、部位を元に戻してから着せる
export function dressModel(model: THREE.Object3D, skin: Skin, mats: SkinMats) {
  const old = model.userData.skinDecor as THREE.Object3D | undefined;
  if (old) {
    old.userData.undo?.();
    model.remove(old);
    old.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) m.dispose();
    });
    model.userData.skinDecor = undefined;
  }
  // 部位は入れ子の中（鎖鎌の頭と握りなど）からも集める
  const parts: Record<string, THREE.Mesh> = {};
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.name) return;
    parts[o.name] = o;
    const base = (o.userData.skinBase ??= { material: o.material, visible: o.visible });
    if (o.material !== base.material) for (const m of [o.material].flat()) m.dispose();
    o.material = base.material;
    o.visible = base.visible;
  });
  if (!skin.decor) return;
  const decor = skin.decor.build(parts, mats, model);
  model.add(decor);
  model.userData.skinDecor = decor;
}

// ---- 武器ごとに選んだスキン ----
// 次に開いたときのために覚えておく
const SKIN_STORE = 'fast-finish.skin';
const chosen: Partial<Record<WeaponId, string>> = {};
try {
  const saved = JSON.parse(localStorage.getItem(SKIN_STORE) ?? '{}');
  for (const id of WEAPON_IDS) if (typeof saved?.[id] === 'string') chosen[id] = saved[id];
} catch {
  // 保存できない環境では毎回 STANDARD から
}
export const skinOf = (id: WeaponId) => skinById(id, chosen[id]);
const listeners: ((id: WeaponId, skin: Skin) => void)[] = [];
export const onSkinChange = (fn: (id: WeaponId, skin: Skin) => void) => listeners.push(fn);
export function setSkin(id: WeaponId, skinId: string) {
  chosen[id] = skinById(id, skinId).id;
  try {
    localStorage.setItem(SKIN_STORE, JSON.stringify(chosen));
  } catch {
    // 覚えられなくても替えることはできる
  }
  for (const fn of listeners) fn(id, skinOf(id));
}

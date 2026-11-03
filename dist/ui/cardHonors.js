import { WEAPON_IDS } from '../weapons/ids.js?v=2f0a24b4';
import { loadXp, masteryOf, playerMastery } from '../mastery.js?v=2f0a24b4';
import { allBests } from '../records.js?v=2f0a24b4';
import { FEATS, TIER_NAMES, featDone } from '../challenges.js?v=2f0a24b4';
// ---- プレイヤーカードの称号とバッジ ----
// ロッカー（ui/playerCard.ts）で選んでカードに載せる。称号は名前の下に 1 つ、バッジはその右に BADGE_SLOTS 個まで。
// 称号の解放の条件は、プレイヤーのレベル・武器の熟練度・記録のどれか。レベルで解放するものは、ロードマップの節にも出す（ui/lvRoadmap.ts）。
// バッジはチャレンジの実績（challenges.ts の FEATS）でだけ解放する。ロードマップのご褒美にはしない
export const BADGE_SLOTS = 3;
export const WEAPON_NAMES = {
    kunai: 'KUNAI', handgun: 'HANDGUN', sword: 'SWORD', sickle: 'SICKLE', axe: 'AXE', bow: 'BOW', bat: 'BAT', spear: 'SPEAR', rifle: 'SNIPER',
};
// 「全部のステージ」に数えるもの（ステージの選択画面に出しているもの）
const STAGES = ['station', 'warehouse', 'lift', 'ship', 'ruins'];
const weaponLv = (w) => masteryOf(loadXp(w)).level;
const cleared = (difficulty) => allBests().filter((b) => !difficulty || b.difficulty === difficulty);
const clearedAll = (difficulty) => STAGES.every((s) => cleared(difficulty).some((b) => b.stage === s));
export function unlocked(u) {
    if (!u)
        return true;
    if ('player' in u)
        return playerMastery().level >= u.player;
    if ('weapon' in u)
        return weaponLv(u.weapon) >= u.level;
    return u.test();
}
export function unlockHint(u) {
    if (!u)
        return '';
    if ('player' in u)
        return `PLAYER LV${u.player}`;
    if ('weapon' in u)
        return `${WEAPON_NAMES[u.weapon]} LV${u.level}`;
    return u.hint;
}
// 武器の称号。熟練度 LV10 でその武器らしい呼び名、LV20 で「〜 MASTER」
const WEAPON_TITLES = {
    kunai: 'SHADOW', handgun: 'GUNSLINGER', sword: 'SWORDSMAN', sickle: 'REAPER', axe: 'BERSERKER', bow: 'SHARPSHOOTER', bat: 'SLUGGER', spear: 'LANCER', rifle: 'MARKSMAN',
};
const WEAPON_TITLES_JA = {
    kunai: '影', handgun: '早撃ち', sword: '剣客', sickle: '死神', axe: '狂戦士', bow: '射手', bat: '強打者', spear: '槍使い', rifle: '狙撃手',
};
const WEAPON_NAMES_JA = {
    kunai: 'クナイ', handgun: '拳銃', sword: '剣', sickle: '鎖鎌', axe: '斧', bow: '弓', bat: 'バット', spear: '槍', rifle: 'スナイパー',
};
// none は称号を載せない
export const TITLES = [
    { id: 'none', name: 'NO TITLE', ja: '称号なし' },
    { id: 'rookie', name: 'ROOKIE', ja: '新人' },
    { id: 'veteran', name: 'VETERAN', ja: '古参', unlock: { player: 4 } },
    { id: 'ace', name: 'ACE', ja: 'エース', unlock: { player: 10 } },
    { id: 'elite', name: 'ELITE', ja: '精鋭', unlock: { player: 20 } },
    { id: 'master', name: 'MASTER', ja: '達人', unlock: { player: 30 } },
    { id: 'champion', name: 'CHAMPION', ja: '覇者', unlock: { player: 40 } },
    { id: 'legend', name: 'LEGEND', ja: '伝説', unlock: { player: 50 } },
    { id: 'survivor', name: 'SURVIVOR', ja: '生還者', unlock: { hint: 'CLEAR A STAGE', test: () => cleared().length > 0 } },
    { id: 'hardliner', name: 'HARDLINER', ja: '修羅', unlock: { hint: 'CLEAR ON HARD', test: () => cleared('hard').length > 0 } },
    { id: 'allrounder', name: 'ALL-ROUNDER', ja: '万能', unlock: { hint: 'ALL WEAPONS LV5', test: () => WEAPON_IDS.every((w) => weaponLv(w) >= 5) } },
    ...WEAPON_IDS.flatMap((w) => [
        { id: `${w}-10`, name: WEAPON_TITLES[w], ja: WEAPON_TITLES_JA[w], unlock: { weapon: w, level: 10 } },
        { id: `${w}-20`, name: `${WEAPON_NAMES[w]} MASTER`, ja: `${WEAPON_NAMES_JA[w]}の達人`, unlock: { weapon: w, level: 20 } },
    ]),
];
// バッジの台。縦に尖った六角形のメダルで、実績の難しさの段（tier）ごとに飾りを足していく（見た目は index.html の .bdg-plate）。
//   I: 墨の面だけ / II: 内側に細い縁 / III: 縁の 6 つの角に鋲 / IV: 外側にもう 1 枚の枠 / V: 外の枠と縁を赤にし、上下の頂点に菱形の飾り
// どの段も同じ大きさに並ぶよう、いちばん大きい V の飾りまで入る広さで描く。カード・ロッカー・チャレンジの FEATS で使う
const HEX = '43.5,0 87,25 87,75 43.5,100 0,75 0,25';
const RIM = [[43.5, 7], [80.5, 28.5], [80.5, 71.5], [43.5, 93], [6.5, 71.5], [6.5, 28.5]];
const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');
export function badgePlate({ id, icon, tier }) {
    let frame = `<polygon class="face" points="${HEX}"/>`;
    if (tier >= 2)
        frame += `<polygon class="lit" points="43.5,0 0,25 0,75 43.5,100"/><polygon class="rim" points="${pts(RIM)}"/>`;
    if (tier >= 3)
        frame += RIM.map(([x, y]) => `<circle class="stud" cx="${x}" cy="${y}" r="2.4"/>`).join('');
    if (tier >= 4)
        frame += `<polygon class="ring" points="43.5,-5 91.4,22.5 91.4,77.5 43.5,105 -4.4,77.5 -4.4,22.5"/>`;
    if (tier >= 5)
        frame += `<polygon class="spike" points="43.5,-9 47.5,-5 43.5,-1 39.5,-5"/><polygon class="spike" points="43.5,101 47.5,105 43.5,109 39.5,105"/>`;
    return `<span class="bdg-plate t${tier}" data-feat="${id}"><svg class="bdg-frame" viewBox="-8 -9 103 118" aria-hidden="true">${frame}</svg><svg class="bdg" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span>`;
}
// 実績 1 つにバッジ 1 つ。絵は実績と同じ
export const BADGES = FEATS.map((f) => ({ id: f.id, name: f.name, ja: f.ja, icon: f.icon, tier: f.tier, unlock: { hint: f.desc, test: () => featDone(f.id) } }));
// バッジにカーソルを乗せると、名前・段・達成の条件を札で出す（カード・ロッカー・結果の画面）。
// ロッカーの一覧は枠の外を切るので、札は body に 1 枚だけ置き、乗せたバッジの上（入らなければ下）へ動かす
const tip = document.createElement('div');
tip.className = 'bdg-tip';
document.body.append(tip);
let tipOn = null;
document.addEventListener('mouseover', (e) => {
    const hit = e.target.closest?.('.bdg-plate[data-feat]') ?? null;
    const plate = hit?.closest('.ch-feat') ? null : hit; // チャレンジの FEATS は横に条件まで書いてあるので出さない
    if (plate === tipOn)
        return;
    tipOn = plate;
    const f = plate && FEATS.find((x) => x.id === plate.dataset.feat);
    if (!plate || !f)
        return tip.classList.remove('on');
    const done = featDone(f.id);
    tip.innerHTML = `<b>${f.name}<small>${f.ja}</small><i class="t${f.tier}">${TIER_NAMES[f.tier - 1]}</i></b><p>${f.desc}</p><em class="${done ? 'done' : ''}">${done ? 'UNLOCKED' : 'LOCKED'}</em>`;
    tip.classList.add('on');
    const r = plate.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const y = r.top - h - 10 >= 8 ? r.top - h - 10 : r.bottom + 10;
    tip.style.transform = `translate(${x}px, ${y}px)`;
});
// 押したり画面が替わったりしたら引っ込める（乗せたまま画面が消えると、札だけ残るため）
const hideTip = () => {
    tipOn = null;
    tip.classList.remove('on');
};
for (const type of ['mousedown', 'keydown', 'wheel'])
    document.addEventListener(type, hideTip, true);

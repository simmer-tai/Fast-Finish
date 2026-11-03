import * as sfx from '../audio.js';
import type { WeaponId } from '../weapons/ids.js';
import { BACKGROUNDS, FRAMES, partSwatch } from './cardParts.js';
import { MASTERY_MILESTONE, MASTERY_REWARDS, PLAYER_REWARDS, loadXp, masteryOf, playerMastery, playerXpToReach, xpToReach, type MasteryReward } from '../mastery.js';
import { SKINS } from '../weapons/skins.js';
import { BADGES, TITLES, type Honor } from './cardHonors.js';
import { skinTagsHtml, startSkinSpin, stopSkinSpin } from './skinPicker.js';

// プレイヤーカードの見本。playerCard.ts はこのファイルを import するので、向こうから initCardPreview で入れてもらう
type CardPreview = (over: { emblem?: WeaponId; title?: string }) => string;
let cardPreviewHtml: CardPreview = () => '';
export const initCardPreview = (fn: CardPreview) => (cardPreviewHtml = fn);

// ---- 熟練度のロードマップ ----
// 武器の熟練度と、プレイヤーのレベル（PLAY のタブの ROADMAP だけ）を同じ形で出す。
// 武器の選択画面の LV を押すと、窓を入れ替えて出す。レベルの節を横に並べ、今のレベルを左寄りに置いて開く。
// 字は減らし、届いたかどうかはチェックと南京錠、ご褒美は種類ごとのアイコンのカードで見せる
const overlay = document.getElementById('overlay')!;
const win = overlay.querySelector<HTMLElement>('.lv-win')!;
// 次のご褒美のカード。武器の選択画面の LV の欄と、ロードマップのゲージの右に置く
const goals = [...overlay.querySelectorAll<HTMLElement>('.lv-goal')];
// 並べる節の数。今のレベルの先も少しは見えるよう、足りなければ伸ばす
const ROADMAP_LEVELS = 100;
const ROADMAP_AHEAD = 5;
const fmtXp = (n: number) => Math.round(n).toLocaleString('en-US');

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const CHECK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
export const LOCK =
  '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><path class="shackle" d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"/><rect x="4.5" y="11" width="15" height="10.5"/><rect class="hole" x="11" y="14.5" width="2" height="3.5"/></svg>';
// ご褒美の種類ごとのアイコン。まだ決めていない節目は贈り物の箱
const REWARD_ICON = {
  // スキン: スキンの選択画面の「外見」のタグと同じ箱
  skin: svg('<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>'),
  badge: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  // プレイヤーカードのエンブレム: 角を落とした台に人の形
  emblem: svg('<path d="M4 4h12l4 4v12H8l-4-4z"/><circle cx="12" cy="10" r="2.6"/><path d="M7.8 17c.6-2.5 2.1-3.7 4.2-3.7s3.6 1.2 4.2 3.7"/>'),
  // プレイヤーカードの部品のまとめ: 16:9 の札を 2 枚ずらして重ね、手前の札にかぎ括弧
  // 称号: 名札の上に一本線
  title: svg('<path d="M3 7.5h18v9H3z"/><path d="M6.5 12h11"/><path d="M3 4h7" opacity="0.5"/>'),
  card: svg('<path d="M7 4h14v9"/><path d="M3 8h14v11H3z"/><path d="M6 13.5V11h3.5M14 13.5V16h-3.5"/>'),
  mystery: svg('<rect x="4" y="10" width="16" height="10"/><path d="M3 7h18v3H3zM12 7v13M12 7C10.5 3.5 6.5 3.5 6.5 5.5S10 7 12 7zM12 7c1.5-3.5 5.5-3.5 5.5-1.5S14 7 12 7z"/>'),
};
// 節の名前の下に添えるご褒美の種類
const KIND_LABEL: Record<MasteryReward['kind'], string> = { skin: '武器スキン', badge: 'バッジ', title: '称号', emblem: 'エンブレム', card: 'カードパーツ' };
// ロードマップに出すもの。武器ごとの熟練度か、プレイヤーのレベル（'player'）
type Track = WeaponId | 'player';
const levelOf = (t: Track) => (t === 'player' ? playerMastery() : masteryOf(loadXp(t)));
const toReach = (t: Track, level: number) => (t === 'player' ? playerXpToReach(level) : xpToReach(level));
// 武器のご褒美は、どの武器にも共通のもの（MASTERY_REWARDS）に、その武器の熟練度で解放するスキン（skins.ts の level）を重ねる。
// 称号とバッジ（cardHonors.ts）は、レベルで解放するものをそのレベルの節に重ねる（プレイヤーのレベルのものはプレイヤーのロードマップに）
// その称号・バッジを t のレベルで解放するなら、そのレベル（記録で解放するものと、ほかの武器のものは undefined）
function honorLevel(h: Honor, t: Track) {
  const u = h.unlock;
  if (!u || 'test' in u) return undefined;
  if ('player' in u) return t === 'player' ? u.player : undefined;
  return u.weapon === t ? u.level : undefined;
}
const trackRewards = new Map<Track, Partial<Record<number, MasteryReward>>>();
function rewardsOf(t: Track) {
  let r = trackRewards.get(t);
  if (!r) {
    r = { ...(t === 'player' ? PLAYER_REWARDS : MASTERY_REWARDS) };
    if (t !== 'player') for (const s of SKINS) if (s.level !== undefined && s.weapons?.includes(t)) r[s.level] = { kind: 'skin', name: s.name, skin: s.id };
    for (const h of TITLES) {
      const lv = honorLevel(h, t);
      if (lv) r[lv] = { kind: 'title', name: h.name, title: h.id };
    }
    for (const b of BADGES) {
      const lv = honorLevel(b, t);
      if (lv) r[lv] = { kind: 'badge', name: b.name, badge: b.id };
    }
    trackRewards.set(t, r);
  }
  return r;
}
const rewardAt = (t: Track, level: number) => rewardsOf(t)[level] ?? (level % MASTERY_MILESTONE === 0 ? null : undefined);
// 人型。プレイヤーカードの初めのエンブレムと、プレイヤーのレベルの台に使う（24 四方で描く）
export const PLAYER_MARK = '<circle cx="12" cy="7.5" r="4.5"/><path d="M3 23c0-6 3.6-10 9-10s9 4 9 10z"/>';
// 台に載せるアイコン。武器は右下の HUD のアイコンを写す。エンブレムは、もらえるもの（そのアイコン）をそのまま台に載せて見せる
function trackIcon(t: Track) {
  if (t === 'player') {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<svg class="pc-mark" viewBox="0 0 24 24" aria-hidden="true">${PLAYER_MARK}</svg>`;
    return tpl.content.firstElementChild as SVGElement;
  }
  const icon = document.querySelector(`#weapon .icon svg[data-w="${t}"]`)!.cloneNode(true) as SVGElement;
  icon.setAttribute('class', 'on');
  return icon;
}
// ご褒美の種類のアイコン。バッジは、もらえるバッジの絵
function rewardIcon(t: Track, level: number) {
  const r = rewardsOf(t)[level];
  const badge = r?.kind === 'badge' ? BADGES.find((b) => b.id === r.badge) : undefined;
  return badge ? svg(badge.icon) : REWARD_ICON[r?.kind ?? 'mystery'];
}
function card(level: number, got: boolean, t: Track) {
  const r = rewardsOf(t)[level];
  // エンブレムとバッジは、もらえるものの絵をそのまま台に載せる
  const face = r?.kind === 'emblem' ? `<span class="ic">${trackIcon(t).outerHTML}</span>` : rewardIcon(t, level);
  return `<span class="lv-card${got ? ' got' : ''}${r?.kind === 'emblem' ? ' emblem' : ''}" data-track="${t}" data-lv="${level}"><span class="sw-plate">${face}</span>${got ? '' : LOCK}</span>`;
}
let done: (() => void) | null = null;

// ---- ご褒美の中身 ----
// ご褒美のカードにカーソルを合わせると、その上（入らなければ下）に中身を出す。カードの部品は見本を並べる。見た目は index.html の .lv-tip
const tip = overlay.appendChild(Object.assign(document.createElement('div'), { className: 'lv-tip' }));
let tipCard: HTMLElement | null = null;
const tipItem = (swatch: string, name: string) => `<figure>${swatch}<figcaption>${name}</figcaption></figure>`;
const tipRow = (label: string, items: string[]) => (items.length ? `<small>${label}</small><div class="lv-tip-parts">${items.join('')}</div>` : '');
function tipHtml(t: Track, level: number) {
  const r = rewardsOf(t)[level];
  const got = levelOf(t).level >= level;
  const head = `<header><b>LV${level}</b><span>${r?.name ?? '???'}</span><em>${got ? 'UNLOCKED' : 'LOCKED'}</em></header>`;
  if (!r) return `${head}<p>COMING SOON</p>`;
  // どこで解放されるか（もらったものにも）を下に添える
  const req = `<p class="lv-tip-req">LV${level} 到達でアンロック</p>`;
  if (r.kind === 'card')
    return head +
      tipRow('BACKGROUND', (r.backgrounds ?? []).map((id) => tipItem(partSwatch(id, 'standard'), BACKGROUNDS.find((b) => b.id === id)!.name))) +
      tipRow('FRAME', (r.frames ?? []).map((id) => tipItem(partSwatch('plain', id), FRAMES.find((f) => f.id === id)!.name))) +
      req;
  // エンブレムと称号: 今のプレイヤーカードにそれを付けた見本を出す
  if (r.kind === 'emblem' && t !== 'player')
    return `${head}<p>プレイヤーカードのエンブレムにこの武器のアイコンを使える</p><figure class="lv-tip-card">${cardPreviewHtml({ emblem: t })}</figure>${req}`;
  if (r.kind === 'title') {
    const title = TITLES.find((h) => h.id === r.title);
    const desc = title?.ja ? `称号「${title.name}」（${title.ja}）をプレイヤーカードに付けられる` : `称号「${r.name}」をプレイヤーカードに付けられる`;
    return `${head}<p>${desc}</p>${title ? `<figure class="lv-tip-card">${cardPreviewHtml({ title: title.id })}</figure>` : ''}${req}`;
  }
  if (r.kind === 'emblem') return `${head}<p>PLAYER CARD EMBLEM</p>${req}`;
  if (r.kind === 'badge') return `${head}<p>PLAYER CARD BADGE</p>${req}`;
  // スキン: 選択画面と同じ台。回して見せる武器は、出したあとに差し込む（showSkinSpin）
  if (r.kind === 'skin') {
    const skin = skinOfReward(t, r);
    return `${head}<div class="sk-stage lv-tip-skin"><span class="sk-tag"><i></i>PREVIEW</span><span class="sk-feats">${skin ? skinTagsHtml(skin) : ''}</span></div>${req}`;
  }
  return head + req;
}
const skinOfReward = (t: Track, r: MasteryReward) => (t === 'player' ? undefined : SKINS.find((s) => s.id === r.skin && s.weapons?.includes(t)));
// スキンのご褒美なら、台に武器を差し込んで回し始める
function showSkinSpin(t: Track, level: number) {
  const r = rewardsOf(t)[level];
  const skin = r && skinOfReward(t, r);
  const stage = tip.querySelector('.lv-tip-skin');
  if (skin && stage && t !== 'player') stage.prepend(startSkinSpin(t, skin));
}
function hideTip() {
  tipCard = null;
  tip.classList.remove('on');
  stopSkinSpin();
}
overlay.addEventListener('mouseover', (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>('.lv-card[data-lv]');
  if (c === tipCard) return;
  if (!c) return hideTip();
  tipCard = c;
  stopSkinSpin();
  tip.innerHTML = tipHtml(c.dataset.track as Track, Number(c.dataset.lv));
  tip.classList.add('on');
  showSkinSpin(c.dataset.track as Track, Number(c.dataset.lv));
  const r = c.getBoundingClientRect();
  const gap = 10;
  let top = r.top - tip.offsetHeight - gap;
  if (top < gap) top = r.bottom + gap;
  tip.style.left = `${Math.min(Math.max(gap, r.left + r.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - gap)}px`;
  tip.style.top = `${top}px`;
});

// 次に貰えるご褒美のカードを出す（武器を選ぶたびと、ロードマップを開くとき）
export function showNextReward(t: Track) {
  let next = levelOf(t).level + 1;
  while (rewardAt(t, next) === undefined) next++;
  for (const goal of goals) goal.querySelector('.lv-card')!.outerHTML = card(next, false, t);
}
export const lvOpen = () => overlay.classList.contains('pick-lv');
export function openLv(id: WeaponId, name: string, onClose: () => void) {
  sfx.playUiOpen();
  done = onClose;
  overlay.classList.add('pick-lv');
  renderRoadmap(win, id, name);
}
// 武器の台・今のレベル・ゲージと、レベルの節を root の中に入れる（武器の選択画面の窓と、PLAY のタブの ROADMAP で使う）。
// root は見えている状態で呼ぶ（今の節まで流すのに幅が要る）
function renderRoadmap(root: HTMLElement, t: Track, name: string) {
  const track = root.querySelector<HTMLElement>('.lv-track')!;
  const sum = root.querySelector<HTMLElement>('.lv-sum')!;
  const m = levelOf(t);
  // 上: 武器の台・今のレベル・次までのゲージ・次のご褒美のカード
  const label = root.querySelector('.lv-weapon');
  if (label) label.textContent = name;
  sum.querySelector('.ic')!.replaceChildren(trackIcon(t));
  sum.querySelector('.lv-no b')!.textContent = String(m.level);
  sum.querySelector('.lv-xp')!.textContent = `${fmtXp(m.into)} / ${fmtXp(m.need)} XP`;
  sum.querySelector('.lv-next')!.textContent = `LV${m.level + 1}`;
  sum.style.setProperty('--xp', String(m.into / m.need));
  showNextReward(t);
  // 下: レベルの節
  const last = Math.max(ROADMAP_LEVELS, m.level + ROADMAP_AHEAD);
  track.replaceChildren();
  let now: HTMLElement | null = null;
  for (let l = 1; l <= last; l++) {
    const node = document.createElement('div');
    node.className = 'lv-node';
    node.classList.toggle('done', l <= m.level);
    node.classList.toggle('now', l === m.level);
    node.style.setProperty('--i', String(Math.max(0, l - m.level + 4))); // 今のあたりから順に差し込む
    node.title = `LV${l} — ${fmtXp(toReach(t, l))} XP`;
    // 線は届いた節の先なら塗り切り、今の節の先は次までの割合だけ
    const fill = l < m.level ? 1 : l === m.level ? m.into / m.need : 0;
    const reward = rewardAt(t, l);
    node.innerHTML =
      (l < last ? `<span class="lv-seg" style="--fill:${fill}"></span>` : '') +
      // ご褒美のある節は、印の代わりにご褒美のカードを線の上に置く
      `<b>${l}</b>` +
      (reward !== undefined
        ? card(l, l <= m.level, t) + `<small class="lv-rw">${reward?.name ?? '???'}${reward ? `<i>${KIND_LABEL[reward.kind]}</i>` : ''}</small>`
        : `<span class="lv-mark">${CHECK}</span>`);
    track.appendChild(node);
    if (l === m.level) now = node;
  }
  // 今の節が左から 3 分の 1 ほどに来るよう流す
  if (now) track.scrollLeft = now.offsetLeft - track.clientWidth / 3;
}
export function closeLv(quiet = false) {
  if (!lvOpen()) return;
  if (!quiet) sfx.playUiBack();
  overlay.classList.remove('pick-lv');
  hideTip();
  done?.();
  done = null;
}
const stepTrack = (dir: number, track = win.querySelector<HTMLElement>('.lv-track')!) => {
  hideTip();
  const w = track.firstElementChild?.clientWidth ?? 0;
  track.scrollBy({ left: dir * w * 3, behavior: 'smooth' });
};
export function onLvClick(target: HTMLElement) {
  // 窓の外（靄）か BACK を押したら武器の選択画面へ戻る
  if (target.closest('[data-action="lv-close"]') || !target.closest('.lv-win')) closeLv();
}
export function onLvKey(e: KeyboardEvent) {
  switch (e.code) {
    case 'Escape':
    case 'KeyQ':
    case 'Enter':
      e.preventDefault();
      return closeLv();
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      return stepTrack(-1);
    case 'ArrowRight':
    case 'PageDown':
      e.preventDefault();
      return stepTrack(1);
  }
}
// ホイールは縦に回しても横に流す
export function onLvWheel(e: WheelEvent) {
  hideTip();
  win.querySelector<HTMLElement>('.lv-track')!.scrollLeft += e.deltaY + e.deltaX;
}

// ---- PLAY のタブの ROADMAP ----
// 先頭の人型（プレイヤーのレベル）と武器のアイコンを横に並べたタブで選び、そのロードマップを出す。開いたときは持ち込む武器を選んでおく
const tab = overlay.querySelector<HTMLElement>('.roadmap')!;
const tabTrack = tab.querySelector<HTMLElement>('.lv-track')!;
const tabKind = tab.querySelector<HTMLElement>('.rm-kind')!;
const weaponRows = [...overlay.querySelectorAll<HTMLElement>('.sw-rows [data-weapon]')];
const tabs: { t: Track; name: string }[] = [
  { t: 'player', name: 'PLAYER' },
  ...weaponRows.map((r) => ({ t: r.dataset.weapon as WeaponId, name: r.dataset.name ?? '' })),
];
const weaponTabs = tab.querySelector<HTMLElement>('.rm-weapons')!;
for (const { t, name } of tabs) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.rmWeapon = t;
  b.title = name;
  b.setAttribute('aria-label', b.title);
  const plate = Object.assign(document.createElement('span'), { className: 'sw-plate' });
  plate.appendChild(Object.assign(document.createElement('span'), { className: 'ic' })).appendChild(trackIcon(t));
  b.appendChild(plate);
  weaponTabs.appendChild(b);
}
const weaponButtons = [...weaponTabs.querySelectorAll<HTMLElement>('[data-rm-weapon]')];
let tabIndex = 0;
function showTabWeapon(i: number) {
  tabIndex = i;
  weaponButtons.forEach((b, j) => b.classList.toggle('active', j === i));
  const { t, name } = tabs[i];
  tabKind.innerHTML = t === 'player' ? 'PLAYER<b>LEVEL</b>' : 'WEAPON<b>MASTERY</b>';
  renderRoadmap(tab, t, name);
}
export function openRoadmapTab(id: WeaponId) {
  overlay.classList.add('select-roadmap');
  showTabWeapon(Math.max(0, tabs.findIndex((x) => x.t === id)));
}
export function closeRoadmapTab() {
  overlay.classList.remove('select-roadmap');
  hideTip();
}
// 押したものがロードマップのタブの中なら受け持つ
export function onRoadmapClick(target: HTMLElement) {
  const b = target.closest<HTMLElement>('[data-rm-weapon]');
  if (!b) return;
  const i = weaponButtons.indexOf(b);
  if (i === tabIndex) return;
  sfx.playUiHover();
  showTabWeapon(i);
}
// 左右で武器を替え（端で反対の端へ回る）、上下で節を流す
export function onRoadmapKey(e: KeyboardEvent) {
  const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.code];
  if (dir) {
    e.preventDefault();
    sfx.playUiHover();
    return showTabWeapon((tabIndex + dir + weaponButtons.length) % weaponButtons.length);
  }
  const scroll = { ArrowUp: -1, ArrowDown: 1 }[e.code];
  if (scroll) {
    e.preventDefault();
    stepTrack(scroll, tabTrack);
  }
}
// ホイールは縦に回しても横に流す
tabTrack.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    hideTip();
    tabTrack.scrollLeft += e.deltaY + e.deltaX;
  },
  { passive: false },
);

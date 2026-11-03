import * as sfx from '../audio.js';
import { WEAPON_IDS, type WeaponId } from '../weapons/ids.js';
import { EMBLEM_LEVEL, cardPartLevel, loadXp, masteryOf, playerMastery } from '../mastery.js';
import { LOCK, PLAYER_MARK, initCardPreview } from './lvRoadmap.js';
import { OWNER } from '../weapons/skins.js';
import { BACKGROUNDS, FRAMES, FRAME_PARTS, baseClass } from './cardParts.js';
import { TIER_NAMES, bonusGroupOf, groupDone } from '../challenges.js';
import { BADGES, BADGE_SLOTS, TITLES, WEAPON_NAMES, badgePlate, unlockHint, unlocked, type Badge, type Honor } from './cardHonors.js';
import { allBests } from '../records.js';
import { NEW_TAG, isNew, markSeen, seedSeen } from './newMarks.js';

// ---- プレイヤーカード ----
// 名前・称号・エンブレム・バッジ（3 つまで）・背景・フレーム・載せる記録（3 つ）を選んで、自分のカードを作る。
// PLAY の上のタブ LOCKER で作り、タイトル画面の右に出す（出すかどうかはオプション）。
// 武器のエンブレムは、その武器の熟練度が EMBLEM_LEVEL に届くと選べる。背景とフレームは、プレイヤーのレベルのご褒美（mastery.ts の PLAYER_REWARDS）で解放する。
// 称号とバッジは、レベルか記録で解放する（ui/cardHonors.ts）。
// どれもスキンと同じく、作者の手元と ?devmode では全部選べる。記録は全部選べる
const CARD_STORE = 'fast-finish.card';
const NAME_MAX = 12;
const STAT_SLOTS = 3;

// エンブレム。初めは人型（24 四方で描く）で、ほかは武器（右下の HUD のアイコンを写す）。武器のものは熟練度で解放する
type Emblem = 'player' | WeaponId;
const EMBLEMS: Emblem[] = ['player', ...WEAPON_IDS];
const emblemOpen = (e: Emblem) => OWNER || e === 'player' || masteryOf(loadXp(e)).level >= EMBLEM_LEVEL;

// 背景とフレームが選べるか（プレイヤーのレベルで解放する）
type Part = 'background' | 'frame';
// チャレンジの追加のご褒美のフレームは、その見出しのミッションの達成数で開く（challenges.ts の MissionGroup.bonus）
function partOpen(kind: Part, id: string) {
  if (OWNER) return true;
  const g = kind === 'frame' ? bonusGroupOf(id) : undefined;
  return g ? groupDone(g.id) >= g.bonus!.need : playerMastery().level >= cardPartLevel(kind, id);
}
const honorOpen = (h: Honor) => OWNER || unlocked(h.unlock);
const titleOf = (id: string) => TITLES.find((t) => t.id === id);
const badgeOf = (id: string) => BADGES.find((b) => b.id === id);

// 載せる記録。熟練度と自己ベストから数える
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
function mainWeapon() {
  let best: WeaponId = WEAPON_IDS[0];
  for (const w of WEAPON_IDS) if (loadXp(w) > loadXp(best)) best = w;
  return best;
}
interface Stat { id: string; label: string; value: () => string }
const STATS: Stat[] = [
  { id: 'playerLv', label: 'PLAYER LV', value: () => String(playerMastery().level) },
  { id: 'totalLv', label: 'TOTAL LV', value: () => String(WEAPON_IDS.reduce((s, w) => s + masteryOf(loadXp(w)).level, 0)) },
  { id: 'main', label: 'MAIN WEAPON', value: () => { const w = mainWeapon(); return `${WEAPON_NAMES[w]} ${masteryOf(loadXp(w)).level}`; } },
  { id: 'bestScore', label: 'BEST SCORE', value: () => { const b = allBests(); return b.length ? fmt(Math.max(...b.map((x) => x.score))) : '—'; } },
  { id: 'clears', label: 'CLEARS', value: () => String(allBests().length) },
  { id: 'hardClears', label: 'HARD CLEARS', value: () => String(allBests().filter((b) => b.difficulty === 'hard').length) },
  { id: 'totalXp', label: 'TOTAL XP', value: () => fmt(WEAPON_IDS.reduce((s, w) => s + loadXp(w), 0)) },
];

interface CardData { name: string; title: string; emblem: Emblem; badges: string[]; bg: string; frame: string; stats: string[] }
const DEFAULT_CARD: CardData = { name: 'PLAYER', title: 'rookie', emblem: 'player', badges: [], bg: 'plain', frame: 'standard', stats: ['totalLv', 'main', 'bestScore'] };
const card: CardData = { ...DEFAULT_CARD };
try {
  const saved = JSON.parse(localStorage.getItem(CARD_STORE) ?? '{}');
  if (typeof saved.name === 'string') card.name = saved.name.slice(0, NAME_MAX);
  const title = titleOf(saved.title);
  if (title && honorOpen(title)) card.title = title.id;
  if (Array.isArray(saved.badges)) card.badges = saved.badges.filter((id: string) => { const b = badgeOf(id); return b && honorOpen(b); }).slice(0, BADGE_SLOTS);
  if (EMBLEMS.includes(saved.emblem) && emblemOpen(saved.emblem)) card.emblem = saved.emblem;
  if (BACKGROUNDS.some((b) => b.id === saved.bg) && partOpen('background', saved.bg)) card.bg = saved.bg;
  if (FRAMES.some((f) => f.id === saved.frame) && partOpen('frame', saved.frame)) card.frame = saved.frame;
  if (Array.isArray(saved.stats)) card.stats = saved.stats.filter((s: unknown) => STATS.some((st) => st.id === s)).slice(0, STAT_SLOTS);
} catch {
  // 読めなければ初期のカード
}
function saveCard() {
  try {
    localStorage.setItem(CARD_STORE, JSON.stringify(card));
  } catch {
    // 保存できなくても、この回の間は効いている
  }
}

// ---- カードの組み立て ----
const weaponIcon = (w: WeaponId) => {
  const svg = document.querySelector(`#weapon .icon svg[data-w="${w}"]`)!.cloneNode(true) as SVGElement;
  svg.setAttribute('class', 'on');
  return svg.outerHTML;
};
const emblemHtml = (e: Emblem) =>
  e === 'player'
    ? `<span class="sw-plate pc-plate"><svg class="pc-mark" viewBox="0 0 24 24" aria-hidden="true">${PLAYER_MARK}</svg></span>`
    : `<span class="sw-plate pc-plate"><span class="ic">${weaponIcon(e)}</span></span>`;
// 名前から決まるカードの番号（飾り）
const cardNo = (name: string) => {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 10000;
  return String(h).padStart(4, '0');
};
// バッジの絵（cardHonors.ts の icon）を六角形の台に載せる
const badgeHtml = (b: Badge) => badgePlate(b);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
function cardHtml(c: CardData = card) {
  const stats = c.stats.map((id) => STATS.find((s) => s.id === id)!);
  const title = c.title === 'none' ? undefined : titleOf(c.title);
  return `<div class="${baseClass(c.bg, c.frame)}">
    ${FRAME_PARTS}
    <span class="pc-tag">PLAYER CARD</span><span class="pc-no">No.${cardNo(c.name)}</span>
    <div class="pc-main">
      ${emblemHtml(c.emblem)}
      <div class="pc-id">
        <b class="pc-name">${esc(c.name.trim() || 'PLAYER')}</b>
        <div class="pc-sub">
          ${title ? `<small class="pc-title"><span>${title.name}</span>${title.ja ? `<i class="pc-title-ja">${title.ja}</i>` : ''}</small>` : ''}
          <span class="pc-badges">${c.badges.map((id) => badgeHtml(badgeOf(id)!)).join('')}</span>
        </div>
      </div>
    </div>
    <div class="pc-stats">${stats.map((s) => `<div><small>${s.label}</small><b>${s.value()}</b></div>`).join('')}</div>
  </div>`;
}
// 初めのカードのエンブレムか称号だけを差し替えた見本（ロードマップのご褒美の中身に出す）。何が手に入るかがひと目でわかるよう、ほかは初めのまま
initCardPreview((over) => cardHtml({ ...DEFAULT_CARD, ...over }));
const overlay = document.getElementById('overlay')!;
const cardHolders = [...overlay.querySelectorAll<HTMLElement>('[data-player-card]')];
const lockerCard = overlay.querySelector<HTMLElement>('.lk-preview')!;
// ロッカーで部品を変えたときの見本の動き。card は背景・フレームで、前のカードの上を斜めの線が左から右へ走り、線の左が新しいカードになる。
// emblem はエンブレムの台が弾んで入れ替わり、stats は記録の欄が左から順に入る。title は称号が左から滑り込み、badge はバッジが弾んで入る。
// 見た目は index.html の .pc-swap / .pc-pop / .pc-restat / .pc-retitle / .pc-rebadge
type Swap = 'card' | 'emblem' | 'stats' | 'title' | 'badge';
const SWAP_CLASS: Partial<Record<Swap, string>> = { emblem: 'pc-pop', stats: 'pc-restat', title: 'pc-retitle', badge: 'pc-rebadge' };
export function refreshCards(swap?: Swap) {
  const html = cardHtml();
  for (const holder of cardHolders) {
    if (holder === lockerCard && swap === 'card') {
      const old = holder.querySelector('.pc-new .pcard') ?? holder.querySelector('.pcard');
      holder.innerHTML = `<div class="pc-old"></div><div class="pc-new">${html}</div><i class="pc-slash"><b></b></i>`;
      if (old) holder.firstElementChild!.append(old);
    } else holder.innerHTML = html;
    if (holder === lockerCard && swap && SWAP_CLASS[swap]) holder.firstElementChild!.classList.add(SWAP_CLASS[swap]!);
  }
}

// ---- ロッカー ----
// 左にカードを大きく、右に部品の種類のタブとその一覧。選んだらすぐカードに映して覚える
const locker = overlay.querySelector<HTMLElement>('.locker')!;
const nameInput = locker.querySelector<HTMLInputElement>('[data-card-name]')!;
const cats = [...locker.querySelectorAll<HTMLElement>('.lk-cats [data-cat]')];
const panes = [...locker.querySelectorAll<HTMLElement>('.lk-pane')];
const pane = (cat: string) => panes.find((p) => p.dataset.pane === cat)!;
pane('emblem').innerHTML = EMBLEMS.map(
  (e) => `<button type="button" class="lk-item lk-emblem" data-emblem="${e}">${emblemHtml(e)}${NEW_TAG}${e === 'player' ? '' : `${LOCK}<small class="lk-req">LV${EMBLEM_LEVEL}</small>`}</button>`,
).join('');
// 背景とフレームの見本は、もう片方に今選んでいるものを使って見せる（renderLocker で class を入れ替える）
// まだ解放していないものは、エンブレムと同じく南京錠と要るレベルを添える
// チャレンジでもらうフレームは、要るレベルの代わりに見出しの名前と数を添える
const swatch = (data: string, name: string, req: string) =>
  `<button type="button" class="lk-item lk-bg" ${data}><span class="pcard">${FRAME_PARTS}</span><small>${name}</small>${NEW_TAG}${req ? `${LOCK}<small class="lk-req">${req}</small>` : ''}</button>`;
const lvReq = (lv: number) => (lv ? `LV${lv}` : '');
const frameReq = (id: string) => {
  const g = bonusGroupOf(id);
  return g ? `${g.name} ×${g.bonus!.need}` : lvReq(cardPartLevel('frame', id));
};
pane('bg').innerHTML = BACKGROUNDS.map((b) => swatch(`data-bg="${b.id}"`, b.name, lvReq(cardPartLevel('background', b.id)))).join('');
pane('frame').innerHTML = FRAMES.map((f) => swatch(`data-frame="${f.id}"`, f.name, frameReq(f.id))).join('');
// 称号は記録と同じ一覧。まだ解放していないものは、右に条件を添える
pane('title').innerHTML = TITLES.map((t) => `<button type="button" class="lk-item lk-stat lk-title" data-title="${t.id}"><b>${t.name}</b>${t.ja ? `<i class="lk-ja">${t.ja}</i>` : ''}<small>${unlockHint(t.unlock)}</small>${NEW_TAG}</button>`).join('');
// バッジは台と名前。まだ解放していないものは、南京錠と、名前の下に条件を添える
pane('badge').innerHTML = BADGES.map(
  (b) => `<button type="button" class="lk-item lk-bg lk-badge" data-badge="${b.id}">${badgeHtml(b)}<small>${b.name}<i class="lk-tier">${TIER_NAMES[b.tier - 1]}</i></small><small class="lk-hint">${unlockHint(b.unlock)}</small>${NEW_TAG}${LOCK}</button>`,
).join('');
pane('stats').innerHTML = STATS.map((s) => `<button type="button" class="lk-item lk-stat" data-stat="${s.id}"><em></em><b>${s.label}</b><small></small></button>`).join('');
nameInput.maxLength = NAME_MAX;

// まだ触っていない部品に NEW を付け、それを含む種類のボタンと PLAY のタブ LOCKER にも付ける（ui/newMarks.ts）
const items = [...locker.querySelectorAll<HTMLElement>('.lk-item')];
const lockerTab = overlay.querySelector<HTMLElement>('.play-tabs [data-tab="locker"]')!;
for (const b of [...cats, lockerTab]) b.insertAdjacentHTML('beforeend', NEW_TAG);
const KEYED = ['title', 'badge', 'emblem', 'bg', 'frame'] as const;
const itemKey = (b: HTMLElement) => {
  const k = KEYED.find((k) => b.dataset[k]);
  return k && `${k}:${b.dataset[k]}`;
};
function itemOpen(b: HTMLElement) {
  const { title, badge, emblem, bg, frame } = b.dataset;
  if (title) return honorOpen(titleOf(title)!);
  if (badge) return honorOpen(badgeOf(badge)!);
  if (emblem) return emblemOpen(emblem as Emblem);
  if (bg) return partOpen('background', bg);
  return !!frame && partOpen('frame', frame);
}
seedSeen(items.filter(itemOpen).map((b) => itemKey(b)!).filter(Boolean));
export function showLockerNew() {
  for (const b of items) {
    const key = itemKey(b);
    b.classList.toggle('is-new', !!key && isNew(key, itemOpen(b)));
  }
  for (const c of cats) c.classList.toggle('is-new', !!pane(c.dataset.cat!).querySelector('.is-new'));
  lockerTab.classList.toggle('is-new', items.some((b) => b.classList.contains('is-new')));
}
// カーソルを合わせたか押したら、触ったことにする
function touch(b: HTMLElement) {
  const key = itemKey(b);
  if (key && itemOpen(b) && markSeen(key)) showLockerNew();
}
locker.addEventListener('pointerover', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.lk-item');
  if (b) touch(b);
});

function renderLocker(swap?: Swap) {
  for (const b of locker.querySelectorAll<HTMLElement>('[data-emblem]')) {
    b.classList.toggle('active', b.dataset.emblem === card.emblem);
    b.classList.toggle('locked', !emblemOpen(b.dataset.emblem as Emblem));
  }
  for (const b of locker.querySelectorAll<HTMLElement>('[data-title]')) {
    b.classList.toggle('active', b.dataset.title === card.title);
    b.classList.toggle('locked', !honorOpen(titleOf(b.dataset.title!)!));
  }
  for (const b of locker.querySelectorAll<HTMLElement>('[data-badge]')) {
    b.classList.toggle('active', card.badges.includes(b.dataset.badge!));
    b.classList.toggle('locked', !honorOpen(badgeOf(b.dataset.badge!)!));
  }
  for (const b of locker.querySelectorAll<HTMLElement>('[data-bg]')) {
    b.classList.toggle('active', b.dataset.bg === card.bg);
    b.classList.toggle('locked', !partOpen('background', b.dataset.bg!));
    b.querySelector('.pcard')!.className = baseClass(b.dataset.bg!, card.frame);
  }
  for (const b of locker.querySelectorAll<HTMLElement>('[data-frame]')) {
    b.classList.toggle('active', b.dataset.frame === card.frame);
    b.classList.toggle('locked', !partOpen('frame', b.dataset.frame!));
    b.querySelector('.pcard')!.className = baseClass(card.bg, b.dataset.frame!);
  }
  for (const b of locker.querySelectorAll<HTMLElement>('[data-stat]')) {
    const i = card.stats.indexOf(b.dataset.stat!);
    b.classList.toggle('active', i >= 0);
    b.querySelector('em')!.textContent = i >= 0 ? String(i + 1) : '';
    b.querySelector('small')!.textContent = STATS.find((s) => s.id === b.dataset.stat)!.value();
  }
  showLockerNew();
  refreshCards(swap);
}
function showCat(cat: string) {
  cats.forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
  panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === cat));
}
function changed(swap: Swap) {
  saveCard();
  renderLocker(swap);
  sfx.playUiSelect();
}
export function openLocker() {
  overlay.classList.add('select-locker');
  nameInput.value = card.name;
  renderLocker();
}
export function closeLocker() {
  overlay.classList.remove('select-locker');
  nameInput.blur();
  showLockerNew();
}
// 押したものがロッカーの中なら受け持つ
export function onLockerClick(target: HTMLElement) {
  const cat = target.closest<HTMLElement>('[data-cat]');
  if (cat) {
    if (!cat.classList.contains('active')) sfx.playUiHover();
    return showCat(cat.dataset.cat!);
  }
  const item = target.closest<HTMLElement>('.lk-item');
  if (!item) return;
  touch(item);
  const { title, badge, emblem, bg, frame, stat } = item.dataset;
  if (title) {
    if (!honorOpen(titleOf(title)!)) return sfx.playUiDenied();
    card.title = title;
  } else if (badge) {
    // バッジは 3 つまで。押した順に並べ、もう一度押すと外す
    if (!honorOpen(badgeOf(badge)!)) return sfx.playUiDenied();
    const i = card.badges.indexOf(badge);
    if (i >= 0) card.badges.splice(i, 1);
    else if (card.badges.length >= BADGE_SLOTS) return sfx.playUiDenied();
    else card.badges.push(badge);
  } else if (emblem) {
    if (!emblemOpen(emblem as Emblem)) return sfx.playUiDenied();
    card.emblem = emblem as Emblem;
  }
  else if (bg) {
    if (!partOpen('background', bg)) return sfx.playUiDenied();
    card.bg = bg;
  } else if (frame) {
    if (!partOpen('frame', frame)) return sfx.playUiDenied();
    card.frame = frame;
  }
  else if (stat) {
    // 載せる記録は 3 つまで。押した順に並べ、もう一度押すと外す
    const i = card.stats.indexOf(stat);
    if (i >= 0) card.stats.splice(i, 1);
    else if (card.stats.length >= STAT_SLOTS) return sfx.playUiDenied();
    else card.stats.push(stat);
  }
  changed(title ? 'title' : badge ? 'badge' : emblem ? 'emblem' : stat ? 'stats' : 'card');
}
nameInput.addEventListener('input', () => {
  card.name = nameInput.value.slice(0, NAME_MAX);
  saveCard();
  refreshCards();
});
nameInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Escape') nameInput.blur();
  e.stopPropagation(); // 名前を打っている間は、メニューのキー操作に渡さない
});
showCat('name');
showLockerNew();
refreshCards();

import * as sfx from '../audio.js';
import type { WeaponId } from '../weapons/ids.js';
import { skinOf } from '../weapons/skins.js';
import { loadXp, masteryOf } from '../mastery.js';
import { options, type Quality } from './options.js';
import { closeSkin, onSkinClick, onSkinKey, openSkin, skinOpen } from './skinPicker.js';

// ---- 武器の選択画面 ----
const overlay = document.getElementById('overlay')!;
// 持ち込む武器。ステージに入ったときにこれを構えている（中で持ち替えることはできる）。次に開いたときのために覚えておく
const LOADOUT_STORE = 'fast-finish.weapon';
// 詳細の欄には今の武器を 1 行で出し、押すと武器の選択画面を開く。選択画面では上下左右・マウスを乗せる・ホイールでカーソルを動かして
// グリッドのタイルを選択状態にする。クリックで持ち替えて（EQUIPPED の印が移る）右に大きく見せる。決定で詳細の欄へ戻す。
// 上下左右のキーはカーソルと持ち替えを一緒に動かす。名前と和名は選択画面のタイルから写す
const loadoutSlot = overlay.querySelector<HTMLElement>('.si-weapon .sw-slot')!;
const picker = overlay.querySelector<HTMLElement>('.sw-picker')!;
const pickerRows = [...picker.querySelectorAll<HTMLElement>('.sw-rows [data-weapon]')];
const pickerPreview = picker.querySelector<HTMLElement>('.sw-preview')!;
const LOADOUT_IDS = pickerRows.map((b) => b.dataset.weapon as WeaponId);
// 右下の HUD のアイコンを写して、入れ物に武器の数だけ入れる（見せるものだけ on にする）
const cloneWeaponIcon = (id: WeaponId) => {
  const svg = document.querySelector(`#weapon .icon svg[data-w="${id}"]`)!.cloneNode(true) as SVGElement;
  svg.removeAttribute('class');
  return svg;
};
const fillIcons = (box: Element) => LOADOUT_IDS.map((id) => box.appendChild(cloneWeaponIcon(id)));
const showIcon = (icons: SVGElement[], i: number) => icons.forEach((svg, j) => svg.classList.toggle('on', j === i));
pickerRows.forEach((b, i) => showIcon(fillIcons(b.querySelector('.ic')!), i));
const slotIcons = fillIcons(loadoutSlot.querySelector('.ic')!);
const previewIcons = fillIcons(pickerPreview.querySelector('.ic')!);
const setName = (el: Element, i: number) => {
  el.querySelector('.nm')!.textContent = pickerRows[i].dataset.name ?? '';
  el.querySelector('.ja')!.textContent = pickerRows[i].dataset.ja ?? '';
};
let loadoutIndex = 0; // 持ち込むと決めた武器
let pickerIndex = 0; // 選択画面のカーソル
let pickedIndex = 0; // 選択画面で選んだ武器。右に大きく見せ、決定したら持ち込む（BACK なら捨てる）
try {
  const saved = LOADOUT_IDS.indexOf(localStorage.getItem(LOADOUT_STORE) as WeaponId);
  if (saved >= 0) loadoutIndex = saved;
} catch {
  // 保存できない環境では毎回クナイから
}
export const selectedLoadout = () => LOADOUT_IDS[loadoutIndex];
export const pickerOpen = () => overlay.classList.contains('pick-weapon');
function selectLoadout(i: number) {
  loadoutIndex = i;
  showIcon(slotIcons, i);
  setName(loadoutSlot, i);
  try {
    localStorage.setItem(LOADOUT_STORE, selectedLoadout());
  } catch {
    // 覚えられなくても選ぶことはできる
  }
}
// プレビュー動画: previews/<武器>.mp4 を音なしで繰り返し流す。読めるまで（無ければずっと）NO SIGNAL の画面を出す
const PREVIEW_VIDEO_DIR = 'previews';
const pickerScreen = pickerPreview.querySelector<HTMLElement>('.sw-video')!;
const pickerVideo = pickerScreen.querySelector('video')!;
const pickerNoSignal = pickerScreen.querySelector<HTMLElement>('.sw-nosig small')!;
pickerVideo.addEventListener('loadeddata', () => pickerScreen.classList.add('has-video'));
pickerVideo.addEventListener('error', () => pickerScreen.classList.remove('has-video'));
// 背景: 手前の動画の新しいフレームが出るたびに canvas へ写す（2 本目の動画を流すとずれるので、同じ動画から写す）。
// 小さく写してその中でぼかし、画面いっぱいに引き伸ばす（全画面に CSS でぼかすより軽い）。大きさは画質の設定に合わせる
const PICKER_BG_WIDTH: Record<Quality, number> = { low: 96, medium: 160, high: 320 };
const pickerBg = picker.querySelector<HTMLCanvasElement>('.sw-bg')!;
const pickerBgCtx = pickerBg.getContext('2d')!;
function drawPickerBg() {
  if (pickerVideo.readyState < 2) return;
  const w = PICKER_BG_WIDTH[options.quality];
  if (pickerBg.width !== w) {
    pickerBg.width = w;
    pickerBg.height = Math.round((w * 9) / 16);
  }
  pickerBgCtx.filter = `blur(${w / 240}px)`; // 大きさを変えると消えるので毎回掛ける。効かないブラウザでも引き伸ばしで粗さはぼける
  pickerBgCtx.drawImage(pickerVideo, 0, 0, pickerBg.width, pickerBg.height);
}
const onPickerFrame = () => {
  drawPickerBg();
  pickerVideo.requestVideoFrameCallback(onPickerFrame);
};
pickerVideo.requestVideoFrameCallback(onPickerFrame);
pickerVideo.addEventListener('loadeddata', () => {
  drawPickerBg();
  pickerBg.classList.add('has-video');
});
pickerVideo.addEventListener('error', () => pickerBg.classList.remove('has-video'));
function showPickerVideo(id: WeaponId) {
  const src = `${PREVIEW_VIDEO_DIR}/${id}.mp4`;
  pickerNoSignal.textContent = src;
  if (pickerVideo.dataset.id === id) return;
  pickerVideo.dataset.id = id;
  pickerScreen.classList.remove('has-video');
  pickerBg.classList.remove('has-video');
  pickerVideo.src = src;
  playPickerVideos(); // 無いファイルや自動再生の拒否は NO SIGNAL のままにする
}
function playPickerVideos() {
  pickerVideo.play().catch(() => {});
}
function pausePickerVideos() {
  pickerVideo.pause();
}
// 差し込んだ武器名とアイコンの尾。着くまでは伸ばしたまま、着いたら一気に巻き取る（CSS の sw-in-smear / sw-in-ic と同じ長さ・同じ着く時刻）
const SMEAR_TIME = 0.3;
const SMEAR_LAND = 0.22;
const pickerName = pickerPreview.querySelector<HTMLElement>('.nm')!;
const pickerIcon = pickerPreview.querySelector<HTMLElement>('.ic')!;
const smearDilates = [...document.querySelectorAll<SVGElement>(':is(#sw-smear, #sw-smear-ic) feMorphology')];
const smearOffsets = [...document.querySelectorAll<SVGElement>(':is(#sw-smear, #sw-smear-ic) feOffset')];
let smearRun = 0;
function smearPicker(dir: number) {
  const run = ++smearRun;
  const len = parseFloat(getComputedStyle(pickerName).fontSize) * 0.24; // 尾の長さ（文字の高さに対して）
  const start = performance.now();
  pickerName.style.filter = 'url(#sw-smear)';
  pickerIcon.style.filter = 'url(#sw-smear-ic)';
  const step = (now: number) => {
    if (run !== smearRun) return;
    const t = (now - start) / 1000 / SMEAR_TIME;
    if (t >= 1) {
      pickerName.style.filter = ''; // 止まったら素の文字に戻す
      pickerIcon.style.filter = '';
      return;
    }
    const k = t < SMEAR_LAND ? 1 : 2 ** (-10 * ((t - SMEAR_LAND) / (1 - SMEAR_LAND)));
    const r = (len * k) / 2;
    // 段ごとに data-len の割合だけ伸ばす。下から来たら下へ、上から来たら上へ尾を引く
    for (const el of smearDilates) el.setAttribute('radius', `0 ${r * Number(el.dataset.len)}`);
    for (const el of smearOffsets) el.setAttribute('dy', String((dir > 0 ? r : -r) * Number(el.dataset.len)));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// スキン: 右の下に、選んだ武器の今のスキンを 1 行で出す。押すと（E / パッドの X）スキンの選択画面を開き、閉じたら出し直す
const skinSlot = pickerPreview.querySelector<HTMLElement>('.sw-skin')!;
const skinSlotSwatch = [...skinSlot.querySelectorAll<HTMLElement>('.sk-swatch i')];
function showSkinSlot(i: number) {
  const skin = skinOf(LOADOUT_IDS[i]);
  skinSlot.querySelector('.sk-nm')!.textContent = skin.name;
  skinSlotSwatch.forEach((el, j) => (el.style.background = skin.swatch[j]));
}
function openSkinPicker() {
  const i = pickedIndex;
  // スキンの選択画面では動画を止め、背景にも流さない（CSS の pick-skin で背景を消す）。戻ったら続きから
  pausePickerVideos();
  openSkin(LOADOUT_IDS[i], pickerRows[i].dataset.name ?? '', () => {
    showSkinSlot(i);
    resumePickerVideo();
  });
}
// 熟練度: タイルの右下に LV、右のスキンの欄の下に LV と次のレベルまでのゲージ。開くたびに読み直す（ステージで貯まるので）
const fmtXp = (n: number) => Math.round(n).toLocaleString('en-US');
const rowLevels = pickerRows.map((b) => b.appendChild(Object.assign(document.createElement('span'), { className: 'lv' })));
const lvSlot = pickerPreview.querySelector<HTMLElement>('.sw-lv')!;
function showRowLevels() {
  rowLevels.forEach((el, i) => (el.textContent = `LV${masteryOf(loadXp(LOADOUT_IDS[i])).level}`));
}
function showLvSlot(i: number) {
  const m = masteryOf(loadXp(LOADOUT_IDS[i]));
  lvSlot.querySelector('.lv-no b')!.textContent = String(m.level);
  lvSlot.querySelector('.lv-xp')!.textContent = `${fmtXp(m.into)} / ${fmtXp(m.need)} XP`;
  lvSlot.querySelector('.lv-next')!.textContent = `NEXT LV${m.level + 1}`;
  lvSlot.style.setProperty('--xp', String(m.into / m.need));
}
// カーソル（選択状態）だけを動かす。右の見せ方は変えない
function moveCursor(i: number) {
  pickerIndex = i;
  pickerRows.forEach((b, j) => b.classList.toggle('active', j === i));
}
// 持ち替えて右に大きく見せる。dir: 動いた向き（1 = 下へ, -1 = 上へ, 0 = 動きなし）。その向きから差し込む
function pickWeapon(i: number, dir = Math.sign(i - pickedIndex)) {
  pickedIndex = i;
  pickerRows.forEach((b, j) => b.classList.toggle('equipped', j === i));
  if (dir) {
    // 押した行を一度押し込む（続けて押しても頭から流し直す）
    pickerRows[i].classList.remove('pick-now');
    void pickerRows[i].offsetWidth;
    pickerRows[i].classList.add('pick-now');
  }
  showIcon(previewIcons, i);
  setName(pickerPreview, i);
  showSkinSlot(i);
  showLvSlot(i);
  showPickerVideo(LOADOUT_IDS[i]);
  pickerPreview.classList.remove('in-next', 'in-prev');
  if (dir) {
    void pickerPreview.offsetWidth; // 続けて動かしても頭から流し直す
    pickerPreview.classList.add(dir > 0 ? 'in-next' : 'in-prev');
    smearPicker(dir);
  }
}
// 端まで行ったら反対の端へ回る。pick: キーのときは持ち替えも一緒に（ホイールはカーソルだけ）
function stepPicker(dir: number, pick: boolean) {
  const i = (pickerIndex + dir + LOADOUT_IDS.length) % LOADOUT_IDS.length;
  goPicker(i, dir, pick);
}
// 一覧はグリッドなので、上下は 1 段ずつ動かす。同じ列の上端・下端まで行ったら、その列の反対の端へ回る。列の数は CSS から読む
const pickerGrid = picker.querySelector<HTMLElement>('.sw-rows')!;
function stepPickerRow(dir: number) {
  const cols = getComputedStyle(pickerGrid).gridTemplateColumns.split(' ').length;
  const n = LOADOUT_IDS.length;
  let i = pickerIndex + dir * cols;
  if (i < 0) i = pickerIndex % cols + Math.floor((n - 1 - (pickerIndex % cols)) / cols) * cols;
  else if (i >= n) i = pickerIndex % cols;
  goPicker(i, dir, true);
}
function goPicker(i: number, dir: number, pick: boolean) {
  sfx.playUiHover();
  moveCursor(i);
  if (pick) pickWeapon(i, dir);
}
// 閉じるときは pick-weapon をすぐ外し（入力はもう受けない）、pick-closing の間だけ窓を残して引っ込める
const CLOSE_TIME = 300; // 閉じる動きの長さ (ms)。CSS の pick-closing と合わせる
let closingTimer = 0;
function stopClosing() {
  clearTimeout(closingTimer);
  overlay.classList.remove('pick-closing');
}
export function openPicker() {
  sfx.playUiOpen();
  stopClosing();
  overlay.classList.add('pick-weapon');
  showRowLevels();
  moveCursor(loadoutIndex);
  pickWeapon(loadoutIndex, 0);
  resumePickerVideo();
}
// decide: 選んだ武器に決めて閉じる。false なら選び直さずに閉じる
function closePicker(decide: boolean) {
  if (!pickerOpen()) return;
  if (decide) {
    sfx.playUiSelect();
    selectLoadout(pickedIndex);
  } else {
    sfx.playUiBack();
  }
  overlay.classList.remove('pick-weapon');
  overlay.classList.add('pick-closing');
  closingTimer = window.setTimeout(() => {
    overlay.classList.remove('pick-closing');
    pausePickerVideos(); // 閉じている間は流さない（開いたら pickWeapon で続きから）
  }, CLOSE_TIME);
}
// 開き直したとき、同じ武器の動画は読み直さずに再開する
function resumePickerVideo() {
  if (pickerScreen.classList.contains('has-video')) playPickerVideos();
}
// 行に乗ったらカーソルをそこへ（音はメニュー共通の乗ったときの音が鳴る）
for (const [i, b] of pickerRows.entries()) b.addEventListener('mouseenter', () => i !== pickerIndex && moveCursor(i));
// 選択画面の上でホイールを回しても上下に動かす。トラックパッドの細かい連続を 1 つずつに均すため、動かしたら少し待つ
let pickerWheelAt = 0;
picker.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (skinOpen()) return; // スキンの選択画面では、そちらで受ける
    if (!e.deltaY || e.timeStamp - pickerWheelAt < 160) return;
    pickerWheelAt = e.timeStamp;
    stepPicker(Math.sign(e.deltaY), false);
  },
  { passive: false },
);
export function onPickerClick(target: HTMLElement) {
  if (skinOpen()) return onSkinClick(target);
  if (target.closest('[data-action="skin-open"]')) return openSkinPicker();
  const row = target.closest<HTMLElement>('.sw-rows [data-weapon]');
  // 行を押したら持ち替える（閉じずに、決定を待つ）
  if (row) {
    const i = pickerRows.indexOf(row);
    if (i === pickedIndex) return;
    sfx.playUiSelect();
    moveCursor(i);
    return pickWeapon(i);
  }
  if (target.closest('[data-action="weapon-decide"]')) return closePicker(true);
  // 窓の外（靄）か BACK を押したら閉じる
  if (target.closest('[data-action="weapon-close"]') || !target.closest('.sw-win')) closePicker(false);
}
export function onPickerKey(e: KeyboardEvent) {
  if (skinOpen()) return onSkinKey(e);
  switch (e.code) {
    case 'KeyO': // パッドの X
      return openSkinPicker();
    case 'Escape':
    case 'KeyQ':
      return closePicker(false);
    case 'Enter':
      e.preventDefault();
      return closePicker(true);
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      return stepPicker(-1, true);
    case 'ArrowRight':
    case 'PageDown':
      e.preventDefault();
      return stepPicker(1, true);
    case 'ArrowUp':
      e.preventDefault();
      return stepPickerRow(-1);
    case 'ArrowDown':
      e.preventDefault();
      return stepPickerRow(1);
  }
}

// 選択画面を閉じたままにする（ステージ選択を出し入れしたとき）
export function hidePicker() {
  closeSkin(false, true);
  stopClosing();
  overlay.classList.remove('pick-weapon');
  pausePickerVideos();
}
selectLoadout(loadoutIndex);

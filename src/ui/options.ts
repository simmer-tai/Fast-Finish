import * as THREE from 'three';
import * as sfx from '../audio.js';

// ---- オプション ----
// 感度は倍率で持つ（1 = 元の速さ）。明るさも倍率（1 = そのまま）で、最後の色調補正の露出に掛ける。
// 音量は 0〜1 で、音の出口に掛ける（audio.ts の setMasterVolume）。
// 画質は解像度・影・アンチエイリアスをまとめて切り替える（main.ts の applyQuality）。次に開いたときのために覚えておく
const OPTIONS_STORE = 'fast-finish.options';
const RANGES = {
  mouseSens: { min: 0.1, max: 3, step: 0.1 },
  padSens: { min: 0.1, max: 3, step: 0.1 },
  padVibration: { min: 0, max: 1, step: 0.1 },
  brightness: { min: 0.5, max: 2, step: 0.1 },
  volume: { min: 0, max: 1, step: 0.1 },
};
const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];
type RangeKey = keyof typeof RANGES;
const isRangeKey = (k: string | undefined): k is RangeKey => !!k && k in RANGES;
const QUALITY_NOTES: Record<Quality, string> = {
  low: '解像度を下げ、影とアンチエイリアスを切る。いちばん軽い',
  medium: '等倍の解像度に、粗めの影と軽めのアンチエイリアス',
  high: '高解像度（最大 2 倍）に、細かい影と 4x アンチエイリアス',
};
export const options = { mouseSens: 1, padSens: 1, padVibration: 1, brightness: 1, volume: 1, quality: 'high' as Quality };
try {
  const saved = JSON.parse(localStorage.getItem(OPTIONS_STORE) ?? '{}');
  for (const k of Object.keys(RANGES) as RangeKey[]) {
    if (typeof saved[k] === 'number') options[k] = THREE.MathUtils.clamp(saved[k], RANGES[k].min, RANGES[k].max);
  }
  if (QUALITIES.includes(saved.quality)) options.quality = saved.quality;
} catch {
  // 読めなければ初期値のまま
}
sfx.setMasterVolume(options.volume);
function saveOptions() {
  try {
    localStorage.setItem(OPTIONS_STORE, JSON.stringify(options));
  } catch {
    // 保存できなくても、この回の間は効いている
  }
}

// 値が変わったときと、画面を閉じるときに本体へ知らせる
export interface OptionHooks {
  onBrightness(): void;
  onQuality(): void;
  onClose(): void;
}
let hooks: OptionHooks;

// ---- オプション画面 ----
// 上下で項目を選び、左右で値を変える。感度と明るさは目盛りをクリック / ドラッグしても変えられる
const overlay = document.getElementById('overlay')!;
const optionRows = [...overlay.querySelectorAll<HTMLElement>('.options .opt')];
const qualityButtons = [...overlay.querySelectorAll<HTMLElement>('.options [data-quality]')];
const qualityNote = overlay.querySelector('.options .note')!;
let optionIndex = 0;
export function renderOptions() {
  optionRows.forEach((row, i) => {
    row.classList.toggle('active', i === optionIndex);
    const key = row.dataset.opt;
    if (!isRangeKey(key)) return;
    const v = options[key];
    const { min, max } = RANGES[key];
    row.querySelector<HTMLElement>('.bar i')!.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
    row.querySelector('.val')!.textContent = key === 'padVibration' && v === 0 ? 'OFF' : v.toFixed(1);
  });
  for (const b of qualityButtons) b.classList.toggle('active', b.dataset.quality === options.quality);
  qualityNote.textContent = QUALITY_NOTES[options.quality];
}
// 変わったら true
function setRange(key: RangeKey, v: number) {
  const { min, max, step } = RANGES[key];
  v = Number(THREE.MathUtils.clamp(Math.round(v / step) * step, min, max).toFixed(2));
  if (v === options[key]) return false;
  options[key] = v;
  saveOptions();
  if (key === 'brightness') hooks.onBrightness();
  if (key === 'volume') sfx.setMasterVolume(v);
  renderOptions();
  return true;
}
function setQuality(q: Quality) {
  if (q === options.quality) return false;
  options.quality = q;
  saveOptions();
  hooks.onQuality();
  renderOptions();
  return true;
}
function stepOption(row: HTMLElement, dir: number) {
  const key = row.dataset.opt;
  const changed =
    key === 'quality'
      ? setQuality(QUALITIES[THREE.MathUtils.clamp(QUALITIES.indexOf(options.quality) + dir, 0, QUALITIES.length - 1)])
      : setRange(key as RangeKey, options[key as RangeKey] + dir * RANGES[key as RangeKey].step);
  if (changed) sfx.playUiSelect();
  else sfx.playUiDenied();
}
export function onOptionsClick(target: HTMLElement) {
  const row = target.closest<HTMLElement>('.opt');
  if (!row) return;
  optionIndex = optionRows.indexOf(row);
  const step = target.closest<HTMLElement>('[data-step]');
  const quality = target.closest<HTMLElement>('[data-quality]');
  if (step) stepOption(row, Number(step.dataset.step));
  else if (quality && setQuality(quality.dataset.quality as Quality)) sfx.playUiSelect();
  renderOptions();
}
export function onOptionsKey(e: KeyboardEvent) {
  const dir = { ArrowUp: -1, ArrowDown: 1 }[e.code];
  const side = { ArrowLeft: -1, ArrowRight: 1 }[e.code];
  if (e.code === 'Escape' || e.code === 'KeyO') return hooks.onClose();
  if (e.code === 'Enter') return e.preventDefault(); // 開いている間は始めない
  if (dir) {
    e.preventDefault();
    const next = THREE.MathUtils.clamp(optionIndex + dir, 0, optionRows.length - 1);
    if (next !== optionIndex) sfx.playUiHover();
    optionIndex = next;
    renderOptions();
  } else if (side) {
    e.preventDefault();
    stepOption(optionRows[optionIndex], side);
  }
}
export function initOptions(h: OptionHooks) {
  hooks = h;
  for (const row of optionRows) {
    row.addEventListener('mouseenter', () => {
      optionIndex = optionRows.indexOf(row);
      renderOptions();
    });
    const bar = row.querySelector<HTMLElement>('.bar');
    if (!bar) continue;
    const key = row.dataset.opt as RangeKey;
    const { min, max } = RANGES[key];
    const fromPointer = (e: PointerEvent) => {
      const r = bar.getBoundingClientRect();
      const t = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1);
      if (setRange(key, min + t * (max - min))) sfx.playUiHover();
    };
    bar.addEventListener('pointerdown', (e) => {
      bar.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    bar.addEventListener('pointermove', (e) => {
      if (bar.hasPointerCapture(e.pointerId)) fromPointer(e);
    });
  }
  renderOptions();
}

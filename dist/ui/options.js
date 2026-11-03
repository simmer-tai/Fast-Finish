import * as THREE from 'three';
import * as sfx from '../audio.js?v=6b2d2aee';
// ---- オプション ----
// 感度は倍率で持つ（1 = 元の速さ）。明るさも倍率（1 = そのまま）で、最後の色調補正の露出に掛ける。
// モーションブラーも倍率（1 = 元の強さ、0 で切る）で、カメラの動きのブラーの強さと長さに掛ける（fx/post.ts）。画質で切っている LOW 以下では効かない。
// 音量は 0〜1 で、音の出口に掛ける（audio.ts の setMasterVolume）。
// 画質は解像度・影・アンチエイリアスをまとめて切り替える（main.ts の applyQuality）。重いときは、どの画質でも解像度を自動で下げる（fx/dynamicRes.ts）。
// PLAYER CARD はタイトルの右にプレイヤーカードを出すかどうか（overlay の card-on）。次に開いたときのために覚えておく
const OPTIONS_STORE = 'fast-finish.options';
const RANGES = {
    mouseSens: { min: 0.1, max: 3, step: 0.1 },
    padSens: { min: 0.1, max: 3, step: 0.1 },
    padVibration: { min: 0, max: 1, step: 0.1 },
    brightness: { min: 0.5, max: 2, step: 0.1 },
    motionBlur: { min: 0, max: 2, step: 0.1 },
    volume: { min: 0, max: 1, step: 0.1 },
};
const QUALITIES = ['lowest', 'low', 'medium', 'high', 'ultra'];
const isRangeKey = (k) => !!k && k in RANGES;
const QUALITY_NOTES = {
    lowest: '遊ぶのに要らない物を全部切る。LOW から、光のにじみ・画面端のブラー・縁の処理を外し、火花や破片をさらに減らす。いちばん軽い',
    low: '解像度を 2/3 にし、影とカメラのブラーを切って、火花や破片を減らす。縁は FXAA でならし、輪郭を立てる',
    medium: '等倍の解像度に、粗めの影と軽めのアンチエイリアス',
    high: '高解像度（最大 1.5 倍）に、細かい影と 4x アンチエイリアス',
    ultra: '画面の画素どおりの解像度（最大 2 倍）に、さらに細かい影と 8x アンチエイリアス。隅や足元に暗がり（AO）を入れ、光のにじみも細かく描く。重い',
};
export const options = { mouseSens: 1, padSens: 1, padVibration: 1, brightness: 1, motionBlur: 1, volume: 1, quality: 'high', showCard: true };
try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_STORE) ?? '{}');
    for (const k of Object.keys(RANGES)) {
        if (typeof saved[k] === 'number')
            options[k] = THREE.MathUtils.clamp(saved[k], RANGES[k].min, RANGES[k].max);
    }
    if (QUALITIES.includes(saved.quality))
        options.quality = saved.quality;
    if (typeof saved.showCard === 'boolean')
        options.showCard = saved.showCard;
}
catch {
    // 読めなければ初期値のまま
}
sfx.setMasterVolume(options.volume);
function saveOptions() {
    try {
        localStorage.setItem(OPTIONS_STORE, JSON.stringify(options));
    }
    catch {
        // 保存できなくても、この回の間は効いている
    }
}
let hooks;
// ---- オプション画面 ----
// 上下で項目を選び、左右で値を変える。感度と明るさは目盛りをクリック / ドラッグしても変えられる
const overlay = document.getElementById('overlay');
const optionRows = [...overlay.querySelectorAll('.options .opt')];
const qualityButtons = [...overlay.querySelectorAll('.options [data-quality]')];
const qualityNote = overlay.querySelector('.options .note');
const cardButtons = [...overlay.querySelectorAll('.options [data-card]')];
let optionIndex = 0;
export function renderOptions() {
    optionRows.forEach((row, i) => {
        row.classList.toggle('active', i === optionIndex);
        const key = row.dataset.opt;
        if (!isRangeKey(key))
            return;
        const v = options[key];
        const { min, max } = RANGES[key];
        row.querySelector('.bar i').style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
        row.querySelector('.val').textContent = (key === 'padVibration' || key === 'motionBlur') && v === 0 ? 'OFF' : v.toFixed(1);
    });
    for (const b of qualityButtons)
        b.classList.toggle('active', b.dataset.quality === options.quality);
    qualityNote.textContent = QUALITY_NOTES[options.quality];
    for (const b of cardButtons)
        b.classList.toggle('active', (b.dataset.card === 'on') === options.showCard);
    overlay.classList.toggle('card-on', options.showCard);
}
// 変わったら true
function setRange(key, v) {
    const { min, max, step } = RANGES[key];
    v = Number(THREE.MathUtils.clamp(Math.round(v / step) * step, min, max).toFixed(2));
    if (v === options[key])
        return false;
    options[key] = v;
    saveOptions();
    if (key === 'brightness')
        hooks.onBrightness();
    if (key === 'volume')
        sfx.setMasterVolume(v);
    renderOptions();
    return true;
}
function setQuality(q) {
    if (q === options.quality)
        return false;
    options.quality = q;
    saveOptions();
    hooks.onQuality();
    renderOptions();
    return true;
}
function setShowCard(on) {
    if (on === options.showCard)
        return false;
    options.showCard = on;
    saveOptions();
    renderOptions();
    return true;
}
function stepOption(row, dir) {
    const key = row.dataset.opt;
    const changed = key === 'card'
        ? setShowCard(dir < 0)
        : key === 'quality'
            ? setQuality(QUALITIES[THREE.MathUtils.clamp(QUALITIES.indexOf(options.quality) + dir, 0, QUALITIES.length - 1)])
            : setRange(key, options[key] + dir * RANGES[key].step);
    if (changed)
        sfx.playUiSelect();
    else
        sfx.playUiDenied();
}
export function onOptionsClick(target) {
    const row = target.closest('.opt');
    if (!row)
        return;
    optionIndex = optionRows.indexOf(row);
    const step = target.closest('[data-step]');
    const quality = target.closest('[data-quality]');
    const card = target.closest('[data-card]');
    if (step)
        stepOption(row, Number(step.dataset.step));
    else if (quality && setQuality(quality.dataset.quality))
        sfx.playUiSelect();
    else if (card && setShowCard(card.dataset.card === 'on'))
        sfx.playUiSelect();
    renderOptions();
}
export function onOptionsKey(e) {
    const dir = { ArrowUp: -1, ArrowDown: 1 }[e.code];
    const side = { ArrowLeft: -1, ArrowRight: 1 }[e.code];
    if (e.code === 'Escape' || e.code === 'KeyO')
        return hooks.onClose();
    if (e.code === 'Enter')
        return e.preventDefault(); // 開いている間は始めない
    if (dir) {
        e.preventDefault();
        const next = THREE.MathUtils.clamp(optionIndex + dir, 0, optionRows.length - 1);
        if (next !== optionIndex)
            sfx.playUiHover();
        optionIndex = next;
        renderOptions();
    }
    else if (side) {
        e.preventDefault();
        stepOption(optionRows[optionIndex], side);
    }
}
export function initOptions(h) {
    hooks = h;
    for (const row of optionRows) {
        row.addEventListener('mouseenter', () => {
            optionIndex = optionRows.indexOf(row);
            renderOptions();
        });
        const bar = row.querySelector('.bar');
        if (!bar)
            continue;
        const key = row.dataset.opt;
        const { min, max } = RANGES[key];
        const fromPointer = (e) => {
            const r = bar.getBoundingClientRect();
            const t = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1);
            if (setRange(key, min + t * (max - min)))
                sfx.playUiHover();
        };
        bar.addEventListener('pointerdown', (e) => {
            bar.setPointerCapture(e.pointerId);
            fromPointer(e);
        });
        bar.addEventListener('pointermove', (e) => {
            if (bar.hasPointerCapture(e.pointerId))
                fromPointer(e);
        });
    }
    renderOptions();
}

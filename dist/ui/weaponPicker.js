import * as sfx from '../audio.js';
import { WEAPON_KEYS } from '../weapons/ids.js';
import { options } from './options.js';
// ---- 武器の選択画面 ----
const overlay = document.getElementById('overlay');
// 持ち込む武器。ステージに入ったときにこれを構えている（中で持ち替えることはできる）。次に開いたときのために覚えておく
const LOADOUT_STORE = 'fast-finish.weapon';
// 詳細の欄には今の武器を 1 行で出し、押すと武器の選択画面を開く。選択画面では上下でカーソルを動かして右に大きく見せ、
// 決めたら詳細の欄へ戻す。名前と和名は選択画面の行から写す
const loadoutSlot = overlay.querySelector('.sw-slot');
const picker = overlay.querySelector('.sw-picker');
const pickerRows = [...picker.querySelectorAll('.sw-rows [data-weapon]')];
const pickerPreview = picker.querySelector('.sw-preview');
const LOADOUT_IDS = pickerRows.map((b) => b.dataset.weapon);
// 右下の HUD のアイコンを写して、入れ物に武器の数だけ入れる（見せるものだけ on にする）
const cloneWeaponIcon = (id) => {
    const svg = document.querySelector(`#weapon .icon svg[data-w="${id}"]`).cloneNode(true);
    svg.removeAttribute('class');
    return svg;
};
const fillIcons = (box) => LOADOUT_IDS.map((id) => box.appendChild(cloneWeaponIcon(id)));
const showIcon = (icons, i) => icons.forEach((svg, j) => svg.classList.toggle('on', j === i));
pickerRows.forEach((b, i) => showIcon(fillIcons(b.querySelector('.ic')), i));
const slotIcons = fillIcons(loadoutSlot.querySelector('.ic'));
const previewIcons = fillIcons(pickerPreview.querySelector('.ic'));
const setName = (el, i) => {
    el.querySelector('.nm').textContent = pickerRows[i].dataset.name ?? '';
    el.querySelector('.ja').textContent = pickerRows[i].dataset.ja ?? '';
};
let loadoutIndex = 0; // 持ち込むと決めた武器
let pickerIndex = 0; // 選択画面のカーソル
try {
    const saved = LOADOUT_IDS.indexOf(localStorage.getItem(LOADOUT_STORE));
    if (saved >= 0)
        loadoutIndex = saved;
}
catch {
    // 保存できない環境では毎回クナイから
}
export const selectedLoadout = () => LOADOUT_IDS[loadoutIndex];
export const pickerOpen = () => overlay.classList.contains('pick-weapon');
function selectLoadout(i) {
    loadoutIndex = i;
    showIcon(slotIcons, i);
    setName(loadoutSlot, i);
    try {
        localStorage.setItem(LOADOUT_STORE, selectedLoadout());
    }
    catch {
        // 覚えられなくても選ぶことはできる
    }
}
// プレビュー動画: previews/<武器>.mp4 を音なしで繰り返し流す。読めるまで（無ければずっと）NO SIGNAL の画面を出す
const PREVIEW_VIDEO_DIR = 'previews';
const pickerScreen = pickerPreview.querySelector('.sw-video');
const pickerVideo = pickerScreen.querySelector('video');
const pickerNoSignal = pickerScreen.querySelector('.sw-nosig small');
pickerVideo.addEventListener('loadeddata', () => pickerScreen.classList.add('has-video'));
pickerVideo.addEventListener('error', () => pickerScreen.classList.remove('has-video'));
// 背景: 手前の動画の新しいフレームが出るたびに canvas へ写す（2 本目の動画を流すとずれるので、同じ動画から写す）。
// 小さく写してその中でぼかし、画面いっぱいに引き伸ばす（全画面に CSS でぼかすより軽い）。大きさは画質の設定に合わせる
const PICKER_BG_WIDTH = { low: 96, medium: 160, high: 320 };
const pickerBg = picker.querySelector('.sw-bg');
const pickerBgCtx = pickerBg.getContext('2d');
function drawPickerBg() {
    if (pickerVideo.readyState < 2)
        return;
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
function showPickerVideo(id) {
    const src = `${PREVIEW_VIDEO_DIR}/${id}.mp4`;
    pickerNoSignal.textContent = src;
    if (pickerVideo.dataset.id === id)
        return;
    pickerVideo.dataset.id = id;
    pickerScreen.classList.remove('has-video');
    pickerBg.classList.remove('has-video');
    pickerVideo.src = src;
    playPickerVideos(); // 無いファイルや自動再生の拒否は NO SIGNAL のままにする
}
function playPickerVideos() {
    pickerVideo.play().catch(() => { });
}
function pausePickerVideos() {
    pickerVideo.pause();
}
// 差し込んだ武器名とアイコンの尾。着くまでは伸ばしたまま、着いたら一気に巻き取る（CSS の sw-in-smear / sw-in-ic と同じ長さ・同じ着く時刻）
const SMEAR_TIME = 0.3;
const SMEAR_LAND = 0.22;
const pickerName = pickerPreview.querySelector('.nm');
const pickerIcon = pickerPreview.querySelector('.ic');
const smearDilates = [...document.querySelectorAll(':is(#sw-smear, #sw-smear-ic) feMorphology')];
const smearOffsets = [...document.querySelectorAll(':is(#sw-smear, #sw-smear-ic) feOffset')];
let smearRun = 0;
function smearPicker(dir) {
    const run = ++smearRun;
    const len = parseFloat(getComputedStyle(pickerName).fontSize) * 0.24; // 尾の長さ（文字の高さに対して）
    const start = performance.now();
    pickerName.style.filter = 'url(#sw-smear)';
    pickerIcon.style.filter = 'url(#sw-smear-ic)';
    const step = (now) => {
        if (run !== smearRun)
            return;
        const t = (now - start) / 1000 / SMEAR_TIME;
        if (t >= 1) {
            pickerName.style.filter = ''; // 止まったら素の文字に戻す
            pickerIcon.style.filter = '';
            return;
        }
        const k = t < SMEAR_LAND ? 1 : 2 ** (-10 * ((t - SMEAR_LAND) / (1 - SMEAR_LAND)));
        const r = (len * k) / 2;
        // 段ごとに data-len の割合だけ伸ばす。下から来たら下へ、上から来たら上へ尾を引く
        for (const el of smearDilates)
            el.setAttribute('radius', `0 ${r * Number(el.dataset.len)}`);
        for (const el of smearOffsets)
            el.setAttribute('dy', String((dir > 0 ? r : -r) * Number(el.dataset.len)));
        requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
// カーソルを動かして右に大きく見せる。dir: 動いた向き（1 = 下へ, -1 = 上へ, 0 = 動きなし）。その向きから差し込む
function movePicker(i, dir = Math.sign(i - pickerIndex)) {
    pickerIndex = i;
    pickerRows.forEach((b, j) => {
        b.classList.toggle('active', j === i);
        b.classList.toggle('equipped', j === loadoutIndex);
    });
    showIcon(previewIcons, i);
    setName(pickerPreview, i);
    showPickerVideo(LOADOUT_IDS[i]);
    pickerPreview.classList.remove('in-next', 'in-prev');
    if (dir) {
        void pickerPreview.offsetWidth; // 続けて動かしても頭から流し直す
        pickerPreview.classList.add(dir > 0 ? 'in-next' : 'in-prev');
        smearPicker(dir);
    }
}
// 端まで行ったら反対の端へ回る
function stepPicker(dir) {
    sfx.playUiHover();
    movePicker((pickerIndex + dir + LOADOUT_IDS.length) % LOADOUT_IDS.length, dir);
}
export function openPicker() {
    sfx.playUiOpen();
    overlay.classList.add('pick-weapon');
    movePicker(loadoutIndex, 0);
    resumePickerVideo();
}
// decide: カーソルの武器に決めて閉じる。false なら選び直さずに閉じる
function closePicker(decide) {
    if (!pickerOpen())
        return;
    if (decide) {
        sfx.playUiSelect();
        selectLoadout(pickerIndex);
    }
    else {
        sfx.playUiBack();
    }
    overlay.classList.remove('pick-weapon');
    pausePickerVideos(); // 閉じている間は流さない（開いたら movePicker で続きから）
}
// 開き直したとき、同じ武器の動画は読み直さずに再開する
function resumePickerVideo() {
    if (pickerScreen.classList.contains('has-video'))
        playPickerVideos();
}
// 行に乗ったらカーソルをそこへ（音はメニュー共通の乗ったときの音が鳴る）
for (const [i, b] of pickerRows.entries())
    b.addEventListener('mouseenter', () => i !== pickerIndex && movePicker(i));
// 選択画面の上でホイールを回しても上下に動かす。トラックパッドの細かい連続を 1 つずつに均すため、動かしたら少し待つ
let pickerWheelAt = 0;
picker.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!e.deltaY || e.timeStamp - pickerWheelAt < 160)
        return;
    pickerWheelAt = e.timeStamp;
    stepPicker(Math.sign(e.deltaY));
}, { passive: false });
export function onPickerClick(target) {
    const row = target.closest('.sw-rows [data-weapon]');
    if (row) {
        movePicker(pickerRows.indexOf(row));
        return closePicker(true);
    }
    if (target.closest('[data-action="weapon-decide"]'))
        return closePicker(true);
    // 窓の外（靄）か BACK を押したら閉じる
    if (target.closest('[data-action="weapon-close"]') || !target.closest('.sw-win'))
        closePicker(false);
}
export function onPickerKey(e) {
    switch (e.code) {
        case 'Escape':
        case 'KeyQ':
            return closePicker(false);
        case 'Enter':
        case 'NumpadEnter':
        case 'Space':
            e.preventDefault();
            return closePicker(true);
        case 'ArrowUp':
        case 'KeyW':
        case 'PageUp':
            e.preventDefault();
            return stepPicker(-1);
        case 'ArrowDown':
        case 'KeyS':
        case 'PageDown':
            e.preventDefault();
            return stepPicker(1);
    }
    const n = WEAPON_KEYS[e.code] ? LOADOUT_IDS.indexOf(WEAPON_KEYS[e.code]) : -1;
    if (n >= 0 && n !== pickerIndex) {
        sfx.playUiHover();
        movePicker(n);
    }
}
// 選択画面を閉じたままにする（ステージ選択を出し入れしたとき）
export function hidePicker() {
    overlay.classList.remove('pick-weapon');
    pausePickerVideos();
}
selectLoadout(loadoutIndex);

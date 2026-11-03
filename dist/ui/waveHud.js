import * as sfx from '../audio.js?v=2f0a24b4';
import { shipState } from '../world/shipState.js?v=2f0a24b4';
// ---- 大波の予告（SHIP） ----
// 大波が来る WARN_SHOW 秒前から、画面の上の真ん中に「BIG WAVE」と、迫るほど伸びる帯を出す。
// 帯の下には船の傾きを示す線（傾斜計）を置き、いまどちらの舷が下がっているかを見せる。
// 大波の間は文字が赤く明滅する。汽笛は予告の始めに、船体のきしみは大波に入ったときと揺り返しで鳴らす
const WARN_SHOW = 6; // 予告を出し始める (s)
const HORN_AT = 5; // 汽笛を鳴らす (s)
const LEVEL_GAIN = 2.5; // 傾斜計の線を、実際の傾きの何倍に傾けて見せるか
const el = document.getElementById('bigwave');
const fill = el.querySelector('.f');
const level = el.querySelector('.level');
let lastWarn = Infinity;
let lastBig = 0;
let creaked = 0; // この大波できしみを鳴らした回数
export function updateWaveHud() {
    const { warn, big, roll } = shipState;
    const show = warn <= WARN_SHOW || big > 0;
    el.hidden = !show;
    if (warn <= HORN_AT && lastWarn > HORN_AT)
        sfx.playShipHorn();
    if (big > 0 && lastBig <= 0)
        creaked = 0;
    // 大波の周期の始めと、揺り返して反対へ傾き始めるところ（big が頂点を過ぎたところ）できしむ
    if (big > 0 && creaked === 0) {
        sfx.playHullCreak(1);
        creaked = 1;
    }
    if (big > 0 && big < lastBig && lastBig > 0.98 && creaked === 1) {
        sfx.playHullCreak(1.2);
        creaked = 2;
    }
    lastWarn = warn;
    lastBig = big;
    if (!show)
        return;
    el.classList.toggle('on', big > 0);
    fill.style.transform = `scaleX(${big > 0 ? 1 : Math.min(1, 1 - warn / WARN_SHOW)})`;
    level.style.transform = `rotate(${(-roll * LEVEL_GAIN * 180) / Math.PI}deg)`;
}

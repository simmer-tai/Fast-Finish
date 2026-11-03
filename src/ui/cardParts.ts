// ---- プレイヤーカードの背景とフレーム ----
// ロッカー（ui/playerCard.ts）と、ロードマップのご褒美の中身（ui/lvRoadmap.ts）で使う
// 背景。見た目は index.html の .pcard.bg-<id> に書く。dark は字を白にする
export interface Background { id: string; name: string; dark?: boolean }
export const BACKGROUNDS: Background[] = [
  { id: 'plain', name: 'PLAIN' },
  { id: 'grid', name: 'GRID' },
  { id: 'stripe', name: 'STRIPE' },
  { id: 'halftone', name: 'HALFTONE' },
  { id: 'band', name: 'BAND' },
  { id: 'redline', name: 'REDLINE' },
  { id: 'ink', name: 'INK', dark: true },
  { id: 'scan', name: 'SCAN', dark: true },
];
// フレーム（縁の飾り）。見た目は index.html の .pcard.fr-<id> に書く。背景とは別に選び、字の色（背景の dark）に合わせて縁の色も変わる
// pending: 解放の条件がまだ決まっていない（作者の手元と ?devmode でだけ選べる）
export interface Frame { id: string; name: string; pending?: true }
export const FRAMES: Frame[] = [
  { id: 'standard', name: 'STANDARD' },
  { id: 'none', name: 'NONE' },
  { id: 'bold', name: 'BOLD' },
  { id: 'bracket', name: 'BRACKET' },
  { id: 'ticks', name: 'TICKS' },
  { id: 'rededge', name: 'RED EDGE' },
  { id: 'hazard', name: 'HAZARD' },
  { id: 'talon', name: 'TALON' },
  { id: 'falcon', name: 'FALCON', pending: true },
];
// カードの土台（背景とフレーム）の class。ロッカーの見本でも使う
export const baseClass = (bgId: string, frame: string) => `pcard bg-${bgId}${BACKGROUNDS.find((b) => b.id === bgId)!.dark ? ' dark' : ''} fr-${frame}`;
// フレームの層と、左上・右下のかぎ括弧（使うフレームだけ見せる）
// TALON: 爪のスキンの意匠。黒い角ばった枠を、左上と右下の角から伸びる二本の鉤爪がつかむ。
// 爪の内側と枠の一部に赤く光る細い帯、ボルト、斜めの刻みの板。カードと同じ 16:9 の 160×90 で描く（落とした角は 9.6）。
// 半分（左上の爪・上の帯・右上の角）を描き、中心で 180° 回して右下・下・左下にも置く。
// 放電（tl-zap）は爪の先と枠のあいだなど金属どうしの間に飛ばし、たまにだけ光らせる（間隔は --d / --o でずらす）。
// 1 か所に稲妻 2 通り（za / zb を交互に出して形を変える）・枝（zbr）・にじみ（zg）・飛び散る火の粉（zp）。形は手で書かず生成した
const TALON_HALF =
  '<path class="tl-plate" d="M0 0H20L17 5L8 6L6 8L5 17L0 20Z"/>' +
  '<path class="tl-plate" d="M18 0H42Q48 0 47 6.5L44.5 4.4Q43 3 40 3L17.4 4.6Z"/>' +
  '<path class="tl-plate" d="M0 18V42Q0 48 6.5 47L4.4 44.5Q3 43 3 40L4.6 17.4Z"/>' +
  '<path class="tl-plate" d="M117 0H143L140.5 4.2H119.5Z"/>' +
  '<path class="tl-hatch" d="M122.5 0.7L121.2 3.5M126 0.7L124.7 3.5M129.5 0.7L128.2 3.5M133 0.7L131.7 3.5M136.5 0.7L135.2 3.5"/>' +
  '<path class="tl-red" d="M19 4.3L40 3.4Q43.4 3.5 45.4 5.6M4.3 19L3.4 40Q3.5 43.4 5.6 45.4M52 3.1H112M151.5 3.6L156.4 8.5"/>' +
  '<circle class="tl-bolt" cx="10.5" cy="2.8" r="1"/><circle class="tl-bolt" cx="2.8" cy="10.5" r="1"/>' +
  '<circle class="tl-bolt" cx="70" cy="1.2" r="0.7"/><circle class="tl-bolt" cx="90" cy="1.2" r="0.7"/><circle class="tl-bolt" cx="1.2" cy="62" r="0.7"/>';
const TALON_FRAME =
  '<svg class="pc-talon" viewBox="0 0 160 90" aria-hidden="true">' +
  // 外周はカードの縁（clip-path）より 1 外まで塗る。縁ちょうどだと境目の画素に地の色がにじみ、枠のまわりに明るい線が出て浮いて見える
  '<path class="tl-plate" fill-rule="evenodd" d="M-1 -1H149.4L161 10.6V91H10.6L-1 79.4ZM5.4 2.4H149.4L157.6 10.6V84.6L154.6 87.6H10.6L2.4 79.4V5.4Z"/>' +
  `<g>${TALON_HALF}</g><g transform="rotate(180 80 45)">${TALON_HALF}</g>` +
  '<g class="tl-zap" style="--d:4.7s;--o:0s"><circle class="zg" cx="52.0" cy="4.5" r="6.8"/><path class="za" d="M47.0 6.5L48.4 5.8L49.9 5.6L52.0 6.6L52.7 4.1L54.2 3.7L55.7 3.4L57.0 2.6"/><path class="zb" d="M47.0 6.5L48.4 5.9L49.9 5.6L51.8 6.1L52.4 3.5L53.9 3.1L55.8 3.7L57.0 2.6"/><path class="zbr" d="M52.0 6.6L51.2 5.3L52.3 4.0L51.4 2.8L51.7 1.5"/><circle class="zp" cx="54.2" cy="3.7" r="0.32" style="--dx:1.1px;--dy:-3.8px"/><circle class="zp" cx="49.9" cy="5.6" r="0.33" style="--dx:-2.9px;--dy:-2.5px"/><circle class="zp" cx="49.9" cy="5.6" r="0.37" style="--dx:-1.6px;--dy:-4.1px"/><circle class="zp" cx="49.9" cy="5.6" r="0.33" style="--dx:1.5px;--dy:-2.5px"/></g>' +
  '<g class="tl-zap" style="--d:6.9s;--o:-2.1s"><circle class="zg" cx="155.6" cy="38.0" r="6.9"/><path class="za" d="M153.5 43.0L155.3 42.1L156.2 40.8L156.9 39.4L154.1 36.6L156.7 36.0L156.8 34.3L157.6 33.0"/><path class="zb" d="M153.5 43.0L153.5 41.3L154.7 40.1L155.5 38.8L155.7 37.2L156.7 36.0L157.0 34.4L157.6 33.0"/><path class="zbr" d="M154.1 36.6L153.2 35.7L151.8 35.4L150.5 34.9L150.3 33.2"/><circle class="zp" cx="156.2" cy="40.8" r="0.36" style="--dx:-4.5px;--dy:1.1px"/><circle class="zp" cx="156.9" cy="39.4" r="0.27" style="--dx:-2.1px;--dy:-3.0px"/><circle class="zp" cx="156.7" cy="36.0" r="0.31" style="--dx:-4.7px;--dy:-1.4px"/><circle class="zp" cx="154.1" cy="36.6" r="0.29" style="--dx:-2.2px;--dy:-1.8px"/></g>' +
  '<g class="tl-zap" style="--d:8.3s;--o:-5.4s"><circle class="zg" cx="81.0" cy="3.1" r="10.1"/><path class="za" d="M72.0 3.1L74.6 4.0L77.1 0.6L79.7 4.0L82.3 5.6L84.9 5.2L87.4 3.2L90.0 3.1"/><path class="zb" d="M72.0 3.1L74.6 1.3L77.1 1.2L79.7 5.6L82.3 3.4L84.9 1.7L87.4 2.3L90.0 3.1"/><path class="zbr" d="M82.3 5.6L82.6 3.5L83.8 1.6L85.6 -0.0L85.0 -2.5"/><circle class="zp" cx="84.9" cy="5.2" r="0.36" style="--dx:-0.4px;--dy:-2.6px"/><circle class="zp" cx="84.9" cy="5.2" r="0.26" style="--dx:-0.5px;--dy:-2.8px"/><circle class="zp" cx="77.1" cy="0.6" r="0.28" style="--dx:3.8px;--dy:-2.0px"/><circle class="zp" cx="82.3" cy="5.6" r="0.34" style="--dx:3.1px;--dy:-2.6px"/></g>' +
  '<g class="tl-zap" style="--d:7.6s;--o:-0.8s"><circle class="zg" cx="10.2" cy="86.0" r="7.4"/><path class="za" d="M4.5 84.5L6.2 84.6L8.1 84.3L9.9 84.3L10.5 88.2L12.6 87.0L14.2 87.8L16.0 87.6"/><path class="zb" d="M4.5 84.5L6.5 83.6L8.1 84.1L9.2 86.7L11.5 84.7L12.2 88.5L14.1 88.3L16.0 87.6"/><path class="zbr" d="M8.1 84.3L8.0 85.7L9.5 87.1L7.8 88.6L8.4 90.0"/><circle class="zp" cx="8.1" cy="84.3" r="0.35" style="--dx:1.8px;--dy:1.8px"/><circle class="zp" cx="12.6" cy="87.0" r="0.38" style="--dx:1.3px;--dy:3.6px"/><circle class="zp" cx="9.9" cy="84.3" r="0.28" style="--dx:-0.1px;--dy:5.0px"/><circle class="zp" cx="12.6" cy="87.0" r="0.39" style="--dx:1.9px;--dy:4.2px"/></g>' +
  '<g class="tl-zap" style="--d:10.1s;--o:-7.3s"><circle class="zg" cx="4.1" cy="22.0" r="6.6"/><path class="za" d="M5.0 17.0L4.4 18.4L3.1 19.6L4.4 21.3L3.1 22.6L2.2 23.9L3.4 25.6L3.2 27.0"/><path class="zb" d="M5.0 17.0L3.4 18.2L4.6 19.9L3.3 21.1L3.0 22.5L4.7 24.3L4.7 25.8L3.2 27.0"/><path class="zbr" d="M4.4 21.3L3.3 21.9L2.0 21.4L0.9 22.3L-0.4 22.0"/><circle class="zp" cx="4.4" cy="21.3" r="0.37" style="--dx:-3.1px;--dy:-1.5px"/><circle class="zp" cx="3.1" cy="19.6" r="0.25" style="--dx:-4.3px;--dy:-2.1px"/><circle class="zp" cx="2.2" cy="23.9" r="0.29" style="--dx:-2.9px;--dy:-2.7px"/><circle class="zp" cx="3.1" cy="22.6" r="0.35" style="--dx:-1.5px;--dy:-4.1px"/></g>' +
  '</svg>';
// FALCON: 隼のスキンの意匠。白い陶器の細い縁に金の線。左上と右下の角から、黒い鋼の翼が上と横の縁に沿って伸びる。
// 翼は風切り羽を段々に重ねた形: 先を斜めに切り落とした帯を、縁から内へ黒・金・白・金と、内ほど短く並べる（曲線は使わず、角ばらせる）。
// 角には金の輪に光る核（ライフルの装填口）。上の真ん中に金の山形、落とした角に金の帯。
// 翼は上の縁の分を描き、x と y を入れ替えて（長さは 0.65 倍に縮めて）横の縁にも置く。TALON と同じく半分を描いて 180° 回す。
// 動き: 金の線を光が二手に分かれて走り（fc-glint）、核がゆっくり明滅し、羽根の先から金粉がこぼれる
// 羽根: y0〜y1 の帯を、角の核の外（x = 7）から x まで伸ばし、先を k だけ斜めに切る
const quill = (cls: string, y0: number, y1: number, x: number, k: number) => `<path class="${cls}" d="M7 ${y0}H${x}L${x - k} ${y1}H7Z"/>`;
const FALCON_WING =
  // 地の黒い翼。羽根の先に合わせて段を付け、羽根のあいだの隙間を黒く見せる
  '<path class="fc-wing" d="M0 0H62.4L58.6 2.7H49L46.2 4.3H35.4L33.2 5.8H23.4L22.4 6.9H0Z"/>' +
  quill('fc-wing', 0, 2.4, 62, 3.4) + '<path class="fc-gloss" d="M10 1.1H55"/>' +
  quill('fc-gold', 2.7, 4.0, 48.6, 2.4) +
  quill('fc-shell', 4.3, 5.5, 35, 1.9) +
  quill('fc-gold', 5.8, 6.6, 23, 1);
const FALCON_HALF =
  `<g>${FALCON_WING}</g><g transform="matrix(0 0.65 1 0 0 0)">${FALCON_WING}</g>` +
  '<circle class="fc-ring" cx="4.6" cy="4.6" r="2.5"/><circle class="fc-core" cx="4.6" cy="4.6" r="1.1"/>' +
  '<path class="fc-wing" d="M68 0H92L88.6 3.4H71.4Z"/><path class="fc-line" d="M75 1.1L80 2.6L85 1.1"/>' +
  '<path class="fc-wing" d="M136 0H150.6L160 9.4V22L157.4 19.4V10.8L148.6 2H138Z"/>' +
  '<path class="fc-line" d="M149.8 3.2L156.8 10.2M140.5 0.4L139.6 1.6M143 0.4L142.1 1.6M145.5 0.4L144.6 1.6"/>' +
  '<rect class="fc-slot" x="158.2" y="12" width="0.9" height="5" rx="0.45"/>' +
  '<circle class="fc-dust" cx="47.4" cy="3.4" r="0.32" style="--dx:2.4px;--dy:1.6px;--d:3.7s;--o:-0.4s"/>' +
  '<circle class="fc-dust" cx="22.5" cy="6.2" r="0.26" style="--dx:1.8px;--dy:2.2px;--d:4.6s;--o:-2.9s"/>' +
  '<circle class="fc-dust" cx="60" cy="1.3" r="0.28" style="--dx:2.8px;--dy:1.2px;--d:5.3s;--o:-1.7s"/>' +
  '<circle class="fc-dust" cx="3.4" cy="30.8" r="0.3" style="--dx:1.5px;--dy:2.4px;--d:4.1s;--o:-3.3s"/>' +
  '<circle class="fc-dust" cx="6.2" cy="14.6" r="0.25" style="--dx:2.1px;--dy:1.7px;--d:5.8s;--o:-0.9s"/>';
const FALCON_FRAME =
  '<svg class="pc-falcon" viewBox="0 0 160 90" aria-hidden="true">' +
  // 外周は TALON と同じく、カードの縁より 1 外まで塗る
  '<path class="fc-plate" fill-rule="evenodd" d="M-1 -1H149.4L161 10.6V91H10.6L-1 79.4ZM2 2H149.6L158 10.4V88H10.4L2 79.6Z"/>' +
  '<path class="fc-line" d="M3 3H149.2L157 10.8V87H10.8L3 79.2Z"/>' +
  // 光は線の長さを 100 として、向かい合う 2 か所から同じ向きに半周ずつ走らせる（翼の下はくぐる）
  '<path class="fc-glint" pathLength="100" d="M3 3H149.2L157 10.8V87H10.8L3 79.2Z"/>' +
  `<g>${FALCON_HALF}</g><g transform="rotate(180 80 45)">${FALCON_HALF}</g>` +
  '</svg>';
export const FRAME_PARTS = `<span class="pc-frame"><i></i></span><i class="c tl"></i><i class="c br"></i>${TALON_FRAME}${FALCON_FRAME}`;
// 背景とフレームの見本（中身は空のカード）
export const partSwatch = (bgId: string, frame: string) => `<span class="${baseClass(bgId, frame)}">${FRAME_PARTS}</span>`;

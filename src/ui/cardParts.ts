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
  { id: 'eclipse', name: 'ECLIPSE', pending: true },
  { id: 'violet', name: 'VIOLET', pending: true },
];
// 名前の色。見た目は index.html の .nc-<id> に書く。白と黒はいつでも選べる。
// frame / bg のあるものは、そのフレームか背景を解放すると選べる（付けていなくてもよい。解放していなければ一覧にも出さない）
export interface NameColor { id: string; name: string; frame?: string; bg?: string }
export const NAME_COLORS: NameColor[] = [
  { id: 'black', name: 'BLACK' },
  { id: 'white', name: 'WHITE' },
  { id: 'rededge', name: 'RED EDGE', frame: 'rededge' },
  { id: 'talon', name: 'TALON', frame: 'talon' },
  { id: 'falcon', name: 'FALCON', frame: 'falcon' },
  { id: 'scan', name: 'SCAN', bg: 'scan' },
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
// カード全体に走る大きな電撃: 20 秒に一度、爪の先から向かいの爪の先へ、左右と斜めの 2 本が走る。1 本につき稲妻 2 通り（sa / sb を交互に出す）と枝（sbr）。
// 同じ瞬間に、爪痕（TALON_SCARS の ts-surge）とカードの面（ts-wash）も光る。タイミングは index.html の tl-surge-* と ts-surge / ts-wash。文字にかかるのは一瞬なので、枠と同じ層で文字の上に出す。
// どのカードでも同じ形になるよう、乱数は種を決めて作る
const TALON_SURGE = (() => {
  let seed = 20261106;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  type Point = [number, number];
  // a から b へ、進む向きと直角にぶらしながら折れ線を作る（両端は動かさない）
  const bolt = (a: Point, b: Point, segments: number, spread: number): Point[] => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy);
    return Array.from({ length: segments + 1 }, (_, i) => {
      const t = i / segments;
      const off = (rnd() - 0.5) * 2 * spread * Math.sin(Math.PI * t) ** 0.5;
      return [a[0] + dx * t - (dy / len) * off, a[1] + dy * t + (dx / len) * off];
    });
  };
  const path = (points: Point[]) => `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`;
  const arcs: [Point, Point][] = [[[6.5, 47], [153.5, 43]], [[47, 6.5], [113, 83.5]]];
  return arcs.map(([a, b]) => {
    const first = bolt(a, b, 14, 7);
    const branches = [4, 9].map((i) => {
      const from = first[i];
      const angle = rnd() * Math.PI * 2;
      const reach = 12 + rnd() * 10;
      return `<path class="sbr" d="${path(bolt(from, [from[0] + Math.cos(angle) * reach, from[1] + Math.sin(angle) * reach], 5, 2.5))}"/>`;
    });
    return `<g class="tl-surge"><path class="sa" d="${path(first)}"/><path class="sb" d="${path(bolt(a, b, 14, 7))}"/>${branches.join('')}</g>`;
  }).join('');
})();
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
  TALON_SURGE +
  '</svg>';
// TALON のカードの表面の爪痕: 文字の少ない右上から左下へ、エンブレムの爪と同じ向きに 3 本。文字の下に敷くので、枠の SVG とは別に置く。
// 1 本は曲線に沿った細長い切り口で、幅は根元寄りで最も太く、先へ細る。層は暗い切り口（ts-cut）・光を受ける右下の縁（ts-lip）・奥の赤い光（ts-core）・放電で強く光る層（ts-flare）。
// 赤い光は枠の帯と同じ周期でまたたき、ts-flare は TALON_FRAME の放電と同じ --d / --o で、放電の瞬間に一緒に光る。
// どのカードでも同じ形になるよう、乱数は種を決めて作る
type ScarPoint = [number, number];
const TALON_SCAR_LINES: { from: ScarPoint; via: ScarPoint; to: ScarPoint; width: number; d: string; o: string }[] = [
  { from: [120, 15], via: [124, 33], to: [101, 53], width: 2.2, d: '4.7s', o: '0s' },
  { from: [134, 13], via: [139, 36], to: [114, 60], width: 2.8, d: '8.3s', o: '-5.4s' },
  { from: [148, 17], via: [151, 36], to: [132, 55], width: 2, d: '6.9s', o: '-2.1s' },
];
const TALON_SCAR_STEPS = 16;
const TALON_SCARS = (() => {
  let seed = 20261105;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const scars = TALON_SCAR_LINES.map(({ from, via, to, width, d, o }) => {
    const spine = Array.from({ length: TALON_SCAR_STEPS + 1 }, (_, i) => {
      const t = i / TALON_SCAR_STEPS;
      const [u, end] = [1 - t, i === 0 || i === TALON_SCAR_STEPS];
      const x = u * u * from[0] + 2 * u * t * via[0] + t * t * to[0];
      const y = u * u * from[1] + 2 * u * t * via[1] + t * t * to[1];
      const [dx, dy] = [2 * u * (via[0] - from[0]) + 2 * t * (to[0] - via[0]), 2 * u * (via[1] - from[1]) + 2 * t * (to[1] - via[1])];
      const len = Math.hypot(dx, dy);
      // 切り口の縁を少しだけ荒らす（両端はとがらせたまま）
      return { x, y, nx: -dy / len, ny: dx / len, half: (width / 2) * Math.sin(Math.PI * t ** 0.7), upper: end ? 0 : (rnd() - 0.5) * 0.28, lower: end ? 0 : (rnd() - 0.5) * 0.28 };
    });
    const at = (p: (typeof spine)[number], side: 1 | -1, scale: number) => {
      const off = (p.half + (side === 1 ? p.upper : p.lower)) * scale * side;
      return `${(p.x + p.nx * off).toFixed(2)} ${(p.y + p.ny * off).toFixed(2)}`;
    };
    const line = (side: 1 | -1, scale: number) => spine.map((p) => at(p, side, scale));
    const shape = (scale: number) => `M${line(1, scale).join('L')}L${line(-1, scale).reverse().join('L')}Z`;
    // 法線は左上を向くので、-1 の側が右下の縁
    return `<path class="ts-cut" d="${shape(1)}"/><path class="ts-lip" d="M${line(-1, 1).join('L')}"/>` +
      `<path class="ts-core" d="${shape(0.3)}"/><path class="ts-flare" d="${shape(0.45)}" style="--d:${d};--o:${o}"/><path class="ts-surge" d="${shape(0.7)}"/>`;
  });
  return `<svg class="pc-scars" viewBox="0 0 160 90" aria-hidden="true"><rect class="ts-wash" x="-1" y="-1" width="162" height="92"/>${scars.join('')}</svg>`;
})();
// FALCON: 隼のスキンの意匠。白い陶器の細い縁に金の線。左上と右下の角から、黒い鋼の翼が上と横の縁に沿って伸びる。
// 翼は風切り羽を段々に重ねた形: 先を斜めに切り落とした帯を、縁から内へ黒・金・白・金と、内ほど短く並べる（曲線は使わず、角ばらせる）。
// 角には金の輪に光る核（ライフルの装填口）。上の真ん中に金の山形、落とした角に金の帯。
// 翼は上の縁の分を描き、x と y を入れ替えて（長さは 0.65 倍に縮めて）横の縁にも置く。TALON と同じく半分を描いて 180° 回す。
// 動き: 金の線を光が二手に分かれて走り（fc-glint）、核がゆっくり明滅する
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
  '<rect class="fc-slot" x="158.2" y="12" width="0.9" height="5" rx="0.45"/>';
const FALCON_FRAME =
  '<svg class="pc-falcon" viewBox="0 0 160 90" aria-hidden="true">' +
  // 外周は TALON と同じく、カードの縁より 1 外まで塗る
  '<path class="fc-plate" fill-rule="evenodd" d="M-1 -1H149.4L161 10.6V91H10.6L-1 79.4ZM2 2H149.6L158 10.4V88H10.4L2 79.6Z"/>' +
  '<path class="fc-line" d="M3 3H149.2L157 10.8V87H10.8L3 79.2Z"/>' +
  // 光は線の長さを 100 として、向かい合う 2 か所から同じ向きに半周ずつ走らせる（翼の下はくぐる）
  '<path class="fc-glint" pathLength="100" d="M3 3H149.2L157 10.8V87H10.8L3 79.2Z"/>' +
  `<g>${FALCON_HALF}</g><g transform="rotate(180 80 45)">${FALCON_HALF}</g>` +
  '</svg>';
// FALCON のカードの表面: 頂点に高さを持たせた凹凸の面を三角形に割り、左上からの光で面ごとの明暗を計算して塗る（フラットシェーディング）。
// 光に向く面は白、背を向ける面は黒の半透明で重ねるので、背景の明暗によらず凹凸に見える。三角形は濃さ（FACET_LEVELS 段）ごとに 1 本の path にまとめる。
// その上に、傾きの大きい面だけ同じ形の光る面（fc-lit）を重ねる。光がカードのまわりをゆっくり回る見立てで、面の向きと光の向きが合ったときに光る。
// 位置ではなく向きで順番が決まるので、離れた面が同時に光る。傾きが大きい面ほど強く光る。
// どのカードでも同じ模様になるよう、乱数は種を決めて作る。文字の下に敷くので、枠の SVG とは別に置く
const FACET_COLS = 12;
const FACET_ROWS = 7;
const FACET_LEVELS = 6;
const FACET_LEVEL_ALPHA = 0.04; // 1 段あたりの濃さ
const FACET_CONTRAST = 12; // 明暗の差を段に直す倍率
const FACET_LIGHT = [-0.5, -0.6, 0.62]; // 光の向き（左上の手前から）
const FACET_LIT_MIN_SLOPE = 0.35; // これより傾いた面だけ光らせる
const FACET_ORBIT_SEC = 10; // 光が一周する時間。index.html の fc-facet-lit と同じ値にする
const FALCON_FACETS = (() => {
  let seed = 20261104;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const cw = 160 / FACET_COLS;
  const ch = 90 / FACET_ROWS;
  const jitter = (size: number) => (rnd() - 0.5) * size * 0.7;
  // 高さ: 大きなうねり 2 つに、頂点ごとのばらつきを足す
  const height = (x: number, y: number) => 6 * Math.sin(x * 0.07 + y * 0.05 + 1) + 4 * Math.sin(y * 0.11 - x * 0.045 + 2.4) + (rnd() - 0.5) * 6;
  // 外周の頂点はカードの外へ出して、縁に隙間を作らない
  const verts = Array.from({ length: FACET_ROWS + 1 }, (_, r) =>
    Array.from({ length: FACET_COLS + 1 }, (_, c) => {
      const x = c === 0 ? -1 : c === FACET_COLS ? 161 : c * cw + jitter(cw);
      const y = r === 0 ? -1 : r === FACET_ROWS ? 91 : r * ch + jitter(ch);
      return [x, y, height(x, y)];
    }),
  );
  const faces = new Map<string, string>();
  let lit = '';
  const addTri = (a: number[], b: number[], c: number[]) => {
    const d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}L${c[0].toFixed(1)} ${c[1].toFixed(1)}Z`;
    // 面の向き（手前向きにそろえる）
    const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const flip = ux * vy - uy * vx < 0 ? -1 : 1;
    const [rawX, rawY, rawZ] = [flip * (uy * vz - uz * vy), flip * (uz * vx - ux * vz), flip * (ux * vy - uy * vx)];
    const len = Math.hypot(rawX, rawY, rawZ);
    const [nx, ny, nz] = [rawX / len, rawY / len, rawZ / len];
    // 平らな面より明るいか暗いかで、白か黒を重ねる
    const shade = nx * FACET_LIGHT[0] + ny * FACET_LIGHT[1] + nz * FACET_LIGHT[2] - FACET_LIGHT[2];
    const level = Math.min(FACET_LEVELS, Math.round(Math.abs(shade) * FACET_CONTRAST));
    const key = `${shade > 0 ? '#fff' : '#000'} ${(level * FACET_LEVEL_ALPHA).toFixed(2)}`;
    faces.set(key, (faces.get(key) ?? '') + d);
    const slope = Math.hypot(nx, ny);
    if (slope > FACET_LIT_MIN_SLOPE) {
      const turn = Math.atan2(ny, nx) / (Math.PI * 2) + 0.5;
      const strength = 0.45 + Math.min(1, (slope - FACET_LIT_MIN_SLOPE) / 0.4) * 0.55;
      lit += `<path class="fc-lit" d="${d}" style="--o:${(-turn * FACET_ORBIT_SEC).toFixed(2)}s;--a:${strength.toFixed(2)}"/>`;
    }
  };
  for (let r = 0; r < FACET_ROWS; r++) {
    for (let c = 0; c < FACET_COLS; c++) {
      const [tl, tr, bl, br] = [verts[r][c], verts[r][c + 1], verts[r + 1][c], verts[r + 1][c + 1]];
      if (rnd() < 0.5) { addTri(tl, tr, br); addTri(tl, br, bl); }
      else { addTri(tl, tr, bl); addTri(tr, br, bl); }
    }
  }
  const paths = [...faces].map(([key, d]) => {
    const [fill, alpha] = key.split(' ');
    return `<path class="fc-face" fill="${fill}" fill-opacity="${alpha}" d="${d}"/>`;
  });
  return `<svg class="pc-facets" viewBox="0 0 160 90" aria-hidden="true">${paths.join('')}${lit}</svg>`;
})();
// A shared hexagonal mesh; the moving light is a separate layer under the card text.
const eclipseHex = (inset: number) => {
  const spacing = 6;
  const r = spacing - inset;
  const h = Math.sqrt(3) * r / 2;
  const stepY = Math.sqrt(3) * spacing;
  let path = '';
  for (let col = -1; col <= 18; col++) {
    for (let row = -1; row <= 9; row++) {
      const x = col * 1.5 * spacing;
      const y = (row + (col % 2 === 0 ? 0 : 0.5)) * stepY;
      path += 'M' + (x - r).toFixed(2) + ' ' + y.toFixed(2) + 'l' + (r / 2).toFixed(2) + ' ' + (-h).toFixed(2) + 'h' + r.toFixed(2) + 'l' + (r / 2).toFixed(2) + ' ' + h.toFixed(2) + 'l' + (-r / 2).toFixed(2) + ' ' + h.toFixed(2) + 'h-' + r.toFixed(2) + 'Z';
    }
  }
  return path;
};
const ECLIPSE_HOLOGRAM =
  '<svg class="pc-hologram pc-hologram-base" viewBox="0 0 160 90" aria-hidden="true"><path d="' + eclipseHex(0) + '"/></svg>' +
  '<svg class="pc-hologram pc-hologram-wave" viewBox="0 0 160 90" aria-hidden="true"><path d="' + eclipseHex(0.45) + '"/></svg>';
// ECLIPSE: layered armor and a cool edge light.
const ECLIPSE_HALF =
  '<path class="ec-armor" d="M0 0H49L43 3H24L20 5H9L5 9V19L3 23V32L0 36Z"/>' +
  '<path class="ec-bevel" d="M2 2H44L40 3.1H22L19 5H8L4 9V20L2 24Z"/>' +
  '<path class="ec-slot" d="M9 6H19L17 7.2H9ZM6 10H7.2V18L6 19Z"/>' +
  '<path class="ec-detail" d="M25 2L23 3.3M29 2L27 3.3M33 2L31 3.3M2 27L3.3 25M2 31L3.3 29"/>' +
  '<path class="ec-rail" d="M48 2.4H68M2.4 38V69M122 2.4H148L157.6 12V29"/>' +
  '<path class="ec-detail" d="M126 1.5L124.5 3.3M130 1.5L128.5 3.3M134 1.5L132.5 3.3M151 6L155 10"/>' +
  '<path class="ec-slot" d="M157.2 16H158.5V25H157.2Z"/>';
const ECLIPSE_FRAME =
  '<svg class="pc-eclipse" viewBox="0 0 160 90" aria-hidden="true">' +
  '<path class="ec-rim" fill-rule="evenodd" d="M-1 -1H149.4L161 10.6V91H10.6L-1 79.4ZM3 3H148L157 12V87H12L3 78Z"/>' +
  '<path class="ec-inner" d="M4.1 35V8L8 4.1H148L155.9 12V55M155.9 55V82L152 85.9H12L4.1 78V35"/>' +
  '<g>' + ECLIPSE_HALF + '</g><g transform="rotate(180 80 45)">' + ECLIPSE_HALF + '</g>' +
  '<path class="ec-crown" d="M68 0H92L89 4H83.5L80 6L76.5 4H71Z"/>' +
  '<path class="ec-glint" pathLength="100" d="M4.1 4.1H148L155.9 12V85.9H12L4.1 78Z"/>' +
  '</svg>';
export const FRAME_PARTS = `<span class="pc-frame"><i></i></span><i class="c tl"></i><i class="c br"></i>${ECLIPSE_HOLOGRAM}${FALCON_FACETS}${TALON_SCARS}${TALON_FRAME}${FALCON_FRAME}${ECLIPSE_FRAME}<img class="pc-violet" src="./eclipse-frame-concept.svg" alt="" aria-hidden="true">`;
// 背景とフレームの見本（中身は空のカード）
export const partSwatch = (bgId: string, frame: string) => `<span class="${baseClass(bgId, frame)}">${FRAME_PARTS}</span>`;

import * as THREE from 'three';
import { addGlow } from '../fx/glow.js';
import { AXE_EDGE_T, AXE_HEAD_T, axeBevel, axePointFromMm } from './battleAxe.js';
import { MM, TALON_GLOW, bolt, createTalonMats, plate, tickTalonGlow } from './skinTalon.js';
// ---- 斧のスキン: 爪 ----
// 剣の「爪」と同じ黒い機械の斧。柄の形は元の斧のまま、頭は作り直す（刃先の位置は元の斧とほぼ同じで、縦に少し長い）。
//   頭: 柄から細く絞った首が伸び、その先で刃が上下へ大きく張り出す。刃先はまっすぐな一直線で、上の角は前へ尖り、
//       下の髭は後ろへ流れる。背には細く長い鉤爪（先が下へ曲がる）。くり抜きは無く、一段盛り上げた面を重ねる。
//       刃先の細い帯が赤く光り、首の面にも刃先と平行に赤い光の筋を一本入れる
//   爪: 柄の上端を包む襟から二本の爪が伸び、首の上の縁と髭の下の縁を外からつかむ。先は刃の側へ鉤のように曲がる
//   柄: 暗い地に斜めの帯を巻き、柄尻の近くにもボルト
// 輪郭は斧のモデルの座標を mm で書く（x は刃先の側が +、y は頭の側が +、原点は右手で握る位置）
// 頭の輪郭。刃先は EDGE の 4 点、面取りの境目は INNER の 4 点（両端は輪郭の辺の上に置き、帯の端と頭の輪郭をそろえる）
const BACK = [
    [36, 818], [-30, 818], // 柄とつながる所
    [-34, 880], [-130, 910], [-255, 893], [-135, 940], [-40, 968], // 背の鉤爪（細く長く、先が下へ曲がる）
    [-20, 985], [110, 985], // 首の上の縁
];
// 刃先と境目はどちらもまっすぐな線で、互いにほぼ平行（点は線の上に等間隔）
const EDGE = [[262, 1125], [258, 1005], [254, 885], [250, 765]];
const INNER = [[205, 1072], [201, 982], [197, 893], [193, 803]];
const BEARD = [[130, 845], [50, 885]]; // 髭の下の縁から首の付け根へ
const PANEL = [[-20, 890], [-10, 965], [110, 975], [165, 1025], [180, 900], [175, 840], [130, 858], [50, 893]];
const SEAM = [[150, 1000], [158, 1000], [156, 872], [148, 872]]; // 首の面の赤い光の筋
const HEAD_D = AXE_HEAD_T;
const PANEL_D = AXE_HEAD_T + 0.004;
const HA = 0.65; // 刃先の帯（赤）の始まり。面取りの境目 0 → 刃先 1 の割合
const COLLAR = [[-36, 730], [38, 726], [40, 812], [-36, 816]];
// 上の爪: 襟から首の背を上り、首の上の縁を外から押さえて、刃の上の角の手前で前へ曲がる
const CLAW_TOP = [[-38, 800], [-12, 800], [0, 972], [95, 986], [152, 1032], [70, 1008], [-28, 1004], [-40, 985]];
// 下の爪: 襟から髭の下の縁に沿って伸び、先は前へ鉤のように曲がる
const CLAW_LOW = [[14, 800], [40, 800], [60, 838], [150, 798], [178, 772], [140, 832], [62, 880], [30, 860]];
const COLLAR_D = 0.046; // 柄（面取り込みで 0.038）より厚く
const CLAW_D = 0.042; // 頭を表と裏から挟む
export const talonAxe = {
    build(parts, mats) {
        const m = createTalonMats(mats.metal.envMap);
        parts.head.visible = false;
        parts.bevel.visible = false;
        parts.handle.material = m.grip;
        const g = new THREE.Group();
        // 頭の板（刃先の点を境目の線に置き換えた輪郭）と、盛り上げた面
        g.add(new THREE.Mesh(plate([...BACK, ...INNER, ...BEARD], HEAD_D, 0.002), m.black), new THREE.Mesh(plate(PANEL, PANEL_D, 0.0015), m.black));
        const seam = new THREE.Mesh(plate(SEAM, PANEL_D + 0.001, 0.0008), m.edge);
        const seamGlow = addGlow(seam, TALON_GLOW);
        seam.onBeforeRender = () => tickTalonGlow(m.edge, seamGlow);
        g.add(seam);
        // 刃の面取りを、黒い地と赤い刃先の帯の 2 本に分けて作る
        const inner = INNER.map(axePointFromMm);
        const edgeLine = EDGE.map(axePointFromMm);
        const mid = inner.map(([x, y], i) => [x + (edgeLine[i][0] - x) * HA, y + (edgeLine[i][1] - y) * HA]);
        const midT = AXE_HEAD_T + (AXE_EDGE_T - AXE_HEAD_T) * HA;
        const edge = axeBevel(mid, midT, edgeLine, AXE_EDGE_T, m.edge);
        const glow = addGlow(edge, TALON_GLOW);
        edge.onBeforeRender = () => tickTalonGlow(m.edge, glow);
        g.add(axeBevel(inner, AXE_HEAD_T, mid, midT, m.black), edge);
        g.add(new THREE.Mesh(plate(COLLAR, COLLAR_D), m.black), new THREE.Mesh(plate(CLAW_TOP, CLAW_D), m.black), new THREE.Mesh(plate(CLAW_LOW, CLAW_D), m.black));
        bolt(g, m, 0, 770, COLLAR_D);
        bolt(g, m, -25, 900, CLAW_D, 0.0028);
        bolt(g, m, 100, 837, CLAW_D, 0.0028);
        bolt(g, m, -90, 925, HEAD_D, 0.0028); // 鉤爪の付け根
        // 握る所（指を守る爪より下）に斜めに巻いた帯
        for (let y = -290; y < 100; y += 18) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.0024, 0.0396), m.band);
            band.position.set(0.0015, y * MM, 0);
            band.rotation.z = -0.41;
            g.add(band);
        }
        bolt(g, m, 2, -315, 0.038);
        return g;
    },
};

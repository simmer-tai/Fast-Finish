import * as THREE from 'three';
import { addGlow, removeGlow } from '../fx/glow.js?v=2fb05089';
import { AXE_EDGE_T, axeBevel, axePointFromMm } from './battleAxe.js?v=2fb05089';
import { HOLO_GLOW, createHoloMats, holoMat, tickHoloGlow } from './skinGhostline.js?v=2fb05089';
import { MM, plate } from './skinTalon.js?v=2fb05089';
// ---- 斧のスキン: ホロライン ----
// 剣のホロラインと同じ、黒い骨格に光の帯の刃先を張った斧。柄の形は元の斧のまま、頭は作り直す。
//   頭: 細く絞った首から、刃へ向かって上下に広がる黒い頭。背には細く長いスパイク。
//       刃は幅の広い面取りで薄くなり、その先の細い帯がシアンに光る。光る帯は黒い頭の上下の端より先へ光だけで伸び、
//       上の角と髭の先をとがらせる（剣の、骨格より先へ光だけが伸びる切っ先と同じ）。刃先の外には投影刃が浮く
//       刃の面には前へ傾いた 3 本のスリット。中は暗いホログラムのガラスで、前の壁がシアンに光る
//       背の側には一段盛り上げた板を重ね、スパイクから首へ溝と導光路を通す。上の縁の外にも光の線を浮かべる
//   柄: 黒い地。握りは剣の柄と同じく、光る芯の上に角を落とした黒い節を積み、節の隙間から芯がのぞく。節の面には頭のスリットと同じ傾きの光る切れ込み。
//       握りの上下は光の線を巻いた襟で締める。握りより上は両面の中央に溝と導光路を通し、頭の付け根の襟の下に逆に回る 2 つの六角の輪
// 輪郭は斧のモデルの座標を mm で書く（x は刃先の側が +、y は頭の側が +、原点は右手で握る位置）
// 折れ線を、進む向きの左手へ d だけずらす（刃先の線は上へ進むので、左手が頭の内側）
function offset(line, d) {
    return line.map(([x, y], i) => {
        const [ax, ay] = line[Math.max(0, i - 1)];
        const [bx, by] = line[Math.min(line.length - 1, i + 1)];
        const len = Math.hypot(bx - ax, by - ay);
        return [x - ((by - ay) / len) * d, y + ((bx - ax) / len) * d];
    });
}
// 線の端の辺を、その向きへ len だけ伸ばした点
const beyond = ([ax, ay], [bx, by], len) => {
    const d = Math.hypot(bx - ax, by - ay);
    return [bx + ((bx - ax) / d) * len, by + ((by - ay) / d) * len];
};
// 刃先（髭の先 → 上の角）。面取りは 42 mm 内側から始まり、刃先の 10 mm が光る帯
const EDGE = [[250, 820], [266, 880], [270, 950], [260, 1020], [238, 1075]];
const INNER = offset(EDGE, 42);
const MID = offset(EDGE, 10);
// 光だけでできた上の角と髭の先（刃先の両端の辺を伸ばした先）
const HORN_LOW = beyond(EDGE[1], EDGE[0], 55);
const HORN_TOP = beyond(EDGE[3], EDGE[4], 60);
// 頭: 首 → 髭の下の縁 → 面取りの始まりの線を上る → 上の縁 → スパイク
const HEAD = [
    [-30, 815], [32, 815], [36, 835], [90, 866], [150, 852], [185, 838],
    ...INNER,
    [150, 1036], [95, 1012], [40, 992], [-45, 995], [-205, 972], [-55, 952], [-36, 900],
];
const HEAD_D = 0.026;
// 背の側に重ねる一段盛り上げた板と、その上の溝・導光路（スパイクの中ほどから首へ下りる）
const PANEL = [[-190, 971], [-50, 989], [30, 986], [44, 920], [30, 830], [-28, 830], [-38, 900], [-58, 955]];
const PANEL_D = HEAD_D + 0.004;
const VOID = [[-150, 974], [-10, 970], [-10, 850], [-18, 850], [-18, 962], [-150, 967]];
const SIGNAL = [[-140, 971.8], [-12.5, 968], [-12.5, 856], [-15.5, 856], [-15.5, 964.5], [-140, 969]];
// 刃の面のスリット（下の端の y, 上の端の y, 下の端の後ろの x）。前へ傾け、刃先に近いほど長くする
const SLOT_W = 16;
const SLOT_LEAN = 0.22; // 高さに対して前へ傾く割合
const SLOTS = [[905, 985, 70], [890, 1000, 110], [875, 1015, 150]];
const slotOutline = ([y0, y1, x0], from = 0, to = SLOT_W) => {
    const lean = SLOT_LEAN * (y1 - y0);
    return [[x0 + from, y0], [x0 + to, y0], [x0 + to + lean, y1], [x0 + from + lean, y1]];
};
// 頭の付け根の襟と、それを一周する光の線
const COLLAR = [[-36, 780], [39, 780], [39, 822], [-36, 822]];
const COLLAR_LINE = [[-37.5, 799], [40.5, 799], [40.5, 801.2], [-37.5, 801.2]];
// 握りより上の柄の両面の溝と導光路
const HANDLE_VOID = [[1, 240], [7, 240], [7, 770], [1, 770]];
const HANDLE_SIGNAL = [[2.8, 250], [5.2, 250], [5.2, 760], [2.8, 760]];
const HANDLE_D = 0.038; // 元の柄の厚み（面取り込み）
// 握り: 指を守る爪の下から柄尻の鉤の上まで。芯は元の柄より一回り大きく、節はさらに大きい（x は元の柄の両側の縁より外）
const GRIP_Y = [-292, 128];
const GRIP_X = [-33, 46];
const GRIP_SEGMENTS = 4;
const GRIP_GAP = 2.5;
const GRIP_CHAMFER = 4; // 節の角を落とす幅
const GRIP_SLIT = [24, 44]; // 節の面の切れ込みの下の端の x と高さ
// 握りの上下の襟（y0, y1）。真ん中に光の線を巻く
const GRIP_COLLARS = [[128, 142], [-306, -292]];
// 襟の下に浮かぶ輪（y, 内径, 外径, 回る速さ。mm と rad/s）
const HALOS = [[760, 44, 45.5, 0.9], [738, 38, 39, -1.7]];
// 穴の開いた板（plate と同じく、厚み depth を z = 0 の両側へ）
function plateWithHoles(outline, holes, depth, bevel) {
    const v = ([x, y]) => new THREE.Vector2(x * MM, y * MM);
    const shape = new THREE.Shape(outline.map(v));
    for (const h of holes)
        shape.holes.push(new THREE.Path(h.map(v)));
    const core = depth - bevel * 2;
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: core, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 1,
    });
    geo.translate(0, 0, -core / 2);
    return geo;
}
// 折れ線の左手 d0〜d1 に沿った細い帯の輪郭。head・tail を渡すと、両端をその点へとがらせて伸ばす
function stripAlong(line, d0, d1, head, tail) {
    return [...(head ? [head] : []), ...offset(line, d0), ...(tail ? [tail] : []), ...offset(line, d1).reverse()];
}
export const ghostlineAxe = {
    build(parts, mats) {
        const m = createHoloMats(mats.metal.envMap);
        parts.head.visible = false;
        parts.bevel.visible = false;
        parts.handle.material = m.frame;
        const g = new THREE.Group();
        const add = (geo, mat) => {
            const mesh = new THREE.Mesh(geo, mat);
            g.add(mesh);
            return mesh;
        };
        // 頭（スリットをくり抜く）と、背の側の盛り上げた板・導光路
        add(plateWithHoles(HEAD, SLOTS.map((s) => slotOutline(s)), HEAD_D, 0.002), m.frame);
        add(plate(PANEL, PANEL_D, 0.0015), m.frame);
        add(plate(VOID, PANEL_D + 0.0015, 0.0005), m.void);
        add(plate(SIGNAL, PANEL_D + 0.0021, 0.00045), m.signal);
        // スリットの前の壁を光らせる
        for (const s of SLOTS)
            add(plate(slotOutline(s, SLOT_W - 2.5, SLOT_W + 0.5), HEAD_D - 0.003, 0.0004), m.signal);
        // 刃: 面取りの始まりから光る帯の手前までは黒い面、その先が光る帯。光る帯は両端で頭より先へ伸びてとがる
        const toAxe = (o) => o.map(axePointFromMm);
        const innerT = HEAD_D - 0.004;
        const k = 1 - 10 / 42; // 面取りの始まり 0 → 刃先 1 での、光る帯の始まり
        const midT = innerT + (AXE_EDGE_T - innerT) * k;
        g.add(axeBevel(toAxe(INNER), innerT, toAxe(MID), midT, m.frame));
        const edge = axeBevel(toAxe([HORN_LOW, ...MID, HORN_TOP]), midT, toAxe([HORN_LOW, ...EDGE, HORN_TOP]), AXE_EDGE_T, m.edge);
        g.add(edge);
        const glow = addGlow(edge, HOLO_GLOW); // にじませるのは刃先の帯だけ
        // 柄: 頭の付け根の襟と光の線、握りより上の溝と導光路
        add(plate(COLLAR, 0.044), m.frame);
        add(plate(COLLAR_LINE, 0.0458, 0.0004), m.signal);
        add(plate(HANDLE_VOID, HANDLE_D + 0.0015, 0.0005), m.void);
        add(plate(HANDLE_SIGNAL, HANDLE_D + 0.0022, 0.00045), m.signal);
        // 握り: 光る芯の上に節を隙間をあけて積み、節の面に切れ込みを入れる。上下は襟で締める
        const [gx0, gx1] = GRIP_X;
        const [gy0, gy1] = GRIP_Y;
        add(plate([[gx0 + 2.5, gy0], [gx1 - 2.5, gy0], [gx1 - 2.5, gy1], [gx0 + 2.5, gy1]], HANDLE_D + 0.0025, 0.0005), m.signal);
        const segLen = (gy1 - gy0 - GRIP_GAP * (GRIP_SEGMENTS - 1)) / GRIP_SEGMENTS;
        const c = GRIP_CHAMFER;
        for (let i = 0; i < GRIP_SEGMENTS; i++) {
            const y1 = gy1 - i * (segLen + GRIP_GAP);
            const y0 = y1 - segLen;
            add(plate([[gx0 + c, y0], [gx1 - c, y0], [gx1, y0 + c], [gx1, y1 - c], [gx1 - c, y1], [gx0 + c, y1], [gx0, y1 - c], [gx0, y0 + c]], 0.045, 0.0025), m.frame);
            const [sx, sh] = GRIP_SLIT;
            const sy = (y0 + y1) / 2 - sh / 2;
            const lean = SLOT_LEAN * sh;
            add(plate([[sx, sy], [sx + 3, sy], [sx + 3 + lean, sy + sh], [sx + lean, sy + sh]], 0.0456, 0.0004), m.signal);
        }
        for (const [y0, y1] of GRIP_COLLARS) {
            add(plate([[gx0 - 1, y0], [gx1 + 1, y0], [gx1 + 1, y1], [gx0 - 1, y1]], 0.047, 0.002), m.frame);
            const ym = (y0 + y1) / 2;
            add(plate([[gx0 - 2.5, ym - 0.8], [gx1 + 2.5, ym - 0.8], [gx1 + 2.5, ym + 0.8], [gx0 - 2.5, ym + 0.8]], 0.0478, 0.0004), m.signal);
        }
        // ホログラム: スリットのガラス・刃先の外の投影刃（光の角よりさらに先まで）・上の縁の外の光の線・襟の下の輪
        const holoFill = holoMat(0x06222b, 0.6);
        const holoEdge = holoMat(0x22c8f0, 0.6);
        const holoLine = holoMat(0x5fe4ff, 0.7);
        for (const s of SLOTS)
            add(plate(slotOutline(s, -1, SLOT_W + 1), 0.001, 0.0002), holoFill);
        const reach = [HORN_LOW, ...EDGE, HORN_TOP];
        add(plate(stripAlong(reach, -6, -8.5, beyond(EDGE[0], HORN_LOW, 22), beyond(EDGE[4], HORN_TOP, 28)), 0.0012, 0.0003), holoEdge);
        add(plate(stripAlong([[-160, 989], [-45, 1004], [40, 1001], [95, 1021], [150, 1045], [195, 1066]], 0, 1.2), 0.0012, 0.0003), holoLine);
        const halos = HALOS.map(([y, r0, r1]) => {
            const geo = new THREE.RingGeometry(r0 * MM, r1 * MM, 6, 1);
            geo.rotateX(-Math.PI / 2);
            const halo = add(geo, holoLine);
            halo.position.set(0.0015, y * MM, 0);
            return halo;
        });
        edge.onBeforeRender = () => tickHoloGlow(m, glow, [holoFill, holoEdge, holoLine], halos, HALOS.map((h) => h[3]));
        g.userData.undo = () => removeGlow(glow);
        return g;
    },
};

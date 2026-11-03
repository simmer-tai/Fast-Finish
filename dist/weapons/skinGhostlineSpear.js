import * as THREE from 'three';
import { addGlow, removeGlow } from '../fx/glow.js';
import { HOLO_GLOW, createHoloMats, holoBlade, holoMat, tickHoloGlow } from './skinGhostline.js';
import { MM, plate } from './skinTalon.js';
// ---- 槍のスキン: ホロライン ----
// 剣のホロラインの刀身を穂先にした槍。長さと握る位置は元の槍のまま（振りの支点・切っ先と石突きの当たりが変わらないように）。
//   穂先: 剣の刀身（くり抜いた黒い骨格・光る帯の刃先・光だけの切っ先・窓のホログラム）を穂先の長さに縮める。
//         窓の区間を詰め、切っ先の側はあまり縮めずにとがったまま残す
//   鍔・口金: 薄い黒い板の間に導光板を挟んだ六角の鍔と、光の線を一周させた六角の口金。口金の下に逆に回る 2 つの六角の輪
//   柄: 黒い八角の柄。刃先の側と棟の側に細い導光路を通す。握る 2 か所は、光る芯の上に黒い節を積み、節の隙間から芯がのぞく
//   石突き: 黒い六角の蓋と錐。錐の先だけ光でとがる
// 回すと柄の導光路と両端の光が輪を描く。輪郭は槍のモデルの座標を mm で書く（x は刃先の側が +、y は切っ先の側が +、原点は両手で握る間）
// 剣の刀身の y（刃の付け根・窓の始まり・窓の終わり・切っ先）を、穂先のこの y へ写す。間はまっすぐにつなぐ
const SWORD_Y = [130, 262, 672, 872];
const SPEAR_Y = [548, 615, 820, 979]; // 切っ先は元の槍と同じ（届く距離が変わらないように）
const WIDTH = 1.15; // 剣より少し幅広に
const toSpear = ([x, y]) => {
    let i = 0; // 範囲の外は端の区間を延ばす
    while (i < SWORD_Y.length - 2 && y >= SWORD_Y[i + 1])
        i++;
    const k = (y - SWORD_Y[i]) / (SWORD_Y[i + 1] - SWORD_Y[i]);
    return [x * WIDTH, SPEAR_Y[i] + k * (SPEAR_Y[i + 1] - SPEAR_Y[i])];
};
// 刃の根元を包む金具
const HABAKI = [[-25, 546], [23, 546], [25, 575], [-25, 578]];
// 鍔: 刃に直交する薄い黒い板を 2 枚重ね、間に一回り小さい導光板を挟む（輪郭は x と厚みの向き z の mm）
const GUARD = [[30, 0], [22, 12], [-22, 12], [-36, 0], [-22, -12], [22, -12]];
const GUARD_LAYERS = [
    [534, 539.5, 1, 'frame'],
    [539.5, 540.8, 0.94, 'signal'],
    [540.8, 548, 0.88, 'frame'],
];
// 口金（y0, y1, 下の半径, 上の半径）と、それを一周する光の線の高さ
const SOCKET = [505, 534, 15, 16.5];
const SOCKET_LINE = 516;
// 口金の下に浮かぶ輪（y, 内径, 外径, 回る速さ。mm と rad/s）
const HALOS = [[490, 24, 25, 0.9], [472, 19, 19.6, -1.7]];
// 柄の導光路（刃先の側と棟の側）
const SHAFT_R = 12.5;
const LINE_Y = [-770, 505];
// 握り: 元の巻きの位置に、光る芯と節。両端は六角の金具で留める
const GRIP_LEN = 180;
const GRIP_SEGMENTS = 3;
const GRIP_GAP = 2;
// 石突き: 蓋（y0, y1, 下の半径, 上の半径）・錐・光の先
const BUTT = [-792, -772, 14.5, 15.5];
const SPIKE = [-824, -792, 12];
const SPIKE_TIP = [-842, -824, 5];
// y0〜y1 の角柱（sides 角。r0 は下の端、r1 は上の端の半径。mm）
function prism(y0, y1, r0, r1, sides = 8) {
    const geo = new THREE.CylinderGeometry(r1 * MM, r0 * MM, (y1 - y0) * MM, sides);
    geo.translate(0, ((y0 + y1) / 2) * MM, 0);
    return geo;
}
export const ghostlineSpear = {
    build(parts, mats) {
        const m = createHoloMats(mats.metal.envMap);
        for (const name of ['blade', 'guard', 'collar', 'wrap0', 'wrap1', 'butt', 'spike'])
            if (parts[name])
                parts[name].visible = false;
        parts.shaft.material = m.frame;
        const g = new THREE.Group();
        const add = (geo, mat) => {
            const mesh = new THREE.Mesh(geo, mat);
            g.add(mesh);
            return mesh;
        };
        // 穂先
        const holoFill = holoMat(0x06222b, 0.6);
        const holoEdge = holoMat(0x22c8f0, 0.6);
        const holoLine = holoMat(0x5fe4ff, 0.7);
        const blade = holoBlade(m, { fill: holoFill, edge: holoEdge, line: holoLine }, toSpear);
        g.add(blade.g);
        const glow = addGlow(blade.edge, HOLO_GLOW); // にじませるのは刃先の帯と石突きの光の先だけ
        // 鍔と口金
        add(plate(HABAKI, 0.02), m.frame);
        for (const [y0, y1, k, mat] of GUARD_LAYERS) {
            const geo = plate(GUARD.map(([x, z]) => [x * k, z * k]), (y1 - y0) * MM, 0.0006);
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, ((y0 + y1) / 2) * MM, 0);
            add(geo, m[mat]);
        }
        const [sy0, sy1, sr0, sr1] = SOCKET;
        add(prism(sy0, sy1, sr0, sr1, 6), m.frame);
        const lineR = sr0 + ((SOCKET_LINE - sy0) / (sy1 - sy0)) * (sr1 - sr0) + 0.4;
        add(prism(SOCKET_LINE - 0.7, SOCKET_LINE + 0.7, lineR, lineR, 6), m.signal);
        const halos = HALOS.map(([y, r0, r1]) => {
            const geo = new THREE.RingGeometry(r0 * MM, r1 * MM, 6, 1);
            geo.rotateX(-Math.PI / 2);
            const halo = add(geo, holoLine);
            halo.position.y = y * MM;
            return halo;
        });
        // 柄の導光路
        const [ly0, ly1] = LINE_Y;
        for (const side of [-1, 1]) {
            add(new THREE.BoxGeometry(0.0014, (ly1 - ly0) * MM, 0.003).translate(side * SHAFT_R * MM, ((ly0 + ly1) / 2) * MM, 0), m.signal);
        }
        // 握り: 光る芯の上に節を隙間をあけて積み、両端を六角の金具で留める
        const segLen = (GRIP_LEN - GRIP_GAP * (GRIP_SEGMENTS - 1)) / GRIP_SEGMENTS;
        for (const wrap of [parts.wrap0, parts.wrap1]) {
            const y = wrap.position.y / MM;
            const top = y + GRIP_LEN / 2;
            add(prism(y - GRIP_LEN / 2, top, 13.9, 13.9), m.signal);
            for (let i = 0; i < GRIP_SEGMENTS; i++) {
                const y1 = top - i * (segLen + GRIP_GAP);
                add(prism(y1 - segLen, y1, 15.2, 15.8), m.frame);
            }
            for (const s of [-1, 1])
                add(prism(y + s * (GRIP_LEN / 2 + 5) - 5, y + s * (GRIP_LEN / 2 + 5) + 5, 16.5, 16.5, 6), m.hardware);
        }
        // 石突き
        const [by0, by1, br0, br1] = BUTT;
        add(prism(by0, by1, br0, br1, 6), m.frame);
        add(prism(by1 - 6.7, by1 - 5.3, br1 + 0.3, br1 + 0.3, 6), m.signal);
        add(prism(SPIKE[0], SPIKE[1], SPIKE_TIP[2], SPIKE[2], 6), m.frame);
        const tip = add(prism(SPIKE_TIP[0], SPIKE_TIP[1], 0, SPIKE_TIP[2], 6), m.edge);
        const tipGlow = addGlow(tip, HOLO_GLOW);
        blade.edge.onBeforeRender = () => {
            tickHoloGlow(m, glow, [holoFill, holoEdge, holoLine], halos, HALOS.map((h) => h[3]));
            tipGlow.strength = glow.strength;
        };
        g.userData.undo = () => {
            removeGlow(glow);
            removeGlow(tipGlow);
        };
        return g;
    },
};

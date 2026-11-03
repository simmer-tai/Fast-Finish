import * as THREE from 'three';
import { addGlow } from '../fx/glow.js?v=9bd5fe3e';
import { MM, TALON_GLOW, createTalonMats, plate, tickTalonGlow } from './skinTalon.js?v=9bd5fe3e';
import { skinFx } from './skins.js?v=9bd5fe3e';
// ---- スナイパーライフルのスキン: 爪 ----
// リボルバーの「爪」と同じ黒い機械の銃。形は元のライフルのまま、色は skins.ts の looks で黒くし、飾りを足す。
//   爪: 先台の先から、厚い爪が銃身と弾倉の筒を左右から挟む。上下二本の指で筒をつかむ形（横から見て前が開いた C）で、
//       指の先は前へ尖る。上下の指の間から、赤い線がのぞく。爪を貫くボルト
//   線: 機関部と先台の側面に、赤く光る細い線を通す
//   刃: 弾倉の筒の先に留め具をはめ、銃口の下から角ばった切っ先（切り出し）の刃を前へ突き出す。
//       刃先は下の縁で、細い帯が赤く光って切っ先へ流れ込む
//   光: 赤い所はどれも外へ光をにじませる（刃先の帯がいちばん強く、線と輪はうっすら）。
//       銃口の輪は、撃った直後だけ強くにじませ、すぐに引く（撃った名残）。スコープの対物の縁にも赤い輪
// 輪郭は横から見た座標を mm で書く（[z, y]。z は銃口の側が -、y は握る位置が 0。銃身の軸は y = 16）
const BORE_Y = 16;
const CLAW = [
    [-490, 27], [-560, 29], [-645, 21], [-592, 13], [-560, 11], // 上の指（銃身を挟む）
    [-560, 3], [-612, 0], [-668, -11], [-604, -16], [-490, -24], // 下の指（弾倉の筒を挟む）
];
const CLAW_X = 10.5; // 銃身の側面に内側の面を重ねる
const CLAW_T = 0.004;
const CLAW_BOLTS = [[-532, 21], [-532, -13]];
const CLAW_LINE = { y: 7, front: -625, back: -525 }; // 指の間からのぞく赤い線（銃身と筒の間）
// 側面の赤い線: 先台と機関部（幅はそれぞれの厚みより少し出す）
const SIDE_LINES = [
    { y: -6, front: -480, back: -205, width: 32.6 },
    { y: -6, front: -200, back: -12, width: 26.6 },
];
const MUZZLE_Z = -810.5; // 銃口の輪
const SCOPE = { y: 70, z: -302.5 }; // 対物の縁
// 刃の留め具: 弾倉の筒の先を包む
const MOUNT = [[-688, 11], [-748, 9], [-748, -9], [-688, -11]];
const MOUNT_T = 0.016;
// 刃の黒い地。上は平らに伸ばし、切っ先で斜めに落とす。下の縁は赤い帯の上の縁に沿わせる
const BLADE = [[-740, 6], [-842, 6], [-888, -1], [-868, -3], [-740, -3]];
// 刃先の赤い帯: 下の縁に沿って、切っ先へ向けて細くなって流れ込む
const BLADE_EDGE = [[-740, -3], [-868, -3], [-888, -1], [-870, -7], [-740, -7]];
const BLADE_T = 0.0036;
const EDGE_T = 0.0022; // 帯は地より薄くして、刃先を鋭く見せる
const GLOW_K = 0.45; // 刃先のにじみの濃さ
const LINE_GLOW_K = 0.2; // 線のにじみの濃さ
const MUZZLE_GLOW = 0.2; // 銃口の輪のふだんのにじみの濃さ
const MUZZLE_AFTERGLOW = 0.9; // 撃った直後に銃口のにじみへ足す濃さ（skinFx.flare に合わせて引く）
// 横から見た輪郭を、銃の横（x）へ押し出した板にする
function sidePlate(outline, depth, bevel) {
    return plate(outline, depth, bevel).rotateY(-Math.PI / 2); // 輪郭の x を銃の z に、押し出す向きを銃の x に
}
// 左右を貫くボルト。両側の外に頭が出る
function crossBolt(g, m, z, y, span) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(2 * MM, 2 * MM, span + 5 * MM, 8).rotateZ(Math.PI / 2), m.bolt);
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * MM, 0.8 * MM, span + 5.4 * MM, 6).rotateZ(Math.PI / 2), m.black);
    head.position.set(0, y * MM, z * MM);
    socket.position.copy(head.position);
    g.add(head, socket);
}
// Z 軸に沿った赤い輪
function ring(r, len, sides, y, z, m) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * MM, r * MM, len * MM, sides).rotateX(-Math.PI / 2), m.edge);
    mesh.position.set(0, y * MM, z * MM);
    return mesh;
}
// 赤い線（左右の面から少し出る板）
function line(width, y, front, back, m) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width * MM, 1.8 * MM, (back - front) * MM), m.edge);
    mesh.position.set(0, y * MM, ((front + back) / 2) * MM);
    return mesh;
}
export const talonRifle = {
    build(_parts, mats) {
        const m = createTalonMats(mats.metal.envMap);
        const g = new THREE.Group();
        // 爪と、爪を貫くボルト、指の間の線
        for (const side of [-1, 1]) {
            const claw = new THREE.Mesh(sidePlate(CLAW, CLAW_T, 0.0012), m.black);
            claw.position.x = side * CLAW_X * MM;
            g.add(claw);
        }
        for (const [z, y] of CLAW_BOLTS)
            crossBolt(g, m, z, y, CLAW_X * 2 * MM);
        const clawLine = line((CLAW_X - CLAW_T / MM / 2) * 2 + 0.4, CLAW_LINE.y, CLAW_LINE.front, CLAW_LINE.back, m);
        // 側面の線と指の間の線（うっすらにじませる）
        for (const l of [...SIDE_LINES.map((l) => line(l.width, l.y, l.front, l.back, m)), clawLine]) {
            const glow = addGlow(l, TALON_GLOW);
            l.onBeforeRender = () => tickTalonGlow(m.edge, glow, LINE_GLOW_K);
            g.add(l);
        }
        // 銃口の下の刃と留め具
        g.add(new THREE.Mesh(sidePlate(MOUNT, MOUNT_T, 0.0015), m.black));
        crossBolt(g, m, -738, 0, MOUNT_T);
        g.add(new THREE.Mesh(sidePlate(BLADE, BLADE_T, 0.0006), m.black));
        const edge = new THREE.Mesh(sidePlate(BLADE_EDGE, EDGE_T, 0.0004), m.edge);
        const glow = addGlow(edge, TALON_GLOW);
        edge.onBeforeRender = () => tickTalonGlow(m.edge, glow, GLOW_K); // 赤い所はどれも同じマテリアルなので、ここで一緒に光らせる
        g.add(edge);
        // 銃口の輪（撃った直後だけ強める）とスコープの対物の縁
        const muzzle = ring(8.7, 2.5, 8, BORE_Y, MUZZLE_Z, m);
        const muzzleGlow = addGlow(muzzle, TALON_GLOW);
        muzzle.onBeforeRender = () => (muzzleGlow.strength = MUZZLE_GLOW + skinFx.flare * MUZZLE_AFTERGLOW);
        const lens = ring(16.9, 2.4, 10, SCOPE.y, SCOPE.z, m);
        addGlow(lens, TALON_GLOW).strength = LINE_GLOW_K;
        g.add(muzzle, lens);
        return g;
    },
};

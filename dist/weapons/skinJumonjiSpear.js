import * as THREE from 'three';
import { loftRings } from '../geometry.js?v=6b2d2aee';
import { SPEAR_TIP_Y } from './spear.js?v=6b2d2aee';
import { MM, plate } from './skinTalon.js?v=6b2d2aee';
// ---- 槍のスキン: 十文字 ----
// 古い十文字槍の形。色は元の槍のまま、穂先と金具を作り直す（柄・巻き・石突きは元のまま）。
//   穂: 反りのある片刃をやめ、まっすぐな両刃にする。断面は真ん中に鎬の通る菱形で、根元から少しふくらんでから切っ先へ絞る
//   枝刃: 穂の根元から左右へ張り出し、切っ先の側へ反り上がって尖る 2 本の刃。穂と合わせて十字に見える
//   口金: 角棒の鍔と六角の金具をやめ、柄の先に長い筒をかぶせて 2 本の輪で締める
// 切っ先の位置は元の槍と同じ（攻撃の届く距離が変わらないように）。
// 寸法はモデルの座標（m。x は刃先の側が +、y は切っ先の側が +、原点は両手で握る間）。柄の先は y = 0.525
const SHAFT_TOP = 0.525;
const SOCKET = { from: SHAFT_TOP - 0.01, len: 0.062, r: 0.0152 }; // 柄の先を 10 mm 包む
const BASE = SOCKET.from + SOCKET.len - 0.004; // 穂の付け根（口金に少し埋める）
// 穂の断面を決める高さ: [付け根からの高さ, 幅, 厚み]。最後に切っ先の 1 点
const BLADE = [
    [0, 0.026, 0.012],
    [0.05, 0.034, 0.012],
    [0.2, 0.03, 0.01],
    [0.32, 0.018, 0.007],
];
// 右の枝刃（左は映す）。根元を穂の中に埋め、外へ伸びて上へ反り上がる。輪郭は mm
const B = BASE / MM;
const ARM = [[4, B + 4], [40, B + 2], [70, B + 10], [90, B + 30], [98, B + 64], [84, B + 36], [64, B + 24], [36, B + 20], [4, B + 22]];
const ARM_D = 0.008;
const mirrorX = (o) => o.map(([x, y]) => [-x, y]);
function bladeGeometry() {
    // 菱形の断面（元の刃と同じ回り: 棟の側 -X → +Z → 刃先の側 +X → -Z）
    const rings = BLADE.map(([h, w, t]) => {
        const y = BASE + h;
        return [new THREE.Vector3(-w / 2, y, 0), new THREE.Vector3(0, y, t / 2), new THREE.Vector3(w / 2, y, 0), new THREE.Vector3(0, y, -t / 2)];
    });
    rings.push([new THREE.Vector3(0, SPEAR_TIP_Y, 0)]);
    return loftRings(rings);
}
export const jumonjiSpear = {
    build(parts, mats) {
        for (const name of ['blade', 'guard', 'collar'])
            if (parts[name])
                parts[name].visible = false;
        const metal = mats.metal.clone();
        const g = new THREE.Group();
        const at = (geo, y) => {
            const m = new THREE.Mesh(geo, metal);
            m.position.y = y;
            g.add(m);
        };
        g.add(new THREE.Mesh(bladeGeometry(), metal));
        g.add(new THREE.Mesh(plate(ARM, ARM_D), metal), new THREE.Mesh(plate(mirrorX(ARM), ARM_D), metal));
        // 口金: 柄の先にかぶせた八角の筒。上の端は穂の付け根へ細る。2 本の輪で締める
        at(new THREE.CylinderGeometry(SOCKET.r - 0.002, SOCKET.r, SOCKET.len, 8), SOCKET.from + SOCKET.len / 2);
        for (const y of [SOCKET.from + 0.008, SOCKET.from + SOCKET.len - 0.016])
            at(new THREE.CylinderGeometry(SOCKET.r + 0.0018, SOCKET.r + 0.0018, 0.006, 8), y);
        return g;
    },
};

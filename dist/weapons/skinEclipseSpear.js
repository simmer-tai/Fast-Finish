import * as THREE from 'three';
import { loftRings } from '../geometry.js?v=e316db84';
import { addGlow, removeGlow } from '../fx/glow.js?v=e316db84';
import { SPEAR_BUTT_Y, SPEAR_TIP_Y } from './spear.js?v=e316db84';
import { MM } from './skinTalon.js?v=e316db84';
// ---- 槍のスキン: 蝕 ----
// 白く光る芯を、黒い装甲が覆い隠した槍。光は装甲の継ぎ目からだけ漏れる。長さと握る位置は元の槍のまま。
//   穂先: 菱形の断面の黒い装甲を 4 つの節に分け、節の境を切っ先へ向いた「く」の字に断つ。
//         装甲の中には一回り薄い白い芯が通り、継ぎ目の溝の底で光る。装甲の縁は厚み 0 まで絞って刃にする
//   首: 柄の先の黒い六角の口金から、穂先へ細くすぼまる。口金と首の間に光の継ぎ目
//   柄: 黒い柄に、握る 2 か所は暗い灰色の握り。握りの両端の金具との間にも光の継ぎ目
//   石突き: 黒い六角の蓋と錐。間に光の継ぎ目
// 刃・鍔・口金・巻き・石突きは隠して作り直し、柄は looks のマテリアルのまま。
// 寸法は槍のモデルの座標を mm で書く（x は刃先の側が +、y は切っ先の側が +、原点は両手で握る間）
const TIP = SPEAR_TIP_Y / MM;
// 穂先の輪郭: [y, 半幅]。切っ先の手前で細く絞る
const WIDTH = [[570, 9], [625, 21], [700, 19], [880, 9], [945, 3], [TIP, 0]];
// 鎬（真ん中）の厚みの半分: [y, t]
const THICK = [[570, 7], [700, 6.5], [900, 3.5], [TIP, 0]];
// 装甲の節（縁の y で [下, 上]）。節の境は真ん中が縁より CHEVRON だけ切っ先の側へ出る
const SEGMENTS = [[570, 658], [662, 755], [759, 848], [852, 940]];
const CHEVRON = 22;
const CORE_T = 0.42; // 芯の厚み（装甲に対する割合）。継ぎ目の溝の深さになる
const GRIP_R = 0.0146;
const GRIP_LEN = 0.18; // 元の巻きと同じ長さ
const lerpAt = (table, y) => {
    for (let i = 1; i < table.length; i++) {
        const [y1, v1] = table[i];
        if (y <= y1) {
            const [y0, v0] = table[i - 1];
            return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
        }
    }
    return table[table.length - 1][1];
};
// 菱形の断面。縁は y、真ん中は y + lift の高さに置く（lift を付けると「く」の字の断面になる）
const v = (x, y, z) => new THREE.Vector3(x * MM, y * MM, z * MM);
function ring(y, lift, tScale = 1) {
    const w = lerpAt(WIDTH, y);
    const t = lerpAt(THICK, y + lift) * tScale;
    return [v(-w, y, 0), v(0, y + lift, t), v(w, y, 0), v(0, y + lift, -t)];
}
// 節ごとに、縁の輪郭の折れ目にも断面を入れてロフトする。いちばん上の節は切っ先の 1 点で閉じる
function armorGeometries() {
    return SEGMENTS.map(([y0, y1], i) => {
        const ys = [y0, ...WIDTH.map(([y]) => y).filter((y) => y > y0 && y < y1), y1];
        const rings = ys.map((y) => ring(y, CHEVRON));
        if (i === SEGMENTS.length - 1)
            rings.push([v(0, TIP, 0)]);
        return loftRings(rings);
    });
}
function coreGeometry() {
    const rings = WIDTH.slice(0, -1).map(([y]) => ring(y, 0, CORE_T));
    rings.push([v(0, TIP, 0)]);
    return loftRings(rings);
}
function createMats(env) {
    const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, flatShading: true, ...o });
    return {
        armor: std({ color: 0x0b0c0e, metalness: 0.88, roughness: 0.2, envMapIntensity: 1.7 }),
        core: std({ color: 0xffffff, emissive: 0xe6edf0, emissiveIntensity: 1.4, metalness: 0, roughness: 0.3 }),
        grip: std({ color: 0x1e2125, metalness: 0.2, roughness: 0.75 }),
        band: std({ color: 0x0b0c0e, metalness: 0.6, roughness: 0.4 }),
    };
}
export const eclipseSpear = {
    build(parts, mats) {
        for (const name of ['blade', 'guard', 'collar', 'wrap0', 'wrap1', 'butt', 'spike'])
            if (parts[name])
                parts[name].visible = false;
        const m = createMats(mats.metal.envMap);
        const g = new THREE.Group();
        const at = (geo, mat, y) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = y;
            g.add(mesh);
            return mesh;
        };
        const hex = (y0, y1, r0, r1, mat) => at(new THREE.CylinderGeometry(r1, r0, y1 - y0, 6), mat, (y0 + y1) / 2);
        // 光の継ぎ目: 柄より少しだけ太い白い輪
        const seam = (y, r) => at(new THREE.CylinderGeometry(r, r, 0.003, 12), m.core, y);
        const core = new THREE.Mesh(coreGeometry(), m.core);
        g.add(core, ...armorGeometries().map((geo) => new THREE.Mesh(geo, m.armor)));
        const glow = addGlow(core, 0xe6edf0);
        glow.strength = 0.35;
        // 首
        hex(0.497, 0.524, 0.0155, 0.0158, m.armor);
        seam(0.5255, 0.0142);
        hex(0.527, 0.59, 0.0158, 0.0095, m.armor);
        // 握り
        for (const wrap of [parts.wrap0, parts.wrap1]) {
            const y = wrap.position.y;
            at(new THREE.CylinderGeometry(GRIP_R, GRIP_R, GRIP_LEN, 8), m.grip, y);
            for (let k = -3; k <= 3; k++)
                at(new THREE.CylinderGeometry(GRIP_R + 0.0005, GRIP_R + 0.0005, 0.0025, 8), m.band, y + k * 0.024);
            for (const s of [-1, 1]) {
                hex(y + s * (GRIP_LEN / 2 + 0.003), y + s * (GRIP_LEN / 2 + 0.015), 0.0162, 0.0162, m.armor);
                seam(y + s * (GRIP_LEN / 2 + 0.0015), GRIP_R + 0.0003);
            }
        }
        // 石突き
        const buttY = parts.butt.position.y;
        hex(buttY - 0.002, buttY + 0.017, 0.015, 0.0162, m.armor);
        seam(buttY - 0.0035, 0.0135);
        const spikeTop = buttY - 0.005;
        const spike = at(new THREE.ConeGeometry(0.0148, spikeTop - SPEAR_BUTT_Y, 6), m.armor, (spikeTop + SPEAR_BUTT_Y) / 2);
        spike.rotation.x = Math.PI;
        core.onBeforeRender = () => {
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.002);
            m.core.emissiveIntensity = 1.25 + pulse * 0.3;
        };
        g.userData.undo = () => removeGlow(glow);
        return g;
    },
};

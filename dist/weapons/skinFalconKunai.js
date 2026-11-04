import * as THREE from 'three';
import { loftRings } from '../geometry.js?v=e316db84';
import { addGlow, removeGlow } from '../fx/glow.js?v=e316db84';
import { createFalconMats } from './skinFalconRifle.js?v=e316db84';
import { MM, plate } from './skinTalon.js?v=e316db84';
import { skinFx } from './skins.js?v=e316db84';
// ---- クナイのスキン: 隼 ----
// ライフル・リボルバー・弓の隼と同じ白い陶器・黒い鋼・金のクナイ。長さと輪の位置は元のクナイのまま（回す軸・切っ先の当たりが変わらないように）、形は作り直す。
//   刃: 菱形の断面の上塗りした黒い鋼。付け根は張り出さず、鍔からほぼまっすぐ出て切っ先へ細る。両側の刃先は細い金（刃は黒と金の 2 色だけ）
//   羽根: 鍔の核を付け根に、鍔の両面から左右へ扇に開く金の羽根 3 枚ずつ（外へ張り、柄の側へ垂れるほど長い）。
//         鍔の面に寝かせて伸び、鍔を出たら先ほど刃の面の高さへ寄せる（横から見ると翼をたたむように閉じる）。核は羽根より上へ突き出して付け根を押さえる
//         形はライフル・弓の隼の金の羽根と同じ（前の縁はまっすぐ、後ろへ一定の幅を張り、先は斜めに絞って尖らせる）。前の縁に羽軸の稜線が立つ
//   鍔: 白い陶器の塊。真ん中に核（暗い丸枠に金の輪、芯は金色に光る。当てた瞬間に強まる）
//   柄: 白い陶器の板に、艶を消した黒の帯を斜めに巻く。柄頭は黒い鋼の蓋
//   輪: 黒い鋼の丸い輪。内側に金の細い輪を沿わせる
// 元の部位はすべて隠して作り直す。輪郭はクナイのモデルの座標を mm で書く（y は切っ先の側が +、原点は刃の付け根）
// ---- 刃 ----
// 刃の形: [高さ, 刃先までの幅の半分]。最後は切っ先（元のクナイと同じ 170 mm）
const BLADE = [[-4, 14], [30, 17], [170, 0]];
const THICK = 0.45; // 鎬の厚みの半分（幅の半分に対する割合。元のクナイと同じ）
const HA = 0.84; // 金の刃先の帯の始まり。鎬 0 → 刃先 1 の割合
// 黒い地と、左右の金の刃先を別の筒にする（境の面は互いの内側に隠れる）
function bladeGeometries() {
    const body = [];
    const edges = [[], []];
    const v = (x, y, z) => new THREE.Vector3(x * MM, y * MM, z * MM);
    for (const [y, w] of BLADE.slice(0, -1)) {
        const th = w * THICK;
        const [haW, haT] = [w * HA, th * (1 - HA)];
        body.push([v(-haW, y, haT), v(0, y, th), v(haW, y, haT), v(haW, y, -haT), v(0, y, -th), v(-haW, y, -haT)]);
        edges[0].push([v(haW, y, haT), v(w, y, 0), v(haW, y, -haT)]);
        edges[1].push([v(-haW, y, -haT), v(-w, y, 0), v(-haW, y, haT)]);
    }
    const tip = v(0, BLADE[BLADE.length - 1][0], 0);
    for (const rings of [body, ...edges])
        rings.push([tip.clone()]);
    return { body: loftRings(body), edges: edges.map(loftRings) };
}
// ---- 羽根 ----
// 右の羽根（左は映す）。核から [向き (度。+X から下へ), 長さ, 厚みの倍率]。上の羽根ほど厚くして上に重ねる
const FEATHER_ROOT = [0, -2]; // 核の中心
const FEATHERS = [[12, 38, 1.2], [32, 44, 1.1], [52, 50, 1]];
const FEATHER_W = 0.2; // 幅（長さに対する割合）
// 後ろの縁: 付け根から 3 分の 1 で幅いっぱいに張り、8 割まで同じ幅を保って先へ絞る（幅の割合）
const FEATHER_BACK = [[0, 0], [0.32, 1], [0.8, 1], [1, 0]];
const FEATHER_STATIONS = [0.04, 0.32, 0.56, 0.8, 0.93];
const RIDGE = [4.4, 1.6]; // 前の縁の稜線の高さ（付け根・先、mm）
const EDGE = [1.8, 0.8]; // 後ろの縁の厚み（付け根・先、mm）
const FACE_Z = 10; // 鍔の面の高さ (mm)
const TIP_Z = 3; // 羽根の先の面の高さ (mm)
const FOLD = [0.35, 1]; // 鍔を出る辺りから先までで、面の高さを FACE_Z から TIP_Z へ下げる
const lerpKeys = (keys, t) => {
    const i = Math.max(1, keys.findIndex(([k]) => k >= t));
    const [k0, v0] = keys[i - 1], [k1, v1] = keys[i];
    return v0 + ((v1 - v0) * (t - k0)) / (k1 - k0);
};
// +Z の面に寝かせた羽根の立体（-Z の面と左は映す）。内側（鍔の面の側）は平らで、前の縁（外・上の側）に稜線が立ち、後ろの縁（柄の側）へ薄くなる
function featherGeometry(deg, len, k) {
    const a = (-deg * Math.PI) / 180;
    const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    const back = new THREE.Vector2(dir.y, -dir.x); // 後ろ（柄の側）
    const at = (along, side, z) => new THREE.Vector3(FEATHER_ROOT[0] + dir.x * along + back.x * side, FEATHER_ROOT[1] + dir.y * along + back.y * side, z).multiplyScalar(MM);
    const w = len * FEATHER_W;
    const fold = (t) => THREE.MathUtils.lerp(FACE_Z, TIP_Z, THREE.MathUtils.smoothstep(t, FOLD[0], FOLD[1]));
    const rings = FEATHER_STATIONS.map((t) => {
        const along = len * t;
        const b = w * lerpKeys(FEATHER_BACK, t);
        const z0 = fold(t);
        const r = THREE.MathUtils.lerp(RIDGE[0], RIDGE[1], t) * k;
        const e = THREE.MathUtils.lerp(EDGE[0], EDGE[1], t) * k;
        const m = (r + e) / 2 + 0.6;
        // 面が外を向くよう、後ろの縁の内 → 稜線の内 → 稜線の外 → 後ろの縁の外の順に並べる
        return [at(along, b, z0), at(along, b * 0.5, z0), at(along, 0, z0), at(along, 0, z0 + r), at(along, b * 0.5, z0 + m), at(along, b, z0 + e)];
    });
    rings.push([at(len, 0, fold(1))]);
    return loftRings(rings);
}
// ---- 鍔・柄 ----
const GUARD = [[-12, -10], [12, -10], [14, 0], [9, 6], [-9, 6], [-14, 0]];
const GRIP = [[-8, -9], [8, -9], [6.5, -84], [-6.5, -84]];
const CAP = [[-7.5, -83], [7.5, -83], [6, -89], [-6, -89]];
const GUARD_D = 0.02;
const GRIP_D = 0.013;
// ---- 輪 ----
const RING_R = 14;
const RING_TUBE = 3.4;
const GOLD_R = 10.2; // 金の輪は黒い輪の内の縁に半ば沈める
const GOLD_TUBE = 1.3;
const GLOW_K = 0.6; // 核のにじみの濃さ（目の前に来る小さな武器なので弱め）
export const falconKunai = {
    build(parts, mats, model) {
        const { shell, wing, gold, dark, rim, deep } = createFalconMats(mats.metal.envMap, mats.metal.flatShading);
        for (const name of ['blade', 'collar', 'handle', 'neck', 'ring'])
            if (parts[name])
                parts[name].visible = false;
        const g = new THREE.Group();
        const add = (outline, depth, mat, z = 0, bevel) => {
            const m = new THREE.Mesh(plate(outline, depth, bevel), mat);
            m.position.z = z;
            g.add(m);
            return m;
        };
        const blade = bladeGeometries();
        g.add(new THREE.Mesh(blade.body, wing));
        for (const geo of blade.edges)
            g.add(new THREE.Mesh(geo, gold));
        add(GUARD, GUARD_D, shell, 0, 0.0015);
        for (const [deg, len, k] of FEATHERS) {
            const geo = featherGeometry(deg, len, k);
            for (const side of [1, -1]) {
                for (const face of [1, -1]) {
                    const m = new THREE.Mesh(geo, gold);
                    m.scale.set(side, 1, face); // 左と裏の面は映す（面の向きは three.js が裏返す）
                    g.add(m);
                }
            }
        }
        add(GRIP, GRIP_D, shell, 0, 0.0015);
        add(CAP, GRIP_D + 0.002, wing, 0, 0.001);
        // 柄に斜めに巻いた帯
        for (let y = -74; y < -16; y += 10) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.0018, GRIP_D + 0.0014), dark);
            band.position.set(0, y * MM, 0);
            band.rotation.z = -0.41;
            g.add(band);
        }
        // 鍔の核: 暗い丸枠に金の輪、芯は金色に光る（Z 軸に沿った円柱で鍔を貫く）
        const disc = (r, len, mat) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat);
            m.rotation.x = Math.PI / 2;
            m.position.y = -2 * MM;
            g.add(m);
            return m;
        };
        // 羽根の付け根を押さえるよう、いちばん厚い羽根の稜線より上へ突き出す
        const top = 2 * (RIDGE[0] * FEATHERS[0][2] + 1.5) * MM;
        disc(0.0065, GUARD_D + top, rim);
        disc(0.0045, GUARD_D + top + 0.0006, gold);
        const core = disc(0.0026, GUARD_D + top + 0.0012, deep);
        const glow = addGlow(core, 0xe8b450);
        core.onBeforeRender = () => {
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0025);
            deep.emissiveIntensity = 1.4 + pulse * 0.4 + skinFx.flare * 2;
            glow.strength = (0.4 + pulse * 0.1 + skinFx.flare * 0.5) * GLOW_K;
        };
        // 黒い輪と、内の縁に沿う金の輪。回す軸になる位置は元の輪と同じ
        const ringY = model.userData.ringY;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R * MM, RING_TUBE * MM, 6, 24), wing);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(GOLD_R * MM, GOLD_TUBE * MM, 6, 24), gold);
        ring.position.y = inner.position.y = ringY;
        g.add(ring, inner);
        g.userData.undo = () => removeGlow(glow);
        return g;
    },
};

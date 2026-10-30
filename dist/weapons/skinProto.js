import * as THREE from 'three';
// ---- リボルバーのスキン: 試作機 ----
// 白い樹脂の外殻で全体を包んだ、角ばった試作品の銃。
//   上の箱: 前が高く後ろへ少し下がる、大きく面取りした箱（前から見て八角形）。前面に縁取りと丸い銃口の筒、下に暗い帯。
//           斜めの帯が上下の箱を巻き、上に照門の金具
//   側板: 帯より後ろの側面に一段出た板。斜めの格子の通気口が付く
//   下の箱: 前は面を重ねて削いだ顎。斜めの溝 3 本が下まで貫き、溝の間は下へ突き出たヒレになる。後ろに凹んだ黒い窓
//   引き金の囲いは細い角の枠。グリップは後ろへ傾き、前側に白い帯と溝、底に板
// シリンダーは外殻の中にしまう（クレーンごと縮める）。左の側板をクレーンに載せ、装填のときに扉として一緒に振り出す
// 元のフレームの部位（frame*）はすべて隠す。
// 輪郭は設計図（横から見て銃口が左）のピクセルで書き、mm に直す。押し出す厚み（x）は mm で書く
const MM = 0.001;
const S = 0.38; // 設計図の 1 px の mm
const PX_FRONT = 88; // 上の箱の前端（z = -156 mm）
const PX_AXIS = 107; // 銃身の軸（y = 0）
const toZ = (x) => (x - PX_FRONT) * S - 156;
const toY = (y) => (PX_AXIS - y) * S;
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// 外殻の輪郭
const UPPER = [[88, 58], [94, 52], [540, 76], [585, 100], [585, 145], [572, 150], [88, 150]];
const UNDER = rect(92, 150, 572, 162); // 上の箱の下の暗い帯
const BAND = [[296, 47], [322, 47], [399, 283], [374, 283]];
const SIGHT = [[290, 38], [318, 38], [321, 49], [287, 49]];
const STRAP = [[294, 46], [318, 46], [334, 92], [310, 92]];
// 斜めの溝: 上端の左の x から、下へ行くほど後ろへずれる（＼）。下の箱の底（ヒレの先 FIN_Y）まで貫く
const SLOT_X = [162, 220, 278];
const SLOT_W = 34;
const SLOT_TOP = 210;
const FIN_Y = 283;
const SLANT = 0.73;
const slotAt = (x, y) => x + (y - SLOT_TOP) * SLANT;
// 下の箱: 上の辺を前から後ろへ、後ろの面取りを下り、底を後ろから前へ。底は溝で切れてヒレの先になる
const LOWER = [
    [95, 162], [548, 162], [578, 198], [578, 250], [552, 270], [402, 270], [398, FIN_Y],
    ...[...SLOT_X].reverse().flatMap((x) => [
        [slotAt(x + SLOT_W, FIN_Y), FIN_Y], [x + SLOT_W, SLOT_TOP], [x, SLOT_TOP], [slotAt(x, FIN_Y), FIN_Y],
    ]),
    [140, FIN_Y], [118, 262], [95, 190],
];
// 溝の奥の黒い板（ヒレの先より少し上で止める）
const SLOTS = SLOT_X.map((x) => [[x, SLOT_TOP], [x + SLOT_W, SLOT_TOP], [slotAt(x + SLOT_W, 276), 276], [slotAt(x, 276), 276]]);
const WINDOW = [[404, 206], [536, 206], [542, 212], [542, 240], [536, 246], [404, 246], [398, 240], [398, 212]];
const SEAM = rect(110, 177, 545, 179.5);
// 側板と通気口
const SIDE = [[346, 96], [566, 96], [578, 108], [578, 146], [570, 150], [364, 150]];
const VENT = [[368, 108], [538, 108], [545, 115], [545, 135], [538, 142], [368, 142], [361, 135], [361, 115]];
// 引き金の囲いとグリップ
const GUARD = [[408, 268], [418, 268], [436, 318], [548, 318], [548, 327], [430, 327]];
const TRIGGER = [[470, 268], [480, 268], [476, 298], [466, 304]];
const GRIP = [[545, 265], [578, 212], [640, 258], [697, 445], [692, 474], [603, 485]];
const INLAY = [[557, 318], [577, 312], [620, 470], [603, 478]];
const GROOVE = [[577, 312], [580, 311], [623, 469], [620, 470]];
const BASE = [[598, 478], [694, 466], [696, 474], [600, 490]];
const toPath = (path, outline) => {
    path.setFromPoints(outline.map(([x, y]) => new THREE.Vector2(toZ(x) * MM, toY(y) * MM)));
    return path;
};
// 輪郭を横へ押し出した板（width は全体の厚み mm、真ん中が x = 0）。holes は貫く穴（凹みは穴の奥に板を置いて作る）
// 面取り（bevel）の分だけ輪郭は外へ広がる
function plate(outline, width, bevel = 1.2, holes = []) {
    const shape = toPath(new THREE.Shape(), outline);
    for (const h of holes)
        shape.holes.push(toPath(new THREE.Path(), h));
    const core = (width - bevel * 2) * MM;
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: core,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel * MM,
        bevelSize: bevel * 0.8 * MM,
        bevelSegments: 1,
        curveSegments: 1,
    });
    geo.translate(0, 0, -core / 2);
    geo.rotateY(-Math.PI / 2); // 輪郭の x を銃の z に、押し出す向きを銃の x に
    return geo;
}
// 前から見た八角の枠（mm）。外側は幅 ±hw、高さ bottom〜top で角を cut だけ落とし、内側は inset だけ細らせる。前（-z）へ depth だけ出す
function octagonRing(hw, bottom, top, cut, inset, depth) {
    const octagon = (path, d) => {
        const [l, r, b, t, c] = [-hw + d, hw - d, -bottom + d, top - d, cut];
        const pts = [[l + c, b], [r - c, b], [r, b + c], [r, t - c], [r - c, t], [l + c, t], [l, t - c], [l, b + c]];
        path.setFromPoints(pts.map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
        return path;
    };
    const shape = octagon(new THREE.Shape(), 0);
    shape.holes.push(octagon(new THREE.Path(), inset));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: depth * MM, bevelEnabled: false });
    geo.translate(0, 0, -depth * MM);
    return geo;
}
function createMats(env) {
    const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, flatShading: true, ...o });
    return {
        shell: std({ color: 0xd3d6d9, metalness: 0.1, roughness: 0.42, envMapIntensity: 0.6 }),
        panel: std({ color: 0xb4b8bc, metalness: 0.15, roughness: 0.45, envMapIntensity: 0.6 }),
        frame: std({ color: 0x74797e, metalness: 0.35, roughness: 0.45 }),
        grip: std({ color: 0x9a9fa4, metalness: 0.1, roughness: 0.6 }),
        shellInside: std({ color: 0xd3d6d9, metalness: 0.1, roughness: 0.42, envMapIntensity: 0.6, side: THREE.BackSide }), // 銃口の筒の内側の壁
        dark: std({ color: 0x121416, metalness: 0.3, roughness: 0.6 }),
        bore: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    };
}
// 片側の側板（side: 左 -1 / 右 +1）。上の箱の側面（±15.5 mm）に重ね、通気口の穴の奥に黒い板と斜めの格子を置く
function sidePanel(m, side) {
    const g = new THREE.Group();
    const add = (geo, mat, x) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.x = side * x * MM;
        g.add(mesh);
        return mesh;
    };
    add(plate(SIDE, 1.8, 0.3, [VENT]), m.shell, 16.5);
    add(plate(VENT, 0.8, 0), m.dark, 16.1);
    const ventY = toY(125) * MM;
    for (let k = 0; k < 5; k++) {
        const bar = add(new THREE.BoxGeometry(1 * MM, 12 * MM, 1.8 * MM), m.panel, 16.6);
        bar.position.set(bar.position.x, ventY, (-40 + k * 12.5) * MM);
        bar.rotation.x = -0.6;
    }
    // 通気口の両端の丸い留め具
    for (const z of [-47, 13.5]) {
        const pin = add(new THREE.CylinderGeometry(1.6 * MM, 1.6 * MM, 1 * MM, 8).rotateZ(Math.PI / 2), m.panel, 16.6);
        pin.position.set(pin.position.x, ventY, z * MM);
    }
    return g;
}
const CYL_SCALE = 0.6; // 外殻（側板の裏）に収まるよう、シリンダー（クレーンごと）を縮める
const CYL_Y = -0.009; // 縮めたシリンダーの中心の高さ
export const protoRevolver = {
    build(parts, mats, model) {
        const m = createMats(mats.metal.envMap);
        for (const [name, mesh] of Object.entries(parts))
            if (name.startsWith('frame'))
                mesh.visible = false;
        const g = new THREE.Group();
        const add = (geo, mat, x = 0) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.x = x * MM;
            g.add(mesh);
            return mesh;
        };
        // 上の箱と帯
        add(plate(UPPER, 31, 4), m.shell);
        add(plate(UNDER, 29.6, 0.6), m.frame);
        // 前面: 面の縁を八角の枠で囲み、内側は一段奥の面にする。真ん中から丸い筒が出る（筒の先が弾の出る位置）
        const FACE_Z = -156 - 4 * 0.8; // 面取りで輪郭が広がった分だけ前
        const frame = add(octagonRing(11.5, 19.5, 18.7, 4, 2.4, 1.8), m.shell);
        frame.position.z = FACE_Z * MM;
        // 筒は中が空いている: 太い輪の中に細い筒、その内側の壁が見え、奥は黒い
        const tube = (r, inner, len, z, mat) => {
            const wall = add(new THREE.CylinderGeometry(r * MM, r * MM, len * MM, 16, 1, true).rotateX(Math.PI / 2), mat);
            wall.position.z = (z + len / 2) * MM;
            const cap = add(new THREE.RingGeometry(inner * MM, r * MM, 16), mat);
            cap.position.z = z * MM;
            cap.rotation.y = Math.PI;
        };
        tube(7.6, 5.8, 4.3, FACE_Z - 4.3, m.panel);
        tube(5.8, 4.6, 1.5, FACE_Z - 5.8, m.shell);
        const boreWall = add(new THREE.CylinderGeometry(4.6 * MM, 4.6 * MM, 6 * MM, 16, 1, true).rotateX(Math.PI / 2), m.shellInside);
        boreWall.position.z = (FACE_Z - 2.8) * MM;
        const bore = add(new THREE.CircleGeometry(4.6 * MM, 16), m.bore);
        bore.position.z = (FACE_Z - 0.1) * MM;
        bore.rotation.y = Math.PI;
        // 左右の殻の合わせ目: 前面の真ん中を縦に通る細い線（枠の上下と、下の箱の前）
        const seam = (h, y, z) => {
            const mesh = add(new THREE.BoxGeometry(0.6 * MM, h * MM, 0.8 * MM), m.dark);
            mesh.position.set(0, y * MM, z * MM);
        };
        seam(2.4, 17.5, FACE_Z - 1.5);
        seam(2.4, -18.3, FACE_Z - 1.5);
        seam(10, toY(176), toZ(95) - 2.3);
        add(plate(BAND, 34), m.shell);
        add(plate(STRAP, 35, 0.5), m.shell);
        add(plate(SIGHT, 12, 1), m.panel);
        const notch = add(new THREE.BoxGeometry(3 * MM, 2.5 * MM, 5 * MM), m.dark);
        notch.position.set(0, toY(39) * MM, toZ(304) * MM);
        g.add(sidePanel(m, 1)); // 右の側板は動かない
        // 下の箱: 溝と窓は穴を開け、奥に黒い板を置いて凹ませる
        add(plate(LOWER, 29, 2.5, [WINDOW]), m.shell);
        for (const s of SLOTS)
            add(plate(s, 20, 0), m.dark);
        add(plate(WINDOW, 25, 0), m.dark);
        add(plate(SEAM, 29.4, 0), m.frame);
        // 引き金の囲いと引き金、グリップ
        add(plate(GUARD, 6, 1), m.frame);
        add(plate(TRIGGER, 4, 0.5), m.dark);
        add(plate(GRIP, 24, 2), m.grip);
        add(plate(INLAY, 24.8, 0.4), m.shell);
        add(plate(GROOVE, 25, 0), m.dark);
        add(plate(BASE, 27, 1), m.frame);
        // シリンダー: クレーンごと縮めて左の側板の裏へ。左の側板はクレーンに載せ、開けたときは奥の黒い穴が見える
        const crane = model.userData.crane;
        const cylinder = model.userData.cylinder;
        const keep = { pos: crane.position.clone(), scale: crane.scale.clone() };
        crane.scale.setScalar(CYL_SCALE);
        crane.position.set(0, CYL_Y, 0).addScaledVector(cylinder.position, -CYL_SCALE);
        add(plate(SIDE, 1.5, 0), m.dark, -14.8);
        const door = sidePanel(m, -1);
        door.position.copy(crane.position).divideScalar(-CYL_SCALE);
        door.scale.setScalar(1 / CYL_SCALE);
        crane.add(door);
        g.userData.undo = () => {
            crane.remove(door);
            door.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
            crane.position.copy(keep.pos);
            crane.scale.copy(keep.scale);
        };
        return g;
    },
};

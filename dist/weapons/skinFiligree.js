import * as THREE from 'three';
import { loftRings } from '../geometry.js?v=6b2d2aee';
import { GRIP_DEPTH, GRIP_OUTLINE } from './revolver.js?v=6b2d2aee';
// ---- リボルバーのスキン: 唐草 ----
// 黒染めの鋼の銃に、銀の蔓が立体で絡みつく古典の拳銃。模様を描くのではなく、唐草を形として彫り出す。込めるのは銀の弾丸。
//   本体: 丸みのある黒染めのフレーム（シリンダーの窓が抜けている）と、丸い銃身。銃口はラッパのように開く
//   蔓: 素直に細る六角の茎。節から蔦のような幅広の葉を出し、間からばねのような巻きひげを伸ばす。
//       1 本は銃身に 2 周半巻き付いて銃身に食い込み、銃口の手前で葉 1 枚で終わる。葉は銃身の面に沿って左右へ広がる。
//       フレームの両側面にも 1 本ずつ、付け根から上の縁に沿って後ろへ走り、後ろの側面で大きな渦に巻く。
//       引き金の囲いには細い蔓が巻き付く
//   撃鉄は後ろへ反って渦に巻き、引き金の囲いの前には小さな渦。グリップの底は幅広の帯が後ろで巻き上がる
//   握り: 元のグリップと同じ輪郭の、滑らかな象牙。両側に銀のメダリオン
//   シリンダーは元のまま（銀。溝は黒染め。skins.ts の looks）。弾は銀の薬莢に、明るい銀の弾頭
// 元のフレームの部位（frame*。グリップも）はすべて隠す。
// 位置は横から見た mm で書く（[z, y]。z は銃口の側が -、y は銃身の軸が 0）
const MM = 0.001;
const v3 = (x, [z, y]) => new THREE.Vector3(x * MM, y * MM, z * MM);
function createMats(env) {
    // 造形の部品は面の向きがまちまちなので両面で描く（裏から見えた面も法線を返して正しく照らされる）。元の銃と同じく面ごとの陰影
    const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, side: THREE.DoubleSide, flatShading: true, ...o });
    return {
        blued: std({ color: 0x1b1e23, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.3 }),
        // 銀は鏡のように光らせず、艶を抑えた古い銀にする（ぎらつくと安く見える）
        silver: std({ color: 0x9a9fa4, metalness: 0.85, roughness: 0.42, envMapIntensity: 0.9 }),
        leaf: std({ color: 0x7f858a, metalness: 0.8, roughness: 0.5, envMapIntensity: 0.85 }), // 葉は一段暗く艶を落として蔓と分ける
        ivory: new THREE.MeshPhysicalMaterial({
            color: 0xe9e0cc, // 模様は付けず、象牙の色だけ
            metalness: 0,
            roughness: 0.42,
            clearcoat: 0.6,
            clearcoatRoughness: 0.25,
            envMap: env,
            envMapIntensity: 0.6,
            flatShading: true,
        }),
        bore: new THREE.MeshBasicMaterial({ color: 0x050505 }),
        // 弾
        nickel: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: 0.26, envMap: env, envMapIntensity: 1.4, flatShading: true }),
        bullet: new THREE.MeshStandardMaterial({ color: 0xeef1f3, metalness: 1, roughness: 0.1, envMap: env, envMapIntensity: 1.8, flatShading: true }),
    };
}
// ---- 蔓 ----
// 渦巻き: 中心 c、始めの角度 th0（z が右・y が上で測る）、始めの半径 r0 から、dir の向き（+1 で左回り）に turns 回り細る
function spiral(c, th0, r0, dir, turns = 1.3) {
    const pts = [];
    const end = turns * Math.PI * 2;
    for (let t = 0; t <= end; t += 0.6) {
        const r = r0 * Math.exp(-0.28 * t);
        const th = th0 + dir * t;
        pts.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]);
    }
    return pts;
}
// 側面（x 一定の面）に寝かせた滑らかな茎（撃鉄・引き金の囲いなどの部品）。通る点を滑らかにつなぎ、太さ r0 から r1 へ細って先を尖らせる。
// sx: 横（x）への太さの倍率（1 より大きいと幅広の帯）
function stem(x, pts, r0, r1, sx = 1) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => v3(x, p)));
    const N = pts.length * 2;
    const samples = curve.getSpacedPoints(N);
    const B = new THREE.Vector3(1, 0, 0);
    const SIDES = 6;
    const rings = [];
    for (let i = 0; i < N; i++) {
        const T = samples[i + 1].clone().sub(samples[Math.max(0, i - 1)]).normalize();
        const n = T.clone().cross(B).normalize();
        const r = (r0 + (r1 - r0) * (i / N)) * MM;
        const ring = [];
        for (let k = 0; k < SIDES; k++) {
            const a = (k / SIDES) * Math.PI * 2;
            ring.push(samples[i].clone().addScaledVector(n, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r * sx));
        }
        rings.push(ring);
    }
    rings.push([samples[N]]);
    return loftRings(rings);
}
// 生きた蔓: 素直に細る六角の茎。曲線に沿って太さ r0 から r1 へ細り、先を尖らせる。
// nodes: 節の位置（0〜1）。葉の付け根に合わせて少しだけ膨らませる
function rope(curve, r0, r1, nodes = []) {
    const len = curve.getLength();
    const N = Math.max(8, Math.round(len / (2.5 * MM)));
    const { normals, binormals } = curve.computeFrenetFrames(N, false);
    const SIDES = 6;
    const rings = [];
    for (let i = 0; i < N; i++) {
        const t = i / N;
        let R = (r0 + (r1 - r0) * t) * MM;
        for (const n of nodes)
            R *= 1 + 0.15 * Math.exp(-((((t - n) * len) / (3 * MM)) ** 2));
        const c = curve.getPointAt(t);
        const ring = [];
        for (let j = 0; j < SIDES; j++) {
            const a = (j / SIDES) * Math.PI * 2;
            ring.push(c.clone().addScaledVector(normals[i], Math.cos(a) * R).addScaledVector(binormals[i], Math.sin(a) * R));
        }
        rings.push(ring);
    }
    rings.push([curve.getPointAt(1)]);
    return loftRings(rings);
}
const curveOf = (pts) => new THREE.CatmullRomCurve3(pts);
// 蔓に付ける葉 1 枚（長さ 1、+y へ伸び、表は +z）。蔦のような幅広の葉で、左右に 2 つずつ浅い裂け目がある。
// 真ん中の点から縁へ向けて三角を張り、真ん中を持ち上げて縁を垂らす（少ない面で葉脈の折れが見える）。先は表の側へ反る
const IVY = [
    [0, 0.06], [0.2, 0], [0.4, 0.14], [0.3, 0.3], [0.46, 0.44], [0.3, 0.58], [0.24, 0.78], [0, 1],
];
function vineLeafGeometry() {
    const outline = [...IVY, ...IVY.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    const lift = (x, y) => -0.12 * Math.abs(x) + 0.3 * Math.max(0, y - 0.55) ** 2;
    const c = new THREE.Vector3(0, 0.42, 0.06);
    const pos = [];
    for (let i = 0; i < outline.length; i++) {
        const [x0, y0] = outline[i];
        const [x1, y1] = outline[(i + 1) % outline.length];
        pos.push(c.x, c.y, c.z, x0, y0, lift(x0, y0), x1, y1, lift(x1, y1));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
}
// 葉を置く: 付け根 at、蔓の向き along、外の向き out。葉先は蔓の向きから外へ tilt だけ起こし、外の向きを軸に turn だけ横へ振る
function placeLeaf(mesh, at, along, out, len, tilt, turn) {
    const n = out.clone().normalize();
    const d = along.clone().normalize().multiplyScalar(Math.cos(tilt)).addScaledVector(n, Math.sin(tilt)).applyAxisAngle(n, turn).normalize();
    const z = n.clone().addScaledVector(d, -n.dot(d)).normalize();
    const x = d.clone().cross(z);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, d, z));
    mesh.position.copy(at);
    mesh.scale.setScalar(len * MM);
}
// 巻きひげ: 付け根から axis の向きへ、細るばねのように巻く
function tendrilCurve(at, axis) {
    const a = axis.clone().normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(a);
    if (u.lengthSq() < 1e-6)
        u.set(1, 0, 0);
    u.normalize();
    const v = a.clone().cross(u);
    const pts = [];
    for (let j = 0; j <= 14; j++) {
        const t = j / 14;
        const r = 2.6 * (1 - 0.7 * t) * MM;
        const th = t * 1.8 * Math.PI * 2;
        pts.push(at.clone().addScaledVector(a, t * 9 * MM).addScaledVector(u, (Math.cos(th) - 1) * r).addScaledVector(v, Math.sin(th) * r));
    }
    return curveOf(pts);
}
// ---- 本体 ----
// フレームを横から見た輪郭。前は銃身の付け根を包み、後ろはグリップの中へ潜る。シリンダーの窓を抜く
const FRAME_W = 17; // 全体の厚み（mm）
function frameGeometry() {
    // 輪郭は mm のまま組んで、最後に m へ縮める
    const s = new THREE.Shape();
    s.moveTo(-44, 8);
    s.lineTo(-30, 9);
    s.quadraticCurveTo(-22, 16, -8, 16);
    s.lineTo(22, 16);
    s.quadraticCurveTo(38, 16, 41, 4);
    s.lineTo(42, -16);
    s.lineTo(36, -26);
    s.lineTo(24, -44);
    s.lineTo(-16, -44);
    s.quadraticCurveTo(-40, -44, -46, -24);
    s.quadraticCurveTo(-49, -8, -44, 8);
    // シリンダーの窓（角を丸めた四角）
    const w = new THREE.Path();
    const [z0, z1, y0, y1, c] = [-27, 24, -32, 9.5, 4];
    w.moveTo(z0 + c, y0);
    w.lineTo(z1 - c, y0);
    w.quadraticCurveTo(z1, y0, z1, y0 + c);
    w.lineTo(z1, y1 - c);
    w.quadraticCurveTo(z1, y1, z1 - c, y1);
    w.lineTo(z0 + c, y1);
    w.quadraticCurveTo(z0, y1, z0, y1 - c);
    w.lineTo(z0, y0 + c);
    w.quadraticCurveTo(z0, y0, z0 + c, y0);
    s.holes.push(w);
    const BEVEL = 2.5;
    const core = FRAME_W - BEVEL * 2;
    const geo = new THREE.ExtrudeGeometry(s, { depth: core, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: 2, bevelSegments: 1, curveSegments: 3 });
    geo.translate(0, 0, -core / 2);
    geo.rotateY(-Math.PI / 2); // 輪郭の x を銃の z に、押し出す向きを銃の x に
    geo.scale(MM, MM, MM);
    return geo;
}
// 銃身: 付け根の太い輪から細り、銃口でラッパのように開く（[半径, z] mm）。銃口の先は元の銃と同じ z（弾の出る位置）
const BARREL = [
    [0, -30], [9.6, -30], [9.6, -44], [8, -46.5], [7.2, -48], [6.5, -148], [7, -151], [8.4, -155], [9.3, -159.5], [9.3, -161], [4.4, -161], [4.4, -150],
];
function barrelGeometry() {
    const geo = new THREE.LatheGeometry(BARREL.map(([r, z]) => new THREE.Vector2(r * MM, z * MM)), 10);
    geo.rotateX(Math.PI / 2); // 回す軸（y）を銃の z に
    return geo;
}
// 銃身に巻き付く蔓: 付け根の葉の下から出て、銃身を締め付けるように巻きながら銃口の手前まで。
// 太い主の蔓と、逆向きに巻く細い蔓の 2 本。蔓の芯は太さに合わせて銃身へ寄せ、どこでも銃身に食い込ませる
const barrelR = (z) => 7.2 - ((-48 - z) / 100) * 0.7; // 銃身の半径（mm）
const HELIX = { z0: -44, z1: -146, turns: 2.5, th0: -Math.PI / 2, r0: 5.5, r1: 2.4 };
const EMBED = 0.55; // 蔓の太さのうち銃身から外へ出す割合
function helixCurve(h) {
    const pts = [];
    const N = Math.ceil(Math.abs(h.turns) * 40);
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const z = h.z0 + (h.z1 - h.z0) * t + Math.sin(t * 19) * 2;
        const th = h.th0 + t * h.turns * Math.PI * 2 + Math.sin(t * 11) * 0.15;
        const R = barrelR(z) + (h.r0 + (h.r1 - h.r0) * t) * EMBED + Math.sin(t * 29) * 0.5;
        pts.push(new THREE.Vector3(Math.cos(th) * R * MM, Math.sin(th) * R * MM, z * MM));
    }
    return curveOf(pts);
}
// ---- 弾 ----
function dressRound(round, m) {
    const [rim, body] = round.children;
    const tip = round.userData.tip;
    const keep = { rim: rim.material, body: body.material, tip: tip.material };
    rim.material = m.nickel;
    body.material = m.nickel;
    tip.material = m.bullet;
    return () => {
        rim.material = keep.rim;
        body.material = keep.body;
        tip.material = keep.tip;
    };
}
// 落ちた薬莢に着せるマテリアル（ゲームの画面だけで使うので、1 組を使い回す）
let looseMats = null;
export function dressFiligreeRound(round, env) {
    dressRound(round, (looseMats ??= createMats(env)));
}
const MEDALLION = { z: 0.057, y: -0.079 }; // グリップの側面の真ん中
const GRIP_SIDE = GRIP_DEPTH / 2 + 0.005; // 面取りを含めたグリップの側面の x
const SIDE_VINE_X = FRAME_W / 2 + 1.6; // 側面の蔓の芯（フレームの面に半分埋める）
export const filigreeRevolver = {
    build(parts, mats, model) {
        const m = createMats(mats.metal.envMap);
        for (const [name, mesh] of Object.entries(parts))
            if (name.startsWith('frame'))
                mesh.visible = false;
        const g = new THREE.Group();
        const add = (geo, mat) => {
            const mesh = new THREE.Mesh(geo, mat);
            g.add(mesh);
            return mesh;
        };
        // 本体と銃身
        add(frameGeometry(), m.blued);
        add(barrelGeometry(), m.blued);
        const bore = add(new THREE.CircleGeometry(4.4 * MM, 16), m.bore);
        bore.position.z = (-150 + 0.1) * MM;
        bore.rotation.y = Math.PI;
        // 照星（葉の形の小さな刃）と照門
        const sight = new THREE.Shape([new THREE.Vector2(-147 * MM, 6 * MM), new THREE.Vector2(-139 * MM, 6 * MM), new THREE.Vector2(-145 * MM, 12 * MM)]);
        add(new THREE.ExtrudeGeometry(sight, { depth: 2 * MM, bevelEnabled: false }).translate(0, 0, -1 * MM).rotateY(-Math.PI / 2), m.silver);
        for (const side of [-1, 1])
            add(new THREE.BoxGeometry(1.6 * MM, 2.5 * MM, 4 * MM), m.blued).position.set(side * 1.8 * MM, 17 * MM, 34 * MM);
        const leafGeo = vineLeafGeometry();
        const addLeaf = (at, along, out, len, tilt, turn) => placeLeaf(add(leafGeo, m.leaf), at, along, out, len, tilt, turn);
        const addRope = (curve, r0, r1, nodes = []) => add(rope(curve, r0, r1, nodes), m.silver);
        // 巻きひげ: 蔓の点 t から、外と蔓の先の間の向きへ
        const addTendril = (curve, t, out, r) => addRope(tendrilCurve(curve.getPointAt(t), out.clone().normalize().multiplyScalar(0.8).add(curve.getTangentAt(t).multiplyScalar(0.6))), r, r * 0.4);
        // 銃身に巻き付く蔓。節から葉を左右互い違いに出して銃身の面に沿わせ、間から巻きひげを伸ばす。先は葉 1 枚で終わる
        const outAt = (p) => new THREE.Vector3(p.x, p.y, 0);
        const helix = helixCurve(HELIX);
        const leafT = [0.16, 0.34, 0.52, 0.7, 0.86];
        addRope(helix, HELIX.r0, HELIX.r1, leafT);
        leafT.forEach((t, j) => {
            const p = helix.getPointAt(t);
            addLeaf(p, helix.getTangentAt(t), outAt(p), 15 - j, 0.12, (j & 1 ? 1 : -1) * 1.15);
        });
        for (const t of [0.25, 0.6, 0.95])
            addTendril(helix, t, outAt(helix.getPointAt(t)), 1.4);
        const tip = helix.getPointAt(1);
        addLeaf(tip, helix.getTangentAt(1), outAt(tip), 12, 0.2, 0);
        // 側面の蔓: 付け根から上の縁に沿って後ろへ走り、後ろの側面で右回りの大きな渦に巻く。葉と巻きひげを添える
        const sidePath = [[-46, 3], [-34, 11], [-18, 12.6], [2, 12.8], [20, 12.5], [28, 10.5], ...spiral([32, -2], Math.PI / 2 - 0.3, 12.5, -1)];
        for (const side of [-1, 1]) {
            const curve = curveOf(sidePath.map((p) => v3(side * SIDE_VINE_X, p)));
            addRope(curve, 3.2, 1.2, [0.12, 0.3]);
            const out = new THREE.Vector3(side, 0, 0);
            [0.12, 0.3].forEach((t, j) => addLeaf(curve.getPointAt(t), curve.getTangentAt(t), out, 12, 0.1, (j & 1 ? 1 : -1) * 1.1));
            addTendril(curve, 0.21, out.clone().add(new THREE.Vector3(0, 0.7, 0)), 1);
        }
        // 撃鉄: 後ろ上へ反り、後ろへ渦に巻く
        add(stem(0, [[33, 6], [37, 14], [40.5, 20], ...spiral([46, 17], (Math.PI * 3) / 4, 5.7, -1)], 2.6, 0.8, 1.3), m.silver);
        // 引き金の囲いと、その前の小さな渦。引き金は前へ反った細い蔓
        add(stem(0, [[-22, -42], [-26, -52], [-16, -61], [2, -62], [18, -56], [24, -46]], 2.3, 2.1, 1.2), m.silver);
        // 引き金の囲いに巻き付く細い蔓
        const guard = curveOf([[-22, -42], [-26, -52], [-16, -61], [2, -62], [18, -56], [24, -46]].map((p) => v3(0, p)));
        const G = 90;
        const gf = guard.computeFrenetFrames(G, false);
        const coil = [];
        for (let i = 0; i <= G; i++) {
            const phi = (i / G) * 4 * Math.PI * 2;
            const n = gf.normals[i].clone().multiplyScalar(Math.cos(phi)).addScaledVector(gf.binormals[i], Math.sin(phi));
            coil.push(guard.getPointAt(i / G).addScaledVector(n, 3.4 * MM));
        }
        addRope(curveOf(coil), 1.3, 0.9);
        add(stem(0, [[-17, -60.5], [-22.5, -61.8], ...spiral([-25, -66], (Math.PI * 3) / 4, 5, 1)], 1.8, 0.6, 1.2), m.silver);
        add(stem(0, [[-2, -43], [-1, -50], [-4, -56], [-8, -58.5]], 2, 1, 1.5), m.silver);
        // 象牙のグリップ: 元と同じ輪郭を、滑らかな面取りで押し出す
        const shape = new THREE.Shape(GRIP_OUTLINE.map(([z, y]) => new THREE.Vector2(z, y)));
        const gripGeo = new THREE.ExtrudeGeometry(shape, { depth: GRIP_DEPTH, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 2 });
        gripGeo.translate(0, 0, -GRIP_DEPTH / 2);
        gripGeo.rotateY(-Math.PI / 2);
        add(gripGeo, m.ivory);
        // 底の帯: 幅広の銀の帯が底に沿って後ろへ走り、かかとで上へ巻き上がる
        add(stem(0, [[46, -133.5], [60, -137.8], [80, -138.6], ...spiral([92, -131], -Math.PI / 2 - 0.3, 6, 1, 1.1)], 2.4, 0.8, 4.5), m.silver);
        // メダリオン: 銀の縁に黒染めの円、真ん中に銀の六角
        for (const side of [-1, 1]) {
            const disc = (r, t, segs, mat, out) => {
                const d = add(new THREE.CylinderGeometry(r * MM, r * MM, t * MM, segs).rotateZ(Math.PI / 2), mat);
                d.position.set(side * (GRIP_SIDE + out * MM), MEDALLION.y, MEDALLION.z);
            };
            disc(5.6, 1.2, 16, m.silver, 0.2);
            disc(4.4, 1.2, 16, m.blued, 0.35);
            disc(2.8, 1.2, 6, m.silver, 0.55);
        }
        // シリンダーとスピードローダーの弾
        const rounds = [...(model.userData.chamberRounds ?? []), ...(model.userData.loaderRounds ?? [])];
        const undo = rounds.map((r) => dressRound(r, m));
        g.userData.undo = () => {
            for (const fn of undo)
                fn();
        };
        return g;
    },
};

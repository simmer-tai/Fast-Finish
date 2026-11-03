import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import { addGlow, removeGlow } from '../fx/glow.js';
import { JOINT_Y, SHAFT_BUTT, SHAFT_TOP, sickleBladeFrames } from './chainSickle.js';
import { HOLO_GLOW, createHoloMats, holoMat, tickHoloGlow } from './skinGhostline.js';
// ---- 鎖鎌のスキン: ホロライン ----
// 剣のホロラインと同じ、黒い骨格をくり抜いて刃先を光の帯だけにした鎌。刃の曲がり方と柄の形は元の鎖鎌のまま。
//   刃: 骨格は棟の側の背骨と、根元・切っ先の塊だけ。間の窓を暗いホログラムの板が埋め、刃先は細いシアンの帯が根元から切っ先まで張る。
//       背骨には溝と導光路、刃先の内側には投影刃が浮き、切っ先より少し先まで伸びる
//   口金: 黒い六角の金具に光の線を一周させ、柄の上に逆に回る 2 つの六角の輪を浮かべる
//   継ぎ目: 頭が外れる所にシアンの細い輪
//   柄: 黒い地。握りは黒い節を 3 つ積み、節の隙間から芯の導光体がのぞく
// 刃・口金・継ぎ目の輪は頭（外れて飛ぶ側）に、握りの節は握りに付ける。
// 刃の断面は棟 0 → 刃先 1 の割合で決める（元の刃の sickleBladeFrames に沿わせる）
const FR = 0.36; // 背骨の幅
const HA = 0.75; // 刃先の帯の始まり
const WINDOW = [2, 8]; // 窓を開ける区間（刃の断面の番号。根元の塊は 0〜2、切っ先の塊は 8 から先）
const GROOVE = [0.08, 0.2]; // 背骨の溝
const SIGNAL = [0.11, 0.17]; // 溝の中の導光路
const HOLO_EDGE = [1.05, 1.11]; // 刃先の内側に浮かぶ投影刃
const HOLO_SPINE = [-0.08, -0.06]; // 棟の外に浮かぶ光の線
const TICK_W = 0.0011; // 窓の中の目盛りの太さ (m)
// 柄の上に浮かぶ輪（y, 内径, 外径, 回る速さ。m と rad/s）
const HALOS = [
    [SHAFT_TOP - 0.075, 0.022, 0.023, 0.9],
    [SHAFT_TOP - 0.095, 0.018, 0.0186, -1.7],
];
const GRIP_Y = [-0.06, 0.06]; // 元の巻きの範囲
const GRIP_SEGMENTS = 3;
const GRIP_GAP = 0.0018;
const at = ({ p, n, w }, a, z) => p.clone().addScaledVector(n, (a - 0.5) * w).setZ(z);
const tangent = ({ n }) => new THREE.Vector3(-n.y, n.x, 0); // 根元 → 切っ先
// 断面の輪を並べた立体。最後の輪が 1 点でなければ、そこもふさぐ
function solid(rings, mat) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(loftRings(rings), mat));
    const end = rings[rings.length - 1];
    if (end.length > 2) {
        const pos = [];
        for (let i = 1; i < end.length - 1; i++)
            pos.push(...end[0].toArray(), ...end[i].toArray(), ...end[i + 1].toArray());
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, mat));
    }
    return g;
}
// 厚み 0 の帯（[片側, 反対側] の組を並べる）
function ribbon(pairs) {
    const pos = [];
    for (let i = 0; i < pairs.length - 1; i++) {
        const [a, b] = pairs[i];
        const [c, d] = pairs[i + 1];
        pos.push(...a.toArray(), ...b.toArray(), ...d.toArray(), ...a.toArray(), ...d.toArray(), ...c.toArray());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
}
// 柄の周りの輪（sides 角柱。r は下の端、r1 は上の端の半径）。柄の上なら柄と同じく厚みの向きに潰す（口金と継ぎ目の金具は潰さない）
function band(y, r, h, mat, sides = 8, r1 = r, flat = 0.85) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r, h, sides), mat);
    m.scale.set(1, 1, flat);
    m.position.y = y;
    return m;
}
function blade(m, holoFill, holoEdge, holoLine) {
    const { frames, tip } = sickleBladeFrames();
    const g = new THREE.Group();
    const last = frames.length - 1;
    const span = (from, to) => frames.slice(from, to + 1);
    // 骨格: 背骨は切っ先まで通し、根元と切っ先の塊で刃先の帯の内側までを埋める
    g.add(solid([...frames.map((f) => [at(f, 0, f.t * 0.4), at(f, FR, f.t / 2), at(f, FR, -f.t / 2), at(f, 0, -f.t * 0.4)]), [tip]], m.frame));
    const block = (f) => [at(f, FR - 0.02, f.t / 2), at(f, HA + 0.02, f.t * 0.45), at(f, HA + 0.02, -f.t * 0.45), at(f, FR - 0.02, -f.t / 2)];
    g.add(solid(span(0, WINDOW[0]).map(block), m.frame));
    g.add(solid([...span(WINDOW[1], last).map(block), [tip.clone()]], m.frame));
    // 光る帯の刃先: 根元から切っ先まで、窓の区間も途切れずに張る
    const edge = new THREE.Mesh(loftRings([...frames.map((f) => [at(f, HA, f.t * 0.42), at(f, 1, 0), at(f, HA, -f.t * 0.42)]), [tip.clone()]]), m.edge);
    g.add(edge);
    // 背骨の溝と、その中を通る導光路（骨格の面から少しだけ浮かせる）
    const strip = ([a0, a1], z) => (f) => [at(f, a0, f.t * z), at(f, a1, f.t * z), at(f, a1, -f.t * z), at(f, a0, -f.t * z)];
    g.add(solid(span(1, last - 1).map(strip(GROOVE, 0.47)), m.void));
    g.add(solid(span(1, last - 1).map(strip(SIGNAL, 0.49)), m.signal));
    // ホログラム: 窓を埋める板・刃先の内側の投影刃・棟の外の光の線・窓の目盛り
    g.add(new THREE.Mesh(ribbon(span(...WINDOW).map((f) => [at(f, FR - 0.01, 0), at(f, HA + 0.01, 0)])), holoFill));
    // 投影刃は切っ先の先まで伸ばしてとがらせる
    const lastEdge = at(frames[last], 1, 0);
    const reach = tip.clone().addScaledVector(tip.clone().sub(lastEdge).normalize(), 0.012);
    g.add(new THREE.Mesh(ribbon([...span(1, last).map((f) => [at(f, HOLO_EDGE[0], 0), at(f, HOLO_EDGE[1], 0)]), [reach, reach.clone()]]), holoEdge));
    g.add(new THREE.Mesh(ribbon(span(1, last - 1).map((f) => [at(f, HOLO_SPINE[0], 0), at(f, HOLO_SPINE[1], 0)])), holoLine));
    // 目盛りは断面ごとと、その間に 1 本ずつ。3 本ごとに長くする。窓の板と重ならないよう表と裏に少し浮かせる
    const ticks = [];
    for (let k = 1; k < (WINDOW[1] - WINDOW[0]) * 2; k++) {
        const f0 = frames[WINDOW[0] + Math.floor(k / 2)];
        const f = k % 2 ? { ...f0, p: f0.p.clone().lerp(frames[WINDOW[0] + Math.ceil(k / 2)].p, 0.5) } : f0;
        const a1 = k % 3 === 1 ? HA - 0.06 : FR + 0.16;
        const d = tangent(f).multiplyScalar(TICK_W / 2);
        for (const z of [0.0006, -0.0006]) {
            const a = at(f, FR + 0.03, z);
            const b = at(f, a1, z);
            ticks.push([[a.clone().sub(d), b.clone().sub(d)], [a.add(d), b.add(d)]]);
        }
    }
    for (const t of ticks)
        g.add(new THREE.Mesh(ribbon(t), holoLine));
    return { g, edge };
}
export const ghostlineSickle = {
    build(parts, mats, model) {
        const m = createHoloMats(mats.metal.envMap);
        for (const name of ['blade', 'wrap'])
            if (parts[name])
                parts[name].visible = false;
        for (const name of ['headShaft', 'gripShaft', 'socket', 'cap', 'butt'])
            if (parts[name])
                parts[name].material = m.frame;
        for (const name of ['headFerrule', 'gripFerrule'])
            if (parts[name])
                parts[name].material = m.hardware;
        const holoFill = holoMat(0x06222b, 0.6);
        const holoEdge = holoMat(0x22c8f0, 0.6);
        const holoLine = holoMat(0x5fe4ff, 0.7);
        // 頭の側（外れて飛ぶ）
        const head = new THREE.Group();
        const { g, edge } = blade(m, holoFill, holoEdge, holoLine);
        head.add(g);
        const glow = addGlow(edge, HOLO_GLOW); // にじませるのは刃先の帯だけ
        // 口金を一周する光の線と、継ぎ目の輪
        head.add(band(SHAFT_TOP - 0.03, 0.0176, 0.0014, m.signal, 6, 0.0176, 1));
        head.add(band(JOINT_Y + 0.0015, 0.0153, 0.0025, m.signal, 8, 0.0153, 1));
        const halos = HALOS.map(([y, r0, r1]) => {
            const geo = new THREE.RingGeometry(r0, r1, 6, 1);
            geo.rotateX(-Math.PI / 2);
            const halo = new THREE.Mesh(geo, holoLine);
            halo.position.y = y;
            head.add(halo);
            return halo;
        });
        edge.onBeforeRender = () => tickHoloGlow(m, glow, [holoFill, holoEdge, holoLine], halos, HALOS.map((h) => h[3]));
        // 握りの側: 芯の導光体を通し、その上に節を隙間をあけて積む。柄尻の上にも光の線
        const grip = new THREE.Group();
        const [y0, y1] = GRIP_Y;
        grip.add(band((y0 + y1) / 2, 0.0135, y1 - y0, m.signal));
        const segLen = (y1 - y0 - GRIP_GAP * (GRIP_SEGMENTS - 1)) / GRIP_SEGMENTS;
        for (let i = 0; i < GRIP_SEGMENTS; i++) {
            const top = y1 - i * (segLen + GRIP_GAP);
            grip.add(band(top - segLen / 2, 0.0142, segLen, m.frame, 8, 0.0149));
        }
        grip.add(band(SHAFT_BUTT - 0.004, 0.0153, 0.0014, m.signal, 6, 0.0153, 1));
        const headGroup = model.userData.head;
        const gripGroup = model.userData.grip;
        headGroup.add(head);
        if (gripGroup.parent)
            gripGroup.add(grip); // 飛ぶ頭だけのモデルには握りが無い
        const undo = new THREE.Group();
        undo.userData.undo = () => {
            removeGlow(glow);
            for (const o of [head, grip]) {
                o.removeFromParent();
                o.traverse((c) => c instanceof THREE.Mesh && c.geometry.dispose());
            }
            for (const mat of [...Object.values(m), holoFill, holoEdge, holoLine])
                mat.dispose();
        };
        return undo;
    },
};

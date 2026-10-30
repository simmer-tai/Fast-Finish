import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../random.js';
import { skinFx } from './skins.js';
import { SWORD_GRIP_LEN, swordBladePoint } from './sword.js';
// ---- 剣のスキン: 金継ぎ ----
// 「斬った傷を、金で継ぐ」。一度砕けた黒い刀を金で継ぎ直した、という見立て。
//   刃: 黒い地鉄に、磨いた明るい刃（波打つ刃文と、その縁の白い霞み・刃へ走る足）。
//       両面を貫く金の継ぎ目が網の目に走り、継ぎ目の中を光がゆっくり流れる。当てた瞬間は継ぎ目が熱を持って光る
//   鍔: 丸い鉄の鍔に三日月の透かし（大小）、縁は金の覆輪。鍔にも金継ぎ。上下に金の切羽
//   柄: 白い鮫皮に黒い柄糸を菱形に巻く（交わるたびに上下が入れ替わる）。目貫は金の勝虫（とんぼ）、眼だけ赤
//   はばき・縁・頭: はばきは金、縁と頭は鉄に金の輪。頭の両脇に金の鵐目
//   棟寄りの鎬地に、表は「一閃」、裏は「金継」の彫り
// 剣の部位（sword.ts の名前付きの部位）のうち、鍔・柄・柄頭は隠して作り直し、はばきは金に替える
const GOLD = 0xd6a84e;
const TSUBA_Y = SWORD_GRIP_LEN / 2 + 0.003; // 元の鍔の中心
const GRIP_TOP = SWORD_GRIP_LEN / 2 - 0.0135; // 縁の下端 = 柄糸の巻き始め
const GRIP_BOTTOM = -SWORD_GRIP_LEN / 2 + 0.007; // 頭の上端
const CORE_TOP_R = 0.0119;
const CORE_BOTTOM_R = 0.0112;
const FLAT = 0.8; // 柄の断面の潰れ（刃の厚みの向き）
// ---- 継ぎ目を流れる光 ----
// 継ぎ目の帯には、継ぎ目に沿った長さ（along）を持たせ、その上を細い光の筋が流れていく。当てたときの光は skinFx.flare
const flow = { time: { value: 0 }, flare: { value: 0 } };
let flowAt = 0;
function tickFlow() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - flowAt);
    flowAt = now;
    skinFx.flare *= Math.exp(-dt * 3.5);
    flow.time.value = now;
    flow.flare.value = skinFx.flare;
}
function seamMaterial(env) {
    const m = new THREE.MeshStandardMaterial({
        color: GOLD,
        metalness: 1,
        roughness: 0.2,
        envMap: env,
        envMapIntensity: 1.6,
        emissive: 0x6a4710,
        emissiveIntensity: 0.35,
        flatShading: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
    });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uFlowTime = flow.time;
        sh.uniforms.uFlare = flow.flare;
        sh.vertexShader = 'attribute float along;\nvarying float vAlong;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
        sh.fragmentShader =
            'uniform float uFlowTime;\nuniform float uFlare;\nvarying float vAlong;\n' +
                sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float flowWave = pow(max(0.0, sin(vAlong * 70.0 - uFlowTime * 2.4)), 24.0);
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.3) * (flowWave * 1.6 + uFlare * 2.6);`);
    };
    m.customProgramCacheKey = () => 'kintsugi-seam';
    return m;
}
// ---- 手で描く模様（鮫皮の粒・鉄の石目・柄糸の撚り・彫りの文字） ----
// 描いた絵はどの描画の土台でも使い回せるので、一度だけ描く
function canvasTexture(w, h, draw, wrap = true) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    if (wrap)
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
const lazy = (make) => {
    let v;
    return () => (v ??= make());
};
// 鮫皮: 大小の粒を詰める（端をまたぐ粒は反対の端にも描いて継ぎ目を消す）
const sameTexture = lazy(() => {
    const S = 256;
    const t = canvasTexture(S, S, (g) => {
        g.fillStyle = '#3a3a3a';
        g.fillRect(0, 0, S, S);
        const rng = mulberry32(7);
        for (let i = 0; i < 900; i++) {
            const x = rng() * S;
            const y = rng() * S;
            const r = 2 + rng() * rng() * 6;
            for (const ox of [-S, 0, S])
                for (const oy of [-S, 0, S]) {
                    const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
                    grad.addColorStop(0, '#fff');
                    grad.addColorStop(0.6, '#bbb');
                    grad.addColorStop(1, 'rgba(58,58,58,0)');
                    g.fillStyle = grad;
                    g.beginPath();
                    g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
                    g.fill();
                }
        }
    });
    t.repeat.set(5, 9);
    return t;
});
// 鉄の石目: 細かいざらつき
const ishimeTexture = lazy(() => {
    const S = 128;
    const t = canvasTexture(S, S, (g) => {
        const img = g.createImageData(S, S);
        const rng = mulberry32(11);
        for (let i = 0; i < S * S; i++) {
            const v = 90 + rng() * 120;
            img.data.set([v, v, v, 255], i * 4);
        }
        g.putImageData(img, 0, 0);
    });
    t.repeat.set(220, 220); // 押し出した鍔の UV は形の座標 (m) そのままなので、細かく繰り返す
    return t;
});
// 柄糸の撚り: 斜めの筋
const itoTexture = lazy(() => canvasTexture(64, 64, (g) => {
    g.fillStyle = '#222';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ddd';
    g.lineWidth = 7;
    for (let i = -2; i < 4; i++) {
        g.beginPath();
        g.moveTo(i * 32 - 16, 64);
        g.lineTo(i * 32 + 48, 0);
        g.stroke();
    }
}));
// 彫り: 縦書きの 2 文字（白い所だけ残す。切っ先側が上）
const carveTexture = (text) => canvasTexture(128, 512, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 512);
    g.fillStyle = '#fff';
    g.font = 'bold 104px "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "MS Mincho", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [...text].forEach((ch, i) => g.fillText(ch, 64, 128 + i * 256));
}, false);
const omoteCarve = lazy(() => carveTexture('一閃'));
const uraCarve = lazy(() => carveTexture('金継'));
function createMats(env) {
    const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, flatShading: true, ...o });
    const decal = (factor) => ({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor });
    return {
        gold: std({ color: GOLD, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 }),
        seam: seamMaterial(env),
        // 刃: 磨いた明るい鋼。刃文の縁の霞み（匂い）は白っぽく
        ha: std({ color: 0x8c9094, metalness: 1, roughness: 0.14, envMapIntensity: 1.6, ...decal(-1) }),
        nioi: std({ color: 0xe6e6e6, metalness: 0.4, roughness: 0.4, ...decal(-2) }),
        iron: std({ color: 0x1c1b1a, metalness: 0.65, roughness: 0.55, bumpMap: ishimeTexture(), bumpScale: 1.5 }),
        same: std({ color: 0xe8e2d2, metalness: 0, roughness: 0.7, bumpMap: sameTexture(), bumpScale: 2, flatShading: false }),
        ito: std({ color: 0x161616, metalness: 0.2, roughness: 0.42, bumpMap: itoTexture(), bumpScale: 1.5, flatShading: false }),
        eye: std({ color: 0x8e1212, metalness: 0.3, roughness: 0.3 }),
        carve: (map) => std({ color: GOLD, metalness: 1, roughness: 0.32, alphaMap: map, alphaTest: 0.5, ...decal(-2) }),
    };
}
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
// 刃の面の外向きの法線（u, v を少しずらした差から求める。切っ先の 1 点では潰れるので手前で測る）
function bladeNormal(u, v, side, out) {
    const e = 1e-3;
    const vv = Math.min(v, 0.99);
    const du = swordBladePoint(u + e, vv, side, tmpA).sub(swordBladePoint(u - e, vv, side, tmpB)).clone();
    const dv = swordBladePoint(u, vv + e, side, tmpA).sub(swordBladePoint(u, vv - e, side, tmpB));
    out.crossVectors(du, dv).normalize();
    if (out.z * side < 0)
        out.negate();
    return out;
}
// 帯: 点の列に沿って、面の法線と進む向きに垂直に幅を取る。along は継ぎ目に沿った長さ (m)
function ribbon(pts, normals, widths, lift, along0 = 0) {
    const pos = [];
    const nrm = [];
    const along = [];
    const index = [];
    const t = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let len = along0;
    for (let i = 0; i < pts.length; i++) {
        if (i > 0)
            len += pts[i].distanceTo(pts[i - 1]);
        t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]);
        b.crossVectors(normals[i], t).normalize().multiplyScalar(widths[i] / 2);
        c.copy(pts[i]).addScaledVector(normals[i], lift);
        for (const s of [-1, 1]) {
            pos.push(c.x + b.x * s, c.y + b.y * s, c.z + b.z * s);
            nrm.push(normals[i].x, normals[i].y, normals[i].z);
            along.push(len);
        }
        if (i > 0) {
            const k = i * 2;
            index.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setIndex(index);
    return geo;
}
// 刃の (u, v) の折れ線を、面に沿わせた帯にする（鎬の折れ目をまたいでも浮かないよう細かく割る）
function bladeRibbon(path, widths, side, lift, along0 = 0) {
    const pts = [];
    const normals = [];
    const ws = [];
    const SUB = 6;
    for (let i = 0; i < path.length - 1; i++) {
        for (let s = 0; s < SUB || (i === path.length - 2 && s === SUB); s++) {
            const k = s / SUB;
            const u = path[i][0] + (path[i + 1][0] - path[i][0]) * k;
            const v = path[i][1] + (path[i + 1][1] - path[i][1]) * k;
            pts.push(swordBladePoint(u, v, side));
            normals.push(bladeNormal(u, v, side, new THREE.Vector3()));
            ws.push(widths[i] + (widths[i + 1] - widths[i]) * k);
        }
    }
    return ribbon(pts, normals, ws, lift, along0);
}
// 刃の面の一区画: v ごとに u を uFrom(v) から uTo(v) まで張る。uv は区画の中の割合
function bladePatch(uFrom, uTo, v0, v1, nu, nv, side, lift) {
    const pos = [];
    const nrm = [];
    const uvs = [];
    const index = [];
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) {
        const v = v0 + ((v1 - v0) * j) / nv;
        for (let i = 0; i <= nu; i++) {
            const u = uFrom(v) + ((uTo(v) - uFrom(v)) * i) / nu;
            swordBladePoint(u, v, side, p);
            bladeNormal(u, v, side, n);
            p.addScaledVector(n, lift);
            pos.push(p.x, p.y, p.z);
            nrm.push(n.x, n.y, n.z);
            uvs.push(side > 0 ? i / nu : 1 - i / nu, j / nv); // 裏から見ても文字が裏返らないよう、裏は左右を反転する
            if (i > 0 && j > 0) {
                const a = j * (nu + 1) + i;
                const b = a - nu - 1;
                index.push(b - 1, b, a, b - 1, a, a - 1);
            }
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    return geo;
}
// ---- 刃 ----
// 刃文: 刃先寄りでゆったり大きく波打ち（のたれ）、細かい互の目が乗る
const hamon = (v) => 0.4 + 0.09 * Math.sin(v * 57) + 0.05 * Math.sin(v * 131 + 1.1) + 0.03 * Math.sin(v * 23 + 0.4);
const HAMON_FROM = 0.015;
const HAMON_TO = 0.985;
const CRACKS = [
    { a: [-1, 0.2], b: [1, 0.235], n: 9, jitter: [0.05, 0.012] },
    { a: [-1, 0.5], b: [1, 0.455], n: 9, jitter: [0.05, 0.012] },
    { a: [-1, 0.735], b: [1, 0.77], n: 8, jitter: [0.05, 0.012] },
    { a: [-0.62, 0.208], b: [-0.42, 0.49], n: 11, jitter: [0.14, 0.006] }, // 縦に走って 2 本をつなぐ
    { a: [0.3, 0.468], b: [0.85, 0.415], n: 5, jitter: [0.04, 0.006], taper: true },
    { a: [-0.2, 0.212], b: [0.4, 0.27], n: 5, jitter: [0.05, 0.006], taper: true },
    { a: [1, 0.06], b: [0.2, 0.092], n: 5, jitter: [0.05, 0.005], taper: true },
    { a: [1, 0.905], b: [-0.4, 0.955], n: 6, jitter: [0.06, 0.005], taper: true }, // 切っ先
];
function crackPath(c, rng) {
    const path = [];
    const widths = [];
    for (let i = 0; i <= c.n; i++) {
        const k = i / c.n;
        const inner = i > 0 && i < c.n;
        path.push([
            c.a[0] + (c.b[0] - c.a[0]) * k + (inner ? (rng() - 0.5) * 2 * c.jitter[0] : 0),
            c.a[1] + (c.b[1] - c.a[1]) * k + (inner ? (rng() - 0.5) * 2 * c.jitter[1] : 0),
        ]);
        widths.push((0.0011 + rng() * 0.0007) * (c.taper ? Math.max(0, 1 - k) ** 0.7 : 1));
    }
    return { path, widths };
}
function buildBlade(m) {
    const g = new THREE.Group();
    const seams = [];
    const rng = mulberry32(1129);
    const cracks = CRACKS.map((c) => crackPath(c, rng));
    for (const side of [1, -1]) {
        // 刃と刃文の縁
        g.add(new THREE.Mesh(bladePatch(hamon, () => 1, HAMON_FROM, HAMON_TO, 3, 220, side, 0.00012), m.ha));
        const line = [];
        for (let i = 0; i <= 220; i++) {
            const v = HAMON_FROM + ((HAMON_TO - HAMON_FROM) * i) / 220;
            line.push([hamon(v), v]);
        }
        const nioi = [bladeRibbon(line, line.map(() => 0.0008), side, 0.0002)];
        // 足: 刃文から刃先へ短く差し込む筋
        for (let v = 0.03; v < 0.86; v += 0.018) {
            const u = hamon(v);
            nioi.push(bladeRibbon([[u + 0.01, v], [u + 0.15, v + 0.003]], [0.00045, 0.0001], side, 0.0002));
        }
        g.add(new THREE.Mesh(mergeGeometries(nioi), m.nioi));
        // 金の継ぎ目（表も裏も同じ所を通る = 刃を貫いている）
        for (const [i, c] of cracks.entries())
            seams.push(bladeRibbon(c.path, c.widths, side, 0.0003, i * 0.37));
        // 彫り
        g.add(new THREE.Mesh(bladePatch(() => -0.9, () => -0.18, 0.03, 0.115, 4, 24, side, 0.00015), m.carve(side > 0 ? omoteCarve() : uraCarve())));
    }
    // 棟を回り込む継ぎ目（棟の角まで届くひびの表と裏をつなぐ）
    for (const [i, c] of cracks.entries()) {
        if (c.path[0][0] !== -1)
            continue;
        const v = c.path[0][1];
        const front = swordBladePoint(-1, v, 1);
        const back = swordBladePoint(-1, v, -1);
        const out = new THREE.Vector3(-1, 0, 0);
        seams.push(ribbon([front, back], [out, out], [c.widths[0], c.widths[0]], 0.0003, i * 0.37));
    }
    const seam = new THREE.Mesh(mergeGeometries(seams), m.seam);
    seam.onBeforeRender = tickFlow;
    g.add(seam);
    return g;
}
// ---- 鍔 ----
const TSUBA_RX = 0.04;
const TSUBA_RZ = 0.034;
const TSUBA_DEPTH = 0.0055;
const TSUBA_BEVEL = 0.0008;
// 三日月の透かし: 中心 c の円から、外へ off だけずらした円を抜いた形。角は外（d の向き）を向き、膨らみは茎の方へ
function crescent(cx, d, R, off, phiM) {
    const path = new THREE.Path();
    const at = (x, r, a) => [x + r * Math.cos(a) * d, r * Math.sin(a)];
    const tipX = R * Math.cos(phiM) - off;
    const tipY = R * Math.sin(phiM);
    const r = Math.hypot(tipX, tipY);
    const psi = Math.atan2(tipY, tipX);
    const N = 24;
    for (let i = 0; i <= N; i++) {
        const [x, y] = at(cx, R, phiM + ((2 * Math.PI - 2 * phiM) * i) / N);
        if (i === 0)
            path.moveTo(x, y);
        else
            path.lineTo(x, y);
    }
    for (let i = 1; i < N; i++) {
        const [x, y] = at(cx + off * d, r, 2 * Math.PI - psi - ((2 * Math.PI - 2 * psi) * i) / N);
        path.lineTo(x, y);
    }
    path.closePath();
    return path;
}
class EllipseCurve3 extends THREE.Curve {
    rx;
    rz;
    constructor(rx, rz) {
        super();
        this.rx = rx;
        this.rz = rz;
    }
    getPoint(t, out = new THREE.Vector3()) {
        const a = t * Math.PI * 2;
        return out.set(this.rx * Math.cos(a), 0, this.rz * Math.sin(a));
    }
}
function buildTsuba(m) {
    const g = new THREE.Group();
    g.position.y = TSUBA_Y;
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, TSUBA_RX, TSUBA_RZ, 0, Math.PI * 2, false, 0);
    shape.holes.push(crescent(0.0245, 1, 0.0088, 0.0025, THREE.MathUtils.degToRad(70)));
    shape.holes.push(crescent(-0.0245, -1, 0.0068, 0.002, THREE.MathUtils.degToRad(70)));
    const plate = new THREE.ExtrudeGeometry(shape, {
        depth: TSUBA_DEPTH,
        bevelEnabled: true,
        bevelThickness: TSUBA_BEVEL,
        bevelSize: TSUBA_BEVEL,
        bevelSegments: 1,
        curveSegments: 48,
    });
    plate.translate(0, 0, -TSUBA_DEPTH / 2);
    plate.rotateX(-Math.PI / 2); // 板を刃に垂直な面（XZ）に寝かせる
    g.add(new THREE.Mesh(plate, m.iron));
    // 覆輪: 縁を包む金の輪
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new EllipseCurve3(TSUBA_RX, TSUBA_RZ), 96, TSUBA_DEPTH / 2 + TSUBA_BEVEL * 0.9, 8, true), m.gold));
    // 切羽: 鍔を上下から挟む金の薄い板
    for (const s of [1, -1]) {
        const seppa = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.0012, 28), m.gold);
        seppa.scale.z = 0.72;
        seppa.position.y = s * (TSUBA_DEPTH / 2 + TSUBA_BEVEL + 0.0006);
        g.add(seppa);
    }
    // 鍔の金継ぎ: 覆輪から茎の方へ、上下の面に同じ線
    const rng = mulberry32(42);
    const a = 2.3;
    const from = new THREE.Vector3(TSUBA_RX * 0.97 * Math.cos(a), 0, TSUBA_RZ * 0.97 * Math.sin(a));
    const to = new THREE.Vector3(-0.006, 0, 0.009);
    const pts = [];
    const ws = [];
    for (let i = 0; i <= 7; i++) {
        const p = from.clone().lerp(to, i / 7);
        if (i > 0 && i < 7)
            p.add(new THREE.Vector3((rng() - 0.5) * 0.004, 0, (rng() - 0.5) * 0.004));
        pts.push(p);
        ws.push(0.0012 + rng() * 0.0005);
    }
    const seams = [];
    for (const s of [1, -1]) {
        const y = s * (TSUBA_DEPTH / 2 + TSUBA_BEVEL);
        const up = new THREE.Vector3(0, s, 0);
        seams.push(ribbon(pts.map((p) => p.clone().setY(y)), pts.map(() => up), ws, 0.0002, 2.1));
    }
    const seam = new THREE.Mesh(mergeGeometries(seams), m.seam);
    seam.onBeforeRender = tickFlow;
    g.add(seam);
    return g;
}
// ---- 柄 ----
const coreR = (y) => CORE_BOTTOM_R + ((CORE_TOP_R - CORE_BOTTOM_R) * (y - GRIP_BOTTOM)) / (GRIP_TOP - GRIP_BOTTOM);
// 断面が楕円の筒を水平に巻く金の輪
function ellipseRing(r, tube, y, mat) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 40), mat);
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = FLAT; // 寝かせた後の z
    ring.position.y = y;
    return ring;
}
// 柄糸: 右巻きと左巻きを 2 本ずつ。交わるたびに上下が入れ替わるよう、面の上の f = cos(ωy+θ)·cos(ωy−θ) で高さを振る
// （右巻きは f が正の所で上、左巻きは負の所で上。交わる点ではどちらから見ても同じ f になる）
const ITO_OMEGA = Math.PI / 0.022; // 同じ向きの糸が 2.2 cm ごとに来る
const ITO_W = 0.0062;
const ITO_T = 0.001;
function itoStrand(theta0, dir) {
    const pos = [];
    const uvs = [];
    const index = [];
    const N = 260;
    const y0 = GRIP_TOP + 0.002;
    const y1 = GRIP_BOTTOM - 0.002;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const t = new THREE.Vector3();
    const b = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const last = new THREE.Vector3();
    const pointAt = (y, out, normal) => {
        const th = theta0 + dir * ITO_OMEGA * y;
        const f = Math.cos(ITO_OMEGA * y + th) * Math.cos(ITO_OMEGA * y - th);
        const h = 0.0003 + 0.0009 * (0.5 + 0.5 * f * dir);
        const rx = coreR(y) + h;
        const rz = coreR(y) * FLAT + h;
        normal?.set(Math.cos(th) / rx, 0, Math.sin(th) / rz).normalize();
        return out.set(Math.cos(th) * rx, y, Math.sin(th) * rz);
    };
    let len = 0;
    for (let i = 0; i <= N; i++) {
        const y = y0 + ((y1 - y0) * i) / N;
        pointAt(y, p, n);
        t.subVectors(pointAt(y + 0.0005, ahead), pointAt(y - 0.0005, b));
        b.crossVectors(n, t).normalize().multiplyScalar(ITO_W / 2);
        if (i > 0)
            len += p.distanceTo(last);
        last.copy(p);
        // 断面は平たい四角（下の面は鮫皮に沈めて見せない）
        for (const [s, up] of [[-1, 0], [-1, 1], [1, 1], [1, 0]]) {
            pos.push(p.x + b.x * s + n.x * ITO_T * up, p.y + b.y * s + n.y * ITO_T * up, p.z + b.z * s + n.z * ITO_T * up);
            uvs.push((s + 1) / 2 + up * 0.15, len / 0.006);
        }
        if (i > 0) {
            const k = i * 4;
            for (let e = 0; e < 3; e++)
                index.push(k - 4 + e, k - 4 + e + 1, k + e, k - 4 + e + 1, k + e + 1, k + e);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
}
// 目貫: 勝虫（とんぼ）。胴を柄に沿わせ、羽を左右に広げる。前へ進んで退かない虫なので、武士が好んだ
function buildDragonfly(m) {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, sx = 1, sy = 1, sz = 1, rz = 0) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0);
        mesh.scale.set(sx, sy, sz);
        mesh.rotation.z = rz;
        g.add(mesh);
    };
    const ball = new THREE.SphereGeometry(1, 10, 6);
    add(new THREE.CapsuleGeometry(0.0009, 0.014, 3, 8), m.gold, 0, -0.002); // 尾
    const knot = new THREE.TorusGeometry(0.00095, 0.00028, 4, 10).rotateX(Math.PI / 2); // 尾を巻く向きに寝かせる
    for (let i = 0; i < 5; i++)
        add(knot, m.gold, 0, -0.008 + i * 0.0026); // 尾の節
    add(ball, m.gold, 0, 0.0075, 0.0016, 0.0022, 0.0014); // 胸
    add(ball, m.gold, 0, 0.0105, 0.0013, 0.0011, 0.0012); // 頭
    for (const s of [-1, 1]) {
        add(ball, m.eye, s * 0.0011, 0.0111, 0.00085, 0.00085, 0.00085);
        add(ball, m.gold, s * 0.0052, 0.0086, 0.0048, 0.0015, 0.0003, s * 0.14); // 前の羽
        add(ball, m.gold, s * 0.0049, 0.0062, 0.0044, 0.0014, 0.0003, -s * 0.1); // 後ろの羽
    }
    return g;
}
function buildTsuka(m) {
    const g = new THREE.Group();
    const len = GRIP_TOP - GRIP_BOTTOM;
    // 鮫皮
    const core = new THREE.Mesh(new THREE.CylinderGeometry(CORE_TOP_R, CORE_BOTTOM_R, len, 32, 1, true), m.same);
    core.scale.z = FLAT;
    core.position.y = (GRIP_TOP + GRIP_BOTTOM) / 2;
    g.add(core);
    // 柄糸
    const strands = [];
    for (const dir of [1, -1])
        for (const th of [0, Math.PI])
            strands.push(itoStrand(th, dir));
    g.add(new THREE.Mesh(mergeGeometries(strands), m.ito));
    // 目貫: 表は鍔寄り、裏は頭寄り
    for (const [s, y] of [[1, 0.014], [-1, -0.03]]) {
        const fly = buildDragonfly(m);
        fly.position.set(0, y, s * (coreR(y) * FLAT + 0.0019));
        fly.rotation.y = s > 0 ? 0 : Math.PI;
        fly.scale.z = 0.6;
        g.add(fly);
    }
    // 縁: 鍔の下で柄の口を締める鉄の金具。上下の端に金の輪
    const fuchiH = 0.012;
    const fuchi = new THREE.Mesh(new THREE.CylinderGeometry(0.0131, 0.0127, fuchiH, 28), m.iron);
    fuchi.scale.z = FLAT;
    fuchi.position.y = GRIP_TOP + fuchiH / 2;
    g.add(fuchi, ellipseRing(0.0131, 0.0007, GRIP_TOP + fuchiH - 0.0005, m.gold), ellipseRing(0.0128, 0.0007, GRIP_TOP + 0.0005, m.gold));
    // 頭: 丸く閉じた鉄の帽子に金の輪。両脇に鵐目（金の小さな輪）
    const prof = [
        [0.0118, 0.002],
        [0.0128, 0],
        [0.0136, -0.006],
        [0.013, -0.0115],
        [0.0095, -0.0148],
        [0.004, -0.0162],
        [0, -0.0165],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const kashira = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), m.iron);
    kashira.scale.z = FLAT;
    kashira.position.y = GRIP_BOTTOM;
    g.add(kashira, ellipseRing(0.0135, 0.0007, GRIP_BOTTOM - 0.0045, m.gold));
    for (const s of [1, -1]) {
        const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.0022, 0.0007, 6, 14), m.gold);
        eyelet.rotation.y = Math.PI / 2;
        eyelet.position.set(s * 0.0136, GRIP_BOTTOM - 0.008, 0);
        g.add(eyelet);
    }
    return g;
}
export const kintsugiSword = {
    build(parts, mats) {
        const m = createMats(mats.metal.envMap);
        for (const name of ['guard', 'grip', 'pommel'])
            if (parts[name])
                parts[name].visible = false;
        if (parts.habaki)
            parts.habaki.material = m.gold;
        const g = new THREE.Group();
        g.add(buildBlade(m), buildTsuba(m), buildTsuka(m));
        return g;
    },
};

import * as THREE from 'three';
import { loftRings } from '../geometry.js?v=6b2d2aee';
import { addGlow } from '../fx/glow.js?v=6b2d2aee';
import { MM, plate, swordPose } from './skinTalon.js?v=6b2d2aee';
import { skinFx } from './skins.js?v=6b2d2aee';
import { camera } from '../core.js?v=6b2d2aee';
import { game } from '../game/state.js?v=6b2d2aee';
// ---- 剣のスキン: ホロライン ----
// 黒い骨格の刀身をくり抜き、刃先を光の帯だけにした高速戦闘刀。
//   刃: 骨格は棟の側の背骨と、根元・切っ先の塊だけ。間の窓を暗いホログラムの板が埋め、刃先は細いシアンの帯が根元から切っ先まで張る。
//       切っ先は骨格より先へ光の帯だけが伸びてとがる（実体の無い切っ先）
//   鍔・柄: 薄い黒い板の間に導光板を挟んだ六角の鍔と、節の隙間から導光体がのぞく六角の柄
// 色は黒とシアンの 2 色に絞り、黒を大部分にしてシアンは細い線だけにする（爪の赤と同じく、少ないから効く）。
// 標準の刀へ模様を貼るのではなく、刃・鍔・柄をすべて隠して輪郭から作り直す。
// 輪郭は mm（x は刃の側が +、y は切っ先の側が +）。
// 骨格: 根元の塊 → 刃の側が開いた窓 → 切っ先の塊を、棟の背骨でつないだ C の字。窓の両端は切っ先の斜めの線にそろえて傾ける
const FRAME = [
    [-20, 130], [16, 130], [16, 214], [-8, 262], [-8, 672], [16, 620], [16, 690], [-15, 846], [-20, 838],
];
// 窓を埋めるホログラムの板（光る帯の内側まで入れる）。暗いガラスのように塗り、刀身の黒を途切れさせない
const WINDOW = [[-8, 262], [15, 216.5], [15, 622.5], [-8, 672]];
// 背骨の溝と、その中を通る導光路
const VOID = [[-17, 175], [-11.5, 175], [-11.5, 780], [-17, 800]];
const SIGNAL = [[-15.6, 190], [-12.9, 190], [-12.9, 770], [-15.6, 786]];
// 光る帯の刃先。まっすぐな所は x = EDGE_X、切っ先の手前から先は斜めに TIP へ絞る
const EDGE_X = 19;
const EDGE_BEND = 690;
const TIP = [-16, 872];
const EDGE_SLOPE = (EDGE_X - TIP[0]) / (TIP[1] - EDGE_BEND);
const COLLAR = [[-22, 108], [20, 108], [22, 150], [-22, 154]];
// 鍔: 刃に直交する薄い黒い板を 2 枚重ね、間に一回り小さい導光板を挟む（輪郭は x と厚みの向き z の mm）。
// 継ぎ目が鍔の周りを一周する細い光の線になる。棟の側を長く突き出した六角
const GUARD = [[26, 0], [19, 10], [-19, 10], [-32, 0], [-19, -10], [19, -10]];
const GUARD_LAYERS = [
    [97, 102.5, 1, 'frame'],
    [102.5, 103.8, 0.94, 'signal'],
    [103.8, 108, 0.88, 'frame'],
];
// 柄: 六角の黒い節を 3 つ積み、節の細い隙間から芯の導光体がのぞく
const GRIP_TOP = 86;
const GRIP_BOTTOM = -94;
const GRIP_SEGMENTS = 3;
const GRIP_GAP = 1.6;
const GRIP_FLAT = 0.72; // 断面を刃の厚みの向きに潰す割合
const POMMEL_RINGS = [
    [-101.4, -94, 8.4, 8.6, 'frame'],
    [-102.8, -101.4, 6.6, 6.6, 'signal'],
    [-114, -102.8, 6, 8.4, 'hardware'],
];
// ---- ホログラム ----
// 実体の刃の外に、光だけでできた部分を重ねる。走査線が切っ先へ流れ、ときどきちらつく。
// 足さずに重ねて描く（白い床や壁の前でも色が残るように）
// 刃先の外側をなぞる細い投影刃。光る帯から 1.5 mm 浮かせ、切っ先の先まで少し伸ばす
const HOLO_EDGE = [
    [21, 180], [21.5, 215], [21.5, EDGE_BEND], [-16.9, 890], [-17.3, 887], [20.5, EDGE_BEND], [20.5, 218], [20, 185],
];
// 棟の外に浮かぶ細い光の線と、窓の中の目盛り（x0, x1, y0, y1。mm）。目盛りは 3 本ごとに長くする
const HOLO_SPINE = [[-24.4, -23.6, 200, 780]];
const HOLO_TICKS = Array.from({ length: 11 }, (_, i) => {
    const y = 300 + i * 34;
    return [-7.5, i % 3 === 0 ? 1 : -3, y, y + 1.1];
});
// 一閃の構えの間だけ、切っ先の先へ伸びる光の線
const HOLO_REACH = [[TIP[0] - 0.5, TIP[0] + 0.5, 900, 1350]];
// 鍔の上に浮かぶ投影器の輪（y, 内径, 外径, 回る速さ。mm と rad/s）。六角で、2 つを逆に回す
const HOLO_HALOS = [[160, 24, 25, 0.9], [176, 18, 18.6, -1.7]];
// 振りの残像: 刃の形をホログラムで塗った薄い板を、振っている間だけ一定の間隔で置いていき、すぐに消す
const AFTER_BLADE = [[-20, 150], [EDGE_X, 150], [EDGE_X, EDGE_BEND], TIP, [-20, 838]];
const AFTER_EVERY = 1 / 40; // 置く間隔 (s)
const AFTER_LIFE = 0.16; // 消えるまで (s)
const AFTER_ALPHA = 0.22; // 置いた瞬間の濃さ
const AFTER_POOL = 10;
const holoVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vPos = position;
    vec3 p = position;
    // ちらつくコマだけ、横へずらす
    float g = step(0.93, hash(floor(uTime * 18.0)));
    p.x += g * (hash(floor(uTime * 18.0) + 7.0) - 0.5) * 0.004;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const holoFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uBoost;
  uniform float uAlpha;
  uniform float uFade;
  varying vec3 vPos;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float s = fract(vPos.y * 230.0 - uTime * 2.2);
    float scan = 0.4 + 0.6 * smoothstep(0.0, 0.12, s) * smoothstep(0.62, 0.48, s);
    // 根元から切っ先へ抜ける明るい帯
    float sweep = exp(-pow((vPos.y - (mod(uTime * 0.6, 1.25) - 0.1)) * 38.0, 2.0));
    float glitch = step(0.93, hash(floor(uTime * 18.0)));
    float a = min(1.0, uAlpha * (scan + sweep * 1.8) * (1.0 - glitch * 0.65) * uBoost * uFade);
    // 濃さを掛けた色で書き、重ね方は「色 + 下の色 × (1 − 濃さ)」（白い背景でも色が残り、透けたキャンバスにも描ける）
    gl_FragColor = vec4(uColor * a, a);
  }
`;
export function holoMat(color, alpha) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uTime: { value: 0 },
            uBoost: { value: 1 },
            uAlpha: { value: alpha },
            uFade: { value: 1 },
        },
        vertexShader: holoVert,
        fragmentShader: holoFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        side: THREE.DoubleSide,
    });
}
// 細い長方形を並べた板（xy 平面、厚み 0）
export function rects(list) {
    const pos = [];
    for (const [x0, x1, y0, y1] of list) {
        const [a, b, c, d] = [x0 * MM, x1 * MM, y0 * MM, y1 * MM];
        pos.push(a, c, 0, b, c, 0, b, d, 0, a, c, 0, b, d, 0, a, d, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
}
// 六角柱。角を刃と棟の側（±x）へ向け、厚みの向きに潰す。r0 は下の端、r1 は上の端の半径（mm）
function hexPrism(y0, y1, r0, r1) {
    const geo = new THREE.CylinderGeometry(r1 * MM, r0 * MM, (y1 - y0) * MM, 6);
    geo.rotateY(Math.PI / 6);
    geo.scale(1, 1, GRIP_FLAT);
    geo.translate(0, ((y0 + y1) / 2) * MM, 0);
    return geo;
}
// 刃に直交する板（x と z の輪郭を y の向きへ押し出す）
function crossPlate(outline, y0, y1, bevel = 0.0006) {
    const geo = plate(outline, (y1 - y0) * MM, bevel);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, ((y0 + y1) / 2) * MM, 0);
    return geo;
}
// 光る帯の刃先は、爪・紅線と同じく三角断面をロフトする。
// inner は骨格に埋まる側（骨格の厚みの半分 4.5 mm より薄くし、根元と切っ先の塊の中へ隠す）、outer は厚み 0 の刃先。
// 骨格の外に出るのは 3 mm、窓の区間でも 5 mm だけの細い線にする
// 窓の区間では inner の面がそのまま見え、光の帯が根元と切っ先の間に張られて見える
function edgeGeometry(map) {
    const outerAt = (y) => (y <= EDGE_BEND ? EDGE_X : EDGE_X - EDGE_SLOPE * (y - EDGE_BEND));
    const rings = [140, EDGE_BEND, 720, 760, 800, 840, 860].map((y) => {
        const outer = outerAt(y);
        const inner = y <= EDGE_BEND ? 14 : Math.max(outer - 10.5, -19);
        const halfT = y <= EDGE_BEND ? 3.2 : 3.2 - ((y - EDGE_BEND) / (TIP[1] - EDGE_BEND)) * 2.2;
        const v = (x, z) => {
            const [mx, my] = map([x, y]);
            return new THREE.Vector3(mx * MM, my * MM, z * MM);
        };
        return [v(inner, halfT), v(outer, 0), v(inner, -halfT)];
    });
    const [tx, ty] = map(TIP);
    rings.push([new THREE.Vector3(tx * MM, ty * MM, 0)]);
    return loftRings(rings);
}
export function holoBlade(m, holo, map = (p) => p) {
    const g = new THREE.Group();
    const add = (outline, depth, mat, bevel = 0.0012) => g.add(new THREE.Mesh(plate(outline.map(map), depth, bevel), mat));
    add(FRAME, 0.009, m.frame);
    const edge = new THREE.Mesh(edgeGeometry(map), m.edge);
    g.add(edge);
    add(VOID, 0.0105, m.void, 0.0005);
    add(SIGNAL, 0.0111, m.signal, 0.00045);
    add(WINDOW, 0.001, holo.fill, 0.0002);
    add(HOLO_EDGE, 0.0012, holo.edge, 0.0003);
    const lines = [...HOLO_SPINE, ...HOLO_TICKS].map(([x0, x1, y0, y1]) => {
        const [a, b] = map([x0, y0]);
        const [c, d] = map([x1, y1]);
        return [a, c, b, d];
    });
    g.add(new THREE.Mesh(rects(lines), holo.line));
    return { g, edge };
}
export const HOLO_GLOW = 0x1ec8ff; // 刃先の帯のにじみ（鎖鎌のホロライン skinGhostlineSickle.ts も使う）
export function createHoloMats(env) {
    const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, flatShading: true, ...o });
    return {
        frame: std({ color: 0x071117, metalness: 0.92, roughness: 0.2, envMapIntensity: 1.7 }),
        // 刃先の帯: 強く光らせると白に近い明るいシアンに飛ぶ（明るさは tickGlow で動かす）
        edge: std({ color: 0x9ef0ff, emissive: 0x18c8ff, emissiveIntensity: 1.8, metalness: 0.2, roughness: 0.3 }),
        void: std({ color: 0x020405, metalness: 0.25, roughness: 0.7 }),
        hardware: std({ color: 0x8a9396, metalness: 1, roughness: 0.25, envMapIntensity: 1.8 }),
        signal: std({ color: 0xbff6ff, emissive: 0x22d0ff, emissiveIntensity: 1.6, metalness: 0.1, roughness: 0.2 }),
    };
}
// 光はゆっくり脈打ち、当てた瞬間（skinFx.flare）に強まってすぐ引く。一閃の構えの間は速く強く脈打ち、切っ先の先へ光の線を伸ばす
let glowAt = 0;
function tickGlow(m, glow, holo, reach, halos) {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - glowAt));
    glowAt = now;
    skinFx.flare *= Math.exp(-dt * 4.5);
    const pulse = 0.5 + 0.5 * Math.sin(now * 3.6);
    const focusPulse = 0.5 + 0.5 * Math.sin(now * 11);
    const focus = skinFx.focus * (0.7 + 0.5 * focusPulse);
    m.edge.emissiveIntensity = 1.8 + pulse * 0.3 + skinFx.flare * 1.8 + focus * 1.2;
    m.signal.emissiveIntensity = 1.4 + pulse * 0.3 + skinFx.flare * 2.3 + focus * 0.9;
    glow.strength = 0.7 + 0.12 * pulse + skinFx.flare * 0.6 + focus * 0.4;
    // ホログラムは当てた瞬間と一閃の構えで濃くなる
    for (const mat of holo) {
        mat.uniforms.uTime.value = now;
        mat.uniforms.uBoost.value = 1 + skinFx.flare * 1.6 + focus * 0.8;
    }
    reach.uniforms.uTime.value = now;
    reach.uniforms.uBoost.value = skinFx.focus ** 2 * (0.8 + 0.4 * focusPulse);
    for (const [i, halo] of halos.entries())
        halo.rotation.y += HOLO_HALOS[i][3] * (1 + skinFx.focus * 3) * dt;
}
// 鎖鎌と斧のホロラインの光: ゆっくり脈打ち、当てた瞬間（skinFx.flare）に強まってすぐ引く。浮かぶ輪（spins の速さで回す）は当てた瞬間だけ速く回る
let holoAt = 0;
export function tickHoloGlow(m, glow, holo, halos, spins) {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - holoAt));
    holoAt = now; // 左右の鎌で 2 回呼ばれても、引くのは 1 回ぶん
    skinFx.flare *= Math.exp(-dt * 4.5);
    const pulse = 0.5 + 0.5 * Math.sin(now * 3.6);
    m.edge.emissiveIntensity = 1.8 + pulse * 0.3 + skinFx.flare * 1.8;
    m.signal.emissiveIntensity = 1.4 + pulse * 0.3 + skinFx.flare * 2.3;
    glow.strength = 0.7 + 0.12 * pulse + skinFx.flare * 0.6;
    for (const mat of holo) {
        mat.uniforms.uTime.value = now;
        mat.uniforms.uBoost.value = 1 + skinFx.flare * 1.6;
    }
    for (const [i, halo] of halos.entries())
        halo.rotation.y = spins[i] * (now + skinFx.flare * 0.8);
}
// ---- 一閃の構え ----
// 構えに入るときは刀を手の中で半回転させて跳ね上げ、右手の前で垂直に立てる（切っ先は少し奥と中央へ倒す）。
// 刃先を中央へ向け、光る刃先の縦の線越しに敵を見る。構えの間は切っ先の先へ光の線が伸びる。
// 突進が始まったら、立てた刀を右の腰の横へ寝かせて切っ先を後ろへ引き、元の一閃の振りかぶりへつなぐ
export const HOLO_FOCUS = {
    ...swordPose([0.14, 0.0, -0.2], [-0.1, 1, -0.2], [-1, 0, 0]),
    enterSpin: 180,
    rush: swordPose([0.2, 0.04, 0.04], [0.4, 0.05, 1], [0, 1, 0]),
};
const afterimages = [];
let afterAt = -Infinity;
function afterimage() {
    if (afterimages.length)
        return afterimages;
    const geo = plate(AFTER_BLADE, 0.0008, 0.0002);
    for (let i = 0; i < AFTER_POOL; i++) {
        const mesh = new THREE.Mesh(geo, holoMat(0x2ac0e8, AFTER_ALPHA));
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        const a = { mesh, born: -Infinity };
        mesh.onBeforeRender = () => {
            const k = 1 - (game.trailNow - a.born) / AFTER_LIFE;
            if (k <= 0) {
                mesh.visible = false;
                return;
            }
            mesh.material.uniforms.uTime.value = performance.now() / 1000;
            mesh.material.uniforms.uFade.value = Math.min(1, k) ** 2;
        };
        camera.add(mesh);
        afterimages.push(a);
    }
    return afterimages;
}
export const ghostlineSword = {
    swing(at, time) {
        if (time - afterAt < AFTER_EVERY && time >= afterAt)
            return;
        afterAt = time;
        const pool = afterimage();
        const a = pool.reduce((old, b) => (b.born < old.born ? b : old));
        a.born = time;
        a.mesh.matrix.copy(at);
        a.mesh.matrixWorldNeedsUpdate = true;
        a.mesh.visible = true;
    },
    build(parts, mats) {
        for (const name of ['blade', 'habaki', 'guard', 'grip', 'pommel'])
            if (parts[name])
                parts[name].visible = false;
        const m = createHoloMats(mats.metal.envMap);
        const g = new THREE.Group();
        const add = (outline, depth, mat, bevel = 0.0012) => {
            const mesh = new THREE.Mesh(plate(outline, depth, bevel), mat);
            g.add(mesh);
            return mesh;
        };
        const holoFill = holoMat(0x06222b, 0.6);
        const holoEdge = holoMat(0x22c8f0, 0.6);
        const holoLine = holoMat(0x5fe4ff, 0.7);
        const holoReach = holoMat(0x5fe4ff, 0.8);
        const blade = holoBlade(m, { fill: holoFill, edge: holoEdge, line: holoLine });
        const edge = blade.edge;
        g.add(blade.g);
        const glow = addGlow(edge, HOLO_GLOW); // にじませるのは刃先の帯だけ（背骨の線までにじませると刀身が光に埋もれる）
        add(COLLAR, 0.020, m.frame);
        for (const [y0, y1, k, mat] of GUARD_LAYERS) {
            const outline = GUARD.map(([x, z]) => [x * k, z * k]);
            g.add(new THREE.Mesh(crossPlate(outline, y0, y1), m[mat]));
        }
        g.add(new THREE.Mesh(hexPrism(GRIP_TOP, 97, 10.2, 10.8), m.hardware));
        // 芯の導光体を通し、その上に節を隙間をあけて積む。柄全体も下へ向かって少し細くする
        g.add(new THREE.Mesh(hexPrism(GRIP_BOTTOM, GRIP_TOP, 6.6, 7), m.signal));
        const segLen = (GRIP_TOP - GRIP_BOTTOM - GRIP_GAP * (GRIP_SEGMENTS - 1)) / GRIP_SEGMENTS;
        const radiusAt = (y) => 8.4 + ((y - GRIP_BOTTOM) / (GRIP_TOP - GRIP_BOTTOM)) * 1.2;
        for (let i = 0; i < GRIP_SEGMENTS; i++) {
            const y1 = GRIP_TOP - i * (segLen + GRIP_GAP);
            const y0 = y1 - segLen;
            g.add(new THREE.Mesh(hexPrism(y0, y1, radiusAt(y0) * 0.86, radiusAt(y1)), m.frame));
        }
        for (const [y0, y1, r0, r1, mat] of POMMEL_RINGS)
            g.add(new THREE.Mesh(hexPrism(y0, y1, r0, r1), m[mat]));
        // ホログラム: 鍔の上の輪・構えの間の光の線（窓の板・投影刃・棟の光の線・窓の目盛りは刀身と一緒に作る）
        g.add(new THREE.Mesh(rects(HOLO_REACH), holoReach));
        const halos = HOLO_HALOS.map(([y, r0, r1]) => {
            const geo = new THREE.RingGeometry(r0 * MM, r1 * MM, 6, 1);
            geo.rotateX(-Math.PI / 2);
            const halo = new THREE.Mesh(geo, holoLine);
            halo.position.y = y * MM;
            g.add(halo);
            return halo;
        });
        edge.onBeforeRender = () => tickGlow(m, glow, [holoFill, holoEdge, holoLine], holoReach, halos);
        return g;
    },
};

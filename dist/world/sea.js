import * as THREE from 'three';
import { groundReveal, riseOrigin } from './reveal.js?v=e316db84';
import { shipState } from './shipState.js?v=e316db84';
// ---- 海（SHIP） ----
// 地面の代わりに、うねる海面を視点のまわりにだけ敷く。色は灰色の濃淡で、波の山ほど明るく、谷ほど暗い。
// 床と同じ細いグリッドを海面に引き、うねりで曲げて水と一緒に流す（船が進む速さを体感させる）。
// 白い泡は、波の山の砕け目・船体のまわり・船首から斜めに開く波・船尾から伸びる航跡に立てる。
// 船は止めたまま、水を +z（船首から船尾）へ流して進んでいるように見せる。
// 船の揺れも同じ考えで、船（とその上の物すべて）は傾けずに、海を反対へ傾けて上下させる（seaRoot）。
// 視点は、頭が揺れに逆らって起きている分だけ海と同じ向きへ傾ける（shipSway.view）。そうすると、
// 画面では甲板と水平線の両方が傾いて見える。当たり判定と重力は傾かない
const SIZE = 360; // 敷く広さ (m)。霧で 150m 先は背景に溶けるので、これで地平まで埋まる
const SEGMENTS = 240; // 1.5m おきの頂点
const STEP = SIZE / SEGMENTS;
const uniforms = {
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uHull: { value: new THREE.Vector4() }, // 船の幅の半分, 船首の先, 細くなり始める所（船首側）, 同（船尾側）
    uStern: { value: 0 },
    uOffset: { value: new THREE.Vector2() }, // 海面を視点についていかせたずれ（seaRoot の中での xz）
    uAmp: { value: 1 }, // 波の高さに掛ける倍率。荒れるほど、大波の間ほど高い
};
const HEAD_STEADY = 0.35; // 船の揺れのうち、頭が逆らって打ち消す割合（画面で甲板が傾いて見える量）。大きいほど照準と弾の向きがずれる
// 波: 向き・波長 (m)・高さ。高さは合わせて 1m ほどのうねり
const WAVES = [
    [0.3, 1, 42, 0.42],
    [-0.62, 0.78, 25, 0.24],
    [0.92, 0.38, 16, 0.12],
    [-0.25, 0.97, 11, 0.06],
];
const waveGlsl = WAVES.map(([dx, dz, len, amp]) => {
    const l = Math.hypot(dx, dz);
    const k = (2 * Math.PI) / len;
    const w = Math.sqrt(9.8 * k);
    return `wave(q, vec2(${(dx / l).toFixed(4)}, ${(dz / l).toFixed(4)}), ${k.toFixed(5)}, ${w.toFixed(5)}, ${amp.toFixed(3)}, h, dh);`;
}).join('\n    ');
const commonGlsl = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform vec2 uOffset;
  uniform float uAmp;
  varying vec3 vSea; // 海面の xz と、波の高さ
  void wave(vec2 q, vec2 d, float k, float w, float a, inout float h, inout vec2 dh) {
    float ph = k * dot(d, q) - w * uTime;
    h += a * sin(ph);
    dh += a * k * d * cos(ph);
  }
  // 水と一緒に流れる座標
  vec2 seaFlow(vec2 p) { return vec2(p.x, p.y - uFlow * uTime); }
`;
export const seaMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
seaMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uReveal: groundReveal, uRiseOrigin: riseOrigin });
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${commonGlsl}`)
        .replace('#include <beginnormal_vertex>', `vec2 seaP = position.xz + uOffset;
      float h = 0.0;
      vec2 dh = vec2(0.0);
      {
        vec2 q = seaFlow(seaP);
        ${waveGlsl}
      }
      h *= uAmp;
      dh *= uAmp;
      vec3 objectNormal = normalize(vec3(-dh.x, 1.0, -dh.y));`)
        .replace('#include <begin_vertex>', `vec3 transformed = position + vec3(0.0, h, 0.0);\nvSea = vec3(seaP, h);`);
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
      ${commonGlsl}
      uniform vec4 uHull;
      uniform float uStern;
      uniform float uReveal;
      uniform vec2 uRiseOrigin;
      float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float seaNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), f.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // ステージの明るさ（0 が黒、1 が白）を、描くときの色に直す
      vec3 seaGray(float l) { return vec3(pow(l, 2.2)); }
      // 船の幅の半分（ship.ts の船体と同じ形）。船の前後の外では負
      float hullHalf(float z) {
        if (z < uHull.y || z > uStern) return -1.0;
        if (z < uHull.z) { float t = (uHull.z - z) / (uHull.z - uHull.y); return max(1.2, uHull.x * (1.0 - t * t)); }
        if (z > uHull.w) { float t = (z - uHull.w) / (uStern - uHull.w); return uHull.x * (1.0 - 0.3 * t * t); }
        return uHull.x;
      }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vSea.xy;
        if (distance(p, uRiseOrigin) > uReveal) discard;
        vec2 q = seaFlow(p);
        float h = vSea.z;
        // 谷は暗く、山は明るく
        float l = mix(0.36, 0.6, smoothstep(-0.7, 0.7, h));
        // 泡: 流れる模様で千切る。山の砕け目にだけ薄く立てる
        float n = seaNoise(q * vec2(0.35, 0.12)) * 0.6 + seaNoise(q * vec2(1.1, 0.5)) * 0.4;
        float foam = smoothstep(0.55, 0.85, h + n * 0.5) * 0.55;
        float ax = abs(p.x);
        float w = hullHalf(p.y);
        // 船体のまわり: 舷に打ち寄せる白い帯
        if (w > 0.0) foam = max(foam, (1.0 - smoothstep(0.0, 2.5 + n * 3.0, ax - w)) * 0.95);
        // 船首から斜めに開く波（船の後ろへ 19 度ほどで広がる）
        float bz = p.y - uHull.y;
        if (bz > 0.0) {
          float fade = exp(-bz / 140.0);
          float arm = abs(ax - bz * 0.36 - 1.0);
          foam = max(foam, (1.0 - smoothstep(0.4, 2.2 + bz * 0.02, arm + n * 1.5)) * fade * 0.9);
        }
        // 船尾から伸びる航跡: 船体の幅で始まり、後ろへ広がりながら薄れていく
        float sz = p.y - uStern;
        if (sz > 0.0) {
          float wakeW = uHull.x * 0.55 + sz * 0.12;
          float wake = 1.0 - smoothstep(wakeW * 0.6, wakeW, ax + (n - 0.5) * 4.0);
          float churn = smoothstep(0.35, 0.75, n + exp(-sz / 30.0) * 0.4);
          foam = max(foam, wake * churn * exp(-sz / 110.0));
        }
        l = mix(l, 0.96, clamp(foam, 0.0, 1.0));
        // 床と同じ 1m と 5m のグリッドを、うねりで少し曲げて水と一緒に流す
        vec2 g = q + vec2(0.0, h * 0.8);
        vec2 g1 = abs(fract(g - 0.5) - 0.5) / fwidth(g);
        vec2 g5 = abs(fract(g / 5.0 - 0.5) - 0.5) / fwidth(g / 5.0);
        float line = max((1.0 - min(min(g1.x, g1.y), 1.0)) * 0.1, (1.0 - min(min(g5.x, g5.y), 1.0)) * 0.2);
        l *= 1.0 - line * (1.0 - foam);
        diffuseColor.rgb = seaGray(l);
      }`);
};
export const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2), seaMaterial);
seaMesh.receiveShadow = true;
seaMesh.frustumCulled = false; // 波で上下に動くので、平らな形のままでは見切れて消えることがある
seaMesh.visible = false;
seaMesh.renderOrder = 1; // 船より後に描き、甲板や船体に隠れる所の色の計算を飛ばさせる
// 揺れで傾ける親。シーンにはこちらを足す
export const seaRoot = new THREE.Group();
seaRoot.add(seaMesh);
// 視点を傾ける向き（世界の軸のまわり）。fx/camera.ts が描く直前に足す。海の無いステージでは傾けない
export const shipSway = { view: new THREE.Quaternion() };
const camLocal = new THREE.Vector3();
// 視点についていかせる（傾けた親の中の位置で）。頂点の間隔の刻みで動かせば、波の形は揺れない。
// 描く直前に動かすので、行列もここで直す（直さないと 1 フレーム遅れて、刻みが変わるたびに波が跳ぶ）
seaMesh.onBeforeRender = (_r, _s, cam) => {
    seaRoot.worldToLocal(camLocal.copy(cam.position));
    seaMesh.position.set(Math.round(camLocal.x / STEP) * STEP, 0, Math.round(camLocal.z / STEP) * STEP);
    seaMesh.updateMatrixWorld();
    uniforms.uOffset.value.set(seaMesh.position.x, seaMesh.position.z);
};
let sway = null;
let rail = 0; // 舷の手すりの x（積み荷が越えて落ちる縁）
// 海を出す / 消す（null で消す）
export function setSea(sea) {
    seaMesh.visible = !!sea;
    sway = sea?.sway ?? null;
    rail = (sea?.hull.beam ?? 0) - 0.45;
    falling.clear();
    seaRoot.position.set(0, 0, 0);
    seaRoot.quaternion.identity();
    shipSway.view.identity();
    uniforms.uTime.value = 0;
    if (!sea)
        return;
    uniforms.uFlow.value = sea.flow;
    uniforms.uHull.value.set(sea.hull.beam, sea.hull.bow, sea.hull.midBow, sea.hull.midStern);
    uniforms.uStern.value = sea.hull.stern;
}
const swayEuler = new THREE.Euler();
const swayPivot = new THREE.Vector3();
export function updateSea(dt) {
    if (!seaMesh.visible)
        return;
    uniforms.uTime.value += dt;
    if (!sway)
        return;
    // 船の傾き: 横揺れ（z の軸のまわり。正で右舷（+x）が上がる）と縦揺れ（x の軸のまわり。正で船首が上がる）と上下
    const { roll, pitch, heave } = shipState;
    seaRoot.quaternion.setFromEuler(swayEuler.set(-pitch, 0, -roll));
    swayPivot.set(0, sway.pivotY, 0);
    seaRoot.position.copy(swayPivot).sub(swayPivot.clone().applyQuaternion(seaRoot.quaternion));
    seaRoot.position.y -= heave;
    shipSway.view.setFromEuler(swayEuler.set(-pitch * HEAD_STEADY, 0, -roll * HEAD_STEADY));
    uniforms.uAmp.value = 1 + 0.6 * shipState.rage + 1.4 * shipState.big;
    updateFalling();
}
// ---- 海へ落ちる積み荷 ----
// 大波で手すりを越えた積み荷（shipState.fallen。当たり判定は外してある）を、手すりの縁を支点に外へ倒しながら滑り出させ、
// 少し遅れて海へ落とす。海面は不透明なので、沈んだ所は見えなくなる。沈みきったら隠す
const FALL_SLIDE = 6; // 縁を越えていく速さ (m/s)
const FALL_TIP = 2.2; // 倒れる角の速さの増え方 (rad/s²)
const FALL_DROP_AFTER = 0.35; // 倒れ始めてから落ち始めるまで (s)
const FALL_HIDE = 4.5; // これだけたったら隠す (s)
const DECK_Y = 12; // 甲板の高さ（倒れる支点の高さ）
const falling = new Map(); // 落ち始めたときの部品の x
const fallQuat = new THREE.Quaternion();
const fallAxis = new THREE.Vector3(0, 0, 1);
const fallPivot = new THREE.Vector3();
const fallTmp = new THREE.Vector3();
function updateFalling() {
    for (const f of shipState.fallen) {
        if (!f.root.visible)
            continue;
        if (!falling.has(f.root))
            falling.set(f.root, f.root.position.x);
        const t = shipState.time - f.time;
        if (t >= FALL_HIDE) {
            f.root.visible = false;
            continue;
        }
        // 外の向きへ倒す（右舷へ落ちるなら上が +x へ。z の軸のまわりに負）
        const tip = Math.min(Math.PI * 0.6, FALL_TIP * t * t);
        fallQuat.setFromAxisAngle(fallAxis, -f.direction * tip);
        fallPivot.set(f.direction * rail, DECK_Y, 0);
        // 部品の root は原点にある（ずれは position.x）。支点のまわりに回した位置へ置き、外へ滑らせて落とす
        fallTmp.set(falling.get(f.root), 0, 0).sub(fallPivot).applyQuaternion(fallQuat).add(fallPivot);
        const drop = Math.max(0, t - FALL_DROP_AFTER);
        f.root.position.set(fallTmp.x + f.direction * FALL_SLIDE * t, fallTmp.y - 4.9 * drop * drop, 0);
        f.root.quaternion.copy(fallQuat);
    }
}

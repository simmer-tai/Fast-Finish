import * as THREE from 'three';

// ---- 軌跡の帯 ----
// 時刻つきの 2 点（tip, base）を順に並べて帯にする。古いものほど細くなり、根元側から削れて消える
export const RIBBON_COLOR = new THREE.Color(0x2a2a2a);
export const RIBBON_EDGE_COLOR = new THREE.Color(0x000000);
export const RIBBON_CORE_COLOR = new THREE.Color(0x000000); // 切っ先の縁のいちばん外側の細い芯
// 武器ごとの軌跡の見た目。数値はどれも帯の幅に対する割合（0 = 根元, 1 = 切っ先）
export interface RibbonStyle {
  taper: number; // 消える直前に根元を切っ先へ寄せる割合（大きいほど古い側が尖る）
  cut: number; // 消える直前までに根元側から削る割合
  edge: number; // 黒い縁が始まる位置（小さいほど縁が太い）
  core: number; // 芯が始まる位置（小さいほど芯が太い）
  body: [number, number]; // 本体の濃さ（根元側, 切っ先側）
  bodyColor?: THREE.Color; // 本体の色（省略で濃いグレー）。黒い縁と芯はそのまま
}
export const RIBBON_BLACK = new THREE.Color(0x000000);
// クナイ: 細く鋭く。古い側を強く尖らせ、素早く削る。本体は黒の半透明
export const KUNAI_RIBBON: RibbonStyle = { taper: 0.7, cut: 0.95, edge: 0.74, core: 0.92, body: [0.12, 0.3], bodyColor: RIBBON_BLACK };
// 剣: 幅広の弧をそのまま見せる。尖らせ方は緩く、切っ先の黒い縁と芯は細く
export const SWORD_RIBBON: RibbonStyle = { taper: 0.3, cut: 0.75, edge: 0.92, core: 0.98, body: [0.3, 0.5] };
// 斧: 太く濃く、黒い縁を厚くして重さを出す（寿命は短め）
export const AXE_RIBBON: RibbonStyle = { taper: 0.4, cut: 0.7, edge: 0.68, core: 0.95, body: [0.4, 0.62] };
// 斧の空中の叩きつけ: 地上の振りよりさらに太く濃く。黒い縁を厚く、芯もはっきり通す
export const AXE_SLAM_RIBBON: RibbonStyle = { taper: 0.25, cut: 0.6, edge: 0.6, core: 0.93, body: [0.5, 0.75] };
// 鎌: 曲線を活かして芯を目立たせる。本体は黒の半透明
export const SICKLE_RIBBON: RibbonStyle = { taper: 0.6, cut: 0.85, edge: 0.8, core: 0.9, body: [0.12, 0.28], bodyColor: RIBBON_BLACK };
export const taperedBase = new THREE.Vector3();
// fade（1 = 新しい, 0 = 消える）に合わせて根元を切っ先へ寄せる
export function taperBase(base: THREE.Vector3, tip: THREE.Vector3, fade: number, taper: number) {
  return taperedBase.copy(base).lerp(tip, (1 - fade) * taper);
}
// style を省くと、飛んでいるクナイの筋（中央が濃く、両側へ抜ける帯）になる
export function makeRibbonMaterial(style?: RibbonStyle) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: style?.bodyColor ?? RIBBON_COLOR },
      uEdgeColor: { value: RIBBON_EDGE_COLOR },
      uCoreColor: { value: RIBBON_CORE_COLOR },
      uCut: { value: style?.cut ?? 0 },
      uEdge: { value: style?.edge ?? 0 },
      uCore: { value: style?.core ?? 0 },
      uBody: { value: new THREE.Vector2(...(style?.body ?? [0, 0])) },
      uFlight: { value: new THREE.Vector2(2, 0.85) }, // 飛ぶ筋の消え方（fade の何乗か, 濃さ）
    },
    defines: style ? {} : { SYMMETRIC: '' },
    vertexShader: /* glsl */ `
      attribute float aFade;
      attribute float aSide;
      varying float vFade;
      varying float vSide;
      void main() {
        vFade = aFade;
        vSide = aSide;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uEdgeColor;
      uniform vec3 uCoreColor;
      uniform float uCut;
      uniform float uEdge;
      uniform float uCore;
      uniform vec2 uBody;
      uniform vec2 uFlight;
      varying float vFade;
      varying float vSide;
      void main() {
      #ifdef SYMMETRIC
        // 飛んでいるクナイの筋: 中央が濃く、両側へ抜ける
        float a = pow(vFade, uFlight.x) * (1.0 - abs(vSide * 2.0 - 1.0)) * uFlight.y;
        gl_FragColor = vec4(uEdgeColor, a);
      #else
        // 斬撃・回転の軌跡: 透けて薄れるのではなく、古いほど根元側から境目のくっきりした線で削れる。
        // 切っ先側の黒い縁は最後まで残し、そのいちばん外側に細い芯を通す
        float cut = (1.0 - vFade) * uCut;
        float body = smoothstep(cut, cut + 0.05, vSide);
        if (body <= 0.0) discard;
        float edge = smoothstep(uEdge, uEdge + 0.06, vSide);
        float core = smoothstep(uCore, uCore + 0.03, vSide);
        // 縁と芯は本体より少し濃いだけにとどめ、切っ先が真っ黒に潰れないようにする
        float edgeA = max(uBody.y, 0.5);
        float coreA = max(uBody.y, 0.65);
        float a = body * mix(mix(mix(uBody.x, uBody.y, vSide), edgeA, edge), coreA, core) * smoothstep(0.0, 0.15, vFade);
        gl_FragColor = vec4(mix(mix(uColor, uEdgeColor, edge), uCoreColor, core), a);
      #endif
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 4,
  });
  mat.userData.taper = style?.taper ?? 0;
  return mat;
}
export const spinRibbonMat = makeRibbonMaterial(KUNAI_RIBBON);
export const flightRibbonMat = makeRibbonMaterial();
// 矢の筋: クナイより濃く、ゆっくり薄れて長く残る
export const arrowRibbonMat = makeRibbonMaterial();
arrowRibbonMat.uniforms.uFlight.value.set(0.8, 1);

export interface RibbonSample { tip: THREE.Vector3; base: THREE.Vector3; time: number; join: boolean }
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private samples: RibbonSample[] = [];
  private pool: RibbonSample[] = [];
  private join = false;
  private geo = new THREE.BufferGeometry();
  private positions: THREE.BufferAttribute;
  private fade: THREE.BufferAttribute;
  private index: THREE.BufferAttribute;

  private taper: number;

  constructor(private max: number, private life: number, material: THREE.Material) {
    this.taper = material.userData.taper ?? 0;
    this.positions = new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.fade = new THREE.BufferAttribute(new Float32Array(max * 2), 1).setUsage(THREE.DynamicDrawUsage);
    const side = new THREE.BufferAttribute(new Float32Array(max * 2), 1);
    for (let i = 0; i < max; i++) side.setX(i * 2 + 1, 1);
    this.index = new THREE.BufferAttribute(new Uint16Array((max - 1) * 6), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.positions);
    this.geo.setAttribute('aFade', this.fade);
    this.geo.setAttribute('aSide', side);
    this.geo.setIndex(this.index);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  get empty() {
    return this.samples.length === 0;
  }

  push(tip: THREE.Vector3, base: THREE.Vector3, time: number) {
    const s = this.samples.length >= this.max
      ? this.samples.shift()!
      : this.pool.pop() ?? { tip: new THREE.Vector3(), base: new THREE.Vector3(), time: 0, join: false };
    s.tip.copy(tip);
    s.base.copy(base);
    s.time = time;
    s.join = this.join;
    this.join = true;
    this.samples.push(s);
  }

  // 次に足す点を前の点とつながない
  cut() {
    this.join = false;
  }

  update(now: number) {
    const { samples } = this;
    while (samples.length && now - samples[0].time > this.life) this.pool.push(samples.shift()!);
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const f = 1 - (now - s.time) / this.life;
      const base = taperBase(s.base, s.tip, f, this.taper);
      this.positions.setXYZ(i * 2, base.x, base.y, base.z);
      this.positions.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
      this.fade.setX(i * 2, f);
      this.fade.setX(i * 2 + 1, f);
    }
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (!samples[i + 1].join) continue;
      const a = i * 2;
      this.index.setX(idx++, a);
      this.index.setX(idx++, a + 1);
      this.index.setX(idx++, a + 2);
      this.index.setX(idx++, a + 1);
      this.index.setX(idx++, a + 3);
      this.index.setX(idx++, a + 2);
    }
    this.geo.setDrawRange(0, idx);
    this.positions.needsUpdate = true;
    this.fade.needsUpdate = true;
    this.index.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
  }
}

// 1 フレームの間にも振りは大きく進むので、ポーズを細かい時間刻みで計算し直して弧を滑らかにする
export const TRAIL_STEP = 1 / 240;

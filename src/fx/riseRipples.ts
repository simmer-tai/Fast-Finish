import * as THREE from 'three';
import { scene } from '../core.js';
import type { Block } from '../world/blocks.js';

// ---- 組み上がりの波紋 ----
// 高い柱が組み上がった瞬間に、その足もとの床から、柱の形（底面の四角）に沿った輪が外へ広がって薄れる。
// 輪は 2 本で、後の 1 本は少し遅れて細く出る。時刻はせり上がりの時間 t で決めるので、止めて見ても同じ形になる
const MAX_RIPPLES = 8;
const RIPPLE_TIME = 0.7;
const RIPPLE_REACH = 9; // 底面の縁から広がりきるまでの距離 (m)
const RIPPLE_ECHO = 0.12; // 後の輪の遅れ (s)

const rippleMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { uHalf: { value: new THREE.Vector2() }, uK: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(0x222222) } },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        // 板の中の座標 (−0.5..0.5) を、板の大きさを掛けて m に直す（向きは問わない。四角も輪も上下左右に対称）
        vPos = position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 uHalf;
      uniform vec2 uK;
      uniform vec3 uColor;
      varying vec2 vPos;
      // 底面の四角からの距離（角は丸める）
      float boxDist(vec2 p) {
        vec2 q = abs(p) - uHalf;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      }
      float ring(float d, float k, float w) {
        if (k <= 0.0 || k >= 1.0) return 0.0;
        float r = ${RIPPLE_REACH.toFixed(1)} * (1.0 - pow(1.0 - k, 3.0));
        return (1.0 - smoothstep(0.0, w, abs(d - r))) * (1.0 - k);
      }
      void main() {
        float d = boxDist(vPos);
        if (d < 0.0) discard;
        float a = max(ring(d, uK.x, 0.22) * 0.75, ring(d, uK.y, 0.1) * 0.5);
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

interface Ripple { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; t0: number }
const ripples: Ripple[] = [];
const unitPlane = new THREE.PlaneGeometry(1, 1);

// t はせり上がりを始めてからの時間。いっぱいなら出さない
export function spawnRiseRipple(b: Block, t: number) {
  let r = ripples.find((p) => !p.mesh.visible);
  if (!r) {
    if (ripples.length >= MAX_RIPPLES) return;
    const mesh = new THREE.Mesh(unitPlane, rippleMat());
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    scene.add(mesh);
    r = { mesh, t0: 0 };
    ripples.push(r);
  }
  const hx = (b.maxX - b.minX) / 2;
  const hz = (b.maxZ - b.minZ) / 2;
  // 板は寝かせると x → x、y → −z になるので、y の大きさに z の幅を当てる
  r.mesh.position.set((b.minX + b.maxX) / 2, (b.y0 ?? 0) + 0.03, (b.minZ + b.maxZ) / 2);
  r.mesh.scale.set(2 * (hx + RIPPLE_REACH + 0.5), 2 * (hz + RIPPLE_REACH + 0.5), 1);
  r.mesh.material.uniforms.uHalf.value.set(hx, hz);
  r.mesh.visible = true;
  r.t0 = t;
}

// 広がっている途中なら true
export function updateRiseRipples(t: number) {
  let live = false;
  for (const r of ripples) {
    if (!r.mesh.visible) continue;
    const k = (t - r.t0) / RIPPLE_TIME;
    if (k >= 1 + RIPPLE_ECHO / RIPPLE_TIME || k < 0) {
      r.mesh.visible = false;
      continue;
    }
    live = true;
    r.mesh.material.uniforms.uK.value.set(k, k - RIPPLE_ECHO / RIPPLE_TIME);
  }
  return live;
}

export function clearRiseRipples() {
  for (const r of ripples) r.mesh.visible = false;
}

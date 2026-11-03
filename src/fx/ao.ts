import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

// ---- 環境光遮蔽（AO） ----
// 景色を描いた直後の深度だけから、隅や物の足元の暗がりを半分の解像度で求め、深度を見ながらぼかして元の画面に掛ける。
// 景色を描き直さないので、法線も深度の差から作る。手元の武器と空には掛けず、霧に溶ける遠くでは薄くする
const RADIUS = 0.9; // 暗がりを探す範囲 (m)
const INTENSITY = 1.4;
const MAX_SCREEN_RADIUS = 0.12; // 近くの物で探す範囲が広がりすぎないよう、画面の高さに対する上限
const VIEW_MODEL_DIST = 1.4; // これより手前は手元の武器（fx/postShaders.ts の MotionBlurShader と同じ）

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
// 深度からカメラ空間の位置に戻す
const viewPosGlsl = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProjInv;
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return v.xyz / v.w;
  }
`;

const aoMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      tDepth: { value: null },
      uProjInv: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uDepthTexel: { value: new THREE.Vector2() },
      uFogNear: { value: 20 },
      uFogFar: { value: 150 },
    },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      ${viewPosGlsl}
      uniform mat4 uProj;
      uniform vec2 uDepthTexel;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec2 vUv;
      const int SAMPLES = 12;
      void main() {
        float d = texture2D(tDepth, vUv).x;
        if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
        vec3 p = viewPos(vUv);
        float dist = -p.z;
        float keep = smoothstep(${VIEW_MODEL_DIST.toFixed(2)}, ${(VIEW_MODEL_DIST + 0.4).toFixed(2)}, dist) * (1.0 - smoothstep(uFogNear, uFogFar, dist));
        if (keep <= 0.0) { gl_FragColor = vec4(1.0); return; }

        // 法線: 左右・上下のうち、差の小さい側を使う（物の縁で奥の面を拾わないように）
        vec3 pr = viewPos(vUv + vec2(uDepthTexel.x, 0.0)) - p;
        vec3 pl = p - viewPos(vUv - vec2(uDepthTexel.x, 0.0));
        vec3 pu = viewPos(vUv + vec2(0.0, uDepthTexel.y)) - p;
        vec3 pd = p - viewPos(vUv - vec2(0.0, uDepthTexel.y));
        vec3 dx = dot(pr, pr) < dot(pl, pl) ? pr : pl;
        vec3 dy = dot(pu, pu) < dot(pd, pd) ? pu : pd;
        vec3 n = normalize(cross(dx, dy));

        vec2 rad = vec2(uProj[0][0], uProj[1][1]) * (${RADIUS.toFixed(2)} * 0.5 / dist);
        float s = min(1.0, ${MAX_SCREEN_RADIUS.toFixed(2)} / rad.y);
        rad *= s;
        // 画素ごとに回して、少ない数の点でも縞にならないようにする（あとでぼかして均す）
        float rot = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float occ = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          float t = (float(i) + 0.5) / float(SAMPLES);
          float a = float(i) * 2.3999632 + rot;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * sqrt(t) * rad;
          vec3 q = viewPos(uv);
          if (-q.z < ${VIEW_MODEL_DIST.toFixed(2)}) continue; // 手元の武器は景色を隠す物に数えない
          vec3 v = q - p;
          float vv = dot(v, v);
          float fall = max(0.0, 1.0 - vv / (${(RADIUS * RADIUS).toFixed(4)} * s * s)); // 探す範囲（上限で縮めた分も含む）の外ほど効かない
          occ += max(0.0, dot(v, n) - 0.002 * dist) / (vv + 0.01) * fall;
        }
        float ao = 1.0 - clamp(occ * ${(RADIUS * INTENSITY).toFixed(3)} / float(SAMPLES), 0.0, 1.0);
        gl_FragColor = vec4(vec3(mix(1.0, ao, keep)), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

// 深度の近い画素どうしだけを混ぜるぼかし（片方向）。物の縁を越えて暗がりがにじまないように
const blurMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { tAo: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uStep: { value: new THREE.Vector2() } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      ${viewPosGlsl}
      uniform sampler2D tAo;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        float z = viewPos(vUv).z;
        float sum = 0.0;
        float wsum = 0.0;
        for (int i = -3; i <= 3; i++) {
          vec2 uv = vUv + uStep * float(i);
          float w = exp(-float(i * i) / 8.0) * exp(-abs(viewPos(uv).z - z) / (0.03 * -z + 0.02));
          sum += texture2D(tAo, uv).r * w;
          wsum += w;
        }
        gl_FragColor = vec4(vec3(sum / wsum), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

// 元の画面の色に掛ける
const compositeMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { tAo: { value: null } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tAo;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(tAo, vUv).rgb, 1.0);
      }
    `,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
  });

export class AoPass extends Pass {
  private aoTarget = new THREE.WebGLRenderTarget(1, 1);
  private blurTarget = new THREE.WebGLRenderTarget(1, 1);
  private aoMat = aoMaterial();
  private blurMat = blurMaterial();
  private compositeMat = compositeMaterial();
  private quad = new FullScreenQuad();

  // 景色を描いた直後に置く（読み込み先の深度がその景色のもの）
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    super();
    this.needsSwap = false; // 今の画面に直接掛ける
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const depth = read.depthTexture;
    if (!depth) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;

    const fog = this.scene.fog;
    const u = this.aoMat.uniforms;
    u.tDepth.value = depth;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uProj.value.copy(this.camera.projectionMatrix);
    u.uDepthTexel.value.set(1 / read.width, 1 / read.height);
    if (fog instanceof THREE.Fog) {
      u.uFogNear.value = fog.near;
      u.uFogFar.value = fog.far;
    }
    this.quad.material = this.aoMat;
    renderer.setRenderTarget(this.aoTarget);
    this.quad.render(renderer);

    // 横 → 縦にぼかす
    const b = this.blurMat.uniforms;
    b.tDepth.value = depth;
    b.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    this.quad.material = this.blurMat;
    b.tAo.value = this.aoTarget.texture;
    b.uStep.value.set(1 / this.aoTarget.width, 0);
    renderer.setRenderTarget(this.blurTarget);
    this.quad.render(renderer);
    b.tAo.value = this.blurTarget.texture;
    b.uStep.value.set(0, 1 / this.aoTarget.height);
    renderer.setRenderTarget(this.aoTarget);
    this.quad.render(renderer);

    this.quad.material = this.compositeMat;
    this.compositeMat.uniforms.tAo.value = this.aoTarget.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    this.quad.render(renderer);

    renderer.autoClear = autoClear;
  }

  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    this.aoTarget.setSize(w, h);
    this.blurTarget.setSize(w, h);
  }

  dispose() {
    this.aoTarget.dispose();
    this.blurTarget.dispose();
    this.aoMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
    this.quad.dispose();
  }
}

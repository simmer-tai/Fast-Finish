import * as THREE from 'three';

// ---- ポストエフェクトのシェーダー ----
// 周辺ブラー・ビネット・集中線。強さ（uBlur / uVignette / uLines）は main.ts の updateSpeedFx が決める
const SPEED_LINE_COLOR = new THREE.Color(0xffffff);
const SPEED_LINE_OPACITY = 0.25;
const SPEED_LINE_DENSITY = 0.2; // 最大時に線を出す割合

export const SpeedFxShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uBlur: { value: 0 },
    uVignette: { value: 0 },
    uLines: { value: 0 },
    uLineColor: { value: SPEED_LINE_COLOR },
    uLineOpacity: { value: SPEED_LINE_OPACITY },
    uLineDensity: { value: SPEED_LINE_DENSITY },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uBlur;
    uniform float uVignette;
    uniform float uLines;
    uniform vec3 uLineColor;
    uniform float uLineOpacity;
    uniform float uLineDensity;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 c = vUv - 0.5;
      vec2 ca = vec2(c.x * uAspect, c.y);
      float r = length(ca);

      // 周辺ブラー: 中心へ向かってサンプルを並べる。画面端ほど強い
      float blur = uBlur * smoothstep(0.15, 0.7, r);
      vec4 col = vec4(0.0);
      const int SAMPLES = 10;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1);
        col += texture2D(tDiffuse, 0.5 + c * (1.0 - blur * t));
      }
      col /= float(SAMPLES);

      // ビネット
      col.rgb *= 1.0 - smoothstep(0.3, 0.9, r) * uVignette;

      // 集中線: 角度で区切った枠ごとに、線を出すか・太さ・始まる半径をランダムに決め、
      // 一定間隔で引き直してちらつかせる
      const float SLOTS = 160.0;
      float f = (atan(ca.y, ca.x) / 6.2831853 + 0.5) * SLOTS;
      float id = floor(f);
      float step_ = floor(uTime * 20.0);
      float on = step(1.0 - uLineDensity * uLines, hash(vec2(id, step_)));
      float halfWidth = 0.05 + 0.12 * hash(vec2(id + 17.0, step_));
      float fw = min(fwidth(f), 0.5);
      float mask = 1.0 - smoothstep(halfWidth - fw, halfWidth + fw, abs(fract(f) - 0.5));
      float inner = mix(0.5, 0.75, hash(vec2(id + 5.0, step_))) - 0.08 * uLines;
      float lines = on * mask * smoothstep(inner, inner + 0.2, r) * uLines;
      col.rgb = mix(col.rgb, uLineColor, lines * uLineOpacity);

      gl_FragColor = col;
    }
  `,
};

// 当たった瞬間の暗転・白黒・世界のスロー。強さは main.ts の updateHitFx が決める
export const ImpactFxShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDim: { value: 0 },
    uMono: { value: 0 },
    uInvert: { value: 0 },
    uSlow: { value: 0 }, // 世界だけのスローの効き (0〜1)
    uRing: { value: 0 }, // スローに入った瞬間に中心から広がる歪みの輪の半径（画面の高さ基準）
    uRingAmt: { value: 0 },
    uAspect: { value: window.innerWidth / window.innerHeight },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDim;
    uniform float uMono;
    uniform float uInvert;
    uniform float uSlow;
    uniform float uRing;
    uniform float uRingAmt;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      // 世界のスローに入った瞬間: 中心から広がる輪の所だけ、画を外へ押し出して歪ませる
      vec2 c = vUv - 0.5;
      c.x *= uAspect;
      float r = length(c);
      float wave = exp(-pow((r - uRing) / 0.09, 2.0)) * uRingAmt;
      vec2 push = r > 1e-4 ? c / r * wave * 0.007 : vec2(0.0);
      push.x /= uAspect;
      vec2 uv = vUv - push;
      // 遅い間は、四隅ほど色の三原色をずらしてにじませる
      float edge = dot(c, c) * uSlow;
      vec2 ca = c / max(uAspect, 1.0) * edge * 0.005;
      vec4 col = texture2D(tDiffuse, uv);
      col.r = texture2D(tDiffuse, uv + ca).r;
      col.b = texture2D(tDiffuse, uv - ca).b;
      // 色を抜いて暗くし、あとから重ねる白い光を際立たせる
      float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
      col.rgb = mix(col.rgb, vec3(lum), uDim * 0.6) * (1.0 - uDim * 0.6);
      // 世界のスロー: 色を少しだけ抜く（暗くはしない）
      col.rgb = mix(col.rgb, vec3(lum), uSlow * 0.25);
      // パリィ: 明暗を強く分けた白黒にする（ここは色調補正前の明るさなので、暗い側を広く取る）
      float m = smoothstep(0.015, 0.45, lum);
      m = mix(m, 1.0 - m, uInvert);
      vec2 d = vUv - 0.5;
      m *= 1.0 - dot(d, d) * 1.6 * uMono; // 四隅を落として中心へ目を寄せる
      col.rgb = mix(col.rgb, vec3(m), uMono);
      gl_FragColor = col;
    }
  `,
};

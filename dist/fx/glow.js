import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
const sources = new Set();
export function addGlow(mesh, color, own = false) {
    const s = { mesh, color: new THREE.Color(color), strength: 1, own };
    sources.add(s);
    return s;
}
export const removeGlow = (s) => sources.delete(s);
const SCALE = 4; // にじみを描く画面の縮小率
const SPREAD = 1.6; // ぼかしの 1 歩（縮小した画面の画素）
const PASSES = 2; // ぼかしを重ねる回数。回ごとに 1 歩を倍にして、芯の近くは濃く、外へ広く薄くにじませる
const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
// 9 点のガウスぼかし（片方向）
const blurMaterial = () => new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tMap, vUv) * 0.227027;
        c += (texture2D(tMap, vUv + uStep) + texture2D(tMap, vUv - uStep)) * 0.1945946;
        c += (texture2D(tMap, vUv + uStep * 2.0) + texture2D(tMap, vUv - uStep * 2.0)) * 0.1216216;
        c += (texture2D(tMap, vUv + uStep * 3.0) + texture2D(tMap, vUv - uStep * 3.0)) * 0.054054;
        c += (texture2D(tMap, vUv + uStep * 4.0) + texture2D(tMap, vUv - uStep * 4.0)) * 0.016216;
        gl_FragColor = c;
      }
    `,
    depthTest: false,
    depthWrite: false,
});
// 塗りは「色 × 濃さ」と「濃さ」で書いておくので、ぼかした後に割れば元の色に戻る
const compositeMaterial = () => new THREE.ShaderMaterial({
    uniforms: { tGlow: { value: null } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tGlow;
      varying vec2 vUv;
      void main() {
        vec4 g = texture2D(tGlow, vUv);
        if (g.a < 0.002) discard;
        gl_FragColor = vec4(g.rgb / g.a, clamp(g.a * 1.6, 0.0, 0.85));
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
});
export class GlowPass extends Pass {
    scene;
    camera;
    mask = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    blurA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    blurB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    maskMat = new THREE.MeshBasicMaterial({ blending: THREE.NoBlending, transparent: true, depthTest: false, depthWrite: false });
    blurMat = blurMaterial();
    compositeMat = compositeMaterial();
    quad = new FullScreenQuad();
    clearColor = new THREE.Color();
    constructor(scene, camera) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.needsSwap = false; // 今の画面の上に直接重ねる
    }
    // 見えているか。外された飾り（シーンにつながっていない）は登録から外す。別の画面（スキン選択）の物は描かない
    shown(s) {
        let o = s.mesh;
        while (o) {
            if (!o.visible)
                return false;
            if (o === this.scene)
                return true;
            o = o.parent;
        }
        if (!s.mesh.parent)
            sources.delete(s);
        return false;
    }
    render(renderer, _write, read) {
        const active = [...sources].filter((s) => s.strength > 0 && this.shown(s));
        if (!active.length)
            return;
        const autoClear = renderer.autoClear;
        const clearAlpha = renderer.getClearAlpha();
        renderer.getClearColor(this.clearColor);
        // 光る物だけを塗る
        renderer.setRenderTarget(this.mask);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.autoClear = false;
        for (const s of active) {
            if (s.own) {
                renderer.render(s.mesh, this.camera);
                continue;
            }
            const material = s.mesh.material;
            this.maskMat.color.copy(s.color).multiplyScalar(s.strength);
            this.maskMat.opacity = s.strength;
            s.mesh.material = this.maskMat;
            renderer.render(s.mesh, this.camera);
            s.mesh.material = material;
        }
        // ぼかす（横 → 縦を、1 歩を広げながら重ねる）
        this.quad.material = this.blurMat;
        const u = this.blurMat.uniforms;
        let src = this.mask.texture;
        for (let i = 0; i < PASSES; i++) {
            const step = SPREAD * 2 ** i;
            u.tMap.value = src;
            u.uStep.value.set(step / this.mask.width, 0);
            renderer.setRenderTarget(this.blurA);
            this.quad.render(renderer);
            u.tMap.value = this.blurA.texture;
            u.uStep.value.set(0, step / this.mask.height);
            renderer.setRenderTarget(this.blurB);
            this.quad.render(renderer);
            src = this.blurB.texture;
        }
        // 元の画面に重ねる
        this.quad.material = this.compositeMat;
        this.compositeMat.uniforms.tGlow.value = this.blurB.texture;
        renderer.setRenderTarget(this.renderToScreen ? null : read);
        this.quad.render(renderer);
        renderer.autoClear = autoClear;
        renderer.setClearColor(this.clearColor, clearAlpha);
    }
    setSize(width, height) {
        const w = Math.max(1, Math.round(width / SCALE));
        const h = Math.max(1, Math.round(height / SCALE));
        this.mask.setSize(w, h);
        this.blurA.setSize(w, h);
        this.blurB.setSize(w, h);
    }
    dispose() {
        this.mask.dispose();
        this.blurA.dispose();
        this.blurB.dispose();
        this.maskMat.dispose();
        this.blurMat.dispose();
        this.compositeMat.dispose();
        this.quad.dispose();
    }
}

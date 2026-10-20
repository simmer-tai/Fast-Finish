// ---- ステージの始まりのタイトル ----
// ステージが組み上がりきった瞬間に、画面いっぱいに「FAST / FINISH」を叩きつけて出す。
// 文字は画面に重ねて描くが、FAST と FINISH にそれぞれ奥行きを持たせ（FAST は手前、FINISH は奥）、
// それより手前にある柱や電車の側面のような「縦の面」だけを文字の前に出して、ステージの中に文字が立っているように見せる。
// 床や屋根の裏のような横の面は文字を隠さない（隠すと、床より下・屋根より上に来る文字がほとんど消えてしまう）。
// そのために、出している間だけステージを別にもう一度描き、ピクセルごとに一番手前の面までの距離と、その面が縦かどうかを記録する（マスク）
import * as THREE from 'three';
const FONT = '"Oswald", "Arial Narrow", sans-serif'; // Barlow は角が丸いので、角の立った字形のものを使う
const INK = '#333333';
const SKEW = Math.tan((24 * Math.PI) / 180); // タイトル画面の帯と同じ傾き
// 画面上の組み方（画面の高さを 1 とした大きさ）
const TEXT_H = 0.27; // 文字の板の高さ
const FAST_Y = 0.15; // 板の中心の高さ（画面の中心から）
const FINISH_Y = -0.13;
// 奥行き (m)。始めの位置から見て、FAST は手前の柱より奥・案内板より手前、FINISH は 2 本目の柱より奥
const FAST_DEPTH = 20;
const FINISH_DEPTH = 40;
// 時間 (s)
const SLAM_TIME = 0.14; // 大きめの位置から縮んで収まるまで
const FINISH_DELAY = 0.07; // FINISH は FAST より少し遅れて落ちる
const SLAM_SCALE = 1.7; // 出始めの大きさ
const HOLD_END = 1.05; // ここから払い始める
const WIPE_TIME = 0.28;
export const STAGE_TITLE_END = HOLD_END + WIPE_TIME + FINISH_DELAY;
// 大文字の高さが CAP_H px になる文字の大きさ。フォントで字の背の高さが違うので測って合わせる
const CAP_H = 280;
function fontFor(ctx) {
    ctx.font = `600 400px ${FONT}`;
    const cap = ctx.measureText('H').actualBoundingBoxAscent || 280;
    return `600 ${Math.round((400 * CAP_H) / cap)}px ${FONT}`;
}
const easeOutCubic = (k) => 1 - (1 - k) ** 3;
const easeInCubic = (k) => k * k * k;
// 文字を描いたキャンバス。幅は文字に合わせる
function drawFast() {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = fontFor(ctx);
    ctx.font = font;
    const w = Math.ceil(ctx.measureText('FAST').width);
    c.width = w + 24;
    c.height = 330;
    ctx.font = font;
    ctx.fillStyle = INK;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('FAST', 12, 306);
    return c;
}
// FINISH: タイトル画面と同じく、斜めに切った黒い帯に白抜き
function drawFinish() {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = fontFor(ctx);
    ctx.font = font;
    const textW = Math.ceil(ctx.measureText('FINISH').width);
    const h = 360;
    const off = h * SKEW;
    c.width = textW + off * 2 + 60;
    c.height = h;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(off, 0);
    ctx.lineTo(c.width, 0);
    ctx.lineTo(c.width - off, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('FINISH', (c.width - textW) / 2, 322);
    return c;
}
// マスクに書く値: 赤 = 一番手前の面までの距離 / MASK_FAR、緑 = その面が縦なら 1。何も無い所は (1, 0)
const MASK_FAR = 1000;
const maskMaterial = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
    #include <common>
    varying float vDepth;
    varying vec3 vNormalW;
    void main() {
      #include <begin_vertex>
      #include <project_vertex>
      vDepth = -mvPosition.z;
      mat3 m = mat3(modelMatrix);
      #ifdef USE_INSTANCING
        m = m * mat3(instanceMatrix);
      #endif
      vNormalW = m * normal;
    }
  `,
    fragmentShader: /* glsl */ `
    varying float vDepth;
    varying vec3 vNormalW;
    void main() {
      float vertical = abs(normalize(vNormalW).y) < 0.5 ? 1.0 : 0.0;
      gl_FragColor = vec4(vDepth / ${MASK_FAR.toFixed(1)}, vertical, 0.0, 1.0);
    }
  `,
    side: THREE.DoubleSide,
});
// 板のマテリアル。uWipe で、帯と同じ傾きの線より左を消していく（払い出し）。
// マスクを見て、自分の奥行きより手前に縦の面があるピクセルは描かない
function titleMaterial(tex, aspect, depth, mask, resolution) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: tex }, uOpacity: { value: 0 }, uWipe: { value: 0 }, uAspect: { value: aspect },
            uMask: { value: mask }, uResolution: { value: resolution }, uDepth: { value: depth / MASK_FAR },
        },
        vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
        fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uWipe;
      uniform float uAspect;
      uniform sampler2D uMask;
      uniform vec2 uResolution;
      uniform float uDepth;
      varying vec2 vUv;
      void main() {
        vec4 m = texture2D(uMask, gl_FragCoord.xy / uResolution);
        if (m.g > 0.5 && m.r < uDepth) discard;
        // 板の高さを 1 とした座標で、右上がりに傾いた線で切る
        float d = vUv.x * uAspect + vUv.y * ${SKEW.toFixed(3)};
        if (d < uWipe * (uAspect + ${SKEW.toFixed(3)})) discard;
        vec4 c = texture2D(uMap, vUv);
        gl_FragColor = vec4(c.rgb, c.a * uOpacity);
      }
    `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        fog: false,
    });
}
export function createStageTitle(camera, renderer) {
    const group = new THREE.Group();
    group.visible = false;
    camera.add(group);
    let parts = [];
    const resolution = new THREE.Vector2(1, 1);
    const maskTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const maskScene = new THREE.Scene();
    maskScene.overrideMaterial = maskMaterial;
    const prevClear = new THREE.Color();
    // キャンバスはフォントが読み込まれた後（出す瞬間）に描く
    function build() {
        if (parts.length > 0)
            return;
        const viewH = (depth) => 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const specs = [
            { canvas: drawFast(), depth: FAST_DEPTH, y: FAST_Y, delay: 0 },
            { canvas: drawFinish(), depth: FINISH_DEPTH, y: FINISH_Y, delay: FINISH_DELAY },
        ];
        // 2 枚の左端を揃え、まとまり全体を画面の中央に置く
        const widths = specs.map((s) => (TEXT_H * s.canvas.width) / s.canvas.height);
        const left = -Math.max(...widths) / 2;
        parts = specs.map((s, i) => {
            const tex = new THREE.CanvasTexture(s.canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            const aspect = s.canvas.width / s.canvas.height;
            const mat = titleMaterial(tex, aspect, s.depth, maskTarget.texture, resolution);
            const k = viewH(s.depth);
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TEXT_H * aspect * k, TEXT_H * k), mat);
            mesh.position.set((left + widths[i] / 2) * k, s.y * k, -s.depth);
            mesh.renderOrder = 10;
            mesh.frustumCulled = false;
            group.add(mesh);
            return { mesh, mat, depth: s.depth, y: s.y, delay: s.delay };
        });
    }
    return {
        // マスクを描く。roots はステージの箱を持つ親で、描く間だけマスク用の場面へ移し、home へ戻す。
        // 画面と同じカメラ（揺れも含む）で描くよう、本描画の直前に呼ぶ
        renderMask(roots, home) {
            if (!group.visible)
                return;
            renderer.getDrawingBufferSize(resolution);
            if (maskTarget.width !== resolution.x || maskTarget.height !== resolution.y)
                maskTarget.setSize(resolution.x, resolution.y);
            for (const r of roots)
                maskScene.add(r);
            const prevTarget = renderer.getRenderTarget();
            renderer.getClearColor(prevClear);
            const prevAlpha = renderer.getClearAlpha();
            renderer.setRenderTarget(maskTarget);
            renderer.setClearColor(0xff0000, 1);
            renderer.clear();
            renderer.render(maskScene, camera);
            renderer.setRenderTarget(prevTarget);
            renderer.setClearColor(prevClear, prevAlpha);
            for (const r of roots)
                home.add(r);
        },
        start() {
            build();
            group.visible = true;
        },
        // t は出してからの時間。払い終えたら隠して true を返す
        update(t) {
            for (const p of parts) {
                const s = t - p.delay;
                const k = THREE.MathUtils.clamp(s / SLAM_TIME, 0, 1);
                p.mesh.scale.setScalar(SLAM_SCALE + (1 - SLAM_SCALE) * easeOutCubic(k));
                p.mat.uniforms.uOpacity.value = s < 0 ? 0 : Math.min(1, s / (SLAM_TIME * 0.5));
                p.mat.uniforms.uWipe.value = easeInCubic(THREE.MathUtils.clamp((s - HOLD_END) / WIPE_TIME, 0, 1));
            }
            if (t < STAGE_TITLE_END)
                return false;
            group.visible = false;
            return true;
        },
    };
}

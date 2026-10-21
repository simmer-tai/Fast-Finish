import * as THREE from 'three';
// ---- 床のグリッドの広がり ----
// 床のグリッドは、波の中心から groundReveal (m) の円の中だけに描く。訓練場に入ると円が広がって床一面に出る。
// 円の縁の近くは線を濃くして、グリッドが走り抜けていくように見せる
export const GROUND_REVEAL_ALL = 1e6;
export const groundReveal = { value: GROUND_REVEAL_ALL };
// 波の中心（プレイヤーの始めの位置。xz）。ステージへ入るときに、そのステージの始めの位置へ移す
export const riseOrigin = { value: new THREE.Vector2(0, 5) };
export function withGroundReveal(mat) {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uReveal = groundReveal;
        shader.uniforms.uRiseOrigin = riseOrigin;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec2 vRevealPos;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvRevealPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uReveal;\nuniform vec2 uRiseOrigin;\nvarying vec2 vRevealPos;')
            .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float rd = distance(vRevealPos, uRiseOrigin);
          if (rd > uReveal) discard;
          float edge = 1.0 - smoothstep(0.0, 1.5 + uReveal * 0.04, uReveal - rd);
          diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + 4.0 * edge));
        }`);
    };
}

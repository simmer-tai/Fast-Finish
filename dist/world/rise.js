import * as THREE from 'three';
import { mulberry32 } from '../random.js';
import { riseOrigin } from './reveal.js';
// ---- ステージのせり上がり ----
// 訓練場に入ると、始めの位置から床のグリッドが円く広がり、グリッドが届いたところから箱が組み上がる。箱はそれぞれ
//   1. 足もとに底面の枠（グリッドの線だけ）が浮かぶ
//   2. 面の無い、グリッドの線だけの骨組みが伸び上がる
//   3. 骨組みの中を、下から面が埋めていく（埋まる境目には濃い線が走る）
// の順に出る。遠いほど間隔を詰めて（距離の平方根で遅らせて）、外側の大量の柱も間延びせずに組み上がりきるようにする
export const RISE_WAVE = 0.1; // 距離の平方根 1 あたりの遅れ (s)
export const RISE_BASE_TIME = 0.1; // 底面の枠が浮かんでから伸び始めるまで
export const RISE_BASE_HEIGHT = 0.04;
export const RISE_FILL_START = 0.45; // 骨組みがこの割合まで伸びたら、面を埋め始める
export const RISE_SLAM_HEIGHT = 8; // これより高い箱が組み上がると、画面を揺らして重い音を鳴らす
export const RISE_FILL_DONE = 1e4; // 埋めきった箱の「埋まった高さ」（どの面も下になる）
export const riseRand = mulberry32(777);
export const risers = [];
export const riseMeshes = new Set();
export let arenaRiseEnd = 0; // アリーナの中の箱がすべて組み上がる時刻（ここまでは操作を返さない）
export const riseDelayAt = (x, z) => RISE_WAVE * Math.sqrt(Math.hypot(x - riseOrigin.value.x, z - riseOrigin.value.y)) + riseRand() * 0.06;
export function addRiser(mesh, index, b, inArena, ramp) {
    const delay = riseDelayAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
    const dur = 0.28 + 0.035 * b.h; // 高いものほど長く伸びる
    const fillDur = 0.25 + 0.03 * b.h;
    // 遠景（アリーナの外）は組み上がっても揺らさない
    risers.push({ mesh, index, b, ramp, delay, dur, fillDur, slammed: !inArena });
    riseMeshes.add(mesh);
    // 伸びる途中で縮んだ大きさのまま視錐台の判定をされないよう、カリングは切る
    mesh.frustumCulled = false;
    // 箱ごとの「面が埋まった高さ」(m, ワールド)。最初は埋まりきった状態にしておく（確認用の起動ではせり上げない）
    if (!mesh.geometry.getAttribute('aFill')) {
        mesh.geometry.setAttribute('aFill', new THREE.InstancedBufferAttribute(new Float32Array(mesh.count).fill(RISE_FILL_DONE), 1));
        mesh.geometry.setAttribute('aPulse', new THREE.InstancedBufferAttribute(new Float32Array(mesh.count), 1));
    }
    if (inArena)
        arenaRiseEnd = Math.max(arenaRiseEnd, delay + RISE_BASE_TIME + dur * RISE_FILL_START + fillDur);
}
export const RISE_PULSE_TIME = 0.35; // 埋めきった箱の縁を太く濃くしてから、元の細さへ戻すまで
export const RISE_INK_DEPTH = 0.7; // 埋まる境目の下に、墨がにじむように薄く残す濃さの深さ (m)
// 箱のマテリアルに、組み上がりの途中の見た目を足す。埋まった高さ（aFill）より上は、
// 1m のグリッドと箱の縁の線だけを濃く残して、ほかは描かない。埋まる境目には濃い帯を引き、その下へ薄くにじませる。
// 埋めきった直後は aPulse (1→0) の間だけ縁の線を太く濃く引く。
// 霧の手前で色を混ぜるので、遠くの骨組みは霧に溶ける
export let riseBuildId = 0;
// 置いた箱の面の向き（ワールド）。箱ごとに軸の伸び方が違っても（坂の斜面のように）向きがずれないよう、
// 伸ばした軸の長さの 2 乗で割ってから回す（three.js が光の計算でしているのと同じ）
export const INSTANCE_NORMAL = `mat3(modelMatrix) * (mat3(instanceMatrix) * (objectNormal / max(vec3(
  dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz)), vec3(1e-8))))`;
export function withRiseBuild(mat) {
    const prev = mat.onBeforeCompile;
    // three.js はシェーダーの使い回しを onBeforeCompile の中身で見分けるので、包んだもの同士が
    // 同じ扱いにならないよう、マテリアルごとに別の名前を付ける
    const key = `rise-build-${riseBuildId++}`;
    mat.customProgramCacheKey = () => key;
    // 骨組みの裏側の線も透けて見えるように、両面を描く
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = (shader, r) => {
        prev.call(mat, shader, r);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aFill;\nattribute float aPulse;\nvarying float vFill;\nvarying float vPulse;\nvarying vec3 vBuildPos;\nvarying vec3 vBuildNormal;\nvarying vec2 vBuildUv;')
            .replace('#include <project_vertex>', `#include <project_vertex>
        vFill = aFill;
        vPulse = aPulse;
        vBuildPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vBuildNormal = ${INSTANCE_NORMAL};
        vBuildUv = uv;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vFill;\nvarying float vPulse;\nvarying vec3 vBuildPos;\nvarying vec3 vBuildNormal;\nvarying vec2 vBuildUv;')
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float buildMark = 0.0;
        vec2 ed = min(vBuildUv, 1.0 - vBuildUv) / fwidth(vBuildUv);
        if (vBuildPos.y > vFill) {
          vec3 an = abs(vBuildNormal);
          vec2 g = an.y > max(an.x, an.z) ? vBuildPos.xz : an.x > an.z ? vBuildPos.zy : vBuildPos.xy;
          vec2 gd = abs(fract(g - 0.5) - 0.5) / fwidth(g);
          // 縁の線は太めに、面のグリッドは 1 ピクセルで
          float line = 1.0 - min(min(min(gd.x, gd.y), min(ed.x, ed.y) * 0.4), 1.0);
          if (line < 0.5) discard;
          buildMark = 1.0;
        } else if (vBuildPos.y > vFill - 0.08) {
          buildMark = 1.0;
        } else {
          float ink = 1.0 - clamp((vFill - 0.08 - vBuildPos.y) / ${RISE_INK_DEPTH.toFixed(2)}, 0.0, 1.0);
          buildMark = 0.35 * ink * ink;
        }
        if (vPulse > 0.0) {
          // 縁の太さは 1 + 5 * 濃さ ピクセル
          float rim = 1.0 - clamp(min(ed.x, ed.y) / (1.0 + 5.0 * vPulse), 0.0, 1.0);
          buildMark = max(buildMark, rim * vPulse);
        }`)
            .replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.03), buildMark);\n#include <fog_fragment>');
    };
    return mat;
}
// 境界線は、辺の中央から両端へ引かれていく
export const riseLines = [];
// ステージへ入り直すときに、組み上がる時刻を数え直す
export function resetArenaRiseEnd() {
    arenaRiseEnd = 0;
}

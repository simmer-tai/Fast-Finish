import * as THREE from 'three';
import { INSTANCE_NORMAL, addRiser, withRiseBuild } from './rise.js';
// アリーナ内の箱の面に引くグリッドの目の大きさ (m)。太線は箱を置くグリッドに揃える
export const ARENA_GRID_MINOR = 0.5;
export const ARENA_GRID_MAJOR = 2;
// 当たり判定のある箱（ステージへ入るときに、そのステージの箱に入れ替える）
export const blocks = [];
// 箱の形（原点を最小の角に）と、置くときに使い回す行列と色
export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
boxGeo.translate(0.5, 0.5, 0.5);
export const boxMatrix = new THREE.Matrix4();
export const boxColor = new THREE.Color();
export const ramps = [];
// 坂の上面の高さ。(x, z) は坂の範囲に収めてから渡す
export function rampTop(r, x, z) {
    const t = r.up === '+x' ? (x - r.minX) / (r.maxX - r.minX)
        : r.up === '-x' ? (r.maxX - x) / (r.maxX - r.minX)
            : r.up === '+z' ? (z - r.minZ) / (r.maxZ - r.minZ)
                : (r.maxZ - z) / (r.maxZ - r.minZ);
    return r.y0 + (r.h - r.y0) * THREE.MathUtils.clamp(t, 0, 1);
}
// 坂を上る向き（水平の単位ベクトル）と勾配
export function rampUpDir(r) {
    const x = r.up === '+x' ? 1 : r.up === '-x' ? -1 : 0;
    const z = r.up === '+z' ? 1 : r.up === '-z' ? -1 : 0;
    const len = x !== 0 ? r.maxX - r.minX : r.maxZ - r.minZ;
    return { x, z, slope: (r.h - r.y0) / len };
}
// くさびの形: 底面は x・z とも -0.5..0.5、y は 0..1。-Z の端で高さ 0、+Z の端で高さ 1。
// 面ごとに頂点を分け、uv は面ごとに 0..1（縁の線を引くのに使う）
export const wedgeGeo = (() => {
    const pos = [];
    const nor = [];
    const uv = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const tri = (p, t, n) => {
        // 外から見て反時計回りになるよう並べ直す（両面描きのマテリアルは、裏向きの面の法線を裏返すため）
        a.fromArray(p[0]);
        b.fromArray(p[1]).sub(a);
        c.fromArray(p[2]).sub(a);
        const order = b.cross(c).dot(new THREE.Vector3(...n)) >= 0 ? [0, 1, 2] : [0, 2, 1];
        for (const i of order) {
            pos.push(...p[i]);
            nor.push(...n);
            uv.push(...t[i]);
        }
    };
    const quad = (p, n) => {
        const t = [[0, 0], [1, 0], [1, 1], [0, 1]];
        tri([p[0], p[1], p[2]], [t[0], t[1], t[2]], n);
        tri([p[0], p[2], p[3]], [t[0], t[2], t[3]], n);
    };
    const s = Math.SQRT1_2;
    quad([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], [0, -1, 0]); // 底面
    quad([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]], [0, s, -s]); // 斜面
    quad([[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]], [0, 0, 1]); // 高い端
    for (const x of [-0.5, 0.5])
        tri([[x, 0, -0.5], [x, 0, 0.5], [x, 1, 0.5]], [[0, 0], [1, 0], [1, 1]], [Math.sign(x), 0, 0]); // 横
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geo;
})();
export const RAMP_TURN = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };
export const rampScale = new THREE.Matrix4();
// 坂を置く行列。height は底面からの高さ（せり上がりの途中では縮める）
export function rampMatrix(r, height, out) {
    const alongX = r.up === '+x' || r.up === '-x';
    const across = alongX ? r.maxZ - r.minZ : r.maxX - r.minX;
    const along = alongX ? r.maxX - r.minX : r.maxZ - r.minZ;
    return out
        .makeRotationY(RAMP_TURN[r.up])
        .multiply(rampScale.makeScale(across, height, along))
        .setPosition((r.minX + r.maxX) / 2, r.y0, (r.minZ + r.maxZ) / 2);
}
// 面にワールド座標で線を引くマテリアル。body の中では、面に沿った 2 軸の座標 uv（側面なら uv.y が高さ）と
// 面の向き an（法線の絶対値）が使える
// 箱の縁に引く線: 太さ（ピクセル）、濃さ、薄め始める距離と消える距離 (m)
export const EDGE_PX = 1.2;
export const EDGE_DARK = 0.5;
export const EDGE_FADE_NEAR = 25;
export const EDGE_FADE_FAR = 90;
// origin を渡すと、その点を格子の起点にする（省けば世界の原点）。格子からずれた所に置く物の縁に線を乗せるのに使う
export const gridMaterial = (body, origin) => {
    const o = origin ? `vec3(${origin.x.toFixed(3)}, ${origin.y.toFixed(3)}, ${origin.z.toFixed(3)})` : 'vec3(0.0)';
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vGridPos;\nvarying vec3 vGridNormal;\nvarying vec2 vEdgeUv;')
            .replace('#include <project_vertex>', `#include <project_vertex>
        vGridPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz - ${o};
        vGridNormal = ${INSTANCE_NORMAL};
        vEdgeUv = uv;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
        varying vec3 vGridPos;
        varying vec3 vGridNormal;
        varying vec2 vEdgeUv;
        // cell ごとの線の濃さ。width はワールドでの太さ (m) なので、離れるほど細く見える。
        // 1 ピクセルより細くなったら太さを保つ代わりに薄くして、遠くで線が太って見えないようにする
        float gridAxis(float p, float cell, float width) {
          float px = fwidth(p);
          float d = abs(fract(p / cell - 0.5) - 0.5) * cell;
          float w = max(width, px);
          return clamp((w * 0.5 - d) / px + 0.5, 0.0, 1.0) * (width / w);
        }
        float gridLine(vec2 p, float cell, float width) {
          return max(gridAxis(p.x, cell, width), gridAxis(p.y, cell, width));
        }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs(vGridNormal);
          vec2 uv = an.y > max(an.x, an.z) ? vGridPos.xz : an.x > an.z ? vGridPos.zy : vGridPos.xy;
          ${body}
          // 縁の線: 箱の面の縁に、画面上で一定の太さの暗い線を引いて形を締める。
          // 遠くでは小さな箱が線で黒く潰れないよう、距離で薄くする
          vec2 edgeD = min(vEdgeUv, 1.0 - vEdgeUv) / max(fwidth(vEdgeUv), vec2(1e-6));
          float edge = 1.0 - clamp(min(edgeD.x, edgeD.y) - ${EDGE_PX.toFixed(2)}, 0.0, 1.0);
          edge *= 1.0 - smoothstep(${EDGE_FADE_NEAR.toFixed(1)}, ${EDGE_FADE_FAR.toFixed(1)}, length(vViewPosition));
          diffuseColor.rgb *= 1.0 - edge * ${EDGE_DARK.toFixed(2)};
        }`);
    };
    return mat;
};
// 地形: 細線と太線のグリッド。箱は太線のグリッドに合わせて置いてあるので、縁には太線が乗る
export const TERRAIN_GRID = `
  float minor = gridLine(uv, ${ARENA_GRID_MINOR.toFixed(2)}, 0.015);
  float major = gridLine(uv, ${ARENA_GRID_MAJOR.toFixed(2)}, 0.05);
  diffuseColor.rgb *= 1.0 - max(minor * 0.2, major * 0.45);
`;
// 人工物: 地面と同じ見た目。白い面に、1m ごとの薄い線と 5m ごとの濃い線（どちらも 1 ピクセル幅）を重ねる
export const STRUCT_GRID = `
  vec2 q2 = uv;
  vec2 g2 = abs(fract(q2 - 0.5) - 0.5) / fwidth(q2);
  vec2 q10 = uv / 5.0;
  vec2 g10 = abs(fract(q10 - 0.5) - 0.5) / fwidth(q10);
  float l2 = 1.0 - min(min(g2.x, g2.y), 1.0);
  float l10 = 1.0 - min(min(g10.x, g10.y), 1.0);
  diffuseColor.rgb *= (1.0 - l2 * 0.1) * (1.0 - l10 * 0.18);
`;
// 箱をまとめて 1 つのメッシュにして parent に置き、せり上がりに加える。箱ごとの黒さを持たせるので、形はメッシュごとに分ける
export function addBoxes(list, mat, lightness, parent, inArena = true) {
    const mesh = new THREE.InstancedMesh(boxGeo.clone(), withRiseBuild(mat), list.length);
    list.forEach((b, i) => {
        const y0 = b.y0 ?? 0;
        mesh.setMatrixAt(i, boxMatrix.makeScale(b.maxX - b.minX, b.h - y0, b.maxZ - b.minZ).setPosition(b.minX, y0, b.minZ));
        mesh.setColorAt(i, boxColor.setHSL(0, 0, lightness(b)));
        addRiser(mesh, i, b, inArena);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
// 坂をまとめて 1 つのメッシュにして parent に置き、せり上がりに加える
export function addRamps(list, mat, parent) {
    const mesh = new THREE.InstancedMesh(wedgeGeo.clone(), withRiseBuild(mat), list.length);
    list.forEach((r, i) => {
        mesh.setMatrixAt(i, rampMatrix(r, r.h - r.y0, boxMatrix));
        mesh.setColorAt(i, boxColor.setHSL(0, 0, r.light));
        addRiser(mesh, i, r, true, r);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

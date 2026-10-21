import * as THREE from 'three';
import { mulberry32 } from '../random.js';
import { PLAYER_RADIUS } from '../player/config.js';
import { STRUCT_GRID, TERRAIN_GRID, addBoxes, blocks, gridMaterial, type Block } from './blocks.js';
import { addRiser, riseLines, withRiseBuild } from './rise.js';

// ---- アリーナ（訓練場） ----
// 88m 四方の闘技場。壁では囲わず、境界線だけで範囲を示す（線の外へは出られない）。
// 地形（明るい灰色・細線と太線のグリッド）は box(...)、人工物（地面と同じ白と同じグリッド）は struct(...) で置く。
// 箱はすべて 2m のグリッドに合わせる
export const ARENA_HALF = 44; // 境界線までの半幅
export const BORDER_HEIGHT = 12; // 境界のグリッドの壁の高さ
export const BORDER_GRID = 1; // グリッドの目の大きさ (m)
export const BORDER_FADE_NEAR = 1.5; // プレイヤー（胸の高さ）からこの距離まではグリッドがはっきり見える
export const BORDER_FADE_FAR = 7; // この距離で見えなくなる
export const borderUniforms = { uPlayer: { value: new THREE.Vector3(0, 1e4, 0) } };
// 境界の壁: 普段は見えず、近づくとプレイヤーの周りだけグリッドが浮かび上がる
export const borderMat = new THREE.ShaderMaterial({
  uniforms: { uPlayer: borderUniforms.uPlayer, uColor: { value: new THREE.Color(0x333333) } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uPlayer;
    uniform vec3 uColor;
    varying vec3 vWorld;
    void main() {
      // 壁はどれも X か Z が一定なので、横方向の座標は x + z で取れる
      vec2 uv = vec2(vWorld.x + vWorld.z, vWorld.y) / ${BORDER_GRID.toFixed(1)};
      vec2 g = abs(fract(uv - 0.5) - 0.5) / fwidth(uv);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      float d = distance(vWorld, uPlayer);
      float near = 1.0 - smoothstep(${BORDER_FADE_NEAR.toFixed(1)}, ${BORDER_FADE_FAR.toFixed(1)}, d);
      float a = line * near * 0.75 + near * near * 0.06; // 線に加えて、ごく薄く面も見せる
      if (a < 0.004) discard;
      gl_FragColor = vec4(uColor, a);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});
// 地面に引く暗い帯（境界線など）
export const groundLineMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
// 訓練場のものはすべてここに置く（ステージへ入るときは丸ごと外す）
export const arenaRoot = new THREE.Group();
{
  const box = (x0: number, z0: number, x1: number, z1: number, h: number) =>
    blocks.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h });
  const A = ARENA_HALF;

  // 地形はここに box(...) で置く

  // 地形: 高いものほど暗くして、高さを見分けやすくする
  const shade: Record<number, number> = { 1: 0.66, 2: 0.58, 3: 0.5, 4: 0.42, 6: 0.32 };
  addBoxes(blocks, gridMaterial(TERRAIN_GRID), (b) => shade[b.h] ?? 0.4, arenaRoot);

  // ---- 人工物 ----
  const structs: Block[] = [];
  const struct = (x0: number, z0: number, x1: number, z1: number, h: number) =>
    structs.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h });

  // 中央を囲む 4 本の大きな柱（5m 角・高さ 10m）。太線のグリッド（5m）のマスにぴったり収める。どの面でも壁走りできる
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      struct(sx * 15, sz * 15, sx * 20, sz * 20, 10);
      // 柱の、隣の柱の方を向いた 2 面に接する 5m 角の台（高さ 2m。地面からよじ登れる）
      struct(sx * 10, sz * 15, sx * 15, sz * 20, 2);
      struct(sx * 15, sz * 10, sx * 20, sz * 15, 2);
    }
  }

  addBoxes(structs, gridMaterial(STRUCT_GRID), () => 0.85, arenaRoot);
  blocks.push(...structs);

  // 境界線: 地面に引いた暗い帯
  const LINE = 0.4;
  for (const [x, z, w, d] of [
    [0, -(A - LINE / 2), 2 * A, LINE],
    [0, A - LINE / 2, 2 * A, LINE],
    [-(A - LINE / 2), 0, LINE, 2 * A],
    [A - LINE / 2, 0, LINE, 2 * A],
  ]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.03, z);
    arenaRoot.add(line);
    riseLines.push(line);
  }

  for (const [x, z, ry] of [
    [0, -A, 0],
    [0, A, 0],
    [-A, 0, Math.PI / 2],
    [A, 0, Math.PI / 2],
  ]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(2 * A, BORDER_HEIGHT), borderMat);
    wall.position.set(x, BORDER_HEIGHT / 2, z);
    wall.rotation.y = ry;
    arenaRoot.add(wall);
  }

  // アリーナの外: 以前の広場と同じ配置の柱を並べる（境界線にかかるものは除く）
  {
    const CELL = 2;
    const BLOCK_COUNT = 1000;
    const AREA_CELLS = 125; // 中心から ±125 マス = ±250m
    const KEEP_OUT = A + 2; // 境界線からこれだけ離す
    const rand = mulberry32(12345);
    const used = new Set<string>();
    const outer: { b: Block; light: number }[] = [];
    let n = 0;
    while (n < BLOCK_COUNT) {
      const ix = Math.floor((rand() * 2 - 1) * AREA_CELLS);
      const iz = Math.floor((rand() * 2 - 1) * AREA_CELLS);
      const key = `${ix},${iz}`;
      if (used.has(key)) continue;
      const minX = ix * CELL;
      const minZ = iz * CELL;
      const cx = minX + CELL / 2;
      const cz = minZ + CELL / 2;
      if (Math.hypot(cx, cz - 5) < 8 || Math.hypot(cx, cz + 10) < 4) continue;
      used.add(key);
      const low = rand() < 0.3;
      const h = (low ? 1 : 2 + Math.floor(rand() * 2)) * CELL;
      const light = low ? 0.55 + rand() * 0.1 : 0.25 + rand() * 0.25;
      n++;
      if (minX + CELL > -KEEP_OUT && minX < KEEP_OUT && minZ + CELL > -KEEP_OUT && minZ < KEEP_OUT) continue;
      outer.push({ b: { minX, maxX: minX + CELL, minZ, maxZ: minZ + CELL, h }, light });
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0.5, 0.5, 0.5); // 原点を最小の角に
    const mesh = new THREE.InstancedMesh(geo, withRiseBuild(new THREE.MeshLambertMaterial({ color: 0xffffff })), outer.length);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    outer.forEach(({ b, light }, i) => {
      blocks.push(b);
      mesh.setMatrixAt(i, m.makeScale(CELL, b.h, CELL).setPosition(b.minX, 0, b.minZ));
      mesh.setColorAt(i, color.setHSL(0, 0, light));
      addRiser(mesh, i, b, false);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    arenaRoot.add(mesh);
  }
}

export const ARENA_LIMIT = ARENA_HALF - PLAYER_RADIUS; // 境界線の外へ出ないための見えない柵
// プレイヤーが動ける範囲（見えない柵）。ステージへ入るときに、そのステージの範囲に差し替える
export const playBounds = { minX: -ARENA_LIMIT, maxX: ARENA_LIMIT, minZ: -ARENA_LIMIT, maxZ: ARENA_LIMIT };

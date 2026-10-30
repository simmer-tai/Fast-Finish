import * as THREE from 'three';
import { boxGeo, gridMaterial } from '../world/blocks.js';

// ---- 床が波打つ ----
// 重い物が床を叩くと、そこから輪になって広がる波に合わせて、床のグリッドのマス（1m 角）が持ち上がって沈む。
// 見た目だけ（当たりはない）。マスは床の下まで伸ばした箱で、持ち上がっている間だけ描く
const CELL = 1; // 床のグリッドの目と同じ
const MAX_TILES = 2400;
const MIN_LIFT = 0.01; // これより低いマスは描かない
const WAVE_WIDTH = 2.4; // 波の山の幅 (m)
const TILE_DEPTH = 0.5; // 床の下へ伸ばす分（持ち上がったときに側面が床から生えて見える）

interface Wave {
  x: number;
  z: number;
  t: number;
  speed: number; // 広がる速さ (m/s)
  amp: number; // 中心での山の高さ (m)
  range: number; // ここまで広がると消える
}
const waves: Wave[] = [];
// 1 マスだけ突き上がる（隆起ライン）。素早く持ち上がって、ゆっくり沈む
interface Spike {
  ix: number;
  iz: number;
  t: number;
  amp: number; // 持ち上がる高さ (m)
  life: number; // 沈みきるまで
}
const spikes: Spike[] = [];
const SPIKE_RISE = 0.12; // life のうち、持ち上がるのにかける割合
const lift = new Map<number, number>(); // マスの番号 → 持ち上がる高さ
const KEY_HALF = 50000; // マスの番号: (ix + KEY_HALF) * KEY_SPAN + (iz + KEY_HALF)
const KEY_SPAN = 2 * KEY_HALF;

const mesh = new THREE.InstancedMesh(boxGeo, gridMaterial(''), MAX_TILES);
mesh.count = 0;
mesh.frustumCulled = false;
mesh.castShadow = mesh.receiveShadow = true;
{
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX_TILES; i++) mesh.setColorAt(i, white);
}

// parent（ステージ）に床のマスを置く。ステージへ入るたびに呼ぶ
export function attachQuake(parent: THREE.Object3D) {
  waves.length = 0;
  spikes.length = 0;
  mesh.count = 0;
  parent.add(mesh);
}

// (x, z) から波を広げる
export function spawnQuake(x: number, z: number, amp: number, range: number, speed: number) {
  waves.push({ x, z, t: 0, speed, amp, range });
}

// (x, z) のマスを突き上げる
export function spawnSpike(x: number, z: number, amp: number, life: number) {
  spikes.push({ ix: Math.floor(x / CELL), iz: Math.floor(z / CELL), t: 0, amp, life });
}

// マスごとの揺らぎ（同じマスは毎回同じ）: 隣どうしで高さがそろわず、マスの区切りが見える
const jitter = (ix: number, iz: number) => {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return 0.7 + 0.6 * (s - Math.floor(s));
};

const m = new THREE.Matrix4();
export function updateQuake(dt: number) {
  if (!mesh.parent) return;
  lift.clear();
  for (let w = waves.length - 1; w >= 0; w--) {
    const wave = waves[w];
    wave.t += dt;
    const r = wave.t * wave.speed; // 波の先頭
    if (r - WAVE_WIDTH > wave.range) {
      waves.splice(w, 1);
      continue;
    }
    // 波の山にかかるマスだけを調べる
    const outer = Math.min(r, wave.range);
    const inner = Math.max(0, r - WAVE_WIDTH);
    const x0 = Math.floor((wave.x - outer) / CELL);
    const x1 = Math.floor((wave.x + outer) / CELL);
    const z0 = Math.floor((wave.z - outer) / CELL);
    const z1 = Math.floor((wave.z + outer) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const d = Math.hypot((ix + 0.5) * CELL - wave.x, (iz + 0.5) * CELL - wave.z);
        if (d > outer || d < inner) continue;
        // 山の形: 先頭で跳ね上がって、後ろへゆっくり沈む。遠くほど低い
        const u = (r - d) / WAVE_WIDTH;
        const crest = Math.sin(Math.PI * Math.pow(u, 0.6));
        const fall = 1 - d / wave.range;
        const h = wave.amp * crest * fall * fall * jitter(ix, iz);
        if (h < MIN_LIFT) continue;
        const key = (ix + KEY_HALF) * KEY_SPAN + iz + KEY_HALF;
        lift.set(key, (lift.get(key) ?? 0) + h);
      }
    }
  }
  for (let i = spikes.length - 1; i >= 0; i--) {
    const sp = spikes[i];
    sp.t += dt;
    const u = sp.t / sp.life;
    if (u >= 1) {
      spikes.splice(i, 1);
      continue;
    }
    const k = u < SPIKE_RISE ? u / SPIKE_RISE : 1 - ((u - SPIKE_RISE) / (1 - SPIKE_RISE)) ** 2;
    const h = sp.amp * k * jitter(sp.ix, sp.iz);
    const key = (sp.ix + KEY_HALF) * KEY_SPAN + sp.iz + KEY_HALF;
    lift.set(key, Math.max(lift.get(key) ?? 0, h));
  }
  // 持ち上がったマスを描く（高さは粗く刻んで、なめらかな面ではなく段の並びに見せる）
  let n = 0;
  for (const [key, raw] of lift) {
    if (n >= MAX_TILES) break;
    const iz = (key % KEY_SPAN) - KEY_HALF;
    const ix = Math.floor(key / KEY_SPAN) - KEY_HALF;
    const h = Math.max(MIN_LIFT, Math.round(raw / 0.04) * 0.04);
    m.makeScale(CELL, h + TILE_DEPTH, CELL).setPosition((ix + 0.5) * CELL, (h - TILE_DEPTH) / 2, (iz + 0.5) * CELL);
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
}

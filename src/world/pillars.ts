import * as THREE from 'three';
import { isMultiplayerGuest } from '../multiplayer/connectionTest.js';
import { TERRAIN_GRID, blocks, boxGeo, boxMatrix, boxMatrixFor, gridMaterial, type Block } from './blocks.js';
import { position } from '../player/state.js';
import { PLAYER_RADIUS } from '../player/config.js';
import { hooks } from '../game/hooks.js';
import * as sfx from '../audio.js';
import { UP } from '../math.js';
import { spawnSparks } from '../fx/hitFx.js';
import { spawnQuake } from '../fx/quake.js';
import { spawnChunks } from '../fx/chunks.js';
import { spawnCrack } from '../fx/floorMarks.js';

// ---- 投げ込まれた残骸 ----
// ボスが外のビルからもぎ取って広場へ投げ込む物（柱・H 形鋼・床の板・瓦礫の塊）。刺さった角度のまま床に突き立ち、隠れる場所になる。
// ボスの突進の激突・レーザー・隆起ライン・体当たりで削られて崩れ、根元の瓦礫だけが残る。
// 形は、根元を原点に +Y へ len だけ伸びる箱（横幅 w が X、厚み d が Z）に収める。当たり判定は、その箱を長さの向きに
// SEGMENTS 段に切り、段ごとに囲む箱を積んで表す
export interface ThrownKind {
  w: number;
  d: number;
  len: number;
  hp: number;
  maxTilt: number; // 突き立ったときにこれより傾くなら、この傾きまで起こす (rad)
  make: () => THREE.Group; // 見た目（根元を原点に、+Y へ len）
}
export interface PillarDef {
  x: number; // 根元の真ん中（床の上）
  z: number;
  kind: ThrownKind;
  up: THREE.Vector3; // 上の端の向き（傾き）
  model?: THREE.Object3D; // 見た目（kind.make で作ったもの。省けば作る）
}
export const PILLAR_SINK = 0.6; // 床にめり込ませる深さ
const SEGMENTS = 4;
const RUBBLE_H = 0.9; // 崩れたあとに残る根元の高さ
const RUBBLE_LIGHT = 0.5;
const CHIP_EVERY = 12; // これだけ削るごとに、欠片をこぼす
const SHAKE_FAR = 30; // これより遠ければ、崩れても画面を揺らさない

// ---- 形 ----
// 部品をためて、1 つのメッシュにまとめる。部品は底の真ん中を (x, y, z) に置き、X 軸まわりに tilt、Z 軸まわりに roll だけ傾ける。
// 部品ごとに面の格子を引く（傾いても、格子は面に付いてくる）
const PART_GEO = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
const CONCRETE = 0.5;
const SLAB = 0.62;
const STEEL = 0.2;
const REBAR = 0.18;
let partMat: THREE.Material | null = null;
interface Part { x: number; y: number; z: number; sx: number; sy: number; sz: number; light: number; tilt: number; roll: number }
class Parts {
  list: Part[] = [];
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, light: number, tilt = 0, roll = 0) {
    this.list.push({ x, y, z, sx, sy, sz, light, tilt, roll });
  }
  build() {
    partMat ??= gridMaterial(TERRAIN_GRID, undefined, 'part');
    const mesh = new THREE.InstancedMesh(PART_GEO, partMat, this.list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const off = new THREE.Matrix4().makeTranslation(-0.5, 0, -0.5);
    const c = new THREE.Color();
    this.list.forEach((pt, i) => {
      q.setFromEuler(e.set(pt.tilt, 0, pt.roll));
      mesh.setMatrixAt(i, m.compose(pos.set(pt.x, pt.y, pt.z), q, sc.set(pt.sx, pt.sy, pt.sz)).multiply(off));
      mesh.setColorAt(i, c.setScalar(pt.light));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }
}
const rnd = (a: number, b: number) => a + (b - a) * Math.random();
const sign = () => (Math.random() < 0.5 ? -1 : 1);
// 折れ口から突き出す鉄筋（少し曲がっている。4 本に 1 本は折れて残っていない）
function rebars(p: Parts, spots: [number, number][], y: number, len: number) {
  for (const [x, z] of spots) {
    if (Math.random() < 0.25) continue;
    p.box(x, y - 0.2, z, 0.08, rnd(0.3, 1) * len + 0.2, 0.08, REBAR, rnd(-0.3, 0.3), rnd(-0.3, 0.3));
  }
}

// 鉄筋コンクリートの柱: 継ぎ目の帯を巻き、根元に台座。上の端は段々に折れて、鉄筋が突き出す
function makePillar(w: number, len: number) {
  const p = new Parts();
  const core = w * 0.86;
  const body = len * rnd(0.78, 0.84);
  p.box(0, 0, 0, w, 0.5, w, CONCRETE * 0.9);
  p.box(0, 0, 0, core, body, core, CONCRETE);
  for (const y of [len * 0.3, len * 0.62]) p.box(0, y, 0, w * 0.94, 0.22, w * 0.94, CONCRETE * 0.85);
  const sx = sign();
  const sz = sign();
  p.box(sx * core * 0.18, body, sz * core * 0.12, core * 0.64, len * 0.1, core * 0.7, CONCRETE);
  p.box(sx * core * 0.28, body + len * 0.1, sz * core * 0.25, core * 0.4, len * rnd(0.05, 0.11), core * 0.4, CONCRETE);
  p.box(-sx * core * 0.3, body, -sz * core * 0.3, core * 0.3, len * 0.04, core * 0.36, CONCRETE);
  const r = core * 0.36;
  rebars(p, [[-r, -r], [r, -r], [-r, r], [r, r]], body, len * 0.25);
  return p.build();
}
// H 形鋼: 両側のフランジと真ん中のウェブ。上の端は引きちぎれて、フランジの片方がめくれ上がる。根元には継ぎ手の板
function makeBeam(w: number, d: number, len: number) {
  const p = new Parts();
  const t = 0.08;
  const torn = len * rnd(0.85, 0.95);
  p.box(0, 0, -d / 2 + t / 2, w, len, t, STEEL); // フランジ（手前）
  p.box(0, 0, d / 2 - t / 2, w, torn, t, STEEL); // フランジ（奥。ちぎれて短い）
  p.box(0, 0, 0, t, torn - 0.3, d - 2 * t, STEEL * 1.1); // ウェブ
  p.box(0, torn, d / 2 - t / 2, w * 0.7, len * 0.12, t, STEEL, rnd(0.4, 0.8)); // めくれ上がったフランジの切れ端
  p.box(0, 0, 0, w + 0.1, 0.3, d + 0.1, STEEL * 1.3); // 継ぎ手の板
  for (const y of [len * 0.35, len * 0.65]) p.box(0, y, 0, w * 0.9, 0.08, d - 2 * t, STEEL * 1.2); // 補強の板
  return p.build();
}
// 床の板: 厚い板の縁が割れて欠け、割れた縁から鉄筋が突き出す。片面に梁の名残が付いている
function makeSlab(w: number, d: number, len: number) {
  const p = new Parts();
  const body = len * rnd(0.72, 0.82);
  p.box(0, 0, 0, w, body, d, SLAB);
  // 割れた上の縁: 長さの違う欠片が並ぶ
  let x = -w / 2;
  while (x < w / 2 - 0.2) {
    const pw = Math.min(rnd(0.6, 1.4), w / 2 - x);
    if (Math.random() < 0.75) p.box(x + pw / 2, body, 0, pw, len * rnd(0.05, 0.25), d, SLAB);
    x += pw;
  }
  p.box(rnd(-w / 4, w / 4), 0, d / 2 + 0.2, 0.5, len * 0.9, 0.4, SLAB * 0.85); // 梁の名残
  rebars(p, [[-w * 0.35, 0], [-w * 0.1, 0], [w * 0.15, 0], [w * 0.38, 0]], body, len * 0.3);
  return p.build();
}
// 瓦礫の塊: 大きさの違うコンクリートの塊を寄せ集める。鉄筋が何本か飛び出す
function makeRubble(w: number, len: number) {
  const p = new Parts();
  p.box(0, 0, 0, w * 0.8, len * 0.55, w * 0.75, CONCRETE);
  for (let k = 0; k < 6; k++) {
    const s = rnd(0.35, 0.6) * w;
    p.box(rnd(-0.35, 0.35) * w, rnd(0, 0.55) * len, rnd(-0.35, 0.35) * w, s, s * rnd(0.6, 1), s * rnd(0.7, 1.1), CONCRETE * rnd(0.85, 1.15), rnd(-0.4, 0.4), rnd(-0.4, 0.4));
  }
  rebars(p, [[0.2, 0.1], [-0.3, -0.2], [0.1, -0.3]], len * 0.5, len * 0.5);
  return p.build();
}
const DEG = Math.PI / 180;
export const THROWN = {
  pillar: { w: 2, d: 2, len: 6, hp: 100, maxTilt: 40 * DEG, make: () => makePillar(2, 6) },
  beam: { w: 0.7, d: 0.6, len: 9, hp: 140, maxTilt: 40 * DEG, make: () => makeBeam(0.7, 0.6, 9) },
  slab: { w: 4.5, d: 0.5, len: 4, hp: 80, maxTilt: 30 * DEG, make: () => makeSlab(4.5, 0.5, 4) },
  rubble: { w: 2.6, d: 2.6, len: 2.6, hp: 120, maxTilt: 15 * DEG, make: () => makeRubble(2.6, 2.6) },
} satisfies Record<string, ThrownKind>;
// 投げる物を選ぶ（並べた数が多いほど出やすい）
const THROWN_POOL: ThrownKind[] = [THROWN.pillar, THROWN.pillar, THROWN.beam, THROWN.slab, THROWN.slab, THROWN.rubble];
export const pickThrown = () => THROWN_POOL[Math.floor(Math.random() * THROWN_POOL.length)];

// ---- 置く・崩す ----
interface Pillar { blocks: Block[]; mesh: THREE.Object3D; x: number; z: number; foot: number; hp: number; broken: boolean; chip: number; top: THREE.Vector3; kind: ThrownKind; up: THREE.Vector3 }
const pillars: Pillar[] = [];
let parentObj: THREE.Object3D | null = null;
let stubMat: THREE.Material | null = null;
const color = new THREE.Color();
const base = new THREE.Vector3();
const at = new THREE.Vector3();
const corner = new THREE.Vector3();

// parent（ステージ）に置けるようにする。ステージへ入るたびに呼ぶ（blocks は呼ぶ側で空にしてある）
export function attachPillars(parent: THREE.Object3D) {
  for (const p of pillars) p.mesh.removeFromParent();
  pillars.length = 0;
  parentObj = parent;
}

// 突き立てて、当たり判定の箱を blocks に足す。プレイヤーが根元に重なっていれば、いちばん浅い向きへ押し出す
export function addPillar(def: PillarDef) {
  if (!parentObj) return;
  const k = def.kind;
  const up = def.up.clone().normalize();
  const cosT = Math.max(up.y, 0.3);
  // 根元を床の下へめり込ませる
  base.set(def.x, 0, def.z).addScaledVector(up, -PILLAR_SINK / cosT);
  const mesh = def.model ?? k.make();
  mesh.position.copy(base);
  mesh.quaternion.setFromUnitVectors(UP, up);
  parentObj.add(mesh);
  mesh.updateMatrix();
  // 当たり: 長さの向きに段に切り、段ごとに 8 つの角を囲む箱
  const segs: Block[] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const cy of [s / SEGMENTS, (s + 1) / SEGMENTS]) {
      for (const cx of [-0.5, 0.5]) {
        for (const cz of [-0.5, 0.5]) {
          corner.set(cx * k.w, cy * k.len, cz * k.d).applyMatrix4(mesh.matrix);
          minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
          minZ = Math.min(minZ, corner.z); maxZ = Math.max(maxZ, corner.z);
        }
      }
    }
    if (maxY <= 0.05) continue; // 床の下に埋まった段
    const b: Block = { minX, maxX, minZ, maxZ, h: maxY };
    if (minY > 0.05) b.y0 = minY;
    segs.push(b);
    blocks.push(b);
  }
  const top = new THREE.Vector3(0, k.len, 0).applyMatrix4(mesh.matrix);
  pillars.push({ blocks: segs, mesh, x: def.x, z: def.z, foot: Math.min(Math.max(k.w, k.d), 2), hp: k.hp, broken: false, chip: 0, top, kind: k, up });
  const b = segs[0];
  if (b && position.y < b.h) {
    const r = PLAYER_RADIUS;
    const px = [position.x - (b.minX - r), b.maxX + r - position.x];
    const pz = [position.z - (b.minZ - r), b.maxZ + r - position.z];
    const mm = Math.min(...px, ...pz);
    if (mm > 0) {
      if (mm === px[0]) position.x = b.minX - r;
      else if (mm === px[1]) position.x = b.maxX + r;
      else if (mm === pz[0]) position.z = b.minZ - r;
      else position.z = b.maxZ + r;
    }
  }
}

// 瓦礫の細部は各端末に任せ、遮蔽物の形と壊れた状態だけ共有する。
export type PillarSnapshot = { kind: keyof typeof THROWN; x: number; z: number; up: [number, number, number]; hp: number; broken: boolean };
export function capturePillars(): PillarSnapshot[] {
  return pillars.map((p) => ({ kind: (Object.keys(THROWN) as (keyof typeof THROWN)[]).find((key) => THROWN[key] === p.kind) ?? 'pillar',
    x: p.x, z: p.z, up: [p.up.x, p.up.y, p.up.z], hp: p.broken ? 0 : p.hp, broken: p.broken }));
}
export function isPillarSnapshots(value: unknown): value is PillarSnapshot[] {
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000;
  return Array.isArray(value) && value.length <= 512 && value.every((p) => p && typeof p === 'object' && typeof p.kind === 'string'
    && Object.hasOwn(THROWN, p.kind) && num(p.x) && num(p.z) && num(p.hp) && typeof p.broken === 'boolean'
    && Array.isArray(p.up) && p.up.length === 3 && p.up.every(num) && Math.hypot(...p.up) > 0.1);
}
export function applyPillarSnapshots(snapshots: PillarSnapshot[]) {
  if (!parentObj) return;
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    if (!pillars[i]) addPillar({ x: s.x, z: s.z, kind: THROWN[s.kind], up: new THREE.Vector3(...s.up) });
    const p = pillars[i]; if (!p) continue;
    if (s.broken && !p.broken) breakPillar(p);
    p.hp = s.hp;
  }
}

// 立っている（崩れていない）数
export const pillarCount = () => pillars.reduce((n, p) => n + Number(!p.broken), 0);

// その箱を持つ、崩れていないもの
const pillarOf = (b: Block | null) => (b ? pillars.find((p) => !p.broken && p.blocks.includes(b)) : undefined);
export const isPillar = (b: Block | null) => !!pillarOf(b);

// 削る。hitAt は当たった所（欠片をこぼす所）。崩れたら true
export function damagePillar(b: Block | null, amount: number, hitAt?: THREE.Vector3) {
  if (isMultiplayerGuest()) return false;
  const p = pillarOf(b);
  if (!p) return false;
  p.hp -= amount;
  p.chip += amount;
  if (p.chip >= CHIP_EVERY && hitAt) {
    p.chip = 0;
    spawnChunks(hitAt, { count: 3, size: [0.08, 0.2], speed: [2, 5], up: 2, light: [0.4, 0.6], life: 4 });
  }
  if (p.hp > 0) return false;
  breakPillar(p);
  return true;
}

// 崩れる: 根元の瓦礫だけを残して、芯に沿って大きな欠片を落とす
function breakPillar(p: Pillar) {
  p.broken = true;
  for (const b of p.blocks) {
    const i = blocks.indexOf(b);
    if (i >= 0) blocks.splice(i, 1);
  }
  p.mesh.removeFromParent();
  stubMat ??= gridMaterial(TERRAIN_GRID);
  const half = p.foot / 2;
  const rubble: Block = { minX: p.x - half, maxX: p.x + half, minZ: p.z - half, maxZ: p.z + half, h: RUBBLE_H };
  blocks.push(rubble);
  const mesh = new THREE.InstancedMesh(boxGeo, stubMat, 1);
  mesh.setMatrixAt(0, boxMatrixFor(rubble, RUBBLE_H, boxMatrix));
  mesh.setColorAt(0, color.setScalar(RUBBLE_LIGHT));
  mesh.castShadow = mesh.receiveShadow = true;
  parentObj?.add(mesh);
  p.mesh = mesh;
  const steps = Math.max(1, Math.round(p.top.distanceTo(base.set(p.x, 0, p.z))));
  for (let k = 1; k <= steps; k++) {
    at.set(p.x, 0, p.z).lerp(p.top, k / steps);
    spawnChunks(at, { count: 3, size: [0.35, 0.9], speed: [1, 4], up: 1, spread: half + 0.3, light: [0.42, 0.58] });
  }
  at.set(p.x, RUBBLE_H, p.z);
  spawnChunks(at, { count: 10, size: [0.1, 0.3], speed: [3, 7], up: 3, spread: half, light: [0.4, 0.6] });
  spawnSparks(at, UP, 14, 1, 1.2);
  spawnQuake(p.x, p.z, 0.4, 8, 10);
  spawnCrack(p.x, p.z, p.foot * 2 + 2);
  const d = Math.hypot(position.x - p.x, position.z - p.z);
  const near = 1 - Math.min(d / SHAKE_FAR, 1);
  hooks.addTrauma(0.1 + 0.5 * near * near);
  sfx.playBossImpact(1.2 + near);
  sfx.playStrikerLand(15, 0.6 + near);
}

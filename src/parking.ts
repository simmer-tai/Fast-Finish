// ---- ステージ: PARKING（立体駐車場） ----
// 地上と 3 つの階、屋上の 5 段の自走式の立体駐車場。外周は手すり壁で囲み、両側の壁ぎわと真ん中に車を並べる。
// 階と階は、真ん中に 2 本並べた坂（シザース式）でつなぐ。坂は 1 段ごとに左右と上る向きを入れ替え、上りきった所で U ターンして次の坂へ入る。
// 坂の真上の床は抜いてあり、坂から隣の穴へ飛び降りると 1 つ下の坂へ近道できる。奥の吹き抜けには箱を積んだシンボルツリーがあり、
// 枝（樹冠の段）を足場にして 3 階まで登れる。屋上は天井が無く、奥の角に階段室の塔が立つ。
// 外は道路で、両側と奥はとなりのビルの壁、手前は道路の向かいのビル。
// 走る速さに合わせて、実際の駐車場より 1.5 倍ほど大きく作る。当たり判定のある箱はすべて 0.5m のグリッドに合わせる（車だけは除く）
import type { StageLayout, StageBox, StageRamp } from './stage.js';

const HALF_W = 24; // 外周の手すり壁の外面 (|x|)
const NEAR = 12; // 手前の外面 (z)。地上は入口と出口が開いている
const FAR = -84; // 奥の外面 (z)
const STORY = 4.5; // 1 階分の高さ
const SLAB = 0.5; // 床の厚さ。床の裏から次の床の上面まで 4m
const FLOORS = [0, 4.5, 9, 13.5, 18]; // 各階の床の上面（地上・1〜3 階・屋上）
const PARAPET_H = 1.5;
const PARAPET_T = 0.5;

// 真ん中の帯 (|x| < CENTER)。手前に車、坂、U ターンの場所、吹き抜け、奥に車の順に並ぶ
const CENTER = 7;
const RAMP_NEAR = -26; // 坂の範囲 (z)
const RAMP_FAR = -44;
const ATRIUM_NEAR = -58; // 吹き抜けの範囲 (z)。|x| < CENTER
const ATRIUM_FAR = -70;
// 壁ぎわの駐車ます: |x| が 16.5〜23 に車の長さ 6.5m。ますの幅（z）は 4m
const STALL_IN = 16.5;
const STALL_OUT = 23;
const STALL_W = 4;
const AISLE_X = 11.25; // 通路の真ん中 (|x|)
// 柱: z は 8m おき。外周（壁の中）と、壁ぎわの車の内側、真ん中の線に立てる
const COLUMN_Z = Array.from({ length: 12 }, (_, k) => 8 - 8 * k);
const CENTER_COLUMN_Z = [8, 0, -8, -16, -56, -72, -80];
// 階段室の塔: 奥の左の角。屋上より 1 階分高い
const CORE = { minX: -23.5, maxX: -15.5, minZ: -83.5, maxZ: -75.5 };
const CORE_H = FLOORS[4] + STORY;

// 明るさ（0 が黒）。高いもの・重いものほど暗くする
const LIGHT_SLAB = 0.66;
const LIGHT_RAMP = 0.58;
const LIGHT_PARAPET = 0.76;
const LIGHT_COLUMN = 0.86;
const LIGHT_CORE = 0.5;
const LIGHT_DARK = 0.2;
const LIGHT_PAINT = 0.3; // 床の白線の代わりの暗い線
const LIGHT_LAMP = 0.97;
const LIGHT_RAIL = 0.3;
const LIGHT_TREE_TRUNK = 0.3;
const LIGHT_TREE = 0.44;
const LIGHT_PLANTER = 0.55;
const LIGHT_BOOTH = 0.86;
const LIGHT_FENCE = 0.4;
const CAR_LIGHTS = [0.16, 0.28, 0.55, 0.72, 0.9];

export function buildParking(): StageLayout {
  const boxes: StageBox[] = [];
  const decor: StageBox[] = [];
  const colliders: StageLayout['colliders'] = [];
  const scenery: StageBox[] = [];
  const ramps: StageRamp[] = [];
  const rect = (x0: number, x1: number, z0: number, z1: number) => ({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
  const box = (x0: number, x1: number, z0: number, z1: number, y0: number, h: number, light: number, look: StageBox['look'] = 'struct') =>
    boxes.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look });
  const deco = (x0: number, x1: number, z0: number, z1: number, y0: number, h: number, light: number, look: StageBox['look'] = 'struct') =>
    decor.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look });
  let seed = 4721;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // 坂 k（k 階から k+1 階へ）の置き場所: 偶数は右（+x）で奥へ上り、奇数は左（-x）で手前へ上る
  const rampSide = (k: number) => (k % 2 === 0 ? 1 : -1);
  // [z0, z1) の範囲から、抜く範囲を除いた区間
  const cut = (z0: number, z1: number, holes: [number, number][]) => {
    const out: [number, number][] = [];
    let from = z0;
    for (const [h0, h1] of [...holes].sort((a, b) => b[0] - a[0])) {
      if (h0 < from) out.push([from, h0]);
      from = Math.min(from, h1);
    }
    if (from > z1) out.push([from, z1]);
    return out;
  };
  // z の区間を、手前から順に組み上がるよう 12m ずつに分ける
  const chunks = (z0: number, z1: number, step = 12) => {
    const out: [number, number][] = [];
    for (let z = z0; z > z1; z -= step) out.push([z, Math.max(z - step, z1)]);
    return out;
  };

  // ---- 床 ----
  // 外側の帯（車と通路）は一面に張り、真ん中の帯は坂の上の穴と吹き抜けを抜く
  for (let level = 1; level < FLOORS.length; level++) {
    const top = FLOORS[level];
    for (const [x0, x1] of [[-HALF_W, -CENTER], [CENTER, HALF_W]]) {
      for (const [z0, z1] of chunks(NEAR, FAR)) box(x0, x1, z0, z1, top - SLAB, top, LIGHT_SLAB, 'terrain');
    }
    for (const s of [-1, 1]) {
      const holes: [number, number][] = [[ATRIUM_NEAR, ATRIUM_FAR]];
      if (rampSide(level - 1) === s) holes.push([RAMP_NEAR, RAMP_FAR]);
      for (const [z0, z1] of cut(NEAR, FAR, holes)) {
        for (const [c0, c1] of chunks(z0, z1)) box(0, s * CENTER, c0, c1, top - SLAB, top, LIGHT_SLAB, 'terrain');
      }
    }
  }

  // ---- 坂 ----
  for (let k = 0; k < FLOORS.length - 1; k++) {
    const s = rampSide(k);
    ramps.push({
      ...rect(0, s * CENTER, RAMP_NEAR, RAMP_FAR),
      y0: FLOORS[k], h: FLOORS[k + 1], up: s > 0 ? '-z' : '+z', light: LIGHT_RAMP, look: 'terrain',
    });
    // 坂の上の床の縁の線（上りきった所）
    const zTop = s > 0 ? RAMP_FAR : RAMP_NEAR;
    deco(0, s * CENTER, zTop - 0.15, zTop + 0.15, FLOORS[k + 1], FLOORS[k + 1] + 0.03, LIGHT_PAINT);
  }

  // ---- 手すり壁 ----
  // 地上の手前は、入口（右）と出口（左）を開ける
  for (let level = 0; level < FLOORS.length; level++) {
    const y = FLOORS[level];
    for (const s of [-1, 1]) {
      for (const [z0, z1] of chunks(NEAR, FAR)) box(s * (HALF_W - PARAPET_T), s * HALF_W, z0, z1, y, y + PARAPET_H, LIGHT_PARAPET);
    }
    const front: [number, number][] = level === 0 ? [[-HALF_W, -16], [-CENTER, CENTER], [16, HALF_W]] : [[-HALF_W, HALF_W]];
    for (const [x0, x1] of front) box(x0, x1, NEAR - PARAPET_T, NEAR, y, y + PARAPET_H, LIGHT_PARAPET);
    box(-HALF_W, HALF_W, FAR, FAR + PARAPET_T, y, y + PARAPET_H, LIGHT_PARAPET);
  }

  // ---- 柱 ----
  for (let level = 0; level < FLOORS.length - 1; level++) {
    const y0 = FLOORS[level];
    const y1 = FLOORS[level + 1] - SLAB;
    for (const z of COLUMN_Z) {
      for (const s of [-1, 1]) {
        box(s * (HALF_W - 1), s * HALF_W, z + 0.5, z - 0.5, y0, y1, LIGHT_COLUMN);
        box(s * (STALL_IN - 1), s * STALL_IN, z + 0.5, z - 0.5, y0, y1, LIGHT_COLUMN);
      }
    }
    for (const z of CENTER_COLUMN_Z) box(-0.5, 0.5, z + 0.5, z - 0.5, y0, y1, LIGHT_COLUMN);
    // 天井の照明: 通路の真上、柱の間ごとに 1 本（見た目だけ）
    for (const s of [-1, 1]) {
      for (const z of COLUMN_Z) deco(s * AISLE_X - 0.25, s * AISLE_X + 0.25, z - 3, z - 5, y1 - 0.15, y1, LIGHT_LAMP);
    }
  }

  // ---- 階段室の塔 ----
  box(CORE.minX, CORE.maxX, CORE.minZ, CORE.maxZ, 0, CORE_H, LIGHT_CORE);
  // 各階の扉（通路側の面）と、屋上より上の窓の帯
  for (const y of FLOORS) deco(-20.5, -18.5, CORE.maxZ, CORE.maxZ + 0.03, y, y + 2.5, LIGHT_DARK);
  deco(CORE.minX + 0.5, CORE.maxX - 0.5, CORE.maxZ, CORE.maxZ + 0.03, FLOORS[4] + 3, FLOORS[4] + 3.5, LIGHT_DARK);

  // ---- 車 ----
  // fill は階ごとの、ますが埋まっている割合（上の階ほど空いている）
  const fill = [0.65, 0.6, 0.5, 0.4, 0.3];
  const stallLine = (x0: number, x1: number, z: number, y: number) => deco(x0, x1, z - 0.1, z + 0.1, y, y + 0.03, LIGHT_PAINT);
  for (let level = 0; level < FLOORS.length; level++) {
    const y = FLOORS[level];
    // 壁ぎわ: 鼻先を壁へ向けて止める
    for (const s of [-1, 1]) {
      for (let k = 0; k < 22; k++) {
        const top = 8 - STALL_W * k;
        const inCore = s < 0 && top - STALL_W < CORE.maxZ;
        if (!inCore) {
          stallLine(s * STALL_IN, s * (HALF_W - PARAPET_T), top, y);
          if (rand() < fill[level]) car(decor, colliders, s * (STALL_IN + STALL_OUT) / 2, top - STALL_W / 2, y, s, rand);
        }
      }
      stallLine(s * STALL_IN, s * (HALF_W - PARAPET_T), 8 - STALL_W * 22, y);
    }
    // 真ん中: 背中合わせに、鼻先を通路へ向けて止める
    for (const s of [-1, 1]) {
      for (const top of [8, 4, 0, -4, -8, -72, -76]) {
        stallLine(s * 0.5, s * CENTER, top, y);
        if (rand() < fill[level]) car(decor, colliders, s * 3.75, top - STALL_W / 2, y, s, rand);
      }
      for (const z of [-12, -80]) stallLine(s * 0.5, s * CENTER, z, y);
    }
  }

  // ---- 穴の縁の手すり ----
  // 床の縁に沿った横棒と 2m おきの支柱。落ちて近道できるよう、当たり判定は持たせない
  const railX = (x0: number, x1: number, z: number, y: number) => {
    deco(x0, x1, z - 0.05, z + 0.05, y + 1, y + 1.1, LIGHT_RAIL);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1e-6; x += 2) deco(x - 0.05, x + 0.05, z - 0.05, z + 0.05, y, y + 1, LIGHT_RAIL);
  };
  const railZ = (x: number, z0: number, z1: number, y: number) => {
    deco(x - 0.05, x + 0.05, z0, z1, y + 1, y + 1.1, LIGHT_RAIL);
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 1e-6; z += 2) deco(x - 0.05, x + 0.05, z - 0.05, z + 0.05, y, y + 1, LIGHT_RAIL);
  };
  for (let level = 1; level < FLOORS.length; level++) {
    const y = FLOORS[level];
    // 吹き抜け: 四方
    railX(-CENTER, CENTER, ATRIUM_NEAR - 0.1, y);
    railX(-CENTER, CENTER, ATRIUM_FAR + 0.1, y);
    for (const s of [-1, 1]) railZ(s * (CENTER - 0.1), ATRIUM_NEAR, ATRIUM_FAR, y);
    // 坂の上の穴: 通路側と、坂が上ってくるのと反対の端（坂が上ってくる端と、隣の坂の側は開けておく）
    const s = rampSide(level - 1);
    railZ(s * (CENTER - 0.1), RAMP_NEAR, RAMP_FAR, y);
    railX(0, s * CENTER, s > 0 ? RAMP_NEAR - 0.1 : RAMP_FAR + 0.1, y);
  }

  // ---- 吹き抜けの木 ----
  // 植え込みに、箱を積んだ木を立てる。樹冠は 2 段で、1 階 → 下の段 → 2 階 → 上の段 → 3 階と飛び移って登れる
  box(-4, 4, -60, -68, 0, 1, LIGHT_PLANTER, 'terrain');
  box(-0.5, 0.5, -63.5, -64.5, 1, 7, LIGHT_TREE_TRUNK);
  box(-3.5, 3.5, -60.5, -67.5, 5, 7, LIGHT_TREE, 'terrain');
  box(-2, 2, -62, -66, 7, 11, LIGHT_TREE, 'terrain');
  box(-1, 1, -63, -65, 11, 12, LIGHT_TREE, 'terrain');

  // ---- 地上 ----
  // 入口と出口のゲート: 発券機と、横に渡したバー（バーは見た目だけ）
  for (const s of [-1, 1]) {
    const inner = s * CENTER;
    box(inner, inner + s * 1, NEAR - 0.5, NEAR - 1.5, 0, 1.5, LIGHT_BOOTH);
    deco(inner + s * 0.25, inner + s * 0.75, NEAR - 1.5, NEAR - 1.8, 0.8, 1.2, LIGHT_DARK);
    deco(inner + s * 1, s * 15.5, NEAR - 1.05, NEAR - 0.95, 1, 1.12, LIGHT_LAMP);
    // 入口・出口の車線の誘導線
    decor.push({ ...rect(inner + s * 0.5, inner + s * 0.8, NEAR, NEAR - 8), h: 0.03, light: LIGHT_PAINT, look: 'struct' });
  }
  // 管理室: 左の坂の下（1 階の床の下）にある小屋。通路側に窓を並べる
  box(-6, -1, -31, -40, 0, 3, LIGHT_BOOTH);
  for (let z = -32; z > -39; z -= 2.5) deco(-6.03, -6, z, z - 1.8, 1, 2.2, LIGHT_DARK);
  deco(-6.03, -6, -38.5, -39.5, 0, 2.2, LIGHT_DARK); // 扉

  // ---- 屋上 ----
  // 照明の柱: 壁ぎわの車の内側の線に立てる（上に乗れる）
  for (const s of [-1, 1]) {
    for (const z of [0, -16, -32, -48, -64]) {
      box(s * 16 - 0.25, s * 16 + 0.25, z + 0.25, z - 0.25, FLOORS[4], FLOORS[4] + 6, LIGHT_COLUMN);
      deco(s * 16 - 0.4, s * 16 + 0.4, z + 1, z - 1, FLOORS[4] + 6, FLOORS[4] + 6.3, LIGHT_DARK);
    }
  }

  // ---- 外: 道路ととなりのビル ----
  const BOUND_X = HALF_W + 8;
  const BOUND_NEAR = NEAR + 18;
  const BOUND_FAR = FAR - 8;
  // 敷地の境の塀（両側と奥）。登れる高さ
  for (const s of [-1, 1]) for (const [z0, z1] of chunks(BOUND_NEAR, BOUND_FAR)) box(s * BOUND_X, s * (BOUND_X + 0.5), z0, z1, 0, 3, LIGHT_FENCE);
  for (const [x0, x1] of [[-BOUND_X, -12], [-12, 12], [12, BOUND_X]]) box(x0, x1, BOUND_FAR, BOUND_FAR - 0.5, 0, 3, LIGHT_FENCE);
  // 道路の中央線（破線）
  for (let x = -BOUND_X; x < BOUND_X; x += 6) deco(x, x + 3, NEAR + 9.85, NEAR + 10.15, 0, 0.03, LIGHT_PAINT);
  // となりのビル（遠景）: 塀の向こうの両側と奥、道路の向かい
  const building = (x0: number, x1: number, z0: number, z1: number, h: number) =>
    scenery.push({ ...rect(x0, x1, z0, z1), h, light: 0.35 + rand() * 0.3, look: 'struct' });
  for (const s of [-1, 1]) {
    for (let z = BOUND_NEAR + 10; z > BOUND_FAR - 30; ) {
      const len = 14 + Math.floor(rand() * 4) * 4;
      building(s * (BOUND_X + 4), s * (BOUND_X + 20 + Math.floor(rand() * 3) * 6), z, z - len + 2, 14 + Math.floor(rand() * 7) * 4);
      z -= len;
    }
  }
  for (let x = -60; x < 60; ) {
    const w = 12 + Math.floor(rand() * 4) * 4;
    building(x, x + w - 2, BOUND_FAR - 4, BOUND_FAR - 24, 20 + Math.floor(rand() * 6) * 5);
    building(x, x + w - 2, BOUND_NEAR + 6, BOUND_NEAR + 24, 12 + Math.floor(rand() * 6) * 4);
    x += w;
  }

  // 敵の出る所: 通路（車と柱を避けた |x| = 11.5 の線）と、真ん中の U ターンの場所、手前の道路。
  // 敵は今の床と同じ高さの所しか歩かないので、上の階の敵はその階に留まる
  const at = (level: number, list: number[][]) => list.map(([x, z]) => ({ x, y: FLOORS[level], z }));
  return {
    boxes,
    decor,
    colliders,
    scenery,
    ramps,
    lines: [],
    bounds: { minX: -BOUND_X, maxX: BOUND_X, minZ: BOUND_FAR, maxZ: BOUND_NEAR },
    // 道路の上、入口の正面から駐車場を向いて始める
    start: { x: 11.5, y: 0, z: NEAR + 10 },
    enemySpawns: [
      ...at(0, [[11.5, 4], [-11.5, -20], [11.5, -36], [-11.5, -52], [11.5, -68], [3.5, -19], [-3.5, -50], [-20, NEAR + 10]]),
      ...at(1, [[-11.5, 0], [11.5, -24], [-11.5, -64], [3.5, -51]]),
      ...at(2, [[11.5, -8], [-11.5, -40], [11.5, -76], [-3.5, -19]]),
      ...at(3, [[-11.5, -12], [11.5, -52], [-11.5, -76]]),
      ...at(4, [[11.5, 0], [-11.5, -24], [11.5, -44], [3.5, -19], [-3.5, -50]]),
    ],
    // 道路の右手前の上から、手すり壁の重なる正面と、奥の階段室の塔を見る
    view: { eye: { x: 30, y: 12, z: 28 }, target: { x: 0, y: 8, z: -36 } },
  };
}

// ---- 車 ----
// 長さ 6.5m・幅 3m・高さ 2m（床の裏まで 2m 空くので、屋根に乗れる）。x 方向に置き、dir が鼻先の向き（+x なら 1）。
// (cx, cz) は車体の中心、y は床の高さ。当たり判定は車体とキャビンの 2 つの箱
function car(decor: StageBox[], colliders: StageLayout['colliders'], cx: number, cz: number, y: number, dir: number, rand: () => number) {
  // u: 前（鼻先の向き）、v: 横（+z）
  const area = (u0: number, u1: number, v0: number, v1: number) => {
    const xa = cx + dir * u0;
    const xb = cx + dir * u1;
    return { minX: Math.min(xa, xb), maxX: Math.max(xa, xb), minZ: cz + Math.min(v0, v1), maxZ: cz + Math.max(v0, v1) };
  };
  const part = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, light: number) =>
    decor.push({ ...area(u0, u1, v0, v1), y0: y + y0 || undefined, h: y + y1, light, look: 'struct' });
  const body = CAR_LIGHTS[Math.floor(rand() * CAR_LIGHTS.length)];
  const dark = 0.12;
  // 車体と床下の影、車輪
  part(-3.25, 3.25, -1.5, 1.5, 0.4, 1.25, body);
  part(-2.75, 2.75, -1.1, 1.1, 0.1, 0.4, dark);
  for (const u of [1.75, -2.75]) for (const [v0, v1] of [[1.05, 1.55], [-1.55, -1.05]]) part(u, u + 1, v0, v1, 0, 0.8, dark);
  // キャビン: 少し後ろ寄り。窓の帯を一回り大きく巻き、前後のガラスを貼る
  part(-1.75, 1.25, -1.25, 1.25, 1.25, 2, body);
  part(-1.6, 1.1, -1.28, 1.28, 1.4, 1.85, LIGHT_DARK);
  part(1.25, 1.28, -1.1, 1.1, 1.35, 1.9, LIGHT_DARK);
  part(-1.78, -1.75, -1.1, 1.1, 1.4, 1.9, LIGHT_DARK);
  // 前照灯と尾灯
  for (const [v0, v1] of [[0.6, 1.3], [-1.3, -0.6]]) {
    part(3.25, 3.28, v0, v1, 0.85, 1.05, LIGHT_LAMP);
    part(-3.28, -3.25, v0, v1, 0.85, 1.05, dark);
  }
  colliders.push({ ...area(-3.25, 3.25, -1.5, 1.5), h: y + 1.25, y0: y || undefined });
  colliders.push({ ...area(-1.75, 1.25, -1.25, 1.25), h: y + 2, y0: y + 1.25 });
}

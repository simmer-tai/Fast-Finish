// ---- ステージ: PARKING（地下駐車場） ----
// 1 層だけの広い地下駐車場。真ん中で十字に交わる広い通路（主通路と横通路）があり、プレイヤーはこの交差点から始める。
// 主通路の左右には、背中合わせの車の列と通路が交互に 2 組ずつ並び、外周の壁ぎわにも車を 1 列並べる。前後の壁ぎわは車の無い通路。
// 柱は車の列の真ん中の線（車と車の隙間）に立てる。天井は平らなスラブで、通路の真上に蛍光灯を並べる。
// 天井は一面ふさがっていて、日の光は入らない。手前の壁の真ん中にエレベーターホール、対角の 2 つの角に階段室がある。
// 走る速さに合わせて、実際の駐車場より 1.5 倍ほど大きく作る。当たり判定のある箱はすべて 0.5m のグリッドに合わせる（車だけは除く）
import type { StageLayout, StageBox, StageMover, StageMoverPart, StageMoverStep } from './stage.js';

const HALF_W = 58; // 左右の壁の内面 (|x|)
const HALF_D = 50; // 前後の壁の内面 (|z|)
const WALL_T = 1;
const CEIL_Y0 = 5; // 天井の下面。ワンボックスの屋根（2.7m）に立っても頭が当たらない高さ
const CEIL_Y1 = 6; // 天井の上面（地上の地面）

// x の帯（右半分。左は鏡写し）: 主通路の半分 | 背中合わせの車の列 | 通路 | 車の列 | 通路 | 壁ぎわの車
const MAIN = 5; // 主通路の半幅
const ROWS: [number, number][] = [[5, 19], [28, 42]]; // 背中合わせの車の列 (|x|)。真ん中の線に柱が立つ
const AISLES = [23.5, 46.5]; // 列の間の通路の真ん中 (|x|)
const WALL_ROW = 51; // 壁ぎわの車の列の内側の端 (|x|)
// z の帯（奥側。手前は鏡写し）: 横通路の半分 | 駐車ます 9 台分 | 前後の壁ぎわの通路
const CROSS = 5; // 横通路の半幅
const STALL_W = 4; // 駐車ますの幅（z）
const STALLS = 9;
const ROW_END = CROSS + STALL_W * STALLS; // 41
const COLUMN_Z = [5, 17, 29, 41]; // 柱の z (|z|)。3 ますおき
// 天井を張る区切り。帯の境目で切る（組み上がりで少しずつせり上がるよう、小分けにする）
const CEIL_X = [-59, -51, -42, -28, -19, -5, 5, 19, 28, 42, 51, 59];
const CEIL_Z = [-51, -41, -29, -17, -5, 5, 17, 29, 41, 51];
// 走る車: 四隅のブロックに 1 台ずつ。内側の列（通路側の端 |x| = 19、輪止め |x| = 12）の 5 ます目に止まっていて、
// ときどき出てそのブロックを一周して戻る
const DRIVER_ROW = 19;
const DRIVER_STALL = 4;
const DRIVER_Z = CROSS + STALL_W * (DRIVER_STALL + 0.5); // 23 (|z|)
const DRIVER_LANE = 2; // 横通路では、奥と手前の車がすれ違えるよう、横通路の真ん中からこれだけ自分の側へ寄って走る
const DRIVERS: [number, number, number][] = [[-1, -1, 8], [1, 1, 13], [1, -1, 19], [-1, 1, 25]]; // 左右・前後の向きと、初めに止まっている時間
const CAR_SPEED = 9; // 通路を走る速さ (m/s)
const CAR_SLOW = 3; // ますへの出し入れの速さ (m/s)
// 階段室: 対角の 2 つの角
const CORE_X = 51;
const CORE_Z = 42;

// 明るさ（0 が黒）。高いもの・重いものほど暗くする
const LIGHT_CEIL = 0.5;
const LIGHT_WALL = 0.74;
const LIGHT_COLUMN = 0.86;
const LIGHT_CORE = 0.56;
const LIGHT_DARK = 0.2;
const LIGHT_PAINT = 0.3; // 床の白線の代わりの暗い線
const LIGHT_LAMP = 0.97;
const LIGHT_PIPE = 0.4;
const CAR_LIGHTS = [0.16, 0.28, 0.55, 0.72, 0.9];

export function buildParking(): StageLayout {
  const boxes: StageBox[] = [];
  const decor: StageBox[] = [];
  const colliders: StageLayout['colliders'] = [];
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

  // ---- 天井 ----
  // 区切りのマスごとに一面に張る
  for (let i = 0; i < CEIL_X.length - 1; i++) {
    for (let j = 0; j < CEIL_Z.length - 1; j++) {
      const [x0, x1, z0, z1] = [CEIL_X[i], CEIL_X[i + 1], CEIL_Z[j], CEIL_Z[j + 1]];
      box(x0, x1, z0, z1, CEIL_Y0, CEIL_Y1, LIGHT_CEIL);
    }
  }

  // ---- 壁 ----
  // 外周を囲む
  for (const s of [-1, 1]) {
    for (let z = HALF_D + WALL_T; z > -HALF_D - WALL_T; z -= 12) {
      box(s * HALF_W, s * (HALF_W + WALL_T), z, Math.max(z - 12, -HALF_D - WALL_T), 0, CEIL_Y0, LIGHT_WALL);
    }
  }
  for (const sz of [-1, 1]) {
    for (let x = -HALF_W; x < HALF_W; x += 14.5) box(x, x + 14.5, sz * HALF_D, sz * (HALF_D + WALL_T), 0, CEIL_Y0, LIGHT_WALL);
  }
  // 壁の付け柱: 左右の壁は柱の z に、前後の壁は柱の x に
  for (const s of [-1, 1]) {
    for (const z of COLUMN_Z) for (const sz of [-1, 1]) box(s * (HALF_W - 1), s * HALF_W, sz * z - 0.5, sz * z + 0.5, 0, CEIL_Y0, LIGHT_COLUMN);
    for (const x of [12, 35]) for (const sz of [-1, 1]) box(s * x - 0.5, s * x + 0.5, sz * (HALF_D - 0.5), sz * HALF_D, 0, CEIL_Y0, LIGHT_COLUMN);
  }
  // 前後の壁ぎわの通路の上に、壁に沿って配管を通す（見た目だけ）
  for (const sz of [-1, 1]) {
    for (const y of [CEIL_Y0 - 0.6, CEIL_Y0 - 0.3]) deco(-HALF_W, HALF_W, sz * (HALF_D - 0.4), sz * (HALF_D - 0.1), y, y + 0.2, LIGHT_PIPE);
  }

  // ---- 柱 ----
  // 背中合わせの車の列の真ん中の線に立てる。車と車の隙間（1m）に収まる。足もとには暗い帯を巻く
  for (const sx of [-1, 1]) {
    for (const x of [12, 35]) {
      for (const z of COLUMN_Z) {
        for (const sz of [-1, 1]) {
          box(sx * x - 0.5, sx * x + 0.5, sz * z - 0.5, sz * z + 0.5, 0, CEIL_Y0, LIGHT_COLUMN);
          deco(sx * x - 0.53, sx * x + 0.53, sz * z - 0.53, sz * z + 0.53, 0, 0.8, LIGHT_DARK);
        }
      }
    }
  }

  // ---- 車 ----
  // 列ごとに、駐車ますの線と輪止めを引く。x0 が通路の側、x1 が奥（輪止めの側）。
  // 埋まり具合は列の片側（9 ます）ごとに変えて、混んだ所と空いた所を作る。向き（頭から入れたか、バックで入れたか）と車種はますごとに選ぶ。
  // 車は奥（輪止め）へ寄せ、ますの中で少しずらす
  const row = (x0: number, x1: number) => {
    const back = Math.sign(x1 - x0);
    for (const sz of [-1, 1]) {
      for (let k = 0; k <= STALLS; k++) {
        const z = sz * (CROSS + STALL_W * k);
        deco(x0, x1, z - 0.1, z + 0.1, 0, 0.03, LIGHT_PAINT);
      }
      const fill = 0.1 + rand() * 0.6;
      for (let k = 0; k < STALLS; k++) {
        const cz = sz * (CROSS + STALL_W * (k + 0.5));
        for (const v of [-1, 1]) deco(x1 - back * 1.1, x1 - back * 1.4, cz + v * 0.6, cz + v * 1.4, 0, 0.15, LIGHT_PAINT);
        if (rand() >= fill) continue;
        const type = pickCar(rand);
        const cx = x1 - back * Math.min(type.len / 2 + 0.25 + rand() * 0.3, Math.abs(x1 - x0) / 2);
        const slack = (STALL_W - 1) / 2 - type.wid / 2; // ますの境の柱（幅 1m）に当たらない範囲
        // 走る車のますは空けておく（乱数の並びは変えない）
        const free = Math.abs(x0) === DRIVER_ROW && k === DRIVER_STALL;
        car(free ? [] : decor, free ? [] : colliders, type, cx, cz + (rand() * 2 - 1) * slack, rand() < 0.5 ? back : -back, 'x', rand);
      }
    }
  };
  for (const s of [-1, 1]) {
    for (const [a, b] of ROWS) {
      const mid = (a + b) / 2;
      row(s * a, s * mid);
      row(s * b, s * mid);
    }
    row(s * WALL_ROW, s * HALF_W);
  }
  // 通路に止まっている車: 敵の出る所を避ける。少し片側へ寄せる
  for (const [x, z, axis, dir] of [
    [1.5, -29, 'z', 1], [-1.5, 17, 'z', -1],
  ] as const) {
    car(decor, colliders, pickCar(rand), x, z, dir, axis, rand);
  }

  // ---- 通路の線と照明 ----
  // 主通路と横通路は真ん中に破線を引く。照明は通路の真上に、天井に貼りつけた蛍光灯を並べる（見た目だけ）
  for (const s of [-1, 1]) {
    for (let c = 8; c < ROW_END; c += 6) deco(-0.15, 0.15, s * c - 1.5, s * c + 1.5, 0, 0.03, LIGHT_PAINT);
    for (let c = 8; c < HALF_W - 1.5; c += 6) deco(s * c - 1.5, s * c + 1.5, -0.15, 0.15, 0, 0.03, LIGHT_PAINT);
  }
  const lampZ = (x: number, z: number) => deco(x - 0.2, x + 0.2, z - 1.5, z + 1.5, CEIL_Y0 - 0.08, CEIL_Y0, LIGHT_LAMP);
  const lampX = (x: number, z: number) => deco(x - 1.5, x + 1.5, z - 0.2, z + 0.2, CEIL_Y0 - 0.08, CEIL_Y0, LIGHT_LAMP);
  // 縦の通路は 8m おき、横の通路は真ん中の交差点にも 1 本。前後の壁ぎわは階段室とエレベーターホールを避ける
  lampX(0, 0);
  for (const s of [-1, 1]) {
    for (const x of [0, ...AISLES.flatMap((a) => [-a, a])]) for (const z of [11, 19, 27, 35]) lampZ(x, s * z);
    for (let x = 10; x <= 50; x += 8) lampX(s * x, 0);
    for (let x = 10; x <= 42; x += 8) for (const z of [-45.5, 45.5]) lampX(s * x, z);
  }

  // ---- 走る車 ----
  const movers = DRIVERS.map(([sx, sz, first]) => driver(rand, sx, sz, first));

  // ---- エレベーターホール ----
  // 手前の壁の真ん中に張り出した部屋。主通路の突き当たりにガラスの扉と、中のエレベーターの扉が見える
  box(-6, 6, 44, HALF_D, 0, CEIL_Y0, LIGHT_CORE);
  deco(-2.5, 2.5, 43.97, 44, 0, 2.5, LIGHT_DARK);
  for (const x of [-4.5, 3]) deco(x, x + 1.5, 43.97, 44, 0.5, 2.5, LIGHT_LAMP);

  // ---- 階段室 ----
  for (const s of [-1, 1]) {
    box(s * CORE_X, s * HALF_W, s * CORE_Z, s * HALF_D, 0, CEIL_Y0, LIGHT_CORE);
    // 通路側の面に扉と、非常口の明かり
    deco(s * (CORE_X - 0.03), s * CORE_X, s * 45, s * 47, 0, 2.5, LIGHT_DARK);
    deco(s * (CORE_X - 0.03), s * CORE_X, s * 45.25, s * 46.75, 2.75, 3.1, LIGHT_LAMP);
  }

  // 敵の出る所: 車と柱を避けた通路（主通路・横通路・列の間の通路・前後の壁ぎわの通路）。始めの交差点のすぐ近くには出さない
  const spawns: [number, number][] = [];
  for (const x of [0, ...AISLES.flatMap((a) => [-a, a])]) {
    for (const z of [-35, -23, -11, 11, 23, 35]) spawns.push([x, z]);
  }
  for (const z of [0, -45.5, 45.5]) for (const x of [-35, -12, 12, 35]) spawns.push([x, z]);
  // 狙撃手だけが出る所: 高い所は無いので、長い通路の突き当たり（主通路の前後の端、横通路の左右の端、列の間の通路の端）から見通しで撃つ。
  // 前後の壁ぎわでは、走る車の通り道（z = ±45.5）にかからないよう、壁へ寄せる
  const perches: [number, number][] = [[0, -48.5], [0, 42], [-54, 0], [54, 0]];
  for (const x of AISLES.flatMap((a) => [-a, a])) for (const z of [-48.5, 48.5]) perches.push([x, z]);
  return {
    boxes,
    movers,
    decor,
    colliders,
    scenery: [],
    ramps: [],
    lines: [],
    // 壁の外側の面まで。境界の壁は壁の中に隠れ、動ける範囲は壁そのものの当たり判定で決まる
    bounds: { minX: -HALF_W - WALL_T, maxX: HALF_W + WALL_T, minZ: -HALF_D - WALL_T, maxZ: HALF_D + WALL_T },
    // 真ん中の交差点
    start: { x: 0, y: 0, z: 0 },
    enemySpawns: [...spawns.map(([x, z]) => ({ x, y: 0, z })), ...perches.map(([x, z]) => ({ x, y: 0, z, perch: true }))],
    guest: 'sniper', // 長い通路の奥から、車と柱の間を通して撃ってくる
    // 手前の右の角の近くから、天井の下に車の列と柱が奥まで続くのを見る
    view: { eye: { x: 40, y: 2.8, z: 46 }, target: { x: 4, y: 1.2, z: -10 } },
  };
}

// ---- 走る車 ----
// 内側の列のますに頭から止まっている。しばらくするとバックで出て、内側の通路を壁のほうへ、前後の壁ぎわを外へ、外側の通路を横通路へ、
// 横通路を内へ走って戻り、元のますに頭から入る。通路では止まらずに角を曲がる。走っている間に触れると、プレイヤーも敵もはね飛ばされる。
// 道のりは左奥のブロックで書き、(sx, sz) で左右・前後を写す
const Q = Math.PI / 2;
function driver(rand: () => number, sx: number, sz: number, first: number): StageMover {
  const t = CAR_TYPES[0]; // セダン（屋根に乗れる）
  const cx = -12 - (t.len / 2 + 0.4);
  const cz = -DRIVER_Z;
  const pivot = { x: -sx * cx, z: -sz * cz }; // 写した先での、止まっているときの車の真ん中
  const part: StageMoverPart = { boxes: [], decor: [], colliders: [] };
  car(part.decor, part.colliders!, t, pivot.x, pivot.z, -sx, 'x', rand);
  const path: StageMoverStep[] = [];
  let px = cx;
  let pz = cz;
  // (x, z) は左奥での車の真ん中の位置、yaw は左奥での向き。写すと向きの回り方は、片方だけ写せば逆になる。
  // かかる時間は、速さの付け方ごとに一番速いところが speed になるよう決める
  const go = (x: number, z: number, yaw: number, ease: StageMoverStep['ease'], speed = CAR_SPEED) => {
    const peak = ease === 'none' ? 1 : ease === 'both' ? 1.5 : 2;
    path.push({ x: -sx * (x - cx), z: -sz * (z - cz), yaw: sx * sz * yaw, time: (Math.hypot(x - px, z - pz) * peak) / speed, ease });
    px = x;
    pz = z;
  };
  const wait = (time: number) => path.push({ x: -sx * (px - cx), z: -sz * (pz - cz), time });
  const [inner, outer, far, lane] = [-AISLES[0], -AISLES[1], -45.5, -DRIVER_LANE];
  const R = 3.5; // 角を曲がるときの大きさ
  wait(first);
  // バックでますから出て、頭を壁のほうへ向ける
  go(-20.5, cz, 0, 'both', CAR_SLOW);
  go(inner, cz + 3, Q, 'both', CAR_SLOW);
  wait(1);
  // ブロックを一周する
  go(inner, far + R, Q, 'in');
  go(inner - R, far, 2 * Q, 'none');
  go(outer + R, far, 2 * Q, 'none');
  go(outer, far + R, 3 * Q, 'none');
  go(outer, lane - R, 3 * Q, 'none');
  go(outer + R, lane, 4 * Q, 'none');
  go(inner - R, lane, 4 * Q, 'none');
  go(inner, lane - R, 5 * Q, 'none');
  // ますの手前で速さを落とし、頭から入れる
  go(inner, cz + 6, 5 * Q, 'out');
  go(-19.5, cz, 4 * Q, 'both', CAR_SLOW);
  go(cx, cz, 4 * Q, 'both', CAR_SLOW * 0.7);
  return { parts: [part], path, pivot, hazard: true };
}

// ---- 車 ----
// 車種ごとの形。長さ len・幅 wid（m）、車体の底 bottom と上面 top、キャビン（窓のある上の箱）の前後の範囲 cab（鼻先の向きが正）と
// 屋根の高さ roof、内側へのすぼまり inset、車輪の直径 wheel と前後の位置 axle。bed なら、キャビンの後ろを荷台にする（ピックアップ）。
// 車体の底が 0.75m 以上の車（SUV とピックアップ）は、下をスライディングでくぐれる（スライディング中の頭は 0.7m）。
// 屋根が 1.7m 以下の車（セダン・スポーツカー）は屋根に乗れる。ほかはボンネットや荷台まで
interface CarType { len: number; wid: number; bottom: number; top: number; cab: [number, number]; roof: number; inset: number; wheel: number; axle: number; bed?: boolean; weight: number }
const CAR_TYPES: CarType[] = [
  { len: 6.5, wid: 3, bottom: 0.35, top: 1.05, cab: [-1.9, 1.3], roof: 1.65, inset: 0.25, wheel: 0.8, axle: 2.1, weight: 3 }, // セダン
  { len: 6.5, wid: 3, bottom: 0.25, top: 0.8, cab: [-1.6, 0.9], roof: 1.25, inset: 0.3, wheel: 0.75, axle: 2.2, weight: 0.8 }, // スポーツカー
  { len: 5, wid: 2.6, bottom: 0.3, top: 1, cab: [-2.3, 1.4], roof: 2.1, inset: 0.15, wheel: 0.7, axle: 1.6, weight: 2 }, // 軽自動車
  { len: 7, wid: 3, bottom: 0.4, top: 1.2, cab: [-3.4, 2.4], roof: 2.7, inset: 0.1, wheel: 0.9, axle: 2.4, weight: 1.5 }, // ワンボックス
  { len: 6.5, wid: 3, bottom: 0.75, top: 1.5, cab: [-1.75, 1.25], roof: 2.2, inset: 0.25, wheel: 1.1, axle: 2.2, weight: 2 }, // SUV
  { len: 7, wid: 3, bottom: 0.75, top: 1.4, cab: [0.2, 2.2], roof: 2.3, inset: 0.2, wheel: 1.1, axle: 2.4, bed: true, weight: 1 }, // ピックアップ
];
const CAR_WEIGHT = CAR_TYPES.reduce((sum, t) => sum + t.weight, 0);
const SLIDE_UNDER = 0.75; // 底がこれ以上の車は下をくぐれる
function pickCar(rand: () => number): CarType {
  let r = rand() * CAR_WEIGHT;
  for (const t of CAR_TYPES) if ((r -= t.weight) < 0) return t;
  return CAR_TYPES[0];
}

// (cx, cz) は車体の中心、dir は鼻先の向き（軸の正の向きなら 1）、axis は車の長さの向き。
// 当たり判定は車体とキャビン（くぐれる車は車輪も、ピックアップは荷台のあおりも）
function car(decor: StageBox[], colliders: NonNullable<StageMoverPart['colliders']>, t: CarType, cx: number, cz: number, dir: number, axis: 'x' | 'z', rand: () => number) {
  // u: 前（鼻先の向き）、v: 横
  const area = (u0: number, u1: number, v0: number, v1: number) => {
    const a = cx + (axis === 'x' ? dir * u0 : v0);
    const b = cx + (axis === 'x' ? dir * u1 : v1);
    const c = cz + (axis === 'x' ? v0 : dir * u0);
    const d = cz + (axis === 'x' ? v1 : dir * u1);
    return { minX: Math.min(a, b), maxX: Math.max(a, b), minZ: Math.min(c, d), maxZ: Math.max(c, d) };
  };
  const part = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, light: number, round = false) =>
    decor.push({ ...area(u0, u1, v0, v1), y0: y0 || undefined, h: y1, light, look: 'struct', shape: round ? (axis === 'x' ? 'octagonZ' : 'octagonX') : undefined });
  const solid = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number) => colliders.push({ ...area(u0, u1, v0, v1), y0: y0 || undefined, h: y1 });
  const body = CAR_LIGHTS[Math.floor(rand() * CAR_LIGHTS.length)];
  const dark = 0.12;
  const L = t.len / 2;
  const W = t.wid / 2;
  const high = t.bottom >= SLIDE_UNDER;
  // 車体。底の高い車は裏に暗い底板を、低い車は車体の下に暗い影を入れる
  part(-L, L, -W, W, t.bottom, t.top, body);
  if (high) part(-L + 0.25, L - 0.25, -W + 0.3, W - 0.3, t.bottom - 0.05, t.bottom, dark);
  else part(-L + 0.5, L - 0.5, -W + 0.4, W - 0.4, 0.08, t.bottom, dark);
  // 車輪: 八角柱。上の端は車体に隠れる
  const r = t.wheel / 2;
  for (const u of [t.axle, -t.axle]) {
    for (const s of [-1, 1]) {
      const v0 = s * (W - 0.45);
      const v1 = s * (W + 0.05);
      part(u - r, u + r, v0, v1, 0, t.wheel, dark, true);
      part(u - r * 0.45, u + r * 0.45, v0 - s * 0.02, v1 + s * 0.02, r * 0.55, r * 1.45, 0.5, true); // ホイール
      if (high) solid(u - r, u + r, v0, v1, 0, t.bottom);
    }
  }
  // キャビン: 窓の帯を一回り大きく巻き、前後のガラスを貼る
  const [c0, c1] = t.cab;
  const cw = W - t.inset;
  const w0 = t.top + (t.roof - t.top) * 0.15;
  const w1 = t.roof - (t.roof - t.top) * 0.12;
  part(c0, c1, -cw, cw, t.top, t.roof, body);
  part(c0 + 0.15, c1 - 0.15, -cw - 0.03, cw + 0.03, w0, w1, LIGHT_DARK);
  part(c1, c1 + 0.03, -cw + 0.15, cw - 0.15, w0, w1, LIGHT_DARK);
  if (!t.bed) part(c0 - 0.03, c0, -cw + 0.15, cw - 0.15, w0, w1, LIGHT_DARK);
  // ピックアップの荷台: キャビンの後ろを低いあおりで囲う
  if (t.bed) {
    for (const s of [-1, 1]) {
      part(-L, c0, s * (W - 0.15), s * W, t.top, t.top + 0.5, body);
      solid(-L, c0, s * (W - 0.15), s * W, t.top, t.top + 0.5);
    }
    part(-L, -L + 0.15, -W + 0.15, W - 0.15, t.top, t.top + 0.5, body);
    solid(-L, -L + 0.15, -W + 0.15, W - 0.15, t.top, t.top + 0.5);
  }
  // 前照灯と尾灯
  const l0 = t.top - 0.35;
  for (const [v0, v1] of [[W - 0.9, W - 0.2], [-W + 0.2, -W + 0.9]]) {
    part(L, L + 0.03, v0, v1, l0, l0 + 0.2, LIGHT_LAMP);
    part(-L - 0.03, -L, v0, v1, l0, l0 + 0.2, dark);
  }
  solid(-L, L, -W, W, high ? t.bottom : 0, t.top);
  solid(c0, c1, -cw, cw, t.top, t.roof);
}

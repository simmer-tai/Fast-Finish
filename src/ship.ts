// ---- ステージ: SHIP（巨大なコンテナ船の甲板） ----
// 海の上を進む大きなコンテナ船。船首を -z に向け、プレイヤーは船尾の居住区（ブリッジ）の前に立って船首を向いて始める。
// 海面は地面（y = 0）で、甲板は船体の上面（DECK）。船体は当たり判定だけの見えない箱で持ち、見た目は遠景として描く
// （高い箱が大量に組み上がって画面が揺れ続けないように）。
// 甲板は、コンテナを積んだ区画（ベイ）と、舷から舷まで何も無い帯（レーン）を前後に交互に並べる（並びの考えは「甲板の並び」）。
// 甲板の縁はブルワーク（舷側の壁）で囲み、その上に見えない壁を立てて海へ落ちないようにする。
// 遊べるのはコンテナを積んだ甲板だけ。船首楼は波よけの壁（ブレイクウォーター）の向こう、居住区とその後ろの船尾は
// 両舷の通路の扉の向こうにあって、見えるが入れない（動ける範囲もその手前で切る）。
// 海面は波打って流れ、船は左右に大きく揺れて見える（world/sea.ts）。甲板の当たり判定は傾かないが、
// 積み荷は揺れに合わせて舷から舷へ滑り、ぶつかったプレイヤーと敵を跳ね飛ばす（movers。プレイヤーにダメージは無い）
import type { StageLayout, StageBox, StageLine, StageMover, StageRamp } from './stage.js';

const SPEED = 8; // 船の進む速さ (m/s)。海面をこの速さで船尾へ流す
// 横揺れの幅（度）と周期（秒）。周期の前半は右舷（+x）が上がり、固定の外れた積み荷が左舷へ滑る。後半はその逆
const ROLL = 9;
const ROLL_PERIOD = 14;
const DECK = 12; // 甲板の高さ（海面から）
const FORE = DECK + 2.5; // 船首楼の甲板の高さ（甲板からよじ登れる高さ）
const BEAM = 22; // 船の幅の半分
const MID_BOW = -50; // ここより船首側で、船体が細くなっていく
const BOW = -112; // 船首の先
const FORE_Z = -58; // 船首楼の後ろの縁
const MID_STERN = 62; // ここより船尾側で、少し細くなる
const STERN = 72; // 船尾の端
const SLICE = 2; // 細くなる所を刻む長さ
const BREAKWATER_Z = -55.4; // 波よけの壁の、船尾側の面。ここより船首側には入れない
const BULWARK_T = 0.4; // ブルワークの厚さ
const BULWARK_H = 1.2;
const GUARD_H = 16; // ブルワークの上に立てる、見えない壁の高さ（3 段積みのコンテナの上から跳んでも越えられない）

// コンテナ: 幅 2.4m・高さ 2.6m・長さ 12m（40ft）を、幅 2.5m おきに 14 列並べる
const BOX_W = 2.4;
const BOX_PITCH = 2.5;
const BOX_H = 2.6;
const ROWS = 14;
const ROW_X0 = -(ROWS * BOX_PITCH) / 2; // -17.5

// 居住区（ブリッジ）: 5 層の上に操舵室が載り、両舷へ張り出したウイングがある
const HOUSE_X = 14;
const HOUSE_Z0 = 44;
const HOUSE_Z1 = 62;
const STOREY = 3;
const STOREYS = 5;
const GATE_Z = HOUSE_Z0 - 0.4; // 居住区の前で両舷の通路をふさぐ扉の、船首側の面。ここより船尾側には入れない
// 舷から舷まで空けた帯（ベイの間）。z の範囲
const LANES: [number, number][] = [[34, GATE_Z], [12, 22], [-12, 0], [-34, -24], [BREAKWATER_Z, -46]];

// ---- 甲板の並び ----
// 船は左右（x）に傾くので、積み荷も敵も x の向きに滑る。甲板を z の帯に分け、
// コンテナを積む区画（ベイ）と、何も積まずに舷から舷まで滑り抜けられる帯（レーン）を交互に並べる。
// レーンの舷側は壁ではなく手すりにして、滑った物が溜まる所にする。
// ベイの積み荷も固定が外れていて、つながった列の山ごとに舷から舷へ滑る（滑らせ方は「滑る積み荷」）。
// 山の寄った側の通路はふさがり、反対の舷は大きく空く。山の間は、滑っている間だけ開いて通れる
// 列ごとの段数（左舷 → 右舷）。0 は積まない。コンテナは長さ 12m なので、ベイの長さも 12m。
// 書いた並びは山の大きさと順番だけを決める（置く位置は、滑って舷に寄った所）。
// open は扉を開け放して中に入れる列（いちばん下の段）: 1 は船尾側の扉だけ開く行き止まり、2 は両端が開いて前後に通り抜けられる
const BAYS: { z0: number; z1: number; tiers: string; open?: Record<number, 1 | 2> }[] = [
  { z0: 22, z1: 34, tiers: '01230000003210', open: { 2: 1, 11: 1 } }, // 階段状の山を 2 つ
  { z0: 0, z1: 12, tiers: '00012333210000', open: { 6: 2 } }, // 大きな山 1 つ。登って越えるか、空いた舷を回るか、真ん中を抜ける
  { z0: -24, z1: -12, tiers: '03210000001230', open: { 1: 2 } }, // 高い山を 2 つ
  { z0: -46, z1: -34, tiers: '01100200201100', open: { 5: 1 } }, // 低い山を 4 つ散らす
];
// 固定の外れた積み荷（揺れで滑る）: 20ft のコンテナ（長さ 6m を x の向きに置く）と木箱。どれもレーンの中に置く
const LOOSE_BOXES: { x: number; z: number; tiers: number }[] = [
  { x: -9, z: 16.2, tiers: 1 }, { x: 9, z: 19.2, tiers: 2 },
  { x: 0, z: -5.8, tiers: 1 }, { x: -13, z: -1.8, tiers: 1 },
  { x: 12, z: -28.8, tiers: 2 },
];
const CRATES: [number, number, number][] = [
  [-14, 40, 1.4], [-12.6, 40.4, 1.2], [15, 36.5, 1.4],
  [0, 14, 1.4], [1.4, 14.4, 1.2],
  [8, -9, 1.4], [9.4, -9.3, 1.2], [-6, -10.2, 1.4],
  [-9, -28, 1.4], [-10.4, -27.5, 1.2],
  [-4, -51, 1.4], [5, -50, 1.2],
];

// 明るさ（0 が黒、1 が白）
const LIGHT_HULL = 0.28;
const LIGHT_BOOT = 0.6; // 喫水線のあたりの帯
const LIGHT_DECK = 0.62;
const LIGHT_BULWARK = 0.48;
const LIGHT_HOUSE = 0.88;
const LIGHT_WINDOW = 0.14;
const LIGHT_STEEL = 0.36;
const LIGHT_DARK = 0.18;
const BOX_LIGHTS = [0.22, 0.34, 0.5, 0.66, 0.8, 0.92];

export function buildShip(): StageLayout {
  const boxes: StageBox[] = [];
  const decor: StageBox[] = [];
  const colliders: StageLayout['colliders'] = [];
  const scenery: StageBox[] = [];
  const ramps: StageRamp[] = [];
  const lines: StageLine[] = [];
  const movers: StageMover[] = [];
  const rect = (x0: number, x1: number, z0: number, z1: number) => ({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
  const put = (list: StageBox[], x0: number, x1: number, z0: number, z1: number, y0: number, h: number, light: number, look: StageBox['look'] = 'struct', shape?: StageBox['shape']) =>
    list.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look, shape });
  const wall = (x0: number, x1: number, z0: number, z1: number, y0: number, h: number) => colliders.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h });
  // 左右の鏡写しで置く（x0 < x1 は右舷側で書く）
  const pair = (fn: (x0: number, x1: number) => void, x0: number, x1: number) => {
    fn(x0, x1);
    fn(-x1, -x0);
  };
  let seed = 5821;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // ---- コンテナの作り ----
  // 本体（当たり判定）に、四隅の柱・上下の枠・側面の波板・扉の合わせ目と閂（かんぬき）を見た目だけで足す。
  // long は長さの向き（u がその向き、v が幅の向き）。door は扉のある端（u の + / - の端）。
  // lo / hi は波板を付ける長い側面（v の小さい側 / 大きい側）。隣の積み荷に隠れる面には付けない。
  // into は置く先（動く物の部品に入れるときに渡す）。
  // open は扉を開け放して中に入れるようにする: 1 は扉の端だけ、2 は両端とも開いて通り抜けられる。
  // 中に入れるコンテナは、本体を壁と屋根の箱に分けて中を空け、中の空間を into.rooms に足す
  const container = (long: 'x' | 'z', u0: number, u1: number, v0: number, v1: number, y0: number, light: number, door: 1 | -1, lo: boolean, hi: boolean, into: Into = { boxes, decor }, open: 0 | 1 | 2 = 0) => {
    const at = (a0: number, a1: number, b0: number, b1: number, c0: number, c1: number, l: number, list = into.decor) =>
      long === 'z' ? put(list, b0, b1, a0, a1, c0, c1, l, 'plain') : put(list, a0, a1, b0, b1, c0, c1, l, 'plain');
    const y1 = y0 + BOX_H;
    const frame = light * 0.72;
    const rib = Math.min(1, light + 0.06);
    if (!open) {
      at(u0, u1, v0, v1, y0, y1, light, into.boxes);
    } else {
      const W = 0.1; // 壁と屋根の厚さ
      const lining = light * 0.45; // 中の壁は暗くする
      at(u0, u1, v0, v0 + W, y0, y1, light, into.boxes);
      at(u0, u1, v1 - W, v1, y0, y1, light, into.boxes);
      at(u0, u1, v0 + W, v1 - W, y1 - W, y1, light, into.boxes);
      // 奥の壁（扉の反対の端）
      const [k0, k1] = door > 0 ? [u0, u0 + W] : [u1 - W, u1];
      if (open === 1) at(k0, k1, v0 + W, v1 - W, y0, y1 - W, light, into.boxes);
      // 中の内張りと床板
      at(u0, u1, v0 + W, v0 + W + 0.01, y0, y1 - W, lining);
      at(u0, u1, v1 - W - 0.01, v1 - W, y0, y1 - W, lining);
      at(u0, u1, v0 + W, v1 - W, y1 - W - 0.01, y1 - W, lining);
      at(u0, u1, v0 + W, v1 - W, y0, y0 + 0.03, lining * 0.8);
      if (open === 1) at(door > 0 ? k1 : k0 - 0.01, door > 0 ? k1 + 0.01 : k0, v0 + W, v1 - W, y0, y1 - W, lining);
      // 中の空間（扉の側は端まで、奥の壁があればその手前まで）
      const [i0, i1] = open === 2 ? [u0, u1] : door > 0 ? [u0 + W, u1] : [u0, u1 - W];
      const room = long === 'z'
        ? { minX: v0 + W, maxX: v1 - W, minZ: i0, maxZ: i1, y0, h: y1 - W }
        : { minX: i0, maxX: i1, minZ: v0 + W, maxZ: v1 - W, y0, h: y1 - W };
      into.rooms?.push(room);
    }
    // 四隅の柱
    for (const [a0, a1] of [[u0 - 0.02, u0 + 0.16], [u1 - 0.16, u1 + 0.02]]) {
      for (const [b0, b1] of [[v0 - 0.02, v0 + 0.16], [v1 - 0.16, v1 + 0.02]]) at(a0, a1, b0, b1, y0, y1, frame);
    }
    // 上下の枠: 長い側面と両端
    for (const [c0, c1] of [[y0, y0 + 0.18], [y1 - 0.14, y1]]) {
      for (const [b0, b1] of [[v0 - 0.02, v0 + 0.1], [v1 - 0.1, v1 + 0.02]]) at(u0, u1, b0, b1, c0, c1, frame);
      for (const [a0, a1] of [[u0 - 0.02, u0 + 0.1], [u1 - 0.1, u1 + 0.02]]) at(a0, a1, v0, v1, c0, c1, frame);
    }
    // 長い側面の波板
    for (let u = u0 + 0.45; u + 0.3 < u1 - 0.3; u += 0.7) {
      if (lo) at(u, u + 0.3, v0 - 0.04, v0, y0 + 0.18, y1 - 0.14, rib);
      if (hi) at(u, u + 0.3, v1, v1 + 0.04, y0 + 0.18, y1 - 0.14, rib);
    }
    const vm = (v0 + v1) / 2;
    // 開いた端には、外へ 270 度開いて側面に沿わせた扉の板を描く
    const swung = (end: 1 | -1) => {
      const [d0, d1] = end > 0 ? [u1 - 1.2, u1 + 0.02] : [u0 - 0.02, u0 + 1.2];
      at(d0, d1, v0 - 0.1, v0 - 0.05, y0 + 0.1, y1 - 0.08, frame);
      at(d0, d1, v1 + 0.05, v1 + 0.1, y0 + 0.1, y1 - 0.08, frame);
    };
    if (open) {
      swung(door);
      if (open === 2) swung(door > 0 ? -1 : 1);
      if (open === 2) return;
    } else {
      // 扉の端: 真ん中の合わせ目と、4 本の閂とその取っ手
      const out = (d: number): [number, number] => (door > 0 ? [u1, u1 + d] : [u0 - d, u0]);
      const [s0, s1] = out(0.03);
      at(s0, s1, vm - 0.02, vm + 0.02, y0 + 0.18, y1 - 0.14, LIGHT_DARK);
      for (const v of [v0 + 0.4, v0 + 0.85, v1 - 0.9, v1 - 0.45]) {
        const [r0, r1] = out(0.07);
        at(r0, r1, v, v + 0.05, y0 + 0.2, y1 - 0.16, frame);
        const [h0, h1] = out(0.11);
        at(h0, h1, v - 0.04, v + 0.09, y0 + 1.05, y0 + 1.2, frame);
      }
    }
    // 反対の端は縦の波板
    const [b0, b1] = door > 0 ? [u0 - 0.04, u0] : [u1, u1 + 0.04];
    for (const v of [v0 + 0.3, vm - 0.15, v1 - 0.6]) at(b0, b1, v, v + 0.3, y0 + 0.18, y1 - 0.14, rib);
  };

  // ---- 船体 ----
  // z の向きに区切り、区切りごとの幅の半分と甲板の高さを決める。船首は放物線で細め、船尾は少しだけ丸める
  const slices: { z0: number; z1: number; w: number; top: number }[] = [];
  for (let z = STERN; z > MID_STERN; z -= SLICE) {
    const t = (z - SLICE / 2 - MID_STERN) / (STERN - MID_STERN);
    slices.push({ z0: z - SLICE, z1: z, w: BEAM * (1 - 0.3 * t * t), top: DECK });
  }
  slices.push({ z0: MID_BOW, z1: MID_STERN, w: BEAM, top: DECK });
  for (let z = MID_BOW; z > BOW; z -= SLICE) {
    const t = (MID_BOW - (z - SLICE / 2)) / (MID_BOW - BOW);
    slices.push({ z0: z - SLICE, z1: z, w: Math.max(1.2, BEAM * (1 - t * t)), top: z <= FORE_Z ? FORE : DECK });
  }
  for (const s of slices) {
    // 当たり判定は甲板の高さの箱 1 つ。見た目は喫水線の帯と、その上の船体に分ける。
    // 揺れで海面が下がっても船底との間が空かないよう、帯は海面の下まで伸ばす
    wall(-s.w, s.w, s.z0, s.z1, 0, s.top);
    put(scenery, -s.w, s.w, s.z0, s.z1, -6, 3, LIGHT_BOOT);
    put(scenery, -s.w, s.w, s.z0, s.z1, 3, s.top - 0.3, LIGHT_HULL);
    put(scenery, -s.w, s.w, s.z0, s.z1, s.top - 0.3, s.top, LIGHT_DECK, 'terrain');
  }

  // ---- ブルワーク ----
  // 区切りごとの舷側に壁を立て、幅の変わる継ぎ目は、広い側の端に横向きの壁を足してふさぐ。上には見えない壁を立てる
  // （slices は船尾から船首へ並ぶ。船尾側は船首へ向かって広がり、船首側は狭まる）
  const bulwark = (x0: number, x1: number, z0: number, z1: number, top: number) => {
    put(decor, x0, x1, z0, z1, top, top + BULWARK_H, LIGHT_BULWARK);
    wall(x0, x1, z0, z1, top, top + GUARD_H);
  };
  // 手すり: 低い腰板に支柱と 2 本の横棒。当たり判定はブルワークと同じ
  const railing = (x0: number, x1: number, z0: number, z1: number, top: number) => {
    put(decor, x0, x1, z0, z1, top, top + 0.15, LIGHT_BULWARK);
    for (let z = z0 + 0.2; z < z1 - 0.1; z += 1.5) put(decor, x0 + 0.14, x1 - 0.14, z, z + 0.12, top + 0.15, top + 1.1, LIGHT_STEEL);
    for (const y of [0.55, 1.05]) put(decor, x0 + 0.15, x1 - 0.15, z0, z1, top + y, top + y + 0.08, LIGHT_STEEL);
    wall(x0, x1, z0, z1, top, top + GUARD_H);
  };
  // 胴の舷側: レーンの横は手すり、それ以外はブルワーク
  const sideAlong = (z0: number, z1: number) => {
    const cuts = LANES.map(([a, b]) => [Math.max(a, z0), Math.min(b, z1)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let z = z0;
    for (const [a, b] of cuts) {
      if (a > z) pair((x0, x1) => bulwark(x0, x1, z, a, DECK), BEAM - BULWARK_T, BEAM);
      pair((x0, x1) => railing(x0, x1, a, b, DECK), BEAM - BULWARK_T, BEAM);
      z = b;
    }
    if (z < z1) pair((x0, x1) => bulwark(x0, x1, z, z1, DECK), BEAM - BULWARK_T, BEAM);
  };
  slices.forEach((s, i) => {
    if (s.z0 === MID_BOW && s.z1 === MID_STERN) sideAlong(s.z0, s.z1);
    else pair((x0, x1) => bulwark(x0, x1, s.z0, s.z1, s.top), s.w - BULWARK_T, s.w);
    const next = slices[i + 1]; // 船首側の隣
    if (next && next.w < s.w) pair((x0, x1) => bulwark(x0, x1, s.z0, s.z0 + BULWARK_T, s.top), next.w - BULWARK_T, s.w);
    if (next && next.w > s.w) pair((x0, x1) => bulwark(x0, x1, next.z1 - BULWARK_T, next.z1, next.top), s.w - BULWARK_T, next.w);
  });
  const prev = slices[0]; // 船尾の端（トランサム）
  bulwark(-prev.w, prev.w, STERN - BULWARK_T, STERN, DECK);
  const tip = slices[slices.length - 1];
  bulwark(-tip.w, tip.w, tip.z0, tip.z0 + BULWARK_T, FORE);

  // ---- コンテナ ----
  const rowX = (r: number) => ROW_X0 + r * BOX_PITCH + (BOX_PITCH - BOX_W) / 2;
  // ハッチの蓋: 縁と継ぎ目の線
  const hatch = (z0: number, z1: number) => {
    for (const z of [z0 + 0.4, z1 - 0.4]) lines.push({ x: 0, y: DECK + 0.03, z, w: ROWS * BOX_PITCH, d: 0.15 });
    for (const x of [ROW_X0, -ROW_X0, -ROW_X0 / 2, ROW_X0 / 2, 0]) lines.push({ x, y: DECK + 0.03, z: (z0 + z1) / 2, w: 0.15, d: z1 - z0 - 0.8 });
  };
  // ---- 滑る積み荷 ----
  // 積み荷はどれも固定が外れていて、船が傾くと低い舷へ滑っていき、手すりに詰めて寄る。傾きが返ると反対の舷へ寄る。
  // 動きは船の傾き（world/shipState.ts）から毎フレーム計算する（world/movers.ts の cargo）。
  // 同じ帯（z の重なる所）に並ぶかたまりは、右舷の手すりに詰めて寄せた位置に置く。帯の中ではすり抜けず、ぶつかると速さをそろえる。
  // 大波の間に速く手すりへぶつかったかたまりは、手すりを越えて海へ落ちる（落ちる動きは world/sea.ts）
  type Into = { boxes: StageBox[]; decor: StageBox[]; rooms?: StageLayout['colliders'] };
  type Cargo = { x0: number; x1: number; z0: number; z1: number; build: (dx: number, into: Into) => void };
  const RAIL = BEAM - BULWARK_T - 0.05; // 滑っていって止まる所（手すりの内側）
  const PACK_GAP = 0.1; // 詰めて寄ったときの、かたまりどうしの間
  let bandId = 0;
  const slideBand = (band: Cargo[]) => {
    band.sort((a, b) => a.x0 - b.x0);
    let x = RAIL;
    const id = bandId++;
    for (let i = band.length - 1; i >= 0; i--) {
      const c = band[i];
      const into: Into = { boxes: [], decor: [], rooms: [] };
      const width = c.x1 - c.x0;
      c.build(x - c.x1, into);
      movers.push({ parts: [into], path: [], cargo: { band: id, minX: x - width, maxX: x, rail: RAIL }, hazard: true, frontOnly: true, harmless: true });
      x -= width + PACK_GAP;
    }
  };

  for (const { z0, z1, tiers, open } of BAYS) {
    const band: Cargo[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (tiers[r] === '0' || (r > 0 && tiers[r - 1] !== '0')) continue;
      let r1 = r;
      while (r1 + 1 < ROWS && tiers[r1 + 1] !== '0') r1++;
      const rows = Array.from({ length: r1 - r + 1 }, (_, k) => r + k);
      const lights = rows.map((row) => Array.from({ length: Number(tiers[row]) }, () => BOX_LIGHTS[Math.floor(rand() * BOX_LIGHTS.length)]));
      band.push({
        x0: rowX(r), x1: rowX(r1) + BOX_W, z0, z1,
        build: (dx, into) => rows.forEach((row, k) => {
          const left = row > r ? Number(tiers[row - 1]) : 0;
          const right = row < r1 ? Number(tiers[row + 1]) : 0;
          const x = rowX(row) + dx;
          lights[k].forEach((l, t) => container('z', z0, z1, x, x + BOX_W, DECK + t * BOX_H, l, 1, left <= t, right <= t, into, t === 0 ? open?.[row] ?? 0 : 0));
          // 足もとの両端に、固定金具の台（外れたラッシングの柱）
          for (const z of [z0 - 0.5, z1 + 0.2]) put(into.decor, x + 0.2, x + 0.5, z, z + 0.3, DECK, DECK + 0.35, LIGHT_DARK);
        }),
      });
    }
    slideBand(band);
    hatch(z0, z1);
  }
  for (const [z0, z1] of LANES) hatch(Math.max(z0, BREAKWATER_Z + 1), Math.min(z1, GATE_Z - 1));

  // レーン: 20ft のコンテナと木箱。z の重なるものを同じ帯にする
  const loose: Cargo[] = [
    ...LOOSE_BOXES.map(({ x, z, tiers }) => {
      const lights = Array.from({ length: tiers }, () => BOX_LIGHTS[Math.floor(rand() * BOX_LIGHTS.length)]);
      return {
        x0: x - 3, x1: x + 3, z0: z - BOX_W / 2, z1: z + BOX_W / 2,
        build: (dx: number, into: Into) => lights.forEach((l, t) =>
          container('x', x - 3 + dx, x + 3 + dx, z - BOX_W / 2, z + BOX_W / 2, DECK + t * BOX_H, l, t % 2 ? 1 : -1, true, true, into)),
      };
    }),
    ...CRATES.map(([x, z, s]) => ({
      x0: x - s / 2, x1: x + s / 2, z0: z - s / 2, z1: z + s / 2,
      build: (dx: number, into: Into) => {
        put(into.boxes, x + dx - s / 2, x + dx + s / 2, z - s / 2, z + s / 2, DECK, DECK + s, 0.72, 'plain');
        // 木箱の帯（板の継ぎ目）
        put(into.decor, x + dx - s / 2 - 0.02, x + dx + s / 2 + 0.02, z - s / 2 - 0.02, z + s / 2 + 0.02, DECK + s * 0.45, DECK + s * 0.55, 0.55, 'plain');
      },
    })),
  ].sort((a, b) => a.z0 - b.z0);
  const bands: Cargo[][] = [];
  for (const c of loose) {
    const last = bands[bands.length - 1];
    if (last && c.z0 < Math.max(...last.map((o) => o.z1))) last.push(c);
    else bands.push([c]);
  }
  for (const band of bands) slideBand(band);

  // ---- 居住区（ブリッジ） ----
  put(boxes, -HOUSE_X, HOUSE_X, HOUSE_Z0, HOUSE_Z1, DECK, DECK + STOREY * STOREYS, LIGHT_HOUSE);
  for (let j = 0; j < STOREYS; j++) {
    const y = DECK + j * STOREY;
    put(decor, -HOUSE_X + 1.5, HOUSE_X - 1.5, HOUSE_Z0 - 0.06, HOUSE_Z0, y + 1.2, y + 2.2, LIGHT_WINDOW);
    pair((x0, x1) => put(decor, x0, x1, HOUSE_Z0 + 2, HOUSE_Z1 - 2, y + 1.2, y + 2.2, LIGHT_WINDOW), HOUSE_X, HOUSE_X + 0.06);
    // 各層の床の張り出し
    put(decor, -HOUSE_X - 0.6, HOUSE_X + 0.6, HOUSE_Z0 - 0.6, HOUSE_Z0, y + STOREY - 0.25, y + STOREY, LIGHT_STEEL);
  }
  // 操舵室と、両舷へ張り出したウイング
  const BRIDGE_DECK = DECK + STOREY * STOREYS;
  put(boxes, -16, 16, HOUSE_Z0, HOUSE_Z0 + 8, BRIDGE_DECK, BRIDGE_DECK + 3.2, LIGHT_HOUSE);
  put(decor, -15, 15, HOUSE_Z0 - 0.06, HOUSE_Z0, BRIDGE_DECK + 1, BRIDGE_DECK + 2.4, LIGHT_WINDOW);
  put(decor, -16.6, 16.6, HOUSE_Z0 - 0.6, HOUSE_Z0 + 8.6, BRIDGE_DECK + 3.2, BRIDGE_DECK + 3.5, LIGHT_STEEL);
  pair((x0, x1) => {
    put(decor, x0, x1, HOUSE_Z0, HOUSE_Z0 + 4, BRIDGE_DECK - 0.4, BRIDGE_DECK, LIGHT_STEEL);
    put(decor, x1 - 0.2, x1, HOUSE_Z0, HOUSE_Z0 + 4, BRIDGE_DECK, BRIDGE_DECK + 1.1, LIGHT_BULWARK);
  }, 16, BEAM - 0.4);
  // マストとレーダー
  put(decor, -0.25, 0.25, HOUSE_Z0 + 4, HOUSE_Z0 + 4.5, BRIDGE_DECK + 3.5, BRIDGE_DECK + 12, LIGHT_STEEL);
  put(decor, -3.5, 3.5, HOUSE_Z0 + 4, HOUSE_Z0 + 4.5, BRIDGE_DECK + 9.5, BRIDGE_DECK + 9.8, LIGHT_STEEL);
  put(decor, -2.2, 2.2, HOUSE_Z0 + 3.9, HOUSE_Z0 + 4.6, BRIDGE_DECK + 6.5, BRIDGE_DECK + 6.8, LIGHT_DARK);
  // 煙突: 白い胴に、黒い頭
  put(boxes, -4, 4, 53, 61, BRIDGE_DECK, BRIDGE_DECK + 8, LIGHT_HOUSE);
  put(decor, -4.1, 4.1, 52.9, 61.1, BRIDGE_DECK + 8, BRIDGE_DECK + 10, LIGHT_DARK);
  // 救命艇: 居住区の両舷に、ギャングウェイの上へ張り出して吊る
  pair((x0, x1) => {
    put(decor, x0, x1, 49, 57, DECK + 6.5, DECK + 8.3, 0.75);
    put(decor, x0 + 0.3, x1 - 0.3, 49.5, 56.5, DECK + 8.3, DECK + 8.8, 0.6);
    for (const z of [49.6, 56]) put(decor, HOUSE_X, x1 + 0.3, z, z + 0.4, DECK + 8.8, DECK + 9.2, LIGHT_STEEL);
  }, HOUSE_X + 1.4, HOUSE_X + 4.6);

  // 両舷の通路の、居住区の前でふさぐ扉。鉄の壁に閉じた扉を描き、上には見えない壁を立てる
  pair((x0, x1) => {
    put(decor, x0, x1, GATE_Z, HOUSE_Z0, DECK, DECK + 3.4, LIGHT_BULWARK);
    put(decor, x0, x1, GATE_Z - 0.1, HOUSE_Z0, DECK + 3.4, DECK + 3.6, LIGHT_STEEL);
    put(decor, x0 + 2.4, x0 + 4.6, GATE_Z - 0.04, GATE_Z, DECK + 0.1, DECK + 2.3, LIGHT_STEEL);
    put(decor, x0 + 2.55, x0 + 4.45, GATE_Z - 0.06, GATE_Z - 0.04, DECK + 0.25, DECK + 2.15, LIGHT_DARK);
    put(decor, x0 + 4.1, x0 + 4.3, GATE_Z - 0.14, GATE_Z - 0.06, DECK + 1, DECK + 1.15, LIGHT_HOUSE);
    wall(x0, x1, GATE_Z, HOUSE_Z0, DECK, DECK + GUARD_H);
  }, HOUSE_X, BEAM - BULWARK_T);


  // ---- 波よけの壁（ブレイクウォーター） ----
  // コンテナの甲板の前の端をふさぐ。船尾側の面に縦の補強を並べ、上には見えない壁を立てる
  const BW_Z0 = BREAKWATER_Z - 0.6;
  const inner = BEAM - BULWARK_T;
  put(decor, -inner, inner, BW_Z0, BREAKWATER_Z, DECK, DECK + 4, LIGHT_BULWARK);
  put(decor, -inner, inner, BW_Z0 - 0.1, BREAKWATER_Z + 0.3, DECK + 4, DECK + 4.25, LIGHT_STEEL);
  wall(-inner, inner, BW_Z0, BREAKWATER_Z, DECK, DECK + GUARD_H);
  for (let x = -inner + 1.5; x < inner - 1; x += 3) put(decor, x, x + 0.25, BREAKWATER_Z, BREAKWATER_Z + 0.5, DECK, DECK + 3.8, LIGHT_STEEL);
  put(decor, -inner, inner, BREAKWATER_Z, BREAKWATER_Z + 0.02, DECK + 0.4, DECK + 0.7, LIGHT_DARK);

  // ---- 船首楼（入れない） ----
  put(decor, -12, 12, FORE_Z, FORE_Z + 0.06, DECK + 0.8, DECK + 1.6, LIGHT_DARK); // 前の壁の帯
  // 錨の巻き上げ機: 台に太い胴（ドラム）を載せる。鎖は船首の錨鎖孔へ線で引く
  pair((x0, x1) => {
    put(boxes, x0, x1, -84, -80, FORE, FORE + 1.2, LIGHT_STEEL);
    put(decor, x0 + 0.2, x1 - 0.2, -83.4, -80.6, FORE + 1.2, FORE + 2.8, LIGHT_DARK, 'struct', 'octagonX');
    lines.push({ x: (x0 + x1) / 2, y: FORE + 0.03, z: -92, w: 0.4, d: 16 });
  }, 3.5, 7.5);
  // 係船の巻き上げ機とボラード
  pair((x0, x1) => {
    put(boxes, x0, x1, -70, -67, FORE, FORE + 1.4, LIGHT_STEEL);
    put(decor, x0 + 0.2, x1 - 0.2, -69.6, -67.4, FORE + 1.4, FORE + 2.6, LIGHT_DARK, 'struct', 'octagonX');
  }, 9, 13);
  for (const z of [-64, -76]) {
    pair((x0, x1) => {
      put(boxes, x0, x1, z, z + 0.7, FORE, FORE + 0.9, LIGHT_DARK);
      put(boxes, x0, x1, z + 1.5, z + 2.2, FORE, FORE + 0.9, LIGHT_DARK);
    }, 16.6, 17.3);
  }
  // 前のマスト
  put(boxes, -0.6, 0.6, -97, -95.8, FORE, FORE + 14, LIGHT_STEEL);
  put(decor, -3, 3, -96.6, -96.2, FORE + 11, FORE + 11.3, LIGHT_STEEL);

  // ---- 船尾の係船甲板 ----
  pair((x0, x1) => {
    put(boxes, x0, x1, 65, 68, DECK, DECK + 1.4, LIGHT_STEEL);
    put(decor, x0 + 0.2, x1 - 0.2, 65.4, 67.6, DECK + 1.4, DECK + 2.6, LIGHT_DARK, 'struct', 'octagonX');
    put(boxes, x0 + 7, x1 + 3.7, 69, 69.7, DECK, DECK + 0.9, LIGHT_DARK);
    put(boxes, x0 + 7, x1 + 3.7, 70.5, 71.2, DECK, DECK + 0.9, LIGHT_DARK);
  }, 6, 10);

  // ---- 海 ----
  // 海面は world/sea.ts が描く（sea）。遠くに別の船を 2 隻浮かべる
  for (const [x, z, s] of [[-240, -320, 1], [300, -120, 0.7]] as const) {
    put(scenery, x - 12 * s, x + 12 * s, z - 80 * s, z + 80 * s, 0, 10 * s, LIGHT_HULL, 'plain');
    put(scenery, x - 9 * s, x + 9 * s, z + 50 * s, z + 68 * s, 10 * s, 28 * s, LIGHT_HOUSE, 'plain');
    put(scenery, x - 10 * s, x + 10 * s, z - 70 * s, z + 45 * s, 10 * s, 16 * s, 0.5, 'plain');
  }

  return {
    boxes, decor, colliders, scenery, ramps, lines, movers,
    bounds: { minX: -BEAM, maxX: BEAM, minZ: BREAKWATER_Z, maxZ: GATE_Z },
    start: { x: 0, y: DECK, z: 38 },
    // 敵の出る所: 甲板（レーンの舷から舷まで、ベイの真ん中と両舷の通路）。積み荷が滑ってくるので、
    // いま箱のある所は選ばない（main.ts の出現の判定）。
    enemySpawns: [
      ...LANES.flatMap(([z0, z1]) => [-15, -5, 5, 15].map((x) => ({ x, y: DECK, z: (Math.max(z0, BREAKWATER_Z + 2) + Math.min(z1, GATE_Z - 2)) / 2 }))),
      ...BAYS.flatMap(({ z0, z1 }) => [-19.5, 0, 19.5].map((x) => ({ x, y: DECK, z: (z0 + z1) / 2 }))),
    ],
    // 近接の敵は出さず、撃ち合いに絞る。主役は二丁拳銃で、積み荷の間から連射してくる
    // （滑ってくる山に押されて、居場所が変わり続ける）。狙撃手は甲板の遠くから狙う
    mix: {
      easy: { gunner: 0.7, sniper: 0.2, dual: 0.1 },
      normal: { gunner: 0.47, sniper: 0.2, dual: 0.33 },
      hard: { gunner: 0.35, sniper: 0.25, dual: 0.4 },
    },
    sea: {
      flow: SPEED,
      hull: { beam: BEAM, bow: BOW, midBow: MID_BOW, midStern: MID_STERN, stern: STERN },
      sway: { roll: ROLL, rollPeriod: ROLL_PERIOD, pitch: 1, pitchPeriod: 10, heave: 0.8, heavePeriod: 8, pivotY: 4 },
    },
    view: { eye: { x: 46, y: DECK + 30, z: 86 }, target: { x: 0, y: DECK, z: -20 } },
  };
}

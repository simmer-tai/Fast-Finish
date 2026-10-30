// ---- ステージ: RUINS（廃墟の街） ----
// 崩れかけたビルに囲まれた、平らな広場。ボス戦の場にするので、戦う所には物をほとんど置かない。
// 外周はビルの表の面で区切る。4 辺の真ん中は街へ抜ける通り（幅 22m）の口で、瓦礫の山でふさぐ。
// ビルは上の階が崩れて屋上がギザギザになり、ところどころ外壁が抜けて、床の板とむき出しの鉄骨だけが残っている。
// 表の面の上の階の外壁が剥がれて、鉄骨と床の縁が見えている所もある。屋上の崩れた所や折れた床からは鉄筋が飛び出す。
// その外にも廃墟の街を霧の奥まで並べる（遠景）。通りが街の奥へ続いて見えるよう、通りの上には遠景を置かない。
// 奥（-Z）の通りの口だけは、ボスが登場で突き破るビルでふさぐ。
// プレイヤーは手前（+Z）の通りの口の前から、奥（-Z）を向いて始める。当たり判定のある箱は 0.5m のグリッドに合わせる
import type { StageLayout, StageBox, StageBreach, StageRamp, StageLine } from './stage.js';

const EDGE = 40; // 外周のビルの表の面 (|x|, |z|)
const ROAD = 11; // 通りの半幅
const WALK = 4; // 通りの両わきの歩道の幅（通りの口の瓦礫の山は、歩道まで覆う）
const CORNER = EDGE + 16; // 左右の外周のビルを並べる端 (|z|)。四隅のビルも受け持つ
const STOREY = 4; // 階の高さ
const SLAB = 0.5; // 床の板の厚さ
const FAR_CELLS = [-132, -110, -88, -66, -44, -22, 0, 22, 44, 66, 88, 110, 132]; // 遠景の街区の真ん中 (x, z)。0 の列は通りなので空ける
const FAR_NEAR = 66; // この内側（外周のビルの所）には遠景を置かない (|x|, |z| の大きい方)

// 明るさ（0 が黒）。高いもの・重いものほど暗くする
const LIGHT_RUBBLE = 0.6;
const LIGHT_SLAB_DEBRIS = 0.72; // 倒れた床の板
const LIGHT_WINDOW = 0.14; // 抜けた窓（暗い帯）
const LIGHT_REBAR = 0.22;
const LIGHT_STEEL = 0.2; // むき出しの鉄骨
const LIGHT_INNER = 0.6; // 外壁が剥がれて奥へ下がった壁（建物の明るさに掛ける）

// むき出しの鉄骨の寸法
const BAY = 4; // 柱の間隔の目安
const COL = 0.6; // 柱の太さ
const GIRDER = 0.5; // 梁の高さ
const FLANGE = 0.08; // H 形の板の厚さ
const BRACE = 0.3; // 筋交いの太さ
const REBAR = 0.12; // 鉄筋の太さ
const PEEL_DEPTH = 3; // 外壁が剥がれた所で、壁が奥へ下がる深さ

type Face = '+x' | '-x' | '+z' | '-z';
interface Out {
  solid: StageBox[]; // 建物の本体（外周のビルは当たり判定あり、遠景はなし）
  detail: StageBox[]; // 骨組み・鉄筋・窓（当たり判定なし）
  fine: boolean; // 鉄骨を H 形に組み、外壁を剥がす（近くのビルだけ）
}

const snap = (v: number) => Math.round(v * 2) / 2;
const storeys = (h: number) => Math.max(1, Math.round(h / STOREY)) * STOREY;
const put = (list: StageBox[], x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, light: number, look: StageBox['look'] = 'struct') =>
  list.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), y0: y0 || undefined, h: y1, light, look });

// ---- 崩れかけたビル ----
// 長い向きに 2〜4 本の帯に分け、帯ごとに高さを変えて、屋上の輪郭を段々に崩す。ある程度の高さまでは全部の帯が残っている。
// 高い帯の一部は、残った高さより上の外壁が抜けて、床の板（上の階ほど短く折れる）と鉄骨の骨組みだけになる。
// face を渡すと、その向きの面に階ごとの暗い窓の帯を貼る（ところどころ途切れさせる）。
// 骨組みにならなかった帯も、表の面の上の階だけ外壁が剥がれて、奥へ下がった壁の手前に鉄骨と床の縁がむき出しになることがある
function ruin(out: Out, rand: () => number, x0: number, x1: number, z0: number, z1: number, h: number, light: number, face?: Face) {
  const alongX = x1 - x0 >= z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const n = Math.max(1, Math.min(Math.floor(len / 4), 2 + Math.floor(rand() * 3)));
  const base = storeys(h * (0.3 + rand() * 0.25)); // どの帯もここまでは残る
  for (let i = 0; i < n; i++) {
    const a = snap((alongX ? x0 : z0) + (len * i) / n);
    const b = i === n - 1 ? (alongX ? x1 : z1) : snap((alongX ? x0 : z0) + (len * (i + 1)) / n);
    const [sx0, sx1, sz0, sz1] = alongX ? [a, b, z0, z1] : [x0, x1, a, b];
    const top = Math.max(base, storeys(h * (0.5 + rand() * 0.5)));
    const frame = top - base >= 2 * STOREY && rand() < 0.4;
    const solidTop = frame ? base : top;
    let windowTop = solidTop;

    if (frame) {
      put(out.solid, sx0, sx1, sz0, sz1, 0, solidTop, light);
      slabs(out, rand, alongX, sx0, sx1, sz0, sz1, base, top, light);
      skeleton(out, rand, sx0, sx1, sz0, sz1, base, top);
    } else if (face && out.fine && solidTop >= 3 * STOREY && rand() < 0.45) {
      // 剥がれた外壁: peel より上は、表の面から PEEL_DEPTH だけ奥へ下げた暗い壁にし、手前の帯に床の縁と鉄骨を残す
      const peel = STOREY * (1 + Math.floor(rand() * (solidTop / STOREY - 2)));
      const [ix0, ix1, iz0, iz1] =
        face === '-z' ? [sx0, sx1, sz0 + PEEL_DEPTH, sz1]
        : face === '+z' ? [sx0, sx1, sz0, sz1 - PEEL_DEPTH]
        : face === '-x' ? [sx0 + PEEL_DEPTH, sx1, sz0, sz1]
        : [sx0, sx1 - PEEL_DEPTH, sz0, sz1];
      const [fx0, fx1, fz0, fz1] =
        face === '-z' ? [sx0, sx1, sz0, iz0]
        : face === '+z' ? [sx0, sx1, iz1, sz1]
        : face === '-x' ? [sx0, ix0, sz0, sz1]
        : [ix1, sx1, sz0, sz1];
      put(out.solid, sx0, sx1, sz0, sz1, 0, peel, light);
      put(out.solid, ix0, ix1, iz0, iz1, peel, solidTop, light * LIGHT_INNER);
      slabs(out, rand, face === '-z' || face === '+z', fx0, fx1, fz0, fz1, peel, solidTop, light);
      skeleton(out, rand, fx0, fx1, fz0, fz1, peel, solidTop);
      windowTop = peel;
    } else {
      put(out.solid, sx0, sx1, sz0, sz1, 0, solidTop, light);
    }
    // 崩れた屋上から飛び出す鉄筋。いくらかは先が折れて垂れる
    for (let k = 0; k < 3; k++) {
      const rx = snap(sx0 + 0.5 + rand() * (sx1 - sx0 - 1));
      const rz = snap(sz0 + 0.5 + rand() * (sz1 - sz0 - 1));
      const ry = solidTop + 1 + rand() * 1.5;
      put(out.detail, rx, rx + REBAR, rz, rz + REBAR, solidTop, ry, LIGHT_REBAR);
      if (rand() < 0.4) {
        const back = rand() < 0.5;
        out.detail.push({ minX: back ? rx - 0.8 : rx, maxX: back ? rx + REBAR : rx + 0.8, minZ: rz, maxZ: rz + REBAR, y0: ry - 0.6 - REBAR, h: ry - 0.6, light: LIGHT_REBAR, look: 'struct', slope: { up: back ? '+x' : '-x', rise: 0.6 } });
      }
    }
    if (face) windows(out.detail, rand, face, sx0, sx1, sz0, sz1, windowTop);
  }
}

// 抜けた階の床の板: 柱から張り出させ、上の階ほど短く折る。折れる側は帯ごとに決める（alongX のときは x の向きに折れる）。
// 折れた先は、垂れ下がった板の切れ端か、突き出した鉄筋にする
function slabs(out: Out, rand: () => number, alongX: boolean, x0: number, x1: number, z0: number, z1: number, base: number, top: number, light: number) {
  const from = rand() < 0.5;
  const levels = (top - base) / STOREY;
  const [c0, c1] = alongX ? [x0, x1] : [z0, z1];
  const [w0, w1] = alongX ? [z0, z1] : [x0, x1]; // 折れる向きと直交する幅
  // 折れる向きの範囲 [p0, p1] と、幅の向きの範囲 [q0, q1] から箱を作る
  const box = (p0: number, p1: number, q0: number, q1: number, y0: number, y1: number, l: number, slope?: StageBox['slope']) =>
    out.detail.push(alongX
      ? { minX: p0, maxX: p1, minZ: q0, maxZ: q1, y0, h: y1, light: l, look: 'struct', slope }
      : { minX: q0, maxX: q1, minZ: p0, maxZ: p1, y0, h: y1, light: l, look: 'struct', slope });
  const toward = (pos: boolean): StageRamp['up'] => (alongX ? (pos ? '+x' : '-x') : pos ? '+z' : '-z');
  for (let k = 1; k <= levels; k++) {
    const keep = 1 - (rand() * 0.6 * k) / levels;
    const cut = snap(c0 + (c1 - c0) * keep);
    const [p0, p1] = from ? [c0, cut] : [c1 - (cut - c0), c1];
    const y = base + k * STOREY;
    box(p0, p1, w0, w1, y - SLAB, y, light + 0.1);
    if (keep > 0.97) continue;
    const e = from ? p1 : p0; // 折れた端
    const sgn = from ? 1 : -1; // 折れた端から外への向き
    if (rand() < 0.35) {
      // 垂れ下がった板: 折れた端を高い端にして、外へ下がっていく
      const l = 1.5 + rand() * 1.5;
      const rise = 1 + rand() * 1.5;
      box(Math.min(e, e + sgn * l), Math.max(e, e + sgn * l), w0 + 0.3, w1 - 0.3, y - SLAB - rise, y - rise, light + 0.05, { up: toward(!from), rise });
    } else {
      for (let r = 0; r < 4; r++) {
        const q = w0 + 0.3 + rand() * (w1 - w0 - 0.6);
        const l = 0.5 + rand() * 0.8;
        const droop = rand() < 0.5 ? 0.2 + rand() * 0.4 : 0;
        const y1 = y - SLAB / 2 - droop;
        box(Math.min(e, e + sgn * l), Math.max(e, e + sgn * l), q, q + REBAR, y1, y1 + REBAR, LIGHT_REBAR, droop ? { up: toward(!from), rise: droop } : undefined);
      }
    }
  }
}

// むき出しの鉄骨: 範囲の外周に BAY ごとの柱を立て、階ごとに柱の間へ梁を渡す。
// 柱は上の方から折れて、ところどころ途中で終わる。梁は両側の柱が残っていれば渡し、片側だけなら折れて垂れ下がる。
// ところどころの柱の間には筋交いを入れる
function skeleton(out: Out, rand: () => number, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  const nx = Math.max(1, Math.round((x1 - x0) / BAY));
  const nz = Math.max(1, Math.round((z1 - z0) / BAY));
  const xs = Array.from({ length: nx + 1 }, (_, i) => x0 + ((x1 - x0 - COL) * i) / nx);
  const zs = Array.from({ length: nz + 1 }, (_, j) => z0 + ((z1 - z0 - COL) * j) / nz);
  const levels = Math.round((y1 - y0) / STOREY);
  const tops = new Map<string, number>();
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz) continue;
      const lost = rand() < 0.45 ? 0 : 1 + Math.floor(rand() * levels);
      const top = lost ? Math.max(y0 + 0.5 + rand() * 1.5, y1 - lost * STOREY - rand() * 2) : y1;
      steel(out, xs[i], xs[i] + COL, zs[j], zs[j] + COL, y0, top, 'y');
      tops.set(`${i},${j}`, top);
    }
  }
  // 外周の柱の間 (i, j) → (i2, j2)。run は梁の伸びる向き
  const bays: [number, number, number, number, 'x' | 'z'][] = [];
  for (const j of [0, nz]) for (let i = 0; i < nx; i++) bays.push([i, j, i + 1, j, 'x']);
  for (const i of [0, nx]) for (let j = 0; j < nz; j++) bays.push([i, j, i, j + 1, 'z']);
  for (const [i, j, i2, j2, run] of bays) {
    const ta = tops.get(`${i},${j}`) ?? -Infinity;
    const tb = tops.get(`${i2},${j2}`) ?? -Infinity;
    // 梁の伸びる向きの範囲 [a, b] と、直交する向きの範囲 [c, d]
    const [a, b] = run === 'x' ? [xs[i] + COL, xs[i2]] : [zs[j] + COL, zs[j2]];
    const [c, d] = run === 'x' ? [zs[j] + 0.05, zs[j] + COL - 0.05] : [xs[i] + 0.05, xs[i] + COL - 0.05];
    const at = (p0: number, p1: number, ya: number, yb: number, slope?: StageBox['slope']) =>
      run === 'x' ? steel(out, p0, p1, c, d, ya, yb, 'x', slope) : steel(out, c, d, p0, p1, ya, yb, 'z', slope);
    const up = (pos: boolean): StageRamp['up'] => (run === 'x' ? (pos ? '+x' : '-x') : pos ? '+z' : '-z');
    const m = (c + d) / 2;
    for (let k = 1; k <= levels; k++) {
      const y = y0 + k * STOREY;
      if (ta >= y && tb >= y) {
        if (rand() < 0.85) at(a, b, y - GIRDER, y);
        if (rand() < 0.2) {
          // 筋交い: 下の階の床から梁の下まで、斜めに渡す。半分は X に組む
          const rise = STOREY - GIRDER - BRACE;
          const pos = rand() < 0.5;
          for (const dir of rand() < 0.5 ? [pos, !pos] : [pos]) {
            const slope = { up: up(dir), rise };
            out.detail.push(run === 'x'
              ? { minX: a, maxX: b, minZ: m - 0.1, maxZ: m + 0.1, y0: y - STOREY, h: y - STOREY + BRACE, light: LIGHT_STEEL, look: 'struct', slope }
              : { minX: m - 0.1, maxX: m + 0.1, minZ: a, maxZ: b, y0: y - STOREY, h: y - STOREY + BRACE, light: LIGHT_STEEL, look: 'struct', slope });
          }
        }
      } else if ((ta >= y || tb >= y) && rand() < 0.35) {
        // 片側の柱だけ残った梁: 残った柱の側を高い端にして垂らす
        const l = (b - a) * (0.4 + rand() * 0.5);
        const rise = 1 + rand() * 2;
        if (ta >= y) at(a, a + l, y - GIRDER - rise, y - rise, { up: up(false), rise });
        else at(b - l, b, y - GIRDER - rise, y - rise, { up: up(true), rise });
      }
    }
  }
}

// H 形の鋼材 1 本。run は長い向き（y は柱）。近くのビル（out.fine）だけ H 形に組み、遠景はただの箱にする
function steel(out: Out, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, run: 'x' | 'y' | 'z', slope?: StageBox['slope']) {
  const add = (a0: number, a1: number, b0: number, b1: number, c0: number, c1: number) =>
    out.detail.push({ minX: a0, maxX: a1, minZ: b0, maxZ: b1, y0: c0 || undefined, h: c1, light: LIGHT_STEEL, look: 'struct', slope });
  if (!out.fine) return void add(x0, x1, z0, z1, y0, y1);
  const t = FLANGE;
  if (run === 'y') {
    // 柱: フランジは x の両面、ウェブは z の真ん中
    const zm = (z0 + z1) / 2;
    add(x0, x0 + t, z0, z1, y0, y1);
    add(x1 - t, x1, z0, z1, y0, y1);
    add(x0, x1, zm - t / 2, zm + t / 2, y0, y1);
  } else {
    // 梁: フランジは上下、ウェブは幅の真ん中
    add(x0, x1, z0, z1, y1 - t, y1);
    add(x0, x1, z0, z1, y0, y0 + t);
    if (run === 'x') add(x0, x1, (z0 + z1) / 2 - t / 2, (z0 + z1) / 2 + t / 2, y0, y1);
    else add((x0 + x1) / 2 - t / 2, (x0 + x1) / 2 + t / 2, z0, z1, y0, y1);
  }
}

// 階ごとの窓の帯: 面からわずかに浮かせて貼る。ところどころ帯を途切れさせて、崩れた感じを出す
function windows(list: StageBox[], rand: () => number, face: Face, x0: number, x1: number, z0: number, z1: number, top: number) {
  const onX = face === '+x' || face === '-x'; // 面が x の向きを向く（帯は z に伸びる）
  const [c0, c1] = onX ? [z0, z1] : [x0, x1];
  if (c1 - c0 < 3) return;
  const plane = face === '+x' ? x1 : face === '-x' ? x0 : face === '+z' ? z1 : z0;
  const out = face[0] === '+' ? 0.05 : -0.05;
  for (let y = 0; y + STOREY <= top - 1; y += STOREY) {
    if (rand() < 0.15) continue;
    const gap = rand() < 0.35 ? snap(c0 + 1 + rand() * (c1 - c0 - 2)) : null; // 途切れる所
    const pieces: [number, number][] = gap === null ? [[c0 + 0.5, c1 - 0.5]] : [[c0 + 0.5, gap - 1], [gap + 1, c1 - 0.5]];
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 1) continue;
      if (onX) put(list, plane, plane + out, p0, p1, y + 1.2, y + 2.8, LIGHT_WINDOW);
      else put(list, p0, p1, plane, plane + out, y + 1.2, y + 2.8, LIGHT_WINDOW);
    }
  }
}

// ---- ボスが突き破って出てくるビル ----
// 奥の通りの口をふさいで建つ。真ん中の低い所は 1 階から 3 階までが吹き抜けの暗い部屋で、表を外壁でふさいである。
// ボスはその部屋に隠れて待ち、登場で外壁を突き破って飛び出してくる（enemy/boss.ts）。
// 外壁は壊れる前と後の 2 通りの箱を返す（見た目だけで、当たり判定はない）。壊れた後は 1m の区画に分けて、楕円の穴に
// かかる区画を抜く（縁は区画ごとにずらしてギザギザにする）。穴の縁の区画は薄く欠けさせ、ところどころ鉄筋を穴へ突き出す
const BREACH_W = 8; // 外壁の半幅
const BREACH_H = 12; // 外壁の高さ（部屋の天井）
const BREACH_THICK = 0.6; // 外壁の厚さ
const BREACH_ROOM = 8; // 部屋の奥行き
const BREACH_BACK = 14; // ビルの奥行き
const BREACH_TOP = 16; // 部屋の上の階の上面
const BREACH_HOLE = { y: 4.2, rx: 4.4, ry: 4.9 }; // 穴の真ん中の高さと、横・縦の半径
const BREACH_JAG = 0.5; // 穴の縁のずらし具合
const BREACH_CHIP = 0.3; // 縁の区画を欠けさせる深さ
function breachBuilding(out: Out, rand: () => number): StageBreach {
  const x0 = -(ROAD + WALK);
  const x1 = ROAD + WALK;
  const z1 = -EDGE; // 表の面
  const z0 = z1 - BREACH_BACK;
  const zr = z1 - BREACH_ROOM; // 部屋の奥の壁
  const light = 0.42;
  const dark = light * LIGHT_INNER * 0.45; // 部屋の中
  ruin(out, rand, x0, -BREACH_W, z0, z1, 24, light, '+z');
  ruin(out, rand, BREACH_W, x1, z0, z1, 20, light, '+z');
  put(out.solid, -BREACH_W, BREACH_W, z0, z1, BREACH_H, BREACH_TOP, light);
  put(out.solid, -BREACH_W, BREACH_W, z0, zr, 0, BREACH_H, dark);
  // 部屋の内張り（左右の壁と天井を暗くする）と、奥に残った柱
  put(out.detail, -BREACH_W, -BREACH_W + 0.1, zr, z1 - BREACH_THICK, 0, BREACH_H, dark);
  put(out.detail, BREACH_W - 0.1, BREACH_W, zr, z1 - BREACH_THICK, 0, BREACH_H, dark);
  put(out.detail, -BREACH_W, BREACH_W, zr, z1 - BREACH_THICK, BREACH_H - 0.1, BREACH_H, dark);
  for (const x of [-5, 4.5]) put(out.detail, x, x + COL, zr, zr + COL, 0, BREACH_H, dark * 1.3);
  put(out.detail, -BREACH_W + 0.5, BREACH_W - 0.5, z1, z1 + 0.05, BREACH_H + 1.2, BREACH_H + 2.8, LIGHT_WINDOW); // 部屋の上の階の窓
  // 壊れる前: 1 枚の外壁と、階ごとの窓の帯
  const bands = [0, 1, 2].map((k) => [k * STOREY + 1.2, k * STOREY + 2.8]);
  const intact: StageBox[] = [];
  put(intact, -BREACH_W, BREACH_W, z1 - BREACH_THICK, z1, 0, BREACH_H, light);
  for (const [b0, b1] of bands) put(intact, -BREACH_W + 0.5, BREACH_W - 0.5, z1, z1 + 0.05, b0, b1, LIGHT_WINDOW);
  // 壊れた後: 1m の区画のうち、穴にかからないものだけ残す
  const nx = BREACH_W * 2;
  const ny = BREACH_H;
  const hole = Array.from({ length: nx }, (_, i) =>
    Array.from({ length: ny }, (_, j) => {
      const u = (-BREACH_W + i + 0.5) / BREACH_HOLE.rx;
      const v = (j + 0.5 - BREACH_HOLE.y) / BREACH_HOLE.ry;
      return u * u + v * v < 1 + (rand() - 0.5) * 2 * BREACH_JAG;
    }),
  );
  const gone = (i: number, j: number) => i >= 0 && i < nx && j >= 0 && j < ny && hole[i][j];
  const broken: StageBox[] = [];
  // 残った区画（x0〜x1、高さ j）に、かかる窓の帯を貼る
  const glass = (a: number, b: number, j: number, front: number) => {
    for (const [b0, b1] of bands) {
      const y0 = Math.max(j, b0);
      const y1 = Math.min(j + 1, b1);
      const c0 = Math.max(a, -BREACH_W + 0.5);
      const c1 = Math.min(b, BREACH_W - 0.5);
      if (y1 - y0 > 0.05 && c1 - c0 > 0.05) put(broken, c0, c1, front, front + 0.05, y0, y1, LIGHT_WINDOW);
    }
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; ) {
      if (hole[i][j]) {
        i++;
        continue;
      }
      const left = gone(i - 1, j);
      const right = gone(i + 1, j);
      const below = gone(i, j - 1);
      const above = gone(i, j + 1);
      const xa = -BREACH_W + i;
      if (left || right || below || above) {
        // 穴の縁: 穴に面した側を欠けさせ、表の面も少し奥へ下げる
        const a = xa + (left ? rand() * BREACH_CHIP : 0);
        const b = xa + 1 - (right ? rand() * BREACH_CHIP : 0);
        const y0 = j + (below ? rand() * BREACH_CHIP : 0);
        const y1 = j + 1 - (above ? rand() * BREACH_CHIP : 0);
        const front = z1 - rand() * 0.25;
        put(broken, a, b, z1 - BREACH_THICK, front, y0, y1, light);
        glass(a, b, j, front);
        if (rand() < 0.35) {
          // 穴へ突き出した鉄筋
          const l = 0.4 + rand() * 0.7;
          const zz = z1 - 0.2 - rand() * 0.2;
          const yy = j + 0.2 + rand() * 0.6;
          const xx = xa + 0.2 + rand() * 0.6;
          if (left) put(broken, a - l, a, zz, zz + REBAR, yy, yy + REBAR, LIGHT_REBAR);
          else if (right) put(broken, b, b + l, zz, zz + REBAR, yy, yy + REBAR, LIGHT_REBAR);
          else if (below) put(broken, xx, xx + REBAR, zz, zz + REBAR, y0 - l, y0, LIGHT_REBAR);
          else put(broken, xx, xx + REBAR, zz, zz + REBAR, y1, y1 + l, LIGHT_REBAR);
        }
        i++;
        continue;
      }
      // 縁でない区画は、横に続く分をまとめて 1 つの箱にする
      let k = i + 1;
      while (k < nx && !hole[k][j] && !gone(k, j - 1) && !gone(k, j + 1) && !gone(k + 1, j)) k++;
      put(broken, xa, -BREACH_W + k, z1 - BREACH_THICK, z1, j, j + 1, light);
      glass(xa, -BREACH_W + k, j, z1);
      i = k;
    }
  }
  return { intact, broken, hole: { x: 0, y: BREACH_HOLE.y, rx: BREACH_HOLE.rx, ry: BREACH_HOLE.ry, z: z1 } };
}

// 傾いたビル: 2 階分ずつ積み、上の段ほど (dx, dz) の向きへずらして、傾いて見せる
function leaning(out: Out, rand: () => number, x0: number, x1: number, z0: number, z1: number, h: number, light: number, dx: number, dz: number) {
  const seg = STOREY * 2;
  for (let k = 0; k * seg < h; k++) {
    const y0 = k * seg;
    const y1 = Math.min(h, y0 + seg);
    put(out.detail, x0 + dx * k, x1 + dx * k, z0 + dz * k, z1 + dz * k, y0, y1, light);
  }
  put(out.detail, x0 + dx * 3, x0 + dx * 3 + REBAR, z0 + dz * 3 + 2, z0 + dz * 3 + 2 + REBAR, h, h + 1.5 + rand(), LIGHT_REBAR);
}

export function buildRuins(): StageLayout {
  const boxes: StageBox[] = [];
  const decor: StageBox[] = [];
  const colliders: StageLayout['colliders'] = [];
  const scenery: StageBox[] = [];
  const ramps: StageRamp[] = [];
  const lines: StageLine[] = [];
  let breach: StageBreach | undefined;
  let seed = 9173;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // ---- 外周のビル ----
  // 4 辺に、表の面を EDGE にそろえて並べる。通りの口（歩道まで）は空けて、瓦礫の山でふさぐ。
  // 左右（x の辺）は四隅まで受け持ち、前後（z の辺）は左右のビルの手前まで。ところどころ 2m の路地を空ける。
  // 1 割ほどは低く崩れ落ちたビルにして、奥の街を覗かせる
  const near: Out = { solid: boxes, detail: decor, fine: true };
  const sides: { axis: 'x' | 'z'; s: number }[] = [{ axis: 'z', s: -1 }, { axis: 'z', s: 1 }, { axis: 'x', s: -1 }, { axis: 'x', s: 1 }];
  // 辺に沿う t と、外へ向かう d から箱の範囲を作る
  const span = (axis: 'x' | 'z', s: number, t0: number, t1: number, d0: number, d1: number) =>
    axis === 'z' ? ([t0, t1, s * d0, s * d1] as const) : ([s * d0, s * d1, t0, t1] as const);
  for (const { axis, s } of sides) {
    const end = axis === 'x' ? CORNER : EDGE;
    const face: Face = axis === 'x' ? (s > 0 ? '-x' : '+x') : s > 0 ? '-z' : '+z';
    for (const dir of [-1, 1]) {
      for (let t = ROAD + WALK; t < end; ) {
        const w = Math.min(8 + 2 * Math.floor(rand() * 5), end - t);
        const depth = 12 + 2 * Math.floor(rand() * 3);
        const h = rand() < 0.12 ? 6 + Math.floor(rand() * 3) * 2 : 16 + Math.floor(rand() * 8) * 4;
        const [a, b, c, d] = span(axis, s, dir * t, dir * (t + w), EDGE, EDGE + depth);
        ruin(near, rand, Math.min(a, b), Math.max(a, b), Math.min(c, d), Math.max(c, d), h, 0.3 + rand() * 0.3, face);
        t += w + (rand() < 0.3 ? 2 : 0);
      }
    }
    // 奥の通りの口は、ボスが突き破って出てくるビルでふさぐ
    if (axis === 'z' && s < 0) {
      breach = breachBuilding(near, rand);
      continue;
    }
    // 通りの口の瓦礫の山: 外へ行くほど高く積む（手前はよじ登れる高さ）。上に倒れた床の板を 1 枚斜めに載せる
    for (let t = -(ROAD + WALK); t < ROAD + WALK; ) {
      const w = Math.min(3 + Math.floor(rand() * 5) * 0.5, ROAD + WALK - t);
      for (let k = 0; k < 4; k++) {
        const d0 = EDGE - 2 + k * 3 + snap(rand());
        const hgt = snap(1.5 + k * 1.8 + rand() * 1.5);
        const [a, b, c, d] = span(axis, s, t, t + w, d0, d0 + 3 + snap(rand() * 2));
        put(boxes, a, b, c, d, 0, hgt, LIGHT_RUBBLE, 'terrain');
      }
      t += w;
    }
    // 瓦礫の山に突き刺さった鉄骨: 外へ向かって斜めに上る 2 本と、上に横倒しの 1 本
    const outward = axis === 'z' ? (s > 0 ? '+z' : '-z') : s > 0 ? '+x' : '-x';
    for (let g = 0; g < 2; g++) {
      const t = snap((rand() * 2 - 1) * (ROAD - 1));
      const [a, b, c, d] = span(axis, s, t, t + 0.5, EDGE - 1, EDGE + 7);
      const y = 1 + rand();
      steel(near, Math.min(a, b), Math.max(a, b), Math.min(c, d), Math.max(c, d), y, y + GIRDER, axis, { up: outward, rise: 4 + rand() * 1.5 });
    }
    {
      const t = (rand() * 2 - 1) * (ROAD - 8) - 4;
      const [a, b, c, d] = span(axis, s, t, t + 9, EDGE + 5, EDGE + 5.5);
      const along = axis === 'z' ? (rand() < 0.5 ? '+x' : '-x') : rand() < 0.5 ? '+z' : '-z';
      steel(near, Math.min(a, b), Math.max(a, b), Math.min(c, d), Math.max(c, d), 5.5, 5.5 + GIRDER, axis === 'z' ? 'x' : 'z', { up: along, rise: 2 });
    }
    const tilt = rand() < 0.5 ? -1 : 1;
    const [a, b, c, d] = span(axis, s, tilt * 2, tilt * 9, EDGE + 1, EDGE + 7);
    decor.push({
      minX: Math.min(a, b), maxX: Math.max(a, b), minZ: Math.min(c, d), maxZ: Math.max(c, d), y0: 3, h: 3.5, light: LIGHT_SLAB_DEBRIS, look: 'terrain',
      slope: { up: axis === 'z' ? (s > 0 ? '+z' : '-z') : s > 0 ? '+x' : '-x', rise: 4 },
    });
  }

  // ---- 遠景の街 ----
  // 外周のビルの外に、街区ごとに 1 棟ずつ、霧の奥まで並べる。通り（真ん中の列）は空ける。何棟かは傾ける
  const far: Out = { solid: scenery, detail: scenery, fine: false };
  for (const cx of FAR_CELLS) {
    for (const cz of FAR_CELLS) {
      if (Math.max(Math.abs(cx), Math.abs(cz)) < FAR_NEAR || cx === 0 || cz === 0) continue;
      const hw = 6 + Math.floor(rand() * 4);
      const hd = 6 + Math.floor(rand() * 4);
      const x0 = cx - hw + Math.floor(rand() * 3) - 1;
      const z0 = cz - hd + Math.floor(rand() * 3) - 1;
      const light = 0.26 + rand() * 0.3;
      const r = rand();
      if (r < 0.07) {
        const lean = rand() < 0.5 ? 0.8 : -0.8;
        leaning(far, rand, x0, x0 + hw * 2, z0, z0 + hd * 2, 30 + Math.floor(rand() * 4) * 8, light, rand() < 0.5 ? lean : 0, rand() < 0.5 ? lean : 0);
      } else {
        const h = r < 0.2 ? 6 + Math.floor(rand() * 3) * 4 : 20 + Math.floor(rand() * 10) * 5;
        ruin(far, rand, x0, x0 + hw * 2, z0, z0 + hd * 2, h, light);
      }
    }
  }

  // 広場の中には何も置かない（柱はボスが外のビルからもぎ取って投げ込む）

  return {
    boxes,
    ramps,
    decor,
    colliders,
    scenery,
    lines,
    // 外周のビルの表の面より 1m 外まで（瓦礫の山にも少し登れる）
    bounds: { minX: -EDGE - 1, maxX: EDGE + 1, minZ: -EDGE - 1, maxZ: EDGE + 1 },
    start: { x: 0, y: 0, z: 30 },
    // ボスが呼ぶ増援の出る所。広場の四隅と左右の外周寄り（通りの口の瓦礫の山と、奥の突き破る外壁の前は避ける）
    enemySpawns: [
      { x: -28, y: 0, z: -28 }, { x: 28, y: 0, z: -28 }, { x: -28, y: 0, z: 28 }, { x: 28, y: 0, z: 28 },
      { x: -33, y: 0, z: -16 }, { x: 33, y: 0, z: -16 }, { x: -33, y: 0, z: 18 }, { x: 33, y: 0, z: 18 },
    ],
    // 広場の奥寄りの真ん中にボスを立たせ、始めの位置の方を向かせる
    boss: { x: 0, z: -14, breach },
    // 手前の左の空き地の上から、広場を挟んで奥の右の崩れたビル街を見る
    view: { eye: { x: -30, y: 12, z: 36 }, target: { x: 12, y: 9, z: -30 } },
  };
}

// ---- ステージ: LIFT（昇り続けるリフト） ----
// 四角い縦穴（シャフト）の中を、柵で囲った広い荷物用リフトが昇り続ける。プレイヤーはリフトの上で戦う。
// シャフトの壁には、ところどころ足場が張り出していて、敵はまだ上にある足場に現れ、リフトが追いつくと飛び乗ってくる。
// 壁にはパイプ・ダクト・ケーブルの棚・ガイドレール・明かりと、各階の乗り場の扉が並び、それが下へ流れていくことで昇っていると分かる。
// リフトは動かさず、シャフトを流して見せる（world/shaft.ts）。シャフトの箱の y は、高さ PERIOD の区切りの中の高さで書く
import type { StageLayout, StageBox, StageShaftLedge } from './stage.js';

const LIFT = 13; // リフトの床の半幅（柵の内側。動ける範囲）
const DECK = LIFT + 0.4; // 床の板の半幅
const WALL = LIFT + 4.5; // シャフトの壁の内面 (|x|, |z|)
const WALL_T = 1;
const PERIOD = 36; // シャフトの区切りの高さ
const SPEED = 3.5; // 昇る速さ (m/s)
const FRAME_Y = 7; // リフトの上枠の高さ
const RAIL_IN = WALL - 0.9; // ガイドレールの先（|x|）
const CABLE_TOP = 220; // 吊りケーブルを伸ばす高さ（霧に溶けきる）

// 足場
const LEDGE_LEN = 4; // 壁に沿う長さ
const LEDGE_IN = WALL - 2.4; // 足場の先の縁（|x| か |z|）
const LEDGE_STAND = WALL - 1.8; // 敵が立つ所
const LEDGE_LAND = LIFT - 2; // 飛び乗る先（リフトの真ん中からの距離）

// 明るさ（0 が黒）
const LIGHT_WALL = 0.72;
const LIGHT_DECK = 0.8;
const LIGHT_UNDER = 0.42;
const LIGHT_FRAME = 0.5;
const LIGHT_RAIL = 0.32; // 柵・ガイドレール・ケーブル
const LIGHT_BAND = 0.56; // 各階の床の帯
const LIGHT_DOOR = 0.12;
const LIGHT_FRAME_DOOR = 0.6;
const LIGHT_PIPE = 0.4;
const LIGHT_DUCT = 0.62;
const LIGHT_LEDGE = 0.6;
const LIGHT_LAMP = 0.97;
const LIGHT_PANEL = 0.66; // 柱形・配電盤
const LIGHT_DARK = 0.18; // 縞・表示の板・開口の奥
const LIGHT_SIGN = 0.85; // 表示の板の文字の代わりの帯

type Side = '-z' | '+z' | '-x' | '+x';

export function buildLift(): StageLayout {
  const boxes: StageBox[] = [];
  const decor: StageBox[] = [];
  const scenery: StageBox[] = [];
  const walls: StageBox[] = [];
  const tile: StageBox[] = [];
  const ledges: StageShaftLedge[] = [];
  const rect = (x0: number, x1: number, z0: number, z1: number) => ({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
  const put = (list: StageBox[]) => (x0: number, x1: number, z0: number, z1: number, y0: number, h: number, light: number, look: StageBox['look'] = 'struct', shape?: StageBox['shape']) =>
    list.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look, shape });
  const box = put(boxes);
  const deco = put(decor);
  const part = put(tile);
  // 壁ぎわの物を、壁の向きを問わずに書く: a は壁に沿う向きの範囲、d は壁の内面からの張り出し（0 が壁の面）
  const onWall = (side: Side, a0: number, a1: number, d0: number, d1: number, y0: number, h: number, light: number, look: StageBox['look'] = 'struct', shape?: StageBox['shape']) => {
    const s = side[0] === '-' ? -1 : 1;
    const n0 = s * (WALL - d0);
    const n1 = s * (WALL - d1);
    if (side[1] === 'z') part(a0, a1, n0, n1, y0, h, light, look, shape);
    else part(n0, n1, a0, a1, y0, h, light, look, shape);
  };
  const SIDES: Side[] = ['-z', '+z', '-x', '+x'];

  // ---- リフト（動かさない） ----
  deco(-DECK, DECK, -DECK, DECK, -0.5, 0, LIGHT_DECK); // 床の板。上面がプレイヤーの立つ床（y = 0）
  deco(-LIFT, LIFT, -LIFT, LIFT, -1.6, -0.5, LIGHT_UNDER); // 床の下の枠
  for (const s of [-1, 1]) {
    deco(-LIFT, LIFT, s * (LIFT - 0.4), s * LIFT, -2.2, -1.6, LIGHT_UNDER); // 床の下の梁
    deco(s * (LIFT - 0.4), s * LIFT, -LIFT, LIFT, -2.2, -1.6, LIGHT_UNDER);
  }
  // 柵: 3m ほどおきの支柱と、上と真ん中の横棒（越えられないのは動ける範囲で止める）
  const FENCE = LIFT + 0.25;
  const POSTS = Math.round((2 * LIFT) / 3);
  for (const s of [-1, 1]) {
    for (let k = 0; k <= POSTS; k++) {
      const a = -LIFT + (2 * LIFT * k) / POSTS;
      deco(a - 0.08, a + 0.08, s * FENCE - 0.08, s * FENCE + 0.08, 0, 1.1, LIGHT_RAIL);
      deco(s * FENCE - 0.08, s * FENCE + 0.08, a - 0.08, a + 0.08, 0, 1.1, LIGHT_RAIL);
    }
    for (const [y0, y1] of [[1.02, 1.1], [0.5, 0.56]]) {
      deco(-FENCE, FENCE, s * FENCE - 0.05, s * FENCE + 0.05, y0, y1, LIGHT_RAIL);
      deco(s * FENCE - 0.05, s * FENCE + 0.05, -FENCE, FENCE, y0, y1, LIGHT_RAIL);
    }
  }
  // 四隅の柱と上枠。上枠の真ん中を横切る梁が左右のガイドレールまで届き、その上に巻き上げの台とケーブルが乗る
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (LIFT - 0.6), sx * LIFT, sz * (LIFT - 0.6), sz * LIFT, 0, FRAME_Y + 0.5, LIGHT_FRAME);
  for (const s of [-1, 1]) {
    deco(-LIFT, LIFT, s * (LIFT - 0.5), s * LIFT, FRAME_Y, FRAME_Y + 0.5, LIGHT_FRAME);
    deco(s * (LIFT - 0.5), s * LIFT, -LIFT, LIFT, FRAME_Y, FRAME_Y + 0.5, LIGHT_FRAME);
    // ガイドレールをつかむ腕（上と下）
    deco(s * LIFT, s * (RAIL_IN - 0.3), -0.4, 0.4, FRAME_Y, FRAME_Y + 0.6, LIGHT_FRAME);
    deco(s * LIFT, s * (RAIL_IN - 0.3), -0.4, 0.4, -1.4, -0.6, LIGHT_UNDER);
    deco(s * (RAIL_IN - 0.3), s * (RAIL_IN - 0.05), -0.5, 0.5, -1.6, -0.4, LIGHT_RAIL);
    deco(s * (RAIL_IN - 0.3), s * (RAIL_IN - 0.05), -0.5, 0.5, FRAME_Y - 0.2, FRAME_Y + 0.8, LIGHT_RAIL);
    // 上枠の明かり
    deco(-1.5, 1.5, s * (LIFT - 0.45), s * (LIFT - 0.15), FRAME_Y - 0.12, FRAME_Y, LIGHT_LAMP, 'plain');
    deco(s * (LIFT - 0.45), s * (LIFT - 0.15), -4.5, -1.5, FRAME_Y - 0.12, FRAME_Y, LIGHT_LAMP, 'plain');
    deco(s * (LIFT - 0.45), s * (LIFT - 0.15), 1.5, 4.5, FRAME_Y - 0.12, FRAME_Y, LIGHT_LAMP, 'plain');
  }
  deco(-LIFT, LIFT, -0.4, 0.4, FRAME_Y, FRAME_Y + 0.6, LIGHT_FRAME); // 横切る梁
  deco(-1, 1, -1, 1, FRAME_Y + 0.6, FRAME_Y + 1.6, LIGHT_UNDER); // 巻き上げの台
  // 吊りケーブル。高く伸びきるまで待つと操作を返すのが遅れるので、遠景として組む
  for (const x of [-0.5, 0, 0.5]) put(scenery)(x - 0.06, x + 0.06, -0.06, 0.06, FRAME_Y + 1.6, CABLE_TOP, LIGHT_RAIL);

  // ---- シャフトの壁（区切り 1 つ分） ----
  for (const s of [-1, 1]) {
    walls.push({ ...rect(-WALL - WALL_T, WALL + WALL_T, s * WALL, s * (WALL + WALL_T)), y0: 0, h: PERIOD, light: LIGHT_WALL, look: 'struct' });
    walls.push({ ...rect(s * WALL, s * (WALL + WALL_T), -WALL, WALL), y0: 0, h: PERIOD, light: LIGHT_WALL, look: 'struct' });
  }

  // ---- 壁ぎわの物（区切り 1 つ分） ----
  // 各階の床の帯（4 面）と乗り場の扉: 区切りの下端に -z の面、半分の高さに +z の面
  for (const [y, side] of [[0, '-z'], [PERIOD / 2, '+z']] as const) {
    for (const s of SIDES) onWall(s, -WALL, WALL, 0, 0.4, y - 0.8, y, LIGHT_BAND);
    onWall(side, -2.2, 2.2, 0.4, 0.55, y, y + 0.12, LIGHT_BAND); // 敷居
    onWall(side, -2, 2, 0, 0.15, y, y + 4, LIGHT_FRAME_DOOR); // 枠
    onWall(side, -1.5, 1.5, 0.15, 0.2, y + 0.05, y + 3.5, LIGHT_DOOR); // 閉じた扉
  }
  // ガイドレール（±x の面の真ん中）。3m おきに留め金
  for (const side of ['-x', '+x'] as const) {
    onWall(side, -0.12, 0.12, 0, WALL - RAIL_IN, 0, PERIOD, LIGHT_RAIL);
    for (let y = 1; y < PERIOD; y += 3) onWall(side, -0.5, 0.5, 0, 0.5, y, y + 0.3, LIGHT_RAIL);
  }
  // +x: 縦に 2 本並んだ配管。3m おきに継ぎ目のつば
  for (const a of [8.5, 9.3]) {
    onWall('+x', a - 0.25, a + 0.25, 0, 0.5, 0, PERIOD, LIGHT_PIPE);
    for (let y = 2; y < PERIOD; y += 3) onWall('+x', a - 0.35, a + 0.35, 0, 0.65, y, y + 0.15, LIGHT_RAIL);
  }
  // -x: 太いダクト。4m おきに継ぎ目の帯
  onWall('-x', -9, -6.6, 0, 1.1, 0, PERIOD, LIGHT_DUCT);
  for (let y = 0.5; y < PERIOD; y += 4) onWall('-x', -9.1, -6.5, 0, 1.2, y, y + 0.25, LIGHT_PIPE);
  // +z: ケーブルの棚。1m おきの段
  onWall('+z', -11.7, -11.6, 0, 0.5, 0, PERIOD, LIGHT_RAIL);
  onWall('+z', -10.8, -10.7, 0, 0.5, 0, PERIOD, LIGHT_RAIL);
  for (let y = 0.5; y < PERIOD; y += 1) onWall('+z', -11.7, -10.7, 0.1, 0.4, y, y + 0.06, LIGHT_RAIL);
  // 横に走る配管（-z に 2 本、+z に 1 本）と、それを留める金具
  for (const [side, y] of [['-z', 8], ['-z', 8.8], ['+z', 26]] as const) {
    onWall(side, -WALL, WALL, 0.05, 0.65, y, y + 0.6, LIGHT_PIPE, 'struct', side[1] === 'z' ? 'octagonX' : 'octagonZ');
    for (let a = -15; a <= 15; a += 5) onWall(side, a - 0.1, a + 0.1, 0, 0.7, y - 0.15, y + 0.75, LIGHT_RAIL);
  }
  // 壁の明かり
  for (const [side, a, y] of [['-z', 10.4, 4], ['-z', -11.7, 23], ['+x', -11.7, 12], ['+x', 13, 30], ['+z', 5.2, 21], ['+z', 11.7, 3], ['-x', 11.7, 28], ['-x', -13, 15]] as const) {
    onWall(side, a - 0.6, a + 0.6, 0, 0.15, y, y + 0.3, LIGHT_LAMP, 'plain');
  }
  // 壁の両端寄りの柱形。6m おきに留め金
  for (const s of SIDES) {
    for (const a of [-15, 15]) {
      onWall(s, a - 0.35, a + 0.35, 0, 0.45, 0, PERIOD, LIGHT_PANEL);
      for (let y = 3; y < PERIOD; y += 6) onWall(s, a - 0.45, a + 0.45, 0, 0.6, y, y + 0.2, LIGHT_PIPE);
    }
  }
  // 乗り場の床の帯の、扉の前の縞と、扉の横の階の表示と呼びボタン
  for (const [y, side, signA] of [[0, '-z', 3.4], [PERIOD / 2, '+z', -3.4]] as const) {
    for (let a = -3; a < 3; a += 0.5) onWall(side, a, a + 0.25, 0.4, 0.43, y - 0.8, y, LIGHT_DARK);
    onWall(side, signA - 0.8, signA + 0.8, 0, 0.06, y + 2.2, y + 3.4, LIGHT_DARK);
    onWall(side, signA - 0.5, signA + 0.5, 0.06, 0.08, y + 2.7, y + 2.9, LIGHT_SIGN);
    const bA = signA > 0 ? 2.45 : -2.45;
    onWall(side, bA - 0.12, bA + 0.12, 0, 0.05, y + 1.1, y + 1.5, LIGHT_PANEL);
    onWall(side, bA - 0.05, bA + 0.05, 0.05, 0.08, y + 1.25, y + 1.35, LIGHT_LAMP, 'plain');
  }
  // 配電盤: 箱と、上に並ぶ表示灯、下の通気口
  for (const [side, a, y, w, h] of [['-z', -13, 12, 1.4, 1.8], ['-z', -11.2, 12.3, 0.9, 1.2], ['-z', 9.7, 27, 1.2, 1.6], ['+x', -12.3, 20, 1.2, 1.6], ['-x', 10.4, 4, 1.4, 1.8], ['+z', -7.2, 23, 1.2, 1.6]] as const) {
    onWall(side, a - w / 2, a + w / 2, 0, 0.3, y, y + h, LIGHT_PANEL);
    onWall(side, a - 0.02, a + 0.02, 0.3, 0.32, y + 0.1, y + h - 0.1, LIGHT_DARK); // 扉の合わせ目
    for (const k of [-1, 1]) onWall(side, a + k * 0.2 - 0.05, a + k * 0.2 + 0.05, 0.3, 0.34, y + h - 0.25, y + h - 0.15, LIGHT_LAMP, 'plain');
    onWall(side, a - w / 2 + 0.15, a + w / 2 - 0.15, 0.3, 0.32, y + 0.15, y + 0.35, LIGHT_DARK);
  }
  // 通気口: 暗い開口に横の羽根
  for (const [side, a, y, w, h] of [['-z', 0, 28, 2.4, 1.2], ['-x', -12.3, 9, 1.6, 1.6], ['+x', 13, 4, 1.6, 1.2]] as const) {
    onWall(side, a - w / 2 - 0.1, a + w / 2 + 0.1, 0, 0.05, y - 0.1, y + h + 0.1, LIGHT_PANEL);
    onWall(side, a - w / 2, a + w / 2, 0.05, 0.06, y, y + h, LIGHT_DARK);
    for (let v = y + 0.1; v < y + h; v += 0.2) onWall(side, a - w / 2, a + w / 2, 0.06, 0.12, v, v + 0.06, LIGHT_PIPE);
  }
  // -z: 細い電線管 2 本
  for (const a of [13, 13.4]) onWall('-z', a - 0.06, a + 0.06, 0, 0.15, 0, PERIOD, LIGHT_RAIL);
  // +z: はしご
  for (const a of [13, 13.6]) onWall('+z', a - 0.04, a + 0.04, 0, 0.25, 0, PERIOD, LIGHT_RAIL);
  for (let y = 0.2; y < PERIOD; y += 0.35) onWall('+z', 13, 13.6, 0.15, 0.2, y, y + 0.04, LIGHT_RAIL);
  // +z: 換気扇（丸い枠と、暗い羽根の奥、十字の羽根と軸）
  onWall('+z', 9.2, 11.6, 0, 0.5, 7.8, 10.2, LIGHT_FRAME, 'struct', 'octagonZ');
  onWall('+z', 9.5, 11.3, 0.5, 0.52, 8.1, 9.9, LIGHT_DARK, 'struct', 'octagonZ');
  onWall('+z', 9.55, 11.25, 0.52, 0.56, 8.95, 9.05, LIGHT_DUCT);
  onWall('+z', 10.35, 10.45, 0.52, 0.56, 8.15, 9.85, LIGHT_DUCT);
  onWall('+z', 10.15, 10.65, 0.5, 0.62, 8.75, 9.25, LIGHT_DUCT, 'struct', 'octagonZ');
  // +x: 縦の配管の弁（ハンドル）
  onWall('+x', 8.85, 8.95, 0.5, 0.58, 15.3, 15.4, LIGHT_RAIL);
  onWall('+x', 8.55, 9.25, 0.58, 0.64, 15, 15.7, LIGHT_RAIL, 'struct', 'octagonX');
  // -x: ダクトから横へ分かれる枝。継ぎ目の帯と、壁へ入る所の枠
  onWall('-x', -6.6, -1.2, 0, 0.9, 24, 25.2, LIGHT_DUCT);
  onWall('-x', -2.6, -2.4, 0, 1, 23.9, 25.3, LIGHT_PIPE);
  onWall('-x', -1.4, -1.2, 0, 1.05, 23.85, 25.35, LIGHT_PIPE);

  // ---- 足場 ----
  // 壁から張り出した鉄の床。下に梁と方杖、両端に手すり（リフト側は開いていて、敵はここから飛び乗る）
  const ledge = (side: Side, a: number, y: number) => {
    const depth = WALL - LEDGE_IN;
    onWall(side, a - LEDGE_LEN / 2, a + LEDGE_LEN / 2, 0, depth, y - 0.2, y, LIGHT_LEDGE);
    for (const e of [-1, 1]) {
      const ea = a + e * (LEDGE_LEN / 2 - 0.2);
      onWall(side, ea - 0.08, ea + 0.08, 0, depth, y - 0.5, y - 0.2, LIGHT_RAIL); // 梁
      onWall(side, ea - 0.08, ea + 0.08, 0, 0.6, y - 1.6, y - 0.5, LIGHT_RAIL); // 方杖
      onWall(side, ea - 0.08, ea + 0.08, 1.2, 1.3, y - 1.1, y - 0.5, LIGHT_RAIL);
      const ra = a + e * (LEDGE_LEN / 2 - 0.05);
      onWall(side, ra - 0.04, ra + 0.04, 0, depth - 0.1, y + 1, y + 1.08, LIGHT_RAIL); // 手すり
      for (const d of [1.2, depth - 0.1]) onWall(side, ra - 0.04, ra + 0.04, d - 0.08, d, y, y + 1.08, LIGHT_RAIL);
    }
    const s = side[0] === '-' ? -1 : 1;
    const land = Math.max(-LEDGE_LAND, Math.min(LEDGE_LAND, a * 0.8));
    ledges.push(side[1] === 'z'
      ? { x: a, z: s * LEDGE_STAND, y, along: 'x', to: { x: land, z: s * LEDGE_LAND } }
      : { x: s * LEDGE_STAND, z: a, y, along: 'z', to: { x: s * LEDGE_LAND, z: land } });
  };
  // 4 面に 2 つずつ、高さを 4〜5m ずつずらして置く（どの高さにも近くに足場がある）
  ledge('-z', -7.8, 4);
  ledge('+x', -7.8, 9);
  ledge('+z', 3.9, 13);
  ledge('-x', 5.2, 18);
  ledge('-z', 6.5, 22);
  ledge('+x', 4.5, 27);
  ledge('+z', -6.5, 31);
  ledge('-x', 11, 35);

  // 弾や投げた物が抜けていかないよう、壁の当たり判定だけを置く（壁は平らなので流しても形が変わらない）
  const colliders: StageLayout['colliders'] = [];
  for (const s of [-1, 1]) {
    colliders.push({ ...rect(-WALL - WALL_T, WALL + WALL_T, s * WALL, s * (WALL + WALL_T)), y0: -100, h: 400 });
    colliders.push({ ...rect(s * WALL, s * (WALL + WALL_T), -WALL, WALL), y0: -100, h: 400 });
  }

  return {
    boxes,
    decor,
    colliders,
    scenery,
    lines: [],
    bounds: { minX: -LIFT, maxX: LIFT, minZ: -LIFT, maxZ: LIFT },
    start: { x: 0, y: 0, z: 4 },
    // 足場に乗せられないときだけ使う、リフトの上の出現位置
    enemySpawns: [{ x: -7, y: 0, z: -7 }, { x: 7, y: 0, z: -7 }, { x: -7, y: 0, z: 7 }, { x: 7, y: 0, z: 7 }],
    shaft: { period: PERIOD, speed: SPEED, inner: WALL, walls, tile, ledges },
    // 近接が主役。優しい難易度ほど銃撃役を多くして、hard ではほとんどストライカーにする
    mix: {
      easy: { gunner: 0.7, striker: 0.3 },
      normal: { gunner: 0.4, striker: 0.6 },
      hard: { gunner: 0.2, striker: 0.8 },
    },
    view: { eye: { x: 10, y: 19, z: 15 }, target: { x: 0, y: 1, z: -4 } },
  };
}

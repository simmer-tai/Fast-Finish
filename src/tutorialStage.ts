import type { StageLayout, StageBox, StageLine } from './stage.js';

// 床の段差、ダッシュで渡る切れ目、低い通路、壁走りで渡る切れ目を順番に越えるコース。
// 足場の高さと目印の位置は tutorial.ts の課題と合わせる
const HALF = 5; // コースの幅の半分（動ける範囲）
const LOW = 5; // 始めの床
const MID = 8.8; // ジャンプで登る段
const TOP = 13.4; // 二段ジャンプで登る段から先
const RAIL_H = 1.1; // 縁の手すりの高さ
const LIGHT_FLOOR = 0.7;
const LIGHT_RAIL = 0.4;
const LIGHT_FRAME = 0.3;

export function buildTutorial(): StageLayout {
  const boxes: StageBox[] = [];
  const decor: StageBox[] = [];
  const scenery: StageBox[] = [];
  const lines: StageLine[] = [];
  const box = (list: StageBox[], minX: number, maxX: number, minZ: number, maxZ: number, y0: number, h: number, light: number, look: StageBox['look'] = 'struct') =>
    list.push({ minX, maxX, minZ, maxZ, y0: y0 || undefined, h, light, look });
  // 片側の脇の x の範囲。inset だけ内へ食い込ませると、手すりと面が重ならない
  const side = (s: number, w: number, inset = 0) => (s > 0 ? [HALF - inset, HALF + w] : [-HALF - w, -HALF + inset]) as [number, number];
  // 床の帯（z の向きに横切る線）
  const stripe = (z: number, y: number) => lines.push({ x: 0, y: y + 0.03, z, w: 2 * HALF - 0.6, d: 0.25 });

  // ---- 足場 ----
  // 段差は切れ目を空けずに続け、跳んで縁に手をかければ登れるようにする
  const floors = [
    { minZ: -12, maxZ: 8, h: LOW },
    { minZ: -21, maxZ: -12, h: MID },
    { minZ: -38, maxZ: -21, h: TOP },
    { minZ: -94, maxZ: -51, h: TOP },
    { minZ: -152, maxZ: -119, h: TOP, railFrom: -126 }, // 奥は練習場の壁で囲む
  ];
  for (const f of floors) {
    box(boxes, -HALF, HALF, f.minZ, f.maxZ, 0, f.h, LIGHT_FLOOR, 'terrain');
    // 両脇の手すり（動ける範囲の外にあるので、見た目だけでよい）
    for (const s of [-1, 1]) box(decor, ...side(s, 0.4), f.railFrom ?? f.minZ, f.maxZ, f.h, f.h + RAIL_H, LIGHT_RAIL);
  }
  // 始めの床の後ろの壁
  box(decor, -HALF - 0.4, HALF + 0.4, 8, 8.6, LOW, LOW + 4, LIGHT_RAIL);
  // 段差の上の縁と、切れ目の手前の縁に帯を引く
  stripe(-12.3, MID);
  stripe(-21.3, TOP);
  stripe(-37.6, TOP);
  stripe(-51.4, TOP);
  stripe(-93.6, TOP);
  stripe(-119.4, TOP);

  // ---- ダッシュ ----
  // 上を低くし、跳んで渡る代わりに床から飛び出して渡る。天井は両脇の柱で支える
  box(boxes, -HALF, HALF, -51, -24, 15.3, 16.8, 0.53);
  for (const s of [-1, 1]) {
    const [x0, x1] = side(s, 0.6, 0.05);
    for (const z of [-24, -37.4, -51.6]) box(decor, x0, x1, z - 0.6, z, 0, 17.4, LIGHT_FRAME);
    // 天井の縁の梁
    box(decor, x0, x1, -51.6, -24, 16.8, 17.4, LIGHT_FRAME);
  }

  // ---- スライディング ----
  // 立ったままでは通れない。上にも登れない高さにする。両脇の枠で門にする
  box(boxes, -HALF, HALF, -75, -72, 14.35, 20.8, 0.45);
  for (const s of [-1, 1]) box(decor, ...side(s, 0.8, 0.05), -75.4, -71.6, TOP, 21.4, LIGHT_FRAME);
  box(decor, -HALF - 0.8, HALF + 0.8, -75.4, -71.6, 20.8, 21.4, LIGHT_FRAME);
  stripe(-70.5, TOP);
  stripe(-76.5, TOP);

  // ---- 壁走り ----
  // 足場の端から向こう岸まで、壁に沿って走れる。走る高さに明るい帯を引き、裏に骨組みを付ける。
  // 切れ目は走って跳ぶだけでは届かない長さ（25m）にする（この課題の間はダッシュを使えなくする。tutorial.ts）
  box(boxes, -HALF, -4, -121, -90, 0, 22, 0.5);
  box(decor, -4, -3.97, -119, -92, TOP + 1.3, TOP + 1.6, 0.95);
  for (let z = -90; z > -121; z -= 5.5) box(decor, -HALF - 0.5, -HALF, Math.max(z - 0.5, -121), z, 0, 22, LIGHT_FRAME);
  box(decor, -HALF - 0.5, -3.8, -121.4, -89.6, 22, 22.4, LIGHT_FRAME);

  // ---- 武器の練習場 ----
  // 奥と両脇を高い壁で囲み、的の立つ所に枠を引く
  box(decor, -HALF - 0.6, HALF + 0.6, -152.6, -152, TOP, TOP + 6, LIGHT_RAIL);
  for (const s of [-1, 1]) box(decor, ...side(s, 0.6), -152, -126, TOP, TOP + 6, LIGHT_RAIL);
  for (const z of [-134, -142]) lines.push({ x: 0, y: TOP + 0.03, z, w: 8, d: 0.25 });
  for (const x of [-4, 4]) lines.push({ x, y: TOP + 0.03, z: -138, w: 0.25, d: 8 });

  // ---- 遠景 ----
  // コースの両脇の遠くに、高さのそろわない塔を並べる
  let seed = 4127;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const s of [-1, 1]) {
    for (let z = 20; z > -190; z -= 14 + rand() * 10) {
      const x0 = s * (22 + rand() * 30);
      const w = 6 + rand() * 8;
      box(scenery, Math.min(x0, x0 + s * w), Math.max(x0, x0 + s * w), z - 6 - rand() * 6, z, 0, 12 + rand() * 36, 0.25 + rand() * 0.25);
    }
  }

  return {
    boxes, decor, colliders: [], scenery, lines,
    bounds: { minX: -HALF, maxX: HALF, minZ: -152, maxZ: 8 },
    start: { x: 0, y: LOW, z: 4 }, enemySpawns: [],
    view: { eye: { x: 8, y: 13, z: 12 }, target: { x: 0, y: 5, z: -15 } },
  };
}

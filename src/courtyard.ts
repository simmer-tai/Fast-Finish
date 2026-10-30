import type { StageBox, StageLayout, StageRamp } from './stage.js';

// 門の向こうへ抜ける軸と、左右から高台へ回り込める中庭。
export function buildCourtyard(): StageLayout {
  const boxes: StageBox[] = [], decor: StageBox[] = [];
  const ramps: StageRamp[] = [];
  const box = (list: StageBox[], minX: number, maxX: number, minZ: number, maxZ: number, y0: number, h: number, light: number) =>
    list.push({ minX, maxX, minZ, maxZ, y0, h, light, look: 'struct' });
  box(boxes, -31, -29, -48, 18, 0, 12, .48);
  box(boxes, 29, 31, -48, 18, 0, 12, .48);
  box(boxes, -31, -9, -48, -46, 0, 16, .53);
  box(boxes, 9, 31, -48, -46, 0, 16, .53);
  box(decor, -10, 10, -48, -46, 14, 17, .72);
  box(decor, -12, 12, -49, -45, 17, 18, .4);
  box(boxes, -31, 31, 17, 19, 0, 8, .48);
  box(boxes, -11, 11, -43, -34, 0, 2, .72);
  box(boxes, -7, 7, -43, -38, 2, 4, .8);
  box(boxes, -3, 3, -43, -40, 4, 6, .88);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -27 : 20, x1 = side < 0 ? -20 : 27;
    box(boxes, x0, x1, -38, 4, 0, 3, .65);
    ramps.push({ minX: x0, maxX: x1, minZ: 4, maxZ: 13, y0: 0, h: 3, up: '-z', light: .7, look: 'struct' });
    for (const z of [-35, -25, -15, -5]) {
      const a = side < 0 ? -27 : 25;
      box(boxes, a, a + 2, z, z + 2, 3, 11, .62);
      box(decor, a - .4, a + 2.4, z - .4, z + 2.4, 10.5, 11.5, .8);
    }
    box(decor, side < 0 ? -27 : 25, side < 0 ? -25 : 27, -36, -3, 11, 12, .55);
    for (const z of [-33, -23, -13]) box(boxes, side < 0 ? -20.5 : 19.5, side < 0 ? -19.5 : 20.5, z, z + 6, 3, 4, .78);
  }
  box(boxes, -1.5, 1.5, -27, -24, 0, 5, .3);
  box(decor, -2, 2, -27.5, -23.5, 5, 5.5, .85);
  for (const [x, z, h] of [[-12, -17, 1.5], [11, -11, 2], [-10, -31, 1], [12, -30, 1.5]])
    box(boxes, x - 2, x + 2, z - 2, z + 2, 0, h, .7);

  // 外壁の柱形と、奥まったパネル。柱脚・笠石・細い目地を重ねる。
  for (const side of [-1, 1]) {
    const inner = side < 0 ? -29 : 29;
    const face = (depth: number) => inner - side * depth;
    const wallPart = (z0: number, z1: number, depth: number, y0: number, y1: number, light: number) =>
      box(decor, Math.min(inner, face(depth)), Math.max(inner, face(depth)), z0, z1, y0, y1, light);
    wallPart(-46, 17, .35, 0, .7, .32);
    wallPart(-46, 17, .3, 8.8, 9.15, .7);
    wallPart(-46, 17, .5, 11.4, 12.2, .7);
    for (let z = -43; z <= 12; z += 7) {
      wallPart(z, z + .8, .65, 0, 11.5, .57);
      wallPart(z - .2, z + 1, .9, 0, 1, .68);
      wallPart(z - .2, z + 1, .9, 8.5, 9.2, .72);
      // 暗い縦長の窪み、枠、灯り。
      wallPart(z + 2, z + 5.6, .06, 3.8, 8.1, .2);
      wallPart(z + 2.2, z + 5.4, .1, 4, 4.18, .75);
      wallPart(z + 2.2, z + 5.4, .1, 7.72, 7.9, .75);
      wallPart(z + 3.55, z + 4.05, .15, 5.1, 7.1, .92);
    }
    // 回廊の柱の台座、縦溝、梁の継ぎ目。
    for (const z of [-35, -25, -15, -5]) {
      const a = side < 0 ? -27 : 25;
      box(decor, a - .25, a + 2.25, z - .25, z + 2.25, 3, 3.55, .78);
      box(decor, a - .15, a + 2.15, z - .15, z + 2.15, 9.8, 10.15, .8);
      for (const dx of [.4, 1, 1.6])
        box(decor, a + dx, a + dx + .08, z + 2, z + 2.04, 3.6, 9.7, .3);
      box(decor, a - .12, a + 2.12, z - .15, z + 2.15, 11.4, 12.15, .36);
    }
    // 高台の縁に石の帯と、排水溝の格子。
    const edge = side < 0 ? -20 : 20;
    box(decor, edge - .12, edge + .12, -38, 4, 2.9, 3.08, .32);
    const drainX = side < 0 ? -18 : 18;
    box(decor, drainX - .35, drainX + .35, -38, 7, .006, .018, .18);
    for (let z = -37.5; z < 7; z += .8)
      box(decor, drainX - .34, drainX + .34, z, z + .07, .019, .025, .72);
  }
  // 門の重なった枠と、奥へ続く暗い壁面。
  for (const side of [-1, 1]) {
    const a = side < 0 ? -10 : 9;
    box(decor, a, a + 1, -46, -45.3, 0, 14, .76);
    box(decor, a - .35, a + 1.35, -46.2, -45, 0, 1.2, .82);
    box(decor, a - .2, a + 1.2, -46.2, -45, 12.8, 14, .82);
    for (let y = 2; y < 13; y += 2.5) box(decor, a, a + 1, -45.29, -45.25, y, y + .08, .28);
  }
  box(decor, -9, 9, -45.95, -45.25, 13.1, 14, .8);
  box(decor, -9, 9, -50, -49.8, 0, 14, .16);
  // 祭壇の縁、中心の石碑、両脇の小さな灯籠。
  for (const [w, z, y] of [[11, -34, 2], [7, -38, 4], [3, -40, 6]])
    box(decor, -w, w, z, z + .15, y - .25, y + .08, .36);
  box(decor, -1.2, 1.2, -23.98, -23.92, 1, 4.35, .12);
  for (let y = 1.4; y <= 3.8; y += .6) box(decor, -.7, .7, -23.91, -23.88, y, y + .08, .83);
  for (const x of [-14, 14]) {
    box(boxes, x - .65, x + .65, -39, -37.7, 0, 2.5, .45);
    box(decor, x - .9, x + .9, -39.25, -37.45, 2.5, 2.8, .75);
    box(decor, x - .55, x + .55, -38.95, -37.75, 2.8, 4.1, .22);
    box(decor, x - .4, x + .4, -37.74, -37.7, 3, 3.9, .95);
    box(decor, x - 1, x + 1, -39.4, -37.3, 4.1, 4.45, .75);
  }
  // 敷石の継ぎ目と中央を導く二本の帯。
  const lines = [-6, 6].map(x => ({ x, y: .025, z: -15, w: .12, d: 54 }));
  for (let z = -32; z <= 12; z += 4) lines.push({ x: 0, y: .024, z, w: 12, d: .045 });
  for (const x of [-15, 15]) for (let z = -34; z <= 10; z += 5)
    lines.push({ x, y: .024, z, w: 4, d: .04 });
  return {
    boxes, decor, ramps, lines, colliders: [], scenery: [],
    bounds: { minX: -31, maxX: 31, minZ: -48, maxZ: 19 },
    start: { x: 0, y: 0, z: 14 }, enemySpawns: [],
    view: { eye: { x: 12, y: 10, z: 15 }, target: { x: 0, y: 5, z: -35 } },
  };
}

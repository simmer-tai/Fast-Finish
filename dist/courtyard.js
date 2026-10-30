// 門の向こうへ抜ける軸と、左右から高台へ回り込める中庭。
export function buildCourtyard() {
    const boxes = [], decor = [];
    const ramps = [];
    const box = (list, minX, maxX, minZ, maxZ, y0, h, light) => list.push({ minX, maxX, minZ, maxZ, y0, h, light, look: 'struct' });
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
        for (const z of [-33, -23, -13])
            box(boxes, side < 0 ? -20.5 : 19.5, side < 0 ? -19.5 : 20.5, z, z + 6, 3, 4, .78);
    }
    box(boxes, -1.5, 1.5, -27, -24, 0, 5, .3);
    box(decor, -2, 2, -27.5, -23.5, 5, 5.5, .85);
    for (const [x, z, h] of [[-12, -17, 1.5], [11, -11, 2], [-10, -31, 1], [12, -30, 1.5]])
        box(boxes, x - 2, x + 2, z - 2, z + 2, 0, h, .7);
    const lines = [-6, 6].map(x => ({ x, y: .025, z: -15, w: .12, d: 54 }));
    return {
        boxes, decor, ramps, lines, colliders: [], scenery: [],
        bounds: { minX: -31, maxX: 31, minZ: -48, maxZ: 19 },
        start: { x: 0, y: 0, z: 14 }, enemySpawns: [],
        view: { eye: { x: 12, y: 10, z: 15 }, target: { x: 0, y: 5, z: -35 } },
    };
}

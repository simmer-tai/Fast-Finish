// 床の切れ目、高い足場、低い天井を順番に越えるコース。
export function buildTutorial() {
    const boxes = [
        { minX: -5, maxX: 5, minZ: -12, maxZ: 8, h: 5, light: 0.7, look: 'terrain' },
        { minX: -5, maxX: 5, minZ: -21, maxZ: -15, h: 8.8, light: 0.65, look: 'terrain' },
        { minX: -5, maxX: 5, minZ: -38, maxZ: -24, h: 13.4, light: 0.65, look: 'terrain' },
        { minX: -5, maxX: 5, minZ: -94, maxZ: -51, h: 13.4, light: 0.7, look: 'terrain' },
        { minX: -5, maxX: 5, minZ: -122, maxZ: -110, h: 13.4, light: 0.7, look: 'terrain' },
        // 足場の端から向こう岸まで、壁に沿って走れる。
        { minX: -5, maxX: -4, minZ: -112, maxZ: -90, h: 22, light: 0.5, look: 'struct' },
        // ダッシュの区間は上を低くし、跳んで渡る代わりに床から飛び出して渡る。
        { minX: -5, maxX: 5, minZ: -51, maxZ: -24, y0: 15.3, h: 16.8, light: 0.53, look: 'struct' },
        // 立ったままでは通れない。上にも登れない高さにする。
        { minX: -5, maxX: 5, minZ: -75, maxZ: -72, y0: 14.35, h: 20.8, light: 0.45, look: 'struct' },
    ];
    return {
        boxes, decor: [], colliders: [], scenery: [], lines: [],
        bounds: { minX: -5, maxX: 5, minZ: -122, maxZ: 8 },
        start: { x: 0, y: 5, z: 4 }, enemySpawns: [],
        view: { eye: { x: 8, y: 13, z: 12 }, target: { x: 0, y: 5, z: -15 } },
    };
}

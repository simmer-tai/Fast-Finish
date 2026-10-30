// 戦闘を始める前に、移動を安全に試せる一本道。
export function buildTutorial() {
    const boxes = [
        { minX: -6, maxX: -5, minZ: -62, maxZ: 8, h: 12, light: 0.7, look: 'struct' },
        { minX: 5, maxX: 6, minZ: -62, maxZ: 8, h: 12, light: 0.7, look: 'struct' },
        { minX: -4.8, maxX: 4.8, minZ: -17, maxZ: -14, h: 0.8, light: 0.65, look: 'terrain' },
        { minX: -5, maxX: 5, minZ: -54, maxZ: -49, y0: 0.95, h: 3, light: 0.45, look: 'struct' },
    ];
    return {
        boxes, decor: [], colliders: [], scenery: [],
        lines: [-8, -15.5, -26, -38, -52].map((z) => ({ x: 0, y: z === -15.5 ? 0.81 : 0.02, z, w: 4, d: 0.12 })),
        bounds: { minX: -5, maxX: 5, minZ: -62, maxZ: 8 },
        start: { x: 0, y: 0, z: 4 }, enemySpawns: [],
        view: { eye: { x: 8, y: 9, z: 12 }, target: { x: 0, y: 0, z: -15 } },
    };
}

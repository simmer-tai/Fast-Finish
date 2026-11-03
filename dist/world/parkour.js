const zone = (minX, maxX, minY, maxY, minZ, maxZ) => ({ minX, maxX, minY, maxY, minZ, maxZ });
// 一直線に -Z へ進むコース。動きの目安（player/config.ts）: 全力で跳ぶと同じ高さで約 12.5m 届き、ダッシュを足せば 20m ほど。
// 跳んだ高さは二段ジャンプまで足して約 2.1m。壁走りは 14m/s で最長 2.4 秒、壁ジャンプは着地までに 3 回、よじ登りは足もとから 3m まで。
// スライディング中の頭は足もとから約 1.1m
function buildCourse() {
    const boxes = [];
    // 地面から立つ足場は地形の格子、浮いた物（壁）は人工物の格子にする（チュートリアルと同じ）
    const box = (minX, maxX, minZ, maxZ, y0, h, light = 0.7) => boxes.push({ minX, maxX, minZ, maxZ, y0, h, light, look: y0 === 0 ? 'terrain' : 'struct' });
    const WALL = 0.5; // 壁走りの壁とくぐる梁は暗くして、足場と見分ける
    const pillar = (x, z, h, r = 1.25) => box(x - r, x + r, z - r, z + r, 0, h);
    const traps = [];
    const crumble = (x, z, h, r = 2) => traps.push({ kind: 'crumble', minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h });
    const blink = (x, z, h, phase) => traps.push({ kind: 'blink', minX: x - 2, maxX: x + 2, minZ: z - 2, maxZ: z + 2, h, period: 2.4, on: 0.6, phase });
    const laser = (z, y, extra = {}) => traps.push({ kind: 'laser', minX: -4, maxX: 4, z, y, ...extra });
    const movers = [];
    // 横に往復する足場。初めは x0 にいて、dx だけずれた所と行き来する（端で少し止まる）
    const slider = (x0, z, h, dx) => movers.push({
        parts: [{ boxes: [{ minX: x0 - 2, maxX: x0 + 2, minZ: z - 3, maxZ: z + 3, y0: h - 1, h, light: 0.85, look: 'struct' }], decor: [] }],
        path: [{ x: dx, z: 0, time: 1.8 }, { x: dx, z: 0, time: 0.3 }, { x: 0, z: 0, time: 1.8 }, { x: 0, z: 0, time: 0.3 }],
    });
    // 細い道を横切って押し出す壁（傷は負わせない）。y の上に高さ 2.5m で立つ
    const pusher = (x0, z, y, dx) => movers.push({
        hazard: true, harmless: true,
        parts: [{ boxes: [{ minX: x0 - 1.5, maxX: x0 + 1.5, minZ: z - 1, maxZ: z + 1, y0: y, h: y + 2.5, light: 0.35, look: 'struct' }], decor: [] }],
        path: [{ x: dx, z: 0, time: 1.1 }, { x: dx, z: 0, time: 0.7 }, { x: 0, z: 0, time: 1.1 }, { x: 0, z: 0, time: 0.7 }],
    });
    // 0. スタート
    box(-5, 5, -6, 8, 0, 12);
    // 1. 細い柱を左右に跳び移る
    pillar(-3, -14, 12.5);
    pillar(3, -24, 13);
    pillar(-2, -35, 12);
    pillar(3, -47, 12.5);
    box(-3, 3, -66, -58, 0, 12);
    // 2. 壁走りの連続: 50m の谷を、左右の壁を 4 枚乗り継いで渡る（壁ジャンプ 3 回）
    box(3, 4, -82, -68, 6, 17, WALL);
    box(-4, -3, -94, -80, 6, 17, WALL);
    box(3, 4, -106, -92, 6, 17, WALL);
    box(-4, -3, -116, -104, 6, 17, WALL);
    box(-4, 4, -126, -116, 0, 11);
    // 3. 滑り降りる坂: ジャンプ台で 9m 上の台へ上がり、50m の下り坂をスライディングで加速しながら、立った頭の高さに張った光線をくぐる。
    // 坂の下から 10m 跳んで着地
    box(-4, 4, -134, -126, 0, 11);
    traps.push({ kind: 'jump', minX: -3, maxX: 3, minZ: -133, maxZ: -128, y: 11, power: 19 });
    box(-4, 4, -146, -136, 0, 20);
    const slopeTop = (z) => 5 + 15 * (z + 196) / 50; // 坂の上面の高さ
    for (const z of [-154, -162, -170, -178, -186])
        laser(z, slopeTop(z) + 1.35);
    laser(-192, slopeTop(-192) + 1.4, { bob: 0.2, period: 0.9 });
    box(-4, 4, -216, -206, 0, 5);
    // 4. 登り: ジャンプ台で 6m 上へ → 縁をつかむ段を 2 つ → 崩れる足場を 2 枚、止まらずに渡る
    traps.push({ kind: 'jump', minX: -2, maxX: 2, minZ: -215, maxZ: -211, y: 5, power: 15 });
    box(-4, 4, -226, -218, 0, 11);
    box(-4, 2, -234, -229, 0, 14);
    box(-2, 4, -242, -237, 0, 17);
    crumble(0, -249, 17);
    crumble(-1, -257, 17);
    box(-5, 5, -272, -263, 0, 20);
    // 5. 動く足場を 2 つ乗り継ぎ、押し出す壁が横切る細い一本橋を渡る
    slider(-8, -280, 20, 16);
    slider(8, -296, 20, -16);
    box(-1, 1, -340, -306, 0, 20);
    pusher(-9, -316, 20, 18);
    pusher(9, -330, 20, -18);
    box(-4, 4, -352, -342, 0, 20);
    // 6. 壁ジャンプと光の柱: 両側に壁の続く 44m の谷。壁ぎわに立つ光の柱が左・右・左と道をふさぐので、
    // 左の壁に乗って走り、柱の手前で反対の壁へ跳び移る（壁ジャンプ 2 回）。2 本目と 3 本目の間の真ん中には点滅する柱があり、跳び移る拍子を見計らう。
    // 着いたら、ダッシュの要る飛び石を 2 つ
    box(-4, -3, -398, -354, 14, 27, WALL);
    box(3, 4, -398, -354, 14, 27, WALL);
    const pole = (x, z, extra = {}) => traps.push({ kind: 'pole', x, z, minY: 14, maxY: 27, ...extra });
    pole(2.4, -362);
    pole(-2.4, -374, { sway: 1.5, period: 1.8 });
    pole(0, -381, { period: 1.2, on: 0.5 });
    pole(2.4, -388, { sway: 1.5, period: 1.8, phase: 0.5 });
    box(-4, 4, -408, -400, 0, 20);
    pillar(3.5, -422, 19, 1.5);
    pillar(-3.5, -440, 18, 1.5);
    box(-4, 4, -466, -450, 0, 17);
    // 7. 仕上げ: 上下する光線を跳び越え、崩れる橋から左の壁を走って 34m の谷を越え、1m 上のゴールへ跳び上がる
    laser(-462, 18.6, { bob: 0.8, period: 1.3 });
    crumble(0, -471, 17, 3);
    crumble(0, -479, 17, 3);
    box(-4, -3, -514, -484, 13, 24, WALL);
    box(-5, 5, -530, -516, 0, 18);
    const ramp = { minX: -4, maxX: 4, minZ: -196, maxZ: -146, y0: 5, h: 20, up: '+z', light: 0.7, look: 'terrain' };
    const { decor, scenery, lines } = dress(boxes, traps, ramp);
    return {
        layout: {
            boxes, movers,
            ramps: [ramp],
            decor, colliders: [], scenery,
            lines: [
                ...lines,
                { x: 0, y: 12.03, z: 0, w: 9, d: 0.3 },
                { x: 0, y: 12.03, z: -62, w: 5, d: 0.3 },
                { x: 0, y: 11.03, z: -121, w: 7, d: 0.3 },
                { x: 0, y: 5.03, z: -208, w: 7, d: 0.3 },
                { x: 0, y: 20.03, z: -267, w: 9, d: 0.3 },
                { x: 0, y: 20.03, z: -347, w: 7, d: 0.3 },
                { x: 0, y: 17.03, z: -452, w: 7, d: 0.3 },
                { x: 0, y: 18.03, z: -517, w: 9, d: 0.5 },
            ],
            bounds: { minX: -16, maxX: 16, minZ: -540, maxZ: 16 },
            start: { x: 0, y: 12, z: 4 }, enemySpawns: [],
            view: { eye: { x: 90, y: 80, z: 20 }, target: { x: 0, y: 12, z: -170 } },
        },
        traps,
        startZone: zone(-5, 5, 11.5, 14, 0, 8),
        goal: zone(-5, 5, 17.5, 20, -530, -517),
        checkpoints: [
            { zone: zone(-3, 3, 11.5, 14, -66, -58), spawn: { x: 0, y: 12, z: -61 } },
            { zone: zone(-4, 4, 10.5, 13, -130, -116), spawn: { x: 0, y: 11, z: -121 } },
            { zone: zone(-4, 4, 4.5, 7, -210, -206), spawn: { x: 0, y: 5, z: -207 } },
            { zone: zone(-5, 5, 19.5, 22, -272, -263), spawn: { x: 0, y: 20, z: -267 } },
            { zone: zone(-4, 4, 19.5, 22, -352, -342), spawn: { x: 0, y: 20, z: -346 } },
            { zone: zone(-4, 4, 16.5, 19, -454, -450), spawn: { x: 0, y: 17, z: -452 } },
        ],
        fallY: 2,
    };
}
// ---- 飾り（チュートリアルの作りに合わせる） ----
// 広い足場の両脇に手すりを付け、前後の縁に帯を引く。壁走りの壁は走る高さに明るい帯を引き、裏に地面からの骨組みと上の縁の梁を付ける。
// 光線は両脇の柱と上の梁で門にする。坂の両脇には傾けた手すり。コースの両脇の遠くには、高さのそろわない塔を並べる
const RAIL_H = 1.1;
const LIGHT_RAIL = 0.4;
const LIGHT_FRAME = 0.3;
function dress(boxes, traps, ramp) {
    const decor = [];
    const scenery = [];
    const lines = [];
    const deco = (list, minX, maxX, minZ, maxZ, y0, h, light, extra = {}) => list.push({ minX, maxX, minZ, maxZ, y0: y0 || undefined, h, light, look: 'struct', ...extra });
    for (const b of boxes) {
        const w = b.maxX - b.minX;
        if (!b.y0 && w >= 6) {
            for (const [x0, x1] of [[b.minX - 0.4, b.minX], [b.maxX, b.maxX + 0.4]])
                deco(decor, x0, x1, b.minZ, b.maxZ, b.h, b.h + RAIL_H, LIGHT_RAIL);
            for (const z of [b.minZ + 0.4, b.maxZ - 0.4])
                lines.push({ x: (b.minX + b.maxX) / 2, y: b.h + 0.03, z, w: w - 0.6, d: 0.25 });
        }
        else if (b.y0 && w <= 1) {
            // 壁走りの壁: 走る側（コースの真ん中の側）の面に帯、反対の面に骨組み
            const inner = b.maxX <= 0 ? b.maxX : b.minX;
            const out = b.maxX <= 0 ? -1 : 1;
            // 帯は、手前の足場の床から 1.3m の高さ（走りだす高さ）に引く
            const from = boxes.filter((f) => !f.y0 && f.maxZ >= b.maxZ).reduce((m, f) => (f.maxZ < m.maxZ ? f : m));
            const runY = from.h + 1.3;
            deco(decor, Math.min(inner, inner - out * 0.03), Math.max(inner, inner - out * 0.03), b.minZ + 1, b.maxZ - 1, runY, runY + 0.3, 0.95);
            const back = out > 0 ? b.maxX : b.minX;
            for (let z = b.maxZ; z > b.minZ; z -= 5.5)
                deco(decor, Math.min(back, back + out * 0.5), Math.max(back, back + out * 0.5), Math.max(z - 0.5, b.minZ), z, 0, b.h, LIGHT_FRAME);
            deco(decor, Math.min(back + out * 0.5, inner - out * 0.2), Math.max(back + out * 0.5, inner - out * 0.2), b.minZ - 0.4, b.maxZ + 0.4, b.h, b.h + 0.4, LIGHT_FRAME);
        }
    }
    // 始めの床の後ろの壁
    deco(decor, -5.4, 5.4, 8, 8.6, 12, 16, LIGHT_RAIL);
    // 光線の門
    for (const t of traps) {
        if (t.kind !== 'laser')
            continue;
        const top = t.y + (t.bob ?? 0) + 0.9;
        for (const [x0, x1] of [[t.minX - 1.1, t.minX - 0.4], [t.maxX + 0.4, t.maxX + 1.1]])
            deco(decor, x0, x1, t.z - 0.35, t.z + 0.35, 0, top, LIGHT_FRAME);
        deco(decor, t.minX - 1.1, t.maxX + 1.1, t.z - 0.35, t.z + 0.35, top, top + 0.5, LIGHT_FRAME);
    }
    // 坂の両脇の手すり
    for (const [x0, x1] of [[ramp.minX - 0.4, ramp.minX], [ramp.maxX, ramp.maxX + 0.4]]) {
        deco(decor, x0, x1, ramp.minZ, ramp.maxZ, ramp.y0, ramp.y0 + RAIL_H, LIGHT_RAIL, { slope: { up: '+z', rise: ramp.h - ramp.y0 } });
    }
    // 遠景の塔
    let seed = 9341;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    for (const s of [-1, 1]) {
        for (let z = 30; z > -580; z -= 14 + rand() * 10) {
            const x0 = s * (24 + rand() * 34);
            const w = 6 + rand() * 9;
            deco(scenery, Math.min(x0, x0 + s * w), Math.max(x0, x0 + s * w), z - 6 - rand() * 6, z, 0, 14 + rand() * 40, 0.25 + rand() * 0.25);
        }
    }
    return { decor, scenery, lines };
}
let course = null;
export const parkourCourse = () => (course ??= buildCourse());
export const buildParkour = () => parkourCourse().layout;

const HALF_W = 30; // 外壁の内面 (|x|)
const NEAR = 16; // 手前の外壁の内面 (z)。1 階は入口のガラス扉
const FAR = -112; // 奥の外壁の内面 (z)
const WALL_T = 1;
// 階: 床の上面の高さ。上の階の床板（と屋根）は厚さ 0.5m で、下の階の天井になる
const FLOOR_H = 7;
const FLOORS = [0, FLOOR_H, FLOOR_H * 2];
const SLAB = 0.5;
const ROOF_Y = FLOOR_H * 3; // 屋根の上面。下面は 20.5
const SKY_Y = ROOF_Y + 2; // 天窓のガラス（見えない当たり判定）の上面
// x の帯（右半分。左は鏡写し）: 吹き抜けの半分 | 回廊 | 店
const VOID = 9; // 吹き抜けの半幅
const SHOP = 16; // 店の表の面 (|x|)。回廊の幅は 7m
// z の帯: 手前の店（2・3 階だけ）| 手前の回廊 | 吹き抜け | 奥の回廊 | 奥の店
const VOID_NEAR = 4;
const VOID_FAR = -100;
const RING = 6; // 吹き抜けの手前と奥の回廊の奥行き
// 渡り廊下: 真ん中の z と、架かる階。幅は 6m
const BRIDGES = [[-30, FLOOR_H], [-52, FLOOR_H * 2], [-74, FLOOR_H]];
const BRIDGE_HALF = 3;
// エスカレーター: 上りと下りの 2 本を並べ、間に仕切りを入れる。吹き抜けの縁（回廊の手すりの内側）に沿わせ、
// 渡り廊下の縁から縁へ、高さ 7m を 14〜16m かけて上る。x0 は回廊の側の端
const ESC_W = 2; // 1 本の幅
const ESC_GAP = 0.5; // 仕切りの幅
const ESC_STEP = 0.5; // 段の奥行き（見た目だけ。当たり判定は坂のまま）
// 柱: 吹き抜けの縁の手すりのすぐ外に、1 階から屋根まで通す。渡り廊下とエスカレーターの降り口は避ける
const COLUMN_Z = [-4, -18, -42, -62, -86, -96];
// 店: 側面の店は 8m の間口を 1 つか 2 つ合わせて並べる。open の店は奥へ 6m 引っ込めて、表を開けておく（中に陳列台と棚）
const SHOP_UNIT = 8;
// 明るさ（0 が黒）。高いもの・重いものほど暗くする
const LIGHT_WALL = 0.74;
const LIGHT_SLAB = 0.62;
const LIGHT_SLAB_EDGE = 0.45;
const LIGHT_ROOF = 0.7;
const LIGHT_COLUMN = 0.86;
const LIGHT_RAIL = 0.9; // ガラスの手すり
const LIGHT_RAIL_TOP = 0.3;
const LIGHT_SHOP = 0.8;
const LIGHT_PILASTER = 0.6;
const LIGHT_GLASS = 0.28; // 店の表のガラス
const LIGHT_SIGN = 0.96;
const LIGHT_ESC = 0.4;
const LIGHT_ESC_MID = 0.24;
const LIGHT_ESC_TRUSS = 0.46;
const LIGHT_STEP = 0.3;
const LIGHT_STEP_ALT = 0.36;
const LIGHT_BALUSTRADE = 0.9; // ガラスの欄干
const LIGHT_HANDRAIL = 0.12;
const LIGHT_NEWEL = 0.84; // 乗り口の先の、欄干の端の胴
const LIGHT_LANDING = 0.62;
const LIGHT_CLADDING = 0.82;
const LIGHT_LAMP = 0.97;
const LIGHT_PLANTER = 0.5;
const LIGHT_HEDGE = 0.34;
const LIGHT_TOWER = 0.3;
const LIGHT_SCREEN = 0.95;
const LIGHT_FOUNTAIN = 0.76;
const LIGHT_WATER = 0.55;
const LIGHT_KIOSK = 0.66;
const LIGHT_FURNITURE = 0.42;
const LIGHT_DISPLAY_MIN = 0.5;
const LIGHT_DISPLAY_MAX = 0.9;
const LIGHT_FRAME = 0.36;
export function buildMall() {
    const boxes = [];
    const decor = [];
    const ramps = [];
    const colliders = [];
    const lines = [];
    const rect = (x0, x1, z0, z1) => ({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
    const box = (x0, x1, z0, z1, y0, h, light, look = 'struct') => boxes.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look });
    const deco = (x0, x1, z0, z1, y0, h, light, look = 'struct') => decor.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look });
    let seed = 5381;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const displayLight = () => LIGHT_DISPLAY_MIN + rand() * (LIGHT_DISPLAY_MAX - LIGHT_DISPLAY_MIN);
    const ceilOf = (y) => y + FLOOR_H - SLAB; // その階の天井（上の階の床板の下面）
    // ---- 外壁 ----
    // 長い壁は区切って並べ、始めの位置から順にせり上がるようにする
    for (const s of [-1, 1]) {
        for (let z = NEAR + WALL_T; z > FAR - WALL_T; z -= 16)
            box(s * HALF_W, s * (HALF_W + WALL_T), z, Math.max(z - 16, FAR - WALL_T), 0, ROOF_Y, LIGHT_WALL);
    }
    for (const z of [NEAR, FAR]) {
        const z1 = z === NEAR ? NEAR + WALL_T : FAR - WALL_T;
        for (let x = -HALF_W; x < HALF_W; x += 15)
            box(x, x + 15, z, z1, 0, ROOF_Y, LIGHT_WALL);
    }
    // 入口: 手前の壁の真ん中に、ガラスの扉と風除室の枠
    deco(-9, 9, NEAR - 0.05, NEAR, 0, 4.5, LIGHT_GLASS);
    for (let x = -9; x <= 9; x += 3)
        deco(x - 0.1, x + 0.1, NEAR - 0.1, NEAR, 0, 4.5, LIGHT_FRAME);
    deco(-9.5, 9.5, NEAR - 0.15, NEAR, 4.5, 5.5, LIGHT_FRAME);
    // ---- 床板と屋根 ----
    // 吹き抜けを除いた所に張る。側面は 12m ごとに区切る。吹き抜けの縁の小口には、暗い帯を巻く（階の重なりを見せる）
    const slab = (top, light) => {
        const y0 = top - SLAB;
        for (const s of [-1, 1]) {
            for (let z = NEAR; z > FAR; z -= 12)
                box(s * VOID, s * HALF_W, z, Math.max(z - 12, FAR), y0, top, light);
        }
        for (const [z0, z1] of [[NEAR, VOID_NEAR], [VOID_FAR, FAR]])
            box(-VOID, VOID, z0, z1, y0, top, light);
    };
    for (const y of FLOORS.slice(1)) {
        slab(y, LIGHT_SLAB);
        for (const s of [-1, 1])
            deco(s * (VOID - 0.03), s * VOID, VOID_NEAR, VOID_FAR, y - SLAB - 0.3, y, LIGHT_SLAB_EDGE);
        deco(-VOID, VOID, VOID_NEAR, VOID_NEAR - 0.03, y - SLAB - 0.3, y, LIGHT_SLAB_EDGE);
        deco(-VOID, VOID, VOID_FAR, VOID_FAR + 0.03, y - SLAB - 0.3, y, LIGHT_SLAB_EDGE);
    }
    slab(ROOF_Y, LIGHT_ROOF);
    // 渡り廊下: 吹き抜けを横切る床板
    for (const [bz, y] of BRIDGES) {
        box(-VOID, VOID, bz + BRIDGE_HALF, bz - BRIDGE_HALF, y - SLAB, y, LIGHT_SLAB);
        for (const sz of [-1, 1])
            deco(-VOID, VOID, bz + sz * BRIDGE_HALF, bz + sz * (BRIDGE_HALF + 0.03), y - SLAB - 0.3, y, LIGHT_SLAB_EDGE);
    }
    // 天窓: 吹き抜けの上。ガラスの代わりに見えない当たり判定を張る。吹き抜けから屋根の縁へよじ登って上に出ないよう、屋根の上も一面ふさぐ。
    // 枠は、吹き抜けを横切る梁（4m おき）と、縁に沿う桁（見た目だけ）
    colliders.push({ minX: -HALF_W, maxX: HALF_W, minZ: FAR, maxZ: NEAR, y0: ROOF_Y, h: SKY_Y });
    for (let z = VOID_NEAR; z >= VOID_FAR; z -= 4)
        deco(-VOID, VOID, z + 0.15, z - 0.15, ROOF_Y, ROOF_Y + 0.6, LIGHT_FRAME);
    for (const x of [-VOID, -3, 3, VOID])
        deco(x - 0.15, x + 0.15, VOID_NEAR, VOID_FAR, ROOF_Y + 0.6, ROOF_Y + 0.9, LIGHT_FRAME);
    // ---- 柱 ----
    for (const s of [-1, 1])
        for (const z of COLUMN_Z)
            box(s * (VOID + 0.5), s * (VOID + 1.5), z + 0.5, z - 0.5, 0, ROOF_Y - SLAB, LIGHT_COLUMN);
    // ---- エスカレーター ----
    // [回廊の側 (左 -1 / 右 1), 降り口の z, 上り口の z, 降り口の床の高さ]。坂は降り口から上り口へ上る
    const escalators = [
        [-1, -13, -30 + BRIDGE_HALF, 0], // 1 階 → 2 階の手前の渡り廊下
        [1, -30 - BRIDGE_HALF, -52 + BRIDGE_HALF, FLOOR_H], // 2 階 → 3 階の渡り廊下
        [-1, -74 + BRIDGE_HALF, -52 - BRIDGE_HALF, FLOOR_H], // 2 階の奥の渡り廊下 → 3 階の渡り廊下
        [1, -91, -74 - BRIDGE_HALF, 0], // 1 階 → 2 階の奥の渡り廊下
    ];
    // 渡り廊下の手すりに開けておく所: [渡り廊下の z の縁, 開ける x の範囲]
    const openings = [];
    // 見た目は傾けた箱（slope）で作る: 段、ガラスの欄干と黒い手すり（乗り口の先まで水平に伸ばす）、乗り口の床板とくし板。
    // 吹き抜けに浮いたもの（2 階から上り下りするもの）は、くさびを隠して、厚さの一定なトラスで下から支えて見せる
    const sloped = (x0, x1, z0, z1, y0, h, light, up, rise) => decor.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look: 'struct', slope: { up, rise } });
    for (const [s, zLow, zHigh, y] of escalators) {
        const up = zHigh < zLow ? '-z' : '+z';
        const dir = Math.sign(zHigh - zLow); // 上る向き (z)
        const len = Math.abs(zHigh - zLow);
        const top = y + FLOOR_H;
        const inner = s * VOID; // 回廊の側の端
        const outer = inner - s * (2 * ESC_W + ESC_GAP);
        const floating = y > 0;
        const lanes = [
            [inner, inner - s * ESC_W, LIGHT_ESC],
            [inner - s * ESC_W, inner - s * (ESC_W + ESC_GAP), LIGHT_ESC_MID],
            [inner - s * (ESC_W + ESC_GAP), outer, LIGHT_ESC],
        ];
        for (const [x0, x1, light] of lanes)
            ramps.push({ ...rect(x0, x1, zLow, zHigh), y0: y, h: top, up, light, look: 'struct', hidden: floating });
        openings.push([zHigh, Math.min(inner, outer), Math.max(inner, outer)]);
        if (floating)
            openings.push([zLow, Math.min(inner, outer), Math.max(inner, outer)]);
        const surface = (z) => y + (FLOOR_H * (z - zLow)) / (zHigh - zLow);
        // 段: 0.5m ごと。下を坂に埋めて、上の角だけを坂の面から出す。両脇は欄干の足もと（スカート）を空ける
        for (const [a, b] of [[inner - s * 0.6, inner - s * (ESC_W - 0.1)], [outer + s * 0.6, outer + s * (ESC_W - 0.1)]]) {
            for (let i = 0; i < len / ESC_STEP; i++) {
                const za = zLow + dir * ESC_STEP * i;
                const zb = za + dir * ESC_STEP;
                deco(a, b, za, zb, surface(za) - 0.3, surface(zb), i % 2 === 0 ? LIGHT_STEP : LIGHT_STEP_ALT);
            }
        }
        // 欄干: 回廊の側、真ん中の仕切り、外側の 3 本（幅 0.5m）。どれも当たり判定を持ち、横へすり抜けて落ちないようにする。
        // 傾いた所は、段の面から 1m 上を上面にした見えない坂（その下に立つと押し出される）。乗り口の先 1.5m の水平な所は箱（欄干の端の胴）。
        // 外側の欄干の端は、渡り廊下の手すりの切れ目の端にぴったり合わせ、手すりの小口がレーンへ出ないようにする
        for (const [a, b] of [[inner, inner - s * 0.5], [inner - s * ESC_W, inner - s * (ESC_W + ESC_GAP)], [outer + s * 0.5, outer]]) {
            const x = (a + b) / 2;
            ramps.push({ ...rect(a, b, zLow, zHigh), y0: y + 1, h: top + 1, up, light: LIGHT_BALUSTRADE, look: 'struct', hidden: true });
            sloped(a, b, zLow, zHigh, y, y + 0.15, LIGHT_ESC_MID, up, FLOOR_H); // 欄干の足もとの縁
            sloped(x - 0.05, x + 0.05, zLow, zHigh, y + 0.15, y + 1, LIGHT_BALUSTRADE, up, FLOOR_H);
            sloped(x - 0.1, x + 0.1, zLow, zHigh, y + 1, y + 1.12, LIGHT_HANDRAIL, up, FLOOR_H);
            for (const [z, fy, d] of [[zLow, y, -dir], [zHigh, top, dir]]) {
                box(a, b, z, z + d * 1.5, fy, fy + 1, LIGHT_NEWEL);
                deco(x - 0.1, x + 0.1, z, z + d * 1.6, fy + 1, fy + 1.12, LIGHT_HANDRAIL);
                // 手すりが折り返して下へ潜る、欄干の端の丸み（の代わりの黒い縁）
                deco(x - 0.1, x + 0.1, z + d * 1.5, z + d * 1.6, fy + 0.15, fy + 1, LIGHT_HANDRAIL);
            }
        }
        // 乗り口の床板（明るい金属）と、段との境のくし板（暗い帯）
        for (const [z, fy, d] of [[zLow, y, -dir], [zHigh, top, dir]]) {
            deco(inner, outer, z, z + d * 2, fy, fy + 0.03, LIGHT_LANDING);
            deco(inner, outer, z, z + d * 0.25, fy, fy + 0.04, LIGHT_ESC_MID);
        }
        // 外側の面: 坂の面のすぐ下に、明るい化粧板の帯を通す
        sloped(outer, outer - s * 0.03, zLow, zHigh, y - 0.7, y - 0.15, LIGHT_CLADDING, up, FLOOR_H);
        if (floating) {
            // トラス: 段の面から 1.2m の厚さ。両端は渡り廊下の床板の小口に掛ける
            sloped(inner, outer, zLow, zHigh, y - 1.2, y, LIGHT_ESC_TRUSS, up, FLOOR_H);
            sloped(inner, inner + s * 0.03, zLow, zHigh, y - 0.7, y - 0.15, LIGHT_CLADDING, up, FLOOR_H);
            // 下面に、斜めに走る骨（見た目だけの暗い帯）
            for (let i = 1; i < len / 4; i++) {
                const z = zLow + dir * 4 * i;
                deco(inner, outer, z - 0.1, z + 0.1, surface(z) - 1.25, surface(z) - 1.15, LIGHT_ESC_MID);
            }
        }
    }
    // ---- 手すり ----
    // ガラスの手すり（高さ 1m。ストライカーは跳び越えて下の階へ降りる）。吹き抜けの縁と、渡り廊下の縁に立てる。上に暗い笠木を載せる（見た目だけ）。
    // 渡り廊下が架かる所と、エスカレーターがつながる所は開けておく
    const RAIL_H = 1;
    const RAIL_T = 0.5;
    const rail = (x0, x1, z0, z1, y) => {
        if (Math.abs(x1 - x0) < 0.01 || Math.abs(z1 - z0) < 0.01)
            return;
        box(x0, x1, z0, z1, y, y + RAIL_H, LIGHT_RAIL);
        deco(x0, x1, z0, z1, y + RAIL_H, y + RAIL_H + 0.08, LIGHT_RAIL_TOP);
    };
    for (const y of FLOORS.slice(1)) {
        // 側面の縁: 同じ階の渡り廊下と、柱で切る
        const cuts = BRIDGES.filter(([, by]) => by === y).map(([bz]) => [bz + BRIDGE_HALF, bz - BRIDGE_HALF]);
        for (const s of [-1, 1]) {
            let z = VOID_NEAR;
            for (const [c0, c1] of [...cuts, [VOID_FAR, VOID_FAR]]) {
                rail(s * VOID, s * (VOID + RAIL_T), z, c0, y);
                z = c1;
            }
        }
        // 手前と奥の縁
        rail(-VOID - RAIL_T, VOID + RAIL_T, VOID_NEAR, VOID_NEAR + RAIL_T, y);
        rail(-VOID - RAIL_T, VOID + RAIL_T, VOID_FAR, VOID_FAR - RAIL_T, y);
    }
    for (const [bz, y] of BRIDGES) {
        for (const sz of [-1, 1]) {
            const edge = bz + sz * BRIDGE_HALF;
            const holes = openings.filter(([z]) => z === edge).map(([, a, b]) => [a, b]).sort((a, b) => a[0] - b[0]);
            let x = -VOID;
            for (const [a, b] of [...holes, [VOID, VOID]]) {
                rail(x, a, edge, edge - sz * RAIL_T, y);
                x = b;
            }
        }
    }
    // ---- 店 ----
    // 各階の、回廊の外側。閉じた店は、表にガラスと看板、間口の境に柱型（壁走りの切れ目になる）。
    // 開いた店は奥へ引っ込め、間口の両側を仕切り壁で区切って、中に陳列台と壁の棚を置く（隠れ場所と、よじ登りの足場になる）
    const shop = (s, z0, z1, y, open) => {
        const ceil = ceilOf(y);
        const front = s * SHOP;
        const back = s * (SHOP + (open ? 6 : 0));
        box(back, s * HALF_W, z0, z1, y, ceil, LIGHT_SHOP);
        deco(front - s * 0.05, front, z0 - 1, z1 + 1, y + 5.3, y + 6, LIGHT_SIGN); // 看板
        if (!open) {
            deco(front - s * 0.05, front, z0 - 0.75, z1 + 0.75, y + 0.3, y + 4.6, LIGHT_GLASS);
            return;
        }
        // 中: 表の上の壁（看板を掛ける）、間口の両側の仕切り壁、陳列台、棚
        box(front, s * (SHOP + 0.5), z0, z1, y + 5, ceil, LIGHT_SHOP);
        for (const [za, zb] of [[z0, z0 - 0.5], [z1 + 0.5, z1]])
            box(front, back, za, zb, y, y + 5, LIGHT_PILASTER);
        const zm = (z0 + z1) / 2;
        const len = Math.abs(z1 - z0);
        box(s * (SHOP + 2), s * (SHOP + 3.5), zm + len / 4, zm - len / 4, y, y + 1, displayLight());
        box(back - s * 1, back, z0 - 1.5, z1 + 1.5, y, y + 2.5, displayLight());
        for (let k = 0; k < len / 4 - 1; k++) {
            const zz = Math.max(z0, z1) - 1.5 - k * 4;
            deco(back - s * 1, back - s * 0.02, zz, zz - 2.5, y + 2.5, y + 2.5 + 0.5 + rand() * 1, displayLight());
        }
    };
    for (const y of FLOORS) {
        for (const s of [-1, 1]) {
            let z = NEAR;
            while (z > FAR) {
                const w = Math.min(rand() < 0.4 ? 2 * SHOP_UNIT : SHOP_UNIT, z - FAR);
                shop(s, z, z - w, y, rand() < 0.3);
                // 間口の境の柱型
                if (z - w > FAR)
                    box(s * (SHOP - 0.5), s * SHOP, z - w + 0.5, z - w - 0.5, y, ceilOf(y), LIGHT_PILASTER);
                z -= w;
            }
        }
        // 照明: 回廊の天井に、z 方向に長い蛍光灯を並べる。1 階は回廊の下（アーケード）
        for (const s of [-1, 1])
            for (let z = VOID_NEAR + RING - 2; z >= VOID_FAR; z -= 8)
                deco(s * 12.3, s * 12.7, z, z - 3, ceilOf(y) - 0.08, ceilOf(y), LIGHT_LAMP);
        if (y === 0)
            continue;
        // 手前と奥の店（2・3 階）: 回廊の向こうに、間口 8m の店を横に並べる
        for (const [zf, zb] of [[VOID_NEAR + RING, NEAR], [VOID_FAR - RING, FAR]]) {
            const sz = Math.sign(zb - zf);
            box(-SHOP, SHOP, zf, zb, y, ceilOf(y), LIGHT_SHOP);
            for (let x = -SHOP; x < SHOP; x += SHOP_UNIT) {
                deco(x + 0.75, x + SHOP_UNIT - 0.75, zf, zf - sz * 0.05, y + 0.3, y + 4.6, LIGHT_GLASS);
                deco(x + 1, x + SHOP_UNIT - 1, zf, zf - sz * 0.05, y + 5.3, y + 6, LIGHT_SIGN);
                if (x > -SHOP)
                    box(x - 0.5, x + 0.5, zf, zf - sz * 0.5, y, ceilOf(y), LIGHT_PILASTER);
            }
            for (let x = -12; x <= 12; x += 8)
                deco(x - 1.5, x + 1.5, zf - sz * 2.8, zf - sz * 3.2, ceilOf(y) - 0.08, ceilOf(y), LIGHT_LAMP);
        }
    }
    // ---- 1 階の吹き抜けの下 ----
    // 段になった植え込みと案内塔: 床 → 植え込み (2.5m) → 案内塔 (5.5m) → 2 階の手すりの上 (8m)。どの段も 3m 以内
    const climb = (s, z) => {
        box(s * 3, s * 7, z, z - 6, 0, 2.5, LIGHT_PLANTER);
        deco(s * 3.3, s * 6.7, z - 0.3, z - 5.7, 2.5, 3.2, LIGHT_HEDGE);
        box(s * 7, s * VOID, z - 1.5, z - 4.5, 0, 5.5, LIGHT_TOWER);
        // 案内塔の両面の画面
        for (const [zz, dz] of [[z - 1.5, 0.03], [z - 4.5, -0.03]])
            deco(s * 7.3, s * 8.7, zz, zz + dz, 2, 5, LIGHT_SCREEN);
    };
    climb(1, -4);
    climb(-1, -88);
    // 噴水: 3 段の水盤。3 階の渡り廊下の真下
    box(-5, 5, -47, -57, 0, 1, LIGHT_FOUNTAIN);
    deco(-4.5, 4.5, -47.5, -56.5, 1, 1.05, LIGHT_WATER);
    box(-2, 2, -50, -54, 1, 2.5, LIGHT_FOUNTAIN);
    box(-1, 1, -51, -53, 2.5, 4, LIGHT_FOUNTAIN);
    // 売店（屋根に乗れる）と、まわりのベンチ
    for (const z of [-38, -64]) {
        box(-2, 2, z + 2, z - 2, 0, 3, LIGHT_KIOSK);
        deco(-2.5, 2.5, z + 2.5, z - 2.5, 2.6, 3, LIGHT_FURNITURE);
        deco(-2.03, 2.03, z + 1, z - 1, 1, 2, LIGHT_GLASS);
    }
    for (const [x, z] of [[-6.5, -44], [6.5, -44], [-6.5, -60], [6.5, -60], [-3, -8], [3, -96]])
        box(x - 1, x + 1, z + 0.5, z - 0.5, 0, 0.5, LIGHT_FURNITURE);
    // 床の目地: 吹き抜けの下に、4m おきの線を引く
    for (let z = VOID_NEAR - 4; z > VOID_FAR; z -= 8)
        lines.push({ x: 0, y: 0.03, z, w: 2 * VOID, d: 0.2 });
    for (const x of [-VOID, VOID])
        lines.push({ x, y: 0.03, z: (VOID_NEAR + VOID_FAR) / 2, w: 0.2, d: VOID_NEAR - VOID_FAR });
    // 奥のフードコート: テーブルと椅子
    for (let x = -12; x <= 12; x += 6) {
        for (const z of [-102, -107]) {
            box(x - 1, x + 1, z + 1, z - 1, 0, 1, LIGHT_FURNITURE);
            for (const dx of [-1.75, 1.75])
                deco(x + dx - 0.5, x + dx + 0.5, z + 0.5, z - 0.5, 0, 0.6, LIGHT_FURNITURE);
        }
    }
    // ---- 敵の出る所 ----
    // 1 階: 回廊の下のアーケードと、吹き抜けの下の空いた床。2・3 階: 回廊、渡り廊下、手前と奥の回廊。
    // 敵は今の床と同じ高さの所しか歩かない（エスカレーターは使わない）。ストライカーは手すりを越えて下の階へ飛び降りて追う。
    // 狙撃手だけは、3 階の手前と奥の回廊と、3 階の渡り廊下からも撃つ（吹き抜けを見下ろす）
    const ground = [[-12.5, 2], [12.5, 2], [12.5, -10], [-12.5, -34], [12.5, -50], [-12.5, -70], [12.5, -82], [-12.5, -94], [3, -20], [0, -30], [-5, -38], [5, -64], [-5, -76], [0, -96]];
    const upper = [[-12.5, 0], [12.5, -12], [-12.5, -24], [12.5, -40], [-12.5, -48], [12.5, -60], [-12.5, -66], [12.5, -84], [-12.5, -96], [-4, 7], [4, -103]];
    const spawns = [
        ...ground.map(([x, z]) => ({ x, y: 0, z })),
        ...upper.map(([x, z]) => ({ x, y: FLOORS[1], z })),
        ...upper.filter((_, i) => i % 2 === 1).map(([x, z]) => ({ x, y: FLOORS[2], z })),
        ...BRIDGES.map(([bz, y]) => ({ x: 0, y, z: bz })),
        ...[[-6, 7], [6, -103], [0, -52], [-12.5, -80], [12.5, -28]].map(([x, z]) => ({ x, y: FLOORS[2], z, perch: true })),
    ];
    return {
        boxes,
        ramps,
        decor,
        colliders,
        scenery: [],
        lines,
        // 壁の外側の面まで。境界の壁は壁の中に隠れ、動ける範囲は壁そのものの当たり判定で決まる
        bounds: { minX: -HALF_W - WALL_T, maxX: HALF_W + WALL_T, minZ: FAR - WALL_T, maxZ: NEAR + WALL_T },
        // 入口の広間
        start: { x: 0, y: 0, z: 10 },
        enemySpawns: spawns,
        lead: 'sniper', // 上の階の回廊や渡り廊下から、吹き抜け越しに撃ってくる
        guest: 'striker', // 回廊の手すりを越えて、下の階へ飛び降りて追ってくる
        // 3 階の手前の回廊の左から、吹き抜けと渡り廊下、ジグザグのエスカレーターを見下ろす
        view: { eye: { x: -11, y: 17, z: 9 }, target: { x: 3, y: 4, z: -60 } },
    };
}

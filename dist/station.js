const PLATFORM_H = 1; // ホームの高さ（線路から）。よじ登れる
const PLATFORM_HALF = 12; // ホームの半幅
const PLATFORM_NEAR = 10; // ホームの手前の端 (z)
const PLATFORM_FAR = -150; // ホームの奥の端 (z)
const TRACK_OUTER = PLATFORM_HALF + 6; // 線路の外側の端 (|x|)。ここから擁壁
// レール (|x|)。電車の真下に来るよう、ホームの縁に寄せる
const RAIL_NEAR = PLATFORM_HALF + 1.8;
const RAIL_FAR = PLATFORM_HALF + 3.4;
const WALL_H = 6;
const LINE_NEAR = PLATFORM_NEAR + 4; // 線路と擁壁が続く範囲 (z)。ホームの両端から少しだけはみ出させる
const LINE_FAR = PLATFORM_FAR - 4;
// ホームの屋根: 柱の上、ホームから 6m の高さに載せる。端の柱より少し先まで覆う
const ROOF_Y0 = PLATFORM_H + 6;
const ROOF_Y1 = ROOF_Y0 + 0.5;
const ROOF_HALF = PLATFORM_HALF - 2;
const ROOF_NEAR = -4;
const ROOF_FAR = -136;
const SLEEPER_H = 0.12; // 枕木の高さ
const POLE_H = 8.5; // 架線柱の高さ
const WIRE_Y = 7.4; // 架線の高さ
// 明るさ（0 が黒）。高いもの・重いものほど暗くする
const LIGHT_PLATFORM = 0.64;
const LIGHT_WALL = 0.46;
const LIGHT_PILLAR = 0.86;
const LIGHT_FURNITURE = 0.76;
const LIGHT_ROOF = 0.8;
const LIGHT_SIGN = 0.22;
const LIGHT_SLEEPER = 0.52;
const LIGHT_RAIL = 0.3;
const LIGHT_POLE = 0.4;
const LIGHT_WIRE = 0.2;
export function buildStation() {
    const boxes = [];
    const decor = [];
    const colliders = [];
    const box = (x0, z0, x1, z1, h, light, look) => boxes.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h, light, look });
    // 長いものは区切って並べ、始めの位置から順にせり上がるようにする（継ぎ目は上を歩いても引っかからない）
    const run = (x0, x1, zNear, zFar, seg, h, light) => {
        for (let z = zNear; z > zFar; z -= seg)
            box(x0, z, x1, Math.max(z - seg, zFar), h, light, 'terrain');
    };
    // ホーム
    run(-PLATFORM_HALF, PLATFORM_HALF, PLATFORM_NEAR, PLATFORM_FAR, 10, PLATFORM_H, LIGHT_PLATFORM);
    // 線路の外の擁壁
    for (const s of [-1, 1])
        run(s * TRACK_OUTER, s * (TRACK_OUTER + 2), LINE_NEAR, LINE_FAR, 20, WALL_H, LIGHT_WALL);
    buildTrain(decor, colliders);
    // ホームの柱: 左右 2 列、20m おき。屋根を支える
    for (let z = -10; z >= -130; z -= 20) {
        for (const s of [-1, 1])
            box(s * 5, z, s * 7, z - 2, ROOF_Y0, LIGHT_PILLAR, 'struct');
    }
    // ホームの屋根（上屋）: 柱の上に載る薄い板。上に乗れて、鎖鎌も掛かる。区切って並べ、手前から順に組み上がるようにする
    for (let z = ROOF_NEAR; z > ROOF_FAR; z -= 10) {
        boxes.push({ minX: -ROOF_HALF, maxX: ROOF_HALF, minZ: Math.max(z - 10, ROOF_FAR), maxZ: z, y0: ROOF_Y0, h: ROOF_Y1, light: LIGHT_ROOF, look: 'struct' });
    }
    // 屋根から吊り下げた案内板: 黒い板を 2 本の吊り棒で下げる（文字は書かない）。頭より高いので当たり判定は持たせない
    for (const z of [-20, -60, -100]) {
        const hang = (x0, x1, y0, y1, light) => decor.push({ minX: x0, maxX: x1, minZ: z - 0.15, maxZ: z + 0.15, y0, h: y1, light, look: 'struct' });
        hang(-3, 3, ROOF_Y0 - 2, ROOF_Y0 - 1.2, LIGHT_SIGN);
        for (const x of [-2.5, 2.5])
            hang(x - 0.05, x + 0.05, ROOF_Y0 - 1.2, ROOF_Y0, LIGHT_SIGN);
    }
    // 中ほどの階段の囲い（下の通路へ降りる口。ホームから 2.5m の高さ）と、売店
    box(-2, -62, 2, -78, PLATFORM_H + 2.5, LIGHT_PILLAR, 'struct');
    box(-2.5, -96, 2.5, -102, PLATFORM_H + 2.5, LIGHT_FURNITURE, 'struct');
    // ホームの中央に並ぶベンチ（ホームから 0.5m）
    for (const z of [-20, -40, -110, -130])
        box(-1, z, 1, z - 4, PLATFORM_H + 0.5, LIGHT_FURNITURE, 'struct');
    // 線路: 枕木を 1m おきに並べ、その上に 2 本のレールを通す。低いので当たり判定は持たせない（上を走っても引っかからない）
    for (const s of [-1, 1]) {
        const x0 = s * (RAIL_NEAR - 0.7);
        const x1 = s * (RAIL_FAR + 0.7);
        for (let z = LINE_NEAR - 0.5; z > LINE_FAR; z -= 1) {
            decor.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: z - 0.2, maxZ: z + 0.2, h: SLEEPER_H, light: LIGHT_SLEEPER, look: 'terrain' });
        }
        for (const x of [s * RAIL_NEAR, s * RAIL_FAR]) {
            decor.push({ minX: x - 0.08, maxX: x + 0.08, minZ: LINE_FAR, maxZ: LINE_NEAR, y0: SLEEPER_H, h: SLEEPER_H + 0.14, light: LIGHT_RAIL, look: 'terrain' });
        }
    }
    // 架線: 線路の外側に柱を 30m おきに立て、腕を線路の上へ伸ばして、2 本のレールの真ん中の上に架線を張る。
    // 柱と腕には当たり判定を持たせる（鎖鎌の掛け先になる）。架線は細いので見た目だけ
    const wireX = (RAIL_NEAR + RAIL_FAR) / 2;
    for (const s of [-1, 1]) {
        const poleX0 = s * (TRACK_OUTER - 1.5);
        const poleX1 = s * (TRACK_OUTER - 1);
        for (let z = LINE_NEAR - 4; z > LINE_FAR; z -= 30) {
            box(poleX0, z, poleX1, z - 0.5, POLE_H, LIGHT_POLE, 'struct');
            boxes.push({ minX: Math.min(poleX0, s * (wireX - 1.5)), maxX: Math.max(poleX0, s * (wireX - 1.5)), minZ: z - 0.4, maxZ: z - 0.1, y0: POLE_H - 0.6, h: POLE_H - 0.3, light: LIGHT_POLE, look: 'struct' });
        }
        decor.push({ minX: s * wireX - 0.04, maxX: s * wireX + 0.04, minZ: LINE_FAR, maxZ: LINE_NEAR, y0: WIRE_Y, h: WIRE_Y + 0.08, light: LIGHT_WIRE, look: 'struct' });
    }
    // 地面の帯: ホームの縁の線
    const platLen = PLATFORM_NEAR - PLATFORM_FAR;
    const platZ = (PLATFORM_NEAR + PLATFORM_FAR) / 2;
    const lines = [-1, 1].map((s) => ({ x: s * (PLATFORM_HALF - 0.8), y: PLATFORM_H + 0.01, z: platZ, w: 0.3, d: platLen }));
    // 擁壁の向こうのビル: 線路の左右に、間を空けながら並べる（入れないので当たり判定は持たせない）。
    // ほかの箱と同じく、面にはグリッドの線を引く
    const scenery = [];
    let seed = 4021;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    for (const s of [-1, 1]) {
        for (let z = LINE_NEAR + 40; z > LINE_FAR - 40;) {
            const depth = 10 + Math.floor(rand() * 4) * 4; // z 方向の長さ
            const width = 10 + Math.floor(rand() * 4) * 4;
            const x0 = s * (TRACK_OUTER + 6 + Math.floor(rand() * 3) * 2);
            const h = 10 + Math.floor(rand() * 8) * 4;
            const light = 0.28 + rand() * 0.3;
            scenery.push({ minX: Math.min(x0, x0 + s * width), maxX: Math.max(x0, x0 + s * width), minZ: z - depth, maxZ: z, h, light, look: 'struct' });
            z -= depth + 2 + Math.floor(rand() * 3) * 2;
        }
    }
    return {
        boxes,
        decor,
        colliders,
        scenery,
        lines,
        // 擁壁の内側と、線路が続く範囲の中だけを動ける
        bounds: { minX: -TRACK_OUTER, maxX: TRACK_OUTER, minZ: LINE_FAR, maxZ: LINE_NEAR },
        start: { x: 0, y: PLATFORM_H, z: 4 },
        // 敵の出る所: ホームの上の、柱・ベンチ・階段の囲い・売店を避けた所と、電車の屋根の上（車両の真ん中）。
        // 狙撃手だけは、残りの車両の屋根と、階段の囲いと売店の上にも出る（どれもホームからよじ登れる高さ）
        enemySpawns: [
            ...[[-4, -16], [3, -30], [-8, -48], [9, -58], [-6, -85], [9, -92], [4, -118], [-3, -142]].map(([x, z]) => ({ x, y: PLATFORM_H, z })),
            ...[1, 3].map((i) => ({ x: TRAIN_CX, y: ROOF_Y, z: CAR_NEAR - i * (CAR_LEN + CAR_GAP) - CAR_LEN / 2 })),
            ...[0, 2, 4].map((i) => ({ x: TRAIN_CX, y: ROOF_Y, z: CAR_NEAR - i * (CAR_LEN + CAR_GAP) - CAR_LEN / 2, perch: true })),
            { x: 0, y: PLATFORM_H + 2.5, z: -70, perch: true },
            { x: 0, y: PLATFORM_H + 2.5, z: -99, perch: true },
        ],
        lead: 'sniper', // 長いホームの奥や電車の屋根から、見通しを通して撃ってくる
        // ホームの手前の先、左の線路の上から、屋根の下に柱が並んで奥へ続き、右に電車が止まっているのを見る
        view: { eye: { x: -14, y: 8, z: 12 }, target: { x: 6, y: 2.5, z: -40 } },
    };
}
// ---- 電車 ----
// 右の線路に止まった 5 両の通勤電車。車体の幅 4m・高さ 4m（ホームから 3m）・長さ 24m、連結の隙間 2m。
// 見た目は部品ごとの箱（浮かせてよい）で組み、当たり判定は車体と屋根の機器を地面から立つ箱で別に持たせる。
// 細かい部品は持たせず、白い車体・暗い窓の帯（ドアの所で途切れる）・暗い床下・屋根の機器の、形の切れ目だけで電車に見せる。
// 面にはホームと同じ地形のグリッド（0.5m の細線と 2m の太線）を引く。格子の起点は電車の角（ホーム側の面・先頭の前面・地面）に置き、
// 部品の寸法も 0.5m 刻みにそろえて、どの部品の縁にも線が乗るようにする
const TRAIN_X0 = PLATFORM_HALF + 0.6; // ホーム側の面（ホームの縁との隙間は 0.6m）
const TRAIN_X1 = TRAIN_X0 + 4;
const TRAIN_CX = (TRAIN_X0 + TRAIN_X1) / 2;
const CAR_COUNT = 5;
const CAR_LEN = 24;
const CAR_GAP = 2;
const CAR_NEAR = -6; // 先頭の車両の前面 (z)
const BODY_Y0 = 1; // 車体の裾（その下は床下）。ホームと同じ高さ
const BODY_Y1 = 3.5; // 車体の肩（その上は屋根）
const ROOF_Y = 4;
const SKIN = 0.03; // 窓の帯を車体の面からわずかに浮かせて、面がちらつかないようにする
const DOORS = 4; // 片側のドアの数（窓の帯の切れ目）
const DOOR_W = 2;
const WIN_Y0 = 2; // 窓の帯（下の縁に太線が乗る）
const WIN_Y1 = 3;
const GRID_ORIGIN = { x: TRAIN_X0, y: 0, z: CAR_NEAR };
const L_BODY = 0.9;
const L_ROOF = 0.62;
const L_WINDOW = 0.24;
const L_UNDER = 0.28;
const L_ROOF_UNIT = 0.5;
function buildTrain(decor, colliders) {
    // y0〜y1 の高さに、x と z の範囲で浮いた箱を置く
    const part = (x0, x1, z0, z1, y0, y1, light) => decor.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), y0, h: y1, light, look: 'terrain', gridOrigin: GRID_ORIGIN });
    const solid = (x0, x1, z0, z1, h) => colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h });
    // 車体の両側面（ホーム側とその反対側）に、面からわずかに浮かせて貼る
    const onSides = (z0, z1, y0, y1, light) => {
        part(TRAIN_X0 - SKIN, TRAIN_X0, z0, z1, y0, y1, light);
        part(TRAIN_X1, TRAIN_X1 + SKIN, z0, z1, y0, y1, light);
    };
    for (let i = 0; i < CAR_COUNT; i++) {
        const front = CAR_NEAR - i * (CAR_LEN + CAR_GAP); // この車両の +Z 側の端
        const back = front - CAR_LEN;
        solid(TRAIN_X0, TRAIN_X1, front, back, ROOF_Y);
        // 車体・屋根・床下
        part(TRAIN_X0, TRAIN_X1, front, back, BODY_Y0, BODY_Y1, L_BODY);
        part(TRAIN_X0 + 0.5, TRAIN_X1 - 0.5, front - 0.5, back + 0.5, BODY_Y1, ROOF_Y, L_ROOF);
        part(TRAIN_X0 + 0.5, TRAIN_X1 - 0.5, front - 1, back + 1, 0.5, BODY_Y0, L_UNDER);
        // 窓の帯: ドアの所で途切れさせて、ドアの並びだけを見せる
        const pitch = CAR_LEN / DOORS;
        const doorCenters = Array.from({ length: DOORS }, (_, k) => front - pitch / 2 - k * pitch);
        const edges = [front - 1, ...doorCenters.flatMap((c) => [c + DOOR_W / 2, c - DOOR_W / 2]), back + 1];
        for (let k = 0; k < edges.length; k += 2)
            onSides(edges[k], edges[k + 1], WIN_Y0, WIN_Y1, L_WINDOW);
        // 屋根の冷房装置（2 台）。上に乗れるよう、当たり判定も持たせる
        for (const c of [front - 6, back + 6]) {
            part(TRAIN_CX - 1, TRAIN_CX + 1, c + 2, c - 2, ROOF_Y, ROOF_Y + 0.5, L_ROOF_UNIT);
            solid(TRAIN_CX - 1, TRAIN_CX + 1, c + 2, c - 2, ROOF_Y + 0.5);
        }
        // 次の車両との間の幌。乗り移れるよう、当たり判定も持たせる
        if (i < CAR_COUNT - 1) {
            part(TRAIN_CX - 1, TRAIN_CX + 1, back, back - CAR_GAP, BODY_Y0 + 0.5, BODY_Y1, L_UNDER);
            solid(TRAIN_CX - 1, TRAIN_CX + 1, back, back - CAR_GAP, BODY_Y1);
        }
    }
    // 両端の運転台: 前面の大きな窓だけ
    const ends = [[CAR_NEAR, 1], [CAR_NEAR - CAR_COUNT * CAR_LEN - (CAR_COUNT - 1) * CAR_GAP, -1]];
    for (const [z, dir] of ends)
        part(TRAIN_X0 + 0.5, TRAIN_X1 - 0.5, z, z + dir * SKIN, WIN_Y0, WIN_Y1, L_WINDOW);
}

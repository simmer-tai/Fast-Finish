import { game } from './game/state.js?v=2f0a24b4';
const PLATFORM_H = 1; // ホームの高さ（線路から）。よじ登れる
const PLATFORM_HALF = 12; // ホームの半幅
const PLATFORM_NEAR = 10; // ホームの手前の端 (z)
const PLATFORM_FAR = -150; // ホームの奥の端 (z)
const TRACK_OUTER = PLATFORM_HALF + 6; // 線路の外側の端 (|x|)。ここから擁壁
// レール (|x|)。電車（ホームの縁にぴったり付ける、幅 4m）の真下に来るよう、ホームの縁に寄せる
const RAIL_NEAR = PLATFORM_HALF + 1.2;
const RAIL_FAR = PLATFORM_HALF + 2.8;
const WALL_H = 6;
const LINE_NEAR = PLATFORM_NEAR + 4; // 線路と擁壁が続く範囲 (z)。ホームの両端から少しだけはみ出させる
const LINE_FAR = PLATFORM_FAR - 4;
// ホームの屋根: 柱の上、ホームから 6m の高さに載せる。端の柱より少し先まで覆う
const ROOF_Y0 = PLATFORM_H + 6;
const ROOF_Y1 = ROOF_Y0 + 0.5;
const ROOF_HALF = PLATFORM_HALF - 2;
const ROOF_NEAR = -4;
const ROOF_FAR = -136;
// 奥の端の階段: 最後のベンチの先から上り始め、架線より上の跨線橋まで上る
const STAIR_NEAR = -135;
const STAIR_STEPS = 16;
const STAIR_RISE = 0.5;
const STAIR_HALF = 3.5;
// 手前の端の改札: 改札機（幅 1m・ホームから 1.5m）を x = -8..8 に 2m おきに並べる
const GATE_COUNT = 4; // 真ん中から片側の台数
const GATE_H = 1.5;
const GATE_FAR = 7; // 改札機のホーム側の端 (z)
const GATE_NEAR = 9.5;
const GATE_MID = 8.5; // フラップと柵の位置 (z)
// 改札の先のコンコース: 突き当たりの壁 (z) と、床から天井までの高さ
const HALL_END = 28;
const HALL_H = 5;
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
const LIGHT_GLASS = 0.36;
const LIGHT_STAIRWELL = 0.08; // 階段の口の奥の暗がり
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
    // 右の線路（side 1）と左の線路（side -1）に 1 本ずつ
    const movingTrain = game.difficulty !== 'easy';
    const trains = [1, -1].map((side) => {
        const trainDecor = [];
        const trainColliders = [];
        const doors = [1, -1].map((dir) => ({ slide: dir * DOOR_W / 2, decor: [], colliders: [] }));
        buildTrain(trainDecor, trainColliders, side, doors);
        if (!movingTrain) {
            decor.push(...trainDecor);
            colliders.push(...trainColliders);
        }
        return { side, decor: trainDecor, colliders: trainColliders, doors };
    });
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
    // 見た目だけの箱（y はホームの上からの高さ）
    const deco = (x0, x1, z0, z1, y0, y1, light) => decor.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), y0: PLATFORM_H + y0, h: PLATFORM_H + y1, light, look: 'struct' });
    // 中ほどの、下の通路へ降りる階段の口: 腰壁の上にガラスをはめた囲いで三方を囲い、手前（+Z）だけ開けて、中の暗がりへ下りていくように見せる。
    // 囲いの上には薄い屋根を載せる（ホームから 2.5m。狙撃手が乗る）。当たり判定は囲い全体を 1 つの箱にする
    {
        const near = -62;
        const far = -78;
        colliders.push({ minX: -2, maxX: 2, minZ: far, maxZ: near, h: PLATFORM_H + 2.5 });
        const glassWall = (x0, x1, z0, z1) => {
            deco(x0, x1, z0, z1, 0, 1, LIGHT_PILLAR); // 腰壁
            deco(x0, x1, z0, z1, 1, 2.3, LIGHT_GLASS); // ガラス
        };
        for (const s of [-1, 1]) {
            glassWall(s * 1.8, s * 2, near, far);
            for (let z = near; z >= far; z -= 2)
                deco(s * 1.75, s * 2.05, z - 0.08, z + 0.08, 0, 2.3, LIGHT_PILLAR); // ガラスの枠
        }
        glassWall(-2, 2, far, far + 0.2);
        for (const x of [-1, 0, 1])
            deco(x - 0.08, x + 0.08, far - 0.05, far + 0.25, 0, 2.3, LIGHT_PILLAR);
        deco(-2.1, 2.1, near + 0.1, far - 0.1, 2.3, 2.5, LIGHT_ROOF); // 屋根
        // 開いた口: 奥は暗がり。両脇の手すりと、口の上の案内板
        deco(-1.8, 1.8, near - 1, near - 1.05, 0, 2.3, LIGHT_STAIRWELL);
        deco(-1.8, 1.8, near - 1.05, far + 0.2, 0, 0.02, LIGHT_STAIRWELL);
        for (const s of [-1, 1])
            deco(s * 1.55, s * 1.65, near, near - 1, 0.9, 1, LIGHT_POLE);
        deco(-1.5, 1.5, near + 0.05, near, 1.95, 2.25, LIGHT_SIGN);
    }
    // 売店: 品物を並べた店の箱に、ひさしを張り出した屋根を載せる（ホームから 2.5m。狙撃手が乗る）。
    // 左右（線路の側）に売り台を出し、その上の壁に品物の棚、ひさしの下に看板の帯を回す
    {
        const near = -96;
        const far = -102;
        box(-2, near - 0.5, 2, far + 0.5, PLATFORM_H + 2.2, LIGHT_FURNITURE, 'struct');
        boxes.push({ minX: -2.5, maxX: 2.5, minZ: far, maxZ: near, y0: PLATFORM_H + 2.2, h: PLATFORM_H + 2.5, light: LIGHT_ROOF, look: 'struct' });
        for (const s of [-1, 1]) {
            box(s * 2, near - 1, s * 2.5, far + 1, PLATFORM_H + 1, LIGHT_PILLAR, 'struct'); // 売り台
            deco(s * 2, s * 2.05, near - 0.5, far + 0.5, 1.85, 2.2, LIGHT_SIGN); // 看板の帯
            // 品物の棚: 3 段に、明るさの違う小箱を並べる
            for (let row = 0; row < 3; row++) {
                for (let i = 0; i < 8; i++) {
                    const z = near - 1 - i * 0.5;
                    const light = [0.95, 0.5, 0.75, 0.35][(i + row * 3) % 4];
                    deco(s * 2, s * 2.12, z - 0.05, z - 0.45, 1.05 + row * 0.27, 1.27 + row * 0.27, light);
                }
            }
        }
        // 手前の面: 新聞の差し込み台
        deco(-1.5, 1.5, near - 0.5, near - 0.25, 0, 1.2, LIGHT_PILLAR);
        for (let i = 0; i < 3; i++)
            deco(-1.4, 1.4, near - 0.25, near - 0.2, 0.35 + i * 0.3, 0.55 + i * 0.3, [0.95, 0.75, 0.9][i]);
    }
    // ホームの中央に並ぶベンチ: 背中合わせの 1 人掛けの座面を 4 つずつ、真ん中の背もたれに沿って並べ、脚で支える
    for (const z of [-20, -40, -110, -130]) {
        colliders.push({ minX: -1, maxX: 1, minZ: z - 4, maxZ: z, h: PLATFORM_H + 0.75 });
        colliders.push({ minX: -0.15, maxX: 0.15, minZ: z - 4, maxZ: z, h: PLATFORM_H + 1.4 });
        deco(-0.1, 0.1, z - 0.05, z - 3.95, 0.75, 1.4, LIGHT_FURNITURE); // 背もたれ
        for (let i = 0; i < 4; i++) {
            for (const s of [-1, 1]) {
                deco(s * 0.15, s * 1, z - i - 0.08, z - i - 0.92, 0.6, 0.75, LIGHT_FURNITURE); // 座面
                deco(s * 0.1, s * 0.15, z - i - 0.2, z - i - 0.8, 0.75, 1.3, LIGHT_FURNITURE); // 背当て
            }
        }
        for (const zz of [z - 0.3, z - 2, z - 3.7])
            deco(-0.85, 0.85, zz - 0.05, zz + 0.05, 0, 0.6, LIGHT_POLE); // 脚
    }
    // 奥の端の階段: 奥へ 1m ごとに 0.5m ずつ上り、線路をまたぐ跨線橋につながる。両脇に壁を立てる。
    // 跨線橋は架線より上に架け、中へは入れない（階段を上りきった所の入口は暗い板で見せるだけ）
    for (let i = 0; i < STAIR_STEPS; i++) {
        const z = STAIR_NEAR - i;
        const top = PLATFORM_H + STAIR_RISE * (i + 1);
        box(-STAIR_HALF, z, STAIR_HALF, z - 1, top, LIGHT_PLATFORM, 'terrain');
        for (const s of [-1, 1])
            box(s * STAIR_HALF, z, s * (STAIR_HALF + 0.5), z - 1, top + 1, LIGHT_PILLAR, 'struct');
    }
    const bridgeY0 = PLATFORM_H + STAIR_RISE * STAIR_STEPS;
    const bridgeNear = STAIR_NEAR - STAIR_STEPS;
    boxes.push({ minX: -(TRACK_OUTER + 2), maxX: TRACK_OUTER + 2, minZ: bridgeNear - 6, maxZ: bridgeNear, y0: bridgeY0, h: bridgeY0 + 3.5, light: LIGHT_WALL, look: 'struct' });
    decor.push({ minX: -STAIR_HALF, maxX: STAIR_HALF, minZ: bridgeNear, maxZ: bridgeNear + 0.05, y0: bridgeY0, h: bridgeY0 + 2.5, light: LIGHT_SIGN, look: 'struct' });
    // 手前の端の改札: 改札機を 2m おきに並べ、間の通路はフラップを閉じておく（通れない）。改札機の外からホームの縁までは柵でふさぐ
    for (let k = -GATE_COUNT; k <= GATE_COUNT; k++) {
        const x = k * 2;
        box(x - 0.5, GATE_NEAR, x + 0.5, GATE_FAR, PLATFORM_H + GATE_H, LIGHT_FURNITURE, 'struct');
        // 上面の読み取り部（ホーム側の端）
        decor.push({ minX: x - 0.5, maxX: x + 0.5, minZ: GATE_FAR, maxZ: GATE_FAR + 0.5, y0: PLATFORM_H + GATE_H, h: PLATFORM_H + GATE_H + 0.05, light: LIGHT_SIGN, look: 'struct' });
        if (k < GATE_COUNT) {
            boxes.push({ minX: x + 0.5, maxX: x + 1.5, minZ: GATE_MID - 0.1, maxZ: GATE_MID + 0.1, y0: PLATFORM_H + 0.5, h: PLATFORM_H + GATE_H - 0.25, light: LIGHT_SIGN, look: 'struct' });
        }
    }
    for (const s of [-1, 1])
        box(s * (GATE_COUNT * 2 + 0.5), GATE_MID - 0.25, s * PLATFORM_HALF, GATE_MID + 0.25, PLATFORM_H + GATE_H, LIGHT_PILLAR, 'struct');
    // 改札の先のコンコース: ホームと同じ高さの床を手前へ延ばし、両脇の壁と天井で囲う。電車に当たらないよう、ホームの幅の内側に収める。
    // 左の壁に券売機と運賃表、右の壁に窓口、突き当たりに出口を 2 つ（暗い板で見せるだけ）
    const hallY1 = PLATFORM_H + HALL_H;
    box(-PLATFORM_HALF, PLATFORM_NEAR, PLATFORM_HALF, HALL_END, PLATFORM_H, LIGHT_PLATFORM, 'terrain');
    for (const s of [-1, 1])
        box(s * (PLATFORM_HALF - 0.5), GATE_MID + 0.25, s * PLATFORM_HALF, HALL_END, hallY1, LIGHT_WALL, 'struct');
    box(-PLATFORM_HALF, HALL_END, PLATFORM_HALF, HALL_END + 0.5, hallY1, LIGHT_WALL, 'struct');
    boxes.push({ minX: -PLATFORM_HALF, maxX: PLATFORM_HALF, minZ: GATE_MID - 0.25, maxZ: HALL_END + 0.5, y0: hallY1, h: hallY1 + 0.5, light: LIGHT_ROOF, look: 'struct' });
    // 改札の上の垂れ壁
    boxes.push({ minX: -PLATFORM_HALF, maxX: PLATFORM_HALF, minZ: GATE_MID - 0.25, maxZ: GATE_MID + 0.25, y0: hallY1 - 1, h: hallY1, light: LIGHT_WALL, look: 'struct' });
    // 天井の照明: 細い明るい帯を奥へ向けて並べる
    for (const x of [-6, 0, 6])
        decor.push({ minX: x - 0.25, maxX: x + 0.25, minZ: GATE_MID + 0.5, maxZ: HALL_END - 0.5, y0: hallY1 - 0.1, h: hallY1, light: 0.95, look: 'struct' });
    // 券売機（左の壁沿い）と、その上の運賃表
    const wallL = -(PLATFORM_HALF - 0.5);
    for (let z = 13; z < 21; z += 1.5) {
        box(wallL, z, wallL + 1, z + 1, PLATFORM_H + 1.8, LIGHT_FURNITURE, 'struct');
        decor.push({ minX: wallL + 1, maxX: wallL + 1.05, minZ: z + 0.15, maxZ: z + 0.85, y0: PLATFORM_H + 0.9, h: PLATFORM_H + 1.5, light: LIGHT_SIGN, look: 'struct' });
    }
    decor.push({ minX: wallL, maxX: wallL + 0.05, minZ: 12.5, maxZ: 21, y0: PLATFORM_H + 2.3, h: PLATFORM_H + 3.8, light: LIGHT_SIGN, look: 'struct' });
    // 窓口（右の壁沿い）: カウンターと、その上の暗いガラス
    const wallR = PLATFORM_HALF - 0.5;
    box(wallR - 1.5, 14, wallR, 20, PLATFORM_H + 1.1, LIGHT_FURNITURE, 'struct');
    decor.push({ minX: wallR - 0.05, maxX: wallR, minZ: 14, maxZ: 20, y0: PLATFORM_H + 1.1, h: PLATFORM_H + 3, light: LIGHT_SIGN, look: 'struct' });
    // 突き当たりの出口と、その上の案内板
    for (const x of [-6, 6]) {
        decor.push({ minX: x - 2.5, maxX: x + 2.5, minZ: HALL_END - 0.05, maxZ: HALL_END, y0: PLATFORM_H, h: PLATFORM_H + 3, light: LIGHT_SIGN, look: 'struct' });
        decor.push({ minX: x - 2, maxX: x + 2, minZ: HALL_END - 0.6, maxZ: HALL_END - 0.3, y0: hallY1 - 1.3, h: hallY1 - 0.7, light: LIGHT_SIGN, look: 'struct' });
    }
    // コンコースの柱
    for (const x of [-4, 4])
        box(x - 0.5, 18.5, x + 0.5, 19.5, hallY1, LIGHT_PILLAR, 'struct');
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
        // 右の電車は手前から来て奥へ、左の電車は奥から来て手前へ走り去る。どちらも
        // 手前（奥）から走ってきて、ゆっくり止まる → 駅で客を待つ → だんだん速くなって走り去る → 反対の遠くへ戻す（見えない所）。
        // 走っている間は線路の上に出るとはねられる。走り出したら屋根の上の人は振り落とす
        movers: movingTrain ? trains.map(({ side, decor: d, colliders: c, doors }) => {
            const run = side * TRAIN_RUN; // 右: 手前から来て奥へ
            // 見えない所で待つ時間。降りる敵が待っているときは飛ばして、すぐ走ってくる（左は遅れて来る）
            const wait = side > 0 ? 3 : 6;
            return {
                parts: [{ boxes: [], decor: d, colliders: c, doors }],
                path: [
                    { x: 0, z: run, time: 0 },
                    { x: 0, z: run, time: wait, skip: true },
                    { x: 0, z: 0, time: 8, ease: 'out' },
                    { x: 0, z: 0, time: 9 },
                    { x: 0, z: -run, time: 11, ease: 'in' },
                ],
                hazard: true,
                frontOnly: true,
            };
        }) : [],
        decor,
        colliders,
        scenery,
        lines,
        // 擁壁の内側の、奥は階段の上り口、手前は改札（フラップと柵の並び）までを動ける。境界の壁は階段の前と改札に重なる
        bounds: { minX: -TRACK_OUTER, maxX: TRACK_OUTER, minZ: STAIR_NEAR, maxZ: GATE_MID },
        start: { x: 0, y: PLATFORM_H, z: 4 },
        // 敵の出る所: ホームの上の、柱・ベンチ・階段の囲い・売店を避けた所と、電車の屋根の上（車両の真ん中）。
        // 狙撃手だけは、残りの車両の屋根と、階段の囲いと売店の上にも出る（どれもホームからよじ登れる高さ）
        enemySpawns: [
            ...[[-4, -16], [3, -30], [-8, -48], [9, -58], [-6, -85], [9, -92], [4, -118], [-9, -126]].map(([x, z]) => ({ x, y: PLATFORM_H, z })),
            ...(!movingTrain ? trains.flatMap(({ side }) => [1, 3].map((i) => ({ x: side * TRAIN_CX, y: ROOF_Y, z: CAR_NEAR - i * (CAR_LEN + CAR_GAP) - CAR_LEN / 2 }))) : []),
            ...(!movingTrain ? trains.flatMap(({ side }) => [0, 2, 4].map((i) => ({ x: side * TRAIN_CX, y: ROOF_Y, z: CAR_NEAR - i * (CAR_LEN + CAR_GAP) - CAR_LEN / 2, perch: true }))) : []),
            // 電車のドアの中。その電車が止まっている間だけ選ばれ、ホームへ降りてくる（車両ごとに、真ん中の 2 つのドア）
            ...trains.flatMap(({ side }, train) => Array.from({ length: CAR_COUNT }, (_, i) => [1, 2].map((k) => ({
                x: side * (TRAIN_X0 + DOOR_D / 2),
                y: BODY_Y0,
                z: CAR_NEAR - i * (CAR_LEN + CAR_GAP) - CAR_LEN / DOORS * (k + 0.5),
                train,
            }))).flat()),
            { x: 0, y: PLATFORM_H + 2.5, z: -70, perch: true },
            { x: 0, y: PLATFORM_H + 2.5, z: -99, perch: true },
        ],
        trainOnly: true, // 始めの敵のあとは、駅に着いた電車から降りてくる
        // 主役は狙撃手。長いホームの奥や電車の屋根から、見通しを通して撃ってくる。
        // 最初のステージなので easy は銃撃役と狙撃手だけ。normal から、電車を降りるなり連射してくる二丁拳銃と、
        // 電車の着くのに合わせてホームの上を飛んで来るドローンを混ぜる
        mix: {
            easy: { gunner: 0.8, sniper: 0.2 },
            normal: { gunner: 0.47, sniper: 0.27, dual: 0.13, drone: 0.13 },
            hard: { gunner: 0.3, sniper: 0.3, dual: 0.2, drone: 0.2 },
        },
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
const TRAIN_X0 = PLATFORM_HALF; // ホーム側の面（ホームの縁にぴったり付ける。ドアからそのまま降りられる）
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
const DOOR_D = 2; // ドアの奥行き。ホーム側の面からこの深さだけ、床の高さで空いている（敵が立って待つ所）
const DOOR_TOP = 3; // ドアの口の上の縁（床から 2m）。その上は鴨居
const DOOR_INSET = 0.1; // 閉まった戸の、車体の面からの引っ込み
const WIN_Y0 = 2; // 窓の帯（下の縁に太線が乗る）
const WIN_Y1 = 3;
const TRAIN_RUN = 300; // 走り去る・走ってくるときの、駅からの距離。編成（128m）がすっかり見えなくなる所まで
// プレイヤー専用の車体判定。敵の降車用の開口部とは別に扱う。
export const trainBody = { x0: TRAIN_X0, x1: TRAIN_X1, near: CAR_NEAR, length: CAR_LEN, gap: CAR_GAP, count: CAR_COUNT, roof: ROOF_Y, platform: PLATFORM_H };
const L_BODY = 0.9;
const L_ROOF = 0.62;
const L_WINDOW = 0.24;
const L_UNDER = 0.28;
const L_ROOF_UNIT = 0.5;
const L_INSIDE = 0.36; // ドアの口から見える車内の壁と天井
const L_FLOOR = 0.5; // 車内の床
const L_DOOR = 0.78; // 引き戸（車体より少し暗くして、閉まっていてもドアの所が分かるように）
// doors は +Z へ開く戸と -Z へ開く戸（閉まった位置で書く）。止まっている間だけ開く（簡単では電車が動かないので戸も付けない）
function buildTrain(decor, colliders, side, doors) {
    const X0 = side * TRAIN_X0;
    const X1 = side * TRAIN_X1;
    const CX = side * TRAIN_CX;
    const D = side * DOOR_D;
    const H = side * 0.5;
    const gridOrigin = { x: X0, y: 0, z: CAR_NEAR };
    // y0〜y1 の高さに、x と z の範囲で浮いた箱を置く
    const part = (x0, x1, z0, z1, y0, y1, light) => decor.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), y0, h: y1, light, look: 'terrain', gridOrigin });
    const solid = (x0, x1, z0, z1, h, y0) => colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), h, y0 });
    // 車体の両側面（ホーム側とその反対側）に、面からわずかに浮かせて貼る
    const onSides = (z0, z1, y0, y1, light) => {
        part(X0 - side * SKIN, X0, z0, z1, y0, y1, light);
        part(X1, X1 + side * SKIN, z0, z1, y0, y1, light);
    };
    for (let i = 0; i < CAR_COUNT; i++) {
        const front = CAR_NEAR - i * (CAR_LEN + CAR_GAP); // この車両の +Z 側の端
        const back = front - CAR_LEN;
        const pitch = CAR_LEN / DOORS;
        const doorCenters = Array.from({ length: DOORS }, (_, k) => front - pitch / 2 - k * pitch);
        // 車体の当たり判定: ホーム側の DOOR_D だけは、ドアの所を床から DOOR_TOP まで空ける（床と、上の鴨居は残す）。奥は全部ふさぐ
        const cuts = [front, ...doorCenters.flatMap((c) => [c + DOOR_W / 2, c - DOOR_W / 2]), back];
        solid(X0 + D, X1, front, back, ROOF_Y);
        for (let k = 0; k < cuts.length; k += 2)
            solid(X0, X0 + D, cuts[k], cuts[k + 1], ROOF_Y);
        for (let k = 1; k + 1 < cuts.length; k += 2) {
            solid(X0, X0 + D, cuts[k], cuts[k + 1], BODY_Y0);
            solid(X0, X0 + D, cuts[k], cuts[k + 1], ROOF_Y, DOOR_TOP);
        }
        // 車体・屋根・床下。車体はドアの所だけ、奥行き DOOR_D・高さ DOOR_TOP の口を空ける。
        // 口の上は車体の色の鴨居でつなぎ、口の中（床・天井・奥と左右の壁）は暗い内装を貼って、開いたドアから車内が見えるようにする
        part(X0 + D, X1, front, back, BODY_Y0, BODY_Y1, L_BODY);
        for (let k = 0; k < cuts.length; k += 2)
            part(X0, X0 + D, cuts[k], cuts[k + 1], BODY_Y0, BODY_Y1, L_BODY);
        for (let k = 1; k + 1 < cuts.length; k += 2) {
            const [z0, z1] = [cuts[k], cuts[k + 1]];
            part(X0, X0 + D, z0, z1, DOOR_TOP, BODY_Y1, L_BODY);
            part(X0, X0 + D, z0, z1, BODY_Y0 - SKIN, BODY_Y0 + SKIN, L_FLOOR); // 床下の箱の上面とちらつかないよう、わずかに上へ出す
            part(X0, X0 + D, z0, z1, DOOR_TOP - SKIN, DOOR_TOP, L_INSIDE);
            part(X0 + D - side * SKIN, X0 + D, z0, z1, BODY_Y0, DOOR_TOP, L_INSIDE);
            for (const z of [z0, z1 + SKIN])
                part(X0, X0 + D, z, z - SKIN, BODY_Y0, DOOR_TOP, L_INSIDE);
            // 引き戸（両開きの 2 枚）: 面から少し引っ込めて、上半分に窓。開くと両脇の車体の中へ隠れる
            const c = (z0 + z1) / 2;
            for (const door of doors) {
                const dir = Math.sign(door.slide);
                const leaf = (x0, x1, y0, y1, inset, light) => door.decor.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(c + dir * inset, c + dir * (DOOR_W / 2 - inset)), maxZ: Math.max(c + dir * inset, c + dir * (DOOR_W / 2 - inset)), y0, h: y1, light, look: 'terrain', gridOrigin });
                leaf(X0 + side * DOOR_INSET, X0 + side * (DOOR_INSET + 0.1), BODY_Y0, DOOR_TOP, 0, L_DOOR);
                leaf(X0 + side * (DOOR_INSET - SKIN), X0 + side * DOOR_INSET, WIN_Y0, DOOR_TOP - 0.25, 0.15, L_WINDOW);
            }
            doors[0].colliders.push({ minX: Math.min(X0, X0 + side * 0.5), maxX: Math.max(X0, X0 + side * 0.5), minZ: z1, maxZ: z0, y0: BODY_Y0, h: DOOR_TOP });
        }
        part(X0 + H, X1 - H, front - 0.5, back + 0.5, BODY_Y1, ROOF_Y, L_ROOF);
        part(X0 + H, X1 - H, front - 1, back + 1, 0.5, BODY_Y0, L_UNDER);
        // 窓の帯: ドアの所で途切れさせて、ドアの並びだけを見せる
        const edges = [front - 1, ...doorCenters.flatMap((c) => [c + DOOR_W / 2, c - DOOR_W / 2]), back + 1];
        for (let k = 0; k < edges.length; k += 2)
            onSides(edges[k], edges[k + 1], WIN_Y0, WIN_Y1, L_WINDOW);
        // 屋根の冷房装置（2 台）。上に乗れるよう、当たり判定も持たせる
        for (const c of [front - 6, back + 6]) {
            part(CX - 1, CX + 1, c + 2, c - 2, ROOF_Y, ROOF_Y + 0.5, L_ROOF_UNIT);
            solid(CX - 1, CX + 1, c + 2, c - 2, ROOF_Y + 0.5);
        }
        // 次の車両との間の幌。乗り移れるよう、当たり判定も持たせる
        if (i < CAR_COUNT - 1) {
            part(CX - 1, CX + 1, back, back - CAR_GAP, BODY_Y0 + 0.5, BODY_Y1, L_UNDER);
            solid(CX - 1, CX + 1, back, back - CAR_GAP, BODY_Y1);
        }
    }
    // 両端の運転台: 前面の大きな窓だけ
    const ends = [[CAR_NEAR, 1], [CAR_NEAR - CAR_COUNT * CAR_LEN - (CAR_COUNT - 1) * CAR_GAP, -1]];
    for (const [z, dir] of ends)
        part(X0 + H, X1 - H, z, z + dir * SKIN, WIN_Y0, WIN_Y1, L_WINDOW);
}

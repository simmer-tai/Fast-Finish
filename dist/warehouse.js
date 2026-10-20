const HALF_W = 30; // 内壁の半幅 (|x|)
const NEAR = 12; // 手前の内壁 (z)。入口のシャッターが並ぶ
const FAR = -108; // 奥の内壁 (z)
const WALL_T = 1.5; // 壁の厚さ
const WALL_H = 15;
// 棚: 背中合わせの 2 連（幅 3m）。段は 2.5m おきで、天板は 7.5m（中二階からよじ登れる高さ）
const RACK_W = 3;
const RACK_ROWS = [6, 15, 24]; // 棚の列の内側の端 (|x|)。真ん中の通路は 12m、列の間は 6m、壁ぎわは 3m
const RACK_BLOCKS = [[-10, -46], [-54, -90]]; // 棚の並ぶ範囲 (z)。間が横通路
const BAY = 4; // 支柱の間隔
const LEVEL = 2.5; // 段の高さ
const LEVELS = 3;
const RACK_H = LEVEL * LEVELS; // 天板の上面
const BEAM = 0.5; // 段の梁の太さ
const RACK_DEPTH = 1; // 荷を載せる奥行き（片側）。真ん中の 1m は空ける
// 中二階: 奥の壁ぎわ一面。床の上面は 4.5m（2m の荷の上からよじ登れ、ここから棚の天板へもよじ登れる）
const MEZZ_FRONT = -94;
const MEZZ_Y0 = 4;
const MEZZ_Y = 4.5;
// 屋根: 屋根板は 14m。トラスは下弦材（11〜11.5m、上に立てる）と上弦材（屋根板の真下）を束でつなぐ。
// 下弦材の上から屋根板の裏までは 2.5m 空けて、上に立っても頭が屋根にめり込まないようにする。壁は屋根より少し高く立ち上げる
const TRUSS_Y0 = 11;
const TRUSS_Y1 = 11.5;
const ROOF_Y0 = 14;
const ROOF_Y1 = 14.5;
const CHORD = 0.5; // 上弦材の太さ
const TRUSS_STEP = 8;
const SKYLIGHT = 4; // トラスの間のうち、天窓にする長さ（残りが屋根板）
// 明るさ（0 が黒）。高いもの・重いものほど暗くする
const LIGHT_WALL = 0.72;
const LIGHT_PILASTER = 0.6;
const LIGHT_SHUTTER = 0.4;
const LIGHT_BUMPER = 0.18;
const LIGHT_UPRIGHT = 0.32;
const LIGHT_BEAM = 0.26;
const LIGHT_RACK_CORE = 0.2;
const LIGHT_RACK_TOP = 0.5;
const LIGHT_PALLET = 0.46;
const LIGHT_CARGO_MIN = 0.66;
const LIGHT_CARGO_MAX = 0.92;
const LIGHT_MEZZ = 0.62;
const LIGHT_COLUMN = 0.84;
const LIGHT_RAIL = 0.3;
const LIGHT_OFFICE = 0.86;
const LIGHT_WINDOW = 0.24;
const LIGHT_TRUSS = 0.36;
const LIGHT_ROOF = 0.78;
const LIGHT_LAMP = 0.22;
const LIGHT_LIFT_BODY = 0.4;
const LIGHT_LIFT_DARK = 0.18;
const LIGHT_LIFT_MAST = 0.26;
export function buildWarehouse() {
    const boxes = [];
    const decor = [];
    const colliders = [];
    const lines = [];
    const rect = (x0, x1, z0, z1) => ({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
    const box = (x0, x1, z0, z1, y0, h, light, look = 'struct') => boxes.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look });
    const deco = (x0, x1, z0, z1, y0, h, light, look = 'struct') => decor.push({ ...rect(x0, x1, z0, z1), y0: y0 || undefined, h, light, look });
    let seed = 7193;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const cargoLight = () => LIGHT_CARGO_MIN + rand() * (LIGHT_CARGO_MAX - LIGHT_CARGO_MIN);
    // ---- 壁 ----
    // 長い壁は区切って並べ、始めの位置から順にせり上がるようにする
    for (const s of [-1, 1]) {
        for (let z = NEAR + WALL_T; z > FAR - WALL_T; z -= 10)
            box(s * HALF_W, s * (HALF_W + WALL_T), z, Math.max(z - 10, FAR - WALL_T), 0, WALL_H, LIGHT_WALL);
    }
    for (const z of [NEAR, FAR]) {
        const z1 = z === NEAR ? NEAR + WALL_T : FAR - WALL_T;
        for (let x = -HALF_W; x < HALF_W; x += 10)
            box(x, Math.min(x + 10, HALF_W), z, z1, 0, WALL_H, LIGHT_WALL);
    }
    // 側壁の柱型: トラスの真下で壁から 1m 張り出す。壁走りの途中の切れ目になる
    const trussZ = [];
    for (let z = NEAR - 4; z > FAR; z -= TRUSS_STEP)
        trussZ.push(z);
    for (const z of trussZ)
        for (const s of [-1, 1])
            box(s * (HALF_W - 1), s * HALF_W, z + 0.5, z - 0.5, 0, ROOF_Y0, LIGHT_PILASTER);
    // 入口のシャッター: 手前の壁に 4 枚。壁の面からわずかに浮かせて貼り、左右に車止めのゴムを付ける
    for (const cx of [-21, -7, 7, 21]) {
        deco(cx - 3, cx + 3, NEAR - 0.05, NEAR, 0, 7, LIGHT_SHUTTER);
        deco(cx - 3.5, cx + 3.5, NEAR - 0.1, NEAR, 7, 7.5, LIGHT_BEAM); // シャッターの箱
        for (const s of [-1, 1])
            box(cx + s * 3.5, cx + s * 4, NEAR - 0.5, NEAR, 0.5, 1.5, LIGHT_BUMPER);
        // 床の誘導線: シャッターの前に、荷さばきの枠を引く
        lines.push({ x: cx, y: 0.03, z: NEAR - 6, w: 6, d: 0.3 });
        for (const s of [-1, 1])
            lines.push({ x: cx + s * 3, y: 0.03, z: NEAR - 3, w: 0.3, d: 6 });
    }
    // ---- 棚（パレットラック） ----
    // 背中合わせの 2 連の棚。真ん中は仕切らずに 1m 空け、荷の抜けた所からは棚の中へ入り、反対側の通路へ通り抜けられる。
    // 支柱・段の板・天板・荷はどれも当たり判定を持つ（段の板の上に乗れて、荷の抜けた段へよじ登れる）。
    // 段の板から上の段の板の裏までは 2m 空けて、立ったまま入れるようにする。
    // 荷は段ごと・間ごとに高さと明るさを変え、ところどころ抜いておく。両側とも抜いた間が、棚を通り抜ける近道になる
    for (const [zNear, zFar] of RACK_BLOCKS) {
        for (const s of [-1, 1]) {
            for (const inner of RACK_ROWS) {
                const x0 = s * inner;
                const x1 = s * (inner + RACK_W);
                const minX = Math.min(x0, x1);
                const maxX = Math.max(x0, x1);
                // 天板（区切って、手前から順に組み上がるようにする）
                for (let z = zNear; z > zFar; z -= BAY * 3)
                    box(minX, maxX, z, Math.max(z - BAY * 3, zFar), RACK_H - BEAM, RACK_H, LIGHT_RACK_TOP);
                // 段の板
                for (let k = 1; k < LEVELS; k++)
                    box(minX, maxX, zNear, zFar, k * LEVEL - BEAM, k * LEVEL, LIGHT_BEAM);
                // 支柱: 両面の縁に、間の境目ごとに立てる（両端にも）。段の板と重ならないよう、段ごとに分ける
                for (let z = zNear; z >= zFar; z -= BAY) {
                    const z0 = Math.max(z, zFar + 0.5);
                    for (const [p0, p1] of [[minX, minX + 0.5], [maxX - 0.5, maxX]]) {
                        for (let k = 0; k < LEVELS; k++)
                            box(p0, p1, z0, z0 - 0.5, k * LEVEL, (k + 1) * LEVEL - BEAM, LIGHT_UPRIGHT);
                    }
                }
                // 荷
                for (let z = zNear; z > zFar + 0.5; z -= BAY) {
                    for (let k = 0; k < LEVELS; k++) {
                        if (rand() < [0.3, 0.2, 0.1][k])
                            continue; // 両側とも抜いた所（通り抜けられる）
                        const y0 = k * LEVEL;
                        for (const [f0, f1] of [[minX, minX + RACK_DEPTH], [maxX - RACK_DEPTH, maxX]]) {
                            if (rand() < 0.15)
                                continue; // 片側だけ抜けた所
                            const tall = () => y0 + [1, 1.5, 2][Math.floor(rand() * 3)];
                            // 間いっぱいの 1 つの荷か、半分ずつの 2 つの荷
                            if (rand() < 0.3) {
                                box(f0, f1, z - 1, z - 2.5, y0, tall(), cargoLight());
                                if (rand() < 0.7)
                                    box(f0, f1, z - 2.5, z - 3.5, y0, tall(), cargoLight());
                            }
                            else {
                                box(f0, f1, z - 1, z - 3.5, y0, tall(), cargoLight());
                            }
                        }
                    }
                }
                // 床の誘導線: 棚の両面から 0.5m 離して引く
                for (const x of [minX - 0.5, maxX + 0.5]) {
                    if (Math.abs(x) > HALF_W - 1)
                        continue;
                    lines.push({ x, y: 0.03, z: (zNear + zFar) / 2, w: 0.3, d: zNear - zFar });
                }
            }
        }
    }
    // 真ん中の通路の横断の線（横通路の両端）
    for (const z of [RACK_BLOCKS[0][1] - 0.5, RACK_BLOCKS[1][0] + 0.5])
        lines.push({ x: 0, y: 0.03, z, w: 2 * (HALF_W - 3), d: 0.3 });
    // ---- 積んだパレット ----
    // 2m 四方のパレット（高さ 0.5m）に荷を載せたものを、層 (layers) を重ねて置く。層の高さは 1.5m（パレット 0.5 + 荷 1）か 2m（パレット 0.5 + 荷 1.5）。
    // 上に乗れて、よじ登りの足場になる
    const pallet = (x, z, layers, layerH) => {
        for (let k = 0; k < layers; k++) {
            const y0 = k * layerH;
            box(x, x + 2, z, z - 2, y0, y0 + 0.5, LIGHT_PALLET);
            box(x, x + 2, z, z - 2, y0 + 0.5, y0 + layerH, cargoLight());
        }
    };
    // 荷さばきの広場: シャッターの前の左右に、高さの違う山を作る（1.5m → 3m と段々に登れる）
    for (const s of [-1, 1]) {
        const x = s > 0 ? 14 : -24;
        pallet(x, 4, 1, 1.5);
        pallet(x + 2, 4, 2, 1.5);
        pallet(x + 4, 4, 2, 1.5);
        pallet(x + 2, 2, 1, 1.5);
        pallet(x + 4, 2, 1, 2);
        pallet(x + 8, 0, 1, 2);
    }
    pallet(-10, -2, 1, 1.5);
    // 横通路に置きっぱなしの荷
    pallet(-3, -48, 1, 2);
    pallet(-1, -48, 2, 1.5);
    pallet(19, -50, 1, 1.5);
    pallet(-22, -48, 2, 2);
    // 中二階の手前: 2m の荷から中二階へよじ登れる所を 2 か所
    pallet(-14, MEZZ_FRONT + 2, 1, 2);
    pallet(-12, MEZZ_FRONT + 2, 1, 1.5);
    pallet(10, MEZZ_FRONT + 2, 1, 2);
    // ---- 中二階 ----
    for (let x = -HALF_W; x < HALF_W; x += 10) {
        for (let z = MEZZ_FRONT; z > FAR; z -= 7)
            box(x, Math.min(x + 10, HALF_W), z, Math.max(z - 7, FAR), MEZZ_Y0, MEZZ_Y, LIGHT_MEZZ, 'terrain');
    }
    // 床を支える柱
    for (const x of [-20, -10, 0, 10, 20])
        for (const z of [MEZZ_FRONT - 1, MEZZ_FRONT - 8])
            box(x - 0.5, x + 0.5, z, z - 1, 0, MEZZ_Y0, LIGHT_COLUMN);
    // 手すり: 縁に沿った細い横棒と 2m おきの支柱。よじ登りの邪魔にならないよう、当たり判定は持たせない
    deco(-HALF_W + 1, HALF_W - 1, MEZZ_FRONT - 0.1, MEZZ_FRONT - 0.2, MEZZ_Y + 1, MEZZ_Y + 1.1, LIGHT_RAIL);
    for (let x = -HALF_W + 1; x <= HALF_W - 1; x += 2)
        deco(x - 0.05, x + 0.05, MEZZ_FRONT - 0.1, MEZZ_FRONT - 0.2, MEZZ_Y, MEZZ_Y + 1, LIGHT_RAIL);
    // 中二階の床の縁の線
    lines.push({ x: 0, y: MEZZ_Y + 0.01, z: MEZZ_FRONT - 0.8, w: 2 * HALF_W, d: 0.3 });
    // 事務所: 中二階の左に載ったプレハブ。屋根（7.5m）へは中二階からよじ登れる。手前の面に窓の帯を貼る（窓の間の柱で途切れさせる）
    box(-26, -10, -98, -106, MEZZ_Y, RACK_H, LIGHT_OFFICE);
    for (let x = -25; x < -15; x += 3.5)
        deco(x, x + 2.5, -98, -97.97, MEZZ_Y + 1, MEZZ_Y + 2.5, LIGHT_WINDOW);
    deco(-14, -12, -98, -97.97, MEZZ_Y, MEZZ_Y + 2.5, LIGHT_WINDOW); // 扉
    // 中二階の右: 低い棚に段ボールを並べる
    for (const x of [8, 14, 20]) {
        box(x, x + 4, -101, -104, MEZZ_Y, MEZZ_Y + 2, LIGHT_RACK_CORE);
        for (const dx of [0, 2])
            deco(x + dx + 0.25, x + dx + 1.75, -99.5, -101, MEZZ_Y + 0.25, MEZZ_Y + 0.25 + [0.75, 1, 1.25][Math.floor(rand() * 3)], cargoLight());
    }
    // ---- フォークリフト ----
    forklift(decor, colliders, 0, -28, -1, false);
    forklift(decor, colliders, 12, -60, 1, true);
    forklift(decor, colliders, -6, 2, 1, false, 'x');
    forklift(decor, colliders, 21, -74, -1, false);
    // ---- 屋根 ----
    // トラス: 壁から壁へ渡す。下弦材だけ当たり判定を持たせる（上に乗れて、鎖鎌も掛かる）。上弦材と束は見た目だけ
    for (const z of trussZ) {
        box(-HALF_W, HALF_W, z + 0.25, z - 0.25, TRUSS_Y0, TRUSS_Y1, LIGHT_TRUSS);
        deco(-HALF_W, HALF_W, z + 0.25, z - 0.25, ROOF_Y0 - CHORD, ROOF_Y0, LIGHT_TRUSS);
        for (let x = -HALF_W + 5; x < HALF_W; x += 5)
            deco(x - 0.1, x + 0.1, z + 0.1, z - 0.1, TRUSS_Y1, ROOF_Y0 - CHORD, LIGHT_TRUSS);
    }
    // 屋根板と天窓: トラスを境に、屋根板 4m・天窓 4m を交互に並べる。手前と奥の端は屋根板で閉じる。
    // 天窓にはガラスの代わりに見えない当たり判定を張り、屋根全体を閉じる（天窓から屋根の上へ抜け出せないようにする）
    const roof = (z0, z1) => {
        for (let x = -HALF_W; x < HALF_W; x += 15)
            box(x, x + 15, z0, z1, ROOF_Y0, ROOF_Y1, LIGHT_ROOF);
    };
    // 速く引き上げられたときにも抜けないよう、壁の上端までの厚みを持たせる
    colliders.push({ minX: -HALF_W, maxX: HALF_W, minZ: FAR, maxZ: NEAR, y0: ROOF_Y0, h: WALL_H });
    roof(NEAR, trussZ[0]);
    for (const z of trussZ)
        roof(z, Math.max(z - (TRUSS_STEP - SKYLIGHT), FAR));
    // 天窓の枠: 天窓を縦に割る細い桟（見た目だけ）
    for (const z of trussZ) {
        const z0 = z - (TRUSS_STEP - SKYLIGHT);
        if (z0 <= FAR)
            continue;
        for (let x = -HALF_W + 5; x < HALF_W; x += 5)
            deco(x - 0.1, x + 0.1, z0, Math.max(z0 - SKYLIGHT, FAR), ROOF_Y0, ROOF_Y1, LIGHT_TRUSS);
    }
    // 照明: トラスから吊った水銀灯。通路の真上に、1 本おきのトラスに下げる（頭より高いので見た目だけ）
    trussZ.forEach((z, i) => {
        if (i % 2 === 1)
            return;
        for (const x of [0, -12, 12, -21, 21]) {
            deco(x - 0.05, x + 0.05, z - 0.05, z + 0.05, TRUSS_Y0 - 1, TRUSS_Y0, LIGHT_LAMP);
            deco(x - 0.5, x + 0.5, z - 0.5, z + 0.5, TRUSS_Y0 - 1.5, TRUSS_Y0 - 1, LIGHT_LAMP);
        }
    });
    return {
        boxes,
        decor,
        colliders,
        scenery: [],
        lines,
        // 壁の外側の面まで。境界の壁は壁の中に隠れ、動ける範囲は壁そのものの当たり判定で決まる（屋根の上は壁の上まで歩ける）
        bounds: { minX: -HALF_W - WALL_T, maxX: HALF_W + WALL_T, minZ: FAR - WALL_T, maxZ: NEAR + WALL_T },
        start: { x: 0, y: 0, z: 6 },
        // 敵の出る所: 荷・柱・フォークリフトを避けた床（荷さばきの広場、真ん中の通路、棚の間の通路、横通路、中二階の手前）と、
        // 中二階の上、棚の天板の上（列の真ん中）、事務所の屋根の上。敵は今の床と同じ高さの所しか歩かないので、高い所の敵はそこから降りてこない
        enemySpawns: [
            ...[[-4, -6], [10, -4], [-20, -6], [3, -20], [-3, -40], [2, -66], [-2, -82], [12, -30], [-21, -36], [-12, -70], [21, -62], [8, -50], [-12, -50], [0, -91]].map(([x, z]) => ({ x, y: 0, z })),
            ...[[0, -99], [-4, -104], [26, -99]].map(([x, z]) => ({ x, y: MEZZ_Y, z })),
            ...[[7.5, -30], [-16.5, -70], [25.5, -20], [-7.5, -62]].map(([x, z]) => ({ x, y: RACK_H, z })),
            { x: -18, y: RACK_H, z: -102 },
        ],
        // 入口の左の荷の山の上あたりから、真ん中の通路と左右の棚が奥の中二階まで続くのを見る
        view: { eye: { x: -9, y: 9, z: 9 }, target: { x: 4, y: 3, z: -50 } },
    };
}
// ---- フォークリフト ----
// 幅 2m・長さ 3.5m の車体に、頭上の囲い（上面 4.25m）とマスト、爪を付ける。(cx, cz) は車体の中心。
// dir は前（爪の向き）。axis が 'z' なら z 方向、'x' なら x 方向を向く。loaded なら爪に荷を載せる。
// 当たり判定は車体と囲いを 1 つの箱にまとめ（囲いの上に乗れる）、爪の荷も別に持たせる
function forklift(decor, colliders, cx, cz, dir, loaded, axis = 'z') {
    // u: 横（右が正）、v: 前
    const toXZ = (u, v) => (axis === 'z' ? { x: cx + u, z: cz + dir * v } : { x: cx + dir * v, z: cz - u });
    const area = (u0, u1, v0, v1) => {
        const a = toXZ(u0, v0);
        const b = toXZ(u1, v1);
        return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
    };
    const part = (u0, u1, v0, v1, y0, y1, light) => decor.push({ ...area(u0, u1, v0, v1), y0: y0 || undefined, h: y1, light, look: 'struct' });
    // 車体と後ろのおもり
    part(-1, 1, -2, 1, 0.5, 2, LIGHT_LIFT_BODY);
    part(-1, 1, -2, -1.25, 2, 2.5, LIGHT_LIFT_DARK);
    // 車輪
    for (const s of [-1, 1])
        for (const [v0, v1] of [[0, 1], [-1.75, -0.75]])
            part(s * 1, s * 1.25, v0, v1, 0, 1, LIGHT_LIFT_DARK);
    // 座席
    part(-0.5, 0.5, -1.25, -0.5, 2, 2.75, LIGHT_LIFT_DARK);
    // 頭上の囲い: 4 本の柱と屋根
    for (const s of [-1, 1])
        for (const v of [0.75, -1.25])
            part(s * 0.75, s * 1, v, v - 0.25, 2, 4, LIGHT_LIFT_DARK);
    part(-1, 1, 1, -1.5, 4, 4.25, LIGHT_LIFT_MAST);
    // マストと爪
    for (const s of [-1, 1]) {
        part(s * 0.5, s * 0.75, 1, 1.5, 0, 4.5, LIGHT_LIFT_MAST);
        part(s * 0.5, s * 0.75, 1.5, 3.5, 0.25, 0.5, LIGHT_LIFT_MAST);
    }
    part(-0.75, 0.75, 1, 1.5, 4, 4.5, LIGHT_LIFT_MAST);
    colliders.push({ ...area(-1.25, 1.25, -2, 1.5), h: 4.25 });
    if (loaded) {
        part(-1, 1, 1.5, 3.5, 0.5, 0.75, LIGHT_PALLET);
        part(-1, 1, 1.5, 3.5, 0.75, 2.25, LIGHT_CARGO_MAX);
        colliders.push({ ...area(-1, 1, 1.5, 3.5), h: 2.25 });
    }
}

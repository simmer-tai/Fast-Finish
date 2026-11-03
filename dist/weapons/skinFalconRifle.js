import * as THREE from 'three';
import { addGlow, removeGlow } from '../fx/glow.js?v=a8ad3029';
import { skinFx } from './skins.js?v=a8ad3029';
// ---- スナイパーライフルのスキン: 隼 ----
// 元の形を丸ごと隠し、細身の未来的な狙撃銃に作り直す。輪郭はモチーフのモデル（VASSORA）を横から測って写し、
// 後ろの翼から銃口へ一方向に流れる稜線でまとめる。主役は翼、次に装填口の核、銃身の順に目が流れるよう、飾りの強さを揃える。
//   銃身: 黒く長い筒。付け根の左右に前へ尖る小翼、銃口の手前に細い帯 2 本、銃口の上に三角の照星
//   機関部: 銃身の付け根から上へ膨らんで後ろ下へ尖る、明るい灰色の細い楔。側面に丸い端の溝（ボルト）と、小さな丸い装填口（核）
//   背骨: 機関部の上から翼の上の縁まで走る細い稜線（一人称で見える上面に流れを付ける）
//   翼: 核の後ろから後ろ上へ跳ね上がる暗い灰色の翼。先は細く絞り、下は床尾として後ろを縦に切る
//   羽根: 翼の両面に浮かせた板。長い 1 枚と、付け根から扇に開く金の 3 枚（風切り羽のように、上ほど長く翼の上へ突き出す）
//   握り: 後ろへ寝かせた板に、前の黒い差し色と付け根の銀の三角。胴の下から握りの前へ黒い細枠を渡す
//   スコープ: 元のライフルのものをそのまま使う（隠さずに残す。色は skins.ts の looks で翼と金に合わせる）
// 配色: 白・黒・金。機関部と握りと長い羽根は白い陶器、翼は上塗りした黒い鋼、短い羽根・背骨・帯・ボルト・装填口の輪は金、
//   銃身は艶消しの黒。装填口の核と照星だけが金色に光る（当てた瞬間に強まる）
// 寸法は rifle.ts と同じ（m。銃口が -Z、上が +Y、原点は握る位置）。銃口の位置とスコープは元のまま
const BORE_Y = 0.016;
const MUZZLE_Z = -0.8;
const BARREL_BACK = -0.363; // 銃身の付け根（機関部の先）
const BARREL_R = 0.009;
const LEVER_SWING = 0.95; // 元のレバーを下げきった角度（viewModelMotion.ts と同じ）。ボルトを引く量に読み替える
// 機関部: 先は銃身と同じ高さ、上は少し先で膨らみ、後ろ下の角へ尖る
const RECEIVER = [[BARREL_BACK, 0.025], [-0.24, 0.0363], [-0.08, 0.03], [-0.1517, -0.0089], [BARREL_BACK, 0.007]];
// 翼と床尾: 核の後ろから上の線を後ろ上の先端へ伸ばし、床尾の後ろを縦に切って、握りの付け根へ戻る
const WING = [
    [-0.151, -0.009], [-0.08, 0.03], [0.045, 0.046], [0.151, 0.071], [0.099, 0.034], [0.084, 0.009],
    [0.082, -0.034], [0.045, -0.011], [0.016, 0.006], [-0.146, -0.011],
];
// 羽根: 長い方は翼の面を先端の手前まで、短い方は前から立ち上がって翼の上へ突き出す
const BLADE_LONG = [[-0.151, -0.008], [-0.01, 0.033], [0.137, 0.063], [0.086, 0.031], [0.015, 0.016]];
const BLADE_SHORT = [[-0.161, -0.006], [-0.069, 0.022], [0.05, 0.058], [0.012, 0.033], [-0.09, 0.003]];
// 金の羽根は 3 枚を付け根から扇に開き、翼の風切り羽のように並べる。[開く角度 (度), 長さの倍率, 面から浮かせる量]
// 上の羽根ほど長く、外側（面から遠く）に重ねる。付け根の側は 3 枚が重なるよう、開きは控えめにする
const FEATHER_ROOT = [-0.161, -0.006];
const FEATHER_TIP = [0.05, 0.058]; // 羽根の軸の向き（付け根からこの先端へ）
const FEATHER_WIDTH = 1.35; // 軸に直交する幅の倍率
const FEATHERS = [[-7, 0.88, 0.0025], [0, 1, 0.0045], [8, 1.12, 0.0065]];
// 輪郭を軸に直交する向きへ FEATHER_WIDTH 倍に広げ、root を中心に deg 度回し（+ で上へ開く）、scale 倍に伸ばす
const fanOutline = (outline, root, deg, scale) => {
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
    const len = Math.hypot(FEATHER_TIP[0] - root[0], FEATHER_TIP[1] - root[1]);
    const az = (FEATHER_TIP[0] - root[0]) / len, ay = (FEATHER_TIP[1] - root[1]) / len;
    return outline.map(([z, y]) => {
        const along = (z - root[0]) * az + (y - root[1]) * ay;
        const side = ((z - root[0]) * -ay + (y - root[1]) * az) * FEATHER_WIDTH;
        const dz = (along * az - side * ay) * scale, dy = (along * ay + side * az) * scale;
        return [root[0] + dz * c - dy * s, root[1] + dz * s + dy * c];
    });
};
// 背骨: 機関部の先から翼の上の縁へ（中央に細く立てる）
const SPINE = [
    [-0.305, 0.032], [-0.245, 0.04], [-0.09, 0.035], [0.02, 0.049], [0.104, 0.059], [0.03, 0.04], [-0.095, 0.026], [-0.245, 0.031],
];
// 銃身の付け根の小翼: 左右の面から前へ尖る
const BARREL_FIN = [[-0.55, 0.018], [-0.46, 0.031], [-0.35, 0.029], [BARREL_BACK, 0.01], [-0.47, 0.01]];
// 握り: 後ろへ寝かせた板。前に黒い差し色、付け根の後ろに銀の三角
const GRIP = [[-0.0037, 0.004], [0.0158, 0.0055], [0.0591, -0.0699], [0.0322, -0.0699]];
const GRIP_INSET = [[0.0068, -0.0259], [0.0218, -0.023], [0.0427, -0.0618], [0.0337, -0.0663]];
const GRIP_ACCENT = [[0.0158, 0.0055], [0.0367, 0.001], [0.0277, -0.0125]];
// 細枠: 機関部の後ろ下の角から斜めに下り、ゆるく折れて握りの前へ
const FRAME = [
    [-0.145, -0.011], [-0.13, -0.021], [-0.062, -0.027], [0.007, -0.018], [0.008, -0.021], [-0.062, -0.032], [-0.14, -0.025],
];
// 照星: 銃口の上の三角（前を立て、後ろへ下る）
const FRONT_SIGHT = [[MUZZLE_Z, BORE_Y + BARREL_R - 0.001], [MUZZLE_Z, BORE_Y + BARREL_R + 0.0075], [MUZZLE_Z + 0.009, BORE_Y + BARREL_R - 0.001]];
// ボルトの溝と装填口
const SLOT_FRONT = -0.279, SLOT_BACK = -0.186, SLOT_Y = 0.0156, SLOT_H = 0.0081;
const PORT_Z = -0.1658, PORT_Y = 0.0144;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const ramp = (v0, v1) => (v) => clamp01((v - v0) / (v1 - v0));
// 機関部の厚み: 先は細く、後ろへ太る
const RECEIVER_DEPTH = 0.025;
const receiverTaper = (z) => 0.84 + 0.16 * ramp(BARREL_BACK, -0.24)(z);
const receiverHalf = (z) => (RECEIVER_DEPTH / 2) * receiverTaper(z, 0);
// 翼の厚み: 核の所は機関部の厚みから太り、上の先端は細く絞る（床尾の下は太いまま）
const WING_DEPTH = 0.03;
const wingTaper = (z, y) => (0.8 + 0.2 * ramp(-0.151, -0.08)(z)) * (1 - 0.73 * ramp(0.04, 0.151)(z) * ramp(0.02, 0.05)(y));
const wingHalf = (z, y) => (WING_DEPTH / 2) * wingTaper(z, y);
// 輪郭を左右に depth の厚みで押し出し、taper(z, y) の割合で厚みを絞る（角は面取りし、面ごとの陰影にする）
export function slab(outline, depth, mat, taper, bevel = 0.002) {
    const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
    });
    geo.translate(0, 0, -(depth - bevel * 2) / 2);
    geo.rotateY(-Math.PI / 2); // 輪郭の x を Z 軸に、押し出しを X 軸に
    if (taper) {
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++)
            pos.setX(i, pos.getX(i) * taper(pos.getZ(i), pos.getY(i)));
        geo.computeVertexNormals();
    }
    return new THREE.Mesh(geo, mat);
}
// 左右の面に貼る薄い板。面の位置 surface(z, y)（中心からの距離）に沿わせ、gap だけ浮かせる
export function sidePlates(outline, thick, mat, surface, gap) {
    return [1, -1].map((side) => {
        const m = slab(outline, thick, mat, undefined, 0.0005);
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++)
            pos.setX(i, side * (surface(pos.getZ(i), pos.getY(i)) + gap + thick / 2) + pos.getX(i));
        m.geometry.computeVertexNormals();
        return m;
    });
}
// 隼の配色: 白い陶器の外殻に、黒い鋼の翼。金の飾り、艶を消した黒、金色に光る核（リボルバーの隼も使う）
// （映り込みは部位のものを使う。面ごとの陰影も部位に合わせる）
export function createFalconMats(env, flat) {
    const std = (o) => new THREE.MeshStandardMaterial({ envMap: env, flatShading: flat, ...o });
    const coat = (o) => new THREE.MeshPhysicalMaterial({ envMap: env, flatShading: flat, ...o });
    return {
        // 外殻: 艶のある白い陶器。上塗りで映り込みを薄く乗せる
        shell: coat({ color: 0xe6e8ea, metalness: 0, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.8 }),
        // 翼: 黒い鋼に厚い上塗り（ピアノの塗装のように、黒の上に鋭い映り込み）
        wing: coat({ color: 0x111214, metalness: 0.8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5 }),
        // 金: 鏡にせず、少し艶を落としたシャンパンゴールド
        gold: std({ color: 0xc9a25a, metalness: 1, roughness: 0.3, envMapIntensity: 1.4 }),
        // 艶を消した黒（光る外殻との対比）
        dark: std({ color: 0x15171a, metalness: 0.55, roughness: 0.55, envMapIntensity: 0.8 }),
        black: new THREE.MeshBasicMaterial({ color: 0x050505 }),
        rim: std({ color: 0x0c0d0e, metalness: 0.8, roughness: 0.3, envMapIntensity: 1.2 }),
        // 金の光: 装填口の芯と照星
        deep: std({ color: 0xffe2a0, emissive: 0xe0a640, emissiveIntensity: 1.6, metalness: 0, roughness: 0.3 }),
    };
}
export const falconRifle = {
    build(_parts, mats, model) {
        // 元の部品をスコープのほかすべて隠す（銃口の印とあとから足す込める弾も残る）。込める弾は新しい装填口へ入れる
        const body = (model.userData.body ?? []).filter((o) => o.name !== 'scope');
        const shown = body.map((o) => o.visible);
        for (const o of body)
            o.visible = false;
        const lever = model.userData.lever;
        model.userData.roundGate = new THREE.Vector3(0.03, PORT_Y, PORT_Z + 0.04);
        model.userData.roundIn = new THREE.Vector3(0.004, PORT_Y, PORT_Z);
        // 機関部と握りは白い陶器、翼と小翼は黒い鋼。背骨・帯・ボルト・装填口の輪・握りの三角は金、銃身・溝・握りの差し色は艶を消した黒。
        // 羽根は長い方を白い陶器、短い方を金にして、黒い翼の上で重なりを読ませる。装填口の核と照星は金色に光る
        const env = mats.metal.envMap;
        const { shell, wing, gold, dark, black, rim, deep } = createFalconMats(env, mats.metal.flatShading);
        const barrelFin = wing;
        const bladeLong = shell;
        const bladeShort = gold;
        const spine = gold;
        const band = gold;
        const silver = gold;
        const frame = new THREE.MeshStandardMaterial({ envMap: env, flatShading: mats.metal.flatShading, color: 0x18191b, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2 });
        const g = new THREE.Group();
        const put = (o, x, y, z) => {
            o.position.set(x, y, z);
            g.add(o);
            return o;
        };
        const plate = (outline, depth, mat, taper, bevel) => g.add(slab(outline, depth, mat, taper, bevel));
        // Z 軸に沿った角柱（rFront が -Z 側）。6 角は頂点を上下に向ける
        const prism = (rFront, rBack, len, sides, y, z, mat) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, sides), mat);
            m.rotation.x = -Math.PI / 2;
            return put(m, 0, y, z);
        };
        // X 軸に沿った円柱（左右を貫く）
        const across = (r, len, sides, y, z, mat) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), mat);
            m.rotation.z = Math.PI / 2;
            return put(m, 0, y, z);
        };
        // 銃身: 付け根から銃口へわずかに細る 12 角の筒、付け根の左右の小翼、銃口の手前の細い帯 2 本、銃口の穴と照星
        prism(BARREL_R * 0.92, BARREL_R, BARREL_BACK + 0.01 - MUZZLE_Z, 12, BORE_Y, (BARREL_BACK + 0.01 + MUZZLE_Z) / 2, dark);
        g.add(...sidePlates(BARREL_FIN, 0.003, barrelFin, () => 0.0085, 0));
        for (const z of [-0.71, -0.69])
            prism(0.01, 0.01, 0.0035, 12, BORE_Y, z, band);
        const bore = put(new THREE.Mesh(new THREE.CircleGeometry(0.0045, 12), black), 0, BORE_Y, MUZZLE_Z - 0.0002);
        bore.rotation.y = Math.PI;
        plate(FRONT_SIGHT, 0.004, deep, undefined, 0.0008);
        // 機関部、背骨、翼と床尾、翼の両面の羽根
        plate(RECEIVER, RECEIVER_DEPTH, shell, receiverTaper, 0.003);
        plate(SPINE, 0.006, spine, undefined, 0.001);
        plate(WING, WING_DEPTH, wing, wingTaper, 0.0015);
        g.add(...sidePlates(BLADE_LONG, 0.003, bladeLong, wingHalf, 0.001));
        for (const [deg, scale, gap] of FEATHERS)
            g.add(...sidePlates(fanOutline(BLADE_SHORT, FEATHER_ROOT, deg, scale), 0.003, bladeShort, wingHalf, gap));
        // ボルトの溝: 丸い端の黒い溝（左右を貫く）
        const slotLen = SLOT_BACK - SLOT_FRONT - SLOT_H;
        const slotSpan = receiverHalf(SLOT_BACK) * 2 + 0.002;
        put(new THREE.Mesh(new THREE.BoxGeometry(slotSpan, SLOT_H, slotLen), dark), 0, SLOT_Y, (SLOT_FRONT + SLOT_BACK) / 2);
        for (const z of [SLOT_FRONT + SLOT_H / 2, SLOT_BACK - SLOT_H / 2])
            across(SLOT_H / 2, slotSpan, 10, SLOT_Y, z, dark);
        // ボルトの握り: 溝から突き出た銀の棒と玉。レバーの代わりに、撃つたびに溝に沿って後ろへ引いて戻す
        const bolt = new THREE.Group();
        put(bolt, 0, SLOT_Y, 0);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.014, 8), silver);
        stem.rotation.z = Math.PI / 2;
        stem.position.x = receiverHalf(SLOT_FRONT) + 0.006;
        const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0042, 0), silver);
        knob.position.x = receiverHalf(SLOT_FRONT) + 0.014;
        bolt.add(stem, knob);
        const BOLT_FRONT = SLOT_FRONT + SLOT_H / 2;
        const BOLT_PULL = slotLen;
        // 毎フレームの行列の更新の前に、元のレバーの開き具合から引く量を決める
        bolt.updateMatrixWorld = function (force) {
            const open = lever ? clamp01(lever.rotation.x / LEVER_SWING) : 0;
            this.position.z = BOLT_FRONT + open * BOLT_PULL;
            THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
        };
        // 装填口（核）: 暗い丸枠に金の輪、芯は金色に光る。左右に小さな金の鋲
        const portSpan = receiverHalf(PORT_Z) * 2;
        across(0.0135, portSpan + 0.004, 16, PORT_Y, PORT_Z, rim);
        across(0.0085, portSpan + 0.006, 16, PORT_Y, PORT_Z, silver);
        const core = across(0.0045, portSpan + 0.007, 12, PORT_Y, PORT_Z, deep);
        for (const dz of [-0.0105, 0.0105])
            across(0.0018, portSpan + 0.006, 8, PORT_Y, PORT_Z + dz, silver);
        const glow = addGlow(core, 0xe8b450);
        glow.strength = 0.45;
        core.onBeforeRender = () => {
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0025);
            deep.emissiveIntensity = 1.4 + pulse * 0.4 + skinFx.flare * 2;
            glow.strength = 0.4 + pulse * 0.1 + skinFx.flare * 0.5;
        };
        g.userData.undo = () => {
            body.forEach((o, i) => (o.visible = shown[i]));
            delete model.userData.roundGate;
            delete model.userData.roundIn;
            removeGlow(glow);
        };
        // 握りと差し色、引き金、細枠
        plate(GRIP, 0.026, shell, undefined, 0.003);
        plate(GRIP_INSET, 0.028, dark, undefined, 0.001);
        plate(GRIP_ACCENT, 0.027, silver, undefined, 0.001);
        put(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.011, 0.004), dark), 0, -0.002, -0.02).rotation.x = 0.55;
        plate(FRAME, 0.006, frame, undefined, 0.001);
        return g;
    },
};

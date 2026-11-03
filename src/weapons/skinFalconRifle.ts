import * as THREE from 'three';
import type { SkinDecor } from './skins.js';

// ---- スナイパーライフルのスキン: 隼 ----
// 元の形を丸ごと隠し、細身の未来的な狙撃銃に作り直す。輪郭はモチーフのモデル（VASSORA）を横から測って写し、
// 後ろの翼から銃口へ一方向に流れる稜線でまとめる。主役は翼、次に装填口の核、銃身の順に目が流れるよう、飾りの強さを揃える。
//   銃身: 黒く長い筒。付け根の左右に前へ尖る小翼、銃口の手前に細い帯 2 本、銃口の上に三角の照星
//   機関部: 銃身の付け根から上へ膨らんで後ろ下へ尖る、明るい灰色の細い楔。側面に丸い端の溝（ボルト）と、小さな丸い装填口（核）
//   背骨: 機関部の上から翼の上の縁まで走る細い稜線（一人称で見える上面に流れを付ける）
//   翼: 核の後ろから後ろ上へ跳ね上がる暗い灰色の翼。先は細く絞り、下は床尾として後ろを縦に切る
//   羽根: 翼の両面に浮かせた 2 枚の暗い板。先をずらし、短い方は翼の上へ突き出す
//   握り: 後ろへ寝かせた板に、前の黒い差し色と付け根の銀の三角。胴の下から握りの前へ黒い細枠を渡す
//   スコープ: 元のライフルのものをそのまま使う（隠さずに残す）
// 寸法は rifle.ts と同じ（m。銃口が -Z、上が +Y、原点は握る位置）。銃口の位置とスコープは元のまま

const BORE_Y = 0.016;
const MUZZLE_Z = -0.8;
const BARREL_BACK = -0.363; // 銃身の付け根（機関部の先）
const BARREL_R = 0.009;
const LEVER_SWING = 0.95; // 元のレバーを下げきった角度（viewModelMotion.ts と同じ）。ボルトを引く量に読み替える

type Outline = [number, number][]; // 横から見た輪郭 [z, y]
type Taper = (z: number, y: number) => number; // 輪郭の点ごとの厚みの割合

// 機関部: 先は銃身と同じ高さ、上は少し先で膨らみ、後ろ下の角へ尖る
const RECEIVER: Outline = [[BARREL_BACK, 0.025], [-0.24, 0.0363], [-0.08, 0.03], [-0.1517, -0.0089], [BARREL_BACK, 0.007]];
// 翼と床尾: 核の後ろから上の線を後ろ上の先端へ伸ばし、床尾の後ろを縦に切って、握りの付け根へ戻る
const WING: Outline = [
  [-0.151, -0.009], [-0.08, 0.03], [0.045, 0.046], [0.151, 0.071], [0.099, 0.034], [0.084, 0.009],
  [0.082, -0.034], [0.045, -0.011], [0.016, 0.006], [-0.146, -0.011],
];
// 羽根: 長い方は翼の面を先端の手前まで、短い方は前から立ち上がって翼の上へ突き出す
const BLADE_LONG: Outline = [[-0.151, -0.008], [-0.01, 0.033], [0.137, 0.063], [0.086, 0.031], [0.015, 0.016]];
const BLADE_SHORT: Outline = [[-0.161, -0.006], [-0.069, 0.022], [0.05, 0.058], [0.012, 0.033], [-0.09, 0.003]];
// 背骨: 機関部の先から翼の上の縁へ（中央に細く立てる）
const SPINE: Outline = [
  [-0.305, 0.032], [-0.245, 0.04], [-0.09, 0.035], [0.02, 0.049], [0.104, 0.059], [0.03, 0.04], [-0.095, 0.026], [-0.245, 0.031],
];
// 銃身の付け根の小翼: 左右の面から前へ尖る
const BARREL_FIN: Outline = [[-0.55, 0.018], [-0.46, 0.031], [-0.35, 0.029], [BARREL_BACK, 0.01], [-0.47, 0.01]];
// 握り: 後ろへ寝かせた板。前に黒い差し色、付け根の後ろに銀の三角
const GRIP: Outline = [[-0.0037, 0.004], [0.0158, 0.0055], [0.0591, -0.0699], [0.0322, -0.0699]];
const GRIP_INSET: Outline = [[0.0068, -0.0259], [0.0218, -0.023], [0.0427, -0.0618], [0.0337, -0.0663]];
const GRIP_ACCENT: Outline = [[0.0158, 0.0055], [0.0367, 0.001], [0.0277, -0.0125]];
// 細枠: 機関部の後ろ下の角から斜めに下り、ゆるく折れて握りの前へ
const FRAME: Outline = [
  [-0.145, -0.011], [-0.13, -0.021], [-0.062, -0.027], [0.007, -0.018], [0.008, -0.021], [-0.062, -0.032], [-0.14, -0.025],
];
// 照星: 銃口の上の三角（前を立て、後ろへ下る）
const FRONT_SIGHT: Outline = [[MUZZLE_Z, BORE_Y + BARREL_R - 0.001], [MUZZLE_Z, BORE_Y + BARREL_R + 0.0075], [MUZZLE_Z + 0.009, BORE_Y + BARREL_R - 0.001]];
// ボルトの溝と装填口
const SLOT_FRONT = -0.279, SLOT_BACK = -0.186, SLOT_Y = 0.0156, SLOT_H = 0.0081;
const PORT_Z = -0.1658, PORT_Y = 0.0144;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (v0: number, v1: number) => (v: number) => clamp01((v - v0) / (v1 - v0));
// 機関部の厚み: 先は細く、後ろへ太る
const RECEIVER_DEPTH = 0.025;
const receiverTaper: Taper = (z) => 0.84 + 0.16 * ramp(BARREL_BACK, -0.24)(z);
const receiverHalf = (z: number) => (RECEIVER_DEPTH / 2) * receiverTaper(z, 0);
// 翼の厚み: 核の所は機関部の厚みから太り、上の先端は細く絞る（床尾の下は太いまま）
const WING_DEPTH = 0.03;
const wingTaper: Taper = (z, y) => (0.8 + 0.2 * ramp(-0.151, -0.08)(z)) * (1 - 0.73 * ramp(0.04, 0.151)(z) * ramp(0.02, 0.05)(y));
const wingHalf = (z: number, y: number) => (WING_DEPTH / 2) * wingTaper(z, y);

// 輪郭を左右に depth の厚みで押し出し、taper(z, y) の割合で厚みを絞る（角は面取りし、面ごとの陰影にする）
function slab(outline: Outline, depth: number, mat: THREE.Material, taper?: Taper, bevel = 0.002): THREE.Mesh {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2); // 輪郭の x を Z 軸に、押し出しを X 軸に
  if (taper) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * taper(pos.getZ(i), pos.getY(i)));
    geo.computeVertexNormals();
  }
  return new THREE.Mesh(geo, mat);
}
// 左右の面に貼る薄い板。面の位置 surface(z, y)（中心からの距離）に沿わせ、gap だけ浮かせる
function sidePlates(outline: Outline, thick: number, mat: THREE.Material, surface: (z: number, y: number) => number, gap: number): THREE.Mesh[] {
  return [1, -1].map((side) => {
    const m = slab(outline, thick, mat, undefined, 0.0005);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, side * (surface(pos.getZ(i), pos.getY(i)) + gap + thick / 2) + pos.getX(i));
    m.geometry.computeVertexNormals();
    return m;
  });
}

export const falconRifle: SkinDecor = {
  build(_parts, mats, model) {
    // 元の部品をスコープのほかすべて隠す（銃口の印とあとから足す込める弾も残る）。込める弾は新しい装填口へ入れる
    const body = ((model.userData.body ?? []) as THREE.Object3D[]).filter((o) => o.name !== 'scope');
    const shown = body.map((o) => o.visible);
    for (const o of body) o.visible = false;
    const lever = model.userData.lever as THREE.Object3D | undefined;
    model.userData.roundGate = new THREE.Vector3(0.03, PORT_Y, PORT_Z + 0.04);
    model.userData.roundIn = new THREE.Vector3(0.004, PORT_Y, PORT_Z);

    // 部位のマテリアルから色と質感だけを変えて作る（映り込みは部位のものを使う）
    const tint = (base: THREE.MeshStandardMaterial, color: number, metalness = base.metalness, roughness = base.roughness) => {
      const m = base.clone();
      m.color.setHex(color);
      m.metalness = metalness;
      m.roughness = roughness;
      return m;
    };
    const dark = mats.metal.clone(); // 銃身・照星・握りの差し色
    const shell = mats.trim.clone(); // 機関部と握り
    const deep = mats.wrap.clone(); // 装填口の芯
    const wing = tint(mats.trim, 0x68717a, 0.55, 0.4);
    const bladeLong = tint(mats.metal, 0x20252a, 0.75, 0.3);
    const bladeShort = tint(mats.metal, 0x333b42, 0.75, 0.3);
    const spine = tint(mats.metal, 0x303940, 0.7, 0.34);
    const barrelFin = tint(mats.metal, 0x343b42, 0.75, 0.32);
    const frame = tint(mats.metal, 0x252b30);
    const black = tint(mats.metal, 0x171b1e, mats.metal.metalness, 0.35);
    const rim = tint(mats.metal, 0x191d21);
    const band = tint(mats.metal, 0x9ba5ad, 0.8, 0.35);
    const silver = tint(mats.metal, 0xaeb8c1, 0.9, 0.28);
    const g = new THREE.Group();
    g.userData.undo = () => {
      body.forEach((o, i) => (o.visible = shown[i]));
      delete model.userData.roundGate;
      delete model.userData.roundIn;
    };
    const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
    const plate = (outline: Outline, depth: number, mat: THREE.Material, taper?: Taper, bevel?: number) => g.add(slab(outline, depth, mat, taper, bevel));
    // Z 軸に沿った角柱（rFront が -Z 側）。6 角は頂点を上下に向ける
    const prism = (rFront: number, rBack: number, len: number, sides: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, sides), mat);
      m.rotation.x = -Math.PI / 2;
      return put(m, 0, y, z);
    };
    // X 軸に沿った円柱（左右を貫く）
    const across = (r: number, len: number, sides: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), mat);
      m.rotation.z = Math.PI / 2;
      return put(m, 0, y, z);
    };

    // 銃身: 付け根から銃口へわずかに細る 12 角の筒、付け根の左右の小翼、銃口の手前の細い帯 2 本、銃口の穴と照星
    prism(BARREL_R * 0.92, BARREL_R, BARREL_BACK + 0.01 - MUZZLE_Z, 12, BORE_Y, (BARREL_BACK + 0.01 + MUZZLE_Z) / 2, dark);
    g.add(...sidePlates(BARREL_FIN, 0.003, barrelFin, () => 0.0085, 0));
    for (const z of [-0.71, -0.69]) prism(0.01, 0.01, 0.0035, 12, BORE_Y, z, band);
    const bore = put(new THREE.Mesh(new THREE.CircleGeometry(0.0045, 12), black), 0, BORE_Y, MUZZLE_Z - 0.0002);
    bore.rotation.y = Math.PI;
    plate(FRONT_SIGHT, 0.004, dark, undefined, 0.0008);

    // 機関部、背骨、翼と床尾、翼の両面の羽根
    plate(RECEIVER, RECEIVER_DEPTH, shell, receiverTaper, 0.003);
    plate(SPINE, 0.006, spine, undefined, 0.001);
    plate(WING, WING_DEPTH, wing, wingTaper, 0.0015);
    g.add(...sidePlates(BLADE_LONG, 0.003, bladeLong, wingHalf, 0.001));
    g.add(...sidePlates(BLADE_SHORT, 0.003, bladeShort, wingHalf, 0.0025));

    // ボルトの溝: 丸い端の黒い溝（左右を貫く）
    const slotLen = SLOT_BACK - SLOT_FRONT - SLOT_H;
    const slotSpan = receiverHalf(SLOT_BACK) * 2 + 0.002;
    put(new THREE.Mesh(new THREE.BoxGeometry(slotSpan, SLOT_H, slotLen), dark), 0, SLOT_Y, (SLOT_FRONT + SLOT_BACK) / 2);
    for (const z of [SLOT_FRONT + SLOT_H / 2, SLOT_BACK - SLOT_H / 2]) across(SLOT_H / 2, slotSpan, 10, SLOT_Y, z, dark);
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
    bolt.updateMatrixWorld = function (force?: boolean) {
      const open = lever ? clamp01(lever.rotation.x / LEVER_SWING) : 0;
      this.position.z = BOLT_FRONT + open * BOLT_PULL;
      THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
    };
    // 装填口（核）: 暗い丸枠に銀の輪、芯は暗い灰色。左右に小さな銀の鋲
    const portSpan = receiverHalf(PORT_Z) * 2;
    across(0.0135, portSpan + 0.004, 16, PORT_Y, PORT_Z, rim);
    across(0.0085, portSpan + 0.006, 16, PORT_Y, PORT_Z, silver);
    across(0.0045, portSpan + 0.007, 12, PORT_Y, PORT_Z, deep);
    for (const dz of [-0.0105, 0.0105]) across(0.0018, portSpan + 0.006, 8, PORT_Y, PORT_Z + dz, silver);

    // 握りと差し色、引き金、細枠
    plate(GRIP, 0.026, shell, undefined, 0.003);
    plate(GRIP_INSET, 0.028, dark, undefined, 0.001);
    plate(GRIP_ACCENT, 0.027, silver, undefined, 0.001);
    put(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.011, 0.004), dark), 0, -0.002, -0.02).rotation.x = 0.55;
    plate(FRAME, 0.006, frame, undefined, 0.001);

    return g;
  },
};

import * as THREE from 'three';
import { addGlow, removeGlow } from '../fx/glow.js';
import { createFalconMats, ramp, sidePlates, slab, type Outline, type Taper } from './skinFalconRifle.js';
import { skinFx, type SkinDecor } from './skins.js';

// ---- リボルバーのスキン: 隼 ----
// ライフルの隼と同じ白い陶器・黒い鋼・金の銃。元のフレームを丸ごと隠し、後ろの黒い翼から銃口へ下る 1 本の白い稜線で作り直す。
// 飾りを足すのでなく、輪郭そのもので流れを作る。鋭い所は翼の先と銃口の 2 点に絞る。シリンダーは隠さず、稜線の下に浮かぶ艶黒の機関として見せる。
//   カウル: 艶消し黒の細い銃身に上から被せる白い陶器。上の縁はシリンダーの上を渡る橋から銃口へゆるく下り、下の縁は前ほど引いて銃身をのぞかせる
//   翼: 橋の後ろから後ろ上へ跳ね上がる艶黒の翼。そのままグリップの付け根へ下る（撃鉄は翼の付け根の小さな黒い突起）
//   飾り: 翼の両面に白い長い羽根 1 枚と、その外に扇に開く金の羽根 3 枚（上ほど長い）。その根元に短い金の羽根 3 枚を覆いかぶせる。
//         金の羽根はどれも核から生え、先ほど翼の面から外へ浮く。カウルの側面に金の細線 1 本。照星は小さく金色に光る
//   核: 翼の付け根（シリンダーのすぐ後ろ）の左右。金の羽根の付け根の軸として面から突き出す。ふだんは控えめに脈打ち、撃った瞬間に強まる
//   下の骨組み: シリンダーの下を通る黒い細い枠。用心鉄と引き金は細い黒の線で、前へゆるく流す
//   グリップ: 指の溝を無くした細身の白い陶器。前に黒い滑り止め、後ろの縁は翼から一続き
//   銃口: 銃身の黒い先に金の帯と、撃った瞬間に光る芯の輪
// 色の面積の目安は白 4・黒 5・金 1。シリンダーの色は skins.ts の looks（艶黒に、溝は暗い金）
// 寸法は revolver.ts と同じ（m。銃口が -Z、上が +Y、銃身の軸が y = 0、原点は握る位置）。銃口の位置（弾と火花が出る所）は元のまま

const MUZZLE_Z = -0.161;
const BARREL_R = 0.0062;
const BARREL_BACK = -0.03; // シリンダーを振り出しても当たらない位置（元の銃身の板の後ろ）
// カウル: 上の縁は銃口からシリンダーの上の橋へ上り、橋の下はシリンダーの上（y = 0.0085）を空ける
const COWL: Outline = [
  [-0.158, 0.0062], [-0.145, 0.0115], [-0.09, 0.0148], [BARREL_BACK, 0.0178], [0.025, 0.0202], [0.032, 0.0204],
  [0.032, 0.0108], [BARREL_BACK, 0.0108], [BARREL_BACK, -0.0128], [-0.07, -0.0135], [-0.12, -0.0065], [-0.152, 0.0005],
];
const COWL_DEPTH = 0.0165;
const cowlTaper: Taper = (z) => 0.74 + 0.26 * ramp(-0.158, -0.1)(z); // 銃口へ細く絞る
const cowlHalf = (z: number) => (COWL_DEPTH / 2) * cowlTaper(z, 0);
// カウルの側面の金の細線: 上の縁に沿って銃口の手前から橋の後ろまで
const COWL_LINE: Outline = [[-0.146, 0.0078], [-0.09, 0.0108], [BARREL_BACK, 0.0136], [0.026, 0.0158], [0.026, 0.0144], [BARREL_BACK, 0.0122], [-0.09, 0.0095], [-0.144, 0.0068]];
// 照星: カウルの先の上に低く伏せた三角
const SIGHT: Outline = [[-0.148, 0.0118], [-0.148, 0.0158], [-0.139, 0.0124]];
// 翼: シリンダーの後ろ（z = 0.023 から）の橋の後ろから後ろ上の先端へ跳ね、後ろの縁はグリップの付け根へ下る
const WING: Outline = [
  [0.023, 0.011], [0.03, 0.0215], [0.058, 0.027], [0.086, 0.035], [0.07, 0.017], [0.06, -0.006], [0.054, -0.034], [0.036, -0.044], [0.023, -0.041],
];
const WING_DEPTH = 0.02;
const wingTaper: Taper = (z, y) => 1 - 0.65 * ramp(0.058, 0.086)(z) * ramp(0.0, 0.03)(y); // 先端へ細く絞る
const wingHalf = (z: number, y: number) => (WING_DEPTH / 2) * wingTaper(z, y);
// 翼の両面の白い長い羽根（翼の先へ流す）
const BLADE: Outline = [[0.031, 0.0135], [0.058, 0.0215], [0.081, 0.031], [0.066, 0.0155], [0.042, 0.0075]];
// 核: 翼の付け根、シリンダーのすぐ後ろ
const PORT = { y: -0.017, z: 0.035 };
// 金の羽根: 核を付け根に先へ細くなる板を扇に開き、白い羽根の外に重ねる。[開く角度 (度), 長さの倍率, 付け根で面から浮かせる量]
// 翼の上の半分に載せ、上の羽根ほど長く外側に重ねる。先は翼の後ろ上の縁から風切り羽のように突き出す
const FEATHER: Outline = [[0.031, -0.012], [0.05, 0.006], [0.083, 0.036], [0.062, 0.004], [0.039, -0.02]];
const FEATHER_ROOT: [number, number] = [PORT.z, PORT.y];
// 扇ごと 12 度下へ傾ける。羽根の間は 13 度ずつ開く
const FEATHERS: [number, number, number][] = [[-25, 0.95, 0.0021], [-12, 1.1, 0.0031], [1, 1.24, 0.0041]];
const FEATHER_LIFT = 0.12; // 付け根から離れるほど面から外へ浮かせる割合
// 根元を覆う短い羽根: 長い扇より外に重ね、広めに開いて大きく外へ反らす
const COVERTS: [number, number, number][] = [[-34, 0.46, 0.0062], [-14, 0.54, 0.0072], [6, 0.5, 0.0082]];
const COVERT_LIFT = 0.3;
const COVERT_TOP = 0.0082 + 0.0016 + 0.002; // 核を突き出す高さ（覆う羽根の上の面より少し上）
// 輪郭を root を中心に deg 度回し（+ で上へ開く）、scale 倍に伸ばす
const fan = (outline: Outline, [rz, ry]: [number, number], deg: number, scale: number): Outline => {
  const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  return outline.map(([z, y]) => {
    const dz = (z - rz) * scale, dy = (y - ry) * scale;
    return [rz + dz * c - dy * s, ry + dz * s + dy * c];
  });
};
// 撃鉄: 翼の付け根の上に伏せた小さな突起
const HAMMER: Outline = [[0.033, 0.0205], [0.039, 0.0285], [0.048, 0.0298], [0.045, 0.0232]];
// 下の骨組み: 銃身の下からシリンダーの下（y = -0.0305）を空けて翼の下へ
const KEEL: Outline = [[-0.034, -0.009], [-0.027, -0.0125], [-0.024, -0.0322], [0.024, -0.0345], [0.024, -0.043], [-0.008, -0.0425], [-0.034, -0.0365]];
// 用心鉄と引き金（横から見た中心線 [z, y]）
const GUARD: [number, number][] = [[-0.016, -0.041], [-0.017, -0.053], [-0.006, -0.0645], [0.012, -0.0655], [0.027, -0.054]];
const TRIGGER: [number, number][] = [[0.003, -0.042], [-0.001, -0.051], [0.002, -0.0585]];
// グリップ: 指の溝の無い細身の形。前に黒い滑り止め
const GRIP: Outline = [[0.022, -0.04], [0.034, -0.08], [0.043, -0.125], [0.052, -0.133], [0.085, -0.133], [0.088, -0.117], [0.077, -0.08], [0.058, -0.033]];
const GRIP_STRIP: Outline = [[0.0212, -0.044], [0.0285, -0.044], [0.041, -0.08], [0.0495, -0.122], [0.0425, -0.127], [0.0332, -0.08]];

export const falconRevolver: SkinDecor = {
  build(parts, mats) {
    const env = mats.metal.envMap;
    const { shell, wing, gold, dark, black, rim, deep } = createFalconMats(env, mats.metal.flatShading);
    // 元のフレーム（銃身・枠・撃鉄・用心鉄・グリップ）を隠す。シリンダーとスピードローダーと弾は元のまま
    for (const [name, mesh] of Object.entries(parts)) if (name.startsWith('frame')) mesh.visible = false;
    const g = new THREE.Group();
    const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
    // Z 軸に沿った円柱
    const tube = (r: number, len: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
      m.rotation.x = Math.PI / 2;
      return put(m, 0, 0, z);
    };
    // 銃口の面に貼る輪（前を向ける）
    const ring = (inner: number, outer: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(inner > 0 ? new THREE.RingGeometry(inner, outer, 16) : new THREE.CircleGeometry(outer, 16), mat);
      m.rotation.y = Math.PI;
      return put(m, 0, 0, z);
    };
    // X 軸に沿った円柱（左右を貫く）
    const across = (r: number, len: number, sides: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), mat);
      m.rotation.z = Math.PI / 2;
      return put(m, 0, y, z);
    };
    // 横から見た中心線に沿った細い棒
    const rod = (line: [number, number][], r: number, mat: THREE.Material) =>
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line.map(([z, y]) => new THREE.Vector3(0, y, z))), 20, r, 6), mat));

    // 銃身と銃口: 黒い筒の先に金の帯。銃口は黒い穴を、撃った瞬間に光る芯の輪で囲む
    tube(BARREL_R, BARREL_BACK - MUZZLE_Z, (BARREL_BACK + MUZZLE_Z) / 2, dark);
    tube(BARREL_R + 0.0006, 0.0024, MUZZLE_Z + 0.0045, gold);
    const face = MUZZLE_Z - 0.0002;
    const muzzleRing = ring(0.0042, 0.0051, face, deep);
    ring(0, 0.0042, face, black);
    const muzzleGlow = addGlow(muzzleRing, 0xe8b450);
    muzzleRing.onBeforeRender = () => (muzzleGlow.strength = 0.1 + skinFx.flare * 0.8);

    // カウルと金の細線、照星
    g.add(slab(COWL, COWL_DEPTH, shell, cowlTaper, 0.0016));
    g.add(...sidePlates(COWL_LINE, 0.0008, gold, (z) => cowlHalf(z), 0.0001));
    g.add(slab(SIGHT, 0.003, deep, undefined, 0.0005));

    // 翼と白い羽根、金の羽根、撃鉄
    g.add(slab(WING, WING_DEPTH, wing, wingTaper, 0.0016));
    g.add(...sidePlates(BLADE, 0.0016, shell, wingHalf, 0.0003));
    // 付け根からの距離だけ外へ浮かせる
    const lifted = (k: number) => (z: number, y: number) => wingHalf(z, y) + k * Math.hypot(z - PORT.z, y - PORT.y);
    for (const [deg, scale, gap] of FEATHERS) g.add(...sidePlates(fan(FEATHER, FEATHER_ROOT, deg, scale), 0.0018, gold, lifted(FEATHER_LIFT), gap));
    for (const [deg, scale, gap] of COVERTS) g.add(...sidePlates(fan(FEATHER, FEATHER_ROOT, deg, scale), 0.0016, gold, lifted(COVERT_LIFT), gap));
    g.add(slab(HAMMER, 0.006, dark, undefined, 0.001));

    // 核: 暗い丸枠に金の輪、芯は金色に光る。羽根の付け根を押さえる軸として、覆う羽根より上へ突き出す
    across(0.0062, WING_DEPTH + COVERT_TOP * 2, 16, PORT.y, PORT.z, rim);
    across(0.0042, WING_DEPTH + COVERT_TOP * 2 + 0.0008, 16, PORT.y, PORT.z, gold);
    const core = across(0.0024, WING_DEPTH + COVERT_TOP * 2 + 0.0014, 12, PORT.y, PORT.z, deep);
    const glow = addGlow(core, 0xe8b450);
    core.onBeforeRender = () => {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0025);
      deep.emissiveIntensity = 1.3 + pulse * 0.3 + skinFx.flare * 2;
      glow.strength = 0.22 + pulse * 0.06 + skinFx.flare * 0.5;
    };
    g.userData.undo = () => {
      removeGlow(glow);
      removeGlow(muzzleGlow);
    };

    // 下の骨組みと用心鉄・引き金
    g.add(slab(KEEL, 0.015, wing, undefined, 0.0012));
    rod(GUARD, 0.0017, dark);
    rod(TRIGGER, 0.0019, dark);

    // グリップと前の滑り止め
    g.add(slab(GRIP, 0.022, shell, undefined, 0.0035));
    g.add(slab(GRIP_STRIP, 0.0232, dark, undefined, 0.001));
    return g;
  },
};

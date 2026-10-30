import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import type { SkinDecor } from './skins.js';
import { MM, plate, type Outline } from './skinTalon.js';

// ---- 剣のスキン: 紅線 ----
// 白と紅に塗り分けた、装甲板を重ねたような直刀。柄は指を通す枠になっている。
//   刃: 反りの無い平たい刃。峰の側は白く、刃の側の半分に紅い板を貼り、刃先の面取りは明るい紅。
//       板と刃先の間に白い地が細く残って線になる。真ん中を灰色のレールが走り、ところどころ峰の側へ段が出る。
//       切っ先は刃の側から峰へ斜めに落とす
//   鍔: 角ばった白い塊。峰の側へ棘が出る。刃の根元に細長い六角の灰色の板
//   柄: 峰の側の白い柱と、刃の側の紅い柱を、柄頭の白い蓋でつないだ枠。真ん中は抜けている。
//       白い柱には灰色の溝、紅い柱の内側（鍔の近く）には黒い指の溝
// 剣の部位はすべて隠して作り直す。輪郭は mm（x は刃の側が +、y は切っ先の側が +）

// ---- 刃 ----
const BLADE_TOP = 135; // 刃の付け根（元の刀と同じ）
const TIP_Y = 855; // 切っ先（攻撃の届く距離 SWORD_TIP に合わせる）
const TIP0 = 775; // 切っ先の斜めの始まり（刃先の側）
const BACK = -15; // 峰
const FACE = 5; // 平らな面の終わり（ここから刃先へ面取り）
const EDGE = 15; // 刃先
const HALF_T = 4; // 平らな面の厚みの半分
const POINT = new THREE.Vector3(-13 * MM, TIP_Y * MM, 0); // 切っ先は峰の側に寄せる

// 白い地（峰〜平らな面）と、紅い刃先の面取りを別の筒にする
function bladeGeometries() {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * MM, y * MM, z * MM);
  const body = (y: number) => [v(BACK, y, HALF_T), v(FACE, y, HALF_T), v(FACE, y, -HALF_T), v(BACK, y, -HALF_T)];
  const edge = (y: number) => [v(FACE, y, HALF_T), v(EDGE, y, 0), v(FACE, y, -HALF_T)];
  return {
    body: loftRings([body(BLADE_TOP), body(TIP0), [POINT.clone()]]),
    edge: loftRings([edge(BLADE_TOP), edge(TIP0), [POINT.clone()]]),
  };
}

// 刃の面に貼る板。平らな面（±HALF_T）から少しだけ浮かせる
const SLOPE = (EDGE - POINT.x / MM) / (TIP_Y - TIP0); // 切っ先の斜めの傾き（y 1 mm あたりの x）
const PANEL_END = TIP0 - 22;
// 紅い板: 刃の側の半分。切っ先の側の端は切っ先と同じ向きに斜めに断つ
const PANEL: Outline = [[-1, 225], [4, 225], [4, PANEL_END], [-1, PANEL_END + 5 / SLOPE]];
// 灰色のレール: 真ん中の細い帯と、峰の側へ出る段
const RAIL: Outline = [[-4, 220], [-1.6, 220], [-1.6, 740], [-4, 752]];
const STEPS = [400, 540, 660].map((y): Outline => [[-9, y], [-4, y], [-4, y + 14], [-9, y + 8]]);
// 紅い板の継ぎ目（斜めの細い溝）
const SEAMS = [330, 610].map((y): Outline => [[-1, y], [4, y + 3], [4, y + 4.2], [-1, y + 1.2]]);
// 根元の六角の板
const HEX: Outline = [[0, 138], [7, 152], [7, 204], [0, 218], [-7, 204], [-7, 152]];

// ---- 鍔と柄 ----
const GUARD: Outline = [[-23, 86], [19, 86], [19, 128], [-14, 142], [-29, 132], [-21, 114]];
const BACK_RAIL: Outline = [[-23, -152], [-12, -146], [-12, 88], [-23, 88]];
const BACK_SLOT: Outline = [[-19.5, -126], [-15.5, -124], [-15.5, 76], [-19.5, 76]];
const EDGE_RAIL: Outline = [[12, -146], [21, -142], [21, 88], [12, 88]];
const EDGE_ARM: Outline = [[12, 120], [19, 120], [15, 152], [9, 146]]; // 紅い柱から刃先へつなぐ
const CAP: Outline = [[-24, -150], [-24, -164], [-12, -172], [22, -162], [22, -148], [-12, -140]];
const CAP_INLAY: Outline = [[-6, -158], [12, -155], [12, -152], [-6, -155]];
const GROOVES = [24, 36, 48, 60, 72].map((y): Outline => [[8.5, y], [12.5, y - 1.5], [12.5, y + 5.5], [8.5, y + 4]]);

function createMats(env: THREE.Texture | null) {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMap: env, flatShading: true, ...o });
  return {
    // 少しくすませた白の塗りの地。映り込みは控えめ
    white: std({ color: 0xa4a8ad, metalness: 0.2, roughness: 0.5, envMapIntensity: 0.5 }),
    // 赤黒い金属（板と柱）と、研いだ刃先の一段明るい赤黒。どちらも映り込みを強くして金属らしく光らせる
    red: std({ color: 0x4a0a10, metalness: 0.9, roughness: 0.24, envMapIntensity: 1.8 }),
    edge: std({ color: 0x7a1420, metalness: 0.95, roughness: 0.18, envMapIntensity: 2 }),
    steel: std({ color: 0x8b9196, metalness: 0.9, roughness: 0.32 }),
    dark: std({ color: 0x08080a, metalness: 0.4, roughness: 0.6 }),
  };
}

export const redlineSword: SkinDecor = {
  build(parts, mats) {
    const m = createMats(mats.metal.envMap);
    for (const name of ['blade', 'habaki', 'guard', 'grip', 'pommel']) if (parts[name]) parts[name].visible = false;
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => g.add(new THREE.Mesh(geo, mat));
    // 刃の面に貼る物は、刃の厚み（2 × HALF_T）より lift だけ厚くして表と裏に同時に出す
    const inlay = (o: Outline, lift: number, mat: THREE.Material) => add(plate(o, (2 * HALF_T + 2 * lift) * MM, 0.0003), mat);

    const blade = bladeGeometries();
    add(blade.body, m.white);
    add(blade.edge, m.edge);
    inlay(PANEL, 0.4, m.red);
    for (const s of SEAMS) inlay(s, 0.6, m.dark);
    inlay(RAIL, 0.5, m.steel);
    for (const s of STEPS) inlay(s, 0.5, m.steel);
    inlay(HEX, 1.2, m.steel);

    add(plate(GUARD, 0.014), m.white);
    add(plate(EDGE_ARM, 0.011), m.red);
    add(plate(BACK_RAIL, 0.013), m.white);
    add(plate(BACK_SLOT, 0.0136, 0.0003), m.steel);
    add(plate(EDGE_RAIL, 0.011), m.red);
    for (const s of GROOVES) add(plate(s, 0.0095, 0.0005), m.dark);
    add(plate(CAP, 0.015), m.white);
    add(plate(CAP_INLAY, 0.0156, 0.0003), m.steel);
    return g;
  },
};

import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import type { SkinDecor } from './skins.js';
import { MM, plate, type Outline } from './skinTalon.js';

// ---- 剣のスキン: 遺物 ----
// 古い西洋の長剣の形。色は元の剣と同じ黒のまま、形だけを替える。
//   刃: 反りの無い両刃。真ん中に樋（細い溝）が走り、切っ先の手前で消える。根元は少し幅広く、切っ先へ細く絞る
//   鍔: 短い横木と、そこから刃の付け根までの台
//   柄: 輪で区切った握り。柄頭は襟・膨らんだ玉・円盤・小玉と重ね、先は細く尖らせる
// 剣の部位はすべて隠して作り直す。寸法は mm（x は刃の側が +、y は切っ先の側が +）

// ---- 刃 ----
const BLADE_TOP = 135; // 刃の付け根（元の刀と同じ）
const TIP_Y = 855; // 切っ先（攻撃の届く距離 SWORD_TIP に合わせる）
const T = 9; // 刃の厚み
// 断面を決める高さ: [y, 幅, 樋の深さ（0 で樋なし）]
const BLADE_KEYS: [y: number, w: number, fuller: number][] = [
  [BLADE_TOP, 44, 0.35],
  [210, 38, 0.35],
  [520, 33, 0.3],
  [700, 28, 0],
  [790, 22, 0],
  [830, 12, 0],
];
// 両刃の断面: 刃先（±x）で薄く、平らな面の真ん中に樋を掘る
function section(y: number, w: number, fuller: number) {
  const v = (x: number, z: number) => new THREE.Vector3(x * MM, y * MM, z * MM);
  const top = [v(w / 2, 0), v(w * 0.17, T / 2), v(w * 0.07, (T / 2) * (1 - fuller)), v(-w * 0.07, (T / 2) * (1 - fuller)), v(-w * 0.17, T / 2)];
  // 元の剣の断面と同じ回り（表の面を -x から +x へ）にそろえる
  return [...top, v(-w / 2, 0), ...top.slice(1).reverse().map((p) => new THREE.Vector3(p.x, p.y, -p.z))].reverse();
}
const bladeGeometry = () => loftRings([...BLADE_KEYS.map(([y, w, f]) => section(y, w, f)), [new THREE.Vector3(0, TIP_Y * MM, 0)]]);

// ---- 鍔 ----
const CROSS: Outline = [[-28, 94], [28, 94], [30, 101], [26, 108], [-26, 108], [-30, 101]]; // 根元の横木
const POST: Outline = [[-15, 104], [15, 104], [19, 140], [-19, 140]]; // 横木から刃の付け根までの台

// ---- 柄 ----
// 断面は元の柄と同じ八角で、刃の厚みの向きに少し潰す
const SIDES = 8;
const FLAT = 0.8;
const lathe = (prof: [r: number, y: number][], mat: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * MM, y * MM)), SIDES), mat);
  mesh.rotation.y = Math.PI / SIDES; // 面を正面へ向ける
  mesh.scale.z = FLAT;
  return mesh;
};
// 握り: 輪（太い所）と、その間のわずかな膨らみ。上（鍔の側）から下へ
function gripProfile() {
  const RINGS = [96, 48, 0, -48, -96];
  const prof: [number, number][] = [];
  RINGS.forEach((y, i) => {
    prof.push([11, y + 5], [13.5, y + 3], [13.5, y - 3], [11, y - 5]);
    if (i < RINGS.length - 1) prof.push([12.2, (y + RINGS[i + 1]) / 2]);
  });
  return prof;
}
// 柄頭: 襟 → 膨らんだ玉 → 円盤 → 小玉 → 尖った先
const POMMEL: [number, number][] = [
  [12.5, -100], [14.5, -103], [14.5, -108], [10, -112],
  [11, -115], [17, -123], [18, -130], [13, -140], [8, -146],
  [9, -148], [16.5, -151], [16.5, -157], [8, -160],
  [5, -162], [7, -167], [4, -172],
  [2, -174], [0, -192],
];

export const relicSword: SkinDecor = {
  build(parts, mats) {
    for (const name of ['blade', 'habaki', 'guard', 'grip', 'pommel']) if (parts[name]) parts[name].visible = false;
    // 元の剣の刃と柄のマテリアルを写して使う（飾りを外すときに捨てられるので、部位のものは渡さない）
    const black = mats.metal.clone();
    const hilt = mats.trim.clone();
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => g.add(new THREE.Mesh(geo, mat));

    add(bladeGeometry(), black);

    add(plate(CROSS, 0.016), black);
    add(plate(POST, 0.013), black);

    g.add(lathe(gripProfile(), hilt), lathe(POMMEL, black));
    return g;
  },
};

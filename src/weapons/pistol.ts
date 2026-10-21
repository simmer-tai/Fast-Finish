import * as THREE from 'three';
import type { WeaponMats } from './materials.js';

// ---- 敵の武器: 自動拳銃 ----
// 樹脂フレームのローポリ拳銃。角をすべて面取りした平たい面の組み合わせで、全体を艶のないグレー 1 色にまとめる
// 銃口が -Z、上が +Y、右が +X。原点はスライドの下面とグリップの付け根が交わる所
export function createPistol(mats: WeaponMats): THREE.Group {
  const gun = new THREE.Group();
  // 横から見た輪郭（[z, y] の並び）を、中心を x = 0 にして左右へ押し出す。縁は 1 段の面取りにする
  const side = (outline: [number, number][], width: number, bevel: number, mat: THREE.Material, holes: [number, number][][] = []) => {
    const toShape = <T extends THREE.Shape | THREE.Path>(s: T, pts: [number, number][]) => {
      s.moveTo(pts[0][0], pts[0][1]);
      for (const [u, v] of pts.slice(1)) s.lineTo(u, v);
      return s;
    };
    const shape = toShape(new THREE.Shape(), outline);
    for (const h of holes) shape.holes.push(toShape(new THREE.Path(), h));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -(width - bevel * 2) / 2);
    geo.rotateY(-Math.PI / 2); // 輪郭の x を銃の z に、押し出し方向を銃の x に
    const m = new THREE.Mesh(geo, mat);
    gun.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = mats.pistol) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    gun.add(m);
    return m;
  };

  // スライド: 前端の下側を斜めに落とした細長い箱
  const SLIDE_TOP = 0.03;
  const SLIDE_FRONT = -0.15;
  const SLIDE_BACK = 0.045;
  side(
    [
      [SLIDE_FRONT + 0.008, 0], [SLIDE_BACK, 0], [SLIDE_BACK, SLIDE_TOP - 0.004], [SLIDE_BACK - 0.004, SLIDE_TOP],
      [SLIDE_FRONT + 0.004, SLIDE_TOP], [SLIDE_FRONT, SLIDE_TOP - 0.006], [SLIDE_FRONT, 0.009],
    ],
    0.026, 0.004, mats.pistol,
  );
  // 銃身の先端: スライドの前から少しだけ顔を出す六角柱と、銃口の穴
  const BORE_Y = 0.017;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.008, 6), mats.pistol);
  barrel.rotation.set(Math.PI / 2, 0, 0);
  barrel.position.set(0, BORE_Y, SLIDE_FRONT - 0.003);
  gun.add(barrel);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 8), mats.bore);
  bore.position.set(0, BORE_Y, SLIDE_FRONT - 0.0072);
  bore.rotation.y = Math.PI;
  gun.add(bore);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, BORE_Y, SLIDE_FRONT - 0.007);
  gun.add(muzzle);
  gun.userData.muzzle = muzzle;
  // 排莢口: スライドの上面、後ろ寄りの四角い凹み
  box(0.016, 0.002, 0.04, 0.002, SLIDE_TOP + 0.0032, -0.012, mats.pistolDark);
  // スライド後部の滑り止めの溝
  for (let i = 0; i < 5; i++) box(0.0275, 0.02, 0.0018, 0, 0.015, 0.016 + i * 0.0055, mats.pistolDark);
  // 照門と照星
  box(0.016, 0.005, 0.006, 0, SLIDE_TOP + 0.006, SLIDE_BACK - 0.006);
  box(0.004, 0.004, 0.006, 0, SLIDE_TOP + 0.0055, SLIDE_FRONT + 0.008);

  // フレーム: スライドの下の台、角ばった用心鉄、後ろへ傾いたグリップを 1 枚の輪郭でつなぐ
  side(
    [
      [SLIDE_FRONT + 0.012, -0.001], [0.052, -0.001], // スライドの下面に沿う
      [0.062, -0.006], [0.064, -0.013], [0.05, -0.02], // 後ろへ張り出したビーバーテイル
      [0.072, -0.105], [0.068, -0.112], // 背面
      [0.018, -0.112], [0.006, -0.06], [0.0, -0.05], [-0.004, -0.044], // 底と前面（指の当たる所）
      [-0.06, -0.044], [-0.066, -0.039], [-0.07, -0.028], [-0.068, -0.019], // 用心鉄の底と角ばった前端
      [SLIDE_FRONT + 0.016, -0.017], [SLIDE_FRONT + 0.012, -0.01],
    ],
    0.022, 0.003, mats.pistol,
    // 用心鉄の内側の穴
    [[[-0.058, -0.022], [-0.009, -0.022], [-0.004, -0.03], [-0.008, -0.038], [-0.058, -0.038], [-0.062, -0.03]]],
  );
  // グリップの左右のふくらみ（フレームより一回り厚い）
  side(
    [[0.045, -0.026], [0.066, -0.1], [0.022, -0.1], [0.008, -0.056], [0.01, -0.03]],
    0.03, 0.004, mats.pistol,
  );
  // 弾倉の底板: グリップの下に少しはみ出す
  side([[0.072, -0.112], [0.074, -0.122], [0.016, -0.122], [0.016, -0.112]], 0.028, 0.002, mats.pistol);
  // 引き金: 前へ反った 2 枚の板
  box(0.006, 0.011, 0.005, 0, -0.026, -0.03).rotation.x = -0.25;
  box(0.006, 0.01, 0.005, 0, -0.035, -0.028).rotation.x = 0.35;
  // 左側面のスライドストップのレバーと、用心鉄の付け根の弾倉ボタン
  box(0.004, 0.005, 0.034, -0.013, -0.006, -0.012);
  box(0.004, 0.008, 0.008, -0.0125, -0.02, -0.003);

  return gun;
}

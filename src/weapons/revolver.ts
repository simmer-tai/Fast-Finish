import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../random.js';
import type { WeaponMats } from './materials.js';

// ---- 武器: ハンドガン（リボルバー） ----
// 角の立ったローポリの見た目にする。金属部分は暗いグレー、グリップはざらついたゴム
// シリンダーの中心から見た i 番目の薬室の位置
const chamberXY = (i: number): [number, number] => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
  return [Math.cos(a) * 0.0105, Math.sin(a) * 0.0105];
};

// 弾 1 発。原点は後端の縁で、弾頭は -Z。live = false なら撃ち終わった空の薬莢
const ROUND_LEN = 0.03;
const roundGeos = {
  rim: new THREE.CylinderGeometry(0.005, 0.005, 0.0015, 10).rotateX(Math.PI / 2).translate(0, 0, -0.00075),
  body: new THREE.CylinderGeometry(0.0042, 0.0042, ROUND_LEN, 10).rotateX(Math.PI / 2).translate(0, 0, -ROUND_LEN / 2),
  tip: new THREE.CylinderGeometry(0.0013, 0.0038, 0.008, 10).rotateX(Math.PI / 2).translate(0, 0, -ROUND_LEN - 0.004),
};
export function createRound(mats: WeaponMats, live: boolean): THREE.Group {
  const r = new THREE.Group();
  r.add(new THREE.Mesh(roundGeos.rim, mats.brass));
  r.add(new THREE.Mesh(roundGeos.body, mats.brass));
  const tip = new THREE.Mesh(roundGeos.tip, mats.lead);
  tip.visible = live;
  r.add(tip);
  r.userData.tip = tip;
  return r;
}

// 銃口が -Z、上が +Y。原点はグリップの上端（握る手の位置）、銃身の軸は y = 0
export function createRevolver(mats: WeaponMats): THREE.Group {
  const gun = new THREE.Group();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = mats.gun) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    gun.add(m);
    return m;
  };
  // Z 軸に沿った角柱（segments 角形）
  const prism = (rTop: number, rBottom: number, len: number, segments: number, z: number, y = 0, mat: THREE.Material = mats.gun) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, segments), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, y, z);
    gun.add(m);
    return m;
  };

  // 銃身: 縦に厚い角張った板で銃身を包み、前から上下 2 本の筒を突き出す
  const SHROUD_FRONT = -0.145;
  const SHROUD_BACK = -0.03; // シリンダーを振り出しても当たらない位置
  const shroudLen = SHROUD_BACK - SHROUD_FRONT;
  const shroudZ = (SHROUD_FRONT + SHROUD_BACK) / 2;
  box(0.018, 0.018, shroudLen, 0, 0.003, shroudZ); // 上半分
  box(0.006, 0.003, shroudLen, 0, 0.0135, shroudZ); // 上面の細いリブ
  box(0.018, 0.027, shroudLen, 0, -0.0165, shroudZ); // 下半分
  // 側面の肉抜きスリット（左右を貫く 1 枚の板で両側に見せる）
  for (let i = 0; i < 4; i++) box(0.0184, 0.003, 0.013, 0, 0.005, -0.048 - i * 0.022, mats.bore);
  box(0.0184, 0.0025, 0.04, 0, -0.02, -0.112, mats.bore);
  // 銃口の筒: 先端と根元に一回り太いリングを付けて段差を出す
  const BARREL_FRONT = SHROUD_FRONT - 0.016;
  for (const y of [0, -0.02]) {
    prism(0.006, 0.006, 0.016, 10, SHROUD_FRONT - 0.008, y);
    prism(0.0068, 0.0068, 0.004, 10, SHROUD_FRONT - 0.002, y);
    prism(0.0068, 0.0068, 0.004, 10, BARREL_FRONT + 0.002, y);
    // 銃口の穴
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 10), mats.bore);
    bore.position.set(0, y, BARREL_FRONT - 0.0002);
    bore.rotation.y = Math.PI;
    gun.add(bore);
  }
  // 弾とマズルフラッシュが出る位置
  const muzzle = new THREE.Object3D();
  muzzle.position.z = BARREL_FRONT;
  gun.add(muzzle);
  gun.userData.muzzle = muzzle;
  // フロントサイト: 前へ傾いたランプ
  const front = box(0.003, 0.009, 0.014, 0, 0.017, SHROUD_FRONT + 0.01);
  front.rotation.x = 0.35;

  // シリンダー: 銃身の軸より下に中心がある多角柱。前面に 6 つの薬室の穴
  const CYL_Y = -0.011;
  const CYL_LEN = 0.042;
  // 装填のときにシリンダーを左へ振り出せるよう、シリンダーとエジェクターロッドは
  // フレームの左下を軸に回るクレーン（crane）に載せる
  const crane = new THREE.Group();
  crane.position.set(-0.008, -0.03, 0);
  gun.add(crane);
  // 撃つたびに回せるよう、シリンダーの部品は軸に原点を置いた cylinder の子にする
  const cylinder = new THREE.Group();
  cylinder.position.set(0.008, CYL_Y + 0.03, 0);
  crane.add(cylinder);
  for (const m of [prism(0.0195, 0.0195, CYL_LEN, 12, 0), prism(0.016, 0.0195, 0.006, 12, -CYL_LEN / 2 - 0.002)]) {
    cylinder.add(m); // 2 つ目は前端の面取り
  }
  // 側面の溝（フルート）: 薬室と薬室の間に 1 本ずつ。撃つたびに回るのが横から見て分かる
  const fluteGeo = new THREE.BoxGeometry(0.0055, 0.0014, CYL_LEN * 0.6);
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2 + Math.PI / 2;
    const flute = new THREE.Mesh(fluteGeo, mats.flute);
    flute.position.set(Math.cos(a) * 0.019, Math.sin(a) * 0.019, -0.002);
    flute.rotation.z = a + Math.PI / 2;
    cylinder.add(flute);
  }
  for (let i = 0; i < 6; i++) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.0038, 8), mats.bore);
    hole.position.set(...chamberXY(i), -CYL_LEN / 2 - 0.0051);
    hole.rotation.y = Math.PI;
    cylinder.add(hole);
  }
  // 薬室に入っている弾（後ろから見える縁が後端に揃う）
  const chamberRounds: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const r = createRound(mats, true);
    r.position.set(...chamberXY(i), CYL_LEN / 2);
    cylinder.add(r);
    chamberRounds.push(r);
  }
  // 中心のピン（エジェクターロッド）。押すと薬莢をまとめて後ろへ押し出す
  // 先端は銃身の板の手前で止め、シリンダーを振り出しても板にめり込まないようにする
  const ejectorRod = prism(0.0025, 0.0025, 0.035, 6, -0.0115);
  ejectorRod.position.x = cylinder.position.x;
  ejectorRod.position.y = cylinder.position.y;
  crane.add(ejectorRod);

  // スピードローダー: 6 発をまとめて保持し、後ろから一度に差し込む
  const loader = new THREE.Group();
  loader.position.copy(cylinder.position);
  const loaderBody = new THREE.Group();
  loaderBody.add(prism(0.017, 0.017, 0.006, 12, 0.0045, 0, mats.loader)); // 弾を留める円盤
  loaderBody.add(prism(0.008, 0.01, 0.014, 8, 0.0145, 0, mats.loader)); // つまみ
  loader.add(loaderBody);
  const loaderRounds: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const r = createRound(mats, true);
    r.position.set(...chamberXY(i), 0);
    loader.add(r);
    loaderRounds.push(r);
  }
  loader.visible = false;
  crane.add(loader);

  Object.assign(gun.userData, { cylinder, crane, ejectorRod, chamberRounds, loader, loaderRounds, cylLen: CYL_LEN });

  // フレーム: シリンダーを上下と前後から囲む
  box(0.016, 0.009, 0.06, 0, 0.0125, 0.002); // トップストラップ
  box(0.018, 0.014, 0.068, 0, -0.037, 0.004); // 下側
  box(0.02, 0.04, 0.012, 0, -0.012, -0.028); // 前側（銃身の付け根）
  box(0.022, 0.058, 0.016, 0, -0.016, 0.031); // 後ろ側（リコイルシールド）
  // リアサイト
  box(0.008, 0.006, 0.008, 0, 0.019, 0.032);
  // ハンマー: 後ろ上へ反ったスパー
  const hammer = box(0.006, 0.022, 0.008, 0, 0.012, 0.044);
  hammer.rotation.x = -0.5;
  const spur = box(0.008, 0.004, 0.012, 0, 0.022, 0.052);
  spur.rotation.x = 0.25;

  // トリガーガード: フレームの下の半円
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0032, 5, 10, Math.PI), mats.gun);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.044, 0.006);
  gun.add(guard);
  // トリガー: 前へ反った細い板
  const trigger = box(0.005, 0.02, 0.005, 0, -0.054, 0.002);
  trigger.rotation.x = 0.35;

  // グリップ: 横から見た輪郭（前側に指の溝）を厚みに押し出し、頂点を少しずらしてゴツゴツさせる
  const shape = new THREE.Shape();
  const outline: [number, number][] = [
    [0.022, -0.042], [0.028, -0.06], [0.025, -0.072], [0.034, -0.082], [0.03, -0.094],
    [0.041, -0.104], [0.038, -0.117], [0.05, -0.132], [0.09, -0.134], [0.092, -0.115],
    [0.082, -0.085], [0.068, -0.055], [0.058, -0.03], [0.04, -0.02],
  ];
  shape.moveTo(outline[0][0], outline[0][1]);
  for (const [u, v] of outline.slice(1)) shape.lineTo(u, v);
  const GRIP_DEPTH = 0.022;
  let gripGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: GRIP_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  gripGeo.translate(0, 0, -GRIP_DEPTH / 2);
  gripGeo.rotateY(-Math.PI / 2); // 輪郭の x を銃の z に、押し出し方向を銃の x に
  gripGeo.deleteAttribute('normal');
  gripGeo.deleteAttribute('uv');
  gripGeo = mergeVertices(gripGeo);
  const rand = mulberry32(7);
  const p = gripGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + (rand() - 0.5) * 0.003, p.getY(i) + (rand() - 0.5) * 0.003, p.getZ(i) + (rand() - 0.5) * 0.003);
  }
  gripGeo.computeVertexNormals();
  gun.add(new THREE.Mesh(gripGeo, mats.grip));

  return gun;
}

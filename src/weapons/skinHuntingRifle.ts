import * as THREE from 'three';
import type { SkinDecor } from './skins.js';

// ---- スナイパーライフルのスキン: ハンティング ----
// 元の形を丸ごと隠し、木の銃床のボルトアクションの猟銃に作り直す。色は STANDARD のまま（部位のマテリアルを使う）
//   銃身: 照星の無い太く長い筒。先台の先から裸で銃口まで伸ばす
//   機関部: 丸い筒の上にレール。右の側面に排莢口、後ろにボルトの尻
//   ボルト: 機関部の後ろから右下へ曲がる握りと玉。レバーの代わりに、撃つたびに起こして後ろへ引き、戻して倒す
//   銃床: 先台から床尾まで一体の板。握りは下へ曲げ、頬当ては後ろへ少し上げる。床尾に穴の開いたゴムの床尾板
//   用心鉄: 引き金を囲む輪と、その前の弾倉の底板
//   スコープ: 元のライフルのものをそのまま使う（隠さずに残す）
// 寸法は rifle.ts と同じ（m。銃口が -Z、上が +Y、原点は握る位置）。銃口の位置とスコープは元のまま

const BORE_Y = 0.016;
const MUZZLE_Z = -0.8;
const RECEIVER_FRONT = -0.2;
const RECEIVER_BACK = 0;
const RECEIVER_R = 0.0155;
const LEVER_SWING = 0.95; // 元のレバーを下げきった角度（viewModelMotion.ts と同じ）。ボルトを起こして引く量に読み替える
const BOLT_Z = -0.014; // ボルトの握りの付け根
const BOLT_LIFT = 1.2; // 起こす角度
const BOLT_PULL = 0.055; // 引く長さ

type Outline = [number, number][]; // 横から見た輪郭 [z, y]
type Taper = (z: number, y: number) => number; // 輪郭の点ごとの厚みの割合

// 銃床: 先台の先から銃身の下を通り、機関部の後ろで握りへ下りて、頬当てを床尾まで伸ばす
const STOCK: Outline = [
  [-0.525, 0.006], [-0.5, 0.011], [-0.36, 0.011], [RECEIVER_FRONT, 0.011], [RECEIVER_BACK + 0.004, 0.011], // 銃身と機関部を載せる上の線
  [0.03, 0.013], [0.06, 0.02], [0.1, 0.027], [0.22, 0.03], [0.335, 0.032], // 握りの上から頬当て
  [0.345, 0.03], [0.352, -0.116], [0.34, -0.118], // 床尾
  [0.22, -0.09], [0.12, -0.066], // 下の線を握りへ戻す
  [0.09, -0.07], [0.075, -0.098], [0.06, -0.106], [0.042, -0.104], // 握りの尻
  [0.034, -0.08], [0.024, -0.05], [0.012, -0.032], // 握りの前
  [-0.05, -0.03], [-0.14, -0.032], [RECEIVER_FRONT, -0.03], // 機関部の下
  [-0.3, -0.024], [-0.42, -0.016], [-0.5, -0.008], // 先台の下を先へ絞る
];
const STOCK_DEPTH = 0.036;
// 厚み: 先台は細く、床尾へ太る。握りは一段細く
const stockTaper: Taper = (z, y) => (0.72 + 0.28 * ramp(-0.22, 0.08)(z)) * (1 - 0.14 * ramp(-0.03, -0.07)(y) * (1 - ramp(0.1, 0.16)(z)));
// 床尾板: 床尾の後ろに付けるゴムの板
const PAD: Outline = [[0.345, 0.03], [0.361, 0.03], [0.368, -0.116], [0.352, -0.116]];
// 握りの尻の蓋
const GRIP_CAP: Outline = [[0.075, -0.098], [0.06, -0.106], [0.042, -0.104], [0.043, -0.1], [0.06, -0.102], [0.073, -0.095]];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
function ramp(v0: number, v1: number) {
  return (v: number) => clamp01((v - v0) / (v1 - v0));
}

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

export const huntingRifle: SkinDecor = {
  build(_parts, mats, model) {
    // 元の部品をスコープのほかすべて隠す（銃口の印とあとから足す込める弾も残る）。込める弾は上の排莢口から入れる
    const body = ((model.userData.body ?? []) as THREE.Object3D[]).filter((o) => o.name !== 'scope');
    const shown = body.map((o) => o.visible);
    for (const o of body) o.visible = false;
    const lever = model.userData.lever as THREE.Object3D | undefined;
    model.userData.roundGate = new THREE.Vector3(0.03, BORE_Y + 0.016, -0.075);
    model.userData.roundIn = new THREE.Vector3(0.004, BORE_Y + 0.004, -0.095);

    // 部位のマテリアルをそのまま写して使う（外すときに捨てるので複製する）
    const metal = mats.metal.clone(); // 銃身・機関部・ボルト・用心鉄
    const wood = mats.wrap.clone(); // 銃床
    const trim = mats.trim.clone(); // レール
    const rubber = mats.metal.clone(); // 床尾板と握りの蓋
    rubber.metalness = 0.1;
    rubber.roughness = 0.85;
    const hole = mats.metal.clone(); // 銃口・排莢口・床尾板の穴
    hole.color.setHex(0x050505);
    hole.metalness = 0;
    hole.roughness = 0.9;
    const g = new THREE.Group();
    g.userData.undo = () => {
      body.forEach((o, i) => (o.visible = shown[i]));
      delete model.userData.roundGate;
      delete model.userData.roundIn;
    };
    const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    // Z 軸に沿った角柱（rFront が -Z 側）
    const prism = (rFront: number, rBack: number, len: number, sides: number, y: number, z: number, mat: THREE.Material, parent?: THREE.Object3D) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, sides), mat);
      m.rotation.x = -Math.PI / 2;
      return put(m, 0, y, z, parent);
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rx = 0) => {
      const m = put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);
      m.rotation.x = rx;
      return m;
    };

    // 銃身: 付け根から銃口へわずかに細る太い 12 角の筒。銃口の穴
    prism(0.0086, 0.0098, RECEIVER_FRONT - MUZZLE_Z, 12, BORE_Y, (RECEIVER_FRONT + MUZZLE_Z) / 2, metal);
    const bore = put(new THREE.Mesh(new THREE.CircleGeometry(0.0042, 12), hole), 0, BORE_Y, MUZZLE_Z - 0.0002);
    bore.rotation.y = Math.PI;

    // 機関部: 丸い筒と前の太い輪、上のレール（横溝を刻む）、右の排莢口
    prism(RECEIVER_R, RECEIVER_R, RECEIVER_BACK - RECEIVER_FRONT, 14, BORE_Y, (RECEIVER_FRONT + RECEIVER_BACK) / 2, metal);
    prism(RECEIVER_R + 0.0008, RECEIVER_R + 0.0008, 0.012, 14, BORE_Y, RECEIVER_FRONT + 0.006, metal);
    const RAIL_Y = BORE_Y + RECEIVER_R + 0.002;
    box(0.013, 0.006, 0.17, 0, RAIL_Y, -0.105, trim);
    for (let z = -0.18; z <= -0.03; z += 0.015) box(0.0136, 0.0015, 0.004, 0, RAIL_Y + 0.0024, z, hole);
    const port = box(0.003, 0.011, 0.055, 0.0118, BORE_Y + 0.009, -0.085, hole);
    port.rotation.z = -0.65; // 筒の右上の面に沿わせる

    // ボルト: 尻の筒と握り。撃つたびに付け根を軸に起こしてから後ろへ引く（元のレバーの開き具合で決める）
    const bolt = put(new THREE.Group(), 0, BORE_Y, 0);
    prism(0.011, 0.011, 0.012, 12, 0, RECEIVER_BACK + 0.006, metal, bolt);
    prism(0.0085, 0.011, 0.018, 12, 0, RECEIVER_BACK + 0.021, metal, bolt);
    const arm = put(new THREE.Group(), 0, 0, BOLT_Z, bolt);
    arm.rotation.set(0, -0.3, -0.6); // 右へ出して下へ倒し、少し後ろへ流す
    const stem = put(new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0032, 0.032, 8), metal), 0.026, 0, 0, arm);
    stem.rotation.z = Math.PI / 2;
    put(new THREE.Mesh(new THREE.IcosahedronGeometry(0.0058, 1), metal), 0.044, 0, 0, arm);
    // 毎フレームの行列の更新の前に、元のレバーの開き具合から起こす角度と引く量を決める（前半で起こし、後半で引く）
    bolt.updateMatrixWorld = function (force?: boolean) {
      const open = lever ? clamp01(lever.rotation.x / LEVER_SWING) : 0;
      this.rotation.z = clamp01(open * 2) * BOLT_LIFT;
      this.position.z = clamp01(open * 2 - 1) * BOLT_PULL;
      THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
    };

    // 銃床と床尾板（穴は左右を貫く細い溝）、握りの蓋
    g.add(slab(STOCK, STOCK_DEPTH, wood, stockTaper, 0.004));
    g.add(slab(PAD, STOCK_DEPTH + 0.001, rubber, undefined, 0.002));
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.7) / 6.4;
      box(STOCK_DEPTH + 0.002, 0.008, 0.007, 0, 0.03 - t * 0.146, 0.353 + t * 0.007, hole, 0.05);
    }
    g.add(slab(GRIP_CAP, STOCK_DEPTH * 0.82, rubber, undefined, 0.001));

    // 用心鉄: 弾倉の底板と、引き金を囲む輪。引き金
    box(0.018, 0.004, 0.1, 0, -0.032, -0.1, metal);
    box(0.008, 0.024, 0.005, 0, -0.043, -0.048, metal, -0.15); // 輪の前
    box(0.008, 0.005, 0.062, 0, -0.056, -0.018, metal, -0.05); // 輪の底
    box(0.008, 0.024, 0.005, 0, -0.045, 0.012, metal, 0.45); // 輪の後ろ（握りへ沿う）
    box(0.004, 0.02, 0.005, 0, -0.04, -0.022, metal, 0.35);

    // 吊り環: 先台の下と銃床の下
    for (const [z, y] of [[-0.44, -0.015], [0.26, -0.098]] as const) {
      const swivel = put(new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0016, 4, 8), metal), 0, y - 0.008, z);
      swivel.rotation.y = Math.PI / 2;
    }
    return g;
  },
};

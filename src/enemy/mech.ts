import * as THREE from 'three';
import { STRUCT_GRID, boxGeo, gridMaterial, octagonXGeo, octagonZGeo } from '../world/blocks.js';
import { DUMMY_HIP_Y, buildEnemyBody } from './body.js';

// ---- ボスの機体 ----
// 頭のない二足歩行の機体。高さ 6.5m ほど（プレイヤーの 3.5 倍ほど）で、+Z を向いて立つ。
// 機動力が高く見えるよう、脚は逆関節（膝が前、かかとが高い）にして、つま先で立たせる。胴体は前のめりに傾け、
// 背中に真下を向いた大きな噴射口を 2 本、ふくらはぎにも小さな噴射口を付け、肩当てと噴射口の上には後ろへ流れるひれを立てる。
// 胴体は中が空洞の箱で、前の上の縁を面取りし、前の上半分の大きな窓から中の座席に座ったボット（銃撃役の体）が見える。
// 腕は短く、手の代わりに 2 連の砲。胴体が傾いても砲は水平を向く。
// 面にはステージの箱と同じグリッド線を、部品ごとにその縁から面に沿って引く。装甲は暗く、関節は明るく、窓の枠・砲口・噴射口の奥は黒に近くする
const LIGHT_MECH = 0.22;
const LIGHT_MECH_PLATE = 0.3; // 重ねた板・砲身・噴射口
const LIGHT_MECH_JOINT = 0.62;
const LIGHT_MECH_SLIT = 0.06;
export const TORSO_LEAN = 0.2; // 胴体の前のめり (rad)

// 胴体の箱（胴体の中の座標）: x は ±TORSO_X、z は -1.0〜TORSO_FRONT
const TORSO_X = 0.85;
const TORSO_FRONT = 1.0;
const FLOOR_Y = 0.25; // 中の床
const ROOF_Y = 2.5; // 天井の上面
const WALL = 0.12; // 壁の厚さ
const CHAMFER = 0.4; // 前の上の縁の面取りの幅（45°）
const WINDOW_X = 0.6; // 窓の半幅
const WINDOW_Y0 = 0.95; // 窓の下端
const WINDOW_Y1 = 1.95; // 窓の上端
const SEAM_Y = 0.65; // 窓の下を一周する継ぎ目
const SEAT_Y = 0.75; // 座席の座面の高さ
const SEAT_Z = -0.4; // 座席の座面の中心（前後）
const SHOULDER_IN = 0.15; // 胴体を細くした分だけ、肩から先を内へ寄せる

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// 脚の関節の立ち姿勢での位置（機体の座標。side は右脚が -1）: 股 H、膝 K、かかと A、つま先の付け根 B
export const legRest = (side: number) => ({
  H: v(0.85 * side, 3.55, -0.15),
  K: v(1.15 * side, 2.35, 0.75),
  A: v(1.3 * side, 0.95, -0.55),
  B: v(1.35 * side, 0.32, 0.35),
});
export interface MechLeg { side: number; thigh: THREE.Group; shin: THREE.Group; meta: THREE.Group; foot: THREE.Group }
export interface MechRig {
  root: THREE.Group; // 足もと。位置と向きはこれで決める
  body: THREE.Group; // 腰から上
  torso: THREE.Group; // 胴体（腰の上でひねる）
  guns: THREE.Group[]; // 両腕の砲（肘が原点）。[0] が右
  legs: MechLeg[]; // [0] が右
  // 部位ごとのマテリアル（当たった部位だけを光らせる）。core は腰から上で、中のボットのマテリアルも含む
  mats: Record<'legR' | 'legL' | 'armR' | 'armL' | 'core', THREE.MeshLambertMaterial[]>;
}
// 部品の骨には userData.part に部位を書いておく（光線が当たった部品から親をたどって部位を知る）:
// 脚の骨は legR / legL、砲は armR / armL、腰から上（胴体・肩・上腕・中のボット）は core
const UP = v(0, 1, 0);
const FORWARD = v(0, 0, 1);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();

// 部品をためて、骨（group）ごと・形ごとに 1 つのメッシュにまとめる。形はどれも 0..1 の立方体に収めたもの
class Parts {
  private list = new Map<THREE.BufferGeometry, { m: THREE.Matrix4; light: number }[]>();
  // 部品の位置は origin を原点にした座標で書く（骨の付け根の位置を渡すと、立ち姿勢の座標のまま書ける）
  constructor(readonly group: THREE.Object3D, private mat: THREE.Material, private origin = v(0, 0, 0)) {}
  private add(geo: THREE.BufferGeometry, m: THREE.Matrix4, light: number) {
    if (!this.list.has(geo)) this.list.set(geo, []);
    this.list.get(geo)!.push({ m, light });
  }
  // 中心 c、大きさ (w, h, d) の箱。rot で回す
  box(c: THREE.Vector3, w: number, h: number, d: number, light: number, rot?: THREE.Euler) {
    const m = new THREE.Matrix4()
      .compose(c.clone().sub(this.origin), rot ? tmpQ.setFromEuler(rot) : tmpQ.identity(), v(w, h, d))
      .multiply(tmpM.makeTranslation(-0.5, -0.5, -0.5));
    this.add(boxGeo, m, light);
  }
  // a から b へ伸びる角材（太さ w は x の向き、d は前後の向き）
  seg(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, light: number) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Matrix4()
      .compose(a.clone().add(b).multiplyScalar(0.5).sub(this.origin), tmpQ.setFromUnitVectors(UP, dir.normalize()), v(w, len, d))
      .multiply(tmpM.makeTranslation(-0.5, -0.5, -0.5));
    this.add(boxGeo, m, light);
  }
  // a から b へ伸びる八角柱（半径 r）
  cyl(a: THREE.Vector3, b: THREE.Vector3, r: number, light: number) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Matrix4()
      .compose(a.clone().sub(this.origin), tmpQ.setFromUnitVectors(FORWARD, dir.normalize()), v(2 * r, 2 * r, len))
      .multiply(tmpM.makeTranslation(-0.5, -0.5, 0));
    this.add(octagonZGeo, m, light);
  }
  // 中心 c で x の向きに伸びる八角柱（関節の軸）
  axle(c: THREE.Vector3, r: number, len: number, light: number) {
    const m = new THREE.Matrix4().compose(c.clone().sub(this.origin), tmpQ.identity(), v(len, 2 * r, 2 * r)).multiply(tmpM.makeTranslation(-0.5, -0.5, -0.5));
    this.add(octagonXGeo, m, light);
  }
  build() {
    const color = new THREE.Color();
    for (const [geo, items] of this.list) {
      const mesh = new THREE.InstancedMesh(geo, this.mat, items.length);
      items.forEach(({ m, light }, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.setHSL(0, 0, light));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }
}

// 角材 a→b の前の面に沿う向き（前後と上下の面の中で、伸びる向きに直交する前向き）。脚の板を前後にずらすのに使う
const front = (a: THREE.Vector3, b: THREE.Vector3) => {
  const d = b.clone().sub(a).normalize();
  return v(0, d.z, -d.y);
};

export function buildMech(): MechRig {
  // 光らせ方は敵の体と同じ: 白の自己発光を emissiveIntensity で強める
  const look = () => {
    const m = gridMaterial(STRUCT_GRID, undefined, 'part');
    m.emissive.set(0xffffff);
    m.emissiveIntensity = 0;
    return m;
  };
  const mats = { legR: [look()], legL: [look()], armR: [look()], armL: [look()], core: [look()] };
  const mat = mats.core[0];
  const root = new THREE.Group();
  // 腰から上（腰・胴体・腕）。歩くときの上下の揺れと前後の傾きはこれに掛ける
  const body = new THREE.Group();
  body.userData.part = 'core';
  root.add(body);
  const P = new Parts(body, mat);
  const legs: MechLeg[] = [];

  // ---- 脚: 逆関節。股 H → 前に出た膝 K → 後ろの高いかかと A → つま先の付け根 B ----
  // 太もも・すね・かかとから先の骨・足を別々の骨にする
  for (const s of [-1, 1]) {
    const { H, K, A, B } = legRest(s);
    // 骨: 付け根ごとにまとまりを作り、根もとに置く（向きは poseMechLeg が決める）
    const bone = (at: THREE.Vector3) => {
      const g = new THREE.Group();
      g.position.copy(at);
      root.add(g);
      return { g, P: new Parts(g, (s < 0 ? mats.legR : mats.legL)[0], at) };
    };
    const thigh = bone(H);
    const shin = bone(K);
    const meta = bone(A);
    const foot = bone(B);
    for (const b of [thigh, shin, meta, foot]) b.g.userData.part = s < 0 ? 'legR' : 'legL';
    const Th = thigh.P;
    const Sh = shin.P;
    const Me = meta.P;
    const Fo = foot.P;
    const lerp = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
    const out = v(s, 0, 0);
    Th.axle(H, 0.38, 0.55, LIGHT_MECH_JOINT); // 股関節
    // 太もも: 角材に前の板と横の板
    Th.seg(H, K, 0.7, 0.8, LIGHT_MECH);
    const fT = front(H, K);
    Th.seg(lerp(H, K, 0.15).addScaledVector(fT, 0.42), lerp(H, K, 0.85).addScaledVector(fT, 0.42), 0.6, 0.1, LIGHT_MECH_PLATE);
    Th.seg(lerp(H, K, 0.2).addScaledVector(out, 0.38), lerp(H, K, 0.8).addScaledVector(out, 0.38), 0.08, 0.6, LIGHT_MECH_PLATE);
    // 膝: 軸と、前に突き出す膝当て
    Sh.axle(K, 0.34, 0.85, LIGHT_MECH_JOINT);
    Sh.seg(K.clone().add(v(0, 0.3, 0.05)), K.clone().add(v(0, -0.15, 0.5)), 0.62, 0.22, LIGHT_MECH_PLATE);
    // すね: 一番太い装甲。前に板、後ろ（ふくらはぎ）に噴射口の箱
    Sh.seg(K, A, 0.8, 0.75, LIGHT_MECH);
    const fS = front(K, A);
    Sh.seg(lerp(K, A, 0.1).addScaledVector(fS, 0.42), lerp(K, A, 0.85).addScaledVector(fS, 0.42), 0.7, 0.1, LIGHT_MECH_PLATE);
    Sh.seg(lerp(K, A, 0.5).addScaledVector(fS, 0.48), lerp(K, A, 0.52).addScaledVector(fS, 0.48), 0.72, 0.04, LIGHT_MECH_SLIT); // 板の継ぎ目
    const calf0 = lerp(K, A, 0.15).addScaledVector(fS, -0.5);
    const calf1 = lerp(K, A, 0.75).addScaledVector(fS, -0.55);
    Sh.seg(calf0, calf1, 0.5, 0.35, LIGHT_MECH_PLATE);
    const nz = calf1.clone().sub(calf0).normalize();
    Sh.cyl(calf1, calf1.clone().addScaledVector(nz, 0.3), 0.22, LIGHT_MECH_PLATE); // ふくらはぎの噴射口
    Sh.cyl(calf1.clone().addScaledVector(nz, 0.3), calf1.clone().addScaledVector(nz, 0.32), 0.16, LIGHT_MECH_SLIT);
    // 膝の外のピストン: 太ももの中ほどからすねの中ほどへ
    const p0 = lerp(H, K, 0.35).addScaledVector(out, 0.5);
    const p1 = lerp(K, A, 0.55).addScaledVector(out, 0.5);
    const pm = lerp(p0, p1, 0.5);
    Th.cyl(p0, pm, 0.12, LIGHT_MECH_PLATE);
    Sh.cyl(pm, p1, 0.08, LIGHT_MECH_JOINT);
    // かかと: 軸。そこからつま先の付け根へ細い骨
    Me.axle(A, 0.26, 0.6, LIGHT_MECH_JOINT);
    Me.seg(A, B, 0.42, 0.42, LIGHT_MECH_PLATE);
    const fM = front(A, B);
    Me.seg(lerp(A, B, 0.15).addScaledVector(fM, 0.24), lerp(A, B, 0.85).addScaledVector(fM, 0.24), 0.36, 0.08, LIGHT_MECH);
    // 足: 指の無い、前へ細く落ちる靴の形。平らな底に、つま先へ下がる甲の装甲と、尖らせたつま先のふた。
    // かかとは短く切り、後ろに小さな噴射口。甲の横には後ろへ流れる板
    const fx = 1.35 * s;
    Fo.axle(B, 0.22, 0.62, LIGHT_MECH_JOINT);
    Fo.box(v(fx, 0.06, 0.55), 0.78, 0.12, 1.5, LIGHT_MECH_PLATE); // 底
    Fo.box(v(fx, 0.08, 0.53), 0.82, 0.03, 1.46, LIGHT_MECH_SLIT); // 底の縁の継ぎ目
    Fo.box(v(fx, 0.3, 0.45), 0.7, 0.4, 0.95, LIGHT_MECH, new THREE.Euler(0.3, 0, 0)); // 甲
    Fo.box(v(fx, 0.18, 1.08), 0.62, 0.16, 0.5, LIGHT_MECH, new THREE.Euler(0.42, 0, 0)); // つま先
    Fo.box(v(fx, 0.27, 1.02), 0.4, 0.04, 0.5, LIGHT_MECH_JOINT, new THREE.Euler(0.42, 0, 0)); // つま先の筋
    Fo.box(v(fx, 0.22, -0.12), 0.6, 0.32, 0.4, LIGHT_MECH_PLATE); // かかと
    Fo.cyl(v(fx, 0.22, -0.32), v(fx, 0.22, -0.45), 0.11, LIGHT_MECH_JOINT);
    Fo.cyl(v(fx, 0.22, -0.45), v(fx, 0.22, -0.47), 0.07, LIGHT_MECH_SLIT);
    for (const k of [-1, 1]) Fo.box(v(fx + 0.37 * k, 0.28, 0.3), 0.05, 0.22, 0.8, LIGHT_MECH_PLATE, new THREE.Euler(-0.25, 0, 0));
    for (const b of [Th, Sh, Me, Fo]) b.build();
    legs.push({ side: s, thigh: thigh.g, shin: shin.g, meta: meta.g, foot: foot.g });
  }
  // 腰: 細く奥に引っ込め、前に小さな垂れ
  P.box(v(0, 3.7, -0.15), 1.5, 0.45, 0.9, LIGHT_MECH_JOINT);
  P.box(v(0, 3.5, 0.3), 0.9, 0.4, 0.15, LIGHT_MECH_PLATE, new THREE.Euler(-0.2, 0, 0));
  P.build();

  // ---- 胴体: 腰の上で前のめりに傾ける ----
  const torso = new THREE.Group();
  torso.position.set(0, 3.85, -0.15);
  torso.rotation.order = 'YXZ'; // 前のめりにしてから、腰の上でひねる
  torso.rotation.x = TORSO_LEAN;
  body.add(torso);
  const T = new Parts(torso, mat);
  const X = TORSO_X;
  const FZ = TORSO_FRONT;
  const R = ROOF_Y;
  const C = CHAMFER;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, light: number) =>
    T.box(v((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), x1 - x0, y1 - y0, z1 - z0, light);
  // 床より下は詰まった箱。壁・天井は薄い板で組み、前の上の縁は 45° の板で面取りする
  box(-X, X, 0, FLOOR_Y, -1.0, FZ, LIGHT_MECH);
  box(-X, X, FLOOR_Y, R, -1.0, -1.0 + WALL, LIGHT_MECH); // 後ろの壁
  box(-X, X, R - WALL, R, -1.0, FZ - C, LIGHT_MECH); // 天井
  T.box(v(0, R - C / 2 - 0.04, FZ - C / 2 - 0.04), 2 * X, WALL, C * Math.SQRT2, LIGHT_MECH, new THREE.Euler(Math.PI / 4, 0, 0)); // 面取り
  box(-X, X, FLOOR_Y, WINDOW_Y0, FZ - WALL, FZ, LIGHT_MECH); // 窓の下の前の壁
  box(-X, X, WINDOW_Y1, R - C, FZ - WALL, FZ, LIGHT_MECH); // 窓の上の前の壁
  box(-X, X, SEAM_Y, SEAM_Y + 0.05, FZ, FZ + 0.03, LIGHT_MECH_SLIT); // 前の継ぎ目
  for (const s of [-1, 1]) {
    const [x0, x1] = s > 0 ? [X - WALL, X] : [-X, -X + WALL];
    // 横の壁: 面取りの手前は天井まで、その前は面取りの下まで。面取りの下の三角は、45° 回した四角の上半分で埋める
    box(x0, x1, FLOOR_Y, R, -1.0, FZ - C, LIGHT_MECH);
    box(x0, x1, FLOOR_Y, R - C, FZ - C, FZ, LIGHT_MECH);
    T.box(v((x0 + x1) / 2, R - C, FZ - C / 2), WALL, C / Math.SQRT2, C / Math.SQRT2, LIGHT_MECH, new THREE.Euler(Math.PI / 4, 0, 0));
    box(s * WINDOW_X, s * X, WINDOW_Y0, WINDOW_Y1, FZ - WALL, FZ, LIGHT_MECH); // 窓の横の前の壁
    const [o0, o1] = s > 0 ? [X, X + 0.03] : [-X - 0.03, -X];
    box(o0, o1, SEAM_Y, SEAM_Y + 0.05, -1.0, FZ, LIGHT_MECH_SLIT); // 横の継ぎ目
  }
  // 窓の縁: 開口の内側を黒い枠で一回り囲む
  const f = 0.07;
  const fz0 = FZ - WALL - 0.05;
  box(-WINDOW_X, WINDOW_X, WINDOW_Y0, WINDOW_Y0 + f, fz0, FZ, LIGHT_MECH_SLIT);
  box(-WINDOW_X, WINDOW_X, WINDOW_Y1 - f, WINDOW_Y1, fz0, FZ, LIGHT_MECH_SLIT);
  box(-WINDOW_X, -WINDOW_X + f, WINDOW_Y0, WINDOW_Y1, fz0, FZ, LIGHT_MECH_SLIT);
  box(WINDOW_X - f, WINDOW_X, WINDOW_Y0, WINDOW_Y1, fz0, FZ, LIGHT_MECH_SLIT);
  // 中: 奥の壁は暗く張り、ボットの後ろに座席、前に計器の台（窓の下に隠れる）
  box(-X + WALL, X - WALL, FLOOR_Y, R - WALL, -1.0 + WALL, -1.0 + WALL + 0.03, LIGHT_MECH_SLIT);
  box(-0.4, 0.4, FLOOR_Y, SEAT_Y, SEAT_Z - 0.2, SEAT_Z + 0.2, LIGHT_MECH_PLATE);
  box(-0.4, 0.4, SEAT_Y, SEAT_Y + 0.8, SEAT_Z - 0.2, SEAT_Z - 0.05, LIGHT_MECH_PLATE);
  box(-0.55, 0.55, FLOOR_Y, WINDOW_Y0 + 0.05, 0.5, FZ - WALL, LIGHT_MECH_PLATE);
  // 背中の噴射口 2 本: 真下へ向け（胴体の傾きを打ち消す）、台で胴体に留める。上に後ろへ流れるひれ
  const down = v(0, -Math.cos(TORSO_LEAN), Math.sin(TORSO_LEAN));
  for (const x of [-0.45, 0.45]) {
    const a = v(x, 2.15, -1.4);
    const b = a.clone().addScaledVector(down, 1.1);
    const d = down;
    T.box(v(x, 1.65, -1.15), 0.45, 0.7, 0.35, LIGHT_MECH_JOINT);
    T.cyl(a, b, 0.36, LIGHT_MECH);
    T.cyl(b, b.clone().addScaledVector(d, 0.35), 0.44, LIGHT_MECH_PLATE); // 噴射口の広がり
    T.cyl(b.clone().addScaledVector(d, 0.35), b.clone().addScaledVector(d, 0.37), 0.34, LIGHT_MECH_SLIT);
    T.cyl(a.clone().addScaledVector(d, 0.3), a.clone().addScaledVector(d, 0.45), 0.39, LIGHT_MECH_JOINT); // 帯
    T.box(v(x, 2.4, -1.55), 0.06, 0.5, 0.8, LIGHT_MECH_PLATE, new THREE.Euler(-0.35, 0, 0));
  }
  // 天井の後ろに、後ろへ寝かせたアンテナ
  T.box(v(0.6, R + 0.35, -0.75), 0.05, 0.9, 0.05, LIGHT_MECH_JOINT, new THREE.Euler(-0.7, 0, 0));

  // ---- 肩と腕 ----
  const guns: THREE.Group[] = []; // [0] が右（-X 側）
  for (const s of [-1, 1]) {
    const sx = (x: number) => (x - SHOULDER_IN) * s;
    T.axle(v(sx(1.15), 1.85, -0.1), 0.35, 0.45, LIGHT_MECH_JOINT); // 肩の軸
    // 肩当て: 外へ下がる大きな板と、その下に重ねた板。上に後ろへ流れるひれ
    T.box(v(sx(1.6), 2.1, -0.15), 0.9, 0.7, 1.5, LIGHT_MECH, new THREE.Euler(-0.1, 0, -0.3 * s));
    T.box(v(sx(1.78), 1.68, -0.15), 0.85, 0.12, 1.3, LIGHT_MECH_PLATE, new THREE.Euler(-0.1, 0, -0.3 * s));
    T.box(v(sx(1.55), 2.0, 0.62), 0.8, 0.5, 0.06, LIGHT_MECH_PLATE, new THREE.Euler(0, 0, -0.3 * s)); // 前の板
    T.box(v(sx(1.45), 2.7, -0.55), 0.07, 0.8, 1.0, LIGHT_MECH_PLATE, new THREE.Euler(-0.6, 0, 0.12 * s));
    // 上腕
    T.seg(v(sx(1.6), 1.75, -0.1), v(sx(1.75), 0.85, 0.12), 0.4, 0.45, LIGHT_MECH_JOINT);
    // 砲: 胴体の傾きを打ち消して水平に向ける
    const gun = new THREE.Group();
    gun.position.set(sx(1.8), 0.7, 0.2);
    gun.rotation.x = -TORSO_LEAN;
    torso.add(gun);
    gun.userData.part = s < 0 ? 'armR' : 'armL';
    guns.push(gun);
    const G = new Parts(gun, (s < 0 ? mats.armR : mats.armL)[0]);
    G.axle(v(0, 0.1, 0), 0.25, 0.85, LIGHT_MECH_JOINT); // 肘
    G.box(v(0, 0, 0.55), 0.75, 0.75, 1.9, LIGHT_MECH); // 砲の胴
    G.box(v(0, 0.42, 0.5), 0.65, 0.1, 1.6, LIGHT_MECH_PLATE);
    G.box(v(0.4 * s, 0, 0.6), 0.06, 0.55, 1.4, LIGHT_MECH_PLATE);
    for (let k = 0; k < 4; k++) G.box(v(0.44 * s, 0, 0.2 + k * 0.28), 0.03, 0.4, 0.12, LIGHT_MECH_SLIT); // 放熱のすき間
    for (const y of [-0.17, 0.17]) {
      G.cyl(v(0, y, 1.5), v(0, y, 2.5), 0.14, LIGHT_MECH_PLATE); // 砲身
      for (const z of [1.65, 1.95, 2.25]) G.cyl(v(0, y, z), v(0, y, z + 0.1), 0.17, LIGHT_MECH_JOINT);
      G.cyl(v(0, y, 2.5), v(0, y, 2.52), 0.09, LIGHT_MECH_SLIT); // 砲口
    }
    // 右の砲の外にだけ弾倉
    if (s < 0) {
      G.cyl(v(-0.55, 0, 0.1), v(-0.55, 0, 1.0), 0.33, LIGHT_MECH_PLATE);
      G.box(v(-0.45, 0, 0.55), 0.2, 0.2, 0.15, LIGHT_MECH_JOINT);
    }
    G.build();
  }
  T.build();

  // ---- 中のボット: 座席に腰掛け、太ももを前へ水平に出して、すねを真下へ下ろす ----
  const botBody = buildEnemyBody();
  const bot = botBody.root;
  bot.position.set(0, SEAT_Y + 0.08 - DUMMY_HIP_Y, SEAT_Z + 0.05);
  for (let i = 0; i < 2; i++) {
    botBody.thighs[i].rotation.x = -Math.PI / 2;
    botBody.shins[i].rotation.x = Math.PI / 2;
  }
  torso.add(bot);
  mats.core.push(...botBody.mats);
  return { root, body, torso, guns, legs, mats };
}

// ---- 脚の姿勢 ----
// 足（つま先の付け根 B）の位置を機体の座標で決めると、かかとから先の骨は立ち姿勢の向きのまま、
// 太ももとすねを 2 本の骨の IK で決める（膝は前へ折る）。左右の位置 x は骨ごとに立ち姿勢のまま。
// hipY は腰から上を上下させた量（股の付け根も同じだけ動く）。footYaw は足を機体に対して回す角度
const ang = (y: number, z: number) => Math.atan2(z, y); // 前後と上下の面での向き（rotation.x と同じ回り方）
export function poseMechLeg(leg: MechLeg, hipY: number, foot: THREE.Vector3, footYaw = 0) {
  const { H, K, A, B } = legRest(leg.side);
  const hy = H.y + hipY;
  const hz = H.z;
  // かかと: 足から、立ち姿勢のかかと→足の差を引いた所
  const ay = foot.y + A.y - B.y;
  const az = foot.z + A.z - B.z;
  const l1 = Math.hypot(K.y - H.y, K.z - H.z);
  const l2 = Math.hypot(A.y - K.y, A.z - K.z);
  let dy = ay - hy;
  let dz = az - hz;
  let d = Math.hypot(dy, dz);
  const dMax = l1 + l2 - 1e-3;
  const dMin = Math.abs(l1 - l2) + 1e-3;
  if (d > dMax || d < dMin) {
    const k = THREE.MathUtils.clamp(d, dMin, dMax) / Math.max(d, 1e-6);
    dy *= k;
    dz *= k;
    d *= k;
  }
  // 股から見た膝の向き: 股→かかとの向きから、余弦定理の角だけ前へ回す
  const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = ang(dy, dz);
  const kA = ang(Math.cos(base + a), Math.sin(base + a));
  const kB = ang(Math.cos(base - a), Math.sin(base - a));
  const kAng = Math.sin(kA) > Math.sin(kB) ? kA : kB; // 膝が前（+z）に出る方
  const ky = hy + l1 * Math.cos(kAng);
  const kz = hz + l1 * Math.sin(kAng);
  leg.thigh.position.set(H.x, hy, hz);
  leg.thigh.rotation.x = kAng - ang(K.y - H.y, K.z - H.z);
  leg.shin.position.set(K.x, ky, kz);
  leg.shin.rotation.x = ang(hy + dy - ky, hz + dz - kz) - ang(A.y - K.y, A.z - K.z);
  leg.meta.position.set(A.x + foot.x - B.x, hy + dy, hz + dz);
  leg.foot.position.copy(foot);
  leg.foot.rotation.y = footYaw;
}

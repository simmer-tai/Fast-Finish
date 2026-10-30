import * as THREE from 'three';

// ---- 武器: バトルアックス ----
// 髭付きのトマホーク。頭は後ろへ尖ったスパイクと、後ろの角が柄の方へ垂れた刃。
// 頭の板は辺に沿った枠を残して中をくり抜き、刃先の側だけは中まで詰めて刃先へ薄く面取りする。
// 柄は長く太い一枚の板で、握りの前に指を守る爪、柄尻に下向きの鉤がある。
// 形はシルエット案の座標 [x, y] で書く（x: 頭の先 → 柄尻、y: 上 → 刃先、柄の中心が y = 512、1 = 1mm）。
// モデルでは +Y が頭、+X が刃先の向きで、原点は右手で握る位置

export interface AxeMats {
  metal: THREE.Material; // 頭
  grip: THREE.Material; // 柄
}

export type AxePoint = [number, number];
type P = AxePoint;

// シルエット案 B4（頭）と H5（柄）を、T6 の大きさにする
const HEAD_B4: P[] = [[150, 330], [192, 470], [262, 487], [262, 538], [208, 546], [214, 620], [276, 702], [250, 718], [140, 714], [55, 682], [96, 546], [118, 470]];
const HANDLE_H5: P[] = [[250, 489], [980, 492], [1000, 500], [1002, 530], [990, 582], [972, 574], [960, 544], [680, 542], [662, 576], [640, 576], [630, 540], [250, 537]];
const HEAD_K = 1.3; // 頭の大きさ
const HANDLE_LONG = 1.6; // 柄の長さ
const HANDLE_THICK = 1.15; // 柄の太さ
const HEAD: P[] = HEAD_B4.map(([x, y]) => [262 + (x - 262) * HEAD_K, 512 + (y - 512) * HEAD_K]);
const HANDLE: P[] = HANDLE_H5.map(([x, y]) => [250 + (x - 250) * HANDLE_LONG, 512 + (y - 512) * HANDLE_THICK]);
const EDGE = [6, 7, 8, 9]; // 刃先の点（HEAD の番号）
const JOINT = [2, 3]; // 頭が柄とつながる所の凹み（HEAD の番号）

const HOLD_X = 1080; // 握る位置（指を守る爪のすぐ後ろ）
const toV2 = ([x, y]: P) => new THREE.Vector2((y - 512) / 1000, (HOLD_X - x) / 1000);
const toV3 = (p: P, z: number) => { const v = toV2(p); return new THREE.Vector3(v.x, v.y, z); };
// モデルの座標（mm。x は刃先の側が +、y は頭の側が +）をシルエット案の座標に直す（スキンが形を書くとき）
export const axePointFromMm = ([x, y]: P): P => [HOLD_X - y, x + 512];

// 厚さ (m)
const HEAD_T = 0.03; // 頭
const EDGE_T = 0.002; // 刃先
const BEVEL_K = 0.3; // 刃の面取りの幅（刃先から頭の中心へ向けての割合）
const RIM = 45; // 頭のくり抜きのまわりに残す枠の幅 (mm)
const HANDLE_T = 0.028; // 柄（面取り込みで 0.038）

// 多角形 pts を、各辺から w だけ内側へ平行に寄せた多角形にする（辺に沿って同じ幅の枠を残すくり抜きに使う）。
// 寄せると潰れてしまう短い辺は、先に間引いておく
function inset(pts: P[], w: number): P[] {
  const poly = pts.slice();
  for (let i = 0; i < poly.length && poly.length > 3; ) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < w * 1.5) poly.splice((i + 1) % poly.length, 1);
    else i++;
  }
  const area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const side = area > 0 ? 1 : -1; // 内側へ向ける法線の向き
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n: P = [(-(q[1] - p[1]) / len) * side, ((q[0] - p[0]) / len) * side];
    return { p: [p[0] + n[0] * w, p[1] + n[1] * w] as P, d: [q[0] - p[0], q[1] - p[1]] as P };
  });
  return lines.map((l1, i): P => {
    const l0 = lines[(i - 1 + lines.length) % lines.length];
    const den = l0.d[0] * l1.d[1] - l0.d[1] * l1.d[0];
    if (Math.abs(den) < 1e-6) return l1.p;
    const t = ((l1.p[0] - l0.p[0]) * l1.d[1] - (l1.p[1] - l0.p[1]) * l1.d[0]) / den;
    return [l0.p[0] + l0.d[0] * t, l0.p[1] + l0.d[1] * t];
  });
}

// 輪郭 pts（穴 holes 付き）を厚さ depth の板にする。面取りの分だけ外へ広がり、穴は狭まる。中心は z = 0
function extrude(pts: P[], depth: number, bevel: number, mat: THREE.Material, holes: P[][] = []): THREE.Mesh {
  const shape = new THREE.Shape(pts.map(toV2));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(toV2)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, mat);
}

// 三角形の並び（[a, b, c, 内側の点]）から、表を外へ向けたメッシュを作る
type Tri = [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
function solid(tris: Tri[], mat: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const [p, q, r, ref] of tris) {
    ab.subVectors(q, p);
    ac.subVectors(r, p);
    c.copy(p).add(q).add(r).divideScalar(3).sub(ref);
    const flip = ab.cross(ac).dot(c) < 0;
    for (const v of flip ? [p, r, q] : [p, q, r]) pos.push(v.x, v.y, v.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3): Tri[] =>
  [[a, b, c, ref], [a, c, d, ref]];

// 刃の面取りの境目: 刃先の各点を、頭の中心へ向けて BEVEL_K だけ寄せた線
const CX = HEAD.reduce((s, p) => s + p[0], 0) / HEAD.length;
const CY = HEAD.reduce((s, p) => s + p[1], 0) / HEAD.length;
export const AXE_EDGE: P[] = EDGE.map((i) => HEAD[i]);
export const AXE_BEVEL: P[] = AXE_EDGE.map(([x, y]): P => [x + (CX - x) * BEVEL_K, y + (CY - y) * BEVEL_K]);
export const AXE_HEAD_T = HEAD_T;
export const AXE_EDGE_T = EDGE_T;

// 刃の面取りの帯: 線 a（厚さ ta）から線 b（厚さ tb）へすぼまる。a と b は刃先に沿って同じ数の点
export function axeBevel(a: P[], ta: number, b: P[], tb: number, mat: THREE.Material): THREE.Mesh {
  const ref = toV3([(CX + AXE_EDGE[1][0]) / 2, (CY + AXE_EDGE[1][1]) / 2], 0);
  const iF = a.map((p) => toV3(p, ta / 2));
  const iB = a.map((p) => toV3(p, -ta / 2));
  const eF = b.map((p) => toV3(p, tb / 2));
  const eB = b.map((p) => toV3(p, -tb / 2));
  const tris: Tri[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    tris.push(...quad(iF[i], iF[i + 1], eF[i + 1], eF[i], ref));
    tris.push(...quad(iB[i], iB[i + 1], eB[i + 1], eB[i], ref));
    tris.push(...quad(eF[i], eF[i + 1], eB[i + 1], eB[i], ref));
    tris.push(...quad(iF[i], iF[i + 1], iB[i + 1], iB[i], ref));
  }
  const n = a.length - 1;
  tris.push(...quad(iF[0], eF[0], eB[0], iB[0], ref), ...quad(iF[n], eF[n], eB[n], iB[n], ref));
  return solid(tris, mat);
}

// +Y 方向が頭、+X 方向が刃先になるよう組み立てる（原点は握る位置）
export function createBattleAxe(mats: AxeMats): THREE.Group {
  const axe = new THREE.Group();
  // 部位には名前を付けておく（スキンの飾りが隠したり差し替えたりする）
  const part = (name: string, m: THREE.Mesh) => {
    m.name = name;
    axe.add(m);
  };

  // 頭の胴: 刃先の点を境目の線に置き換えた輪郭の板。中は輪郭から RIM だけ内側でくり抜いて枠にする。
  // 穴の形は柄の付け根の凹みを飛ばした輪郭から作り、柄の側の内縁をなだらかな直線にする
  const body = [...HEAD.slice(0, EDGE[0]), ...AXE_BEVEL, ...HEAD.slice(EDGE[EDGE.length - 1] + 1)];
  const holeSrc = body.filter((_, i) => !JOINT.includes(i));
  part('head', extrude(body, HEAD_T - 0.004, 0.002, mats.metal, [inset(holeSrc, RIM)]));

  // 刃: 境目の線（頭の厚さ）から刃先（薄い）へすぼまる面取り
  part('bevel', axeBevel(AXE_BEVEL, HEAD_T, AXE_EDGE, EDGE_T, mats.metal));

  // 柄: 輪郭を押し出し、角を大きく面取りして握れる太さにする
  part('handle', extrude(HANDLE, HANDLE_T, 0.005, mats.grip));

  axe.userData.tipY = (HOLD_X - Math.min(...HEAD.map((p) => p[0]))) / 1000;
  return axe;
}

// 一人称での構え（カメラ基準）。両手で柄を握り、体の前で斜めに構える。
// 右手（原点）は画面の下の中央の外、左手は柄尻の側を握って画面の左下の外にある（手のモデルが無いので、握る所が見えると斧が宙に浮いて見える）。
// 柄は画面の下の縁から右上へ斜めに立ち上がり、頭を照準の右上に置く。指を守る爪が画面の下の縁にのぞく。
// 頭の平たい面をいったんカメラへ向け、そこから柄を軸に AXE_EDGE_TWIST だけ回して刃先を前（奥）へ向ける
export const AXE_VIEW_MODEL_POS = new THREE.Vector3(-0.05, -0.48, -0.42);
const AXE_EDGE_TWIST = -60 * (Math.PI / 180);
export const AXE_REST_QUAT = (() => {
  const up = new THREE.Vector3(0.6, 0.7, -0.4).normalize(); // 柄尻 → 頭の向き
  const head = AXE_VIEW_MODEL_POS.clone().addScaledVector(up, 1); // 頭のあたり
  const faceDir = head.addScaledVector(up, -head.dot(up)).normalize(); // カメラから遠ざかる向き
  const edgeDir = new THREE.Vector3().crossVectors(up, faceDir);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(edgeDir, up, faceDir))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), AXE_EDGE_TWIST));
})();

// 手に持たせた斧。userData.rest が構えの向き（攻撃の動きはこの下に足す）
export function createHeldAxe(mats: AxeMats): THREE.Group {
  const held = new THREE.Group();
  const rest = new THREE.Group();
  rest.quaternion.copy(AXE_REST_QUAT);
  held.add(rest);
  const axe = createBattleAxe(mats);
  rest.add(axe);
  held.userData.rest = rest;
  held.userData.axe = axe;
  return held;
}

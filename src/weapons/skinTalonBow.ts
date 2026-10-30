import * as THREE from 'three';
import { addGlow, removeGlow, type GlowSource } from '../fx/glow.js';
import { RISER_C, limbPath } from './bow.js';
import { MM, TALON_GLOW, bolt, createTalonMats, plate, tickTalonGlow, type Outline, type TalonMats } from './skinTalon.js';
import type { SkinDecor } from './skins.js';

// ---- 弓のスキン: 爪 ----
// 剣の「爪」と同じ黒い機械の弓。色は skins.ts の looks で黒くし、柄・握り・リムは直線でできた刃の形に作り直す。
//   リム: 元のリムの曲がりを 3 本の直線でなぞる板（柄から立ち上がり、射手の側へ大きく折れ、先で前へ折り返す）。
//         先へ行くほど薄く、先端は弦を掛ける所を越えて尖る。前の縁に赤く光る刃先の帯
//   爪: 柄の上下の端から、リムの付け根を前と後ろから挟む二本の爪が伸びる。爪の上にボルト
//   柄: 直線だけでできた板。前の縁は上下とも、握りの近くから柄の端へまっすぐ開いていく刃先で、端は斜めに一度だけ落とした切っ先。
//       刃先に沿って赤く光る帯。後ろの縁はまっすぐで、握りは後ろへ角ばって張り出す。棚より上は元の柄と同じく右へ寄せて細くし、
//       左に矢の通り道を空ける。握りには暗い巻きと斜めの帯
//   弦: 赤く光らせる（顔の前を横切るので、外へはにじませない）
//   矢: 黒い軸と羽、赤く光る鏃と筈（つがえた矢・3 本射ちの矢・飛ぶ矢）
// 輪郭は弓のモデルの座標を mm で書く（x は的の側が +、y は上が +、原点は握る位置）。下の爪は柄の中心の高さで上下に映す

const CLAW_FRONT: Outline = [[28, 396], [50, 404], [34, 478], [18, 452], [24, 420]];
const CLAW_BACK: Outline = [[12, 396], [-8, 404], [-6, 470], [6, 446], [10, 420]];
const CLAW_D = 0.04; // リム（横幅 36 mm）を表と裏から挟む
const BOLTS: [x: number, y: number][] = [[33, 430], [1, 430]];
// リムの折れ目: 元のリムの中心線（bow.ts の limbPath）の何番目の点か。根元・立ち上がりの終わり・前へ折り返す所・弦を掛ける所
const LIMB_AT = [0, 4, 12, 18];
// 折れ目ごとの [前の厚み, 後ろの厚み, 刃先の帯の幅]（mm）。最後は尖った先端（弦を掛ける所から LIMB_TIP mm 先）
const LIMB_W: [front: number, back: number, band: number][] = [[7, 7, 2.6], [7, 6, 2.6], [5, 4, 2.2], [4, 3.5, 1.6], [0, 0, 0]];
const LIMB_TIP = 22;
const LIMB_T = 0.024; // リムの横幅
// 柄（棚 y = 58 を境に上下 2 枚）。前の縁は赤い帯の内側の線で、帯がその外の刃先になる。端はリムの差し込み口（元の柄の端）を覆う
const RISER_UP: Outline = [[-6, 58], [4, 416], [48, 416], [66, 384], [61, 382], [15, 62]];
const EDGE_UP: Outline = [[20, 62], [66, 384], [61, 382], [15, 62]];
const RISER_LOW: Outline = [
  [-6, 58], [20, 62], [14, 42], [12, -80], [7, -84], [61, -284], [66, -282], [48, -316], [4, -316], [-8, -90],
  [-30, -76], [-42, -10], [-34, 42], // 握りが後ろへ張り出す
];
const EDGE_LOW: Outline = [[12, -80], [66, -282], [61, -284], [7, -84]];
const RISER_UP_T = 0.015; // 棚より上: 元の柄と同じく右へ寄せて細くし、左に矢の通り道を空ける
const RISER_UP_Z = 0.0065;
const RISER_LOW_T = 0.026;
const EDGE_T = 0.009; // 帯は柄より薄くして、刃先を鋭く見せる
const GRIP: Outline = [[16, 42], [12, -78], [-30, -78], [-42, -10], [-34, 42]];
const GRIP_T = 0.03;
const GLOW_K = 0.35; // 刃先のにじみの濃さ（弓は大きく目の前にあるので弱め）

const flipY = ([x, y]: [number, number]): [number, number] => [x, 2 * RISER_C * 1000 - y];

// 上のリムの輪郭: 本体（前の縁は帯の内側の線）と、前の縁の刃先の帯。折れ目では前後の線を角のまま折る
function limbOutlines(): { body: Outline; band: Outline } {
  const path = limbPath();
  const end = path[path.length - 1];
  const pts = [...LIMB_AT.map((i) => path[i].p), end.p.clone().addScaledVector(end.t, LIMB_TIP * MM)].map((p) => new THREE.Vector2(p.x / MM, p.y / MM));
  const front = (a: THREE.Vector2, b: THREE.Vector2) => {
    const t = b.clone().sub(a).normalize();
    return new THREE.Vector2(t.y, -t.x); // 進む向きに直交して前（+X の側）
  };
  // 中心線から前（+）・後ろ（-）へ k(i) mm ずらした線。折れ目は両側の線の交わる所
  const line = (k: (i: number) => number) => pts.map((p, i): [number, number] => {
    const n0 = front(pts[Math.max(i - 1, 0)], pts[Math.max(i, 1)]);
    const n1 = front(pts[Math.min(i, pts.length - 2)], pts[Math.min(i + 1, pts.length - 1)]);
    const n = n0.clone().add(n1).normalize();
    const q = p.clone().addScaledVector(n, k(i) / n.dot(n0));
    return [q.x, q.y];
  });
  const inner = line((i) => LIMB_W[i][0]);
  const outer = line((i) => LIMB_W[i][0] + LIMB_W[i][2]);
  const back = line((i) => -LIMB_W[i][1]);
  return {
    body: [...inner, ...back.slice(0, -1).reverse()],
    band: [...outer, ...inner.slice(0, -1).reverse()],
  };
}

export const talonBow: SkinDecor = {
  build(parts, mats, model) {
    const m = createTalonMats(mats.metal.envMap);
    const g = new THREE.Group();
    const glows: GlowSource[] = [];
    const limb = limbOutlines();
    for (const sign of [1, -1]) {
      const map = (o: Outline) => (sign > 0 ? o : o.map(flipY));
      // リムと前の縁の赤い刃先
      const limbBand = new THREE.Mesh(plate(map(limb.band), EDGE_T, 0.0008), m.edge);
      const limbGlow = addGlow(limbBand, TALON_GLOW);
      limbBand.onBeforeRender = () => tickTalonGlow(m.edge, limbGlow, GLOW_K);
      glows.push(limbGlow);
      g.add(new THREE.Mesh(plate(map(limb.body), LIMB_T, 0.0015), m.black), limbBand);
      // 柄（上: 棚より上、下: 握りと棚より下）と、前の縁の赤い刃先
      const z = sign > 0 ? RISER_UP_Z : 0;
      const riser = new THREE.Mesh(plate(sign > 0 ? RISER_UP : RISER_LOW, sign > 0 ? RISER_UP_T : RISER_LOW_T, 0.0015), m.black);
      const riserEdge = new THREE.Mesh(plate(sign > 0 ? EDGE_UP : EDGE_LOW, EDGE_T, 0.0008), m.edge);
      riser.position.z = riserEdge.position.z = z;
      const riserGlow = addGlow(riserEdge, TALON_GLOW);
      riserEdge.onBeforeRender = () => tickTalonGlow(m.edge, riserGlow, GLOW_K);
      glows.push(riserGlow);
      g.add(riser, riserEdge);
      g.add(new THREE.Mesh(plate(map(CLAW_FRONT), CLAW_D), m.black), new THREE.Mesh(plate(map(CLAW_BACK), CLAW_D), m.black));
      for (const [x, y] of BOLTS) {
        const [bx, by] = sign > 0 ? [x, y] : flipY([x, y]);
        bolt(g, m, bx, by, CLAW_D, 0.0028);
      }
    }
    // 元の柄・握り・リムは隠す
    for (const [name, mesh] of Object.entries(parts)) if (/^(riser|wrap|limb)/.test(name)) mesh.visible = false;
    // 握り: 暗い巻きに斜めの帯
    g.add(new THREE.Mesh(plate(GRIP, GRIP_T, 0.002), m.grip));
    for (let y = -60; y <= 30; y += 18) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.0025, GRIP_T + 0.002), m.band);
      band.position.set(-0.013, y / 1000, 0);
      band.rotation.z = -0.3;
      g.add(band);
    }
    // 弦を赤く光らせる（外したら元のマテリアルに戻す）
    const strings = (model.userData.strings ?? []) as THREE.Mesh[];
    const keep = strings.map((s) => s.material);
    for (const s of strings) s.material = m.edge;
    g.userData.undo = () => {
      strings.forEach((s, i) => (s.material = keep[i]));
      for (const glow of glows) removeGlow(glow);
    };
    return g;
  },
};

// ---- 矢 ----
// 子の並び（bow.ts の createArrow）: 軸・鏃・矢羽 3 枚・筈。元に戻す関数を返す
let arrowMats: TalonMats | null = null;
export function dressTalonArrow(arrow: THREE.Group, env: THREE.Texture | null) {
  const m = (arrowMats ??= createTalonMats(env));
  const meshes = arrow.children as THREE.Mesh[];
  const keep = meshes.map((o) => o.material);
  const [shaft, head, v0, v1, v2, nock] = meshes;
  shaft.material = m.black;
  head.material = m.edge;
  for (const v of [v0, v1, v2]) v.material = m.grip;
  nock.material = m.edge;
  return () => meshes.forEach((o, i) => (o.material = keep[i]));
}

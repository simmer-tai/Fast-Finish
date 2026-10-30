import * as THREE from 'three';
import { addGlow } from '../fx/glow.js';
import { MM, TALON_GLOW, createTalonMats, plate, tickTalonGlow, type Outline, type TalonMats } from './skinTalon.js';
import { ROUND_LEN } from './revolver.js';
import { skinFx, type SkinDecor } from './skins.js';

// ---- リボルバーのスキン: 爪 ----
// 剣の「爪」と同じ黒い機械の銃。形は元のリボルバーのまま、色は skins.ts の looks で黒くし（シリンダーの溝は暗い赤）、飾りを足す。
//   爪: フレームの前から、厚い爪が銃身の板を左右から挟む。上下二本の指で板をつかむ形（横から見て前が開いた C）で、
//       指の先は前へ尖る。上下の指の間から、側面の赤い線がのぞく。爪を貫くボルト
//   峰: 銃身の上に太い峰を載せ、前は銃口の手前で斜めに落とす
//   刃: 峰の中から薄い刃が峰の高さのまま前へ伸び、銃口の上を越えて、角ばった切っ先（切り出し）で終わる。
//       刃先は下の縁で、細い帯が赤く光って切っ先へ流れ込む。元のフロントサイトは峰に埋まるので隠す
//   光: 赤い所はどれも外へ光をにじませる（目の前に来るので弱め。刃先の帯がいちばん強く、側面の線と銃口の輪はうっすら）。
//       銃口の輪は、撃った直後だけ強くにじませ、すぐに引く（撃った名残）
//   弾: 黒い薬莢に、口の近くで赤く光る細い帯。縁は暗い鋼。弾頭は赤く光る六角の尖り（シリンダーとスピードローダーの弾、落ちた薬莢）
// 輪郭は横から見た座標を mm で書く（[z, y]。z は銃口の側が -、y は銃身の軸が 0）

const CLAW: Outline = [
  [-24, 16], [-70, 16], [-112, 8], [-80, -2], [-50, -4], // 上の指
  [-50, -13], [-100, -17], [-128, -27], [-90, -33], [-24, -33], // 下の指
];
const CLAW_X = 11; // 銃身の板の側面（±9 mm）に内側の面を重ねる
const CLAW_T = 0.004;
const BOLTS: [z: number, y: number][] = [[-36, 7], [-36, -24]];
const LINE = { y: -8.5, front: -143, back: -40 }; // 側面の赤い線
const MUZZLE_Z = -159.5; // 上の銃口の先の輪
const SPINE: Outline = [[-30, 10], [-30, 17], [-146, 18], [-160, 12], [-160, 9.5], [-146, 9.5]];
const SPINE_T = 0.01;
// 刃の黒い地。上は峰の上面に揃えて平らに伸ばし、切っ先で斜めに落とす。下の縁は赤い帯の上の縁に沿わせる
const BLADE: Outline = [[-110, 11], [-110, 17.5], [-178, 17.5], [-204, 11.5], [-182, 11], [-150, 11]];
// 刃先の赤い帯: 下の縁に沿って、切っ先へ向けて細くなって流れ込む（銃口の筒の上は越える）
const BLADE_EDGE: Outline = [[-150, 11], [-182, 11], [-204, 11.5], [-186, 8.5], [-150, 8.5]];
const BLADE_T = 0.0036;
const EDGE_T = 0.0022; // 帯は地より薄くして、刃先を鋭く見せる
const GLOW_K = 0.4; // 刃先のにじみの濃さ
const LINE_GLOW_K = 0.2; // 側面の線のにじみの濃さ
const MUZZLE_GLOW = 0.2; // 銃口の輪のふだんのにじみの濃さ
const MUZZLE_AFTERGLOW = 0.9; // 撃った直後に銃口のにじみへ足す濃さ（skinFx.flare に合わせて引く）
const FRONT_SIGHT = { y: 0.017, z: -0.135 }; // 元のフロントサイトの位置（revolver.ts）

// 横から見た輪郭を、銃の横（x）へ押し出した板にする
function sidePlate(outline: Outline, depth: number, bevel?: number) {
  return plate(outline, depth, bevel).rotateY(-Math.PI / 2); // 輪郭の x を銃の z に、押し出す向きを銃の x に
}

// ---- 弾 ----
const ROUND_TIP_LEN = 0.011;
const roundTipGeo = new THREE.CylinderGeometry(0.0039, 0, ROUND_TIP_LEN, 6).rotateX(Math.PI / 2).translate(0, 0, -ROUND_LEN - ROUND_TIP_LEN / 2);
const roundBandGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.0018, 10).rotateX(Math.PI / 2).translate(0, 0, -ROUND_LEN + 0.004);
// 弾 1 発に着せ、元に戻す関数を返す（形は使い回すので捨てない）
function dressRound(round: THREE.Group, m: TalonMats) {
  const [rim, body] = round.children as THREE.Mesh[];
  const tip = round.userData.tip as THREE.Mesh;
  const keep = { rim: rim.material, body: body.material, tip: tip.material, tipGeo: tip.geometry };
  rim.material = m.band;
  body.material = m.black;
  tip.material = m.edge;
  tip.geometry = roundTipGeo;
  const band = new THREE.Mesh(roundBandGeo, m.edge);
  round.add(band);
  return () => {
    rim.material = keep.rim;
    body.material = keep.body;
    tip.material = keep.tip;
    tip.geometry = keep.tipGeo;
    band.removeFromParent();
  };
}
// 落ちた薬莢に着せるマテリアル（ゲームの画面だけで使うので、1 組を使い回す）
let looseMats: TalonMats | null = null;
export function dressTalonRound(round: THREE.Group, env: THREE.Texture | null) {
  dressRound(round, (looseMats ??= createTalonMats(env)));
}

export const talonRevolver: SkinDecor = {
  build(parts, mats, model) {
    const m = createTalonMats(mats.metal.envMap);
    const g = new THREE.Group();
    for (const mesh of Object.values(parts)) {
      if (Math.abs(mesh.position.y - FRONT_SIGHT.y) < 1e-4 && Math.abs(mesh.position.z - FRONT_SIGHT.z) < 1e-4) mesh.visible = false;
    }

    for (const side of [-1, 1]) {
      const claw = new THREE.Mesh(sidePlate(CLAW, CLAW_T, 0.0012), m.black);
      claw.position.x = side * CLAW_X * MM;
      g.add(claw);
    }
    // ボルト: 左右の爪を貫く 1 本の軸。両側の爪の外に頭が出る
    for (const [z, y] of BOLTS) {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(2 * MM, 2 * MM, (CLAW_X * 2 + 5) * MM, 8).rotateZ(Math.PI / 2), m.bolt);
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * MM, 0.8 * MM, (CLAW_X * 2 + 5.4) * MM, 6).rotateZ(Math.PI / 2), m.black);
      head.position.set(0, y * MM, z * MM);
      socket.position.copy(head.position);
      g.add(head, socket);
    }

    // 峰と上の刃
    g.add(new THREE.Mesh(sidePlate(SPINE, SPINE_T, 0.0015), m.black));
    g.add(new THREE.Mesh(sidePlate(BLADE, BLADE_T, 0.0006), m.black));
    const edge = new THREE.Mesh(sidePlate(BLADE_EDGE, EDGE_T, 0.0004), m.edge);
    const glow = addGlow(edge, TALON_GLOW);
    edge.onBeforeRender = () => tickTalonGlow(m.edge, glow, GLOW_K); // 赤い所はどれも同じマテリアルなので、ここで一緒に光らせる
    g.add(edge);

    // 側面の線と銃口の輪（うっすらにじませ、銃口は撃った直後だけ強める）
    const line = new THREE.Mesh(new THREE.BoxGeometry(18.6 * MM, 1.8 * MM, (LINE.back - LINE.front) * MM), m.edge);
    line.position.set(0, LINE.y * MM, ((LINE.front + LINE.back) / 2) * MM);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(7.1 * MM, 7.1 * MM, 3 * MM, 10).rotateX(Math.PI / 2), m.edge);
    ring.position.z = MUZZLE_Z * MM;
    const ringGlow = addGlow(ring, TALON_GLOW);
    ring.onBeforeRender = () => (ringGlow.strength = MUZZLE_GLOW + skinFx.flare * MUZZLE_AFTERGLOW);
    const lineGlow = addGlow(line, TALON_GLOW);
    line.onBeforeRender = () => tickTalonGlow(m.edge, lineGlow, LINE_GLOW_K);
    g.add(line, ring);

    // シリンダーとスピードローダーの弾
    const rounds = [...(model.userData.chamberRounds ?? []), ...(model.userData.loaderRounds ?? [])] as THREE.Group[];
    const undo = rounds.map((r) => dressRound(r, m));
    g.userData.undo = () => {
      for (const fn of undo) fn();
    };
    return g;
  },
};

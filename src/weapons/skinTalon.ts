import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import { addGlow, type GlowSource } from '../fx/glow.js';
import { skinFx, type SkinDecor, type SkinFocus, type SkinPose } from './skins.js';

// ---- 剣のスキン: 爪 ----
// 黒い機械の刀。反りのある片刃を、鍔から伸びる二本の爪が挟む。
//   刃: 腰から反る黒い片刃で、刃先の細い帯だけ赤く光り、外側へ光がにじむ。断面は元の刀と同じ（棟・鎬・刃先）
//   鍔: 角ばった塊から、刃の根元を両側から挟む二本の爪が伸びる。下にはばき代わりの襟
//   柄: 角ばった板に斜めの帯を巻き、柄頭は斜めに断った蓋。鍔と柄の上にボルト
// 剣の部位はすべて隠して作り直す。輪郭は設計図の値（mm）で書き、形にするときに m へ直す
// 爪のシリーズ（斧は skinTalonAxe.ts、槍は skinTalonSpear.ts）で共通の部品（マテリアル・刃・刃先の光・板・ボルト）はここに置く

export const MM = 0.001;

// ---- 刃 ----
// 反りのある片刃の寸法（槍の爪 skinTalonSpear.ts も同じ作りの刃を使う）
export interface TalonBlade {
  top: number; // 刃の付け根
  tip: number; // 切っ先
  sori: number; // 切っ先が棟の側へ寄る量
  w0: number; // 根元の幅
  w1: number; // 切っ先の手前の幅
  t: number; // 鎬の厚み
  tipLen: number; // 刃先が棟へ向かって絞れていく長さ
}
const SWORD_BLADE: TalonBlade = {
  top: 0.135, // 元の刀と同じ
  tip: 0.855, // 攻撃の届く距離 SWORD_TIP に合わせる
  sori: 0.04,
  w0: 0.03,
  w1: 0.024,
  t: 0.009,
  tipLen: 0.06,
};

const HA = 0.78; // 刃先の帯（赤）の始まり。棟 0 → 刃先 1 の割合

// 刃の断面: 棟（-X）・鎬・刃先の帯の境・刃先（+X）。帯の境は鎬から刃先へ下る面の上に置く
function bladeSection(b: TalonBlade, y: number) {
  const t = (y - b.top) / (b.tip - b.top);
  const w = b.w0 + (b.w1 - b.w0) * t;
  const back = -b.sori * t * t - 0.42 * w;
  const taper = y > b.tip - b.tipLen ? Math.pow((b.tip - y) / b.tipLen, 0.75) : 1;
  const edge = back + w * taper;
  const shinogi = back + (edge - back) * 0.4;
  const ha = back + (edge - back) * HA;
  const th = b.t * (1 - 0.2 * t) * Math.sqrt(taper);
  const haTh = (th / 2) * (1 - (HA - 0.4) / 0.6);
  return {
    back: [new THREE.Vector3(back, y, th * 0.35), new THREE.Vector3(shinogi, y, th / 2), new THREE.Vector3(ha, y, haTh)],
    edge: new THREE.Vector3(edge, y, 0),
  };
}
// 黒い地と赤い刃先を別の筒にする（境の面は互いの内側に隠れる）
export function talonBladeGeometries(b: TalonBlade) {
  const body: THREE.Vector3[][] = [];
  const edge: THREE.Vector3[][] = [];
  const mirror = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y, -v.z);
  const STEPS = 120;
  for (let i = 0; i < STEPS; i++) {
    const s = bladeSection(b, b.top + ((b.tip - b.top) * i) / STEPS);
    const [mune, shinogi, ha] = s.back;
    body.push([mune, shinogi, ha, mirror(ha), mirror(shinogi), mirror(mune)]);
    edge.push([ha, s.edge, mirror(ha)]);
  }
  const tip = new THREE.Vector3(-b.sori - 0.42 * b.w1, b.tip, 0);
  body.push([tip]);
  edge.push([tip]);
  return { body: loftRings(body), edge: loftRings(edge) };
}

// ---- 刃先の光 ----
// 刃先の帯そのものを光らせ、そのまわりに赤いにじみ（fx/glow.ts）を重ねる
export const TALON_GLOW = 0xff1a32; // 刃先より少し明るく、桃色寄りの赤
// 光はゆっくり脈打ち、当てた瞬間（skinFx.flare）に強まってすぐ引く。glowK: にじみの濃さの倍率（目の前に来る小さな武器は抑える）
let glowAt = 0;
export function tickTalonGlow(edge: THREE.MeshStandardMaterial, glow: GlowSource | null, glowK = 1) {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - glowAt);
  glowAt = now;
  skinFx.flare *= Math.exp(-dt * 3.5);
  const pulse = 0.5 + 0.5 * Math.sin(now * 2.2);
  // 一閃の構えの間は、脈打ちを速く強くして刃先を燃え立たせる
  const focusPulse = 0.5 + 0.5 * Math.sin(now * 9);
  edge.emissiveIntensity = 1.8 + 0.25 * pulse + skinFx.flare * 1.5 + skinFx.focus * (0.8 + 0.6 * focusPulse);
  if (glow) glow.strength = glowK * (0.95 + 0.15 * pulse + skinFx.flare * 0.5 + skinFx.focus * (0.3 + 0.2 * focusPulse));
}

// ---- 柄と鍔: 輪郭（mm。x は刃の側が +、y は切っ先の側が +）を押し出した板 ----
export type Outline = [x: number, y: number][];
const CAP: Outline = [[-11, -150], [9, -156], [13, -134], [-12, -130]];
const GRIP: Outline = [[-11, -132], [10, -136], [13, 70], [-12, 74]];
const GUARD: Outline = [[-18, 70], [18, 64], [20, 100], [-18, 104]];
const CLAW_EDGE: Outline = [[16, 92], [30, 102], [22, 186], [15, 156]];
const CLAW_BACK: Outline = [[-16, 96], [-28, 106], [-20, 172], [-14, 150]];
const COLLAR: Outline = [[-14, 102], [15, 98], [15, 140], [-14, 140]];

export function plate(outline: Outline, depth: number, bevel = 0.0012) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
  const core = depth - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -core / 2);
  return geo;
}
// ボルト: 板の表と裏から頭がのぞく円柱。真ん中に暗い穴
export function bolt(g: THREE.Group, m: TalonMats, x: number, y: number, depth: number, r = 0.0032) {
  const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth + 0.003, 10), m.bolt);
  head.rotation.x = Math.PI / 2;
  head.position.set(x * MM, y * MM, 0);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, depth + 0.0036, 6), m.black);
  socket.rotation.x = Math.PI / 2;
  socket.position.copy(head.position);
  g.add(head, socket);
}

export function createTalonMats(env: THREE.Texture | null) {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMap: env, flatShading: true, ...o });
  return {
    // 刃と金具: 元の刀より映り込みを強くした黒。角の面取りに白い光が乗る
    black: std({ color: 0x0b0c0e, metalness: 0.85, roughness: 0.24, envMapIntensity: 1.5 }),
    // 刃先の帯だけは赤く強く光る（明るさは tickTalonGlow で動かす）。強く光らせると桃色がかった明るい赤に飛ぶ
    edge: std({ color: 0xff2a3c, emissive: 0xff1a30, emissiveIntensity: 1.8, metalness: 0.2, roughness: 0.3 }),
    grip: std({ color: 0x1a1d21, metalness: 0.6, roughness: 0.45 }),
    band: std({ color: 0x4a5158, metalness: 0.9, roughness: 0.3 }),
    bolt: std({ color: 0xb9c0c6, metalness: 1, roughness: 0.3 }),
  };
}
export type TalonMats = ReturnType<typeof createTalonMats>;

function buildHilt(m: TalonMats) {
  const g = new THREE.Group();
  const GRIP_D = 0.018;
  const GUARD_D = 0.022;
  g.add(
    new THREE.Mesh(plate(CAP, GRIP_D + 0.002), m.black),
    new THREE.Mesh(plate(GRIP, GRIP_D), m.grip),
    new THREE.Mesh(plate(GUARD, GUARD_D), m.black),
    new THREE.Mesh(plate(CLAW_EDGE, 0.012), m.black),
    new THREE.Mesh(plate(CLAW_BACK, 0.012), m.black),
    new THREE.Mesh(plate(COLLAR, 0.02), m.black),
  );
  // 柄に斜めに巻いた帯
  for (let y = -116; y < 60; y += 16) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.0022, GRIP_D + 0.0016), m.band);
    band.position.set(0.0005, (y + 1) * MM, 0);
    band.rotation.z = -0.41;
    g.add(band);
  }
  bolt(g, m, 0, 84, GUARD_D);
  bolt(g, m, 0, -120, GRIP_D);
  return g;
}

// ---- 一閃の構え ----
// 構えに入るときは手の中で刀を 1 回転させてから、柄を右手で目の高さのすぐ下へ上げ、刀を水平に寝かせて切っ先を左へ向ける（少し奥へ流す）。
// 刃先を上へ向け、光る刃先の線越しに敵を見る。照準は刃のすぐ上に来る。
// 突進が始まったら、寝かせた刀を頭上へ立ててから右肩の後ろへ引き絞り、元の一閃の振りかぶりへつなぐ
// pos は柄の位置（手元の基準からのずれ）、tip は切っ先の向き、edge は刃先の向き
function swordPose(pos: [number, number, number], tip: [number, number, number], edge: [number, number, number]): SkinPose {
  const t = new THREE.Vector3(...tip).normalize();
  const e = new THREE.Vector3(...edge);
  e.addScaledVector(t, -e.dot(t)).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e, t, new THREE.Vector3().crossVectors(e, t)));
  return { pos: new THREE.Vector3(...pos), quat };
}
export const TALON_FOCUS: SkinFocus = {
  ...swordPose([0.1, 0.16, -0.15], [-0.9, 0.08, -0.42], [0, 1, 0.15]),
  enterSpin: 360,
  // 頭上へ立てる。刃先は前へ向ける
  rush: swordPose([0.06, 0.3, 0.02], [0.15, 1, 0.35], [0, 0.2, -1]),
};

export const talonSword: SkinDecor = {
  build(parts, mats) {
    const m = createTalonMats(mats.metal.envMap);
    for (const name of ['blade', 'habaki', 'guard', 'grip', 'pommel']) if (parts[name]) parts[name].visible = false;
    const g = new THREE.Group();
    const blade = talonBladeGeometries(SWORD_BLADE);
    const edge = new THREE.Mesh(blade.edge, m.edge);
    const glow = addGlow(edge, TALON_GLOW);
    edge.onBeforeRender = () => tickTalonGlow(m.edge, glow);
    g.add(new THREE.Mesh(blade.body, m.black), edge, buildHilt(m));
    return g;
  },
};

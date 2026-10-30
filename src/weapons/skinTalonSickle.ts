import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import { addGlow, removeGlow } from '../fx/glow.js';
import { JOINT_Y, sickleBladeFrames } from './chainSickle.js';
import { TALON_GLOW, bolt, createTalonMats, plate, tickTalonGlow, type Outline } from './skinTalon.js';
import type { SkinDecor } from './skins.js';

// ---- 鎖鎌のスキン: 爪 ----
// 剣の「爪」と同じ黒い機械の鎌。刃の曲がり方と柄の形は元の鎖鎌のまま、色と飾りを替える。
//   刃: 黒い地で、刃先の細い帯だけ赤く光り、外側へ光がにじむ。断面は元の刃と同じ（棟・鎬・刃先）
//   口金: 刃の根元を棟の側と刃先の側から挟む二本の爪と、背へ突き出して下へ曲がる鉤爪。爪の上にボルト
//   継ぎ目: 頭が外れる所に赤く光る細い輪
//   柄: 暗い地。握りには斜めの帯を巻く
// 刃・口金・継ぎ目の輪は頭（外れて飛ぶ側）に、握りの帯は握りに付ける。輪郭は鎌のモデルの座標を mm で書く（x は刃の張り出す側が +）

const HA = 0.75; // 刃先の帯（赤）の始まり。棟 0 → 刃先 1 の割合
const SHINOGI = 0.4; // 鎬の位置（元の刃と同じ）

const CLAW_BACK: Outline = [[12, 298], [12, 324], [70, 314], [40, 304]]; // 棟の側
const CLAW_EDGE: Outline = [[12, 278], [12, 252], [62, 260], [38, 270]]; // 刃先の側
const SPUR: Outline = [[-12, 304], [-12, 282], [-40, 270], [-70, 248], [-48, 278], [-26, 300]]; // 背の鉤爪
const CLAW_D = 0.012; // 刃（0.008）を表と裏から挟む

// 黒い地と赤い刃先を別の筒にする（境の面は互いの内側に隠れる）
function bladeGeometries() {
  const { frames, tip } = sickleBladeFrames();
  const body: THREE.Vector3[][] = [];
  const edge: THREE.Vector3[][] = [];
  for (const { p, n, w, t } of frames) {
    const at = (a: number, z: number) => p.clone().addScaledVector(n, (a - 0.5) * w).setZ(z);
    const haT = (t / 2) * ((1 - HA) / (1 - SHINOGI));
    body.push([at(0, t * 0.35), at(SHINOGI, t / 2), at(HA, haT), at(HA, -haT), at(SHINOGI, -t / 2), at(0, -t * 0.35)]);
    edge.push([at(HA, haT), at(1, 0), at(HA, -haT)]);
  }
  body.push([tip]);
  edge.push([tip.clone()]);
  return { body: loftRings(body), edge: loftRings(edge) };
}

export const talonSickle: SkinDecor = {
  build(parts, mats, model) {
    const m = createTalonMats(mats.metal.envMap);
    parts.blade.visible = false;
    for (const name of ['headShaft', 'gripShaft', 'wrap']) if (parts[name]) parts[name].material = m.grip;
    for (const name of ['socket', 'cap', 'headFerrule', 'gripFerrule', 'butt']) if (parts[name]) parts[name].material = m.black;

    // 頭の側（外れて飛ぶ）
    const head = new THREE.Group();
    const blade = bladeGeometries();
    const edge = new THREE.Mesh(blade.edge, m.edge);
    const glow = addGlow(edge, TALON_GLOW);
    edge.onBeforeRender = () => tickTalonGlow(m.edge, glow);
    head.add(
      new THREE.Mesh(blade.body, m.black),
      edge,
      new THREE.Mesh(plate(CLAW_BACK, CLAW_D), m.black),
      new THREE.Mesh(plate(CLAW_EDGE, CLAW_D), m.black),
      new THREE.Mesh(plate(SPUR, CLAW_D), m.black),
    );
    bolt(head, m, 24, 312, CLAW_D, 0.0025);
    bolt(head, m, 24, 264, CLAW_D, 0.0025);
    bolt(head, m, -28, 287, CLAW_D, 0.0025);
    // 継ぎ目の赤い輪
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0153, 0.0153, 0.0025, 8), m.edge);
    ring.scale.set(1, 1, 0.9);
    ring.position.y = JOINT_Y + 0.0015;
    const ringGlow = addGlow(ring, TALON_GLOW);
    ring.onBeforeRender = () => tickTalonGlow(m.edge, ringGlow);
    head.add(ring);

    // 握りの側: 巻きの上に斜めの帯
    const grip = new THREE.Group();
    for (let y = -0.05; y <= 0.05; y += 0.016) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0157, 0.0157, 0.0025, 8), m.band);
      band.scale.set(1, 1, 0.85);
      band.position.y = y;
      band.rotation.z = 0.3;
      grip.add(band);
    }

    const headGroup = model.userData.head as THREE.Group;
    const gripGroup = model.userData.grip as THREE.Group;
    headGroup.add(head);
    if (gripGroup.parent) gripGroup.add(grip); // 飛ぶ頭だけのモデルには握りが無い
    const g = new THREE.Group();
    g.userData.undo = () => {
      removeGlow(glow);
      removeGlow(ringGlow);
      for (const o of [head, grip]) {
        o.removeFromParent();
        o.traverse((c) => c instanceof THREE.Mesh && c.geometry.dispose());
      }
      for (const mat of Object.values(m)) mat.dispose();
    };
    return g;
  },
};

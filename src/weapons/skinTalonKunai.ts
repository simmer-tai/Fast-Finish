import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import { addGlow, removeGlow, type GlowSource } from '../fx/glow.js';
import { MM, TALON_GLOW, bolt, createTalonMats, plate, tickTalonGlow, type Outline } from './skinTalon.js';
import type { SkinDecor } from './skins.js';

// ---- クナイのスキン: 爪 ----
// 剣の「爪」と同じ黒い機械のクナイ。長さと輪の位置は元のクナイのまま（回す軸・切っ先の当たりが変わらないように）、形は作り直す。
//   刃: 菱形の断面で、根元で張り出してから切っ先へまっすぐ絞る。両側の刃先の細い帯が赤く光り、外側へ光がにじむ
//   爪: 角ばった鍔から二本の爪が伸び、刃の根元を両側の刃先の外からつかむ。先は刃の側へ鉤のように曲がる
//   柄: 暗い角ばった板に斜めの帯を巻く。柄頭は黒い蓋
//   輪: 六角の黒い輪。内側に赤く光る細い輪を沿わせる
// 元の部位はすべて隠して作り直す。輪郭はクナイのモデルの座標を mm で書く（y は切っ先の側が +、原点は刃の付け根）

// ---- 刃 ----
// 刃の形: [高さ, 刃先までの幅の半分]。最後は切っ先（元のクナイと同じ 170 mm）
const BLADE: [y: number, w: number][] = [[-4, 9], [30, 23], [170, 0]];
const THICK = 0.45; // 鎬の厚みの半分（幅の半分に対する割合。元のクナイと同じ）
const HA = 0.72; // 刃先の帯（赤）の始まり。鎬 0 → 刃先 1 の割合

// 黒い地と、左右の赤い刃先を別の筒にする（境の面は互いの内側に隠れる）
function bladeGeometries() {
  const body: THREE.Vector3[][] = [];
  const right: THREE.Vector3[][] = [];
  const left: THREE.Vector3[][] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * MM, y * MM, z * MM);
  for (const [y, w] of BLADE.slice(0, -1)) {
    const th = w * THICK;
    const [haW, haT] = [w * HA, th * (1 - HA)];
    body.push([v(-haW, y, haT), v(0, y, th), v(haW, y, haT), v(haW, y, -haT), v(0, y, -th), v(-haW, y, -haT)]);
    right.push([v(haW, y, haT), v(w, y, 0), v(haW, y, -haT)]);
    left.push([v(-haW, y, -haT), v(-w, y, 0), v(-haW, y, haT)]);
  }
  const tip = v(0, BLADE[BLADE.length - 1][0], 0);
  for (const rings of [body, right, left]) rings.push([tip.clone()]);
  return { body: loftRings(body), right: loftRings(right), left: loftRings(left) };
}

// ---- 鍔・爪・柄 ----
const GUARD: Outline = [[-15, -12], [15, -12], [18, 0], [15, 6], [-15, 6], [-18, 0]];
// 右の爪（左は映す）: 鍔から刃先の外を上り、刃の根元を押さえて、先は刃の側へ曲がる。内の縁は刃先に少し重ねる
const CLAW: Outline = [[8, 2], [17, 2], [29, 28], [26, 46], [15, 58], [19.5, 43], [19.5, 26]];
const GRIP: Outline = [[-8, -12], [8, -12], [6.5, -84], [-6.5, -84]];
const CAP: Outline = [[-7.5, -83], [7.5, -83], [6, -91], [-6, -91]];
const GUARD_D = 0.02;
const CLAW_D = 0.011; // 刃先の近くの薄い所を表と裏から挟む
const GRIP_D = 0.013;
// ---- 輪 ----
// 六角の板に六角の穴（頂点の半径 mm）。角を左右に置き、平らな辺を上下にする
const RING_OUT = 17.5;
const RING_IN = 10;
const RING_D = 0.009;
const RED_IN = 8.6; // 赤い輪の内の縁（外の縁は黒い輪の穴に少し重ねる）
const RED_D = 0.006; // 黒い輪より薄くして、穴の内側に沈める
function hexRing(outer: number, inner: number, depth: number, bevel: number) {
  const hex = (r: number) => Array.from({ length: 6 }, (_, i) => new THREE.Vector2(Math.cos((i * Math.PI) / 3) * r * MM, Math.sin((i * Math.PI) / 3) * r * MM));
  const shape = new THREE.Shape(hex(outer));
  shape.holes.push(new THREE.Path(hex(inner).reverse()));
  const core = depth - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: core, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 1 });
  geo.translate(0, 0, -core / 2);
  return geo;
}
const GLOW_K = 0.6; // 刃先のにじみの濃さ（目の前に来る小さな武器なので弱め）

const mirrorX = (o: Outline): Outline => o.map(([x, y]) => [-x, y]);

export const talonKunai: SkinDecor = {
  build(parts, mats, model) {
    const m = createTalonMats(mats.metal.envMap);
    for (const name of ['blade', 'collar', 'handle', 'neck', 'ring']) if (parts[name]) parts[name].visible = false;
    const g = new THREE.Group();
    const glows: GlowSource[] = [];
    const glowing = (mesh: THREE.Mesh) => {
      const glow = addGlow(mesh, TALON_GLOW);
      mesh.onBeforeRender = () => tickTalonGlow(m.edge, glow, GLOW_K);
      glows.push(glow);
      return mesh;
    };

    const blade = bladeGeometries();
    g.add(new THREE.Mesh(blade.body, m.black), glowing(new THREE.Mesh(blade.right, m.edge)), glowing(new THREE.Mesh(blade.left, m.edge)));

    g.add(
      new THREE.Mesh(plate(GUARD, GUARD_D), m.black),
      new THREE.Mesh(plate(CLAW, CLAW_D), m.black),
      new THREE.Mesh(plate(mirrorX(CLAW), CLAW_D), m.black),
      new THREE.Mesh(plate(GRIP, GRIP_D), m.grip),
      new THREE.Mesh(plate(CAP, GRIP_D + 0.002), m.black),
    );
    bolt(g, m, 0, -4, GUARD_D, 0.0028);
    // 柄に斜めに巻いた帯
    for (let y = -74; y < -16; y += 10) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.0018, GRIP_D + 0.0014), m.band);
      band.position.set(0, y * MM, 0);
      band.rotation.z = -0.41;
      g.add(band);
    }

    // 六角の輪と、穴の内側に沿う赤い輪。回す軸になる位置は元の輪と同じ
    const ringY = model.userData.ringY as number;
    const ring = new THREE.Mesh(hexRing(RING_OUT, RING_IN, RING_D, 0.0012), m.black);
    const red = glowing(new THREE.Mesh(hexRing(RING_IN + 0.6, RED_IN, RED_D, 0), m.edge));
    ring.position.y = red.position.y = ringY;
    g.add(ring, red);

    g.userData.undo = () => {
      for (const glow of glows) removeGlow(glow);
    };
    return g;
  },
};

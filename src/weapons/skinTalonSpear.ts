import * as THREE from 'three';
import { addGlow } from '../fx/glow.js';
import { SPEAR_BLADE_BASE_Y, SPEAR_TIP_Y } from './spear.js';
import { TALON_GLOW, bolt, createTalonMats, plate, talonBladeGeometries, tickTalonGlow, type Outline, type TalonBlade } from './skinTalon.js';
import type { SkinDecor } from './skins.js';

// ---- 槍のスキン: 爪 ----
// 剣の「爪」と同じ黒い機械の槍。長さと握る位置は元の槍のまま（振りの支点・切っ先と石突きの当たりが変わらないように）。
//   刃: 剣の爪と同じ作りの反りのある黒い片刃を、元の穂先より少し幅広に。刃先の細い帯が赤く光り、外側へ光がにじむ
//   爪: 柄の先を包む襟の上に角ばった鍔を載せ、そこから二本の爪が刃の根元を棟と刃先の外からつかむ
//   柄: 暗い八角の柄。握る 2 か所は一回り太い握りに帯を巻き、両端を六角の金具で留める。襟の下に赤く光る細い輪
//   石突き: 六角の黒い蓋と、片側へ流れた鉤のような短い錐。蓋の上にも赤い輪
// 刃・鍔・金具・巻きは隠して作り直し、柄はマテリアルだけ替える。
// 輪郭は槍のモデルの座標を mm で書く（x は刃先の側が +、y は切っ先の側が +、原点は両手で握る間）

const BLADE: TalonBlade = {
  top: SPEAR_BLADE_BASE_Y - 0.01, // 鍔に少し埋める
  tip: SPEAR_TIP_Y, // 攻撃の届く距離が変わらないよう、元の切っ先と同じ
  sori: 0.016,
  w0: 0.046,
  w1: 0.036,
  t: 0.011,
  tipLen: 0.085,
};

// 柄の先は 525 mm、刃の付け根は 559 mm
const COLLAR: Outline = [[-17, 468], [17, 464], [18, 534], [-17, 538]];
const GUARD: Outline = [[-30, 534], [28, 528], [32, 560], [-28, 566]];
// 刃先の側の爪と棟の側の爪。内の縁は刃に少し重ね、先は刃の側へ曲がる
const CLAW_EDGE: Outline = [[24, 552], [42, 562], [33, 650], [25, 612]];
const CLAW_BACK: Outline = [[-19, 556], [-36, 566], [-28, 632], [-19, 604]];
const COLLAR_D = 0.03; // 柄（太さ 25 mm）を包む
const GUARD_D = 0.026;
const CLAW_D = 0.015; // 刃（厚み 11 mm）を表と裏から挟む
// 石突きの錐: 蓋の下から、刃と逆の側へ少し流れて尖る
const SPIKE: Outline = [[-12, -805], [12, -805], [7, -828], [-2, -852], [-9, -826]];
const SPIKE_D = 0.012;

const SHAFT_R = 0.0125;
const GRIP_R = 0.0148; // 握りは柄より一回り太い
const GRIP_LEN = 0.18; // 元の巻きと同じ長さ
const RING_R = SHAFT_R + 0.0012; // 赤く光る輪

export const talonSpear: SkinDecor = {
  build(parts, mats) {
    const m = createTalonMats(mats.metal.envMap);
    for (const name of ['blade', 'guard', 'collar', 'wrap0', 'wrap1', 'butt', 'spike']) if (parts[name]) parts[name].visible = false;
    parts.shaft.material = m.grip;
    const g = new THREE.Group();
    const glowing = (mesh: THREE.Mesh) => {
      const glow = addGlow(mesh, TALON_GLOW);
      mesh.onBeforeRender = () => tickTalonGlow(m.edge, glow);
      return mesh;
    };
    const at = (mesh: THREE.Mesh, y: number) => {
      mesh.position.y = y;
      g.add(mesh);
      return mesh;
    };

    const blade = talonBladeGeometries(BLADE);
    g.add(new THREE.Mesh(blade.body, m.black), glowing(new THREE.Mesh(blade.edge, m.edge)));

    g.add(
      new THREE.Mesh(plate(COLLAR, COLLAR_D), m.black),
      new THREE.Mesh(plate(GUARD, GUARD_D), m.black),
      new THREE.Mesh(plate(CLAW_EDGE, CLAW_D), m.black),
      new THREE.Mesh(plate(CLAW_BACK, CLAW_D), m.black),
    );
    bolt(g, m, 0, 547, GUARD_D, 0.0028);
    bolt(g, m, 0, 498, COLLAR_D);
    at(glowing(new THREE.Mesh(new THREE.CylinderGeometry(RING_R, RING_R, 0.004, 12), m.edge)), 0.459);

    // 握り: 元の巻きの位置に、帯を巻いた太い握りと両端の金具
    for (const wrap of [parts.wrap0, parts.wrap1]) {
      const y = wrap.position.y;
      at(new THREE.Mesh(new THREE.CylinderGeometry(GRIP_R, GRIP_R, GRIP_LEN, 8), m.grip), y);
      for (let k = -3; k <= 3; k++) at(new THREE.Mesh(new THREE.CylinderGeometry(GRIP_R + 0.0005, GRIP_R + 0.0005, 0.0025, 8), m.band), y + k * 0.024);
      for (const s of [-1, 1]) at(new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 6), m.black), y + s * (GRIP_LEN / 2 + 0.005));
    }

    // 石突き
    const buttY = parts.butt.position.y;
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.015, 0.034, 6), m.black), buttY);
    at(glowing(new THREE.Mesh(new THREE.CylinderGeometry(RING_R, RING_R, 0.004, 12), m.edge)), buttY + 0.024);
    g.add(new THREE.Mesh(plate(SPIKE, SPIKE_D), m.black));
    return g;
  },
};

import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import { MM, bolt, plate, type Outline, type TalonMats } from './skinTalon.js';
import { skinFx, type SkinDecor } from './skins.js';

// ---- 剣のスキン: ゴーストライン ----
// 黒い骨格の内側を、実体の薄い白銀の刃と青白い導光路が走る高速戦闘刀。
// 標準の刀へ模様を貼るのではなく、刃・鍔・柄をすべて隠して輪郭から作り直す。
// 輪郭は mm（x は刃の側が +、y は切っ先の側が +）。
const BLADE_FRAME: Outline = [[-18, 132], [12, 132], [15, 684], [9, 752], [-13, 865], [-18, 778]];
const VOID: Outline = [[-11, 188], [5, 188], [7, 650], [1, 721], [-8, 785], [-12, 737]];
const SIGNAL: Outline = [[-6.5, 205], [0, 205], [2, 632], [-3, 698], [-7, 742], [-8.5, 690]];
const SIGNAL_BREAKS = [310, 455, 600].map((y): Outline => [[-9, y], [4, y + 7], [4, y + 17], [-9, y + 10]]);
const SPINE_NOTCHES = [260, 390, 520, 650].map((y): Outline => [[-18.5, y], [-12, y + 8], [-12, y + 23], [-18.5, y + 15]]);

const COLLAR: Outline = [[-16, 104], [14, 104], [17, 148], [-14, 153]];
const GUARD_BACK: Outline = [[-14, 91], [-48, 102], [-42, 119], [-10, 130], [0, 111]];
const GUARD_EDGE: Outline = [[7, 96], [43, 81], [34, 118], [13, 136], [0, 111]];
const GUARD_LIGHT: Outline = [[12, 105], [34, 93], [28, 108], [13, 123]];
const GRIP: Outline = [[-12, 91], [12, 91], [10, -106], [-10, -106]];
const POMMEL: Outline = [[-11, -103], [11, -103], [17, -123], [6, -145], [-9, -140], [-16, -120]];
const POMMEL_LIGHT: Outline = [[-3, -112], [6, -112], [8, -126], [3, -136], [-3, -132]];

// 銀の刃は板を貼らず、爪・紅線と同じく三角断面をロフトする。
// inner は黒い骨格に埋まる側、outer は厚み 0 の実際の刃先。
function edgeGeometry() {
  const sections: [y: number, inner: number, outer: number, halfT: number][] = [
    [145, 7, 15, 4.8],
    [650, 7, 15, 4.5],
    [684, 7, 15, 4.2],
    [752, 2, 9, 3.5],
    [820, -10, -5, 1.8],
  ];
  const rings = sections.map(([y, inner, outer, halfT]) => [
    new THREE.Vector3(inner * MM, y * MM, halfT * MM),
    new THREE.Vector3(outer * MM, y * MM, 0),
    new THREE.Vector3(inner * MM, y * MM, -halfT * MM),
  ]);
  rings.push([new THREE.Vector3(-13 * MM, 865 * MM, 0)]);
  return loftRings(rings);
}

function createMats(env: THREE.Texture | null) {
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ envMap: env, flatShading: true, ...o });
  return {
    frame: std({ color: 0x071117, metalness: 0.92, roughness: 0.2, envMapIntensity: 1.7 }),
    edge: std({ color: 0xd7e4e8, metalness: 1, roughness: 0.12, envMapIntensity: 2.2 }),
    void: std({ color: 0x010608, metalness: 0.25, roughness: 0.7 }),
    grip: std({ color: 0x111d22, metalness: 0.55, roughness: 0.42 }),
    hardware: std({ color: 0x7e9299, metalness: 1, roughness: 0.25, envMapIntensity: 1.8 }),
    signal: std({ color: 0xb9fbff, emissive: 0x24dfff, emissiveIntensity: 2.2, metalness: 0.1, roughness: 0.2 }),
  };
}

let glowAt = 0;
function tickGlow(signal: THREE.MeshStandardMaterial) {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, Math.max(0, now - glowAt));
  glowAt = now;
  skinFx.flare *= Math.exp(-dt * 4.5);
  const pulse = 0.5 + 0.5 * Math.sin(now * 3.6);
  signal.emissiveIntensity = 1.9 + pulse * 0.45 + skinFx.flare * 2.3 + skinFx.focus * 0.7;
}

export const ghostlineSword: SkinDecor = {
  build(parts, mats) {
    for (const name of ['blade', 'habaki', 'guard', 'grip', 'pommel']) if (parts[name]) parts[name].visible = false;

    const m = createMats(mats.metal.envMap);
    const g = new THREE.Group();
    const add = (outline: Outline, depth: number, mat: THREE.Material, bevel = 0.0012) => {
      const mesh = new THREE.Mesh(plate(outline, depth, bevel), mat);
      g.add(mesh);
      return mesh;
    };

    add(BLADE_FRAME, 0.009, m.frame);
    // 外周は厚みゼロ、内側だけ厚い楔形。斜めから見ても灰色部分が刃として読める。
    g.add(new THREE.Mesh(edgeGeometry(), m.edge));
    add(VOID, 0.0105, m.void, 0.0005);
    const signal = add(SIGNAL, 0.0111, m.signal, 0.00045);
    for (const cut of SIGNAL_BREAKS) add(cut, 0.0116, m.frame, 0.00035);
    for (const notch of SPINE_NOTCHES) add(notch, 0.0098, m.hardware, 0.0005);

    add(COLLAR, 0.020, m.frame);
    add(GUARD_BACK, 0.014, m.frame);
    add(GUARD_EDGE, 0.016, m.hardware);
    add(GUARD_LIGHT, 0.0168, m.signal, 0.0005);
    add(GRIP, 0.019, m.grip);
    add(POMMEL, 0.021, m.frame);
    add(POMMEL_LIGHT, 0.0218, m.signal, 0.0005);

    for (let y = -82; y < 70; y += 24) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.004, 0.0205), m.hardware);
      band.position.set(0, y * MM, 0);
      band.rotation.z = -0.32;
      g.add(band);
    }
    const boltMats = { bolt: m.hardware, black: m.void } as TalonMats;
    bolt(g, boltMats, 0, 115, 0.021, 0.0034);
    bolt(g, boltMats, 0, -118, 0.022, 0.003);

    signal.onBeforeRender = () => tickGlow(m.signal);
    return g;
  },
};

import * as THREE from 'three';
import type { SkinDecor } from './skins.js';

// ---- クナイのスキン: 柳葉 ----
// 古い木の葉形の短剣。色は元のクナイのまま、形を作り直す。
//   刃: 根元は細く、中ほどで大きくふくらんでから切っ先へ絞る柳の葉の形。真ん中に鎬が通る薄い菱形の断面
//   はばき: 刃の根元を締める短い筒
//   柄: まっすぐな筒に紐を隙間なく巻いた握り（紐の山が並ぶ）。下の端は平たい円盤
//   輪: 元より大きく細い丸い輪
// 元の部位はすべて隠して作り直す。長さと輪の中心は元のクナイのまま（回す軸・切っ先の当たりが変わらないように）

// 刃の輪郭 [刃先までの幅の半分, 高さ] (m)。切っ先は元と同じ 0.17
const BLADE: [number, number][] = [[0, -0.002], [0.0055, -0.002], [0.008, 0.012], [0.019, 0.055], [0.021, 0.085], [0.015, 0.125], [0, 0.17]];
const FLAT = 0.38; // 刃の厚み（幅に対する割合。元のクナイは 0.45）
const GRIP_TOP = -0.008;
const GRIP_BOTTOM = -0.083;
const CORD = 0.0055; // 紐 1 巻きの幅
const RING_R = 0.0165;
const RING_TUBE = 0.0024;

// 紐の巻き: 山と谷を交互に並べた輪郭
function cordProfile() {
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, GRIP_BOTTOM), new THREE.Vector2(0.0074, GRIP_BOTTOM)];
  for (let y = GRIP_BOTTOM; y < GRIP_TOP - CORD / 2; y += CORD) {
    prof.push(new THREE.Vector2(0.0084, y + CORD / 2), new THREE.Vector2(0.0074, y + CORD));
  }
  prof.push(new THREE.Vector2(0, GRIP_TOP));
  return prof;
}

export const willowKunai: SkinDecor = {
  build(parts, mats, model) {
    for (const name of ['blade', 'collar', 'handle', 'neck', 'ring']) if (parts[name]) parts[name].visible = false;
    // 部位のマテリアルを写して使う（飾りを外すときに捨てられるので、部位のものは渡さない）
    const black = mats.metal.clone();
    const cord = mats.wrap.clone();
    const g = new THREE.Group();

    const bladeGeo = new THREE.LatheGeometry(BLADE.map(([r, y]) => new THREE.Vector2(r, y)), 4);
    bladeGeo.scale(1, 1, FLAT);
    g.add(new THREE.Mesh(bladeGeo, black));

    const habaki = new THREE.Mesh(new THREE.CylinderGeometry(0.0088, 0.0092, 0.008, 8), black);
    habaki.position.y = GRIP_TOP + 0.003;
    g.add(habaki);

    g.add(new THREE.Mesh(new THREE.LatheGeometry(cordProfile(), 8), cord));

    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.004, 10), black);
    pommel.position.y = GRIP_BOTTOM - 0.002;
    g.add(pommel);

    // 輪の中心は元の輪と同じ（上の端が円盤に少し食い込む）
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, RING_TUBE, 6, 24), black);
    ring.position.y = model.userData.ringY as number;
    g.add(ring);
    return g;
  },
};

import * as THREE from 'three';
// ---- リボルバーのスキン: 八角銃身 ----
// 古い雷管式のリボルバーの形。色は元のリボルバーのまま、フレームを作り直す（シリンダーとスピードローダーは元のまま）。
//   銃身: 角張った板と上下 2 本の筒をやめ、細長い八角の銃身 1 本にする。先に刃の形のフロントサイト
//   フレーム: シリンダーの上を渡す枠の無いオープントップ。銃身の下の台が前の枠につながり、台の下に装填レバーを沿わせる
//   撃鉄: 背の高い撃鉄の頭に照門の溝。元のリアサイトは無い
//   用心鉄・引き金: 丸く大きな用心鉄と、細く反った引き金
//   グリップ: 下で後ろへ丸く巻き込む鳥頭の形
// 寸法は revolver.ts と同じ（m。銃口が -Z、上が +Y、銃身の軸が y = 0）。銃口の位置（弾と火花が出る所）は元のまま
const MUZZLE_Z = -0.161;
const BARREL_BACK = -0.026; // シリンダーの前の面のすぐ前
const BARREL_R = 0.0088; // 八角の頂点の半径
const CYL_Y = -0.011; // シリンダーの中心の高さ（元と同じ）
// グリップの横から見た輪郭 [z, y]。後ろの縁が下で前へ巻き込み、丸い頭（鳥頭）になる
const GRIP = [
    [0.022, -0.042], [0.025, -0.065], [0.03, -0.09], [0.04, -0.112], [0.054, -0.126], [0.07, -0.13],
    [0.083, -0.124], [0.088, -0.11], [0.084, -0.094], [0.074, -0.072], [0.064, -0.048], [0.056, -0.03], [0.04, -0.02],
];
const GRIP_DEPTH = 0.02;
export const octagonRevolver = {
    build(parts, mats) {
        for (const [name, mesh] of Object.entries(parts))
            if (name.startsWith('frame'))
                mesh.visible = false;
        const gun = mats.metal.clone();
        const grip = mats.wrap.clone();
        const bore = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
        const g = new THREE.Group();
        const box = (w, h, d, y, z, mat = gun) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(0, y, z);
            g.add(m);
            return m;
        };
        // Z 軸に沿った角柱
        const prism = (r, len, sides, y, z, mat = gun) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), mat);
            m.rotation.set(Math.PI / 2, Math.PI / sides, 0); // 平らな面を上へ向ける
            m.position.set(0, y, z);
            g.add(m);
            return m;
        };
        // 銃身: 八角の筒と、先の一回り太い輪、銃口の穴
        prism(BARREL_R, BARREL_BACK - MUZZLE_Z, 8, 0, (BARREL_BACK + MUZZLE_Z) / 2);
        prism(BARREL_R + 0.0008, 0.006, 8, 0, MUZZLE_Z + 0.003);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 10), bore);
        hole.position.set(0, 0, MUZZLE_Z - 0.0002);
        hole.rotation.y = Math.PI;
        g.add(hole);
        // フロントサイト: 銃口の近くに立つ薄い刃
        const sight = box(0.002, 0.006, 0.012, BARREL_R + 0.002, MUZZLE_Z + 0.012);
        sight.rotation.x = 0.2;
        // 銃身の下の台: 前の枠からシリンダーの前まで。台の下に装填レバー（前で下へ曲がる）
        box(0.013, 0.016, 0.07, -0.012, -0.061);
        box(0.006, 0.005, 0.085, -0.0225, -0.075); // レバー
        const latch = box(0.006, 0.012, 0.006, -0.026, -0.118);
        latch.rotation.x = -0.5;
        // フレーム: シリンダーの下の枠と、後ろの丸い盾（上は開けたまま）
        box(0.018, 0.012, 0.064, -0.037, 0.004); // 下の枠
        box(0.018, 0.03, 0.01, -0.017, -0.028); // 前の枠（シリンダーの軸を受ける）
        prism(0.021, 0.012, 12, CYL_Y, 0.03); // 後ろの丸い盾
        // 盾からグリップの上端へつなぐ所: 横から見た輪郭 [z, y]。上面は後ろへ下る斜面で、途中から撃鉄が出る
        const rear = new THREE.Shape([[0.028, 0.006], [0.04, 0.006], [0.05, -0.006], [0.06, -0.018], [0.062, -0.03], [0.05, -0.042], [0.028, -0.042]]
            .map(([z, y]) => new THREE.Vector2(z, y)));
        const rearGeo = new THREE.ExtrudeGeometry(rear, { depth: 0.018, bevelEnabled: false });
        rearGeo.translate(0, 0, -0.009);
        rearGeo.rotateY(-Math.PI / 2);
        g.add(new THREE.Mesh(rearGeo, gun));
        // 撃鉄: 斜面の付け根を軸に背の高い頭を後ろへ傾け、先から後ろへ伸ばしたスパーに照門の溝を刻む
        const hammer = new THREE.Group();
        hammer.position.set(0, -0.004, 0.04);
        hammer.rotation.x = 0.4;
        g.add(hammer);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.007), gun);
        head.position.y = 0.015;
        const spur = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.016), gun);
        spur.position.set(0, 0.029, 0.006);
        spur.rotation.x = -0.55;
        const notch = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0022, 0.0164), bore);
        notch.position.y = 0.0026;
        spur.add(notch);
        hammer.add(head, spur);
        // 用心鉄: 丸く大きな輪。引き金は細く前へ反らせる
        const guard = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0026, 5, 14, Math.PI), gun);
        guard.rotation.set(0, Math.PI / 2, Math.PI);
        guard.position.set(0, -0.043, 0.008);
        g.add(guard);
        const trigger = box(0.004, 0.022, 0.004, -0.054, 0.004);
        trigger.rotation.x = 0.5;
        // グリップ: 鳥頭の輪郭を厚みに押し出し、角を丸く落とす
        const shape = new THREE.Shape(GRIP.map(([z, y]) => new THREE.Vector2(z, y)));
        const gripGeo = new THREE.ExtrudeGeometry(shape, { depth: GRIP_DEPTH - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.0035, bevelSegments: 2, curveSegments: 1 });
        gripGeo.translate(0, 0, -(GRIP_DEPTH - 0.008) / 2);
        gripGeo.rotateY(-Math.PI / 2); // 輪郭の x を銃の z に、押し出す向きを銃の x に
        g.add(new THREE.Mesh(gripGeo, grip));
        return g;
    },
};

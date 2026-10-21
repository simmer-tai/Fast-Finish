import * as THREE from 'three';
// ---- 武器: クナイ ----
// +Y 方向が切っ先になるよう組み立てる（原点は刃の付け根）
export function createKunai(mats) {
    const kunai = new THREE.Group();
    // 刃: 付け根近くで最も太く、そこから切っ先へ長く絞る菱形断面
    const bladeProfile = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.009, 0),
        new THREE.Vector2(0.022, 0.028),
        new THREE.Vector2(0, 0.17),
    ];
    const bladeGeo = new THREE.LatheGeometry(bladeProfile, 4);
    bladeGeo.scale(1, 1, 0.45);
    kunai.add(new THREE.Mesh(bladeGeo, mats.kunai));
    // 首: 刃と柄のつなぎ目
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0095, 0.008, 8), mats.kunai);
    collar.position.y = -0.004;
    kunai.add(collar);
    // 柄: 輪に向かって細くなる八角柱
    const HANDLE_LEN = 0.075;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.006, HANDLE_LEN, 8), mats.kunai);
    handle.position.y = -0.008 - HANDLE_LEN / 2;
    kunai.add(handle);
    // 柄と輪をつなぐ細い首
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 8), mats.kunai);
    neck.position.y = -0.008 - HANDLE_LEN - 0.003;
    kunai.add(neck);
    // 輪: 太めで角の立った輪
    const RING_R = 0.013;
    const RING_TUBE = 0.0042;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, RING_TUBE, 6, 24), mats.kunai);
    ring.position.y = neck.position.y - 0.003 - RING_R - RING_TUBE * 0.6;
    kunai.add(ring);
    kunai.userData.ringY = ring.position.y;
    return kunai;
}
// 拳で握って構えた感じ: 切っ先を上へ立て、前方と内側へ傾ける
// 刃の平たい面（ローカル Z）はカメラの方へ向ける
export const REST_TIP = new THREE.Vector3(-0.44, 0.8, -0.42).normalize();
export const THROW_RANGE = 150; // 投げたクナイと照準の届く距離 (m)

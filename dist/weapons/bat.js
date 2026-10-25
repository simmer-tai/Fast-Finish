import * as THREE from 'three';
const SIDES = 10; // 断面の角の数
// 輪郭 [半径, 高さ] (m)。下（柄尻）から上（先端）へ
const BODY = [
    [0, -0.125],
    [0.02, -0.125], // ノブの底
    [0.026, -0.115],
    [0.024, -0.1], // ノブの上の面取り
    [0.0125, -0.095],
    [0.0125, 0.2], // 握り
    [0.016, 0.3],
    [0.025, 0.4], // 先へ太る
    [0.031, 0.48],
    [0.0325, 0.55], // 胴
    [0.0325, 0.68],
    [0.03, 0.695], // 先端のキャップ
    [0.022, 0.705],
    [0, 0.708],
];
const TAPE_FROM = -0.092; // グリップテープの範囲
const TAPE_TO = 0.17;
const TAPE_R = 0.0138;
export const BAT_TIP_Y = BODY[BODY.length - 1][1];
function lathe(points, mat) {
    return new THREE.Mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), SIDES), mat);
}
// +Y 方向が先端になるよう組み立てる（原点は握る位置）
export function createBat(mats) {
    const bat = new THREE.Group();
    bat.add(lathe(BODY, mats.metal));
    // グリップテープ: 握りより一回り太い筒。端は斜めに落として巻き終わりに見せる
    bat.add(lathe([[0.0125, TAPE_FROM - 0.002], [TAPE_R, TAPE_FROM + 0.004], [TAPE_R, TAPE_TO - 0.004], [0.0125, TAPE_TO + 0.002]], mats.grip));
    return bat;
}
// 一人称での構え（カメラ基準）。右手で握りを持ち、先端を右上の奥へ寝かせて肩に担ぐ手前の形で立てる
export const BAT_VIEW_MODEL_POS = new THREE.Vector3(0.22, -0.3, -0.36);
export const BAT_REST_TIP = new THREE.Vector3(0.35, 0.9, 0.05).normalize();
// 握る位置 grip（カメラ空間）から先端を tip へ向けた向き。丸い断面の面はカメラの側へ向ける
export function batQuat(grip, tip, out) {
    const faceDir = grip.clone().negate();
    faceDir.addScaledVector(tip, -faceDir.dot(tip));
    if (faceDir.lengthSq() < 1e-8)
        faceDir.set(0, 0, 1).addScaledVector(tip, -tip.z);
    faceDir.normalize();
    const sideDir = new THREE.Vector3().crossVectors(tip, faceDir);
    return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sideDir, tip, faceDir));
}
export const BAT_REST_QUAT = batQuat(BAT_VIEW_MODEL_POS, BAT_REST_TIP, new THREE.Quaternion());
// 手に持たせたバット。userData.rest が構えの向き（攻撃の動きはこの下に足す）
export function createHeldBat(mats) {
    const held = new THREE.Group();
    const rest = new THREE.Group();
    rest.quaternion.copy(BAT_REST_QUAT);
    held.add(rest);
    const bat = createBat(mats);
    rest.add(bat);
    held.userData.rest = rest;
    held.userData.bat = bat;
    return held;
}

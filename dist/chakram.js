import * as THREE from 'three';
// 大きさ (m)
const R = 0.12; // 刃の外輪の外径
const BLADE_IN = 0.098; // 刃の外輪の内径（内輪の下に潜る）
const RING_OUT = 0.1; // 内輪の外径
const RING_IN = 0.082; // 内輪の内径（くり抜きの外縁）
const BAND = 0.016; // S 字の帯の幅
// 厚さ (m)
const BLADE_T = 0.002; // 刃の外輪（面取りで刃先へ薄くする）
const BLADE_BEVEL = 0.003;
const RING_T = 0.008; // 内輪と帯
const SEG = 64; // 円の分割数
const TAPER = 0.7; // くり抜きの細い端を外の円に沿って伸ばす角度 (rad)
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
// 勾玉形のくり抜き（左側の一つ。もう一つはこれを 180° 回したもの）。
// 半径 r の円の中を、上下に半径 r/2 の半円を互い違いに並べた S 字で分け、S 字から帯の幅の半分だけ離す
function holeShape(r, w) {
    // 下の半円（中心 (0, -r/2)）を広げた円と、外の円との交点。帯はここで外の円へ広がる
    const yi = w / 2 + (w * w) / (4 * r) - r;
    const xi = -Math.sqrt(r * r - yi * yi);
    const tip = Math.atan2(yi, xi) + Math.PI * 2; // 外の円の上での角度（左下）
    // 上の端: 上の半円を狭めた円のてっぺんから、外の円へ寄りながら左へ伸ばして細く尖らせる
    const taper = Array.from({ length: 12 }, (_, i) => {
        const s = (i + 1) / 12;
        const a = Math.PI / 2 + TAPER * s;
        const rr = r - (w / 2) * (1 - s) * (1 - s);
        return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
    return [
        // 外の円: 左上から左を回って左下へ
        ...arc(0, 0, r, Math.PI / 2 + TAPER, tip, 24).slice(1),
        // 下の半円を広げた円: 左下から左を回って真ん中の上 (0, w/2) へ
        ...arc(0, -r / 2, r / 2 + w / 2, Math.atan2(yi + r / 2, xi) + Math.PI * 2, Math.PI / 2, 24),
        // 上の半円を狭めた円: 真ん中の上から右を回って上の端へ
        ...arc(0, r / 2, r / 2 - w / 2, Math.PI * 1.5, Math.PI * 2.5, 24).slice(1),
        ...taper,
    ];
}
const toPath = (path, pts) => {
    path.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1))
        path.lineTo(p[0], p[1]);
    path.closePath();
    return path;
};
const circle = (r) => arc(0, 0, r, 0, Math.PI * 2, SEG).slice(1);
// 輪郭 outer（穴 holes 付き）を厚さ depth の板にする。中心は z = 0
function plate(outer, holes, depth, bevel, mat) {
    const shape = toPath(new THREE.Shape(), outer);
    for (const h of holes)
        shape.holes.push(toPath(new THREE.Path(), h));
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
    });
    geo.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geo, mat);
}
export function createChakram(mats) {
    const chakram = new THREE.Group();
    // 刃の外輪: 薄い板の縁を大きく面取りして、外周を刃にする
    chakram.add(plate(circle(R - BLADE_BEVEL), [circle(BLADE_IN)], BLADE_T, BLADE_BEVEL, mats.metal));
    // 内輪と S 字の帯
    const hole = holeShape(RING_IN, BAND);
    const flipped = hole.map(([x, y]) => [-x, -y]);
    chakram.add(plate(circle(RING_OUT), [hole, flipped], RING_T, 0.001, mats.metal));
    return chakram;
}
// 一人称での構え（カメラ基準）。右手で内輪の右下をつまむように持ち、画面の右下に置く
// （手のモデルが無いので、握る所は画面の外へ出す）。
// 面を少し左奥へ向けて傾け、円が楕円に見えるようにする
export const CHAKRAM_VIEW_MODEL_POS = new THREE.Vector3(0.2, -0.2, -0.36);
export const CHAKRAM_REST_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, -0.75, 0.3, 'YXZ'));
// 手に持たせたチャクラム。userData.rest が構えの向き（攻撃の動きはこの下に足す）
export function createHeldChakram(mats) {
    const held = new THREE.Group();
    const rest = new THREE.Group();
    rest.quaternion.copy(CHAKRAM_REST_QUAT);
    held.add(rest);
    const chakram = createChakram(mats);
    rest.add(chakram);
    held.userData.rest = rest;
    held.userData.chakram = chakram;
    return held;
}

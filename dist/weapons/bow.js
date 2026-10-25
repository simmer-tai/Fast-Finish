import * as THREE from 'three';
import { loftRings } from '../geometry.js';
const RISER_C = 0.05; // 柄の中心の高さ（握りより少し上）。上下のリムはここを境に対称
const RISER_HALF = 0.36; // 柄の長さの半分
const SHELF_Y = 0.058; // 矢を載せる棚の高さ
const LIMB_LEN = 0.4; // リムの長さ
const LIMB_IN = 0.035; // リムを柄に差し込む深さ
const STRING_R = 0.0016; // 弦の太さ（半径）
// 柄やリムの断面: 角を落とした八角形。u は厚み（front: 前へ向く向き）、v は横幅（Z）の向き。
// 並びは -front → +Z → +front → -Z（loftRings の進む向きから見て表が外を向く順）
function section(c, front, d, w, zOff = 0) {
    const at = (u, v) => c.clone().addScaledVector(front, u).setZ(c.z + zOff + v);
    return [
        at(-d / 2, -w * 0.3), at(-d / 2, w * 0.3), at(-d * 0.3, w / 2), at(d * 0.3, w / 2),
        at(d / 2, w * 0.3), at(d / 2, -w * 0.3), at(d * 0.3, -w / 2), at(-d * 0.3, -w / 2),
    ];
}
// 断面の並びを両端も閉じた立体にする（始まりの側は並びを逆にして表を外へ向ける）
function loftClosed(rings, start, end, mat) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(loftRings([...rings, [end]]), mat));
    g.add(new THREE.Mesh(loftRings([rings[0].slice().reverse(), [start]]), mat));
    return g;
}
const RISER_KEYS = [
    [-0.31, 0.026, 0.044, 0.03, 0],
    [-0.24, 0.014, 0.034, 0.026, 0],
    [-0.14, 0.002, 0.032, 0.026, 0],
    [-0.075, -0.008, 0.04, 0.028, 0],
    [0, -0.015, 0.05, 0.03, 0],
    [0.04, -0.006, 0.042, 0.028, 0],
    [SHELF_Y, 0, 0.034, 0.028, 0],
    [SHELF_Y + 0.012, 0.004, 0.03, 0.015, 0.0065],
    [0.22, 0.008, 0.03, 0.015, 0.0065],
    [0.25, 0.008, 0.032, 0.026, 0],
    [0.34, 0.014, 0.034, 0.026, 0],
    [0.41, 0.026, 0.044, 0.03, 0],
];
const GRIP_FROM = -0.075;
const GRIP_TO = 0.042;
// リムの中心線（上のリム）: 差し込み口から先端へ、少しずつ向きを変えながら進める。
// 向き θ は +Y から測り、正が射手の側（-X）。根元から 7 割まではしなって θ が増え、そこから先端は前へ反り返る
const LIMB_STEPS = 18;
function limbPath() {
    const pts = [];
    const p = new THREE.Vector3(0.026, RISER_C + RISER_HALF - LIMB_IN, 0);
    let th = 0.1;
    const ds = LIMB_LEN / LIMB_STEPS;
    for (let i = 0; i <= LIMB_STEPS; i++) {
        const u = i / LIMB_STEPS;
        pts.push({ p: p.clone(), t: new THREE.Vector3(-Math.sin(th), Math.cos(th), 0), u });
        const bend = u < 0.62 ? 2.9 : u < 0.72 ? 2.9 - (u - 0.62) * 110 : -8.1;
        th += bend * ds;
        p.x -= Math.sin(th) * ds;
        p.y += Math.cos(th) * ds;
    }
    return pts;
}
// +Y が上、+X が的の側になるよう組み立てる（原点は握る位置）
export function createBow(mats) {
    const bow = new THREE.Group();
    const X = new THREE.Vector3(1, 0, 0);
    // 柄
    const riserRings = RISER_KEYS.map(([y, x, d, w, z]) => section(new THREE.Vector3(x, y, 0), X, d, w, z));
    const first = RISER_KEYS[0];
    const last = RISER_KEYS[RISER_KEYS.length - 1];
    bow.add(loftClosed(riserRings, new THREE.Vector3(first[1], first[0] - 0.006, 0), new THREE.Vector3(last[1], last[0] + 0.006, 0), mats.riser));
    // 握りの巻き: 握りの範囲の柄を一回り太らせて覆う
    const gripKeys = RISER_KEYS.filter(([y]) => y > GRIP_FROM && y < GRIP_TO);
    const lerpKey = (y) => {
        const i = RISER_KEYS.findIndex(([ky]) => ky >= y);
        const a = RISER_KEYS[i - 1];
        const b = RISER_KEYS[i];
        const k = (y - a[0]) / (b[0] - a[0]);
        return a.map((v, j) => v + (b[j] - v) * k);
    };
    const wrapKeys = [lerpKey(GRIP_FROM), ...gripKeys, lerpKey(GRIP_TO)];
    const wrapRings = wrapKeys.map(([y, x, d, w]) => section(new THREE.Vector3(x, y, 0), X, d + 0.005, w + 0.005));
    bow.add(loftClosed(wrapRings, new THREE.Vector3(wrapKeys[0][1], GRIP_FROM, 0), new THREE.Vector3(wrapKeys[wrapKeys.length - 1][1], GRIP_TO, 0), mats.grip));
    // 矢を載せる棚: 窓の下端から -Z の側へ小さく張り出す
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.005, 0.012), mats.riser);
    shelf.position.set(0.001, SHELF_Y + 0.0025, -0.0075 - 0.006);
    bow.add(shelf);
    // リム: 上のリムを作り、柄の中心の高さで上下に映して下のリムにする（映すと表裏が返るので断面の並びを逆にする）
    const path = limbPath();
    const tips = [];
    for (const sign of [1, -1]) {
        const flip = (v) => (sign > 0 ? v.clone() : new THREE.Vector3(v.x, 2 * RISER_C - v.y, v.z));
        const rings = path.map(({ p, t, u }) => {
            const front = new THREE.Vector3(t.y, -t.x, 0); // 進む向きに直交して前（+X の側）を向く
            const d = THREE.MathUtils.lerp(0.012, 0.006, u);
            const w = THREE.MathUtils.lerp(0.036, 0.016, u * u);
            const ring = section(p, front, d, w).map(flip);
            return sign > 0 ? ring : ring.reverse();
        });
        const end = path[path.length - 1];
        const tip = flip(end.p.clone().addScaledVector(end.t, 0.008));
        bow.add(loftClosed(rings, flip(path[0].p.clone().addScaledVector(path[0].t, -0.004)), tip, mats.limb));
        // 弦を掛ける先端の筈（はず）: 弦の通る側に小さな溝の出っ張り
        const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 6), mats.riser);
        nock.rotation.x = Math.PI / 2;
        nock.position.copy(flip(end.p));
        bow.add(nock);
        tips.push(flip(end.p.clone().addScaledVector(new THREE.Vector3(-end.t.y, end.t.x, 0), 0.004)));
    }
    // 弦: 上下の先端から、矢をつがえる所（棚のすぐ上）まで 2 本
    const restX = (tips[0].x + tips[1].x) / 2;
    const nockPoint = new THREE.Vector3(restX, SHELF_Y + 0.008, 0);
    const strings = tips.map((tip) => {
        const geo = new THREE.CylinderGeometry(STRING_R, STRING_R, 1, 4);
        geo.translate(0, 0.5, 0); // 根元（先端の側）から +Y へ長さ 1
        const m = new THREE.Mesh(geo, mats.string);
        m.position.copy(tip);
        bow.add(m);
        return m;
    });
    bow.userData.strings = strings;
    bow.userData.stringTips = tips;
    bow.userData.nockRest = nockPoint; // 引いていないときの、矢をつがえる所
    bow.userData.shelfY = SHELF_Y;
    setBowDraw(bow, 0);
    return bow;
}
// 弦を引く。pull は矢をつがえる所を射手の側（-X）へ引いた長さ (m)
export function setBowDraw(bow, pull) {
    const strings = bow.userData.strings;
    const tips = bow.userData.stringTips;
    const nock = bow.userData.nockRest.clone();
    nock.x -= pull;
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    strings.forEach((m, i) => {
        dir.subVectors(nock, tips[i]);
        m.scale.set(1, dir.length(), 1);
        m.quaternion.setFromUnitVectors(up, dir.normalize());
    });
}
// ---- 矢 ----
// 細い軸の先に四角錐の鏃（やじり）、後ろに 3 枚の矢羽と、弦に掛ける筈。+Y が鏃の向きで、原点は筈（弦に掛ける所）
export const ARROW_LEN = 0.7; // 筈から鏃の先まで
export function createArrow(mats) {
    const arrow = new THREE.Group();
    const HEAD_LEN = 0.045;
    const shaftLen = ARROW_LEN - HEAD_LEN;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, shaftLen, 5), mats.shaft);
    shaft.position.y = shaftLen / 2;
    arrow.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.008, HEAD_LEN, 4), mats.head);
    head.position.y = shaftLen + HEAD_LEN / 2;
    arrow.add(head);
    // 矢羽: 後ろへ向かって高くなる薄い三角の板を、軸のまわりに 120° ずつ
    const vane = new THREE.Shape([new THREE.Vector2(0, 0.02), new THREE.Vector2(0.014, 0.025), new THREE.Vector2(0.004, 0.12), new THREE.Vector2(0, 0.12)]);
    const vaneGeo = new THREE.ExtrudeGeometry(vane, { depth: 0.0012, bevelEnabled: false });
    vaneGeo.translate(0.003, 0, -0.0006);
    for (let i = 0; i < 3; i++) {
        const v = new THREE.Mesh(vaneGeo, mats.fletch);
        v.rotation.y = (i * Math.PI * 2) / 3;
        arrow.add(v);
    }
    const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 5), mats.head);
    nock.position.y = 0.004;
    arrow.add(nock);
    return arrow;
}
// 一人称での構え（カメラ基準）。左手で握りを持ち、腕を前へ伸ばして画面の左に立てる。
// 的の側（+X）を奥へ、矢の通る側（-Z）を左へ向け、上を少し右へ傾ける。上下のリムは画面の外まで伸びる
export const BOW_VIEW_MODEL_POS = new THREE.Vector3(-0.3, -0.26, -0.48);
const BOW_CANT = -22 * (Math.PI / 180);
// 弦を引いて狙う構え: 弓を照準の左下へ寄せ、傾きを起こす（BOW_REST_QUAT からカメラの奥の軸まわりに BOW_AIM_UNCANT だけ戻す）
export const BOW_AIM_POS = new THREE.Vector3(-0.13, -0.15, -0.5);
export const BOW_AIM_UNCANT = 12 * (Math.PI / 180);
// スライディング中の横に寝かせた構え: 構えの傾きからさらに倒して、上のリムを右へ真横に向ける
export const BOW_SLIDE_TURN = Math.PI / 2 + BOW_CANT;
export const BOW_REST_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), BOW_CANT)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
// 手に持たせた弓。userData.rest が構えの向き（引く動きなどはこの下に足す）
export function createHeldBow(mats) {
    const held = new THREE.Group();
    const rest = new THREE.Group();
    rest.quaternion.copy(BOW_REST_QUAT);
    held.add(rest);
    const bow = createBow(mats);
    rest.add(bow);
    held.userData.rest = rest;
    held.userData.bow = bow;
    return held;
}

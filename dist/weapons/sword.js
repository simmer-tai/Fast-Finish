import * as THREE from 'three';
import { loftRings } from '../geometry.js';
// ---- 武器: 剣 ----
// 黒い直刀。鎬（しのぎ）のある六角断面の刃に、斜めに落とした切っ先。刃はクナイと同じ黒光りする質感にする
const BLADE_LEN = 0.72;
const TIP_LEN = 0.09;
const GRIP_LEN = 0.2;
const bladeBase = GRIP_LEN / 2 + 0.035; // 鍔とはばきの上から刃が始まる
// 原点（握る位置）から切っ先までと、刃の付け根までの長さ
export const SWORD_TIP_Y = bladeBase + BLADE_LEN;
export const SWORD_BLADE_BASE_Y = bladeBase;
export const SWORD_GRIP_LEN = GRIP_LEN;
// 刃の断面の幅と厚み。根元・中ほど・切っ先の始まりの 3 か所で決め、その間はまっすぐつなぐ。切っ先は棟寄りの 1 点に絞る
const W = 0.034;
const T = 0.009;
const tipStart = bladeBase + BLADE_LEN - TIP_LEN;
const BLADE_KEYS = [
    [bladeBase, W * 1.05, T],
    [bladeBase + BLADE_LEN * 0.45, W, T * 0.95],
    [tipStart, W * 0.9, T * 0.85],
];
const TIP_POINT = new THREE.Vector3(-W * 0.38, bladeBase + BLADE_LEN, 0);
// 刃の断面: 棟（-X）は平らな面、鎬（少し棟寄り）で最も厚く、刃先（+X）で 0 になる
const section = (y, w, t) => [
    new THREE.Vector3(-w / 2, y, t * 0.35),
    new THREE.Vector3(-w * 0.1, y, t / 2),
    new THREE.Vector3(w / 2, y, 0),
    new THREE.Vector3(-w * 0.1, y, -t / 2),
    new THREE.Vector3(-w / 2, y, -t * 0.35),
];
// 刃の面の上の点（スキンの模様を刃に沿わせて貼るのに使う）。
// u: 棟の角 -1 → 鎬 0 → 刃先 1、v: 根元 0 → 切っ先 1、side: 表 (+Z) が 1、裏が -1
export function swordBladePoint(u, v, side, out = new THREE.Vector3()) {
    const y = bladeBase + v * BLADE_LEN;
    const at = (yy) => {
        let i = 0;
        while (i < BLADE_KEYS.length - 2 && yy > BLADE_KEYS[i + 1][0])
            i++;
        const [y0, w0, t0] = BLADE_KEYS[i];
        const [y1, w1, t1] = BLADE_KEYS[i + 1];
        const k = THREE.MathUtils.clamp((yy - y0) / (y1 - y0), 0, 1);
        const w = w0 + (w1 - w0) * k;
        const t = t0 + (t1 - t0) * k;
        const [mune, shinogi, edge] = section(yy, w, t);
        return u < 0 ? mune.lerp(shinogi, u + 1) : shinogi.lerp(edge, u);
    };
    if (y <= tipStart)
        out.copy(at(y));
    else
        out.copy(at(tipStart)).lerp(TIP_POINT, (y - tipStart) / TIP_LEN);
    out.z *= side;
    return out;
}
// +Y 方向が切っ先になるよう組み立てる（原点は握る位置 = 柄の中ほど）。刃（切る側）は +X
export function createSword(mats) {
    const sword = new THREE.Group();
    // 切っ先: 刃先側を斜めに落とし、棟側に尖らせる
    const bladeGeo = loftRings([...BLADE_KEYS.map(([y, w, t]) => section(y, w, t)), [TIP_POINT.clone()]]);
    // 部位には名前を付けておく（スキンの飾りが隠したり差し替えたりする）
    const part = (name, m) => {
        m.name = name;
        sword.add(m);
    };
    part('blade', new THREE.Mesh(bladeGeo, mats.kunai));
    // はばき: 刃の根元を包む、上へすぼまる角ばった金具
    const habaki = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.024, 0.028, 4), mats.kunai);
    habaki.rotation.y = Math.PI / 4;
    habaki.scale.set(1.25, 1, 0.55);
    habaki.position.y = GRIP_LEN / 2 + 0.021;
    part('habaki', habaki);
    // 鍔: 小ぶりな八角の板
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.01, 8), mats.swordHilt);
    guard.scale.set(1, 1, 0.75);
    guard.position.y = GRIP_LEN / 2 + 0.003;
    part('guard', guard);
    // 柄: 柄頭へ向かってわずかに細くなる八角柱
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0115, GRIP_LEN, 8), mats.swordHilt);
    grip.scale.set(1, 1, 0.8);
    part('grip', grip);
    // 柄頭: 柄より一回り太い八角の帽子
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.016, 0.016, 8), mats.swordHilt);
    pommel.scale.set(1, 1, 0.8);
    pommel.position.y = -GRIP_LEN / 2 - 0.008;
    part('pommel', pommel);
    return sword;
}
// 右手で柄を握り、刃を前上方へ立てて構える
export const SWORD_VIEW_MODEL_POS = new THREE.Vector3(0.2, -0.26, -0.3);
// 構えは 2 通り。止まっている・歩いているときは縦に立て、走っているときは前へ倒す
export const SWORD_STAND_QUAT = new THREE.Quaternion();
export const SWORD_RUN_QUAT = new THREE.Quaternion();
export const SWORD_SLIDE_QUAT = new THREE.Quaternion();
{
    // 縦に立てて持ち（切っ先はわずかに前へ傾ける）、刃先（ローカル +X）を正面へ向ける
    const tip = new THREE.Vector3(0, 1, -0.15).normalize();
    const edgeDir = new THREE.Vector3(0, 0, -1).addScaledVector(tip, tip.z).normalize();
    const faceDir = new THREE.Vector3().crossVectors(edgeDir, tip);
    SWORD_STAND_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edgeDir, tip, faceDir));
}
{
    // 走っている間: 切っ先を前方へ倒し、少し内側へ向ける。刃の平たい面をカメラへ向けたあと、刃先が前を向くようひねる
    const tip = new THREE.Vector3(-0.08, 0.55, -0.83).normalize();
    const toCamera = SWORD_VIEW_MODEL_POS.clone().negate();
    const faceDir = toCamera.addScaledVector(tip, -toCamera.dot(tip)).normalize();
    const sideDir = new THREE.Vector3().crossVectors(tip, faceDir);
    SWORD_RUN_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sideDir, tip, faceDir))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(55)));
}
{
    // スライディング中: 刀を横に寝かせ、切っ先を左（やや奥）へ向ける。刃先は正面へ向けたまま
    const tip = new THREE.Vector3(-0.9, 0.08, -0.45).normalize();
    const edgeDir = new THREE.Vector3(0, 0, -1).addScaledVector(tip, tip.z).normalize();
    const faceDir = new THREE.Vector3().crossVectors(edgeDir, tip);
    SWORD_SLIDE_QUAT.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edgeDir, tip, faceDir));
}

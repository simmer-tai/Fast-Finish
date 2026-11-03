import * as THREE from 'three';
import { DUMMY_COLOR, buildEnemyRig } from './body.js?v=6b2d2aee';
import { en } from './state.js?v=6b2d2aee';
// ---- ドローン ----
// 宙に浮いて撃ってくる小型の機体。人型と同じ骨を使い回し、よろめき・砕け方・同期の決まりをそのまま効かせる:
// 腰と背骨 = 胴、首 = 正面のセンサー、銃の骨 = あごの下の 2 連の砲塔、腕 = 左右のダクトファン（[0] が右 = -X 側）、
// 前腕 = ファンの羽根（回す）。脚の骨は空のまま残す（何も付けない）。
// 骨の原点は胴の中心の高さ（DRONE_CORE_Y）へ置き直す。当たりの円柱（足もとから 0.25〜1.65m）に胴とファンが収まる高さ
export const DRONE_CORE_Y = 1.5;
const DRONE_FAN_X = 0.56; // ファンの中心の横の位置
const DRONE_FAN_R = 0.21; // ダクトの内側の半径
export const DRONE_GUN_Y = DRONE_CORE_Y - 0.15; // 砲塔の回る中心（狙いの上下の角度の基準）
const prism = (top, bottom, h, sides = 8) => new THREE.CylinderGeometry(top, bottom, h, sides);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
// 骨の原点を置き直す（親の原点からの差に直す。子の骨の位置も合わせて直す）
function rebase(bone, x, y, z = 0) {
    bone.userData.origin.set(x, y, z);
    const fix = (b) => {
        const o = b.userData.origin;
        const po = b.parent?.userData.origin;
        if (o)
            b.position.copy(o).sub(po ?? new THREE.Vector3());
    };
    fix(bone);
    for (const c of bone.children)
        fix(c);
}
// 胴: 前後に長い八角の胴に、黒い腹と赤道の帯。上は面取りした天板、後ろに 1 枚のひれと 2 本の噴き出し口。
// 正面に黒いセンサーの箱があり、真ん中のレンズに小さな白い点（どこを見ているかわかる）
export function buildDroneBody() {
    const { body, addPart } = buildEnemyRig(DUMMY_COLOR);
    const { mat: R, jointMat: K, pelvis, spine, neck, gunRig } = body;
    const Y = DRONE_CORE_Y;
    rebase(pelvis, 0, Y);
    rebase(spine, 0, Y);
    rebase(neck, 0, Y + 0.05, 0.27);
    rebase(gunRig, 0, DRONE_GUN_Y, 0.12);
    const flat = (m, depth = 1) => {
        m.rotation.y = Math.PI / 8;
        m.scale.z = depth;
        return m;
    };
    // 胴
    flat(addPart(prism(0.2, 0.235, 0.17), R, 0, Y + 0.04, 0, spine), 1.3);
    flat(addPart(prism(0.13, 0.2, 0.07), R, 0, Y + 0.16, -0.01, spine), 1.3);
    flat(addPart(prism(0.245, 0.245, 0.04), K, 0, Y - 0.06, 0, spine), 1.3);
    flat(addPart(prism(0.23, 0.15, 0.09), K, 0, Y - 0.12, 0, spine), 1.3);
    // 天板の前の縁に黒い溝と、後ろのひれ・噴き出し口・アンテナ
    addPart(box(0.16, 0.02, 0.03), K, 0, Y + 0.17, 0.12, spine).rotation.x = 0.35;
    const fin = addPart(box(0.02, 0.14, 0.2), R, 0, Y + 0.22, -0.13, spine);
    fin.rotation.x = -0.4;
    for (const side of [-1, 1]) {
        const nozzle = addPart(prism(0.035, 0.045, 0.08, 8), K, 0.08 * side, Y - 0.01, -0.3, spine);
        nozzle.rotation.x = Math.PI / 2;
    }
    addPart(prism(0.006, 0.01, 0.16, 6), K, -0.11, Y + 0.24, -0.1, spine).rotation.z = 0.2;
    // センサー: 前へ少し突き出した黒い箱と、縁の赤い庇。レンズの奥に白い点
    addPart(box(0.22, 0.09, 0.07), K, 0, Y + 0.05, 0.28, neck).rotation.x = -0.15;
    addPart(box(0.25, 0.025, 0.06), R, 0, Y + 0.1, 0.3, neck).rotation.x = -0.25;
    const lens = addPart(prism(0.04, 0.045, 0.03, 8), K, 0, Y + 0.05, 0.32, neck);
    lens.rotation.x = Math.PI / 2;
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.017, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(0, 0, 0.338).add(new THREE.Vector3(0, Y + 0.05, 0)).sub(neck.userData.origin);
    neck.add(eye);
    // ダクトファン: 胴の横から黒い腕を伸ばし、先に四角い断面の赤い輪。輪の中に黒い軸受けと 3 枚の羽根、回っているときの薄い円
    const blurMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
        const x = DRONE_FAN_X * side;
        const duct = new THREE.Group();
        duct.userData.origin = new THREE.Vector3(x, Y, -0.02);
        duct.position.copy(duct.userData.origin).sub(spine.userData.origin);
        spine.add(duct);
        body.arms.push(duct);
        // 腕は胴の横から輪の内側まで（輪の中は支えだけにして、羽根と重ねない）
        const inner = DRONE_FAN_X - DRONE_FAN_R - 0.03;
        addPart(box(inner - 0.18, 0.05, 0.07), K, (inner + 0.18) / 2 * side, Y, -0.02, duct);
        addPart(box(0.07, 0.07, 0.1), R, 0.22 * side, Y + 0.01, -0.02, duct);
        const ring = addPart(new THREE.TorusGeometry(DRONE_FAN_R + 0.035, 0.04, 4, 12), R, x, Y, -0.02, duct);
        ring.rotation.set(Math.PI / 2, 0, Math.PI / 4);
        ring.scale.z = 1.5; // 輪を上下に厚くする（回したあとの z は上下）
        // 輪の下の黒い縁取りと、輪の中を横切る支え
        const lip = addPart(new THREE.TorusGeometry(DRONE_FAN_R + 0.035, 0.022, 4, 12), K, x, Y - 0.06, -0.02, duct);
        lip.rotation.set(Math.PI / 2, 0, Math.PI / 4);
        addPart(box(DRONE_FAN_R * 2, 0.015, 0.025), K, x, Y - 0.03, -0.02, duct);
        const rotor = new THREE.Group();
        rotor.position.set(0, 0, 0);
        duct.add(rotor);
        body.forearms.push(rotor);
        addPart(prism(0.035, 0.045, 0.06), K, 0, 0.005, 0, rotor);
        for (let i = 0; i < 3; i++) {
            const blade = new THREE.Mesh(box(DRONE_FAN_R - 0.02, 0.006, 0.05), K);
            const a = (i / 3) * Math.PI * 2;
            blade.position.set(Math.cos(a) * (DRONE_FAN_R / 2 + 0.02), 0.01, -Math.sin(a) * (DRONE_FAN_R / 2 + 0.02));
            blade.rotation.set(0, a, 0.35 * side); // 羽根をひねる
            rotor.add(blade);
            body.parts.push(blade);
        }
        const blur = new THREE.Mesh(new THREE.CircleGeometry(DRONE_FAN_R - 0.005, 16).rotateX(-Math.PI / 2), blurMat);
        blur.position.y = 0.012;
        blur.renderOrder = 1;
        rotor.add(blur);
    }
    return body;
}
// あごの下の砲塔: 黒い球の継ぎ目に赤い箱、2 本の短い砲身。返す入れ物の userData.muzzles に [右, 左] の砲口（-Z が撃つ向き）
export function attachDroneGun(body) {
    const gun = new THREE.Group();
    body.gunRig.add(gun);
    const at = (o, x, y, z) => o.position.set(x, y, z).sub(body.gunRig.userData.origin);
    const put = (geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        at(m, x, y, z);
        gun.add(m);
        body.parts.push(m);
        return m;
    };
    const G = DRONE_GUN_Y;
    put(new THREE.IcosahedronGeometry(0.06, 1), body.jointMat, 0, G, 0.12);
    put(box(0.12, 0.07, 0.15), body.mat, 0, G - 0.015, 0.18).rotation.x = 0.06;
    put(box(0.09, 0.02, 0.1), body.jointMat, 0, G + 0.03, 0.17);
    const muzzles = [];
    for (const side of [-1, 1]) {
        const barrel = put(prism(0.014, 0.014, 0.18, 6), body.jointMat, 0.03 * side, G - 0.02, 0.32);
        barrel.rotation.x = Math.PI / 2;
        put(prism(0.02, 0.02, 0.03, 6), body.jointMat, 0.03 * side, G - 0.02, 0.4).rotation.x = Math.PI / 2;
        const muzzle = new THREE.Object3D();
        at(muzzle, 0.03 * side, G - 0.02, 0.42);
        muzzle.rotation.y = Math.PI; // 砲口の -Z を正面（+Z）へ
        gun.add(muzzle);
        muzzles.push(muzzle);
    }
    gun.userData.muzzle = muzzles[0];
    gun.userData.muzzles = muzzles;
    return gun;
}
// ---- 浮いている姿勢 ----
// updateDummyStagger（よろめきと人型の姿勢）の後に呼び、人型の姿勢を浮いている姿勢に置き直す:
// - ゆっくり上下に漂い、わずかに左右へ揺れる
// - 進む向きへ胴を傾け（前へ進めば機首を下げ、横へ流れればその側を下げる）、速さの変わり目では少し遅れて追いつく
// - ファンは胴より大きく進む向きへ倒し、羽根を回す（速いほど速く回す）。左右で逆向きに回す
// - 銃の骨は胴の傾きを打ち消して、狙いを保つ
// 当たったときの胴の揺れは、よろめきのばね（腰の位置と上体の傾き）がそのまま乗る
const DRONE_BOB = 0.05; // 漂う上下の幅 (m)
const DRONE_TILT = 0.055; // 速さ 1 m/s あたりに傾ける角度 (rad)
const DRONE_TILT_MAX = 0.4;
const DRONE_TILT_RATE = 5; // 傾きが追いつく速さ
const DRONE_FAN_TILT = 1.8; // ファンを胴の何倍倒すか
const DRONE_SPIN = 40; // 羽根の回る速さ (rad/s)
const DRONE_SPIN_FAST = 4; // 速さ 1 m/s あたりに足す
const poses = new WeakMap();
const bankQ = new THREE.Quaternion();
const bankInv = new THREE.Quaternion();
const bankE = new THREE.Euler();
const fwd = new THREE.Vector3();
const rgt = new THREE.Vector3();
export function poseDrone(dt) {
    let s = poses.get(en);
    if (!s)
        poses.set(en, (s = { tilt: new THREE.Vector2(), tiltVel: new THREE.Vector2(), spin: Math.random() * 6 }));
    const v = en.vel;
    fwd.set(Math.sin(en.yaw), 0, Math.cos(en.yaw));
    rgt.set(Math.cos(en.yaw), 0, -Math.sin(en.yaw)); // 体の +X
    const vz = v.dot(fwd) + en.knockVel.dot(fwd) * 0.5;
    const vx = v.dot(rgt) + en.knockVel.dot(rgt) * 0.5;
    // 傾きは、少し行き過ぎるばねで追わせる（止まると一度だけ揺り戻す）
    const wantX = THREE.MathUtils.clamp(vz * DRONE_TILT, -DRONE_TILT_MAX, DRONE_TILT_MAX);
    const wantZ = THREE.MathUtils.clamp(-vx * DRONE_TILT, -DRONE_TILT_MAX, DRONE_TILT_MAX);
    const k = DRONE_TILT_RATE * DRONE_TILT_RATE;
    const d = DRONE_TILT_RATE * 1.3;
    s.tiltVel.x += ((wantX - s.tilt.x) * k - s.tiltVel.x * d) * dt;
    s.tiltVel.y += ((wantZ - s.tilt.y) * k - s.tiltVel.y * d) * dt;
    s.tilt.addScaledVector(s.tiltVel, dt);
    const t = en.idleT;
    // 漂い: 胴の位置はよろめきのばねに上下の漂いを足す（人型の脚の IK で腰を下げた分は捨てる）
    en.pelvis.position.copy(en.pelvis.userData.origin).add(en.pelvisSpring.x);
    en.pelvis.position.y += (Math.sin(t * 2.1) + 0.35 * Math.sin(t * 3.7 + 1.3)) * DRONE_BOB;
    bankE.set(s.tilt.x + Math.sin(t * 1.7 + 0.4) * 0.03, 0, s.tilt.y + Math.sin(t * 1.3) * 0.04);
    bankQ.setFromEuler(bankE);
    en.spine.quaternion.premultiply(bankQ);
    bankInv.copy(bankQ).invert();
    en.gunRig.quaternion.premultiply(bankInv);
    const speed = Math.hypot(v.x, v.z);
    s.spin += dt * (DRONE_SPIN + speed * DRONE_SPIN_FAST);
    for (let i = 0; i < 2; i++) {
        en.arms[i].rotation.set(s.tilt.x * (DRONE_FAN_TILT - 1), 0, 0);
        en.forearms[i].rotation.set(0, s.spin * (i === 0 ? 1 : -1), 0);
    }
}

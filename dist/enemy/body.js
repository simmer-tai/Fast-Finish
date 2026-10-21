import * as THREE from 'three';
// ---- 敵の体 ----
export const DUMMY_RADIUS = 0.3;
export const DUMMY_HEIGHT = 1.8;
// 人型のローポリロボット。赤い装甲と黒い関節の 2 色で、面ごとの陰影だけで形を見せる（正面は +Z）
const DUMMY_COLOR = 0xc0392b;
const DUMMY_JOINT_COLOR = 0x222222;
export const DUMMY_UPPER_ARM = 0.34; // 肩から肘
export const DUMMY_FOREARM = 0.36; // 肘から手の中心
// 体の骨: 腰 → 背骨（腹）→ 首、背骨 → 銃を構えた腕の付け根、腰 → 太もも → すね → 足。
// 当たったときに部位ごとに別々に揺らす。origin は立ち姿勢での shake 座標の位置
function dummyBone(parent, x, y, z = 0) {
    const g = new THREE.Group();
    g.userData.origin = new THREE.Vector3(x, y, z);
    g.position.set(x, y, z);
    if (parent.userData.origin)
        g.position.sub(parent.userData.origin);
    parent.add(g);
    return g;
}
const DUMMY_HIP_Y = 0.9;
const DUMMY_KNEE_Y = 0.52;
export const DUMMY_ANKLE_Y = 0.09;
export const DUMMY_LEG_X = 0.11;
export const DUMMY_THIGH = DUMMY_HIP_Y - DUMMY_KNEE_Y;
export const DUMMY_SHIN = DUMMY_KNEE_Y - DUMMY_ANKLE_Y;
// 上下で太さの違う角柱（sides 角形）
const prism = (top, bottom, h, sides = 10) => new THREE.CylinderGeometry(top, bottom, h, sides);
const joint = (r) => new THREE.IcosahedronGeometry(r, 1);
// 敵 1 体分の体を組む。当たったときの白い光りを 1 体ずつ出せるよう、マテリアルも 1 体ごとに作る
export function buildEnemyBody() {
    const root = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: DUMMY_COLOR, emissive: 0xffffff, emissiveIntensity: 0, flatShading: true });
    const jointMat = new THREE.MeshLambertMaterial({ color: DUMMY_JOINT_COLOR, emissive: 0xffffff, emissiveIntensity: 0, flatShading: true });
    // 見た目だけを揺らすための入れ物（当たり判定に使う root の位置は動かさない）
    const shake = new THREE.Group();
    root.add(shake);
    const parts = []; // 投げたクナイの当たり判定に使う
    const arms = []; // 肩を原点にした上腕。[0] が右腕（正面が +Z なので -X 側）
    const forearms = []; // 肘を原点にした前腕。arms と同じ並び
    const pelvis = dummyBone(shake, 0, 0.93);
    const spine = dummyBone(pelvis, 0, 1.0);
    const neck = dummyBone(spine, 0, 1.53);
    const gunRig = dummyBone(spine, 0, 1.47); // 両肩を結ぶ線が軸。銃と両腕をまとめて跳ね上げる
    const thighs = []; // [0] が右脚（-X 側）
    const shins = [];
    const feet = [];
    for (const side of [-1, 1]) {
        const thigh = dummyBone(pelvis, DUMMY_LEG_X * side, DUMMY_HIP_Y);
        const shin = dummyBone(thigh, DUMMY_LEG_X * side, DUMMY_KNEE_Y);
        thighs.push(thigh);
        shins.push(shin);
        feet.push(dummyBone(shin, DUMMY_LEG_X * side, DUMMY_ANKLE_Y));
    }
    let buildBone = shake; // 部品を付ける骨（作る間だけ切り替える）
    // 骨に付ける部品の位置は shake 座標で書き、骨の原点からの差に直す（腕と前腕はそのままのローカル座標）
    function addPart(geo, mat, x, y, z = 0, parent = buildBone) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (parent.userData.origin)
            m.position.sub(parent.userData.origin);
        parent.add(m);
        parts.push(m);
        return m;
    }
    {
        // 八角の部品は平らな面を正面へ向け、前後に少しつぶす
        const octPart = (geo, mat, x, y, z = 0, depth = 1, parent) => {
            const m = addPart(geo, mat, x, y, z, parent);
            m.rotation.y = Math.PI / 8;
            m.scale.z = depth;
            return m;
        };
        // 脚: 黒い芯に赤い装甲をかぶせる
        for (const side of [-1, 1]) {
            const x = DUMMY_LEG_X * side;
            const leg = side < 0 ? 0 : 1;
            buildBone = feet[leg];
            addPart(new THREE.BoxGeometry(0.11, 0.06, 0.2), jointMat, x, 0.03, 0.03);
            addPart(new THREE.BoxGeometry(0.12, 0.05, 0.08), mat, x, 0.035, 0.12);
            addPart(joint(0.05), jointMat, x, 0.09);
            buildBone = shins[leg];
            addPart(prism(0.05, 0.045, 0.4), jointMat, x, 0.3);
            octPart(prism(0.08, 0.06, 0.34, 8), mat, x, 0.32, 0, 0.85);
            addPart(joint(0.06), jointMat, x, 0.52);
            addPart(new THREE.BoxGeometry(0.09, 0.09, 0.04), mat, x, 0.53, 0.07).rotation.x = 0.2;
            buildBone = thighs[leg];
            octPart(prism(0.095, 0.07, 0.34, 8), mat, x, 0.72);
            addPart(joint(0.065), jointMat, 0.12 * side, 0.9);
            // 腰の横の装甲は裾を外へ開く
            buildBone = pelvis;
            addPart(new THREE.BoxGeometry(0.06, 0.14, 0.16), mat, 0.18 * side, 0.9).rotation.z = 0.15 * side;
        }
        // 腰と腹
        addPart(new THREE.BoxGeometry(0.3, 0.12, 0.18), jointMat, 0, 0.93);
        addPart(new THREE.BoxGeometry(0.1, 0.1, 0.04), mat, 0, 0.9, 0.09).rotation.x = -0.1;
        buildBone = spine;
        addPart(prism(0.1, 0.1, 0.14, 12), jointMat, 0, 1.05);
        octPart(prism(0.125, 0.115, 0.035, 8), mat, 0, 1.03, 0, 0.8);
        octPart(prism(0.135, 0.125, 0.035, 8), mat, 0, 1.075, 0, 0.8);
        // 胸: 上が広い八角の胴に、黒い胸の帯と襟、背中の箱と噴き出し口
        octPart(prism(0.25, 0.18, 0.4, 8), mat, 0, 1.31, 0, 0.72);
        addPart(new THREE.BoxGeometry(0.16, 0.05, 0.03), jointMat, 0, 1.4, 0.15).rotation.x = 0.12;
        octPart(prism(0.12, 0.16, 0.04, 8), jointMat, 0, 1.53, 0, 0.8);
        addPart(new THREE.BoxGeometry(0.24, 0.26, 0.08), mat, 0, 1.33, -0.17);
        for (const side of [-1, 1])
            addPart(prism(0.03, 0.035, 0.1), jointMat, 0.07 * side, 1.18, -0.19);
        buildBone = neck;
        addPart(prism(0.05, 0.06, 0.08), jointMat, 0, 1.55);
        // 頭: 八角のヘルメットに天板とあごを付け、目の高さに黒い帯を一周させる
        const headPart = (geo, mat, y, z = 0) => {
            const m = addPart(geo, mat, 0, y, z);
            m.rotation.y = Math.PI / 8; // 平らな面を正面へ
            m.scale.z = 1.08;
            return m;
        };
        headPart(prism(0.115, 0.125, 0.14, 8), mat, 1.7);
        headPart(prism(0.085, 0.115, 0.035, 8), mat, 1.787);
        headPart(prism(0.128, 0.128, 0.045, 8), jointMat, 1.715);
        headPart(prism(0.11, 0.075, 0.07, 8), mat, 1.6, 0.012);
        // 耳の丸い部品と、片側だけのアンテナ
        for (const side of [-1, 1]) {
            const ear = addPart(prism(0.042, 0.042, 0.03, 10), jointMat, 0.128 * side, 1.68);
            ear.rotation.z = Math.PI / 2;
        }
        addPart(prism(0.007, 0.012, 0.09, 6), jointMat, 0.13, 1.76).rotation.z = -0.15;
        // 腕: 肩を原点にした上腕と、肘を原点にした前腕の 2 本。どちらも -Y へ伸びる
        for (const side of [-1, 1]) {
            const arm = new THREE.Group();
            arm.position.set(0.27 * side, 1.47, 0).sub(gunRig.userData.origin);
            arm.rotation.z = 0.1 * side;
            gunRig.add(arm);
            arms.push(arm);
            addPart(joint(0.07), jointMat, 0, 0, 0, arm);
            // 肩当ては上をすぼめた八角で、外上向きに傾けてかぶせる
            octPart(prism(0.07, 0.1, 0.1, 8), mat, 0.02 * side, 0.04, 0, 1, arm).rotation.z = -0.35 * side;
            addPart(prism(0.05, 0.045, 0.26), jointMat, 0, -0.18, 0, arm);
            octPart(prism(0.065, 0.06, 0.16, 8), mat, 0, -0.15, 0, 1, arm);
            const forearm = new THREE.Group();
            forearm.position.set(0, -DUMMY_UPPER_ARM, 0);
            arm.add(forearm);
            forearms.push(forearm);
            addPart(joint(0.055), jointMat, 0, 0, 0, forearm);
            octPart(prism(0.075, 0.055, 0.28, 8), mat, 0, -0.16, 0, 1, forearm);
            addPart(prism(0.04, 0.04, 0.04), jointMat, 0, -0.315, 0, forearm);
            addPart(new THREE.BoxGeometry(0.06, 0.09, 0.08), jointMat, 0, -DUMMY_FOREARM, 0, forearm);
            addPart(new THREE.BoxGeometry(0.02, 0.05, 0.025), jointMat, -0.035 * side, -0.35, 0.03, forearm);
        }
    }
    return { root, shake, parts, mat, jointMat, mats: [mat, jointMat], arms, forearms, pelvis, spine, neck, gunRig, thighs, shins, feet };
}

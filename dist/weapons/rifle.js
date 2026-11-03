import * as THREE from 'three';
const BORE_Y = 0.016;
const RECEIVER_FRONT = -0.2;
const RECEIVER_BACK = 0.004;
const BARREL_FRONT = -0.8;
const SCOPE_Y = 0.07; // スコープの軸の高さ
export const RIFLE_MUZZLE = new THREE.Vector3(0, BORE_Y, BARREL_FRONT - 0.012);
const LEVER_PIVOT = new THREE.Vector3(0, -0.03, -0.075);
export const RIFLE_SCOPE_EYE = new THREE.Vector3(0, SCOPE_Y, 0.07); // 接眼レンズの後ろ（覗くときに目を置く位置）
// 横から見た輪郭 [z, y] を、左右に depth の厚みで押し出す（角は少し面取りする）
function sideSlab(outline, depth, mat, bevel = 0.003) {
    const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4,
    });
    geo.translate(0, 0, -(depth - bevel * 2) / 2);
    geo.rotateY(-Math.PI / 2); // 輪郭の x を Z 軸に、押し出しを X 軸に
    return new THREE.Mesh(geo, mat);
}
// Z 軸に沿った角柱（segments 角形）
function prism(rFront, rBack, len, segments, z, y, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, segments), mat);
    m.rotation.x = -Math.PI / 2; // 上面（rFront）を -Z へ
    m.position.set(0, y, z);
    return m;
}
// 銃床: 機関部の後ろから握りを下へ伸ばし、頬の当たる上の線を後ろへ寝かせて、床尾で縦に切る
const STOCK = [
    [RECEIVER_BACK - 0.002, 0.03], [0.05, 0.02], [0.13, 0.012], [0.33, 0.004], // 頬当ての線
    [0.338, -0.004], [0.348, -0.112], // 床尾
    [0.33, -0.12], [0.2, -0.088], [0.11, -0.066], // 下の線を握りへ戻す
    [0.085, -0.074], [0.07, -0.1], [0.04, -0.104], // 握りの尻
    [0.03, -0.07], [0.014, -0.03], [RECEIVER_BACK - 0.002, -0.022], // 握りの前
];
// 先台: 銃身の下を包む。先は斜めに落とす
const FOREND = [
    [RECEIVER_FRONT + 0.004, 0.012], [-0.5, 0.012], [-0.52, 0.004], [-0.5, -0.018], [-0.36, -0.026], [RECEIVER_FRONT + 0.004, -0.028],
];
// 機関部: 上は丸めず角を落とした箱、下は握りの前へ少し垂らして引き金の付け根にする
const RECEIVER = [
    [RECEIVER_FRONT, 0.032], [RECEIVER_BACK, 0.032], [RECEIVER_BACK, -0.022], [-0.02, -0.03], [-0.07, -0.03], [-0.12, -0.022], [RECEIVER_FRONT, -0.022],
];
// 銃口を -Z へ向けて組み立てる（原点は握る位置）
export function createRifle(mats) {
    const gun = new THREE.Group();
    // 部位には名前を付けておく（形を作り直すスキンが隠せるように。skins.ts の dressModel）
    const add = (o, name) => {
        if (name)
            o.name = name;
        gun.add(o);
        return o;
    };
    add(sideSlab(RECEIVER, 0.026, mats.metal, 0.002), 'receiver');
    // 排莢口: 右の側面に開いた窓
    const port = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.016), mats.lens);
    port.rotation.y = Math.PI / 2;
    port.position.set(0.0132, 0.016, -0.1);
    add(port);
    add(sideSlab(STOCK, 0.034, mats.stock, 0.004), 'stock');
    add(new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.12, 0.014), mats.trim), 'buttpad').position.set(0, -0.054, 0.348);
    gun.getObjectByName('buttpad').rotation.x = 0.07; // 床尾の傾きに合わせる
    add(sideSlab(FOREND, 0.032, mats.stock, 0.004), 'forend');
    // 銃身: 機関部から先へ細る八角の筒。先台の先にバンドを巻き、銃口に一回り太いリングを付ける
    const barrelLen = RECEIVER_FRONT - BARREL_FRONT;
    add(prism(0.0068, 0.0092, barrelLen, 8, (RECEIVER_FRONT + BARREL_FRONT) / 2, BORE_Y, mats.metal), 'barrel');
    add(prism(0.0102, 0.0102, 0.014, 8, -0.53, BORE_Y, mats.metal));
    add(prism(0.0082, 0.0082, 0.014, 8, BARREL_FRONT - 0.005, BORE_Y, mats.metal));
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.004, 8), mats.lens);
    bore.position.set(0, BORE_Y, BARREL_FRONT - 0.0122);
    bore.rotation.y = Math.PI;
    add(bore);
    const muzzle = new THREE.Object3D(); // マズルフラッシュを付ける所
    muzzle.position.copy(RIFLE_MUZZLE);
    add(muzzle);
    gun.userData.muzzle = muzzle;
    // 銃身の下の弾倉の筒（先台の先から出す）
    add(prism(0.0062, 0.0062, 0.2, 8, -0.62, BORE_Y - 0.016, mats.metal));
    add(prism(0.0075, 0.0075, 0.01, 8, -0.72, BORE_Y - 0.016, mats.metal));
    // 照星と照門: 銃口の手前に台を立てて先を明るくし、照門は機関部の前に低く
    add(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.022), mats.metal)).position.set(0, BORE_Y + 0.012, BARREL_FRONT + 0.025);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.007, 0.004), mats.trim), 'frontSight').position.set(0, BORE_Y + 0.021, BARREL_FRONT + 0.02);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.006), mats.metal)).position.set(0, BORE_Y + 0.012, -0.36);
    // レバー: 引き金の下から握りを囲む輪。前は引き金の付け根、後ろは握りに沿って下へ。
    // 撃つたびに前の付け根（LEVER_PIVOT）を軸に下へ振って戻す（weapons/viewModelMotion.ts）
    const lever = new THREE.Group();
    lever.name = 'lever';
    lever.position.copy(LEVER_PIVOT);
    const bar = (w, h, d, z, y, rx = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.metal);
        m.position.set(0, y, z).sub(LEVER_PIVOT);
        m.rotation.x = rx;
        lever.add(m);
    };
    bar(0.01, 0.006, 0.06, -0.045, -0.032); // 機関部の下に沿う根元
    bar(0.01, 0.05, 0.007, -0.08, -0.055, -0.15); // 輪の前
    bar(0.01, 0.006, 0.075, -0.035, -0.083, 0.12); // 輪の底
    bar(0.01, 0.04, 0.007, 0.012, -0.07, 0.5); // 輪の後ろ（握りに沿う）
    add(lever);
    gun.userData.lever = lever;
    // 引き金
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.006), mats.metal);
    trigger.position.set(0, -0.04, -0.025);
    trigger.rotation.x = 0.35;
    add(trigger, 'trigger');
    // 撃鉄: 機関部の後ろの上に小さく起こす
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.008), mats.metal);
    hammer.position.set(0, 0.034, RECEIVER_BACK - 0.004);
    hammer.rotation.x = -0.5;
    add(hammer, 'hammer');
    // スコープ: 細い筒の前に太い対物、後ろに接眼。上と右にダイヤル。2 つの台座で機関部に載せる
    const scope = new THREE.Group();
    scope.name = 'scope';
    const S = 10; // 断面の角の数
    scope.add(prism(0.0105, 0.0105, 0.2, S, -0.13, SCOPE_Y, mats.metal));
    scope.add(prism(0.0165, 0.0105, 0.035, S, -0.247, SCOPE_Y, mats.metal)); // 対物へ太る
    scope.add(prism(0.0165, 0.0165, 0.04, S, -0.284, SCOPE_Y, mats.metal));
    scope.add(prism(0.0105, 0.013, 0.025, S, -0.018, SCOPE_Y, mats.metal)); // 接眼へ太る
    scope.add(prism(0.0135, 0.0135, 0.05, S, 0.02, SCOPE_Y, mats.metal));
    scope.add(prism(0.0145, 0.0145, 0.008, S, 0.04, SCOPE_Y, mats.trim)); // 接眼の縁のゴム
    for (const [z, r] of [[-0.3045, 0.0145], [0.0455, 0.0115]]) {
        const lens = new THREE.Mesh(new THREE.CircleGeometry(r, S), mats.lens);
        lens.position.set(0, SCOPE_Y, z);
        if (z < 0)
            lens.rotation.y = Math.PI;
        scope.add(lens);
    }
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 8), mats.metal);
    turret.position.set(0, SCOPE_Y + 0.014, -0.12);
    scope.add(turret);
    const windage = turret.clone();
    windage.rotation.z = Math.PI / 2;
    windage.position.set(0.014, SCOPE_Y, -0.12);
    scope.add(windage);
    for (const z of [-0.07, -0.18]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.012, S), mats.trim);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, SCOPE_Y, z);
        scope.add(ring);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.012, SCOPE_Y - 0.032, 0.012), mats.trim);
        base.position.set(0, (SCOPE_Y + 0.032) / 2, z);
        scope.add(base);
    }
    add(scope);
    // 吊り環: 先台の下と銃床の下
    for (const [z, y] of [[-0.44, -0.027], [0.26, -0.104]]) {
        const swivel = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0016, 4, 8), mats.metal);
        swivel.rotation.y = Math.PI / 2;
        swivel.position.set(0, y - 0.007, z);
        add(swivel);
    }
    // 元の形の部品の一覧（形を丸ごと作り直すスキンが隠す。あとから足す込める弾や銃口の印は入れない）
    gun.userData.body = gun.children.filter((o) => o !== muzzle);
    return gun;
}
// 一人称での構え（カメラ基準）。右の腰だめで握り、銃口を照準の少し内側へ向ける
export const RIFLE_VIEW_MODEL_POS = new THREE.Vector3(0.13, -0.17, -0.2);
export const RIFLE_REST_ROT = new THREE.Euler(0.03, 0.05, 0);
// スピンコックで回す軸（レバーの輪の中、指を掛ける所）
export const RIFLE_SPIN_PIVOT = new THREE.Vector3(0, -0.062, -0.035);
// 手に持たせたライフル。userData.rest が構えの向き（撃つ・覗く動きはこの下に足す）。
// userData.spin はレバーの輪に掛けた指を軸に、銃を縦に回す（スピンコック）
export function createHeldRifle(mats) {
    const held = new THREE.Group();
    const rest = new THREE.Group();
    rest.rotation.copy(RIFLE_REST_ROT);
    held.add(rest);
    const spin = new THREE.Group();
    spin.position.copy(RIFLE_SPIN_PIVOT);
    rest.add(spin);
    const rifle = createRifle(mats);
    rifle.position.copy(RIFLE_SPIN_PIVOT).negate();
    spin.add(rifle);
    held.userData.rest = rest;
    held.userData.spin = spin;
    held.userData.rifle = rifle;
    return held;
}

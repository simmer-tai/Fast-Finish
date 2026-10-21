import * as THREE from 'three';
import { loftRings } from '../geometry.js';
// ---- 武器: 鎖鎌 ----
// 左右の手に 1 本ずつ持つ。片手で握る柄の先に小ぶりな鎌の刃。
// 柄は握りのすぐ上に継ぎ目があり、そこから上（刃・口金・柄の上半分 = 頭）が外れて飛ぶ。握りは手に残り、
// 柄の中に収めた鎖が、握りの先と外れた頭の付け根をつなぐ。組んでいる間は鎖は見えない
export const SICKLE_SHAFT_LEN = 0.4;
const GRIP_FROM_BUTT = 0.1; // 握る位置（= 原点）は柄尻からこれだけ上
const SHAFT_TOP = SICKLE_SHAFT_LEN - GRIP_FROM_BUTT;
const SHAFT_BUTT = -GRIP_FROM_BUTT;
const LINK_SIZE = 1.6; // 鎖の輪の大きさ（元の寸法に対する倍率）
const LINK_RADIUS = 0.008 * LINK_SIZE;
const LINK_TUBE = 0.0024 * LINK_SIZE;
export const CHAIN_LINK_PITCH = 0.017 * LINK_SIZE; // 鎖の輪 1 つぶんの長さ（隣の輪と噛み合う分だけ輪の外寸より短い）
export const CHAIN_LINKS = Math.round(1.36 / CHAIN_LINK_PITCH); // 約 1.4 m
export const JOINT_Y = 0.075; // 柄の継ぎ目（握る位置からの高さ）
const FERRULE_LEN = 0.012; // 継ぎ目の両側に付ける金具の長さ
// 一人称での構え（カメラ基準）。右手の鎌は画面の右下、左手の鎌はその鏡写し。
// 柄は上をわずかに内へ寄せて前へ傾けて立て、刃は前（奥）へ突き出して刃先が手前を向く
export const SICKLE_VIEW_MODEL_POS = new THREE.Vector3(0, -0.3, -0.42); // 左右の手の中間
const SICKLE_HAND_X = 0.32; // 中間から左右の手までの距離
function restQuat(side) {
    const up = new THREE.Vector3(-0.12 * side, 1, -0.25).normalize(); // 柄尻 → 刃の向き
    const fwd = new THREE.Vector3(-0.2 * side, 0, -1); // 真っすぐ奥だと刃が縮んで見えるので、少しだけ内側へ振る
    const bladeDir = fwd.addScaledVector(up, -fwd.dot(up)).normalize(); // 刃が張り出す向き = 柄に直交する前方
    const faceDir = new THREE.Vector3().crossVectors(bladeDir, up);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bladeDir, up, faceDir));
}
// +Y 方向が刃の側になるよう組み立てる（原点は手で握る位置）。
// 刃は +X へ張り出して柄の方へ曲がり込み、刃先（切る側）は内側 = 柄の方を向く。
// headOnly なら外れて飛ぶ頭だけを作る（原点は同じく、組んでいれば手で握る位置）
export function createChainSickle(mats, headOnly = false) {
    const g = new THREE.Group();
    const head = new THREE.Group();
    g.add(head);
    // 柄: わずかに柄尻へ太くなる八角柱を、継ぎ目で上下に分ける
    const shaftPiece = (y0, y1) => {
        const r = (y) => 0.012 + 0.001 * (SHAFT_TOP - y) / SICKLE_SHAFT_LEN;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r(y1), r(y0), y1 - y0, 8), mats.shaft);
        m.scale.set(1, 1, 0.85);
        m.position.y = (y0 + y1) / 2;
        return m;
    };
    head.add(shaftPiece(JOINT_Y + FERRULE_LEN, SHAFT_TOP));
    // 継ぎ目の金具: 頭の側を一回り太くして、外れる所だと分かるようにする
    const headFerrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0148, 0.0148, FERRULE_LEN, 8), mats.metal);
    headFerrule.position.y = JOINT_Y + FERRULE_LEN / 2;
    head.add(headFerrule);
    // 口金: 柄の先で刃の根元をくわえる六角の金具と、その上の小さな尖り
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.0175, 0.06, 6), mats.metal);
    socket.position.y = SHAFT_TOP - 0.015;
    head.add(socket);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 6), mats.metal);
    cap.position.y = SHAFT_TOP + 0.015 + 0.015;
    head.add(cap);
    // 刃: 根元は真横へ出て、先へ行くほど柄の方へ強く曲がる。断面は剣と同じく棟が平らで刃先が薄い
    const BLADE_LEN = 0.2;
    const BEND = 1.2; // 先端での曲がり込み (rad)
    const W = 0.044;
    const T = 0.008;
    const N = 12;
    const rings = [];
    const p = new THREE.Vector3(0.006, SHAFT_TOP - 0.012, 0);
    const d = new THREE.Vector3();
    const n = new THREE.Vector3();
    const angle = (s) => -BEND * s * s;
    const bladeMid = new THREE.Vector3(); // 刃の中ほど（軌跡の根元側に使う）
    let spineR = 0; // 握りから棟までのいちばん遠い距離
    for (let i = 0; i <= N; i++) {
        const s = i / N;
        if (i > 0) {
            const mid = angle(s - 0.5 / N);
            p.x += Math.cos(mid) * BLADE_LEN / N;
            p.y += Math.sin(mid) * BLADE_LEN / N;
        }
        if (i === N / 2)
            bladeMid.copy(p);
        const th = angle(s);
        d.set(Math.cos(th), Math.sin(th), 0);
        n.set(d.y, -d.x, 0); // 曲がりの内側 = 刃先の向き
        if (i === N) {
            // 切っ先: 棟寄りに尖らせる
            rings.push([p.clone().addScaledVector(n, -W * 0.15)]);
            break;
        }
        const w = W * (1 - 0.5 * s);
        const t = T * (1 - 0.3 * s);
        const at = (a, z) => p.clone().addScaledVector(n, a).setZ(z);
        spineR = Math.max(spineR, Math.hypot(p.x - n.x * w / 2, p.y - n.y * w / 2));
        rings.push([
            at(-w / 2, t * 0.35),
            at(-w * 0.1, t / 2),
            at(w / 2, 0),
            at(-w * 0.1, -t / 2),
            at(-w / 2, -t * 0.35),
        ]);
    }
    head.add(new THREE.Mesh(loftRings(rings), mats.metal));
    // 握り: 柄の下半分と巻き、継ぎ目の金具（鎖の出口）、六角の石突き
    const grip = new THREE.Group();
    if (!headOnly) {
        g.add(grip);
        grip.add(shaftPiece(SHAFT_BUTT, JOINT_Y - FERRULE_LEN));
        const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.12, 8), mats.wrap);
        wrap.scale.set(1, 1, 0.85);
        grip.add(wrap);
        const gripFerrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0138, 0.0138, FERRULE_LEN, 8), mats.metal);
        gripFerrule.position.y = JOINT_Y - FERRULE_LEN / 2;
        grip.add(gripFerrule);
        const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.014, 0.02, 6), mats.metal);
        butt.position.y = SHAFT_BUTT - 0.008;
        grip.add(butt);
    }
    g.userData.bladeTip = p.clone();
    g.userData.bladeMid = bladeMid;
    // 軌跡の帯: 刃は握りを中心にほぼ同じ半径の円に沿って曲がっていて、振ると刃に沿う向きへ進む。
    // 刃の根元 → 刃先で帯を張ると帯が進む向きに寝て潰れるので、刃先の所で握りからの向き（振りの半径の向き）に張る。
    // 外側は棟の円に揃え、内側は刃の内へ少し食い込ませて三日月形に残す
    const radial = new THREE.Vector3(p.x, p.y, 0).normalize();
    g.userData.trailOuter = radial.clone().multiplyScalar(spineR);
    g.userData.trailInner = radial.clone().multiplyScalar(spineR * 0.72);
    g.userData.capTip = SHAFT_TOP + 0.045; // 柄の先の尖りの先端（原点からの高さ）
    g.userData.chainAnchor = new THREE.Vector3(0, JOINT_Y, 0); // 鎖が付く所: 頭の付け根 = 握りの先（継ぎ目の中心）
    g.userData.head = head;
    g.userData.grip = grip;
    return g;
}
// 一人称で持った 1 本: side = 1 で右手、-1 で左手。返す Group の原点が SICKLE_VIEW_MODEL_POS にあたる。
// 振りかぶって頭を回す間だけ、握りの先から頭まで短い鎖を見せる（普段は柄の中に収まっていて見えない）
export function createHeldSickle(mats, side) {
    const held = new THREE.Group();
    held.position.x = SICKLE_HAND_X * side;
    const rest = new THREE.Group();
    rest.quaternion.copy(restQuat(side));
    held.add(rest);
    const sickle = createChainSickle(mats);
    rest.add(sickle);
    const chain = createChain(mats.metal, false);
    chain.visible = false;
    held.add(chain);
    held.userData.rest = rest;
    held.userData.sickle = sickle;
    held.userData.chain = chain;
    return held;
}
// 鎖: 楕円の輪を CHAIN_LINKS 個（withWeight なら先端に分銅）。並べ方は layChain で決める
export function createChain(mat, withWeight = true) {
    const chain = new THREE.Group();
    const linkGeo = new THREE.TorusGeometry(LINK_RADIUS, LINK_TUBE, 5, 10);
    linkGeo.scale(0.7, 1.15, 1); // 鎖の向き (+Y) に長い楕円
    const links = [];
    for (let i = 0; i < CHAIN_LINKS; i++) {
        const link = new THREE.Mesh(linkGeo, mat);
        chain.add(link);
        links.push(link);
    }
    // 分銅: 鎖の先に付ける六角柱の重り。+Y の端に鎖を掛ける小さな環
    const weight = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.05, 6), mat);
    body.position.y = -0.033;
    weight.add(body);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0022, 5, 10), mat);
    eye.position.y = -0.004;
    eye.rotation.y = Math.PI / 2;
    weight.add(eye);
    if (withWeight)
        chain.add(weight);
    chain.userData.links = links;
    chain.userData.weight = withWeight ? weight : null;
    return chain;
}
// 投げた鎌から手元まで伸びる長い鎖。輪が数千になるので、1 つの InstancedMesh にまとめて描く
const longLinkGeo = new THREE.TorusGeometry(LINK_RADIUS, LINK_TUBE, 4, 8);
longLinkGeo.scale(0.7, 1.15, 1);
export function createLongChain(mat, maxLength) {
    const chain = new THREE.InstancedMesh(longLinkGeo, mat, Math.ceil(maxLength / CHAIN_LINK_PITCH));
    chain.count = 0;
    chain.frustumCulled = false; // 毎フレーム並べ直すので、包む球を計算し直さずに常に描く
    return chain;
}
// from から to まで輪を並べる。bend を渡すと、両端を結ぶ直線上の点（t = 0〜1）を out に受け取って、
// そこからずらす（波打たせる・震わせる）
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
export function layLongChain(chain, from, to, bend) {
    const len = from.distanceTo(to);
    const n = Math.min(chain.instanceMatrix.count, Math.max(1, Math.ceil(len / CHAIN_LINK_PITCH)));
    const at = (t, out) => {
        out.lerpVectors(from, to, t);
        bend?.(t, out);
    };
    for (let i = 0; i < n; i++) {
        at(i / n, _a);
        at((i + 1) / n, _b);
        _seg.subVectors(_b, _a).normalize();
        _q.setFromUnitVectors(_UP, _seg);
        if (i % 2)
            _q.multiply(_twist);
        _p.lerpVectors(_a, _b, 0.5);
        chain.setMatrixAt(i, _m.compose(_p, _q, _one));
    }
    chain.count = n;
    chain.instanceMatrix.needsUpdate = true;
}
// 折れ線 points（鎖の付け根から先へ）に沿って、輪を等間隔に並べる。
// 輪は 1 つおきに 90° ひねって噛み合わせ、最後に分銅を付ける。折れ線より先へはみ出す輪と分銅は隠す（手の中に握り込んだ分）
const _q = new THREE.Quaternion();
const _twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const _seg = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
export function layChain(chain, points) {
    const links = chain.userData.links;
    const weight = chain.userData.weight;
    let seg = 0;
    let segStart = 0; // 今の区間が始まる弧長
    let total = 0;
    for (let i = 0; i < points.length - 1; i++)
        total += points[i].distanceTo(points[i + 1]);
    const pointAt = (len, out) => {
        while (seg < points.length - 2 && segStart + points[seg].distanceTo(points[seg + 1]) < len) {
            segStart += points[seg].distanceTo(points[seg + 1]);
            seg++;
        }
        const segLen = points[seg].distanceTo(points[seg + 1]);
        return out.lerpVectors(points[seg], points[seg + 1], segLen > 0 ? (len - segStart) / segLen : 0);
    };
    for (let i = 0; i <= links.length; i++) {
        pointAt(i * CHAIN_LINK_PITCH, _a);
        pointAt((i + 1) * CHAIN_LINK_PITCH, _b);
        // 輪のローカル -Y が鎖の先へ向くようにする
        _seg.subVectors(_a, _b).normalize();
        _q.setFromUnitVectors(_UP, _seg);
        const inside = i * CHAIN_LINK_PITCH <= total + 1e-4;
        if (i < links.length) {
            const link = links[i];
            link.visible = inside;
            link.position.lerpVectors(_a, _b, 0.5);
            link.quaternion.copy(_q);
            if (i % 2)
                link.quaternion.multiply(_twist);
        }
        else if (weight) {
            weight.visible = inside;
            weight.position.copy(_a);
            weight.quaternion.copy(_q);
        }
    }
}

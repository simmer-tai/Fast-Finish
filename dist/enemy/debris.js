import * as THREE from 'three';
import { env } from './env.js?v=2fb05089';
import { en } from './state.js?v=2fb05089';
import { floorAt } from '../world/blocks.js?v=2fb05089';
import { rand } from '../random.js?v=2fb05089';
import { options } from '../ui/options.js?v=2fb05089';
import { player, position, velocity } from '../player/state.js?v=2fb05089';
// ---- 倒したときにバラバラになる体 ----
// 骨ごと（頭・胸・腰・上腕・前腕・太もも・すね・足）と銃を 1 つの塊にして、倒した瞬間の姿勢のまま写し取って飛ばす。
// 部品のジオメトリとマテリアルは本体と共有する（とどめの白い光りもそのまま乗る）。
// 敵が起き上がるときは、部品を残骸として場に残す（ステージを出るまで）。残骸は光らない複製のマテリアルに替え、
// 画質ごとの数（REMAINS_LIMIT）を超えたら古いものから縮んで消える
export const DEBRIS_GRAVITY = 18;
export const DEBRIS_BOUNCE = 0.3;
const REMAINS_LIMIT = { low: 120, medium: 240, high: 420 };
const REMAINS_SHRINK = 0.4; // 数を超えて消すときに縮む時間
// 歩いて残骸を蹴る。足もとからこの距離（と部品の大きさ）に入った部品を、プレイヤーの速さに掛けた速さで蹴る
const KICK_REACH = 0.3;
const KICK_SPEED = 0.75;
const KICK_UP = 1.4;
const KICK_MIN_SPEED = 1; // これより遅く歩いていれば蹴らない
// ダッシュ・スライディングで突っ込むと、広い範囲の部品を進む向きへ跳ね飛ばし、進路の外へも散らす
const RAM_REACH = 0.7;
const RAM_SPEED = 1.15;
const RAM_SIDE = 3;
const RAM_UP = [2.5, 5];
const REMAINS_CHECK = 24; // 止まった残骸の足もとを確かめる数（1 フレームあたり。電車が去ったら落とす）
export const debrisBox = new THREE.Box3();
export const debrisSize = new THREE.Vector3();
export const debrisInv = new THREE.Matrix4();
export const debrisRot = new THREE.Quaternion();
export const DEBRIS_LAUNCH_GRAVITY = 0.65; // かっ飛ばした部品の重力の倍率（滞空を長く見せる）
export const DEBRIS_LAUNCH_BOUNCE = 0.5;
export const debrisPush = new THREE.Vector3();
export function breakDummy(dir, style = 'normal', swing) {
    leaveDebris();
    const heavy = style === 'heavy';
    const launch = style === 'launch';
    const headshot = style === 'headshot';
    debrisPush.copy(dir);
    if (swing && swing.lengthSq() > 1e-6) {
        debrisPush.addScaledVector(swing.clone().normalize(), launch ? 1 : heavy ? 0.7 : 0.5);
        debrisPush.y = 0; // 叩きつけで下へ振っても、床へ潜らせず前へ飛ばす
        if (debrisPush.lengthSq() < 1e-6)
            debrisPush.copy(dir);
        debrisPush.normalize();
    }
    en.root.updateMatrixWorld(true);
    // 部品を、いちばん近い塊の根元ごとに分ける
    const groups = new Map();
    en.root.traverse((o) => {
        if (!o.isMesh)
            return;
        let root = o.parent;
        while (root && !en.debrisRootSet.has(root))
            root = root.parent;
        if (!root)
            return;
        let list = groups.get(root);
        if (!list)
            groups.set(root, (list = []));
        list.push(o);
    });
    for (const [root, meshes] of groups) {
        // 塊の中心を回転の中心にする（骨の原点は関節なので、そのまま回すと振り子のように見える）
        debrisBox.makeEmpty();
        for (const m of meshes)
            debrisBox.expandByObject(m);
        const obj = new THREE.Group();
        debrisBox.getCenter(obj.position);
        root.getWorldQuaternion(obj.quaternion);
        obj.updateMatrixWorld();
        debrisInv.copy(obj.matrixWorld).invert();
        for (const m of meshes) {
            const c = new THREE.Mesh(m.geometry, m.material);
            c.matrix.multiplyMatrices(debrisInv, m.matrixWorld).decompose(c.position, c.quaternion, c.scale);
            obj.add(c);
        }
        env.scene.add(obj);
        debrisBox.getSize(debrisSize);
        // 体の中心から外へ、攻撃の向きへ押し出し、上へ跳ね上げる
        const vel = new THREE.Vector3(obj.position.x - en.root.position.x, 0, obj.position.z - en.root.position.z);
        if (vel.lengthSq() < 1e-6)
            vel.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        const head = headshot && root === en.neck;
        if (head) {
            vel.copy(debrisPush).multiplyScalar(rand(16, 22));
            vel.y = rand(4.5, 6.5);
        }
        else if (headshot) {
            vel.normalize().multiplyScalar(rand(0.3, 1)).addScaledVector(debrisPush, rand(0.5, 1.5));
            vel.y = rand(0, 1.5);
        }
        else if (launch) {
            vel.normalize().multiplyScalar(rand(2, 5)).addScaledVector(debrisPush, rand(11, 17));
            vel.y = rand(6, 10) + (obj.position.y - en.root.position.y) * 1.5;
        }
        else if (heavy) {
            vel.normalize().multiplyScalar(rand(0.4, 1.2)).addScaledVector(debrisPush, rand(6, 10));
            vel.y = Math.max(vel.y, 0) + rand(1.5, 3.5) + (obj.position.y - en.root.position.y) * 0.6;
        }
        else {
            vel.normalize().multiplyScalar(rand(1.5, 3.5)).addScaledVector(debrisPush, rand(3.5, 5.5));
            vel.y = rand(2, 5.5) + (obj.position.y - en.root.position.y) * 1.2; // 上の部品ほど高く飛ぶ
        }
        en.debris.push({
            obj,
            vel,
            axis: new THREE.Vector3().randomDirection(),
            spin: (head ? rand(28, 38) : launch ? rand(14, 26) : headshot ? rand(2, 6) : rand(6, 16)) * (Math.random() < 0.5 ? -1 : 1),
            radius: Math.min(debrisSize.x, debrisSize.y, debrisSize.z) * 0.5,
            gravity: launch || head ? DEBRIS_GRAVITY * DEBRIS_LAUNCH_GRAVITY : DEBRIS_GRAVITY,
            bounce: launch || head ? DEBRIS_LAUNCH_BOUNCE : DEBRIS_BOUNCE,
        });
    }
}
const remains = [];
let checkAt = 0;
// 光らない残骸用のマテリアル（元のマテリアルごとに 1 つ作って使い回す）
const restMats = new WeakMap();
function restMat(m) {
    let r = restMats.get(m);
    if (!r) {
        r = m.clone();
        if (r.emissive)
            r.emissiveIntensity = 0;
        restMats.set(m, r);
    }
    return r;
}
// en の部品を残骸として場に残し、en からは外す（起き上がるとき・次に砕けるとき・体を作り替えるとき）
export function leaveDebris() {
    for (const d of en.debris) {
        d.obj.traverse((o) => {
            const m = o;
            if (m.isMesh)
                m.material = restMat(m.material);
        });
        remains.push({ ...d, resting: false, shrink: -1 });
    }
    en.debris.length = 0;
    const over = remains.length - REMAINS_LIMIT[options.quality];
    for (let i = 0, n = 0; i < remains.length && n < over; i++) {
        if (remains[i].shrink >= 0)
            continue;
        remains[i].shrink = 0;
        n++;
    }
}
// 残骸を全部片付ける（ステージへ入るとき）
export function clearRemains() {
    for (const d of remains)
        d.obj.removeFromParent();
    remains.length = 0;
}
// 1 つの部品を落として、床で跳ねさせる。床に着いていれば true
function stepDebris(d, dt) {
    const p = d.obj.position;
    d.vel.y -= d.gravity * dt;
    p.addScaledVector(d.vel, dt);
    d.obj.quaternion.premultiply(debrisRot.setFromAxisAngle(d.axis, d.spin * dt));
    // 床で跳ねて、転がりながら止まる
    const floor = floorAt(p.x, p.z, p.y) + d.radius;
    if (p.y >= floor)
        return false;
    p.y = floor;
    if (d.vel.y < 0)
        d.vel.y *= -d.bounce;
    if (d.vel.y < 0.5)
        d.vel.y = 0;
    d.vel.x *= 0.7;
    d.vel.z *= 0.7;
    d.spin *= 0.6;
    return true;
}
export function updateDebris(dt) {
    for (const d of en.debris)
        stepDebris(d, dt);
}
const side = new THREE.Vector3();
// 歩いて・走って・ダッシュで、足もとの残骸を動かす
function kickRemains() {
    const pv = Math.hypot(velocity.x, velocity.z);
    const ram = player.dashTime > 0 || player.sliding;
    if (pv < KICK_MIN_SPEED || (!ram && !player.onGround))
        return;
    const fx = velocity.x / pv;
    const fz = velocity.z / pv;
    for (const d of remains) {
        if (d.shrink >= 0)
            continue;
        const p = d.obj.position;
        // 歩きは足もとの高さだけ、ダッシュは体の高さまで
        if (p.y - d.radius > position.y + (ram ? 1.2 : 0.35) || p.y + d.radius < position.y - 0.3)
            continue;
        const reach = (ram ? RAM_REACH : KICK_REACH) + d.radius;
        const dx = p.x - position.x;
        const dz = p.z - position.z;
        if (dx * dx + dz * dz > reach * reach)
            continue;
        // もう進む向きへ十分速く飛んでいる部品には足さない（触れている間ずっと速くしない）
        const ahead = d.vel.x * fx + d.vel.z * fz;
        if (ahead > pv * (ram ? 0.9 : 0.5))
            continue;
        if (ram) {
            // 進路の左右どちらにあるかで、外へ散らす
            side.set(-fz, 0, fx);
            const s = Math.sign(dx * side.x + dz * side.z) || (Math.random() < 0.5 ? -1 : 1);
            d.vel.set(velocity.x * RAM_SPEED * rand(0.8, 1.2) + side.x * s * RAM_SIDE * rand(0.5, 1.2), rand(RAM_UP[0], RAM_UP[1]), velocity.z * RAM_SPEED * rand(0.8, 1.2) + side.z * s * RAM_SIDE * rand(0.5, 1.2));
            d.spin = rand(12, 22) * (Math.random() < 0.5 ? -1 : 1);
        }
        else {
            d.vel.set(velocity.x * KICK_SPEED * rand(0.8, 1.2), KICK_UP + 0.1 * pv, velocity.z * KICK_SPEED * rand(0.8, 1.2));
            d.spin = rand(5, 10) * (Math.random() < 0.5 ? -1 : 1);
        }
        d.axis.randomDirection();
        d.resting = false;
    }
}
export function updateRemains(dt) {
    if (dt <= 0)
        return;
    kickRemains();
    for (let i = remains.length - 1; i >= 0; i--) {
        const d = remains[i];
        if (d.shrink >= 0) {
            d.shrink += dt;
            d.obj.scale.setScalar(Math.max(0.001, 1 - d.shrink / REMAINS_SHRINK));
            if (d.shrink >= REMAINS_SHRINK) {
                d.obj.removeFromParent();
                remains.splice(i, 1);
                continue;
            }
        }
        if (d.resting)
            continue;
        // 床の上でほとんど動かなくなったら止める
        if (stepDebris(d, dt) && d.vel.y === 0 && Math.hypot(d.vel.x, d.vel.z) < 0.02 && Math.abs(d.spin) < 0.05)
            d.resting = true;
    }
    // 止まった残骸の足もとが無くなっていたら（乗っていた電車が去ったなど）、また落とす
    for (let k = 0; k < REMAINS_CHECK && remains.length > 0; k++) {
        const d = remains[checkAt++ % remains.length];
        const p = d.obj.position;
        if (d.resting && floorAt(p.x, p.z, p.y) + d.radius < p.y - 0.02)
            d.resting = false;
    }
}

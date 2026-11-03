import * as THREE from 'three';
import { camera, scene } from '../core.js?v=6b2d2aee';
import { floorAt } from '../world/blocks.js?v=6b2d2aee';
import { weaponMats } from '../weapons/viewModels.js?v=6b2d2aee';
// -- ライフルの命中で散る金色の破片 --
// 頂点をゆがませた多面体を何種類か作り、1 個ずつ縦横の比も変えて形をばらつかせる。
// 光と映り込みを受ける金属で描くので、ライト付きの本体のシーンに置く
const VARIANTS = 8;
const PER_VARIANT = 48;
const GRAVITY = 18;
const DRAG = 2.2;
const BOUNCE = 0.35;
const GOLDS = [0xffc84a, 0xf0a535, 0xffdc8a, 0xd8922a].map((c) => new THREE.Color(c));
const rand = (a, b) => a + Math.random() * (b - a);
// 元の多面体の頂点を、同じ位置のものは同じだけずらして（面が割れないように）ゆがませ、薄い板・細い棘・塊のどれかに伸ばす
function makeGeo(i) {
    const base = i % 3 === 0 ? new THREE.TetrahedronGeometry(1) : i % 3 === 1 ? new THREE.OctahedronGeometry(1) : new THREE.IcosahedronGeometry(1, 0);
    const pos = base.getAttribute('position');
    const moved = new Map();
    const shape = i % 4; // 0: 板 1: 棘 2, 3: 塊
    const stretch = shape === 0 ? new THREE.Vector3(1.2, 1, 0.22) : shape === 1 ? new THREE.Vector3(2.2, 0.35, 0.3) : new THREE.Vector3(1, 0.8, 0.7);
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k);
        const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
        let to = moved.get(key);
        if (!to) {
            to = v.clone().multiplyScalar(rand(0.55, 1.15)).add(new THREE.Vector3(rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2))).multiply(stretch);
            moved.set(key, to);
        }
        pos.setXYZ(k, to.x, to.y, to.z);
    }
    base.computeVertexNormals(); // 面ごとの法線になるので、角の立った面で光る
    return base;
}
let mat = null;
const meshes = [];
// 武器のマテリアルの映り込みを借りるので、最初に散らすときに作る
function setup() {
    mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, // 色はインスタンスごとの金色で付ける
        metalness: 1,
        roughness: 0.22,
        envMap: weaponMats.brass.envMap,
        envMapIntensity: 1.6,
        emissive: 0x2a1800, // 暗い所でも黒く沈まないよう、わずかに自分で光らせる
        flatShading: true,
    });
    for (let i = 0; i < VARIANTS; i++) {
        const mesh = new THREE.InstancedMesh(makeGeo(i), mat, PER_VARIANT);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let k = 0; k < PER_VARIANT; k++)
            mesh.setColorAt(k, GOLDS[0]);
        mesh.count = 0;
        mesh.frustumCulled = false;
        scene.add(mesh);
        meshes.push(mesh);
    }
}
const shards = [];
const pool = [];
// 当たった面から撃った側へ跳ね返るように散らす（奥へ飛ばすと敵の体に隠れる）。size は 1 個の大きさの倍率
export function spawnGold(at, dir, count, size) {
    if (!mat)
        setup();
    for (let i = 0; i < count; i++) {
        if (shards.length >= VARIANTS * PER_VARIANT)
            pool.push(shards.shift());
        const s = pool.pop() ?? {
            variant: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), axis: new THREE.Vector3(),
            spin: 0, scale: new THREE.Vector3(), color: new THREE.Color(), age: 0, life: 0,
        };
        s.variant = Math.floor(Math.random() * VARIANTS);
        s.pos.copy(at).addScaledVector(dir, -0.12);
        s.vel.randomDirection().addScaledVector(dir, -0.7);
        s.vel.y += 0.5;
        s.vel.normalize().multiplyScalar(rand(3, 10));
        s.quat.setFromAxisAngle(s.axis.randomDirection(), Math.random() * Math.PI * 2);
        s.axis.randomDirection();
        s.spin = rand(8, 26) * (Math.random() < 0.5 ? -1 : 1);
        // 小さいものを多く、ときどき大きいもの
        const r = (0.018 + Math.random() ** 2.5 * 0.06) * size;
        s.scale.set(r * rand(0.7, 1.4), r * rand(0.7, 1.4), r * rand(0.7, 1.4));
        s.color.copy(GOLDS[Math.floor(Math.random() * GOLDS.length)]);
        s.age = 0;
        s.life = rand(0.7, 1.3);
        shards.push(s);
    }
}
const rot = new THREE.Quaternion();
const m = new THREE.Matrix4();
const sc = new THREE.Vector3();
export function updateGoldShards(dt) {
    if (!mat)
        return;
    for (const mesh of meshes)
        mesh.count = 0;
    const drag = Math.max(0, 1 - DRAG * dt);
    let n = 0;
    for (let i = 0; i < shards.length; i++) {
        const s = shards[i];
        s.age += dt;
        if (s.age >= s.life) {
            pool.push(s);
            continue;
        }
        s.vel.y -= GRAVITY * dt;
        s.vel.multiplyScalar(drag);
        s.pos.addScaledVector(s.vel, dt);
        const floor = floorAt(s.pos.x, s.pos.z, s.pos.y + 0.05);
        if (s.pos.y < floor && s.vel.y < 0) {
            s.pos.y = floor;
            s.vel.y *= -BOUNCE;
            s.vel.x *= 0.6;
            s.vel.z *= 0.6;
            s.spin *= 0.5;
        }
        s.quat.premultiply(rot.setFromAxisAngle(s.axis, s.spin * dt));
        shards[n++] = s;
        // 最後の 3 割で縮んで消える。目の前に来たものは大きく映りすぎるので縮める
        const k = Math.min(1, (1 - s.age / s.life) / 0.3);
        const near = THREE.MathUtils.smoothstep(s.pos.distanceTo(camera.position), 0.5, 1.0);
        const mesh = meshes[s.variant];
        m.compose(s.pos, s.quat, sc.copy(s.scale).multiplyScalar(k * near));
        mesh.setMatrixAt(mesh.count, m);
        mesh.setColorAt(mesh.count, s.color);
        mesh.count++;
    }
    shards.length = n;
    for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
    }
}

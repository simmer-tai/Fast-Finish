import * as THREE from 'three';
import * as sfx from '../audio.js';
import { camera, scene } from '../core.js';
import { weaponMats } from '../weapons/viewModels.js';
import { MUZZLE_FLASH_LIFE, tracerGeo } from '../weapons/handgunCombat.js';
import { ENEMY_HIT_RECOVER, RESPAWN_RISE_TIME, en } from './state.js';
import { ENEMY_LEAN_LIMIT, ENEMY_STAGGER_LIMIT, aimTarget, enemyBullets, enemyTracerMat, reachHands, updateDummyAim, } from './fire.js';
import { castWorld } from '../world/raycast.js';
import { game } from '../game/state.js';
// ---- 狙撃手 ----
// 長いライフルを肩付けで構え、出た所から動かない。高い所や遠い所に出て、見通しの良い場所ほど怖い（駅の主役）。
// プレイヤーが見えたら赤い照準線を出して狙いを追い（溜め）、撃つ少し前に線を止めて点滅させる（ロック）。
// ロックの後は狙いを動かさないので、線が止まったのを見て横へ動けばかわせる。弾は速く重い。パリィでも弾き返せる。
// 溜めている最中に当てられると、狙い直しになる
export const SNIPER_HP = 50;
export const SNIPER_FIRST = 1.6; // 現れてから最初に狙い始めるまで
export const SNIPER_REST_MIN = 2.4; // 撃ってから次に狙い始めるまで
export const SNIPER_REST_MAX = 3.4;
export const SNIPER_RETRY = 1; // 溜めを崩されてから狙い直すまで
export const SNIPER_CHARGE = 1.9; // 狙い始めてから撃つまで
export const SNIPER_LOCK = 0.45; // 撃つこの時間前に狙いを止める
export const SNIPER_RANGE = 160;
export const SNIPER_BULLET_SPEED = 160; // m/s。銃撃役の 4 倍。ロックを見てからでは弾は避けられない
export const SNIPER_DAMAGE = 34;
export const SNIPER_TRACER_LEN = 8;
export const SNIPER_TRACER_WIDTH = 0.045;
export const SNIPER_RECOIL = 6;
export const SNIPER_FLASH_SCALE = 3;
export const SNIPER_SPAWN_NEAR = 22; // これより遠い所から出す
const LASER_PLAYER_RADIUS = 0.5; // 照準線がプレイヤーの胸のこの近くを通ったら、そこで止めて見せる
const sniperFrom = new THREE.Vector3();
const sniperFwd = new THREE.Vector3();
const sniperTo = new THREE.Vector3();
const sniperChest = new THREE.Vector3();
const sniperPan = new THREE.Vector3();
const LASER_COLOR = 0xff1a1a;
export const sniperLocked = () => en.charge >= SNIPER_CHARGE - SNIPER_LOCK;
// 狙う向きを追う。ロックしてからは動かさない
export function updateSniperAim(dt) {
    if (!sniperLocked())
        updateDummyAim(dt);
}
export function resetSniper() {
    en.charge = -1;
    en.cooldown = SNIPER_FIRST;
    if (en.laser)
        en.laser.visible = false;
}
// 敵のいる向きの左右と距離から、音の大きさと左右を決める（前後は分からないので、真横でも振りきらない）
function sniperSound(dist) {
    camera.updateMatrixWorld();
    sniperPan.copy(en.root.position).applyMatrix4(camera.matrixWorldInverse);
    const pan = THREE.MathUtils.clamp(sniperPan.x / Math.max(Math.hypot(sniperPan.x, sniperPan.z), 1e-3), -1, 1) * 0.8;
    return { volume: THREE.MathUtils.clamp(8 / Math.max(dist, 1), 0.35, 1), pan };
}
function readMuzzle() {
    en.muzzle.updateWorldMatrix(true, false);
    sniperFrom.setFromMatrixPosition(en.muzzle.matrixWorld);
    sniperFwd.set(0, 0, -1).transformDirection(en.muzzle.matrixWorld); // 銃口は -Z
}
export function updateSniperFire(dt) {
    en.flashAge += dt;
    en.muzzleFx.visible = en.flashAge < MUZZLE_FLASH_LIFE;
    const canAim = en.alive && game.playerHp > 0 && en.riseTime >= RESPAWN_RISE_TIME && en.flashT >= ENEMY_HIT_RECOVER && en.airY <= 0;
    const steady = Math.abs(en.gunSpring.x.x) <= ENEMY_STAGGER_LIMIT && en.leanSpring.x.length() <= ENEMY_LEAN_LIMIT;
    if (en.charge >= 0 && (!canAim || !steady)) {
        // 溜めを崩された
        en.charge = -1;
        en.cooldown = Math.max(en.cooldown, SNIPER_RETRY);
    }
    const braceWant = en.charge >= 0 ? 1 : 0;
    en.brace += (braceWant - en.brace) * Math.min(1, dt * (braceWant > en.brace ? 6 : 3));
    if (en.charge < 0) {
        en.cooldown -= dt;
        if (canAim && steady && en.cooldown <= 0) {
            readMuzzle();
            sniperTo.subVectors(aimTarget(sniperChest), sniperFrom);
            const dist = sniperTo.length();
            // 見えている間だけ狙い始める（柱の陰に隠れている間は待つ）
            if (dist < SNIPER_RANGE && castWorld(sniperFrom, sniperTo.divideScalar(dist), dist) >= dist) {
                en.charge = 0;
                const s = sniperSound(dist);
                sfx.playSniperAim(s.volume, s.pan);
            }
        }
    }
    else {
        const wasLocked = sniperLocked();
        en.charge += dt;
        if (!wasLocked && sniperLocked())
            sfx.playSniperLock(sniperSound(en.root.position.distanceTo(camera.position)).volume);
        if (en.charge >= SNIPER_CHARGE)
            fireSniper();
    }
    updateLaser();
}
// 銃口の向きへ撃つ（ロックした所へ飛ぶ）
function fireSniper() {
    readMuzzle();
    const mesh = new THREE.Mesh(tracerGeo, enemyTracerMat);
    mesh.frustumCulled = false;
    mesh.visible = false; // 尾が伸びるまで出さない
    scene.add(mesh);
    enemyBullets.push({
        pos: sniperFrom.clone(), dir: sniperFwd.clone(), traveled: 0, tail: 0, hit: false, mesh, from: en,
        speed: SNIPER_BULLET_SPEED, damage: SNIPER_DAMAGE, tracerLen: SNIPER_TRACER_LEN, tracerWidth: SNIPER_TRACER_WIDTH,
    });
    en.charge = -1;
    en.cooldown = THREE.MathUtils.lerp(SNIPER_REST_MIN, SNIPER_REST_MAX, Math.random());
    en.flashAge = 0;
    en.muzzleFx.rotation.z = Math.random() * Math.PI;
    en.muzzleFx.scale.setScalar(SNIPER_FLASH_SCALE * (1 + Math.random() * 0.3));
    en.gunSpring.v.x -= SNIPER_RECOIL;
    en.pelvisSpring.v.z -= 0.6; // 反動で腰が後ろへ押される
    const s = sniperSound(en.root.position.distanceTo(camera.position));
    sfx.playSniperShot(s.volume, s.pan);
}
// 照準線: 銃口から、壁かプレイヤーの胸に当たる所まで。溜めるほど濃くなり、ロックすると点滅する。
// 霧の向こうからでも見えるよう、霧はかけない
export function createSniperLaser() {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: LASER_COLOR, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    return line;
}
function updateLaser() {
    const line = en.laser;
    if (!line)
        return;
    line.visible = en.alive && en.charge >= 0;
    if (!line.visible)
        return;
    readMuzzle();
    let len = castWorld(sniperFrom, sniperFwd, SNIPER_RANGE);
    if (game.playerHp > 0) {
        const t = sniperTo.subVectors(aimTarget(sniperChest), sniperFrom).dot(sniperFwd);
        if (t > 0 && t < len && sniperTo.copy(sniperFrom).addScaledVector(sniperFwd, t).distanceTo(sniperChest) < LASER_PLAYER_RADIUS)
            len = t;
    }
    const pos = line.geometry.getAttribute('position');
    pos.setXYZ(0, sniperFrom.x, sniperFrom.y, sniperFrom.z);
    pos.setXYZ(1, sniperFrom.x + sniperFwd.x * len, sniperFrom.y + sniperFwd.y * len, sniperFrom.z + sniperFwd.z * len);
    pos.needsUpdate = true;
    const mat = line.material;
    // 明るい床や霧に溶けないよう、色は赤のまま濃さだけ変える
    mat.opacity = sniperLocked()
        ? (Math.floor(en.charge * 24) % 2 === 0 ? 1 : 0.15)
        : 0.3 + 0.5 * Math.min(1, en.charge / (SNIPER_CHARGE - SNIPER_LOCK));
}
// ---- 狙撃銃 ----
// 長い銃身に照準器を載せたボルトアクションのライフル。拳銃と同じく、艶のないグレーの箱を組み合わせる。
// 銃口が -Z、上が +Y。原点はグリップの付け根
export function createRifle(mats) {
    const gun = new THREE.Group();
    const box = (w, h, d, x, y, z, mat = mats.pistol) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        gun.add(m);
        return m;
    };
    const tube = (r0, r1, len, y, z, mat = mats.pistol) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 8), mat);
        m.rotation.x = -Math.PI / 2; // 上の口（r0）を -Z へ
        m.position.set(0, y, z);
        gun.add(m);
        return m;
    };
    // 銃床: 肩に当てる部分は下へ少し落とし、頬を載せる台を付ける
    box(0.04, 0.09, 0.2, 0, -0.012, 0.15).rotation.x = 0.06;
    box(0.046, 0.12, 0.03, 0, -0.022, 0.26, mats.pistolDark);
    box(0.034, 0.024, 0.12, 0, 0.042, 0.13);
    // 機関部とボルトの取っ手、グリップ、弾倉
    box(0.05, 0.07, 0.3, 0, 0.02, -0.08);
    box(0.05, 0.012, 0.012, -0.035, 0.03, 0.02, mats.pistolDark);
    box(0.03, 0.09, 0.04, 0, -0.06, 0.03, mats.pistolDark).rotation.x = -0.3;
    box(0.034, 0.09, 0.07, 0, -0.06, -0.12, mats.pistolDark);
    // 被筒と銃身、先端の制退器。被筒の下に、たたんだ二脚
    box(0.046, 0.055, 0.32, 0, 0.02, -0.38);
    tube(0.011, 0.011, 0.44, 0.035, -0.76);
    box(0.032, 0.032, 0.07, 0, 0.035, -0.99, mats.pistolDark);
    for (const x of [-0.014, 0.014])
        box(0.01, 0.01, 0.22, x, -0.016, -0.42, mats.pistolDark);
    // 照準器: 2 つの台の上に筒を載せ、前の対物側を太くする
    for (const z of [-0.03, -0.17])
        box(0.016, 0.03, 0.02, 0, 0.068, z, mats.pistolDark);
    tube(0.02, 0.02, 0.24, 0.1, -0.1);
    tube(0.029, 0.021, 0.07, 0.1, -0.25);
    tube(0.023, 0.023, 0.04, 0.1, 0.04, mats.pistolDark);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.035, -1.03);
    gun.add(muzzle);
    gun.userData.muzzle = muzzle;
    return gun;
}
// 狙撃手にライフルを肩付けで構えさせる。銃床を右肩の内側に当て、頬を銃床に載せる高さに置く。
// 右手はグリップ、左手は被筒の下を支える
export function attachSniperRifle(body) {
    const gun = createRifle(weaponMats);
    gun.rotation.y = Math.PI; // 銃口（-Z）を敵の正面（+Z）へ
    gun.position.set(-0.08, 1.53, 0.2).sub(body.gunRig.userData.origin);
    body.gunRig.add(gun);
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyEuler(gun.rotation).add(gun.position);
    reachHands(body, [at(0, -0.07, 0.02), at(0, -0.01, -0.34)]);
    return gun;
}

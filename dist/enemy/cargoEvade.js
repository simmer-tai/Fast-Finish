import * as THREE from 'three';
import { GRAVITY } from '../player/config.js?v=2fb05089';
import { approachingCargo, cargoBlockActive, cargoBlocksAhead } from '../world/movers.js?v=2fb05089';
import { floorAt } from '../world/blocks.js?v=2fb05089';
import { DUMMY_HEIGHT, DUMMY_RADIUS } from './body.js?v=2fb05089';
import { env } from './env.js?v=2fb05089';
import { enemyCanStand, enemyCanStandAt, startLeap, updateLeap } from './motion.js?v=2fb05089';
import { en } from './state.js?v=2fb05089';
const jumps = new WeakMap();
const SPEED = 7;
const MARGIN = DUMMY_RADIUS + 0.4;
const JUMP_MAX = 2.7; // 飛び乗れる高さ（コンテナ 1 段） (m)
const CROUCH = 0.16; // 踏み切る前にしゃがむ (s)
const CROUCH_DEPTH = 0.15; // しゃがんで腰を下げる深さ (m)
const APEX = 0.55; // 積み荷の上面より、これだけ高く跳ね上がる (m)
const CLEAR = 0.15; // 足がこれだけ上面を越えたら、積み荷が下に来てよい (m)
const STEP = 0.35; // 跳んだ所から積み荷のほうへ寄って降りる (m)
const SLACK = 0.08; // 積み荷が来るより、これだけ早く足を上げ終える (s)
export function cargoJumpBlock() { return jumps.get(en)?.block; }
export function clearCargoJump() { jumps.delete(en); }
function hopFor(height) { return Math.sqrt(2 * GRAVITY * (height + APEX)); }
// 跳んでから、足が上面を CLEAR だけ越えるまで (s)
function clearTime(height) {
    const v = hopFor(height);
    return (v - Math.sqrt(Math.max(0, v * v - 2 * GRAVITY * (height + CLEAR)))) / GRAVITY;
}
function takeOff(jump) {
    const p = en.root.position;
    const b = jump.block;
    const height = b.h - p.y;
    const hop = hopFor(height);
    const dur = (hop + Math.sqrt(Math.max(0, hop * hop - 2 * GRAVITY * height))) / GRAVITY;
    // 着くときの積み荷の位置を読み、跳んだ所から半歩だけ積み荷側の所に降りる
    const shift = jump.speed * dur;
    const want = p.x - Math.sign(jump.speed) * STEP;
    jump.offsetX = THREE.MathUtils.clamp(want - (b.minX + shift), MARGIN, b.maxX - b.minX - MARGIN);
    jump.landing.set(b.minX + shift + jump.offsetX, b.h, b.minZ + jump.offsetZ);
    startLeap(jump.landing, hop);
    jump.crouch = 0;
}
function updateJump(jump, dt) {
    const p = en.root.position;
    if (!cargoBlockActive(jump.block)) {
        jumps.delete(en);
        en.baseY = floorAt(p.x, p.z, p.y);
        en.airY = Math.max(0.001, p.y - en.baseY);
        en.airVel = 0;
        return false;
    }
    if (jump.crouch > 0) {
        // しゃがんで踏み切りを溜める
        en.vel.set(0, 0, 0);
        en.pelvisSpring.x.y += (-CROUCH_DEPTH - en.pelvisSpring.x.y) * Math.min(1, dt * 30);
        en.pelvisSpring.v.y = 0;
        jump.crouch -= dt;
        if (jump.crouch <= 0) {
            takeOff(jump);
            en.pelvisSpring.v.y += 2.5; // 伸び上がる
        }
        return true;
    }
    // 跳ぶときに読んだ着く所から、本当の積み荷の上の所へ、着くにつれて寄せる（読みのずれを着地で埋める）
    const u = Math.min(1, (en.dropT + dt) / en.dropDur);
    const b = jump.block;
    en.dropTo.set(jump.landing.x + (b.minX + jump.offsetX - jump.landing.x) * u, b.h, jump.landing.z + (b.minZ + jump.offsetZ - jump.landing.z) * u);
    if (updateLeap(dt)) {
        jumps.delete(en);
        en.waitT = 0.3;
    }
    return true;
}
export function updateCargoEvade(dt) {
    const p = en.root.position;
    const jump = jumps.get(en);
    if (jump)
        return updateJump(jump, dt);
    if (en.ride !== 'none' || en.airY > 0 || en.airVel > 0 || en.riseTime < 0.3 || env.isHeld())
        return false;
    const threat = approachingCargo(p.x, p.z, p.y, DUMMY_HEIGHT, DUMMY_RADIUS);
    if (!threat)
        return false;
    const b = threat.block;
    const height = b.h - p.y;
    const z = THREE.MathUtils.clamp(p.z, b.minZ + MARGIN, b.maxZ - MARGIN);
    const edge = threat.speed > 0 ? b.maxX - MARGIN : b.minX + MARGIN;
    if (height > 0 && height <= JUMP_MAX && b.maxX - b.minX > 2 * MARGIN && b.maxZ - b.minZ > 2 * MARGIN
        && enemyCanStandAt(edge, z, b.h)) {
        // 積み荷が足もとに届く少し前まで、いつもどおりに動く。届く直前にしゃがみ始める（間に合わなければしゃがみを詰める）
        const lift = clearTime(height);
        if (threat.time > CROUCH + lift + SLACK)
            return false;
        const crouch = Math.max(0.04, Math.min(CROUCH, threat.time - lift));
        jumps.set(en, { block: b, offsetX: 0, offsetZ: z - b.minZ, crouch, speed: threat.speed, landing: new THREE.Vector3() });
        en.moving = false;
        en.vel.set(0, 0, 0);
        return true;
    }
    // 飛び乗れない積み荷: 道筋ごと確かめて（壁を抜けないように）、近いほうの脇へ駆けて避ける
    const targets = [b.minZ - MARGIN, b.maxZ + MARGIN].sort((a, c) => Math.abs(a - p.z) - Math.abs(c - p.z));
    let escape;
    for (const tz of targets) {
        const dist = Math.abs(tz - p.z);
        if (dist / SPEED > threat.time + 0.35)
            continue;
        let clear = true;
        for (let d = 0.2; d < dist + 0.2; d += 0.2) {
            const testZ = p.z + Math.sign(tz - p.z) * Math.min(d, dist);
            if (!enemyCanStand(p.x, testZ)) {
                clear = false;
                break;
            }
        }
        if (clear && !cargoBlocksAhead(p.x, tz, p.y, DUMMY_HEIGHT, DUMMY_RADIUS)) {
            escape = tz;
            break;
        }
    }
    if (escape === undefined)
        return false;
    const dz = Math.sign(escape - p.z) * Math.min(Math.abs(escape - p.z), SPEED * dt);
    if (!enemyCanStand(p.x, p.z + dz))
        return false;
    p.z += dz;
    en.vel.set(0, 0, Math.sign(dz) * SPEED);
    en.moving = false;
    return true;
}

import * as THREE from 'three';
import * as sfx from '../audio.js';
import { camera, scene } from '../core.js';
import { game } from '../game/state.js';
import { broadcastBossShot } from '../multiplayer/connectionTest.js';
import { MUZZLE_FLASH_LIFE, tracerGeo } from '../weapons/handgunCombat.js';
import { floorAt } from '../world/blocks.js';
import { playBounds } from '../world/arena.js';
import { castWorld } from '../world/raycast.js';
import { DRONE_GUN_Y } from './drone.js';
import { env } from './env.js';
import { ENEMY_ACCURACY, ENEMY_BULLET_SPEED, ENEMY_LEAN_LIMIT, ENEMY_STAGGER_LIMIT, ENEMY_TRACER_LEN, enemyBullets, enemyTracerMat } from './fire.js';
import { enemyBlockedAt } from './motion.js';
import { ENEMY_HIT_RECOVER, en } from './state.js';
export const DRONE_HP = 50;
export const DRONE_HOVER = 1.2;
const DESCENT = 0.4;
const states = new WeakMap();
const target = new THREE.Vector3(), from = new THREE.Vector3(), dir = new THREE.Vector3(), pan = new THREE.Vector3();
let nextShotId = 1700000000;
function state() {
    let s = states.get(en);
    if (!s) {
        s = { change: 0, distance: 9, side: 1, braceTime: 0, shot: 0 };
        states.set(en, s);
    }
    return s;
}
export function resetDrone() { states.delete(en); en.burst = 0; en.brace = 0; en.vel.set(0, 0, 0); }
export function updateDrone(dt) {
    const s = state(), p = en.root.position;
    if (!en.spiked) {
        en.baseY = floorAt(p.x, p.z, p.y + 0.05);
        const hover = en.baseY + DRONE_HOVER;
        if (en.riseTime < DESCENT)
            p.y = hover + 2 * (1 - Math.min(1, en.riseTime / DESCENT));
        else
            p.y += (hover - p.y) * (1 - Math.exp(-5 * dt));
        en.airY = Math.max(0, p.y - en.baseY);
        en.airVel = 0;
    }
    if (!env.targetPlayer(target)) {
        en.vel.set(0, 0, 0);
        return;
    }
    const dx = target.x - p.x, dz = target.z - p.z, dist = Math.max(0.001, Math.hypot(dx, dz));
    en.yaw = Math.atan2(dx, dz);
    en.root.rotation.set(0, en.yaw, 0);
    en.aimYaw = 0;
    en.aimPitch = Math.atan2(target.y - (p.y + DRONE_GUN_Y), dist);
    s.change -= dt;
    if (s.change <= 0) {
        s.change = 2 + Math.random() * 2;
        s.side = Math.random() < 0.5 ? -1 : 1;
        s.distance = 7 + Math.random() * 4;
    }
    const halted = !en.mobile || en.spiked || en.riseTime < DESCENT || en.flashT < ENEMY_HIT_RECOVER || env.isHeld() || en.knockVel.lengthSq() > 0.16 || en.cooldown <= 0.4 || en.burst > 0;
    if (halted) {
        en.vel.set(0, 0, 0);
        return;
    }
    const radial = THREE.MathUtils.clamp((dist - s.distance) * 0.55, -1.5, 1.5);
    const vx = dx / dist * radial + dz / dist * s.side, vz = dz / dist * radial - dx / dist * s.side;
    const speed = 4.5 / Math.hypot(vx, vz);
    const x = p.x + vx * speed * dt, z = p.z + vz * speed * dt;
    if (x >= playBounds.minX && x <= playBounds.maxX && z >= playBounds.minZ && z <= playBounds.maxZ && !enemyBlockedAt(x, z, p.y + 1)) {
        en.vel.set(vx * speed, 0, vz * speed);
        p.x = x;
        p.z = z;
    }
    else {
        en.vel.set(0, 0, 0);
        s.side *= -1;
        s.change = 1;
    }
}
export function updateDroneFire(dt) {
    const s = state();
    en.flashAge += dt;
    en.muzzleFx.visible = en.flashAge < MUZZLE_FLASH_LIFE;
    en.cooldown -= dt;
    const steady = Math.abs(en.gunSpring.x.x) <= ENEMY_STAGGER_LIMIT && en.leanSpring.x.length() <= ENEMY_LEAN_LIMIT;
    const ready = en.alive && env.playerHp() > 0 && en.riseTime >= DESCENT && en.flashT >= ENEMY_HIT_RECOVER && !en.spiked && !env.isHeld() && steady;
    if (!ready) {
        en.burst = 0;
        s.braceTime = 0;
        en.brace = 0;
        return;
    }
    if (en.cooldown > 0.4 && en.burst === 0) {
        s.braceTime = 0;
        en.brace = 0;
        return;
    }
    s.braceTime += dt;
    en.brace = Math.min(1, s.braceTime / 0.4);
    if (en.cooldown > 0 || s.braceTime < 0.4 || !env.targetPlayer(target))
        return;
    const muzzle = en.muzzles[s.shot % 2];
    muzzle.updateWorldMatrix(true, false);
    from.setFromMatrixPosition(muzzle.matrixWorld);
    dir.subVectors(target, from);
    const dist = dir.length();
    dir.normalize();
    if (castWorld(from, dir, dist) < dist) {
        if (en.burst) {
            en.burst = 0;
            en.cooldown = 1.6;
        }
        return;
    }
    const spread = ENEMY_ACCURACY[game.difficulty].spread;
    dir.x += (Math.random() * 2 - 1) * spread;
    dir.y += (Math.random() * 2 - 1) * spread;
    dir.z += (Math.random() * 2 - 1) * spread;
    dir.normalize();
    const mesh = new THREE.Mesh(tracerGeo, enemyTracerMat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    const networkId = nextShotId++;
    enemyBullets.push({ pos: from.clone(), dir: dir.clone(), traveled: 0, tail: 0, hit: false, mesh, from: en, networkId, damage: 5, tracerWidth: 0.018 });
    broadcastBossShot({ id: networkId, from: [from.x, from.y, from.z], dir: [dir.x, dir.y, dir.z], speed: ENEMY_BULLET_SPEED, damage: 5, length: ENEMY_TRACER_LEN, width: 0.018, part: 'gunner', sound: true });
    muzzle.add(en.muzzleFx);
    en.flashAge = 0;
    en.muzzleFx.scale.setScalar(1.7);
    en.gunSpring.v.x -= 0.4;
    camera.updateMatrixWorld();
    pan.copy(en.root.position).applyMatrix4(camera.matrixWorldInverse);
    sfx.playGunshot(THREE.MathUtils.clamp(3 / Math.max(dist, 1), 0.2, 0.65), THREE.MathUtils.clamp(pan.x / Math.max(Math.hypot(pan.x, pan.z), 0.001), -1, 1) * 0.8);
    s.shot++;
    if (en.burst === 0)
        en.burst = 3;
    en.burst--;
    en.cooldown = en.burst ? 0.12 : 1.6 + Math.random() * 0.8;
}

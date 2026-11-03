import * as THREE from 'three';
import { enemies } from '../enemy/state.js?v=2fb05089';
const spawnIds = new WeakMap();
let nextSpawnId = 1;
export function markAddSpawn(e) { spawnIds.set(e, nextSpawnId++); }
export function addSpawnId(e) { return spawnIds.get(e) ?? 0; }
const boneCache = new WeakMap();
function bones(e) {
    let result = boneCache.get(e);
    if (!result) {
        result = [e.root, e.shake, e.pelvis, e.spine, e.neck, e.gunRig, ...e.arms, ...e.forearms, ...e.thighs, ...e.shins, ...e.feet, e.gun];
        boneCache.set(e, result);
    }
    return result;
}
export function captureAdds() {
    return enemies.map((e) => ({ id: addSpawnId(e), alive: e.alive, visible: e.root.visible, hp: e.hp,
        bones: bones(e).map((o) => packBone([o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z])) }));
}
// A short array holds a bit mask followed by the non-default components. Full
// arrays remain uncompressed when the mask would not save space.
function packBone(values) {
    let mask = 0;
    const packed = [0];
    for (let i = 0; i < 10; i++) {
        if (values[i] !== (i < 6 ? 0 : 1)) {
            mask |= 1 << i;
            packed.push(values[i]);
        }
    }
    packed[0] = mask;
    return packed.length < 10 ? packed : values;
}
export function decodeAddSnapshots(value) {
    const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000;
    if (!Array.isArray(value) || value.length > 32)
        return null;
    const result = [];
    for (const e of value) {
        if (!e || typeof e !== 'object' || !Number.isSafeInteger(e.id) || e.id < 0 || typeof e.alive !== 'boolean'
            || typeof e.visible !== 'boolean' || !finite(e.hp) || !Array.isArray(e.bones) || e.bones.length !== 17)
            return null;
        const decoded = [];
        for (const b of e.bones) {
            if (!Array.isArray(b) || b.length < 1 || b.length > 10 || !b.every(finite))
                return null;
            if (b.length === 10) {
                decoded.push(b);
                continue;
            }
            const mask = b[0];
            if (!Number.isInteger(mask) || mask < 0 || mask >= 1024)
                return null;
            const values = [];
            let index = 1;
            for (let i = 0; i < 10; i++)
                values.push(mask & (1 << i) ? b[index++] : i < 6 ? 0 : 1);
            if (index !== b.length)
                return null;
            decoded.push(values);
        }
        result.push({ id: e.id, alive: e.alive, visible: e.visible, hp: e.hp, bones: decoded });
    }
    return result;
}
const target = new THREE.Quaternion();
export function applyAddSnapshot(e, snapshot, dt) {
    const blend = 1 - Math.exp(-14 * dt);
    bones(e).forEach((o, i) => {
        const b = snapshot.bones[i];
        o.position.x += (b[0] - o.position.x) * blend;
        o.position.y += (b[1] - o.position.y) * blend;
        o.position.z += (b[2] - o.position.z) * blend;
        target.set(b[3], b[4], b[5], b[6]);
        if (target.lengthSq() > 1e-8)
            o.quaternion.slerp(target.normalize(), blend);
        o.scale.set(b[7], b[8], b[9]);
    });
    e.alive = snapshot.alive;
    e.hp = snapshot.hp;
    e.root.visible = snapshot.visible;
    e.yaw = e.root.rotation.y;
    e.root.updateMatrixWorld(true);
}

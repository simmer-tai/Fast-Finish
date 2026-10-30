import { BOSS_LIMBS, applyBossThrowable, applyBossWarnings, boss, captureBossThrowable, captureBossWarnings, isBossThrowable, isBossWarnings, updateRemoteBossCollision } from '../enemy/boss.js';
import { applyPillarSnapshots, capturePillars, isPillarSnapshots } from '../world/pillars.js';
function bones(rig) {
    return [rig.root, rig.body, rig.torso, ...rig.guns, ...rig.legs.flatMap((leg) => [leg.thigh, leg.shin, leg.meta, leg.foot])];
}
function transform(object) {
    const p = object.position, q = object.quaternion;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
}
export function captureBossSnapshot() {
    const rig = boss.rig;
    if (!rig)
        return null;
    return {
        version: 1, visible: rig.root.visible, phase: boss.phase, entering: boss.entering,
        airborne: boss.jump.stage >= 1 && boss.jump.stage <= 3,
        coreHp: boss.coreHp, coreMax: boss.coreMax, limbMax: boss.limbMax,
        limbs: BOSS_LIMBS.map((part) => [boss.limbs[part].hp, boss.limbs[part].broken]),
        transforms: bones(rig).map(transform),
        warnings: captureBossWarnings(),
        pillars: capturePillars(),
        throwable: captureBossThrowable(),
    };
}
// ネットワークの入力をゲームの値として使う前に、形式と値の範囲を確認する。
export function isBossSnapshot(value) {
    if (!value || typeof value !== 'object')
        return false;
    const s = value;
    const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000;
    return s.version === 1 && typeof s.visible === 'boolean'
        && Array.isArray(s.transforms) && s.transforms.length === 13
        && s.transforms.some((t) => Array.isArray(t) && t.length === 7 && t.every(finite));
}
// 参加者は AI を動かさず、受信した機体を追う。攻撃の生成は別途同期が必要。
export function applyBossSnapshot(s, dt) {
    const rig = boss.rig;
    if (!rig)
        return;
    const blend = 1 - Math.exp(-14 * dt);
    bones(rig).forEach((object, i) => {
        const t = s.transforms[i];
        if (!Array.isArray(t) || t.length !== 7 || !t.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000))
            return;
        object.position.x += (t[0] - object.position.x) * blend;
        object.position.y += (t[1] - object.position.y) * blend;
        object.position.z += (t[2] - object.position.z) * blend;
        const target = object.quaternion.clone().set(t[3], t[4], t[5], t[6]);
        if (target.lengthSq() > 1e-8)
            object.quaternion.slerp(target.normalize(), blend);
    });
    rig.root.visible = s.visible;
    boss.pos.copy(rig.root.position);
    boss.yaw = rig.root.rotation.y;
    if (['walk', 'down', 'rise', 'dead'].includes(s.phase))
        boss.phase = s.phase;
    if (typeof s.entering === 'boolean')
        boss.entering = s.entering;
    if (typeof s.airborne === 'boolean')
        boss.jump.stage = s.airborne ? 1 : -1;
    if (Number.isFinite(s.coreHp) && Math.abs(s.coreHp) <= 10000)
        boss.coreHp = s.coreHp;
    if (Number.isFinite(s.coreMax) && s.coreMax > 0 && s.coreMax <= 10000)
        boss.coreMax = s.coreMax;
    if (Number.isFinite(s.limbMax) && s.limbMax > 0 && s.limbMax <= 10000)
        boss.limbMax = s.limbMax;
    BOSS_LIMBS.forEach((part, i) => {
        if (!Array.isArray(s.limbs) || !Array.isArray(s.limbs[i]) || s.limbs[i].length !== 2 || !Number.isFinite(s.limbs[i][0]) || Math.abs(s.limbs[i][0]) > 10000 || typeof s.limbs[i][1] !== 'boolean')
            return;
        boss.limbs[part].hp = s.limbs[i][0];
        boss.limbs[part].broken = s.limbs[i][1];
        const shade = s.limbs[i][1] ? 0.3 : 1;
        for (const material of rig.mats[part])
            material.color.setScalar(shade);
    });
    if (isBossWarnings(s.warnings))
        applyBossWarnings(s.warnings);
    if (isPillarSnapshots(s.pillars))
        applyPillarSnapshots(s.pillars);
    if (isBossThrowable(s.throwable))
        applyBossThrowable(s.throwable, dt);
    updateRemoteBossCollision();
    rig.root.updateMatrixWorld(true);
}

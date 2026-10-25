import * as THREE from 'three';
import { camera } from '../core.js';
import { enemies } from '../enemy/state.js';
import { enemyChest } from '../player/aimAssist.js';
import { blocks } from '../world/blocks.js';
import { castHit, castThrow, castWorld } from '../world/raycast.js';
import { DEG } from '../math.js';
// ---- 跳弾の狙いの補助 ----
// 跳弾矢を射る瞬間、照準のすぐ近くに「そこで跳ねれば敵に当たる」壁や天井の所があれば、その敵を狙いとして覚えておく（画面には何も出さない）。
// 矢そのものは照準へ向けて射り、最初に跳ねるときに覚えた敵へ向け直す（bowCombat の ricochetArrow）。
// 敵の胸を面に映した鏡像へ向けて線を引き、面と交わる所を跳ねる所とする。重力の落ちは射る側で見込む。
// 跳弾矢はどの角度でも跳ねるので角度は見ない。距離も問わない。
// 自分からその所まで、その所から敵までが壁でふさがれていない所のうち、照準にいちばん近い所を選ぶ。
// 床や箱の上の面は使わない。天井は壁より照準から遠いものとして並べる
export const BANK_SNAP = 5 * DEG; // 照準からこの角度以内の所だけに寄せる
export const BANK_EDGE = 0.05; // 面の縁からこれより内側の所だけにする
export const BANK_CEILING_PENALTY = 3 * DEG; // 天井の所は、照準からこれだけ遠いものとして並べる（壁を先に選ぶ）
const candidates = [];
const pool = [];
function takeCandidate() {
    return pool.pop() ?? { point: new THREE.Vector3(), normal: new THREE.Vector3(), target: new THREE.Vector3(), enemy: null, angle: 0 };
}
const chests = [];
const chestOf = [];
const fwd = new THREE.Vector3();
const mirror = new THREE.Vector3();
const toMirror = new THREE.Vector3();
const hitP = new THREE.Vector3();
const dir = new THREE.Vector3();
const n = new THREE.Vector3();
// 平面 n·p = c（n は外向き）で跳ねて chest に当たる所を探す。inFace は交点が面の内側か
function tryPlane(c, chest, enemy, inFace) {
    const cam = camera.position;
    const camSide = n.dot(cam) - c;
    const enemySide = n.dot(chest) - c;
    if (camSide <= 0.05 || enemySide <= 0.05)
        return;
    mirror.copy(chest).addScaledVector(n, -2 * enemySide);
    toMirror.subVectors(mirror, cam);
    const t = camSide / (camSide - (n.dot(mirror) - c));
    hitP.copy(cam).addScaledVector(toMirror, t);
    if (!inFace(hitP))
        return;
    dir.subVectors(hitP, cam).normalize();
    let angle = dir.angleTo(fwd);
    if (angle > BANK_SNAP)
        return;
    if (n.y < -0.5)
        angle += BANK_CEILING_PENALTY;
    const cand = takeCandidate();
    cand.point.copy(hitP);
    cand.normal.copy(n);
    cand.target.copy(chest);
    cand.enemy = enemy;
    cand.angle = angle;
    candidates.push(cand);
}
const losDir = new THREE.Vector3();
const losFrom = new THREE.Vector3();
function clearLine(from, to, slack) {
    losDir.subVectors(to, from);
    const dist = losDir.length();
    losDir.divideScalar(dist);
    return castWorld(from, losDir, dist) >= dist - slack;
}
// 照準の近くに跳ねて敵に当たる所があれば、その所で跳ねて当たる敵を返す。照準が敵を直に捉えているときは使わない
export function findBankShot() {
    pool.push(...candidates);
    candidates.length = 0;
    const cam = camera.position;
    camera.getWorldDirection(fwd);
    if (castThrow(cam, fwd, Infinity) && castHit.enemy)
        return null;
    let count = 0;
    for (const e of enemies) {
        if (!e.alive)
            continue;
        const v = chests[count] ?? (chests[count] = new THREE.Vector3());
        enemyChest(e, v);
        chestOf[count] = e;
        count++;
    }
    if (!count)
        return null;
    for (let i = 0; i < count; i++) {
        const chest = chests[i];
        const enemy = chestOf[i];
        // 箱の横の面と、浮いた箱の下の面（天井）。床や箱の上の面は候補にしない
        for (const b of blocks) {
            const y0 = b.y0 ?? 0;
            const inX = (p) => p.x > b.minX + BANK_EDGE && p.x < b.maxX - BANK_EDGE;
            const inY = (p) => p.y > y0 + BANK_EDGE && p.y < b.h - BANK_EDGE;
            const inZ = (p) => p.z > b.minZ + BANK_EDGE && p.z < b.maxZ - BANK_EDGE;
            n.set(1, 0, 0);
            tryPlane(b.maxX, chest, enemy, (p) => inY(p) && inZ(p));
            n.set(-1, 0, 0);
            tryPlane(-b.minX, chest, enemy, (p) => inY(p) && inZ(p));
            n.set(0, 0, 1);
            tryPlane(b.maxZ, chest, enemy, (p) => inX(p) && inY(p));
            n.set(0, 0, -1);
            tryPlane(-b.minZ, chest, enemy, (p) => inX(p) && inY(p));
            if (y0 > 0) {
                n.set(0, -1, 0);
                tryPlane(-y0, chest, enemy, (p) => inX(p) && inZ(p));
            }
        }
    }
    candidates.sort((a, b) => a.angle - b.angle);
    for (const c of candidates) {
        if (!clearLine(cam, c.point, 0.05))
            continue;
        losFrom.copy(c.point).addScaledVector(c.normal, 0.02);
        if (!clearLine(losFrom, c.target, 0.3))
            continue;
        return c.enemy;
    }
    return null;
}

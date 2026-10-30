import * as THREE from 'three';
import * as sfx from '../audio.js';
import { DEG } from '../math.js';
import { camera } from '../core.js';
import { castHit, castThrow } from '../world/raycast.js';
import { spawnShards, spawnSparks } from '../fx/hitFx.js';
import { spawnWallArcs } from '../fx/arcs.js';
import { skinFx, skinOf } from './skins.js';
import { game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
const WALL_MARGIN = 0.4; // 武器の届く距離は敵の中心までなので、面にはそれより手前で当てる
const WALL_HIT_STOP = 0.035; // 刃が弾かれた一瞬の止まり（敵に当てたときよりずっと短い）
const WALL_CHIP_TINT = new THREE.Color(0xa8a8a8); // 削れた壁のかけらの色
const wallLook = new THREE.Vector3();
const wallAlong = new THREE.Vector3();
const wallTint = new THREE.Color();
// swing（刃の動いた向き。長さは問わない）を渡すと、火花を面に沿ってその向きへ流す。当たれば true。
// weapon のスキンに合わせて、火花の色を変え（spark）、稲妻を出すスキンは面に稲妻を這わせ、飾りを光らせる
export function tryWallHit(weapon, reach, kind, swing, power = 1) {
    camera.updateMatrixWorld();
    camera.getWorldDirection(wallLook);
    if (!castThrow(camera.position, wallLook, reach - WALL_MARGIN) || castHit.enemy || castHit.boss)
        return false;
    const n = castHit.normal;
    const at = castHit.point.addScaledVector(n, 0.02); // 面に埋もれないよう少し手前から散らす
    let flow;
    if (swing) {
        wallAlong.copy(swing).addScaledVector(n, -swing.dot(n));
        if (wallAlong.lengthSq() > 1e-8)
            flow = wallAlong.normalize();
    }
    const p = Math.min(1.6, Math.max(0.6, power));
    const skin = skinOf(weapon);
    const tint = skin.spark !== undefined ? wallTint.setHex(skin.spark) : null;
    if (kind === 'blade') {
        spawnSparks(at, wallLook, Math.round(9 * p), 0.7, 0.6, flow, tint);
    }
    else {
        spawnSparks(at, wallLook, Math.round((kind === 'heavy' ? 10 : 5) * p), 0.6, 0.55, flow, tint);
        spawnShards(at, wallLook, Math.round((kind === 'heavy' ? 5 : 3) * p), 0.9, kind === 'heavy' ? 0.9 : 0.6, undefined, WALL_CHIP_TINT);
    }
    if (skin.arc)
        spawnWallArcs(at, n, flow, p, skin.arc);
    if (skin.spark !== undefined || skin.arc)
        skinFx.flare = 0.6; // 敵に当てたとき（1）より控えめに
    sfx.playWallHit(kind, p);
    // 弾かれた手応え: 一瞬止めて、画面を揺らし、手元を跳ね返す
    game.hitStop = Math.max(game.hitStop, WALL_HIT_STOP * (kind === 'heavy' ? 1.5 : 1));
    game.hitStopTotal = game.hitStop;
    game.hitStopShakesDummy = false;
    hooks.addTrauma((kind === 'heavy' ? 0.22 : 0.12) * p);
    kickVel.x += (kind === 'heavy' ? 1.6 : 0.9) * p * DEG * 22;
    return true;
}

import * as THREE from 'three';
import { en, enemies } from '../enemy/state.js';
import { startLeap, updateEnemyAir, updateLeap } from '../enemy/motion.js';
import { leapStriker } from '../enemy/striker.js';
import { env } from '../enemy/env.js';
import { UP } from '../math.js';
import { position } from '../player/state.js';
import { hooks } from '../game/hooks.js';
import { game } from '../game/state.js';
import { playBounds } from './arena.js';
// ---- 昇り続けるリフト（LIFT） ----
// リフトとその上の物は動かさず、シャフトの見た目（区切りを上下に並べたもの）を下へ流して、昇っているように見せる。
// 流した量が区切り 1 つ分を超えるたびに巻き戻すので、どこまででも昇り続けられる。操作を返したら動き出し、倒しきったら止まる。
// 敵は、まだ上にある足場に現れて、足場ごと下りてくる（乗っている間は歩かない）。足場の上面がリフトの床から
// 決まった高さまで下りてきたら、リフトの床へ飛び乗る
const COPIES_BELOW = 2; // 区切りを今の高さより下に何段並べるか
const COPIES_ABOVE = 5; // 上に何段並べるか（見上げても霧に溶けきる高さまで）
const ACCEL = 2.5; // 動き出し・止まりぎわの速さの変わり方 (m/s²)
const START_SHAKE = 0.25; // 動き出したときに画面を揺らす量
const SPAWN_LOW = 10; // 足場の上面がリフトの床からこの高さの間にあるとき、そこに敵を出す
const SPAWN_HIGH = 22;
const SLOTS = [-0.9, 0.9]; // 1 つの足場に立つ 2 か所（壁に沿う向きのずれ, m）
const LAND_SPREAD = 1.3; // 立つ所のずれを、飛び乗る先ではこれだけ広げる
const LEAP_LOW = 2.5; // 足場の上面がリフトの床からこの高さまで下りてきたら飛び乗る（歩く速さの個体差で、この間に散らす）
const LEAP_HIGH = 5;
const LAND_MARGIN = 0.5; // 足場から動かされて飛び降りるとき、リフトの縁からこれだけ内側に着く
let shaft = null;
let root = null;
let travel = 0; // 昇った高さ (m)
let speed = 0; // 今の昇る速さ (m/s)
// ステージへ入るときに渡す（シャフトの無いステージでは null）。root は区切りを並べた見た目の親
export function setShaft(def, r) {
    shaft = def;
    root = r;
    travel = 0;
    speed = 0;
}
// 昇った高さ。シャフトに付いた物（罠など）は、シャフトの中の高さからこれを引いた所にある
export const shaftTravel = () => travel;
// 区切りの箱を上下に並べる（見た目を組むときに使う）
export function shaftCopies(list, period) {
    const out = [];
    for (let k = -COPIES_BELOW; k <= COPIES_ABOVE; k++) {
        for (const b of list)
            out.push({ ...b, y0: (b.y0 ?? 0) + k * period, h: b.h + k * period });
    }
    return out;
}
export function updateShaft(dt, running) {
    if (!shaft || !root)
        return;
    const speedMul = { easy: 0.8, normal: 1, hard: 1.75 }[game.difficulty];
    const want = running ? shaft.speed * speedMul : 0;
    if (want > 0 && speed === 0)
        hooks.addTrauma(START_SHAKE); // がくんと動き出す
    speed = want > speed ? Math.min(want, speed + ACCEL * dt) : Math.max(want, speed - ACCEL * dt);
    travel += speed * dt;
    root.position.y = -(travel % shaft.period);
}
// 足場 l の slot の所に立つ足もと（xz）
const spot = new THREE.Vector3();
function ledgeSpot(l, slot, out) {
    return out.set(l.x + (l.along === 'x' ? slot : 0), 0, l.z + (l.along === 'z' ? slot : 0));
}
// 出てくる en を、上の足場に乗せる。乗せる所が無ければ（シャフトの無いステージでも）出現位置のまま
export function boardLedge() {
    en.ride = 'none';
    if (!shaft)
        return false;
    const period = shaft.period;
    const free = [];
    const half = []; // もう 1 体が乗っている足場の空いた側
    shaft.ledges.forEach((l, i) => {
        for (let k = Math.ceil((SPAWN_LOW + travel - l.y) / period); l.y + k * period - travel <= SPAWN_HIGH; k++) {
            const y = l.y + k * period;
            const riders = enemies.filter((e) => e !== en && e.alive && e.ride === 'ledge' && e.rideLedge === i && e.rideY === y);
            for (const slot of SLOTS)
                if (!riders.some((e) => e.rideSlot === slot))
                    (riders.length > 0 ? half : free).push({ i, y, slot });
        }
    });
    const from = free.length > 0 ? free : half;
    if (from.length === 0)
        return false;
    const c = from[Math.floor(Math.random() * from.length)];
    en.ride = 'ledge';
    en.rideLedge = c.i;
    en.rideY = c.y;
    en.rideSlot = c.slot;
    en.baseY = c.y - travel;
    const p = en.root.position;
    ledgeSpot(shaft.ledges[c.i], c.slot, p).y = en.baseY;
    en.yaw = Math.atan2(position.x - p.x, position.z - p.z);
    en.root.quaternion.setFromAxisAngle(UP, en.yaw);
    return true;
}
// 足場に乗っている間と、リフトへ飛び乗っている間の動き。この間は歩かせない（true を返す）
const landAt = new THREE.Vector3();
export function updateBoarding(dt) {
    if (en.ride === 'none' || !shaft)
        return false;
    const p = en.root.position;
    if (en.ride === 'leap') {
        if (updateLeap(dt)) {
            en.ride = 'none';
            en.waitT = 0.3; // 着いて一息おいてから歩き出す
        }
        return true;
    }
    const l = shaft.ledges[en.rideLedge];
    en.baseY = en.rideY - travel;
    en.knockVel.set(0, 0, 0); // 足場の上では押し出されない
    const held = env.isHeld();
    // 足場の上から動かされたら（槍で運ばれたなど）、そこからリフトへ飛び降りる
    ledgeSpot(l, en.rideSlot, spot);
    const moved = Math.hypot(p.x - spot.x, p.z - spot.z) > 0.3;
    if (!held && !moved) {
        p.x = spot.x;
        p.z = spot.z;
    }
    if (en.airY > 0 || en.airVel > 0)
        updateEnemyAir(dt);
    else
        p.y = en.baseY;
    const leapAt = THREE.MathUtils.lerp(LEAP_LOW, LEAP_HIGH, THREE.MathUtils.clamp((en.speedMul - 0.85) / 0.35, 0, 1));
    if (held || (!moved && en.baseY > leapAt))
        return true;
    if (moved) {
        landAt.set(THREE.MathUtils.clamp(p.x, playBounds.minX + LAND_MARGIN, playBounds.maxX - LAND_MARGIN), 0, THREE.MathUtils.clamp(p.z, playBounds.minZ + LAND_MARGIN, playBounds.maxZ - LAND_MARGIN));
    }
    else {
        const off = en.rideSlot * LAND_SPREAD;
        landAt.set(l.to.x + (l.along === 'x' ? off : 0), 0, l.to.z + (l.along === 'z' ? off : 0));
    }
    if (en.kind === 'striker') {
        en.ride = 'none'; // ストライカーは飛び降りと同じ動きで着く（enemy/striker.ts）
        leapStriker(landAt);
    }
    else {
        en.ride = 'leap';
        startLeap(landAt);
    }
    return true;
}

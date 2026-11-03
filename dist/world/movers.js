import { shipState } from './shipState.js?v=6b2d2aee';
import * as THREE from 'three';
import { blocks } from './blocks.js?v=6b2d2aee';
import { EYE_HEIGHT, PLAYER_RADIUS } from '../player/config.js?v=6b2d2aee';
import { lookEuler, mantleFrom, mantleTo, player, position, velocity } from '../player/state.js?v=6b2d2aee';
import { sickleState } from '../weapons/sickleCombat.js?v=6b2d2aee';
import { hooks } from '../game/hooks.js?v=6b2d2aee';
import { game } from '../game/state.js?v=6b2d2aee';
import * as sfx from '../audio.js?v=6b2d2aee';
import { enemies } from '../enemy/state.js?v=6b2d2aee';
const movers = [];
let hurry = false;
// 駅の電車は平行移動だけ。静止電車には mover がない。
export function trainOffset(index) {
    const m = movers[index];
    return m ? moverOffset(m, m.clock).z : 0;
}
// 車にはねられたとき
const HAZARD_SPEED = 2; // これより速く動いている間だけ跳ね飛ばす (m/s)
const HAZARD_DAMAGE = 10;
const HAZARD_THROW = 1.3; // 跳ね飛ばす水平の速さ（車の速さに掛ける）
const HAZARD_THROW_MIN = 10; // 跳ね飛ばす水平の速さの下限 (m/s)
const HAZARD_LIFT = 6; // 跳ね上げる速さ (m/s)
const HAZARD_COOL = 1; // 続けてはねられない時間 (s)
const PLAYER_HEIGHT = EYE_HEIGHT + 0.2;
// 引き戸: 止まってから DOOR_AFTER 秒で開き始め、走り出す DOOR_BEFORE 秒前に閉まり始める。開け閉めに DOOR_TIME 秒
const DOOR_AFTER = 0.3;
const DOOR_BEFORE = 2;
const DOOR_TIME = 0.5;
// ステージへ入り直すときに外す（blocks は呼ぶ側で空にする）
export function clearMovers() {
    movers.length = 0;
    hurry = false;
}
// roots は部品ごとの親（def.parts と同じ順）、doorRoots はその中の引き戸ごとの親（部品の親の子）。当たり判定の箱を blocks に足す。
// 継ぎ目のつっかえを消すまとめ（mergeBoxes）は、動かす箱には掛けない
export function addMover(def, roots, doorRoots) {
    const track = (s) => {
        const base = { minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, h: s.h, y0: s.y0 };
        const b = { ...base };
        blocks.push(b);
        return { b, base };
    };
    const parts = def.parts.map((p, i) => {
        const doors = (p.doors ?? []).map((d, j) => ({ slide: d.slide, root: doorRoots[i][j], blocks: d.colliders.map(track), open: 0 }));
        return {
            def: p,
            root: roots[i],
            // 引き戸の当たり判定も、部品と一緒に運ぶ
            boxes: [...[...p.boxes, ...(p.colliders ?? [])].map(track), ...doors.flatMap((d) => d.blocks)],
            doors,
            x: 0,
            z: 0,
            yaw: 0,
        };
    });
    movers.push({ def, parts, period: def.path.reduce((t, s) => t + s.time, 0), vx: 0, vz: 0, hitCool: 0, clock: 0, cargoX: 0, cargoV: 0, fallen: false });
}
// 時刻 t での、動き出す前の位置からのずれと向き
const at = { x: 0, z: 0, yaw: 0 };
const EASE = {
    both: (u) => u * u * (3 - 2 * u),
    in: (u) => u * u,
    out: (u) => u * (2 - u),
    none: (u) => u,
};
function moverOffset(m, t) {
    if (m.def.cargo) {
        at.x = m.cargoX;
        at.z = 0;
        at.yaw = 0;
        return at;
    }
    let u = ((t % m.period) + m.period) % m.period; // 始まる前の時刻（負）は、1 周前として見る
    let px = 0;
    let pz = 0;
    let pyaw = 0;
    for (const s of m.def.path) {
        const yaw = s.yaw ?? pyaw;
        if (u < s.time) {
            const k = EASE[s.ease ?? 'both'](u / s.time);
            at.x = px + (s.x - px) * k;
            at.z = pz + (s.z - pz) * k;
            at.yaw = pyaw + (yaw - pyaw) * k;
            return at;
        }
        u -= s.time;
        px = s.x;
        pz = s.z;
        pyaw = yaw;
    }
    at.x = px;
    at.z = pz;
    at.yaw = pyaw;
    return at;
}
// (x, z) が箱の上面に載っているか（collideBox で上面に乗せるときと同じ幅で見る）
const onTop = (b, x, z) => Math.hypot(x - THREE.MathUtils.clamp(x, b.minX, b.maxX), z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ)) < PLAYER_RADIUS * 0.5;
// 円柱（足もと y0 から頭 y1、半径 r）が箱に触れているか。上に載っているだけなら触れていない
const touches = (b, x, z, y0, y1, r) => y0 < b.h - 0.05 && y1 > (b.y0 ?? 0)
    && Math.hypot(x - THREE.MathUtils.clamp(x, b.minX, b.maxX), z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ)) < r;
// 動き出す前の位置にある点 (x, z) を、ずれ (ox, oz) と向き yaw（pivot まわり）の位置へ移す
const ORIGIN = { x: 0, z: 0 };
const moved = { x: 0, z: 0 };
function place(pivot, ox, oz, yaw, x, z) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lx = x - pivot.x;
    const lz = z - pivot.z;
    // three.js の y 軸まわりの回転と同じ向き（上から見て左回り）
    moved.x = pivot.x + ox + c * lx + s * lz;
    moved.z = pivot.z + oz - s * lx + c * lz;
    return moved;
}
// 部品の上にある点 v を、部品と一緒に、いまの位置から新しい位置 (nx, nz, nyaw) へ運ぶ
function carry(pivot, p, nx, nz, nyaw, v) {
    // いまの向きを戻して、動き出す前の位置での座標にする
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const lx = v.x - pivot.x - p.x;
    const lz = v.z - pivot.z - p.z;
    const q = place(pivot, nx, nz, nyaw, pivot.x + c * lx - s * lz, pivot.z + s * lx + c * lz);
    v.x = q.x;
    v.z = q.z;
}
// 急ぐ間は、道のりの skip の待ちを飛ばす（駅で降りる敵が待っているときに、電車を早く来させる）
export function setMoversHurry(on) {
    hurry = on;
}
// 時刻 t が skip の待ちの中なら、その待ちの終わりの時刻を返す
function skipWait(m, t) {
    let u = ((t % m.period) + m.period) % m.period;
    for (const s of m.def.path) {
        if (u < s.time)
            return s.skip ? t + (s.time - u) : t;
        u -= s.time;
    }
    return t;
}
// SHIP cargo is integrated in small steps so contacts remain ordered on long frames.
function updateCargo(dt) {
    const cargo = movers.filter((m) => m.def.cargo && !m.fallen);
    const steps = Math.max(1, Math.ceil(dt / 0.01));
    const step = dt / steps;
    for (let n = 0; n < steps; n++) {
        for (const m of cargo) {
            if (m.fallen)
                continue;
            const c = m.def.cargo;
            const oldV = m.cargoV;
            // 傾きが 4° より浅いと滑らせず、滑っている物はブレーキをかけて止める（浅い揺れでは甲板の途中で止まる）
            const still = Math.abs(shipState.roll) < 4 * Math.PI / 180;
            const acceleration = still ? 0 : -Math.sin(shipState.roll) * 65;
            m.cargoV += acceleration * step;
            const friction = (still ? 7 : 1.5) * step;
            m.cargoV = Math.sign(m.cargoV) * Math.max(0, Math.abs(m.cargoV) - friction);
            m.cargoV = THREE.MathUtils.clamp(m.cargoV, -14, 14);
            m.cargoX += m.cargoV * step;
            const side = c.minX + m.cargoX < -c.rail ? -1 : c.maxX + m.cargoX > c.rail ? 1 : 0;
            if (!side)
                continue;
            const impact = m.cargoV;
            m.cargoX = side < 0 ? -c.rail - c.minX : c.rail - c.maxX;
            slamSound(m, impact);
            const remaining = cargo.filter((other) => !other.fallen && other.def.cargo.band === c.band).length;
            const waveFalls = shipState.fallen.filter((f) => f.wave === shipState.wave).length;
            if (shipState.big > 0 && Math.abs(impact) >= 10 && Math.sign(impact) === side && remaining > 1 && waveFalls < 2) {
                m.fallen = true;
                for (const part of m.parts) {
                    for (const { b } of part.boxes) {
                        const index = blocks.indexOf(b);
                        if (index >= 0)
                            blocks.splice(index, 1);
                    }
                    shipState.fallen.push({ root: part.root, time: shipState.time, direction: side, wave: shipState.wave });
                }
            }
            else if (Math.abs(oldV) > 2 && m.parts.some(isRidingCargo)) {
                velocity.x += oldV * 0.8;
                velocity.y = Math.max(velocity.y, 3);
                player.onGround = false;
            }
            m.cargoV = 0;
        }
        // Repeated relaxation handles a chain of contacting cargo and rail constraints.
        for (let pass = 0; pass < cargo.length + 1; pass++) {
            let changed = false;
            for (let j = 0; j < cargo.length; j++)
                for (let k = j + 1; k < cargo.length; k++) {
                    const a = cargo[j], b = cargo[k], ca = a.def.cargo, cb = b.def.cargo;
                    if (a.fallen || b.fallen || ca.band !== cb.band)
                        continue;
                    const left = ca.minX < cb.minX ? a : b, right = left === a ? b : a;
                    const l = left.def.cargo, r = right.def.cargo;
                    const overlap = l.maxX + left.cargoX - r.minX - right.cargoX;
                    if (overlap <= 0)
                        continue;
                    const oldLeftX = left.cargoX, oldRightX = right.cargoX;
                    const roomL = l.minX + left.cargoX + l.rail;
                    const roomR = r.rail - r.maxX - right.cargoX;
                    const shiftL = Math.min(Math.max(0, roomL), overlap / 2 + Math.max(0, overlap / 2 - roomR));
                    left.cargoX -= shiftL;
                    right.cargoX += overlap - shiftL;
                    if (left.cargoX !== oldLeftX || right.cargoX !== oldRightX)
                        changed = true;
                    if (left.cargoV > right.cargoV) {
                        changed = true; // This branch can also push the player.
                        const v = (left.cargoV + right.cargoV) / 2;
                        for (const m of [left, right]) {
                            const lost = m.cargoV - v;
                            if (Math.abs(lost) > 2 && m.parts.some(isRidingCargo)) {
                                velocity.x += m.cargoV * 0.8;
                                velocity.y = Math.max(velocity.y, 3);
                                player.onGround = false;
                            }
                        }
                        left.cargoV = right.cargoV = v;
                    }
                }
            // Without a position change or velocity response, the next pass is identical.
            if (!changed)
                break;
        }
    }
    // 落ちた積み荷が海へ落ちていく動きは world/sea.ts
}
// 積み荷が手すりにぶつかった音。近いほど大きく、左右は聞こえる向きに振る
const SLAM_MIN = 4; // これより遅ければ鳴らさない (m/s)
const SLAM_HEAR = 45; // これより遠ければ聞こえない (m)
function slamSound(m, impact) {
    const speed = Math.abs(impact);
    const b = m.parts[0]?.boxes[0]?.b;
    if (speed < SLAM_MIN || !b)
        return;
    const dx = (b.minX + b.maxX) / 2 - position.x;
    const dz = (b.minZ + b.maxZ) / 2 - position.z;
    const far = Math.hypot(dx, dz) / SLAM_HEAR;
    if (far >= 1)
        return;
    // 視点の右の向き（-z を向いて yaw 0）
    const pan = THREE.MathUtils.clamp((dx * Math.cos(lookEuler.y) - dz * Math.sin(lookEuler.y)) / 15, -1, 1);
    sfx.playCargoSlam(Math.min(1, speed / 14), (1 - far) ** 2, pan);
}
function isRidingCargo(p) {
    return (player.onGround && player.mantleTime < 0 && p.boxes.some(({ b }) => Math.abs(position.y - b.h) < 1e-3 && onTop(b, position.x, position.z)))
        || inRoom(p, position.x, position.z, position.y);
}
export function inheritCargoVelocity(worldSlow) {
    const m = movers.find((m) => m.def.cargo && !m.fallen && m.parts.some(isRidingCargo));
    if (m)
        velocity.x += m.cargoV * worldSlow;
}
export function updateMovers(dt) {
    if (dt > 0)
        updateCargo(dt);
    for (const m of movers) {
        if (m.fallen)
            continue;
        m.clock += dt;
        if (hurry)
            m.clock = skipWait(m, m.clock);
        const clock = m.clock;
        m.hitCool -= dt;
        // 引き戸は先に動かす（中で moverOffset を呼ぶので、next を取った後に呼ぶと next が書き換わる）
        if (m.parts.some((p) => p.doors.length > 0))
            updateDoors(m, dt);
        const next = moverOffset(m, clock);
        const pivot = m.def.pivot ?? ORIGIN;
        for (const p of m.parts) {
            const nx = p.def.follow === 'z' ? 0 : next.x;
            const nz = p.def.follow === 'x' ? 0 : next.z;
            const nyaw = next.yaw;
            const dx = nx - p.x;
            const dz = nz - p.z;
            const dyaw = nyaw - p.yaw;
            if (p === m.parts[0] && dt > 0) {
                m.vx = dx / dt;
                m.vz = dz / dt;
            }
            if (dx === 0 && dz === 0 && dyaw === 0)
                continue;
            // 動かす前に、何が載っているかを調べておく。車が走っている間は、載っていても運ばない（下をすり抜けて落ちる）
            // 傷を負わせない物（船の滑る積み荷）は、速くても載っている人を運ぶ
            const racing = !!m.def.hazard && !m.def.harmless && dt > 0 && Math.hypot(dx, dz) / dt > HAZARD_SPEED;
            const riding = !racing && player.onGround && player.mantleTime < 0 && p.boxes.some(({ b }) => Math.abs(position.y - b.h) < 1e-3 && onTop(b, position.x, position.z));
            // 中に入れる物（扉の開いたコンテナ）の中にいれば、床が動かなくても一緒に運ぶ
            const within = !riding && inRoom(p, position.x, position.z, position.y);
            const mantling = player.mantleTime >= 0 && p.boxes.some(({ b }) => Math.abs(mantleTo.y - b.h) < 1e-3 && onTop(b, mantleTo.x, mantleTo.z));
            const g = sickleState.grapple;
            const hooked = !!g?.block && p.boxes.some(({ b }) => b === g.block);
            if (m.def.cargo)
                for (const e of enemies) {
                    if (!e.alive)
                        continue;
                    const ep = e.root.position;
                    const onCargo = e.airY <= 0 && p.boxes.some(({ b }) => Math.abs(ep.y - b.h) < 0.05 && onTop(b, ep.x, ep.z));
                    if (onCargo || inRoom(p, ep.x, ep.z, ep.y))
                        carry(pivot, p, nx, nz, nyaw, ep);
                }
            if (riding || within) {
                carry(pivot, p, nx, nz, nyaw, position);
                lookEuler.y += dyaw; // 車が曲がれば、乗っている人も一緒に向きを変える
            }
            if (mantling) {
                carry(pivot, p, nx, nz, nyaw, mantleFrom);
                carry(pivot, p, nx, nz, nyaw, mantleTo);
            }
            if (hooked && g)
                for (const v of [g.target, g.zipFrom, g.zipTo])
                    carry(pivot, p, nx, nz, nyaw, v);
            p.x = nx;
            p.z = nz;
            p.yaw = nyaw;
            for (const { b, base } of p.boxes) {
                if (nyaw === 0) {
                    b.minX = base.minX + nx;
                    b.maxX = base.maxX + nx;
                    b.minZ = base.minZ + nz;
                    b.maxZ = base.maxZ + nz;
                    continue;
                }
                // 回した箱の四隅を囲む
                b.minX = b.minZ = Infinity;
                b.maxX = b.maxZ = -Infinity;
                for (const x of [base.minX, base.maxX]) {
                    for (const z of [base.minZ, base.maxZ]) {
                        const q = place(pivot, nx, nz, nyaw, x, z);
                        b.minX = Math.min(b.minX, q.x);
                        b.maxX = Math.max(b.maxX, q.x);
                        b.minZ = Math.min(b.minZ, q.z);
                        b.maxZ = Math.max(b.maxZ, q.z);
                    }
                }
            }
            // 親は原点まわりに回るので、pivot まわりになるよう位置をずらす
            const o = place(pivot, nx, nz, nyaw, 0, 0);
            p.root.position.set(o.x, 0, o.z);
            p.root.rotation.y = nyaw;
        }
        // 中にいる人は、壁に触れていても跳ね飛ばさない
        if (m.def.hazard && !m.parts.some((p) => inRoom(p, position.x, position.z, position.y)))
            hitPlayer(m);
    }
}
// (x, z, y) が部品の中の空間（rooms。動き出す前の位置で書いてある）にあるか。向きを変える物には使わない
function inRoom(p, x, z, y) {
    return (p.def.rooms ?? []).some((r) => x > r.minX + p.x && x < r.maxX + p.x && z > r.minZ + p.z && z < r.maxZ + p.z && y > (r.y0 ?? 0) - 0.1 && y < r.h);
}
// frontOnly の車は、進む向きの先頭（先端から FRONT_REACH の間）にいるときだけ当たる。横から触れるだけなら平気
const FRONT_REACH = 1.5;
function atFront(m, x, z, speed) {
    if (!m.def.frontOnly)
        return true;
    const dx = m.vx / speed;
    const dz = m.vz / speed;
    let front = -Infinity;
    for (const p of m.parts) {
        for (const { b } of p.boxes) {
            for (const bx of [b.minX, b.maxX]) {
                for (const bz of [b.minZ, b.maxZ])
                    front = Math.max(front, bx * dx + bz * dz);
            }
        }
    }
    return x * dx + z * dz >= front - FRONT_REACH;
}
// 引き戸を開け閉めする。止まってしばらくしたら開き、走り出す少し前に閉まる。
// 閉まりきるまでは通れる。閉まりきったときにプレイヤーが戸の所にいれば、出るまで当たり判定を効かせない（車内に閉じ込めない）
function updateDoors(m, dt) {
    const clock = m.clock;
    const now = moverOffset(m, clock);
    const [x, z] = [now.x, now.z];
    const still = (t) => {
        const a = moverOffset(m, t);
        return Math.abs(a.x - x) < 1e-3 && Math.abs(a.z - z) < 1e-3;
    };
    const open = still(clock - DOOR_AFTER) && still(clock + DOOR_BEFORE);
    const top = position.y + PLAYER_HEIGHT;
    for (const p of m.parts) {
        for (const d of p.doors) {
            d.open = THREE.MathUtils.clamp(d.open + (open ? dt : -dt) / DOOR_TIME, 0, 1);
            d.root.position.z = d.slide * EASE.both(d.open);
            for (const { b, base } of d.blocks) {
                const blocked = b.h > (b.y0 ?? 0);
                const shut = d.open === 0 && (blocked || !touches({ ...b, h: base.h }, position.x, position.z, position.y, top, PLAYER_RADIUS));
                b.h = shut ? base.h : (b.y0 ?? 0) - 1;
            }
        }
    }
}
// 動いている車にプレイヤーが触れたら、車の進む向きへ跳ね飛ばす（harmless なら傷は負わせない）
function hitPlayer(m) {
    const speed = Math.hypot(m.vx, m.vz);
    if (speed < HAZARD_SPEED || m.hitCool > 0 || game.playerHp <= 0 || !atFront(m, position.x, position.z, speed))
        return;
    const top = position.y + PLAYER_HEIGHT;
    if (!m.parts.some((p) => p.boxes.some(({ b }) => touches(b, position.x, position.z, position.y, top, PLAYER_RADIUS + 0.05))))
        return;
    m.hitCool = HAZARD_COOL;
    const throwSpeed = Math.max(speed * HAZARD_THROW, HAZARD_THROW_MIN);
    velocity.set((m.vx / speed) * throwSpeed, HAZARD_LIFT, (m.vz / speed) * throwSpeed);
    player.onGround = false;
    sfx.playAxeGround(1.2);
    if (m.def.harmless) {
        hooks.addTrauma(0.5);
        return;
    }
    hooks.damagePlayer(HAZARD_DAMAGE);
    sfx.playHurt();
    hooks.addTrauma(0.8);
}
// index 番目の動く物が、動き出す前の位置（駅）に止まって引き戸が開ききっていて、ahead 秒先まで動かないか（その動く物が無ければ true）。
// 遠くで待っている間（駅にいない）は false
export function trainNeedsClear(index, x, z, y, dt) {
    const m = movers[index];
    if (!m || y < 0.9 || Math.abs(x) < 12)
        return false;
    const now = moverOffset(m, m.clock);
    if (Math.abs(now.x) > 1e-3 || Math.abs(now.z) > 1e-3)
        return false;
    const future = moverOffset(m, m.clock + DOOR_BEFORE + 0.25 + dt);
    if (Math.abs(future.x) < 1e-3 && Math.abs(future.z) < 1e-3)
        return false;
    return m.parts.some((p) => {
        const boxes = p.boxes.map(({ b }) => b);
        return boxes.length > 0 && x >= Math.min(...boxes.map((b) => b.minX)) && x <= Math.max(...boxes.map((b) => b.maxX))
            && z >= Math.min(...boxes.map((b) => b.minZ)) && z <= Math.max(...boxes.map((b) => b.maxZ));
    });
}
export function moverDocked(ahead, index) {
    const m = movers[index];
    if (!m)
        return true;
    const home = (t) => {
        const a = moverOffset(m, t);
        return Math.abs(a.x) < 1e-3 && Math.abs(a.z) < 1e-3;
    };
    // 間で動いて戻ってくることは無いものとして、前後と途中の時刻を見る
    const clock = m.clock;
    return home(clock - DOOR_AFTER - DOOR_TIME) && home(clock) && home(clock + ahead / 2) && home(clock + ahead);
}
// これから ahead 秒の間に、走っている車が足もと y0・高さ h・半径 r の円柱に触れるか（道のりを先まで読む）。
// 触れるなら、out にその車の進む向きと直角で、車の真ん中から離れる側の向きを入れる
const THREAT_STEP = 0.1;
const box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: 0, y0: 0 };
export function moverThreat(x, z, y0, h, r, ahead, out) {
    for (const m of movers) {
        if (!m.def.hazard)
            continue;
        const pivot = m.def.pivot ?? ORIGIN;
        for (let t = 0; t <= ahead + 1e-6; t += THREAT_STEP) {
            const a = moverOffset(m, m.clock + t);
            const [ox, oz, yaw] = [a.x, a.z, a.yaw];
            const b = moverOffset(m, m.clock + t + 0.05);
            const vx = b.x - ox;
            const vz = b.z - oz;
            const speed = Math.hypot(vx, vz) / 0.05;
            if (speed < HAZARD_SPEED)
                continue;
            const hit = m.parts.some((p) => p.boxes.some(({ base }) => {
                box.minX = box.minZ = Infinity;
                box.maxX = box.maxZ = -Infinity;
                for (const bx of [base.minX, base.maxX]) {
                    for (const bz of [base.minZ, base.maxZ]) {
                        const q = place(pivot, ox, oz, yaw, bx, bz);
                        box.minX = Math.min(box.minX, q.x);
                        box.maxX = Math.max(box.maxX, q.x);
                        box.minZ = Math.min(box.minZ, q.z);
                        box.maxZ = Math.max(box.maxZ, q.z);
                    }
                }
                box.h = base.h;
                box.y0 = base.y0;
                return touches(box, x, z, y0, y0 + h, r);
            }));
            if (!hit)
                continue;
            // 車の真ん中から見て、進む向きの左右どちらにいるか
            const cx = pivot.x + ox;
            const cz = pivot.z + oz;
            const side = (x - cx) * -vz + (z - cz) * vx >= 0 ? 1 : -1;
            out.set(-vz * side, 0, vx * side).normalize();
            return true;
        }
    }
    return false;
}
// 動いている車が、足もと y0・高さ h・半径 r の敵に触れているか。触れていれば車の水平の速度を返す
const hazardVel = new THREE.Vector3();
export function moverHazardAt(x, z, y0, h, r) {
    for (const m of movers) {
        const speed = Math.hypot(m.vx, m.vz);
        if (!m.def.hazard || speed < HAZARD_SPEED || !atFront(m, x, z, speed))
            continue;
        if (m.parts.some((p) => p.boxes.some(({ b }) => touches(b, x, z, y0, y0 + h, r))))
            return hazardVel.set(m.vx, 0, m.vz);
    }
    return null;
}
// Cargo is handled separately from vehicles, including when it stops against a rail.
export function hasCargo() { return movers.some((m) => !!m.def.cargo); }
// Sample live cargo surfaces and open rooms, leaving room for the whole body.
export function cargoSpawnPoints(radius, height) {
    const points = [];
    const sample = (area, y, top) => {
        const margin = radius + 0.15;
        const x0 = area.minX + margin, x1 = area.maxX - margin;
        const z0 = area.minZ + margin, z1 = area.maxZ - margin;
        if (x0 > x1 || z0 > z1)
            return;
        const nx = Math.max(1, Math.ceil((x1 - x0) / 1.5));
        const nz = Math.max(1, Math.ceil((z1 - z0) / 1.5));
        for (let i = 0; i <= nx; i++)
            for (let j = 0; j <= nz; j++) {
                const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
                const blocked = blocks.some((b) => b.h > y + 0.05 && (top || (b.y0 ?? 0) < y + height)
                    && Math.hypot(x - THREE.MathUtils.clamp(x, b.minX, b.maxX), z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ)) < margin);
                if (!blocked)
                    points.push({ x, y, z });
            }
    };
    for (const m of movers) {
        if (!m.def.cargo || m.fallen)
            continue;
        for (const p of m.parts) {
            for (const { b } of p.boxes)
                sample(b, b.h, true);
            for (const room of p.def.rooms ?? []) {
                if (room.h - (room.y0 ?? 0) < height)
                    continue;
                sample({ minX: room.minX + p.x, maxX: room.maxX + p.x, minZ: room.minZ + p.z, maxZ: room.maxZ + p.z }, room.y0 ?? 0, false);
            }
        }
    }
    return points;
}
// Return the closest approaching face and its live block for landing tracking.
export function approachingCargo(x, z, y, h, r) {
    let best = null;
    for (const m of movers) {
        if (!m.def.cargo || m.fallen || Math.abs(m.cargoV) < 0.15)
            continue;
        for (const p of m.parts) {
            if (inRoom(p, x, z, y))
                continue;
            for (const { b } of p.boxes) {
                if (b.h <= y + 0.1 || (b.y0 ?? 0) >= y + h || z < b.minZ - r || z > b.maxZ + r)
                    continue;
                const gap = m.cargoV > 0 ? x - r - b.maxX : b.minX - x - r;
                if (gap < -0.1 || gap > Math.abs(m.cargoV) * 1.8 + 1)
                    continue;
                const time = Math.max(0, gap) / Math.abs(m.cargoV);
                if (!best || time < best.time)
                    best = { block: b, speed: m.cargoV, time };
            }
        }
    }
    return best;
}
export function cargoBlockActive(block) {
    return movers.some((m) => !!m.def.cargo && !m.fallen && m.parts.some((p) => p.boxes.some((box) => box.b === block)));
}
export function cargoBlocksAhead(x, z, y, h, r) {
    return movers.some((m) => !m.fallen && !!m.def.cargo && m.parts.some((p) => p.boxes.some(({ b }) => {
        const dx = m.cargoV;
        const swept = { ...b, minX: b.minX + Math.min(0, dx), maxX: b.maxX + Math.max(0, dx) };
        return touches(swept, x, z, y, y + h, r);
    })));
}
export function cargoContact(x, z, y, h, r) {
    for (const m of movers) {
        if (!m.def.cargo || m.fallen || Math.abs(m.vx) < 1e-6)
            continue;
        for (const p of m.parts) {
            if (inRoom(p, x, z, y))
                continue;
            for (const { b } of p.boxes)
                if (touches(b, x, z, y, y + h, r))
                    return { block: b, dx: m.vx };
        }
    }
    return null;
}

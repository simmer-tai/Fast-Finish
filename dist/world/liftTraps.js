import * as THREE from 'three';
import * as sfx from '../audio.js';
import { en, enemies, hitDir, setEn, RESPAWN_RISE_TIME } from '../enemy/state.js';
import { DUMMY_HEIGHT, DUMMY_RADIUS } from '../enemy/body.js';
import { knockEnemy } from '../enemy/motion.js';
import { staggerDummy } from '../enemy/stagger.js';
import { GRAVITY, PLAYER_RADIUS } from '../player/config.js';
import { player, position, velocity } from '../player/state.js';
import { hooks } from '../game/hooks.js';
import { spawnSparks } from '../fx/hitFx.js';
import { UP } from '../math.js';
import { rand } from '../random.js';
import { STRUCT_GRID, boxGeo, gridMaterial } from './blocks.js';
import { shaftTravel } from './shaft.js';
const LEVELS = {
    // 次を出すまでの間 (s)。0 は出さない。double は落下物が 2 つ同時に落ちてくる割合
    easy: { laser: 22, drop: 0, steam: 0, patterns: ['half'], double: 0 },
    normal: { laser: 17, drop: 8, steam: 0, patterns: ['half'], double: 0 },
    hard: { laser: 8, drop: 3.5, steam: 5, patterns: ['half', 'cross', 'outer'], double: 0.5 },
};
const FIRST = { laser: 3, drop: 9, steam: 6 }; // 動き出してから最初の罠を出すまで (s)
const LIFT_TOP = 0.15; // 体の上端に足す余裕 (m)
// 敵への当たり: 削らずに、よろめかせる強さ（knock）と押し飛ばす強さ（push。0 は押さない）
const LASER_ENEMY = { knock: 300, push: 0 };
const DROP_ENEMY = { knock: 500, push: 600 };
const STEAM_ENEMY = { knock: 400, push: 900 };
// ---- 共通 ----
let level = null;
let shaft = null;
let deck = 9.4; // リフトの床の半幅
let parent = null; // リフトに対して止まっている物（落下物と床の印）
const shaftRoot = new THREE.Group(); // シャフトに付いた物（レーザーと噴き出し口）。昇った分だけ下げる
const timers = { laser: 0, drop: 0, steam: 0 };
const trapMat = gridMaterial(STRUCT_GRID, undefined, 'part');
// 格子の付いた箱（真ん中を原点にする）
function gridBox(sx, sy, sz, light) {
    const m = new THREE.InstancedMesh(boxGeo, trapMat, 1);
    m.setMatrixAt(0, new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(-sx / 2, -sy / 2, -sz / 2));
    m.setColorAt(0, new THREE.Color().setHSL(0, 0, light));
    m.castShadow = m.receiveShadow = true;
    return m;
}
// 床の印: 罠の来る所を赤く塗る。近づくほど濃く、速く明滅する
const markGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function floorMark(x0, x1, z0, z1) {
    const m = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false }));
    m.scale.set(x1 - x0, 1, z1 - z0);
    m.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    m.renderOrder = 1;
    return m;
}
function setMark(m, k, t) {
    const blink = 0.55 + 0.45 * Math.sin(t * (6 + 22 * k));
    m.material.opacity = (0.08 + 0.32 * k) * blink;
}
// 外す。床の印のマテリアルだけは 1 つずつ作っているので捨てる（ほかは使い回し）
function dropMesh(o) {
    o.removeFromParent();
    if (o instanceof THREE.Mesh && o.geometry === markGeo)
        o.material.dispose();
}
// プレイヤーの体（足もとから頭まで）
const playerTop = () => position.y + player.eyeHeight + LIFT_TOP;
// 罠に掛けてよい敵（現れきっていて、生きている）
const live = (e) => e.alive && e.riseTime >= RESPAWN_RISE_TIME;
// 敵 e を罠でよろめかせる。体力は削らない（罠では倒れない）。プレイヤーの当たりにも数えない（en は元に戻す）
function hitEnemy(e, hit, dir, at) {
    const keep = en;
    setEn(e);
    hitDir.set(dir.x, 0, dir.z);
    if (hitDir.lengthSq() < 1e-6)
        hitDir.set(0, 0, 1);
    hitDir.normalize();
    staggerDummy(hit.knock, at);
    e.flashT = 0; // 白く光って、少しの間止まる
    spawnSparks(at, hitDir, 8, 0.8, 0.6);
    if (hit.push > 0)
        knockEnemy(hitDir, hit.push);
    setEn(keep);
}
function hurtPlayer(amount, trauma) {
    hooks.damagePlayer(amount);
    sfx.playHurt();
    hooks.addTrauma(trauma);
}
// ステージへ入るときに呼ぶ（シャフトの無いステージでは def を null）
export function setLiftTraps(def, lv, bounds, root) {
    clearTraps();
    shaft = def;
    level = def ? LEVELS[lv] : null;
    deck = bounds.maxX + 0.4;
    parent = root;
    root.add(shaftRoot);
    timers.laser = FIRST.laser;
    timers.drop = FIRST.drop;
    timers.steam = FIRST.steam;
}
function clearTraps() {
    for (const s of sheets)
        dropSheet(s);
    sheets.length = 0;
    for (const d of drops)
        dropFalling(d);
    drops.length = 0;
    for (const v of vents)
        dropVent(v);
    vents.length = 0;
    for (const p of puffs)
        p.sprite.visible = false;
}
const dangers = [];
function addDanger(x, y, z, k, above = false) {
    dangers.push({ x, y, z, k, above });
}
export const liftDangers = () => dangers;
let clock = 0;
export function updateLiftTraps(dt, running) {
    dangers.length = 0;
    if (!level || !shaft || !parent)
        return;
    clock += dt;
    // 倒しきったか倒れたら、残っている罠は消して、もう出さない
    if (!running) {
        if (sheets.length + drops.length + vents.length > 0)
            clearTraps();
        updatePuffs(dt);
        return;
    }
    const travel = shaftTravel();
    shaftRoot.position.y = -travel;
    for (const key of ['laser', 'drop', 'steam']) {
        if (level[key] <= 0)
            continue;
        timers[key] -= dt;
        if (timers[key] > 0)
            continue;
        timers[key] = level[key] * rand(0.85, 1.15);
        if (key === 'laser')
            spawnSheet(travel);
        else if (key === 'drop') {
            spawnDrop(true);
            if (Math.random() < level.double)
                spawnDrop(false);
        }
        else
            spawnVent(travel);
    }
    updateSheets(travel);
    updateDrops(dt);
    updateVents(dt, travel);
    updatePuffs(dt);
}
// ---- 1. 降りてくるレーザー ----
// 光線は along の向きに壁から壁へ張る。bands はもう一方の向きで覆う範囲（その中に 0.45m おきに並べる）
const SHEET_SPAWN = 45; // リフトの床からこの高さに出す（霧の手前から降りてくるのが見える）
const SHEET_WARN = 14; // この高さまで降りてきたら、床に印を出して鳴らす
const SHEET_GAP = 0.45; // 光線の間隔（すり抜けられない）
const LASER_DAMAGE = 25;
const sheets = [];
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const beamGeo = new THREE.BoxGeometry(1, 1, 1);
function spawnSheet(travel) {
    const pattern = level.patterns[Math.floor(Math.random() * level.patterns.length)];
    const along = Math.random() < 0.5 ? 'x' : 'z';
    const side = Math.random() < 0.5 ? -1 : 1;
    const inner = shaft.inner;
    // 覆う範囲: half は片側の半分、outer は真ん中の通り道を残した両側、cross は直角に重ねた 2 つの半分（四半分だけ空く）
    const sets = pattern === 'half' ? [{ along, bands: [side < 0 ? [-deck, 0.3] : [-0.3, deck]] }]
        : pattern === 'outer' ? [{ along, bands: [[-deck, -2.5], [2.5, deck]] }]
            : [{ along: 'x', bands: [side < 0 ? [-deck, 0.3] : [-0.3, deck]] }, { along: 'z', bands: [Math.random() < 0.5 ? [-deck, 0.3] : [-0.3, deck]] }];
    // 直角に重ねるものは、高さを少しずらして 2 枚にする
    sets.forEach((set, k) => {
        const y = travel + SHEET_SPAWN + k * 1.2;
        const group = new THREE.Group();
        group.position.y = y;
        const marks = [];
        for (const [b0, b1] of set.bands) {
            for (let c = b0; c <= b1 + 1e-6; c += SHEET_GAP) {
                for (const [mat, w] of [[coreMat, 0.035], [glowMat, 0.13]]) {
                    const beam = new THREE.Mesh(beamGeo, mat);
                    if (set.along === 'x') {
                        beam.scale.set(2 * inner, w, w);
                        beam.position.set(0, 0, c);
                    }
                    else {
                        beam.scale.set(w, w, 2 * inner);
                        beam.position.set(c, 0, 0);
                    }
                    group.add(beam);
                }
            }
            // 両側の壁の発射口
            for (const s of [-1, 1]) {
                const len = b1 - b0 + 0.4;
                const box = set.along === 'x' ? gridBox(0.4, 0.4, len, 0.25) : gridBox(len, 0.4, 0.4, 0.25);
                if (set.along === 'x')
                    box.position.set(s * (inner - 0.2), 0, (b0 + b1) / 2);
                else
                    box.position.set((b0 + b1) / 2, 0, s * (inner - 0.2));
                group.add(box);
            }
            const mark = set.along === 'x' ? floorMark(-deck, deck, b0, b1) : floorMark(b0, b1, -deck, deck);
            parent.add(mark);
            marks.push(mark);
        }
        shaftRoot.add(group);
        sheets.push({ y, along: set.along, bands: set.bands, group, marks, warned: false, hitPlayer: false, hitEnemies: new Set() });
    });
}
function dropSheet(s) {
    dropMesh(s.group);
    for (const m of s.marks)
        dropMesh(m);
}
// (x, z) にいる半径 r の体が、光線の束に掛かるか
function inSheet(s, x, z, r) {
    const c = s.along === 'x' ? z : x;
    return s.bands.some(([b0, b1]) => c > b0 - r && c < b1 + r);
}
const laserAt = new THREE.Vector3();
const laserDir = new THREE.Vector3();
function updateSheets(travel) {
    for (let i = sheets.length - 1; i >= 0; i--) {
        const s = sheets[i];
        const y = s.y - travel; // 床からの高さ
        const k = THREE.MathUtils.clamp(1 - y / SHEET_WARN, 0, 1);
        for (const m of s.marks) {
            m.visible = y < SHEET_WARN && y > -0.2;
            setMark(m, k, clock);
        }
        if (y < SHEET_WARN && y > position.y - 0.05 && inSheet(s, position.x, position.z, PLAYER_RADIUS))
            addDanger(position.x, y, position.z, k, true);
        if (!s.warned && y < SHEET_WARN) {
            s.warned = true;
            sfx.playSniperAim(0.8);
        }
        // 体の高さを通り過ぎている間に、覆っている所にいれば焼かれる
        if (!s.hitPlayer && y < playerTop() && y > position.y - 0.05 && inSheet(s, position.x, position.z, PLAYER_RADIUS)) {
            s.hitPlayer = true;
            hurtPlayer(LASER_DAMAGE, 0.6);
            sfx.playSniperShot(0.6);
        }
        for (const e of enemies) {
            const p = e.root.position;
            if (!live(e) || s.hitEnemies.has(e) || y > p.y + DUMMY_HEIGHT || y < p.y || !inSheet(s, p.x, p.z, DUMMY_RADIUS))
                continue;
            s.hitEnemies.add(e);
            laserDir.set(p.x - position.x, 0, p.z - position.z);
            hitEnemy(e, LASER_ENEMY, laserDir, laserAt.set(p.x, y, p.z));
        }
        if (y < -3) {
            dropSheet(s);
            sheets.splice(i, 1);
        }
    }
}
// ---- 2. 落下物 ----
// 印を出してから落とす。プレイヤーの少し先（動いている向き）を狙う
const DROP_WARN = 1.3; // 印を出してから落とし始めるまで
const DROP_FROM = 26; // 落とし始める高さ
const DROP_SPEED = 6; // 落とし始めの下向きの速さ（リフトが昇っている分）
const DROP_REST = 0.5; // 床に着いてから崩れ始めるまで
const DROP_FADE = 0.35;
const DROP_DAMAGE = 28;
const DROP_PUSH = 7; // 当たったプレイヤーを押し出す速さ (m/s)
const DROP_LEAD = 0.45; // プレイヤーの動きを先読みする時間 (s)
const DROP_SPREAD = 1.5; // 狙いを散らす幅 (m)
const DROP_SHAPES = [
    { x: 1.4, y: 1.4, z: 1.4, light: 0.38 }, // 箱
    { x: 3.4, y: 0.5, z: 0.5, light: 0.3 }, // 鉄骨（x に沿う）
    { x: 0.5, y: 0.5, z: 3.4, light: 0.3 }, // 鉄骨（z に沿う）
];
const drops = [];
function spawnDrop(aim) {
    const shape = DROP_SHAPES[Math.floor(Math.random() * DROP_SHAPES.length)];
    const lim = (s) => deck - 0.4 - s / 2;
    const x = aim ? position.x + velocity.x * DROP_LEAD + rand(-DROP_SPREAD, DROP_SPREAD) : rand(-deck, deck);
    const z = aim ? position.z + velocity.z * DROP_LEAD + rand(-DROP_SPREAD, DROP_SPREAD) : rand(-deck, deck);
    const d = {
        x: THREE.MathUtils.clamp(x, -lim(shape.x), lim(shape.x)),
        z: THREE.MathUtils.clamp(z, -lim(shape.z), lim(shape.z)),
        size: shape,
        t: 0,
        phase: 'warn',
        y: DROP_FROM,
        vy: -DROP_SPEED,
        mesh: gridBox(shape.x, shape.y, shape.z, shape.light),
        mark: floorMark(0, 0, 0, 0),
        hitPlayer: false,
        hitEnemies: new Set(),
    };
    d.mark.scale.set(shape.x + 0.3, 1, shape.z + 0.3);
    d.mark.position.set(d.x, 0.03, d.z);
    d.mesh.visible = false;
    parent.add(d.mesh, d.mark);
    drops.push(d);
}
function dropFalling(d) {
    dropMesh(d.mesh);
    dropMesh(d.mark);
}
// (x, z) にいる半径 r の体が、落下物の真下に掛かるか
const underDrop = (d, x, z, r) => Math.abs(x - d.x) < d.size.x / 2 + r && Math.abs(z - d.z) < d.size.z / 2 + r;
const dropAt = new THREE.Vector3();
const pushDir = new THREE.Vector3();
function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.t += dt;
        if (d.phase !== 'rest' && !d.hitPlayer && underDrop(d, position.x, position.z, PLAYER_RADIUS)) {
            addDanger(d.x, d.y, d.z, d.phase === 'warn' ? Math.min(1, d.t / DROP_WARN) : 1, true);
        }
        if (d.phase === 'warn') {
            setMark(d.mark, Math.min(1, d.t / DROP_WARN), clock);
            if (d.t >= DROP_WARN) {
                d.phase = 'fall';
                d.mesh.visible = true;
            }
        }
        else if (d.phase === 'fall') {
            setMark(d.mark, 1, clock);
            d.vy -= GRAVITY * dt;
            d.y = Math.max(0, d.y + d.vy * dt);
            // 落ちている間に、下にいる体に掛かったら潰す
            if (!d.hitPlayer && d.y < playerTop() && underDrop(d, position.x, position.z, PLAYER_RADIUS)) {
                d.hitPlayer = true;
                hurtPlayer(DROP_DAMAGE, 0.8);
                pushDir.set(position.x - d.x, 0, position.z - d.z);
                if (pushDir.lengthSq() < 1e-4)
                    pushDir.set(1, 0, 0);
                pushDir.normalize().multiplyScalar(DROP_PUSH);
                velocity.x += pushDir.x;
                velocity.z += pushDir.z;
            }
            for (const e of enemies) {
                const p = e.root.position;
                if (!live(e) || d.hitEnemies.has(e) || d.y > p.y + DUMMY_HEIGHT || !underDrop(d, p.x, p.z, DUMMY_RADIUS))
                    continue;
                d.hitEnemies.add(e);
                hitEnemy(e, DROP_ENEMY, pushDir.set(p.x - d.x, 0, p.z - d.z), dropAt.set(p.x, p.y + DUMMY_HEIGHT, p.z));
            }
            if (d.y <= 0) {
                d.phase = 'rest';
                d.t = 0;
                d.mark.visible = false;
                const dist = Math.hypot(position.x - d.x, position.z - d.z);
                hooks.addTrauma(THREE.MathUtils.clamp(1 - dist / 14, 0.1, 0.7));
                sfx.playBossImpact(THREE.MathUtils.clamp(1.2 - dist / 20, 0.3, 1));
                spawnSparks(dropAt.set(d.x, 0.05, d.z), UP, 18, 1.2, 1);
            }
        }
        else {
            const k = Math.max(0, (d.t - DROP_REST) / DROP_FADE);
            d.mesh.scale.set(1, Math.max(0.001, 1 - k), 1);
            if (k >= 1) {
                spawnSparks(dropAt.set(d.x, 0.1, d.z), UP, 8, 0.6, 0.6);
                dropFalling(d);
                drops.splice(i, 1);
                continue;
            }
        }
        d.mesh.position.set(d.x, d.y + d.size.y / 2, d.z);
    }
}
// ---- 3. 蒸気の噴出 ----
// 噴き出し口はシャフトの壁に付いていて、上から降りてくる。リフトの床の高さを通り過ぎるときに、縁へ向けて噴き出す
const VENT_SPAWN = 30; // リフトの床からこの高さに出す
const VENT_WARN = 10; // この高さから、漏れ出して床に印を出す
const VENT_BURST_Y = 1.4; // この高さまで降りてきたら噴き出す
const VENT_BURST = 1.1; // 噴き出し続ける時間 (s)
const VENT_REACH = 3.8; // 床の縁から内側へ届く深さ (m)
const VENT_WIDTH = 1.7; // 噴き出し口から左右へ届く幅 (m)
const VENT_HIGH = 2.4; // 足もとがこれより低ければ当たる
const STEAM_DAMAGE = 14;
const STEAM_PUSH = 11; // 内側へ押し飛ばす速さ (m/s)
const STEAM_LIFT = 4.5;
const vents = [];
// 壁の向きの外向き（壁の側）を n、壁に沿う向きを a として、(n, a) を xz にする
const sideOut = (side) => (side[0] === '-' ? -1 : 1);
function sideXZ(side, n, a, out) {
    const s = sideOut(side);
    return side[1] === 'z' ? out.set(a, out.y, s * n) : out.set(s * n, out.y, a);
}
function spawnVent(travel) {
    const sides = ['-z', '+z', '-x', '+x'];
    const side = sides[Math.floor(Math.random() * 4)];
    const a = rand(-0.45, 0.45) * shaft.inner;
    const inner = shaft.inner;
    const group = new THREE.Group();
    const y = travel + VENT_SPAWN;
    group.position.y = y;
    // 壁から突き出した太い管と、先の口、元の弁
    const v = new THREE.Vector3();
    const along = side[1] === 'z';
    const pipe = along ? gridBox(0.45, 0.45, 1.2, 0.36) : gridBox(1.2, 0.45, 0.45, 0.36);
    pipe.position.copy(sideXZ(side, inner - 0.6, a, v));
    const mouth = along ? gridBox(0.75, 0.75, 0.25, 0.22) : gridBox(0.25, 0.75, 0.75, 0.22);
    mouth.position.copy(sideXZ(side, inner - 1.25, a, v));
    const valve = gridBox(0.7, 0.12, 0.7, 0.3);
    valve.position.copy(sideXZ(side, inner - 0.35, a, v)).setY(0.45);
    group.add(pipe, mouth, valve);
    shaftRoot.add(group);
    // 床の印: 縁から内側へ届く深さと、左右の幅
    const n0 = deck - VENT_REACH;
    const s = sideOut(side);
    const mark = along
        ? floorMark(a - VENT_WIDTH, a + VENT_WIDTH, s * n0, s * deck)
        : floorMark(s * n0, s * deck, a - VENT_WIDTH, a + VENT_WIDTH);
    mark.visible = false;
    parent.add(mark);
    vents.push({ y, side, a, group, mark, burst: -1, warned: false, puffT: 0, hitPlayer: false, hitEnemies: new Set() });
}
function dropVent(v) {
    dropMesh(v.group);
    dropMesh(v.mark);
}
// (x, z) が噴き出しの届く所か
function inSteam(v, x, z, r) {
    const s = sideOut(v.side);
    const n = v.side[1] === 'z' ? z * s : x * s; // 壁の側へ向かって増える
    const a = v.side[1] === 'z' ? x : z;
    return n > deck - VENT_REACH - r && Math.abs(a - v.a) < VENT_WIDTH + r;
}
const ventTip = new THREE.Vector3();
const ventAim = new THREE.Vector3();
const steamDir = new THREE.Vector3();
function updateVents(dt, travel) {
    const inner = shaft.inner;
    for (let i = vents.length - 1; i >= 0; i--) {
        const v = vents[i];
        const y = v.y - travel;
        sideXZ(v.side, inner - 1.4, v.a, ventTip).y = y;
        if (y < VENT_WARN && v.burst < VENT_BURST && !v.hitPlayer && position.y < VENT_HIGH && inSteam(v, position.x, position.z, PLAYER_RADIUS)) {
            addDanger(ventTip.x, ventTip.y, ventTip.z, v.burst >= 0 ? 1 : THREE.MathUtils.clamp(1 - (y - VENT_BURST_Y) / (VENT_WARN - VENT_BURST_Y), 0, 1));
        }
        if (v.burst < 0) {
            if (y < VENT_WARN) {
                if (!v.warned) {
                    v.warned = true;
                    sfx.playBossHiss(0.5, 0.35);
                }
                v.mark.visible = true;
                setMark(v.mark, THREE.MathUtils.clamp(1 - (y - VENT_BURST_Y) / (VENT_WARN - VENT_BURST_Y), 0, 1), clock);
                // 漏れ出す細い湯気
                v.puffT -= dt;
                if (v.puffT <= 0) {
                    v.puffT = 0.12;
                    sideXZ(v.side, 1, 0, steamDir.set(0, 0, 0));
                    ventAim.set(-steamDir.x, 0.6, -steamDir.z).normalize(); // 内側へ、少し上向きに
                    spawnPuff(ventTip, ventAim, 2.5, 0.25, 0.6, 0.4);
                }
            }
            if (y <= VENT_BURST_Y) {
                v.burst = 0;
                sfx.playBossHiss(VENT_BURST, 1);
                hooks.addTrauma(0.15);
            }
        }
        else if (v.burst < VENT_BURST) {
            v.burst += dt;
            setMark(v.mark, 1, clock);
            // 床の縁の内側の、届く所の真ん中あたりを狙って吹く（口が床より下へ行けば、上へ向けて吹き上げる）
            sideXZ(v.side, deck - VENT_REACH / 2, v.a, ventAim).y = 0.9;
            ventAim.sub(ventTip).normalize();
            for (let k = 0; k < 3; k++)
                spawnPuff(ventTip, ventAim, rand(11, 16), 0.35, 1.8, 0.45);
            const out = sideXZ(v.side, 1, 0, steamDir.set(0, 0, 0)).negate(); // 内側へ
            if (!v.hitPlayer && position.y < VENT_HIGH && inSteam(v, position.x, position.z, PLAYER_RADIUS)) {
                v.hitPlayer = true;
                hurtPlayer(STEAM_DAMAGE, 0.4);
                velocity.x = out.x * STEAM_PUSH;
                velocity.z = out.z * STEAM_PUSH;
                velocity.y = Math.max(velocity.y, STEAM_LIFT);
                player.onGround = false;
            }
            for (const e of enemies) {
                const p = e.root.position;
                if (!live(e) || v.hitEnemies.has(e) || p.y > VENT_HIGH || !inSteam(v, p.x, p.z, DUMMY_RADIUS))
                    continue;
                v.hitEnemies.add(e);
                hitEnemy(e, STEAM_ENEMY, out, ventAim.set(p.x, p.y + 1, p.z));
            }
        }
        else {
            v.mark.visible = false;
        }
        if (y < -15) {
            dropVent(v);
            vents.splice(i, 1);
        }
    }
}
// ---- 湯気の粒 ----
// 白い板を向きに沿って飛ばし、広がりながら薄れていく
const PUFF_MAX = 120;
const puffs = [];
let puffNext = 0;
function spawnPuff(at, dir, speed, size, grow, life) {
    if (!parent)
        return;
    let p = puffs[puffNext];
    if (!p) {
        p = { sprite: new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false })), vel: new THREE.Vector3(), age: 0, life: 1, size: 1, grow: 1 };
        puffs.push(p);
    }
    puffNext = (puffNext + 1) % PUFF_MAX;
    if (p.sprite.parent !== parent)
        parent.add(p.sprite);
    p.sprite.visible = true;
    p.sprite.position.copy(at);
    p.vel.copy(dir).multiplyScalar(speed);
    p.vel.x += rand(-1, 1) * speed * 0.12;
    p.vel.y += rand(-1, 1) * speed * 0.12;
    p.vel.z += rand(-1, 1) * speed * 0.12;
    p.age = 0;
    p.life = life * rand(0.8, 1.2);
    p.size = size;
    p.grow = grow;
}
function updatePuffs(dt) {
    for (const p of puffs) {
        if (!p.sprite.visible)
            continue;
        p.age += dt;
        const u = p.age / p.life;
        if (u >= 1) {
            p.sprite.visible = false;
            continue;
        }
        p.vel.multiplyScalar(Math.exp(-3 * dt));
        p.sprite.position.addScaledVector(p.vel, dt);
        p.sprite.scale.setScalar(p.size + p.grow * u);
        p.sprite.material.opacity = 0.7 * (1 - u) * (1 - u);
    }
}

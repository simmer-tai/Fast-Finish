import * as THREE from 'three';
import * as sfx from '../audio.js';
import { playGrip, playSwish } from '../audio.js';
import { rand } from '../random.js';
import { easeInOutCubic, easeOutCubic } from '../ease.js';
import { DEG } from '../math.js';
import { camera, controls, scene } from '../core.js';
import { AXE_REST_QUAT } from './battleAxe.js';
import { AXE_AIR, AXE_BITE_SLOW, AXE_BITE_TIME, AXE_BUFFER, AXE_CHANNELS, AXE_COMBO, AXE_COMBO_RESET, AXE_DRIVE, AXE_DRIVE_LIFT, AXE_DRIVE_SPEED, AXE_FLING_LIFT, AXE_FLING_SPEED, AXE_HIT_ANGLE, AXE_JOLT_DAMP, AXE_JOLT_KICK, AXE_JOLT_STIFF, AXE_KABUTO, AXE_LAUNCH, AXE_REACH, AXE_RUSH, AXE_RUSH_EXIT, AXE_RUSH_REACH, AXE_RUSH_SPEED, AXE_RUSH_TIME, AXE_SWEEP, AXE_WHEEL_CUT, AXE_WHEEL_END, AXE_WHEEL_HIT, AXE_WHEEL_LIFT, AXE_WHEEL_START, AXE_WHEEL_SWISH, } from './axeAttacks.js';
import { axeRest, heldAxeModel } from './viewModels.js';
import { HIT_TINT, addBeam, fireBurst, flares, spawnShards, spawnSparks } from '../fx/hitFx.js';
import { AXE_RIBBON, AXE_SLAM_RIBBON, Ribbon, TRAIL_STEP, makeRibbonMaterial } from '../fx/ribbons.js';
import { DUMMY_HEIGHT, DUMMY_RADIUS } from '../enemy/body.js';
import { DEFAULT_KNOCK, RESPAWN_RISE_TIME, en, enemies, hitDir, hitLook, hitPoint, setEn, } from '../enemy/state.js';
import { knockEnemy, launchEnemy, spikeEnemy } from '../enemy/motion.js';
import { ARENA_GRID_MAJOR, ARENA_GRID_MINOR } from '../world/blocks.js';
import { player, position, velocity } from '../player/state.js';
import { WALK_SPEED } from '../player/config.js';
import { DASH_ATTACK_WINDOW, DEFAULT_HIT_STOP, SWING_SAMPLE, game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
// ---- 斧の攻撃 ----
// 振り・突進・打ち上げ・叩きつけの衝撃波・吸い寄せ。技の定義は axeAttacks.ts
// 本体からも読み書きする値
export const axeState = {
    axeLaunchPressed: false, // 右クリックを押した瞬間（打ち上げ）
    axeDrivePressed: false, // ホイールを押した瞬間（突き飛ばし）
    axeRushAirUsed: false, // 今の空中で突進を使った（着地・壁走りまで 1 回）
    axeAttack: null,
    axeSpinTime: Infinity,
    axeTime: 0,
    axePressed: false,
    axeAttackWeight: 0,
    axeComboStep: 0,
    axeFiredImpact: false,
    axeSlamRecover: 0, // 残りの硬直の時間
};
// ---- 近接攻撃（斧） ----
export const axeDriveDir = new THREE.Vector3();
export const axeRushDir = new THREE.Vector3();
// ---- 振り終わりの戻し: 柄を手の中で一回転させて構えへ叩き込む ----
let axeLaunchQueued = false;
let axeRushTime = -1; // 突進を始めてからの時間。負なら突進していない
export const axeWheelHits = new Set(); // 今の 1 周で斬りつけた敵
// ダッシュしたら、柄を軸にくるりと一回転させる（頭の位置はそのまま）
export const AXE_DASH_SPIN_TIME = 0.42;
export const AXE_Y = new THREE.Vector3(0, 1, 0);
export const axeSpinQuat = new THREE.Quaternion();
let axeQueued = false;
let axeComboTimer = 0;
let axeFiredSwishes = 0;
let axeFiredGrips = 0;
let axeFiredKicks = 0;
let axeFiredLunge = false;
let axeFiredGround = false;
let axeHitLanded = false;
let axeBite = 0;
// ---- 斧の勢い: 速く動いているほど、高くから落ちるほど一撃が重くなる ----
// 振り始めと刃が当たる瞬間の水平の速さのうち大きい方で、威力・吹き飛ばし・振りの速さを決める。
// 止まって振ると威力が下がり、ただ重くて遅い武器になる
export const AXE_POWER_MIN_SPEED = WALK_SPEED; // これ以下の速さでは勢いが 0
export const AXE_POWER_FULL_SPEED = 28; // これ以上の速さで勢いが 1（ダッシュ中・ダッシュ直後）
export const AXE_POWER_FALL_MIN = 1.5; // 叩きつけで落ちた高さ (m)。これ以下なら勢いが 0
export const AXE_POWER_FALL_FULL = 8; // これ以上落ちれば勢いが 1
export const AXE_POWER_LOW = 0.85; // 勢い 0 のときの威力の倍率
export const AXE_POWER_HIGH = 1.5; // 勢い 1 のときの威力の倍率
export const AXE_POWER_HASTE = 0.2; // 勢い 1 のとき、振りをこれだけ速める
// ---- 右クリックの打ち上げ ----
// 右クリックで打ち上げ。当たった敵は真上へ飛び、地上なら自分も同じくらい跳び上がる（空中では跳び上がらない）。空中で当たった敵は叩きつけで地面へ叩き落とす
export const AXE_LAUNCH_SELF_SPEED = 11.5;
export const AXE_LAUNCH_KEEP = 0.3; // 打ち上げたとき、自分の水平の速さをこれだけ残す（敵から離れていかないように）
// 右クリックを押し続けていれば、振りかぶった所（AXE_LAUNCH_COCK）で止めて構え、離したら振り上げる
export const AXE_LAUNCH_COCK = AXE_LAUNCH.keys[2].t; // 構えで止める時間 = 構えの key（AXE_TIME_SCALE を掛けた後の時間）
export const AXE_STANCE_TREMBLE = 0.0018; // 構えている間に手元が震える大きさ (m)
let axeStance = false; // 打ち上げの構えで止めている
let axeCocked = false; // 構えきった（握り直しの音を鳴らした）
let axeLaunchedAir = false; // 打ち上げで自分も跳び上がり、まだ着地していない（この間だけ叩きつけが出る）
export const axeDashing = () => player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW;
export const axeLaunchable = () => !player.sliding && !player.wallRunning && !axeDashing();
let axePower = 0; // 今の攻撃の勢い (0..1)
let axeSmashFromY = NaN; // 空中の叩きつけで落ち始めた高さ（足元）。着地するまで NaN 以外
// 空中の叩きつけで着地したあと、斧を床に打ち込んだ重さで少しだけ動けなくなる（歩く・跳ぶ・ダッシュ・次の攻撃）
export const AXE_SLAM_RECOVER = 0.3;
export const axeHits = new Set(); // 今の攻撃で当てた敵（同じ敵に二度当てない）
export const axeSpeedPower = () => THREE.MathUtils.clamp((Math.hypot(velocity.x, velocity.z) - AXE_POWER_MIN_SPEED) / (AXE_POWER_FULL_SPEED - AXE_POWER_MIN_SPEED), 0, 1);
export const axeFallPower = (fall) => THREE.MathUtils.clamp((fall - AXE_POWER_FALL_MIN) / (AXE_POWER_FALL_FULL - AXE_POWER_FALL_MIN), 0, 1);
// 勢いを乗せた当たり（使い回す）
export const axePoweredHit = { kick: [0, 0, 0] };
export function poweredAxeHit(def, power) {
    const m = AXE_POWER_LOW + (AXE_POWER_HIGH - AXE_POWER_LOW) * power;
    axePoweredHit.kick = def.kick;
    axePoweredHit.slash = def.slash;
    axePoweredHit.fx = (def.fx ?? 1) * m;
    axePoweredHit.knock = (def.knock ?? DEFAULT_KNOCK) * m;
    axePoweredHit.hitStop = (def.hitStop ?? DEFAULT_HIT_STOP) * (0.85 + 0.35 * power);
    return axePoweredHit;
}
// ---- 叩きつけの衝撃波: 空中の叩きつけで着地したとき、まわりの敵をまとめて吹き飛ばす ----
// 高くから落ちるほど広く強くなる。刃で直接当てた敵には当てない（浮いていれば床への叩きつけが代わりに当たる）
export const AXE_SHOCK_RADIUS_LOW = 3;
export const AXE_SHOCK_RADIUS_HIGH = 7;
export const AXE_SHOCK_FX_LOW = 0.6; // 中心での威力（勢い 0）。端では半分になる
export const AXE_SHOCK_FX_HIGH = 1.4;
export const AXE_SHOCK_HIT = { kick: [-1.2, 0, 0], slash: 0, hitStop: 0.07 };
export const axeShockAt = new THREE.Vector3();
export function axeShockwave(fall) {
    const p = axeFallPower(fall);
    const radius = AXE_SHOCK_RADIUS_LOW + (AXE_SHOCK_RADIUS_HIGH - AXE_SHOCK_RADIUS_LOW) * p;
    sfx.playAxeGround(1 + 0.6 * p);
    hooks.addTrauma(0.3 + 0.4 * p);
    game.landDipVel -= 1.2 + 1.6 * p;
    kickVel.x -= (1.5 + 2 * p) * DEG * 22;
    spawnAxeShock(position, radius, p);
    for (const e of enemies) {
        if (!e.alive || axeHits.has(e))
            continue;
        if (Math.abs(e.root.position.y - position.y) > 1.5)
            continue;
        setEn(e);
        hitDir.set(e.root.position.x - position.x, 0, e.root.position.z - position.z);
        const dist = hitDir.length();
        if (dist > radius + DUMMY_RADIUS)
            continue;
        if (dist > 1e-4)
            hitDir.divideScalar(dist);
        else
            hitDir.set(1, 0, 0);
        const near = 1 - 0.5 * Math.min(1, dist / radius);
        AXE_SHOCK_HIT.fx = (AXE_SHOCK_FX_LOW + (AXE_SHOCK_FX_HIGH - AXE_SHOCK_FX_LOW) * p) * near;
        AXE_SHOCK_HIT.knock = (300 + 250 * p) * near;
        // 足元の、こちらを向いた側を打つ
        axeShockAt.copy(e.root.position).addScaledVector(hitDir, -DUMMY_RADIUS);
        axeShockAt.y += 0.4;
        hooks.applyHit(AXE_SHOCK_HIT, axeShockAt, 'axe', undefined, false);
        if (e.alive)
            knockEnemy(hitDir, AXE_SHOCK_HIT.knock); // 中心から外へ吹き飛ばす
    }
}
// 衝撃波の見た目
// 地面: 波打ちながら走る縁・あとを追う 2 本目の輪・波が通った所だけ光る床のグリッド・中心の焦げ跡・枝分かれして走るひび
// 空間: 縁から立ち上がる光の壁・縁から時間差で噴き上がる土煙の筋・地を這う光線・床のかけら・横に潰れた閃光
export const AXE_SHOCK_LIFE = 0.55; // 波が広がりきるまで
export const AXE_SHOCK_ECHO = 0.1; // 2 本目の輪の遅れ（波の時間に対する割合）
export const AXE_SHOCK_WALL = 0.45; // 光の壁の高さ（勢い 0）。勢い 1 で倍
export const AXE_CRACK_LIFE = 1.8; // ひびと焦げ跡が冷えて消えるまで
export const AXE_CRACK_HEAT = 3.5; // ひびが白熱から冷える速さ
export const AXE_CRACK_MAX_SEG = 220;
export const AXE_CHUNK_TINT = new THREE.Color(0xa8a8a8); // 床のかけらの色
// 波の縁が中心から dist まで届く時間（半径は easeOutCubic で広がる）
export const axeShockReach = (dist, radius) => (1 - Math.cbrt(Math.max(0, 1 - dist / radius))) * AXE_SHOCK_LIFE;
export const AXE_SHOCK_HASH = /* glsl */ `
  float hash1(float n) { return fract(sin(n * 12.9898 + uSeed) * 43758.5453); }
  // 角度方向の滑らかな揺らぎ。cells 個で一周してつながる
  float ringNoise(float a01, float cells) {
    float x = a01 * cells;
    float i = floor(x);
    float f = fract(x);
    return mix(hash1(mod(i, cells)), hash1(mod(i + 1.0, cells)), f * f * (3.0 - 2.0 * f));
  }
`;
// 地面の円盤: 白い光と暗い焦げを、乗算済みアルファで 1 枚に重ねる
export const axeShockDiscGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
export const makeAxeShockDiscMat = () => new THREE.ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: {
        uCenter: { value: new THREE.Vector2() }, uFront: { value: 0 }, uEcho: { value: -1 }, uRadius: { value: 1 },
        uFade: { value: 0 }, uScorch: { value: 0 }, uSeed: { value: 0 },
    },
    vertexShader: /* glsl */ `
    varying vec2 vXZ;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vXZ = w.xz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
    fragmentShader: /* glsl */ `
    uniform vec2 uCenter;
    uniform float uFront;
    uniform float uEcho;
    uniform float uRadius;
    uniform float uFade;
    uniform float uScorch;
    uniform float uSeed;
    varying vec2 vXZ;
    ${AXE_SHOCK_HASH}
    float gridAxis(float p, float cell, float width) {
      float px = fwidth(p);
      float d = abs(fract(p / cell - 0.5) - 0.5) * cell;
      float w = max(width, px);
      return clamp((w * 0.5 - d) / px + 0.5, 0.0, 1.0) * (width / w);
    }
    void main() {
      vec2 p = vXZ - uCenter;
      float d = length(p);
      float a01 = atan(p.y, p.x) / 6.2831853 + 0.5;
      // 縁を波打たせ、広がるほど崩す
      float dd = d + (ringNoise(a01, 28.0) - 0.5) * 0.35 * (uFront / uRadius) + (ringNoise(a01, 9.0) - 0.5) * 0.2;
      float behind = uFront - dd; // 正なら波が通り過ぎた所
      float inside = step(0.0, behind);
      float edge = behind < 0.0 ? exp(behind * 45.0) : exp(-behind * 9.0);
      float wash = inside * exp(-behind * 2.0);
      float echo = uEcho > 0.0 ? exp(-abs(uEcho - dd) * 30.0) * 0.55 : 0.0;
      // 波の内側を外へ流れる放射状の筋
      float streak = smoothstep(0.6, 1.0, ringNoise(a01, 110.0)) * smoothstep(0.3, 1.2, d) * wash;
      // 波が通った所だけ、床のグリッドを光らせる
      float minor = max(gridAxis(vXZ.x, ${ARENA_GRID_MINOR.toFixed(2)}, 0.03), gridAxis(vXZ.y, ${ARENA_GRID_MINOR.toFixed(2)}, 0.03));
      float major = max(gridAxis(vXZ.x, ${ARENA_GRID_MAJOR.toFixed(2)}, 0.08), gridAxis(vXZ.y, ${ARENA_GRID_MAJOR.toFixed(2)}, 0.08));
      float grid = max(minor * 0.55, major) * inside * exp(-behind * 1.1);
      float limit = 1.0 - smoothstep(uRadius * 0.9, uRadius * 1.08, d);
      float light = clamp(edge + wash * 0.3 + echo + streak * 0.45 + grid * 0.85, 0.0, 1.0) * uFade * limit;
      // 中心の焦げ跡: 縁をぎざぎざにした暗い円
      float scorchR = 0.9 + 0.35 * ringNoise(a01, 13.0);
      float scorch = (1.0 - smoothstep(scorchR * 0.35, scorchR, d)) * 0.42 * uScorch;
      gl_FragColor = vec4(vec3(light), 1.0 - (1.0 - light) * (1.0 - scorch));
    }
  `,
});
// 光の壁: 波の縁に沿って立つ筒。上の縁は角度ごとに高さを変えてぎざぎざにする
export const axeShockWallGeo = new THREE.CylinderGeometry(1, 1, 1, 72, 1, true).translate(0, 0.5, 0);
export const makeAxeShockWallMat = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uFade: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: /* glsl */ `
    uniform float uFade;
    uniform float uSeed;
    varying vec2 vUv;
    ${AXE_SHOCK_HASH}
    void main() {
      float top = 0.35 + 0.65 * ringNoise(vUv.x, 40.0);
      float band = smoothstep(0.55, 1.0, ringNoise(vUv.x, 150.0)); // 縦に走る明るい筋
      float h = vUv.y / mix(top, 1.0, band * 0.5);
      float a = (1.0 - smoothstep(0.0, 1.0, h)) * (0.55 + 0.45 * band);
      a *= a * uFade;
      gl_FragColor = vec4(vec3(1.0), a);
    }
  `,
});
// ひび: 地面に平たく置いた細い帯。中心から縁が届いた所まで走り、白熱から冷えて暗い割れ目になる
export const axeCrackIndex = new Uint16Array(AXE_CRACK_MAX_SEG * 6);
for (let i = 0; i < AXE_CRACK_MAX_SEG; i++)
    axeCrackIndex.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
export const makeAxeCrackMat = () => new THREE.ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    uniforms: { uReach: { value: 0 }, uHeat: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
    attribute float aDist;
    attribute float aSide;
    varying float vDist;
    varying float vSide;
    void main() {
      vDist = aDist;
      vSide = aSide;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: /* glsl */ `
    uniform float uReach;
    uniform float uHeat;
    uniform float uFade;
    varying float vDist;
    varying float vSide;
    void main() {
      float shown = 1.0 - smoothstep(uReach - 0.15, uReach, vDist);
      float across = abs(vSide);
      float core = 1.0 - smoothstep(0.3, 0.6, across);
      float glow = 1.0 - across;
      // 走ったばかりの先端ほど熱い
      float heat = uHeat * (0.6 + 0.4 * smoothstep(uReach - 1.5, uReach, vDist));
      float k = shown * uFade;
      vec3 col = vec3(heat * (core + glow * 0.6));
      float a = core * 0.8 + glow * heat * 0.35;
      gl_FragColor = vec4(col * k, clamp(a, 0.0, 1.0) * k);
    }
  `,
});
export const axeShocks = [];
export function newAxeShock() {
    const discMat = makeAxeShockDiscMat();
    const disc = new THREE.Mesh(axeShockDiscGeo, discMat);
    disc.renderOrder = 2;
    const wallMat = makeAxeShockWallMat();
    const wall = new THREE.Mesh(axeShockWallGeo, wallMat);
    wall.renderOrder = 4;
    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AXE_CRACK_MAX_SEG * 4 * 3), 3));
    crackGeo.setAttribute('aDist', new THREE.BufferAttribute(new Float32Array(AXE_CRACK_MAX_SEG * 4), 1));
    crackGeo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(AXE_CRACK_MAX_SEG * 4), 1));
    crackGeo.setIndex(new THREE.BufferAttribute(axeCrackIndex, 1));
    const crackMat = makeAxeCrackMat();
    const cracks = new THREE.Mesh(crackGeo, crackMat);
    cracks.renderOrder = 3;
    cracks.frustumCulled = false;
    for (const m of [disc, wall, cracks]) {
        m.visible = false;
        scene.add(m);
    }
    const s = { disc, discMat, wall, wallMat, cracks, crackGeo, crackMat, age: Infinity, radius: 1, power: 0 };
    axeShocks.push(s);
    return s;
}
// 中心から外へ、向きを揺らしながら伸ばす。途中でときどき枝分かれさせる
let axeCrackSegs = 0;
export function growAxeCrack(geo, x, z, ang, len, width, branch) {
    const pos = geo.attributes.position.array;
    const dist = geo.attributes.aDist.array;
    const side = geo.attributes.aSide.array;
    const out = ang;
    let walked = 0;
    while (walked < len && axeCrackSegs < AXE_CRACK_MAX_SEG) {
        const step = rand(0.16, 0.36);
        ang += rand(-0.5, 0.5) + (out - ang) * 0.35; // 外向きから大きく外れないよう引き戻す
        const nx = x + Math.cos(ang) * step;
        const nz = z + Math.sin(ang) * step;
        const w0 = Math.max(0.005, width * (1 - walked / len));
        const w1 = Math.max(0.005, width * (1 - (walked + step) / len));
        const sx = -Math.sin(ang);
        const sz = Math.cos(ang);
        const i = axeCrackSegs * 4;
        pos.set([x + sx * w0, 0, z + sz * w0, x - sx * w0, 0, z - sz * w0, nx + sx * w1, 0, nz + sz * w1, nx - sx * w1, 0, nz - sz * w1], i * 3);
        const d0 = Math.hypot(x, z);
        const d1 = Math.hypot(nx, nz);
        dist.set([d0, d0, d1, d1], i);
        side.set([1, -1, 1, -1], i);
        axeCrackSegs++;
        if (branch && walked > 0.3 && Math.random() < 0.22) {
            growAxeCrack(geo, nx, nz, ang + rand(0.5, 1.0) * (Math.random() < 0.5 ? -1 : 1), (len - walked) * rand(0.35, 0.7), w1 * 0.8, false);
        }
        x = nx;
        z = nz;
        walked += step;
    }
}
export const axeShockDir = new THREE.Vector3();
export function spawnAxeShock(at, radius, power) {
    const s = axeShocks.find((r) => r.age >= AXE_CRACK_LIFE) ?? newAxeShock();
    s.age = 0;
    s.radius = radius;
    s.power = power;
    const seed = Math.random() * 100;
    s.disc.position.set(at.x, at.y + 0.03, at.z);
    s.disc.scale.setScalar(radius * 1.1);
    s.discMat.uniforms.uCenter.value.set(at.x, at.z);
    s.discMat.uniforms.uRadius.value = radius;
    s.discMat.uniforms.uSeed.value = seed;
    s.wall.position.set(at.x, at.y, at.z);
    s.wall.rotation.y = Math.random() * Math.PI * 2;
    s.wallMat.uniforms.uSeed.value = seed + 7;
    // ひび: 高くから落ちるほど本数を増やし、長く太くする
    axeCrackSegs = 0;
    const count = 7 + Math.round(5 * power);
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
        const a = a0 + (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
        const r0 = rand(0.15, 0.35);
        growAxeCrack(s.crackGeo, Math.cos(a) * r0, Math.sin(a) * r0, a, radius * rand(0.3, 0.6), 0.045 + 0.035 * power, true);
    }
    s.crackGeo.setDrawRange(0, axeCrackSegs * 6);
    for (const name of ['position', 'aDist', 'aSide'])
        s.crackGeo.attributes[name].needsUpdate = true;
    s.cracks.position.set(at.x, at.y + 0.035, at.z);
    for (const m of [s.disc, s.wall, s.cracks])
        m.visible = true;
    updateAxeShock(s, 0);
    // 足元の閃光: 横に潰して、地面を叩いた形にする
    const flash = fireBurst(flares, axeShockAt.set(at.x, at.y + 0.15, at.z), 3 + 2.5 * power, 0.3, 2.2, 2.6);
    flash.mat.uniforms.uRot.value = 0;
    fireBurst(flares, axeShockAt, 1.4 + power, 0.14, 2.5, 1);
    // 地を這う光線
    const rays = 30 + Math.round(14 * power);
    for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + Math.random() * 0.12;
        axeShockDir.set(Math.cos(a), rand(0, 0.05), Math.sin(a));
        addBeam(axeShockAt.set(at.x, at.y + rand(0.05, 0.2), at.z), axeShockDir, {
            color: HIT_TINT,
            len: radius * rand(0.6, 1),
            width: rand(0.04, 0.08) * (1 + 0.5 * power),
            offset: 0.3,
            tail: 1,
            reach: 1.3,
            life: rand(0.4, 0.55),
        });
    }
    // 波の縁が届いた所から、時間差で噴き上がる土煙の筋
    const jets = 18 + Math.round(16 * power);
    for (let i = 0; i < jets; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = radius * Math.sqrt(rand(0.04, 0.9));
        axeShockDir.set(Math.cos(a) * rand(0.15, 0.5), 1, Math.sin(a) * rand(0.15, 0.5));
        addBeam(axeShockAt.set(at.x + Math.cos(a) * d, at.y, at.z + Math.sin(a) * d), axeShockDir, {
            color: HIT_TINT,
            len: rand(0.5, 1.3) * (1 + power) * (1 - 0.5 * d / radius),
            width: rand(0.03, 0.07),
            tail: 1,
            reach: rand(1.6, 2.4),
            life: rand(0.25, 0.4),
            age: -axeShockReach(d, radius),
        });
    }
    // 床のかけらと火花を、足元の輪から外へ跳ね上げる
    const chunks = 16 + Math.round(16 * power);
    for (let i = 0; i < chunks; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(0.3, 1.2);
        axeShockAt.set(at.x + Math.cos(a) * d, at.y + 0.05, at.z + Math.sin(a) * d);
        hitLook.set(Math.cos(a), rand(0.6, 1.4), Math.sin(a));
        spawnShards(axeShockAt, hitLook, 1, rand(0.8, 1.3), rand(0.8, 1.4) * (1 + 0.4 * power), undefined, AXE_CHUNK_TINT);
    }
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        axeShockAt.set(at.x + Math.cos(a) * 0.6, at.y + 0.1, at.z + Math.sin(a) * 0.6);
        hitLook.set(-Math.cos(a), 0.3, -Math.sin(a));
        spawnSparks(axeShockAt, hitLook, 1 + Math.round(power), 0.9, 0.8);
    }
}
export function updateAxeShock(s, dt) {
    s.age += dt;
    if (s.age >= AXE_CRACK_LIFE) {
        s.disc.visible = s.wall.visible = s.cracks.visible = false;
        return;
    }
    const u = Math.min(1, s.age / AXE_SHOCK_LIFE);
    const front = s.radius * easeOutCubic(u);
    const echoU = (s.age / AXE_SHOCK_LIFE - AXE_SHOCK_ECHO) / (1 - AXE_SHOCK_ECHO);
    const du = s.discMat.uniforms;
    du.uFront.value = front;
    du.uEcho.value = echoU > 0 && echoU < 1 ? s.radius * 0.85 * easeOutCubic(echoU) : -1;
    du.uFade.value = (1 - u) ** 1.5;
    const cool = s.age / AXE_CRACK_LIFE;
    du.uScorch.value = Math.min(1, s.age / 0.05) * (1 - THREE.MathUtils.smoothstep(cool, 0.5, 1));
    // 壁は一気に立ち上がり、広がりながら低く薄くなる
    s.wall.visible = u < 1;
    const h = AXE_SHOCK_WALL * (1 + s.power) * Math.min(1, s.age / 0.04) * (1 - u) ** 0.6;
    s.wall.scale.set(Math.max(0.01, front), Math.max(0.01, h), Math.max(0.01, front));
    s.wallMat.uniforms.uFade.value = 0.6 * (1 - u) ** 2;
    const cu = s.crackMat.uniforms;
    cu.uReach.value = s.radius * easeOutCubic(Math.min(1, u * 1.4));
    cu.uHeat.value = Math.exp(-s.age * AXE_CRACK_HEAT);
    cu.uFade.value = 1 - THREE.MathUtils.smoothstep(cool, 0.55, 1);
}
export function updateAxeShocks(dt) {
    for (const s of axeShocks)
        if (s.age < AXE_CRACK_LIFE)
            updateAxeShock(s, dt);
}
export const axeJolt = new THREE.Vector3();
export const axeJoltVel = new THREE.Vector3();
export const axeReady = () => game.shownWeapon === 'axe' && game.wantWeapon === 'axe' && game.holster === 0;
export const newAxePose = () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion().copy(AXE_REST_QUAT) });
export const axeFrom = newAxePose(); // 攻撃を始めた瞬間の構え
export const axeCur = newAxePose();
export const axeTmp = newAxePose();
export const axeTmpHit = newAxePose();
export const axeTrailPose = newAxePose();
export const axeEvalTurn = new THREE.Vector3();
export const axeEvalV = new Array(AXE_CHANNELS).fill(0);
// 手の位置と回転の積み重ねを同じ曲線でつなぎ、区間の始まりの key の向きから、積み重ねの差の分だけ回す
export function evalAxeAttack(def, t, out) {
    const keys = def.keys;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t)
        i++;
    const k0 = keys[i];
    const k1 = keys[i + 1];
    const h = k1.t - k0.t;
    const u = THREE.MathUtils.clamp((t - k0.t) / h, 0, 1);
    const u2 = u * u;
    const u3 = u2 * u;
    const a0 = 2 * u3 - 3 * u2 + 1;
    const b0 = (u3 - 2 * u2 + u) * h;
    const a1 = -2 * u3 + 3 * u2;
    const b1 = (u3 - u2) * h;
    for (let c = 0; c < AXE_CHANNELS; c++) {
        axeEvalV[c] = a0 * k0.v[c] + b0 * k0.slope[c] + a1 * k1.v[c] + b1 * k1.slope[c];
    }
    const v = axeEvalV;
    out.pos.set(v[0], v[1], v[2]);
    axeEvalTurn.set(v[3] - k0.v[3], v[4] - k0.v[4], v[5] - k0.v[5]);
    const angle = axeEvalTurn.length();
    if (angle < 1e-9)
        out.quat.copy(k0.quat);
    else
        out.quat.setFromAxisAngle(axeEvalTurn.divideScalar(angle), angle).multiply(k0.quat);
}
// 振りかぶりの key までの間に、攻撃開始時の構えから滑らかに移る
export function axePoseAt(def, t, out) {
    evalAxeAttack(def, t, axeTmp);
    const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
    out.pos.lerpVectors(axeFrom.pos, axeTmp.pos, w);
    out.quat.slerpQuaternions(axeFrom.quat, axeTmp.quat, w);
}
export function applyAxePose(p) {
    axeRest.position.copy(p.pos);
    axeRest.quaternion.copy(p.quat);
}
export function startAxeAttack(def) {
    if (def.fromFirstKey) {
        evalAxeAttack(def, 0, axeFrom);
    }
    else {
        axeFrom.pos.copy(axeCur.pos);
        axeFrom.quat.copy(axeCur.quat);
    }
    axeState.axeAttack = def;
    axeRushTime = -1;
    if (def === AXE_RUSH)
        startAxeRush();
    axeState.axeSpinTime = Infinity; // 回している途中に振ったら、回すのはやめる
    axeState.axeTime = 0;
    axeQueued = false;
    axeFiredSwishes = 0;
    axeFiredGrips = 0;
    axeFiredKicks = 0;
    axeState.axeFiredImpact = false;
    axeFiredLunge = false;
    axeFiredGround = false;
    axeHitLanded = false;
    axeBite = 0;
    axePower = axeSpeedPower();
    axeHits.clear();
    axeStance = false;
    axeLastTrail = -Infinity;
    axeRibbon.cut();
    axeSlamRibbon.cut();
    axeSlamHold = 0;
    if (def.windKick) {
        kickVel.x += def.windKick[0] * DEG * 10;
        kickVel.y += def.windKick[1] * DEG * 10;
        kickVel.z += def.windKick[2] * DEG * 10;
    }
}
export function chooseAxeAttack() {
    if (player.sliding)
        return AXE_SWEEP;
    // ダッシュ中・ダッシュ直後は突進振り下ろし（空中では 1 回だけ）
    if ((player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW) && !player.wallRunning && (player.onGround || !axeState.axeRushAirUsed))
        return AXE_RUSH;
    // 空中の叩きつけは、打ち上げで跳び上がっている間だけ（1 回の打ち上げにつき 1 回）
    if (axeLaunchedAir && !player.onGround && !player.wallRunning) {
        axeLaunchedAir = false;
        return AXE_AIR;
    }
    const def = AXE_COMBO[axeState.axeComboStep];
    axeState.axeComboStep = (axeState.axeComboStep + 1) % AXE_COMBO.length;
    return def;
}
// ---- 吸い寄せ: 踏み込むとき、前にいる敵の方へ少しだけ引き寄せる ----
// 照準の近くにいる一番近い敵へ向けて、届く距離まで寄るぶんの速さを足す（足す速さには上限がある）。
// 敵の方へまっすぐ寄るので、少し外れた向きで振っても当たりやすい
export const AXE_PULL_RANGE = 3.5; // 届く距離（AXE_REACH）より、さらにこれだけ先の敵まで引き寄せる (m)
export const AXE_PULL_ANGLE = 35 * DEG; // 照準からこの角度の内側にいる敵だけ
export const AXE_PULL_STOP = 0.6; // 届く距離のこの割合まで寄ったら、それ以上は引き寄せない
export const AXE_PULL_GAIN = 2; // 残りの距離 1m あたりに足す速さ (m/s)
export const AXE_PULL_MAX = 5; // 足す速さの上限 (m/s)
export const axePullLook = new THREE.Vector3();
export const axePullDir = new THREE.Vector3();
export function pullTowardAxeTarget() {
    camera.getWorldDirection(axePullLook);
    axePullLook.y = 0;
    if (axePullLook.lengthSq() < 1e-6)
        return;
    axePullLook.normalize();
    let best = null;
    let bestDist = AXE_REACH + AXE_PULL_RANGE + DUMMY_RADIUS;
    for (const e of enemies) {
        if (!e.alive || e.riseTime < RESPAWN_RISE_TIME)
            continue;
        if (Math.abs(e.root.position.y - position.y) > DUMMY_HEIGHT + 0.5)
            continue;
        axePullDir.set(e.root.position.x - position.x, 0, e.root.position.z - position.z);
        const d = axePullDir.length();
        if (d >= bestDist || d < 1e-4)
            continue;
        if (axePullDir.divideScalar(d).angleTo(axePullLook) > AXE_PULL_ANGLE)
            continue;
        best = e;
        bestDist = d;
    }
    if (!best)
        return;
    const gap = bestDist - DUMMY_RADIUS - AXE_REACH * AXE_PULL_STOP;
    if (gap <= 0)
        return;
    axePullDir.set(best.root.position.x - position.x, 0, best.root.position.z - position.z).normalize();
    // 今その向きへ出ている速さを差し引いて、足りないぶんだけ足す（ダッシュ中などに速くなりすぎないように）
    const want = Math.min(AXE_PULL_MAX, gap * AXE_PULL_GAIN);
    const along = velocity.x * axePullDir.x + velocity.z * axePullDir.z;
    const add = Math.max(0, want - Math.max(0, along) * 0.5);
    velocity.x += axePullDir.x * add;
    velocity.z += axePullDir.z * add;
}
// 敵を dir（水平）へ大きく吹き飛ばす（壁に当たれば叩きつけ）。速さは勢いに応じて増やす
export function flingEnemy(dir, speed, lift, power) {
    if (hooks.enemyHeld())
        return;
    const m = AXE_POWER_LOW + (AXE_POWER_HIGH - AXE_POWER_LOW) * power;
    en.knockVel.copy(dir).multiplyScalar(speed * m / AXE_POWER_LOW);
    en.flung = true;
    en.airVel = Math.max(en.airVel, lift);
    en.vel.set(0, 0, 0);
    en.moving = false;
    en.spiked = false;
}
// 刃先の中ほどが敵を捉えた場所を当たりの位置にする
export const AXE_HIT_EDGE = new THREE.Vector3(0.27, 0.93, 0); // 斧のローカル座標
export const axeHitTip = new THREE.Vector3();
export const axeSwing = new THREE.Vector3();
export function axeEdgeAt(def, t, out) {
    axePoseAt(def, t, axeTmpHit);
    applyAxePose(axeTmpHit);
    heldAxeModel.updateWorldMatrix(true, false);
    return out.copy(AXE_HIT_EDGE).applyMatrix4(heldAxeModel.matrixWorld);
}
// 回しながらの斬りつけ: 届く範囲にいる敵（今の 1 周でまだ当てていないもの）すべてに軽く当てる
export function tryAxeWheelHit() {
    let any = false;
    for (const e of enemies) {
        if (axeWheelHits.has(e))
            continue;
        setEn(e);
        if (!hooks.inReachOf(AXE_REACH, AXE_HIT_ANGLE))
            continue;
        if (!any) {
            camera.updateMatrixWorld();
            axeEdgeAt(AXE_RUSH, Math.max(0, axeState.axeTime - SWING_SAMPLE), axeSwing);
            axeSwing.subVectors(axeEdgeAt(AXE_RUSH, axeState.axeTime + SWING_SAMPLE, axeHitTip), axeSwing);
            axeEdgeAt(AXE_RUSH, axeState.axeTime, axeHitTip);
        }
        any = true;
        axeWheelHits.add(e);
        hooks.hitPointFromTip(axeHitTip, hitPoint);
        const hit = poweredAxeHit(AXE_WHEEL_HIT, axePower);
        hooks.applyHit(hit, hitPoint, 'axe', axeSwing);
        if (!e.alive)
            continue;
        if (e.airY > 0.3) {
            e.airVel = Math.max(e.airVel, AXE_WHEEL_LIFT);
            e.spiked = false;
        }
        else
            knockEnemy(hitDir, hit.knock ?? DEFAULT_KNOCK);
    }
    if (any) {
        axeBite = AXE_BITE_TIME * 0.5;
        axeJoltVel.copy(axeSwing).transformDirection(camera.matrixWorldInverse).multiplyScalar(-AXE_JOLT_KICK * 0.5);
    }
    return any;
}
// 届く範囲にいる敵（今の攻撃でまだ当てていないもの）すべてに当てる
export function tryAxeHit(def) {
    let any = false;
    const speedPower = axeSpeedPower();
    for (const e of enemies) {
        if (axeHits.has(e))
            continue;
        setEn(e);
        if (!hooks.inReachOf(def.reach ?? AXE_REACH, AXE_HIT_ANGLE))
            continue;
        if (!any) {
            camera.updateMatrixWorld();
            axeEdgeAt(def, Math.max(0, axeState.axeTime - SWING_SAMPLE), axeSwing);
            axeSwing.subVectors(axeEdgeAt(def, axeState.axeTime + SWING_SAMPLE, axeHitTip), axeSwing);
            axeEdgeAt(def, axeState.axeTime, axeHitTip);
        }
        any = true;
        axeHits.add(e);
        // 勢い: 振り始めと今の速さ、叩きつけなら敵の足元までの高さ
        // 突進振り下ろしは、突進の速さではなく出す前の速さで決める
        let power = def === AXE_RUSH ? axePower : Math.max(axePower, speedPower);
        if (!Number.isNaN(axeSmashFromY))
            power = Math.max(power, axeFallPower(axeSmashFromY - e.root.position.y));
        hooks.hitPointFromTip(axeHitTip, hitPoint);
        const hit = poweredAxeHit(def, power);
        hooks.applyHit(hit, hitPoint, 'axe', axeSwing);
        if (!e.alive)
            continue;
        // 打ち上げは真上へ飛ばし、振り下ろし（空中の叩きつけ・兜割り）は浮いている敵を床へ叩き落とすので、横へは吹き飛ばさない
        if (def === AXE_RUSH && e.airY > 0.3)
            flingEnemy(axeRushDir, AXE_FLING_SPEED, AXE_FLING_LIFT, power);
        else if (def === AXE_DRIVE) {
            camera.getWorldDirection(axeDriveDir);
            axeDriveDir.y = 0;
            if (axeDriveDir.lengthSq() < 1e-6)
                axeDriveDir.set(0, 0, -1);
            flingEnemy(axeDriveDir.normalize(), AXE_DRIVE_SPEED, AXE_DRIVE_LIFT, power);
        }
        else if ((def === AXE_AIR || def === AXE_KABUTO) && e.airY > 0.2)
            spikeEnemy();
        else if (def !== AXE_LAUNCH && def !== AXE_AIR)
            knockEnemy(hitDir, hit.knock ?? DEFAULT_KNOCK);
        if (def === AXE_LAUNCH)
            launchEnemy();
    }
    if (!any)
        return false;
    if (def === AXE_LAUNCH && player.onGround) { // 空中で振ったときは、自分は跳び上がらない
        velocity.y = AXE_LAUNCH_SELF_SPEED;
        velocity.x *= AXE_LAUNCH_KEEP;
        velocity.z *= AXE_LAUNCH_KEEP;
        player.onGround = false;
        player.sliding = false;
        axeLaunchedAir = true;
    }
    // 刃が食い込んで振りが重くなり、手元は振っていた向きと逆へ跳ね返される
    axeBite = AXE_BITE_TIME;
    axeJoltVel.copy(axeSwing).transformDirection(camera.matrixWorldInverse).multiplyScalar(-AXE_JOLT_KICK);
    return true;
}
export function startAxeRush() {
    axeRushTime = 0;
    axeWheelHits.clear();
    if (!player.onGround)
        axeState.axeRushAirUsed = true;
    camera.getWorldDirection(axeRushDir);
    axeRushDir.y = 0;
    if (axeRushDir.lengthSq() < 1e-6)
        axeRushDir.set(0, 0, -1);
    axeRushDir.normalize();
}
export function endAxeRush() {
    axeRushTime = -1;
    const h = Math.hypot(velocity.x, velocity.z);
    if (h > AXE_RUSH_EXIT) {
        velocity.x *= AXE_RUSH_EXIT / h;
        velocity.z *= AXE_RUSH_EXIT / h;
    }
}
// 突進振り下ろしの、axeTime を進めた直後に呼ぶ。before は進める前の axeTime
// 突進している間: 照準の向きへ一定の速さで進み（空中では高さを保つ）、届く所に敵を捉えるか時間が来たらやめる。
// 回転の 1 周の間は、頭が前を通るたびに斬りつけ、突進が続いていれば 1 周の始まりへ戻って回し続ける
export function updateAxeRush(dt, before) {
    if (axeRushTime >= 0) {
        axeRushTime += dt;
        camera.getWorldDirection(axeRushDir);
        axeRushDir.y = 0;
        if (axeRushDir.lengthSq() > 1e-6)
            axeRushDir.normalize();
        velocity.x = axeRushDir.x * AXE_RUSH_SPEED;
        velocity.z = axeRushDir.z * AXE_RUSH_SPEED;
        if (!player.onGround)
            velocity.y = Math.max(velocity.y, 0);
        let caught = axeRushTime >= AXE_RUSH_TIME;
        for (const e of enemies) {
            setEn(e);
            if (!caught && hooks.inReachOf(AXE_RUSH_REACH, AXE_HIT_ANGLE))
                caught = true;
        }
        if (caught)
            endAxeRush();
    }
    if (before < AXE_WHEEL_CUT && axeState.axeTime >= AXE_WHEEL_CUT) {
        if (tryAxeWheelHit())
            axeHitLanded = true;
        axeWheelHits.clear();
    }
    if (axeRushTime >= 0 && axeState.axeTime >= AXE_WHEEL_END) {
        const period = AXE_WHEEL_END - AXE_WHEEL_START;
        axeState.axeTime -= period;
        axeLastTrail -= period; // 軌跡を途切れさせずに続ける
        playSwish(AXE_WHEEL_SWISH, 'axe');
    }
}
export function startAxeLaunch() {
    axeLaunchQueued = false;
    axeQueued = false;
    startAxeAttack(AXE_LAUNCH);
    axeStance = true; // 右クリックを押している間は振りかぶった所で構えておく
    axeCocked = false;
}
export function updateAxeAttack(dt) {
    // ホイール: 突き飛ばし（地上でも空中でも）。パッドにはホイールが無いので、ダッシュ中・ダッシュ直後の ZL で出す
    const drivePressed = axeState.axeDrivePressed || (axeState.axeLaunchPressed && game.usingPad && axeDashing());
    axeState.axeDrivePressed = false;
    if (drivePressed) {
        axeState.axeLaunchPressed = false;
        if (axeReady() && !player.wallRunning && axeState.axeAttack !== AXE_DRIVE && axeState.axeSlamRecover <= 0) {
            if (!axeState.axeAttack || axeState.axeTime >= axeState.axeAttack.cancel) {
                axeLaunchQueued = false;
                startAxeAttack(AXE_DRIVE);
            }
        }
    }
    // 右クリック: 打ち上げ（地上でも空中でも）
    if (axeState.axeLaunchPressed) {
        axeState.axeLaunchPressed = false;
        if (axeReady() && axeLaunchable() && axeState.axeAttack !== AXE_LAUNCH) {
            if (axeState.axeSlamRecover > 0) {
                axeLaunchQueued = true; // 硬直が解けたら出す
                axeQueued = false;
            }
            else if (!axeState.axeAttack || axeState.axeTime >= axeState.axeAttack.cancel)
                startAxeLaunch();
            else if (axeState.axeTime >= axeState.axeAttack.cancel - AXE_BUFFER) {
                axeLaunchQueued = true;
                axeQueued = false;
            }
        }
    }
    if (axeState.axePressed) {
        axeState.axePressed = false;
        if (axeReady()) {
            if (!axeState.axeAttack && axeState.axeSlamRecover <= 0)
                startAxeAttack(chooseAxeAttack());
            else if (!axeState.axeAttack)
                axeQueued = true; // 硬直が解けたら出す
            else if (axeState.axeTime >= axeState.axeAttack.cancel - AXE_BUFFER) {
                axeQueued = true;
                axeLaunchQueued = false;
            }
        }
    }
    if (axeState.axeAttack) {
        const def = axeState.axeAttack;
        // 食い込んでいる間は、振りの時間をゆっくり進める（急に元の速さへ戻ると引っかかって見えるので、なめらかに戻す）
        const axeTimeBefore = axeState.axeTime;
        const r = 1 - Math.max(0, axeBite) / AXE_BITE_TIME;
        axeBite -= dt;
        // 勢いがあるほど速く振る
        axeState.axeTime += dt * (AXE_BITE_SLOW + (1 - AXE_BITE_SLOW) * r * r * (3 - 2 * r)) * (1 + AXE_POWER_HASTE * axePower);
        // 打ち上げの構え: 押している間は振りかぶった所で止める。離したら、その瞬間の速さも勢いに数えて振り上げる
        if (axeStance) {
            if (game.throwHeld && controls.isLocked) {
                if (axeState.axeTime >= AXE_LAUNCH_COCK) {
                    axeState.axeTime = AXE_LAUNCH_COCK;
                    if (!axeCocked) {
                        axeCocked = true;
                        playGrip();
                        hooks.addTrauma(0.06);
                    }
                }
            }
            else {
                axeStance = false;
                axePower = Math.max(axePower, axeSpeedPower());
            }
        }
        if (def === AXE_RUSH)
            updateAxeRush(dt, axeTimeBefore);
        while (axeFiredSwishes < def.swishes.length && axeState.axeTime >= def.swishes[axeFiredSwishes].at) {
            playSwish(def.swishes[axeFiredSwishes++], 'axe');
        }
        const grips = def.grips ?? [];
        while (axeFiredGrips < grips.length && axeState.axeTime >= grips[axeFiredGrips]) {
            axeFiredGrips++;
            playGrip();
        }
        const kicks = def.kicks ?? [];
        while (axeFiredKicks < kicks.length && axeState.axeTime >= kicks[axeFiredKicks][0]) {
            const k = kicks[axeFiredKicks++][1];
            kickVel.x += k[0] * DEG * 10;
            kickVel.y += k[1] * DEG * 10;
            kickVel.z += k[2] * DEG * 10;
        }
        if (!axeFiredLunge && axeState.axeTime >= def.lungeAt) {
            axeFiredLunge = true;
            hooks.applyLunge(def.lunge);
            if (def !== AXE_AIR && def !== AXE_RUSH)
                pullTowardAxeTarget();
            if (def.drop && !player.onGround) {
                velocity.y = Math.min(velocity.y, -def.drop);
                axeSmashFromY = position.y; // 着地したらここからの高さで衝撃波を出す
            }
        }
        if (!axeState.axeFiredImpact && axeState.axeTime >= def.impact) {
            axeState.axeFiredImpact = true;
            kickVel.x += def.kick[0] * DEG * 22;
            kickVel.y += def.kick[1] * DEG * 22;
            kickVel.z += def.kick[2] * DEG * 22;
            hooks.addTrauma(0.1);
            game.fovKick += def.fovPunch ?? 0;
            game.landDipVel -= def.dip ?? 0;
            axeHitLanded = tryAxeHit(def);
        }
        else if (axeState.axeFiredImpact && def.hitUntil !== undefined && axeState.axeTime <= def.hitUntil) {
            // 落ちている途中で届いた敵にも、1 体ずつ当てていく
            if (tryAxeHit(def))
                axeHitLanded = true;
        }
        // 空振りでも、足が着いていれば地面を叩いた重さを返す（空中の叩きつけは着地の衝撃波が代わりに返す）
        if (def.ground && !def.drop && axeState.axeFiredImpact && !axeFiredGround && !axeHitLanded && player.onGround
            && axeState.axeTime <= (def.hitUntil ?? def.impact) + 0.05) {
            axeFiredGround = true;
            sfx.playAxeGround(def.ground);
            hooks.addTrauma(0.25 * def.ground);
            game.landDipVel -= 1.2 * def.ground;
            kickVel.x -= 1.5 * DEG * 22 * def.ground;
        }
        if (axeLaunchQueued && axeState.axeTime >= def.cancel && axeState.axeSlamRecover <= 0) {
            if (axeLaunchable())
                startAxeLaunch();
            else
                axeLaunchQueued = false;
        }
        else if (axeQueued && axeState.axeTime >= def.cancel && axeState.axeSlamRecover <= 0) {
            startAxeAttack(chooseAxeAttack());
        }
        else if (axeState.axeTime >= def.duration) {
            axeState.axeAttack = null;
            axeComboTimer = AXE_COMBO_RESET;
        }
    }
    else if (axeState.axeSlamRecover <= 0 && axeReady() && (axeQueued || axeLaunchQueued)) {
        // 硬直の間に押していた攻撃を、解けたら出す
        if (axeLaunchQueued && axeLaunchable())
            startAxeLaunch();
        else if (axeQueued)
            startAxeAttack(chooseAxeAttack());
        axeQueued = axeLaunchQueued = false;
    }
    else if (axeComboTimer > 0) {
        axeComboTimer -= dt;
        if (axeComboTimer <= 0)
            axeState.axeComboStep = 0;
    }
    if (axeLaunchedAir && (player.onGround || player.wallRunning || game.shownWeapon !== 'axe' || hooks.grappling()))
        axeLaunchedAir = false;
    if (player.onGround || player.wallRunning)
        axeState.axeRushAirUsed = false;
    // 叩きつけで落ちている途中に着地したら衝撃波（攻撃の時間が過ぎてから着いても出す）
    if (!Number.isNaN(axeSmashFromY)) {
        if (player.onGround) {
            axeShockwave(axeSmashFromY - position.y);
            axeSmashFromY = NaN;
            axeState.axeSlamRecover = AXE_SLAM_RECOVER;
        }
        else if (player.wallRunning || game.shownWeapon !== 'axe' || hooks.grappling()) {
            axeSmashFromY = NaN;
        }
    }
    // 持ち替えたら最初の段から
    if (game.shownWeapon !== 'axe') {
        axeState.axeAttack = null;
        axeState.axeComboStep = 0;
        axeStance = false;
        axeState.axeSpinTime = Infinity;
        axeLaunchQueued = false;
        axeRushTime = -1;
    }
    if (axeState.axeAttack) {
        sampleAxeTrail();
        axePoseAt(axeState.axeAttack, axeState.axeTime, axeCur);
        // 持ち上げた重さに耐えて、手元が小刻みに震える
        const strain = axeState.axeAttack.strain;
        if (strain && axeState.axeTime > strain[0] && axeState.axeTime < strain[1]) {
            const u = (axeState.axeTime - strain[0]) / (strain[1] - strain[0]);
            const a = 0.0025 * Math.sin(Math.PI * u) * (0.4 + 0.6 * u);
            axeCur.pos.x += Math.sin(axeState.axeTime * 61) * a;
            axeCur.pos.y += Math.sin(axeState.axeTime * 79 + 1.3) * a;
        }
        // 構えている間は、持ち上げた重さに耐えて手元が震え続ける（止まっている axeTime ではなく実時間で揺らす）
        if (axeStance && axeCocked) {
            const s = game.trailNow;
            axeCur.pos.x += Math.sin(s * 61) * AXE_STANCE_TREMBLE;
            axeCur.pos.y += Math.sin(s * 79 + 1.3) * AXE_STANCE_TREMBLE;
        }
    }
    else {
        axeCur.pos.set(0, 0, 0);
        axeCur.quat.copy(AXE_REST_QUAT);
        if (axeState.axeSpinTime < AXE_DASH_SPIN_TIME) {
            axeState.axeSpinTime += dt;
            const u = Math.min(1, axeState.axeSpinTime / AXE_DASH_SPIN_TIME);
            axeCur.quat.multiply(axeSpinQuat.setFromAxisAngle(AXE_Y, -Math.PI * 2 * easeOutCubic(u)));
        }
    }
    // 当たって跳ね返された手元を、ばねで戻す
    axeJoltVel.addScaledVector(axeJolt, -AXE_JOLT_STIFF * dt).multiplyScalar(Math.max(0, 1 - AXE_JOLT_DAMP * dt));
    axeJolt.addScaledVector(axeJoltVel, dt);
    axeRest.position.copy(axeCur.pos).add(axeJolt);
    axeRest.quaternion.copy(axeCur.quat);
    axeRibbon.update(game.trailNow);
    // 叩きつけの軌跡: 振り終えてから着地するまでは時計を止めて、振り下ろした弧を残したまま落ちる。
    // 着地すると時計が進み、衝撃と一緒に削れて消える
    const falling = axeState.axeAttack === AXE_AIR && axeState.axeTime >= AXE_AIR.trails[0][1] && !Number.isNaN(axeSmashFromY);
    if (falling && axeSlamHold < AXE_SLAM_TRAIL_HOLD)
        axeSlamHold += dt;
    else
        axeSlamClock += dt;
    axeSlamRibbon.update(axeSlamClock);
}
// 斧の軌跡: 刃先の端から端までの幅で残す。重い一撃なので剣より少し長く残す
export const AXE_TRAIL_TIP = new THREE.Vector3(0.23, 1.1, 0); // 斧のローカル座標
export const AXE_TRAIL_BASE = new THREE.Vector3(0.25, 0.7, 0); // 太い帯で重さを見せる
export const axeRibbon = new Ribbon(200, 0.12, makeRibbonMaterial(AXE_RIBBON));
camera.add(axeRibbon.mesh);
// 空中の叩きつけだけは、刃先の外まで広げた太い帯を、長めに残す
export const AXE_SLAM_TRAIL_TIP = new THREE.Vector3(0.23, 1.16, 0);
export const AXE_SLAM_TRAIL_BASE = new THREE.Vector3(0.25, 0.6, 0);
export const AXE_SLAM_TRAIL_LIFE = 0.2;
export const AXE_SLAM_TRAIL_HOLD = 0.45; // 落ちている間に軌跡を止めておく最長の時間（着地しないまま残り続けないように）
export const axeSlamRibbon = new Ribbon(200, AXE_SLAM_TRAIL_LIFE, makeRibbonMaterial(AXE_SLAM_RIBBON));
camera.add(axeSlamRibbon.mesh);
let axeSlamClock = 0; // 叩きつけの軌跡の時計（落ちている間は止める）
let axeSlamHold = 0; // 今の叩きつけで時計を止めていた時間
let axeLastTrail = -Infinity;
export const axeTrailTip = new THREE.Vector3();
export const axeTrailBase = new THREE.Vector3();
export function pushAxeTrail(p, time, slam) {
    applyAxePose(p);
    heldAxeModel.updateWorldMatrix(true, false);
    camera.worldToLocal(axeTrailTip.copy(slam ? AXE_SLAM_TRAIL_TIP : AXE_TRAIL_TIP).applyMatrix4(heldAxeModel.matrixWorld));
    camera.worldToLocal(axeTrailBase.copy(slam ? AXE_SLAM_TRAIL_BASE : AXE_TRAIL_BASE).applyMatrix4(heldAxeModel.matrixWorld));
    (slam ? axeSlamRibbon : axeRibbon).push(axeTrailTip, axeTrailBase, time);
}
export function sampleAxeTrail() {
    const def = axeState.axeAttack;
    if (!def)
        return;
    for (const [from, to] of def.trails) {
        const end = Math.min(to, axeState.axeTime);
        for (let s = Math.max(from, axeLastTrail + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
            if (s - axeLastTrail > TRAIL_STEP * 1.5)
                axeRibbon.cut(); // 別の時間帯の軌跡とはつながない
            axePoseAt(def, s, axeTrailPose);
            if (def === AXE_AIR)
                pushAxeTrail(axeTrailPose, axeSlamClock - (axeState.axeTime - s), true);
            else
                pushAxeTrail(axeTrailPose, game.trailNow - (axeState.axeTime - s), false);
            axeLastTrail = s;
        }
    }
}

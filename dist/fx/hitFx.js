import * as THREE from 'three';
import { rand } from '../random.js';
let env;
export function initHitFx(e) {
    env = e;
}
const DEG = Math.PI / 180;
export const HIT_TINT = new THREE.Color(0xffffff); // 光の色（ゲームの配色に合わせて白一色）
export const HIT_CORE = new THREE.Color(0xffffff); // 中心の色
// 当たりの光線・斬撃の線・光の筋の色と、斬撃の線の太さの倍率を差し替える（スキンに合わせるとき）。当てる直前に入れ、終わったら戻す
export const hitFxTint = { color: null, slashWidth: 1, sparks: null };
const hitSparkTint = new THREE.Color();
const HIT_RAYS = 9; // fx = 1 のときの放射状の光線の数
export const HEAVY_FX = 1.5; // fx がこれ以上の攻撃（締めの技）は長く・整った形で見せる
const QUICK_LIFE = 0.6; // それ以外の攻撃の光の長さの倍率
export const fxScene = new THREE.Scene();
const ADDITIVE = { transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false };
const easeOut3 = (t) => 1 - (1 - t) ** 3;
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const BEAM_MAX = 192;
const beams = [];
const beamPool = [];
// 断面の半径（太さ 1 = 直径 1）を根元から先端へ: 根元は細く、先端の手前で最も太く、先端で尖る
const beamGeo = new THREE.LatheGeometry([[0, 0], [0.12, 0.2], [0.32, 0.55], [0.5, 0.82], [0.3, 0.94], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
const beamMesh = new THREE.InstancedMesh(beamGeo, new THREE.ShaderMaterial({
    ...ADDITIVE,
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vFacing;
      varying vec3 vColor;
      void main() {
        vAlong = position.y;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(1.0);
        #endif
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        // 軸ごとに伸縮しているので、法線は各軸の長さの 2 乗で割って向きを保つ
        mat3 m = mat3(instanceMatrix);
        m[0] /= dot(m[0], m[0]);
        m[1] /= dot(m[1], m[1]);
        m[2] /= dot(m[2], m[2]);
        vec3 n = normalize(normalMatrix * (m * normal));
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlong;
      varying float vFacing;
      varying vec3 vColor;
      void main() {
        // 輪郭ほど透け、芯は白く飛ばす
        float glow = pow(vFacing, 1.5);
        float core = pow(vFacing, 10.0);
        float along = smoothstep(0.0, 0.25, vAlong) * (0.35 + 0.65 * vAlong);
        float peak = max(vColor.r, max(vColor.g, vColor.b));
        gl_FragColor = vec4((vColor * glow + vec3(peak) * core) * along, 1.0);
      }
    `,
}), BEAM_MAX);
beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < BEAM_MAX; i++)
    beamMesh.setColorAt(i, HIT_TINT); // instanceColor を作っておく
beamMesh.count = 0;
beamMesh.frustumCulled = false;
fxScene.add(beamMesh);
export function addBeam(origin, dir, opts) {
    if (beams.length >= BEAM_MAX)
        beamPool.push(beams.shift());
    const b = beamPool.pop() ?? {
        origin: new THREE.Vector3(), dir: new THREE.Vector3(), color: new THREE.Color(),
        len: 0, width: 0, offset: 0, tail: 0, reach: 0, age: 0, life: 0,
    };
    b.origin.copy(origin);
    b.dir.copy(dir).normalize();
    b.color.copy(opts.color);
    b.len = opts.len ?? 1;
    b.width = opts.width ?? 0.05;
    b.offset = opts.offset ?? 0;
    b.tail = opts.tail ?? 0.9;
    b.reach = opts.reach ?? 1.4;
    b.age = opts.age ?? 0;
    b.life = opts.life ?? 0.2;
    beams.push(b);
}
// -- カメラへ向けた板を、伸ばす向きに合わせて置く（火花で使う） --
const stripMatrix = new THREE.Matrix4();
const stripDir = new THREE.Vector3();
const stripSide = new THREE.Vector3();
const stripNormal = new THREE.Vector3();
function setStrip(from, dir, len, width) {
    stripDir.copy(dir);
    stripSide.subVectors(env.camera.position, from).cross(stripDir);
    if (stripSide.lengthSq() < 1e-8)
        stripSide.set(0, 1, 0).cross(stripDir);
    stripSide.normalize();
    stripNormal.crossVectors(stripDir, stripSide);
    stripMatrix.makeBasis(stripDir.multiplyScalar(len), stripSide.multiplyScalar(width), stripNormal);
    stripMatrix.setPosition(from);
    return stripMatrix;
}
// 立体の棒を、根元 from から dir の向きへ長さ len・太さ width で置く
const rodMatrix = new THREE.Matrix4();
const rodX = new THREE.Vector3();
const rodY = new THREE.Vector3();
const rodZ = new THREE.Vector3();
function setRod(from, dir, len, width) {
    rodY.copy(dir);
    rodX.set(0, 1, 0).cross(rodY);
    if (rodX.lengthSq() < 1e-6)
        rodX.set(1, 0, 0).cross(rodY);
    rodX.normalize();
    rodZ.crossVectors(rodX, rodY);
    rodMatrix.makeBasis(rodX.multiplyScalar(width), rodY.multiplyScalar(len), rodZ.multiplyScalar(width));
    rodMatrix.setPosition(from);
    return rodMatrix;
}
const beamFrom = new THREE.Vector3();
const beamColor = new THREE.Color();
function updateBeams(dt) {
    let n = 0;
    let drawn = 0;
    for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        b.age += dt;
        if (b.age >= b.life) {
            beamPool.push(b);
            continue;
        }
        beams[n++] = b;
        if (b.age < 0)
            continue;
        const t = b.age / b.life;
        const head = b.offset + b.len * easeOut3(Math.min(1, t * b.reach));
        const tail = b.offset + b.len * b.tail * t * t;
        const len = head - tail;
        if (len <= 1e-4)
            continue;
        beamFrom.copy(b.origin).addScaledVector(b.dir, tail);
        beamMesh.setMatrixAt(drawn, setRod(beamFrom, b.dir, len, b.width * (1 - t)));
        beamMesh.setColorAt(drawn, beamColor.copy(b.color).multiplyScalar(Math.sqrt(1 - t)));
        drawn++;
    }
    beams.length = n;
    beamMesh.count = drawn;
    beamMesh.instanceMatrix.needsUpdate = true;
    if (beamMesh.instanceColor)
        beamMesh.instanceColor.needsUpdate = true;
}
// -- 中心の閃光（カメラへ向けた板） --
const billboardVertex = /* glsl */ `
  uniform float uScale;
  uniform float uRot;
  uniform float uStretch; // 縦横の比。毎回変えて光芒の形を崩す
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float c = cos(uRot), s = sin(uRot);
    mv.xy += mat2(c, s, -s, c) * (position.xy * vec2(uStretch, 1.0 / uStretch)) * uScale;
    gl_Position = projectionMatrix * mv;
  }
`;
const billboardGeo = new THREE.PlaneGeometry(1, 1);
function makeBursts(count, fragmentShader) {
    return Array.from({ length: count }, () => {
        const mat = new THREE.ShaderMaterial({
            ...ADDITIVE,
            uniforms: {
                uScale: { value: 1 }, uRot: { value: 0 }, uStretch: { value: 1 }, uI: { value: 0 },
                uColor: { value: HIT_TINT }, uCore: { value: HIT_CORE },
            },
            vertexShader: billboardVertex,
            fragmentShader,
        });
        const mesh = new THREE.Mesh(billboardGeo, mat);
        mesh.frustumCulled = false;
        mesh.visible = false;
        fxScene.add(mesh);
        return { mesh, mat, age: Infinity, life: 1, size: 1, power: 1 };
    });
}
// 白い芯・色のついた光暈・十字と斜めの光芒
export const flares = makeBursts(4, /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uI;
  varying vec2 vUv;
  void main() {
    float r2 = dot(vUv, vUv);
    float core = exp(-r2 * 120.0);
    float halo = exp(-r2 * 10.0) * 0.3;
    vec2 a = abs(vUv);
    float star = exp(-a.x * 70.0) * exp(-a.y * 2.2) + exp(-a.y * 70.0) * exp(-a.x * 2.2);
    vec2 b = abs(mat2(0.7071, 0.7071, -0.7071, 0.7071) * vUv);
    float star2 = (exp(-b.x * 110.0) * exp(-b.y * 5.0) + exp(-b.y * 110.0) * exp(-b.x * 5.0)) * 0.6;
    float edge = 1.0 - smoothstep(0.8, 1.0, sqrt(r2));
    vec3 col = uCore * (core * 2.5 + star * 0.9) + uColor * (halo + star * 0.8 + star2);
    gl_FragColor = vec4(col * uI * edge, 1.0);
  }
`);
export function fireBurst(list, at, size, life, power, stretch = 1) {
    const b = list.reduce((a, c) => (c.age > a.age ? c : a)); // いちばん古いものを使い回す
    b.mesh.position.copy(at);
    b.mat.uniforms.uRot.value = Math.random() * Math.PI;
    b.mat.uniforms.uStretch.value = stretch;
    b.age = 0;
    b.life = life;
    b.size = size;
    b.power = power;
    return b;
}
function updateBursts(dt) {
    for (const f of flares) {
        f.age += dt;
        const t = f.age / f.life;
        f.mesh.visible = t >= 0 && t < 1;
        if (!f.mesh.visible)
            continue;
        // 一瞬で大きく開き、しぼみながら消える
        const pop = Math.min(1, f.age / 0.03);
        f.mat.uniforms.uScale.value = f.size * (0.4 + 0.8 * pop) * (1 - 0.5 * t);
        f.mat.uniforms.uI.value = f.power * (1 - t) ** 2;
    }
}
// -- 光の粒（火花） --
const SPARK_MAX = 256;
const SPARK_GRAVITY = 14;
const SPARK_DRAG = 5; // 空気抵抗。速く飛び出してすぐ失速させる
const SPARK_STRETCH = 0.04; // 速さ 1 m/s あたりの尾の長さ
const sparks = [];
const sparkPool = [];
const sparkGeo = new THREE.BufferGeometry();
// +x が先頭。先頭寄りを太くして尾を細くする（根元が原点）
sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, 0.8, 0.5, 0, 0, 0, 0, 0.8, -0.5, 0], 3));
sparkGeo.setIndex([0, 1, 2, 0, 2, 3]);
const sparkMesh = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial({ ...ADDITIVE, side: THREE.DoubleSide }), SPARK_MAX);
sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < SPARK_MAX; i++)
    sparkMesh.setColorAt(i, HIT_CORE); // instanceColor を作っておく
sparkMesh.count = 0;
sparkMesh.frustumCulled = false;
fxScene.add(sparkMesh);
// swing（単位ベクトル）を渡すと、その向きへ寄せて飛ばす。tint を渡すと、白からその色へ変わって消える（スキンの色など）
export function spawnSparks(at, hitDir, count, lifeScale = 1, size = 1, swing, tint = null) {
    for (let i = 0; i < count; i++) {
        if (sparks.length >= SPARK_MAX)
            sparkPool.push(sparks.shift());
        const s = sparkPool.pop() ?? { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 0, width: 0, tint: null };
        s.pos.copy(at);
        // 攻撃した側へ跳ね返りつつ、横と上へ大きく散らす
        s.vel.randomDirection().addScaledVector(hitDir, -0.35);
        if (swing)
            s.vel.addScaledVector(swing, 1.3);
        s.vel.y += swing ? 0.15 : 0.4;
        s.vel.normalize().multiplyScalar((4 + Math.random() * 8) * size);
        s.age = 0;
        s.life = (0.15 + Math.random() * 0.3) * lifeScale;
        s.width = (0.012 + Math.random() * 0.018) * size;
        s.tint = tint;
        sparks.push(s);
    }
}
const sparkFrom = new THREE.Vector3();
const sparkDir = new THREE.Vector3();
const sparkColor = new THREE.Color();
function updateSparks(dt) {
    const drag = Math.max(0, 1 - SPARK_DRAG * dt);
    let n = 0;
    for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.life) {
            sparkPool.push(s);
            continue;
        }
        s.vel.y -= SPARK_GRAVITY * dt;
        s.vel.multiplyScalar(drag);
        s.pos.addScaledVector(s.vel, dt);
        sparks[n] = s;
        // 白から光の色へ変わりながら、短く細く暗くなって消える
        const t = s.age / s.life;
        const k = 1 - t;
        const speed = s.vel.length();
        const len = Math.max(0.03, speed * SPARK_STRETCH) * k;
        sparkDir.copy(s.vel).divideScalar(speed || 1);
        sparkFrom.copy(s.pos).addScaledVector(sparkDir, -len);
        sparkMesh.setMatrixAt(n, setStrip(sparkFrom, sparkDir, len, s.width * (0.4 + 0.6 * k)));
        const near = THREE.MathUtils.smoothstep(s.pos.distanceTo(env.camera.position), 0.5, 1.0); // 目の前に来た粒は大きく映りすぎるので消す
        sparkColor.lerpColors(HIT_CORE, s.tint ?? HIT_TINT, Math.min(1, t * 2)).multiplyScalar(1.6 * k * near);
        sparkMesh.setColorAt(n, sparkColor);
        n++;
    }
    sparks.length = n;
    sparkMesh.count = n;
    sparkMesh.instanceMatrix.needsUpdate = true;
    if (sparkMesh.instanceColor)
        sparkMesh.instanceColor.needsUpdate = true;
}
// -- 三角形の破片 --
const SHARD_MAX = 256;
const SHARD_GRAVITY = 18;
const SHARD_DRAG = 2.5; // 火花より重く、遠くまで飛ぶ
const SHARD_BOUNCE = 0.35; // 床で跳ね返るときに残す速さ
const shards = [];
const shardPool = [];
const shardGeo = new THREE.BufferGeometry();
// 少し歪んだ三角形。インスタンスごとに縦横の比を変えて形をばらつかせる
shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, -0.45, -0.35, 0, 0.55, -0.25, 0], 3));
// 敵の体のかけらに見えるよう、光の演出と違って加算にせず敵の色で塗る
const shardMesh = new THREE.InstancedMesh(shardGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthTest: false, depthWrite: false }), SHARD_MAX);
shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < SHARD_MAX; i++)
    shardMesh.setColorAt(i, HIT_CORE); // instanceColor を作っておく
shardMesh.count = 0;
shardMesh.frustumCulled = false;
fxScene.add(shardMesh);
// tint を渡すと、敵の色の代わりにその色で塗る（床のかけらなど）
export function spawnShards(at, hitDir, count, lifeScale = 1, size = 1, swing, tint = null) {
    for (let i = 0; i < count; i++) {
        if (shards.length >= SHARD_MAX)
            shardPool.push(shards.shift());
        const s = shardPool.pop() ?? {
            pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), axis: new THREE.Vector3(),
            spin: 0, scale: new THREE.Vector3(), age: 0, life: 0, tint: null,
        };
        s.tint = tint;
        s.pos.copy(at);
        // 攻撃の向きへ抜けるように飛ばし、上へも跳ね上げる
        s.vel.randomDirection().addScaledVector(hitDir, 0.6);
        if (swing)
            s.vel.addScaledVector(swing, 1.1);
        s.vel.y += swing ? 0.35 : 0.6;
        s.vel.normalize().multiplyScalar(rand(3, 9) * size);
        s.quat.setFromAxisAngle(s.axis.randomDirection(), Math.random() * Math.PI * 2);
        s.axis.randomDirection();
        s.spin = rand(10, 30) * (Math.random() < 0.5 ? -1 : 1);
        const r = rand(0.04, 0.11) * size;
        s.scale.set(r * rand(0.6, 1.4), r * rand(0.6, 1.4), 1);
        s.age = 0;
        s.life = rand(0.45, 0.9) * lifeScale;
        shards.push(s);
    }
}
const shardRot = new THREE.Quaternion();
const shardMatrix = new THREE.Matrix4();
const shardColor = new THREE.Color();
const shardScale = new THREE.Vector3();
function updateShards(dt) {
    const drag = Math.max(0, 1 - SHARD_DRAG * dt);
    let n = 0;
    for (let i = 0; i < shards.length; i++) {
        const s = shards[i];
        s.age += dt;
        if (s.age >= s.life) {
            shardPool.push(s);
            continue;
        }
        s.vel.y -= SHARD_GRAVITY * dt;
        s.vel.multiplyScalar(drag);
        s.pos.addScaledVector(s.vel, dt);
        // 床に当たったら跳ねて、回転も落とす
        const floor = env.floorAt(s.pos.x, s.pos.z, s.pos.y + 0.05);
        if (s.pos.y < floor && s.vel.y < 0) {
            s.pos.y = floor;
            s.vel.y *= -SHARD_BOUNCE;
            s.vel.x *= 0.6;
            s.vel.z *= 0.6;
            s.spin *= 0.5;
        }
        s.quat.premultiply(shardRot.setFromAxisAngle(s.axis, s.spin * dt));
        shards[n] = s;
        // 最後の 4 割で縮んで消える。目の前に来た破片は大きく映りすぎるので縮めて消す
        const t = s.age / s.life;
        const k = Math.min(1, (1 - t) / 0.4);
        const near = THREE.MathUtils.smoothstep(s.pos.distanceTo(env.camera.position), 0.5, 1.0);
        shardMatrix.compose(s.pos, s.quat, shardScale.copy(s.scale).multiplyScalar(k * near));
        shardMesh.setMatrixAt(n, shardMatrix);
        // 敵の色で塗り、回転で面がこちらを向いたときに白くきらめかせる。向きによって明暗もつける
        toShardCam.subVectors(env.camera.position, s.pos).normalize();
        shardNormal.set(0, 0, 1).applyQuaternion(s.quat);
        const facing = Math.abs(shardNormal.dot(toShardCam));
        shardColor.copy(s.tint ?? env.shardTint()).multiplyScalar(0.6 + 0.5 * facing).lerp(HIT_CORE, 0.6 * facing ** 6);
        shardMesh.setColorAt(n, shardColor);
        n++;
    }
    shards.length = n;
    shardMesh.count = n;
    shardMesh.instanceMatrix.needsUpdate = true;
    if (shardMesh.instanceColor)
        shardMesh.instanceColor.needsUpdate = true;
}
const toShardCam = new THREE.Vector3();
const shardNormal = new THREE.Vector3();
const HOLO_MAX = 96;
const holoChains = [];
const holoPool = [];
const HOLO_POINTS = [
    [-1, 0, -.55, .55, -.15, -.38, .22, .48, .58, -.44, 1, .12],
    [-1, -.18, -.7, .38, -.22, -.58, .08, .2, .67, -.2, 1, .42],
    [-1, .28, -.62, -.42, -.05, .54, .35, -.22, .72, .38, 1, -.12],
];
const holoGeos = HOLO_POINTS.map((points) => {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < points.length; i += 2)
        positions.push(points[i], points[i + 1], 0);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    return geo;
});
const holoFillMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.16, blending: THREE.NormalBlending,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
});
const holoWireMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide, wireframe: true,
});
const holoFills = holoGeos.map((geo) => new THREE.InstancedMesh(geo, holoFillMat, HOLO_MAX));
const holoWires = holoGeos.map((geo) => new THREE.InstancedMesh(geo, holoWireMat, HOLO_MAX));
for (const mesh of [...holoFills, ...holoWires]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    fxScene.add(mesh);
}
export function spawnHologramChains(at, hitDir, swing, fx, look) {
    const count = Math.max(1, Math.round(look.count * Math.sqrt(fx)));
    for (let i = 0; i < count; i++) {
        if (holoChains.length >= HOLO_MAX)
            holoPool.push(holoChains.shift());
        const h = holoPool.pop() ?? {
            pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), axis: new THREE.Vector3(),
            spin: 0, scale: new THREE.Vector3(), age: 0, life: 0, variant: 0, color: new THREE.Color(), core: new THREE.Color(),
        };
        h.pos.copy(at).addScaledVector(hitDir, rand(-0.03, 0.04));
        h.vel.randomDirection().addScaledVector(hitDir, -0.35);
        if (swing)
            h.vel.addScaledVector(swing, 1.15);
        h.vel.y += rand(0.05, 0.35);
        h.vel.normalize().multiplyScalar(rand(1.8, 4.2) * Math.sqrt(fx));
        h.axis.randomDirection();
        h.quat.setFromAxisAngle(h.axis, Math.random() * Math.PI * 2);
        h.spin = rand(5, 11) * (Math.random() < 0.5 ? -1 : 1);
        const size = rand(0.55, 1.35) * look.size * Math.sqrt(fx);
        h.scale.set(size * rand(0.7, 1.65), size * rand(0.55, 1.25), size);
        h.age = -rand(0, 0.045);
        h.life = rand(0.55, 1) * look.life;
        h.variant = Math.floor(Math.random() * holoGeos.length);
        h.color.setHex(look.color);
        h.core.setHex(look.core);
        holoChains.push(h);
    }
}
const holoMatrix = new THREE.Matrix4();
const holoRot = new THREE.Quaternion();
const holoScale = new THREE.Vector3();
const holoColor = new THREE.Color();
function updateHologramChains(dt) {
    let alive = 0;
    const drawn = holoGeos.map(() => 0);
    for (const h of holoChains) {
        h.age += dt;
        if (h.age >= h.life) {
            holoPool.push(h);
            continue;
        }
        holoChains[alive++] = h;
        if (h.age < 0)
            continue;
        const t = h.age / h.life;
        h.vel.multiplyScalar(Math.max(0, 1 - 5 * dt));
        h.vel.y -= 1.5 * dt; // ordinary hit debris pulls the hologram back into the game's physical feel
        h.pos.addScaledVector(h.vel, dt);
        h.quat.premultiply(holoRot.setFromAxisAngle(h.axis, h.spin * dt));
        const appear = Math.min(1, h.age / 0.045);
        const fade = (1 - t) ** 1.35;
        const index = drawn[h.variant]++;
        const scan = 0.88 + 0.12 * Math.sin(h.age * 85 + index * 2.1 + h.variant);
        holoMatrix.compose(h.pos, h.quat, holoScale.copy(h.scale).multiplyScalar(appear * fade));
        holoFills[h.variant].setMatrixAt(index, holoMatrix);
        holoWires[h.variant].setMatrixAt(index, holoMatrix);
        holoFills[h.variant].setColorAt(index, holoColor.copy(h.color).multiplyScalar(fade * scan));
        holoWires[h.variant].setColorAt(index, holoColor.copy(h.core).multiplyScalar(fade * (0.8 + 0.2 * scan)));
    }
    holoChains.length = alive;
    for (let variant = 0; variant < holoGeos.length; variant++) {
        for (const mesh of [holoFills[variant], holoWires[variant]]) {
            mesh.count = drawn[variant];
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor)
                mesh.instanceColor.needsUpdate = true;
        }
    }
}
// -- 画面全体の暗転の時間変化 --
// age: 当たってからの時間、hold: ヒットストップの長さ（この間は暗転を保つ）、power: 暗転の強さ
export const impact = { age: Infinity, hold: 0, power: 0 };
// 演出は空間に置くので、遠いほど小さく映る。ただし遠くの当たりが見えなくならないよう、
// 実際の大きさは距離の平方根で少し大きくする（近いと小さめ、遠いと大きめ）
const HIT_FX_REF_DIST = 1.6; // この距離で大きさ 1 倍
const HIT_FX_MIN_SCALE = 0.7;
const HIT_FX_MAX_SCALE = 4;
// 刀の振りの向きへ流す演出
export const SWING_MIN_SIDE = 0.35; // 振りのうち画面に沿った成分がこの割合より小さければ（突きなど）向きを使わない
const SWING_AHEAD = 1.3; // 斬撃の線の、斬り抜けた側の長さの倍率
const SWING_BEHIND = 0.3; // 振り始めの側の長さの倍率
const SWING_STREAKS = 6; // fx = 1 のときに斬り抜けた向きへ噴き出す光の筋の数
const SWING_SPREAD = 0.45; // 光の筋の広がり（大きいほど扇が開く）
const swingFlow = new THREE.Vector3();
const rayDir = new THREE.Vector3();
const toCamera = new THREE.Vector3();
export function spawnHitFx(at, hitDir, def, swing) {
    const fx = def.fx ?? 1;
    const tint = hitFxTint.color ?? HIT_TINT;
    env.camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(env.camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(env.camera.matrixWorld, 1);
    toCamera.subVectors(env.camera.position, at);
    const dist = Math.max(toCamera.length(), 1e-3);
    toCamera.divideScalar(dist);
    const size = THREE.MathUtils.clamp(Math.sqrt(dist / HIT_FX_REF_DIST), HIT_FX_MIN_SCALE, HIT_FX_MAX_SCALE);
    // 刃が動いていた向きのうち、画面に沿った成分。突きのように奥へ向かう振りでは使わない
    let flow;
    if (swing && swing.lengthSq() > 1e-8) {
        swingFlow.copy(swing).addScaledVector(toCamera, -swing.dot(toCamera));
        if (swingFlow.lengthSq() > SWING_MIN_SIDE ** 2 * swing.lengthSq())
            flow = swingFlow.normalize();
    }
    // 連打で何度も出る通常の攻撃は、短く・毎回形を変えてうるさくならないようにする。締めの技はじっくり見せる
    const heavy = fx >= HEAVY_FX;
    const lifeK = heavy ? 1 : QUICK_LIFE;
    // 中心の閃光: 大きさ・縦横比・向きを毎回変える
    fireBurst(flares, at, 1.1 * Math.sqrt(fx) * size * rand(0.7, 1.25), (0.14 + 0.04 * fx) * lifeK, 0.6 + 0.25 * fx, heavy ? 1 : rand(0.55, 1.6));
    // 放射状の光線: 当たった場所から空間の全方向へ、攻撃した側へ少し寄せて飛ばす
    // 通常の攻撃は本数・長さをばらばらにする
    const rays = Math.round(HIT_RAYS * fx * (heavy ? 1.2 : rand(0.6, 1.2)));
    for (let i = 0; i < rays; i++) {
        // 目に刺さる向きは避ける
        for (let tries = 0; tries < 4; tries++) {
            rayDir.randomDirection().addScaledVector(hitDir, -0.5);
            if (flow)
                rayDir.addScaledVector(flow, 0.6);
            rayDir.normalize();
            if (rayDir.dot(toCamera) < 0.6)
                break;
        }
        const len = heavy
            ? (Math.random() < 0.3 ? 1.8 : 0.7 + Math.random() * 0.7) * fx
            : (0.25 + Math.random() ** 2 * 1.4) * fx; // 短いものが多く、ときどき長いもの
        addBeam(at, rayDir, {
            color: tint,
            len: len * size,
            width: rand(0.03, 0.08) * Math.sqrt(fx) * size,
            offset: rand(0.06, 0.16) * size,
            tail: 0.9,
            reach: rand(1.3, 2),
            life: rand(0.14, 0.24) * lifeK,
            age: -Math.random() * 0.02 * lifeK,
        });
    }
    // 斬撃に沿って走る光の線（突きは視線の奥へ向かうので、代わりに横一文字の光を出す）。
    // 刃の向きがわかるときは実際に振った向きへ線を引き、斬り抜けた側へ長く、振り始めの側は短くする
    const slash = flow ? Math.atan2(flow.dot(camUp), flow.dot(camRight)) / DEG : def.slash ?? 0;
    const jitter = flow ? (heavy ? 4 : 10) : heavy ? 8 : 22;
    const lines = (def.slash === undefined && !flow) || heavy || Math.random() < 0.6 ? 1 : 2; // ときどき 2 本に割る
    for (let l = 0; l < lines; l++) {
        const a = (slash + (Math.random() - 0.5) * jitter) * DEG;
        rayDir.copy(camRight).multiplyScalar(Math.cos(a)).addScaledVector(camUp, Math.sin(a));
        // 線の中心を少しずらして、左右の長さも変える
        const shift = l > 0 ? rand(-0.08, 0.08) * size : 0;
        lineOrigin.copy(at).addScaledVector(camRight, -Math.sin(a) * shift).addScaledVector(camUp, Math.cos(a) * shift);
        const thin = (l > 0 ? 0.5 : 1) * size * hitFxTint.slashWidth;
        const baseLen = (def.slash === undefined ? 3.2 : 2.6) * fx * thin;
        for (const sign of [1, -1]) {
            lineDir.copy(rayDir).multiplyScalar(sign);
            const ahead = flow ? (sign > 0 ? SWING_AHEAD : SWING_BEHIND) : 1;
            const len = baseLen * ahead * (heavy ? 1 : rand(0.45, 1.1));
            const life = (def.slash === undefined ? 0.24 : 0.2) * lifeK * rand(0.8, 1.1);
            addBeam(lineOrigin, lineDir, { color: tint, len, width: rand(0.07, 0.12) * thin, tail: 0.5, reach: 3, life });
            addBeam(lineOrigin, lineDir, { color: HIT_CORE, len: len * 0.85, width: 0.035 * thin, tail: 0.5, reach: 3, life: life * 0.8 });
        }
    }
    // 斬り抜けた向きへ、細い光の筋を扇状に噴き出させる（刃が通り過ぎたあとに勢いが抜けていくように）
    if (flow) {
        const streaks = Math.round(SWING_STREAKS * fx * (heavy ? 1.2 : rand(0.7, 1.2)));
        for (let i = 0; i < streaks; i++) {
            for (let tries = 0; tries < 4; tries++) {
                rayDir.randomDirection().multiplyScalar(SWING_SPREAD).add(flow).normalize();
                if (rayDir.dot(toCamera) < 0.5)
                    break;
            }
            addBeam(at, rayDir, {
                color: tint,
                len: rand(0.5, 1.5) * fx * size,
                width: rand(0.02, 0.05) * Math.sqrt(fx) * size,
                offset: rand(0.1, 0.3) * size,
                tail: 1,
                reach: rand(1.6, 2.4),
                life: rand(0.16, 0.28) * lifeK,
                age: -rand(0.01, 0.04) * lifeK, // 刃が抜けてから少し遅れて出す
            });
        }
    }
    const sk = hitFxTint.sparks;
    const sparkCount = 16 * fx * (heavy ? 1 : rand(0.5, 1.1));
    if (sk) {
        hitSparkTint.setHex(sk.tint);
        spawnSparks(at, hitDir, Math.round(sparkCount * sk.count), lifeK * sk.life, size * sk.size, flow, hitSparkTint);
        spawnSparks(at, hitDir, Math.round(sparkCount * sk.embers), lifeK * sk.life * 2.5, size * 0.4, flow, hitSparkTint);
    }
    else
        spawnSparks(at, hitDir, Math.round(sparkCount), lifeK, size, flow);
    spawnShards(at, hitDir, Math.round(8 * fx * (heavy ? 1.3 : rand(0.6, 1.1))), heavy ? 1.3 : 1, size, flow);
    impact.age = 0;
    impact.hold = def.hitStop ?? env.hitStop.normal;
    // 遠くの当たりで画面全体が暗くならないよう、離れるほど弱める
    impact.power = fx * THREE.MathUtils.clamp(HIT_FX_REF_DIST / dist, 0.2, 1);
}
// とどめ: 体じゅうから破片を噴き出させ、大きな閃光・全方向への長い光線・腰の高さに広がる光の輪を重ねる
const killCenter = new THREE.Vector3();
const killPoint = new THREE.Vector3();
export function spawnKillFx(root, dir) {
    killCenter.set(root.x, root.y + 1, root.z);
    toCamera.subVectors(env.camera.position, killCenter).normalize();
    // 体の形に沿って、足元から頭まで破片を割り出す
    for (let i = 0; i < 18; i++) {
        const y = root.y + 0.1 + (i / 17) * (env.bodyHeight - 0.15);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * env.bodyRadius;
        killPoint.set(root.x + Math.cos(a) * r, y, root.z + Math.sin(a) * r);
        spawnShards(killPoint, dir, 8, rand(1.8, 2.6), rand(1.2, 1.8));
    }
    spawnSparks(killCenter, dir, 70, 2.2, 1.7);
    // 閃光を 2 枚: 大きく長いものと、鋭く短いもの
    fireBurst(flares, killCenter, 5, 0.45, 2.6, 1);
    fireBurst(flares, killCenter, 2.4, 0.2, 2, rand(1.6, 2.2));
    // 全方向への長い光線（目に刺さる向きは避ける）
    for (let i = 0; i < 28; i++) {
        for (let tries = 0; tries < 4; tries++) {
            rayDir.randomDirection().addScaledVector(dir, 0.4).normalize();
            if (rayDir.dot(toCamera) < 0.5)
                break;
        }
        addBeam(killCenter, rayDir, {
            color: HIT_TINT,
            len: rand(2.5, 6),
            width: rand(0.08, 0.18),
            offset: rand(0.1, 0.3),
            tail: 0.95,
            reach: rand(1.4, 2.2),
            life: rand(0.35, 0.6),
            age: -Math.random() * 0.05,
        });
    }
    // 水平に広がる衝撃の輪
    for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + Math.random() * 0.1;
        rayDir.set(Math.cos(a), rand(-0.03, 0.06), Math.sin(a)).normalize();
        addBeam(killPoint.set(root.x, root.y + rand(0.15, 0.4), root.z), rayDir, {
            color: HIT_TINT,
            len: rand(3, 4.5),
            width: rand(0.05, 0.09),
            offset: 0.3,
            tail: 1,
            reach: 1.2,
            life: rand(0.5, 0.65),
        });
    }
    impact.age = 0;
    impact.hold = env.hitStop.kill;
    impact.power = 2.5;
}
// 最後の 1 体: とどめの演出に重ねて、天へ伸びる光の柱・時間差で広がる 3 重の輪・さらに大きな閃光を足す
export function spawnFinaleFx(root, dir) {
    // 天へ伸びる柱: 束ねた太い光線を、わずかに散らして真上へ
    for (let i = 0; i < 10; i++) {
        rayDir.set(rand(-0.06, 0.06), 1, rand(-0.06, 0.06)).normalize();
        addBeam(killPoint.set(root.x, root.y, root.z), rayDir, {
            color: HIT_TINT,
            len: rand(14, 26),
            width: rand(0.12, 0.3),
            offset: 0,
            tail: 1,
            reach: rand(1.5, 2.2),
            life: rand(0.9, 1.3),
            age: -rand(0, 0.04),
        });
    }
    // 足元から時間差で広がる輪。外側の輪ほど遅れて、遠くまで届く
    for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2 + ring * 0.4 + Math.random() * 0.08;
            rayDir.set(Math.cos(a), rand(-0.02, 0.04), Math.sin(a)).normalize();
            addBeam(killPoint.set(root.x, root.y + 0.08 + ring * 0.05, root.z), rayDir, {
                color: HIT_TINT,
                len: rand(5, 7) + ring * 3,
                width: rand(0.06, 0.1),
                offset: 0.4 + ring * 0.8,
                tail: 1,
                reach: 1.6 + ring * 0.6,
                life: rand(0.8, 1.0),
                age: -ring * 0.12,
            });
        }
    }
    // 斬り抜けた向きへ噴き出す、長い光線の束
    for (let i = 0; i < 16; i++) {
        rayDir.randomDirection().multiplyScalar(0.35).add(dir).normalize();
        addBeam(killCenter, rayDir, {
            color: HIT_TINT,
            len: rand(6, 12),
            width: rand(0.1, 0.22),
            offset: rand(0.2, 0.5),
            tail: 0.95,
            reach: rand(1.8, 2.6),
            life: rand(0.6, 0.9),
            age: -Math.random() * 0.06,
        });
    }
    spawnSparks(killCenter, dir, 120, 3.2, 2.2);
    fireBurst(flares, killCenter, 9, 0.9, 3, 1);
    fireBurst(flares, killCenter, 4, 0.4, 2.4, rand(2.4, 3));
    impact.hold = env.hitStop.finale;
    impact.power = 4;
}
const lineOrigin = new THREE.Vector3();
const lineDir = new THREE.Vector3();
// 粒と光を進める
export function updateHitParticles(dt) {
    updateBeams(dt);
    updateBursts(dt);
    updateSparks(dt);
    updateShards(dt);
    updateHologramChains(dt);
}
// 光が 1 つでも出ているか。出ていなければ、光を重ねる描画ごと飛ばせる
export const hitFxVisible = () => fxScene.children.some((o) => o.visible && (!(o instanceof THREE.InstancedMesh) || o.count > 0));

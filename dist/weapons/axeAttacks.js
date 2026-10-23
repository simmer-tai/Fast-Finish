import * as THREE from 'three';
import { DEG } from '../math.js';
import { AXE_REST_QUAT } from './battleAxe.js';
// 補間する値は 1 列に並べる: 手の位置 (3)、最初の key からの回転の積み重ね（回転軸 × 角度、カメラ空間）(3)。
// 向きを回転の量でつなぐので、大きく回す区間でも回る速さがむらにならない
export const AXE_CHANNELS = 6;
export const AXE_HEAD = 0.95; // 握りから頭までの距離（刃先を前後の key から決めるのに使う）
// 構えの手は体の近くに引き付けてあるので、振っている間（手の位置を持つ key）は腕を前へ伸ばす
export const AXE_SWING_CENTER = new THREE.Vector3(0, 0, -0.13);
export const AXE_REACH = 2.8;
export const AXE_HIT_ANGLE = 70 * DEG;
export const AXE_REST_UP = new THREE.Vector3(0, 1, 0).applyQuaternion(AXE_REST_QUAT);
export const AXE_REST_EDGE = new THREE.Vector3(1, 0, 0).applyQuaternion(AXE_REST_QUAT);
export const axeBasis = new THREE.Matrix4();
export const axeEvalEdge = new THREE.Vector3();
export const axeEvalFace = new THREE.Vector3();
// 柄の向き up と刃先の向き edge から、斧の向きを作る（edge は up と直交するよう直す）
export function axeQuatOf(up, edge, out) {
    axeEvalEdge.copy(edge).addScaledVector(up, -edge.dot(up));
    if (axeEvalEdge.lengthSq() < 1e-8)
        axeEvalEdge.set(0, 0, -1).addScaledVector(up, up.z);
    axeEvalEdge.normalize();
    axeEvalFace.crossVectors(axeEvalEdge, up);
    return out.setFromRotationMatrix(axeBasis.makeBasis(axeEvalEdge, up, axeEvalFace));
}
// 斧の技の時間をまとめて縮める割合（下の技の定義に書いた時間に掛ける）。小さくするほど速く振る
export const AXE_TIME_SCALE = 0.8;
// 技の定義に書いた時間（key・当たり・つなぎ・音・カメラの反動など）を、すべて AXE_TIME_SCALE 倍にする
export function scaleAxeTimes(def) {
    const k = AXE_TIME_SCALE;
    const opt = (t) => (t === undefined ? undefined : t * k);
    return {
        ...def,
        keys: def.keys.map((key) => ({ ...key, t: key.t * k })),
        trails: def.trails.map(([a, b]) => [a * k, b * k]),
        impact: def.impact * k,
        lungeAt: opt(def.lungeAt),
        cancel: def.cancel * k,
        swishes: def.swishes.map((w) => ({ ...w, at: w.at * k, dur: w.dur * k })),
        kicks: def.kicks?.map(([t, v]) => [t * k, v]),
        strain: def.strain && [def.strain[0] * k, def.strain[1] * k],
        grips: def.grips?.map((t) => t * k),
        hitUntil: opt(def.hitUntil),
    };
}
export function makeAxeAttack(src) {
    const def = scaleAxeTimes(src);
    const pos = def.keys.map((k) => (k.pos ? new THREE.Vector3(...k.pos).add(AXE_SWING_CENTER) : new THREE.Vector3()));
    const up = def.keys.map((k) => (k.up ? new THREE.Vector3(...k.up).normalize() : AXE_REST_UP.clone()));
    // lead の key: 頭が大きく動く先の key を探し、そこへ動く向きへ刃先を向ける
    const head = def.keys.map((_, i) => pos[i].clone().addScaledVector(up[i], AXE_HEAD));
    const far = (i, step) => {
        let j = i + step;
        while (j > 0 && j < head.length - 1 && head[j].distanceTo(head[i]) < 0.15)
            j += step;
        return THREE.MathUtils.clamp(j, 0, head.length - 1);
    };
    const quats = [];
    const carry = new THREE.Quaternion();
    const prevUp = new THREE.Vector3();
    const edge = new THREE.Vector3();
    def.keys.forEach((k, i) => {
        const quat = new THREE.Quaternion();
        const prev = quats[i - 1] ?? AXE_REST_QUAT;
        if (!k.up)
            quat.copy(AXE_REST_QUAT);
        else if (k.edge)
            axeQuatOf(up[i], edge.set(...k.edge), quat);
        else if (k.lead)
            axeQuatOf(up[i], edge.subVectors(head[far(i, 1)], head[i]), quat);
        else if (k.spin !== undefined) {
            carry.setFromUnitVectors(AXE_REST_UP, up[i]);
            axeQuatOf(up[i], edge.copy(AXE_REST_EDGE).applyQuaternion(carry).applyAxisAngle(up[i], k.spin * DEG), quat);
        }
        else {
            // 前の key の刃先を、柄の向きを up[i] へ最短で回す回転で運ぶ
            carry.setFromUnitVectors(prevUp.set(0, 1, 0).applyQuaternion(prev), up[i]);
            axeQuatOf(up[i], edge.set(1, 0, 0).applyQuaternion(prev).applyQuaternion(carry), quat);
        }
        quats.push(quat);
    });
    // 前の key からの回転（近回り）を回転ベクトルにして足していく
    const turn = new THREE.Vector3();
    const rel = new THREE.Quaternion();
    const turns = quats.map((q, i) => {
        if (i > 0)
            turn.add(rotationVectorOf(rel.copy(quats[i - 1]).invert().premultiply(q), new THREE.Vector3()));
        return turn.clone();
    });
    const ts = def.keys.map((k) => k.t);
    const vs = def.keys.map((_, i) => [...pos[i].toArray(), ...turns[i].toArray()]);
    const slopes = def.keys.map(() => new Array(AXE_CHANNELS).fill(0));
    for (let c = 0; c < AXE_CHANNELS; c++) {
        axeSlopes(ts, vs.map((v) => v[c])).forEach((m, i) => (slopes[i][c] = m));
    }
    const keys = def.keys.map((k, i) => ({ t: k.t, quat: quats[i], v: vs[i], slope: slopes[i] }));
    return { ...def, keys, duration: keys[keys.length - 1].t, lungeAt: def.lungeAt ?? def.trails[0][0] };
}
// 回転 q（近回り）を、回転軸 × 角度のベクトルにする
export function rotationVectorOf(q, out) {
    if (q.w < 0)
        q.set(-q.x, -q.y, -q.z, -q.w);
    const s = Math.sqrt(Math.max(0, 1 - q.w * q.w));
    const angle = 2 * Math.acos(Math.min(1, q.w));
    return s < 1e-6 ? out.set(q.x * 2, q.y * 2, q.z * 2) : out.set(q.x, q.y, q.z).multiplyScalar(angle / s);
}
// 各 key での変化の速さ。前後の区間の速さを時間で重み付けして平均する（頂点を通る key でも止まらずに抜ける）。
// 速い区間と遅い区間の境では平均が大きくなりすぎて行き過ぎるので、遅い側の速さの AXE_SLOPE_LIMIT 倍までに抑える
// （向きが反転する key では、ほぼ止まる）。最初と最後の key（構え）では止まっている
export const AXE_SLOPE_LIMIT = 3;
export function axeSlopes(ts, ys) {
    return ys.map((y, i) => {
        if (i === 0 || i === ys.length - 1)
            return 0;
        const h0 = ts[i] - ts[i - 1];
        const h1 = ts[i + 1] - ts[i];
        const d0 = (y - ys[i - 1]) / h0;
        const d1 = (ys[i + 1] - y) / h1;
        const m = (d0 * h1 + d1 * h0) / (h0 + h1);
        const limit = AXE_SLOPE_LIMIT * Math.min(Math.abs(d0), Math.abs(d1));
        return THREE.MathUtils.clamp(m, -limit, limit);
    });
}
// 振り抜いた所から頭を起こしながら、柄を軸に斧を回し（刃先がくるりと一周する）、構えより少し下まで勢いよく入ってから、
// 重さを受け止めて構えに収まる。times は回している途中の 2 つの key と、構えの向きへ回り終える key の時間。
// spin は -240 → -120 → 0 と、柄の先から見て同じ向きへ 120 度ずつ進む（key の間が 180 度を超えると逆へ回ってしまう）
export const AXE_TWIRL_SETTLE = 0.05; // 回り終えてから、沈んで重さを受け止めるまで
export const AXE_TWIRL_REST = 0.09; // 受け止めてから、構えに収まるまで
export const AXE_CATCH_KICK = [-0.5, 0, 0]; // 受け止めたときに付けるカメラの反動（度）
export const AXE_TWIRL_SWISH = { at: 0, dur: 0.16, f0: 260, f1: 700, gain: 0.16 };
export function axeTwirlBack(times, mid) {
    const end = times[2];
    return [
        { t: times[0], ...mid[0], spin: -240 },
        { t: times[1], ...mid[1], spin: -120 },
        { t: end, pos: [0.03, 0.0, -0.01], up: [0.55, 0.78, -0.3], spin: 0 }, // 構えの少し上で回り終える
        { t: end + AXE_TWIRL_SETTLE, pos: [0.0, -0.035, -0.02] }, // 構えより少し下まで入って、重さを受け止める
        { t: end + AXE_TWIRL_SETTLE + AXE_TWIRL_REST },
    ];
}
// 1 段目: 袈裟割り。腰を落としてから右肩の上へ担ぐように振りかぶり、重さに耐えてためてから、
// 左下へ斜めに叩き割る。振り抜いた勢いに引かれて頭が下へ流れ、踏ん張ってから、
// 頭を左から頭上へ跳ね上げつつ柄を手の中で一回転させ、構えへ叩き込むように収める
export const AXE_KESA = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.07, pos: [0.03, -0.05, 0.03], up: [0.56, 0.82, 0.12] }, // 腰を落とす
        { t: 0.34, pos: [0.31, 0.31, 0.21], up: [0.33, 0.68, 0.65], lead: true }, // 右肩の上へ振りかぶって、ためる
        { t: 0.375, pos: [0.08, 0.16, -0.02], up: [0.0, 0.92, -0.4] }, // 頭上の前を通過
        { t: 0.41, pos: [-0.16, 0.06, -0.12], up: [-0.55, -0.08, -0.83] }, // 左下へ叩き割る
        { t: 0.55, pos: [-0.25, -0.03, -0.08], up: [-0.45, -0.45, -0.77] }, // 重さに引かれて流れる
        { t: 0.68, pos: [-0.24, -0.02, -0.08], up: [-0.43, -0.47, -0.77] }, // 踏ん張って止める
        ...axeTwirlBack([0.78, 0.86, 0.93], [
            { pos: [-0.14, 0.06, -0.02], up: [-0.55, 0.8, 0.1] }, // 頭を左上へ跳ね上げる
            { pos: [0.02, 0.05, 0.0], up: [0.15, 0.97, 0.15] }, // 頭上で回しながら右へ
        ]),
    ],
    trails: [[0.35, 0.53]],
    impact: 0.395,
    strain: [0.2, 0.345],
    slash: 50,
    kick: [-1.6, 1.4, -2.6],
    windKick: [0.6, -0.5, 0.9],
    kicks: [[0.12, [0.8, -0.4, 0.6]], [0.72, [0.6, -0.3, 0.4]], [0.975, AXE_CATCH_KICK]],
    lunge: 3,
    cancel: 0.62,
    dip: 0.9,
    grips: [0.05, 0.975],
    swishes: [
        { at: 0.09, dur: 0.24, f0: 120, f1: 320, gain: 0.12 }, // 持ち上げる
        { at: 0.335, dur: 0.22, f0: 200, f1: 1100, gain: 0.7 },
        { ...AXE_TWIRL_SWISH, at: 0.77 },
    ],
    knock: 330,
    hitStop: 0.1,
    fx: 1.35,
});
// 2 段目: 横薙ぎ。柄を立てて体の前を通し、左の後ろへ大きく引いてから、
// 腰を回して右へ真横に薙ぐ。振り抜いた勢いのまま頭が右の後ろまで回り込み、
// そこから柄を手の中で回しながら頭を起こして、構えへ収める
export const AXE_NAGI = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.1, pos: [-0.05, -0.04, 0.02], up: [0.1, 0.95, 0.2] }, // 柄を立てて体の前へ寄せる
        { t: 0.34, pos: [-0.35, 0.29, 0.19], up: [-0.52, 0.5, 0.69], lead: true }, // 左の後ろへ引いて、ためる
        { t: 0.375, pos: [-0.06, 0.16, -0.1], up: [-0.15, 0.35, -0.92] }, // 正面を通過
        { t: 0.41, pos: [0.22, 0.14, -0.08], up: [0.85, 0.25, -0.47] }, // 右へ薙ぐ
        { t: 0.56, pos: [0.3, 0.22, -0.02], up: [0.95, 0.12, 0.15] }, // 右の後ろへ流れる
        { t: 0.7, pos: [0.28, 0.2, -0.02], up: [0.93, 0.1, 0.2] }, // 踏ん張って止める
        ...axeTwirlBack([0.76, 0.82, 0.88], [
            { pos: [0.22, 0.14, 0.04], up: [0.75, 0.6, 0.25] }, // 頭を起こす
            { pos: [0.1, 0.07, 0.01], up: [0.3, 0.95, 0.1] }, // 回しながら体の前へ
        ]),
    ],
    trails: [[0.35, 0.54]],
    impact: 0.39,
    strain: [0.22, 0.345],
    slash: 4,
    kick: [0.4, -3.2, 1.2],
    windKick: [0, 0.6, -0.3],
    kicks: [[0.2, [0, 1.0, -0.5]], [0.72, [0.4, 0.5, 0]], [0.925, AXE_CATCH_KICK]],
    lunge: 3,
    cancel: 0.62,
    grips: [0.06, 0.925],
    swishes: [
        { at: 0.14, dur: 0.22, f0: 120, f1: 320, gain: 0.12 },
        { at: 0.335, dur: 0.24, f0: 200, f1: 1000, gain: 0.7 },
        { ...AXE_TWIRL_SWISH, at: 0.75 },
    ],
    knock: 320,
    hitStop: 0.09,
    fx: 1.3,
});
// 3 段目（締め）: 兜割り。深く沈み込んでから頭の後ろまで高く振りかぶり、ためきってから真っ向から叩きつける。
// 刃が地面に食い込んだまま残心をとり、引き抜いて右肩に担ぐ。肩から弾ませて柄を手の中で一回転させ、構えへ収める
export const AXE_KABUTO = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.1, pos: [0.0, -0.08, 0.03], up: [0.45, 0.86, 0.1] }, // 沈み込む
        { t: 0.52, pos: [0.13, 0.39, 0.1], up: [0.15, 0.6, 0.79], lead: true }, // 頭の後ろまで振りかぶって、じわりと引き絞る
        { t: 0.56, pos: [-0.04, 0.3, -0.06], up: [-0.02, 0.92, -0.4] }, // 真上を通過
        { t: 0.6, pos: [-0.08, 0.06, -0.22], up: [-0.03, -0.3, -0.95] }, // 真っ向から叩きつける
        { t: 0.74, pos: [-0.08, 0.0, -0.2], up: [-0.03, -0.42, -0.9] }, // 地面に食い込む
        { t: 0.98, pos: [-0.08, 0.01, -0.2], up: [-0.03, -0.4, -0.92] }, // 残心
        { t: 1.1, pos: [-0.02, 0.1, -0.12], up: [0.05, -0.05, -1] }, // 引き抜く
        { t: 1.34, pos: [0.3, 0.3, 0.14], up: [0.35, 0.7, 0.62] }, // 右肩に担ぐ
        { t: 1.48, pos: [0.31, 0.28, 0.15], up: [0.35, 0.68, 0.64] },
        ...axeTwirlBack([1.56, 1.63, 1.7], [
            { pos: [0.2, 0.16, 0.06], up: [0.5, 0.82, 0.25] }, // 肩から弾ませる
            { pos: [0.08, 0.06, 0.0], up: [0.35, 0.93, 0.05] },
        ]),
    ],
    trails: [[0.53, 0.66]],
    impact: 0.585,
    lungeAt: 0.53,
    strain: [0.28, 0.53],
    slash: 88,
    kick: [-4.2, 0, 0],
    windKick: [-0.6, 0, 0],
    kicks: [[0.14, [1.6, 0, 0.3]], [1.0, [1.0, 0, 0]], [1.38, [-0.8, -0.3, -0.5]], [1.745, AXE_CATCH_KICK]],
    lunge: 5,
    cancel: 1.0,
    fovPunch: -8,
    dip: 2.2,
    ground: 1,
    grips: [0.06, 1.0, 1.38, 1.745],
    swishes: [
        { at: 0.14, dur: 0.3, f0: 110, f1: 300, gain: 0.14 },
        { at: 0.525, dur: 0.24, f0: 180, f1: 950, gain: 0.85 },
        { at: 1.12, dur: 0.26, f0: 140, f1: 420, gain: 0.18 },
        { ...AXE_TWIRL_SWISH, at: 1.53 },
    ],
    knock: 480,
    hitStop: 0.15,
    fx: 1.9,
});
// スライディング中: 足払い。頭を右の後ろの低い所へ引き、床すれすれを右から左へ大きく薙ぎ払う
export const AXE_SWEEP = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.15, pos: [0.22, -0.06, 0.16], up: [0.85, -0.18, 0.5], lead: true }, // 右の後ろの低い所へ引く
        { t: 0.185, pos: [0.0, -0.08, -0.14], up: [0.0, -0.22, -0.98] }, // 正面の低い所を通過
        { t: 0.22, pos: [-0.24, -0.06, -0.02], up: [-0.9, -0.2, -0.3] }, // 左へ薙ぎ払う
        { t: 0.36, pos: [-0.3, -0.04, 0.1], up: [-0.82, -0.15, 0.55] }, // 左の後ろへ流れる
        { t: 0.5, pos: [-0.26, -0.03, 0.06], up: [-0.8, -0.1, 0.58] },
        ...axeTwirlBack([0.58, 0.645, 0.71], [
            { pos: [-0.12, 0.08, 0.04], up: [-0.4, 0.85, 0.35] }, // 頭を左から起こす
            { pos: [0.0, 0.05, 0.0], up: [0.2, 0.97, 0.1] },
        ]),
    ],
    trails: [[0.15, 0.34]],
    impact: 0.2,
    lungeAt: 0.15,
    slash: -4,
    kick: [0.4, 2.8, -0.8],
    windKick: [0, -0.6, 0],
    kicks: [[0.755, AXE_CATCH_KICK]],
    lunge: 0,
    cancel: 0.46,
    grips: [0.755],
    swishes: [
        { at: 0.145, dur: 0.22, f0: 200, f1: 1000, gain: 0.65 },
        { ...AXE_TWIRL_SWISH, at: 0.56 },
    ],
    knock: 320,
    hitStop: 0.09,
    fx: 1.35,
});
// 空中: 叩きつけ。頭の後ろへ素早く振りかぶり、体ごと急降下しながら真下へ叩きつける
export const AXE_AIR = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.22, pos: [0.11, 0.35, 0.1], up: [0.15, 0.6, 0.79], lead: true }, // 頭の後ろへ振りかぶる
        { t: 0.255, pos: [-0.04, 0.28, -0.06], up: [-0.02, 0.92, -0.4] }, // 真上を通過
        { t: 0.29, pos: [-0.08, 0.04, -0.22], up: [-0.03, -0.32, -0.95] }, // 真下へ叩きつける
        { t: 0.42, pos: [-0.08, -0.01, -0.2], up: [-0.03, -0.44, -0.9] },
        { t: 0.6, pos: [-0.08, 0.0, -0.2], up: [-0.03, -0.42, -0.9] },
        { t: 0.66, pos: [-0.03, 0.1, -0.12], up: [0.05, -0.05, -1] }, // 引き抜く
        ...axeTwirlBack([0.71, 0.76, 0.81], [
            { pos: [0.02, 0.1, -0.04], up: [0.15, 0.8, 0.55] }, // 抜いた勢いで頭を跳ね上げる
            { pos: [0.04, 0.06, 0.0], up: [0.3, 0.95, 0.1] },
        ]),
    ],
    trails: [[0.22, 0.36]],
    impact: 0.275,
    hitUntil: 0.6, // 落ちている途中で届いても当てる
    lungeAt: 0.22,
    strain: [0.12, 0.225],
    slash: 88,
    kick: [-3.6, 0, 0],
    windKick: [1.2, 0, 0],
    lunge: 0,
    drop: 26,
    cancel: 0.6,
    fovPunch: -6,
    dip: 1.8,
    ground: 0.9,
    kicks: [[0.855, AXE_CATCH_KICK]],
    grips: [0.66, 0.855],
    swishes: [
        { at: 0.04, dur: 0.2, f0: 120, f1: 320, gain: 0.12 },
        { at: 0.215, dur: 0.22, f0: 180, f1: 950, gain: 0.8 },
        { ...AXE_TWIRL_SWISH, at: 0.69 },
    ],
    knock: 440,
    hitStop: 0.13,
    fx: 1.7,
});
// 右クリック: 打ち上げ。柄尻を上、頭を下にして、照準の右下へ斜めに下げて構える（頭は画面の外）。
// すぐ離せばそのまま、押し続けていれば構えて止め、離したら手を押し出しながら、頭を足元の前に通して左上へかち上げる。
// 当たったら敵と自分をまとめて打ち上げる（そのまま空中の叩きつけへつなげる）
export const AXE_LAUNCH = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.08, pos: [0.06, -0.1, 0.06], up: [0.6, 0.5, 0.4] }, // 腰を落とす
        // 構え: 柄尻を上、頭を下にして、照準の右下へ斜めに下げる。握りから柄尻までが画面に見え、柄の中ほどから先（頭）は画面の下の外
        { t: 0.24, pos: [0.5, 0.3, 0.1], up: [0.65, -0.72, 0.2], lead: true },
        { t: 0.275, pos: [0.12, 0.0, -0.1], up: [0.15, -0.45, -0.88] }, // 手を押し出しながら、頭が足元の前を通過
        { t: 0.31, pos: [-0.1, 0.2, -0.1], up: [-0.35, 0.8, -0.48] }, // 左上へかち上げる
        { t: 0.45, pos: [-0.14, 0.3, 0.0], up: [-0.4, 0.9, 0.15] }, // 勢いの余り
        { t: 0.6, pos: [-0.13, 0.28, 0.0], up: [-0.4, 0.89, 0.2] },
        { t: 0.85 },
    ],
    trails: [[0.25, 0.42]],
    impact: 0.29,
    lungeAt: 0.25, // 構え（0.24）で止めている間には踏み込まない
    strain: [0.1, 0.235],
    slash: -88,
    kick: [3.2, 0, 0],
    windKick: [-0.6, 0, 0],
    kicks: [[0.1, [0.8, 0, 0.2]]],
    lunge: 4,
    cancel: 0.4, // 打ち上がってすぐ叩きつけへつなげられるように
    fovPunch: -5,
    dip: 1.2,
    grips: [0.05, 0.62],
    swishes: [
        { at: 0.1, dur: 0.2, f0: 110, f1: 300, gain: 0.12 },
        { at: 0.25, dur: 0.22, f0: 200, f1: 1100, gain: 0.75 },
    ],
    knock: 380,
    hitStop: 0.11,
    fx: 0.9, // 打ち上げはつなぎの技なので、ダメージは軽め
});
// ダッシュ中・ダッシュ直後: 突進振り下ろし。押したらすぐ斧を体の右前で前回りに縦へ回し始め、回し続けたまま前へ突進する。
// 頭が前を通るたびに軽く斬りつけ（浮いている敵は浮かせたまま）、届く所に敵を捉えるか突進しきったら、
// 回した勢いのまま真っ向から叩き下ろす。浮いている敵は前へ大きく吹き飛ばし、壁に当たれば叩きつけになる。
// 地上でも空中でも出せる（空中では高さを保ったまま突進する）。
// 回転の 1 周は key の AXE_WHEEL_START 〜 AXE_WHEEL_END で、突進している間はここを繰り返す（両端は同じ姿勢）。
// 柄の向きは前回りの角度 θ で (0, cosθ, -sinθ)、刃先は頭が進む向き (0, -sinθ, -cosθ)
export const AXE_RUSH = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.08, pos: [0.2, 0.3, 0.05], up: [0, 0.5, 0.87], edge: [0, 0.87, -0.5] }, // 頭を後ろへ倒して回し始める
        { t: 0.16, pos: [0.2, 0.3, -0.05], up: [0, 1, 0], edge: [0, 0, -1] }, // 真上（1 周の始まり）
        { t: 0.22, pos: [0.2, 0.26, -0.12], up: [0, 0, -1], edge: [0, -1, 0] }, // 前
        { t: 0.28, pos: [0.2, 0.24, -0.06], up: [0, -1, 0], edge: [0, 0, 1] }, // 下
        { t: 0.34, pos: [0.2, 0.28, 0.0], up: [0, 0, 1], edge: [0, 1, 0] }, // 後ろ
        { t: 0.4, pos: [0.2, 0.3, -0.05], up: [0, 1, 0], edge: [0, 0, -1] }, // 真上（1 周の終わり）
        { t: 0.43, pos: [0.14, 0.2, -0.16], up: [0, 0, -1], edge: [0, -1, 0] }, // 回した勢いのまま前へ
        { t: 0.46, pos: [0.08, 0.04, -0.22], up: [0, -0.64, -0.77], edge: [0, -0.77, 0.64] }, // 真っ向から叩き下ろす
        { t: 0.58, pos: [0.06, -0.02, -0.2], up: [0, -0.8, -0.6] }, // 重さに引かれて流れる
        { t: 0.7, pos: [0.06, -0.01, -0.2], up: [0, -0.78, -0.62] }, // 踏ん張って止める
        { t: 0.76, pos: [0.0, 0.1, -0.12], up: [0.05, -0.05, -1] }, // 引き抜く
        ...axeTwirlBack([0.81, 0.86, 0.91], [
            { pos: [0.02, 0.1, -0.04], up: [0.15, 0.8, 0.55] }, // 頭を跳ね上げる
            { pos: [0.04, 0.06, 0.0], up: [0.3, 0.95, 0.1] },
        ]),
    ],
    trails: [[0.08, 0.52]],
    impact: 0.445,
    hitUntil: 0.5,
    lungeAt: 0.4,
    slash: 88,
    kick: [-3.6, 0, 0],
    windKick: [1.0, 0, 0],
    kicks: [[0.955, AXE_CATCH_KICK]],
    lunge: 0,
    cancel: 0.7,
    fovPunch: -7,
    dip: 1.6,
    ground: 0.8,
    grips: [0.04, 0.76, 0.955],
    swishes: [
        { at: 0.04, dur: 0.18, f0: 160, f1: 520, gain: 0.3 },
        { at: 0.4, dur: 0.22, f0: 180, f1: 950, gain: 0.8 },
        { ...AXE_TWIRL_SWISH, at: 0.79 },
    ],
    knock: 440,
    hitStop: 0.13,
    fx: 1.7,
});
// ホイールクリック: 突き飛ばし。走る勢いのまま頭を右の後ろへ短く引き、
// 腰を切って体の前を右から左へ振り抜き、刃の腹で敵を照準の奥へ大きく吹き飛ばす。壁に当たれば叩きつけになる
export const AXE_DRIVE = makeAxeAttack({
    keys: [
        { t: 0 },
        { t: 0.12, pos: [0.35, 0.2, 0.19], up: [0.6, 0.45, 0.66], lead: true }, // 右の後ろへ短く引く
        { t: 0.155, pos: [0.06, 0.12, -0.12], up: [0.12, 0.3, -0.95] }, // 正面を通過
        { t: 0.19, pos: [-0.22, 0.12, -0.08], up: [-0.85, 0.25, -0.47] }, // 左へ振り抜く
        { t: 0.34, pos: [-0.3, 0.2, -0.02], up: [-0.95, 0.12, 0.15] }, // 左の後ろへ流れる
        { t: 0.48, pos: [-0.28, 0.18, -0.02], up: [-0.93, 0.1, 0.2] }, // 踏ん張って止める
        ...axeTwirlBack([0.54, 0.6, 0.66], [
            { pos: [-0.22, 0.14, 0.04], up: [-0.75, 0.6, 0.25] }, // 頭を起こす
            { pos: [-0.1, 0.07, 0.01], up: [-0.3, 0.95, 0.1] },
        ]),
    ],
    trails: [[0.13, 0.32]],
    impact: 0.165,
    hitUntil: 0.24, // 走り抜ける速さでも、振り抜くまでに届いた敵は捉える
    slash: -4,
    kick: [0.4, 3.2, -1.2],
    windKick: [0, -0.6, 0.3],
    kicks: [[0.705, AXE_CATCH_KICK]],
    lunge: 0, // 走っている勢いをそのまま使う
    cancel: 0.5,
    fovPunch: -6,
    grips: [0.705],
    swishes: [
        { at: 0.1, dur: 0.22, f0: 200, f1: 1000, gain: 0.75 },
        { ...AXE_TWIRL_SWISH, at: 0.53 },
    ],
    knock: 500,
    hitStop: 0.12,
    fx: 1.2,
});
// 取り出し: 持ち替えたとき、右肩の後ろに担いだ斧を肩越しに引き抜き、頭上を大きく回して体の前へ振り下ろす。
// 重さに引かれて流れたのを踏ん張って止め、引き起こしてから柄を手の中で一回転させ、構えへ叩き込む。
// 当たりも踏み込みも出さない（impact・lungeAt に届かない）
export const AXE_DRAW = makeAxeAttack({
    keys: [
        { t: 0, pos: [0.35, 0.12, 0.32], up: [0.25, 0.45, 0.86] }, // 右肩の後ろに担いだ形（画面の外）
        { t: 0.12, pos: [0.24, 0.34, 0.1], up: [0.2, 0.92, 0.33], lead: true }, // 肩越しに引き抜いて、頭を高く上げる
        { t: 0.2, pos: [0.15, 0.3, -0.06], up: [0.12, 0.45, -0.88] }, // 頭が画面の右上へ回り込む
        { t: 0.245, pos: [0.08, 0.1, -0.16], up: [0.06, -0.5, -0.86] }, // 体の前へ振り下ろす
        { t: 0.36, pos: [0.07, 0.03, -0.14], up: [0.07, -0.7, -0.71] }, // 重さに引かれて流れる
        { t: 0.46, pos: [0.07, 0.04, -0.14], up: [0.07, -0.68, -0.73] }, // 踏ん張って止める
        { t: 0.52, pos: [0.0, 0.1, -0.12], up: [0.05, -0.05, -1] }, // 引き起こす
        ...axeTwirlBack([0.58, 0.64, 0.7], [
            { pos: [0.04, 0.1, -0.06], up: [0.15, 0.8, 0.55] }, // 頭を跳ね上げる
            { pos: [0.04, 0.06, 0.0], up: [0.3, 0.95, 0.1] },
        ]),
    ],
    fromFirstKey: true,
    trails: [[0.13, 0.32]],
    impact: Infinity,
    lungeAt: Infinity,
    kick: [0, 0, 0],
    windKick: [0.6, -0.4, 0.5],
    kicks: [[0.25, [-1.8, 0, 0.3]], [0.47, [0.5, 0, 0]], [0.745, AXE_CATCH_KICK]],
    lunge: 0,
    cancel: 0.3,
    grips: [0.02, 0.47, 0.745],
    swishes: [
        { at: 0.1, dur: 0.24, f0: 180, f1: 950, gain: 0.6 },
        { ...AXE_TWIRL_SWISH, at: 0.57 },
    ],
});
export const AXE_DRIVE_SPEED = 18; // 突き飛ばす速さ (m/s)。勢い 1 で AXE_POWER_HIGH / AXE_POWER_LOW 倍
export const AXE_DRIVE_LIFT = 4; // 突き飛ばすときに浮かせる速さ (m/s)。浮いている間は速さがほとんど落ちず、遠くまで飛ぶ
export const AXE_WHEEL_START = AXE_RUSH.keys[2].t; // 回転の 1 周（AXE_TIME_SCALE を掛けた後の時間）
export const AXE_WHEEL_END = AXE_RUSH.keys[6].t;
export const AXE_WHEEL_CUT = AXE_WHEEL_START + (AXE_WHEEL_END - AXE_WHEEL_START) * (110 / 360); // 頭が前の少し下を通る所で斬りつける
export const AXE_WHEEL_SWISH = { at: 0, dur: 0.16, f0: 160, f1: 520, gain: 0.3 };
// 回しながらの斬りつけ。軽く、吹き飛ばさずに押し込む
export const AXE_WHEEL_HIT = { kick: [-1.2, 0, 0], slash: 88, knock: 120, hitStop: 0.04, fx: 0.6 };
export const AXE_WHEEL_LIFT = 4; // 回しながら当てた浮いている敵を、落ちないよう支える速さ (m/s)
export const AXE_RUSH_TIME = 0.55; // 突進を続ける長さ（ゲームの時間）
export const AXE_RUSH_SPEED = 22; // 突進の速さ (m/s)
export const AXE_RUSH_REACH = 2.2; // この距離に敵を捉えたら、突進をやめる（回転が真上へ来たら叩き下ろす）
export const AXE_RUSH_EXIT = 5; // 突進をやめたときに残す水平の速さの上限 (m/s)
export const AXE_FLING_SPEED = 14; // 浮いている敵を前へ吹き飛ばす速さ (m/s)。勢い 1 で AXE_POWER_HIGH / AXE_POWER_LOW 倍
export const AXE_FLING_LIFT = 3; // 吹き飛ばすときに少しだけ浮かせる速さ (m/s)
export const AXE_ATTACKS = {
    draw: AXE_DRAW,
    launch: AXE_LAUNCH,
    rush: AXE_RUSH,
    drive: AXE_DRIVE,
    kesa: AXE_KESA,
    nagi: AXE_NAGI,
    kabuto: AXE_KABUTO,
    sweep: AXE_SWEEP,
    air: AXE_AIR,
};
export const AXE_COMBO = [AXE_KESA, AXE_NAGI, AXE_KABUTO];
export const AXE_COMBO_RESET = 0.5;
export const AXE_BUFFER = 0.3;
export const AXE_BITE_TIME = 0.1; // 当たったあと、刃が食い込んで振りが重くなる時間（ゲームの時間）
export const AXE_BITE_SLOW = 0.3; // 食い込んだ瞬間の振りの速さ。そこから元の速さへなめらかに戻す
export const AXE_JOLT_STIFF = 260; // 当たって跳ね返された手元を戻すばね
export const AXE_JOLT_DAMP = 16;
export const AXE_JOLT_KICK = 1.3; // 跳ね返される速さ (m/s)

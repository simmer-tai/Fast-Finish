import * as THREE from 'three';
import { easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, linear } from '../ease.js';
import { REST_TIP } from './kunai.js';
export function makeAttack(def) {
    const keys = def.keys.map((k) => ({
        t: k.t,
        pos: new THREE.Vector3(...(k.pos ?? [0, 0, 0])),
        tip: k.tip ? new THREE.Vector3(...k.tip).normalize() : REST_TIP.clone(),
        roll: k.roll ?? 0,
        spin: k.spin ?? 0,
        ease: k.ease ?? easeInOutCubic,
    }));
    return { ...def, keys, duration: keys[keys.length - 1].t };
}
// 1 段目: 右上から左へ薙ぐ
export const SLASH_1 = makeAttack({
    keys: [
        { t: 0 },
        { t: 0.1, pos: [0.12, 0.1, 0.04], tip: [0.85, 0.6, 0.2], ease: easeInQuad }, // 右上へ引いて溜める
        { t: 0.15, pos: [-0.06, 0.08, -0.14], tip: [-0.15, 0.45, -1], ease: linear }, // 正面を通過
        { t: 0.19, pos: [-0.34, -0.02, -0.06], tip: [-1, -0.15, -0.1], ease: easeOutCubic }, // 左へ振り抜く
        { t: 0.28, pos: [-0.4, -0.08, 0.02], tip: [-0.8, -0.4, 0.45] }, // 勢いの余り
        { t: 0.4, pos: [-0.07, 0.08, -0.12], ease: easeOutCubic }, // 正面へ戻して指先で弾き
        { t: 0.56, pos: [-0.05, 0.07, -0.1], spin: -360, ease: easeOutBack }, // くるりと回して
        { t: 0.7, spin: -360 }, // 握り直して構える
    ],
    trails: [[0.1, 0.24], [0.4, 0.54, true]],
    impact: 0.15,
    slash: 20,
    kick: [-0.4, 1.6, -1.2],
    lunge: 2.5,
    cancel: 0.26,
    ring: 0.4,
    grip: 0.61,
    swishes: [
        { at: 0.09, dur: 0.2, f0: 700, f1: 2600, gain: 0.35 },
        { at: 0.4, dur: 0.16, f0: 1500, f1: 3200, gain: 0.08 },
    ],
});
// 2 段目: 左下から右上へ斬り返す
export const SLASH_2 = makeAttack({
    keys: [
        { t: 0 },
        { t: 0.09, pos: [-0.3, -0.06, 0.02], tip: [-0.9, -0.3, 0.2], ease: easeInQuad },
        { t: 0.14, pos: [-0.04, 0.06, -0.14], tip: [0.15, 0.5, -1], ease: linear },
        { t: 0.18, pos: [0.22, 0.14, -0.06], tip: [1, 0.45, -0.05], ease: easeOutCubic },
        { t: 0.27, pos: [0.26, 0.18, 0.02], tip: [0.75, 0.65, 0.35] },
        { t: 0.38, pos: [-0.03, 0.1, -0.11], ease: easeOutCubic }, // 右上から正面へ戻して弾き
        { t: 0.54, pos: [-0.04, 0.08, -0.1], spin: 360, ease: easeOutBack }, // 1 段目と逆向きに回す
        { t: 0.68, spin: 360 },
    ],
    trails: [[0.09, 0.23], [0.38, 0.52, true]],
    impact: 0.14,
    slash: 26,
    kick: [0.6, -1.6, 1.2],
    lunge: 2.5,
    cancel: 0.25,
    ring: 0.38,
    grip: 0.59,
    swishes: [
        { at: 0.08, dur: 0.2, f0: 800, f1: 3000, gain: 0.35 },
        { at: 0.38, dur: 0.16, f0: 1500, f1: 3200, gain: 0.08 },
    ],
});
// 3 段目（締め）: 輪に指を掛けて一回転させ、握り直して踏み込みながら突く
export const FINISHER = makeAttack({
    keys: [
        { t: 0 },
        { t: 0.08, pos: [-0.08, 0.15, -0.16], ease: easeOutCubic }, // 正面へ掲げて指先で弾く
        { t: 0.3, pos: [-0.06, 0.13, -0.14], spin: -360 }, // 輪を軸に一回転させて握り直す
        { t: 0.36, pos: [0.06, -0.02, 0.12], tip: [0.15, 0.25, -1], spin: -360, ease: easeOutCubic }, // 引き絞る
        { t: 0.42, pos: [-0.12, 0.06, -0.3], tip: [-0.05, 0.05, -1], spin: -360, ease: linear }, // 突き
        { t: 0.55, pos: [-0.1, 0.05, -0.26], tip: [-0.05, 0.08, -1], spin: -360, ease: easeOutBack }, // 突き切った形で止める
        { t: 0.85, spin: -360 }, // 構えへ引き戻し、握り直す
    ],
    trails: [[0.1, 0.3, true]], // 突きは刃の向きへ進むので帯が潰れる。回すところだけ残す
    impact: 0.39,
    kick: [-0.5, 0, 0],
    lunge: 7,
    cancel: 0.6,
    fovPunch: -6, // 突きの瞬間に少しズーム
    knock: 380,
    hitStop: 0.12,
    fx: 1.7,
    ring: 0.1,
    grip: 0.66,
    swishes: [
        { at: 0.1, dur: 0.22, f0: 1500, f1: 3500, gain: 0.12 },
        { at: 0.36, dur: 0.14, f0: 1200, f1: 4000, gain: 0.4 },
    ],
});
// スライディング中: 低い位置から斬り上げる
export const SLIDE_UP = makeAttack({
    keys: [
        { t: 0 },
        { t: 0.08, pos: [-0.18, -0.12, 0.04], tip: [-0.6, -0.8, 0.1], ease: easeInQuad },
        { t: 0.12, pos: [-0.04, 0.04, -0.14], tip: [0.1, 0.4, -1], ease: linear },
        { t: 0.16, pos: [0.12, 0.24, -0.08], tip: [0.45, 1, -0.2], ease: easeOutCubic },
        { t: 0.25, pos: [0.14, 0.28, 0], tip: [0.35, 0.9, 0.4] },
        { t: 0.36, pos: [-0.03, 0.08, -0.11], ease: easeOutCubic },
        { t: 0.52, pos: [-0.04, 0.07, -0.1], spin: 360, ease: easeOutBack },
        { t: 0.66, spin: 360 },
    ],
    trails: [[0.08, 0.21], [0.36, 0.5, true]],
    impact: 0.13,
    slash: 65,
    kick: [1.8, -0.6, 1],
    lunge: 0,
    cancel: 0.25,
    ring: 0.36,
    grip: 0.57,
    swishes: [
        { at: 0.07, dur: 0.2, f0: 700, f1: 2800, gain: 0.35 },
        { at: 0.36, dur: 0.16, f0: 1500, f1: 3200, gain: 0.08 },
    ],
});
// ダッシュ直後: 大きく速い袈裟斬りから、手元でくるりと回して構え直す
export const DASH_SLASH = makeAttack({
    keys: [
        { t: 0 },
        { t: 0.06, pos: [0.16, 0.14, 0.04], tip: [0.9, 0.6, 0.1], ease: easeInQuad },
        { t: 0.095, pos: [-0.04, 0.08, -0.17], tip: [-0.1, 0.4, -1], ease: linear },
        { t: 0.13, pos: [-0.38, -0.04, -0.08], tip: [-1, -0.25, -0.1], ease: easeOutCubic },
        { t: 0.21, pos: [-0.44, -0.1, 0.02], tip: [-0.75, -0.5, 0.4] },
        { t: 0.31, pos: [-0.08, 0.14, -0.15], ease: linear }, // 正面へ戻して
        { t: 0.46, pos: [-0.06, 0.13, -0.13], spin: -360, ease: easeOutBack }, // くるりと回す
        { t: 0.6, spin: -360 }, // 握り直す
    ],
    trails: [[0.06, 0.17], [0.31, 0.46, true]],
    impact: 0.11,
    kick: [-0.8, 2.2, -1.8],
    lunge: 0,
    cancel: 0.3,
    hitStop: 0.08,
    fx: 1.3,
    slash: 24,
    ring: 0.31,
    grip: 0.51,
    swishes: [
        { at: 0.05, dur: 0.18, f0: 900, f1: 3400, gain: 0.45 },
        { at: 0.31, dur: 0.17, f0: 1500, f1: 3200, gain: 0.1 },
    ],
});
export const ATTACKS = {
    slash1: SLASH_1,
    slash2: SLASH_2,
    finisher: FINISHER,
    slideUp: SLIDE_UP,
    dashSlash: DASH_SLASH,
};
export const GROUND_COMBO = [SLASH_1, SLASH_2, FINISHER];
export const COMBO_RESET = 0.35; // 攻撃が終わってからこの時間内に振れば次の段へつながる
export const RETURN_SWISH = { at: 0, dur: 0.2, f0: 1400, f1: 600, gain: 0.06 };
export const THROW_SWISH = { at: 0, dur: 0.16, f0: 900, f1: 2800, gain: 0.1 };

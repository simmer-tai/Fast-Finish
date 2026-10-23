import * as THREE from 'three';
import { easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, linear, type Ease } from '../ease.js';
import { DEG } from '../math.js';
import { SWORD_STAND_QUAT, SWORD_TIP_Y } from './sword.js';
import { type HitDef, type SwishDef, type V3 } from './kunaiAttacks.js';

// ---- 剣の攻撃の定義 ----
// クナイと同じくキーフレームで振る。剣は長く重いので、溜め（振りかぶり）を見せてから一気に振り抜き、
// 振り抜いた先で勢いを残してから構えへ戻す。
// 各 key は「柄を握る手の位置」「切っ先の向き」「刃（切る側）の向き」を持つ。刃の向きを省いた key は、
// 前後の key へ切っ先が動く向きに刃を向ける（振っている向きへ必ず刃が立つ）。
// 切っ先の向きを省いた key は、その時の構え（立てる・走る・スライディング）の向きになる
export interface SwordKeyDef {
  t: number;
  pos?: V3; // 手の位置（SWORD_VIEW_MODEL_POS からのずれ）
  tip?: V3; // 切っ先の向き（カメラ空間）
  edge?: V3; // 刃の向き（カメラ空間。切っ先と直交するよう直す）
  spin?: number; // 握った手を軸に、刃の面の中で回す角度（度）。負の向きは刃の側へ回る
  ease?: Ease;
}

export interface SwordKey {
  t: number;
  pos: THREE.Vector3;
  tip: THREE.Vector3 | null; // null = 構えの向き
  edge: THREE.Vector3 | null;
  spin: number;
  ease: Ease;
}

export interface SwordAttackDef extends HitDef {
  keys: SwordKey[];
  duration: number;
  trails: [number, number][]; // 斬撃の軌跡を出す時間帯
  impact: number; // 刃が敵を捉える瞬間
  lunge: number; // 振り出しで前へ踏み込む速さ (m/s)
  lungeAt: number;
  cancel: number; // 次の攻撃へつなげられる最も早い時間
  swishes: SwishDef[];
  windKick?: V3; // 振りかぶったときに逆向きへ少しだけ付けるカメラの反動（度）
  grips?: number[]; // 握り込む「チャキッ」を鳴らす時間
  rings?: [number, number][]; // 刃が鳴る時間と音の高さ
  fovPunch?: number;
  dip?: number; // 振り下ろしで体ごと沈む強さ
  reach?: number; // 届く距離
  hitUntil?: number; // impact で当たらなくても、この時間までは毎フレーム当たりを確かめる（踏み込みながら斬る技用）
  fromFirstKey?: boolean; // 今の構えからではなく、最初の key の形から始める（鞘から抜く抜刀用）
}

export const SWORD_TIP = SWORD_TIP_Y; // 原点（握る位置）から切っ先まで

export const SWORD_REACH = 2.9; // クナイより長く届く

export const SWORD_HIT_ANGLE = 70 * DEG; // 大きく薙ぐので横にも広く当たる

export const swordKeyTipPoint = (pos: THREE.Vector3, tip: THREE.Vector3 | null, out: THREE.Vector3) =>
  out.copy(tip ?? SWORD_STAND_TIP).multiplyScalar(SWORD_TIP).add(pos);

export const SWORD_STAND_TIP = new THREE.Vector3(0, 1, 0).applyQuaternion(SWORD_STAND_QUAT);

export function makeSwordAttack(
  def: Omit<SwordAttackDef, 'keys' | 'duration' | 'lungeAt'> & { keys: SwordKeyDef[]; lungeAt?: number },
): SwordAttackDef {
  const keys = def.keys.map((k): SwordKey => ({
    t: k.t,
    pos: new THREE.Vector3(...(k.pos ?? [0, 0, 0])),
    tip: k.tip ? new THREE.Vector3(...k.tip).normalize() : null,
    edge: k.edge ? new THREE.Vector3(...k.edge) : null,
    spin: k.spin ?? 0,
    ease: k.ease ?? easeInOutCubic,
  }));
  // 刃の向きを省いた key: 前後で切っ先が大きく動いている key を探し、その間を動く向きへ刃を向ける。
  // 振りかぶって止める key でも、これから振り下ろす向きへ刃が向く
  const p = keys.map((k) => swordKeyTipPoint(k.pos, k.tip, new THREE.Vector3()));
  const far = (i: number, step: number) => {
    let j = i + step;
    while (j > 0 && j < keys.length - 1 && p[j].distanceTo(p[i]) < 0.15) j += step;
    return THREE.MathUtils.clamp(j, 0, keys.length - 1);
  };
  keys.forEach((k, i) => {
    if (!k.tip || k.edge) return;
    k.edge = new THREE.Vector3().subVectors(p[far(i, 1)], p[far(i, -1)]);
  });
  for (const k of keys) {
    if (!k.tip || !k.edge) continue;
    k.edge.addScaledVector(k.tip, -k.edge.dot(k.tip));
    if (k.edge.lengthSq() < 1e-6) k.edge.set(0, 0, -1).addScaledVector(k.tip, k.tip.z);
    k.edge.normalize();
  }
  return { ...def, keys, duration: keys[keys.length - 1].t, lungeAt: def.lungeAt ?? def.trails[0][0] };
}

// 1 段目: 袈裟斬り。右肩の上へ振りかぶり、ひと呼吸ためてから左下へ斜めに斬り下ろす
export const SWORD_KESA = makeSwordAttack({
  keys: [
    { t: 0 },
    { t: 0.07, pos: [0.12, 0.27, 0.06], tip: [0.4, 0.7, 0.6], ease: easeOutCubic }, // 右肩の上へ振りかぶる
    { t: 0.11, pos: [0.14, 0.3, 0.08], tip: [0.45, 0.6, 0.68], ease: easeInQuad }, // さらに引き絞ってためる
    { t: 0.145, pos: [0.01, 0.15, -0.14], tip: [-0.18, 0.62, -0.78], ease: linear }, // 正面の上を通過
    { t: 0.18, pos: [-0.22, 0.02, -0.15], tip: [-0.85, -0.32, -0.42], ease: easeOutCubic }, // 左下へ斬り下ろす
    { t: 0.3, pos: [-0.3, -0.06, -0.04], tip: [-0.55, -0.75, 0.25], edge: [-0.3, -0.5, 0.8] }, // 勢いの余り
    // 続けて振らなければ、正面へ戻して刃を下に立て、手首でくるりと一回転させて握り直す
    { t: 0.4, pos: [-0.06, 0.0, -0.1], tip: [-0.05, -0.25, -1], edge: [0, -1, 0.25], ease: easeOutCubic },
    { t: 0.66, pos: [-0.04, 0.02, -0.1], tip: [-0.04, -0.2, -1], edge: [0, -1, 0.2], spin: -360 },
    { t: 0.82, spin: -360 },
  ],
  trails: [[0.11, 0.27], [0.4, 0.58]],
  impact: 0.165,
  slash: 48,
  kick: [-0.8, 2, -2.2],
  windKick: [0.5, -0.6, 0.8],
  lunge: 3.5,
  cancel: 0.28,
  grips: [0.03, 0.74],
  rings: [[0.4, 1]],
  swishes: [
    { at: 0.105, dur: 0.22, f0: 320, f1: 1500, gain: 0.55 },
    { at: 0.11, dur: 0.16, f0: 900, f1: 3000, gain: 0.12 }, // 切っ先の鋭い音
    { at: 0.4, dur: 0.16, f0: 600, f1: 2000, gain: 0.16 }, // 回したときの風切り
  ],
  knock: 260,
  hitStop: 0.075,
  fx: 1.15,
  dmg: 1.3, // 袈裟・逆袈裟・唐竹・袈裟の 4 発で倒しきる（23.4 + 23.4 + 32.4 + 23.4 = 102.6）
});

// 2 段目: 逆袈裟。振り抜いた左下からそのまま刃を返し、右上へ斬り上げる
export const SWORD_GYAKU = makeSwordAttack({
  keys: [
    { t: 0 },
    { t: 0.1, pos: [-0.25, 0.0, -0.02], tip: [-0.85, -0.35, 0.35], ease: easeOutCubic }, // 左下の後ろへ刃を返す
    { t: 0.14, pos: [-0.27, -0.02, 0.0], tip: [-0.88, -0.3, 0.38], ease: easeInQuad },
    { t: 0.175, pos: [-0.04, 0.06, -0.16], tip: [0.05, 0.15, -1], ease: linear }, // 正面を通過
    { t: 0.215, pos: [0.15, 0.18, -0.1], tip: [0.82, 0.55, -0.2], ease: easeOutCubic }, // 右上へ斬り上げる
    { t: 0.33, pos: [0.19, 0.25, 0.0], tip: [0.45, 0.82, 0.35], edge: [0.5, 0.2, -0.8] },
    // 続けて振らなければ、1 段目と同じく正面でくるりと一回転させて握り直す
    { t: 0.43, pos: [0.04, 0.02, -0.1], tip: [0.08, -0.25, -1], edge: [0, -1, 0.25], ease: easeOutCubic },
    { t: 0.69, pos: [0.05, 0.03, -0.1], tip: [0.08, -0.2, -1], edge: [0, -1, 0.2], spin: -360 },
    { t: 0.85, spin: -360 },
  ],
  trails: [[0.14, 0.3], [0.43, 0.61]],
  impact: 0.19,
  slash: 36,
  kick: [1.4, -1.8, 2],
  windKick: [-0.4, 0.6, -0.6],
  lunge: 3.5,
  cancel: 0.32,
  grips: [0.77],
  rings: [[0.43, 1]],
  swishes: [
    { at: 0.135, dur: 0.21, f0: 350, f1: 1700, gain: 0.55 },
    { at: 0.14, dur: 0.15, f0: 1000, f1: 3300, gain: 0.12 },
    { at: 0.43, dur: 0.16, f0: 600, f1: 2000, gain: 0.16 },
  ],
  knock: 260,
  hitStop: 0.075,
  fx: 1.15,
  dmg: 1.3,
});

// 3 段目（締め）: 唐竹割り。頭上へ高く振りかぶり、溜めきってから真っ向から斬り下ろす。
// 振り下ろした形でしばらく残心をとり、右へ刃を払って（血振り）から構えへ戻す
export const SWORD_KARATAKE = makeSwordAttack({
  keys: [
    { t: 0 },
    { t: 0.16, pos: [-0.06, 0.32, 0.06], tip: [0.08, 0.8, 0.6], ease: easeOutCubic }, // 頭上へ振りかぶる
    { t: 0.32, pos: [-0.07, 0.36, 0.1], tip: [0.06, 0.62, 0.78], ease: easeInQuad }, // じわりと引き絞る
    { t: 0.355, pos: [-0.1, 0.24, -0.2], tip: [-0.02, 0.85, -0.52], ease: linear }, // 真上を通過
    { t: 0.39, pos: [-0.13, -0.02, -0.26], tip: [-0.03, -0.5, -0.85], ease: easeOutCubic }, // 真っ向から斬り下ろす
    { t: 0.5, pos: [-0.12, -0.1, -0.2], tip: [-0.04, -0.85, -0.5], edge: [0, -0.5, 0.85], ease: easeOutBack }, // 振り切って止める
    { t: 0.66, pos: [-0.11, -0.08, -0.2], tip: [-0.04, -0.8, -0.58], edge: [0, -0.58, 0.8], ease: easeInQuad }, // 残心
    { t: 0.74, pos: [0.13, -0.08, -0.12], tip: [0.75, -0.45, -0.48], ease: easeOutCubic }, // 右へ鋭く払う（血振り）
    { t: 0.84, pos: [0.14, -0.07, -0.1], tip: [0.72, -0.42, -0.52], edge: [0.5, 0.6, 0.6] },
    // 切っ先を前へ向けて刃を下に立て、手首で縦に 2 回転させてから構えへ戻す
    { t: 0.94, pos: [0.04, -0.02, -0.08], tip: [0.08, -0.25, -1], edge: [0, -1, 0.25], ease: easeOutCubic },
    { t: 1.3, pos: [0.05, 0.0, -0.09], tip: [0.08, -0.2, -1], edge: [0, -1, 0.2], spin: -720, ease: easeInOutCubic },
    { t: 1.5, spin: -720 },
  ],
  trails: [[0.32, 0.47], [0.67, 0.76], [0.94, 1.24]],
  impact: 0.375,
  lungeAt: 0.33,
  kick: [-3.2, 0, 0],
  windKick: [1.5, 0, 0],
  lunge: 7,
  cancel: 0.66,
  fovPunch: -7,
  dip: 1.6,
  grips: [0.06, 1.42],
  rings: [[0.7, 0.8], [0.74, 1.05], [1.44, 1.3]],
  swishes: [
    { at: 0.33, dur: 0.24, f0: 260, f1: 1300, gain: 0.7 },
    { at: 0.335, dur: 0.18, f0: 800, f1: 2800, gain: 0.16 },
    { at: 0.68, dur: 0.14, f0: 700, f1: 2400, gain: 0.25 }, // 血振り
    { at: 0.94, dur: 0.14, f0: 600, f1: 2000, gain: 0.18 }, // 回すたびに風を切る
    { at: 1.06, dur: 0.14, f0: 600, f1: 2100, gain: 0.18 },
    { at: 1.17, dur: 0.16, f0: 500, f1: 1700, gain: 0.12 },
  ],
  slash: 88,
  knock: 420,
  hitStop: 0.14,
  fx: 1.8,
});

// スライディング中: 寝かせた刀をそのまま左から右へ大きく薙ぎ払う
export const SWORD_SWEEP = makeSwordAttack({
  keys: [
    { t: 0 },
    { t: 0.08, pos: [-0.12, 0.09, 0.06], tip: [-0.82, 0.04, 0.55], ease: easeOutCubic }, // 左の後ろへ引く
    { t: 0.11, pos: [-0.13, 0.09, 0.07], tip: [-0.8, 0.05, 0.6], ease: easeInQuad },
    { t: 0.145, pos: [0.0, 0.07, -0.17], tip: [0.05, 0.02, -1], ease: linear },
    { t: 0.185, pos: [0.17, 0.08, -0.1], tip: [0.92, 0.0, -0.32], ease: easeOutCubic },
    { t: 0.3, pos: [0.22, 0.1, 0.0], tip: [0.72, 0.05, 0.62], edge: [0.6, 0, -0.75] },
    { t: 0.52 },
  ],
  trails: [[0.11, 0.28]],
  impact: 0.16,
  slash: 4,
  kick: [0.4, -2.4, 0.8],
  windKick: [0, 0.8, 0],
  lunge: 0,
  cancel: 0.3,
  swishes: [
    { at: 0.105, dur: 0.22, f0: 320, f1: 1600, gain: 0.55 },
    { at: 0.11, dur: 0.16, f0: 900, f1: 3000, gain: 0.12 },
  ],
  knock: 300,
  hitStop: 0.08,
  fx: 1.25,
});

// ダッシュ直後: 刀を寝かせて顔の横へ引き絞り、踏み込みながら一直線に突く
export const THRUST_EDGE: V3 = [1, 0.05, 0];

export const SWORD_THRUST = makeSwordAttack({
  keys: [
    { t: 0 },
    { t: 0.07, pos: [0.02, 0.1, 0.12], tip: [-0.05, 0.03, -1], edge: THRUST_EDGE, ease: easeOutCubic }, // 顔の横へ引き絞る
    { t: 0.1, pos: [0.03, 0.11, 0.14], tip: [-0.05, 0.03, -1], edge: THRUST_EDGE, ease: easeInQuad },
    { t: 0.145, pos: [-0.14, 0.17, -0.3], tip: [-0.12, 0.1, -1], edge: THRUST_EDGE, ease: easeOutCubic }, // 突く
    { t: 0.3, pos: [-0.13, 0.16, -0.27], tip: [-0.12, 0.11, -1], edge: THRUST_EDGE, ease: easeOutBack }, // 突き切って止める
    { t: 0.38, pos: [-0.1, 0.06, -0.2], tip: [-0.3, -0.25, -0.9], ease: easeInOutCubic }, // 刃を返して
    { t: 0.6 },
  ],
  trails: [[0.1, 0.16]],
  impact: 0.13,
  lungeAt: 0.1,
  kick: [-0.6, 0, 0],
  windKick: [0.4, 0, 0],
  lunge: 5,
  cancel: 0.34,
  fovPunch: -6,
  reach: 3.4,
  grips: [0.02],
  swishes: [
    { at: 0.1, dur: 0.14, f0: 600, f1: 2600, gain: 0.45 },
  ],
  knock: 360,
  hitStop: 0.1,
  fx: 1.4,
});

// 居合の構えから突進して斬りつける一閃。右上に構えた刀をさらに引き絞り、
// 敵の目の前で右上から左へ大きく振り抜く。振り抜いた形で残心をとり、くるりと回して構えへ戻す
export const SWORD_ISSEN = makeSwordAttack({
  keys: [
    { t: 0 },
    { t: 0.04, pos: [0.12, 0.24, 0.08], tip: [0.42, 0.72, 0.55], ease: easeInQuad }, // 引き絞る
    { t: 0.075, pos: [0.0, 0.12, -0.17], tip: [-0.1, 0.38, -1], ease: linear }, // 正面を通過
    { t: 0.115, pos: [-0.26, 0.0, -0.13], tip: [-0.95, -0.15, -0.3], ease: easeOutCubic }, // 左へ振り抜く
    { t: 0.26, pos: [-0.33, -0.06, -0.02], tip: [-0.62, -0.5, 0.55], edge: [-0.3, -0.4, 0.85], ease: easeOutBack },
    { t: 0.5, pos: [-0.32, -0.05, -0.03], tip: [-0.6, -0.52, 0.55], edge: [-0.3, -0.4, 0.85] }, // 残心
    { t: 0.6, pos: [-0.04, 0.0, -0.1], tip: [-0.05, -0.25, -1], edge: [0, -1, 0.25], ease: easeOutCubic },
    { t: 0.86, pos: [-0.03, 0.02, -0.1], tip: [-0.04, -0.2, -1], edge: [0, -1, 0.2], spin: -360 },
    { t: 1.02, spin: -360 },
  ],
  trails: [[0.04, 0.24], [0.6, 0.78]],
  impact: 0.09,
  lungeAt: 0,
  slash: 16,
  kick: [-1, 3.2, -2.6],
  lunge: 0,
  cancel: 0.5,
  fovPunch: -8,
  grips: [0.94],
  rings: [[0.5, 1.4], [0.6, 1]],
  swishes: [
    { at: 0.03, dur: 0.24, f0: 300, f1: 1600, gain: 0.75 },
    { at: 0.04, dur: 0.18, f0: 1000, f1: 3600, gain: 0.18 },
    { at: 0.6, dur: 0.16, f0: 600, f1: 2000, gain: 0.16 },
  ],
  knock: 480,
  hitStop: 0.18,
  fx: 2.5,
  dmg: 5.6, // 満タンの敵でも一撃で倒す（18 × 5.6 = 100.8）
});

// 溜め斬り（左クリック長押し）: 刀を右の後ろへ大きく引いて溜め、離すと視線の方向へ踏み込みながら
// 右から左へ真横に薙ぐ。振り抜いた形で残心をとり、くるりと回して構えへ戻す
export const CHARGE_TIP: V3 = [0.7, 0.05, 0.7];

export const CHARGE_POS: V3 = [0.06, 0.05, 0.0];

export const SWORD_CHARGE_SLASH = makeSwordAttack({
  keys: [
    { t: 0 },
    { t: 0.03, pos: [0.1, 0.06, 0.04], tip: CHARGE_TIP, ease: easeInQuad }, // さらに引き絞る
    { t: 0.065, pos: [0.0, 0.08, -0.2], tip: [0.05, 0.02, -1], ease: linear }, // 正面を通過
    { t: 0.1, pos: [-0.25, 0.03, -0.13], tip: [-0.95, -0.05, -0.3], ease: easeOutCubic }, // 左へ振り抜く
    { t: 0.26, pos: [-0.33, -0.04, -0.02], tip: [-0.66, -0.35, 0.6], edge: [-0.3, -0.4, 0.85], ease: easeOutBack },
    { t: 0.46, pos: [-0.32, -0.04, -0.03], tip: [-0.64, -0.38, 0.6], edge: [-0.3, -0.4, 0.85] }, // 残心
    { t: 0.56, pos: [-0.04, 0.0, -0.1], tip: [-0.05, -0.25, -1], edge: [0, -1, 0.25], ease: easeOutCubic },
    { t: 0.82, pos: [-0.03, 0.02, -0.1], tip: [-0.04, -0.2, -1], edge: [0, -1, 0.2], spin: -360 },
    { t: 0.98, spin: -360 },
  ],
  trails: [[0.02, 0.24], [0.56, 0.74]],
  impact: 0.07,
  hitUntil: 0.16, // 踏み込みの途中で間合いに入っても当てる
  lungeAt: 0,
  slash: 2,
  kick: [-0.6, 3.6, -1.6],
  lunge: 0,
  cancel: 0.46,
  fovPunch: -6,
  reach: 3.4,
  grips: [0.9],
  rings: [[0.46, 1.3], [0.56, 1]],
  swishes: [
    { at: 0.02, dur: 0.24, f0: 280, f1: 1500, gain: 0.75 },
    { at: 0.03, dur: 0.18, f0: 1000, f1: 3600, gain: 0.18 },
    { at: 0.56, dur: 0.16, f0: 600, f1: 2000, gain: 0.16 },
  ],
  knock: 420,
  hitStop: 0.14,
  fx: 1.8,
});

// 抜刀: 持ち替えたときの取り出し。左腰の鞘から抜きざまに右上へ斬り上げ、そのまま右肩から左下へ斬り返し、
// 正面で刃を下に立てて素早く 2 回転させ、握り直して構える。当たりも弾きも出さない（impact に届かない）
export const SWORD_DRAW = makeSwordAttack({
  keys: [
    { t: 0, pos: [-0.32, -0.2, 0.08], tip: [-0.55, -0.12, 0.83], edge: [0.1, 1, 0], ease: easeInQuad }, // 左腰の鞘に納めた形（画面の外）
    { t: 0.045, pos: [-0.26, -0.06, -0.05], tip: [-0.95, -0.1, -0.3], ease: linear }, // 鞘から抜き出す
    { t: 0.075, pos: [-0.04, 0.05, -0.17], tip: [0.02, 0.12, -1], ease: linear }, // 正面を通過
    { t: 0.11, pos: [0.15, 0.17, -0.1], tip: [0.85, 0.5, -0.18], ease: easeOutCubic }, // 右上へ斬り上げる
    { t: 0.15, pos: [0.13, 0.27, 0.06], tip: [0.42, 0.68, 0.6], ease: easeInQuad }, // 右肩の上で刃を返す
    { t: 0.18, pos: [0.01, 0.15, -0.14], tip: [-0.18, 0.62, -0.78], ease: linear }, // 正面の上を通過
    { t: 0.215, pos: [-0.22, 0.02, -0.15], tip: [-0.85, -0.32, -0.42], ease: easeOutCubic }, // 左下へ斬り下ろす
    { t: 0.3, pos: [-0.06, 0.0, -0.1], tip: [-0.05, -0.25, -1], edge: [0, -1, 0.25], ease: easeOutCubic },
    { t: 0.54, pos: [0.03, 0.03, -0.1], tip: [0.06, -0.2, -1], edge: [0, -1, 0.2], spin: -720 },
    { t: 0.66, spin: -720 },
  ],
  fromFirstKey: true,
  trails: [[0.03, 0.13], [0.15, 0.25], [0.3, 0.5]],
  impact: Infinity,
  kick: [0, 0, 0],
  lunge: 0,
  cancel: 0.11,
  grips: [0.58],
  rings: [[0.11, 1.2], [0.22, 1], [0.3, 1.1]],
  swishes: [
    { at: 0.03, dur: 0.16, f0: 320, f1: 1600, gain: 0.5 },
    { at: 0.04, dur: 0.12, f0: 900, f1: 3200, gain: 0.12 },
    { at: 0.15, dur: 0.14, f0: 300, f1: 1500, gain: 0.45 },
    { at: 0.3, dur: 0.12, f0: 600, f1: 2200, gain: 0.18 }, // 回したときの風切り
    { at: 0.41, dur: 0.12, f0: 550, f1: 1900, gain: 0.14 },
  ],
});

export const SWORD_ATTACKS: Record<string, SwordAttackDef> = {
  draw: SWORD_DRAW,
  charge: SWORD_CHARGE_SLASH,
  issen: SWORD_ISSEN,
  kesa: SWORD_KESA,
  gyaku: SWORD_GYAKU,
  karatake: SWORD_KARATAKE,
  sweep: SWORD_SWEEP,
  thrust: SWORD_THRUST,
};

export const SWORD_COMBO = [SWORD_KESA, SWORD_GYAKU, SWORD_KARATAKE];

export const SWORD_COMBO_RESET = 0.4;

export const SWORD_BUFFER = 0.3;

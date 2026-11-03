// ---- 解像度の自動調整 ----
// フレームの時間を少しずつ平均し、重いときだけ描画の解像度を段階的に下げる。余裕が戻ったら 1 段ずつ上げる。
// 60fps 近くを保てている間は何もしない（144Hz の画面で 100fps 出ているくらいでは下げない）。
// ?fixedres で止める
const OFF = new URLSearchParams(location.search).has('fixedres');
const STEPS = [1, 0.9, 0.8, 0.7]; // 画質の解像度に掛ける倍率
const WINDOW = 0.5; // 平均を取る長さ (s)
const SLOW = 1 / 52; // 平均がこれより遅ければ下げる
const CALM = 1 / 57; // これより速い状態が続けば上げる
const RAISE_WAIT = 4; // 上げるまでに速い状態が続く長さ (s)
const RAISE_WAIT_MAX = 60;
const DROP_AFTER = 2; // 遅い平均がこれだけ続いたら下げる（キルの演出のような一瞬の重さでは切り替えない。切り替えそのものも引っかかる）

export const dynRes = { step: 0 };
export const dynResScale = () => STEPS[dynRes.step];

let acc = 0;
let frames = 0;
let calm = 0;
let slow = 0;
let raiseWait = RAISE_WAIT;
let sinceRaise = Infinity;

// 毎フレーム、そのフレームにかかった実時間 (s) で呼ぶ。段が変わったら true
export function updateDynRes(frame: number) {
  if (OFF) return false;
  // タブの切り替えや読み込みの引っかかりは数えない
  if (frame > 0.1) {
    acc = frames = 0;
    return false;
  }
  acc += frame;
  frames++;
  sinceRaise += frame;
  if (acc < WINDOW) return false;
  const avg = acc / frames;
  acc = frames = 0;
  if (avg > SLOW) {
    calm = 0;
    if (++slow < DROP_AFTER) return false;
    slow = 0;
    // 上げた直後にまた重くなったら、その解像度では保てない。次に上げるまで長く待つ
    if (sinceRaise < RAISE_WAIT) raiseWait = Math.min(raiseWait * 2, RAISE_WAIT_MAX);
    if (dynRes.step === STEPS.length - 1) return false;
    dynRes.step++;
    return true;
  }
  slow = 0;
  calm = avg < CALM ? calm + WINDOW : 0;
  if (calm < raiseWait || dynRes.step === 0) return false;
  calm = 0;
  sinceRaise = 0;
  dynRes.step--;
  return true;
}

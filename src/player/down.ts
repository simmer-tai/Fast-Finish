import * as THREE from 'three';
import { game } from '../game/state.js';

// ---- 倒れる ----
// ステージで体力が尽きたら、時間を測るのをやめて操作を取り上げ、世界を白黒のスローにしたまま視点を床へ崩す。
// 倒れきってからゲームオーバーの画面を出す（そこからはやり直すかタイトルへ戻るだけ）
export const DOWN_SLOW_SCALE = 0.15; // 倒れている間の時間の速さ
export const DOWN_SLOW_IN = 0.25; // そこまで落とす時間（実時間）
export const DOWN_FALL_TIME = 1.1; // 視点が床へ崩れきるまで（実時間）
export const DOWN_EYE = 0.35; // 崩れきったときの目の高さ
export const DOWN_ROLL = 0.55; // 崩れきったときの傾き (rad)
export const DOWN_PITCH = -0.18; // 崩れきったときにうつむく量 (rad)
export const GAMEOVER_DELAY = 2.6; // 倒れてから画面を出すまで（実時間）
export const isDown = () => game.downT >= 0;

// 0（倒れた瞬間）〜 1（崩れきった）
export function downFall() {
  if (!isDown()) return 0;
  const k = Math.min(1, game.downT / DOWN_FALL_TIME);
  return 1 - (1 - k) ** 3;
}
export function downSlowFactor() {
  if (!isDown()) return 1;
  return THREE.MathUtils.lerp(1, DOWN_SLOW_SCALE, Math.min(1, game.downT / DOWN_SLOW_IN));
}

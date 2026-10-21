import type { WeaponId } from '../weapons/ids.js';
import * as THREE from 'three';
import { PLAYER_MAX_HP } from '../player/config.js';

// ---- 武器や演出をまたいで共有している値 ----
// ほかのファイルからも書き換えられるよう、1 つのオブジェクトにまとめる
// 持ち替えは「今の武器を下げる → 入れ替える → 新しい武器を上げる」
export const game = {
  wantWeapon: 'kunai' as WeaponId, // 数字キーで選んだ武器
  shownWeapon: 'kunai' as WeaponId, // 今手に持っている武器
  holster: 0, // 0 = 構えている, 1 = 画面の下へ下げきった
  throwHeld: false, // 右クリックを押し続けているか
  fovKick: 0,
  landDipVel: 0,
  sinceDash: 99,
  hitStop: 0, // 残りの停止時間。この間はゲームの時間を進めない
  trailNow: 0,
  realDt: 0, // スローに関係なく実際に経った時間
  timeScale: 1, // ゲーム全体の時間の速さ（ループで dt に掛ける）
  deadEye: 'off' as 'off' | 'mark' | 'fire' | 'after',
  deadEyeT: 0, // 今の段に入ってからの時間（実時間）
  attackHeld: false, // 左クリックを押し続けているか
  usingPad: false, // 最後に触ったのがパッドか（マウスを触ったら外れる）
  playerHp: PLAYER_MAX_HP,
  parryReturnAge: Infinity, // 返した弾が当たってからの実時間
  attackPressed: false,
  hitStopTotal: 0,
  hitStopShakesDummy: true, // パリィで止めたときは敵を震わせない
  downT: -1, // 倒れてからの実時間。-1 = 倒れていない
  viewSpin: 0, // 前の当たりから視点を左右へ回した量（向きを含む, rad）
};

// カメラの反動（ばね）
export const kick = new THREE.Vector3();
export const kickVel = new THREE.Vector3();

export const DEFAULT_HIT_STOP = 0.06;

export const DASH_ATTACK_WINDOW = 0.3; // ダッシュ後この時間内ならダッシュ斬りになる

export const SWING_SAMPLE = 1 / 120; // 刃の動く向きを、この時間だけ前後のポーズの差から求める

// 居合と同じゲージを使う。右クリック（ZL）を押している間は時間が遅くなり、照準でなぞった敵に印を付ける（残弾の数まで）。
// 同じ敵に照準を留めていれば印を重ねる。離すか、撃つか、弾の数だけ付けると、印へ視点を振りながら一気に撃ち抜く
export const DEADEYE_MAX = 3; // 印を付けていられる長さ（実時間の秒）。過ぎると撃つ

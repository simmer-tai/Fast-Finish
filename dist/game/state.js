import * as THREE from 'three';
// ---- 武器や演出をまたいで共有している値 ----
// ほかのファイルからも書き換えられるよう、1 つのオブジェクトにまとめる
// 持ち替えは「今の武器を下げる → 入れ替える → 新しい武器を上げる」
export const game = {
    wantWeapon: 'kunai', // 数字キーで選んだ武器
    shownWeapon: 'kunai', // 今手に持っている武器
    holster: 0, // 0 = 構えている, 1 = 画面の下へ下げきった
    throwHeld: false, // 右クリックを押し続けているか
    fovKick: 0,
    landDipVel: 0,
    sinceDash: 99,
    hitStop: 0, // 残りの停止時間。この間はゲームの時間を進めない
    trailNow: 0,
};
// カメラの反動（ばね）
export const kick = new THREE.Vector3();
export const kickVel = new THREE.Vector3();
export const DEFAULT_HIT_STOP = 0.06;
export const DASH_ATTACK_WINDOW = 0.3; // ダッシュ後この時間内ならダッシュ斬りになる
export const SWING_SAMPLE = 1 / 120; // 刃の動く向きを、この時間だけ前後のポーズの差から求める

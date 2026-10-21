// ---- プレイヤーの動きの設定 ----
export const EYE_HEIGHT = 1.6;
export const WALK_SPEED = 8;
export const SPRINT_SPEED = 15;
export const JUMP_SPEED = 6;
export const GRAVITY = 20;
export const GROUND_ACCEL = 90; // 地上での加減速
export const GROUND_FRICTION = 60; // 入力がないときの地上での減速
export const GROUND_TURN_RATE = 14; // 地上で進行方向を曲げる速さ (rad/s)
export const OVERSPEED_DECAY = 8; // 最高速を超えた分を地上で失う速さ (m/s²)。空中では失わない
export const AIR_ACCEL = 45;
export const AIR_TURN_RATE = 4;
export const PLAYER_RADIUS = 0.35;
// ダッシュ（ステップ）
export const DASH_SPEED = 38;
export const DASH_TIME = 0.14;
export const DASH_EXIT_SPEED = 23; // ダッシュ後に残す速さ（勢い）
export const DASH_CHARGES = 2;
export const DASH_RECHARGE = 0.9; // 地上で 1 回分回復する時間
export const DASH_COOLDOWN = 0.2;
// スライディング
export const SLIDE_EYE_HEIGHT = 0.9;
export const SLIDE_START_SPEED = 10;
export const SLIDE_END_SPEED = 6;
export const SLIDE_BOOST = 6;
export const SLIDE_BOOST_MAX = 30; // ブーストでこれ以上は加速しない
export const SLIDE_BOOST_COOLDOWN = 0.8;
export const SLIDE_FRICTION = 7;
export const SLIDE_TURN_RATE = 1.5;
// よじ登り
export const MANTLE_REACH = 3.0; // 足元からこの高さまでの縁に手が届く
export const MANTLE_FACING = 0.6; // 視線（水平）と壁へ向かう向きの内積がこれ以上なら「壁を向いている」とみなす（約 53° 以内）
export const MANTLE_TIME_BASE = 0.15; // よじ登りにかかる時間 = BASE + 登る高さ × PER_METER
export const MANTLE_TIME_PER_METER = 0.12;
export const MANTLE_KEEP = 0.6; // 登りきった後に残す、登る前の水平の勢いの割合
// 壁走り
export const WALLRUN_MIN_SPEED = 7; // 壁に沿う速さがこれ以上なら壁走りを始める
export const WALLRUN_SPEED = 14; // 壁走り中はこの速さまで加速する（これより速ければ勢いを保つ）
export const WALLRUN_ACCEL = 20;
export const WALLRUN_GRAVITY = 3; // 壁走り中の重力（ゆっくり落ちる）
export const WALLRUN_START_LIFT = 2; // 飛びついた瞬間の上向きの速さの上限（落下中なら落下を止める）
export const WALLRUN_MAX_FALL = 3; // 壁走り中の落下速度の上限
export const WALLRUN_MAX_TIME = 1.6;
export const WALLRUN_MIN_HEIGHT = 1; // 壁の上端が足元からこれ以上高くないと走り始めない
export const WALLJUMP_UP = 6.5;
export const WALLJUMP_OUT = 7; // 壁から離れる向きへ足す速さ
export const WALLRUN_ROLL = 0.12; // 壁と反対側へ頭を傾ける量 (rad)
// カメラ
export const BASE_FOV = 75;
export const MAX_FOV_BONUS = 22; // 速度による最大の視野拡大
export const FOV_SPEED_MAX = 32; // この速さで視野拡大が最大になる
export const PLAYER_MAX_HP = 100;

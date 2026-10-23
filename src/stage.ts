import type { EnemyKind } from './enemy/state.js';

// ---- ステージの形の決まり ----
// ステージごとのファイル（station.ts など）は、置く箱と地面の帯、動ける範囲、始めの位置だけを返す。
// メッシュやせり上がり、当たり判定への登録は main.ts でまとめて行う

export interface StageBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number; // 上面の高さ
  y0?: number; // 底面の高さ。省けば地面から立つ
  light: number; // 明るさ（0 が黒、1 が白）
  look: 'terrain' | 'struct' | 'plain'; // 面の線の引き方: 地形のグリッド / 人工物のグリッド / 線なし
  gridOrigin?: { x: number; y: number; z: number }; // 格子の起点。省けば世界の原点（格子からずれた所に置く物の縁に線を乗せる）
  shape?: 'octagonZ' | 'octagonX'; // 箱の代わりの形: z / x の向きに伸びる八角柱（車輪）。省けば箱
}

// 坂: 上面を傾けた、くさび形の台（当たり判定あり）。底面 y0 から立ち、up の向きへ上っていく。
// 低い端の上面は y0（そこから歩いて乗れる）、高い端の上面は h
export interface StageRamp {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  h: number;
  up: '+x' | '-x' | '+z' | '-z';
  light: number;
  look: 'terrain' | 'struct';
}

export interface StageLine {
  x: number;
  y: number;
  z: number;
  w: number; // x 方向の幅
  d: number; // z 方向の長さ
}

// 動く物（天井クレーンなど）: 箱をまとめて、axis の向きに travel だけ往復させる。箱の座標は動き出す前の位置で書く。
// 端で pause だけ止まり、片道は time かけて、動き出しと止まりぎわをゆっくりにする。上に乗ると一緒に運ばれる
export interface StageMover {
  boxes: StageBox[]; // 当たり判定のある箱
  decor: StageBox[]; // 見た目だけの箱
  axis: 'x' | 'z';
  travel: number; // 動く距離（符号で向き）
  time: number; // 片道にかかる時間 (s)
  pause: number; // 端で止まる時間 (s)
}

export interface StageLayout {
  boxes: StageBox[]; // 当たり判定のある箱
  movers?: StageMover[]; // 動く物
  ramps?: StageRamp[]; // 坂
  decor: StageBox[]; // 見た目だけの箱（当たり判定なし。浮かせてよい）
  colliders: { minX: number; maxX: number; minZ: number; maxZ: number; h: number; y0?: number }[]; // 当たり判定だけの見えない箱
  scenery: StageBox[]; // 遠景（当たり判定なし。操作を返すのを待たない）
  lines: StageLine[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  start: { x: number; y: number; z: number }; // 足もとの位置。-Z を向いて始める
  enemySpawns: { x: number; y: number; z: number }[]; // 敵が現れる足もとの位置。倒すたびにこの中から選び直す
  lead?: EnemyKind; // このステージの主役の敵。その空間で一番怖くなる敵を、難易度で決まる数だけ銃撃役に混ぜる。省けば銃撃役だけ
  view: { eye: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }; // ステージ選択の背景で、景色を見せるカメラの位置と見る先
}

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

// 動く物（天井クレーンなど）: 箱をまとめて、path の行き先を順にめぐらせる。箱の座標は動き出す前の位置で書く。
// 行き先は動き出す前の位置からのずれで、前の行き先から time かけて動く（動き出しと止まりぎわはゆっくり）。前と同じ所なら、その間止まる。
// 最後の行き先は (0, 0) にして、初めに戻す。上に乗ると一緒に運ばれる。
// yaw を書くと pivot を中心に向きも変える（上から見て左回りが正。当たり判定は回した箱を囲む、軸に沿った箱にする）
export interface StageMoverPart {
  boxes: StageBox[]; // 当たり判定のある箱
  decor: StageBox[]; // 見た目だけの箱
  colliders?: StageLayout['colliders']; // 当たり判定だけの見えない箱
  follow?: 'x' | 'z'; // その向きにだけついて動く（クレーンの橋桁は z だけ、巻き上げ機と吊り荷は両方）。省けば両方
}
export interface StageMoverStep {
  x: number;
  z: number;
  yaw?: number; // 動き出す前からの向きの変わり (rad)。省けば前の行き先のまま
  time: number;
  ease?: 'both' | 'in' | 'out' | 'none'; // 速さの付け方: 両端でゆっくり（省いたとき）/ 動き出しだけ / 止まりぎわだけ / 一定
}
export interface StageMover {
  parts: StageMoverPart[];
  path: StageMoverStep[];
  pivot?: { x: number; z: number }; // 向きを変えるときの中心
  hazard?: boolean; // 速く動いている間は、ぶつかったプレイヤーと敵を跳ね飛ばす（車）
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
  // 敵が現れる足もとの位置。倒すたびにこの中から選び直す。perch は狙撃手だけが使う高い所（歩き回る敵は出さない）
  enemySpawns: { x: number; y: number; z: number; perch?: boolean }[];
  lead?: EnemyKind; // このステージの主役の敵。その空間で一番怖くなる敵を、難易度で決まる数だけ銃撃役に混ぜる。省けば銃撃役だけ
  guest?: EnemyKind; // 主役より少なく混ぜる脇役の敵。省けば混ぜない
  view: { eye: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }; // ステージ選択の背景で、景色を見せるカメラの位置と見る先
}

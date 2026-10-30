import type { EnemyKind } from './enemy/state.js';

// ---- ステージの形の決まり ----
// ステージごとのファイル（station.ts など）は、置く箱と地面の帯、動ける範囲、始めの位置だけを返す。
// メッシュやせり上がり、当たり判定への登録は main.ts でまとめて行う

// ボスが登場で突き破る外壁。intact・broken は壊れる前と後の見た目だけの箱（当たり判定はない）、
// hole は開く穴（真ん中 (x, y)、横と縦の半径 rx・ry、表の面の z）
export interface StageBreach {
  intact: StageBox[];
  broken: StageBox[];
  hole: { x: number; y: number; rx: number; ry: number; z: number };
}

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
  // 傾けた箱（エスカレーターの手すりなど。見た目だけの箱に使う）: up の向きへ進むほど、底面も上面も持ち上げ、反対の端より rise だけ高くする。
  // y0 と h は低い端での高さ。省けば水平
  slope?: { up: StageRamp['up']; rise: number };
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
  hidden?: boolean; // 当たり判定だけを持たせ、くさびの形は描かない（見た目は傾けた箱などで別に作る）
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

// 昇り続けるリフトのシャフト（LIFT）: リフトは動かさず、まわりのシャフトを下へ流して昇っているように見せる（world/shaft.ts）。
// シャフトは高さ period の区切りを上下に繰り返し並べたもので、箱の y は区切りの中の高さ（0..period）で書く。当たり判定は持たない。
// 敵は、まだ上にある足場に現れて足場ごと下りてきて、リフトの床に近づいたら飛び乗る
export interface StageShaftLedge {
  x: number; // 立つ所（足場の真ん中、リフト寄りの縁の近く）
  z: number;
  y: number; // 足場の上面（区切りの中の高さ）
  along: 'x' | 'z'; // 足場が延びる向き（壁に沿う向き）。2 体まで、この向きに並んで立つ
  to: { x: number; z: number }; // 飛び乗る先（リフトの床の上）
}
export interface StageShaft {
  period: number;
  speed: number; // 昇る速さ (m/s)
  inner: number; // 壁の内面 (|x|, |z|)
  walls: StageBox[]; // 壁（影を落とさない。落とすとリフトが一面の影になる）
  tile: StageBox[]; // 壁から張り出した物（足場・パイプ・ダクト・明かりなど）
  ledges: StageShaftLedge[];
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
  // ボス（enemy/boss.ts）の足もとの位置と向き（省けば +Z を向く）。箱が組み上がりきってから、登場の演出で現れる。
  // breach は登場で突き破る外壁（ボスはその奥に隠れて待つ）
  boss?: { x: number; z: number; yaw?: number; breach?: StageBreach };
  lead?: EnemyKind; // このステージの主役の敵。その空間で一番怖くなる敵を、難易度で決まる数だけ銃撃役に混ぜる。省けば銃撃役だけ
  guest?: EnemyKind; // 主役より少なく混ぜる脇役の敵。省けば混ぜない
  // 難易度ごとの、倒す数のうちの敵の種類の割合（足して 1）。あれば主役と脇役の代わりにこれで混ぜる
  mix?: Record<'easy' | 'normal' | 'hard', Partial<Record<EnemyKind, number>>>;
  shaft?: StageShaft; // 昇り続けるリフトのシャフト。あれば地面を消す
  view: { eye: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }; // ステージ選択の背景で、景色を見せるカメラの位置と見る先
}

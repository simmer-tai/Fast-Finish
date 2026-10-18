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
}

export interface StageLine {
  x: number;
  y: number;
  z: number;
  w: number; // x 方向の幅
  d: number; // z 方向の長さ
}

export interface StageLayout {
  boxes: StageBox[]; // 当たり判定のある箱
  decor: StageBox[]; // 見た目だけの箱（当たり判定なし。浮かせてよい）
  colliders: { minX: number; maxX: number; minZ: number; maxZ: number; h: number; y0?: number }[]; // 当たり判定だけの見えない箱
  scenery: StageBox[]; // 遠景（当たり判定なし。操作を返すのを待たない）
  lines: StageLine[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  start: { x: number; y: number; z: number }; // 足もとの位置。-Z を向いて始める
  enemySpawns: { x: number; y: number; z: number }[]; // 敵が現れる足もとの位置。倒すたびにこの中から選び直す
  view: { eye: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }; // ステージ選択の背景で、景色を見せるカメラの位置と見る先
}

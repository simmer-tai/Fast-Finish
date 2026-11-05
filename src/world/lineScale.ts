// ---- 線の濃さ ----
// ステージの線の一部は「描画の 1 ピクセル幅」で引く。解像度を下げると、引き伸ばされて画面では太く見える。
// 1 ピクセルより細くは描けないので、太くなる分だけ薄くして細く見せる。value は描画の 1 ピクセルが画面の何ピクセルぶんかの逆数。
// 描画の解像度が変わるたびに main.ts の applyRatio が決める
export const lineScale = { value: 1 };
const LINE_SCALE_MIN = 0.4; // これより薄くすると線が見えなくなる

export function setLineScale(renderRatio: number, deviceRatio: number) {
  lineScale.value = Math.min(1, Math.max(LINE_SCALE_MIN, renderRatio / deviceRatio));
}

// 同じシェーダーに 2 回足されても（gridMaterial を withRiseBuild で包むとき）宣言が重ならないようにする
export const LINE_SCALE_GLSL = `
  #ifndef LINE_SCALE_DECLARED
  #define LINE_SCALE_DECLARED
  uniform float uLineK;
  #endif
`;

// ---- 入力の状態 ----
// キーとパッドのリスナーは main.ts。ここには、各所で読む今の状態だけを置く
export const keys = new Set<string>(); // 押しっぱなしのキー
export const pressed = new Set<string>(); // このフレームで押されたキー
export const padMove = { x: 0, y: 0 }; // 左スティック（x: 右, y: 前）

// 画面の大きさに合わせた HUD の 1 単位 (px)。index.html の --u と同じ式（1920×1080 で 1）
export function hudUnit() {
    return Math.min(Math.max(Math.min(innerWidth * 0.000521, innerHeight * 0.001042), 0.45), 2.5);
}

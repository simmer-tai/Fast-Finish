// ---- 映画の帯 ----
// 操作できない演出（ボスの登場）の間、画面の上下に黒い帯を出す
const LETTERBOX_HEIGHT = 11; // 帯の太さ (vh)
const bar = (edge) => {
    const el = document.createElement('div');
    el.style.cssText = `position: fixed; left: 0; right: 0; ${edge}: 0; height: ${LETTERBOX_HEIGHT}vh; background: #111; z-index: 8; pointer-events: none; transform: scaleY(0); transform-origin: ${edge};`;
    document.body.appendChild(el);
    return el;
};
const bars = [bar('top'), bar('bottom')];
// k = 0（出さない）〜 1（出しきる）
export function setLetterbox(k) {
    for (const el of bars)
        el.style.transform = `scaleY(${k.toFixed(3)})`;
}

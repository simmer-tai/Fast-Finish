import { renderer } from '../core.js?v=9bd5fe3e';
// ---- 異方性フィルタ ----
// 床や壁に貼る跡（ひび・焦げ・切り傷）を斜めから見たときに、にじまないようにする。画質の切り替えで main.ts の applyQuality が決める。
// 床の格子はシェーダーで引いているので関係ない
const textures = [];
let level = 1;
// 斜めから見る面に貼るテクスチャを登録する（そのまま返す）
export function trackAnisotropy(t) {
    t.anisotropy = level;
    textures.push(t);
    return t;
}
// n: 1 で切る。GPU の上限を超える分は上限に合わせる
export function setAnisotropy(n) {
    const next = Math.max(1, Math.min(n, renderer.capabilities.getMaxAnisotropy()));
    if (next === level)
        return;
    level = next;
    for (const t of textures) {
        t.anisotropy = level;
        t.needsUpdate = true; // 送り直さないと変わらない
    }
}

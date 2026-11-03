import * as THREE from 'three';
import { SCOPE_VIEW_ON, rifleState } from '../weapons/rifleCombat.js?v=9bd5fe3e';
// ---- スコープの絵 ----
// ライフルを覗ききる直前から、丸く抜いた黒い枠と十字線を重ねる。出ている間は普段のクロスヘアを消す
const scopeEl = document.getElementById('scope');
let shown = -1;
export function updateScopeOverlay() {
    const k = THREE.MathUtils.smoothstep(rifleState.scope, SCOPE_VIEW_ON - 0.15, SCOPE_VIEW_ON);
    if (k === shown)
        return;
    shown = k;
    scopeEl.style.opacity = String(k);
    document.body.classList.toggle('scoped', k > 0.5);
}

import { game } from '../game/state.js?v=2f0a24b4';
import { KUNAI_AMMO, thrown } from '../weapons/kunaiCombat.js?v=2f0a24b4';
// ---- HUD: クナイの手持ち（照準の下） ----
// 手持ちの本数だけ濃く塗る。投げた印は跳ねて薄くなり、戻った印は白く光って伸び、投げ切ると全体が震える
const kunaiHud = document.getElementById('kunaiammo');
const kunaiPips = [...kunaiHud.querySelectorAll('i')].slice(0, KUNAI_AMMO);
let shown = -1; // 表示中の本数（最初の表示では光らせない）
function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
}
export function updateKunaiHud() {
    kunaiHud.classList.toggle('show', game.shownWeapon === 'kunai' && !game.unarmed);
    const ammo = Math.max(0, KUNAI_AMMO - thrown.length);
    if (ammo === shown)
        return;
    for (let i = 0; i < kunaiPips.length; i++) {
        kunaiPips[i].classList.toggle('spent', i >= ammo);
        if (shown < 0)
            continue;
        if (i >= shown && i < ammo)
            replay(kunaiPips[i], 'gain');
        if (i >= ammo && i < shown)
            replay(kunaiPips[i], 'toss');
    }
    if (shown > 0 && ammo === 0)
        replay(kunaiHud, 'empty');
    shown = ammo;
}

import { game, STYLE_MULT, STYLE_NAMES } from '../game/state.js?v=6b2d2aee';
import { restartAnim } from './restartAnim.js?v=6b2d2aee';
// ---- スタイルランク ----
// 合計スコアの下に、今のランク（game.style）を札とゲージで出す。計算は main.ts（styleKillBonuses / decayStyle）。
// 上がったら札を弾ませ、下がったら揺らす。S から上は赤を差す
const STYLE_HI = 4;
const el = document.querySelector('#total .style');
const rkEl = el.querySelector('.rk');
const letterEl = rkEl.querySelector('b');
const multEl = el.querySelector('.mult');
const fillEl = el.querySelector('.bar .f');
let shownRank = -1;
// クラスを外して付け直し、CSS のアニメーションを最初からやり直す
function restart(node, cls) {
    node.classList.remove('up', 'down');
    restartAnim(node, cls);
}
// visible = ステージの間だけ出す（訓練場とタイトルでは隠す）
export function updateStyleHud(visible) {
    el.hidden = !visible;
    if (!visible) {
        shownRank = -1;
        return;
    }
    const { rank, meter } = game.style;
    if (rank !== shownRank) {
        if (shownRank >= 0)
            restart(rkEl, rank > shownRank ? 'up' : 'down');
        letterEl.textContent = STYLE_NAMES[rank];
        multEl.textContent = `×${STYLE_MULT[rank].toFixed(2).replace(/0$/, '')}`;
        el.classList.toggle('hi', rank >= STYLE_HI);
        shownRank = rank;
    }
    fillEl.style.width = `${(meter * 100).toFixed(1)}%`;
}

// ---- ゲームオーバー ----
// 倒れた後の画面。見出しを落としてから記録を並べ、右に残っていた敵の数を大きく出す。
// 動きは CSS が出した瞬間に始める（index.html の .over-view）。ここでは中身を入れて、見出しに合わせて音を鳴らすだけ
import * as sfx from './audio.js';
import { fmtTime } from './result.js';

export interface GameOverData {
  stageNo: string;
  stageName: string;
  difficulty: string;
  time: number;
  kills: number;
  quota: number;
  score: number;
}

const view = document.querySelector<HTMLElement>('#overlay .over-view')!;
const q = (sel: string) => view.querySelector<HTMLElement>(sel)!;
const T_SLAM = 0.32; // 見出しの帯が叩きつけられる時刻（CSS の go-slam と揃える）

export function showGameOverView(d: GameOverData) {
  q('.go-kicker').textContent = `STAGE ${d.stageNo} — ${d.stageName} / ${d.difficulty}`;
  q('[data-go="time"]').textContent = fmtTime(d.time);
  q('[data-go="kills"]').textContent = `${d.kills} / ${d.quota}`;
  q('[data-go="score"]').textContent = Math.round(d.score).toLocaleString('en-US');
  q('.go-left b').textContent = String(d.quota - d.kills);
  document.body.classList.add('result-shown');
  setTimeout(() => {
    sfx.playGameOver();
    view.querySelector('.go-shake')!.animate(
      [
        { transform: 'translate(10px, -6px)' },
        { transform: 'translate(-8px, 5px)' },
        { transform: 'translate(5px, 3px)' },
        { transform: 'none' },
      ],
      { duration: 360, easing: 'ease-out' },
    );
  }, T_SLAM * 1000);
}

// 選んでいる項目（RETRY / TITLE）を上下で切り替える
const buttons = [...view.querySelectorAll<HTMLElement>('.go-menu button')];
let active = 0;
export function stepGameOverMenu(dir: number) {
  const next = Math.max(0, Math.min(buttons.length - 1, active + dir));
  if (next === active) return false;
  active = next;
  buttons.forEach((b, i) => b.classList.toggle('active', i === active));
  return true;
}
export const gameOverChoice = () => buttons[active].dataset.action as 'retry' | 'title';

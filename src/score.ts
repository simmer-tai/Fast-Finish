// ---- 倒したときのスコア ----
// 照準の右に、とどめの一撃の点数を出す。基本点に、倒し方（スライディング・パリィ・遠距離など）ごとの倍率を
// 小さいものから 1 つずつ足していき、最後に掛け合わせた点数を叩きつけるように確定させる。
// とどめのヒットストップやスローに関係なく、実時間で進める
import * as sfx from './audio.js';

export interface KillBonus {
  label: string;
  add: number; // 倍率に足す量
  detail?: string; // 距離など、ラベルの横に小さく添える
}

const KILL_BASE = 100;
const FIRST_STEP = 0.26; // 出てから最初の倍率を足すまで
const STEP_GAP = 0.2; // 倍率を 1 つずつ足していく間隔
const SLAM_GAP = 0.32; // 最後の倍率から確定までの溜め
const HOLD = 1.6; // 確定してから見せておく時間
const FADE = 0.35;
const COUNT_RATE = 16; // 表示の点数を目標へ寄せる速さ
const TOTAL_RATE = 7;

const el = document.getElementById('score')!;
const ptsEl = el.querySelector<HTMLElement>('.pts')!;
const multEl = el.querySelector<HTMLElement>('.mult')!;
const multText = multEl.querySelector('b')!;
const rowsEl = el.querySelector<HTMLElement>('.rows')!;
// 合計は画面右上にずっと出しておく
const totalEl = document.querySelector<HTMLElement>('#total .num span')!;
const gainEl = document.querySelector<HTMLElement>('#total .gain')!;

let time = Infinity; // 出してからの実時間。Infinity なら何も進めない
let queue: { at: number; run: () => void }[] = [];
let pts = 0;
let ptsTarget = 0;
let total = 0;
let totalShown = 0;
let pending = 0; // まだ確定させていない点数（確定前に次を倒したら、合計へ入れてから出し直す）

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// クラスを外して付け直し、CSS のアニメーションを最初からやり直す
function restart(node: HTMLElement, cls: string) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function addRow(b: KillBonus) {
  const row = document.createElement('div');
  row.className = 'row';
  for (const [cls, text] of [['lbl', b.label], ['det', b.detail ?? ''], ['add', `+${b.add.toFixed(1)}`]]) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    row.append(s);
  }
  rowsEl.append(row);
}

// 確定した点数を合計へ入れる。右上の数字を跳ねさせ、増えた分を下に添える
function bank() {
  if (pending <= 0) return;
  total += pending;
  gainEl.textContent = `+${fmt(pending)}`;
  restart(gainEl, 'show');
  restart(totalEl, 'bump');
  pending = 0;
}

// 今の合計。まだ確定させていない点数も含める（最後の一撃の確定を待たずに結果を出せるように）
export const totalScore = () => total + pending;
export function resetScore() {
  time = Infinity; queue = []; pts = ptsTarget = total = totalShown = pending = 0;
  rowsEl.replaceChildren(); el.classList.remove('on', 'slam', 'out');
  totalEl.textContent = '0'; gainEl.textContent = '';
}

// base = 倍率を掛ける前の点数（ボスは本体を削った分。ふつうの敵は KILL_BASE）。返り値は倍率を掛けた点数
export function showKillScore(bonuses: KillBonus[], base = KILL_BASE): number {
  bank();
  const list = [...bonuses].sort((a, b) => a.add - b.add); // 大きい倍率ほど後に足して、盛り上がりを最後に置く
  const final = base * (1 + list.reduce((s, b) => s + b.add, 0));
  pending = final;

  rowsEl.replaceChildren();
  el.classList.remove('slam', 'out');
  restart(el, 'on');
  let mult = 1;
  pts = ptsTarget = base;
  ptsEl.textContent = fmt(pts);
  multText.textContent = '×1.0';
  sfx.playScoreTick(0);

  queue = list.map((b, i) => ({
    at: FIRST_STEP + i * STEP_GAP,
    run: () => {
      mult += b.add;
      addRow(b);
      multText.textContent = `×${mult.toFixed(1)}`;
      restart(multEl, 'punch');
      restart(ptsEl, 'bump');
      ptsTarget = base * mult;
      sfx.playScoreTick(i + 1);
    },
  }));
  const slamAt = list.length ? FIRST_STEP + (list.length - 1) * STEP_GAP + SLAM_GAP : FIRST_STEP;
  queue.push(
    {
      at: slamAt,
      run: () => {
        pts = ptsTarget = final;
        ptsEl.textContent = fmt(final);
        restart(el, 'slam');
        bank();
        sfx.playScoreSlam(list.length);
      },
    },
    { at: slamAt + HOLD, run: () => el.classList.add('out') },
    { at: slamAt + HOLD + FADE, run: () => el.classList.remove('on', 'slam', 'out') },
  );
  time = 0;
  return final;
}

export function updateScoreHud(realDt: number) {
  if (totalShown !== total) {
    totalShown += (total - totalShown) * Math.min(1, realDt * TOTAL_RATE);
    if (Math.abs(total - totalShown) < 0.5) totalShown = total;
    totalEl.textContent = fmt(totalShown);
  }

  if (time === Infinity) return;
  time += realDt;
  while (queue.length && queue[0].at <= time) queue.shift()!.run();
  if (!queue.length) time = Infinity;

  pts += (ptsTarget - pts) * Math.min(1, realDt * COUNT_RATE);
  if (Math.abs(ptsTarget - pts) < 0.5) pts = ptsTarget;
  ptsEl.textContent = fmt(pts);
}

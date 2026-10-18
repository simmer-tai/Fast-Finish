// ---- ステージの結果 ----
// 倒しきった後の結果の画面。見出しを出してから、記録を 1 行ずつ数え上げる。最後に合計を数え上げて叩きつけ、右へ巨大なランクを落として画面を揺らす。
// 一時停止中に出すので、時間は実時間（performance.now）で進め、音は UI の AudioContext で鳴らす。
// 途中で決定を押すと、残りを飛ばして最後の形にする
import * as sfx from './audio.js';
export function fmtTime(t) {
    const cs = Math.floor(t * 100);
    return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
// ランク: 1 体あたりのスコアで決め、受けたダメージが多いほど割り引く（目安。遊びながら詰める）
const RANKS = [
    ['S', 320, 'SUPERB'],
    ['A', 230, 'GREAT'],
    ['B', 160, 'GOOD'],
    ['C', 0, 'CLEAR'],
];
const DAMAGE_FULL_PENALTY = 300; // これだけ受けると半分まで割り引く
function rankOf(d) {
    const per = (d.score / Math.max(1, d.kills)) * Math.max(0.5, 1 - (0.5 * d.damage) / DAMAGE_FULL_PENALTY);
    return RANKS.find(([, min]) => per >= min);
}
// 出す順番（秒）
const T_HEAD = 0.1; // 見出し
const T_ROW = 0.55; // 1 行目
const ROW_GAP = 0.62;
const ROW_COUNT = 0.5; // 1 行を数え上げる時間
const T_SCORE = T_ROW + ROW_GAP * 3 + 0.1;
const SCORE_COUNT = 1.3;
const T_SCORE_SLAM = T_SCORE + 0.2 + SCORE_COUNT + 0.18; // 数え終えてから一拍おいて確定
const T_RANK = T_SCORE_SLAM + 0.7;
const T_TAGS = T_RANK + 0.55;
const T_MENU = T_TAGS + 0.45;
const TICK_GAP = 0.045; // 数え上げの刻みの間隔
const view = document.querySelector('#overlay .result-view');
const q = (sel) => view.querySelector(sel);
const shake = q('.rv-shake');
const flash = q('.rv-flash');
const ghost = q('.rv-ghost');
const kicker = q('.rv-kicker');
const title = q('.rv-title');
const rule = q('.rv-rule');
const rows = {
    time: q('[data-row="time"]'),
    kills: q('[data-row="kills"]'),
    damage: q('[data-row="damage"]'),
};
const score = q('.rv-score');
const scoreVal = score.querySelector('b');
const scoreBar = score.querySelector('.bar');
const rank = q('.rv-rank');
const rankLetter = q('.rv-letter');
const rankNote = q('.rv-rank-note');
const menu = q('.rv-menu');
const tags = {
    time: q('[data-tag="time"]'),
    damage: q('[data-tag="damage"]'),
    score: q('[data-tag="score"]'),
};
let steps = [];
let counts = [];
let t0 = 0;
let running = false;
let quiet = false; // 飛ばしている間は、途中の音を鳴らさない
let onDone = null;
// クラスを外して付け直し、CSS のアニメーションを最初からやり直す
function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
}
const show = (node) => restart(node, 'show');
const play = (fn) => {
    if (!quiet)
        fn();
};
// 画面全体を一瞬揺らす（強さは px）
function shakeView(p) {
    if (quiet)
        return;
    shake.animate([
        { transform: `translate(${p}px, ${-p * 0.6}px)` },
        { transform: `translate(${-p * 0.8}px, ${p * 0.5}px)` },
        { transform: `translate(${p * 0.5}px, ${p * 0.3}px)` },
        { transform: `translate(${-p * 0.25}px, ${-p * 0.2}px)` },
        { transform: 'none' },
    ], { duration: 380, easing: 'ease-out' });
}
// 値を 0 から数え上げる。進みは終わりほどゆっくりにする
function countUp(at, dur, el, to, fmt, after) {
    steps.push({
        at,
        run: () => {
            counts.push({
                start: at,
                dur,
                lastTick: -1,
                set: (k) => (el.textContent = fmt(to * (1 - (1 - k) ** 3))),
                done: () => {
                    el.textContent = fmt(to);
                    restart(el, 'lock');
                    after?.();
                },
            });
        },
    });
}
function addRow(at, row, to, fmt) {
    const val = row.querySelector('b');
    val.textContent = fmt(0);
    steps.push({ at, run: () => show(row) });
    countUp(at + 0.12, ROW_COUNT, val, to, fmt, () => play(sfx.playResultLock));
}
export function showResult(d, done) {
    onDone = done ?? null;
    steps = [];
    counts = [];
    quiet = false;
    for (const node of view.querySelectorAll('.show, .lock, .on, .slam'))
        node.classList.remove('show', 'lock', 'on', 'slam');
    const [letter, , note] = rankOf(d);
    kicker.textContent = `STAGE ${d.stageNo} — ${d.stageName} / ${d.difficulty}`;
    ghost.textContent = `${d.stageName} ${d.stageName} `;
    rankLetter.textContent = letter;
    rankLetter.dataset.rank = letter;
    rankNote.textContent = note;
    scoreVal.textContent = '0';
    scoreBar.style.setProperty('--p', '0');
    steps.push({
        at: T_HEAD,
        run: () => {
            show(ghost);
            show(kicker);
            show(title);
            show(rule);
            play(sfx.playUiOpen);
        },
    });
    addRow(T_ROW, rows.time, d.time, fmtTime);
    addRow(T_ROW + ROW_GAP, rows.kills, d.kills, (v) => String(Math.round(v)));
    addRow(T_ROW + ROW_GAP * 2, rows.damage, d.damage, (v) => String(Math.round(v)));
    steps.push({ at: T_SCORE, run: () => show(score) });
    steps.push({
        at: T_SCORE + 0.2,
        run: () => {
            counts.push({
                start: T_SCORE + 0.2,
                dur: SCORE_COUNT,
                lastTick: -1,
                set: (k) => {
                    const e = 1 - (1 - k) ** 3;
                    scoreVal.textContent = fmtInt(d.score * e);
                    scoreBar.style.setProperty('--p', String(e));
                },
                done: () => {
                    scoreVal.textContent = fmtInt(d.score);
                    scoreBar.style.setProperty('--p', '1');
                },
            });
        },
    });
    steps.push({
        at: T_SCORE_SLAM,
        run: () => {
            score.classList.add('slam');
            restart(scoreVal, 'lock');
            play(sfx.playResultScore);
            shakeView(6);
        },
    });
    steps.push({
        at: T_RANK,
        run: () => {
            show(rank);
            // 文字が落ちきる瞬間に合わせて鳴らし、揺らす
            setTimeout(() => {
                sfx.playResultRank(letter);
                shakeView(letter === 'S' ? 18 : 12);
                restart(flash, 'on');
            }, quiet ? 0 : 180);
        },
    });
    const tagList = [];
    if (d.newTime)
        tagList.push(tags.time);
    if (d.damage <= 0)
        tagList.push(tags.damage);
    if (d.newScore)
        tagList.push(tags.score);
    tagList.forEach((tag, i) => steps.push({
        at: T_TAGS + i * 0.16,
        run: () => {
            show(tag);
            play(sfx.playResultStamp);
        },
    }));
    steps.push({
        at: T_MENU,
        run: () => {
            show(menu);
            running = false;
            onDone?.();
        },
    });
    steps.sort((a, b) => a.at - b.at);
    document.body.classList.add('result-shown');
    running = true;
    t0 = performance.now();
    requestAnimationFrame(frame);
}
function advance(t) {
    while (steps.length && steps[0].at <= t)
        steps.shift().run();
    counts = counts.filter((c) => {
        const k = Math.min(1, (t - c.start) / c.dur);
        if (k >= 1) {
            c.done();
            return false;
        }
        c.set(Math.max(0, k));
        if (!quiet && t - c.lastTick >= TICK_GAP) {
            c.lastTick = t;
            sfx.playResultTick(k);
        }
        return true;
    });
}
function frame(now) {
    if (!running)
        return;
    advance((now - t0) / 1000);
    if (running)
        requestAnimationFrame(frame);
}
// 演出の途中なら最後まで飛ばして true を返す。もう終わっていれば false（呼んだ側でタイトルへ戻す）
export function skipResult() {
    if (!running)
        return false;
    quiet = true;
    advance(Infinity);
    quiet = false;
    return true;
}

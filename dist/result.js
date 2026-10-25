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
// 最終スコア: 倒して稼いだ点数に、速く倒しきるほど大きい倍率を掛ける。受けたダメージは関係させない
// 時間の倍率は開始時がいちばん高く、時間とともに下がって、倒した数から決める基準タイムで ×1.0 になる。
// それより遅くても ×1.0 のまま（下回らない）。基準タイムは画面には出さない
const PAR_PER_KILL = 10; // 1 体あたりの基準秒数
const TIME_MAX = 3; // 開始時の倍率
function timeMultiplier(time, kills) {
    const r = Math.min(1, time / (PAR_PER_KILL * Math.max(1, kills))); // 基準タイムとの比
    return TIME_MAX - (TIME_MAX - 1) * r;
}
export function finalScore(killScore, time, kills) {
    return Math.round(killScore * timeMultiplier(time, kills));
}
// ランク: 最終スコアだけで決める。ステージごとに敵の数が違うので、しきい値は「1 体あたりの点数 × 倒した数」（目安。遊びながら詰める）
// 時間の倍率が乗るので、1 体 5 秒ペース（×2.0）を中心に据えている。SS は S の上に置いた、詰めきった人向けの段
const RANKS = [
    ['SS', 800, 'ULTIMATE'],
    ['S', 600, 'SUPERB'],
    ['A', 420, 'GREAT'],
    ['B', 260, 'GOOD'],
    ['C', 0, 'CLEAR'],
];
// ヘッドショット率が 9 割を超えたら、スコアによらずこの段にする（冗談のランク）
const CHEATER_RANK = ['Cheater?', 0, 'TOO ACCURATE'];
const CHEATER_HEADSHOT_RATE = 0.9;
function rankOf(d) {
    if (d.headshotRate !== null && d.headshotRate > CHEATER_HEADSHOT_RATE)
        return CHEATER_RANK;
    return RANKS.find(([, per]) => d.score >= per * d.kills);
}
// 出す順番（秒）
const T_HEAD = 0.1; // 見出し
const T_ROW = 0.55; // 1 行目
const ROW_GAP = 0.62;
const ROW_COUNT = 0.5; // 1 行を数え上げる時間
const SCORE_COUNT = 1.3;
// 合計から後は、出す行の数（ヘッドショット率の行があるか）でずらす
const timesAfterRows = (n) => {
    const score = T_ROW + ROW_GAP * n + 0.1;
    const slam = score + 0.2 + SCORE_COUNT + 0.18; // 数え終えてから一拍おいて確定
    const rank = slam + 0.7;
    const tags = rank + 0.55;
    return { score, slam, rank, tags, menu: tags + 0.45 };
};
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
    damage: q('[data-row="damage"]'),
    headshot: q('[data-row="headshot"]'),
};
const score = q('.rv-score');
const scoreVal = score.querySelector('b');
const meter = q('.rv-meter');
const meterFill = meter.querySelector('.fill');
// メーターの右端は S の地点。目印の位置は 1 体あたりのしきい値の比なので、倒した数によらず同じ
const METER_MAX = RANKS[0][1];
const marks = RANKS.map(([letter, per]) => {
    const mk = document.createElement('i');
    mk.className = 'mk';
    mk.style.setProperty('--x', `${(per / METER_MAX) * 100}%`);
    mk.innerHTML = `<span>${letter}</span>`;
    meter.append(mk);
    return { mk, at: per / METER_MAX };
});
// メーターを p（0〜1）まで伸ばし、届いた目印を点ける
function setMeter(p) {
    meterFill.style.setProperty('--p', String(p));
    for (const m of marks)
        if (p >= m.at && !m.mk.classList.contains('on'))
            m.mk.classList.add('on');
}
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
    setMeter(0);
    const meterTo = Math.min(1, d.score / (METER_MAX * Math.max(1, d.kills)));
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
    addRow(T_ROW + ROW_GAP, rows.damage, d.damage, (v) => String(Math.round(v)));
    rows.headshot.hidden = d.headshotRate === null;
    if (d.headshotRate !== null)
        addRow(T_ROW + ROW_GAP * 2, rows.headshot, d.headshotRate * 100, (v) => `${Math.round(v)}%`);
    const T = timesAfterRows(d.headshotRate === null ? 2 : 3);
    steps.push({ at: T.score, run: () => show(score) });
    steps.push({
        at: T.score + 0.2,
        run: () => {
            counts.push({
                start: T.score + 0.2,
                dur: SCORE_COUNT,
                lastTick: -1,
                set: (k) => {
                    const e = 1 - (1 - k) ** 3;
                    scoreVal.textContent = fmtInt(d.score * e);
                    setMeter(meterTo * e);
                },
                done: () => {
                    scoreVal.textContent = fmtInt(d.score);
                    setMeter(meterTo);
                },
            });
        },
    });
    steps.push({
        at: T.slam,
        run: () => {
            score.classList.add('slam');
            restart(scoreVal, 'lock');
            play(sfx.playResultScore);
            shakeView(6);
        },
    });
    steps.push({
        at: T.rank,
        run: () => {
            show(rank);
            // 文字が落ちきる瞬間に合わせて鳴らし、揺らす
            setTimeout(() => {
                sfx.playResultRank(letter);
                shakeView(letter === 'SS' ? 24 : letter === 'S' ? 18 : 12);
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
        at: T.tags + i * 0.16,
        run: () => {
            show(tag);
            play(sfx.playResultStamp);
        },
    }));
    steps.push({
        at: T.menu,
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

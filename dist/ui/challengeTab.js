import * as sfx from '../audio.js?v=d61aec99';
import { FEATS, MISSIONS, MISSION_GROUPS, TIER_NAMES, featDone, groupDone, loadMission, ruleTag, ruleText } from '../challenges.js?v=d61aec99';
import { fmtTime } from '../result.js?v=d61aec99';
import { LOCK } from './lvRoadmap.js?v=d61aec99';
import { badgePlate } from './cardHonors.js?v=d61aec99';
import { partSwatch } from './cardParts.js?v=d61aec99';
import { SKINS } from '../weapons/skins.js?v=d61aec99';
import { skinTagsHtml, startSkinSpin, stopSkinSpin } from './skinPicker.js?v=d61aec99';
// ---- PLAY のタブの CHALLENGE ----
// 上の MISSIONS / FEATS で切り替える。MISSIONS は左にミッションの一覧、右に選んだものの詳細と START。
// 一覧はミッションを見出し（MISSION_GROUPS）でまとめて 1 行にし、見出しを押すと中のミッションを開く（もう一度押すと閉じる）。
// 見出しに乗っている間は、詳細の代わりにそのチャレンジの概要ともらえるスキンの一覧を出す（.ch-overview）。
// FEATS は実績の札を並べる（見るだけ）。達成するとその絵のバッジをもらえる（ui/cardHonors.ts）。START を押したら、本体が initChallengeTab で渡した onStart でそのミッションへ入る
const overlay = document.getElementById('overlay');
const root = overlay.querySelector('.challenge');
const kind = root.querySelector('.ch-kind');
const modeButtons = [...root.querySelectorAll('[data-ch-mode]')];
const list = root.querySelector('.ch-list');
const detail = root.querySelector('.ch-mission');
const overview = root.querySelector('.ch-overview');
const featsPane = root.querySelector('[data-ch-pane="feats"]');
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
let mode = 'missions';
let index = 0; // 詳細に出しているミッション（MISSIONS の番号）
const open = new Set(); // 開いている見出し
let rows = [];
let cursor = 0; // 上下で乗っている行（rows の番号）
let onStart = () => { };
export const initChallengeTab = (start) => (onStart = start);
// 武器の名前は、武器の選択画面の行から写す
function weaponLabel(id) {
    const row = overlay.querySelector(`.sw-rows [data-weapon="${id}"]`);
    return { name: row?.dataset.name ?? id.toUpperCase(), ja: row?.dataset.ja ?? '' };
}
function weaponIcon(id) {
    const icon = document.querySelector(`#weapon .icon svg[data-w="${id}"]`)?.cloneNode(true);
    icon?.setAttribute('class', 'on');
    return icon;
}
function renderList() {
    rows = [];
    let html = '';
    MISSION_GROUPS.forEach((g, gi) => {
        const ms = MISSIONS.map((m, i) => ({ m, i })).filter(({ m }) => m.group === g.id);
        const done = ms.filter(({ m }) => loadMission(m.id)).length;
        const st = done === ms.length ? `<em class="st done">${CHECK}</em>` : `<em class="st">${done}/${ms.length}</em>`;
        const isOpen = open.has(g.id);
        rows.push({ group: g.id });
        html += `<button type="button" class="ch-group${isOpen ? ' open' : ''}" data-group="${g.id}"><span class="no">${String(gi + 1).padStart(2, '0')}</span><span>${g.name}<small>${g.ja}</small></span>${st}<i class="tl"></i><i class="tr"></i><i class="br"></i><i class="bl"></i></button>`;
        if (!isOpen)
            return;
        for (const { m, i } of ms) {
            rows.push({ mission: i });
            const w = weaponLabel(m.weapon);
            const mark = loadMission(m.id) ? `<em class="st done">${CHECK}</em>` : '<em class="st"></em>';
            html += `<button type="button" class="ch-sub" data-mission="${i}" data-w="${m.weapon}"><span class="sw-plate"><span class="ic"></span></span><span>${w.name}<small>${w.ja}</small></span>${mark}<i class="tl"></i><i class="tr"></i><i class="br"></i><i class="bl"></i></button>`;
        }
    });
    list.innerHTML = html;
    list.querySelectorAll('.ch-sub').forEach((b) => {
        const icon = weaponIcon(b.dataset.w);
        if (icon)
            b.querySelector('.ic').append(icon);
    });
    cursor = Math.min(cursor, rows.length - 1);
    markRows();
}
// 乗っている行を塗り、見出しなら概要・ミッションならその詳細を右に出す
function markRows() {
    const r = rows[cursor];
    const group = r && 'group' in r ? r.group : null;
    list.querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', j === cursor));
    root.dataset.view = group ? 'group' : 'mission';
    hideRewardTip();
    if (group)
        renderOverview(group);
}
function toggleGroup(id) {
    if (open.has(id))
        open.delete(id);
    else
        open.add(id);
    cursor = rows.findIndex((r) => 'group' in r && r.group === id);
    renderList();
}
function renderDetail() {
    const m = MISSIONS[index];
    const best = loadMission(m.id);
    const name = detail.querySelector('.ch-name');
    name.textContent = m.name;
    name.dataset.text = m.name; // 重ねる線の文字
    detail.querySelector('.si-title span').textContent = m.ja;
    const state = detail.querySelector('.ch-state');
    state.textContent = best ? 'CLEARED' : 'NOT CLEARED';
    state.classList.toggle('done', !!best);
    detail.querySelector('.ch-tag').textContent = ruleTag(m);
    detail.querySelector('[data-ch="stage"]').textContent = m.stage.toUpperCase();
    detail.querySelector('[data-ch="difficulty"]').textContent = m.difficulty.toUpperCase();
    const bd = detail.querySelector('[data-ch="best"]');
    bd.textContent = best ? fmtTime(best.time) : '--:--.--';
    bd.classList.toggle('set', !!best);
    const weapon = weaponLabel(m.weapon);
    const wd = detail.querySelector('[data-ch="weapon"]');
    const icon = weaponIcon(m.weapon);
    wd.querySelector('.ic').replaceChildren(...(icon ? [icon] : []));
    wd.querySelector('.nm').textContent = weapon.name;
    wd.querySelector('.ja').textContent = weapon.ja;
    // ご褒美のスキン。達成していれば塗りつぶして解放済みと出す
    const rd = detail.querySelector('[data-ch="reward"]');
    rd.querySelector('.nm').textContent = m.reward.name;
    rd.querySelector('.ja').textContent = `${weapon.ja}のスキン「${m.reward.ja}」`;
    const skin = rewardSkin(m);
    rd.querySelectorAll('.sk-swatch i').forEach((el, j) => (el.style.background = skin?.swatch[j] ?? ''));
    rd.querySelector('.go .ic').innerHTML = best ? CHECK : LOCK;
    rd.querySelector('.go em').textContent = best ? 'UNLOCKED' : 'LOCKED';
    rd.classList.toggle('got', !!best);
    detail.querySelector('.ch-note').textContent = `${ruleText(m)}。熟練度の XP は入らず、ステージの自己ベストにも残らない`;
}
// 見出しの概要: ルールの帯は中のミッションで共通なので最初のものから。もらえるスキンは中のミッション 1 つにつき 1 枚
function renderOverview(id) {
    const g = MISSION_GROUPS.find((x) => x.id === id);
    const ms = MISSIONS.map((m, i) => ({ m, i })).filter(({ m }) => m.group === id);
    const done = ms.filter(({ m }) => loadMission(m.id)).length;
    const name = overview.querySelector('.ch-name');
    name.textContent = g.name;
    name.dataset.text = g.name;
    overview.querySelector('.si-title span').textContent = g.ja;
    const state = overview.querySelector('.ch-state');
    state.textContent = done === ms.length ? 'ALL CLEARED' : `${done} / ${ms.length} CLEARED`;
    state.classList.toggle('done', done === ms.length);
    const first = ms[0].m;
    overview.querySelector('.ch-tag').textContent = ruleTag(first);
    overview.querySelector('[data-ch="stage"]').textContent = first.stage.toUpperCase();
    overview.querySelector('[data-ch="difficulty"]').textContent = first.difficulty.toUpperCase();
    overview.querySelector('[data-ch="progress"]').textContent = `${done} / ${ms.length}`;
    const skins = overview.querySelector('.ch-skins');
    skins.innerHTML = ms
        .map(({ m, i }, k) => {
        const got = !!loadMission(m.id);
        const w = weaponLabel(m.weapon);
        return `<button type="button" class="ch-skin${got ? ' got' : ''}" data-skin-mission="${i}" style="--i:${k}"><span class="sw-plate"><span class="ic"></span></span><span class="sw-name"><b class="nm">${w.name}</b><span class="ja">${w.ja}</span></span><span class="st">${got ? CHECK : LOCK}</span><span class="sk-swatch"><i></i><i></i><i></i></span></button>`;
    })
        .join('');
    skins.querySelectorAll('.ch-skin').forEach((b) => {
        const m = MISSIONS[Number(b.dataset.skinMission)];
        const icon = weaponIcon(m.weapon);
        if (icon)
            b.querySelector('.ic').append(icon);
        const sw = rewardSkin(m)?.swatch ?? [];
        b.querySelectorAll('.sk-swatch i').forEach((el, j) => (el.style.background = sw[j] ?? ''));
    });
    // 追加のご褒美: スキンをどれか need 個そろえると、カードのフレーム
    overview.classList.toggle('has-bonus', !!g.bonus);
    if (g.bonus) {
        const b = g.bonus;
        const got = groupDone(g.id) >= b.need;
        const slot = overview.querySelector('.ch-bonus');
        slot.classList.toggle('got', got);
        slot.querySelector('.ch-frame').innerHTML = partSwatch('plain', b.frame);
        slot.querySelector('.nm').textContent = b.name;
        slot.querySelector('.ja').textContent = `${first.reward.name} スキンをどれか ${b.need} つで、カードの${b.ja}`;
        slot.querySelector('.ch-bonus-n').textContent = `${Math.min(done, b.need)} / ${b.need}`;
        slot.querySelector('.go .ic').innerHTML = got ? CHECK : LOCK;
        slot.querySelector('.go em').textContent = got ? 'UNLOCKED' : 'LOCKED';
    }
    overview.querySelector('.ch-note').textContent = `${g.desc} 一覧から武器を選んで START。`;
}
function renderFeats() {
    featsPane.innerHTML = FEATS.map((f, i) => {
        const got = featDone(f.id);
        return `<div class="ch-feat${got ? ' got' : ''}" style="--i:${i}"><span class="ch-medal">${badgePlate(f)}${got ? '' : LOCK}</span><div><b>${f.name}<small>${f.ja}</small><em class="ch-reward">BADGE<i>${TIER_NAMES[f.tier - 1]}</i></em></b><p>${f.desc}</p></div></div>`;
    }).join('');
}
// 達成した数をタブの右肩に出す
function renderCounts() {
    const done = [MISSIONS.filter((m) => loadMission(m.id)).length, FEATS.filter((f) => featDone(f.id)).length];
    const all = [MISSIONS.length, FEATS.length];
    modeButtons.forEach((b, i) => (b.querySelector('.ch-count').textContent = `${done[i]}/${all[i]}`));
}
function showMode(m) {
    mode = m;
    root.dataset.mode = m;
    modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.chMode === m));
    kind.innerHTML = m === 'missions' ? 'SPECIAL<b>MISSIONS</b>' : 'ONE-RUN<b>FEATS</b>';
}
// 見出しが閉じていれば開いてから選ぶ（概要のスキンから選んだとき）
function selectMission(i) {
    const g = MISSIONS[i].group;
    if (!open.has(g)) {
        open.add(g);
        renderList();
    }
    index = i;
    cursor = rows.findIndex((r) => 'mission' in r && r.mission === i);
    markRows();
    renderDetail();
}
// 開くたびに記録を読み直す（ミッションから戻ったときに達成を出すため）
export function openChallengeTab() {
    overlay.classList.add('select-challenge');
    renderList();
    renderDetail();
    renderFeats();
    renderCounts();
    showMode(mode);
}
export function closeChallengeTab() {
    overlay.classList.remove('select-challenge');
    hideRewardTip();
}
// 押したものがチャレンジのタブの中なら受け持つ（乗ったときに鳴らしているので、押しても鳴らさない）
export function onChallengeClick(target) {
    const modeButton = target.closest('[data-ch-mode]');
    if (modeButton) {
        if (modeButton.dataset.chMode !== mode)
            showMode(modeButton.dataset.chMode);
        return;
    }
    const group = target.closest('[data-group]');
    if (group)
        return toggleGroup(group.dataset.group);
    const row = target.closest('[data-mission]');
    if (row) {
        const i = Number(row.dataset.mission);
        if (i !== index || root.dataset.view === 'group')
            selectMission(i);
        return;
    }
    const skin = target.closest('[data-skin-mission]');
    if (skin)
        return selectMission(Number(skin.dataset.skinMission));
    if (target.closest('[data-action="challenge-start"]')) {
        hideRewardTip();
        onStart(MISSIONS[index]);
    }
}
// 上下で行を選び（端で止まる）、左右で MISSIONS / FEATS を替え、Enter で見出しなら開け閉め・ミッションなら START
export function onChallengeKey(e) {
    const side = { ArrowLeft: 'missions', ArrowRight: 'feats' }[e.code];
    if (side) {
        e.preventDefault();
        if (side !== mode) {
            sfx.playUiHover();
            showMode(side);
        }
        return;
    }
    if (mode !== 'missions')
        return;
    const dir = { ArrowUp: -1, ArrowDown: 1 }[e.code];
    if (dir) {
        e.preventDefault();
        const j = cursor + dir;
        if (j < 0 || j >= rows.length)
            return sfx.playUiDenied();
        sfx.playUiHover();
        const r = rows[j];
        if ('mission' in r)
            return selectMission(r.mission);
        cursor = j;
        return markRows();
    }
    if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        const r = rows[cursor];
        if (r && 'group' in r) {
            sfx.playUiSelect();
            return toggleGroup(r.group);
        }
        onStart(MISSIONS[index]);
    }
}
// ---- ご褒美の見本 ----
// ご褒美の枠にカーソルを合わせると、その上にロードマップのご褒美と同じ札（.lv-tip）を出し、スキンを着せた武器を明るい台で回して見せる
const rewardSkin = (m) => SKINS.find((s) => s.id === m.reward.skin && (!s.weapons || s.weapons.includes(m.weapon)));
const tip = overlay.appendChild(Object.assign(document.createElement('div'), { className: 'lv-tip ch-tip' }));
const rewardSlot = detail.querySelector('[data-ch="reward"]');
function showRewardTip(m, anchor) {
    const skin = rewardSkin(m);
    if (!skin)
        return;
    const got = !!loadMission(m.id);
    tip.innerHTML =
        `<header><b>${skin.name}</b><span>${skin.ja}</span><em>${got ? 'UNLOCKED' : 'LOCKED'}</em></header>` +
            `<div class="sk-stage lv-tip-skin"><span class="sk-tag"><i></i>PREVIEW</span><span class="sk-feats">${skinTagsHtml(skin)}</span></div>` +
            `<p class="lv-tip-req">${weaponLabel(m.weapon).ja}で達成するとアンロック</p>`;
    tip.querySelector('.lv-tip-skin').prepend(startSkinSpin(m.weapon, skin));
    tip.classList.add('on');
    const r = anchor.getBoundingClientRect();
    const gap = 10;
    let top = r.top - tip.offsetHeight - gap;
    if (top < gap)
        top = r.bottom + gap;
    tip.style.left = `${Math.min(Math.max(gap, r.left + r.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - gap)}px`;
    tip.style.top = `${top}px`;
}
function hideRewardTip() {
    if (!tip.classList.contains('on'))
        return;
    tip.classList.remove('on');
    stopSkinSpin();
}
rewardSlot.addEventListener('mouseenter', () => showRewardTip(MISSIONS[index], rewardSlot));
rewardSlot.addEventListener('mouseleave', hideRewardTip);
// 概要のスキンの一覧: 乗っている 1 枚の見本を出す
let tipSkin = null;
overview.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.ch-skin');
    if (b === tipSkin)
        return;
    tipSkin = b;
    if (!b)
        return hideRewardTip();
    showRewardTip(MISSIONS[Number(b.dataset.skinMission)], b);
});
overview.addEventListener('mouseleave', () => {
    tipSkin = null;
    hideRewardTip();
});

import * as THREE from 'three';
import { camera, scene } from './core.js?v=e316db84';
import { game } from './game/state.js?v=e316db84';
import { keys, padMove } from './input.js?v=e316db84';
import * as sfx from './audio.js?v=e316db84';
import { CONTROL_ICONS, faceIcon } from './ui/controlsHud.js?v=e316db84';
import { SWORD_CHARGE_SLASH, SWORD_COMBO, SWORD_ISSEN } from './weapons/swordAttacks.js?v=e316db84';
import { swordState } from './weapons/swordCombat.js?v=e316db84';
import { player, position, velocity } from './player/state.js?v=e316db84';
import { padState } from './player/padControls.js?v=e316db84';
import { SPRINT_SPEED } from './player/config.js?v=e316db84';
const keyCap = (label) => `<span class="tg-key">${label}</span>`;
const held = (...codes) => () => codes.some((c) => keys.has(c));
const key = (label, ...codes) => ({ icon: keyCap(label), on: held(...codes) });
// スティック: 倒す向きに矢印を添える
const stickIcon = (label, arrow = '') => `<svg viewBox="0 0 24 24"><circle class="o" cx="12" cy="12" r="10.5"/><circle class="f" cx="12" cy="12" r="6"/><text class="t inv" x="12" y="12.5">${label}</text>` +
    (arrow === 'up' ? '<path class="f" d="M12 -5 L8 -1 H16 Z"/>' : '') + '</svg>';
const mouseMoveIcon = () => `<svg viewBox="0 0 36 28"><rect class="o" x="9" y="1" width="18" height="26" rx="9"/><path class="o" d="M18 1 V11 M9 11 H27"/>` +
    '<path class="f" d="M1 14 L5 10 V18 Z M35 14 L31 10 V18 Z"/></svg>';
let lookMoved = false; // このフレームで視点が動いたか
const lookChip = { icon: mouseMoveIcon(), on: () => lookMoved };
const rStickChip = { icon: stickIcon('R'), on: () => lookMoved };
const lStickChip = { icon: stickIcon('L'), on: () => Math.hypot(padMove.x, padMove.y) > 0.2 };
const lStickRun = { icon: stickIcon('L', 'up'), note: 'DEEP', on: () => padState.padSprint };
const lStickFwd = { icon: stickIcon('L', 'up'), note: 'HOLD', on: () => padMove.y > 0.5 };
const padA = { icon: faceIcon('down'), on: held('Space') };
const space = key('Space', 'Space');
const shift = key('Shift', 'ShiftLeft', 'ShiftRight');
// ---- 課題 ----
// 足場に着地する、通路をくぐるなど、コースを進むと次の説明に切り替える。
// hint は何度か落ちたとき、またはしばらく進めないときに出すコツ
const steps = [
    { title: '視点を動かす', pc: 'マウスを動かして、周りを見回そう', pad: '右スティックで、周りを見回そう', pcKeys: [lookChip], padKeys: [rStickChip], hint: '', z: 0, y: 5 },
    {
        title: '移動する', pc: '赤い輪の中まで歩こう', pad: '赤い輪の中まで歩こう',
        pcKeys: [key('W', 'KeyW'), key('A', 'KeyA'), key('S', 'KeyS'), key('D', 'KeyD')], padKeys: [lStickChip],
        hint: '次に向かう所は、いつも赤い輪と画面の印で示します', z: -8, y: 5,
    },
    {
        title: 'ジャンプ', pc: '段差に向かって跳び、上の足場へ登ろう', pad: '段差に向かって跳び、上の足場へ登ろう',
        pcKeys: [space], padKeys: [padA],
        hint: '縁に向かって前を押したまま跳ぶと、手をかけてよじ登れます', z: -17, y: 8.8,
    },
    {
        title: '二段ジャンプ', pc: '跳んで、上昇が止まる頃に空中でもう一度跳ぼう', pad: '跳んで、上昇が止まる頃に空中でもう一度跳ぼう',
        pcKeys: [space, '→', space], padKeys: [padA, '→', padA],
        hint: '早く押しすぎると高さが足りません。一番高い所で 2 回目を押そう', z: -27, y: 13.4,
    },
    {
        title: 'ダッシュ', pc: '走って縁に近づき、ダッシュで向こうの足場へ渡ろう', pad: '走って縁に近づき、ダッシュで向こうの足場へ渡ろう',
        pcKeys: [shift], padKeys: [{ icon: stickIcon('L'), note: 'PUSH', on: held('ShiftLeft') }],
        hint: 'ダッシュは続けて 2 回まで使えます。縁の手前で 1 回、空中でもう 1 回', z: -56, y: 13.4,
    },
    {
        title: 'スライディング', pc: '走りながら押し続けて、低い門をくぐろう', pad: '走りながら押し続けて、低い門をくぐろう',
        pcKeys: [shift, '+', { ...key('C', 'KeyC'), note: 'HOLD' }], padKeys: [lStickRun, '+', { icon: faceIcon('right'), note: 'HOLD', on: held('KeyC') }],
        hint: '勢いがあるほど遠くまで滑れます。門の少し手前から滑り始めよう', z: -79, y: 13.4,
    },
    {
        title: '壁走り', pc: '左の壁に寄って跳び、前に進み続けよう。ここではダッシュは使えません', pad: '左の壁に寄って跳び、前に進み続けよう。ここではダッシュは使えません',
        pcKeys: [space, '→', { ...key('W', 'KeyW'), note: 'HOLD' }], padKeys: [padA, '→', lStickFwd],
        hint: '壁に斜めに飛びつくと走り始めます。走っている間は前を押し続けよう', z: -124, y: 13.4,
    },
];
const checkpoints = [
    { x: 0, z: 4, y: 5 }, { x: 0, z: 4, y: 5 }, { x: 0, z: -9, y: 5 },
    { x: 0, z: -19, y: 8.8 }, { x: 0, z: -35, y: 13.4 }, { x: 0, z: -66, y: 13.4 },
    { x: -3.65, z: -86, y: 13.4 },
];
const WALLRUN_STEP = steps.findIndex((s) => s.title === '壁走り');
const HINT_FALLS = 2; // この回数落ちたらコツを出す
const HINT_TIME = 20; // この時間進めなくてもコツを出す
const CLEAR_TIME = 0.8; // 課題をこなしてから次の説明に変えるまで
const FINISH_TIME = 1.6; // 全部こなしてから武器選びを開くまで
const TOAST_TIME = 2;
// ---- 案内の枠 ----
// 課題の説明は左の中ほど（上の足場を見上げても隠れない）。押す入力・CLEAR・やり直しの知らせは、目線の集まる照準の下に出す
const hud = document.getElementById('hud');
const panel = document.createElement('div');
panel.id = 'tutorial-guide';
panel.setAttribute('aria-live', 'polite');
panel.hidden = true;
panel.innerHTML =
    '<div class="tg-head"><span class="tg-kicker"></span><span class="tg-count"></span></div><div class="tg-steps"></div>' +
        '<strong class="tg-title"></strong><p class="tg-text"></p><p class="tg-hint" hidden><b>コツ</b><span></span></p>';
hud.appendChild(panel);
const prompt = document.createElement('div');
prompt.id = 'tutorial-keys';
prompt.hidden = true;
prompt.innerHTML = '<p class="tg-toast" hidden></p><div class="tg-chips"></div><span class="tg-ok">CLEAR</span>';
hud.appendChild(prompt);
const $ = (root, sel) => root.querySelector(sel);
const kickerEl = $(panel, '.tg-kicker'), stepsEl = $(panel, '.tg-steps'), countEl = $(panel, '.tg-count');
const titleEl = $(panel, '.tg-title'), textEl = $(panel, '.tg-text');
const hintEl = $(panel, '.tg-hint'), hintText = $(panel, '.tg-hint span');
const chipsEl = $(prompt, '.tg-chips'), toastEl = $(prompt, '.tg-toast');
let chipEls = [];
// 次に向かう所: 画面の中なら輪の上に、外なら画面の縁に、向きの矢印と距離を出す
const waypoint = document.createElement('div');
waypoint.id = 'tutorial-waypoint';
waypoint.hidden = true;
waypoint.innerHTML = '<svg viewBox="0 0 20 20"><path class="tw-dia" d="M10 2 L18 10 L10 18 L2 10 Z"/><path class="tw-arrow" d="M4 4 H16 V16"/></svg><span></span>';
document.body.appendChild(waypoint);
const waypointIcon = waypoint.querySelector('svg');
const waypointText = waypoint.querySelector('span');
const EDGE = 0.86; // 画面の縁に寄せるときの位置（画面の半分を 1 として）
const markerMat = new THREE.MeshBasicMaterial({ color: 0xe52828, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
const marker = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 48), markerMat);
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
// 輪から立ち上る薄い光の柱。下の段や遠くからでも行き先が見える
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 7, 32, 1, true).translate(0, 3.5, 0), new THREE.MeshBasicMaterial({ color: 0xe52828, side: THREE.DoubleSide, transparent: true, opacity: 0.1, depthWrite: false }));
beam.visible = false;
scene.add(beam);
let step = 0;
let active = false;
let weaponPractice = false;
let swordStep = -1;
let swordGuideKey = '';
let lastPad = false;
let stepTime = 0; // 今の課題を始めてからの時間
let falls = 0; // 今の課題で落ちた回数
let clearT = -1; // 課題をこなしてからの時間。-1 = こなしていない
let finishT = -1; // 全部こなしてからの時間
let toastT = -1;
let pulse = 0;
const startView = new THREE.Quaternion();
const lastView = new THREE.Quaternion();
const projected = new THREE.Vector3();
function renderChips(list) {
    chipEls = [];
    chipsEl.innerHTML = '';
    chipsEl.hidden = list.length === 0;
    for (const c of list) {
        const el = document.createElement('span');
        if (typeof c === 'string') {
            el.className = 'tg-sep';
            el.textContent = c;
        }
        else {
            el.className = 'tg-chip';
            el.innerHTML = c.icon + (c.note ? `<small>${c.note}</small>` : '');
            chipEls.push({ el, chip: c });
        }
        chipsEl.appendChild(el);
    }
}
// 進み具合の目盛り: こなした分は赤、今の課題は白く点滅させる
function renderProgress(total, now) {
    stepsEl.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < now ? 'done' : i === now ? 'now' : ''}"></i>`).join('');
    countEl.textContent = now >= total ? 'COMPLETE' : `${String(now + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}
// 説明が変わったときは、枠を少し動かして目を引く
function replay() {
    for (const el of [panel, prompt]) {
        el.classList.remove('enter');
        void el.offsetWidth;
        el.classList.add('enter');
    }
}
function setHint(text) {
    hintEl.hidden = !text;
    hintText.textContent = text;
}
function showToast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastT = 0;
}
function setClear(on) {
    panel.classList.toggle('clear', on);
    prompt.classList.toggle('clear', on);
}
function showStep() {
    setClear(false);
    lastPad = game.usingPad;
    kickerEl.textContent = 'MOVEMENT';
    renderProgress(steps.length, step);
    if (step >= steps.length) {
        marker.visible = beam.visible = false;
        waypoint.hidden = true;
        titleEl.textContent = 'キャラコン完了';
        textEl.textContent = 'おつかれさま。次は武器を選んで、的で練習しよう。';
        renderChips([]);
        setHint('');
        return;
    }
    const item = steps[step];
    titleEl.textContent = item.title;
    textEl.textContent = game.usingPad ? item.pad : item.pc;
    renderChips(game.usingPad ? item.padKeys : item.pcKeys);
    setHint(falls >= HINT_FALLS || stepTime >= HINT_TIME ? item.hint : '');
    marker.visible = beam.visible = step > 0;
    marker.position.set(0, item.y + 0.03, item.z);
    beam.position.set(0, item.y, item.z);
}
export function startTutorial() {
    active = true;
    weaponPractice = false;
    swordStep = -1;
    step = 0;
    stepTime = falls = 0;
    clearT = finishT = toastT = -1;
    toastEl.hidden = true;
    startView.copy(camera.quaternion);
    lastView.copy(camera.quaternion);
    panel.hidden = prompt.hidden = false;
    document.body.classList.add('in-tutorial');
    showStep();
    replay();
}
// ほかのステージに入るときに、案内を片付ける
export function stopTutorial() {
    active = false;
    panel.hidden = prompt.hidden = waypoint.hidden = true;
    marker.visible = beam.visible = false;
    document.body.classList.remove('in-tutorial');
}
// 壁走りの課題の間は、ダッシュとスライディングの加速を使えなくし、地上では走る速さより速くしない。
// 勢いを付けて跳ぶだけで切れ目を越えられないようにする
function lockBoosts() {
    player.dashCharges = 0;
    player.dashRecharge = 0;
    player.slideBoostCooldown = 1;
    if (!player.onGround)
        return;
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > SPRINT_SPEED) {
        velocity.x *= SPRINT_SPEED / speed;
        velocity.z *= SPRINT_SPEED / speed;
    }
}
function updateWaypoint() {
    if (!marker.visible || clearT >= 0) {
        waypoint.hidden = true;
        return;
    }
    const dist = Math.hypot(position.x - marker.position.x, position.z - marker.position.z);
    if (dist < 3) {
        waypoint.hidden = true;
        return;
    }
    waypoint.hidden = false;
    camera.updateMatrixWorld();
    projected.set(marker.position.x, marker.position.y + 1.2, marker.position.z).project(camera);
    let { x, y } = projected;
    const behind = projected.z > 1;
    if (behind) {
        x = -x;
        y = -y;
    }
    const out = behind || Math.abs(x) > EDGE || Math.abs(y) > EDGE;
    if (out) {
        // 画面の真ん中から印への向きのまま、縁まで寄せる
        const k = EDGE / Math.max(Math.abs(x), Math.abs(y), 1e-4);
        x *= k;
        y *= k;
    }
    waypoint.classList.toggle('edge', out);
    waypointIcon.style.transform = out ? `rotate(${Math.atan2(-y, x) + Math.PI / 4}rad)` : '';
    waypoint.style.left = `${(x * 0.5 + 0.5) * innerWidth}px`;
    waypoint.style.top = `${(-y * 0.5 + 0.5) * innerHeight}px`;
    waypointText.textContent = `${Math.round(dist)} m`;
}
// dt は止まっていない実時間。全部こなして少し待ったら、一度だけ true を返す
export function updateTutorial(dt) {
    if (!active)
        return false;
    lookMoved = lastView.angleTo(camera.quaternion) > 1e-4;
    lastView.copy(camera.quaternion);
    for (const { el, chip } of chipEls)
        el.classList.toggle('on', chip.on());
    pulse += dt;
    const s = 1 + Math.sin(pulse * 4) * 0.06;
    marker.scale.set(s, s, 1);
    markerMat.opacity = 0.7 + Math.sin(pulse * 4) * 0.15;
    if (toastT >= 0 && (toastT += dt) > TOAST_TIME) {
        toastT = -1;
        toastEl.hidden = true;
    }
    // 下の床に落ちたら、今の課題の手前から何度でもやり直せる。何度か落ちたらコツを出す
    if (position.y < 1) {
        const checkpoint = weaponPractice ? { x: 0, y: 13.4, z: -125 } : checkpoints[Math.min(step, checkpoints.length - 1)];
        position.set(checkpoint.x, checkpoint.y, checkpoint.z);
        velocity.set(0, 0, 0);
        player.onGround = true;
        player.airJump = true;
        player.dashTime = 0;
        player.sliding = false;
        player.mantleTime = -1;
        player.wallRunning = false;
        player.hasLastWall = false;
        if (!weaponPractice && step < steps.length) {
            falls++;
            showToast('少し手前に戻しました。何度でも挑戦できます');
            if (falls === HINT_FALLS)
                setHint(steps[step].hint);
        }
    }
    if (step >= steps.length) {
        if (weaponPractice && swordStep >= 0)
            updateSwordTutorial();
        if (finishT < 0)
            return false;
        finishT += dt;
        if (finishT < FINISH_TIME)
            return false;
        finishT = -1;
        return true;
    }
    updateWaypoint();
    // こなした課題は少しの間「CLEAR」を見せてから、次の説明に変える
    if (clearT >= 0) {
        clearT += dt;
        if (clearT < CLEAR_TIME)
            return false;
        clearT = -1;
        step++;
        stepTime = falls = 0;
        toastEl.hidden = true;
        showStep();
        replay();
        if (step >= steps.length)
            finishT = 0;
        return false;
    }
    if (lastPad !== game.usingPad)
        showStep();
    stepTime += dt;
    const item = steps[step];
    if (step === WALLRUN_STEP)
        lockBoosts();
    if (stepTime >= HINT_TIME && hintEl.hidden && item.hint)
        setHint(item.hint);
    const atMarker = Math.hypot(position.x, position.z - item.z) < 2 && player.onGround && Math.abs(position.y - item.y) < 0.3;
    const done = step === 0 ? startView.angleTo(camera.quaternion) > 0.3 : atMarker;
    if (done) {
        clearT = 0;
        setClear(true);
        renderProgress(steps.length, step + 1);
        marker.visible = beam.visible = false;
        sfx.playRing(1.25, 1.4, 0.5);
    }
    return false;
}
// ---- 武器の練習 ----
export function startWeaponTutorial(id) {
    weaponPractice = true;
    document.body.classList.remove('in-tutorial');
    setClear(false);
    setHint('');
    toastEl.hidden = true;
    if (id === 'sword') {
        swordStep = 0;
        swordGuideKey = '';
        updateSwordTutorial();
        replay();
        return;
    }
    const names = { kunai: 'クナイ', handgun: 'リボルバー', sword: '刀', sickle: '鎖鎌', axe: 'バトルアックス', bow: '弓', bat: 'バット', spear: '槍', rifle: 'スナイパーライフル' };
    kickerEl.textContent = 'WEAPON';
    stepsEl.innerHTML = countEl.textContent = '';
    titleEl.textContent = `${names[id]}の練習`;
    textEl.textContent = '目の前の的に向かって、右に並んだ操作を試そう。';
    renderChips([]);
    setHint(id === 'bow' ? '弓は攻撃ボタンを押し続けてから離すと射てます' : '');
    replay();
}
const attackChip = (note) => ({ icon: CONTROL_ICONS.attack[game.usingPad ? 1 : 0], note, on: () => game.attackHeld });
const aimChip = () => ({ icon: CONTROL_ICONS.aim[game.usingPad ? 1 : 0], on: () => swordState.focusing });
const swordLessons = [
    { title: '斬り', pc: '的に近づいて、斬りを当てよう', pad: '的に近づいて、斬りを当てよう', keys: () => [attackChip()] },
    { title: '溜め斬り', pc: '長押しで溜め、溜まったら離して的を斬ろう', pad: '長押しで溜め、溜まったら離して的を斬ろう', keys: () => [attackChip('HOLD')] },
    { title: '居合ゲージ', pc: '的を攻撃して、居合ゲージを満タンにしよう', pad: '的を攻撃して、居合ゲージを満タンにしよう', keys: () => [attackChip()] },
    { title: '一閃', pc: '構えて的に照準を合わせ、斬りで一閃を放とう', pad: '構えて的に照準を合わせ、斬りで一閃を放とう', keys: () => [aimChip(), '→', attackChip()] },
];
function updateSwordTutorial() {
    if (swordStep === 2 && swordState.focusCharge >= 1)
        swordStep++;
    const refill = swordStep === 3 && swordState.focusCharge < 1 && !swordState.focusing && swordState.rushTime < 0 && swordState.swordAttack !== SWORD_ISSEN;
    const guideKey = `${swordStep}:${game.usingPad}:${refill}`;
    if (guideKey === swordGuideKey)
        return;
    const advanced = !swordGuideKey.startsWith(`${swordStep}:`) && swordGuideKey !== '';
    swordGuideKey = guideKey;
    kickerEl.textContent = 'SWORD';
    renderProgress(swordLessons.length, swordStep);
    if (advanced) {
        sfx.playRing(1.25, 1.4, 0.5);
        replay();
    }
    if (swordStep >= swordLessons.length) {
        titleEl.textContent = '刀の練習完了';
        textEl.textContent = '引き続き、的で自由に練習できます。';
        renderChips([]);
        setHint('');
        toastEl.textContent = 'Esc / START で一時停止し、TITLE から戻れます';
        toastEl.hidden = false;
        return;
    }
    const lesson = swordLessons[swordStep];
    titleEl.textContent = lesson.title;
    textEl.textContent = game.usingPad ? lesson.pad : lesson.pc;
    renderChips(lesson.keys());
    setHint(refill ? 'ゲージが空のときは、もう一度的を攻撃して溜めよう' : '');
}
// 振るだけではなく、練習用の的に技が当たったときに進める。
export function noteTutorialSwordHit(def) {
    if (!weaponPractice || swordStep < 0)
        return;
    if (swordStep === 0 && SWORD_COMBO.some((attack) => attack === def))
        swordStep++;
    else if (swordStep === 1 && def === SWORD_CHARGE_SLASH)
        swordStep++;
    else if (swordStep === 3 && def === SWORD_ISSEN)
        swordStep++;
    updateSwordTutorial();
}

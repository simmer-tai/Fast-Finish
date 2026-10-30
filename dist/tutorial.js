import * as THREE from 'three';
import { camera, scene } from './core.js';
import { game } from './game/state.js';
import { SWORD_CHARGE_SLASH, SWORD_COMBO, SWORD_ISSEN } from './weapons/swordAttacks.js';
import { swordState } from './weapons/swordCombat.js';
import { player, position, velocity } from './player/state.js';
// 足場に着地する、通路をくぐるなど、コースを進むと次の説明に切り替える。
const steps = [
    { title: '視点を動かす', pc: 'マウスを動かして周りを見よう', pad: '右スティックで周りを見よう', z: 0, y: 5 },
    { title: '移動する', pc: 'W A S D で光る目印まで進もう', pad: '左スティックで光る目印まで進もう', z: -8, y: 5 },
    { title: 'ジャンプ', pc: 'スペースキーで跳び、高い足場へ登ろう', pad: 'A ボタンで跳び、高い足場へ登ろう', z: -17, y: 8.8 },
    { title: '二段ジャンプ', pc: '足場に向かって跳び、上昇が止まる頃にもう一度スペースキーを押そう', pad: '足場に向かって跳び、上昇が止まる頃にもう一度 A を押そう', z: -27, y: 13.4 },
    { title: 'ダッシュ', pc: '走って縁に近づき、Shift で向こうの足場までダッシュしよう', pad: '走って縁に近づき、左スティックを押し込んで向こうへ渡ろう', z: -56, y: 13.4 },
    { title: 'スライディング', pc: 'Shift で走りながら C を押し続け、低い通路をくぐろう', pad: '左スティックを深く倒して走り、B を押し続けてくぐろう', z: -79, y: 13.4 },
    { title: '壁走り', pc: '左の壁に体を寄せて走り、スペースで跳んだら W を押し続けよう', pad: '左の壁に体を寄せて走り、A で跳んだら前に進み続けよう', z: -115, y: 13.4 },
];
const checkpoints = [
    { x: 0, z: 4, y: 5 }, { x: 0, z: 4, y: 5 }, { x: 0, z: -9, y: 5 },
    { x: 0, z: -19, y: 8.8 }, { x: 0, z: -35, y: 13.4 }, { x: 0, z: -66, y: 13.4 },
    { x: -3.65, z: -86, y: 13.4 },
];
const panel = document.createElement('div');
panel.id = 'tutorial-guide';
panel.setAttribute('aria-live', 'polite');
panel.hidden = true;
document.body.appendChild(panel);
const marker = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 48), new THREE.MeshBasicMaterial({ color: 0xe52828, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
let step = 0;
let active = false;
let weaponPractice = false;
let swordStep = -1;
let swordGuideKey = '';
let lastPad = false;
const startView = new THREE.Quaternion();
function showStep() {
    if (step >= steps.length) {
        marker.visible = false;
        panel.innerHTML = '<small>TUTORIAL / MOVEMENT</small><strong>キャラコン完了</strong><span>次は武器を選んで練習します。</span>';
        return;
    }
    const item = steps[step];
    panel.innerHTML = `<small>TUTORIAL / ${String(step + 1).padStart(2, '0')} — ${steps.length}</small><strong>${item.title}</strong><span>${game.usingPad ? item.pad : item.pc}</span>${step >= 2 ? '<span class="tutorial-next">落ちても手前からやり直せます</span>' : ''}`;
    lastPad = game.usingPad;
    marker.visible = step > 0;
    marker.position.set(0, item.y + 0.03, item.z);
}
export function startTutorial() {
    active = true;
    weaponPractice = false;
    swordStep = -1;
    step = 0;
    startView.copy(camera.quaternion);
    panel.hidden = false;
    document.body.classList.add('in-tutorial');
    showStep();
}
export function updateTutorial() {
    if (!active)
        return;
    // 下の床に落ちたら、今の課題の手前から何度でもやり直せる。
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
    }
    if (step >= steps.length) {
        if (weaponPractice && swordStep >= 0)
            updateSwordTutorial();
        return;
    }
    if (lastPad !== game.usingPad)
        showStep();
    const item = steps[step];
    const atMarker = Math.hypot(position.x, position.z - item.z) < 2 && player.onGround && Math.abs(position.y - item.y) < 0.3;
    const done = step === 0 ? startView.angleTo(camera.quaternion) > 0.3 : atMarker;
    if (done) {
        step++;
        showStep();
        return step === steps.length;
    }
}
export function startWeaponTutorial(id) {
    weaponPractice = true;
    document.body.classList.remove('in-tutorial');
    if (id === 'sword') {
        swordStep = 0;
        swordGuideKey = '';
        updateSwordTutorial();
        return;
    }
    const names = { kunai: 'クナイ', handgun: 'リボルバー', sword: '刀', sickle: '鎖鎌', axe: 'バトルアックス', bow: '弓', bat: 'バット', spear: '槍' };
    panel.innerHTML = `<small>TUTORIAL / WEAPON</small><strong>${names[id]}の練習</strong><span>目の前の的に向かって、攻撃や右側の操作を試そう。</span>${id === 'bow' ? '<span class="tutorial-next">弓は攻撃ボタンを押し続けてから離すと射てます。</span>' : ''}`;
}
const swordLessons = [
    { title: '斬り', pc: '的に近づき、左クリックで斬りを当てよう', pad: '的に近づき、ZR で斬りを当てよう' },
    { title: '溜め斬り', pc: '左クリックを長押しし、溜まったら離して的を斬ろう', pad: 'ZR を長押しし、溜まったら離して的を斬ろう' },
    { title: '居合ゲージ', pc: '的を攻撃して、居合ゲージを満タンにしよう', pad: '的を攻撃して、居合ゲージを満タンにしよう' },
    { title: '一閃', pc: '右クリックで構え、的に照準を合わせて左クリック', pad: 'ZL で構え、的に照準を合わせて ZR' },
];
function updateSwordTutorial() {
    if (swordStep === 2 && swordState.focusCharge >= 1)
        swordStep++;
    const refill = swordStep === 3 && swordState.focusCharge < 1 && !swordState.focusing && swordState.rushTime < 0 && swordState.swordAttack !== SWORD_ISSEN;
    const key = `${swordStep}:${game.usingPad}:${refill}`;
    if (key === swordGuideKey)
        return;
    swordGuideKey = key;
    if (swordStep >= swordLessons.length) {
        panel.innerHTML = '<small>TUTORIAL / SWORD</small><strong>刀の練習完了</strong><span>引き続き、的で自由に練習できます。</span><span>Esc / START で一時停止し、TITLE から戻れます。</span>';
        return;
    }
    const lesson = swordLessons[swordStep];
    panel.innerHTML = `<small>TUTORIAL / SWORD ${swordStep + 1} — ${swordLessons.length}</small><strong>${lesson.title}</strong><span>${game.usingPad ? lesson.pad : lesson.pc}</span>${refill ? '<span class="tutorial-next">ゲージが空のときは、もう一度的を攻撃して溜めよう。</span>' : ''}`;
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

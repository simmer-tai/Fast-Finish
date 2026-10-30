import * as THREE from 'three';
import { camera, scene } from './core.js';
import { game } from './game/state.js';
import { player, position } from './player/state.js';
// 各操作を実際に行ってから、次の目印へ進む。
const steps = [
    { title: '視点を動かす', pc: 'マウスを動かして周りを見よう', pad: '右スティックで周りを見よう', z: 0 },
    { title: '移動する', pc: 'W A S D で光る目印まで進もう', pad: '左スティックで光る目印まで進もう', z: -8 },
    { title: 'ジャンプ', pc: 'スペースキーでジャンプして、台の上に乗ろう', pad: 'A ボタンでジャンプして、台の上に乗ろう', z: -15.5 },
    { title: '二段ジャンプ', pc: '空中でもう一度スペースキーを押そう', pad: '空中でもう一度 A ボタンを押そう', z: -26 },
    { title: 'ダッシュ', pc: '移動しながら Shift を押してダッシュしよう', pad: '移動しながら左スティックを押し込もう', z: -38 },
    { title: 'スライディング', pc: '走りながら C を押し続けよう', pad: '走りながら B ボタンを押し続けよう', z: -52 },
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
let didAction = false;
let lastPad = false;
const startView = new THREE.Quaternion();
function showStep() {
    didAction = false;
    if (step >= steps.length) {
        marker.visible = false;
        panel.innerHTML = '<small>TUTORIAL / MOVEMENT</small><strong>キャラコン完了</strong><span>基本操作の練習はここまで。引き続き自由に動けます。</span><span>Esc / START で一時停止し、TITLE から戻れます。</span>';
        return;
    }
    const item = steps[step];
    panel.innerHTML = `<small>TUTORIAL / ${String(step + 1).padStart(2, '0')} — ${steps.length}</small><strong>${item.title}</strong><span>${game.usingPad ? item.pad : item.pc}</span>${step >= 3 ? '<span class="tutorial-next">操作したら、光る目印まで進もう</span>' : ''}`;
    lastPad = game.usingPad;
    marker.visible = step > 0;
    marker.position.set(0, step === 2 ? 0.82 : 0.03, item.z);
    startView.copy(camera.quaternion);
}
export function startTutorial() {
    active = true;
    step = 0;
    panel.hidden = false;
    document.body.classList.add('in-tutorial');
    showStep();
}
export function updateTutorial() {
    if (!active || step >= steps.length)
        return;
    if (lastPad !== game.usingPad) {
        const action = didAction;
        showStep();
        didAction = action;
    }
    const item = steps[step];
    if (step === 0)
        didAction = startView.angleTo(camera.quaternion) > 0.3;
    if (step === 2 && !player.onGround && position.y > 0.15)
        didAction = true;
    if (step === 3 && !player.airJump && !player.onGround)
        didAction = true;
    if (step === 4 && player.dashTime > 0)
        didAction = true;
    if (step === 5 && player.sliding)
        didAction = true;
    const atMarker = Math.hypot(position.x, position.z - item.z) < 2;
    const done = step === 0 ? didAction : step === 1 ? atMarker : step === 2 ? didAction && atMarker && player.onGround && position.y > 0.7 : didAction && atMarker;
    if (done) {
        step++;
        showStep();
    }
}

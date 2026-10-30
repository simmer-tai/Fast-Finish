import * as THREE from 'three';
import { camera, scene } from './core.js';
import { game } from './game/state.js';
import { player, position } from './player/state.js';
import { blocks } from './world/blocks.js';
// 各操作を実際に行ってから、次の目印へ進む。
const steps = [
    { title: '視点を動かす', pc: 'マウスを動かして周りを見よう', pad: '右スティックで周りを見よう', z: 0 },
    { title: '移動する', pc: 'W A S D で光る目印まで進もう', pad: '左スティックで光る目印まで進もう', z: -8 },
    { title: 'ジャンプ', pc: 'スペースキーでジャンプして、台の上に乗ろう', pad: 'A ボタンでジャンプして、台の上に乗ろう', z: -15.5 },
    { title: '二段ジャンプ', pc: '目印の近くで、空中でもう一度スペースキーを押そう', pad: '目印の近くで、空中でもう一度 A ボタンを押そう', z: -26 },
    { title: 'ダッシュ', pc: '目印に向かって Shift でダッシュしよう', pad: '目印に向かって左スティックを押し込もう', z: -38 },
    { title: 'スライディング', pc: 'Shift で走りながら C を押し続けて、低い壁の下をくぐろう', pad: '左スティックを深く倒して走り、B を押し続けてくぐろう', z: -52 },
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
// 仕切りはコースの端から端まで塞ぐ。課題を終えるまでは飛び越えられない。
const gateZ = [1, -10, -19, -30, -42, -57];
const gates = [];
function createGates() {
    for (const z of gateZ) {
        const collider = { minX: -5, maxX: 5, minZ: z - 0.2, maxZ: z + 0.2, h: 12 };
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 0.4), new THREE.MeshLambertMaterial({ color: 0x303030 }));
        mesh.position.set(0, 6, z);
        scene.add(mesh);
        blocks.push(collider);
        gates.push({ mesh, collider });
    }
}
function openGate(index) {
    const gate = gates[index];
    if (!gate)
        return;
    scene.remove(gate.mesh);
    const at = blocks.indexOf(gate.collider);
    if (at >= 0)
        blocks.splice(at, 1);
}
function showStep() {
    didAction = false;
    if (step >= steps.length) {
        marker.visible = false;
        panel.innerHTML = '<small>TUTORIAL / MOVEMENT</small><strong>キャラコン完了</strong><span>基本操作の練習はここまで。引き続き自由に動けます。</span><span>Esc / START で一時停止し、TITLE から戻れます。</span>';
        return;
    }
    const item = steps[step];
    panel.innerHTML = `<small>TUTORIAL / ${String(step + 1).padStart(2, '0')} — ${steps.length}</small><strong>${item.title}</strong><span>${game.usingPad ? item.pad : item.pc}</span>${step >= 3 ? '<span class="tutorial-next">光る目印のところで操作しよう</span>' : ''}`;
    lastPad = game.usingPad;
    marker.visible = step > 0;
    marker.position.set(0, step === 2 ? 0.82 : 0.03, item.z);
    startView.copy(camera.quaternion);
}
export function startTutorial() {
    active = true;
    step = 0;
    createGates();
    panel.hidden = false;
    document.body.classList.add('in-tutorial');
    showStep();
}
export function updateTutorial() {
    if (!active || step >= steps.length)
        return;
    if (lastPad !== game.usingPad) {
        const action = didAction;
        const view = startView.clone();
        showStep();
        didAction = action;
        startView.copy(view);
    }
    const item = steps[step];
    if (step === 0)
        didAction = startView.angleTo(camera.quaternion) > 0.3;
    if (step === 2 && !player.onGround && position.y > 0.15)
        didAction = true;
    if (step === 3)
        didAction = !player.airJump && !player.onGround;
    if (step === 4)
        didAction = player.dashTime > 0;
    if (step === 5)
        didAction = position.z < -49.5 && position.z > -54 && position.y < 0.2 && player.sliding;
    const atMarker = Math.hypot(position.x, position.z - item.z) < 2;
    const done = step === 0 ? didAction : step === 1 ? atMarker : step === 2 ? didAction && atMarker && player.onGround && position.y > 0.7 : didAction && atMarker;
    if (done) {
        openGate(step);
        step++;
        showStep();
    }
}

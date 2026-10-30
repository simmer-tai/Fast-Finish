import * as THREE from 'three';
import { camera, scene } from './core.js';
import { game } from './game/state.js';
import { player, position, velocity } from './player/state.js';
// 足場に着地する、通路をくぐるなど、コースを進むと次の説明に切り替える。
const steps = [
    { title: '視点を動かす', pc: 'マウスを動かして周りを見よう', pad: '右スティックで周りを見よう', z: 0, y: 5 },
    { title: '移動する', pc: 'W A S D で光る目印まで進もう', pad: '左スティックで光る目印まで進もう', z: -8, y: 5 },
    { title: 'ジャンプ', pc: 'スペースキーで跳び、高い足場へ登ろう', pad: 'A ボタンで跳び、高い足場へ登ろう', z: -17, y: 8.8 },
    { title: '二段ジャンプ', pc: '足場に向かって跳び、上昇が止まる頃にもう一度スペースキーを押そう', pad: '足場に向かって跳び、上昇が止まる頃にもう一度 A を押そう', z: -27, y: 13.4 },
    { title: 'ダッシュ', pc: '走って縁に近づき、Shift で向こうの足場までダッシュしよう', pad: '走って縁に近づき、左スティックを押し込んで向こうへ渡ろう', z: -56, y: 13.4 },
    { title: 'スライディング', pc: 'Shift で走りながら C を押し続け、低い通路をくぐろう', pad: '左スティックを深く倒して走り、B を押し続けてくぐろう', z: -79, y: 13.4 },
];
const checkpoints = [
    { z: 4, y: 5 }, { z: 4, y: 5 }, { z: -9, y: 5 },
    { z: -19, y: 8.8 }, { z: -35, y: 13.4 }, { z: -66, y: 13.4 },
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
let lastPad = false;
const startView = new THREE.Quaternion();
function showStep() {
    if (step >= steps.length) {
        marker.visible = false;
        panel.innerHTML = '<small>TUTORIAL / MOVEMENT</small><strong>キャラコン完了</strong><span>基本操作の練習はここまで。引き続き自由に動けます。</span><span>Esc / START で一時停止し、TITLE から戻れます。</span>';
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
        const checkpoint = checkpoints[Math.min(step, checkpoints.length - 1)];
        position.set(0, checkpoint.y, checkpoint.z);
        velocity.set(0, 0, 0);
        player.onGround = true;
        player.airJump = true;
        player.dashTime = 0;
        player.sliding = false;
        player.mantleTime = -1;
        player.wallRunning = false;
    }
    if (step >= steps.length)
        return;
    if (lastPad !== game.usingPad)
        showStep();
    const item = steps[step];
    const atMarker = Math.hypot(position.x, position.z - item.z) < 2 && player.onGround && Math.abs(position.y - item.y) < 0.3;
    const done = step === 0 ? startView.angleTo(camera.quaternion) > 0.3 : atMarker;
    if (done) {
        step++;
        showStep();
    }
}

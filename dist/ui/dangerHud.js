import * as THREE from 'three';
import { camera } from '../core.js';
// ---- 危険の印 ----
// いまの位置のままだと当たる罠（足もとのレーザー・落下物・蒸気）を、画面の縁に危険の印と、来る向きを指す矢印で知らせる。
// 上から来る物（レーザー・落下物）は、どこを向いていても上の縁の真ん中に出して上を指す。
// 横から来る物（蒸気）の向きは、画面外の敵の印と同じ決め方（前にあれば画面の上下左右、後ろにあれば上から見下ろした向き）。
// 迫るほど濃く大きくなり、当たる直前は速く明滅する
const EDGE = 64; // 画面の縁からの距離 (px)
const NEAR = 0.7; // 迫り具合がこれを超えたら速く明滅させる
const ABOVE_GAP = 56; // 上から来る物が重なったときに、横へ並べる間隔 (px)
const box = document.getElementById('dangers');
const marks = [];
const v = new THREE.Vector3();
function mark(i) {
    let el = marks[i];
    if (!el) {
        el = box.appendChild(document.createElement('div'));
        el.innerHTML = '<i></i><b>!</b>';
        marks.push(el);
    }
    return el;
}
export function updateDangerHud(list) {
    camera.updateMatrixWorld();
    const w = window.innerWidth / 2 - EDGE;
    const h = window.innerHeight / 2 - EDGE;
    const aboveCount = list.filter((d) => d.above).length;
    let above = 0;
    list.forEach((d, i) => {
        const el = mark(i);
        v.set(d.x, d.y, d.z).applyMatrix4(camera.matrixWorldInverse); // カメラの座標（x が右、y が上、-z が前）
        const angle = d.above ? 0 : v.z < 0 ? Math.atan2(v.x, v.y) : Math.atan2(v.x, -v.z); // 上から時計回り
        const dx = Math.sin(angle);
        const dy = -Math.cos(angle);
        const t = Math.min(w / Math.max(Math.abs(dx), 1e-6), h / Math.max(Math.abs(dy), 1e-6));
        el.hidden = false;
        el.classList.toggle('near', d.k > NEAR);
        const shift = d.above ? (above++ - (aboveCount - 1) / 2) * ABOVE_GAP : 0;
        el.style.transform = `translate(${dx * t + shift}px, ${dy * t}px) scale(${0.85 + 0.35 * d.k})`;
        el.style.setProperty('--a', `${angle}rad`);
        el.style.opacity = String(0.45 + 0.55 * d.k);
    });
    for (let i = list.length; i < marks.length; i++)
        marks[i].hidden = true;
}

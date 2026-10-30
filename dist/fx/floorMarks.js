import * as THREE from 'three';
// ---- 床の跡 ----
// 衝撃波で入ったひびや、レーザーの焦げ跡を床に貼る。戦いの間ずっと残る（ステージを出るまで）。
// 足跡のように life を渡したものは、だんだん薄くなって消える。多くなりすぎたら古いものから消す
const MAX_MARKS = 260;
const MARK_Y = 0.012; // 床から浮かせる高さ（重なった跡どうしがちらつかないよう、跡ごとに少しずつずらす）
const MARK_Y_STEP = 0.0004;
const MARK_Y_LAYERS = 20;
const FADE = 1.5; // 消える前のこの時間で薄くする
// ひび: 真ん中から割れ目が枝分かれしながら外へ走る
const crackTexture = (() => {
    const n = 512;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    const crack = (x, y, a, len, w, depth) => {
        let px = x;
        let py = y;
        const steps = 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < steps; i++) {
            a += (Math.random() - 0.5) * 0.7;
            const nx = px + Math.cos(a) * (len / steps);
            const ny = py + Math.sin(a) * (len / steps);
            g.lineWidth = w * (1 - i / steps) + 0.6;
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(nx, ny);
            g.stroke();
            if (depth > 0 && Math.random() < 0.3)
                crack(nx, ny, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), len * 0.45, w * 0.6, depth - 1);
            px = nx;
            py = ny;
        }
    };
    const arms = 9;
    for (let k = 0; k < arms; k++)
        crack(n / 2, n / 2, (k / arms) * Math.PI * 2 + Math.random() * 0.5, n * (0.3 + Math.random() * 0.18), 7, 2);
    // 真ん中は砕けて潰れている
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.08);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, n, n);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
})();
// 焦げ跡: 真ん中ほど濃く、縁はむらのある円
const scorchTexture = (() => {
    const n = 128;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    for (let k = 0; k < 14; k++) {
        const x = n / 2 + (Math.random() - 0.5) * n * 0.25;
        const y = n / 2 + (Math.random() - 0.5) * n * 0.25;
        const r = n * (0.18 + Math.random() * 0.2);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.35)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, n, n);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
})();
const markMat = (map, color, opacity) => new THREE.MeshBasicMaterial({
    map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const crackMat = markMat(crackTexture, 0x101010, 0.85);
const scorchMat = markMat(scorchTexture, 0x0a0a0a, 0.9);
const imprintMat = markMat(scorchTexture, 0x202020, 0.5);
const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const marks = [];
let parentObj = null;
let layer = 0;
// parent（ステージ）に床の跡を置く。ステージへ入るたびに呼ぶ
export function attachFloorMarks(parent) {
    for (const mk of marks)
        mk.mesh.removeFromParent();
    marks.length = 0;
    parentObj = parent;
}
function addMark(mat, x, z, sx, sz, yaw, life) {
    if (!parentObj)
        return;
    if (marks.length >= MAX_MARKS)
        marks.shift().mesh.removeFromParent();
    const fading = life < Infinity;
    const mesh = new THREE.Mesh(plane, fading ? mat.clone() : mat);
    mesh.position.set(x, MARK_Y + MARK_Y_STEP * (layer++ % MARK_Y_LAYERS), z);
    mesh.rotation.y = yaw;
    mesh.scale.set(sx, 1, sz);
    mesh.raycast = () => { };
    mesh.renderOrder = 1;
    parentObj.add(mesh);
    marks.push({ mesh, life, age: 0, opacity: mat.opacity });
}
// (x, z) にひびを入れる。size は差し渡し (m)
export function spawnCrack(x, z, size) {
    addMark(crackMat, x, z, size, size, Math.random() * Math.PI * 2, Infinity);
}
// (x, z) に焦げ跡を付ける
export function spawnScorch(x, z, size) {
    addMark(scorchMat, x, z, size, size, Math.random() * Math.PI * 2, Infinity);
}
// (x, z) に、重いものが踏んだ跡を付ける（life でだんだん消える）。w・d は横幅と前後の長さ、yaw は向き
export function spawnImprint(x, z, w, d, yaw, life) {
    addMark(imprintMat, x, z, w, d, yaw, life);
}
export function updateFloorMarks(dt) {
    for (let i = marks.length - 1; i >= 0; i--) {
        const mk = marks[i];
        if (mk.life === Infinity)
            continue;
        mk.age += dt;
        if (mk.age >= mk.life) {
            mk.mesh.removeFromParent();
            mk.mesh.material.dispose();
            marks.splice(i, 1);
            continue;
        }
        mk.mesh.material.opacity = mk.opacity * Math.min(1, (mk.life - mk.age) / FADE);
    }
}

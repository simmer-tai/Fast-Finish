import * as THREE from 'three';
import { scene } from '../core.js?v=e316db84';
import { floorAt } from '../world/blocks.js?v=e316db84';
// ---- 足元の丸い影 ----
// 影を落とさない画質で、敵が床から浮いて見えないよう、足元の床にぼかした丸い影を置く（全部を 1 回で描く）。
// 床から離れるほど薄く、大きくする
const MAX = 48;
const SIZE = 1.5; // 床に立っているときの直径 (m)
const OPACITY = 0.45;
const FADE_HEIGHT = 6; // 床からこの高さで消える (m)
const LIFT = 0.02; // 床との重なりのちらつきを避けて浮かせる高さ (m)
function blobTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}
const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: OPACITY, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), MAX);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.count = 0;
mesh.frustumCulled = false;
mesh.renderOrder = -1;
mesh.visible = false;
scene.add(mesh);
const m = new THREE.Matrix4();
const pos = new THREE.Vector3();
const feet = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scale = new THREE.Vector3();
// on: 置くかどうか（影を落とす画質では置かない）。roots: 足元に影を置く物（root.position が足元）
export function updateBlobShadows(on, roots) {
    mesh.visible = on;
    if (!on)
        return;
    let n = 0;
    for (const r of roots) {
        if (n >= MAX)
            break;
        const p = r.getWorldPosition(feet); // 動く足場に載っている敵もいる
        const floor = floorAt(p.x, p.z, p.y + 0.1);
        const h = p.y - floor;
        if (h < -0.5 || h > FADE_HEIGHT)
            continue; // 床が見つからない・離れすぎ
        const k = 1 - Math.max(0, h) / FADE_HEIGHT;
        const s = SIZE * (1 + (1 - k) * 0.6) * Math.sqrt(k); // 離れるほど広がりつつ、しぼんで消える
        pos.set(p.x, floor + LIFT, p.z);
        scale.set(s, 1, s);
        mesh.setMatrixAt(n++, m.compose(pos, quat, scale));
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
}

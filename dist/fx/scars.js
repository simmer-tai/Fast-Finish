import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { rand } from '../random.js';
import { HIT_CORE, SWING_MIN_SIDE } from './hitFx.js';
const DEG = Math.PI / 180;
const SCAR_MAX = 24; // これより多くなったら古いものから消す
const SCAR_COOL = 0.35; // 白から黒へ冷めきるまで
const SCAR_DEPTH = 0.25; // 貼り付ける奥行き（体の裏側まで届かない程度）
const SCAR_COLD = new THREE.Color(0x140808);
const SCAR_JITTER = 6; // 傷の向きを毎回少しずらす（度）
// 傷の形: 中央が太く両端がとがった線。中心ほど濃く、ふちはやわらかく抜く
const scarTexture = (() => {
    const w = 256, h = 32;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const half = (h / 2 - 2) * Math.sin(Math.PI * u) ** 0.7; // その位置での傷の半分の太さ
        for (let y = 0; y < h; y++) {
            const d = Math.abs(y + 0.5 - h / 2);
            const a = THREE.MathUtils.clamp((half - d) / 1.5 + 0.5, 0, 1) * (d < half * 0.45 ? 1 : 0.85);
            const i = (y * w + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
            img.data[i + 3] = a * 255;
        }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
})();
const scarRaycaster = new THREE.Raycaster();
const scarView = new THREE.Vector3();
const scarAlong = new THREE.Vector3();
const scarUp = new THREE.Vector3();
const scarBasis = new THREE.Matrix4();
const scarEuler = new THREE.Euler();
const scarSize = new THREE.Vector3();
const scarInv = new THREE.Matrix4();
const scarA = new THREE.Vector3();
const scarB = new THREE.Vector3();
const scarC = new THREE.Vector3();
const scarRight = new THREE.Vector3();
const scarCamUp = new THREE.Vector3();
export function addSlashScar(en, camera, at, hitDir, def, kind, swing) {
    en.root.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    scarRight.setFromMatrixColumn(camera.matrixWorld, 0);
    scarCamUp.setFromMatrixColumn(camera.matrixWorld, 1);
    // 視点から当たった場所を通る線で、実際の装甲の表面を探す。輪郭ぎりぎりで外れたら攻撃の向きで探し直す
    scarView.subVectors(at, camera.position).normalize();
    scarRaycaster.set(camera.position, scarView);
    let hit = scarRaycaster.intersectObjects(en.parts, false)[0];
    if (!hit) {
        scarRaycaster.set(scarA.copy(at).addScaledVector(hitDir, -0.6), hitDir);
        hit = scarRaycaster.intersectObjects(en.parts, false)[0];
        if (!hit)
            return;
        scarView.copy(hitDir);
    }
    // 傷の向き: 刃が動いた向きのうち画面に沿った成分。わからなければ技の斬撃の角度を使う
    let slashing = false;
    if (swing && swing.lengthSq() > 1e-8) {
        scarAlong.copy(swing).addScaledVector(scarView, -swing.dot(scarView));
        slashing = scarAlong.lengthSq() > SWING_MIN_SIDE ** 2 * swing.lengthSq();
    }
    if (!slashing && def.slash !== undefined) {
        const a = def.slash * DEG;
        scarAlong.copy(scarRight).multiplyScalar(Math.cos(a)).addScaledVector(scarCamUp, Math.sin(a));
        slashing = true;
    }
    if (!slashing)
        scarAlong.copy(scarRight); // 突きは短い刺し傷にする
    scarAlong.applyAxisAngle(scarView, (Math.random() - 0.5) * SCAR_JITTER * DEG).normalize();
    scarUp.crossVectors(scarView, scarAlong).normalize();
    scarAlong.crossVectors(scarUp, scarView);
    scarEuler.setFromRotationMatrix(scarBasis.makeBasis(scarAlong, scarUp, scarView));
    const fx = Math.sqrt(def.fx ?? 1);
    const len = slashing ? (kind === 'sword' ? 0.6 : kind === 'axe' ? 0.5 : 0.36) * fx * rand(0.85, 1.15) : 0.14;
    scarSize.set(len, (kind === 'sword' ? 0.07 : kind === 'axe' ? 0.11 : 0.05) * fx, SCAR_DEPTH); // 斧は厚い刃で太く割る
    const mat = new THREE.MeshBasicMaterial({
        map: scarTexture, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const scar = { meshes: [], mat, age: 0 };
    // 傷が部品の境目をまたいでも切れないよう、近くの部品すべてへ貼る
    for (const part of en.parts) {
        const geo = new DecalGeometry(part, hit.point, scarEuler, scarSize);
        if (!keepFrontFaces(geo, scarView)) {
            geo.dispose();
            continue;
        }
        // ワールド座標で作られるので、部品のローカル座標へ直して子にする
        geo.applyMatrix4(scarInv.copy(part.matrixWorld).invert());
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 1;
        part.add(m);
        scar.meshes.push(m);
    }
    if (scar.meshes.length === 0) {
        mat.dispose();
        return;
    }
    en.scars.push(scar);
    if (en.scars.length > SCAR_MAX)
        removeScar(en.scars.shift());
    updateScarColor(scar);
}
// 貼り付けの箱は裏側の面も拾うので、こちらへ向いた三角形だけを残す。残らなければ false
function keepFrontFaces(geo, view) {
    const pos = geo.getAttribute('position');
    if (!pos || pos.count === 0)
        return false;
    const uv = geo.getAttribute('uv');
    const keepPos = [];
    const keepUv = [];
    for (let i = 0; i + 2 < pos.count; i += 3) {
        scarA.fromBufferAttribute(pos, i);
        scarB.fromBufferAttribute(pos, i + 1).sub(scarA);
        scarC.fromBufferAttribute(pos, i + 2).sub(scarA);
        if (scarB.cross(scarC).dot(view) >= 0)
            continue;
        for (let k = i; k < i + 3; k++) {
            keepPos.push(pos.getX(k), pos.getY(k), pos.getZ(k));
            keepUv.push(uv.getX(k), uv.getY(k));
        }
    }
    if (keepPos.length === 0)
        return false;
    geo.deleteAttribute('normal');
    geo.setAttribute('position', new THREE.Float32BufferAttribute(keepPos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(keepUv, 2));
    return true;
}
function removeScar(scar) {
    for (const m of scar.meshes) {
        m.removeFromParent();
        m.geometry.dispose();
    }
    scar.mat.dispose();
}
export function clearScars(en) {
    for (const s of en.scars)
        removeScar(s);
    en.scars.length = 0;
}
function updateScarColor(scar) {
    const t = Math.min(1, scar.age / SCAR_COOL);
    scar.mat.color.copy(HIT_CORE).lerp(SCAR_COLD, 1 - (1 - t) ** 3);
    scar.mat.opacity = 0.92;
}
export function updateScars(en, dt) {
    for (const s of en.scars) {
        if (s.age >= SCAR_COOL)
            continue;
        s.age += dt;
        updateScarColor(s);
    }
}

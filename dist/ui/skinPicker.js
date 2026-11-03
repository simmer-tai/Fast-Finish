import * as THREE from 'three';
import * as sfx from '../audio.js?v=9bd5fe3e';
import { createBat } from '../weapons/bat.js?v=9bd5fe3e';
import { createBattleAxe } from '../weapons/battleAxe.js?v=9bd5fe3e';
import { createSpear } from '../weapons/spear.js?v=9bd5fe3e';
import { createRifle } from '../weapons/rifle.js?v=9bd5fe3e';
import { createBow } from '../weapons/bow.js?v=9bd5fe3e';
import { createChainSickle } from '../weapons/chainSickle.js?v=9bd5fe3e';
import { WEAPON_IDS } from '../weapons/ids.js?v=9bd5fe3e';
import { createKunai } from '../weapons/kunai.js?v=9bd5fe3e';
import { createWeaponMats } from '../weapons/materials.js?v=9bd5fe3e';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HEMI_GROUND, HEMI_WITH_SUN, SUN_DIR, SUN_INTENSITY } from '../core.js?v=9bd5fe3e';
import { GlowPass } from '../fx/glow.js?v=9bd5fe3e';
import { options } from './options.js?v=9bd5fe3e';
import { createRevolver } from '../weapons/revolver.js?v=9bd5fe3e';
import { applySkin, createSkinMats, dressModel, setSkin, skinOf, skinnedWeaponMats, skinsFor, skinTags, skinUnlocked } from '../weapons/skins.js?v=9bd5fe3e';
import { createSword } from '../weapons/sword.js?v=9bd5fe3e';
import { NEW_TAG, isNew, markSeen, seedSeen } from './newMarks.js?v=9bd5fe3e';
// ---- スキンの選択画面 ----
// 武器の選択画面の SKIN から開く。左に武器のモデルを大きく出してゆっくり回し（ドラッグで回す・ホイールで寄る）、
// 右にスキンのタイルを並べる。タイルの絵は同じモデルをそのスキンで描いたもの。
// タイルを押す・キーで動かすと左のモデルがそのスキンになり、決定で武器に付ける（BACK なら元のまま）
const overlay = document.getElementById('overlay');
const win = overlay.querySelector('.sk-win');
const stage = win.querySelector('.sk-stage');
const canvas = stage.querySelector('canvas');
const tilesBox = win.querySelector('.sk-tiles');
const weaponLabel = win.querySelector('.sk-weapon');
const countLabel = win.querySelector('.sk-count');
const skinName = win.querySelector('.sk-detail .nm');
const skinJa = win.querySelector('.sk-detail .ja');
const skinSwatch = [...win.querySelectorAll('.sk-detail .sk-swatch i')];
const tagsBox = stage.querySelector('.sk-feats');
// スキンで変わるもののタグ（モデルの右下）。アイコンだけ出し、カーソルを合わせると名前を出す
const TAG = {
    // 外見: 箱
    look: { ja: '外見', icon: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>' },
    // ヒットエフェクト: 当たりの火花
    hit: { ja: 'ヒットエフェクト', icon: '<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M18.7 5.3l-3.5 3.5M8.8 15.2l-3.5 3.5"/>' },
    // モーション: 振りの弧
    motion: { ja: 'モーション', icon: '<path d="M4 17A9.5 9.5 0 0 1 19 6.5"/><path d="M13.5 5.5 19 6.5l-1 5.5"/><path d="M7 19.5a6 6 0 0 1 9-8.5"/>' },
};
export const skinTagsHtml = (skin) => skinTags(skin)
    .map((t) => `<span aria-label="${TAG[t].ja}"><svg viewBox="0 0 24 24" aria-hidden="true">${TAG[t].icon}</svg><b>${TAG[t].ja}</b></span>`)
    .join('');
function showTags(skin) {
    tagsBox.innerHTML = skinTagsHtml(skin);
}
// 解放したのにまだ選んでいないスキンには NEW を付ける（ui/newMarks.ts）
const skinKey = (id, skin) => `skin:${id}:${skin.id}`;
const newSkin = (id, skin) => isNew(skinKey(id, skin), skinUnlocked(skin));
seedSeen(WEAPON_IDS.flatMap((id) => skinsFor(id).filter(skinUnlocked).map((s) => skinKey(id, s))));
function touchSkin(i) {
    if (skinUnlocked(skins[i]) && markSeen(skinKey(weapon, skins[i])))
        tiles[i].classList.remove('is-new');
}
// タイルは開くたびに、その武器で選べるスキンの分だけ並べ直す（武器専用のスキンがある）
const THUMB = 160; // タイルの絵の大きさ (px)
let skins = [];
let tiles = [];
let tileCtx = [];
// まだ使えないスキンのタイルに重ねる南京錠
const PADLOCK = '<svg class="padlock" viewBox="0 0 24 24" aria-hidden="true"><path class="shackle" d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"/><rect x="4.5" y="11" width="15" height="10.5"/><rect class="hole" x="11" y="14.5" width="2" height="3.5"/></svg>';
function makeTiles() {
    tiles = skins.map((skin) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.skin = skin.id;
        const locked = !skinUnlocked(skin);
        b.classList.toggle('locked', locked);
        b.classList.toggle('is-new', newSkin(weapon, skin));
        b.innerHTML = `<canvas width="${THUMB}" height="${THUMB}"></canvas>${locked ? PADLOCK : ''}<span class="lbl">${skin.name}</span>${NEW_TAG}`;
        b.addEventListener('pointerenter', () => touchSkin(tiles.indexOf(b)));
        return b;
    });
    tilesBox.replaceChildren(...tiles);
    tileCtx = tiles.map((b) => b.querySelector('canvas').getContext('2d'));
}
// ---- 見せるための描画 ----
// ゲームとは別の描画の土台を持つ（ゲームの画面は後処理を通すので、そのまま借りられない）。初めて開いたときに作る。
// ゲームで持ったときと同じ質感にするため、光はゲームと同じ強さと向きにし、明るさのオプションも同じく掛ける。
// 光のにじみ（fx/glow.ts）は、ゲームより狭く薄く掛ける（にじみの幅は画面の画素で決まるので、
// 武器を小さく映すこの画面でゲームと同じ幅にすると、刀身が光に埋もれる）。
// 幅は絵の高さ GLOW_REF_HEIGHT 画素で GLOW_SPREAD 倍とし、絵の大きさと寄った分に合わせて広げる（タイルの小さな絵でも同じ見え方に）
const FOV = 28;
const GLOW_SPREAD = 0.35;
const GLOW_REF_HEIGHT = 600;
const GLOW_OPACITY = 0.6;
const AUTO_SPIN = 0.55; // 触っていないときの回る速さ (rad/s)
const IDLE_TIME = 1.6; // 手を離してから自分で回り出すまで (s)
const PITCH = 0.22; // 見下ろす角度
let view = null;
function createView(target = canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas: target, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.LinearToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, HEMI_GROUND, HEMI_WITH_SUN));
    const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
    sun.position.copy(SUN_DIR);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);
    // 透けたキャンバスに描くので、描き込み先も透明度を持たせる。なめらかな縁はマルチサンプルの描き込み先で出す
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    const glow = new GlowPass(scene, camera, 1); // 狭いにじみをなめらかに消すため、縮小せずに描く
    glow.opacity = GLOW_OPACITY;
    glow.behind = true; // 武器の上には重ねず、まわりの透けた所にだけにじませる
    composer.addPass(glow);
    composer.addPass(new OutputPass());
    // 階層: tilt（見下ろす角度） → spin（回す） → 武器ごとに寝かせたモデル
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    tilt.add(spin);
    scene.add(tilt);
    const base = createWeaponMats(renderer);
    const mats = Object.fromEntries(WEAPON_IDS.map((id) => [id, createSkinMats(base, id)]));
    return { renderer, composer, glow, scene, camera, tilt, spin, base, mats, models: new Map() };
}
function setViewSize(v, w, h, pixelRatio = v.renderer.getPixelRatio()) {
    v.renderer.setPixelRatio(pixelRatio);
    v.renderer.setSize(w, h, false);
    v.composer.setPixelRatio(pixelRatio);
    v.composer.setSize(w, h);
}
const BUILD = {
    kunai: (m) => createKunai(m),
    handgun: (m) => createRevolver(m),
    sword: (m) => createSword(m),
    sickle: (_, s) => createChainSickle({ metal: s.metal, shaft: s.trim, wrap: s.wrap }),
    axe: (_, s) => createBattleAxe({ metal: s.metal, grip: s.wrap }),
    bow: (m, s) => createBow({ riser: s.metal, limb: s.trim, grip: s.wrap, string: m.lead }),
    bat: (_, s) => createBat({ metal: s.metal, grip: s.wrap }),
    spear: (_, s) => createSpear({ metal: s.metal, shaft: s.trim, wrap: s.wrap }),
    rifle: (m, s) => createRifle({ metal: s.metal, stock: s.wrap, trim: s.trim, lens: m.bore }),
};
// いちばん長い向きを横に、次に長い向きを縦にして寝かせ、真ん中を原点に置く（武器ごとに組んだ向きが違うので揃える）
function frameModel(model) {
    const holder = new THREE.Group();
    holder.add(model);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const [a, b] = [0, 1, 2].sort((i, j) => size.getComponent(j) - size.getComponent(i));
    const ex = new THREE.Vector3().setComponent(a, 1);
    const ey = new THREE.Vector3().setComponent(b, 1);
    const ez = new THREE.Vector3().crossVectors(ex, ey);
    holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez).transpose());
    const root = new THREE.Group();
    root.add(holder);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    holder.position.copy(box.getCenter(new THREE.Vector3())).negate();
    return { root, half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5), model };
}
function modelOf(v, id) {
    let f = v.models.get(id);
    if (!f) {
        f = frameModel(BUILD[id](skinnedWeaponMats(v.base, v.mats[id], id), v.mats[id]));
        v.models.set(id, f);
    }
    return f;
}
// ---- 開いている間の状態 ----
let weapon = 'kunai';
let selIndex = 0; // 左に見せているスキン（カーソル）
let inUseIndex = 0; // 今付けているスキン
let done = null;
let yaw = 0;
let yawVel = 0;
let pitch = PITCH;
let zoom = 1;
let zoomWant = 1;
let idle = 0; // 手を離してからの時間
let dragging = false;
let dragX = 0;
let dragY = 0;
let dragAt = 0;
let raf = 0;
let lastFrame = 0;
export const skinOpen = () => overlay.classList.contains('pick-skin');
// 見せる距離: 回しても横にはみ出さないよう、横は外接球で合わせる。縦は見下ろしたときの奥行きの分も足して合わせる
function fitDistance(half, aspect, tiltX = pitch) {
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const dh = (half.length() * 1.06) / (tv * aspect);
    const dv = ((half.x * Math.abs(Math.sin(tiltX)) + half.y) * 1.2) / tv;
    return Math.max(dh, dv);
}
function resize(v) {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    setViewSize(v, w, h);
    v.camera.aspect = w / h;
    v.camera.updateProjectionMatrix();
}
function render(v) {
    const f = modelOf(v, weapon);
    v.tilt.rotation.x = pitch;
    v.spin.rotation.set(0, yaw, 0);
    v.camera.position.set(0, 0, fitDistance(f.half, v.camera.aspect) / zoom);
    v.camera.lookAt(0, 0, 0);
    renderPreview(v, zoom);
}
const bufferSize = new THREE.Vector2();
function renderPreview(v, zoomed = 1) {
    v.renderer.toneMappingExposure = options.brightness;
    v.glow.spread = (GLOW_SPREAD * zoomed * v.renderer.getDrawingBufferSize(bufferSize).y) / GLOW_REF_HEIGHT;
    v.composer.render();
}
function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!view)
        return;
    if (!dragging) {
        idle += dt;
        yawVel += ((idle > IDLE_TIME ? AUTO_SPIN : 0) - yawVel) * (1 - Math.exp(-dt * 2.2));
        yaw += yawVel * dt;
    }
    zoom += (zoomWant - zoom) * (1 - Math.exp(-dt * 12));
    render(view);
}
// タイルの絵: そのスキンで、アイコンと同じく右上へ斜めに寝かせて描く
function drawThumbs(v) {
    const f = modelOf(v, weapon);
    const pr = v.renderer.getPixelRatio();
    setViewSize(v, THUMB, THUMB, 1);
    v.camera.aspect = 1;
    v.camera.updateProjectionMatrix();
    v.tilt.rotation.set(0, 0, 0);
    v.spin.rotation.set(0.2, -0.45, THREE.MathUtils.degToRad(35));
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const h = f.half;
    v.camera.position.set(0, 0, ((h.x * 0.82 + h.y * 0.57 + h.z * 0.3) * 1.12) / tv);
    v.camera.lookAt(0, 0, 0);
    for (const [i, skin] of skins.entries()) {
        wearSkin(v, skin);
        renderPreview(v);
        tileCtx[i].clearRect(0, 0, THUMB, THUMB);
        tileCtx[i].drawImage(v.renderer.domElement, 0, 0, THUMB, THUMB); // 描いた直後なら描画の中身を写せる
    }
    v.renderer.setPixelRatio(pr);
    v.composer.setPixelRatio(pr);
    resize(v);
}
// スキンを着せる: 色を塗り替え、形の飾りがあれば付け替える
function wearSkin(v, skin) {
    applySkin(v.mats[weapon], skin);
    dressModel(modelOf(v, weapon).model, skin, v.mats[weapon]);
}
new ResizeObserver(() => view && skinOpen() && resize(view)).observe(stage);
// ---- ほかの画面に出す見本 ----
// ロードマップのご褒美の中身に、スキンを着せた武器を選択画面と同じ台で回して見せる（触っては回せない）。
// 選択画面とは別の描画の土台を持ち（同時に描けるように）、絵を描くキャンバスは 1 枚を使い回して、出す所へ差し込む
const spinCanvas = document.createElement('canvas');
let spinView = null;
let spinRaf = 0;
// 選択画面を開いたときと同じく、勢いよく回し始めて、ゆっくりした回転に落ち着かせる
export function startSkinSpin(id, skin) {
    const v = (spinView ??= createView(spinCanvas));
    const f = modelOf(v, id);
    v.spin.clear();
    v.spin.add(f.root);
    applySkin(v.mats[id], skin);
    dressModel(f.model, skin, v.mats[id]);
    let turn = -1.1;
    let vel = 5;
    let at = performance.now();
    const tick = (now) => {
        spinRaf = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - at) / 1000);
        at = now;
        vel += (AUTO_SPIN - vel) * (1 - Math.exp(-dt * 2.2));
        turn += vel * dt;
        const w = spinCanvas.clientWidth;
        const h = spinCanvas.clientHeight;
        if (!w || !h)
            return; // まだ差し込まれていない
        const size = v.renderer.getSize(new THREE.Vector2());
        if (size.x !== w || size.y !== h) {
            setViewSize(v, w, h);
            v.camera.aspect = w / h;
            v.camera.updateProjectionMatrix();
        }
        v.tilt.rotation.x = PITCH;
        v.spin.rotation.set(0, turn, 0);
        v.camera.position.set(0, 0, fitDistance(f.half, v.camera.aspect, PITCH));
        v.camera.lookAt(0, 0, 0);
        renderPreview(v);
    };
    cancelAnimationFrame(spinRaf);
    spinRaf = requestAnimationFrame(tick);
    return spinCanvas;
}
export const stopSkinSpin = () => cancelAnimationFrame(spinRaf);
// ---- 選ぶ ----
function showSkin(i, flash) {
    selIndex = i;
    const skin = skins[i];
    touchSkin(i);
    tiles.forEach((b, j) => b.classList.toggle('active', j === i));
    skinName.textContent = skin.name;
    skinJa.textContent = skinUnlocked(skin) ? skin.ja : 'LOCKED';
    win.classList.toggle('sk-locked', !skinUnlocked(skin));
    skinSwatch.forEach((el, j) => (el.style.background = skin.swatch[j]));
    showTags(skin);
    countLabel.textContent = `${String(i + 1).padStart(2, '0')} / ${String(skins.length).padStart(2, '0')}`;
    if (view)
        wearSkin(view, skin);
    if (flash) {
        // 斬線が横切ってスキンが替わる（続けて替えても頭から流し直す）
        stage.classList.remove('swap');
        void stage.offsetWidth;
        stage.classList.add('swap');
    }
}
function stepSkin(dir) {
    sfx.playUiHover();
    showSkin((selIndex + dir + skins.length) % skins.length, true);
}
// 上下は 1 段ずつ。列の数は CSS から読む。はみ出したら同じ列の反対の端へ回る
function stepSkinRow(dir) {
    const cols = getComputedStyle(tilesBox).gridTemplateColumns.split(' ').length;
    const n = skins.length;
    let i = selIndex + dir * cols;
    if (i < 0)
        i = (selIndex % cols) + Math.floor((n - 1 - (selIndex % cols)) / cols) * cols;
    else if (i >= n)
        i = selIndex % cols;
    sfx.playUiHover();
    showSkin(i, true);
}
// id: 見せる武器、name: 見出しに出す武器名、onClose: 閉じたとき（決めても戻っても）
export function openSkin(id, name, onClose) {
    sfx.playUiOpen();
    view ??= createView();
    weapon = id;
    done = onClose;
    weaponLabel.textContent = name;
    skins = skinsFor(id);
    makeTiles();
    inUseIndex = Math.max(0, skins.indexOf(skinOf(id)));
    tiles.forEach((b, j) => b.classList.toggle('equipped', j === inUseIndex));
    overlay.classList.add('pick-skin');
    // 武器を差し替えて、勢いよく回して見せ始める
    view.spin.clear();
    view.spin.add(modelOf(view, id).root);
    drawThumbs(view);
    showSkin(inUseIndex, false);
    yaw = -1.1;
    yawVel = 5;
    idle = IDLE_TIME;
    pitch = PITCH;
    zoom = 0.85;
    zoomWant = 1;
    dragging = false;
    cancelAnimationFrame(raf);
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
}
// decide: 見せているスキンに決める。quiet: 音を鳴らさずに閉じる（武器の選択画面ごと閉じるとき）
export function closeSkin(decide, quiet = false) {
    if (!skinOpen())
        return;
    if (decide && !skinUnlocked(skins[selIndex]))
        return; // まだ使えないスキンは見るだけ
    if (decide)
        setSkin(weapon, skins[selIndex].id);
    if (!quiet)
        (decide ? sfx.playUiSelect : sfx.playUiBack)();
    overlay.classList.remove('pick-skin');
    cancelAnimationFrame(raf);
    done?.();
    done = null;
}
export function onSkinClick(target) {
    const tile = target.closest('.sk-tiles [data-skin]');
    if (tile) {
        const i = tiles.indexOf(tile);
        if (i === selIndex)
            return;
        sfx.playUiSelect();
        return showSkin(i, true);
    }
    if (target.closest('[data-action="skin-decide"]'))
        return closeSkin(true);
    // 窓の外（靄）か BACK を押したら武器の選択画面へ戻る
    if (target.closest('[data-action="skin-close"]') || !target.closest('.sk-win'))
        closeSkin(false);
}
export function onSkinKey(e) {
    switch (e.code) {
        case 'Escape':
        case 'KeyQ':
            return closeSkin(false);
        case 'Enter':
            e.preventDefault();
            return closeSkin(true);
        case 'ArrowLeft':
        case 'PageUp':
            e.preventDefault();
            return stepSkin(-1);
        case 'ArrowRight':
        case 'PageDown':
            e.preventDefault();
            return stepSkin(1);
        case 'ArrowUp':
            e.preventDefault();
            return stepSkinRow(-1);
        case 'ArrowDown':
            e.preventDefault();
            return stepSkinRow(1);
    }
}
// ---- 触って回す ----
canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    dragAt = e.timeStamp;
    yawVel = 0;
    canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
    if (!dragging)
        return;
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    const dt = Math.max(1, e.timeStamp - dragAt) / 1000;
    dragX = e.clientX;
    dragY = e.clientY;
    dragAt = e.timeStamp;
    yaw += dx * 0.01;
    yawVel = (dx * 0.01) / dt; // 離したときの勢い
    pitch = THREE.MathUtils.clamp(pitch + dy * 0.008, -1.2, 1.2);
});
const endDrag = () => {
    if (!dragging)
        return;
    dragging = false;
    idle = 0;
    yawVel = THREE.MathUtils.clamp(yawVel, -12, 12);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
// ホイール: モデルの上なら寄る・引く。ほかの所ならスキンを順に替える（トラックパッドの細かい連続は少し待って 1 つずつに均す）
let wheelAt = 0;
win.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!e.deltaY)
        return;
    if (stage.contains(e.target)) {
        zoomWant = THREE.MathUtils.clamp(zoomWant * Math.exp(-e.deltaY * 0.0015), 0.7, 2.6);
        return;
    }
    if (e.timeStamp - wheelAt < 160)
        return;
    wheelAt = e.timeStamp;
    stepSkin(Math.sign(e.deltaY));
}, { passive: false });

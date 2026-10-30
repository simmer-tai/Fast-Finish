import * as THREE from 'three';
import { renderer, scene } from '../core.js';
import { strikerNavStats } from '../enemy/striker.js';

// ---- 重さの内訳（?perf） ----
// 左上に、フレームの時間と描画の数、GPU に載っている物の数、シーンの物の数を出す。
// 進むほど重くなるとき、どの数字が増え続けているかで原因を絞る
export const PERF_HUD = new URLSearchParams(location.search).has('perf');
const INTERVAL = 0.5; // 表示を書き換える間隔 (s)

let el: HTMLElement | null = null;
let acc = 0;
let frames = 0;
let worst = 0;
let calls = 0;
let tris = 0;
const started = performance.now();

if (PERF_HUD) {
  renderer.info.autoReset = false; // 後処理の分も含めて、1 フレームぶんを数える
  el = document.createElement('pre');
  el.style.cssText =
    'position: fixed; left: 8px; top: 8px; z-index: 50; margin: 0; padding: 6px 8px; background: rgba(0,0,0,0.7); color: #fff; font: 11px/1.4 monospace; pointer-events: none; white-space: pre;';
  document.body.appendChild(el);
}

// フレームの頭で呼ぶ
export function beginPerfFrame() {
  if (PERF_HUD) renderer.info.reset();
}

// 描き終えたあとで呼ぶ。frame はそのフレームにかかった実時間 (s)
export function endPerfFrame(frame: number) {
  if (!el) return;
  acc += frame;
  frames++;
  worst = Math.max(worst, frame);
  calls = Math.max(calls, renderer.info.render.calls);
  tris = Math.max(tris, renderer.info.render.triangles);
  if (acc < INTERVAL) return;
  let objects = 0;
  let visible = 0;
  scene.traverse((o) => {
    objects++;
    if ((o as THREE.Mesh).isMesh && o.visible) visible++;
  });
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const { geometries, textures } = renderer.info.memory;
  el.textContent = [
    `time     ${((performance.now() - started) / 1000).toFixed(0)}s`,
    `fps      ${(frames / acc).toFixed(0)}  worst ${(worst * 1000).toFixed(1)}ms`,
    `calls    ${calls}  tris ${(tris / 1000).toFixed(0)}k`,
    `geo      ${geometries}  tex ${textures}  prog ${renderer.info.programs?.length ?? 0}`,
    `objects  ${objects}  meshes ${visible}`,
    `nav      ${strikerNavStats.builds}`,
    mem ? `heap     ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : '',
  ].join('\n');
  acc = frames = worst = calls = tris = 0;
}

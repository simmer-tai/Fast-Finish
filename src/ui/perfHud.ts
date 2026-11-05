import * as THREE from 'three';
import { renderer, scene } from '../core.js';
import { strikerNavStats } from '../enemy/striker.js';

// ---- 重さの内訳（?perf） ----
// 左上に、フレームの時間と描画の数、GPU に載っている物の数、シーンの物の数を出す。
// キルの後は KILL_WATCH 秒の重さを別に数えて、次のキルまで残す（初回と直近）。平均の fps が保てていれば、重く見えるのはスローのせい
// 進むほど重くなるとき、どの数字が増え続けているかで原因を絞る
export const PERF_HUD = new URLSearchParams(location.search).has('perf');
const INTERVAL = 0.5; // 表示を書き換える間隔 (s)

let el: HTMLElement | null = null;
let acc = 0;
let frames = 0;
let worst = 0;
let calls = 0;
// 処理ごとの時間 (ms)。このフレームの分と、区間でいちばん重かったフレームの分
const spans = new Map<string, number>();
let worstSpans = '';
let frameStart = 0; // このフレームの処理を始めた時刻
let lastSpanEnd = 0; // 最後に数え終えた時刻（描画がいちばん最後なので、ゲームの処理の終わりの目安）
let tris = 0;
const started = performance.now();
const KILL_WATCH = 1; // キルの後に数える実時間 (s)
let killCount = 0;
let killLeft = 0;
let killTime = 0;
let killFrames = 0;
let killWorst = 0;
let killSpans = '';
let firstKill = '';
let lastKill = '';
let killStyle = 0; // キルの後でいちばん重かった、ブラウザーのスタイル・配置・描き込みの時間 (ms)。長く止まったフレームだけ測れる
if (PERF_HUD && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
  new PerformanceObserver((list) => {
    if (killLeft <= 0) return;
    for (const e of list.getEntries() as (PerformanceEntry & { styleAndLayoutStart: number })[]) {
      if (e.styleAndLayoutStart > 0) killStyle = Math.max(killStyle, e.startTime + e.duration - e.styleAndLayoutStart);
    }
  }).observe({ type: 'long-animation-frame' });
}

if (PERF_HUD) {
  renderer.info.autoReset = false; // 後処理の分も含めて、1 フレームぶんを数える
  el = document.createElement('pre');
  el.style.cssText =
    'position: fixed; left: 8px; top: 8px; z-index: 50; margin: 0; padding: 6px 8px; background: rgba(0,0,0,0.7); color: #fff; font: 11px/1.4 monospace; pointer-events: none; white-space: pre;';
  document.body.appendChild(el);
}

// フレームの頭で呼ぶ
export function beginPerfFrame() {
  if (!PERF_HUD) return;
  renderer.info.reset();
  spans.clear();
  frameStart = lastSpanEnd = performance.now();
}

// fn にかかった時間を name で数える（?perf のときだけ）。いちばん重かったフレームの内訳として出す
export function perfSpan<T>(name: string, fn: () => T): T {
  if (!el) return fn();
  const t = performance.now();
  try {
    return fn();
  } finally {
    lastSpanEnd = performance.now();
    spans.set(name, (spans.get(name) ?? 0) + lastSpanEnd - t);
  }
}

// 倒した瞬間に呼ぶ
export function notePerfKill() {
  if (!el) return;
  killCount++;
  killLeft = KILL_WATCH;
  killTime = killFrames = killWorst = killStyle = 0;
}

// 描き終えたあとで呼ぶ。frame はそのフレームにかかった実時間 (s)
export function endPerfFrame(frame: number) {
  if (!el) return;
  acc += frame;
  frames++;
  const watching = killLeft > 0;
  if (frame > worst || (watching && frame > killWorst)) {
    // js: ゲームの処理全体、other: それ以外（ブラウザーのスタイル・配置・描き込み、GPU 待ち。画面の更新を待つ時間も入る）
    const js = lastSpanEnd - frameStart;
    spans.set('js', js);
    spans.set('other', Math.max(0, frame * 1000 - js));
    const text = [...spans].filter(([, ms]) => ms >= 0.5).map(([k, ms]) => `${k} ${ms.toFixed(0)}`).join('  ');
    if (frame > worst) {
      worst = frame;
      worstSpans = text;
    }
    if (watching && frame > killWorst) {
      killWorst = frame;
      killSpans = text;
    }
  }
  if (watching) {
    killLeft -= frame;
    killTime += frame;
    killFrames++;
    lastKill = `worst ${(killWorst * 1000).toFixed(0)}ms  平均 ${(killFrames / killTime).toFixed(0)}fps  ${killSpans}`;
    if (killCount === 1) firstKill = lastKill;
  }
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
    `worst内訳 ${worstSpans || '-'}`,
    `kill初回 ${firstKill || '-'}`,
    `kill直近 ${lastKill || '-'}  style ${killStyle.toFixed(0)}（${killCount} 回目）`,
    `res      x${renderer.getPixelRatio().toFixed(2)}`,
    `calls    ${calls}  tris ${(tris / 1000).toFixed(0)}k`,
    `geo      ${geometries}  tex ${textures}  prog ${renderer.info.programs?.length ?? 0}`,
    `objects  ${objects}  meshes ${visible}`,
    `nav      ${strikerNavStats.builds}`,
    mem ? `heap     ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : '',
  ].join('\n');
  acc = frames = worst = calls = tris = 0;
  worstSpans = '';
}

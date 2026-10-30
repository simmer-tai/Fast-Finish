// ---- リザルトで流すハイライト ----
// プレイ中の画面を小さく縮めて、直近 PRE + POST 秒ぶんを GPU の中で回し続ける（読み戻しはしない）。
// 倒したときの点数（倍率を掛けた後）がそれまでの最高以上なら、その POST 秒後まで録ってから、回している分を保存用へ写す。
// 同点なら後のキルを選ぶ（最後の一撃が残りやすい）。
// 縮めるのは暗転などを重ねた後、色の変換（OutputPass）の前。写すときに同じ変換を掛けるので、保存した画は画面と同じ色になる。
// 結果の画面では、保存した分を 1 フレームに 1 コマずつ読み戻し（ゲームは止まっている）、ランクの枠の 2D キャンバスにスローでループさせる
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer } from '../core.js';
import { composer } from './post.js';

const PRE = 2.0; // キルの前に残す秒数（実時間。とどめのスローもそのまま入る）
const POST = 0.7; // キルの後に残す秒数
const FPS = 30;
const FRAMES = Math.round((PRE + POST) * FPS);
const HEIGHT = 288;
const PLAY_RATE = 0.5; // 再生の速さ
const SEAM = 4; // ループの継ぎ目で白く飛ばすコマ数（前後それぞれ）

export const CLIP_ASPECT = window.innerWidth / window.innerHeight;
const WIDTH = Math.round(HEIGHT * CLIP_ASPECT);
const makeTargets = () =>
  Array.from({ length: FRAMES }, () => new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
const live = makeTargets(); // 回し続ける分
const kept = makeTargets(); // 保存した分（古い順に 0 から）
let liveHead = 0; // 次に書く場所
let liveCount = 0;
let keptCount = 0;
let keptPts = -Infinity;
let pending: { pts: number; left: number } | null = null; // 録り終わりを待っているキル
let since = Infinity; // 前のコマを録ってからの実時間（最初の 1 コマはすぐ録る）
let target: THREE.WebGLRenderTarget | null = null; // このフレームで書き込む先

// 色の変換の直前に入れ、同じ変換を掛けて小さな描き込み先へ写す（画面へは何もしない）
class CapturePass extends Pass {
  private output = new OutputPass();
  constructor() {
    super();
    this.needsSwap = false;
  }
  render(r: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    if (!target) return;
    this.output.render(r, target, read, 0, false);
    target = null;
  }
}
composer.insertPass(new CapturePass(), composer.passes.length - 1);

const copyQuad = new FullScreenQuad(
  new THREE.ShaderMaterial({
    uniforms: { map: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }',
    depthTest: false,
    depthWrite: false,
  }),
);
const copyMat = copyQuad.material as THREE.ShaderMaterial;

export function resetReplay() {
  liveHead = liveCount = keptCount = 0;
  keptPts = -Infinity;
  pending = null;
  since = Infinity;
}

// 描く前に毎フレーム呼ぶ。recording = ステージで時間を測っている間と、倒しきってから結果を出すまで
export function prepareReplayFrame(realDt: number, recording: boolean) {
  target = null;
  if (!recording) return;
  since += realDt;
  if (pending) {
    pending.left -= realDt;
    if (pending.left <= 0) keepLive();
  }
  if (since < 1 / FPS) return;
  since = since === Infinity ? 0 : since % (1 / FPS);
  target = live[liveHead];
  liveHead = (liveHead + 1) % FRAMES;
  liveCount = Math.min(FRAMES, liveCount + 1);
}

// 倒したときに、倍率を掛けた後の点数を渡す
export function noteReplayKill(pts: number) {
  if (pending) {
    if (pts > pending.pts) pending = { pts, left: POST }; // 録っている間にもっと良いキル: そこから録り直す
    return;
  }
  if (pts >= keptPts) pending = { pts, left: POST };
}

// 回している分を古い順に保存用へ写す
function keepLive() {
  if (!pending) return;
  keptPts = pending.pts;
  pending = null;
  const start = (liveHead - liveCount + FRAMES) % FRAMES;
  const prev = renderer.getRenderTarget();
  for (let i = 0; i < liveCount; i++) {
    copyMat.uniforms.map.value = live[(start + i) % FRAMES].texture;
    renderer.setRenderTarget(kept[i]);
    copyQuad.render(renderer);
  }
  renderer.setRenderTarget(prev);
  keptCount = liveCount;
}

// ---- 結果の画面で流す ----
const frames: ImageData[] = []; // 読み戻したコマ
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
let loadId = 0;

// 結果を出すときに呼ぶ。録り終わっていないキルはそこで締め、読み戻しを始める。流すものがあれば true
export function startReplay(): boolean {
  if (pending) keepLive();
  frames.length = 0;
  const id = ++loadId;
  const load = () => {
    if (id !== loadId || frames.length >= keptCount) return;
    renderer.readRenderTargetPixels(kept[frames.length], 0, 0, WIDTH, HEIGHT, pixels);
    // GL は下の行から並ぶので、上下を返して入れる
    const img = new ImageData(WIDTH, HEIGHT);
    const row = WIDTH * 4;
    for (let y = 0; y < HEIGHT; y++) img.data.set(pixels.subarray((HEIGHT - 1 - y) * row, (HEIGHT - y) * row), y * row);
    frames.push(img);
    requestAnimationFrame(load);
  };
  requestAnimationFrame(load);
  return keptCount > 0;
}

// canvas に流し始める。canvas が画面から消えたらやめる
export function playReplay(canvas: HTMLCanvasElement) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const t0 = performance.now();
  let last = -1;
  const draw = (now: number) => {
    if (!canvas.offsetParent) return;
    requestAnimationFrame(draw);
    const n = frames.length;
    if (!n) return;
    const f = Math.floor(((now - t0) / 1000) * FPS * PLAY_RATE) % keptCount;
    const i = Math.min(f, n - 1); // 読み戻しが追いついていなければ、届いている所で待つ
    if (i === last) return;
    last = i;
    ctx.putImageData(frames[i], 0, 0);
    const edge = Math.min(i, keptCount - 1 - i); // ループの端からのコマ数
    if (edge < SEAM) {
      ctx.fillStyle = `rgba(237, 237, 237, ${1 - edge / SEAM})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  };
  requestAnimationFrame(draw);
}

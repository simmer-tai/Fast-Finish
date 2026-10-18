// ---- 効果音 ----
// sfx/ の録音素材（CC0。出どころは sfx/CREDITS.md）と WebAudio の合成音を重ねて鳴らす。
// 素材は同じ種類から毎回違うものを選び、高さ・音量・左右を少しずつ揺らして、連打しても同じ音に聞こえないようにする。
// 全体は 1 本のバスにまとめ、部屋の残響を足してから、スロー用のこもり → コンプレッサーを通して出す

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer;
let bus: GainNode; // すべての音の入り口（ここから先は共通の加工）
let reverbIn: GainNode; // 残響へ送る入り口
let reverbReturn: GainNode;
let slowFilter: BiquadFilterNode; // スロー中に全体をこもらせる
let worldGain: GainNode; // パリィで世界が止まっている間、ここで世界の音（残響の尾も）を消す
let parryBus: GainNode; // パリィの音だけはこもりも消音も通さず、コンプレッサーへ直接出す
const bank: Record<string, AudioBuffer[]> = {};
const reversedBank: Record<string, AudioBuffer[]> = {};
const lastPick: Record<string, number> = {};

// スローの深さ（0 = 通常, 1 = 最大）。素材の再生速度を落として、音も引き伸ばす
let slowAmt = 0;

export function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    slowFilter = ctx.createBiquadFilter();
    slowFilter.type = 'lowpass';
    slowFilter.frequency.value = 20000;
    slowFilter.Q.value = 0.9;
    bus = ctx.createGain();
    worldGain = ctx.createGain();
    bus.connect(worldGain).connect(slowFilter).connect(comp).connect(ctx.destination);
    parryBus = ctx.createGain();
    parryBus.connect(comp);

    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 1.3);
    reverbIn = ctx.createGain();
    reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.5;
    reverbIn.connect(conv).connect(reverbReturn).connect(worldGain);

    startLoops(ctx);
    loadBank(ctx);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// 部屋の残響: 最初の数本の反射のあと、高い音から先に消えていくノイズの尾を作る
function makeImpulse(c: AudioContext, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / c.sampleRate;
      // 時間が経つほど強くなまらせて、高音の残りを短くする
      const k = Math.min(0.95, 0.15 + t * 1.2);
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.exp(-t * 4.2) * 2.2;
    }
    for (const [at, g] of [[0.011, 0.5], [0.019, 0.35], [0.027, 0.3], [0.041, 0.22], [0.053, 0.16]]) {
      d[Math.floor((at + ch * 0.003) * c.sampleRate)] += g * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  return ir;
}

async function loadBank(c: AudioContext) {
  try {
    const manifest: Record<string, string[]> = await (await fetch('./sfx/manifest.json')).json();
    await Promise.all(
      Object.entries(manifest).flatMap(([group, files]) =>
        files.map(async (file, i) => {
          const buf = await c.decodeAudioData(await (await fetch(`./sfx/${file}`)).arrayBuffer());
          (bank[group] ??= [])[i] = buf;
        }),
      ),
    );
    for (const group of ['focus', 'swish']) reversedBank[group] = bank[group].map((b) => reverseBuffer(c, b));
  } catch (e) {
    // 素材が読めなくても合成音だけで鳴らし続ける
    console.warn('効果音の素材を読み込めませんでした', e);
  }
}

function reverseBuffer(c: AudioContext, b: AudioBuffer) {
  const r = c.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
  for (let ch = 0; ch < b.numberOfChannels; ch++) r.getChannelData(ch).set(b.getChannelData(ch).slice().reverse());
  return r;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// 同じ種類の中から、直前と違うものを選ぶ
function pick(group: string, reversed = false) {
  const list = (reversed ? reversedBank : bank)[group];
  if (!list || list.length === 0) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastPick[group]) i = (i + 1) % list.length;
  lastPick[group] = i;
  return list[i];
}

interface Layer {
  gain?: number;
  rate?: number; // 再生速度（= 高さ）
  jitter?: number; // 再生速度の揺れ幅（±割合）
  delay?: number; // 秒
  hp?: number;
  lp?: number;
  pan?: number; // -1〜1。省くと少しだけ左右に散らす
  reverb?: number; // 残響へ送る量
  reversed?: boolean;
  cut?: number; // この秒数で尾を絞って止める（録音の長い響きを切る）
  out?: AudioNode; // 省くとバス
}

// 録音素材を 1 つ鳴らす
function sample(group: string, o: Layer = {}) {
  if (!ctx) return;
  const buf = pick(group, o.reversed);
  if (!buf) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const j = o.jitter ?? 0.06;
  src.playbackRate.value = (o.rate ?? 1) * rand(1 - j, 1 + j) * (1 - 0.35 * slowAmt);
  let node: AudioNode = src;
  if (o.hp) node = node.connect(filter('highpass', o.hp));
  if (o.lp) node = node.connect(filter('lowpass', o.lp));
  const g = ctx.createGain();
  const level = (o.gain ?? 1) * rand(0.9, 1.05);
  g.gain.value = level;
  if (o.cut) {
    g.gain.setValueAtTime(level, t0 + o.cut * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.cut);
  }
  const p = ctx.createStereoPanner();
  p.pan.value = o.pan ?? rand(-0.12, 0.12);
  node.connect(g).connect(p).connect(o.out ?? bus);
  if (o.reverb) {
    const s = ctx.createGain();
    s.gain.value = o.reverb;
    p.connect(s).connect(reverbIn);
  }
  src.start(t0);
  if (o.cut) src.stop(t0 + o.cut + 0.02);
}

function filter(type: BiquadFilterType, freq: number, q = 0.7) {
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

// 合成: 帯域を絞ったノイズの破裂。周波数を f0 → f1 へ動かす
function noise(type: BiquadFilterType, f0: number, f1: number, peak: number, dur: number, o: { attack?: number; q?: number; delay?: number; out?: AudioNode; reverb?: number; shaper?: WaveShaperNode } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  const attack = o.attack ?? 0.003;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = src.connect(f);
  if (o.shaper) node = node.connect(o.shaper);
  node.connect(g).connect(o.out ?? bus);
  if (o.reverb) {
    const s = ctx.createGain();
    s.gain.value = o.reverb;
    g.connect(s).connect(reverbIn);
  }
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

// 合成: 音程を f0 → f1 へ下げる（上げる）音
function tone(f0: number, f1: number, peak: number, dur: number, o: { type?: OscillatorType; delay?: number; attack?: number; out?: AudioNode } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(o.out ?? bus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// ---- 鳴り続ける音: 風切り・スライディングの擦れ・スロー中のうなり ----
let windGain: GainNode;
let windFilter: BiquadFilterNode;
let scrapeGain: GainNode;
let scrapeFilter: BiquadFilterNode;
let droneGain: GainNode;
let nextHeartbeat = 0;
let duckUntil = 0; // この時刻までは鳴り続ける音を沈める（銃声の直後）

function loopNoise(c: AudioContext) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.start();
  return src;
}

function startLoops(c: AudioContext) {
  // 風: 速いほど大きく、高く
  windFilter = filter('bandpass', 500, 0.6);
  windGain = c.createGain();
  windGain.gain.value = 0;
  loopNoise(c).connect(windFilter).connect(windGain).connect(bus);

  // 床を擦る音: ざらついた中高域と、低いゴロゴロを重ねる
  scrapeFilter = filter('bandpass', 1800, 1.4);
  scrapeGain = c.createGain();
  scrapeGain.gain.value = 0;
  const scrapeSrc = loopNoise(c);
  scrapeSrc.connect(scrapeFilter).connect(scrapeGain);
  const rumble = filter('lowpass', 220);
  const rumbleGain = c.createGain();
  rumbleGain.gain.value = 2.2;
  scrapeSrc.connect(rumble).connect(rumbleGain).connect(scrapeGain);
  scrapeGain.connect(bus);

  // スロー中の低いうなり
  droneGain = c.createGain();
  droneGain.gain.value = 0;
  for (const [f, g] of [[46, 0.6], [69.5, 0.25]]) {
    const osc = c.createOscillator();
    osc.frequency.value = f;
    const og = c.createGain();
    og.gain.value = g;
    osc.connect(og).connect(droneGain);
    osc.start();
  }
  loopNoise(c).connect(filter('lowpass', 160)).connect(droneGain);
  droneGain.connect(bus);
}

// 一時停止 / タイトルの間は、鳴っている音も残響も含めて時間ごと止める
export function setAudioPaused(paused: boolean) {
  if (!ctx) return;
  if (paused && ctx.state === 'running') ctx.suspend();
  else if (!paused && ctx.state === 'suspended') ctx.resume();
}

export interface AudioState {
  speed: number; // 水平の速さ (m/s)
  airborne: boolean;
  sliding: boolean;
  focusing: boolean;
  timeScale: number;
}

// 毎フレーム呼ぶ。鳴り続ける音の量と、スローのこもり具合を動かす
export function updateAudio(s: AudioState) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const k = 0.05; // 値を寄せる時定数（秒）
  const duck = t < duckUntil ? 0.25 : 1;

  slowAmt = Math.min(1, Math.max(0, (1 - s.timeScale) / 0.8));
  slowFilter.frequency.setTargetAtTime(20000 * Math.pow(1100 / 20000, slowAmt), t, k);
  reverbReturn.gain.setTargetAtTime(0.5 + 0.9 * slowAmt, t, k);

  const windT = Math.min(1, Math.max(0, (s.speed - 9) / 26));
  windGain.gain.setTargetAtTime(windT * windT * (s.airborne ? 0.22 : 0.15) * duck, t, duck < 1 ? 0.01 : 0.15);
  windFilter.frequency.setTargetAtTime(350 + windT * 1400 + (s.airborne ? 300 : 0), t, k);

  // 擦れは、ざらつきが出るよう毎フレーム少しだけ音量と高さを揺らす
  const scrapeT = s.sliding ? Math.min(1, s.speed / 16) : 0;
  scrapeGain.gain.setTargetAtTime(scrapeT * rand(0.05, 0.09) * duck, t, s.sliding ? 0.02 : 0.06);
  scrapeFilter.frequency.setTargetAtTime(900 + scrapeT * 1600 * rand(0.8, 1.2), t, 0.02);

  droneGain.gain.setTargetAtTime(s.focusing ? 0.12 * slowAmt : 0, t, 0.12);

  // 構えている間は鼓動を「ドクン」と鳴らす（実時間で刻む）
  if (s.focusing && slowAmt > 0.4) {
    if (t >= nextHeartbeat) {
      nextHeartbeat = t + 0.78;
      heartbeat();
    }
  } else {
    nextHeartbeat = t + 0.25;
  }
}

function heartbeat() {
  sample('thud_heavy', { gain: 0.55, rate: 0.7, lp: 260, pan: 0, jitter: 0.02 });
  tone(62, 38, 0.35, 0.18);
  sample('thud_heavy', { gain: 0.35, rate: 0.65, lp: 220, pan: 0, jitter: 0.02, delay: 0.19 });
  tone(56, 34, 0.22, 0.16, { delay: 0.19 });
}

// ---- 武器 ----

// 銃声: 装飾を削った、低く鈍い一撃。破裂音・跳ね返り・残響は付けず、
// 重い打撃の録音と、高さを急に落とす歪んだ低音（キックドラムのような胴鳴り）を芯にする。
// 高い成分はほとんど削り、録音の銃声は頭の一瞬だけ借りて銃らしさを残す。
// 撃った直後は環境音を沈めて、静けさを際立たせる。
// 重さの違う 3 段階を用意し、G キーで切り替えて聴き比べられるようにしている
export const GUN_VARIANTS = ['ドスッ（標準・鈍く短い）', 'ドゥン（重い）', 'ズドン（さらに重い）'] as const;
let gunVariant = 0;
export function cycleGunVariant() {
  gunVariant = (gunVariant + 1) % GUN_VARIANTS.length;
  return GUN_VARIANTS[gunVariant];
}

// 軽く歪ませて、低音に「芯の太さ」を足す
let thumpCurve: Float32Array<ArrayBuffer> | null = null;
function saturator(drive: number) {
  if (!thumpCurve) {
    thumpCurve = new Float32Array(1024);
    for (let i = 0; i < thumpCurve.length; i++) {
      const x = (i / (thumpCurve.length - 1)) * 2 - 1;
      thumpCurve[i] = Math.tanh(x * 3) / Math.tanh(3);
    }
  }
  const pre = ctx!.createGain();
  pre.gain.value = drive;
  const ws = ctx!.createWaveShaper();
  ws.curve = thumpCurve;
  ws.oversample = '2x';
  pre.connect(ws);
  return { in: pre, out: ws };
}

// 胴鳴り: 高い音から一気に低音へ落ちる正弦波。立ち上がりの「ド」と、尾を引く「ゥン」
function thump(f0: number, f1: number, peak: number, dur: number, drive: number, out: AudioNode, lp = 600) {
  const t0 = ctx!.currentTime;
  const osc = ctx!.createOscillator();
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1 * 1.6, t0 + 0.035);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
  g.gain.setValueAtTime(peak, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const sat = saturator(drive);
  osc.connect(g).connect(sat.in);
  sat.out.connect(filter('lowpass', lp)).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// volume は 1 が自分の銃。敵の銃は距離に応じて小さくし、高い成分も削って遠くで鳴っている感じにする
// pan は左右の位置（-1 が左、1 が右）。敵の銃声を、敵のいる向きから聞こえるようにする
export function playGunshot(volume = 1, pan = 0) {
  if (!ctx) return;
  const v = rand(0.97, 1.03);
  // 響きを足さず、音を押しつぶして密度を上げるコンプ。
  // アタックを少し遅らせて、立ち上がりの一瞬はつぶさずに通し、輪郭をはっきりさせる
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 3;
  comp.ratio.value = 6;
  comp.attack.value = 0.006;
  comp.release.value = 0.08;
  const out = ctx.createGain();
  out.gain.value = 1.7 * volume;
  // 聞こえない超低域のうなりを切って、低音の濁りを減らす
  const hp = comp.connect(filter('highpass', 40));
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(bus);
  if (volume < 1) hp.connect(filter('lowpass', 900 + 2500 * volume)).connect(out).connect(panner);
  else hp.connect(out).connect(panner);
  const dry = { pan: 0, jitter: 0.02, out: comp };

  if (gunVariant === 0) {
    // 詰まったような鈍く短い「ドスッ」。芯は鈍いまま、頭の輪郭だけをはっきり立てる
    thump(180 * v, 50, 1.0, 0.16, 2.6, comp, 1000);
    sample('punch_heavy', { ...dry, gain: 0.9, rate: 0.65 * v, lp: 1600, cut: 0.13 });
    sample('thud_heavy', { ...dry, gain: 0.75, rate: 0.7, lp: 1300, cut: 0.14 });
    sample('gun_body', { ...dry, gain: 0.3, hp: 300, lp: 2600, cut: 0.035 });
    noise('lowpass', 1600, 220, 0.4, 0.06, { attack: 0.001, out: comp });
    noise('bandpass', 2600, 1200, 0.28, 0.014, { attack: 0.0005, q: 1.2, out: comp }); // 一瞬の「パ」で発音の頭を示す
  } else if (gunVariant === 1) {
    // 腹に響く「ドゥン」
    thump(150 * v, 38, 1.0, 0.34, 2.2, comp);
    sample('thud_heavy', { ...dry, gain: 1.0, rate: 0.62 * v, lp: 900, cut: 0.3 });
    sample('punch_heavy', { ...dry, gain: 0.6, rate: 0.55, lp: 800, cut: 0.2 });
    sample('gun_sub', { ...dry, gain: 0.6, rate: 0.85, lp: 240, cut: 0.35 });
    sample('gun_body', { ...dry, gain: 0.16, hp: 120, lp: 1200, cut: 0.04 });
    noise('lowpass', 900, 120, 0.35, 0.12, { attack: 0.001, out: comp }); // 空気が押し出される鈍い圧
  } else {
    // 大口径の「ズドン」。胴鳴りをより低く長く、もう一段遅れて重さが沈み込む
    thump(120 * v, 30, 1.0, 0.48, 3, comp, 450);
    thump(70 * v, 24, 0.5, 0.42, 1.5, comp, 300);
    sample('thud_heavy', { ...dry, gain: 1.1, rate: 0.5 * v, lp: 700, cut: 0.4 });
    sample('punch_heavy', { ...dry, gain: 0.7, rate: 0.45, lp: 600, cut: 0.25 });
    sample('gun_sub', { ...dry, gain: 0.75, rate: 0.7, lp: 200, cut: 0.45 });
    sample('gun_body', { ...dry, gain: 0.12, hp: 100, lp: 900, cut: 0.04 });
    noise('lowpass', 700, 80, 0.45, 0.18, { attack: 0.001, out: comp });
  }
  if (volume < 1) return; // 撃鉄の手応えと静けさは自分の銃だけ
  sample('metal_tick', { gain: 0.05, rate: 0.75, lp: 2000 }); // 撃鉄の小さな手応え
  duckUntil = ctx.currentTime + 0.55;
}

// 自分が撃たれた: 体に響く鈍い「ドッ」だけ。高い音は付けない
export function playHurt() {
  if (!ctx) return;
  sample('thud_heavy', { gain: 0.8, rate: 0.8, lp: 700 });
  sample('punch_heavy', { gain: 0.45, rate: 0.6, lp: 900 });
  tone(110, 36, 0.7, 0.22, { attack: 0.004 });
  duckUntil = ctx.currentTime + 0.4;
}

export interface SwishParams {
  at?: number; // 呼ぶ側のタイミング用（ここでは使わない）
  dur: number;
  f0: number;
  f1: number;
  gain: number;
}
export type SwishKind = 'kunai' | 'sword' | 'gun' | 'sickle';

// 風切り音: ノイズを帯域フィルタに通し、振りの速さに合わせて高さと音量を山なりに動かす。
// そこへ録音の振り音を、合成の山に合わせて少し遅らせて重ねる。剣は刃が空気を裂く「シュイン」も足す。
// 鎌は全体を高く細くして、薄い刃が鋭く空気を切る「ヒュイン」にし、振り抜きの頂点に澄んだ金属のきらめきを添える
export function playSwish(s: SwishParams, kind: SwishKind = 'kunai') {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const sickle = kind === 'sickle';
  const v = rand(0.9, 1.1) * (sickle ? 1.6 : 1);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = sickle ? 2.2 : 1.2;
  bp.frequency.setValueAtTime(s.f0 * v, t0);
  bp.frequency.exponentialRampToValueAtTime(s.f1 * v, t0 + s.dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(s.f0 * 0.7 * v, t0 + s.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(s.gain, t0 + s.dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.dur);
  src.connect(bp).connect(g).connect(bus);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + s.dur + 0.05);

  // 振りが速い（高い）ほど、録音も速く回す
  const speed = Math.min(1.5, Math.max(0.6, s.f1 / 1700));
  const at = s.dur * 0.3;
  if (kind === 'sword') {
    sample('blade', { gain: Math.min(0.9, s.gain * 1.3), rate: 0.85 * speed, delay: at * 0.6, lp: 9000, reverb: 0.12 });
    sample('swish', { gain: Math.min(0.8, s.gain * 1.2), rate: 0.7 * speed, delay: at, reverb: 0.08 });
  } else if (sickle) {
    sample('blade_hi', { gain: Math.min(0.85, s.gain * 1.5), rate: 1.15 * speed, delay: at * 0.5, hp: 1500, reverb: 0.1 });
    sample('blade', { gain: Math.min(0.5, s.gain * 0.8), rate: 1.3 * speed, delay: at * 0.7, hp: 2500, reverb: 0.08 });
    sample('swish', { gain: Math.min(0.6, s.gain * 1.1), rate: 1.2 * speed, delay: at, hp: 900 });
    // 振り抜きの頂点の「キィン」: ごく短い高い帯域のノイズと、高く短い金属音
    noise('bandpass', 7000, 12000, Math.min(0.12, s.gain * 0.3), 0.07, { q: 3, attack: 0.004, delay: s.dur * 0.42, reverb: 0.15 });
    if (s.gain >= 0.2) setTimeout(() => playRing(2.1, 0.3, 0.09), s.dur * 420);
  } else {
    sample('swish', { gain: Math.min(0.7, s.gain * 1.8), rate: speed * (kind === 'gun' ? 1.15 : 1), delay: at });
  }
}

export type HitKind = 'kunai' | 'sword' | 'throw' | 'bullet';

// ヒット音: 「ザシュッ」（刃が入る録音と高い帯域のノイズ）に、「ドン」（殴打の録音と音程を下げるサイン波）、
// 頭の「カッ」（ごく短い高音のノイズ）を重ねる。power が大きいほど低く長く、重い打撃と残響も足す
export function playHit(power: number, kind: HitKind) {
  if (!ctx) return;
  const v = rand(0.9, 1.1);
  const heavy = Math.min(1, Math.max(0, (power - 1) / 0.7)); // 0（通常）〜 1（締めの技）
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(bus);
  const verb = 0.1 + 0.35 * heavy;

  if (kind === 'bullet') {
    sample('punch', { gain: 0.75, rate: 0.85, out });
    sample('thud_heavy', { gain: 0.6, rate: 1.1, out });
  } else {
    const blade = kind === 'sword';
    sample('slice', { gain: blade ? 0.7 : 0.55, rate: (blade ? 0.85 : 1.1) * (1 - 0.15 * heavy), out, reverb: verb });
    sample(heavy > 0.3 ? 'punch_heavy' : 'punch', { gain: 0.55 + 0.35 * heavy, rate: 1 - 0.15 * heavy, out, reverb: verb });
    if (blade) sample('clash', { gain: 0.14 + 0.1 * heavy, rate: 0.75, lp: 6000, out, reverb: verb }); // 刃の金属的な鳴り
    if (kind === 'throw') sample('wood', { gain: 0.35, rate: 1.2, out }); // 刺さった「トッ」
  }
  if (heavy > 0) {
    sample('thud_heavy', { gain: 0.7 * heavy, rate: 0.75, out, reverb: 0.3 });
    sample('gun_sub', { gain: 0.45 * heavy, rate: 1.3, out });
  }

  // 斬撃のノイズ
  const slashDur = 0.12 + 0.1 * heavy;
  noise('bandpass', 5200 * v, 1400 * v, kind === 'bullet' ? 0.2 : 0.4, slashDur, { q: 0.9, attack: 0.004, out });
  // 頭の鋭い当たり
  noise('highpass', 3000, 3000, 0.4, 0.025, { attack: 0.001, out });
  // 低い衝撃
  const thumpDur = 0.14 + 0.16 * heavy;
  tone((170 - 50 * heavy) * v, 42, 0.6 + 0.3 * heavy, thumpDur, { attack: 0.006, out });
}

// とどめで砕け散る: 低く重い「ドッ」に、低く落としたガラスの割れる音を乾いたまま重ねる
export function playKill() {
  if (!ctx) return;
  sample('thud_heavy', { gain: 0.9, rate: 0.6, reverb: 0.15 });
  sample('gun_sub', { gain: 0.6, rate: 0.9 });
  sample('glass', { gain: 0.45, rate: 0.55, lp: 5000, cut: 0.5 });
  sample('glass', { gain: 0.3, rate: 0.8, lp: 7000, delay: 0.03, cut: 0.35 });
  noise('lowpass', 1800, 300, 0.35, 0.3, { attack: 0.003 });
  tone(95, 30, 0.9, 0.45, { attack: 0.004 });
}

// 最後の 1 体: 砕けた瞬間に世界の音をすべて消し、砕ける一撃だけを乾いたまま太く鳴らす。
// 止まっている間は細い耳鳴りだけを残し、明ける瞬間に腹へ沈む低い「ドォン」と長い地鳴りを落とす。
// 世界の音はスローが明けるのに合わせてゆっくり戻す。どれもこもりを通さない parryBus へ出す
export function playFinale(freeze: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  worldGain.gain.cancelScheduledValues(t0);
  worldGain.gain.setValueAtTime(worldGain.gain.value, t0);
  worldGain.gain.linearRampToValueAtTime(0, t0 + 0.01);
  worldGain.gain.setValueAtTime(0, t0 + freeze + 0.5);
  worldGain.gain.linearRampToValueAtTime(1, t0 + freeze + 2.2);
  const out = parryBus;
  const dry = { out, pan: 0, jitter: 0.02 };

  // 砕ける一撃: 鋭い頭・重い胴・低く落としたガラス・鉄板の重さ
  sample('gun_crack', { ...dry, gain: 0.4, rate: 0.6, lp: 5000, cut: 0.1 });
  sample('punch_heavy', { ...dry, gain: 0.95, rate: 0.5 });
  sample('thud_heavy', { ...dry, gain: 1.0, rate: 0.5, lp: 1400 });
  sample('glass', { ...dry, gain: 0.55, rate: 0.5, lp: 5000, cut: 0.6 });
  sample('glass', { ...dry, gain: 0.35, rate: 0.72, lp: 7000, delay: 0.03, cut: 0.45, pan: 0.2 });
  sample('plate', { ...dry, gain: 0.28, rate: 0.4, lp: 2500, cut: 0.5 });
  noise('lowpass', 2400, 200, 0.45, 0.35, { attack: 0.002, out });
  tone(110, 28, 1.0, 0.5, { attack: 0.003, out });

  // 止まっている間の耳鳴り: わずかにずらした 2 本の高いサイン波を、ふくらませてから細く消す
  for (const [freq, gain] of [[3950, 0.02], [3963, 0.014]]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.12);
    g.gain.setValueAtTime(gain, t0 + freeze);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + freeze + 1.6);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + freeze + 1.7);
  }

  // 明ける瞬間の「ドォン」と、長く沈んでいく地鳴り
  sample('thud_heavy', { ...dry, gain: 0.95, rate: 0.4, lp: 600, delay: freeze });
  sample('gun_sub', { ...dry, gain: 0.85, rate: 0.6, delay: freeze });
  sample('punch_heavy', { ...dry, gain: 0.5, rate: 0.42, lp: 700, delay: freeze });
  tone(72, 22, 0.95, 1.5, { attack: 0.004, out, delay: freeze });
  noise('lowpass', 600, 40, 0.32, 2.4, { attack: 0.02, out, delay: freeze });
  // 遠くで鳴る鐘を一つ、低く
  sample('bell', { ...dry, gain: 0.22, rate: 0.5, lp: 3000, delay: freeze + 0.06 });
}

// スコアの音は画面の表示なので、スローのこもりも引き伸ばしも通さず、いつも同じ高さで鳴らす
const uiRate = (r: number) => r / (1 - 0.35 * slowAmt);

// スコアの倍率が 1 つ足された「チッ」: 小さく乾いた金属音。段が進むほど少しずつ高く、強くする
export function playScoreTick(step: number) {
  if (!ctx) return;
  const k = Math.min(step, 6);
  sample('metal_tick', { gain: 0.16 + 0.03 * k, rate: uiRate(0.85 + 0.07 * k), jitter: 0.015, lp: 7000, out: parryBus, pan: 0.15 });
  if (step > 0) sample('metal_small', { gain: 0.08 + 0.015 * k, rate: uiRate(1.1 + 0.06 * k), jitter: 0.02, cut: 0.12, out: parryBus, pan: 0.15 });
}

// スコアの確定「ドッ」: 低くこもらせた重い一打。足した倍率が多いほど少しだけ太くする
export function playScoreSlam(steps: number) {
  if (!ctx) return;
  const k = Math.min(steps, 4) / 4;
  sample('thud_heavy', { gain: 0.3 + 0.2 * k, rate: uiRate(0.8 - 0.1 * k), lp: 700, jitter: 0.02, out: parryBus, pan: 0.1 });
  sample('metal_small', { gain: 0.14, rate: uiRate(0.6), jitter: 0.02, cut: 0.25, out: parryBus, pan: 0.15 });
}

// パリィ: 弾いた瞬間に世界の音を消し、高い「キィン」の余韻だけを残す。
// 止まっていた時間が明ける瞬間に、低く重い「ドンッ」と一緒に世界の音を戻す
export function playParry(freeze: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  worldGain.gain.cancelScheduledValues(t0);
  worldGain.gain.setValueAtTime(worldGain.gain.value, t0);
  worldGain.gain.linearRampToValueAtTime(0.02, t0 + 0.012);
  worldGain.gain.setValueAtTime(0.02, t0 + freeze);
  worldGain.gain.linearRampToValueAtTime(1, t0 + freeze + 0.12);

  // 弾いた「カキン」: 刃と弾がぶつかる短い金属音
  sample('clash', { gain: 0.5, rate: 1.25, hp: 1500, out: parryBus, jitter: 0.03 });
  noise('highpass', 4000, 6000, 0.25, 0.03, { attack: 0.001, out: parryBus });
  // 長く残る「キィン」: 倍音の揃わないサイン波を、わずかにうならせながらゆっくり消す
  for (const [freq, gain, decay] of [[2480, 0.07, 1.6], [2493, 0.05, 1.4], [3720, 0.03, 1.0], [5910, 0.012, 0.6]]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    osc.connect(g).connect(parryBus);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
  }

  // 明ける瞬間の「ドンッ」
  sample('thud_heavy', { gain: 0.75, rate: 0.6, lp: 500, out: parryBus, delay: freeze, jitter: 0.02 });
  sample('gun_sub', { gain: 0.55, rate: 0.8, out: parryBus, delay: freeze });
  tone(90, 32, 0.7, 0.4, { attack: 0.004, out: parryBus, delay: freeze });
  noise('lowpass', 900, 120, 0.25, 0.35, { attack: 0.004, out: parryBus, delay: freeze });
}

// 回したときの金属音:倍音の揃わないサイン波を重ねて短く減衰させる
export function playRing(pitch = 1, volume = 1, decay = 0.35) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (const [freq, gain] of [[3150, 0.05], [4720, 0.03], [6930, 0.015]]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq * pitch * (1 - 0.35 * slowAmt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * volume, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
  }
}

// 握り直したときの「チャキッ」: 高く短い金属音を 2 つ、わずかにずらして重ね、録音の小さな金属音を添える
export function playGrip() {
  playRing(1.9, 0.5, 0.04);
  setTimeout(() => playRing(1.45, 0.7, 0.07), 25);
  sample('metal_small', { gain: 0.3, rate: 1.3 });
  sample('metal_tick', { gain: 0.18, rate: 1.4, delay: 0.025 });
}

// 武器を持ち替えた: 武器ごとに抜く音を変える
export function playEquip(weapon: 'kunai' | 'handgun' | 'sword' | 'sickle') {
  sample('gear', { gain: 0.35 });
  sample('cloth', { gain: 0.2, rate: 1.2 });
  if (weapon === 'kunai') {
    sample('knife_draw', { gain: 0.9, rate: 1.1, delay: 0.02 });
    playGrip();
  } else if (weapon === 'handgun') {
    sample('gun_latch', { gain: 0.45, rate: 1.1, delay: 0.03 });
    sample('metal_tick', { gain: 0.3, rate: 0.9, delay: 0.09 });
  } else {
    sample('unsheathe', { gain: 0.55, rate: weapon === 'sickle' ? 1.2 : 1, delay: 0.02, reverb: 0.15 });
    playRing(weapon === 'sickle' ? 1.6 : 1.2, 0.4, 0.4);
    if (weapon === 'sickle') playChain('ready');
  }
}

// 鎖鎌の鎖の「ジャラッ」。録音の鎖の音を、場面ごとに速さ・長さ・重ね方を変えて鳴らす。
// 両手の鎖が同じ瞬間に同じ音を出すことが多いので、同じ場面の音は続けて鳴らさない
export type ChainCue = 'ready' | 'windup' | 'throw' | 'taut' | 'pull' | 'reel';
const lastChain: Partial<Record<ChainCue, number>> = {};
export function playChain(cue: ChainCue) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now - (lastChain[cue] ?? -1) < 0.06) return;
  lastChain[cue] = now;
  switch (cue) {
    case 'ready': // 構えて鎖が揺れる、小さく軽い音
      sample('chain', { gain: 0.25, rate: 1.25, hp: 1200, cut: 0.18 });
      break;
    case 'windup': // 回し始めに鎖がほどける
      sample('chain', { gain: 0.35, rate: 1.1, hp: 1000, cut: 0.25 });
      break;
    case 'throw': // 放った鎖が手元から勢いよく繰り出されていく「ジャラララッ」
      sample('chain', { gain: 0.55, rate: 1.35, hp: 800, reverb: 0.08 });
      sample('chain', { gain: 0.35, rate: 1.15, hp: 800, delay: 0.07, cut: 0.35 });
      sample('metal_tick', { gain: 0.12, rate: 1.6, delay: 0.03 });
      break;
    case 'taut': // 刺さって鎖がビンと張る「ジャキッ」
      sample('chain', { gain: 0.5, rate: 0.95, hp: 600, cut: 0.16 });
      break;
    case 'pull': // 張った鎖をたぐって一気に引き寄せる、重めで長い音
      sample('chain', { gain: 0.6, rate: 0.85, hp: 400, reverb: 0.12 });
      sample('chain', { gain: 0.4, rate: 1.05, hp: 700, delay: 0.06, cut: 0.4 });
      break;
    case 'reel': // 鎖を巻き戻す
      sample('chain', { gain: 0.4, rate: 1.3, hp: 900, cut: 0.3 });
      break;
  }
}

// 投げたクナイが壁や地面に刺さった「カッ」
export function playStick() {
  sample('wood', { gain: 0.6, rate: 1.1 });
  sample('metal_small', { gain: 0.22, rate: 0.8 });
  playRing(0.6, 0.5, 0.15);
}

// クナイを投げる: 腕の振りの風切りに、袖のはためきを添える
export function playThrow(s: SwishParams) {
  playSwish(s);
  sample('cloth', { gain: 0.18, rate: 1.4 });
}

// 投げる溜めを始めた・1 段溜まった
export function playCharge(stage: number) {
  if (stage === 0) {
    playRing(0.8, 0.6, 0.2);
    sample('metal_small', { gain: 0.25, rate: 0.9 });
  } else {
    playRing(0.8 + 0.25 * stage, 1.4, 0.3);
    sample('glass', { gain: 0.12 + 0.05 * stage, rate: 0.9 + 0.15 * stage });
  }
}

// 居合の構え: 鯉口を切る「チャッ」と、空気を吸い込むような逆再生のうねり
export function playFocusStart() {
  playGrip();
  playSwish({ dur: 0.3, f0: 250, f1: 700, gain: 0.2 }, 'sword');
  sample('focus', { gain: 0.5, rate: 0.55, reversed: true, lp: 3000, reverb: 0.4 });
  sample('knife_draw', { gain: 0.5, rate: 0.75 });
}

// ロックオンした瞬間の「キン」: 合成の金属音に、鐘とガラスの余韻を重ねる
export function playLockOn() {
  playRing(1.6, 0.9, 0.25);
  sample('bell', { gain: 0.16, rate: 1.6, reverb: 0.5 });
  sample('glass', { gain: 0.18, rate: 1.2, reverb: 0.3 });
}

// 居合の突進: 地を蹴る重い踏み込みと、大きく空気を裂く音
export function playRush() {
  playSwish({ dur: 0.3, f0: 200, f1: 1100, gain: 0.6 }, 'sword');
  sample('step_hard', { gain: 0.8, rate: 0.7 });
  sample('thud_heavy', { gain: 0.6, rate: 0.9 });
  sample('swish', { gain: 0.6, rate: 0.5, reversed: true });
  noise('bandpass', 300, 2600, 0.35, 0.35, { attack: 0.12, q: 0.6 });
  tone(90, 40, 0.4, 0.3);
}

// ---- ハンドガンの装填 ----
export function playCraneOpen() {
  sample('gun_latch', { gain: 0.5, rate: 1.05 });
  playRing(0.75, 0.6, 0.05);
  setTimeout(() => playRing(1.0, 0.4, 0.04), 30);
}

export function playEject() {
  sample('metal_small', { gain: 0.4, rate: 1.0 });
  playRing(1.2, 0.5, 0.06);
  for (let i = 0; i < 6; i++) {
    const d = (20 + Math.random() * 70) / 1000;
    sample('plate', { gain: 0.08, rate: rand(1.6, 2.1), delay: d, pan: rand(-0.4, 0.4) });
    setTimeout(() => playRing(2 + Math.random() * 0.6, 0.1, 0.1), d * 1000);
  }
}

export function playSeat() {
  sample('metal_tick', { gain: 0.4, rate: 0.8 });
  sample('gun_latch', { gain: 0.3, rate: 1.3, delay: 0.02 });
  playRing(0.8, 0.8, 0.06);
  setTimeout(() => playRing(1.1, 0.5, 0.05), 20);
}

// つまみをひねって弾を放す
export function playLoaderRelease() {
  playRing(1.6, 0.3, 0.03);
  sample('metal_tick', { gain: 0.15, rate: 1.6 });
}

// 指で弾いてシリンダーを空回しする（ラチェットのカリカリ音つき）
export function playCylinderSpin() {
  for (let i = 0; i < 7; i++) {
    const vol = 1 - i / 8;
    sample('metal_tick', { gain: 0.2 * vol, rate: 2.1, delay: (i * 28) / 1000, jitter: 0.03 });
    setTimeout(() => playRing(1.8, 0.12 * vol, 0.02), i * 28);
  }
}

// 振り戻して閉じた「カシャン」
export function playCraneClose() {
  playGrip();
  sample('gun_latch', { gain: 0.6, rate: 0.9 });
  sample('metal_small', { gain: 0.25, rate: 0.85, delay: 0.015 });
  playRing(0.9, 0.8, 0.08);
}

// 空薬莢が跳ねた「チン」。near は 0〜1（遠いほど小さい）
export function playCasing(volume: number) {
  playRing(2.3 + Math.random() * 0.7, 0.18 * volume, 0.14);
  sample('plate', { gain: 0.25 * volume, rate: rand(1.7, 2.3), pan: rand(-0.5, 0.5) });
}

// 弾が壁や地面に当たった: 硬い着弾音に、ときどき跳弾の「ピュン」を混ぜる
export function playRicochet() {
  sample('ricochet', { gain: 0.45, rate: rand(0.9, 1.2), reverb: 0.15 });
  playRing(0.45 + Math.random() * 0.15, 0.35, 0.06);
  if (Math.random() < 0.4) {
    tone(rand(2600, 3400), rand(900, 1300), 0.05, 0.28, { type: 'triangle', delay: 0.01, attack: 0.01 });
  }
}

// ---- 体の動き ----

// 足音。speed は 0〜1（歩き〜全力疾走）
let stepSide = 1;
export function playFootstep(speed: number) {
  stepSide = -stepSide;
  const pan = 0.15 * stepSide;
  sample('step', { gain: 0.16 + 0.2 * speed, rate: 0.9 + 0.15 * speed, lp: 2600 + 3000 * speed, pan });
  if (speed > 0.6) sample('step_hard', { gain: 0.12 * speed, rate: 0.9, pan });
  if (Math.random() < 0.3 + 0.4 * speed) sample('cloth', { gain: 0.05 + 0.06 * speed, rate: 1.5, pan });
}

export function playJump() {
  sample('step', { gain: 0.3, rate: 1.1, lp: 4000 });
  sample('cloth', { gain: 0.22, rate: 1.2 });
  noise('bandpass', 400, 1200, 0.05, 0.2, { attack: 0.05 });
}

// 着地。impact は落ちる速さ (m/s)
export function playLand(impact: number) {
  const k = Math.min(1, impact / 18);
  if (impact < 2) return;
  sample('step', { gain: 0.25 + 0.3 * k, rate: 0.85, pan: -0.15 });
  sample('step', { gain: 0.2 + 0.25 * k, rate: 0.8, pan: 0.15, delay: 0.03 });
  sample('thud', { gain: 0.3 + 0.4 * k, rate: 1 - 0.2 * k });
  sample('cloth', { gain: 0.15 + 0.15 * k });
  if (impact > 9) {
    sample('thud_heavy', { gain: 0.8 * k, rate: 0.8, reverb: 0.25 });
    tone(80, 35, 0.5 * k, 0.3);
  }
}

// ダッシュ: 空気を押しのける「ボッ」と、体が風を切る音
export function playDash() {
  noise('bandpass', 300, 2400, 0.45, 0.28, { attack: 0.02, q: 0.7, reverb: 0.1 });
  sample('swish', { gain: 0.55, rate: 0.55, reverb: 0.1 });
  sample('cloth', { gain: 0.3, rate: 1.1 });
  tone(95, 45, 0.3, 0.18);
}

export function playSlideStart() {
  sample('thud', { gain: 0.4, rate: 0.9 });
  sample('cloth', { gain: 0.35 });
  sample('step_hard', { gain: 0.3, rate: 0.7 });
}

// 縁に手を掛けた「パシッ」
export function playMantleStart() {
  sample('thud', { gain: 0.45, rate: 1.3, hp: 300 });
  sample('cloth', { gain: 0.35, rate: 0.9 });
}

// 体を縁に乗せきった
export function playMantleEnd() {
  sample('step', { gain: 0.35, rate: 0.85 });
  sample('thud', { gain: 0.25, rate: 0.9, delay: 0.04 });
}

export function playWallRunStart() {
  sample('step_hard', { gain: 0.4, rate: 0.9 });
  sample('cloth', { gain: 0.25 });
}

// ---- 訓練場へ入る演出 ----
// 画面の切り替え: 帯が覆いかぶさる「シュッ」と、抜けていく柔らかい空気
export function playTransition() {
  noise('bandpass', 300, 1800, 0.2, 0.38, { attack: 0.25, q: 0.6 });
  sample('swish', { gain: 0.3, rate: 0.5, delay: 0.15 });
  noise('bandpass', 1600, 380, 0.14, 0.6, { attack: 0.06, q: 0.5, reverb: 0.3, delay: 0.65 });
}

// 地面から箱が伸び上がる間の、低く重い地鳴り
export function playStageRise(delay = 0) {
  noise('lowpass', 160, 60, 0.3, 1.9, { attack: 0.35, reverb: 0.3, delay });
  tone(48, 34, 0.22, 1.8, { attack: 0.3, delay });
  sample('gear', { gain: 0.12, rate: 0.45, delay: delay + 0.2, lp: 900, reverb: 0.3 });
}

// アリーナが伸びきって止まった「ズン」
export function playStageSettle() {
  sample('thud_heavy', { gain: 0.5, rate: 0.6, lp: 1500, reverb: 0.35 });
  tone(70, 30, 0.3, 0.5);
}

// タイトルを叩きつける直前の「スゥッ」: 吸い込むように高まり、叩きつける瞬間にぷつりと切れる（dur 秒で頂点）
export const TITLE_RISER_TIME = 0.32;
export function playTitleRiser() {
  if (!ctx) return;
  noise('bandpass', 350, 3200, 0.22, TITLE_RISER_TIME, { attack: TITLE_RISER_TIME - 0.01, q: 0.9 });
  noise('lowpass', 120, 900, 0.18, TITLE_RISER_TIME, { attack: TITLE_RISER_TIME - 0.01 });
}

// ステージの始まりにタイトルを叩きつける「バ・ダンッ」。FAST が落ちる一打と、0.07 秒遅れて FINISH が落ちる二打の 2 段にする。
// 一打目は、鋭い破裂音の頭・重い打撃の胴・鉄板の重さ・腹に来る低音を重ねて、始まったことが一瞬でわかるようにする。
// 響きは控えめにして、短く詰まった重さを保つ
export function playTitleSlam() {
  if (!ctx) return;
  // 一打目（FAST）
  sample('gun_crack', { gain: 0.5, rate: 0.7, lp: 6000, cut: 0.15, jitter: 0.02 });
  sample('punch_heavy', { gain: 0.85, rate: 0.6, jitter: 0.02 });
  sample('thud_heavy', { gain: 0.9, rate: 0.5, lp: 1600, reverb: 0.12, jitter: 0.02 });
  sample('plate', { gain: 0.32, rate: 0.45, lp: 3200, cut: 0.4, jitter: 0.02 });
  sample('gun_sub', { gain: 0.55, rate: 0.7 });
  noise('lowpass', 3500, 180, 0.4, 0.32);
  tone(72, 26, 0.6, 0.6, { attack: 0.002 });
  // 二打目（FINISH）: 一打目より少し軽く、高めに
  sample('punch_heavy', { gain: 0.55, rate: 0.78, delay: 0.07, jitter: 0.02 });
  sample('plate', { gain: 0.2, rate: 0.6, lp: 3500, cut: 0.3, delay: 0.07, jitter: 0.02 });
  sample('clash', { gain: 0.16, rate: 0.5, lp: 4000, cut: 0.3, delay: 0.07 });
  tone(95, 40, 0.32, 0.35, { attack: 0.002, delay: 0.07 });
  // 余韻: 低い地鳴りを短く
  noise('lowpass', 140, 45, 0.16, 1.1, { attack: 0.05, delay: 0.05, reverb: 0.2 });
}

export function playWallJump() {
  sample('step_hard', { gain: 0.5, rate: 0.85 });
  sample('step', { gain: 0.35 });
  sample('cloth', { gain: 0.3, rate: 1.1 });
  noise('bandpass', 350, 1800, 0.2, 0.25, { attack: 0.03 });
}

// ---- UI ----
// タイトルや一時停止の画面の音。一時停止中はゲームの音（ctx）を止めているので、UI は別の AudioContext で鳴らす。
// 素材は使わず、短い合成音だけで小さく乾いた音にする
let ui: AudioContext | null = null;
let uiBus: GainNode;
let uiNoiseBuf: AudioBuffer;
let lastHover = 0;

// ユーザー操作の中で呼ぶ（それより前は鳴らせない）
export function ensureUiAudio() {
  if (!ui) {
    ui = new AudioContext();
    uiNoiseBuf = ui.createBuffer(1, ui.sampleRate / 2, ui.sampleRate);
    const d = uiNoiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const comp = ui.createDynamicsCompressor();
    // 大きく鳴らすので、割れないよう天井で押さえるリミッターとして使う
    comp.threshold.value = -3;
    comp.knee.value = 0;
    comp.ratio.value = 12;
    comp.attack.value = 0.001;
    comp.release.value = 0.08;
    uiBus = ui.createGain();
    uiBus.gain.value = 7;
    uiBus.connect(comp).connect(ui.destination);
  }
  if (ui.state === 'suspended') ui.resume();
}

function uiTone(f0: number, f1: number, peak: number, dur: number, o: { type?: OscillatorType; delay?: number; lp?: number } = {}) {
  if (!ui || ui.state !== 'running') return;
  const t0 = ui.currentTime + (o.delay ?? 0);
  const osc = ui.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ui.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const f = ui.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    node = node.connect(f);
  }
  node.connect(g).connect(uiBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function uiClick(type: BiquadFilterType, f0: number, f1: number, peak: number, dur: number, delay = 0) {
  if (!ui || ui.state !== 'running') return;
  const t0 = ui.currentTime + delay;
  const src = ui.createBufferSource();
  src.buffer = uiNoiseBuf;
  const f = ui.createBiquadFilter();
  f.type = type;
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ui.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(uiBus);
  src.start(t0, Math.random() * 0.3);
  src.stop(t0 + dur + 0.02);
}

// 項目に乗ったときの、ごく小さい「チッ」
export function playUiHover() {
  if (!ui) return;
  const now = ui.currentTime;
  if (now - lastHover < 0.04) return; // なぞったときに鳴りすぎないように
  lastHover = now;
  uiClick('bandpass', 3800, 2600, 0.06, 0.025);
  uiTone(1500, 1300, 0.012, 0.03);
}

// 決定: 低く締まった「トッ」
export function playUiSelect() {
  uiClick('bandpass', 2600, 1200, 0.12, 0.035);
  uiTone(190, 85, 0.28, 0.14);
}

// 開く（モード選択・操作説明）: 上がっていく 2 つの刻み
export function playUiOpen() {
  uiClick('bandpass', 2400, 2000, 0.07, 0.025);
  uiTone(620, 600, 0.03, 0.05);
  uiClick('bandpass', 3200, 2800, 0.06, 0.025, 0.055);
  uiTone(930, 900, 0.025, 0.06, { delay: 0.055 });
}

// 戻る・閉じる: 下がっていく刻み
export function playUiBack() {
  uiClick('bandpass', 2600, 1400, 0.07, 0.04);
  uiTone(720, 430, 0.04, 0.09);
}

// 選べない項目: 鈍く 2 回つかえる
export function playUiDenied() {
  for (const delay of [0, 0.085]) {
    uiTone(150, 130, 0.12, 0.07, { type: 'triangle', delay, lp: 600 });
    uiClick('lowpass', 900, 400, 0.05, 0.04, delay);
  }
}

// 一時停止: こもりながら沈む「ドゥン」
export function playUiPause() {
  uiClick('lowpass', 1400, 180, 0.12, 0.28);
  uiTone(230, 105, 0.14, 0.22);
}

// ---- ステージの結果 ----
// 一時停止中に出すので UI の AudioContext で鳴らす。素材は使わず、低い一打と乾いた刻みだけで重く静かにまとめる

// 記録を数え上げる刻み: k は 0〜1 の進み。進むほど少し高くする
export function playResultTick(k: number) {
  uiClick('bandpass', 3000 + 1600 * k, 2400 + 1200 * k, 0.05, 0.02);
  uiTone(900 + 500 * k, 800 + 450 * k, 0.012, 0.025);
}

// 1 行を数え終えて締める「カチッ」
export function playResultLock() {
  uiClick('bandpass', 2200, 900, 0.14, 0.05);
  uiTone(210, 110, 0.3, 0.16);
}

// 合計を確定させる「ドッ」
export function playResultScore() {
  uiClick('bandpass', 3400, 800, 0.14, 0.05);
  uiClick('lowpass', 1800, 120, 0.36, 0.4);
  uiTone(120, 42, 0.7, 0.55);
}

// ランクを落とす「ズドン」。上のランクほど低く長く沈め、S は遠い鐘のような細い余韻を足す
export function playResultRank(rank: string) {
  const k = ({ S: 1, A: 0.7, B: 0.4 } as Record<string, number>)[rank] ?? 0.2;
  uiClick('bandpass', 4600, 700, 0.18, 0.07);
  uiClick('lowpass', 2400, 70, 0.4 + 0.2 * k, 0.6 + 0.6 * k);
  uiTone(76 - 14 * k, 26, 0.95, 0.9 + 0.8 * k);
  uiClick('lowpass', 260, 35, 0.2 + 0.1 * k, 1.4 + 1.2 * k, 0.05);
  if (rank === 'S') {
    uiTone(1320, 1316, 0.02, 2.4, { delay: 0.08 });
    uiTone(1986, 1980, 0.008, 1.8, { delay: 0.08 });
  }
}

// NEW RECORD などの札を押す「タンッ」
export function playResultStamp() {
  uiClick('bandpass', 2800, 1500, 0.1, 0.04);
  uiTone(330, 200, 0.12, 0.1, { type: 'triangle', lp: 1800 });
}

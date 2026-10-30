import { BOSS_LIMBS, boss } from '../enemy/boss.js';

// ---- HUD: ボスの体力（画面の中央上） ----
// 帯 1 本。部位がすべて故障するまでは、部位 4 つの体力の合計を白い斜線の入った灰色の帯（装甲）で黒い本体の手前に重ねる。% は本体の割合
// 削れた分は赤い帯（.c）として残し、少し待ってから実際の量まで縮める
const CHIP_HOLD = 0.45; // 削れてから赤い帯が縮み始めるまで (秒)
const CHIP_SPEED = 0.8; // 赤い帯の縮む速さ (帯の長さ/秒)

// clip: 帯を縮めずに右から切る（装甲の板の模様が伸び縮みしないように）
type Bar = { fill: HTMLElement; chip: HTMLElement; shown: number; chipShown: number; hold: number; clip: boolean };
const makeBar = (el: HTMLElement, clip = false): Bar => ({
  fill: el.querySelector<HTMLElement>('.f')!,
  chip: el.querySelector<HTMLElement>('.c')!,
  shown: 1,
  chipShown: 1,
  hold: 0,
  clip,
});
const setLength = (el: HTMLElement, ratio: number, clip: boolean) => {
  if (clip) el.style.clipPath = `inset(0 ${((1 - ratio) * 100).toFixed(2)}% 0 0)`;
  else el.style.transform = `scaleX(${ratio.toFixed(3)})`;
};

const hud = document.getElementById('boss')!;
const pct = hud.querySelector<HTMLElement>('.head .pct')!;
const core = makeBar(hud.querySelector<HTMLElement>('.bar.core')!);
const parts = makeBar(hud.querySelector<HTMLElement>('.bar.core .parts')!, true); // 部位の体力の合計（本体の帯の手前に重ねる装甲）
let last = performance.now();

function setBar(b: Bar, ratio: number, dt: number) {
  if (ratio < b.shown) b.hold = CHIP_HOLD;
  b.shown = ratio;
  if (b.chipShown < ratio) b.chipShown = ratio; // 回復や出し直しのときはすぐ合わせる
  else if (b.hold > 0) b.hold -= dt;
  else b.chipShown = Math.max(ratio, b.chipShown - CHIP_SPEED * dt);
  setLength(b.fill, ratio, b.clip);
  setLength(b.chip, b.chipShown, b.clip);
}

export function updateBossHud() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const shown = !!boss.rig && boss.rig.root.visible && !boss.entering; // 登場の演出では、砲を向けた瞬間に出す
  hud.hidden = !shown;
  if (!shown) return;
  let partsHp = 0;
  for (const k of BOSS_LIMBS) {
    const l = boss.limbs[k];
    if (!l.broken) partsHp += Math.max(l.hp, 0);
  }
  const partsRatio = partsHp / (boss.limbMax * BOSS_LIMBS.length);
  setBar(parts, partsRatio, dt);
  const ratio = Math.max(boss.coreHp, 0) / boss.coreMax;
  setBar(core, ratio, dt);
  pct.textContent = `${Math.ceil(ratio * 100)}%`;
}

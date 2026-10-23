import * as THREE from 'three';
import { PAD, pollPad } from '../gamepad.js';
import { keys, padMove, pressed } from '../input.js';
import { DEG } from '../math.js';
import { controls } from '../core.js';
import { type WeaponId } from '../weapons/ids.js';
import { axeState } from '../weapons/axeCombat.js';
import { swordState } from '../weapons/swordCombat.js';
import { gunState } from '../weapons/handgunCombat.js';
import { sickleState } from '../weapons/sickleCombat.js';
import { viewState } from '../weapons/viewModelMotion.js';
import { options } from '../ui/options.js';
import { overlay } from '../ui/overlay.js';
import { ASSIST_PULL, ASSIST_SLOW, ASSIST_SNAP, findAssistTarget } from './aimAssist.js';
import { turnView, zoomLookScale } from './look.js';
import { game } from '../game/state.js';
import { hooks } from '../game/hooks.js';

// ---- ゲームパッドの割り当て ----
// ボタンはキーに置き換えて keys / pressed に入れ、キーボードと同じ処理を通す

// 本体からも読み書きする値
export const padState = {
  fromPad: false, // パッドのボタンから送ったキー操作を処理している間だけ true
  padSprint: false,
};

export const PAD_KEYS: [number, string][] = [
  [PAD.A, 'Space'], // ジャンプ
  [PAD.B, 'KeyC'], // スライド
  [PAD.L3, 'ShiftLeft'], // ダッシュ
];
export const PAD_WEAPONS: [number, WeaponId][] = [
  [PAD.UP, 'kunai'],
  [PAD.RIGHT, 'handgun'],
  [PAD.DOWN, 'sword'],
  [PAD.LEFT, 'sickle'],
];
export const WEAPON_ORDER: WeaponId[] = ['kunai', 'handgun', 'sword', 'sickle', 'axe']; // LB / RB で順に回す
// タイトル / 一時停止の画面では、メニューのキー操作に置き換える
export const PAD_MENU_KEYS: [number, string][] = [
  [PAD.A, 'Enter'],
  [PAD.START, 'Enter'],
  [PAD.B, 'Escape'],
  [PAD.Y, 'KeyQ'], // 一時停止からタイトルへ
  [PAD.X, 'KeyO'], // オプション
  [PAD.UP, 'ArrowUp'],
  [PAD.DOWN, 'ArrowDown'],
  [PAD.LEFT, 'ArrowLeft'],
  [PAD.RIGHT, 'ArrowRight'],
  [PAD.LB, 'PageUp'], // 武器の選択画面でカーソルを動かす
  [PAD.RB, 'PageDown'],
];
export const PAD_LOOK_SPEED = 4.2; // 右スティックを倒しきったときの視点の速さ (rad/s)
export const PAD_LOOK_CURVE = 2.2; // 小さく倒したときに細かく狙えるよう、倒した量を累乗して使う
export const PAD_SPRINT = 0.9; // 左スティックをこれ以上倒すと走る

export function sendPadKey(code: string) {
  padState.fromPad = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
  padState.fromPad = false;
}

// 毎フレーム、ゲームの更新の前に呼ぶ（dt は実時間。視点の速さはスローの影響を受けない）
// パッドの遅れを調べる: ?pad で、入力が届く間隔とフレームの間隔を 1 秒ごとに左上へ出す
export const padDebug = new URLSearchParams(location.search).has('pad') ? document.createElement('div') : null;
if (padDebug) {
  padDebug.style.cssText =
    'position:fixed;left:12px;top:12px;z-index:100;padding:6px 10px;background:rgba(0,0,0,0.6);color:#fff;' +
    'font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre;pointer-events:none';
  document.body.appendChild(padDebug);
}
// エイムアシストの状態は毎フレーム書き換える
export const padAssistEl = padDebug ? document.createElement('div') : null;
if (padAssistEl) {
  padAssistEl.style.cssText = padDebug!.style.cssText.replace('top:12px', 'top:64px');
  document.body.appendChild(padAssistEl);
}
let padLastStamp = 0;
let padDebugT = 0;
export const padGaps: number[] = [];
export const frameGaps: number[] = [];
export function updatePadDebug(dt: number, stamp: number) {
  if (!padDebug) return;
  frameGaps.push(dt * 1000);
  // 時刻が変わったときだけ新しい入力が届いている（スティックを動かしている間に見る）
  if (stamp && stamp !== padLastStamp) {
    if (padLastStamp) padGaps.push(stamp - padLastStamp);
    padLastStamp = stamp;
  }
  padDebugT += dt;
  if (padDebugT < 1) return;
  padDebugT = 0;
  const fmt = (a: number[]) =>
    a.length ? `平均 ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1)} / 最大 ${Math.max(...a).toFixed(1)} ms` : '—';
  padDebug.textContent =
    `入力  ${fmt(padGaps)}  (${padGaps.length} 回/秒)\n` +
    `描画  ${fmt(frameGaps)}  (${frameGaps.length} fps, 50ms 超え ${frameGaps.filter((v) => v > 50).length})`;
  padGaps.length = frameGaps.length = 0;
}

export function updatePad(dt: number) {
  const pad = pollPad();
  updatePadDebug(dt, pad.timestamp);
  // 離したことはどの画面でも反映する（押したまま一時停止して、そこで離すこともある）
  for (const [b, code] of PAD_KEYS) if (pad.up[b]) keys.delete(code);
  if (pad.up[PAD.RT]) game.attackHeld = false;
  if (pad.up[PAD.LT]) game.throwHeld = false;
  padMove.x = padMove.y = 0;
  padState.padSprint = false;
  if (!pad.connected) return;

  if (!controls.isLocked) {
    if (overlay.classList.contains('hidden') || overlay.classList.contains('leaving')) return;
    for (const [b, code] of PAD_MENU_KEYS) if (pad.down[b]) return sendPadKey(code);
    return;
  }
  if (pad.down[PAD.START]) return hooks.pauseGame();

  for (const [b, code] of PAD_KEYS) {
    if (!pad.down[b]) continue;
    keys.add(code);
    pressed.add(code);
  }
  if (pad.down[PAD.RT]) game.attackPressed = game.attackHeld = true;
  if (pad.down[PAD.LT]) game.throwHeld = sickleState.throwPressed = swordState.focusPressed = axeState.axeLaunchPressed = gunState.deadEyePressed = true;
  if (pad.down[PAD.X]) gunState.reloadQueued = sickleState.tossPressed = true;
  const cycle = (pad.down[PAD.RB] ? 1 : 0) - (pad.down[PAD.LB] ? 1 : 0);
  if (cycle) game.wantWeapon = WEAPON_ORDER[(WEAPON_ORDER.indexOf(game.wantWeapon) + cycle + WEAPON_ORDER.length) % WEAPON_ORDER.length];
  for (const [b, id] of PAD_WEAPONS) if (pad.down[b]) game.wantWeapon = id;

  padMove.x = pad.lx;
  padMove.y = -pad.ly;
  padState.padSprint = Math.hypot(pad.lx, pad.ly) >= PAD_SPRINT;

  const m = Math.hypot(pad.rx, pad.ry);
  if (m > 0 || padState.padSprint || pad.lx || pad.ly || pad.down.some(Boolean)) game.usingPad = true;
  const target = findAssistTarget();
  // 敵の近くでは視点を遅くし、スティックか体を動かしている間だけ照準を胸へ寄せる（止まっていると勝手には動かさない）
  let slow = 1;
  if (target) {
    const near = 1 - target.angle / target.size; // 範囲の端で 0、胸の真上で 1
    slow = 1 - (1 - ASSIST_SLOW) * near;
    const active = Math.min(1, Math.max(m, Math.hypot(pad.lx, pad.ly)));
    const pull = 1 - Math.exp(-ASSIST_PULL * active * dt);
    if (pull > 0) turnView(target.yaw * pull, -target.pitch * pull);
  }
  if (padAssistEl) {
    padAssistEl.textContent = !game.usingPad
      ? 'アシスト  切（マウス操作中）'
      : game.shownWeapon !== 'kunai' && game.shownWeapon !== 'handgun'
        ? 'アシスト  切（クナイ / 銃以外）'
        : target
          ? `アシスト  ● 捕捉中  ずれ ${(target.angle / DEG).toFixed(1)}° / 範囲 ${(target.size / DEG).toFixed(1)}°  速さ ×${slow.toFixed(2)}${target.angle < target.size * ASSIST_SNAP ? '  弾補正' : ''}`
          : 'アシスト  ○ 範囲外';
  }
  if (m > 0) {
    const k = (Math.pow(m, PAD_LOOK_CURVE) / m) * PAD_LOOK_SPEED * options.padSens * dt * zoomLookScale() * slow;
    turnView(pad.rx * k, pad.ry * k);
    // マウスと同じく、回した量の 1/4 だけ武器を遅らせる
    viewState.lookSwayX = THREE.MathUtils.clamp(viewState.lookSwayX + pad.rx * k * 0.25, -0.06, 0.06);
    viewState.lookSwayY = THREE.MathUtils.clamp(viewState.lookSwayY + pad.ry * k * 0.25, -0.06, 0.06);
  }
}

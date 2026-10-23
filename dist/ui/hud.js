import { HOOK_RECHARGE, sickleState } from '../weapons/sickleCombat.js';
import { weaponHud } from './weaponHud.js';
import { hudImpulse } from './hudSway.js';
import { PLAYER_MAX_HP } from '../player/config.js';
import { game } from '../game/state.js';
// ---- HUD: ダッシュの残り回数（クロスヘア左右の円弧。左が 1 回目、右が 2 回目） ----
export const dashGauges = [...document.querySelectorAll('#crosshair .gauge')];
// ---- HUD: 鎖鎌の引き寄せの残り回数（クロスヘアの下の斜めの帯 2 本。左から使い、左から溜まる）。鎖鎌を構えている間だけ出す ----
export const hookHud = document.getElementById('hookgauge');
export const hookCells = [...hookHud.querySelectorAll('.cell')];
export const hookFills = hookCells.map((c) => c.querySelector('.f'));
export const hookKey = document.getElementById('hookkey');
export let hookShown = -1; // 表示に反映済みの残り回数
export function updateHookHud() {
    hookHud.style.opacity = game.shownWeapon === 'sickle' ? '1' : '0';
    // 1 本でも溜まっていて、まだ投げていない間だけ、押すボタンを帯の左に出す
    hookKey.classList.toggle('show', game.shownWeapon === 'sickle' && sickleState.hookCharges > 0 && !sickleState.grapple);
    hookHud.classList.toggle('empty', sickleState.hookEmptyFlash > 0);
    for (let i = 0; i < hookCells.length; i++) {
        const fill = i < sickleState.hookCharges ? 1 : i === sickleState.hookCharges ? sickleState.hookRecharge / HOOK_RECHARGE : 0;
        hookFills[i].style.transform = `scaleX(${fill.toFixed(3)})`;
        hookCells[i].classList.toggle('ready', i < sickleState.hookCharges);
        // 溜まりきった帯を光らせる（最初の表示では光らせない）
        if (hookShown >= 0 && i >= hookShown && i < sickleState.hookCharges) {
            hookCells[i].classList.remove('gain');
            void hookCells[i].offsetWidth; // 続けて溜まったときも頭から再生し直す
            hookCells[i].classList.add('gain');
        }
    }
    hookShown = sickleState.hookCharges;
}
// ---- HUD: 体力（左下の斜めのバー。削れた分は白く残り、少し遅れて減る） ----
export const HP_CHIP_HOLD = 0.45; // 白い残りが減り始めるまでの時間
export const HP_CHIP_DRAIN = 75; // 白い残りが減る速さ (HP/秒)
export const HP_LOW = 30; // これ以下でバーを点滅させる
export const HP_HEAVY = 25; // これ以上のダメージは大きく揺らす
export let hpShown = PLAYER_MAX_HP; // 表示中の量。減るときは即座に、回復は滑らかに追いつく
export let hpChip = PLAYER_MAX_HP; // 白く残っている所までの量
export let hpChipHold = 0;
export let hpCount = PLAYER_MAX_HP; // 数字に出している量。減るときは一気に数え下ろす
export const HP_COUNT_SPEED = 140; // 数え下ろす速さ (HP/秒)
export const hpHud = document.getElementById('hp');
export const hpNumRow = hpHud.querySelector('.num');
export const hpNum = hpNumRow.querySelector('span');
export const hpBar = hpHud.querySelector('.bar');
export const hpFill = hpBar.querySelector('.f');
export const hpChipBar = hpBar.querySelector('.c');
export const hurtFlash = document.querySelector('#hurt .flash');
export const hurtLow = document.querySelector('#hurt .low');
// 曲面 HUD の傾き（index.html の --hud-yaw / --hud-pitch）。被弾時はここから一瞬深く傾ける
export const hudStyle = getComputedStyle(document.getElementById('hud'));
export const HUD_YAW = parseFloat(hudStyle.getPropertyValue('--hud-yaw')) || 0;
export const HUD_PITCH = parseFloat(hudStyle.getPropertyValue('--hud-pitch')) || 0;
// 左右の HUD を、殴られて奥へ押し込まれたように傾けてから戻す。side は左が 1、右が -1
export function kickHudPanel(el, side, kick, duration) {
    const tf = (pitch, yaw, z) => `rotateX(${HUD_PITCH + pitch}deg) rotateY(${side * (HUD_YAW + yaw)}deg) translateZ(${z}px)`;
    el.animate([
        { transform: tf(kick * 0.4, kick, -kick * 3) },
        { transform: tf(-kick * 0.1, -kick * 0.25, 0), offset: 0.35 },
        { transform: tf(0, 0, 0) },
    ], { duration, easing: 'cubic-bezier(.2, .8, .3, 1)' });
}
// 体力の HUD に被弾を出す。before は削られる前の体力
export function showPlayerDamage(amount, before) {
    hpShown = game.playerHp;
    hpChipHold = HP_CHIP_HOLD;
    // バーを揺らす（斜めの形は保ったまま）
    const heavy = amount >= HP_HEAVY;
    const amp = heavy ? 14 : 6;
    hpBar.animate([
        { transform: 'skewX(-24deg) translate(0, 0)' },
        { transform: `skewX(-24deg) translate(${-amp}px, ${amp * 0.4}px)` },
        { transform: `skewX(-24deg) translate(${amp * 0.8}px, ${-amp * 0.3}px)` },
        { transform: `skewX(-24deg) translate(${-amp * 0.4}px, 0)` },
        { transform: 'skewX(-24deg) translate(0, 0)' },
    ], { duration: heavy ? 360 : 260, easing: 'ease-out' });
    // 数字を叩かれたように一瞬大きくし、ダメージ量を横に飛ばす
    hpNum.animate([
        { transform: `translate(0, 0) scale(${heavy ? 1.22 : 1.12})` },
        { transform: 'translate(-4px, 2px) scale(1.04)', offset: 0.35 },
        { transform: 'translate(0, 0) scale(1)' },
    ], { duration: heavy ? 320 : 240, easing: 'ease-out' });
    const pop = document.createElement('div');
    pop.className = 'pop';
    pop.textContent = `−${Math.round(amount)}`;
    hpNumRow.appendChild(pop);
    pop.animate([
        { transform: `translate(0, 8px) scale(${heavy ? 1.5 : 1.25})`, opacity: 1 },
        { transform: 'translate(22px, -26px) scale(1)', opacity: 1, offset: 0.35 },
        { transform: 'translate(36px, -48px) scale(0.95)', opacity: 0 },
    ], { duration: 720, easing: 'cubic-bezier(.2, .8, .3, 1)' }).onfinish = () => pop.remove();
    // 削れた所の真ん中に斬り傷の線を走らせる
    const cut = document.createElement('div');
    cut.className = 'cut';
    cut.style.left = `calc(${(((before + game.playerHp) / 2) / PLAYER_MAX_HP) * 100}% - 1px)`;
    hpBar.appendChild(cut);
    cut.animate([
        { transform: 'skewX(24deg) rotate(28deg) scaleY(0)', opacity: 1 },
        { transform: 'skewX(24deg) rotate(28deg) scaleY(1.2)', opacity: 1, offset: 0.3 },
        { transform: 'skewX(24deg) rotate(28deg) scaleY(1.4)', opacity: 0 },
    ], { duration: heavy ? 420 : 320, easing: 'ease-out' }).onfinish = () => cut.remove();
    hpFill.animate([{ filter: 'brightness(3.5)' }, { filter: 'brightness(1)' }], { duration: heavy ? 260 : 160 });
    // 画面の縁を一瞬暗く絞り、曲面 HUD ごと押し込む
    hurtFlash.animate([{ opacity: heavy ? 1 : 0.6 }, { opacity: 0 }], { duration: heavy ? 650 : 420, easing: 'ease-out' });
    kickHudPanel(hpHud, 1, heavy ? 9 : 4.5, heavy ? 520 : 380);
    kickHudPanel(weaponHud, -1, heavy ? 5 : 2.5, heavy ? 520 : 380);
    // HUD 全体も殴られた向きへ弾き、奥へ押し込む
    const kick = heavy ? 420 : 220;
    const ang = Math.random() * Math.PI * 2;
    hudImpulse(Math.cos(ang) * kick, Math.sin(ang) * kick * 0.6 + kick * 0.4, heavy ? -0.5 : -0.25);
}
export function healPlayer(amount) {
    if (game.playerHp <= 0 || amount <= 0)
        return;
    game.playerHp = Math.min(PLAYER_MAX_HP, game.playerHp + amount);
    hpChip = Math.max(hpChip, game.playerHp);
}
// dt は実時間（スローやヒットストップ中も白い残りは同じ速さで減らす）
export function updateHpHud(dt) {
    if (hpShown > game.playerHp)
        hpShown = game.playerHp;
    else {
        hpShown += (game.playerHp - hpShown) * Math.min(1, dt * 7);
        if (game.playerHp - hpShown < 0.05)
            hpShown = game.playerHp;
    }
    hpChipHold -= dt;
    if (hpChipHold <= 0 && hpChip > hpShown)
        hpChip = Math.max(hpShown, hpChip - HP_CHIP_DRAIN * dt);
    if (hpChip < hpShown)
        hpChip = hpShown;
    hpFill.style.width = `${(hpShown / PLAYER_MAX_HP) * 100}%`;
    hpChipBar.style.width = `${(hpChip / PLAYER_MAX_HP) * 100}%`;
    hpCount = hpCount > hpShown ? Math.max(hpShown, hpCount - HP_COUNT_SPEED * dt) : hpShown;
    hpNum.textContent = String(Math.ceil(hpCount));
    hpHud.classList.toggle('low', game.playerHp <= HP_LOW);
    hurtLow.classList.toggle('on', game.playerHp <= HP_LOW);
}

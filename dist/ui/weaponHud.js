import { game } from '../game/state.js';
// ---- 右下の武器表示と弾の数 ----
export const ammoPips = [...document.querySelectorAll('#ammo i')];
export const ammoHud = document.getElementById('ammo');
export const weaponHud = document.getElementById('weapon');
export const weaponName = weaponHud.querySelector('.name span');
export const weaponIcons = [...weaponHud.querySelectorAll('.icon svg')];
export const WEAPON_LABELS = { kunai: 'KUNAI', handgun: 'HANDGUN', sword: 'SWORD', sickle: 'CHAIN SICKLE', axe: 'BATTLE AXE', bow: 'BOW', bat: 'BAT', spear: 'SPEAR' };
export let weaponHudShown = null;
// 右下の武器表示: 構えている武器のアイコンと名前。持ち替えたら差し込み直す
export function updateWeaponHud() {
    if (weaponHudShown === game.shownWeapon)
        return;
    const first = weaponHudShown === null;
    weaponHudShown = game.shownWeapon;
    weaponName.textContent = WEAPON_LABELS[game.shownWeapon];
    for (const svg of weaponIcons)
        svg.classList.toggle('on', svg.dataset.w === game.shownWeapon);
    if (first)
        return;
    const icon = weaponIcons.find((svg) => svg.dataset.w === game.shownWeapon);
    for (const el of [weaponName, icon]) {
        el.classList.remove('in');
        void el.getBoundingClientRect(); // 続けて持ち替えても頭から流し直す
        el.classList.add('in');
    }
}

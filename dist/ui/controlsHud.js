const WEAPON_CONTROLS = {
    kunai: [
        { label: '攻撃', keys: [{ input: 'attack' }] },
        { label: '溜め投げ', keys: [{ input: 'aim', hold: true }] },
    ],
    handgun: [
        { label: '射撃', keys: [{ input: 'attack' }] },
        { label: 'リロード', keys: [{ input: 'reload' }] },
        { label: 'デッドアイ', keys: [{ input: 'aim', hold: true }] },
    ],
    sword: [
        { label: '斬る', keys: [{ input: 'attack' }] },
        { label: '溜め斬り', keys: [{ input: 'attack', hold: true }] },
        { label: '構え', keys: [{ input: 'aim' }] },
        { label: '一閃', keys: [{ input: 'aim' }, { input: 'attack' }] },
    ],
    sickle: [
        { label: '攻撃', keys: [{ input: 'attack' }] },
        { label: '鎖を投げる', keys: [{ input: 'aim' }, { input: 'attack' }] },
        { label: '持ち替え', keys: [{ input: 'reload' }] },
    ],
    axe: [
        { label: '攻撃', keys: [{ input: 'attack' }] },
        { label: '打ち上げ', keys: [{ input: 'attack', hold: true }] },
    ],
    chakram: [], // 技はまだ無い
};
// マウス: 押すボタンの側を塗る
const mouseIcon = (side) => `<svg viewBox="0 0 20 28"><path class="f" d="${side === 'left' ? 'M10 1 V11 H1 V10 A9 9 0 0 1 10 1 Z' : 'M10 1 V11 H19 V10 A9 9 0 0 0 10 1 Z'}"/>` +
    `<rect class="o" x="1" y="1" width="18" height="26" rx="9"/><path class="o" d="M10 1 V11 M1 11 H19"/></svg>`;
const keyIcon = (label) => `<svg viewBox="0 0 24 24"><rect class="o" x="1" y="1" width="22" height="22" rx="3"/><text class="t" x="12" y="12.5">${label}</text></svg>`;
// パッドのトリガー: 肩の形の枠に名前
const triggerIcon = (label) => `<svg viewBox="0 0 30 24"><path class="o" d="M1 23 V9 Q1 1 9 1 H21 Q29 1 29 9 V23 Z"/><text class="t" x="15" y="13">${label}</text></svg>`;
// パッドの右の 4 ボタン: 押す位置だけ塗る（機種で名前が違っても位置は同じ）
const faceIcon = (pos) => {
    const at = { up: [12, 4.5], right: [19.5, 12], down: [12, 19.5], left: [4.5, 12] };
    return `<svg viewBox="0 0 24 24">${Object.keys(at)
        .map((p) => `<circle class="${p === pos ? 'f' : 'o'}" cx="${at[p][0]}" cy="${at[p][1]}" r="3.6"/>`)
        .join('')}</svg>`;
};
const CONTROL_ICONS = {
    attack: [mouseIcon('left'), triggerIcon('ZR')],
    aim: [mouseIcon('right'), triggerIcon('ZL')],
    reload: [keyIcon('R'), faceIcon('left')],
};
const controlsHud = document.getElementById('controls');
let controlsHudKey = '';
export function updateControlsHud(shownWeapon, usingPad) {
    const key = `${shownWeapon}:${usingPad}`;
    if (key === controlsHudKey)
        return;
    const weaponChanged = !controlsHudKey.startsWith(`${shownWeapon}:`);
    controlsHudKey = key;
    const pad = usingPad ? 1 : 0;
    controlsHud.innerHTML = WEAPON_CONTROLS[shownWeapon]
        .map(({ label, keys }) => {
        const icons = keys
            .map((b) => `<span class="k">${CONTROL_ICONS[b.input][pad]}${b.hold ? '<small>HOLD</small>' : ''}</span>`)
            .join('<span class="plus">+</span>');
        return `<div class="row"><span class="label">${label}</span><span class="keys">${icons}</span></div>`;
    })
        .join('');
    if (!weaponChanged)
        return;
    controlsHud.classList.remove('in');
    void controlsHud.getBoundingClientRect(); // 続けて持ち替えても頭から流し直す
    controlsHud.classList.add('in');
}

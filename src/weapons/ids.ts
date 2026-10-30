// ---- 武器の種類 ----
export type WeaponId = 'kunai' | 'handgun' | 'sword' | 'sickle' | 'axe' | 'bow' | 'bat' | 'spear';
// 数字キーで選ぶ武器
export const WEAPON_KEYS: Record<string, WeaponId> = { Digit1: 'kunai', Digit2: 'handgun', Digit3: 'sword', Digit4: 'sickle', Digit5: 'axe', Digit6: 'bow', Digit7: 'bat', Digit8: 'spear' };
export const WEAPON_IDS: WeaponId[] = ['kunai', 'handgun', 'sword', 'sickle', 'axe', 'bow', 'bat', 'spear'];

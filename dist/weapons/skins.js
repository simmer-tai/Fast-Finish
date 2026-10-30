import * as THREE from 'three';
import { WEAPON_IDS } from './ids.js';
import { kintsugiSword } from './skinKintsugi.js';
import { protoRevolver } from './skinProto.js';
import { redlineSword } from './skinRedline.js';
import { relicSword } from './skinRelic.js';
import { ghostlineSword } from './skinGhostline.js';
import { TALON_FOCUS, talonSword } from './skinTalon.js';
import { talonAxe } from './skinTalonAxe.js';
import { talonKunai } from './skinTalonKunai.js';
import { talonSickle } from './skinTalonSickle.js';
import { talonSpear } from './skinTalonSpear.js';
import { eclipseSpear } from './skinEclipseSpear.js';
import { dressTalonRound, talonRevolver } from './skinTalonGun.js';
import { dressTalonArrow, talonBow } from './skinTalonBow.js';
// スキンの演出に渡す値。flare: 当てた瞬間に 1 にすると、飾りが光ってすぐに引く。focus: 一閃の構えの効き（0〜1）
export const skinFx = { flare: 0, focus: 0 };
// シリーズ: 同じ id のスキンを武器ごとに作り、共通の値をまとめて持たせる（形の飾りと振り音は武器ごと）
// 爪（TALON）: 黒い機械の地に、赤く光る刃先。軌跡も赤く光り、当てたところに赤い稲妻を走らせる
const TALON = {
    id: 'talon',
    name: 'TALON',
    ja: '爪',
    swatch: ['#0b0c0e', '#8c1515', '#1a1d21'],
    looks: {},
    unlock: '条件は未定',
    // 光る刃先と同じ赤で、軌跡も光らせる。縁は一段暗く、芯は明るく
    trail: { body: 0xa81818, edge: 0x7a1010, core: 0xd02a2a, glow: true },
    // 刃先と同じ赤の稲妻。芯は白く光らせる
    arc: { glow: 0xc01010, body: 0xe01414, core: 0xffffff },
    spark: 0xe01414, // 壁を叩いた火花も稲妻と同じ赤
};
// 区切りに使うグリーンとマゼンタ（プレビュー動画の継ぎ目）は使わない
export const SKINS = [
    { id: 'standard', name: 'STANDARD', ja: '標準', swatch: ['#111', '#3b444c', '#23282d'], looks: {} },
    {
        id: 'eclipse',
        name: 'ECLIPSE',
        ja: '蝕',
        swatch: ['#0b141d', '#00d5ff', '#10191e'],
        looks: {
            metal: { color: 0x0b141d, metalness: 0.85, roughness: 0.28, env: 1.4 },
            trim: { color: 0x0b141d, metalness: 0.7, roughness: 0.32, env: 1.2 },
            wrap: { color: 0x10191e, metalness: 0.05, roughness: 0.8 },
        },
        weapons: ['spear'],
        decor: eclipseSpear,
        trail: { body: 0x00a9cf, edge: 0x075474, core: 0xa4f5ff, glow: true },
        spark: 0x35dfff,
        hitSparks: { count: 1.5, life: 1.2, size: 1.1, embers: 0.6, tint: 0x35dfff },
    },
    {
        id: 'kintsugi',
        name: 'KINTSUGI',
        ja: '金継ぎ',
        swatch: ['#0d0d0d', '#d6a84e', '#e8e2d2'],
        looks: { metal: { color: 0x0d0d0d, metalness: 0.7, roughness: 0.42, env: 1 } },
        weapons: ['sword'],
        unlock: '条件は未定',
        decor: kintsugiSword,
        spark: 0xd6a84e, // 壁を叩いた火花は継ぎ目の金
    },
    {
        id: 'redline',
        name: 'REDLINE',
        ja: '紅線',
        swatch: ['#a4a8ad', '#4a0a10', '#8b9196'],
        looks: {},
        weapons: ['sword'],
        unlock: '条件は未定',
        decor: redlineSword,
        // 赤黒い塗りの色で軌跡を引く（爪と違って光らせない）。縁は暗く、芯は刃先の色より少し明るく
        trail: { body: 0x4a0c14, edge: 0x22060a, core: 0x8c1a26 },
        spark: 0x8c1a26, // 壁を叩いた火花は軌跡の芯と同じ色
        // 敵に当てた火花を 2.5 倍に増やし、大きく速く長く飛ばす。白から赤へ変わり、ゆっくり落ちる火の粉も残す
        hitSparks: { count: 2.5, life: 1.6, size: 1.3, embers: 1.2, tint: 0xff3020 },
    },
    {
        id: 'relic',
        name: 'RELIC',
        ja: '遺物',
        swatch: ['#111', '#111', '#3b444c'],
        looks: {}, // 色は元の剣のまま、形だけ替える
        weapons: ['sword'],
        unlock: '条件は未定',
        decor: relicSword,
    },
    {
        id: 'ghostline',
        name: 'GHOSTLINE',
        ja: 'ゴーストライン',
        swatch: ['#c3d7de', '#39d8ee', '#09131a'],
        looks: {
            metal: { color: 0xaebfc5, metalness: 0.92, roughness: 0.2, env: 1.45 },
            trim: { color: 0x07131a, metalness: 0.75, roughness: 0.28, env: 1.2 },
            wrap: { color: 0x111b20, metalness: 0.35, roughness: 0.5 },
        },
        weapons: ['sword'],
        decor: ghostlineSword,
        trail: { body: 0x159bb5, edge: 0x073e50, core: 0xb9fbff, glow: true },
        spark: 0x68f4ff,
        hitSparks: { count: 1.6, life: 1.25, size: 1.05, embers: 0.5, tint: 0x68f4ff },
        hologram: { color: 0x627980, core: 0xd7eef0, count: 8, size: 0.085, life: 0.48 },
    },
    {
        ...TALON,
        weapons: ['sword'],
        decor: talonSword,
        swish: 'talon', // 剣の振り音を、黒い機械の刀に合わせて低く暗く重くする
        focus: TALON_FOCUS, // 光る刃を目の高さのすぐ下に水平に掲げ、刃先越しに敵を見る
    },
    {
        ...TALON,
        weapons: ['kunai'],
        decor: talonKunai,
        swish: 'talonKunai', // クナイの振り音を低く暗くし、刃の鳴りを薄く敷く
    },
    {
        ...TALON,
        weapons: ['axe'],
        decor: talonAxe,
        swish: 'talonAxe', // 斧の振り音に、低く暗い金属の唸りを足す
    },
    {
        ...TALON,
        weapons: ['sickle'],
        decor: talonSickle,
        swish: 'talonSickle', // 鎌の鋭い振り音の下に、暗い刃の鳴りを敷く
    },
    {
        ...TALON,
        weapons: ['spear'],
        decor: talonSpear,
        swish: 'talonAxe', // 槍の振り音（斧と同じ）に、低く暗い金属の唸りを足す
    },
    {
        ...TALON,
        weapons: ['handgun'],
        // 銃身と枠は剣の爪と同じ黒、シリンダーの溝は暗い赤、グリップは爪の柄と同じ暗い色
        looks: {
            metal: { color: 0x0b0c0e, metalness: 0.85, roughness: 0.24, env: 1.5 },
            trim: { color: 0x7a1010, metalness: 0.5, roughness: 0.35 },
            wrap: { color: 0x1a1d21, metalness: 0.6, roughness: 0.45 },
        },
        decor: talonRevolver,
        round: dressTalonRound,
        swish: 'talonGun', // 回す音を低く暗くする
    },
    {
        ...TALON,
        weapons: ['bow'],
        // 柄とリムは剣の爪と同じ黒、握りは爪の柄と同じ暗い色
        looks: {
            metal: { color: 0x0b0c0e, metalness: 0.85, roughness: 0.24, env: 1.5 },
            trim: { color: 0x101215, metalness: 0.7, roughness: 0.32, env: 1.2 },
            wrap: { color: 0x1a1d21, metalness: 0.6, roughness: 0.45 },
        },
        decor: talonBow,
        arrow: dressTalonArrow,
    },
    {
        id: 'proto',
        name: 'PROTO',
        ja: '試作機',
        swatch: ['#d3d6d9', '#a4a9ae', '#121416'],
        // 外殻の中から振り出すシリンダーも、外殻に近い白にする
        looks: { metal: { color: 0xc4c8cc, metalness: 0.2, roughness: 0.45, env: 0.6 } },
        weapons: ['handgun'],
        unlock: '条件は未定',
        decor: protoRevolver,
    },
];
export function skinTags(s) {
    const tags = [];
    if (Object.keys(s.looks).length || s.decor || s.round || s.arrow)
        tags.push('look');
    if (s.trail || s.arc || s.hitSparks || s.hologram || s.spark !== undefined)
        tags.push('hit');
    if (s.focus)
        tags.push('motion');
    return tags;
}
export const skinsFor = (id) => SKINS.filter((s) => !s.weapons || s.weapons.includes(id));
// 作者の手元（localhost で開いたとき）と ?devmode を付けたときは全部使える。公開版では条件の付いたスキンは解放するまで使えない
const OWNER = ['localhost', '127.0.0.1'].includes(location.hostname) || new URLSearchParams(location.search).has('devmode');
export const skinUnlocked = (s) => OWNER || !s.unlock;
// 使えないスキンは STANDARD に読み替える（覚えていたスキンが使えないときも）
const skinById = (weapon, id) => skinsFor(weapon).find((s) => s.id === id && skinUnlocked(s)) ?? SKINS[0];
// 部位ごとの元のマテリアル。リボルバーだけ別の色で組んであるので、そちらを元にする
const baseOf = (mats, id) => id === 'handgun'
    ? { metal: mats.gun, trim: mats.flute, wrap: mats.grip }
    : { metal: mats.kunai, trim: mats.swordHilt, wrap: mats.sickleWrap };
export function createSkinMats(mats, id) {
    const base = baseOf(mats, id);
    return { metal: base.metal.clone(), trim: base.trim.clone(), wrap: base.wrap.clone(), base };
}
export function applySkin(mats, skin) {
    for (const part of ['metal', 'trim', 'wrap']) {
        const m = mats[part];
        m.copy(mats.base[part]);
        const look = skin.looks[part];
        if (!look)
            continue;
        m.color.setHex(look.color);
        m.metalness = look.metalness;
        m.roughness = look.roughness;
        if (look.env !== undefined)
            m.envMapIntensity = look.env;
    }
}
// 武器のモデルを組む関数に渡す、部位を差し替えたマテリアルの組
export function skinnedWeaponMats(mats, s, id) {
    return id === 'handgun'
        ? { ...mats, gun: s.metal, flute: s.trim, grip: s.wrap }
        : { ...mats, kunai: s.metal, swordHilt: s.trim, sickleWrap: s.wrap };
}
// ---- 形の飾り ----
// モデル（名前付きの部位を持つ）にスキンの飾りを着せる。前の飾りは外して捨て、部位を元に戻してから着せる
export function dressModel(model, skin, mats) {
    const old = model.userData.skinDecor;
    if (old) {
        old.userData.undo?.();
        model.remove(old);
        old.traverse((o) => {
            if (!(o instanceof THREE.Mesh))
                return;
            o.geometry.dispose();
            for (const m of [o.material].flat())
                m.dispose();
        });
        model.userData.skinDecor = undefined;
    }
    // 部位は入れ子の中（鎖鎌の頭と握りなど）からも集める
    const parts = {};
    model.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.name)
            return;
        parts[o.name] = o;
        const base = (o.userData.skinBase ??= { material: o.material, visible: o.visible });
        if (o.material !== base.material)
            for (const m of [o.material].flat())
                m.dispose();
        o.material = base.material;
        o.visible = base.visible;
    });
    if (!skin.decor)
        return;
    const decor = skin.decor.build(parts, mats, model);
    model.add(decor);
    model.userData.skinDecor = decor;
}
// ---- 武器ごとに選んだスキン ----
// 次に開いたときのために覚えておく
const SKIN_STORE = 'fast-finish.skin';
const chosen = {};
try {
    const saved = JSON.parse(localStorage.getItem(SKIN_STORE) ?? '{}');
    for (const id of WEAPON_IDS)
        if (typeof saved?.[id] === 'string')
            chosen[id] = saved[id];
}
catch {
    // 保存できない環境では毎回 STANDARD から
}
export const skinOf = (id) => skinById(id, chosen[id]);
const listeners = [];
export const onSkinChange = (fn) => listeners.push(fn);
export function setSkin(id, skinId) {
    chosen[id] = skinById(id, skinId).id;
    try {
        localStorage.setItem(SKIN_STORE, JSON.stringify(chosen));
    }
    catch {
        // 覚えられなくても替えることはできる
    }
    for (const fn of listeners)
        fn(id, skinOf(id));
}

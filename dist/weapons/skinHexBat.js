import * as THREE from 'three';
// ---- バットのスキン: 六角棍 ----
// 古い打ち棒の形。色は元のバットのまま、胴と握りを作り直す。
//   胴: 断面は角の立った六角。柄尻は円盤のノブの代わりに太く開いた角錐台、握りは元より太くまっすぐ、
//       そこから先へ長くゆっくり太り、先端の手前で一段張り出した縁を作って平たく断つ
//   帯: 胴の太り始めと先端の手前に、一回り太い六角の帯
//   握り: 革紐を斜めの段々に巻いた握り（巻きの山が並ぶ）
// 長さと先端の位置は元と同じ（当たりと軌跡が変わらないように）。寸法は bat.ts と同じ（m。+Y が先端、原点は握る位置）
const SIDES = 6;
// 輪郭 [半径, 高さ]（下から上へ）
const BODY = [
    [0, -0.125],
    [0.024, -0.125], // 柄尻の角錐台の底
    [0.024, -0.118],
    [0.0145, -0.098],
    [0.0145, 0.18], // 握り
    [0.017, 0.27],
    [0.024, 0.4],
    [0.031, 0.54],
    [0.034, 0.655],
    [0.038, 0.668], // 先端の手前の縁
    [0.038, 0.682],
    [0.034, 0.69],
    [0.034, 0.704],
    [0, 0.708],
];
const BANDS = [[0.3, 0.0205], [0.62, 0.0355]];
const BAND_H = 0.01;
const WRAP = { from: -0.094, to: 0.165, step: 0.009, r: 0.0154, rIn: 0.0146 };
const lathe = (points, mat) => new THREE.Mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), SIDES), mat);
export const hexBat = {
    build(parts, mats) {
        for (const name of ['body', 'tape'])
            if (parts[name])
                parts[name].visible = false;
        const metal = mats.metal.clone();
        const leather = mats.wrap.clone();
        const g = new THREE.Group();
        g.add(lathe(BODY, metal));
        for (const [y, r] of BANDS)
            g.add(lathe([[r - 0.003, y - BAND_H / 2], [r, y - BAND_H / 2 + 0.002], [r, y + BAND_H / 2 - 0.002], [r - 0.003, y + BAND_H / 2]], metal));
        // 革紐の巻き: 山と谷を交互に並べた輪郭を、少し傾けた段に見せる（山の上の縁を下の縁より太く）
        const wrap = [[WRAP.rIn, WRAP.from]];
        for (let y = WRAP.from; y < WRAP.to - WRAP.step / 2; y += WRAP.step)
            wrap.push([WRAP.r, y + WRAP.step * 0.75], [WRAP.rIn, y + WRAP.step]);
        g.add(lathe(wrap, leather));
        return g;
    },
};

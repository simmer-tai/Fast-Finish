import * as THREE from 'three';
import { AXE_EDGE_T, AXE_HEAD_T, axeBevel, axePointFromMm } from './battleAxe.js?v=2fb05089';
import { plate } from './skinTalon.js?v=2fb05089';
// ---- 斧のスキン: 髭斧 ----
// 両刃の大斧の形。頭を作り直す（柄は元のまま）。
//   頭: 柄を包む筒の左右へ同じ形の刃が付く。刃は柄の側が細く、上下の縁が内へ反りながら広がって、刃先は大きな三日月。
//       くり抜きは無く、刃先へ向けて面取りする。面取りの帯だけ明るい鋼にする
//   筒: 柄の上の端を包む厚い輪。上に小さな頭が突き出る
// 輪郭は右の刃だけを斧のモデルの座標を mm で書き、左の刃は左右に裏返して置く（x は刃先の側が +、y は頭の側が +、原点は右手で握る位置）
// 刃先の三日月と、その内側の面取りの境目（上 → 下。点の数をそろえる）
const EDGE = [[236, 1130], [262, 1060], [274, 980], [274, 880], [262, 800], [236, 730]];
const INNER = [[204, 1092], [228, 1036], [238, 974], [238, 886], [228, 824], [204, 768]];
// 柄から刃の上の縁を通って上の角へ（INNER の前）と、下の角から刃の下の縁を柄へ戻る（INNER の後）
const TOP = [[0, 1000], [60, 1006], [110, 1024], [156, 1052], [190, 1080]];
const BOTTOM = [[190, 780], [156, 808], [110, 836], [60, 854], [0, 860]];
const SOCKET = [[-36, 850], [36, 850], [36, 1010], [-36, 1010]];
const CAP = [[-24, 1000], [24, 1000], [20, 1052], [-20, 1052]];
const SOCKET_D = 0.044; // 柄（面取り込みで 0.038）より厚く
export const beardedAxe = {
    build(parts, mats) {
        parts.head.visible = false;
        parts.bevel.visible = false;
        const iron = mats.metal.clone();
        const steel = mats.metal.clone();
        if (steel instanceof THREE.MeshStandardMaterial)
            steel.color.setHex(0x8c9094);
        const g = new THREE.Group();
        for (const side of [1, -1]) {
            const blade = new THREE.Group();
            blade.scale.x = side;
            blade.add(new THREE.Mesh(plate([...TOP, ...INNER, ...BOTTOM], AXE_HEAD_T, 0.002), iron));
            blade.add(axeBevel(INNER.map(axePointFromMm), AXE_HEAD_T, EDGE.map(axePointFromMm), AXE_EDGE_T, steel));
            g.add(blade);
        }
        g.add(new THREE.Mesh(plate(SOCKET, SOCKET_D, 0.003), iron));
        g.add(new THREE.Mesh(plate(CAP, SOCKET_D * 0.8, 0.003), iron));
        return g;
    },
};

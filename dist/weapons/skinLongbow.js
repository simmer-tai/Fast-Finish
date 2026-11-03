import * as THREE from 'three';
import { RISER_C, loftClosed, section } from './bow.js?v=9bd5fe3e';
// ---- 弓のスキン: 長弓 ----
// 古い一本木の長弓の形。色は元の弓のまま、柄とリムを作り直す（弦・筈・矢を載せる棚は元のまま）。
//   弓幹: 柄とリムの継ぎ目の無い一本の棒。握りで前（的の側）へいちばん張り出し、上下の先端へなだらかに弧を描いて細る。
//         反り返りは無い。断面は横幅より前後に厚い。先端は元の弓の弦を掛ける所で終わる
//   棚: 元の棚と弓幹の間を埋める小さな台
//   握り: 弓幹の真ん中に巻いた太い巻きと、上下の端を締める細い紐
// 矢の通る所（棚の上）は弓幹を右（+Z）へ寄せて、左に矢の通り道を空ける。
// 寸法は弓のモデルの座標（m。+Y が上、+X が的の側、原点は握る位置）
const N = 40;
const BELLY_X = 0.006; // 握りの所の前後の中心
// 断面: 前後の厚み d と横幅 w を、握り（0）から先端（1）へ細らせる
const depthAt = (u) => THREE.MathUtils.lerp(0.03, 0.011, u);
const widthAt = (u) => THREE.MathUtils.lerp(0.018, 0.012, u);
// 矢の通り道: 棚のあたりだけ右へ寄せ、左の面を z = 0（矢の通る所）にそろえる
const ARROW_Y = 0.07;
const shiftAt = (y) => 0.009 * Math.max(0, 1 - Math.abs(y - ARROW_Y) / 0.12);
const GRIP = { from: -0.07, to: 0.045 };
export const longbow = {
    build(parts, mats, model) {
        for (const name of Object.keys(parts))
            if (/^(riser|wrap|limb)/.test(name))
                parts[name].visible = false;
        const wood = mats.trim.clone();
        const wrap = mats.wrap.clone();
        const g = new THREE.Group();
        // 弓幹の中心線: 上下の先端（弦を掛ける所の少し前）を通り、握りで前へ張り出す放物線
        const [top, low] = model.userData.stringTips;
        const half = (top.y - low.y) / 2;
        const tipX = (top.x + low.x) / 2 + 0.004;
        const xAt = (y) => {
            const u = (y - RISER_C) / half;
            return tipX + (BELLY_X - tipX) * (1 - u * u);
        };
        const ring = (y, grow = 0) => {
            const u = Math.min(1, Math.abs(y - RISER_C) / half);
            const slope = (xAt(y + 0.001) - xAt(y - 0.001)) / 0.002;
            const front = new THREE.Vector3(1, -slope, 0).normalize(); // 中心線に直交して前を向く
            return section(new THREE.Vector3(xAt(y), y, 0), front, depthAt(u) + grow, widthAt(u) + grow, shiftAt(y));
        };
        const ys = Array.from({ length: N + 1 }, (_, i) => low.y + ((top.y - low.y) * i) / N);
        const end = (y) => new THREE.Vector3(xAt(y), y, shiftAt(y));
        g.add(loftClosed(ys.map((y) => ring(y)), end(low.y - 0.006), end(top.y + 0.006), wood));
        // 棚（元の棚は弓幹の左の面から離れるので、間を埋める台を足す）
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.009), wood);
        shelf.position.set(BELLY_X - 0.004, model.userData.shelfY + 0.0025, -0.0035);
        g.add(shelf);
        // 握りの巻き（弓幹を一回り太らせて覆う）と、上下の端の紐
        const gripYs = Array.from({ length: 7 }, (_, i) => GRIP.from + ((GRIP.to - GRIP.from) * i) / 6);
        g.add(loftClosed(gripYs.map((y) => ring(y, 0.005)), end(GRIP.from), end(GRIP.to), wrap));
        for (const y of [GRIP.from - 0.004, GRIP.to + 0.004]) {
            const tie = loftClosed([ring(y - 0.002, 0.007), ring(y + 0.002, 0.007)], end(y - 0.002), end(y + 0.002), wrap);
            g.add(tie);
        }
        return g;
    },
};

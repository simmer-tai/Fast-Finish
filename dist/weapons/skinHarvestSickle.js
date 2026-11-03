import * as THREE from 'three';
import { loftRings } from '../geometry.js';
import { SHAFT_TOP, sickleBladeFrames } from './chainSickle.js';
// ---- 鎖鎌のスキン: 稲刈り ----
// 古い農具の鎌の形。色は元の鎖鎌のまま、刃と口金を作り直す（柄・継ぎ目・握りは元のまま）。
//   刃: 細い首から出て、いったん上へ弓なりに反ってから切っ先で柄の方へ落ちる、薄く長い三日月。
//       幅は中ほどでいちばん広く、根元と切っ先で細い。切っ先の位置は元の刃と同じ（軌跡と鎖で引く所が変わらないように）
//   口金: 六角の金具をやめ、刃の首をくわえる角ばった差し込みと 2 本の鋲。柄の先は丸い玉
// 刃と口金は頭（外れて飛ぶ側）に付ける
const N = 16;
const ARCH = 0.07; // 刃の中ほどを上へ持ち上げる量
const T = 0.006; // 刃の厚み（元は 0.008）
// 刃の幅（0: 根元 → 1: 切っ先）
const widthAt = (s) => (s < 0.12 ? 0.014 + (s / 0.12) * 0.012 : s < 0.55 ? 0.026 + ((s - 0.12) / 0.43) * 0.016 : 0.042 * Math.pow((1 - s) / 0.45, 0.8));
// 刃の中心線: 元の刃の根元から切っ先まで、上へ持ち上げた 2 次のベジェ曲線
function bladeGeometry() {
    const { frames, end } = sickleBladeFrames();
    const p0 = frames[0].p;
    const c = new THREE.Vector3((p0.x + end.x) / 2 + 0.02, Math.max(p0.y, end.y) + ARCH, 0);
    const curve = new THREE.QuadraticBezierCurve3(p0.clone(), c, end.clone());
    const rings = [];
    for (let i = 0; i < N; i++) {
        const s = i / N;
        const p = curve.getPoint(s);
        const tan = curve.getTangent(s);
        const n = new THREE.Vector3(tan.y, -tan.x, 0); // 曲がりの内側 = 刃先の向き
        const w = widthAt(s);
        const t = T * (1 - 0.4 * s);
        const at = (a, z) => p.clone().addScaledVector(n, a).setZ(z);
        // 元の刃と同じ断面（棟が平ら、鎬で最も厚く、刃先で薄い）。棟は中心線に置いて、幅は刃先の側へ取る
        rings.push([at(0, t * 0.35), at(w * 0.35, t / 2), at(w, 0), at(w * 0.35, -t / 2), at(0, -t * 0.35)]);
    }
    rings.push([end.clone()]);
    return loftRings(rings);
}
export const harvestSickle = {
    build(parts, mats, model) {
        for (const name of ['blade', 'socket', 'cap'])
            if (parts[name])
                parts[name].visible = false;
        const black = mats.metal.clone();
        const head = new THREE.Group();
        head.add(new THREE.Mesh(bladeGeometry(), black));
        // 差し込み: 柄の先を包む角ばった金具。表と裏に鋲の頭
        const socket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.024), black);
        socket.position.y = SHAFT_TOP - 0.018;
        head.add(socket);
        for (const y of [SHAFT_TOP - 0.03, SHAFT_TOP - 0.008]) {
            const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.028, 8), black);
            rivet.rotation.x = Math.PI / 2;
            rivet.position.set(-0.007, y, 0);
            head.add(rivet);
        }
        const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 1), black);
        knob.position.y = SHAFT_TOP + 0.014;
        head.add(knob);
        model.userData.head.add(head);
        const g = new THREE.Group();
        g.userData.undo = () => {
            head.removeFromParent();
            head.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
            black.dispose();
        };
        return g;
    },
};

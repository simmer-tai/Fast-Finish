import * as THREE from 'three';
// ---- よく使う数 ----
export const DEG = Math.PI / 180;
export const UP = new THREE.Vector3(0, 1, 0);
export function catmullRom(p0, p1, p2, p3, t, out) {
    const t2 = t * t;
    const t3 = t2 * t;
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

import * as THREE from 'three';
// 同じ頂点数の断面（XZ 平面上の輪郭。y は各断面の高さ）を順につないだ筒を作る。
// 最後の断面を 1 点にすれば先が尖る
export function loftRings(rings) {
    const pos = [];
    const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let r = 0; r < rings.length - 1; r++) {
        const lo = rings[r];
        const hi = rings[r + 1];
        for (let i = 0; i < lo.length; i++) {
            const j = (i + 1) % lo.length;
            const hiI = hi[Math.min(i, hi.length - 1)];
            const hiJ = hi[Math.min(j, hi.length - 1)];
            tri(lo[i], lo[j], hiJ);
            if (hi.length > 1)
                tri(lo[i], hiJ, hiI);
        }
    }
    // 根元の断面をふさぐ
    const base = rings[0];
    for (let i = 1; i < base.length - 1; i++)
        tri(base[0], base[i + 1], base[i]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
}

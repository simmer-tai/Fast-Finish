import * as THREE from 'three';
import { addGlow, removeGlow, type GlowSource } from '../fx/glow.js';
import { SPEAR_BUTT_Y, SPEAR_TIP_Y } from './spear.js';
import { plate, type Outline } from './skinTalon.js';
import type { SkinDecor } from './skins.js';

// ECLIPSE: a swept, pierced spearhead with cyan edges and backward hooks.
// 輪郭は mm。切っ先・石突き・両手の位置は元の槍に合わせる。
export const eclipseSpear: SkinDecor = {
  build(parts, mats) {
    for (const name of ['blade', 'guard', 'collar', 'butt', 'spike']) parts[name].visible = false;
    const g = new THREE.Group();
    const std = (params: THREE.MeshStandardMaterialParameters) =>
      new THREE.MeshStandardMaterial({ envMap: mats.metal.envMap, flatShading: true, ...params });
    const armor = std({ color: 0x0b141d, metalness: 0.82, roughness: 0.29, envMapIntensity: 1.35 });
    const bevel = std({ color: 0x314753, metalness: 0.9, roughness: 0.24, envMapIntensity: 1.5 });
    const black = std({ color: 0x03090f, metalness: 0.3, roughness: 0.6 });
    const grip = std({ color: 0x10191e, metalness: 0.15, roughness: 0.8 });
    const energy = std({ color: 0x08bcd9, emissive: 0x00c9ed, emissiveIntensity: 1.25, metalness: 0.25, roughness: 0.25 });
    const core = std({ color: 0xa4f5ff, emissive: 0x34e6ff, emissiveIntensity: 1.6, roughness: 0.22 });
    const glows: GlowSource[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = y;
      g.add(mesh);
      return mesh;
    };
    const panel = (outline: Outline, depth: number, mat: THREE.Material) => add(plate(outline, depth, 0.0006), mat);
    const ring = (y: number, radius: number, height: number, mat: THREE.Material) =>
      add(new THREE.CylinderGeometry(radius, radius, height, 8), mat, y);
    const glow = (mesh: THREE.Mesh, strength = 0.65) => {
      const source = addGlow(mesh, 0x00d5ff);
      source.strength = strength;
      glows.push(source);
      return mesh;
    };

    // 大きな主刃と後ろへ伸びる鉤を一体にし、根元に両面を貫く透かしを開ける。
    const mm = 0.001;
    const head = new THREE.Shape();
    head.moveTo(-10 * mm, SPEAR_TIP_Y);
    head.quadraticCurveTo(-25 * mm, 865 * mm, -53 * mm, 780 * mm);
    head.quadraticCurveTo(-72 * mm, 713 * mm, -72 * mm, 644 * mm);
    head.quadraticCurveTo(-72 * mm, 597 * mm, -61 * mm, 574 * mm);
    head.lineTo(-91 * mm, 480 * mm);
    head.quadraticCurveTo(-54 * mm, 505 * mm, -38 * mm, 556 * mm);
    head.quadraticCurveTo(-25 * mm, 544 * mm, -10 * mm, 540 * mm);
    head.lineTo(0, 510 * mm);
    head.quadraticCurveTo(27 * mm, 513 * mm, 37 * mm, 550 * mm);
    head.quadraticCurveTo(66 * mm, 529 * mm, 111 * mm, 487 * mm);
    head.quadraticCurveTo(78 * mm, 559 * mm, 57 * mm, 615 * mm);
    head.quadraticCurveTo(42 * mm, 646 * mm, 29 * mm, 658 * mm);
    head.quadraticCurveTo(23 * mm, 733 * mm, 1 * mm, 815 * mm);
    head.quadraticCurveTo(-5 * mm, 915 * mm, -10 * mm, SPEAR_TIP_Y);
    const hole = new THREE.Path();
    hole.moveTo(-39 * mm, 752 * mm);
    hole.quadraticCurveTo(-54 * mm, 700 * mm, -51 * mm, 650 * mm);
    hole.quadraticCurveTo(-49 * mm, 622 * mm, -35 * mm, 603 * mm);
    hole.quadraticCurveTo(-20 * mm, 641 * mm, -22 * mm, 670 * mm);
    hole.quadraticCurveTo(-23 * mm, 713 * mm, -39 * mm, 752 * mm);
    head.holes.push(hole);
    const eye = new THREE.Path();
    eye.moveTo(-9 * mm, 628 * mm);
    eye.quadraticCurveTo(2 * mm, 666 * mm, 7 * mm, 694 * mm);
    eye.quadraticCurveTo(16 * mm, 653 * mm, 17 * mm, 630 * mm);
    eye.quadraticCurveTo(13 * mm, 606 * mm, 5 * mm, 596 * mm);
    eye.quadraticCurveTo(-3 * mm, 607 * mm, -9 * mm, 628 * mm);
    head.holes.push(eye);
    const headGeo = new THREE.ExtrudeGeometry(head, {
      depth: 0.014, bevelEnabled: false, curveSegments: 12,
    });
    headGeo.translate(0, 0, -0.007);
    add(headGeo, armor);

    // 刃先のシアンから、外周の白い光へ細く絞る。
    glow(panel([[-60, 603], [-67, 644], [-64, 701], [-47, 776], [-29, 847],
      [-10, 977], [-17, 900], [-37, 822], [-49, 754], [-55, 689], [-53, 638]], 0.017, energy));
    panel([[-67, 644], [-64, 701], [-47, 776], [-29, 847], [-10, 977],
      [-33, 843], [-50, 775], [-68, 703], [-71, 644]], 0.0175, core);
    // 内側の刃と二つの鉤。
    glow(panel([[-37, 603], [-31, 618], [-22, 660], [-21, 689], [-16, 648],
      [-20, 614], [-34, 583], [-46, 590]], 0.0175, energy));
    glow(panel([[-90, 481], [-61, 574], [-52, 580], [-63, 550], [-76, 506]], 0.0175, energy), 0.48);
    glow(panel([[38, 550], [110, 488], [77, 546], [59, 558], [76, 531], [48, 550]], 0.0175, energy), 0.5);
    // 透かしの周りに鎬と心臓部を重ねる。
    panel([[-16, 580], [-9, 628], [0, 650], [4, 627], [1, 603], [-5, 577]], 0.0185, bevel);
    panel([[15, 585], [24, 609], [29, 644], [41, 627], [55, 594], [38, 606], [31, 576]], 0.018, bevel);
    panel([[-20, 564], [-13, 589], [2, 605], [14, 588], [26, 562], [8, 550]], 0.021, black);
    const signal = glow(panel([[-11, 572], [-3, 594], [5, 601], [15, 584], [11, 563], [0, 557]], 0.023, energy));
    glow(panel([[-5, 574], [0, 590], [6, 579], [3, 568]], 0.024, core), 0.45);
    // 根元の黒い爪が穂先を掴む。
    panel([[-18, 482], [-35, 523], [-43, 562], [-26, 551], [-11, 525], [0, 514],
      [14, 530], [21, 554], [37, 547], [27, 507], [12, 477]], 0.030, armor);
    panel([[-15, 496], [-24, 526], [-7, 519], [0, 509], [11, 520], [22, 527],
      [15, 495], [0, 483]], 0.034, bevel);
    glow(panel([[-11, 498], [-6, 516], [0, 506], [6, 516], [11, 498], [0, 490]], 0.035, energy), 0.5);


    // 首元の露出した動力部を、三枚の黒い装甲で挟む。
    ring(0.432, 0.017, 0.125, black);
    glow(ring(0.438, 0.0176, 0.076, energy), 0.5);
    for (const y of [396, 438, 480]) {
      panel([[-18, y - 18], [-25, y + 8], [0, y + 18], [25, y + 8], [18, y - 18], [0, y - 5]], 0.039, armor);
      panel([[-17, y + 4], [0, y + 13], [17, y + 4], [0, y + 8]], 0.0405, bevel);
    }
    // 斜めに巻いた黒い帯と細い金具。握りの位置は元のモデルを参照する。
    for (const wrap of [parts.wrap0, parts.wrap1]) {
      for (const side of [-1, 1]) ring(wrap.position.y + side * 0.094, 0.0165, 0.014, armor);
      for (let i = -3; i <= 3; i++) {
        const band = ring(wrap.position.y + i * 0.025, 0.015, 0.009, grip);
        band.rotation.z = -0.32;
      }
    }
    for (const y of [0.339, -0.365, -0.58]) {
      ring(y, 0.0155, 0.025, armor);
      ring(y + 0.013, 0.0158, 0.003, bevel);
    }
    // 握りの間に細い配線を通し、槍を回したときにも青い光が見える。
    for (const side of [-1, 1]) {
      const wire = add(new THREE.BoxGeometry(0.003, 0.20, 0.002), energy, -0.005);
      wire.position.z = side * 0.0127;
    }

    // 長い鏃形の石突き。柄にかぶせることで元の全長に収める。
    const butt = SPEAR_BUTT_Y * 1000;
    panel([[-12, -650], [-23, -696], [-35, -711], [-24, -742], [0, butt + 0.5],
      [24, -742], [35, -711], [23, -696], [12, -650]], 0.014, armor);
    panel([[-7, -677], [-15, -719], [0, butt + 8], [15, -719], [7, -677], [0, -701]], 0.0155, bevel);
    glow(panel([[0, -703], [-5, -724], [0, butt + 19], [5, -724]], 0.017, energy));
    ring(-0.653, 0.017, 0.021, armor);
    glow(ring(-0.666, 0.015, 0.004, energy), 0.5);

    signal.onBeforeRender = () => {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0024);
      energy.emissiveIntensity = 1.15 + pulse * 0.25;
      core.emissiveIntensity = 1.5 + pulse * 0.2;
    };
    g.userData.undo = () => glows.forEach(removeGlow);
    return g;
  },
};

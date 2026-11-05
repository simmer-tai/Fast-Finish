// VIOLET frame: angular armor and violet highlights.
export const VIOLET_FRAME = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" class="pc-violet" aria-hidden="true">
  <defs>
    <linearGradient id="metal" x2="0" y2="1"><stop stop-color="#47444d"/><stop offset=".4" stop-color="#17171c"/><stop offset="1" stop-color="#39333f"/></linearGradient>
    <linearGradient id="violet"><stop stop-color="#7a23b3" stop-opacity="0"/><stop offset=".5" stop-color="#e8a1ff"/><stop offset="1" stop-color="#7a23b3" stop-opacity="0"/></linearGradient>
    <g id="corner">
      <path d="M0 0H270L239 12H190L175 21H125L105 37H75L37 75V105L21 125V175L12 190V239L0 270Z" fill="url(#metal)"/>
      <path d="M8 8H232L209 16H173L159 24H119L99 41H73L41 73V99L24 119V159L16 173V209L8 232Z" fill="#55505a"/>
      <path d="M15 15H187L164 21H117L97 38H69L38 69V97L21 117V164L15 187Z" fill="#19181e"/>
      <path d="M12 120V55L55 12H197M23 99V62L62 23H150" fill="none" stroke="#aaa3af" stroke-width="2" opacity=".75"/>
      <path d="M20 103L103 20H147L129 29H109L29 109V129Z" fill="#857789" opacity=".48"/>
      <path d="M26 104L104 26H169" fill="none" stroke="#c36bf1" stroke-width="3"/>
      <path d="M30 99L99 30H133" fill="none" stroke="#f1caff" stroke-width="1.5"/>
      <path d="M44 36l2 8 10 2-10 2-2 8-2-8-10-2 10-2z" fill="#f2c9ff"/>
      <path d="M170 12l-8 9m22-9-8 9m22-9-8 9m22-9-8 9M12 170l9-8m-9 22 9-8m-9 22 9-8" stroke="#aaa1ae" stroke-width="2" opacity=".7"/>
      <path d="M210 8H258L237 15H205ZM8 210V258L15 237V205Z" fill="#25212a"/>
    </g>
    <g id="star"><path d="M0-47L5-9 19-2 5 3 0 47-5 3-19-2-5-9Z" fill="#35233d"/><path d="M0-30L3-5 11-2 3 1 0 30-3 1-11-2-3-5Z" fill="#ba4eed"/><path d="M0-9L2-2 7 0 2 2 0 9-2 2-7 0-2-2Z" fill="#f9e2ff"/></g>
  </defs>
  <!-- The center is transparent so the frame can sit over any card background. -->
  <path d="M0 0H1504L1600 96V900H96L0 804ZM24 24V794L106 876H1576V106L1494 24Z" fill="#17171c" fill-rule="evenodd"/>
  <path d="M1 1H1504L1599 96V899H96L1 804Z" fill="none" stroke="#8b858e" stroke-width="3"/>
  <path d="M24 24H1494L1576 106V876H106L24 794Z" fill="none" stroke="#aaa3ae" stroke-width="2"/>
  <path d="M24 21H695L731 29H869L905 21H1495L1579 105V879H905L869 871H731L695 879H105L21 795V24Z" fill="none" stroke="#3b3540" stroke-width="8"/>
  <use href="#corner"/><use href="#corner" transform="rotate(180 800 450)"/>
  <use href="#corner" transform="translate(1600 0) scale(-1 1)"/><use href="#corner" transform="translate(0 900) scale(1 -1)"/>
  <path d="M1452 2L1598 148V96L1504 2ZM148 898L2 752V804L96 898Z" fill="#242029"/>
  <path d="M1480 6L1594 120M120 894L6 780" fill="none" stroke="#b252d5" stroke-width="3"/>
  <path d="M1495 21L1579 105M105 879L21 795" fill="none" stroke="#dfb1ed" stroke-width="1.5"/>
  <path d="M228 23H690L718 30H755M845 30H882L910 23H1372M228 877H690L718 870H755M845 870H882L910 877H1372" fill="none" stroke="#827884" stroke-width="3"/>
  <path d="M692 21L748 21 771 32 747 29ZM908 21L852 21 829 32 853 29ZM692 879L748 879 771 868 747 871ZM908 879L852 879 829 868 853 871Z" fill="#302833"/>
  <path d="M599 9H730L749 16H851L870 9H1001L977 19H885L865 28H735L715 19H623ZM599 891H730L749 884H851L870 891H1001L977 881H885L865 872H735L715 881H623Z" fill="#242029"/>
  <path d="M620 13H715L735 21H763M837 21H865L885 13H980M620 887H715L735 879H763M837 879H865L885 887H980" fill="none" stroke="#9f55ba" stroke-width="2"/>
  <use href="#star" transform="translate(800 25)"/><use href="#star" transform="translate(800 875) rotate(180)"/>
  <path d="M210 28H360M1240 28H1390M210 872H360M1240 872H1390" stroke="url(#violet)" stroke-width="4"/>
  <path d="M25 320v80m0 100v80m1550-260v80m0 100v80" stroke="#746b79" stroke-width="3"/>
</svg>
`;

// Clip each cell against the perpendicular bisector of every other seed.
// A fixed seed keeps the pattern identical in the locker and on the title card.
export const VIOLET_FACETS = (() => {
  type Point = [number, number];
  let seed = 20261105;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const points: Point[] = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) {
    points.push([(x + 0.18 + random() * 0.64) * 16, (y + 0.18 + random() * 0.64) * 15]);
  }
  const cells = points.map(([px, py], index) => {
    let polygon: Point[] = [[0, 0], [160, 0], [160, 90], [0, 90]];
    for (const [qx, qy] of points) {
      if (qx === px && qy === py) continue;
      const nx = qx - px, ny = qy - py;
      const limit = (qx * qx + qy * qy - px * px - py * py) / 2;
      const distance = ([x, y]: Point) => x * nx + y * ny - limit;
      const clipped: Point[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = distance(a), db = distance(b);
        if (da <= 0) clipped.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      polygon = clipped;
      if (!polygon.length) break;
    }
    const path = polygon.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('') + 'Z';
    const delay = -(index * 1.73 % 11).toFixed(2);
    return `<path class="vt-cell" d="${path}"/><path class="vt-sparkle" d="${path}" style="--delay:${delay}s"/>`;
  });
  return `<svg class="pc-violet-facets" viewBox="0 0 160 90" aria-hidden="true">${cells.join('')}</svg>`;
})();

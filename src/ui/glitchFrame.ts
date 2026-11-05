// GLITCH: a thin chamfered outline, with inverted-color pixel noise piled at the edges and corners.
// Drawn on the same 160x90 grid as the other frames. A fixed seed keeps the noise identical everywhere.
export const GLITCH_FRAME = (() => {
  let seed = 20261107;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  const W = 160, H = 90, CUT = 7;
  // The game is steel gray, black and white: the noise is mostly dark and gray, with magenta and cyan only as sparks.
  // White pieces; index.html blends them with mix-blend-mode: difference, so each one inverts whatever is under it.
  const colors = ['#fff'];
  // Where the noise piles up: mostly the top-left and bottom-right corners, like the claws of the other frames.
  const spots: Array<['t' | 'b' | 'l' | 'r', number, number]> = [
    ['t', 0.05, 0.1], ['t', 0.9, 0.05], ['l', 0.06, 0.12], ['t', 0.5, 0.06], ['b', 0.5, 0.06], ['l', 0.5, 0.06], ['r', 0.5, 0.06], ['b', 0.04, 0.08],
    ['b', 0.95, 0.1], ['b', 0.1, 0.05], ['r', 0.94, 0.12], ['r', 0.1, 0.06],
  ];
  const pixels: string[] = [];
  const flicker: string[] = [];
  const total = 180;
  for (let i = 0; i < total; i++) {
    const [side, at, spread] = pick(spots);
    const along = Math.min(1, Math.max(0, at + (random() + random() + random() - 1.5) * 2 * spread));
    // Mostly hugging the edge; a few strays reach further in.
    const depth = -Math.log(1 - random() * 0.96) * 2.8;
    const w = pick([1.2, 1.8, 2.4, 3.4, 4.6, 6.4, 9, 13, 18]), h = pick([0.6, 1, 1.4, 1.8, 2.4, 3.2, 4.4]);
    let x: number, y: number, rw = w, rh = h;
    if (side === 't' || side === 'b') {
      x = along * (W - w); y = side === 't' ? depth : H - depth - h;
    } else {
      rw = h; rh = w * 0.9;
      y = along * (H - rh); x = side === 'l' ? depth : W - depth - rw;
    }
    // Skip anything that would fall outside the chamfered corners.
    const dx = Math.min(x, W - x - rw), dy = Math.min(y, H - y - rh);
    if (dx + dy < CUT) continue;
    const color = pick(colors);
    const rect = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="${color}"/>`;
    if (random() < 0.07) {
      const delay = -(random() * 6).toFixed(2);
      flicker.push(`<g class="gl-flick" style="--d:${delay}s">${rect}</g>`);
    } else pixels.push(rect);
  }
  const outline =
    `M${CUT} 0.3H${W - CUT}L${W - 0.3} ${CUT}V${H - CUT}L${W - CUT} ${H - 0.3}H${CUT}L0.3 ${H - CUT}V${CUT}Z`;
  return '<svg class="pc-glitch" viewBox="0 0 160 90" aria-hidden="true">' +
    `<path class="gl-ring" d="${outline}"/>` +
    `<path class="gl-ring2" d="M${CUT + 1.4} 1.6H${W - CUT - 1.4}L${W - 1.6} ${CUT + 1.4}V${H - CUT - 1.4}L${W - CUT - 1.4} ${H - 1.6}H${CUT + 1.4}L1.6 ${H - CUT - 1.4}V${CUT + 1.4}Z"/>` +
    '<g class="gl-px">' + pixels.join('') + flicker.join('') + '</g>' +
    '</svg>';
})();

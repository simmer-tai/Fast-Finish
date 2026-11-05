import * as sfx from '../audio.js';
import { BACKGROUNDS, FRAMES, NAME_COLORS, partSwatch } from './cardParts.js';

// SUPPLY の予定ラインナップ。特別なパーツは含めない。
const backgrounds = ['grid', 'stripe', 'halftone', 'band', 'redline', 'ink', 'scan', 'polygon', 'polygon-black', 'carbon'];
const frames = ['bold', 'bracket', 'ticks', 'rededge', 'hazard'];
const colors = ['rededge', 'scan'];
const overlay = document.getElementById('overlay')!;
const tab = overlay.querySelector<HTMLElement>('.gacha')!;
const home = tab.querySelector<HTMLElement>('[data-supply-home]')!;
const lineup = tab.querySelector<HTMLElement>('[data-supply-lineup]')!;
const list = tab.querySelector<HTMLElement>('[data-supply-list]')!;

const items = (ids: string[], all: { id: string; name: string }[], preview: (id: string) => string) =>
  ids.map((id) => `<div class="gc-item">${preview(id)}<small>${all.find((item) => item.id === id)!.name}</small></div>`).join('');
list.innerHTML = `<section><h3>BACKGROUND <small>背景</small></h3><div class="gc-grid">${items(backgrounds, BACKGROUNDS, (id) => partSwatch(id, 'standard'))}</div></section>` +
  `<section><h3>FRAME <small>フレーム</small></h3><div class="gc-grid">${items(frames, FRAMES, (id) => partSwatch('plain', id))}</div></section>` +
  `<section><h3>NAME COLOR <small>名前の色</small></h3><div class="gc-grid">${items(colors, NAME_COLORS, (id) => `<span class="gc-color"><b class="nc-${id}">Aa</b></span>`)}</div></section>`;

export function closeSupplyLineup() {
  lineup.hidden = true;
  home.hidden = false;
}
export function onSupplyClick(target: HTMLElement): boolean {
  if (target.closest('[data-action="supply-lineup"]')) {
    home.hidden = true;
    lineup.hidden = false;
    sfx.playUiOpen();
    return true;
  }
  if (target.closest('[data-action="supply-lineup-back"]')) {
    closeSupplyLineup();
    sfx.playUiBack();
    return true;
  }
  return false;
}
export function supplyLineupOpen() { return !lineup.hidden; }

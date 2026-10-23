import * as THREE from 'three';
import type { StageMover } from '../stage.js';
import { blocks, type Block } from './blocks.js';
import { PLAYER_RADIUS } from '../player/config.js';
import { mantleFrom, mantleTo, player, position } from '../player/state.js';
import { sickleState } from '../weapons/sickleCombat.js';

// ---- 動く物 ----
// ステージの movers（天井クレーンなど）を往復させる。見た目は root ごと動かし、当たり判定の箱は blocks に入れたものの座標を毎フレーム書き換える。
// 上に立っているプレイヤー、よじ登っている途中の行き先、鎖鎌の掛かった所も一緒に運ぶ
interface Mover { def: StageMover; root: THREE.Object3D; parts: { b: Block; base: Block }[]; offset: number }
const movers: Mover[] = [];
let clock = 0;

// ステージへ入り直すときに外す（blocks は呼ぶ側で空にする）
export function clearMovers() {
  movers.length = 0;
  clock = 0;
}

// 当たり判定の箱を blocks に足す。継ぎ目のつっかえを消すまとめ（mergeBoxes）は、動かす箱には掛けない
export function addMover(def: StageMover, root: THREE.Object3D) {
  const parts = def.boxes.map((s) => {
    const base: Block = { minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, h: s.h, y0: s.y0 };
    const b = { ...base };
    blocks.push(b);
    return { b, base };
  });
  movers.push({ def, root, parts, offset: 0 });
}

// 時刻 t での、動き出す前の位置からの距離
function moverOffset(m: StageMover, t: number) {
  const u = t % (2 * (m.pause + m.time));
  const leg = (v: number) => THREE.MathUtils.smoothstep(v, 0, m.time);
  if (u < m.pause) return 0;
  if (u < m.pause + m.time) return m.travel * leg(u - m.pause);
  if (u < 2 * m.pause + m.time) return m.travel;
  return m.travel * (1 - leg(u - 2 * m.pause - m.time));
}

// (x, z) が箱の上面に載っているか（collideBox で上面に乗せるときと同じ幅で見る）
const onTop = (b: Block, x: number, z: number) =>
  Math.hypot(x - THREE.MathUtils.clamp(x, b.minX, b.maxX), z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ)) < PLAYER_RADIUS * 0.5;

export function updateMovers(dt: number) {
  clock += dt;
  for (const m of movers) {
    const next = moverOffset(m.def, clock);
    const d = next - m.offset;
    if (d === 0) continue;
    const dx = m.def.axis === 'x' ? d : 0;
    const dz = m.def.axis === 'z' ? d : 0;
    // 動かす前に、何が載っているかを調べておく
    const riding = player.onGround && player.mantleTime < 0 && m.parts.some(({ b }) => Math.abs(position.y - b.h) < 1e-3 && onTop(b, position.x, position.z));
    const mantling = player.mantleTime >= 0 && m.parts.some(({ b }) => Math.abs(mantleTo.y - b.h) < 1e-3 && onTop(b, mantleTo.x, mantleTo.z));
    const g = sickleState.grapple;
    const hooked = !!g?.block && m.parts.some(({ b }) => b === g.block);

    m.offset = next;
    const ox = m.def.axis === 'x' ? next : 0;
    const oz = m.def.axis === 'z' ? next : 0;
    for (const { b, base } of m.parts) {
      b.minX = base.minX + ox;
      b.maxX = base.maxX + ox;
      b.minZ = base.minZ + oz;
      b.maxZ = base.maxZ + oz;
    }
    m.root.position[m.def.axis] = next;

    if (riding) {
      position.x += dx;
      position.z += dz;
    }
    if (mantling) {
      mantleFrom.x += dx;
      mantleFrom.z += dz;
      mantleTo.x += dx;
      mantleTo.z += dz;
    }
    if (hooked && g) {
      for (const v of [g.target, g.zipFrom, g.zipTo]) {
        v.x += dx;
        v.z += dz;
      }
    }
  }
}

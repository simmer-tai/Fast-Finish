import * as THREE from 'three';
import type { StageMover, StageMoverPart } from '../stage.js';
import { blocks, type Block } from './blocks.js';
import { EYE_HEIGHT, PLAYER_RADIUS } from '../player/config.js';
import { lookEuler, mantleFrom, mantleTo, player, position, velocity } from '../player/state.js';
import { sickleState } from '../weapons/sickleCombat.js';
import { hooks } from '../game/hooks.js';
import { game } from '../game/state.js';
import * as sfx from '../audio.js';

// ---- 動く物 ----
// ステージの movers（天井クレーン、走る車など）を道のりに沿って動かす。見た目は部品ごとの root ごと動かし、
// 当たり判定の箱は blocks に入れたものの座標を毎フレーム書き換える。
// 上に立っているプレイヤー、よじ登っている途中の行き先、鎖鎌の掛かった所も一緒に運ぶ（向きが変われば一緒に回す）
interface Part { def: StageMoverPart; root: THREE.Object3D; boxes: { b: Block; base: Block }[]; x: number; z: number; yaw: number }
interface Mover { def: StageMover; parts: Part[]; period: number; vx: number; vz: number; hitCool: number }
const movers: Mover[] = [];
let clock = 0;

// 車にはねられたとき
const HAZARD_SPEED = 2; // これより速く動いている間だけ跳ね飛ばす (m/s)
const HAZARD_DAMAGE = 10;
const HAZARD_THROW = 1.3; // 跳ね飛ばす水平の速さ（車の速さに掛ける）
const HAZARD_THROW_MIN = 10; // 跳ね飛ばす水平の速さの下限 (m/s)
const HAZARD_LIFT = 6; // 跳ね上げる速さ (m/s)
const HAZARD_COOL = 1; // 続けてはねられない時間 (s)
const PLAYER_HEIGHT = EYE_HEIGHT + 0.2;

// ステージへ入り直すときに外す（blocks は呼ぶ側で空にする）
export function clearMovers() {
  movers.length = 0;
  clock = 0;
}

// roots は部品ごとの親（def.parts と同じ順）。当たり判定の箱を blocks に足す。
// 継ぎ目のつっかえを消すまとめ（mergeBoxes）は、動かす箱には掛けない
export function addMover(def: StageMover, roots: THREE.Object3D[]) {
  const parts = def.parts.map((p, i) => ({
    def: p,
    root: roots[i],
    boxes: [...p.boxes, ...(p.colliders ?? [])].map((s) => {
      const base: Block = { minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, h: s.h, y0: s.y0 };
      const b = { ...base };
      blocks.push(b);
      return { b, base };
    }),
    x: 0,
    z: 0,
    yaw: 0,
  }));
  movers.push({ def, parts, period: def.path.reduce((t, s) => t + s.time, 0), vx: 0, vz: 0, hitCool: 0 });
}

// 時刻 t での、動き出す前の位置からのずれと向き
const at = { x: 0, z: 0, yaw: 0 };
const EASE = {
  both: (u: number) => u * u * (3 - 2 * u),
  in: (u: number) => u * u,
  out: (u: number) => u * (2 - u),
  none: (u: number) => u,
};
function moverOffset(m: Mover, t: number) {
  let u = t % m.period;
  let px = 0;
  let pz = 0;
  let pyaw = 0;
  for (const s of m.def.path) {
    const yaw = s.yaw ?? pyaw;
    if (u < s.time) {
      const k = EASE[s.ease ?? 'both'](u / s.time);
      at.x = px + (s.x - px) * k;
      at.z = pz + (s.z - pz) * k;
      at.yaw = pyaw + (yaw - pyaw) * k;
      return at;
    }
    u -= s.time;
    px = s.x;
    pz = s.z;
    pyaw = yaw;
  }
  at.x = px;
  at.z = pz;
  at.yaw = pyaw;
  return at;
}

// (x, z) が箱の上面に載っているか（collideBox で上面に乗せるときと同じ幅で見る）
const onTop = (b: Block, x: number, z: number) =>
  Math.hypot(x - THREE.MathUtils.clamp(x, b.minX, b.maxX), z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ)) < PLAYER_RADIUS * 0.5;
// 円柱（足もと y0 から頭 y1、半径 r）が箱に触れているか。上に載っているだけなら触れていない
const touches = (b: Block, x: number, z: number, y0: number, y1: number, r: number) =>
  y0 < b.h - 0.05 && y1 > (b.y0 ?? 0)
  && Math.hypot(x - THREE.MathUtils.clamp(x, b.minX, b.maxX), z - THREE.MathUtils.clamp(z, b.minZ, b.maxZ)) < r;

// 動き出す前の位置にある点 (x, z) を、ずれ (ox, oz) と向き yaw（pivot まわり）の位置へ移す
const ORIGIN = { x: 0, z: 0 };
const moved = { x: 0, z: 0 };
function place(pivot: { x: number; z: number }, ox: number, oz: number, yaw: number, x: number, z: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = x - pivot.x;
  const lz = z - pivot.z;
  // three.js の y 軸まわりの回転と同じ向き（上から見て左回り）
  moved.x = pivot.x + ox + c * lx + s * lz;
  moved.z = pivot.z + oz - s * lx + c * lz;
  return moved;
}
// 部品の上にある点 v を、部品と一緒に、いまの位置から新しい位置 (nx, nz, nyaw) へ運ぶ
function carry(pivot: { x: number; z: number }, p: Part, nx: number, nz: number, nyaw: number, v: { x: number; z: number }) {
  // いまの向きを戻して、動き出す前の位置での座標にする
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const lx = v.x - pivot.x - p.x;
  const lz = v.z - pivot.z - p.z;
  const q = place(pivot, nx, nz, nyaw, pivot.x + c * lx - s * lz, pivot.z + s * lx + c * lz);
  v.x = q.x;
  v.z = q.z;
}

export function updateMovers(dt: number) {
  clock += dt;
  for (const m of movers) {
    m.hitCool -= dt;
    const next = moverOffset(m, clock);
    const pivot = m.def.pivot ?? ORIGIN;
    for (const p of m.parts) {
      const nx = p.def.follow === 'z' ? 0 : next.x;
      const nz = p.def.follow === 'x' ? 0 : next.z;
      const nyaw = next.yaw;
      const dx = nx - p.x;
      const dz = nz - p.z;
      const dyaw = nyaw - p.yaw;
      if (p === m.parts[0] && dt > 0) {
        m.vx = dx / dt;
        m.vz = dz / dt;
      }
      if (dx === 0 && dz === 0 && dyaw === 0) continue;
      // 動かす前に、何が載っているかを調べておく
      const riding = player.onGround && player.mantleTime < 0 && p.boxes.some(({ b }) => Math.abs(position.y - b.h) < 1e-3 && onTop(b, position.x, position.z));
      const mantling = player.mantleTime >= 0 && p.boxes.some(({ b }) => Math.abs(mantleTo.y - b.h) < 1e-3 && onTop(b, mantleTo.x, mantleTo.z));
      const g = sickleState.grapple;
      const hooked = !!g?.block && p.boxes.some(({ b }) => b === g.block);

      if (riding) {
        carry(pivot, p, nx, nz, nyaw, position);
        lookEuler.y += dyaw; // 車が曲がれば、乗っている人も一緒に向きを変える
      }
      if (mantling) {
        carry(pivot, p, nx, nz, nyaw, mantleFrom);
        carry(pivot, p, nx, nz, nyaw, mantleTo);
      }
      if (hooked && g) for (const v of [g.target, g.zipFrom, g.zipTo]) carry(pivot, p, nx, nz, nyaw, v);

      p.x = nx;
      p.z = nz;
      p.yaw = nyaw;
      for (const { b, base } of p.boxes) {
        if (nyaw === 0) {
          b.minX = base.minX + nx;
          b.maxX = base.maxX + nx;
          b.minZ = base.minZ + nz;
          b.maxZ = base.maxZ + nz;
          continue;
        }
        // 回した箱の四隅を囲む
        b.minX = b.minZ = Infinity;
        b.maxX = b.maxZ = -Infinity;
        for (const x of [base.minX, base.maxX]) {
          for (const z of [base.minZ, base.maxZ]) {
            const q = place(pivot, nx, nz, nyaw, x, z);
            b.minX = Math.min(b.minX, q.x);
            b.maxX = Math.max(b.maxX, q.x);
            b.minZ = Math.min(b.minZ, q.z);
            b.maxZ = Math.max(b.maxZ, q.z);
          }
        }
      }
      // 親は原点まわりに回るので、pivot まわりになるよう位置をずらす
      const o = place(pivot, nx, nz, nyaw, 0, 0);
      p.root.position.set(o.x, 0, o.z);
      p.root.rotation.y = nyaw;
    }
    if (m.def.hazard) hitPlayer(m);
  }
}

// 動いている車にプレイヤーが触れたら、車の進む向きへ跳ね飛ばす
function hitPlayer(m: Mover) {
  const speed = Math.hypot(m.vx, m.vz);
  if (speed < HAZARD_SPEED || m.hitCool > 0 || game.playerHp <= 0) return;
  const top = position.y + PLAYER_HEIGHT;
  if (!m.parts.some((p) => p.boxes.some(({ b }) => touches(b, position.x, position.z, position.y, top, PLAYER_RADIUS + 0.05)))) return;
  m.hitCool = HAZARD_COOL;
  const throwSpeed = Math.max(speed * HAZARD_THROW, HAZARD_THROW_MIN);
  velocity.set((m.vx / speed) * throwSpeed, HAZARD_LIFT, (m.vz / speed) * throwSpeed);
  player.onGround = false;
  hooks.damagePlayer(HAZARD_DAMAGE);
  sfx.playAxeGround(1.2);
  sfx.playHurt();
  hooks.addTrauma(0.8);
}

// これから ahead 秒の間に、走っている車が足もと y0・高さ h・半径 r の円柱に触れるか（道のりを先まで読む）。
// 触れるなら、out にその車の進む向きと直角で、車の真ん中から離れる側の向きを入れる
const THREAT_STEP = 0.1;
const box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: 0, y0: 0 as number | undefined };
export function moverThreat(x: number, z: number, y0: number, h: number, r: number, ahead: number, out: THREE.Vector3): boolean {
  for (const m of movers) {
    if (!m.def.hazard) continue;
    const pivot = m.def.pivot ?? ORIGIN;
    for (let t = 0; t <= ahead + 1e-6; t += THREAT_STEP) {
      const a = moverOffset(m, clock + t);
      const [ox, oz, yaw] = [a.x, a.z, a.yaw];
      const b = moverOffset(m, clock + t + 0.05);
      const vx = b.x - ox;
      const vz = b.z - oz;
      const speed = Math.hypot(vx, vz) / 0.05;
      if (speed < HAZARD_SPEED) continue;
      const hit = m.parts.some((p) => p.boxes.some(({ base }) => {
        box.minX = box.minZ = Infinity;
        box.maxX = box.maxZ = -Infinity;
        for (const bx of [base.minX, base.maxX]) {
          for (const bz of [base.minZ, base.maxZ]) {
            const q = place(pivot, ox, oz, yaw, bx, bz);
            box.minX = Math.min(box.minX, q.x);
            box.maxX = Math.max(box.maxX, q.x);
            box.minZ = Math.min(box.minZ, q.z);
            box.maxZ = Math.max(box.maxZ, q.z);
          }
        }
        box.h = base.h;
        box.y0 = base.y0;
        return touches(box, x, z, y0, y0 + h, r);
      }));
      if (!hit) continue;
      // 車の真ん中から見て、進む向きの左右どちらにいるか
      const cx = pivot.x + ox;
      const cz = pivot.z + oz;
      const side = (x - cx) * -vz + (z - cz) * vx >= 0 ? 1 : -1;
      out.set(-vz * side, 0, vx * side).normalize();
      return true;
    }
  }
  return false;
}

// 動いている車が、足もと y0・高さ h・半径 r の敵に触れているか。触れていれば車の水平の速度を返す
const hazardVel = new THREE.Vector3();
export function moverHazardAt(x: number, z: number, y0: number, h: number, r: number): THREE.Vector3 | null {
  for (const m of movers) {
    if (!m.def.hazard || Math.hypot(m.vx, m.vz) < HAZARD_SPEED) continue;
    if (m.parts.some((p) => p.boxes.some(({ b }) => touches(b, x, z, y0, y0 + h, r)))) return hazardVel.set(m.vx, 0, m.vz);
  }
  return null;
}

import * as THREE from 'three';
import * as sfx from '../audio.js';
import { PLAYER_RADIUS } from '../player/config.js';
import { player, position, velocity } from '../player/state.js';
import { hooks } from '../game/hooks.js';
import { spawnSparks } from '../fx/hitFx.js';
import { STRUCT_GRID, blocks, boxGeo, gridMaterial, type Block } from './blocks.js';

// ---- パルクールの仕掛け ----
// コース（world/parkour.ts）の traps に並べた物を置いて動かす。範囲は足場と同じく min / max で書き、y は上面の高さ。
//   jump: ジャンプ台。乗ると power の速さで真上へ打ち上げる（二段ジャンプも戻す）
//   boost: 加速床。地上で踏むと -Z へ speed まで速くする
//   crumble: 崩れる足場。乗ってから CRUMBLE_DELAY で落ち、CRUMBLE_BACK で戻る
//   blink: 点滅する足場。period ごとに、初めの on の割合だけ現れる（phase はずらし。消える前に明滅して知らせる）
//   laser: 赤い光線（見た目はボスのレーザーと同じ）。触れると落ちたのと同じ扱い。bob で上下に揺らし、on（< 1）で点滅させる。
//     点滅するものは、出る少し前に細い照準線を出して知らせる
//   pole: 縦の光線（光の柱）。x, z に minY から maxY まで立つ。sway で z の向きに揺らし、on（< 1）で点滅させる。ほかは laser と同じ
export type ParkourTrap =
  | { kind: 'jump'; minX: number; maxX: number; minZ: number; maxZ: number; y: number; power: number }
  | { kind: 'boost'; minX: number; maxX: number; minZ: number; maxZ: number; y: number; speed: number }
  | { kind: 'crumble'; minX: number; maxX: number; minZ: number; maxZ: number; h: number }
  | { kind: 'blink'; minX: number; maxX: number; minZ: number; maxZ: number; h: number; period: number; on: number; phase?: number }
  | { kind: 'laser'; minX: number; maxX: number; z: number; y: number; bob?: number; period?: number; on?: number; phase?: number }
  | { kind: 'pole'; x: number; z: number; minY: number; maxY: number; sway?: number; period?: number; on?: number; phase?: number };

const SLAB = 1; // 崩れる足場・点滅する足場の厚み
const CRUMBLE_DELAY = 0.45; // 乗ってから落ちるまで (s)。その間は震える
const CRUMBLE_BACK = 2.5; // 落ちてから戻るまで (s)
const CRUMBLE_GRAVITY = 25;
const BLINK_WARN = 0.45; // 消える前に明滅する時間 (s)
const LASER_RADIUS = 0.16; // 光の太さ。当たりもこの太さで見る
const LASER_WARN = 0.5; // 点滅する光線が出る前に照準線を出す時間 (s)
const PAD_COOL = 0.25; // ジャンプ台・加速床がもう一度効くまで (s)

const slabMat = gridMaterial(STRUCT_GRID, undefined, 'part');
function gridBox(sx: number, sy: number, sz: number, light: number) {
  const m = new THREE.InstancedMesh(boxGeo, slabMat, 1);
  m.setMatrixAt(0, new THREE.Matrix4().makeScale(sx, sy, sz));
  m.setColorAt(0, new THREE.Color().setHSL(0, 0, light));
  m.castShadow = m.receiveShadow = true;
  return m;
}
const glow = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
const plainBox = new THREE.BoxGeometry(1, 1, 1);
// 光線: ボスのレーザー（enemy/boss.ts）と同じく、白い芯を赤い光で包み、照準線は細い赤。x の向きに長さ 1、半径 1
const poleGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
const laserGeo = poleGeo.clone().rotateZ(Math.PI / 2);
const additive = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const sparkDir = new THREE.Vector3();
const sparkAt = new THREE.Vector3();

interface Slab { def: Extract<ParkourTrap, { kind: 'crumble' | 'blink' }>; mesh: THREE.InstancedMesh; block: Block; t: number; fall: number; fallV: number }
interface Pad { def: Extract<ParkourTrap, { kind: 'jump' | 'boost' }>; marks: THREE.Mesh[]; cool: number }
interface Laser { def: Extract<ParkourTrap, { kind: 'laser' }>; beam: THREE.Group; aim: THREE.Mesh; y: number; live: boolean }
interface Pole { def: Extract<ParkourTrap, { kind: 'pole' }>; beam: THREE.Group; aim: THREE.Mesh; caps: THREE.Object3D[] }
const slabs: Slab[] = [];
const pads: Pad[] = [];
const lasers: Laser[] = [];
const poles: Pole[] = [];
const group = new THREE.Group();
let clock = 0;

export function setParkourTraps(defs: readonly ParkourTrap[], root: THREE.Object3D) {
  clearParkourTraps();
  root.add(group);
  for (const def of defs) {
    if (def.kind === 'crumble' || def.kind === 'blink') {
      const mesh = gridBox(def.maxX - def.minX, SLAB, def.maxZ - def.minZ, def.kind === 'crumble' ? 0.55 : 0.85);
      mesh.position.set(def.minX, def.h - SLAB, def.minZ);
      group.add(mesh);
      const block: Block = { minX: def.minX, maxX: def.maxX, minZ: def.minZ, maxZ: def.maxZ, h: def.h, y0: def.h - SLAB };
      blocks.push(block);
      slabs.push({ def, mesh, block, t: -1, fall: 0, fallV: 0 });
    } else if (def.kind === 'pole') {
      const { beam, aim } = makeBeam(poleGeo);
      // 上下の発射口
      const caps = [def.minY - 0.5, def.maxY].map((y) => {
        const cap = gridBox(0.6, 0.5, 0.6, 0.3);
        cap.userData.y = y;
        group.add(cap);
        return cap;
      });
      poles.push({ def, beam, aim, caps });
    } else if (def.kind === 'laser') {
      const { beam, aim } = makeBeam(laserGeo);
      // 両端の発射口
      for (const x of [def.minX - 0.2, def.maxX + 0.2]) {
        const post = gridBox(0.4, 0.6, 0.4, 0.3);
        post.userData.laserPost = { x: x - 0.2, def };
        group.add(post);
      }
      lasers.push({ def, beam, aim, y: def.y, live: true });
    } else {
      // ジャンプ台は白い板と輪、加速床は進む向きに並べた帯（順に光らせる）
      const n = def.kind === 'jump' ? 3 : 4;
      const marks: THREE.Mesh[] = [];
      const w = def.maxX - def.minX;
      const d = def.maxZ - def.minZ;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(plainBox, glow(0xffffff, 0.6));
        if (def.kind === 'jump') {
          const k = 1 - i * 0.28;
          m.scale.set(w * k, 0.04, d * k);
          m.position.set((def.minX + def.maxX) / 2, def.y + 0.02 + i * 0.01, (def.minZ + def.maxZ) / 2);
        } else {
          m.scale.set(w, 0.04, d / n * 0.45);
          m.position.set((def.minX + def.maxX) / 2, def.y + 0.02, def.maxZ - d * (i + 0.5) / n);
        }
        group.add(m);
        marks.push(m);
      }
      pads.push({ def, marks, cool: 0 });
    }
  }
  resetParkourTraps();
}

// 白い芯を赤い光で包んだ光線と、出る前の照準線
function makeBeam(geo: THREE.BufferGeometry) {
  const beam = new THREE.Group();
  const core = new THREE.Mesh(geo, additive(0xffffff, 0.95));
  core.scale.set(0.4, 1, 0.4);
  if (geo === laserGeo) core.scale.set(1, 0.4, 0.4);
  beam.add(core, new THREE.Mesh(geo, additive(0xff3020, 0.55)));
  const aim = new THREE.Mesh(geo, additive(0xff3020, 0));
  group.add(beam, aim);
  return { beam, aim };
}

export function clearParkourTraps() {
  for (const s of slabs) {
    const i = blocks.indexOf(s.block);
    if (i >= 0) blocks.splice(i, 1);
  }
  slabs.length = pads.length = lasers.length = poles.length = 0;
  for (const c of [...group.children]) {
    group.remove(c);
    if (c instanceof THREE.Mesh && c.material !== slabMat) (c.material as THREE.Material).dispose(); // 格子の材質は使い回す
  }
  group.removeFromParent();
}

// やり直したときや、落ちて戻したときに、崩れた足場を戻し、点滅の拍子を初めからにする
export function resetParkourTraps() {
  clock = 0;
  for (const s of slabs) { s.t = -1; s.fall = 0; s.fallV = 0; setSolid(s, true); }
  for (const p of pads) p.cool = 0;
}

function setSolid(s: Slab, on: boolean) {
  s.block.h = on ? s.def.h : s.def.h - SLAB - 1; // 底より下にすると当たらなくなる（movers.ts の引き戸と同じ）
}
const standingOn = (minX: number, maxX: number, minZ: number, maxZ: number, y: number) =>
  player.onGround && Math.abs(position.y - y) < 0.05 &&
  position.x > minX - PLAYER_RADIUS && position.x < maxX + PLAYER_RADIUS && position.z > minZ - PLAYER_RADIUS && position.z < maxZ + PLAYER_RADIUS;
const blinkOn = (d: { period: number; on: number; phase?: number }, t: number) => ((t / d.period + (d.phase ?? 0)) % 1 + 1) % 1 < d.on;
// 点滅する光線が出ているか（live）と、出る前の照準線の濃さ（warn。0..1）
function beamState(d: { period?: number; on?: number; phase?: number }) {
  const period = d.period ?? 2;
  if (d.on === undefined || d.on >= 1) return { live: true, warn: 0 };
  const live = blinkOn({ period, on: d.on, phase: d.phase }, clock);
  // 消えている間は、出るまでの残りが LASER_WARN を切ったら照準線を明滅させる
  const untilOn = (1 - ((((clock / period + (d.phase ?? 0)) % 1) + 1) % 1)) * period;
  return { live, warn: !live && untilOn < LASER_WARN ? 0.5 + 0.5 * Math.cos(untilOn * 45) : 0 };
}
const jitter = () => LASER_RADIUS * (0.85 + 0.3 * Math.random());

// 光線に触れたら true（呼んだ側で落ちたときと同じに戻す）
export function updateParkourTraps(dt: number): boolean {
  clock += dt;
  for (const s of slabs) {
    const d = s.def;
    if (d.kind === 'crumble') {
      if (s.t < 0 && standingOn(d.minX, d.maxX, d.minZ, d.maxZ, d.h)) { s.t = 0; sfx.playHullCreak(0.6); }
      if (s.t < 0) continue;
      s.t += dt;
      if (s.t < CRUMBLE_DELAY) {
        const k = s.t / CRUMBLE_DELAY;
        s.mesh.position.set(d.minX + (Math.random() - 0.5) * 0.12 * k, d.h - SLAB, d.minZ + (Math.random() - 0.5) * 0.12 * k);
      } else if (s.t < CRUMBLE_DELAY + CRUMBLE_BACK) {
        if (s.block.h === d.h) { setSolid(s, false); sfx.playAxeGround(0.6); }
        s.fallV += CRUMBLE_GRAVITY * dt;
        s.fall += s.fallV * dt;
        s.mesh.position.set(d.minX, d.h - SLAB - s.fall, d.minZ);
        s.mesh.visible = s.fall < 40;
      } else {
        s.t = -1; s.fall = 0; s.fallV = 0;
        s.mesh.visible = true;
        s.mesh.position.set(d.minX, d.h - SLAB, d.minZ);
        setSolid(s, true);
      }
    } else {
      const on = blinkOn(d, clock);
      // 消える少し前から明滅させる
      const left = on ? (d.on - ((clock / d.period + (d.phase ?? 0)) % 1 + 1) % 1) * d.period : 1;
      s.mesh.visible = on && !(left < BLINK_WARN && Math.floor(left * 14) % 2 === 0);
      setSolid(s, on);
    }
  }
  for (const p of pads) {
    const d = p.def;
    p.cool -= dt;
    const pulse = clock * (d.kind === 'jump' ? 2.5 : 5);
    p.marks.forEach((m, i) => {
      (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.55 * Math.max(0, Math.sin(pulse * Math.PI - i * 1.1));
    });
    if (p.cool > 0 || !standingOn(d.minX, d.maxX, d.minZ, d.maxZ, d.y)) continue;
    p.cool = PAD_COOL;
    if (d.kind === 'jump') {
      velocity.y = d.power;
      player.onGround = false;
      player.airJump = true;
      sfx.playJump();
      hooks.addTrauma(0.25);
    } else if (-velocity.z < d.speed) {
      velocity.z = -d.speed;
      velocity.x *= 0.5;
      sfx.playDash();
    }
  }
  let hit = false;
  const top = position.y + player.eyeHeight + 0.2;
  for (const l of lasers) {
    const d = l.def;
    const period = d.period ?? 2;
    const len = d.maxX - d.minX;
    l.y = d.y + (d.bob ? d.bob * Math.sin((clock / period + (d.phase ?? 0)) * Math.PI * 2) : 0);
    const { live, warn } = beamState(d);
    l.live = live;
    l.aim.visible = warn > 0;
    l.aim.position.set((d.minX + d.maxX) / 2, l.y, d.z);
    l.aim.scale.set(len, 0.035, 0.035);
    (l.aim.material as THREE.MeshBasicMaterial).opacity = 0.9 * warn;
    l.beam.visible = l.live;
    if (l.live) {
      const r = jitter();
      l.beam.position.set((d.minX + d.maxX) / 2, l.y, d.z);
      l.beam.scale.set(len, r, r);
      // 両端の発射口から火花を散らす
      for (const [x, dir] of [[d.minX, 1], [d.maxX, -1]] as const) {
        if (Math.random() < 0.5) spawnSparks(sparkAt.set(x, l.y, d.z), sparkDir.set(dir, 0, 0), 1, 0.4, 0.7);
      }
    }
    if (l.live && position.x > d.minX - PLAYER_RADIUS && position.x < d.maxX + PLAYER_RADIUS &&
      Math.abs(position.z - d.z) < PLAYER_RADIUS + LASER_RADIUS && l.y > position.y && l.y < top) hit = true;
  }
  for (const p of poles) {
    const d = p.def;
    const z = d.z + (d.sway ? d.sway * Math.sin(((clock / (d.period ?? 2)) + (d.phase ?? 0)) * Math.PI * 2) : 0);
    const { live, warn } = beamState(d);
    const len = d.maxY - d.minY;
    const mid = (d.minY + d.maxY) / 2;
    p.aim.visible = warn > 0;
    p.aim.position.set(d.x, mid, z);
    p.aim.scale.set(0.035, len, 0.035);
    (p.aim.material as THREE.MeshBasicMaterial).opacity = 0.9 * warn;
    p.beam.visible = live;
    for (const c of p.caps) c.position.set(d.x - 0.3, c.userData.y as number, z - 0.3);
    if (!live) continue;
    const r = jitter();
    p.beam.position.set(d.x, mid, z);
    p.beam.scale.set(r, len, r);
    for (const [y, dir] of [[d.minY, 1], [d.maxY, -1]] as const) {
      if (Math.random() < 0.5) spawnSparks(sparkAt.set(d.x, y, z), sparkDir.set(0, dir, 0), 1, 0.4, 0.7);
    }
    if (Math.abs(position.x - d.x) < PLAYER_RADIUS + LASER_RADIUS && Math.abs(position.z - z) < PLAYER_RADIUS + LASER_RADIUS &&
      d.minY < top && d.maxY > position.y) hit = true;
  }
  for (const c of group.children) {
    const post = c.userData.laserPost as { x: number; def: Laser['def'] } | undefined;
    if (!post) continue;
    const l = lasers.find((v) => v.def === post.def)!;
    c.position.set(post.x, l.y - 0.3, post.def.z - 0.2);
  }
  return hit;
}

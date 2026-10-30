import * as THREE from 'three';
import { camera, controls, scene } from '../core.js';
import { position, lookEuler, player, velocity } from '../player/state.js';
import { game } from '../game/state.js';
import { parryActive } from '../combat/parry.js';
import { spearNetworkState } from '../weapons/spearCombat.js';
import { sickleState } from '../weapons/sickleCombat.js';
import { enemies } from '../enemy/state.js';
import { captureBossSnapshot, isBossSnapshot, type BossSnapshot } from './bossSnapshot.js';
import type { BossLimb } from '../enemy/boss.js';
import { captureMissileSnapshots, isMissileSnapshots, type MissileSnapshot } from '../enemy/bossMissiles.js';
import { captureAdds, isAddSnapshots, type AddSnapshot } from './enemySnapshot.js';
import { selectedLoadout } from '../ui/weaponPicker.js';
import { WEAPON_IDS, type WeaponId } from '../weapons/ids.js';

// PeerJS は接続の仲介だけに使う。ゲームの状態はホストとの DataChannel で交換する。
interface Connection {
  peer: string; open: boolean;
  bufferSize?: number; dataChannel?: RTCDataChannel;
  send(value: unknown): void; close(): void;
  on(event: string, callback: (...args: any[]) => void): void;
}
interface PeerClient {
  on(event: string, callback: (...args: any[]) => void): void;
  connect(id: string, options?: object): Connection;
  disconnect(): void; reconnect?(): void; destroy(): void;
}
type PeerConstructor = new (id?: string) => PeerClient;
type WeaponHold = { phase: 'none' | 'windup' | 'flying' | 'stuck' | 'returning'; tip: [number, number, number]; dir: [number, number, number]; held: [number, number][] };
type Pose = { id: string; x: number; y: number; z: number; yaw: number; onGround: boolean; eyeHeight: number; alive: boolean; vx: number; vy: number; vz: number;
  lookX: number; lookY: number; lookZ: number; parry: boolean; bat: boolean; spear: WeaponHold; grapple: [number, number] | null };
type Member = { id: string; ready: boolean; weapon: WeaponId | null };
type Remote = { conn: Connection; ready: boolean; weapon: WeaponId | null; pose: Pose | null; poseTime: number; hitTokens: number; hitTokenTime: number };
export type KunaiBossHit = { attack: string; part: string; at: [number, number, number]; scale?: number; force?: number; requestId?: number };
export type HitConfirmation = { id: number; damage: number; result: 'hit' | 'break' | 'down' | 'kill' | 'blocked' };
export type AddHit = KunaiBossHit & { index: number; spawnId: number };
export type BossShot = { id: number; from: [number, number, number]; dir: [number, number, number]; speed: number; damage: number; length: number; width: number; part: 'armR' | 'armL' | 'gunner'; sound: boolean };
export type BossSlam = { x: number; z: number; radius: number; power: number; quake: number; range: number; speed: number };
export type BossImpact = { damage: number; dx: number; dz: number; push: number; shake: number; vx?: number; vy?: number; vz?: number; minVy?: number };
const remotes = new Map<string, Remote>();
const avatars = new Map<string, { root: THREE.Group; target: THREE.Vector3; yaw: number }>();
let peer: PeerClient | null = null;
let role: 'host' | 'guest' | null = null;
let ownId = 'host';
let roomCode = '';
let ready = false;
let started = false;
let matchFinished = false;
let partySize = 1;
export function multiplayerPartySize() { return started ? partySize : 1; }
let elapsed = 0;
let detailElapsed = 0;
let generation = 0;
let busy = false;
let startGuest: (() => void) | null = null;
export type BossBreak = { part: BossLimb; at: [number, number, number]; dir: [number, number, number]; down: boolean };
let onBossBreak: ((event: BossBreak) => void) | null = null;
let onKunaiBossHit: ((hit: KunaiBossHit, player: Pose) => void) | null = null;
let onBossShot: ((shot: BossShot) => void) | null = null;
let onPlayerShot: ((dir: [number, number, number], damage: number) => void) | null = null;
let onMissileBlast: ((at: [number, number, number]) => void) | null = null;
let onMissileHurt: ((at: [number, number, number], damage: number) => void) | null = null;
let onBossSlam: ((slam: BossSlam) => void) | null = null;
let onBossImpact: ((impact: BossImpact) => void) | null = null;
let onBossVictory: ((score: number, time: number) => void) | null = null;
let onPartyDefeat: (() => void) | null = null;
let onBossParry: ((id: number, at: [number, number, number], mine: boolean) => void) | null = null;
let onMissileParry: ((at: [number, number, number], mine: boolean) => void) | null = null;
let onMissileShotDown: ((id: number, player: Pose) => void) | null = null;
let onAddHit: ((hit: AddHit, player: Pose) => void) | null = null;
let onAddKill: (() => void) | null = null;
let onDisconnect: ((hostLost: boolean) => void) | null = null;
let onHitConfirmation: ((confirmation: HitConfirmation) => void) | null = null;
let nextHitRequest = 1;
let hostMissiles: MissileSnapshot[] = [];
let hostAdds: AddSnapshot[] = [];
export function latestMissiles() { return hostMissiles; }
export function latestAdds() { return hostAdds; }
let hostBossSnapshot: BossSnapshot | null = null;
export function latestBossSnapshot() { return hostBossSnapshot; }
export function isMultiplayerGuest() { return started && role === 'guest'; }

const panel = document.querySelector<HTMLElement>('#overlay .multiplayer')!;
const choose = panel.querySelector<HTMLElement>('[data-choose]')!;
const flow = panel.querySelector<HTMLElement>('[data-flow]')!;
const room = panel.querySelector<HTMLElement>('[data-room]')!;
const form = panel.querySelector<HTMLElement>('[data-join-form]')!;
const codeInput = panel.querySelector<HTMLInputElement>('[data-code-input]')!;
const roomInput = panel.querySelector<HTMLInputElement>('[data-room-code]')!;
const members = panel.querySelector<HTMLElement>('[data-members]')!;
const readyButton = panel.querySelector<HTMLButtonElement>('[data-connect="ready"]')!;
const startButton = panel.querySelector<HTMLButtonElement>('[data-action="multiplayer-start"]')!;
const status = panel.querySelector<HTMLElement>('[data-status]')!;

function loadPeer(): Promise<PeerConstructor> {
  const existing = (window as unknown as { Peer?: PeerConstructor }).Peer;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
    script.onload = () => {
      const ctor = (window as unknown as { Peer?: PeerConstructor }).Peer;
      if (ctor) resolve(ctor); else reject(new Error('通信ライブラリを読み込めませんでした'));
    };
    script.onerror = () => reject(new Error('通信ライブラリを読み込めませんでした'));
    document.head.appendChild(script);
  });
}
function send(conn: Connection, value: unknown) { if (conn.open) conn.send(value); }
function broadcast(value: unknown) { for (const r of remotes.values()) send(r.conn, value); }
// 位置の古い更新を通信待ちに積み続けず、回復したら最新の状態を送る。
// 命中や勝敗などのイベントは通常の send で必ず送る。
function sendSnapshot(conn: Connection, value: unknown) {
  if (!conn.open || (conn.bufferSize ?? 0) > 0 || (conn.dataChannel?.bufferedAmount ?? 0) > 32768) return;
  conn.send(value);
}
function renderMembers(list: Member[]) {
  members.replaceChildren();
  for (let i = 0; i < 4; i++) {
    const member = list[i];
    const li = document.createElement('li');
    li.className = member ? 'mp-player' : 'mp-player empty';
    const info = document.createElement('div'); info.className = 'mp-player-info';
    const number = document.createElement('span'); number.className = 'mp-player-number'; number.textContent = `0${i + 1}`;
    const name = document.createElement('strong'); name.className = 'mp-player-name';
    name.textContent = member ? (i === 0 ? 'HOST' : `PLAYER ${i + 1}`) : 'WAITING';
    const state = document.createElement('small'); state.className = 'mp-player-state';
    state.textContent = member ? `${i === 0 ? 'ホスト' : member.ready ? '準備 OK' : '準備中'}${member.id === ownId ? ' / あなた' : ''}` : '参加者を待っています';
    info.append(number, name, state);
    const weapon = document.createElement('div'); weapon.className = 'mp-player-weapon';
    if (member?.weapon) {
      const source = document.querySelector<SVGElement>(`#weapon .icon svg[data-w="${member.weapon}"]`);
      if (source) { const icon = source.cloneNode(true) as SVGElement; icon.removeAttribute('class'); weapon.append(icon); }
      weapon.setAttribute('aria-label', `武器: ${member.weapon}`);
    } else { weapon.textContent = '—'; weapon.setAttribute('aria-label', '武器未表示'); }
    li.append(info, weapon);
    members.appendChild(li);
  }
}
function updateLobby() {
  if (role !== 'host') return;
  const list = [{ id: 'host', ready: true, weapon: selectedLoadout() }, ...[...remotes.values()].filter((r) => r.conn.open).map((r) => ({ id: r.conn.peer, ready: r.ready, weapon: r.weapon }))];
  renderMembers(list);
  startButton.disabled = started || list.length < 2 || list.some((m) => !m.ready);
  broadcast({ type: 'lobby', members: list });
}
function validPose(v: unknown): v is Pose {
  if (!v || typeof v !== 'object') return false;
  const p = v as Pose;
  const ref = (r: unknown) => Array.isArray(r) && r.length === 2 && r.every((n) => Number.isSafeInteger(n) && n >= 0 && n < 1e9);
  const vec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000);
  return typeof p.id === 'string' && typeof p.onGround === 'boolean' && typeof p.alive === 'boolean' && typeof p.parry === 'boolean' && typeof p.bat === 'boolean' && typeof p.eyeHeight === 'number' && Number.isFinite(p.eyeHeight)
    && !!p.spear && ['none', 'windup', 'flying', 'stuck', 'returning'].includes(p.spear.phase) && vec(p.spear.tip) && vec(p.spear.dir)
    && (p.spear.phase === 'none' || p.spear.phase === 'windup' || (Math.hypot(...p.spear.dir) >= 0.9 && Math.hypot(...p.spear.dir) <= 1.1))
    && Array.isArray(p.spear.held) && p.spear.held.length <= 32 && p.spear.held.every(ref) && (p.grapple === null || ref(p.grapple))
    && p.eyeHeight >= 0 && p.eyeHeight <= 3 && [p.x, p.y, p.z, p.yaw, p.vx, p.vy, p.vz, p.lookX, p.lookY, p.lookZ].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000);
}
const poseLook = new THREE.Vector3();
function localPose(): Pose {
  camera.getWorldDirection(poseLook);
  const spear = spearNetworkState();
  const ref = (e: (typeof enemies)[number]): [number, number] | null => {
    const i = enemies.indexOf(e), s = latestAdds()[i]; return i >= 0 && s?.alive && s.id > 0 ? [i, s.id] : null;
  };
  const grapple = sickleState.grapple;
  return { id: ownId, x: position.x, y: position.y, z: position.z, yaw: lookEuler.y, onGround: player.onGround, eyeHeight: player.eyeHeight,
    alive: game.playerHp > 0, vx: velocity.x, vy: velocity.y, vz: velocity.z, lookX: poseLook.x, lookY: poseLook.y, lookZ: poseLook.z,
    parry: controls.isLocked && parryActive(), bat: game.shownWeapon === 'bat',
    spear: { phase: spear.phase, tip: [spear.tip.x, spear.tip.y, spear.tip.z], dir: [spear.dir.x, spear.dir.y, spear.dir.z], held: spear.held.map(ref).filter((r): r is [number, number] => r !== null) },
    grapple: grapple?.enemy && grapple.aimed && grapple.phase !== 'back' ? ref(grapple.enemy) : null };
}
function removeAvatar(id: string) {
  const a = avatars.get(id); if (!a) return;
  scene.remove(a.root);
  a.root.traverse((obj) => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); } });
  avatars.delete(id);
}
function display(poses: Pose[]) {
  const present = new Set<string>();
  for (const p of poses) {
    if (p.id === ownId) continue;
    present.add(p.id);
    let a = avatars.get(p.id);
    if (!a) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), new THREE.MeshBasicMaterial({ color: 0x236dba }));
      body.position.y = 1;
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      nose.position.set(0, 1.55, -0.28); root.add(body, nose); root.position.set(p.x, p.y, p.z); scene.add(root);
      a = { root, target: new THREE.Vector3(), yaw: p.yaw }; avatars.set(p.id, a);
    }
    a.target.set(p.x, p.y, p.z); a.yaw = p.yaw;
  }
  for (const id of avatars.keys()) if (!present.has(id)) removeAvatar(id);
}
function attach(conn: Connection) {
  if (role === 'host' && (started || remotes.size >= 3 || remotes.has(conn.peer))) { conn.close(); return; }
  const remote: Remote = { conn, ready: false, weapon: null, pose: null, poseTime: 0, hitTokens: 8, hitTokenTime: performance.now() }; remotes.set(conn.peer, remote);
  const timeout = window.setTimeout(() => {
    if (!conn.open && remotes.get(conn.peer) === remote) {
      conn.close(); remotes.delete(conn.peer);
      if (role === 'guest') {
        const client = peer; peer = null; client?.destroy(); form.hidden = false; room.hidden = true;
        status.textContent = '接続がタイムアウトしました。部屋や通信環境を確認してください。';
      } else updateLobby();
    }
  }, 20000);
  conn.on('open', () => {
    clearTimeout(timeout);
    if (role === 'host') updateLobby();
    else {
      send(conn, { type: 'profile', weapon: selectedLoadout() });
      peer?.disconnect(); // 参加者は接続できたら仲介サーバーを離れる
      form.hidden = true; room.hidden = false; readyButton.hidden = false;
      panel.querySelector<HTMLElement>('[data-room-help]')!.textContent = 'ホストの開始を待っています。';
      status.textContent = '参加しました。準備ができたら「準備 OK」を押してください。';
    }
  });
  conn.on('data', (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const m = value as { type?: string; ready?: unknown; weapon?: unknown; pose?: unknown; poses?: unknown; members?: unknown; boss?: unknown; missiles?: unknown; adds?: unknown; hit?: unknown; confirmation?: HitConfirmation; shot?: BossShot; slam?: BossSlam; impact?: BossImpact; dir?: unknown; at?: unknown; part?: unknown; down?: unknown; damage?: unknown; id?: unknown; playerId?: unknown; difficulty?: unknown; partySize?: unknown; score?: unknown; time?: unknown };
    if (role === 'host') {
      if (m.type === 'profile' && !started && typeof m.weapon === 'string' && WEAPON_IDS.includes(m.weapon as WeaponId)) { remote.weapon = m.weapon as WeaponId; updateLobby(); }
      if (m.type === 'ready' && typeof m.ready === 'boolean' && (!started || matchFinished)) { remote.ready = m.ready; updateLobby(); }
      if (m.type === 'pose' && validPose(m.pose)) { remote.pose = { ...m.pose, id: conn.peer }; remote.poseTime = performance.now(); }
      if (m.type === 'missile-shotdown' && started && remote.pose?.alive && performance.now() - remote.poseTime < 500 && typeof m.id === 'number' && Number.isSafeInteger(m.id) && m.id > 0) {
        const now = performance.now(); remote.hitTokens = Math.min(8, remote.hitTokens + Math.max(0, now - remote.hitTokenTime) * 0.012); remote.hitTokenTime = now;
        if (remote.hitTokens >= 1) { remote.hitTokens--; onMissileShotDown?.(m.id, remote.pose); }
      }
      if ((m.type === 'kunai-boss-hit' || m.type === 'add-hit') && started && remote.pose?.alive && performance.now() - remote.poseTime < 500 && m.hit && typeof m.hit === 'object') {
        const hit = m.hit as AddHit;
        const now = performance.now();
        // ３本投げは 35ms 間隔。通信のまとめ送りも許しつつ、異常な連続送信は抑える。
        remote.hitTokens = Math.min(8, remote.hitTokens + Math.max(0, now - remote.hitTokenTime) * 0.012);
        remote.hitTokenTime = now;
        if (typeof hit.attack === 'string' && hit.attack.length <= 20 && typeof hit.part === 'string' && hit.part.length <= 8
          && Number.isSafeInteger(hit.requestId) && hit.requestId! > 0
          && Array.isArray(hit.at) && hit.at.length === 3 && hit.at.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000)
          && (hit.scale === undefined || (typeof hit.scale === 'number' && Number.isFinite(hit.scale) && hit.scale >= 0 && hit.scale <= 4))
          && (hit.force === undefined || (typeof hit.force === 'number' && Number.isFinite(hit.force) && hit.force >= 0 && hit.force <= 600))
          && remote.hitTokens >= 1 && (m.type !== 'add-hit' || (Number.isSafeInteger(hit.index) && hit.index >= 0 && hit.index < 32 && Number.isSafeInteger(hit.spawnId) && hit.spawnId > 0))) {
          remote.hitTokens--;
          if (m.type === 'add-hit') onAddHit?.(hit, remote.pose); else onKunaiBossHit?.(hit, remote.pose);
        }
      }
    } else if (role === 'guest') {
      if (m.type === 'lobby' && Array.isArray(m.members) && m.members.length <= 4 && m.members.every((x: Member) => x && typeof x.id === 'string' && typeof x.ready === 'boolean' && (x.weapon === null || WEAPON_IDS.includes(x.weapon)))) renderMembers(m.members);
      if (m.type === 'poses' && Array.isArray(m.poses) && m.poses.length <= 4 && m.poses.every(validPose)) {
        display(m.poses);
        if (hostBossSnapshot && m.boss && typeof m.boss === 'object') {
          const details = m.boss as Pick<BossSnapshot, 'warnings' | 'pillars' | 'throwable'>;
          hostBossSnapshot = { ...hostBossSnapshot, warnings: details.warnings, pillars: details.pillars, throwable: details.throwable };
        }
        if (isMissileSnapshots(m.missiles)) hostMissiles = m.missiles;
        if (isAddSnapshots(m.adds)) hostAdds = m.adds;
      }
      if (m.type === 'start' && !started && ready && (m.difficulty === 'easy' || m.difficulty === 'normal' || m.difficulty === 'hard')
        && typeof m.partySize === 'number' && Number.isInteger(m.partySize) && m.partySize >= 2 && m.partySize <= 4) {
        game.difficulty = m.difficulty; partySize = m.partySize; started = true; startGuest?.();
      }
      if (m.type === 'boss-pose') {
        if (m.boss === null) hostBossSnapshot = null;
        else if (isBossSnapshot(m.boss)) hostBossSnapshot = { ...m.boss, warnings: hostBossSnapshot?.warnings, pillars: hostBossSnapshot?.pillars, throwable: hostBossSnapshot?.throwable };
      }
      if (m.type === 'boss-break' && started && typeof m.part === 'string' && ['armR', 'armL', 'legR', 'legL'].includes(m.part)
        && typeof m.down === 'boolean' && [m.at, m.dir].every((v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000))) onBossBreak?.(m as BossBreak);
      if (m.type === 'boss-victory' && started && typeof m.score === 'number' && Number.isFinite(m.score) && m.score >= 0 && m.score <= 1e9
        && typeof m.time === 'number' && Number.isFinite(m.time) && m.time >= 0 && m.time <= 1e7) { matchFinished = true; onBossVictory?.(m.score, m.time); }
      if (m.type === 'party-defeat' && started) { matchFinished = true; onPartyDefeat?.(); }
      if (m.type === 'add-kill' && started) onAddKill?.();
      if (m.type === 'hit-confirm' && started && m.confirmation && Number.isSafeInteger(m.confirmation.id) && m.confirmation.id > 0
        && typeof m.confirmation.damage === 'number' && Number.isFinite(m.confirmation.damage) && m.confirmation.damage >= 0 && m.confirmation.damage <= 10000
        && ['hit', 'break', 'down', 'kill', 'blocked'].includes(m.confirmation.result)) onHitConfirmation?.(m.confirmation);
      const vector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000);
      if (m.type === 'boss-shot' && started && m.shot && vector(m.shot.from) && vector(m.shot.dir)
        && Number.isSafeInteger(m.shot.id) && m.shot.id > 0
        && [m.shot.speed, m.shot.damage, m.shot.length, m.shot.width].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1000)
        && typeof m.shot.sound === 'boolean' && (m.shot.part === 'armR' || m.shot.part === 'armL' || m.shot.part === 'gunner')) onBossShot?.(m.shot);
      if (m.type === 'player-shot' && started && vector(m.dir) && typeof m.damage === 'number' && Number.isFinite(m.damage) && m.damage > 0 && m.damage < 1000) onPlayerShot?.(m.dir, m.damage);
      if (m.type === 'missile-blast' && started && vector(m.at)) onMissileBlast?.(m.at);
      if (m.type === 'missile-hurt' && started && vector(m.at) && typeof m.damage === 'number' && Number.isFinite(m.damage) && m.damage > 0 && m.damage < 1000) onMissileHurt?.(m.at, m.damage);
      if (m.type === 'boss-slam' && started && m.slam && [m.slam.x, m.slam.z, m.slam.radius, m.slam.power, m.slam.quake, m.slam.range, m.slam.speed].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000)
        && m.slam.radius >= 0 && m.slam.power >= 0 && m.slam.quake >= 0 && m.slam.range >= 0 && m.slam.speed > 0) onBossSlam?.(m.slam);
      if (m.type === 'boss-impact' && started && m.impact && [m.impact.damage, m.impact.dx, m.impact.dz, m.impact.push, m.impact.shake].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1000)
        && [m.impact.vx, m.impact.vy, m.impact.vz, m.impact.minVy].every((n) => n === undefined || (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1000))
        && m.impact.damage > 0 && m.impact.push >= 0 && m.impact.shake >= 0) onBossImpact?.(m.impact);
      if (m.type === 'boss-parry' && started && Number.isSafeInteger(m.id) && typeof m.id === 'number' && m.id > 0 && vector(m.at) && typeof m.playerId === 'string') onBossParry?.(m.id, m.at, m.playerId === ownId);
      if (m.type === 'missile-parry' && started && vector(m.at) && typeof m.playerId === 'string') onMissileParry?.(m.at, m.playerId === ownId);
    }
  });
  conn.on('close', () => {
    clearTimeout(timeout);
    if (remotes.get(conn.peer) !== remote) return;
    remotes.delete(conn.peer); removeAvatar(conn.peer);
    if (role === 'host') { updateLobby(); status.textContent = '参加者が退出しました。'; if (started) onDisconnect?.(false); }
    else if (role === 'guest') {
      hostBossSnapshot = null; hostMissiles = []; hostAdds = []; display([]);
      if (started) onDisconnect?.(true);
      else { leaveMultiplayer(); status.textContent = '接続が切れました。もう一度参加してください。'; }
    }
  });
  conn.on('error', () => { status.textContent = '接続できませんでした。部屋コードと通信環境を確認してください。'; conn.close(); });
}
function newRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % alphabet.length]).join('');
}
function setupPeer(client: PeerClient) {
  client.on('error', (error: { type?: string }) => {
    if (peer !== client) return;
    status.textContent = error.type === 'peer-unavailable' ? '部屋が見つかりません。コードを確認してください。' : '通信できませんでした。接続を確認してやり直してください。';
    if (!started && role === 'guest') { client.destroy(); peer = null; remotes.clear(); form.hidden = false; room.hidden = true; }
  });
}
export function initMultiplayer(onStart: () => void, onBreak: (event: BossBreak) => void, onHit: (hit: KunaiBossHit, player: Pose) => void,
  onShot: (shot: BossShot) => void, onHurt: (dir: [number, number, number], damage: number) => void,
  onBlast: (at: [number, number, number]) => void, onBlastHurt: (at: [number, number, number], damage: number) => void,
  onSlam: (slam: BossSlam) => void, onImpact: (impact: BossImpact) => void, onVictory: (score: number, time: number) => void, onDefeat: () => void,
  onParry: (id: number, at: [number, number, number], mine: boolean) => void,
  onMissileReflect: (at: [number, number, number], mine: boolean) => void, onShotDown: (id: number, player: Pose) => void,
  onEnemyHit: (hit: AddHit, player: Pose) => void, onEnemyKill: () => void, onLost: (hostLost: boolean) => void,
  onConfirmed: (confirmation: HitConfirmation) => void) {
  startGuest = onStart; onBossBreak = onBreak; onKunaiBossHit = onHit;
  onBossShot = onShot; onPlayerShot = onHurt;
  onMissileBlast = onBlast; onMissileHurt = onBlastHurt;
  onBossSlam = onSlam; onBossImpact = onImpact;
  onBossVictory = onVictory;
  onPartyDefeat = onDefeat;
  onBossParry = onParry;
  onMissileParry = onMissileReflect; onMissileShotDown = onShotDown;
  onAddHit = onEnemyHit; onAddKill = onEnemyKill;
  onDisconnect = onLost;
  onHitConfirmation = onConfirmed;
}
function finishMatch() {
  matchFinished = true;
  for (const remote of remotes.values()) remote.ready = false;
}
export function broadcastBossVictory(score: number, time: number) { if (role === 'host' && started) { finishMatch(); broadcast({ type: 'boss-victory', score, time }); } }
export function multiplayerPartyDown(): boolean {
  return role === 'host' && started && game.playerHp <= 0 && [...remotes.values()].every((r) => !r.conn.open || (!!r.pose && !r.pose.alive && performance.now() - r.poseTime < 500));
}
export function broadcastPartyDefeat() { if (role === 'host' && started) { finishMatch(); broadcast({ type: 'party-defeat' }); } }
export function broadcastBossShot(shot: BossShot) { if (role === 'host' && started) broadcast({ type: 'boss-shot', shot }); }
export function remotePlayers(): ReadonlyArray<Pose> {
  return role === 'host' && started ? [...remotes.values()].filter((r) => r.conn.open && r.pose?.alive && performance.now() - r.poseTime < 500).map((r) => r.pose!) : [];
}
export function sendRemotePlayerShot(id: string, dir: [number, number, number], damage: number) {
  if (role === 'host' && started) { const remote = remotes.get(id); if (remote) send(remote.conn, { type: 'player-shot', dir, damage }); }
}
export function broadcastMissileBlast(at: [number, number, number]) { if (role === 'host' && started) broadcast({ type: 'missile-blast', at }); }
export function sendRemoteMissileHurt(id: string, at: [number, number, number], damage: number) {
  if (role === 'host' && started) { const remote = remotes.get(id); if (remote) send(remote.conn, { type: 'missile-hurt', at, damage }); }
}
export function broadcastBossSlam(slam: BossSlam) { if (role === 'host' && started) broadcast({ type: 'boss-slam', slam }); }
export function broadcastBossParry(id: number, playerId: string, at: [number, number, number]) {
  if (role === 'host' && started) broadcast({ type: 'boss-parry', id, playerId, at });
}
export function broadcastMissileParry(playerId: string, at: [number, number, number]) {
  if (role === 'host' && started) broadcast({ type: 'missile-parry', playerId, at });
}
export function requestMissileShotDown(id: number) {
  if (role !== 'guest' || !started) return;
  const host = [...remotes.values()][0]; if (host) send(host.conn, { type: 'missile-shotdown', id });
}
export function sendRemoteBossImpact(id: string, impact: BossImpact) {
  if (role === 'host' && started) { const remote = remotes.get(id); if (remote) send(remote.conn, { type: 'boss-impact', impact }); }
}
function sendHit(type: 'kunai-boss-hit' | 'add-hit', hit: KunaiBossHit): number | null {
  if (role !== 'guest' || !started) return null;
  const host = [...remotes.values()][0]; if (!host?.conn.open) return null;
  const id = nextHitRequest++;
  send(host.conn, { type, hit: { ...hit, requestId: id } });
  return id;
}
export function sendKunaiBossHit(hit: KunaiBossHit): number | null { return sendHit('kunai-boss-hit', hit); }
export function sendAddHit(hit: AddHit): number | null { return sendHit('add-hit', hit); }
export function confirmRemoteHit(id: string, confirmation: HitConfirmation) {
  if (role === 'host' && started) { const remote = remotes.get(id); if (remote) send(remote.conn, { type: 'hit-confirm', confirmation }); }
}
export function sendAddKill(id: string) {
  if (role === 'host' && started) { const remote = remotes.get(id); if (remote) send(remote.conn, { type: 'add-kill' }); }
}
export function broadcastBossBreak(event: BossBreak): boolean {
  if (role !== 'host' || !started) return false;
  broadcast({ type: 'boss-break', ...event });
  return true;
}
export function startMultiplayer(): boolean {
  if (role !== 'host' || startButton.disabled || started) return false;
  partySize = 1 + [...remotes.values()].filter((r) => r.conn.open).length;
  matchFinished = false; started = true; broadcast({ type: 'start', difficulty: game.difficulty, partySize }); peer?.disconnect();
  return true;
}
export function returnToMultiplayerLobby(): boolean {
  if (!role || !matchFinished || (role === 'guest' && ![...remotes.values()].some((r) => r.conn.open))) return false;
  started = false; partySize = 1; ready = false;
  hostBossSnapshot = null; hostMissiles = []; hostAdds = [];
  for (const id of avatars.keys()) removeAvatar(id);
  readyButton.textContent = '準備 OK';
  if (role === 'host') {
    matchFinished = false;
    peer?.reconnect?.();
    updateLobby();
    status.textContent = '参加者の準備を待っています。';
  } else {
    matchFinished = false;
    const host = [...remotes.values()][0];
    if (host) send(host.conn, { type: 'ready', ready: false });
    status.textContent = '準備ができたら「準備 OK」を押してください。';
  }
  return true;
}
export function leaveMultiplayer() {
  generation++; busy = false;
  const old = peer; peer = null; remotes.clear(); old?.destroy();
  for (const id of avatars.keys()) removeAvatar(id);
  role = null; ready = false; started = false; matchFinished = false; partySize = 1; roomCode = ''; ownId = 'host';
  hostBossSnapshot = null;
  hostMissiles = [];
  hostAdds = [];
  delete panel.dataset.role;
  choose.hidden = false; flow.hidden = true; room.hidden = true; form.hidden = true;
  startButton.hidden = true; startButton.disabled = true; readyButton.hidden = true; readyButton.textContent = '準備 OK';
  codeInput.value = ''; roomInput.value = ''; members.replaceChildren(); status.textContent = '接続待ち';
}
panel.addEventListener('keydown', (e) => e.stopPropagation());
panel.addEventListener('keyup', (e) => e.stopPropagation());
panel.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const mode = target.closest<HTMLButtonElement>('[data-mode]')?.dataset.mode;
  const action = target.closest<HTMLButtonElement>('[data-connect]')?.dataset.connect;
  if (!mode && !action) return;
  if (busy) return;
  const currentGeneration = generation;
  if (mode === 'host' || action === 'join') busy = true;
  try {
    if (mode === 'host') {
      panel.dataset.role = 'host';
      choose.hidden = true; flow.hidden = false;
      panel.querySelector<HTMLElement>('[data-flow-title]')!.textContent = 'HOST / 部屋を作成中';
      status.textContent = '接続中…';
      const Peer = await loadPeer(); if (generation !== currentGeneration) return;
      roomCode = newRoomCode(); role = 'host'; ownId = 'host';
      const client = new Peer(`fastfinish-${roomCode}`); peer = client; setupPeer(client);
      client.on('open', () => {
        if (peer !== client) return;
        panel.querySelector<HTMLElement>('[data-flow-title]')!.textContent = 'HOST / 部屋';
        panel.querySelector<HTMLElement>('[data-room-help]')!.textContent = '部屋コードを友達に送ってください。';
        roomInput.value = roomCode; room.hidden = false; startButton.hidden = false; updateLobby();
        status.textContent = '部屋コードを友達に送ってください。全員が準備できると開始できます。';
      });
      client.on('connection', (conn: Connection) => attach(conn));
    } else if (mode === 'guest') {
      panel.dataset.role = 'guest';
      choose.hidden = true; flow.hidden = false; form.hidden = false; role = 'guest';
      panel.querySelector<HTMLElement>('[data-flow-title]')!.textContent = 'JOIN / 部屋に参加';
      status.textContent = '部屋コードを入力してください。'; codeInput.focus();
    } else if (action === 'join') {
      const code = codeInput.value.trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error('８文字の部屋コードを入力してください。');
      if (peer) return;
      status.textContent = '部屋に接続中…';
      const Peer = await loadPeer(); if (generation !== currentGeneration || role !== 'guest') return;
      roomCode = code; const client = new Peer(); peer = client; setupPeer(client);
      client.on('open', (id: string) => {
        if (peer !== client) return;
        ownId = id; roomInput.value = code; attach(client.connect(`fastfinish-${code}`, { reliable: true }));
      });
    } else if (action === 'ready') {
      const host = [...remotes.values()][0]; if (!host?.conn.open) return;
      ready = !ready; readyButton.textContent = ready ? '準備を取り消す' : '準備 OK';
      send(host.conn, { type: 'ready', ready });
      status.textContent = ready ? '準備 OK。ホストの開始を待っています。' : '準備ができたら「準備 OK」を押してください。';
    } else if (action === 'copy') {
      roomInput.select();
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(roomCode); status.textContent = '部屋コードをコピーしました。'; }
      else status.textContent = '選択した部屋コードをコピーしてください。';
    }
  } catch (error) { if (generation === currentGeneration) status.textContent = error instanceof Error ? error.message : '接続できませんでした。'; }
  finally { if (generation === currentGeneration) busy = false; }
});
export function updateMultiplayer(dt: number) {
  elapsed += dt;
  detailElapsed += dt;
  if (started && elapsed >= 0.05) {
    elapsed = 0;
    if (role === 'host') {
      const poses = [localPose(), ...[...remotes.values()].filter((r) => r.conn.open && r.pose).map((r) => r.pose!)];
      display(poses);
      const snapshot = captureBossSnapshot();
      const boss = snapshot && (({ warnings, pillars, throwable, ...pose }) => pose)(snapshot);
      const details = detailElapsed >= 0.15;
      if (details) detailElapsed = 0;
      const state = details ? { type: 'poses', poses, boss: snapshot && { warnings: snapshot.warnings, pillars: snapshot.pillars, throwable: snapshot.throwable }, missiles: captureMissileSnapshots(), adds: captureAdds() } : null;
      for (const remote of remotes.values()) {
        sendSnapshot(remote.conn, { type: 'boss-pose', boss });
        if (state) sendSnapshot(remote.conn, state);
      }
    } else if (role === 'guest') { const host = [...remotes.values()][0]; if (host) sendSnapshot(host.conn, { type: 'pose', pose: localPose() }); }
  }
  for (const a of avatars.values()) {
    a.root.position.lerp(a.target, 1 - Math.exp(-12 * dt));
    const delta = Math.atan2(Math.sin(a.yaw - a.root.rotation.y), Math.cos(a.yaw - a.root.rotation.y));
    a.root.rotation.y += delta * (1 - Math.exp(-12 * dt));
  }
}

import * as THREE from 'three';
import { camera, controls, scene } from '../core.js';
import { position, lookEuler, player, velocity } from '../player/state.js';
import { game } from '../game/state.js';
import { parryActive } from '../combat/parry.js';
import { spearNetworkState } from '../weapons/spearCombat.js';
import { sickleState } from '../weapons/sickleCombat.js';
import { enemies } from '../enemy/state.js';
import { captureBossSnapshot, isBossSnapshot } from './bossSnapshot.js';
import { captureMissileSnapshots, isMissileSnapshots } from '../enemy/bossMissiles.js';
import { captureAdds, isAddSnapshots } from './enemySnapshot.js';
import { selectedLoadout } from '../ui/weaponPicker.js';
import { WEAPON_IDS } from '../weapons/ids.js';
const remotes = new Map();
const avatars = new Map();
let peer = null;
let role = null;
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
let startGuest = null;
let onBossBreak = null;
let onKunaiBossHit = null;
let onBossShot = null;
let onPlayerShot = null;
let onMissileBlast = null;
let onMissileHurt = null;
let onBossSlam = null;
let onBossImpact = null;
let onBossVictory = null;
let onPartyDefeat = null;
let onBossParry = null;
let onMissileParry = null;
let onMissileShotDown = null;
let onAddHit = null;
let onAddKill = null;
let onDisconnect = null;
let onHitConfirmation = null;
let nextHitRequest = 1;
let hostMissiles = [];
let hostAdds = [];
export function latestMissiles() { return hostMissiles; }
export function latestAdds() { return hostAdds; }
let hostBossSnapshot = null;
export function latestBossSnapshot() { return hostBossSnapshot; }
export function isMultiplayerGuest() { return started && role === 'guest'; }
const panel = document.querySelector('#overlay .multiplayer');
const choose = panel.querySelector('[data-choose]');
const flow = panel.querySelector('[data-flow]');
const room = panel.querySelector('[data-room]');
const form = panel.querySelector('[data-join-form]');
const codeInput = panel.querySelector('[data-code-input]');
const roomInput = panel.querySelector('[data-room-code]');
const members = panel.querySelector('[data-members]');
const readyButton = panel.querySelector('[data-connect="ready"]');
const startButton = panel.querySelector('[data-action="multiplayer-start"]');
const status = panel.querySelector('[data-status]');
function loadPeer() {
    const existing = window.Peer;
    if (existing)
        return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
        script.onload = () => {
            const ctor = window.Peer;
            if (ctor)
                resolve(ctor);
            else
                reject(new Error('通信ライブラリを読み込めませんでした'));
        };
        script.onerror = () => reject(new Error('通信ライブラリを読み込めませんでした'));
        document.head.appendChild(script);
    });
}
function send(conn, value) { if (conn.open)
    conn.send(value); }
function broadcast(value) { for (const r of remotes.values())
    send(r.conn, value); }
// 位置の古い更新を通信待ちに積み続けず、回復したら最新の状態を送る。
// 命中や勝敗などのイベントは通常の send で必ず送る。
function sendSnapshot(conn, value) {
    if (!conn.open || (conn.bufferSize ?? 0) > 0 || (conn.dataChannel?.bufferedAmount ?? 0) > 32768)
        return;
    conn.send(value);
}
function renderMembers(list) {
    members.replaceChildren();
    for (let i = 0; i < 4; i++) {
        const member = list[i];
        const li = document.createElement('li');
        li.className = member ? 'mp-player' : 'mp-player empty';
        const info = document.createElement('div');
        info.className = 'mp-player-info';
        const number = document.createElement('span');
        number.className = 'mp-player-number';
        number.textContent = `0${i + 1}`;
        const name = document.createElement('strong');
        name.className = 'mp-player-name';
        name.textContent = member ? (i === 0 ? 'HOST' : `PLAYER ${i + 1}`) : 'WAITING';
        const state = document.createElement('small');
        state.className = 'mp-player-state';
        state.textContent = member ? `${i === 0 ? 'ホスト' : member.ready ? '準備 OK' : '準備中'}${member.id === ownId ? ' / あなた' : ''}` : '参加者を待っています';
        info.append(number, name, state);
        const weapon = document.createElement('div');
        weapon.className = 'mp-player-weapon';
        if (member?.weapon) {
            const source = document.querySelector(`#weapon .icon svg[data-w="${member.weapon}"]`);
            if (source) {
                const icon = source.cloneNode(true);
                icon.removeAttribute('class');
                weapon.append(icon);
            }
            weapon.setAttribute('aria-label', `武器: ${member.weapon}`);
        }
        else {
            weapon.textContent = '—';
            weapon.setAttribute('aria-label', '武器未表示');
        }
        li.append(info, weapon);
        members.appendChild(li);
    }
}
function updateLobby() {
    if (role !== 'host')
        return;
    const list = [{ id: 'host', ready: true, weapon: selectedLoadout() }, ...[...remotes.values()].filter((r) => r.conn.open).map((r) => ({ id: r.conn.peer, ready: r.ready, weapon: r.weapon }))];
    renderMembers(list);
    startButton.disabled = started || list.length < 2 || list.some((m) => !m.ready);
    broadcast({ type: 'lobby', members: list });
}
function validPose(v) {
    if (!v || typeof v !== 'object')
        return false;
    const p = v;
    const ref = (r) => Array.isArray(r) && r.length === 2 && r.every((n) => Number.isSafeInteger(n) && n >= 0 && n < 1e9);
    const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000);
    return typeof p.id === 'string' && typeof p.onGround === 'boolean' && typeof p.alive === 'boolean' && typeof p.parry === 'boolean' && typeof p.bat === 'boolean' && typeof p.eyeHeight === 'number' && Number.isFinite(p.eyeHeight)
        && !!p.spear && ['none', 'windup', 'flying', 'stuck', 'returning'].includes(p.spear.phase) && vec(p.spear.tip) && vec(p.spear.dir)
        && (p.spear.phase === 'none' || p.spear.phase === 'windup' || (Math.hypot(...p.spear.dir) >= 0.9 && Math.hypot(...p.spear.dir) <= 1.1))
        && Array.isArray(p.spear.held) && p.spear.held.length <= 32 && p.spear.held.every(ref) && (p.grapple === null || ref(p.grapple))
        && p.eyeHeight >= 0 && p.eyeHeight <= 3 && [p.x, p.y, p.z, p.yaw, p.vx, p.vy, p.vz, p.lookX, p.lookY, p.lookZ].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000);
}
const poseLook = new THREE.Vector3();
function localPose() {
    camera.getWorldDirection(poseLook);
    const spear = spearNetworkState();
    const ref = (e) => {
        const i = enemies.indexOf(e), s = latestAdds()[i];
        return i >= 0 && s?.alive && s.id > 0 ? [i, s.id] : null;
    };
    const grapple = sickleState.grapple;
    return { id: ownId, x: position.x, y: position.y, z: position.z, yaw: lookEuler.y, onGround: player.onGround, eyeHeight: player.eyeHeight,
        alive: game.playerHp > 0, vx: velocity.x, vy: velocity.y, vz: velocity.z, lookX: poseLook.x, lookY: poseLook.y, lookZ: poseLook.z,
        parry: controls.isLocked && parryActive(), bat: game.shownWeapon === 'bat',
        spear: { phase: spear.phase, tip: [spear.tip.x, spear.tip.y, spear.tip.z], dir: [spear.dir.x, spear.dir.y, spear.dir.z], held: spear.held.map(ref).filter((r) => r !== null) },
        grapple: grapple?.enemy && grapple.aimed && grapple.phase !== 'back' ? ref(grapple.enemy) : null };
}
function removeAvatar(id) {
    const a = avatars.get(id);
    if (!a)
        return;
    scene.remove(a.root);
    a.root.traverse((obj) => { if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        obj.material.dispose();
    } });
    avatars.delete(id);
}
function display(poses) {
    const present = new Set();
    for (const p of poses) {
        if (p.id === ownId)
            continue;
        present.add(p.id);
        let a = avatars.get(p.id);
        if (!a) {
            const root = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), new THREE.MeshBasicMaterial({ color: 0x236dba }));
            body.position.y = 1;
            const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            nose.position.set(0, 1.55, -0.28);
            root.add(body, nose);
            root.position.set(p.x, p.y, p.z);
            scene.add(root);
            a = { root, target: new THREE.Vector3(), yaw: p.yaw };
            avatars.set(p.id, a);
        }
        a.target.set(p.x, p.y, p.z);
        a.yaw = p.yaw;
    }
    for (const id of avatars.keys())
        if (!present.has(id))
            removeAvatar(id);
}
function attach(conn) {
    if (role === 'host' && (started || remotes.size >= 3 || remotes.has(conn.peer))) {
        conn.close();
        return;
    }
    const remote = { conn, ready: false, weapon: null, pose: null, poseTime: 0, hitTokens: 8, hitTokenTime: performance.now() };
    remotes.set(conn.peer, remote);
    const timeout = window.setTimeout(() => {
        if (!conn.open && remotes.get(conn.peer) === remote) {
            conn.close();
            remotes.delete(conn.peer);
            if (role === 'guest') {
                const client = peer;
                peer = null;
                client?.destroy();
                form.hidden = false;
                room.hidden = true;
                status.textContent = '接続がタイムアウトしました。部屋や通信環境を確認してください。';
            }
            else
                updateLobby();
        }
    }, 20000);
    conn.on('open', () => {
        clearTimeout(timeout);
        if (role === 'host')
            updateLobby();
        else {
            send(conn, { type: 'profile', weapon: selectedLoadout() });
            peer?.disconnect(); // 参加者は接続できたら仲介サーバーを離れる
            form.hidden = true;
            room.hidden = false;
            readyButton.hidden = false;
            panel.querySelector('[data-room-help]').textContent = 'ホストの開始を待っています。';
            status.textContent = '参加しました。準備ができたら「準備 OK」を押してください。';
        }
    });
    conn.on('data', (value) => {
        if (!value || typeof value !== 'object')
            return;
        const m = value;
        if (role === 'host') {
            if (m.type === 'profile' && !started && typeof m.weapon === 'string' && WEAPON_IDS.includes(m.weapon)) {
                remote.weapon = m.weapon;
                updateLobby();
            }
            if (m.type === 'ready' && typeof m.ready === 'boolean' && (!started || matchFinished)) {
                remote.ready = m.ready;
                updateLobby();
            }
            if (m.type === 'pose' && validPose(m.pose)) {
                remote.pose = { ...m.pose, id: conn.peer };
                remote.poseTime = performance.now();
            }
            if (m.type === 'missile-shotdown' && started && remote.pose?.alive && performance.now() - remote.poseTime < 500 && typeof m.id === 'number' && Number.isSafeInteger(m.id) && m.id > 0) {
                const now = performance.now();
                remote.hitTokens = Math.min(8, remote.hitTokens + Math.max(0, now - remote.hitTokenTime) * 0.012);
                remote.hitTokenTime = now;
                if (remote.hitTokens >= 1) {
                    remote.hitTokens--;
                    onMissileShotDown?.(m.id, remote.pose);
                }
            }
            if ((m.type === 'kunai-boss-hit' || m.type === 'add-hit') && started && remote.pose?.alive && performance.now() - remote.poseTime < 500 && m.hit && typeof m.hit === 'object') {
                const hit = m.hit;
                const now = performance.now();
                // ３本投げは 35ms 間隔。通信のまとめ送りも許しつつ、異常な連続送信は抑える。
                remote.hitTokens = Math.min(8, remote.hitTokens + Math.max(0, now - remote.hitTokenTime) * 0.012);
                remote.hitTokenTime = now;
                if (typeof hit.attack === 'string' && hit.attack.length <= 20 && typeof hit.part === 'string' && hit.part.length <= 8
                    && Number.isSafeInteger(hit.requestId) && hit.requestId > 0
                    && Array.isArray(hit.at) && hit.at.length === 3 && hit.at.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000)
                    && (hit.scale === undefined || (typeof hit.scale === 'number' && Number.isFinite(hit.scale) && hit.scale >= 0 && hit.scale <= 4))
                    && (hit.force === undefined || (typeof hit.force === 'number' && Number.isFinite(hit.force) && hit.force >= 0 && hit.force <= 600))
                    && remote.hitTokens >= 1 && (m.type !== 'add-hit' || (Number.isSafeInteger(hit.index) && hit.index >= 0 && hit.index < 32 && Number.isSafeInteger(hit.spawnId) && hit.spawnId > 0))) {
                    remote.hitTokens--;
                    if (m.type === 'add-hit')
                        onAddHit?.(hit, remote.pose);
                    else
                        onKunaiBossHit?.(hit, remote.pose);
                }
            }
        }
        else if (role === 'guest') {
            if (m.type === 'lobby' && Array.isArray(m.members) && m.members.length <= 4 && m.members.every((x) => x && typeof x.id === 'string' && typeof x.ready === 'boolean' && (x.weapon === null || WEAPON_IDS.includes(x.weapon))))
                renderMembers(m.members);
            if (m.type === 'poses' && Array.isArray(m.poses) && m.poses.length <= 4 && m.poses.every(validPose)) {
                display(m.poses);
                if (hostBossSnapshot && m.boss && typeof m.boss === 'object') {
                    const details = m.boss;
                    hostBossSnapshot = { ...hostBossSnapshot, warnings: details.warnings, pillars: details.pillars, throwable: details.throwable };
                }
                if (isMissileSnapshots(m.missiles))
                    hostMissiles = m.missiles;
                if (isAddSnapshots(m.adds))
                    hostAdds = m.adds;
            }
            if (m.type === 'start' && !started && ready && (m.difficulty === 'easy' || m.difficulty === 'normal' || m.difficulty === 'hard')
                && typeof m.partySize === 'number' && Number.isInteger(m.partySize) && m.partySize >= 2 && m.partySize <= 4) {
                game.difficulty = m.difficulty;
                partySize = m.partySize;
                started = true;
                startGuest?.();
            }
            if (m.type === 'boss-pose') {
                if (m.boss === null)
                    hostBossSnapshot = null;
                else if (isBossSnapshot(m.boss))
                    hostBossSnapshot = { ...m.boss, warnings: hostBossSnapshot?.warnings, pillars: hostBossSnapshot?.pillars, throwable: hostBossSnapshot?.throwable };
            }
            if (m.type === 'boss-break' && started && typeof m.part === 'string' && ['armR', 'armL', 'legR', 'legL'].includes(m.part)
                && typeof m.down === 'boolean' && [m.at, m.dir].every((v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000)))
                onBossBreak?.(m);
            if (m.type === 'boss-victory' && started && typeof m.score === 'number' && Number.isFinite(m.score) && m.score >= 0 && m.score <= 1e9
                && typeof m.time === 'number' && Number.isFinite(m.time) && m.time >= 0 && m.time <= 1e7) {
                matchFinished = true;
                onBossVictory?.(m.score, m.time);
            }
            if (m.type === 'party-defeat' && started) {
                matchFinished = true;
                onPartyDefeat?.();
            }
            if (m.type === 'add-kill' && started)
                onAddKill?.();
            if (m.type === 'hit-confirm' && started && m.confirmation && Number.isSafeInteger(m.confirmation.id) && m.confirmation.id > 0
                && typeof m.confirmation.damage === 'number' && Number.isFinite(m.confirmation.damage) && m.confirmation.damage >= 0 && m.confirmation.damage <= 10000
                && ['hit', 'break', 'down', 'kill', 'blocked'].includes(m.confirmation.result))
                onHitConfirmation?.(m.confirmation);
            const vector = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000);
            if (m.type === 'boss-shot' && started && m.shot && vector(m.shot.from) && vector(m.shot.dir)
                && Number.isSafeInteger(m.shot.id) && m.shot.id > 0
                && [m.shot.speed, m.shot.damage, m.shot.length, m.shot.width].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1000)
                && typeof m.shot.sound === 'boolean' && (m.shot.part === 'armR' || m.shot.part === 'armL' || m.shot.part === 'gunner'))
                onBossShot?.(m.shot);
            if (m.type === 'player-shot' && started && vector(m.dir) && typeof m.damage === 'number' && Number.isFinite(m.damage) && m.damage > 0 && m.damage < 1000)
                onPlayerShot?.(m.dir, m.damage);
            if (m.type === 'missile-blast' && started && vector(m.at))
                onMissileBlast?.(m.at);
            if (m.type === 'missile-hurt' && started && vector(m.at) && typeof m.damage === 'number' && Number.isFinite(m.damage) && m.damage > 0 && m.damage < 1000)
                onMissileHurt?.(m.at, m.damage);
            if (m.type === 'boss-slam' && started && m.slam && [m.slam.x, m.slam.z, m.slam.radius, m.slam.power, m.slam.quake, m.slam.range, m.slam.speed].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000)
                && m.slam.radius >= 0 && m.slam.power >= 0 && m.slam.quake >= 0 && m.slam.range >= 0 && m.slam.speed > 0)
                onBossSlam?.(m.slam);
            if (m.type === 'boss-impact' && started && m.impact && [m.impact.damage, m.impact.dx, m.impact.dz, m.impact.push, m.impact.shake].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1000)
                && [m.impact.vx, m.impact.vy, m.impact.vz, m.impact.minVy].every((n) => n === undefined || (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1000))
                && m.impact.damage > 0 && m.impact.push >= 0 && m.impact.shake >= 0)
                onBossImpact?.(m.impact);
            if (m.type === 'boss-parry' && started && Number.isSafeInteger(m.id) && typeof m.id === 'number' && m.id > 0 && vector(m.at) && typeof m.playerId === 'string')
                onBossParry?.(m.id, m.at, m.playerId === ownId);
            if (m.type === 'missile-parry' && started && vector(m.at) && typeof m.playerId === 'string')
                onMissileParry?.(m.at, m.playerId === ownId);
        }
    });
    conn.on('close', () => {
        clearTimeout(timeout);
        if (remotes.get(conn.peer) !== remote)
            return;
        remotes.delete(conn.peer);
        removeAvatar(conn.peer);
        if (role === 'host') {
            updateLobby();
            status.textContent = '参加者が退出しました。';
            if (started)
                onDisconnect?.(false);
        }
        else if (role === 'guest') {
            hostBossSnapshot = null;
            hostMissiles = [];
            hostAdds = [];
            display([]);
            if (started)
                onDisconnect?.(true);
            else {
                leaveMultiplayer();
                status.textContent = '接続が切れました。もう一度参加してください。';
            }
        }
    });
    conn.on('error', () => { status.textContent = '接続できませんでした。部屋コードと通信環境を確認してください。'; conn.close(); });
}
function newRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % alphabet.length]).join('');
}
function setupPeer(client) {
    client.on('error', (error) => {
        if (peer !== client)
            return;
        status.textContent = error.type === 'peer-unavailable' ? '部屋が見つかりません。コードを確認してください。' : '通信できませんでした。接続を確認してやり直してください。';
        if (!started && role === 'guest') {
            client.destroy();
            peer = null;
            remotes.clear();
            form.hidden = false;
            room.hidden = true;
        }
    });
}
export function initMultiplayer(onStart, onBreak, onHit, onShot, onHurt, onBlast, onBlastHurt, onSlam, onImpact, onVictory, onDefeat, onParry, onMissileReflect, onShotDown, onEnemyHit, onEnemyKill, onLost, onConfirmed) {
    startGuest = onStart;
    onBossBreak = onBreak;
    onKunaiBossHit = onHit;
    onBossShot = onShot;
    onPlayerShot = onHurt;
    onMissileBlast = onBlast;
    onMissileHurt = onBlastHurt;
    onBossSlam = onSlam;
    onBossImpact = onImpact;
    onBossVictory = onVictory;
    onPartyDefeat = onDefeat;
    onBossParry = onParry;
    onMissileParry = onMissileReflect;
    onMissileShotDown = onShotDown;
    onAddHit = onEnemyHit;
    onAddKill = onEnemyKill;
    onDisconnect = onLost;
    onHitConfirmation = onConfirmed;
}
function finishMatch() {
    matchFinished = true;
    for (const remote of remotes.values())
        remote.ready = false;
}
export function broadcastBossVictory(score, time) { if (role === 'host' && started) {
    finishMatch();
    broadcast({ type: 'boss-victory', score, time });
} }
export function multiplayerPartyDown() {
    return role === 'host' && started && game.playerHp <= 0 && [...remotes.values()].every((r) => !r.conn.open || (!!r.pose && !r.pose.alive && performance.now() - r.poseTime < 500));
}
export function broadcastPartyDefeat() { if (role === 'host' && started) {
    finishMatch();
    broadcast({ type: 'party-defeat' });
} }
export function broadcastBossShot(shot) { if (role === 'host' && started)
    broadcast({ type: 'boss-shot', shot }); }
export function remotePlayers() {
    return role === 'host' && started ? [...remotes.values()].filter((r) => r.conn.open && r.pose?.alive && performance.now() - r.poseTime < 500).map((r) => r.pose) : [];
}
export function sendRemotePlayerShot(id, dir, damage) {
    if (role === 'host' && started) {
        const remote = remotes.get(id);
        if (remote)
            send(remote.conn, { type: 'player-shot', dir, damage });
    }
}
export function broadcastMissileBlast(at) { if (role === 'host' && started)
    broadcast({ type: 'missile-blast', at }); }
export function sendRemoteMissileHurt(id, at, damage) {
    if (role === 'host' && started) {
        const remote = remotes.get(id);
        if (remote)
            send(remote.conn, { type: 'missile-hurt', at, damage });
    }
}
export function broadcastBossSlam(slam) { if (role === 'host' && started)
    broadcast({ type: 'boss-slam', slam }); }
export function broadcastBossParry(id, playerId, at) {
    if (role === 'host' && started)
        broadcast({ type: 'boss-parry', id, playerId, at });
}
export function broadcastMissileParry(playerId, at) {
    if (role === 'host' && started)
        broadcast({ type: 'missile-parry', playerId, at });
}
export function requestMissileShotDown(id) {
    if (role !== 'guest' || !started)
        return;
    const host = [...remotes.values()][0];
    if (host)
        send(host.conn, { type: 'missile-shotdown', id });
}
export function sendRemoteBossImpact(id, impact) {
    if (role === 'host' && started) {
        const remote = remotes.get(id);
        if (remote)
            send(remote.conn, { type: 'boss-impact', impact });
    }
}
function sendHit(type, hit) {
    if (role !== 'guest' || !started)
        return null;
    const host = [...remotes.values()][0];
    if (!host?.conn.open)
        return null;
    const id = nextHitRequest++;
    send(host.conn, { type, hit: { ...hit, requestId: id } });
    return id;
}
export function sendKunaiBossHit(hit) { return sendHit('kunai-boss-hit', hit); }
export function sendAddHit(hit) { return sendHit('add-hit', hit); }
export function confirmRemoteHit(id, confirmation) {
    if (role === 'host' && started) {
        const remote = remotes.get(id);
        if (remote)
            send(remote.conn, { type: 'hit-confirm', confirmation });
    }
}
export function sendAddKill(id) {
    if (role === 'host' && started) {
        const remote = remotes.get(id);
        if (remote)
            send(remote.conn, { type: 'add-kill' });
    }
}
export function broadcastBossBreak(event) {
    if (role !== 'host' || !started)
        return false;
    broadcast({ type: 'boss-break', ...event });
    return true;
}
export function startMultiplayer() {
    if (role !== 'host' || startButton.disabled || started)
        return false;
    partySize = 1 + [...remotes.values()].filter((r) => r.conn.open).length;
    matchFinished = false;
    started = true;
    broadcast({ type: 'start', difficulty: game.difficulty, partySize });
    peer?.disconnect();
    return true;
}
export function returnToMultiplayerLobby() {
    if (!role || !matchFinished || (role === 'guest' && ![...remotes.values()].some((r) => r.conn.open)))
        return false;
    started = false;
    partySize = 1;
    ready = false;
    hostBossSnapshot = null;
    hostMissiles = [];
    hostAdds = [];
    for (const id of avatars.keys())
        removeAvatar(id);
    readyButton.textContent = '準備 OK';
    if (role === 'host') {
        matchFinished = false;
        peer?.reconnect?.();
        updateLobby();
        status.textContent = '参加者の準備を待っています。';
    }
    else {
        matchFinished = false;
        const host = [...remotes.values()][0];
        if (host)
            send(host.conn, { type: 'ready', ready: false });
        status.textContent = '準備ができたら「準備 OK」を押してください。';
    }
    return true;
}
export function leaveMultiplayer() {
    generation++;
    busy = false;
    const old = peer;
    peer = null;
    remotes.clear();
    old?.destroy();
    for (const id of avatars.keys())
        removeAvatar(id);
    role = null;
    ready = false;
    started = false;
    matchFinished = false;
    partySize = 1;
    roomCode = '';
    ownId = 'host';
    hostBossSnapshot = null;
    hostMissiles = [];
    hostAdds = [];
    delete panel.dataset.role;
    choose.hidden = false;
    flow.hidden = true;
    room.hidden = true;
    form.hidden = true;
    startButton.hidden = true;
    startButton.disabled = true;
    readyButton.hidden = true;
    readyButton.textContent = '準備 OK';
    codeInput.value = '';
    roomInput.value = '';
    members.replaceChildren();
    status.textContent = '接続待ち';
}
panel.addEventListener('keydown', (e) => e.stopPropagation());
panel.addEventListener('keyup', (e) => e.stopPropagation());
panel.addEventListener('click', async (event) => {
    const target = event.target;
    const mode = target.closest('[data-mode]')?.dataset.mode;
    const action = target.closest('[data-connect]')?.dataset.connect;
    if (!mode && !action)
        return;
    if (busy)
        return;
    const currentGeneration = generation;
    if (mode === 'host' || action === 'join')
        busy = true;
    try {
        if (mode === 'host') {
            panel.dataset.role = 'host';
            choose.hidden = true;
            flow.hidden = false;
            panel.querySelector('[data-flow-title]').textContent = 'HOST / 部屋を作成中';
            status.textContent = '接続中…';
            const Peer = await loadPeer();
            if (generation !== currentGeneration)
                return;
            roomCode = newRoomCode();
            role = 'host';
            ownId = 'host';
            const client = new Peer(`fastfinish-${roomCode}`);
            peer = client;
            setupPeer(client);
            client.on('open', () => {
                if (peer !== client)
                    return;
                panel.querySelector('[data-flow-title]').textContent = 'HOST / 部屋';
                panel.querySelector('[data-room-help]').textContent = '部屋コードを友達に送ってください。';
                roomInput.value = roomCode;
                room.hidden = false;
                startButton.hidden = false;
                updateLobby();
                status.textContent = '部屋コードを友達に送ってください。全員が準備できると開始できます。';
            });
            client.on('connection', (conn) => attach(conn));
        }
        else if (mode === 'guest') {
            panel.dataset.role = 'guest';
            choose.hidden = true;
            flow.hidden = false;
            form.hidden = false;
            role = 'guest';
            panel.querySelector('[data-flow-title]').textContent = 'JOIN / 部屋に参加';
            status.textContent = '部屋コードを入力してください。';
            codeInput.focus();
        }
        else if (action === 'join') {
            const code = codeInput.value.trim().toUpperCase();
            if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code))
                throw new Error('８文字の部屋コードを入力してください。');
            if (peer)
                return;
            status.textContent = '部屋に接続中…';
            const Peer = await loadPeer();
            if (generation !== currentGeneration || role !== 'guest')
                return;
            roomCode = code;
            const client = new Peer();
            peer = client;
            setupPeer(client);
            client.on('open', (id) => {
                if (peer !== client)
                    return;
                ownId = id;
                roomInput.value = code;
                attach(client.connect(`fastfinish-${code}`, { reliable: true }));
            });
        }
        else if (action === 'ready') {
            const host = [...remotes.values()][0];
            if (!host?.conn.open)
                return;
            ready = !ready;
            readyButton.textContent = ready ? '準備を取り消す' : '準備 OK';
            send(host.conn, { type: 'ready', ready });
            status.textContent = ready ? '準備 OK。ホストの開始を待っています。' : '準備ができたら「準備 OK」を押してください。';
        }
        else if (action === 'copy') {
            roomInput.select();
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(roomCode);
                status.textContent = '部屋コードをコピーしました。';
            }
            else
                status.textContent = '選択した部屋コードをコピーしてください。';
        }
    }
    catch (error) {
        if (generation === currentGeneration)
            status.textContent = error instanceof Error ? error.message : '接続できませんでした。';
    }
    finally {
        if (generation === currentGeneration)
            busy = false;
    }
});
export function updateMultiplayer(dt) {
    elapsed += dt;
    detailElapsed += dt;
    if (started && elapsed >= 0.05) {
        elapsed = 0;
        if (role === 'host') {
            const poses = [localPose(), ...[...remotes.values()].filter((r) => r.conn.open && r.pose).map((r) => r.pose)];
            display(poses);
            const snapshot = captureBossSnapshot();
            const boss = snapshot && (({ warnings, pillars, throwable, ...pose }) => pose)(snapshot);
            const details = detailElapsed >= 0.15;
            if (details)
                detailElapsed = 0;
            const state = details ? { type: 'poses', poses, boss: snapshot && { warnings: snapshot.warnings, pillars: snapshot.pillars, throwable: snapshot.throwable }, missiles: captureMissileSnapshots(), adds: captureAdds() } : null;
            for (const remote of remotes.values()) {
                sendSnapshot(remote.conn, { type: 'boss-pose', boss });
                if (state)
                    sendSnapshot(remote.conn, state);
            }
        }
        else if (role === 'guest') {
            const host = [...remotes.values()][0];
            if (host)
                sendSnapshot(host.conn, { type: 'pose', pose: localPose() });
        }
    }
    for (const a of avatars.values()) {
        a.root.position.lerp(a.target, 1 - Math.exp(-12 * dt));
        const delta = Math.atan2(Math.sin(a.yaw - a.root.rotation.y), Math.cos(a.yaw - a.root.rotation.y));
        a.root.rotation.y += delta * (1 - Math.exp(-12 * dt));
    }
}

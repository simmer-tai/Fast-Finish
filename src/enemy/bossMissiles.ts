import * as THREE from 'three';
import * as sfx from '../audio.js';
import { UP } from '../math.js';
import { camera, scene } from '../core.js';
import { spawnSparks } from '../fx/hitFx.js';
import { castWorld } from '../world/raycast.js';
import { playBounds } from '../world/arena.js';
import { player, position, velocity } from '../player/state.js';
import { game } from '../game/state.js';
import { hooks } from '../game/hooks.js';
import { bullets } from '../weapons/handgunCombat.js';
import { catchArrowNear } from '../weapons/bowCombat.js';
import { type HitDef } from '../weapons/kunaiAttacks.js';
import { PARRY_ANGLE, PARRY_HIT_STOP, closestSegmentPoints, parryActive, parryState, remoteParryEffect } from '../combat/parry.js';
import { aimTarget } from './fire.js';
import { spawnScorch } from '../fx/floorMarks.js';
import { pushChunks } from '../fx/chunks.js';
import { boss, bossOpenPoint, bossTargetAim, raycastBoss } from './boss.js';
import { broadcastMissileBlast, broadcastMissileParry, remotePlayers, requestMissileShotDown, sendRemoteMissileHurt } from '../multiplayer/connectionTest.js';

// ---- ボスのミサイル ----
// 胴体の上から少し打ち上げ → 一定時間、プレイヤーの胸へ曲がりながら追ってくる → 追い終えたらまっすぐ飛ぶ（外れたら床や壁で爆発するか、ステージの外で消える）。
// 当たるか、床や壁にぶつかると爆発し、近くにいれば巻き込まれる。
// 自分の銃弾や矢で撃ち落とせる（その場で爆発する）。振っている間（パリィの間合い）に正面から来たら打ち返せて、
// 打ち返したミサイルはボスの、ダメージの通る部位へ飛んでいく
const MISSILE_SPEED = 12; // 打ち上げたときの速さ (m/s)
const MISSILE_CLIMB = 0.3; // 打ち上げてからこの時間は追わずに昇る
const MISSILE_WANDER = 0.8; // 打ち上げてからこの時間は追わずに、ふらふらと暴れる（昇る間も含む）。その後で追い始める
const MISSILE_HOMING_MIN = 1.1; // 追ってくる時間（ミサイルごとにこの間でばらつかせる）
const MISSILE_HOMING_MAX = 1.5;
const MISSILE_TURN = 2.6; // 追っている間に曲がる速さ (rad/s)
const MISSILE_HOMING_SPEED = 18; // 追っている間の速さの上限
const MISSILE_SPEED_MAX = 28; // 追い終えてからの速さの上限
const MISSILE_ACCEL = 20;
const MISSILE_WOBBLE = 3; // 暴れる間に、ふらふらと向きを乱す強さ (rad/s)
const MISSILE_WOBBLE_FREQ_MIN = 3; // 乱れの揺れの速さ（ミサイルごと・軸ごとにこの間でばらつかせる）
const MISSILE_WOBBLE_FREQ_MAX = 6;
const MISSILE_LIFE = 6;
const MISSILE_OUT = 5; // 動ける範囲からこれだけ外へ出たら消す
const MISSILE_CEILING = 40;
const MISSILE_HIT_RADIUS = 0.8; // プレイヤーの体の芯からこの距離に入ったら爆発する
const MISSILE_BLAST = 2.6; // 爆発に巻き込まれる範囲
const MISSILE_DAMAGE = 14; // 爆発の真ん中で受けるダメージ（縁へ行くほど減る）
const MISSILE_PUSH = 7;
const MISSILE_SHOOT_RADIUS = 0.6; // 銃弾・矢がこの距離を通ったら撃ち落とす
const MISSILE_PARRY_RANGE = 2.2; // 胸からこの距離に入ったミサイルを打ち返せる
const MISSILE_RETURN_SPEED = 40;
const MISSILE_RETURN_TURN = 8; // 打ち返したミサイルは、狙った部位へ鋭く曲がる
// 打ち返したミサイルが当たったときの当たり（銃弾の 2 倍のダメージ）
const MISSILE_RETURN_HIT: HitDef = { kick: [-1.6, 0, 0], knock: 420, hitStop: 0.12, fx: 1.6, dmg: 2 };
const BLAST_LIFE = 0.35;

interface Missile {
  id: number;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  age: number;
  homing: number; // 追ってくる時間
  wobbleFreq: THREE.Vector3; // 向きを乱す揺れの速さ（軸ごと）
  wobblePhase: THREE.Vector3;
  reflected: boolean;
  mesh: THREE.Group;
  flame: THREE.Mesh;
}
const missiles: Missile[] = [];
let nextMissileId = 1;
export type MissileSnapshot = [number, number, number, number, number, number, number, number];
const remoteMissiles = new Map<number, THREE.Group>();
export function captureMissileSnapshots(): MissileSnapshot[] {
  return missiles.map((m) => [m.id, m.pos.x, m.pos.y, m.pos.z, m.dir.x, m.dir.y, m.dir.z, Number(m.reflected)]);
}
export function isMissileSnapshots(value: unknown): value is MissileSnapshot[] {
  return Array.isArray(value) && value.length <= 128 && value.every((m) => Array.isArray(m) && m.length === 8
    && m.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000) && (m[7] === 0 || m[7] === 1));
}
export function updateRemoteMissiles(snapshots: MissileSnapshot[], dt: number) {
  const present = new Set<number>();
  for (const [id, x, y, z, dx, dy, dz, reflected] of snapshots) {
    present.add(id);
    let mesh = remoteMissiles.get(id);
    if (!mesh) {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(bodyGeo, bodyMat), new THREE.Mesh(tipGeo, tipMat));
      const fin = new THREE.Mesh(finGeo, bodyMat), fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2;
      mesh.add(fin, fin2, new THREE.Mesh(flameGeo, flameMat)); mesh.position.set(x, y, z);
      scene.add(mesh); remoteMissiles.set(id, mesh);
    }
    mesh.position.lerp(lookAt.set(x, y, z), 1 - Math.exp(-18 * dt));
    mesh.lookAt(lookAt.set(mesh.position.x + dx, mesh.position.y + dy, mesh.position.z + dz));
    if (!reflected && shotDown(mesh.position, dt)) requestMissileShotDown(id);
  }
  for (const [id, mesh] of remoteMissiles) if (!present.has(id)) { mesh.removeFromParent(); remoteMissiles.delete(id); }
}
interface Blast { mesh: THREE.Mesh; age: number; size: number }
const blasts: Blast[] = [];

const bodyGeo = new THREE.BoxGeometry(0.16, 0.16, 0.7);
const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
const tipGeo = new THREE.ConeGeometry(0.09, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, 0.46);
const tipMat = new THREE.MeshLambertMaterial({ color: 0xc0392b, emissive: 0xc0392b, emissiveIntensity: 0.5 });
const finGeo = new THREE.BoxGeometry(0.36, 0.02, 0.16).translate(0, 0, -0.27);
const flameGeo = new THREE.ConeGeometry(0.08, 1, 8).translate(0, 0.5, 0).rotateX(-Math.PI / 2).translate(0, 0, -0.35); // 後ろへ伸びる
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const blastGeo = new THREE.SphereGeometry(1, 16, 10);
const blastMat = new THREE.MeshBasicMaterial({ color: 0xffd8b0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

// 撃ち出す（from から dir の向きへ）
export function launchMissile(from: THREE.Vector3, dir: THREE.Vector3) {
  const mesh = new THREE.Group();
  mesh.add(new THREE.Mesh(bodyGeo, bodyMat), new THREE.Mesh(tipGeo, tipMat));
  const fin = new THREE.Mesh(finGeo, bodyMat);
  const fin2 = fin.clone();
  fin2.rotation.z = Math.PI / 2;
  const flame = new THREE.Mesh(flameGeo, flameMat);
  mesh.add(fin, fin2, flame);
  mesh.position.copy(from);
  scene.add(mesh);
  const freq = () => THREE.MathUtils.lerp(MISSILE_WOBBLE_FREQ_MIN, MISSILE_WOBBLE_FREQ_MAX, Math.random());
  const phase = () => Math.random() * Math.PI * 2;
  missiles.push({
    id: nextMissileId++, pos: from.clone(), dir: dir.clone().normalize(), speed: MISSILE_SPEED, age: 0,
    homing: THREE.MathUtils.lerp(MISSILE_HOMING_MIN, MISSILE_HOMING_MAX, Math.random()),
    wobbleFreq: new THREE.Vector3(freq(), freq(), freq()), wobblePhase: new THREE.Vector3(phase(), phase(), phase()),
    reflected: false, mesh, flame,
  });
}

export function clearMissiles() {
  for (const m of missiles) m.mesh.removeFromParent();
  missiles.length = 0;
  for (const b of blasts) b.mesh.removeFromParent();
  blasts.length = 0;
  for (const mesh of remoteMissiles.values()) mesh.removeFromParent();
  remoteMissiles.clear();
}

const want = new THREE.Vector3();
const chest = new THREE.Vector3();
const next = new THREE.Vector3();
const seg = new THREE.Line3();
const body = new THREE.Line3();
const onSeg = new THREE.Vector3();
const onBody = new THREE.Vector3();
const look = new THREE.Vector3();
const bulletBack = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const wobble = new THREE.Vector3();
export function updateMissiles(dt: number) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    b.age += dt;
    const u = b.age / BLAST_LIFE;
    if (u >= 1) {
      b.mesh.removeFromParent();
      blasts.splice(i, 1);
      continue;
    }
    b.mesh.scale.setScalar(b.size * (0.4 + 0.6 * Math.sqrt(u)));
    (b.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - u) * (1 - u);
  }
  if (dt <= 0) return;
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.age += dt;
    // 速さと向き: 打ち返したものはボスの部位へ鋭く曲がる
    let turn = 0;
    if (m.reflected) {
      if (bossOpenPoint(m.pos, want)) turn = MISSILE_RETURN_TURN;
    } else if (m.age < MISSILE_CLIMB) {
      // 昇る
    } else if (m.age < MISSILE_WANDER) {
      m.speed = Math.min(MISSILE_HOMING_SPEED, m.speed + MISSILE_ACCEL * dt); // 暴れる（追わない）
    } else if (m.age < MISSILE_WANDER + m.homing) {
      m.speed = Math.min(MISSILE_HOMING_SPEED, m.speed + MISSILE_ACCEL * dt);
      bossTargetAim(want);
      turn = MISSILE_TURN;
    } else {
      m.speed = Math.min(MISSILE_SPEED_MAX, m.speed + MISSILE_ACCEL * dt); // 追い終えたら、まっすぐ加速して飛ぶ
    }
    if (turn > 0) turnToward(m.dir, want.sub(m.pos).normalize(), turn * dt);
    if (!m.reflected && m.age < MISSILE_WANDER) {
      // ふらふらと向きを乱す（軸ごとに速さの違う揺れを足すので、ミサイルごとにばらばらに暴れる）
      const f = m.wobbleFreq, p = m.wobblePhase;
      wobble.set(Math.sin(f.x * m.age + p.x), Math.sin(f.y * m.age + p.y), Math.sin(f.z * m.age + p.z));
      wobble.addScaledVector(m.dir, -wobble.dot(m.dir)); // 進む向きに直交する分だけ
      m.dir.addScaledVector(wobble, MISSILE_WOBBLE * dt).normalize();
    }
    const step = m.speed * dt;
    next.copy(m.pos).addScaledVector(m.dir, step);

    if (m.reflected) {
      // 打ち返したもの: ボスに当たったら、その部位へ当たりを入れて爆発する
      const hit = raycastBoss(m.pos, m.dir, step);
      if (hit) {
        hooks.hitBoss(MISSILE_RETURN_HIT, hit.point, 'bullet', hit.part, m.dir);
        game.parryReturnAge = 0;
        explode(i, hit.point, false);
        continue;
      }
    } else {
      // パリィ: 振っている間に、正面から胸の近くへ来たら打ち返す
      aimTarget(chest);
      if (parryActive() && game.playerHp > 0 && m.pos.distanceTo(chest) < MISSILE_PARRY_RANGE) {
        camera.getWorldDirection(look);
        want.subVectors(m.pos, chest).normalize();
        if (look.angleTo(want) < PARRY_ANGLE && m.dir.dot(want) < 0) {
          reflect(m);
          continue;
        }
      }
      let remoteReflected = false;
      for (const remote of remotePlayers()) {
        if (!remote.parry) continue;
        chest.set(remote.x, remote.y + remote.eyeHeight - 0.35, remote.z);
        if (m.pos.distanceTo(chest) >= MISSILE_PARRY_RANGE) continue;
        look.set(remote.lookX, remote.lookY, remote.lookZ);
        if (look.lengthSq() < 1e-6) continue;
        want.subVectors(m.pos, chest).normalize();
        if (look.normalize().angleTo(want) >= PARRY_ANGLE || m.dir.dot(want) >= 0) continue;
        reflect(m, true); broadcastMissileParry(remote.id, [m.pos.x, m.pos.y, m.pos.z]); remoteReflected = true; break;
      }
      if (remoteReflected) continue;
      // プレイヤーの体（縦の線分）に当たったら爆発
      seg.set(m.pos, next);
      body.start.set(position.x, position.y + 0.15, position.z);
      body.end.set(position.x, position.y + player.eyeHeight + 0.05, position.z);
      closestSegmentPoints(seg, body, onSeg, onBody);
      const localHit = game.playerHp > 0 && onSeg.distanceTo(onBody) < MISSILE_HIT_RADIUS;
      let closest = localHit ? m.pos.distanceTo(onSeg) : Infinity;
      const hitAt = onSeg.clone();
      for (const remote of remotePlayers()) {
        body.start.set(remote.x, remote.y + 0.15, remote.z);
        body.end.set(remote.x, remote.y + remote.eyeHeight + 0.05, remote.z);
        closestSegmentPoints(seg, body, onSeg, onBody);
        const d = m.pos.distanceTo(onSeg);
        if (onSeg.distanceTo(onBody) < MISSILE_HIT_RADIUS && d < closest) { closest = d; hitAt.copy(onSeg); }
      }
      if (closest < Infinity) {
        explode(i, hitAt, true);
        continue;
      }
      // 銃弾・矢で撃ち落とす
      if (shotDown(m.pos, dt)) {
        explode(i, m.pos, true);
        continue;
      }
    }
    // 床と壁
    const wall = castWorld(m.pos, m.dir, step);
    const out = next.x < playBounds.minX - MISSILE_OUT || next.x > playBounds.maxX + MISSILE_OUT
      || next.z < playBounds.minZ - MISSILE_OUT || next.z > playBounds.maxZ + MISSILE_OUT || next.y > MISSILE_CEILING;
    if (out) {
      m.mesh.removeFromParent();
      missiles.splice(i, 1);
      continue;
    }
    if (wall < step || next.y <= 0.05 || m.age > MISSILE_LIFE) {
      if (wall < step) next.copy(m.pos).addScaledVector(m.dir, wall);
      next.y = Math.max(next.y, 0.05);
      explode(i, next, !m.reflected);
      continue;
    }
    m.pos.copy(next);
    m.mesh.position.copy(m.pos);
    m.mesh.lookAt(lookAt.copy(m.pos).add(m.dir));
    m.flame.scale.set(1, 1, (m.reflected ? 1.6 : 1) * (0.8 + 0.4 * Math.random()));
  }
}

// dir を want の方へ、最大 maxAngle だけ回す（真後ろを向いていても回れるよう、回転で求める）
const fullQ = new THREE.Quaternion();
const turnQ = new THREE.Quaternion();
function turnToward(dir: THREE.Vector3, want: THREE.Vector3, maxAngle: number) {
  const a = dir.angleTo(want);
  if (a < 1e-4) return;
  fullQ.setFromUnitVectors(dir, want);
  if (a > maxAngle) turnQ.identity().slerp(fullQ, maxAngle / a);
  else turnQ.copy(fullQ);
  dir.applyQuaternion(turnQ).normalize();
}

// 自分の銃弾（この 1 歩で進んだ線分）か矢が近くを通ったか。当たった銃弾はそこで止める
function shotDown(at: THREE.Vector3, dt: number) {
  for (const b of bullets) {
    if (b.hit) continue;
    seg.set(bulletBack.copy(b.pos).addScaledVector(b.dir, -Math.min(b.traveled, 5)), b.pos);
    if (seg.closestPointToPoint(at, true, onSeg).distanceTo(at) > MISSILE_SHOOT_RADIUS) continue;
    b.hit = true;
    b.pos.copy(onSeg);
    return true;
  }
  return catchArrowNear(at, MISSILE_SHOOT_RADIUS, dt);
}

// 打ち返す: 一瞬止めて火花を散らし、ボスへ向け直す（パリィで弾を返したときと同じ演出）
function reflect(m: Missile, remote = false) {
  m.reflected = true;
  m.speed = MISSILE_RETURN_SPEED;
  if (bossOpenPoint(m.pos, want)) m.dir.subVectors(want, m.pos).normalize();
  else m.dir.negate();
  if (!remote) {
    game.hitStop = Math.max(game.hitStop, PARRY_HIT_STOP);
    game.hitStopTotal = game.hitStop;
    game.hitStopShakesDummy = false;
    parryState.parryFxAge = 0;
  }
  spawnSparks(m.pos, m.dir, 14, 0.8, 0.8);
  if (!remote) { sfx.playParry(PARRY_HIT_STOP); hooks.addTrauma(0.2); }
}
export function remoteMissileParry(at: [number, number, number], mine: boolean) { remoteParryEffect(new THREE.Vector3(...at), mine); }
export function remoteMissileShotDown(id: number, attacker: { x: number; y: number; z: number }) {
  const i = missiles.findIndex((m) => m.id === id && !m.reflected);
  if (i < 0 || Math.hypot(missiles[i].pos.x - attacker.x, missiles[i].pos.y - attacker.y, missiles[i].pos.z - attacker.z) > 300) return;
  const at = missiles[i].pos.clone(); explode(i, at, true);
}

// 爆発: hurt なら、近くにいるプレイヤーを巻き込む
function explode(i: number, at: THREE.Vector3, hurt: boolean) {
  missiles[i].mesh.removeFromParent();
  missiles.splice(i, 1);
  broadcastMissileBlast([at.x, at.y, at.z]);
  if (hurt) for (const remote of remotePlayers()) {
    const dx = remote.x - at.x, dy = remote.y + remote.eyeHeight - 0.35 - at.y, dz = remote.z - at.z;
    const d = Math.hypot(dx, dy, dz);
    if (d <= MISSILE_BLAST) sendRemoteMissileHurt(remote.id, [at.x, at.y, at.z], MISSILE_DAMAGE * boss.damage * (1 - 0.5 * d / MISSILE_BLAST));
  }
  const mesh = new THREE.Mesh(blastGeo, blastMat.clone());
  mesh.position.copy(at);
  scene.add(mesh);
  blasts.push({ mesh, age: 0, size: MISSILE_BLAST * 0.6 });
  spawnSparks(at, UP, 16, 0.9, 1.1);
  if (at.y < 1) spawnScorch(at.x, at.z, MISSILE_BLAST * 0.9); // 床で爆発したら焦げ跡が残る
  if (at.y < 2) pushChunks(at.x, at.z, MISSILE_BLAST * 1.5, 7, 5);
  aimTarget(chest);
  const d = chest.distanceTo(at);
  sfx.playMissileBlast(THREE.MathUtils.clamp(6 / Math.max(d, 1), 0.3, 1));
  hooks.addTrauma(THREE.MathUtils.clamp(0.4 - d * 0.02, 0, 0.4));
  if (!hurt || d > MISSILE_BLAST || game.playerHp <= 0) return;
  hooks.damagePlayer(MISSILE_DAMAGE * boss.damage * (1 - 0.5 * (d / MISSILE_BLAST)));
  sfx.playHurt();
  hooks.addTrauma(0.35);
  want.subVectors(chest, at).setY(0);
  const h = want.length();
  if (h > 1e-3) {
    velocity.x += (want.x / h) * MISSILE_PUSH;
    velocity.z += (want.z / h) * MISSILE_PUSH;
  }
}

export function remoteMissileBlast(at: [number, number, number]) {
  const point = new THREE.Vector3(...at);
  const mesh = new THREE.Mesh(blastGeo, blastMat.clone()); mesh.position.copy(point); scene.add(mesh);
  blasts.push({ mesh, age: 0, size: MISSILE_BLAST * 0.6 });
  spawnSparks(point, UP, 16, 0.9, 1.1);
  sfx.playMissileBlast(THREE.MathUtils.clamp(6 / Math.max(point.distanceTo(position), 1), 0.3, 1));
}
export function remoteMissileHurt(at: [number, number, number], damage: number) {
  if (game.playerHp <= 0) return;
  hooks.damagePlayer(damage); sfx.playHurt(); hooks.addTrauma(0.35);
  want.set(position.x - at[0], 0, position.z - at[2]);
  if (want.lengthSq() > 1e-6) { want.normalize(); velocity.x += want.x * MISSILE_PUSH; velocity.z += want.z * MISSILE_PUSH; }
}
export function updateRemoteMissileEffects(dt: number) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]; b.age += dt; const u = b.age / BLAST_LIFE;
    if (u >= 1) { b.mesh.removeFromParent(); (b.mesh.material as THREE.Material).dispose(); blasts.splice(i, 1); continue; }
    b.mesh.scale.setScalar(b.size * (0.4 + 0.6 * Math.sqrt(u)));
    (b.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - u) * (1 - u);
  }
}

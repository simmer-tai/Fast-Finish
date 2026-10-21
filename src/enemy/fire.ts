import * as THREE from 'three';
import * as sfx from '../audio.js';
import { DEG, UP, wrapAngle } from '../math.js';
import { camera, scene } from '../core.js';
import { createPistol } from '../weapons/pistol.js';
import { weaponMats } from '../weapons/viewModels.js';
import { MUZZLE_FLASH_LIFE, TRACER_AXIS, bulletBack, tracerGeo, type Bullet } from '../weapons/handgunCombat.js';
import { spawnSparks } from '../fx/hitFx.js';
import { DUMMY_FOREARM, DUMMY_UPPER_ARM, type EnemyBody } from './body.js';
import { ENEMY_HIT_RECOVER, RESPAWN_RISE_TIME, en } from './state.js';
import { castWorld } from '../world/raycast.js';
import { player, position } from '../player/state.js';
import { PLAYER_RADIUS } from '../player/config.js';
import { game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';
import { closestSegmentPoints, tryParry } from '../combat/parry.js';

// ---- 敵の銃 ----
// 自動拳銃の持たせ方と、敵の射撃
// ---- 敵の射撃 ----
// 敵は体ごとプレイヤーの方へゆっくり向き直り、追いきれない分を銃と両腕で振って狙う。
// 狙いは少し遅れてついてくるので、動き続けていれば外れる。銃口が狙いに収まったら一定の間隔で撃つ。
// 弾は自分の銃より遅く、光の尾がはっきり見えるので、見てからかわせる
export const ENEMY_TURN_RATE = 3; // 体が向き直る速さ（残りの角度に掛ける割合 /s）
export const ENEMY_TURN_MAX = 2.5; // 体が向き直る最高の角速度 (rad/s)
export const ENEMY_AIM_RATE = 6; // 銃が狙いへ追いつく速さ（大きいほど遅れが小さい）
export const ENEMY_AIM_YAW_MAX = 40 * DEG;
export const ENEMY_AIM_PITCH_MAX = 40 * DEG;
export const ENEMY_GUN_Y = 1.6; // 銃を構えている高さ（狙いの上下の角度の基準）
export const ENEMY_FIRST_SHOT = 1.2; // 現れてから最初に撃つまで
export const ENEMY_FIRE_MIN = 1.1; // 撃つ間隔
export const ENEMY_FIRE_MAX = 1.8;
export const ENEMY_FIRE_CONE = 5 * DEG; // 銃口の向きと狙いのずれがこれ以内なら撃つ
export const ENEMY_SPREAD = 0.8 * DEG;
export const ENEMY_STAGGER_LIMIT = 0.12; // 銃がこれ以上跳ね上がっている間（よろめいている間）は撃たない (rad)
export const ENEMY_LEAN_LIMIT = 6 * DEG; // 上体がこれ以上反っている間も撃たない
export const ENEMY_RECOIL = 3.5; // 撃ったときに銃口を跳ね上げる角速度
export const ENEMY_BULLET_SPEED = 40; // m/s
export const ENEMY_BULLET_RANGE = 120;
export const ENEMY_BULLET_DAMAGE = 12;
export const ENEMY_TRACER_LEN = 2.2;
export const ENEMY_TRACER_WIDTH = 0.022;
export const ENEMY_HIT_RADIUS = PLAYER_RADIUS * 0.8;
export const ENEMY_FLASH_SCALE = 2; // 遠くからでも見えるよう、マズルフラッシュを大きくする
export const ENEMY_BRACE_TIME = 0.4; // 撃つこの時間前から構え始める
export const ENEMY_BRACE_RATE = 9; // 構えへ近づく速さ（解くときはこの半分）
export const ENEMY_BRACE_READY = 0.8; // 構えがここまで進むまでは撃たない

export const enemyTracerMat = new THREE.MeshBasicMaterial({
  color: 0xffb080,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
export const enemyBullets: Bullet[] = [];
export const enemyTarget = new THREE.Vector3();
export const enemyFrom = new THREE.Vector3();
export const enemyFwd = new THREE.Vector3();
export const enemyTo = new THREE.Vector3();
export const enemyNext = new THREE.Vector3();
export const enemyOnPath = new THREE.Vector3();
export const enemyOnBody = new THREE.Vector3();
export const enemyPath = new THREE.Line3();
export const enemyBody = new THREE.Line3();
export const enemyPan = new THREE.Vector3();

// 狙う所: プレイヤーの胸
export function aimTarget(out: THREE.Vector3) {
  return out.set(position.x, position.y + player.eyeHeight - 0.35, position.z);
}

export function updateDummyAim(dt: number) {
  aimTarget(enemyTarget);
  const dx = enemyTarget.x - en.root.position.x;
  const dz = enemyTarget.z - en.root.position.z;
  const want = Math.atan2(dx, dz);
  const turn = wrapAngle(want - en.yaw) * Math.min(1, dt * ENEMY_TURN_RATE);
  en.yaw = wrapAngle(en.yaw + THREE.MathUtils.clamp(turn, -ENEMY_TURN_MAX * dt, ENEMY_TURN_MAX * dt));
  en.root.quaternion.setFromAxisAngle(UP, en.yaw);

  const yaw = THREE.MathUtils.clamp(wrapAngle(want - en.yaw), -ENEMY_AIM_YAW_MAX, ENEMY_AIM_YAW_MAX);
  const pitch = THREE.MathUtils.clamp(
    Math.atan2(enemyTarget.y - (en.root.position.y + ENEMY_GUN_Y), Math.hypot(dx, dz)),
    -ENEMY_AIM_PITCH_MAX,
    ENEMY_AIM_PITCH_MAX,
  );
  const k = 1 - Math.exp(-ENEMY_AIM_RATE * dt);
  en.aimYaw += (yaw - en.aimYaw) * k;
  en.aimPitch += (pitch - en.aimPitch) * k;
}

export function updateEnemyFire(dt: number) {
  en.flashAge += dt;
  en.muzzleFx.visible = en.flashAge < MUZZLE_FLASH_LIFE;
  en.cooldown -= dt;
  // 撃つ少し前から腰を落として構える。構えきるまでは撃たない（見てからかわせる合図）
  const canAim = en.alive && game.playerHp > 0 && en.riseTime >= RESPAWN_RISE_TIME && en.flashT >= ENEMY_HIT_RECOVER && en.airY <= 0
    && en.dodgeT <= 0;
  const braceWant = canAim && en.cooldown < ENEMY_BRACE_TIME ? 1 : 0;
  en.brace += (braceWant - en.brace) * Math.min(1, dt * (braceWant > en.brace ? ENEMY_BRACE_RATE : ENEMY_BRACE_RATE * 0.5));
  if (!canAim || en.cooldown > 0 || en.brace < ENEMY_BRACE_READY) return;
  // 攻撃を受けてよろけている間は撃たない。当たってからしばらくと、上体の反りや銃の跳ね上がりが残っている間
  if (Math.abs(en.gunSpring.x.x) > ENEMY_STAGGER_LIMIT || en.leanSpring.x.length() > ENEMY_LEAN_LIMIT) return;
  if (en.footState.some((f) => f.t < 1)) return; // 踏ん張って足を踏み出している最中

  en.muzzle.updateWorldMatrix(true, false);
  enemyFrom.setFromMatrixPosition(en.muzzle.matrixWorld);
  enemyFwd.set(0, 0, -1).transformDirection(en.muzzle.matrixWorld); // 銃口は -Z
  enemyTo.subVectors(aimTarget(enemyTarget), enemyFrom);
  const dist = enemyTo.length();
  enemyTo.divideScalar(dist);
  if (enemyFwd.angleTo(enemyTo) > ENEMY_FIRE_CONE) return;
  if (castWorld(enemyFrom, enemyTo, dist) < dist) return; // 柱の陰にいる間は撃たない

  // 狙いの遅れを残すため、プレイヤーへではなく銃口の向きへ撃つ
  const dir = enemyFwd.clone();
  dir.x += (Math.random() * 2 - 1) * ENEMY_SPREAD;
  dir.y += (Math.random() * 2 - 1) * ENEMY_SPREAD;
  dir.z += (Math.random() * 2 - 1) * ENEMY_SPREAD;
  dir.normalize();
  const mesh = new THREE.Mesh(tracerGeo, enemyTracerMat);
  mesh.frustumCulled = false;
  mesh.visible = false; // 尾が伸びるまで出さない
  scene.add(mesh);
  enemyBullets.push({ pos: enemyFrom.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, from: en });

  en.cooldown = THREE.MathUtils.lerp(ENEMY_FIRE_MIN, ENEMY_FIRE_MAX, Math.random());
  en.flashAge = 0;
  en.muzzleFx.rotation.z = Math.random() * Math.PI;
  en.muzzleFx.scale.setScalar(ENEMY_FLASH_SCALE * (1 + Math.random() * 0.3));
  en.gunSpring.v.x -= ENEMY_RECOIL;
  // 敵のいる向きの左右から鳴らす（前後は分からないので、真横でも振りきらない）
  camera.updateMatrixWorld();
  enemyPan.copy(en.root.position).applyMatrix4(camera.matrixWorldInverse);
  const pan = THREE.MathUtils.clamp(enemyPan.x / Math.max(Math.hypot(enemyPan.x, enemyPan.z), 1e-3), -1, 1) * 0.8;
  sfx.playGunshot(THREE.MathUtils.clamp(4 / Math.max(dist, 1), 0.25, 0.8), pan);
}

export function updateEnemyBullets(dt: number) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    const step = ENEMY_BULLET_SPEED * dt;
    if (b.hit || b.traveled >= ENEMY_BULLET_RANGE) {
      b.tail -= step;
      if (!b.hit) b.pos.addScaledVector(b.dir, step);
    } else {
      // この 1 歩の間に、まず壁、その手前でプレイヤーの体（縦の線分の周り）に当たるかを調べる
      const wall = castWorld(b.pos, b.dir, step);
      enemyNext.copy(b.pos).addScaledVector(b.dir, wall);
      enemyPath.set(b.pos, enemyNext);
      enemyBody.start.set(position.x, position.y + 0.15, position.z);
      enemyBody.end.set(position.x, position.y + player.eyeHeight + 0.05, position.z);
      if (game.playerHp > 0 && tryParry(b)) {
        b.mesh.removeFromParent();
        enemyBullets.splice(i, 1);
        continue;
      }
      closestSegmentPoints(enemyPath, enemyBody, enemyOnPath, enemyOnBody);
      if (game.playerHp > 0 && enemyOnPath.distanceTo(enemyOnBody) < ENEMY_HIT_RADIUS) {
        b.hit = true;
        b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + b.pos.distanceTo(enemyOnPath));
        b.pos.copy(enemyOnPath);
        if (b.from) b.from.hitPlayer = true;
        onPlayerShot(b.dir);
      } else if (wall < step) {
        b.hit = true;
        b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + wall);
        b.pos.copy(enemyNext);
        spawnSparks(enemyNext, b.dir, 6 + Math.floor(Math.random() * 4), 0.6, 0.5);
        sfx.playRicochet();
      } else {
        b.pos.copy(enemyNext);
        b.traveled += step;
        b.tail = Math.min(ENEMY_TRACER_LEN, b.tail + step);
      }
    }
    if (b.tail <= 0) {
      b.mesh.removeFromParent();
      enemyBullets.splice(i, 1);
      continue;
    }
    b.mesh.visible = true;
    b.mesh.position.copy(b.pos);
    b.mesh.quaternion.setFromUnitVectors(TRACER_AXIS, bulletBack.copy(b.dir).negate());
    b.mesh.scale.set(ENEMY_TRACER_WIDTH, ENEMY_TRACER_WIDTH, b.tail);
  }
}

// 撃たれた: 体力を削り、撃たれた向きへ視点を弾く
export function onPlayerShot(dir: THREE.Vector3) {
  hooks.damagePlayer(ENEMY_BULLET_DAMAGE);
  sfx.playHurt();
  hooks.addTrauma(0.35);
  camera.getWorldDirection(enemyTo);
  // 正面から撃たれたら視点が上へ、横からなら撃たれた向きへねじれる
  const side = enemyTo.x * dir.z - enemyTo.z * dir.x;
  kickVel.x += 2.5 * DEG * 22;
  kickVel.z += side * 3 * DEG * 22;
}

// 敵に拳銃を両手で構えさせる（アイソセレス・スタンス）。
// 銃は体の正面、右目の少し下の高さに置き、腕は 2 関節の IK で手をグリップへ届かせる。
// 右手がグリップを握り、左手はその左下から包むように添える。肘は軽く曲げて下外側へ逃がす
export function attachEnemyGun(body: EnemyBody) {
  const gun = createPistol(weaponMats);
  gun.rotation.y = Math.PI; // 銃口（-Z）を敵の正面（+Z）へ
  gun.position.set(-0.04, 1.6, 0.6).sub(body.gunRig.userData.origin);
  gun.rotation.x = -0.03; // 銃口をわずかに上げて照準線を水平に
  body.gunRig.add(gun);
  {
    // グリップの握る所（銃の座標で後ろへ 0.04、下へ 0.06）を敵の座標へ
    const grip = new THREE.Vector3(0, -0.06, 0.04).applyEuler(gun.rotation).add(gun.position);
    const hands = [grip, grip.clone().add(new THREE.Vector3(0.04, -0.015, 0.012))];
    const shoulder = new THREE.Vector3();
    const toHand = new THREE.Vector3();
    const bend = new THREE.Vector3();
    const elbow = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const DOWN = new THREE.Vector3(0, -1, 0);
    const upperQ = new THREE.Quaternion();
    const foreQ = new THREE.Quaternion();
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const arm = body.arms[i];
      shoulder.copy(arm.position);
      toHand.subVectors(hands[i], shoulder);
      const d = Math.min(toHand.length(), DUMMY_UPPER_ARM + DUMMY_FOREARM - 1e-3);
      toHand.normalize();
      // 余弦定理で肩の開き角を出し、肘を「下外側」の向きへ出す
      const cosA = (DUMMY_UPPER_ARM ** 2 + d * d - DUMMY_FOREARM ** 2) / (2 * DUMMY_UPPER_ARM * d);
      const a = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
      bend.set(0.6 * side, -1, -0.2);
      bend.addScaledVector(toHand, -bend.dot(toHand)).normalize();
      elbow.copy(shoulder).addScaledVector(toHand, Math.cos(a) * DUMMY_UPPER_ARM).addScaledVector(bend, Math.sin(a) * DUMMY_UPPER_ARM);
      upperQ.setFromUnitVectors(DOWN, dir.subVectors(elbow, shoulder).normalize());
      arm.quaternion.copy(upperQ);
      // 前腕は肘から手へ。上腕の回転を打ち消してローカルの向きにする
      foreQ.setFromUnitVectors(DOWN, dir.subVectors(hands[i], elbow).normalize());
      body.forearms[i].quaternion.copy(upperQ.invert()).multiply(foreQ);
    }
  }
  return gun;
}

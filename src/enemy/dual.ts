import * as THREE from 'three';
import * as sfx from '../audio.js';
import { camera, scene } from '../core.js';
import { createPistol } from '../weapons/pistol.js';
import { weaponMats } from '../weapons/viewModels.js';
import { MUZZLE_FLASH_LIFE, tracerGeo } from '../weapons/handgunCombat.js';
import { type EnemyBody } from './body.js';
import { ENEMY_HIT_RECOVER, RESPAWN_RISE_TIME, en } from './state.js';
import {
  ENEMY_ACCURACY, ENEMY_BRACE_READY, ENEMY_BRACE_TIME, ENEMY_BULLET_SPEED, ENEMY_FIRE_CONE, ENEMY_LEAN_LIMIT, ENEMY_STAGGER_LIMIT,
  ENEMY_TRACER_LEN, enemyBullets, enemyTracerMat, reachHands,
} from './fire.js';
import { castWorld } from '../world/raycast.js';
import { broadcastBossShot } from '../multiplayer/connectionTest.js';
import { game } from '../game/state.js';
import { env } from './env.js';

// ---- 二丁拳銃 ----
// 銃撃役の強化版。両手に 1 丁ずつ拳銃を持ち、左右交互に速い間隔で何発も撃つ（連射）。連射の合間は銃撃役より短い。
// 1 発は軽く、散らばりも大きいので、遠くで横へ動き続けていれば大半は外れる。
// 狙いの遅れは銃撃役と同じで、横へ走って銃口を振り切る（狙いの範囲から外れる）と連射はそこで途切れる。
// 撃ちながら歩けるので、足を止めて構える銃撃役より厄介
export const DUAL_HP = 80;
export const DUAL_BURST = { easy: 4, normal: 6, hard: 8 } as const; // 1 回の連射で撃つ数
export const DUAL_SHOT_GAP = 0.11; // 連射の 1 発ごとの間隔（左右交互）
export const DUAL_REST_MIN = 1.3; // 連射を撃ちきってから次の連射まで
export const DUAL_REST_MAX = 2;
export const DUAL_BROKEN_REST = 0.9; // 連射を途切れさせられてから撃ち直すまで
export const DUAL_DAMAGE = 7;
export const DUAL_SPREAD = 1.8; // 銃撃役の散らばりに掛ける（片手撃ちなので粗い）
export const DUAL_SPREAD_MIN = 0.6 * (Math.PI / 180);
// 反動は銃撃役より小さくする（銃口が跳ねたまま次を撃つので、大きいと上へ外れ続ける）
export const DUAL_RECOIL = 0.7; // 1 発ごとに銃口を跳ね上げる角速度
export const DUAL_TWIST_KICK = 0.4; // 撃った側の肩を後ろへ引く角速度（左右交互に上体が揺れる）
export const DUAL_TRACER_WIDTH = 0.018;
export const DUAL_FLASH_SCALE = 1.7;

const dualFrom = new THREE.Vector3();
const dualFwd = new THREE.Vector3();
const dualTo = new THREE.Vector3();
const dualTarget = new THREE.Vector3();
const dualPan = new THREE.Vector3();
let nextDualShotId = 1_500_000_000;

export function resetDual() {
  en.burst = 0;
}

export function updateDualFire(dt: number) {
  en.flashAge += dt;
  en.muzzleFx.visible = en.flashAge < MUZZLE_FLASH_LIFE;
  en.cooldown -= dt;
  const canAim = en.alive && env.playerHp() > 0 && en.riseTime >= RESPAWN_RISE_TIME && en.flashT >= ENEMY_HIT_RECOVER && en.airY <= 0
    && en.dodgeT <= 0 && en.ride !== 'leap';
  const steady = Math.abs(en.gunSpring.x.x) <= ENEMY_STAGGER_LIMIT && en.leanSpring.x.length() <= ENEMY_LEAN_LIMIT;
  if (en.burst > 0 && (!canAim || !steady)) breakBurst(); // 当てられて連射を崩された
  // 撃つ少し前から構える。連射の間は構えたまま
  const braceWant = canAim && (en.burst > 0 || en.cooldown < ENEMY_BRACE_TIME) ? 1 : 0;
  en.brace += (braceWant - en.brace) * Math.min(1, dt * (braceWant > en.brace ? 9 : 4.5));
  if (!canAim || !steady || en.cooldown > 0 || en.brace < ENEMY_BRACE_READY) return;
  // 連射を始めるときだけ、足を止めている間を待つ（始めてしまえば歩きながら撃つ）
  if (en.burst === 0 && en.footState.some((f) => f.t < 1)) return;

  // 撃つ側の銃口へマズルフラッシュを付け替える（交互なので 1 つで足りる）
  const muzzle = en.muzzles[en.burst % 2];
  muzzle.updateWorldMatrix(true, false);
  dualFrom.setFromMatrixPosition(muzzle.matrixWorld);
  dualFwd.set(0, 0, -1).transformDirection(muzzle.matrixWorld); // 銃口は -Z
  if (!env.targetPlayer(dualTarget)) return;
  dualTo.subVectors(dualTarget, dualFrom);
  const dist = dualTo.length();
  dualTo.divideScalar(dist);
  // 振り切られた・柱の陰に入られた。始める前なら待ち、連射の途中ならそこで途切れる
  if (dualFwd.angleTo(dualTo) > ENEMY_FIRE_CONE * 1.4 || castWorld(dualFrom, dualTo, dist) < dist) {
    if (en.burst > 0) breakBurst();
    return;
  }
  if (en.burst === 0) en.burst = DUAL_BURST[game.difficulty];
  fireDual(muzzle, dist);
  en.burst--;
  en.cooldown = en.burst > 0 ? DUAL_SHOT_GAP : THREE.MathUtils.lerp(DUAL_REST_MIN, DUAL_REST_MAX, Math.random());
}

function breakBurst() {
  en.burst = 0;
  en.cooldown = Math.max(en.cooldown, DUAL_BROKEN_REST);
}

// 銃口の向きへ撃つ（狙いの遅れを残す）
function fireDual(muzzle: THREE.Object3D, dist: number) {
  const dir = dualFwd.clone();
  const spread = Math.max(ENEMY_ACCURACY[game.difficulty].spread * DUAL_SPREAD, DUAL_SPREAD_MIN);
  dir.x += (Math.random() * 2 - 1) * spread;
  dir.y += (Math.random() * 2 - 1) * spread;
  dir.z += (Math.random() * 2 - 1) * spread;
  dir.normalize();
  const mesh = new THREE.Mesh(tracerGeo, enemyTracerMat);
  mesh.frustumCulled = false;
  mesh.visible = false; // 尾が伸びるまで出さない
  scene.add(mesh);
  const networkId = nextDualShotId++;
  enemyBullets.push({
    pos: dualFrom.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, from: en, networkId,
    damage: DUAL_DAMAGE, tracerWidth: DUAL_TRACER_WIDTH,
  });
  broadcastBossShot({ id: networkId, from: [dualFrom.x, dualFrom.y, dualFrom.z], dir: [dir.x, dir.y, dir.z],
    speed: ENEMY_BULLET_SPEED, damage: DUAL_DAMAGE, length: ENEMY_TRACER_LEN, width: DUAL_TRACER_WIDTH, part: 'gunner', sound: true });

  muzzle.add(en.muzzleFx);
  en.flashAge = 0;
  en.muzzleFx.rotation.z = Math.random() * Math.PI;
  en.muzzleFx.scale.setScalar(DUAL_FLASH_SCALE * (1 + Math.random() * 0.3));
  en.gunSpring.v.x -= DUAL_RECOIL;
  // 右手（[0]）で撃てば右肩が後ろへ、左手なら左肩が後ろへ引かれる
  en.twistSpring.v.y += (en.muzzles.indexOf(muzzle) === 0 ? -1 : 1) * DUAL_TWIST_KICK;
  camera.updateMatrixWorld();
  dualPan.copy(en.root.position).applyMatrix4(camera.matrixWorldInverse);
  const pan = THREE.MathUtils.clamp(dualPan.x / Math.max(Math.hypot(dualPan.x, dualPan.z), 1e-3), -1, 1) * 0.8;
  sfx.playGunshot(THREE.MathUtils.clamp(3 / Math.max(dist, 1), 0.2, 0.65), pan);
}

// 両手に拳銃を 1 丁ずつ、腕を前へ伸ばして構えさせる。2 丁は肩幅より少し内側に並べ、上を内へ少し倒す。
// 返すのは 2 丁をまとめた入れ物で、userData.muzzles に [右, 左] の銃口、userData.pieces に砕けたときの塊を入れる
export function attachDualGuns(body: EnemyBody) {
  const gun = new THREE.Group();
  body.gunRig.add(gun);
  const muzzles: THREE.Object3D[] = [];
  const pistols: THREE.Object3D[] = [];
  const grips: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const p = createPistol(weaponMats);
    p.rotation.set(-0.03, Math.PI, -0.25 * side); // 銃口（-Z）を正面（+Z）へ向け、上を体の中心の側へ倒す
    p.position.set(0.16 * side, 1.56, 0.6).sub(body.gunRig.userData.origin);
    gun.add(p);
    pistols.push(p);
    muzzles.push(p.userData.muzzle as THREE.Object3D);
    // グリップの握る所（銃の座標で後ろへ 0.04、下へ 0.06）を敵の座標へ
    grips.push(new THREE.Vector3(0, -0.06, 0.04).applyEuler(p.rotation).add(p.position));
  }
  reachHands(body, grips);
  gun.userData.muzzle = muzzles[0];
  gun.userData.muzzles = muzzles;
  gun.userData.pieces = pistols;
  dressDual(body);
  return gun;
}

// 銃撃役の体に、二丁拳銃の目印を足す: 両の太ももに空のホルスターと、頭の後ろへなびく 2 本の鉢巻きの尾
function dressDual(body: EnemyBody) {
  const put = (bone: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z).sub(bone.userData.origin);
    bone.add(m);
    body.parts.push(m);
    return m;
  };
  const K = body.jointMat;
  for (const side of [-1, 1]) {
    const thigh = body.thighs[side < 0 ? 0 : 1];
    put(thigh, new THREE.BoxGeometry(0.05, 0.17, 0.1), K, 0.2 * side, 0.7, 0).rotation.z = 0.08 * side;
    put(thigh, new THREE.BoxGeometry(0.19, 0.025, 0.17), K, 0.12 * side, 0.64, 0);
    // 鉢巻きの尾: 後頭部の結び目から下後ろへ垂らし、左右へ少し開く
    const tail = put(body.neck, new THREE.BoxGeometry(0.035, 0.24, 0.012), K, 0.03 * side, 1.61, -0.19);
    tail.rotation.set(0.5, 0, 0.18 * side);
  }
  put(body.neck, new THREE.BoxGeometry(0.06, 0.04, 0.03), K, 0, 1.715, -0.135);
}

import * as THREE from 'three';
import * as sfx from '../audio.js';
import { camera, controls, scene } from '../core.js';
import { ARROW_LEN, createArrow, setBowDraw } from './bow.js';
import { bowModel, kunaiMat, weaponMats } from './viewModels.js';
import { findThrowAim } from './kunaiCombat.js';
import type { HitDef } from './kunaiAttacks.js';
import { Ribbon, arrowRibbonMat } from '../fx/ribbons.js';
import { en, enemies, hitDir, setEn, type Enemy } from '../enemy/state.js';
import { castHit, castThrow, castWorld } from '../world/raycast.js';
import { enemyChest } from '../player/aimAssist.js';
import { spawnSparks } from '../fx/hitFx.js';
import { findBankShot } from './bowBankShot.js';
import { player, position } from '../player/state.js';
import { DEG } from '../math.js';
import { easeOutCubic } from '../ease.js';
import { DASH_ATTACK_WINDOW, game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';

// ---- 弓 ----
// 左クリックを押している間に弦を引き、離すと射る。長く引くほど矢は速く、まっすぐ飛び、重く刺さる。
// 引き具合はクロスヘアの下の帯で見せる。射った矢は重力で少しずつ落ちながら飛び、敵や壁に刺さる（跳ねない）。
// 右クリックは跳弾矢: 同じように引いて射り、壁・床・天井のどこに当たっても角度によらず跳ね返る。跳ねた先の近くに敵がいれば、その敵を追いかけて曲がる。
// 照準のすぐ近くに跳ねて敵に当たる所があれば、跳ねるときにその敵へ向け直す（bowBankShot.ts）。
// 跳弾矢は最大 BOW_RICOCHET_STOCK 本まで持ち、跳弾矢以外で敵を倒すたびに 1 本戻る。残りはクロスヘアの下の菱形で見せる。
// ホイールを押している間は弓を横に寝かせて 3 本まとめて引き、離すと横に広げて射る（狙いは甘く、1 本ずつは軽い）
// 本体からも読み書きする値
export type BowShot = 'arrow' | 'ricochet' | 'volley';
export const BOW_RICOCHET_STOCK = 3; // 跳弾矢を持てる本数
export const BOW_RICOCHET_EMPTY_FLASH = 0.35; // 残りが無いのに引こうとしたとき、印を震わせる時間
export const bowState = {
  draw: 0, // 弦の引き具合（0 = 引いていない、1 = 引ききった）
  drawing: false, // 引いている最中か
  shot: 'arrow' as BowShot, // 引いている矢の種類
  aimPose: 0, // 引いて構えた姿勢への寄せ具合（手元の動きに使う）
  sidePose: 0, // 3 本射ちの、弓を横に寝かせた構えへの寄せ具合
  release: 0, // 射った瞬間に 1 にして、弦が戻る揺れに使う
  aimPressed: false, // 右クリック・ZL を押した瞬間
  volleyHeld: false, // ホイールを押している間（3 本射ち）
  padVolley: false, // パッド: ダッシュ中・ダッシュ直後に ZL を押した。ZL を離すまで、跳弾矢ではなく 3 本射ちとして引く
  ricochetStock: BOW_RICOCHET_STOCK, // 跳弾矢の残り
  ricochetEmptyFlash: 0,
  ricochetHitting: false, // 跳弾矢の当たりを処理している最中（その当たりで倒しても跳弾矢は戻さない）
  equipT: Infinity, // 取り出し始めてからの時間（取り出していないときは Infinity）
};

// 敵を倒したら跳弾矢を 1 本戻す（跳弾矢で倒したときは戻さない）
export function gainRicochetArrow() {
  if (bowState.ricochetHitting) return;
  bowState.ricochetStock = Math.min(BOW_RICOCHET_STOCK, bowState.ricochetStock + 1);
}

// ---- 取り出し ----
// 持ち替えたとき: 寝かせた弓を画面の左下から、握りを軸に風車のように回しながら振り上げる。
// 回りを緩めて立てた所で「パシッ」と握り込み、少し行き過ぎて構えに収まる（揺れた弦が震える）。
// 続けて右肩の後ろから矢を抜いて、弦へ滑らせて「カチッ」とつがえる
export const BOW_EQUIP_SPIN = 0.4; // 回し終えて握り込むまで（ここから引ける）
export const BOW_EQUIP_TURN = Math.PI * 2.5; // 回す角度（寝かせた向きから 1 周と 1/4 で立つ）
export const BOW_EQUIP_SNAP = 0.18; // 握り込んでから構えに収まるまで
export const BOW_EQUIP_NOCK_FROM = 0.34; // 矢を抜き始める
export const BOW_EQUIP_NOCK_AT = 0.58; // 矢を弦につがえる
export const BOW_EQUIP_TIME = BOW_EQUIP_NOCK_AT + 0.04;
const EQUIP_SWISH = { at: 0, dur: 0.2, f0: 300, f1: 1300, gain: 0.1 };
// 抜いた矢が始まる所（弓の向きで、つがえる所からのずれ）: 手前（-X）・右（+Z）・少し上
const EQUIP_ARROW_FROM = new THREE.Vector3(-0.42, 0.14, 0.3);
const EQUIP_ARROW_TILT = 0.7; // 抜いたときに鏃を上へ起こしている角度

export function startBowEquip() {
  bowState.equipT = 0;
  nockWait = 0;
  nockedArrow.visible = false;
  stringBuzz = 0;
  sfx.playSwish(EQUIP_SWISH);
}

// 引き始めでは、取り出しの残りを飛ばして矢をつがえた形にする
function finishBowEquip() {
  if (bowState.equipT === Infinity) return;
  bowState.equipT = Infinity;
  nockedArrow.visible = true;
}

function updateBowEquip(dt: number) {
  if (bowState.equipT === Infinity) return;
  if (game.shownWeapon !== 'bow') return finishBowEquip();
  const prev = bowState.equipT;
  const t = (bowState.equipT += dt);
  const at = (k: number) => prev < k && t >= k;
  if (at(BOW_EQUIP_SPIN * 0.45)) sfx.playSwish(EQUIP_SWISH); // 2 周目の風切り
  if (at(BOW_EQUIP_SPIN)) {
    sfx.playBowCatch();
    stringBuzz = 1;
    kickVel.x -= 0.5 * DEG * 22; // 握り込んだ手応え
  }
  if (at(BOW_EQUIP_NOCK_FROM)) {
    nockedArrow.visible = true;
    sfx.playThrow({ ...ARROW_SWISH, dur: 0.16, f0: 500, f1: 1600, gain: 0.06 }); // 矢を抜く「シュッ」
  }
  if (at(BOW_EQUIP_NOCK_AT)) {
    sfx.playBowNock();
    kickVel.x -= 0.25 * DEG * 22;
  }
  if (t >= BOW_EQUIP_TIME) finishBowEquip();
}
export const bowEquipCaught = () => bowState.equipT >= BOW_EQUIP_SPIN;

// 3 本射ち（ホイール。パッドはダッシュ中・ダッシュ直後の ZL）: 照準を真ん中に、左右へ同じ角度ずつ広げる。1 本ずつ狙いを散らし、遅く軽くする
export const BOW_VOLLEY_SPREAD = 4 * DEG; // 隣の矢との角度
export const BOW_VOLLEY_JITTER = 1.5 * DEG; // 1 本ずつ散らす角度（横と縦それぞれ、この範囲でばらばら）
export const BOW_VOLLEY_SPEED = 0.8; // 1 本で射ったときに比べた速さ
export const BOW_VOLLEY_DMG = 0.6; // 1 本で射ったときに比べたダメージ
export const BOW_VOLLEY_RANGE = 60; // 何にも当たらないときに狙う距離
const VOLLEY_NOCK_FAN = 0.05; // つがえた 3 本を、筈を軸に広げて見せる角度 (rad)

export const BOW_DRAW_TIME = 0.5; // 引ききるまで
export const BOW_MIN_DRAW = 0.2; // これより浅く離したら射らずに戻す
export const BOW_PULL = 0.24; // 引ききったときに弦を引く長さ (m)
export const BOW_ZOOM = 20; // 引ききったときに狭める視野 (度)。引き具合に合わせて寄せる
export const BOW_NOCK_TIME = 0.3; // 射ってから次の矢をつがえるまで
export const ARROW_SPEED_MIN = 28;
export const ARROW_SPEED_MAX = 95;
export const ARROW_GRAVITY_MIN = 2.5; // 引ききったときの重力 (m/s²)
export const ARROW_GRAVITY_MAX = 9.8;
export const ARROW_DMG_MIN = 0.5; // ダメージの倍率（弾の 1 発 = 1）
export const ARROW_DMG_MAX = 2;
export const ARROW_FLY_MAX = 3; // 何にも当たらなければこの時間で消す
export const ARROW_STUCK_WORLD = 8; // 壁や床に刺さった矢を残しておく時間
export const ARROW_STUCK_ENEMY = 1.2; // 敵に刺さった矢を残しておく時間
export const ARROW_STICK_DEPTH = 0.08; // 刺さったときに埋まる深さ
export const ARROW_MAX = 24; // 場に残しておける矢の数
// 跳弾矢
export const ARROW_RICOCHET_KEEP = 0.8; // 跳ねたときに残る速さの割合
export const ARROW_RICOCHET_MAX = 2; // 1 本が跳ねられる回数
export const ARROW_RICOCHET_SEEK = 70 * DEG; // 跳ねた向きからこの角度以内の敵を追いかける
export const ARROW_RICOCHET_TURN = 14; // 追いかけるときに 1 秒で曲がれる角度 (rad)
export const ARROW_RICOCHET_GIVE_UP = 110 * DEG; // 追いかける敵がこれより横へ外れたらあきらめる
export const ARROW_RICOCHET_DMG = 1.25; // 跳ねるたびにかけるダメージの倍率
export const ARROW_TRAIL_LIFE = 0.6;
export const ARROW_TRAIL_WIDTH = 0.02;

export const ARROW_HIT: HitDef = { kick: [-1, 0, 0], knock: 110, hitStop: 0.03, fx: 0.7, dmg: 1 };
export const ARROW_SWISH = { at: 0, dur: 0.18, f0: 600, f1: 2400, gain: 0.12 };

// 弦につがえて見せる矢（弓の子）。鏃を的の側（+X）へ向ける
const arrowMats = { shaft: weaponMats.swordHilt, head: kunaiMat, fletch: weaponMats.lead };
const nockedArrow = createArrow(arrowMats);
nockedArrow.rotation.z = -Math.PI / 2;
bowModel.add(nockedArrow);
// 3 本射ちで真ん中の矢の左右に足す 2 本（引いている間だけ見せる）
const volleyArrows = [-1, 1].map((side) => {
  const a = createArrow(arrowMats);
  a.userData.side = side;
  a.visible = false;
  bowModel.add(a);
  return a;
});
const nockRest = bowModel.userData.nockRest as THREE.Vector3;
const arrowTemplate = createArrow(arrowMats);
const ARROW_AXIS = new THREE.Vector3(0, 1, 0);
const ARROW_Z = -0.004; // 矢は柄の左（-Z）に寄せて載せる

interface Arrow {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  gravity: number;
  dmg: number;
  age: number;
  bounces: number; // 跳ねた回数
  ricochet: boolean; // 跳弾矢（どの角度でも跳ねる）。普通の矢は跳ねずに刺さる
  bank: Enemy | null; // 跳弾の狙いの補助で覚えた敵。最初の面では必ず跳ね、跳ねたらこの敵へ向け直す
  seek: Enemy | null; // 跳ねた後に追いかけている敵
  stuck: number; // 刺さってから残しておく時間。0 なら飛んでいる
  trail: Ribbon | null;
}
const arrows: Arrow[] = [];
let clock = 0;
let drawTime = 0;
let nockWait = 0; // 次の矢をつがえるまでの残り
let stringBuzz = 0; // 取り出しで握り込んだときの弦の震え（1 → 0）
let stopDrawSound: (() => void) | null = null; // 鳴っている弓のしなる音を止める
function endDrawSound() {
  stopDrawSound?.();
  stopDrawSound = null;
}

export const bowReady = () => game.shownWeapon === 'bow' && game.wantWeapon === 'bow' && game.holster === 0;

const launchFrom = new THREE.Vector3();
const launchAim = new THREE.Vector3();
const launchDir = new THREE.Vector3();
function launchArrow(from: THREE.Vector3, dir: THREE.Vector3, speed: number, gravity: number, dmg: number, ricochet: boolean, bank: Enemy | null) {
  const mesh = arrowTemplate.clone();
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(ARROW_AXIS, dir);
  scene.add(mesh);
  const trail = new Ribbon(256, ARROW_TRAIL_LIFE, arrowRibbonMat);
  scene.add(trail.mesh);
  arrows.push({
    mesh,
    vel: dir.clone().multiplyScalar(speed),
    gravity,
    dmg,
    age: 0,
    bounces: 0,
    ricochet,
    bank,
    seek: null,
    stuck: 0,
    trail,
  });
  while (arrows.length > ARROW_MAX) removeArrow(0);
}

function releaseArrow(draw: number, ricochet: boolean) {
  nockedArrow.updateWorldMatrix(true, false);
  launchFrom.setFromMatrixPosition(nockedArrow.matrixWorld);
  const k = draw * draw; // 引ききる手前で大きく伸びる
  const speed = THREE.MathUtils.lerp(ARROW_SPEED_MIN, ARROW_SPEED_MAX, k);
  const gravity = THREE.MathUtils.lerp(ARROW_GRAVITY_MAX, ARROW_GRAVITY_MIN, k);
  // 矢は照準へ向けて射る。跳弾矢は、照準の近くに跳ねて敵に当たる所があれば、その敵を覚えておき、跳ねるときに向け直す
  const bank = ricochet ? findBankShot() : null;
  findThrowAim(launchAim);
  launchDir.subVectors(launchAim, launchFrom).normalize();
  launchArrow(launchFrom, launchDir, speed, gravity, THREE.MathUtils.lerp(ARROW_DMG_MIN, ARROW_DMG_MAX, k), ricochet, bank);
  afterRelease(draw);
}

// 3 本射ち: 照準の先へ向けてから、画面の横に広げ、1 本ずつ横と縦に散らす（跳弾の印やパッドの吸い付きは効かせない）
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const spreadQ = new THREE.Quaternion();
function releaseVolley(draw: number) {
  const k = draw * draw;
  const speed = THREE.MathUtils.lerp(ARROW_SPEED_MIN, ARROW_SPEED_MAX, k) * BOW_VOLLEY_SPEED;
  const gravity = THREE.MathUtils.lerp(ARROW_GRAVITY_MAX, ARROW_GRAVITY_MIN, k);
  const dmg = THREE.MathUtils.lerp(ARROW_DMG_MIN, ARROW_DMG_MAX, k) * BOW_VOLLEY_DMG;
  camera.getWorldDirection(launchDir);
  if (castThrow(camera.position, launchDir, BOW_VOLLEY_RANGE)) launchAim.copy(castHit.point);
  else launchAim.copy(camera.position).addScaledVector(launchDir, BOW_VOLLEY_RANGE);
  camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const jitter = () => (Math.random() * 2 - 1) * BOW_VOLLEY_JITTER;
  for (const [i, nocked] of [nockedArrow, ...volleyArrows].entries()) {
    const side = i === 0 ? 0 : (nocked.userData.side as number);
    nocked.updateWorldMatrix(true, false);
    launchFrom.setFromMatrixPosition(nocked.matrixWorld);
    launchDir.subVectors(launchAim, launchFrom).normalize();
    launchDir.applyQuaternion(spreadQ.setFromAxisAngle(camUp, -side * BOW_VOLLEY_SPREAD + jitter()));
    launchDir.applyQuaternion(spreadQ.setFromAxisAngle(camRight, jitter()));
    launchArrow(launchFrom, launchDir, speed, gravity, dmg, false, null);
  }
  afterRelease(draw);
}

function afterRelease(draw: number) {
  nockedArrow.visible = false;
  nockWait = BOW_NOCK_TIME;
  bowState.release = 1;
  kickVel.x += (0.6 + draw) * DEG * 22;
  endDrawSound();
  sfx.playBowRelease(draw);
}

function removeArrow(i: number) {
  arrows[i].mesh.removeFromParent();
  arrows[i].trail?.dispose();
  arrows.splice(i, 1);
}

const trailSide = new THREE.Vector3();
const trailA = new THREE.Vector3();
const trailB = new THREE.Vector3();
function sampleTrail(a: Arrow, at: THREE.Vector3, dir: THREE.Vector3) {
  if (!a.trail) return;
  trailSide.subVectors(at, camera.position).cross(dir);
  if (trailSide.lengthSq() < 1e-8) trailSide.set(0, 1, 0);
  trailSide.setLength(ARROW_TRAIL_WIDTH);
  trailA.copy(at).add(trailSide);
  trailB.copy(at).sub(trailSide);
  a.trail.push(trailA, trailB, clock);
}

function stickArrow(a: Arrow, at: THREE.Vector3, dir: THREE.Vector3, onEnemy: Enemy | null) {
  a.mesh.position.copy(at).addScaledVector(dir, ARROW_STICK_DEPTH - ARROW_LEN);
  a.mesh.quaternion.setFromUnitVectors(ARROW_AXIS, dir);
  sampleTrail(a, at, dir);
  a.stuck = ARROW_STUCK_WORLD;
  if (!onEnemy) return void sfx.playArrowStick();
  sfx.playArrowHit();
  setEn(onEnemy);
  // 敵に刺さったものは、刺さった部位の骨に付けて、よろめきに一緒についていく
  (castHit.part?.parent ?? en.shake).attach(a.mesh);
  a.stuck = ARROW_STUCK_ENEMY;
  hitDir.set(dir.x, 0, dir.z);
  if (hitDir.lengthSq() < 1e-6) hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
  hitDir.normalize();
  bowState.ricochetHitting = a.ricochet;
  hooks.applyHit(ARROW_HIT, at, 'bullet', undefined, false, a.dmg);
  bowState.ricochetHitting = false;
  if (!onEnemy.alive) a.stuck = 1e-3; // 砕けた敵に刺さった矢は一緒に消す
}

// 跳弾: 面で向きを折り返し、速さを少し落とす。跳ねた先の近くに見えている敵がいれば、その胸へ向け直して追いかける
// 跳弾の狙いの補助で覚えた敵がいれば、跳ねた所から見えている限り、角度を問わずその敵を選ぶ
const seekDir = new THREE.Vector3();
const seekBest = new THREE.Vector3();
const sparkDir = new THREE.Vector3();
const seekFrom = new THREE.Vector3();
function ricochetArrow(a: Arrow, at: THREE.Vector3, dir: THREE.Vector3, normal: THREE.Vector3) {
  sampleTrail(a, at, dir);
  seekFrom.copy(at).addScaledVector(normal, 0.02); // 敵が見えるかは面から少し浮かせた所から見る（面の上からだと、その面に距離 0 で当たる）
  const speed = a.vel.length() * ARROW_RICOCHET_KEEP;
  dir.reflect(normal);
  let best = ARROW_RICOCHET_SEEK;
  a.seek = null;
  if (a.bank?.alive) {
    seekDir.subVectors(enemyChest(a.bank, seekDir), at);
    const dist = seekDir.length();
    seekDir.divideScalar(dist);
    if (dist >= 0.5 && seekDir.dot(normal) > 0 && castWorld(seekFrom, seekDir, dist) >= dist - 0.3) {
      best = 0;
      seekBest.copy(seekDir);
      a.seek = a.bank;
    }
  }
  if (!a.seek) for (const e of enemies) {
    if (!e.alive) continue;
    seekDir.subVectors(enemyChest(e, seekDir), at);
    const dist = seekDir.length();
    if (dist < 0.5) continue;
    seekDir.divideScalar(dist);
    const angle = seekDir.angleTo(dir);
    if (angle >= best || seekDir.dot(normal) <= 0) continue;
    if (castWorld(seekFrom, seekDir, dist) < dist - 0.3) continue;
    best = angle;
    seekBest.copy(seekDir);
    a.seek = e;
  }
  if (a.seek) dir.copy(seekBest);
  a.vel.copy(dir).multiplyScalar(speed);
  a.dmg *= ARROW_RICOCHET_DMG;
  a.bounces++;
  a.bank = null;
  a.age = 0; // 跳ねるたびに飛べる時間を数え直す（遠くまで跳ねていっても途中で消さない）
  // 鏃を面から少し浮かせた所へ置き直す
  a.mesh.position.copy(at).addScaledVector(normal, 0.02).addScaledVector(dir, -ARROW_LEN);
  a.mesh.quaternion.setFromUnitVectors(ARROW_AXIS, dir);
  spawnSparks(at, sparkDir.copy(normal).negate(), 8, 0.6, 0.6, dir);
  sfx.playArrowRicochet();
}

// 跳ねた後は、追いかける敵の胸へ、このフレームで曲がれる分だけ向きを寄せる（重力は効かせない）
const seekWant = new THREE.Vector3();
function steerArrow(a: Arrow, dt: number) {
  const e = a.seek!;
  if (!e.alive) return void (a.seek = null);
  seekWant.subVectors(enemyChest(e, seekWant), a.mesh.position).normalize();
  const angle = a.vel.angleTo(seekWant);
  if (angle > ARROW_RICOCHET_GIVE_UP) return void (a.seek = null);
  const speed = a.vel.length();
  a.vel.normalize().lerp(seekWant, Math.min(1, (ARROW_RICOCHET_TURN * dt) / Math.max(angle, 1e-4))).setLength(speed);
}

const flyDir = new THREE.Vector3();
const tip = new THREE.Vector3();
const hitAt = new THREE.Vector3();
function updateArrows(dt: number) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.age += dt;
    if (a.trail) {
      a.trail.update(clock);
      if (a.stuck > 0 && a.trail.empty) {
        a.trail.dispose();
        a.trail = null;
      }
    }
    if (a.stuck > 0) {
      a.stuck -= dt;
      if (a.stuck <= 0) removeArrow(i);
      continue;
    }
    if (a.age > ARROW_FLY_MAX) {
      removeArrow(i);
      continue;
    }
    if (a.seek) steerArrow(a, dt);
    else a.vel.y -= a.gravity * dt;
    const step = a.vel.length() * dt;
    flyDir.copy(a.vel).normalize();
    // 鏃の先からこのフレームで進む分だけ線を伸ばし、途中で当たるものを探す（速くてもすり抜けない）
    tip.copy(a.mesh.position).addScaledVector(flyDir, ARROW_LEN);
    if (castThrow(tip, flyDir, step)) {
      hitAt.copy(castHit.point);
      if (!castHit.enemy && a.ricochet && a.bounces < ARROW_RICOCHET_MAX) {
        ricochetArrow(a, hitAt, flyDir, castHit.normal);
        continue;
      }
      stickArrow(a, hitAt, flyDir, castHit.enemy);
      continue;
    }
    a.mesh.position.addScaledVector(flyDir, step);
    a.mesh.quaternion.setFromUnitVectors(ARROW_AXIS, flyDir);
    sampleTrail(a, tip.copy(a.mesh.position).addScaledVector(flyDir, ARROW_LEN * 0.5), flyDir);
  }
}

// ---- 毎フレームの処理 ----
export function updateBow(dt: number) {
  clock += dt;
  updateArrows(dt);
  updateBowEquip(dt);

  if (nockWait > 0) {
    nockWait -= dt;
    if (nockWait <= 0) {
      nockedArrow.visible = true;
      sfx.playBowNock(); // 筈を弦に掛けた「カチ」
    }
  }

  // パッドにはホイールが無いので、ダッシュ中・ダッシュ直後の ZL は 3 本射ちにする（ZL を離すまで）
  if (bowState.aimPressed && game.usingPad && (player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW)) bowState.padVolley = true;
  if (!game.throwHeld) bowState.padVolley = false;
  const held = (shot: BowShot) =>
    shot === 'arrow' ? game.attackHeld
    : shot === 'ricochet' ? game.throwHeld && !bowState.padVolley
    : bowState.volleyHeld || (game.throwHeld && bowState.padVolley);
  // 跳弾矢が残っていないのに引こうとしたら、印を震わせて鈍い音を鳴らす
  bowState.ricochetEmptyFlash = Math.max(0, bowState.ricochetEmptyFlash - dt);
  if (bowState.aimPressed && !bowState.padVolley && bowState.ricochetStock <= 0 && bowReady() && controls.isLocked) {
    bowState.ricochetEmptyFlash = BOW_RICOCHET_EMPTY_FLASH;
    sfx.playRing(0.5, 0.25, 0.04);
  }
  bowState.aimPressed = false;

  const canDraw = bowReady() && bowEquipCaught() && controls.isLocked && nockWait <= 0;
  if (!bowState.drawing && canDraw) {
    const shot: BowShot | null = held('arrow') ? 'arrow'
      : held('ricochet') && bowState.ricochetStock > 0 ? 'ricochet'
      : held('volley') ? 'volley' : null;
    if (shot) {
      finishBowEquip();
      bowState.drawing = true;
      bowState.shot = shot;
      drawTime = 0;
      endDrawSound();
      stopDrawSound = sfx.playBowDraw();
    }
  }
  if (bowState.drawing) {
    if (!canDraw) {
      bowState.drawing = false; // 持ち替えや一時停止で引くのをやめる（射らない）
      endDrawSound();
    } else if (!held(bowState.shot)) {
      bowState.drawing = false;
      if (bowState.draw < BOW_MIN_DRAW) endDrawSound(); // 浅すぎて射らずに戻す
      else if (bowState.shot === 'volley') releaseVolley(bowState.draw);
      else {
        if (bowState.shot === 'ricochet') bowState.ricochetStock--;
        releaseArrow(bowState.draw, bowState.shot === 'ricochet');
      }
    } else {
      drawTime += dt;
    }
  }

  // 引くときは手応えのある速さで、離したら弦は一瞬で戻る
  const target = bowState.drawing ? Math.min(1, drawTime / BOW_DRAW_TIME) : 0;
  if (target > bowState.draw) bowState.draw = target;
  else bowState.draw += (target - bowState.draw) * Math.min(1, dt * 40);
  // 構えは引き始めで寄せ、射った後は少し残してから戻す
  const poseTarget = bowState.drawing ? 1 : 0;
  bowState.aimPose += (poseTarget - bowState.aimPose) * Math.min(1, dt * (poseTarget ? 10 : 5));
  const sideTarget = bowState.drawing && bowState.shot === 'volley' ? 1 : 0;
  bowState.sidePose += (sideTarget - bowState.sidePose) * Math.min(1, dt * (sideTarget ? 10 : 5));
  bowState.release = Math.max(0, bowState.release - dt * 6);

  const pull = BOW_PULL * (1 - (1 - bowState.draw) ** 2);
  stringBuzz = Math.max(0, stringBuzz - dt * 5);
  setBowDraw(bowModel, pull + Math.sin(clock * 110) * 0.012 * stringBuzz * stringBuzz);
  nockedArrow.position.set(nockRest.x - pull, nockRest.y, ARROW_Z);
  nockedArrow.rotation.z = -Math.PI / 2;
  // 取り出しの途中は、抜いた矢を右肩の後ろから弦へ滑らせる
  const nt = bowState.equipT;
  if (nt < BOW_EQUIP_NOCK_AT) {
    const k = 1 - easeOutCubic(THREE.MathUtils.clamp((nt - BOW_EQUIP_NOCK_FROM) / (BOW_EQUIP_NOCK_AT - BOW_EQUIP_NOCK_FROM), 0, 1));
    nockedArrow.position.addScaledVector(EQUIP_ARROW_FROM, k);
    nockedArrow.rotation.z += k * EQUIP_ARROW_TILT;
  }
  for (const a of volleyArrows) {
    a.visible = bowState.drawing && bowState.shot === 'volley' && nockedArrow.visible;
    a.position.copy(nockedArrow.position);
    a.rotation.z = nockedArrow.rotation.z + (a.userData.side as number) * VOLLEY_NOCK_FAN;
  }

}

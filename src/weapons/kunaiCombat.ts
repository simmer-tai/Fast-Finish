import * as THREE from 'three';
import * as sfx from '../audio.js';
import { playGrip, playRing, playSwish } from '../audio.js';
import { easeInOutCubic, easeOutBack, easeOutCubic } from '../ease.js';
import { DEG, UP, catmullRom } from '../math.js';
import { camera, controls, scene } from '../core.js';
import { REST_TIP, THROW_RANGE, createKunai } from './kunai.js';
import {
  COMBO_RESET, DASH_SLASH, GROUND_COMBO, RETURN_SWISH, SLIDE_UP, THROW_SWISH, type AttackDef, type HitDef, type Pose,
} from './kunaiAttacks.js';
import {
  LEFT_FAN_ANGLES, attackPivot, kunai, leftFanPivots, leftKunaiRest, leftKunais, leftViewModel, spinPivot, viewModel, weaponMats,
} from './viewModels.js';
import { axeState } from './axeCombat.js';
import { swordState } from './swordCombat.js';
import { SLIDE_SPIN_SWISH, TAU, gunState } from './handgunCombat.js';
import { sickleState } from './sickleCombat.js';
import {
  KUNAI_RIBBON, Ribbon, TRAIL_STEP, flightRibbonMat, makeRibbonMaterial, spinRibbonMat, taperBase,
} from '../fx/ribbons.js';
import { en, enemies, hitDir, hitPoint, setEn, type Enemy } from '../enemy/state.js';
import { castHit, castThrow, castWorld } from '../world/raycast.js';
import { player, position, velocity } from '../player/state.js';
import { ASSIST_SNAP, enemyChest, findAssistTarget } from '../player/aimAssist.js';
import { DASH_ATTACK_WINDOW, game, kickVel } from '../game/state.js';
import { keys } from '../input.js';
import { hooks } from '../game/hooks.js';

// ---- クナイ ----
// 右手の近接攻撃と斬撃の軌跡・左手の投擲・スライディング中の回し
// 本体からも読み書きする値
export const kunaiState = {
  throwPunch: 0, // 投げた左手を前へ突き出す量（1 から 0 へ戻る）
  charging: false,
  reloading: false,
  worldSlow: 1, // 今フレームの世界の時間の速さ
  worldSlowRingAge: Infinity, // スローに入ってからの時間（歪みの輪に使う）
  attack: null as AttackDef | null,
  attackTime: 0,
  attackWeight: 0,
  comboStep: 0,
  firedImpact: false,
  dashSpinTime: Infinity, // 回し始めてからの時間（回していないときは Infinity）
  firedDashSpinGrip: true,
  drawTime: Infinity, // 取り出し始めてからの時間（取り出していないときは Infinity）
};
// ---- 投擲（左手のクナイ） ----
// 右クリックを押している間、左手のクナイを寝かせて輪を中心に水平にくるくる回して溜め、
// 離すと溜めた段階の本数を投げる
export const THROW_STAGE_TIME = 0.4; // この時間ごとに投げる本数が 1 本増える（最大で左手の 3 本）
export const THROW_ORDER = [[1], [0, 2], [1, 0, 2]]; // 本数ごとに、左手のどのクナイをどの順で放つか
export const THROW_SPEED = 55;
export const THROW_STAGGER = 0.035; // 1 本ずつずらして放つ間隔
export const THROW_RELOAD = 0.45; // 投げ終えてから左手に新しいクナイが戻るまで
export const MISS_MARGIN = 0.05; // 狙った所を過ぎてもこの時間何にも当たらなければ引き返す
export const MISS_RETURN_MAX = 0.6; // 空を狙ったときなど、遠くても最長この時間で引き返す
export const STUCK_HOLD = 0.12; // 刺さったクナイが抜けて戻り始めるまで（刺さった手応えが見える最小限）
export const RETURN_SPEED = 110; // 戻ってくるときの最高速度
export const RETURN_ACCEL = 900; // 戻り始めてから最高速度へ達するまでの加速
export const RETURN_TURN = 25; // 戻る向きへ曲がる速さ（大きいほどまっすぐ手元へ向かう）
export const RETURN_ROLL = 25; // 戻ってくる間に長い軸まわりに回る速さ (rad/s)
export const CATCH_DIST = 0.5; // 左手からこの距離まで来たら受け止める
export const BLADE_TIP = 0.17; // クナイの原点（刃の付け根）から切っ先まで
export const STICK_DEPTH = 0.05; // 刺さったときに埋まる深さ
// 少しだけホーミング: 放つ瞬間に照準の近くにいた敵の胸へ、飛びながらゆるく曲がる
export const HOMING_CONE = 7 * (Math.PI / 180); // 照準からこの角度以内の敵を狙う
export const HOMING_TURN = 3; // 曲がる速さの上限 (rad/s)。55 m/s なら半径 18 m ほどの弧
export const HOMING_GIVE_UP = 60 * (Math.PI / 180); // 狙いがこれ以上横や後ろへ外れたら追うのをやめる
// 数本が続けて当たるたびに時間を止めるとカクつくので、投擲ではヒットストップを使わない
export const THROW_HIT: HitDef = { kick: [-1.5, 0, 0], knock: 140, hitStop: 0, fx: 0.7 };
// 投げたクナイが敵に刺さったら、世界（敵・敵の弾・破片）の時間だけ一瞬遅くする。プレイヤーはそのまま動ける
export const WORLD_SLOW_SCALE = 0.25;
export const WORLD_SLOW_HOLD = 0.3; // この間は遅いまま
export const WORLD_SLOW_RELEASE = 0.2; // この時間をかけて元の速さへ戻す
export const WORLD_SLOW_COOLDOWN = 0.5; // 明けてからこの間は、刺さってもかけ直さない
export const WORLD_SLOW_RING_TIME = 0.3; // 入った瞬間の歪みの輪が画面の端まで広がる時間

export const SPIN_START = Math.PI / 2 + 0.3; // 回し始めの切っ先の向き（真上から見て、前のやや右）
export const SPIN_PHASES = [0.4, 0, -0.4]; // 回すときの各クナイの角度のずれ（重なってよいので少しだけ開く）
export const SPIN_JITTER = 0.0015; // 回している間の震えの大きさ（1 段目、ローカル座標）
export const SPIN_TRAIL_STEP = 0.08; // 回転の軌跡を取る角度の刻み (rad)
export const SPIN_TRAIL_LIFE = 0.12;
export const SPIN_TRAIL_TIP = new THREE.Vector3(0, 0.175, 0); // クナイのローカル座標（切っ先に揃える）
export const SPIN_TRAIL_BASE = new THREE.Vector3(0, 0.07, 0);
export const FLIGHT_TRAIL_LIFE = 0.15;
export const FLIGHT_TRAIL_WIDTH = 0.02; // 飛んでいるクナイの軌跡の半分の幅

// （軌跡の帯は fx/ribbons.ts）
let throwClock = 0;
let chargeTime = 0;
let chargeStage = 0;
let fanSpin = 0; // 左手のクナイを輪を中心に回している角度
let fanSpinSpeed = 0;
let spinBlend = 0; // 0 = 扇の構え, 1 = 寝かせて水平に回す構え
let reloadTime = 0;
export const pendingThrows: { at: number; index: number }[] = [];
export const throwAim = new THREE.Vector3();

// 回す構え: 切っ先を水平に寝かせ、刃の平たい面を上へ向けて、縦の軸まわりに回す
// （leftViewModel の空間で組み、扇の構えと同じ leftKunaiRest の空間へ直して補間する）
export const restFanPos = leftFanPivots.map((p) => p.position.clone());
export const FAN_AXIS = new THREE.Vector3(0, 0, 1);
export const fanRestQuat = new THREE.Quaternion();
export const SPIN_LAY = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)),
);
export const leftRestInv = leftKunaiRest.quaternion.clone().invert();
leftKunaiRest.updateMatrix();
for (const k of leftKunais) k.updateMatrix();
export const spinYaw = new THREE.Quaternion();
export const spinQuat = new THREE.Quaternion();
export function fanPose(i: number, spin: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
  spinYaw.setFromAxisAngle(UP, SPIN_START + SPIN_PHASES[i] - spin);
  spinQuat.copy(leftRestInv).multiply(spinYaw).multiply(SPIN_LAY);
  // 取り出しの途中は扇を閉じて 3 本を重ねておき、開くときは少し開きすぎてから収める
  const open = drawFanOpen();
  fanRestQuat.setFromAxisAngle(FAN_AXIS, LEFT_FAN_ANGLES[i] * open);
  outQuat.slerpQuaternions(fanRestQuat, spinQuat, spinBlend);
  // 回すときは輪を 1 か所に集める（重なってよい）
  outPos.copy(restFanPos[i]).multiplyScalar(open * (1 - spinBlend));
}

// 回転の軌跡は手と一緒に動くよう leftViewModel の空間に置く
export const spinRibbons = leftKunais.map(() => {
  const r = new Ribbon(128, SPIN_TRAIL_LIFE, spinRibbonMat);
  leftViewModel.add(r.mesh);
  return r;
});
export const spinPos = new THREE.Vector3();
export const spinRot = new THREE.Quaternion();
export const spinScale = new THREE.Vector3(1, 1, 1);
export const spinPivotMat = new THREE.Matrix4();
export const spinSampleMat = new THREE.Matrix4();
export const spinTip = new THREE.Vector3();
export const spinBase = new THREE.Vector3();
export function sampleSpinTrail(i: number, spin: number, time: number) {
  fanPose(i, spin, spinPos, spinRot);
  spinPivotMat.compose(spinPos, spinRot, spinScale);
  spinSampleMat.multiplyMatrices(leftKunaiRest.matrix, spinPivotMat).multiply(leftKunais[i].matrix);
  spinTip.copy(SPIN_TRAIL_TIP).applyMatrix4(spinSampleMat);
  spinBase.copy(SPIN_TRAIL_BASE).applyMatrix4(spinSampleMat);
  spinRibbons[i].push(spinTip, spinBase, time);
}

// ---- スライディング中のクナイ回し（右手） ----
// 滑っている間は輪に掛けた指を軸に縦にくるくる回し続けて軌跡を残し、滑り終えたら勢いのまま
// 次の一周の所まで回って、少し行き過ぎてから握りに収める
export const KUNAI_SLIDE_SPIN_SPEED = 22; // rad/s（約 3.5 回転/秒）
let kunaiSlideSpin = 0; // 回した角度 (rad)
let kunaiSlideSpinPrev = 0; // 前のフレームの角度（軌跡を刻むため）
let kunaiSlideSpinVel = 0;
let kunaiSlideSpinTarget = NaN; // 回し終えて止める角度（滑っている間は未定）
// 軌跡は手と一緒に動くよう viewModel の空間に置く
export const slideSpinRibbon = new Ribbon(128, SPIN_TRAIL_LIFE, spinRibbonMat);
viewModel.add(slideSpinRibbon.mesh);
export const slideTrailTip = new THREE.Vector3();
export const slideTrailBase = new THREE.Vector3();

export function updateKunaiSlideSpin(dt: number) {
  kunaiSlideSpinPrev = kunaiSlideSpin;
  const spinning = player.sliding && kunaiReady() && !kunaiState.attack;
  if (spinning) {
    kunaiSlideSpinVel += (KUNAI_SLIDE_SPIN_SPEED - kunaiSlideSpinVel) * Math.min(1, dt * 12);
    kunaiSlideSpinTarget = NaN;
  } else if (kunaiSlideSpin !== 0 || kunaiSlideSpinVel !== 0) {
    // ハンドガンと同じく、勢いで届く先の一周の所へばねで引き寄せる
    if (Number.isNaN(kunaiSlideSpinTarget)) {
      kunaiSlideSpinTarget = Math.ceil((kunaiSlideSpin + kunaiSlideSpinVel * 0.12) / TAU) * TAU;
    }
    const target = kunaiSlideSpinTarget;
    kunaiSlideSpinVel += ((target - kunaiSlideSpin) * 500 - kunaiSlideSpinVel * 28) * dt;
    if (Math.abs(target - kunaiSlideSpin) < 0.005 && Math.abs(kunaiSlideSpinVel) < 0.2) {
      endKunaiSlideSpin();
      playGrip(); // 握り直した「チャキッ」
      return;
    }
  } else {
    return;
  }
  kunaiSlideSpin += kunaiSlideSpinVel * dt;
  // 半周ごとに小さな風切り音
  if (spinning && Math.floor(kunaiSlideSpin / Math.PI) > Math.floor(kunaiSlideSpinPrev / Math.PI)) {
    playSwish(SLIDE_SPIN_SWISH);
  }
}

export function endKunaiSlideSpin() {
  kunaiSlideSpin = 0;
  kunaiSlideSpinPrev = 0;
  kunaiSlideSpinVel = 0;
  kunaiSlideSpinTarget = NaN;
}

// applyPose の後に呼ぶ。1 フレームで大きく回るので、角度を細かく刻んで弧を滑らかにする
export function sampleKunaiSlideTrail(dt: number) {
  // 取り出しの回転も同じ軌跡で描く
  const from = kunaiSlideSpinPrev + drawSpinPrev;
  const to = kunaiSlideSpin + drawSpin;
  if (kunaiState.attack || (Math.abs(kunaiSlideSpinVel) < 3 && drawSpin === drawSpinPrev) || to === from) {
    slideSpinRibbon.cut();
  } else {
    const finalZ = spinPivot.rotation.z;
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) / SPIN_TRAIL_STEP));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      spinPivot.rotation.z = finalZ + (to - (from + (to - from) * u));
      kunai.updateWorldMatrix(true, false);
      viewModel.worldToLocal(slideTrailTip.copy(SPIN_TRAIL_TIP).applyMatrix4(kunai.matrixWorld));
      viewModel.worldToLocal(slideTrailBase.copy(SPIN_TRAIL_BASE).applyMatrix4(kunai.matrixWorld));
      slideSpinRibbon.push(slideTrailTip, slideTrailBase, game.trailNow - dt * (1 - u));
    }
    spinPivot.rotation.z = finalZ;
  }
  slideSpinRibbon.update(game.trailNow);
}

// ---- 取り出し ----
// 持ち替えたとき: 右手は下から振り上げながら、輪に掛けた指でクナイを 2 回転させ、握り込んで「チャキッ」と止める。
// 左手は少し遅れて上がり、重ねて持った 3 本を扇に開く。手の位置の動きは viewModelMotion.ts で付ける
export const KUNAI_DRAW_TIME = 0.6;
export const DRAW_SPIN_END = 0.36; // 回し終えて握る時間
export const DRAW_SPIN_TURNS = 2;
export const DRAW_FAN_AT = 0.28; // 左手の扇を開き始める時間
export const DRAW_FAN_TIME = 0.2;
let drawSpin = 0; // 取り出しで回した角度 (rad)
let drawSpinPrev = 0;
let drawSpinning = false;
let drawFiredFan = true;

export function startKunaiDraw() {
  kunaiState.drawTime = 0;
  drawSpin = 0;
  drawSpinPrev = 0;
  drawSpinning = true;
  drawFiredFan = false;
  playSwish(SLIDE_SPIN_SWISH);
}

// 扇の開き具合: 0 = 閉じて重ねている, 1 = 構え
export function drawFanOpen() {
  const t = kunaiState.drawTime;
  if (t >= DRAW_FAN_AT + DRAW_FAN_TIME) return 1;
  if (t < DRAW_FAN_AT) return 0;
  return easeOutBack((t - DRAW_FAN_AT) / DRAW_FAN_TIME);
}

export function updateKunaiDraw(dt: number) {
  if (!drawSpinning) drawSpin = 0; // 回し終えた次のフレームで戻す（ちょうど 2 回転なので見た目は変わらない）
  drawSpinPrev = drawSpin;
  if (kunaiState.drawTime >= KUNAI_DRAW_TIME) return;
  kunaiState.drawTime += dt;
  const t = kunaiState.drawTime;
  if (drawSpinning) {
    const u = Math.min(1, t / DRAW_SPIN_END);
    drawSpin = DRAW_SPIN_TURNS * TAU * easeOutCubic(u);
    if (u === 1) {
      drawSpinning = false;
      playGrip();
      kickVel.x += -0.4 * DEG * 22; // 握り込んだ手応え
    }
  }
  if (!drawFiredFan && t >= DRAW_FAN_AT) {
    drawFiredFan = true;
    playRing(1.6, 0.35, 0.1);
    playSwish(SLIDE_SPIN_SWISH);
  }
}

// 振り始めたら回すのはやめる（手の位置の動きはそのまま最後まで流す）
export function endKunaiDrawSpin() {
  drawSpinning = false;
  drawSpin = 0;
  drawSpinPrev = 0;
}

// fly: 投げて飛んでいる / stuck: 刺さっている / back: 抜けてプレイヤーの手元へ戻っている
export type ThrownPhase = 'fly' | 'stuck' | 'back';
export interface Thrown {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  age: number;
  missAt: number; // 何にも当たらなければ引き返し始める age
  phase: ThrownPhase;
  spin: number;
  trail: Ribbon | null;
  target: Enemy | null; // ホーミングで追う敵
}
export const thrown: Thrown[] = [];
export const thrownTemplate = createKunai(weaponMats);
export const throwDir = new THREE.Vector3();
export const throwFrom = new THREE.Vector3();
export const KUNAI_AXIS = new THREE.Vector3(0, 1, 0);

export function cancelCharge() {
  kunaiState.charging = false;
  fanSpinSpeed = 0;
}

// 照準の先で最初に当たる所（なければ射程の端）を狙う。手元から放っても照準へ集まるようにする
export function findThrowAim(out: THREE.Vector3) {
  // パッドでは、照準のすぐ近くに敵がいれば胸へ向けて飛ばす
  const target = findAssistTarget();
  if (target && target.angle < target.size * ASSIST_SNAP) return void out.copy(target.point);
  camera.getWorldDirection(throwDir);
  if (castThrow(camera.position, throwDir, THROW_RANGE)) out.copy(castHit.point);
  else out.copy(camera.position).addScaledVector(throwDir, THROW_RANGE);
}

// 照準から HOMING_CONE 以内で、いちばん照準に近い敵（壁の向こうは除く）
export const homingDir = new THREE.Vector3();
export const homingAim = new THREE.Vector3();
export function findHomingTarget(): Enemy | null {
  camera.getWorldDirection(homingAim);
  let best: Enemy | null = null;
  let bestAngle = HOMING_CONE;
  for (const e of enemies) {
    if (!e.alive) continue;
    homingDir.subVectors(enemyChest(e, homingDir), camera.position);
    const dist = homingDir.length();
    if (dist < 0.5 || dist > THROW_RANGE) continue;
    homingDir.divideScalar(dist);
    const angle = homingDir.angleTo(homingAim);
    if (angle >= bestAngle) continue;
    if (castWorld(camera.position, homingDir, dist) < dist - 0.3) continue;
    bestAngle = angle;
    best = e;
  }
  return best;
}

// 狙った敵の胸へ、このフレームで曲がれる分だけ向きを寄せる
export const homingWant = new THREE.Vector3();
export function steerThrown(t: Thrown, dt: number) {
  const e = t.target;
  if (!e) return;
  if (!e.alive) return void (t.target = null);
  homingWant.subVectors(enemyChest(e, homingWant), t.mesh.position).normalize();
  const angle = t.vel.angleTo(homingWant);
  if (angle > HOMING_GIVE_UP) return void (t.target = null);
  if (angle < 1e-4) return;
  const speed = t.vel.length();
  const k = Math.min(1, (HOMING_TURN * dt) / angle);
  // 今の向きから狙いの向きへ、角度で k の割合だけ回す
  homingDir.copy(t.vel).divideScalar(speed);
  homingDir.lerp(homingWant, k).normalize();
  t.vel.copy(homingDir).multiplyScalar(speed);
}

export function releaseThrow() {
  const order = THROW_ORDER[chargeStage - 1];
  kunaiState.charging = false;
  order.forEach((index, n) => pendingThrows.push({ at: throwClock + n * THROW_STAGGER, index }));
  kunaiState.reloading = true;
  reloadTime = THROW_RELOAD + (order.length - 1) * THROW_STAGGER;
}

// 飛んでいる軌跡の帯は、進む向きと視線の両方に直交する向きへ幅を持たせる
export const flightSide = new THREE.Vector3();
export const flightA = new THREE.Vector3();
export const flightB = new THREE.Vector3();
export function sampleFlightTrail(t: Thrown, at: THREE.Vector3, dir: THREE.Vector3) {
  if (!t.trail) return;
  flightSide.subVectors(at, camera.position).cross(dir);
  if (flightSide.lengthSq() < 1e-8) flightSide.set(0, 1, 0);
  flightSide.setLength(FLIGHT_TRAIL_WIDTH);
  flightA.copy(at).add(flightSide);
  flightB.copy(at).sub(flightSide);
  t.trail.push(flightA, flightB, throwClock);
}

export function launchKunai(index: number) {
  const hand = leftKunais[index];
  hand.updateWorldMatrix(true, false);
  throwFrom.setFromMatrixPosition(hand.matrixWorld);
  hand.visible = false;
  spinRibbons[index].cut();

  // 1 本ずつ、放つ瞬間の照準の先へまっすぐ飛ばす（重力も回転もなし）
  findThrowAim(throwAim);
  throwDir.subVectors(throwAim, throwFrom).normalize();

  const mesh = thrownTemplate.clone();
  mesh.position.copy(throwFrom);
  scene.add(mesh);
  const trail = new Ribbon(64, FLIGHT_TRAIL_LIFE, flightRibbonMat);
  scene.add(trail.mesh);
  const vel = throwDir.clone().multiplyScalar(THROW_SPEED);
  const target = findHomingTarget();
  let reach = throwFrom.distanceTo(throwAim);
  if (target) reach = Math.max(reach, throwFrom.distanceTo(enemyChest(target, homingWant)) * 1.2);
  const missAt = Math.min(MISS_RETURN_MAX, reach / THROW_SPEED + MISS_MARGIN);
  const t: Thrown = { mesh, vel, age: 0, missAt, phase: 'fly', spin: 0, trail, target };
  orientThrown(t, throwDir);
  sampleFlightTrail(t, throwFrom, throwDir);
  thrown.push(t);

  kunaiState.throwPunch = 1;
  kickVel.x += 1.2 * DEG * 22;
  kickVel.y += -0.6 * DEG * 22;
  sfx.playThrow(THROW_SWISH);
}

export function orientThrown(t: Thrown, dir: THREE.Vector3) {
  t.mesh.quaternion.setFromUnitVectors(KUNAI_AXIS, dir);
  t.mesh.rotateY(t.spin);
}

export function removeThrown(i: number) {
  thrown[i].mesh.removeFromParent();
  thrown[i].trail?.dispose();
  thrown.splice(i, 1);
}

export function stickThrown(t: Thrown, at: THREE.Vector3, onDummy: Enemy | null, dir: THREE.Vector3) {
  t.phase = 'stuck';
  t.age = 0;
  t.mesh.position.copy(at).addScaledVector(dir, STICK_DEPTH - BLADE_TIP);
  orientThrown(t, dir);
  sampleFlightTrail(t, at, dir);
  if (onDummy) {
    setEn(onDummy);
    // 敵に刺さったものは、刺さった部位の骨に付けて、よろめきや震えに一緒についていく
    (castHit.part?.parent ?? en.shake).attach(t.mesh);
    hitDir.set(dir.x, 0, dir.z);
    if (hitDir.lengthSq() < 1e-6) hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
    hitDir.normalize();
    hooks.applyHit(THROW_HIT, at, 'throw');
    startWorldSlow();
  } else {
    sfx.playStick(); // 壁や地面に刺さった「カッ」
  }
}

let worldSlowAge = Infinity; // 世界のスローをかけてからの時間（プレイヤーの時間で進める）

// 遅いままの間に刺さったら、残りを最大へ戻すだけ（時間は足さない）。戻りかけと明けた直後は何もしない
export function startWorldSlow() {
  if (worldSlowAge < WORLD_SLOW_HOLD) {
    worldSlowAge = 0;
  } else if (worldSlowAge >= WORLD_SLOW_HOLD + WORLD_SLOW_RELEASE + WORLD_SLOW_COOLDOWN) {
    worldSlowAge = 0;
    kunaiState.worldSlowRingAge = 0; // 輪と音は、入ったときだけ（かけ直しでは出さない）
    sfx.playWorldSlow(WORLD_SLOW_HOLD, WORLD_SLOW_RELEASE);
  }
}

// 時間を進め、世界の時間に掛ける速さを返す
export function worldSlowFactor(dt: number) {
  worldSlowAge += dt;
  kunaiState.worldSlowRingAge += dt;
  const u = THREE.MathUtils.clamp((worldSlowAge - WORLD_SLOW_HOLD) / WORLD_SLOW_RELEASE, 0, 1);
  return THREE.MathUtils.lerp(WORLD_SLOW_SCALE, 1, u * u);
}

// 刺さった所から抜く（または飛んでいる途中で引き返す）。ここからは何にも当たらず手元へ向かう
export function startReturn(t: Thrown) {
  if (t.phase === 'stuck') {
    scene.attach(t.mesh); // 敵に刺さっていたものは敵から外す（見た目の位置は保つ）
    playRing(0.9, 0.25, 0.05); // 抜けた「キン」
    t.vel.set(0, 0, 0);
  }
  t.phase = 'back';
  t.age = 0;
  if (!t.trail) {
    t.trail = new Ribbon(64, FLIGHT_TRAIL_LIFE, flightRibbonMat);
    scene.add(t.trail.mesh);
  } else {
    t.trail.cut();
  }
  playSwish(RETURN_SWISH);
}

export const catchPoint = new THREE.Vector3();
export const returnWant = new THREE.Vector3();
export const backDir = new THREE.Vector3();
export function updateReturn(t: Thrown, dt: number): boolean {
  leftKunaiRest.getWorldPosition(catchPoint);
  returnWant.subVectors(catchPoint, t.mesh.position);
  const dist = returnWant.length();
  // 動き出しはゆっくり、だんだん速く。向きは手元へ少しずつ曲げていく
  const speed = Math.min(RETURN_SPEED, t.vel.length() + RETURN_ACCEL * dt);
  returnWant.setLength(speed);
  t.vel.lerp(returnWant, Math.min(1, dt * RETURN_TURN));
  const step = t.vel.length() * dt;
  if (dist < CATCH_DIST || step >= dist) {
    playRing(1.9, 0.3, 0.04); // 受け止めた「チャキッ」
    return true;
  }
  throwDir.copy(t.vel).normalize();
  t.mesh.position.addScaledVector(throwDir, step);
  // 輪の側を先にして、引き戻されるように飛ぶ。長い軸まわりにくるくる回す
  t.spin += RETURN_ROLL * dt;
  orientThrown(t, backDir.copy(throwDir).negate());
  sampleFlightTrail(t, t.mesh.position, throwDir);
  return false;
}

export const stickPoint = new THREE.Vector3();
export function updateThrown(dt: number) {
  for (let i = thrown.length - 1; i >= 0; i--) {
    const t = thrown[i];
    t.age += dt;
    if (t.trail) {
      t.trail.update(throwClock);
      // 刺さった後、軌跡が消えきったら片付ける
      if (t.phase === 'stuck' && t.trail.empty) {
        t.trail.dispose();
        t.trail = null;
      }
    }
    if (t.phase === 'stuck') {
      if (t.age > STUCK_HOLD) startReturn(t);
      continue;
    }
    if (t.phase === 'fly' && t.age > t.missAt) startReturn(t);
    if (t.phase === 'back') {
      if (updateReturn(t, dt)) removeThrown(i);
      continue;
    }
    steerThrown(t, dt);
    const step = t.vel.length() * dt;
    throwDir.copy(t.vel).normalize();
    // 切っ先からこのフレームで進む分だけ線を伸ばし、途中で当たるものを探す（速くてもすり抜けない）
    throwFrom.copy(t.mesh.position).addScaledVector(throwDir, BLADE_TIP);
    if (castThrow(throwFrom, throwDir, step)) {
      stickPoint.copy(castHit.point);
      stickThrown(t, stickPoint, castHit.enemy, throwDir);
      continue;
    }
    t.mesh.position.addScaledVector(throwDir, step);
    orientThrown(t, throwDir);
    sampleFlightTrail(t, t.mesh.position, throwDir);
  }
}

// ---- 投擲の毎フレームの処理（左手のクナイ） ----
export function updateThrow(dt: number) {
  throwClock += dt;

  if (kunaiState.charging && !controls.isLocked) cancelCharge();
  if (game.throwHeld && controls.isLocked && !kunaiState.charging && !kunaiState.reloading && kunaiReady()) {
    kunaiState.charging = true;
    chargeTime = 0;
    chargeStage = 1;
    fanSpin = 0;
    sfx.playCharge(0);
  }
  if (kunaiState.charging) {
    chargeTime += dt;
    const stage = Math.min(THROW_ORDER.length, 1 + Math.floor(chargeTime / THROW_STAGE_TIME));
    if (stage > chargeStage) {
      // 1 段溜まるごとに高い金属音と小さな揺れで知らせる
      chargeStage = stage;
      sfx.playCharge(stage);
      hooks.addTrauma(stage === THROW_ORDER.length ? 0.06 : 0.03);
    }
    if (!game.throwHeld) releaseThrow();
  }

  // 溜めるほど速く回す。輪が半周するたびに小さく鳴らす
  spinBlend += ((kunaiState.charging ? 1 : 0) - spinBlend) * Math.min(1, dt * 35);
  const spinTarget = kunaiState.charging ? 14 + 10 * (chargeStage - 1) : 0;
  fanSpinSpeed += (spinTarget - fanSpinSpeed) * Math.min(1, dt * 20);
  const prevSpin = fanSpin;
  fanSpin += fanSpinSpeed * dt;
  if (kunaiState.charging && Math.floor(fanSpin / Math.PI) > Math.floor(prevSpin / Math.PI)) playRing(1.3, 0.25, 0.08);
  // 回している間は小刻みに震わせる（溜めるほど強く）。軌跡は fanPose から直接取るので震えない
  const jitter = kunaiState.charging ? spinBlend * SPIN_JITTER * (1 + 0.6 * (chargeStage - 1)) : 0;
  for (const [i, pivot] of leftFanPivots.entries()) {
    fanPose(i, fanSpin, pivot.position, pivot.quaternion);
    if (jitter > 0) {
      pivot.position.x += (Math.random() * 2 - 1) * jitter;
      pivot.position.y += (Math.random() * 2 - 1) * jitter;
      pivot.position.z += (Math.random() * 2 - 1) * jitter;
    }
  }

  // 回転の軌跡: 1 フレームで大きく回るので、角度を細かく刻んで弧を滑らかにする
  const spinning = spinBlend > 0.3 && fanSpinSpeed > 3;
  const steps = spinning ? Math.max(1, Math.ceil((fanSpin - prevSpin) / SPIN_TRAIL_STEP)) : 0;
  for (const [i, ribbon] of spinRibbons.entries()) {
    if (!spinning || !leftKunais[i].visible) {
      ribbon.cut();
    } else {
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        sampleSpinTrail(i, prevSpin + (fanSpin - prevSpin) * u, throwClock - dt * (1 - u));
      }
    }
    ribbon.update(throwClock);
  }

  while (pendingThrows.length > 0 && throwClock >= pendingThrows[0].at) {
    launchKunai(pendingThrows.shift()!.index);
  }

  if (kunaiState.reloading) {
    reloadTime -= dt;
    if (reloadTime <= 0) {
      // 手を下げている間に新しい 3 本へ持ち替えたことにする
      kunaiState.reloading = false;
      fanSpinSpeed = 0;
      for (const k of leftKunais) k.visible = true;
    }
  }

  updateThrown(dt);
}

// ---- 近接攻撃（クナイ） ----
// 振りはキーフレームで作る。各 key は「構えの位置」「拳の向き」「輪を中心にした回転」を持ち、
// 位置は Catmull-Rom で滑らかな弧に、向きは球面補間でつなぐ。

export const ATTACK_BUFFER = 0.25; // cancel のこの秒数前から次の入力を受け付けておく

let attackQueued = false;
let comboTimer = 0;
let firedSwishes = 0;
let firedLunge = false;
let firedRing = false;
let firedGrip = false;

export const newPose = (): Pose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), spin: 0 });
export const restPose = newPose();
// ダッシュしたときに構えたまま輪を軸に一周回す
export const DASH_SPIN_TIME = 0.32;
export const DASH_SPIN_GRIP = 0.24; // 握り直して「チャキッ」と鳴らす時間
export const fromPose = newPose(); // 攻撃を始めた瞬間の構え（そこから滑らかにつなぐ）
export const curPose = newPose();
export const tmpPose = newPose();

export function copyPose(out: Pose, p: Pose) {
  out.pos.copy(p.pos);
  out.quat.copy(p.quat);
  out.spin = p.spin;
}

export function evalAttack(def: AttackDef, t: number, out: Pose) {
  const keys = def.keys;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const e = k0.ease(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
  const kPrev = keys[Math.max(0, i - 1)];
  const kNext = keys[Math.min(keys.length - 1, i + 2)];
  catmullRom(kPrev.pos, k0.pos, k1.pos, kNext.pos, e, out.pos);
  // 切っ先の向きも曲線でつなぎ、key の所で軌跡が折れないようにする
  catmullRom(kPrev.tip, k0.tip, k1.tip, kNext.tip, e, evalTip);
  evalTip.normalize();
  out.quat.setFromUnitVectors(REST_TIP, evalTip);
  const roll = k0.roll + (k1.roll - k0.roll) * e;
  if (roll !== 0) out.quat.premultiply(evalRoll.setFromAxisAngle(evalTip, roll * DEG));
  out.spin = k0.spin + (k1.spin - k0.spin) * e;
}
export const evalTip = new THREE.Vector3();
export const evalRoll = new THREE.Quaternion();

// 溜めの key までの間に、攻撃開始時の構えから滑らかに移る
export function attackPoseAt(def: AttackDef, t: number, out: Pose) {
  evalAttack(def, t, tmpPose);
  const w = easeInOutCubic(THREE.MathUtils.clamp(t / def.keys[1].t, 0, 1));
  out.pos.lerpVectors(fromPose.pos, tmpPose.pos, w);
  out.quat.slerpQuaternions(fromPose.quat, tmpPose.quat, w);
  out.spin = fromPose.spin + (tmpPose.spin - fromPose.spin) * w;
}

export function applyPose(p: Pose) {
  attackPivot.position.copy(p.pos);
  attackPivot.quaternion.copy(p.quat);
  spinPivot.rotation.z = p.spin * DEG;
}

export function startAttack(def: AttackDef) {
  copyPose(fromPose, curPose);
  fromPose.spin = ((((fromPose.spin + 180) % 360) + 360) % 360) - 180; // 回した分を巻き戻さないように
  kunaiState.attack = def;
  kunaiState.attackTime = 0;
  attackQueued = false;
  firedSwishes = 0;
  kunaiState.firedImpact = false;
  firedLunge = false;
  firedRing = false;
  firedGrip = false;
  lastTrailSample = -Infinity;
  // ダッシュで回している途中に振ったら、回すのをやめて攻撃へつなぐ
  kunaiState.dashSpinTime = Infinity;
  kunaiState.firedDashSpinGrip = true;
  endKunaiSlideSpin();
  endKunaiDrawSpin();
}

export function chooseAttack(): AttackDef {
  if (player.sliding) return SLIDE_UP;
  if (player.dashTime > 0 || game.sinceDash < DASH_ATTACK_WINDOW) return DASH_SLASH;
  const def = GROUND_COMBO[kunaiState.comboStep];
  kunaiState.comboStep = (kunaiState.comboStep + 1) % GROUND_COMBO.length;
  return def;
}

export const lungeDir = new THREE.Vector3();

// 攻撃の踏み込み: 向いている水平の向きへ押し出す。地上は摩擦で止まるのでそのまま足すが、空中は減速しないので、
// 足し続けると振るたびに際限なく速くなる。空中では、その向きの速さが踏み込みの分に届いていないときだけ、届くまで補う
export const AIR_LUNGE_SCALE = 0.4;
export function applyLunge(amount: number) {
  camera.getWorldDirection(lungeDir);
  lungeDir.y = 0;
  if (lungeDir.lengthSq() < 1e-6) return;
  lungeDir.normalize();
  let add = amount;
  if (!player.onGround) {
    const along = velocity.x * lungeDir.x + velocity.z * lungeDir.z;
    add = Math.max(0, amount * AIR_LUNGE_SCALE - along);
  }
  velocity.x += lungeDir.x * add;
  velocity.z += lungeDir.z * add;
}

export function updateAttack(dt: number) {
  game.sinceDash += dt;
  game.trailNow += dt;

  if (game.attackPressed) {
    game.attackPressed = false;
    if (!kunaiReady()) {
      if (game.shownWeapon === 'handgun') gunState.fireQueued = true;
      else if (game.shownWeapon === 'sword') swordState.swordPressed = true;
      else if (game.shownWeapon === 'sickle') sickleState.sicklePressed = true;
      else if (game.shownWeapon === 'axe') axeState.axePressed = true;
    } else if (!kunaiState.attack) startAttack(chooseAttack());
    else if (kunaiState.attackTime >= kunaiState.attack.cancel - ATTACK_BUFFER) attackQueued = true;
  }

  if (kunaiState.attack) {
    kunaiState.attackTime += dt;
    const def = kunaiState.attack;

    while (firedSwishes < def.swishes.length && kunaiState.attackTime >= def.swishes[firedSwishes].at) {
      playSwish(def.swishes[firedSwishes++]);
    }
    if (def.ring !== undefined && !firedRing && kunaiState.attackTime >= def.ring) {
      firedRing = true;
      playRing();
    }
    if (def.grip !== undefined && !firedGrip && kunaiState.attackTime >= def.grip) {
      firedGrip = true;
      playGrip();
      kickVel.x += -0.25 * DEG * 22; // 握り込んだ手応えをカメラにもほんの少し
    }
    if (!firedLunge && kunaiState.attackTime >= def.trails[0][0]) {
      firedLunge = true;
      applyLunge(def.lunge);
    }
    if (!kunaiState.firedImpact && kunaiState.attackTime >= def.impact) {
      kunaiState.firedImpact = true;
      kickVel.x += def.kick[0] * DEG * 22;
      kickVel.y += def.kick[1] * DEG * 22;
      kickVel.z += def.kick[2] * DEG * 22;
      hooks.addTrauma(0.06);
      game.fovKick += def.fovPunch ?? 0;
      tryHitDummy(def);
    }

    if (attackQueued && kunaiState.attackTime >= def.cancel) {
      startAttack(chooseAttack());
    } else if (kunaiState.attackTime >= def.duration) {
      kunaiState.attack = null;
      comboTimer = COMBO_RESET;
    }
  } else if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) kunaiState.comboStep = 0;
  }

}

// updateAttack と updateKick の後に呼ぶ: クナイの構えと軌跡
export function updateKunaiPose(dt: number) {
  updateKunaiSlideSpin(dt);
  updateKunaiDraw(dt);
  if (kunaiState.attack) {
    sampleTrail();
    attackPoseAt(kunaiState.attack, kunaiState.attackTime, curPose);
  } else {
    copyPose(curPose, restPose);
    kunaiState.dashSpinTime += dt;
    if (kunaiState.dashSpinTime < DASH_SPIN_TIME) curPose.spin = -360 * easeOutCubic(kunaiState.dashSpinTime / DASH_SPIN_TIME);
    if (!kunaiState.firedDashSpinGrip && kunaiState.dashSpinTime >= DASH_SPIN_GRIP) {
      kunaiState.firedDashSpinGrip = true;
      playGrip();
    }
    curPose.spin -= (kunaiSlideSpin + drawSpin) / DEG;
  }
  applyPose(curPose);
  sampleKunaiSlideTrail(dt);
  updateTrailMesh();
}

// ---- 斬撃の軌跡 ----
export const TRAIL_LIFE = 0.1; // 軌跡が消えるまでの時間
export const TRAIL_MAX = 128;
// クナイのローカル座標。切っ先（0.17）からはみ出すと、縁の線が刃から離れて浮いて見えるので、ほぼ切っ先に揃える
export const TRAIL_TIP = new THREE.Vector3(0, 0.175, 0);
export const TRAIL_BASE = new THREE.Vector3(0, 0.06, 0);
export const TRAIL_BASE_THIN = new THREE.Vector3(0, 0.13, 0);
export interface TrailSample {
  tip: THREE.Vector3;
  base: THREE.Vector3;
  time: number;
}
export const trailSamples: TrailSample[] = [];
let lastTrailSample = -Infinity;

export const trailPositions = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 3), 3);
trailPositions.setUsage(THREE.DynamicDrawUsage);
export const trailFade = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2), 1);
trailFade.setUsage(THREE.DynamicDrawUsage);
export const trailSide = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 2), 1);
for (let i = 0; i < TRAIL_MAX; i++) trailSide.setX(i * 2 + 1, 1);
export const trailIndex = new THREE.BufferAttribute(new Uint16Array((TRAIL_MAX - 1) * 6), 1);
trailIndex.setUsage(THREE.DynamicDrawUsage);
export const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', trailPositions);
trailGeo.setAttribute('aFade', trailFade);
trailGeo.setAttribute('aSide', trailSide);
trailGeo.setIndex(trailIndex);
// 他の武器の軌跡と同じ帯の見た目にする
export const trailMesh = new THREE.Mesh(trailGeo, makeRibbonMaterial(KUNAI_RIBBON));
trailMesh.frustumCulled = false;
trailMesh.renderOrder = 10;
camera.add(trailMesh);

export function kunaiPointsInCamera(tip: THREE.Vector3, base: THREE.Vector3, thin: boolean) {
  kunai.updateWorldMatrix(true, false);
  camera.worldToLocal(tip.copy(TRAIL_TIP).applyMatrix4(kunai.matrixWorld));
  camera.worldToLocal(base.copy(thin ? TRAIL_BASE_THIN : TRAIL_BASE).applyMatrix4(kunai.matrixWorld));
}

export function sampleTrail() {
  if (!kunaiState.attack) return;
  for (const [from, to, thin = false] of kunaiState.attack.trails) {
    const end = Math.min(to, kunaiState.attackTime);
    for (let s = Math.max(from, lastTrailSample + TRAIL_STEP); s <= end; s += TRAIL_STEP) {
      attackPoseAt(kunaiState.attack, s, tmpSamplePose);
      applyPose(tmpSamplePose);
      const sample = trailSamples.length >= TRAIL_MAX ? trailSamples.shift()! : { tip: new THREE.Vector3(), base: new THREE.Vector3(), time: 0 };
      kunaiPointsInCamera(sample.tip, sample.base, thin);
      sample.time = game.trailNow - (kunaiState.attackTime - s);
      trailSamples.push(sample);
      lastTrailSample = s;
    }
  }
}
export const tmpSamplePose = newPose();

export function updateTrailMesh() {
  while (trailSamples.length && game.trailNow - trailSamples[0].time > TRAIL_LIFE) trailSamples.shift();
  const n = trailSamples.length;
  for (let i = 0; i < n; i++) {
    const s = trailSamples[i];
    const fade = 1 - (game.trailNow - s.time) / TRAIL_LIFE;
    const base = taperBase(s.base, s.tip, fade, KUNAI_RIBBON.taper);
    trailPositions.setXYZ(i * 2, base.x, base.y, base.z);
    trailPositions.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);
    trailFade.setX(i * 2, fade);
    trailFade.setX(i * 2 + 1, fade);
  }
  // 時間が飛んでいる所（別の振り）はつながない
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (trailSamples[i + 1].time - trailSamples[i].time > TRAIL_STEP * 1.5) continue;
    const a = i * 2;
    trailIndex.setX(idx++, a);
    trailIndex.setX(idx++, a + 1);
    trailIndex.setX(idx++, a + 2);
    trailIndex.setX(idx++, a + 1);
    trailIndex.setX(idx++, a + 3);
    trailIndex.setX(idx++, a + 2);
  }
  trailGeo.setDrawRange(0, idx);
  trailPositions.needsUpdate = true;
  trailFade.needsUpdate = true;
  trailIndex.needsUpdate = true;
}

// クナイの技が使えるのは、クナイを構えきっていて、持ち替えを頼まれていないときだけ
export const kunaiReady = () => game.shownWeapon === 'kunai' && game.wantWeapon === 'kunai' && game.holster === 0;

export const HIT_REACH = 2.2; // 敵の中心までこの距離なら当たる
export const HIT_ANGLE = 60 * DEG; // 視線からこの角度以内なら当たる

export function tryHitDummy(def: AttackDef) {
  if (!hooks.dummyInReach(HIT_REACH, HIT_ANGLE)) return;
  findHitPoint(def, hitPoint);
  hooks.applyHit(def, hitPoint, 'kunai');
}

// クナイは手元にあって敵まで届かないので、視点から切っ先を通る線が敵に当たる所を「当たった場所」にする。
// 線が敵を外れているときは、敵の輪郭のうち切っ先にいちばん近い所にする
export const hitPose = newPose();

export const hitTip = new THREE.Vector3();

export function findHitPoint(def: AttackDef, out: THREE.Vector3) {
  attackPoseAt(def, kunaiState.attackTime, hitPose);
  applyPose(hitPose);
  camera.updateMatrixWorld();
  kunai.updateWorldMatrix(true, false);
  hooks.hitPointFromTip(hitTip.copy(TRAIL_TIP).applyMatrix4(kunai.matrixWorld), out);
}

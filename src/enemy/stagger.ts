import * as THREE from 'three';
import { DEFAULT_KNOCK, en, hitDir } from './state.js';
import { AIR_TUCK, ENEMY_WALK_BOB, walkFeet } from './motion.js';
import { DEG, UP } from '../math.js';
import { DUMMY_ANKLE_Y, DUMMY_SHIN, DUMMY_THIGH } from './body.js';

// ---- 当たったときのよろめき ----
// 腰の位置、上体の反りとひねり、首、銃を構えた腕をそれぞれ別のばねで動かす。
// 首は背骨の動きに遅れてついてくるので、打たれた瞬間は頭が残り、上体が止まるときにしなって行き過ぎる。
// 腰が大きく流れたら片足を踏み出して支え、揺れが収まったら元の立ち位置へ踏み戻る。脚は 2 関節の IK で足を地面に置く
export type Spring = { x: THREE.Vector3; v: THREE.Vector3; k: number; d: number };
export const spring = (k: number, d: number): Spring => ({ x: new THREE.Vector3(), v: new THREE.Vector3(), k, d });
export function stepSpring(s: Spring, dt: number) {
  s.v.multiplyScalar(Math.max(0, 1 - s.d * dt)).addScaledVector(s.x, -s.k * dt);
  s.x.addScaledVector(s.v, dt);
}
// 行き過ぎた分を戻し、さらに外へ向かう速さも捨てる
export function clampSpring(s: Spring, max: number) {
  const len = s.x.length();
  if (len <= max) return;
  s.x.multiplyScalar(max / len);
  const out = s.v.dot(s.x) / max;
  if (out > 0) s.v.addScaledVector(s.x, -out / max);
}

// 量はどれも knock = DEFAULT_KNOCK のときのもの
export const STAGGER_PUSH = 1.1; // 腰を押し流す速さ (m/s)。低い所に当たるほど強い
export const STAGGER_SINK = 0.45; // 膝が沈む速さ (m/s)
export const STAGGER_LEAN = 2.6; // 上体が奥へ反る角速度 (rad/s)
export const STAGGER_LEAN_HIGH = 3.2; // 胸から頭に当たったときに足す反り
export const STAGGER_TWIST = 10; // 中心からずれた所に当たったときのひねり（中心からの距離 1m あたり, rad/s）
export const STAGGER_HEAD = 8; // 頭に当たったときに首を弾く角速度
export const STAGGER_GUN = 4.5; // 銃口が跳ね上がる角速度
export const STAGGER_SWING = 0.5; // 斬ったときに刃の動いた向きへ流す割合
export const HEAD_LAG = 0.8; // 背骨の角速度が急に変わった分のうち、首が逆へ残す割合
export const MAX_LEAN = 40 * DEG;
export const MAX_TWIST = 35 * DEG;
export const MAX_HEAD = 35 * DEG;
export const MAX_SHIFT = 0.32;
export const PELVIS_LEAN = 0.2; // 上体の傾きとひねりのうち腰が受け持つ割合（残りは背骨）
export const PELVIS_TWIST = 0.3;

export const staggerPush = new THREE.Vector3();
export const staggerAxis = new THREE.Vector3();
export const staggerTmp = new THREE.Vector3();
// dummy はプレイヤーの方へ向きを変えるので、ワールドの向きを体の座標へ直してから揺らす。hitDir は呼ぶ前に入れておく
export const dummyInvQ = new THREE.Quaternion();
export function staggerDummy(knock: number, at: THREE.Vector3, swing?: THREE.Vector3) {
  const p = knock / DEFAULT_KNOCK;
  staggerPush.copy(hitDir);
  if (swing) {
    staggerTmp.set(swing.x, 0, swing.z);
    if (staggerTmp.lengthSq() > 1e-6) staggerPush.addScaledVector(staggerTmp.normalize(), STAGGER_SWING);
  }
  staggerPush.y = 0;
  dummyInvQ.copy(en.root.quaternion).invert();
  staggerPush.applyQuaternion(dummyInvQ).normalize();
  const h = at.y - en.root.position.y;
  const high = THREE.MathUtils.clamp((h - 0.93) / 0.8, 0, 1); // 腰で 0、頭で 1

  addImpulse(en.pelvisSpring, staggerPush, p * STAGGER_PUSH * (1.2 - 0.6 * high));
  en.pelvisSpring.v.y -= p * STAGGER_SINK;
  staggerAxis.crossVectors(UP, staggerPush); // この軸で回すと頭が押された向きへ倒れる
  addImpulse(en.leanSpring, staggerAxis, p * (STAGGER_LEAN + STAGGER_LEAN_HIGH * high));
  // 当たった所が中心からずれているほど、押された側が奥へ回る
  staggerTmp.subVectors(at, en.root.position).applyQuaternion(dummyInvQ);
  en.twistSpring.v.y += (staggerTmp.z * staggerPush.x - staggerTmp.x * staggerPush.z) * p * STAGGER_TWIST;
  if (h > 1.55) addImpulse(en.headSpring, staggerAxis, p * STAGGER_HEAD);
  en.gunSpring.v.x -= p * STAGGER_GUN;
}
// 戻ろうとしている向きの速さは打ち消してから足す（続けて当てたときに押し返しで弱まらないように）
export function addImpulse(s: Spring, dir: THREE.Vector3, amount: number) {
  const back = s.v.dot(dir);
  if (back < 0) s.v.addScaledVector(dir, -back);
  s.v.addScaledVector(dir, amount);
}

// 足: 踏み出している間は from から to へ弧を描いて動く（t = 1 で着地している）
export type DummyFoot = { rest: THREE.Vector3; pos: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; t: number; side: number };
export const STEP_TIME = 0.16;
export const STEP_LIFT = 0.07; // 足を上げる高さ（0.15m 以上踏み出すとき）
export const STEP_START = 0.13; // 足が腰の真下からこれだけずれたら踏み出して支える（剣や締めの技で踏み出す）
export const STEP_SETTLE = 0.035; // 揺れが収まった後は、これだけずれていれば立ち位置へ踏み戻る
export const STEP_SETTLED_SPEED = 0.15; // 腰がこの速さ (m/s) より遅ければ収まったとみなす
export const STEP_LEAD = 0.12; // 腰の流れる先を読んで踏み出す時間 (s)
export const STEP_MAX = 0.4; // 立ち位置からこれより遠くへは踏み出さない
export const STEP_INNER = 0.04; // 足を体の中心線のこれより内側へは寄せない（脚が交差しないように）
export const stepIdeal = new THREE.Vector3();
export function updateDummySteps(dt: number) {
  if (en.walk > 0.01) return walkFeet(); // 歩いている間は歩きの足に任せる
  let stepping = false;
  for (const f of en.footState) {
    if (f.t >= 1) continue;
    f.t = Math.min(1, f.t + dt / STEP_TIME);
    f.pos.lerpVectors(f.from, f.to, f.t * f.t * (3 - 2 * f.t));
    f.pos.y = DUMMY_ANKLE_Y + Math.sin(Math.PI * f.t) * STEP_LIFT * Math.min(1, f.from.distanceTo(f.to) / 0.15);
    if (f.t < 1) stepping = true;
  }
  if (stepping) return; // 片足ずつ踏む

  const v = en.pelvisSpring.v;
  const settled = Math.hypot(v.x, v.z) < STEP_SETTLED_SPEED;
  const lead = settled ? 0 : STEP_LEAD;
  let best: DummyFoot | undefined;
  let bestErr = settled ? STEP_SETTLE : STEP_START;
  for (const f of en.footState) {
    const err = Math.hypot(
      f.rest.x + en.pelvisSpring.x.x + v.x * lead - f.pos.x,
      f.rest.z + en.pelvisSpring.x.z + v.z * lead - f.pos.z,
    );
    if (err > bestErr) {
      bestErr = err;
      best = f;
    }
  }
  if (!best) return;
  stepIdeal.set(en.pelvisSpring.x.x + v.x * lead, 0, en.pelvisSpring.x.z + v.z * lead);
  if (stepIdeal.length() > STEP_MAX) stepIdeal.setLength(STEP_MAX);
  best.from.copy(best.pos);
  best.to.copy(best.rest).add(stepIdeal);
  best.to.x = best.side > 0 ? Math.max(best.to.x, STEP_INNER) : Math.min(best.to.x, -STEP_INNER);
  best.t = 0;
}

// 脚の 2 関節 IK: 腰の動きに合わせて、膝を前へ曲げて足を地面の決まった所に置く。
// 足が届かないときは腰を下げる（踏み出したときに腰が沈む）
export const LEG_REACH = (DUMMY_THIGH + DUMMY_SHIN) * 0.995;
export const LEG_DOWN = new THREE.Vector3(0, -1, 0);
export const LEG_FWD = new THREE.Vector3(0, 0, 1);
export const legHip = new THREE.Vector3();
export const legAnkle = new THREE.Vector3();
export const legTo = new THREE.Vector3();
export const legBend = new THREE.Vector3();
export const legKnee = new THREE.Vector3();
export const legDir = new THREE.Vector3();
export const legThighQ = new THREE.Quaternion();
export const legShinQ = new THREE.Quaternion();
export const pelvisInv = new THREE.Matrix4();
export const legFoot = [new THREE.Vector3(), new THREE.Vector3()];
export function solveDummyLegs() {
  en.pelvis.updateMatrix();
  let drop = 0;
  for (let i = 0; i < 2; i++) {
    const f = legFoot[i].copy(en.footState[i].pos).addScaledVector(AIR_TUCK[i], en.airPose);
    legHip.copy(en.thighs[i].position).applyMatrix4(en.pelvis.matrix);
    const h = Math.hypot(legHip.x - f.x, legHip.z - f.z);
    drop = Math.max(drop, legHip.y - f.y - Math.sqrt(Math.max(0, LEG_REACH ** 2 - h * h)));
  }
  if (drop > 0) {
    en.pelvis.position.y -= drop;
    en.pelvis.updateMatrix();
  }
  // 腰の座標で解く
  pelvisInv.copy(en.pelvis.matrix).invert();
  for (let i = 0; i < 2; i++) {
    const hip = en.thighs[i].position;
    legAnkle.copy(legFoot[i]).applyMatrix4(pelvisInv);
    legTo.subVectors(legAnkle, hip);
    const d = Math.min(legTo.length(), DUMMY_THIGH + DUMMY_SHIN - 1e-4);
    legTo.normalize();
    const cosA = (DUMMY_THIGH ** 2 + d * d - DUMMY_SHIN ** 2) / (2 * DUMMY_THIGH * d);
    const a = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
    legBend.copy(LEG_FWD).addScaledVector(legTo, -LEG_FWD.dot(legTo)).normalize();
    legKnee.copy(hip).addScaledVector(legTo, Math.cos(a) * DUMMY_THIGH).addScaledVector(legBend, Math.sin(a) * DUMMY_THIGH);
    legThighQ.setFromUnitVectors(LEG_DOWN, legDir.subVectors(legKnee, hip).normalize());
    legShinQ.setFromUnitVectors(LEG_DOWN, legDir.subVectors(legAnkle, legKnee).normalize());
    en.thighs[i].quaternion.copy(legThighQ);
    en.shins[i].quaternion.copy(legThighQ).invert().multiply(legShinQ);
    // 足の裏は地面に平らなまま
    en.feet[i].quaternion.copy(en.pelvis.quaternion).multiply(legShinQ).invert();
  }
}

export const STAGGER_SUBSTEP = 1 / 120;
export const staggerQ = new THREE.Quaternion();
export function updateDummyStagger(dt: number) {
  // 首は背骨が急に動いた分だけ逆へ残る（慣性）
  staggerTmp.subVectors(en.leanSpring.v, en.prevLeanVel);
  en.headSpring.v.addScaledVector(staggerTmp, -HEAD_LAG);
  en.headSpring.v.y -= (en.twistSpring.v.y - en.prevTwistVel) * HEAD_LAG * 0.6;

  const n = Math.max(1, Math.ceil(dt / STAGGER_SUBSTEP));
  for (let i = 0; i < n; i++) for (const s of en.springs) stepSpring(s, dt / n);
  clampSpring(en.leanSpring, MAX_LEAN);
  clampSpring(en.headSpring, MAX_HEAD);
  en.twistSpring.x.y = THREE.MathUtils.clamp(en.twistSpring.x.y, -MAX_TWIST, MAX_TWIST);
  const shift = Math.hypot(en.pelvisSpring.x.x, en.pelvisSpring.x.z);
  if (shift > MAX_SHIFT) {
    en.pelvisSpring.x.x *= MAX_SHIFT / shift;
    en.pelvisSpring.x.z *= MAX_SHIFT / shift;
  }
  en.pelvisSpring.x.y = THREE.MathUtils.clamp(en.pelvisSpring.x.y, -0.15, 0.03);
  en.prevLeanVel.copy(en.leanSpring.v);
  en.prevTwistVel = en.twistSpring.v.y;

  updateDummySteps(dt);
  applyDummyPose();
}

export function setFromRotVec(q: THREE.Quaternion, v: THREE.Vector3, scale: number) {
  const a = v.length() * scale;
  return a < 1e-6 ? q.identity() : q.setFromAxisAngle(staggerTmp.copy(v).normalize(), a);
}
// ---- 体の表情 ----
// よろめきのばねに、次の姿勢を上乗せする。上乗せした傾きとひねりは銃の向きで打ち消し、狙いは保つ。
// - 立っている間: ゆっくり息をして、重心を左右へ移す（構えている間は止める）
// - 歩いている間: 腰を左右へ揺らし、肩を足と逆へひねる。速さの変わり目では進む向きへ上体を傾ける
// - 撃つ前: 腰を落とし、上体を前へ寄せ、頬を銃に付けるように首を下げる（撃つ合図になる）
export const IDLE_SWAY = 0.014; // 重心を左右へ移す幅 (m)
export const IDLE_SWAY_RATE = 1.9; // rad/s
export const IDLE_BREATH = 0.018; // 息で上体が前後する角度 (rad)
export const IDLE_BREATH_RATE = 2.3;
export const WALK_HIP_SWAY = 0.022; // 歩くときに腰が左右へ振れる幅 (m)
export const WALK_SHOULDER_TWIST = 0.09; // 歩くときに肩をひねる角度 (rad)
export const BRACE_DROP = 0.045; // 構えで腰を落とす量 (m)
export const BRACE_LEAN = 0.09; // 構えで上体を前へ寄せる角度 (rad)
export const BRACE_NECK = 0.1;
export const STUMBLE_DROP = 0.12; // 吹き飛ばされて踏ん張るときに腰を落とす量 (m)
export const STUMBLE_ARM_UP = 0.7; // 踏ん張っている間に腕が跳ね上がる角度 (rad)
export const STUMBLE_ARM_SWAY = 0.35; // 腕が左右へ振れる角度 (rad)
export const poseLeanTmp = new THREE.Vector3();
export const poseNeckTmp = new THREE.Vector3();
export function applyDummyPose() {
  const still = (1 - en.walk) * (1 - en.brace * 0.8);
  const sway = Math.sin(en.idleT * IDLE_SWAY_RATE);
  const stride = Math.sin(en.walkPhase) * en.walk;
  en.pelvis.position.copy(en.pelvis.userData.origin).add(en.pelvisSpring.x);
  en.pelvis.position.y -= Math.abs(Math.sin(en.walkPhase)) * ENEMY_WALK_BOB * en.walk + BRACE_DROP * en.brace + STUMBLE_DROP * en.stumble;
  en.pelvis.position.x += sway * IDLE_SWAY * still + en.walkDir.z * stride * WALK_HIP_SWAY;
  en.pelvis.position.z -= en.walkDir.x * stride * WALK_HIP_SWAY;
  // 上乗せする傾き（重心を移した側と逆へ上体をわずかに戻す）
  poseLeanTmp.copy(en.poseLean);
  poseLeanTmp.x += Math.sin(en.idleT * IDLE_BREATH_RATE) * IDLE_BREATH * still + BRACE_LEAN * en.brace;
  poseLeanTmp.z += sway * IDLE_SWAY * 1.5 * still;
  const twist = -stride * WALK_SHOULDER_TWIST;
  setFromRotVec(en.pelvis.quaternion, staggerTmp.copy(en.leanSpring.x).add(poseLeanTmp), PELVIS_LEAN);
  en.pelvis.quaternion.multiply(staggerQ.setFromAxisAngle(UP, en.twistSpring.x.y * PELVIS_TWIST));
  setFromRotVec(en.spine.quaternion, staggerTmp.copy(en.leanSpring.x).add(poseLeanTmp), 1 - PELVIS_LEAN);
  en.spine.quaternion.multiply(staggerQ.setFromAxisAngle(UP, en.twistSpring.x.y * (1 - PELVIS_TWIST) + twist));
  poseNeckTmp.copy(en.headSpring.x);
  poseNeckTmp.x += BRACE_NECK * en.brace - poseLeanTmp.x * 0.5; // 頭は上体ほどは傾けない
  poseNeckTmp.y -= twist;
  setFromRotVec(en.neck.quaternion, poseNeckTmp, 1);
  // 体の向きで追いきれない分は、銃と両腕を肩ごと振って狙う（負の x で銃口が上がる）。上乗せした傾きとひねりはここで打ち消す。
  // 踏ん張っている間は狙いを保てず、腕が跳ね上がって振れる
  const keep = 1 - en.stumble;
  const flail = Math.sin(en.walkPhase * 0.5 + 1) * STUMBLE_ARM_SWAY * en.stumble;
  en.gunRig.rotation.set(
    en.gunSpring.x.x - en.aimPitch * keep - poseLeanTmp.x * keep - STUMBLE_ARM_UP * en.stumble,
    en.aimYaw * keep - twist + flail,
    -poseLeanTmp.z * keep + flail * 0.5,
    'YXZ',
  );
  solveDummyLegs();
}

export function resetDummyStagger() {
  for (const s of en.springs) {
    s.x.set(0, 0, 0);
    s.v.set(0, 0, 0);
  }
  en.prevLeanVel.set(0, 0, 0);
  en.prevTwistVel = 0;
  en.poseLean.set(0, 0, 0);
  en.prevVel.set(0, 0, 0);
  en.brace = 0;
  en.dodgeT = 0;
  en.stumble = 0;
  en.stumbling = false;
  for (const f of en.footState) {
    f.pos.copy(f.rest);
    f.t = 1;
  }
  applyDummyPose();
}

export function isOnDummy(o: THREE.Object3D) {
  for (let p = o.parent; p; p = p.parent) if (p === en.root) return true;
  return false;
}

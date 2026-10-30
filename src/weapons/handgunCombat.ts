import * as THREE from 'three';
import * as sfx from '../audio.js';
import { playRing, playSwish } from '../audio.js';
import { easeInOutCubic, easeInQuad, easeOutBack, easeOutCubic, type Ease } from '../ease.js';
import { DEG, catmullRom, wrapAngle } from '../math.js';
import { camera, controls, scene } from '../core.js';
import { createRound } from './revolver.js';
import { type HitDef, type SwishDef, type V3 } from './kunaiAttacks.js';
import { gunSpin, revolver, weaponMats } from './viewModels.js';
import { FOCUS_EMPTY_FLASH, lockTo, swordState } from './swordCombat.js';
import { impact, spawnSparks } from '../fx/hitFx.js';
import { addGlow } from '../fx/glow.js';
import { hitWithArcs, spawnMuzzleArcs } from '../fx/arcs.js';
import { onSkinChange, skinFx, skinOf, type SkinTrail } from './skins.js';
import { en, hitDir, setEn, type Enemy } from '../enemy/state.js';
import { floorAt } from '../world/blocks.js';
import { castHit, castThrow } from '../world/raycast.js';
import { bossAlive, type BossLimb, type BossPart } from '../enemy/boss.js';
import { lookEuler, player, position, velocity } from '../player/state.js';
import { ASSIST_SNAP, findAssistTarget } from '../player/aimAssist.js';
import { DEADEYE_MAX, game, kickVel } from '../game/state.js';
import { hooks } from '../game/hooks.js';

// ---- ハンドガン ----
// 射撃・装填・ガンスピン・デッドアイ・落ちた薬莢
export const GUN_AMMO = 6; // 弾倉に入る弾の数

// 本体からも読み書きする値
// 回す音はスキンが替えることがある
const gunSwish = () => skinOf('handgun').swish ?? 'gun';

export const gunState = {
  gunAmmo: GUN_AMMO,
  gunCooldown: 0,
  gunRecoil: 0, // 撃った瞬間に 1 にして、頂点で一瞬止めてから重たく戻す
  gunRecoilHold: 0,
  fireQueued: false,
  reloadQueued: false,
  cylinderTarget: 0,
  cylinderSpin: 0, // 装填の最後に指で弾いて空回しする速さ (rad/s)
  muzzleFlashAge: Infinity,
  twirlT: -1, // 回している間の経過時間。負なら回していない
  drawT: -1, // 取り出しの経過時間。負なら取り出していない
  gunReloading: false,
  gunReloadT: 0,
  reloadEvent: 0,
  deadEyePressed: false, // 右クリックを押した瞬間
  deadEyeBlend: 0, // 画面を暗くし、視野を狭める効き (0〜1)
};

// ---- ハンドガンの射撃 ----
// 左クリックで 1 発ずつ撃つ。弾は銃口から照準の先へまっすぐ飛ぶ速い弾で、光の尾（曳光）を引く
export const GUN_FIRE_INTERVAL = 0.26; // 連射の最短間隔。一発ごとの重さが伝わるよう、少し間を空ける
export const BULLET_SPEED = 220; // m/s
export const BULLET_RANGE = 250;
export const TRACER_LEN = 3; // 光の尾の最大の長さ (m)
export const TRACER_WIDTH = 0.012;
export const MUZZLE_FLASH_LIFE = 0.06;
export const GUN_RECOIL_HOLD = 0.035; // 跳ね上がった頂点で一瞬止める時間。重い一撃の「溜め」になる
export const BULLET_HIT: HitDef = { kick: [-0.8, 0, 0], knock: 80, hitStop: 0.025, fx: 0.55 };

export const chamberLive = Array<boolean>(6).fill(true); // 薬室ごとに、まだ撃っていない弾が入っているか

export const gunMuzzle = revolver.userData.muzzle as THREE.Object3D;
export const gunCylinder = revolver.userData.cylinder as THREE.Group;
export const gunCrane = revolver.userData.crane as THREE.Group;
export const gunEjector = revolver.userData.ejectorRod as THREE.Mesh;
export const chamberRounds = revolver.userData.chamberRounds as THREE.Group[];
export const speedLoader = revolver.userData.loader as THREE.Group;
export const loaderRounds = revolver.userData.loaderRounds as THREE.Group[];
export const CYL_REAR = (revolver.userData.cylLen as number) / 2;
export const EJECTOR_Z = gunEjector.position.z;
export const CHAMBER_STEP = Math.PI / 3;
export const gunReady = () => game.shownWeapon === 'handgun' && game.wantWeapon === 'handgun' && game.holster === 0;

// マズルフラッシュ: 銃口の正面に丸い光、銃身の向きに沿って前へ伸びる十字の光
export function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,235,1)');
  grad.addColorStop(0.25, 'rgba(255,215,130,0.9)');
  grad.addColorStop(0.6, 'rgba(255,150,50,0.35)');
  grad.addColorStop(1, 'rgba(255,110,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export const flashMat = new THREE.MeshBasicMaterial({
  map: makeFlashTexture(),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
export const muzzleFlash = new THREE.Group();
{
  muzzleFlash.add(new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), flashMat));
  for (const r of [0, Math.PI / 2]) {
    const long = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.2), flashMat);
    long.rotation.set(-Math.PI / 2, r, 0, 'ZXY'); // 長い向きを銃身（-Z）に合わせる
    long.position.z = -0.08;
    muzzleFlash.add(long);
  }
}
muzzleFlash.visible = false;
gunMuzzle.add(muzzleFlash);
// 弾の光の尾の色を持つスキン（爪）は、マズルフラッシュもその色に寄せる
const tintFlash = () => {
  const trail = skinOf('handgun').trail;
  flashMat.color.setHex(trail ? trail.core : 0xffffff);
};
tintFlash();
onSkinChange((id) => id === 'handgun' && tintFlash());

export interface Bullet {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  traveled: number;
  tail: number;
  hit: boolean;
  mesh: THREE.Mesh;
  parried?: boolean; // パリィで弾き返した弾（遅く太く白く飛び、当たると大きく効く）
  batted?: boolean; // バットで打ち返した弾（さらに速く太く飛び、当たれば一撃で倒す）
  from?: Enemy; // 撃った敵（パリィで弾き返す先）
  bossPart?: BossLimb; // ボスの砲から撃った弾なら、その腕（パリィで弾き返す先）
  remoteVisual?: boolean; // ホストが判定する弾の参加者側の表示
  networkId?: number;
  // 敵の弾の種類ごとの違い（省けば銃撃役の弾）
  speed?: number; // m/s
  damage?: number;
  tracerLen?: number;
  tracerWidth?: number;
  deadEye?: boolean; // デッドアイで撃った弾
  // 撃った瞬間にクロスヘアが捉えていた敵と、そこまでの距離。銃口はクロスヘアから少しずれているので、
  // 体の縁を狙うと銃口からの線では体をかすめることがある。その所まで何にも当たらずに来たら、この敵に当てる
  aimEnemy?: Enemy;
  aimDist?: number;
}
export const bullets: Bullet[] = [];
export const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5); // 原点から +Z へ伸びる
export const tracerMat = new THREE.MeshBasicMaterial({
  color: 0xffe0a0,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
export const TRACER_AXIS = new THREE.Vector3(0, 0, 1);
// スキンの色の光の尾。白い背景でも見えるよう、足さずに重ねる（色ごとに 1 つ作って使い回す）。
// 芯の色より一段明るい赤の尾の中に、白に近い細い芯を通す
const SKIN_TRACER_CORE = 0.35; // 芯の太さ（尾の太さに対する割合）
const SKIN_TRACER_GLOW = 1.6; // にじみの濃さ
const skinTracerMats = new Map<number, THREE.MeshBasicMaterial>();
const skinTracerMat = (trail: SkinTrail) => {
  let mat = skinTracerMats.get(trail.body);
  if (!mat) {
    const color = new THREE.Color(trail.core).offsetHSL(0, 0, 0.12);
    skinTracerMats.set(trail.body, (mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })));
  }
  return mat;
};
const skinTracerCoreMat = new THREE.MeshBasicMaterial({ color: 0xffe2e2, transparent: true, depthWrite: false });
export const bulletFrom = new THREE.Vector3();
export const bulletAim = new THREE.Vector3();
export const bulletBack = new THREE.Vector3();
export const gunAimDir = new THREE.Vector3();

// 照準の先で最初に当たる所（なければ射程の端）を out に入れ、当たる敵を返す。
// パッドでは照準のすぐ近くに敵がいれば胸を狙う
export function findGunAim(out: THREE.Vector3): Enemy | null {
  const target = findAssistTarget();
  if (target && target.angle < target.size * ASSIST_SNAP) {
    out.copy(target.point);
    return target.enemy;
  }
  camera.getWorldDirection(gunAimDir);
  if (castThrow(camera.position, gunAimDir, BULLET_RANGE)) {
    out.copy(castHit.point);
    return castHit.enemy;
  }
  out.copy(camera.position).addScaledVector(gunAimDir, BULLET_RANGE);
  return null;
}

// at を渡すとそこへ向けて撃つ（デッドアイ。target はその敵）。省くと照準の先へ
export function fireGun(at?: THREE.Vector3, target?: Enemy) {
  // 回している途中でも、撃てば即座に構え直す
  if (gunState.twirlT >= 0) endTwirl(false);
  if (gunState.drawT >= 0) endGunDraw();
  endSlideSpin();
  slideSpinHold = SLIDE_SPIN_HOLD;
  gunState.gunAmmo--;
  gunState.gunCooldown = GUN_FIRE_INTERVAL;

  // 画面のクロスヘアは揺れと反動を足した向きを指しているので、狙いも銃口もその向きで求める
  hooks.applyCameraOffset();
  camera.updateMatrixWorld(true);
  bulletFrom.setFromMatrixPosition(gunMuzzle.matrixWorld);
  let aimEnemy: Enemy | null = target ?? null;
  if (at) bulletAim.copy(at);
  else aimEnemy = findGunAim(bulletAim);
  hooks.restoreCameraOffset();
  camera.updateMatrixWorld(true);
  const aimDist = bulletFrom.distanceTo(bulletAim);
  const dir = bulletAim.sub(bulletFrom).normalize().clone();
  const trail = skinOf('handgun').trail;
  const mesh = new THREE.Mesh(tracerGeo, trail ? skinTracerMat(trail) : tracerMat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  if (trail) {
    const core = new THREE.Mesh(tracerGeo, skinTracerCoreMat);
    core.scale.set(SKIN_TRACER_CORE, SKIN_TRACER_CORE, 1);
    core.renderOrder = 1; // 尾の後に描いて、尾の中から透けて見せる
    mesh.add(core);
    if (trail.glow) addGlow(mesh, trail.body).strength = SKIN_TRACER_GLOW; // 弾が消えて尾がシーンから外れたら、にじみの登録も外れる
  }
  skinFx.flare = 1; // スキンの飾りを光らせる
  // 稲妻を出すスキンは、マズルフラッシュに放電を交える
  const arc = skinOf('handgun').arc;
  if (arc) spawnMuzzleArcs(gunMuzzle, arc);
  bullets.push({
    pos: bulletFrom.clone(), dir, traveled: 0, tail: 0, hit: false, mesh, deadEye: !!at,
    aimEnemy: aimEnemy ?? undefined, aimDist,
  });

  // 反動: 銃を跳ね上げ、視点も少し上へ蹴る
  gunState.gunRecoil = 1;
  gunState.gunRecoilHold = GUN_RECOIL_HOLD;
  kickVel.x += 3.6 * DEG * 22;
  kickVel.y += (Math.random() - 0.5) * 0.8 * DEG * 22;
  hooks.addTrauma(0.13);
  game.fovKick = Math.max(game.fovKick, 3);

  gunState.muzzleFlashAge = 0;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  muzzleFlash.scale.setScalar(1.1 + Math.random() * 0.4);
  // 銃身の真後ろ（いちばん上）にある薬室を撃ったことにして、次の薬室へ回す
  const top = (((-Math.round(gunState.cylinderTarget / CHAMBER_STEP)) % 6) + 6) % 6;
  chamberLive[top] = false;
  gunState.cylinderTarget += CHAMBER_STEP;
  sfx.playGunshot();
}

// ---- 装填 ----
// 手首を返してシリンダーを振り出す → 銃口を上へ向けてエジェクターロッドを押し、薬莢をまとめて落とす
// → 銃口を下へ向けてスピードローダーで 6 発を一度に差し込む → シリンダーを指で弾いて空回しし、
// 手首のスナップで閉じる
export interface GunKey { t: number; pos: V3; rot: V3; ease?: Ease } // pos: 構えからのずれ (m)、rot: 上下・左右・傾き（度）
export const RELOAD_KEYS = [
  { t: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
  { t: 0.12, pos: [-0.03, 0.01, 0.01], rot: [10, 8, 42] }, // 傾けながら振り出す
  { t: 0.24, pos: [-0.04, 0.015, 0], rot: [18, 10, 52] },
  { t: 0.36, pos: [-0.05, 0.045, 0.02], rot: [72, 10, 22] }, // 銃口を上へ
  { t: 0.5, pos: [-0.05, 0.05, 0.02], rot: [76, 10, 20] },
  { t: 0.64, pos: [-0.06, -0.02, -0.01], rot: [-42, 15, 34] }, // 銃口を下へ
  { t: 0.84, pos: [-0.06, -0.026, -0.01], rot: [-48, 15, 34] },
  { t: 0.88, pos: [-0.06, -0.035, -0.01], rot: [-52, 15, 34] }, // 差し込んだ勢いで沈む
  { t: 1.0, pos: [-0.045, 0, 0], rot: [-5, 10, 46] },
  { t: 1.1, pos: [-0.015, 0.012, 0], rot: [6, 3, -8] }, // スナップで閉じる
  { t: 1.32, pos: [0, 0, 0], rot: [0, 0, 0] },
].map((k): { t: number; pos: THREE.Vector3; rot: THREE.Vector3; ease: Ease } => ({
  t: k.t,
  pos: new THREE.Vector3(...(k.pos as V3)),
  rot: new THREE.Vector3(...(k.rot as V3)),
  ease: (k as GunKey).ease ?? easeInOutCubic,
}));
export const GUN_RELOAD_TIME = RELOAD_KEYS[RELOAD_KEYS.length - 1].t;
export const CRANE_OPEN = 105 * DEG;

// 装填の途中で一度だけ起こす出来事（時間順）
export const RELOAD_EVENTS: { at: number; fn: () => void }[] = [
  { at: 0.13, fn: onCraneOpen },
  { at: 0.42, fn: ejectCasings },
  { at: 0.84, fn: seatSpeedLoader },
  { at: 0.88, fn: sfx.playLoaderRelease }, // つまみをひねって弾を放す
  { at: 0.95, fn: spinCylinder },
  { at: 1.06, fn: onCraneClose },
  { at: 1.12, fn: startTwirl }, // 閉じたスナップの勢いのまま、トリガーを軸に縦に一回転
];

// ---- 装填後のガンスピン ----
// 銃口を下へ振り出すように素早く回し始め、一周したところで少し行き過ぎてから握りに収める
export const TWIRL_TIME = 0.5;
export const DASH_TWIRL_TIME = 0.38;
let twirlDuration = TWIRL_TIME;
export function startTwirl(duration = TWIRL_TIME) {
  gunState.twirlT = 0;
  twirlDuration = duration;
  // 速く回すほど風切り音も短く高く
  const k = TWIRL_TIME / duration;
  playSwish({ at: 0, dur: 0.32 / k, f0: 500 * k, f1: 1700 * k, gain: 0.12 }, gunSwish());
}
export function updateTwirl(dt: number) {
  if (gunState.twirlT < 0) return;
  gunState.twirlT += dt;
  const u = Math.min(1, gunState.twirlT / twirlDuration);
  twirlAngle = -Math.PI * 2 * easeOutBack(u);
  // 回している間は銃を少し持ち上げて前へ出し、指先で回している感じを出す
  const lift = Math.sin(u * Math.PI);
  gunSpin.position.set(0, lift * 0.015, -lift * 0.01);
  if (u >= 1) endTwirl(true);
}
// ---- スライディング中のガンスピン ----
// 滑っている間はトリガーに掛けた指を軸に水平にくるくる回し続け、滑り終えたら勢いのまま
// 次の一周の所まで回って、少し行き過ぎてから握りに収める
export const SLIDE_SPIN_SPEED = 17; // rad/s（約 2.7 回転/秒）
export const SLIDE_SPIN_HOLD = 0.5; // 撃った後、この時間は回し始めない（撃ちながら滑れるように）
export const SLIDE_SPIN_SWISH: SwishDef = { at: 0, dur: 0.12, f0: 700, f1: 1500, gain: 0.05 };
export const TAU = Math.PI * 2;
let slideSpin = 0; // 回した角度
let slideSpinVel = 0;
let slideSpinHold = 0;
let slideSpinTarget = NaN; // 回し終えて止める角度（滑っている間は未定）
let twirlAngle = 0; // 装填後の縦回転の角度
// 回すときは銃を横倒しに寝かせる（左の側面が上、グリップが画面の内側）。
// 寝かせるとトリガーに掛けた指が縦になるので、水平の回転がそのまま指を軸にした回転になる
export const SLIDE_LAY_ANGLE = -90 * DEG;
let slideLay = 0; // 0 = 構え, 1 = 寝かせきった
export const gunSpinQuat = new THREE.Quaternion();
export const gunSpinTmp = new THREE.Quaternion();
export const gunSpinEuler = new THREE.Euler();
export function applyGunSpin(dt: number) {
  const laying = slideSpinVel !== 0 && Number.isNaN(slideSpinTarget); // 回している間は寝かせ、収めながら起こす
  slideLay += ((laying ? 1 : 0) - slideLay) * Math.min(1, dt * (laying ? 16 : 10));
  // 水平の回転 → 寝かせ → 縦回転 の順に重ねる
  gunSpinQuat.setFromEuler(gunSpinEuler.set(0, slideSpin, 0));
  gunSpinQuat.multiply(gunSpinTmp.setFromEuler(gunSpinEuler.set(0, 0, SLIDE_LAY_ANGLE * slideLay)));
  gunSpinQuat.multiply(gunSpinTmp.setFromEuler(gunSpinEuler.set(twirlAngle, 0, 0)));
  gunSpin.quaternion.copy(gunSpinQuat);
}
export function updateSlideSpin(dt: number) {
  slideSpinHold = Math.max(0, slideSpinHold - dt);
  const spinning = player.sliding && gunReady() && !gunState.gunReloading && gunState.twirlT < 0 && gunState.drawT < 0 && slideSpinHold <= 0;
  if (spinning) {
    slideSpinVel += (SLIDE_SPIN_SPEED - slideSpinVel) * Math.min(1, dt * 12);
    slideSpinTarget = NaN;
  } else if (slideSpin !== 0 || slideSpinVel !== 0) {
    // 勢いで届く先の一周の所へ、ばねで引き寄せる（少し行き過ぎて戻る）。
    // 行き過ぎたときに次の一周を狙い直さないよう、止める所は回し終えた瞬間に決める
    if (Number.isNaN(slideSpinTarget)) slideSpinTarget = Math.ceil((slideSpin + slideSpinVel * 0.12) / TAU) * TAU;
    const target = slideSpinTarget;
    slideSpinVel += ((target - slideSpin) * 500 - slideSpinVel * 28) * dt;
    if (Math.abs(target - slideSpin) < 0.005 && Math.abs(slideSpinVel) < 0.2) {
      endSlideSpin();
      playRing(1.3, 0.35, 0.04); // 握りに収まった「パシッ」
      return;
    }
  } else {
    return;
  }
  const prev = slideSpin;
  slideSpin += slideSpinVel * dt;
  // 半周ごとに小さな風切り音
  if (spinning && Math.floor(slideSpin / Math.PI) > Math.floor(prev / Math.PI)) playSwish(SLIDE_SPIN_SWISH, gunSwish());
}
export function endSlideSpin() {
  slideSpin = 0;
  slideSpinVel = 0;
  slideSpinTarget = NaN;
  slideLay = 0; // 撃ったときは寝かせた銃もすぐ起こす
}

export function endTwirl(caught: boolean) {
  gunState.twirlT = -1;
  twirlAngle = 0;
  gunSpin.position.set(0, 0, 0);
  if (caught) {
    playRing(1.3, 0.35, 0.04); // 握りに収まった「パシッ」
    kickVel.x -= 0.6 * DEG * 22;
  }
}

export const reloadPosOff = new THREE.Vector3();
export const reloadRotOff = new THREE.Vector3();

export const ramp = (t: number, a: number, b: number, ease: Ease = easeInOutCubic) => ease(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));

export function evalReloadPose(t: number) {
  evalGunKeys(RELOAD_KEYS, t);
}

// キーフレームの t の姿勢を reloadPosOff / reloadRotOff に入れる（装填と取り出しで使う）
export function evalGunKeys(keys: typeof RELOAD_KEYS, t: number) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const e = k0.ease(THREE.MathUtils.clamp((t - k0.t) / (k1.t - k0.t), 0, 1));
  const kPrev = keys[Math.max(0, i - 1)];
  const kNext = keys[Math.min(keys.length - 1, i + 2)];
  catmullRom(kPrev.pos, k0.pos, k1.pos, kNext.pos, e, reloadPosOff);
  catmullRom(kPrev.rot, k0.rot, k1.rot, kNext.rot, e, reloadRotOff);
}

// 装填の時間 t に合わせて、クレーン・エジェクター・スピードローダーを動かす
export function poseReloadParts(t: number) {
  const swing = ramp(t, 0.1, 0.22, easeOutBack) - ramp(t, 1.0, 1.07, easeInQuad);
  gunCrane.rotation.z = swing * CRANE_OPEN;

  const eject = ramp(t, 0.38, 0.42, easeOutCubic) - ramp(t, 0.46, 0.58);
  gunEjector.position.z = EJECTOR_Z + eject * 0.022;
  for (const r of chamberRounds) r.position.z = CYL_REAR + eject * 0.022;

  const inT = ramp(t, 0.6, 0.84, easeOutCubic);
  const outT = ramp(t, 0.9, 1.04, easeInQuad);
  speedLoader.visible = t > 0.6 && t < 1.04;
  speedLoader.position.z = CYL_REAR + (1 - inT) * 0.07 + outT * 0.12;
  speedLoader.position.x = gunCylinder.position.x + (1 - inT) * 0.015;
  speedLoader.rotation.z = gunCylinder.rotation.z + ramp(t, 0.86, 0.9) * 0.5;
}

// ---- 取り出し ----
// 腰のホルスターから銃口を下へ向けたまま抜き、画面の右下から振り上げる。
// 振り上げる勢いでトリガーに掛けた指を軸に縦に 2 回転させ、同時にシリンダーを親指で弾いて空回しする。
// 回し終えたら少し沈んで握りに収め、空回しを止めて薬室を合わせる
export const DRAW_KEYS = [
  { t: 0, pos: [0.08, -0.28, 0.08], rot: [-75, 30, -55], ease: easeOutCubic }, // ホルスターから抜いた所
  { t: 0.13, pos: [0.025, -0.05, 0.02], rot: [-15, 12, -28] }, // 振り上げる
  { t: 0.32, pos: [-0.012, 0.03, -0.012], rot: [10, -5, 14] }, // 回しながら持ち上げ、内側へ行き過ぎる
  { t: 0.44, pos: [0.004, -0.014, 0.004], rot: [-6, 2, -4] }, // 握りに収めた勢いで沈む
  { t: 0.62, pos: [0, 0, 0], rot: [0, 0, 0] },
].map((k): { t: number; pos: THREE.Vector3; rot: THREE.Vector3; ease: Ease } => ({
  t: k.t,
  pos: new THREE.Vector3(...(k.pos as V3)),
  rot: new THREE.Vector3(...(k.rot as V3)),
  ease: (k as GunKey).ease ?? easeInOutCubic,
}));
export const GUN_DRAW_TIME = DRAW_KEYS[DRAW_KEYS.length - 1].t;
export const DRAW_SPIN_START = 0.05;
export const DRAW_SPIN_END = 0.42; // ここで握りに収める
export const DRAW_SPINS = 2;
export const DRAW_SPIN_SWISH: SwishDef = { at: 0, dur: 0.34, f0: 600, f1: 2000, gain: 0.13 };

// 時間順に一度だけ起こす出来事
export const DRAW_EVENTS: { at: number; fn: () => void }[] = [
  { at: DRAW_SPIN_START, fn: () => playSwish(DRAW_SPIN_SWISH, gunSwish()) },
  { at: 0.08, fn: spinCylinder },
  { at: DRAW_SPIN_END, fn: catchDrawnGun },
];
let drawEvent = 0;

export function startGunDraw() {
  if (gunState.twirlT >= 0) endTwirl(false);
  endSlideSpin();
  gunState.drawT = 0;
  drawEvent = 0;
  evalGunKeys(DRAW_KEYS, 0);
  twirlAngle = 0;
}

export function updateGunDraw(dt: number) {
  if (gunState.drawT < 0) return;
  gunState.drawT += dt;
  const t = gunState.drawT;
  while (drawEvent < DRAW_EVENTS.length && t >= DRAW_EVENTS[drawEvent].at) DRAW_EVENTS[drawEvent++].fn();
  if (t >= GUN_DRAW_TIME) {
    endGunDraw();
    return;
  }
  evalGunKeys(DRAW_KEYS, t);
  // 勢いよく回し始め、収める直前にゆるめる
  twirlAngle = -Math.PI * 2 * DRAW_SPINS * easeOutCubic(THREE.MathUtils.clamp((t - DRAW_SPIN_START) / (DRAW_SPIN_END - DRAW_SPIN_START), 0, 1));
}

function catchDrawnGun() {
  // 空回しを止めて、次の薬室の位置にぴたりと合わせる
  gunState.cylinderSpin = 0;
  gunState.cylinderTarget = Math.ceil(gunCylinder.rotation.z / CHAMBER_STEP) * CHAMBER_STEP;
  sfx.playGrip();
  playRing(1.3, 0.35, 0.04);
  kickVel.x -= 0.8 * DEG * 22;
  kickVel.z -= 1 * DEG * 22;
  hooks.addTrauma(0.03);
}

export function endGunDraw() {
  if (gunState.drawT >= 0 && gunState.cylinderSpin > 0) {
    // 収める前に打ち切ったときも、空回しは止めて薬室を合わせる
    gunState.cylinderSpin = 0;
    gunState.cylinderTarget = Math.ceil(gunCylinder.rotation.z / CHAMBER_STEP) * CHAMBER_STEP;
  }
  gunState.drawT = -1;
  twirlAngle = 0;
  reloadPosOff.set(0, 0, 0);
  reloadRotOff.set(0, 0, 0);
}

export function startReload() {
  if (gunState.drawT >= 0) endGunDraw();
  gunState.gunReloading = true;
  gunState.gunReloadT = 0;
  gunState.reloadEvent = 0;
  gunState.fireQueued = false;
  for (const r of loaderRounds) r.visible = true;
}

export function endReload() {
  gunState.gunReloading = false;
  reloadPosOff.set(0, 0, 0);
  reloadRotOff.set(0, 0, 0);
  poseReloadParts(0);
  speedLoader.visible = false;
  if (gunState.cylinderSpin > 0) {
    gunState.cylinderSpin = 0;
    gunState.cylinderTarget = Math.ceil(gunCylinder.rotation.z / CHAMBER_STEP) * CHAMBER_STEP;
  }
}

export function onCraneOpen() {
  sfx.playCraneOpen();
  kickVel.z += 1.2 * DEG * 22;
}

// エジェクターロッドで押し出した薬莢を、今の位置と向きのまま世界へ放り出す
export const casingPos = new THREE.Vector3();
export const casingQuat = new THREE.Quaternion();
export const casingScale = new THREE.Vector3();
export const gunBack = new THREE.Vector3();
export function ejectCasings() {
  revolver.updateWorldMatrix(true, true);
  gunBack.set(0, 0, 1).transformDirection(revolver.matrixWorld); // 銃の後ろ向き（今は真下に近い）
  for (const [i, r] of chamberRounds.entries()) {
    r.matrixWorld.decompose(casingPos, casingQuat, casingScale);
    const vel = gunBack.clone().multiplyScalar(1.2 + Math.random() * 0.8).add(velocity);
    vel.x += (Math.random() - 0.5) * 0.6;
    vel.z += (Math.random() - 0.5) * 0.6;
    spawnCasing(chamberLive[i], casingPos, casingQuat, vel);
    r.visible = false;
  }
  gunState.gunAmmo = 0;
  sfx.playEject();
  kickVel.x += 0.8 * DEG * 22;
}

export function seatSpeedLoader() {
  for (const [i, r] of chamberRounds.entries()) {
    r.visible = true;
    chamberLive[i] = true;
  }
  for (const r of loaderRounds) r.visible = false;
  gunState.gunAmmo = GUN_AMMO;
  sfx.playSeat();
  kickVel.x -= 1 * DEG * 22;
}

// 指で弾いてシリンダーを空回しする（ラチェットのカリカリ音つき）
export function spinCylinder() {
  gunState.cylinderSpin = 32;
  sfx.playCylinderSpin();
}

export function onCraneClose() {
  // 閉じた瞬間に空回しを止め、次の薬室の位置にぴたりと合わせる
  gunState.cylinderSpin = 0;
  gunState.cylinderTarget = Math.ceil(gunCylinder.rotation.z / CHAMBER_STEP) * CHAMBER_STEP;
  sfx.playCraneClose();
  kickVel.z -= 2 * DEG * 22;
  hooks.addTrauma(0.04);
}

// ---- デッドアイ ----
export const DEADEYE_RANGE = 60;
export const DEADEYE_RESTACK = 0.22; // 同じ敵に照準を留めたとき、次の印を重ねるまで（実時間）
export const DEADEYE_FULL_DELAY = 0.15; // 弾の数だけ付けたら、この間をおいて撃ち始める（実時間）
export const DEADEYE_SHOT_GAP = 0.09; // 撃つ間隔（実時間）。間に次の印へ視点を振る
export const DEADEYE_AFTER = 0.3; // 撃ち終えてからスローを解くまで（実時間）
export const DEADEYE_ZOOM = 8; // 印を付けている間に狭める視野（度）
export const DEADEYE_TURN = 30; // 次の印へ視点を寄せる速さ (1/s)
export const DEADEYE_HIT: HitDef = { kick: [-1, 0, 0], knock: 120, hitStop: 0.03, fx: 1 };

// 印は、付けた体（敵なら root、ボスなら当たった部品）の座標で覚えて、体と一緒に動かす。enemy はボスの部品なら null
export interface DeadEyeMark { enemy: Enemy | null; anchor: THREE.Object3D; local: THREE.Vector3; el: HTMLElement; done: boolean }
const markAlive = (m: DeadEyeMark) => (m.enemy ? m.enemy.alive : bossAlive());
let deadEyeFullT = 0;
let deadEyeOver: THREE.Object3D | null = null; // 照準が今乗っている体（敵の root かボスの部品）
let deadEyeDwell = 0;
export const deadEyeMarks: DeadEyeMark[] = [];
export const deadEyeLook = new THREE.Vector3();
export const deadEyeAt = new THREE.Vector3();
export const deadEyeScreen = new THREE.Vector3();

export function startDeadEye() {
  game.deadEye = 'mark';
  game.deadEyeT = deadEyeFullT = deadEyeDwell = 0;
  game.deadEyeKills = 0;
  deadEyeOver = null;
  if (gunState.twirlT >= 0) endTwirl(false);
  endSlideSpin();
  sfx.playDeadEyeStart();
}

export function endDeadEye() {
  game.deadEye = 'off';
  for (const m of deadEyeMarks) m.el.remove();
  deadEyeMarks.length = 0;
}

export function addDeadEyeMark(e: Enemy | null, anchor: THREE.Object3D, at: THREE.Vector3) {
  anchor.updateMatrixWorld();
  const el = document.createElement('div');
  el.className = 'deadeye-mark';
  el.innerHTML =
    '<svg viewBox="0 0 20 20"><path class="br" d="M-9 0 V-9 H0 M20 -9 H29 V0 M29 20 V29 H20 M0 29 H-9 V20" />' +
    '<path class="x" d="M4 4 L16 16 M16 4 L4 16" /></svg>';
  document.body.appendChild(el);
  deadEyeMarks.push({ enemy: e, anchor, local: anchor.worldToLocal(at.clone()), el, done: false });
  sfx.playDeadEyeMark(deadEyeMarks.length);
}

export const markWorld = (m: DeadEyeMark, out: THREE.Vector3) => m.anchor.localToWorld(out.copy(m.local));

// 照準の先の敵に印を付ける。パッドでは照準のすぐ近くの敵の胸にも付ける。
// ボスの機体は、照準の先の部品に付ける（ダメージが通らない所でも付く。撃てば弾かれる）
export function markUnderCrosshair() {
  camera.getWorldDirection(deadEyeLook);
  let e: Enemy | null = null;
  let anchor: THREE.Object3D | null = null;
  if (castThrow(camera.position, deadEyeLook, DEADEYE_RANGE) && (castHit.enemy || castHit.boss)) {
    e = castHit.enemy;
    anchor = e ? e.root : castHit.part;
    deadEyeAt.copy(castHit.point);
  } else {
    const t = findAssistTarget();
    if (t && t.angle < t.size * ASSIST_SNAP) {
      e = t.enemy;
      anchor = t.enemy?.root ?? null;
      deadEyeAt.copy(t.point);
    }
  }
  if (anchor !== deadEyeOver) {
    deadEyeOver = anchor;
    deadEyeDwell = 0;
    if (anchor) addDeadEyeMark(e, anchor, deadEyeAt);
  } else if (anchor) {
    deadEyeDwell += game.realDt;
    if (deadEyeDwell >= DEADEYE_RESTACK) {
      deadEyeDwell = 0;
      addDeadEyeMark(e, anchor, deadEyeAt);
    }
  }
}

// 視点を at へ寄せる（居合の突進と同じやり方）
export function turnViewTo(at: THREE.Vector3, k: number) {
  lockTo.subVectors(at, camera.position);
  lookEuler.setFromQuaternion(camera.quaternion);
  const yaw = Math.atan2(-lockTo.x, -lockTo.z);
  lookEuler.y += wrapAngle(yaw - lookEuler.y) * k;
  lookEuler.x += (Math.atan2(lockTo.y, Math.hypot(lockTo.x, lockTo.z)) - lookEuler.x) * k;
  lookEuler.z = 0;
  camera.quaternion.setFromEuler(lookEuler);
}

// 実時間で進める。updateGun の頭で呼ぶ（クリックを普段の射撃より先に拾う）
export function updateDeadEye() {
  const pressed = gunState.deadEyePressed;
  gunState.deadEyePressed = false;
  if (game.deadEye !== 'off' && (!gunReady() || !controls.isLocked || game.playerHp <= 0)) endDeadEye();

  if (game.deadEye === 'off') {
    if (pressed && gunReady() && !gunState.gunReloading && controls.isLocked) {
      if (swordState.focusCharge >= 1 && gunState.gunAmmo > 0) startDeadEye();
      else {
        swordState.focusEmptyFlash = FOCUS_EMPTY_FLASH;
        playRing(0.5, 0.25, 0.04); // 溜まっていない鈍い「カッ」
      }
    }
  } else if (game.deadEye === 'mark') {
    game.deadEyeT += game.realDt;
    const left = deadEyeMarks.length < gunState.gunAmmo;
    if (left) markUnderCrosshair();
    else deadEyeFullT += game.realDt;
    // 右クリックは単押しで入る。もう一度の右クリックか左クリックで撃つ（待てば時間切れか弾の数で撃つ）
    if (gunState.fireQueued || pressed || game.deadEyeT >= DEADEYE_MAX || deadEyeFullT >= DEADEYE_FULL_DELAY) {
      if (deadEyeMarks.length === 0) endDeadEye(); // 1 つも付けずに終えたら、ゲージは減らさない
      else {
        game.deadEye = 'fire';
        game.deadEyeT = DEADEYE_SHOT_GAP * 0.5; // 最初の 1 発は少し早く
        swordState.focusCharge = 0;
        sfx.playDeadEyeFire();
      }
    }
  } else if (game.deadEye === 'fire') {
    // 先の弾で倒した敵に残った印は飛ばす
    const m = deadEyeMarks.find((d) => !d.done && markAlive(d));
    if (!m) {
      game.deadEye = 'after';
      game.deadEyeT = 0;
    } else {
      markWorld(m, deadEyeAt);
      turnViewTo(deadEyeAt, 1 - Math.exp(-game.realDt * DEADEYE_TURN));
      game.deadEyeT += game.realDt;
      if (game.deadEyeT >= DEADEYE_SHOT_GAP && gunState.gunAmmo > 0) {
        game.deadEyeT = 0;
        m.done = true;
        m.el.remove();
        fireGun(deadEyeAt, m.enemy ?? undefined);
      }
    }
  } else {
    game.deadEyeT += game.realDt;
    if (game.deadEyeT >= DEADEYE_AFTER) endDeadEye();
  }
  // 印を付けている間と撃っている間は、普段の射撃と装填を受け付けない
  if (game.deadEye !== 'off') gunState.fireQueued = gunState.reloadQueued = false;

  const on = game.deadEye === 'mark' || game.deadEye === 'fire';
  gunState.deadEyeBlend += ((on ? 1 : 0) - gunState.deadEyeBlend) * Math.min(1, game.realDt * (on ? 8 : 6));
}

// 印を敵の体に重ねる。同じ敵に重ねた印は少しずつずらす。
// 揺れと反動を足したカメラで描くので、applyCameraOffset の後に呼ぶ（でないと撃つたびに印が敵からずれる）
export function placeDeadEyeMarks() {
  camera.updateMatrixWorld();
  for (const m of deadEyeMarks) {
    if (m.done) continue;
    if (!markAlive(m)) {
      m.done = true;
      m.el.remove();
      continue;
    }
    deadEyeScreen.copy(markWorld(m, deadEyeAt)).project(camera);
    m.el.style.display = deadEyeScreen.z > 1 ? 'none' : '';
    const x = ((deadEyeScreen.x + 1) / 2) * window.innerWidth;
    const y = ((1 - deadEyeScreen.y) / 2) * window.innerHeight;
    m.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}

// ---- 落ちた薬莢 ----
export const CASING_MAX = 48;
export const CASING_LIFE = 8;
export const CASING_GRAVITY = 15;
export const CASING_RADIUS = 0.005;
export interface Casing { mesh: THREE.Group; vel: THREE.Vector3; spin: THREE.Vector3; age: number; bounces: number }
export const casings: Casing[] = [];
export function spawnCasing(live: boolean, at: THREE.Vector3, quat: THREE.Quaternion, vel: THREE.Vector3) {
  const mesh = createRound(weaponMats, live);
  skinOf('handgun').round?.(mesh, weaponMats.gun.envMap); // スキンの弾（爪など）
  mesh.position.copy(at);
  mesh.quaternion.copy(quat);
  scene.add(mesh);
  const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30);
  casings.push({ mesh, vel, spin, age: 0, bounces: 0 });
  if (casings.length > CASING_MAX) casings.shift()!.mesh.removeFromParent();
}

export const casingEuler = new THREE.Euler();
export const casingRot = new THREE.Quaternion();
export function updateCasings(dt: number) {
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i];
    c.age += dt;
    if (c.age > CASING_LIFE) {
      c.mesh.removeFromParent();
      casings.splice(i, 1);
      continue;
    }
    if (c.bounces >= 4 && c.vel.lengthSq() < 0.01) continue; // 転がり終えたら止める
    c.vel.y -= CASING_GRAVITY * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.quaternion.premultiply(casingRot.setFromEuler(casingEuler.set(c.spin.x * dt, c.spin.y * dt, c.spin.z * dt)));
    const p = c.mesh.position;
    const floor = floorAt(p.x, p.z, p.y) + CASING_RADIUS;
    if (p.y < floor) {
      p.y = floor;
      const impact = -c.vel.y;
      c.vel.y = impact * 0.35;
      c.vel.x *= 0.6;
      c.vel.z *= 0.6;
      c.spin.multiplyScalar(0.6);
      if (c.bounces < 3 && impact > 0.8) {
        // 跳ねるたびに小さく「チン」。遠いほど小さく
        const near = THREE.MathUtils.clamp(2 / Math.max(p.distanceTo(camera.position), 0.5), 0, 1);
        sfx.playCasing(near * Math.min(1, impact / 3));
      }
      c.bounces++;
      if (c.bounces >= 4) {
        c.vel.set(0, 0, 0);
        // 最後は横倒しに寝かせる
        c.mesh.quaternion.setFromEuler(casingEuler.set(Math.PI / 2, Math.random() * Math.PI * 2, 0, 'YXZ'));
      }
    }
  }
}

export function updateBullets(dt: number) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const step = (b.batted ? BAT_RETURN_SPEED : b.parried ? PARRY_RETURN_SPEED : BULLET_SPEED) * dt;
    const maxTail = b.batted ? BAT_TRACER_LEN : b.parried ? PARRY_TRACER_LEN : TRACER_LEN;
    if (b.hit) {
      // 当たった後は、頭を当たった所に止めたまま尾だけを縮めて消す
      b.tail -= step;
    } else if (b.traveled >= BULLET_RANGE) {
      b.tail -= step;
      b.pos.addScaledVector(b.dir, step);
    } else if (castThrow(b.pos, b.dir, step)) {
      b.hit = true;
      const moved = b.pos.distanceTo(castHit.point);
      b.tail = Math.min(maxTail, b.tail + moved);
      b.pos.copy(castHit.point);
      onBulletHit(castHit.point, b.dir, castHit.enemy, b.parried, b.deadEye, b.batted, castHit.boss);
    } else if (b.aimEnemy?.alive && b.traveled + step >= b.aimDist!) {
      // 狙った所まで来た: クロスヘアが捉えていた敵に当てる
      b.hit = true;
      const moved = b.aimDist! - b.traveled;
      b.tail = Math.min(maxTail, b.tail + moved);
      b.pos.addScaledVector(b.dir, moved);
      onBulletHit(b.pos.clone(), b.dir, b.aimEnemy, b.parried, b.deadEye, b.batted);
    } else {
      b.pos.addScaledVector(b.dir, step);
      b.traveled += step;
      b.tail = Math.min(maxTail, b.tail + step);
    }
    if (b.tail <= 0) {
      b.mesh.removeFromParent();
      bullets.splice(i, 1);
      continue;
    }
    // 尾は頭から後ろへ伸ばす
    b.mesh.position.copy(b.pos);
    b.mesh.quaternion.setFromUnitVectors(TRACER_AXIS, bulletBack.copy(b.dir).negate());
    const width = b.batted ? BAT_TRACER_WIDTH : b.parried ? PARRY_TRACER_WIDTH : TRACER_WIDTH;
    b.mesh.scale.set(width, width, b.tail);
  }
}

export function onBulletHit(
  at: THREE.Vector3, dir: THREE.Vector3, onDummy: Enemy | null, parried = false, deadEyeShot = false, batted = false, onBoss: BossPart | null = null,
) {
  if (!onDummy && onBoss) {
    // ボスの機体: 打ち返した球・弾き返した弾・撃った弾を、敵に当てたときと同じ重さで部位に当てる
    const hit = batted ? BAT_RETURN_HIT : parried ? PARRY_RETURN_HIT : deadEyeShot ? DEADEYE_HIT : BULLET_HIT;
    hooks.hitBoss(hit, at, batted ? 'bat' : 'bullet', onBoss, dir);
    if (parried) game.parryReturnAge = 0;
    return;
  }
  if (onDummy) {
    setEn(onDummy);
    hitDir.set(dir.x, 0, dir.z);
    if (hitDir.lengthSq() < 1e-6) hitDir.set(en.root.position.x - position.x, 0, en.root.position.z - position.z);
    hitDir.normalize();
    if (batted) hooks.applyHit(BAT_RETURN_HIT, at, 'bat'); // 打球は当たった敵をバットで倒したときのようにかっ飛ばす
    else if (parried) hooks.applyHit(PARRY_RETURN_HIT, at, 'bullet');
    else {
      // 稲妻を出すスキンは、当たりの光も稲妻と同じ色にする
      const hit = deadEyeShot ? DEADEYE_HIT : BULLET_HIT;
      hitWithArcs(skinOf('handgun'), hit.fx ?? 1, dir, () => hooks.applyHit(hit, at, 'bullet'), at);
    }
    if (parried) game.parryReturnAge = 0;
  } else {
    // 壁や地面: 火花を散らして小さく「チュン」
    spawnSparks(at, dir, 6 + Math.floor(Math.random() * 4), 0.6, 0.5);
    sfx.playRicochet();
  }
}

// 跳ね返した弾: 自分の一撃だと分かるよう、遅く太く白い光の尾で飛ばす
export const PARRY_RETURN_SPEED = 60; // m/s（スローの間は目で追える）
export const PARRY_TRACER_LEN = 4;
export const PARRY_TRACER_WIDTH = 0.05;
export const PARRY_RETURN_HIT: HitDef = { kick: [-1.6, 0, 0], knock: 420, hitStop: 0.12, fx: 1.6 };
// バットで打ち返した弾（打球）: 普通のパリィより速く太く飛び、当たれば敵の体力をまるごと削る
export const BAT_RETURN_SPEED = 85;
export const BAT_TRACER_LEN = 6;
export const BAT_TRACER_WIDTH = 0.09;
export const BAT_RETURN_HIT: HitDef = { kick: [-2.2, 0, 0], knock: 600, hitStop: 0.16, fx: 1.8, dmg: 6 }; // バットの 20 × 6 = 120
export const isParryReturn = (def: HitDef) => def === PARRY_RETURN_HIT || def === BAT_RETURN_HIT;

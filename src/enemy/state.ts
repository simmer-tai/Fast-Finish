import * as THREE from 'three';
import { type DummyFoot, type Spring } from './stagger.js';
import { type Debris } from './debris.js';
import { type EnemyBody } from './body.js';
import { type WeaponId } from '../weapons/ids.js';
import { type Scar } from '../fx/scars.js';

// 敵の種類: 銃撃役（間合いを保って撃つ）と、ストライカー（刃の腕で斬りかかってくる近接型。体と動きは enemy/striker.ts）
export type EnemyKind = 'gunner' | 'striker';
export type StrikePhase = 'chase' | 'windup' | 'slash' | 'recover' | 'drop';

// ---- 敵 1 体分の状態 ----
// 体の部品・よろめきのばね・足・体力・切り跡・破片・銃口を 1 体ずつ持つ。敵を扱う関数は「いま扱っている敵」en に対して働く。
// 毎フレーム全員について en を切り替えて進め、攻撃が当たったときは当たった敵を en にしてから当たりを処理する
export interface Enemy extends EnemyBody {
  kind: EnemyKind;
  gun: THREE.Group;
  muzzle: THREE.Object3D;
  muzzleFx: THREE.Object3D; // 撃ったときのマズルフラッシュ
  pelvisSpring: Spring; // 腰の位置のずれ (m)。y は膝が沈む分
  leanSpring: Spring; // 上体の傾き（回転ベクトル, rad）。y は使わない
  twistSpring: Spring; // 上体のひねり。y だけ使う (rad)
  headSpring: Spring; // 背骨に対する首の曲がり（回転ベクトル）
  gunSpring: Spring; // 銃と両腕の跳ね上がり。x だけ使う（負で銃口が上がる）
  springs: Spring[];
  prevLeanVel: THREE.Vector3;
  prevTwistVel: number;
  footState: DummyFoot[];
  scars: Scar[];
  debris: Debris[];
  debrisRootSet: Set<THREE.Object3D>; // 砕けたときに 1 つの塊にする骨
  finishEl: HTMLElement; // とどめの印
  threatEl: HTMLElement; // 画面外にいるときの向きの印
  yaw: number; // 体の向き（+Z が 0、+X へ回すと正）
  aimYaw: number; // 体の向きに対して銃を左右へ振る角度
  aimPitch: number; // 銃口を上げる角度
  hp: number;
  alive: boolean;
  deadTime: number; // 倒されてからの時間
  riseTime: number; // 起き上がり始めてからの時間
  flashT: number; // 最後に当たってからの時間
  cooldown: number; // 次に撃てるまでの時間
  flashAge: number; // マズルフラッシュを出してからの時間
  riseDelay: number; // ステージへ入るとき、床の下から迫り上がり始める時刻
  baseY: number; // 足もとの高さ（迫り上がりの間も、ここを基準に沈める）
  spawnIndex: number; // 今いる出現位置（-1 = 出現位置を持たない）
  mobile: boolean; // 歩き回るか（訓練場の的は動かない）
  moving: boolean;
  moveTo: THREE.Vector3; // 歩いて向かう先
  waitT: number; // 立ち止まっている残りの時間
  vel: THREE.Vector3; // 歩く速さ（水平）
  knockVel: THREE.Vector3; // 斧で吹き飛ばされている速さ（水平）
  flung: boolean; // 斧の突進で前へ吹き飛ばされている（このまま壁に当たると叩きつけ）
  walk: number; // 歩く足の動きの強さ (0..1)
  walkPhase: number;
  walkDir: THREE.Vector3; // 足を振る向き（体の座標）
  stride: number; // 1 歩で進む距離（足を前後に振る幅）。ストライカーは走るので大きい
  airY: number; // 打ち上げられて足もと（baseY）から浮いている高さ
  airVel: number; // 打ち上げられているときの上下の速さ
  airTilt: THREE.Vector3; // 打ち上げで体ごと回っている角度（x: 前後、z: 左右。体の座標、rad）
  airTiltVel: THREE.Vector3;
  airRoll: number; // 打ち上げで左右へ傾ける向き（打ち上げるたびに変える）
  airPose: number; // 浮いて脚を縮めている度合い (0..1)
  spiked: boolean; // 斧の振り下ろしで床へ叩き落とされている（着いたら床への叩きつけ）
  // 体の表情（よろめきのばねに上乗せする姿勢）
  poseLean: THREE.Vector3; // 歩く向き・速さの変わり目へ上体を傾ける量（回転ベクトル, rad）
  prevVel: THREE.Vector3;
  brace: number; // 撃つ前に腰を落として構えている度合い (0..1)
  idleT: number; // 立っている間の呼吸と重心の揺れの時刻
  speedMul: number; // 歩く速さの個体差
  // 狙われたときの横っ飛び
  aimedAt: number; // プレイヤーに狙われ続けている時間
  dodgeT: number; // 横へ跳んでいる残りの時間
  dodgeCool: number; // 次に跳べるまでの時間
  dodgeVel: THREE.Vector3;
  // 吹き飛ばされて床を滑っている間の踏ん張り
  stumble: number; // 踏ん張りの強さ (0..1)
  stumbling: boolean; // 大きく滑っている最中か（止まりきった瞬間に揺り戻すため）
  skidT: number; // 次に床をこする火花を出すまで
  // ストライカーの斬りかかり（銃撃役では使わない）
  strikePhase: StrikePhase;
  strikeT: number; // 今の段に入ってからの時間
  strikeHit: boolean; // この振りで当たりを調べたか
  strikePose: number[]; // 今の腕と上体の姿勢（STRIKER_POSES と同じ並び）。狙う姿勢へばねで追いかける
  strikePoseVel: number[]; // 姿勢の変わる速さ
  turnVel: number; // 体の向きを変える角速度 (rad/s)
  // 高い所から飛び降りる（ストライカー）
  dropCell: number; // 飛び降りようとしている縁のマス（-1 = 降りない）
  dropFrom: THREE.Vector3; // 縁を選んだ間はその縁の中心、跳んだ後は踏み切った所
  dropTo: THREE.Vector3; // 降りる先の足もと
  dropT: number; // 踏み切ってからの時間
  dropDur: number; // 降りる先へ着くまでの時間
  // 倒すまでの過程（とどめのスコアに足す）。出てくるたびに戻す
  hits: number; // この敵に当てた数
  lastHitAt: number; // この敵に最後に当てた時刻（実時間）
  comboKept: boolean; // 最初の一撃からヒット数の表示を切らさずに当て続けているか
  parried: boolean; // パリィで弾き返した弾を当てたか
  spun: boolean; // 視点を 1 回転させてから当てたか
  hitPlayer: boolean; // この敵の弾を受けたか
  weapons: Set<WeaponId>; // 当てた武器
}
export const enemies: Enemy[] = [];
export let en: Enemy; // いま扱っている敵
// いま扱っている敵を切り替える（ほかのファイルからは en に直接代入できないので、これを通す）
export function setEn(e: Enemy) {
  en = e;
}

export const hitDir = new THREE.Vector3();
export const RESPAWN_TIME = 2.2; // 倒されてから起き上がり始めるまで
export const RESPAWN_RISE_TIME = 0.3;
export const DEFAULT_KNOCK = 220;
export const ENEMY_HIT_RECOVER = 0.6; // 攻撃を受けてから、少なくともこの時間は撃たない
export const AXE_LAUNCH_ENEMY_SPEED = 12; // 敵を打ち上げる速さ (m/s)。自分より少し高く上げて、叩きつけで捉えやすくする
export const WALL_SLAM_BOUNCE = 1.5; // 壁から跳ね返る速さ (m/s)

export const hitLook = new THREE.Vector3();

export const hitPoint = new THREE.Vector3();

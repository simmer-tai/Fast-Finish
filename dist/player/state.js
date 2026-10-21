import * as THREE from 'three';
import { DASH_CHARGES, EYE_HEIGHT } from './config.js';
// ---- プレイヤーの状態 ----
// position は足元の位置
export const position = new THREE.Vector3(0, 0, 5);
export const velocity = new THREE.Vector3();
export const dashDir = new THREE.Vector3();
export const mantleFrom = new THREE.Vector3();
export const mantleTo = new THREE.Vector3();
export const mantleDir = new THREE.Vector3();
export const mantlePrev = new THREE.Vector3();
export const wallNormal = new THREE.Vector3(); // 壁から外向き
export const wallTangent = new THREE.Vector3(); // 壁に沿って走る向き
export const wallProbe = new THREE.Vector3();
// 壁から離れた後、地面に降りるまでは同じ向きの壁で走り直さない（同じ壁を登り続けられないように）
export const lastWallNormal = new THREE.Vector3();
// 入力から決まる、このフレームの向き（update で毎フレーム計算する）
export const forward = new THREE.Vector3();
export const right = new THREE.Vector3();
export const wish = new THREE.Vector3();
// 変わっていく値。ほかのファイルからも書き換えられるよう、1 つのオブジェクトにまとめる
export const player = {
    onGround: false,
    landImpact: 0, // このフレームで着地したときの落下速度
    dashTime: 0,
    dashCooldown: 0,
    dashCharges: DASH_CHARGES,
    dashRecharge: 0,
    dashSpeedBefore: 0,
    sliding: false,
    slideLock: false, // スライディングが止まった後、C を離すまで再開しない
    slideBoostCooldown: 0,
    mantleTime: -1, // よじ登り中の経過時間。負ならよじ登っていない
    mantleDuration: 0,
    mantleExitSpeed: 0,
    wallRunning: false,
    wallRunTime: 0,
    hasLastWall: false, // lastWallNormal が有効か
    eyeHeight: EYE_HEIGHT,
    groundRamp: null, // 今立っている坂
};
export const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

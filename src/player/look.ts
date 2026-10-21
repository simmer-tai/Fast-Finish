import * as THREE from 'three';
import { camera } from '../core.js';
import { lookEuler } from './state.js';
import { BASE_FOV } from './config.js';
import { isDown } from './down.js';
import { game } from '../game/state.js';

// ---- 視点を回す ----
// 視点を回す（ラジアン）。マウスとパッドの右スティックで共用する
export function turnView(yaw: number, pitch: number) {
  if (isDown()) return; // 倒れている間は見回せない
  lookEuler.setFromQuaternion(camera.quaternion);
  lookEuler.y -= yaw;
  lookEuler.x -= pitch;
  game.viewSpin += yaw;
  lookEuler.x = THREE.MathUtils.clamp(lookEuler.x, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
  lookEuler.z = 0;
  camera.quaternion.setFromEuler(lookEuler);
}
// ズーム中は視野の狭さに合わせて視点の動きを細かくし、狙いを付けやすくする
export const zoomLookScale = () => Math.min(1, camera.fov / BASE_FOV);

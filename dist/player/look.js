import * as THREE from 'three';
import { camera } from '../core.js?v=9bd5fe3e';
import { lookEuler } from './state.js?v=9bd5fe3e';
import { BASE_FOV } from './config.js?v=9bd5fe3e';
import { isDown } from './down.js?v=9bd5fe3e';
import { game } from '../game/state.js?v=9bd5fe3e';
// ---- 視点を回す ----
// 視点を回す（ラジアン）。マウスとパッドの右スティックで共用する
export function turnView(yaw, pitch) {
    if (isDown())
        return; // 倒れている間は見回せない
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

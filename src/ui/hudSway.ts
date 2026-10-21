import * as THREE from 'three';
import { cameraFx, landShakeAmount } from '../fx/camera.js';
import { forward, right, velocity } from '../player/state.js';

// ---- HUD の慣性 ----
// 画面の HUD を、体に付けた板がばねで吊ってあるように動かす。動いた向きの逆へ遅れてずれ、
// 速さが変わった瞬間（ダッシュ・ジャンプ・着地）には押されて弾み、前へ速く進むほど外へ広がる。
// 衝撃は hudImpulse で直接足し、画面揺れ（trauma・着地の揺れ）にも合わせて小刻みに震える
export const HUD_LAG = 0.7; // 速さ 1 m/s あたりのずれ (px)
export const HUD_LAG_MAX = 16; // 速さによるずれの上限 (px)
export const HUD_PUSH = 22; // 速さの変化 1 m/s あたりに弾く速さ (px/秒)
export const HUD_PUSH_MAX = 520; // 1 フレームで弾く速さの上限 (px/秒)。ワープなどで飛ばないように
export const HUD_SPREAD = 0.0018; // 前へ 1 m/s あたりに広がる割合
export const HUD_STIFF = 150; // ばねの硬さ
export const HUD_DAMP = 15; // ばねの減衰
export const HUD_OFFSET_MAX = 34; // ずれの上限 (px)
export const HUD_SCALE_MAX = 0.05; // 広がり・縮みの上限
export const hudLayer = document.getElementById('hud')!;
export const scoreLayer = document.getElementById('score')!;
export const hudOff = new THREE.Vector3(); // x, y はずれ (px)、z は広がり (割合)
export const hudVel = new THREE.Vector3();
export const hudPrevVel = new THREE.Vector3();
export const hudDv = new THREE.Vector3();
let hudPrevValid = false;

// 衝撃で HUD を弾く。x, y は画面の向き (px/秒、y は下が正)、z は広がり（負で奥へ押し込む）
export function hudImpulse(x: number, y: number, z = 0) {
  hudVel.x += x;
  hudVel.y += y;
  hudVel.z += z;
}

// dt は実時間（スロー中も同じ速さでばねを戻す）
export function updateHudSway(dt: number) {
  if (dt <= 0) return;
  // 速さを、今向いている向きの横・前・上に分ける
  const lateral = velocity.x * right.x + velocity.z * right.z;
  const ahead = velocity.x * forward.x + velocity.z * forward.z;

  // 速さが変わった分だけ、遅れる向きへ弾く（右へ加速したら左へ、着地で上向きに止まったら下へ）
  if (hudPrevValid) {
    hudDv.subVectors(velocity, hudPrevVel);
    const dLat = hudDv.x * right.x + hudDv.z * right.z;
    const dAhead = hudDv.x * forward.x + hudDv.z * forward.z;
    hudVel.x += THREE.MathUtils.clamp(-dLat * HUD_PUSH, -HUD_PUSH_MAX, HUD_PUSH_MAX);
    hudVel.y += THREE.MathUtils.clamp(hudDv.y * HUD_PUSH, -HUD_PUSH_MAX, HUD_PUSH_MAX);
    hudVel.z += THREE.MathUtils.clamp(-dAhead * HUD_PUSH * 0.0009, -0.4, 0.4);
  }
  hudPrevVel.copy(velocity);
  hudPrevValid = true;

  // 速さに応じた落ち着き先: 動く向きの逆へずらし、前へ速いほど外へ広げる
  const tx = THREE.MathUtils.clamp(-lateral * HUD_LAG, -HUD_LAG_MAX, HUD_LAG_MAX);
  const ty = THREE.MathUtils.clamp(velocity.y * HUD_LAG, -HUD_LAG_MAX, HUD_LAG_MAX);
  const tz = THREE.MathUtils.clamp(Math.max(0, ahead) * HUD_SPREAD, 0, HUD_SCALE_MAX * 0.6);

  // ばね（大きな dt で暴れないよう細かく刻む）
  const steps = Math.ceil(dt / (1 / 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    hudVel.x += (HUD_STIFF * (tx - hudOff.x) - HUD_DAMP * hudVel.x) * h;
    hudVel.y += (HUD_STIFF * (ty - hudOff.y) - HUD_DAMP * hudVel.y) * h;
    hudVel.z += (HUD_STIFF * (tz - hudOff.z) - HUD_DAMP * hudVel.z) * h;
    hudOff.x += hudVel.x * h;
    hudOff.y += hudVel.y * h;
    hudOff.z += hudVel.z * h;
  }
  hudOff.x = THREE.MathUtils.clamp(hudOff.x, -HUD_OFFSET_MAX, HUD_OFFSET_MAX);
  hudOff.y = THREE.MathUtils.clamp(hudOff.y, -HUD_OFFSET_MAX, HUD_OFFSET_MAX);
  hudOff.z = THREE.MathUtils.clamp(hudOff.z, -HUD_SCALE_MAX, HUD_SCALE_MAX);

  // 画面揺れに合わせた小刻みな震え（ばねには入れず、見た目にだけ足す）
  const s = cameraFx.trauma * cameraFx.trauma;
  const ls = landShakeAmount();
  const t = cameraFx.shakeTime;
  const jx = s * 7 * Math.sin(t * 47.3 + 0.7) + ls * 4 * Math.sin(t * 89.3 + 2.2);
  const jy = s * 7 * Math.sin(t * 53.1 + 2.9) + ls * 9 * Math.abs(Math.sin(t * 97.1 + 0.4));

  const x = hudOff.x + jx;
  const y = hudOff.y + jy;
  // 板ごとずらして少し傾け、消失点は逆へ動かして曲面の向きが変わったように見せる
  hudLayer.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  hudLayer.style.scale = (1 + hudOff.z).toFixed(4);
  hudLayer.style.rotate = `${(x * 0.04).toFixed(3)}deg`;
  hudLayer.style.perspectiveOrigin = `calc(50% - ${(x * 3).toFixed(1)}px) calc(50% - ${(y * 3).toFixed(1)}px)`;
  // 照準の横に出るスコアは、照準から離れすぎないよう控えめに
  scoreLayer.style.translate = `${(x * 0.5).toFixed(2)}px ${(y * 0.5).toFixed(2)}px`;
}

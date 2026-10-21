import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { camera, renderer, scene } from '../core.js';
import { fxScene } from './hitFx.js';
import { ImpactFxShader, SpeedFxShader } from './postShaders.js';
import { player, velocity } from '../player/state.js';
import { SPRINT_SPEED } from '../player/config.js';

// ---- ポストエフェクト ----（シェーダーは fx/postShaders.ts）
// 周辺ブラー・ビネット・集中線: これより速いと効果が出始め、SPEED_FX_FULL で最大になる
export const SPEED_FX_START = SPRINT_SPEED - 1;
export const SPEED_FX_FULL = 30;
export const MAX_RADIAL_BLUR = 0.07; // 画面端で中心方向へぼかす量
export const MAX_VIGNETTE = 0.3;

// MSAA を保つため、マルチサンプルのレンダーターゲットで描く
export const composerTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio(),
  { type: THREE.HalfFloatType, samples: 4 },
);
export const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
export const speedFxPass = new ShaderPass(SpeedFxShader);
composer.addPass(speedFxPass);
export const impactFxPass = new ShaderPass(ImpactFxShader);
composer.addPass(impactFxPass);
// どちらも最初は効果が無いので止めておく（動き出したら update 側で点ける）
speedFxPass.enabled = false;
impactFxPass.enabled = false;
// 当たりの光は暗転のあとに重ねる（奥行きは見ず、常に手前に描く）
export const hitFxRenderPass = new RenderPass(fxScene, camera);
hitFxRenderPass.clear = false;
composer.addPass(hitFxRenderPass);
composer.addPass(new OutputPass());

let speedFx = 0;
export function updateSpeedFx(dt: number) {
  const hSpeed = Math.hypot(velocity.x, velocity.z);
  let target = THREE.MathUtils.clamp((hSpeed - SPEED_FX_START) / (SPEED_FX_FULL - SPEED_FX_START), 0, 1);
  if (player.dashTime > 0) target = 1;
  // 強くなるときは素早く、弱まるときはゆっくり
  speedFx += (target - speedFx) * Math.min(1, dt * (target > speedFx ? 12 : 4));
  if (target === 0 && speedFx < 0.002) speedFx = 0;
  // 効果が無いときは全画面の処理（ブラーの 10 回読み）ごと飛ばす
  speedFxPass.enabled = speedFx > 0;

  const u = speedFxPass.uniforms;
  u.uTime.value += dt;
  u.uBlur.value = speedFx * MAX_RADIAL_BLUR;
  u.uVignette.value = speedFx * MAX_VIGNETTE;
  u.uLines.value = speedFx;
}

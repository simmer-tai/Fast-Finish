import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { camera, renderer, scene } from '../core.js?v=d61aec99';
import { fxScene } from './hitFx.js?v=d61aec99';
import { GlowPass } from './glow.js?v=d61aec99';
import { ImpactFxShader, MotionBlurShader, SpeedFxShader } from './postShaders.js?v=d61aec99';
import { player, velocity } from '../player/state.js?v=d61aec99';
import { SPRINT_SPEED } from '../player/config.js?v=d61aec99';
// ---- ポストエフェクト ----（シェーダーは fx/postShaders.ts）
// 周辺ブラー・ビネット・集中線: これより速いと効果が出始め、SPEED_FX_FULL で最大になる
export const SPEED_FX_START = SPRINT_SPEED - 1;
export const SPEED_FX_FULL = 30;
export const MAX_RADIAL_BLUR = 0.07; // 画面端で中心方向へぼかす量
export const MAX_VIGNETTE = 0.3;
// カメラの動きのブラー: 1 フレームで動いた分のどれだけをぼかすか（シャッターの開いている割合）と、ぼかす長さの上限（画面の幅に対して）
export const MOTION_BLUR_STRENGTH = 0.35;
export const MOTION_BLUR_MAX = 0.02;
// MSAA を保つため、マルチサンプルのレンダーターゲットで描く
export const composerTarget = new THREE.WebGLRenderTarget(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio(), 
// 深度はカメラの動きのブラーで、手元の武器を見分けるのに使う
{ type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
export const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));
// 光る物（スキンの刃先など）のにじみ。速さのブラーより前に重ね、ブラーでいっしょに流れるようにする
export const glowPass = new GlowPass(scene, camera);
composer.addPass(glowPass);
// カメラの動きのブラー。景色を描いた直後（深度が残っている描き込み先）で行う。
// カメラがほとんど動いていないフレームは、何もせずに次へ渡す
class MotionBlurPass extends ShaderPass {
    prevViewProj = new THREE.Matrix4();
    viewProj = new THREE.Matrix4();
    hasPrev = false;
    constructor() {
        super(MotionBlurShader);
    }
    render(r, writeBuffer, readBuffer, deltaTime, maskActive) {
        this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        let moved = 0;
        for (let i = 0; i < 16; i++)
            moved += Math.abs(this.viewProj.elements[i] - this.prevViewProj.elements[i]);
        const run = this.hasPrev && moved > 1e-4 && !!readBuffer.depthTexture;
        if (run) {
            const u = this.uniforms;
            u.tDepth.value = readBuffer.depthTexture;
            u.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
            u.uPrevViewProj.value.copy(this.prevViewProj);
            u.uNear.value = camera.near;
            u.uFar.value = camera.far;
            u.uStrength.value = MOTION_BLUR_STRENGTH;
            u.uMaxLen.value = MOTION_BLUR_MAX;
            super.render(r, writeBuffer, readBuffer, deltaTime, maskActive);
        }
        this.needsSwap = run;
        this.prevViewProj.copy(this.viewProj);
        this.hasPrev = true;
    }
}
export const motionBlurPass = new MotionBlurPass();
composer.addPass(motionBlurPass);
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
export function updateSpeedFx(dt) {
    const hSpeed = Math.hypot(velocity.x, velocity.z);
    let target = THREE.MathUtils.clamp((hSpeed - SPEED_FX_START) / (SPEED_FX_FULL - SPEED_FX_START), 0, 1);
    if (player.dashTime > 0)
        target = 1;
    // 強くなるときは素早く、弱まるときはゆっくり
    speedFx += (target - speedFx) * Math.min(1, dt * (target > speedFx ? 12 : 4));
    if (target === 0 && speedFx < 0.002)
        speedFx = 0;
    // 効果が無いときは全画面の処理（ブラーの 10 回読み）ごと飛ばす
    speedFxPass.enabled = speedFx > 0;
    const u = speedFxPass.uniforms;
    u.uTime.value += dt;
    u.uBlur.value = speedFx * MAX_RADIAL_BLUR;
    u.uVignette.value = speedFx * MAX_VIGNETTE;
    u.uLines.value = speedFx;
}

import * as THREE from 'three';
import { BASE_FOV, EYE_HEIGHT } from './player/config.js?v=d61aec99';
// ---- 基本セットアップ ----
// 画面のアンチエイリアスは後処理のマルチサンプル描画で行うので、キャンバス側では持たない
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
export const scene = new THREE.Scene();
// 地面が遠くで背景に溶け込むよう、背景と霧を同じ色にする
export const WORLD_COLOR = 0xc8c8c8;
scene.background = new THREE.Color(WORLD_COLOR);
scene.fog = new THREE.Fog(WORLD_COLOR, 20, 150);
// 光: 空からの光（地面側も明るい灰色）に、太陽の向きの光を 1 つ足す。ライトは main.ts が置く
export const HEMI_GROUND = 0xdddddd;
export const HEMI_INTENSITY = 2.3; // 影なし
export const HEMI_WITH_SUN = 1.75; // 影ありのときは、太陽の分だけ空の光を弱めて明るさを揃える
export const SUN_INTENSITY = 1.1;
export const SUN_DIR = new THREE.Vector3(0.45, 1, 0.3).normalize(); // 太陽のある向き
export const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, EYE_HEIGHT, 5);
// isLocked は「プレイ中」の意味で使う。マウスではポインターロックと一緒に切り替わり、
// パッドで始めたときはロックなしでプレイ中にする（padPlaying）
export const controls = { isLocked: false };

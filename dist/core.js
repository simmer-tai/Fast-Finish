import * as THREE from 'three';
import { BASE_FOV, EYE_HEIGHT } from './player/config.js';
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
export const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, EYE_HEIGHT, 5);
// isLocked は「プレイ中」の意味で使う。マウスではポインターロックと一緒に切り替わり、
// パッドで始めたときはロックなしでプレイ中にする（padPlaying）
export const controls = { isLocked: false };

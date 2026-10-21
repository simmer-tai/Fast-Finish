import * as THREE from 'three';
export const enemies = [];
export let en; // いま扱っている敵
// いま扱っている敵を切り替える（ほかのファイルからは en に直接代入できないので、これを通す）
export function setEn(e) {
    en = e;
}
export const hitDir = new THREE.Vector3();
export const RESPAWN_TIME = 2.2; // 倒されてから起き上がり始めるまで
export const RESPAWN_RISE_TIME = 0.3;
export const DEFAULT_KNOCK = 220;
export const ENEMY_HIT_RECOVER = 0.6; // 攻撃を受けてから、少なくともこの時間は撃たない
export const AXE_LAUNCH_ENEMY_SPEED = 12; // 敵を打ち上げる速さ (m/s)。自分より少し高く上げて、叩きつけで捉えやすくする
export const WALL_SLAM_BOUNCE = 1.5; // 壁から跳ね返る速さ (m/s)

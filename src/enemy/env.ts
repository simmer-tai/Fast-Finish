import type * as THREE from 'three';

// ---- 敵の処理が本体へ頼むこと ----
export interface EnemyEnv {
  scene: THREE.Scene;
  addTrauma(amount: number): void; // 画面を揺らす
  isHeld(): boolean; // いま扱っている敵を、鎖鎌で掛けているか突進の的にしているか
  playerHp(): number;
  slamIntoFloor(): void; // 叩きつけられて床に着いた（当たりの処理は本体）
  slamIntoWall(): boolean; // 吹き飛んで壁に当たった。叩きつけにしたら true
}
export let env: EnemyEnv;
export function initEnemyEnv(e: EnemyEnv) {
  env = e;
}

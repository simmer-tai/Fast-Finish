import type * as THREE from 'three';
import type { Enemy } from './state.js';

// ---- 敵の処理が本体へ頼むこと ----
export interface EnemyEnv {
  scene: THREE.Scene;
  addTrauma(amount: number): void; // 画面を揺らす
  isHeld(): boolean; // いま扱っている敵を、鎖鎌で掛けているか突進の的にしているか
  playerHp(): number;
  targetPlayer(out: THREE.Vector3): boolean; // いま扱っている敵から見た、生存中の標的の胸
  slamIntoFloor(): void; // 叩きつけられて床に着いた（当たりの処理は本体）
  slamIntoWall(): boolean; // 吹き飛んで壁に当たった。叩きつけにしたら true
  slamIntoEnemy(other: Enemy): boolean; // 吹き飛んでほかの敵に当たった。巻き込んだら true（終わったら en は元の敵に戻す）
}
export let env: EnemyEnv;
export function initEnemyEnv(e: EnemyEnv) {
  env = e;
}

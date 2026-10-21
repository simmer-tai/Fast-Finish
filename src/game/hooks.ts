import type * as THREE from 'three';
import type { HitKind } from '../audio.js';
import type { HitDef } from '../weapons/kunaiAttacks.js';

// ---- 武器の処理が本体へ頼むこと ----
// 当たりの処理（ダメージ・スコア・演出）やカメラ演出は main.ts にあるので、武器のファイルからはこれを通して呼ぶ
export interface GameHooks {
  addTrauma(amount: number): void; // 画面を揺らす
  // 当たりの反応と演出。hitDir（攻撃した側から敵の奥への水平の向き）は呼ぶ前に入れておく
  applyHit(def: HitDef, at: THREE.Vector3, kind: HitKind, swing?: THREE.Vector3, scar?: boolean, dmgScale?: number): void;
  enemyHeld(): boolean; // いま扱っている敵を、鎖鎌で掛けているか突進の的にしているか
  inReachOf(reach: number, angle: number): boolean; // いま扱っている敵に届くか
  dummyInReach(reach: number, angle: number): boolean; // 届く範囲でいちばん近い敵を en にし、hitDir に攻撃の向きを入れる。いなければ false
  hitPointFromTip(tip: THREE.Vector3, out: THREE.Vector3): void; // 刃先の位置から、敵の表面の当たった所を求める
  applyLunge(amount: number): void; // 攻撃の踏み込み
  grappling(): boolean; // 鎖鎌で移動している最中か
  applyCameraOffset(): void; // 描画の向きに揺れと傾きを足す（クロスヘアの指す向きになる）
  restoreCameraOffset(): void; // applyCameraOffset で足した分を戻す
  damagePlayer(amount: number): void; // プレイヤーの体力を削る（ステージでは 0 で倒れ、訓練場では 1 で耐える）
  pauseGame(): void; // 一時停止にする（パッドのメニューボタン）
}
export let hooks: GameHooks;
export function initGameHooks(h: GameHooks) {
  hooks = h;
}

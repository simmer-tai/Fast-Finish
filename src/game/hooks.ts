import type * as THREE from 'three';
import type { HitKind } from '../audio.js';
import type { HitDef } from '../weapons/kunaiAttacks.js';
import type { BossPart } from '../enemy/boss.js';

// ---- 武器の処理が本体へ頼むこと ----
// 当たりの処理（ダメージ・スコア・演出）やカメラ演出は main.ts にあるので、武器のファイルからはこれを通して呼ぶ
export interface GameHooks {
  addTrauma(amount: number): void; // 画面を揺らす
  // 当たりの反応と演出。hitDir（攻撃した側から敵の奥への水平の向き）は呼ぶ前に入れておく
  applyHit(def: HitDef, at: THREE.Vector3, kind: HitKind, swing?: THREE.Vector3, scar?: boolean, dmgScale?: number): void;
  enemyHeld(): boolean; // いま扱っている敵を、鎖鎌で掛けているか突進の的にしているか
  inReachOf(reach: number, angle: number): boolean; // いま扱っている敵に届くか
  // 届く範囲でいちばん近い敵を en にし、hitDir に攻撃の向きを入れる。いなければ false。
  // ボスの機体のほうが近ければボスを選ぶ（続く hitPointFromTip と applyHit がボスへ回る。bossTargeted で分かる）
  dummyInReach(reach: number, angle: number): boolean;
  bossInReach(reach: number, angle: number): boolean; // ボスの機体だけを調べる（敵を 1 体ずつ数える武器が、敵のあとに呼ぶ）
  bossTargeted(): boolean; // 直前の dummyInReach / bossInReach がボスを選んだか（applyHit を呼ぶまで）
  // 投げ物・弾・矢（と、ボスへの一閃）がボスの部位に当たったときの当たりの反応と演出。dir は飛んでいた向き、swing は刃の動いた向き
  hitBoss(def: HitDef, at: THREE.Vector3, kind: HitKind, part: BossPart, dir: THREE.Vector3, dmgScale?: number, swing?: THREE.Vector3): void;
  hitPointFromTip(tip: THREE.Vector3, out: THREE.Vector3): void; // 刃先の位置から、敵の表面の当たった所を求める
  applyLunge(amount: number): void; // 攻撃の踏み込み
  grappling(): boolean; // 鎖鎌で移動している最中か
  applyCameraOffset(): void; // 描画の向きに揺れと傾きを足す（クロスヘアの指す向きになる）
  restoreCameraOffset(): void; // applyCameraOffset で足した分を戻す
  damagePlayer(amount: number): void; // プレイヤーの体力を削る（ステージでは 0 で倒れ、訓練場では 1 で耐える）
  pauseGame(): void; // 一時停止にする（パッドのメニューボタン）
  callAdds(count: number): void; // ボスが増援を呼んだ（銃撃役を count 体、出現位置から起き上がらせる）
  addsAlive(): number; // 場にいる増援の数
}
export let hooks: GameHooks;
export function initGameHooks(h: GameHooks) {
  hooks = h;
}

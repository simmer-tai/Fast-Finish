import * as THREE from 'three';
import { TORSO_LEAN, buildMech, legRest, poseMechLeg } from './mech.js';
import { blocks, floorAt } from '../world/blocks.js';
import { player, position, velocity } from '../player/state.js';
import { EYE_HEIGHT, PLAYER_RADIUS } from '../player/config.js';
import { hooks } from '../game/hooks.js';
import * as sfx from '../audio.js';
import { DEG, UP } from '../math.js';
import { attachQuake, spawnQuake, spawnSpike, updateQuake } from '../fx/quake.js';
import { closestSegmentPoints } from '../combat/parry.js';
import { attachChunks, pushChunks, scatterRubble, shockChunks, spawnChunks, sweepChunks, updateChunks } from '../fx/chunks.js';
import { attachFloorMarks, spawnCrack, spawnImprint, spawnScorch, updateFloorMarks } from '../fx/floorMarks.js';
import { PILLAR_SINK, THROWN, addPillar, attachPillars, damagePillar, isPillar, pickThrown, pillarCount } from '../world/pillars.js';
import { fireBurst, flares, spawnSparks } from '../fx/hitFx.js';
import { spawnAxeShock } from '../weapons/axeCombat.js';
import { tracerGeo } from '../weapons/handgunCombat.js';
import { aimTarget, enemyBullets, enemyTracerMat } from './fire.js';
import { castWorld, lastHitBlock } from '../world/raycast.js';
import { camera, scene } from '../core.js';
import { game } from '../game/state.js';
import { clearMissiles, launchMissile, updateMissiles } from './bossMissiles.js';
import { broadcastBossSlam, broadcastBossShot, remotePlayers, sendRemoteBossImpact } from '../multiplayer/connectionTest.js';
export const BOSS_LIMBS = ['armR', 'armL', 'legR', 'legL'];
export const BOSS_LIMB_HP = 180;
export const BOSS_CORE_HP = 650;
// 難易度ごとの強さ。hp は腕・脚と本体の体力に、rate は攻撃の間隔が縮む速さに掛ける（大きいほど頻繁に攻撃する）。
// bullet は砲の弾の速さに掛け、shots は 1 回の連射で腕 1 本が撃つ数、missiles は一斉射で打ち上げる数。
// damage はプレイヤーが受けるダメージに、dash は突進の速さに、ult は必殺技で撃つ数に掛ける。lead = 偏差射撃をするか。
// rift は隆起ラインの本数、chain は突進のあとに続けてもう一度突進する割合。quake = 地響きの大跳躍をするか、ultWide = 必殺技で跳ぶたびの衝撃波をステージ全体へ広げるか。
// rage は本体の体力が半分を切ってから、攻撃の頻度にさらに掛ける倍率。adds は増援で呼ぶ銃撃役の数
export const BOSS_DIFFICULTY = {
    easy: { hp: 1, rate: 0.6, bullet: 0.7, shots: 2, missiles: 2, damage: 0.4, dash: 0.45, ult: 0.35, lead: false, rift: 1, chain: 0.15, quake: false, ultWide: false, rage: 1, adds: 2 },
    normal: { hp: 1.5, rate: 1.35, bullet: 1, shots: 3, missiles: 6, damage: 1, dash: 1, ult: 1, lead: true, rift: 3, chain: 0.5, quake: true, ultWide: false, rage: 1.4, adds: 2 },
    hard: { hp: 2, rate: 2.5, bullet: 1.4, shots: 5, missiles: 8, damage: 1, dash: 1, ult: 1, lead: true, rift: 5, chain: 0.75, quake: true, ultWide: true, rage: 1.4, adds: 3 },
};
const TURN_SPEED = 1.9; // 向き直る速さ (rad/s)
const TURN_SPEED_NEAR = 3.4; // 止まる距離より近くにいるときに向き直る速さ
const WALK_SPEED = 3.2; // 歩く速さ (m/s)
const WALK_ACCEL = 7; // (m/s²)
const NEAR = 11; // これより近ければ止まる
const FAR = 16; // これより遠ければ歩き出す
const FACE_TO_WALK = 0.6; // 向きがこれより合っていないと前へ進まない (rad)
const STEP_TIME = 0.32; // 足を運ぶ時間
const STEP_LIFT = 0.7; // 足を持ち上げる高さ
const STEP_LEAD = 0.45; // 進む速さにこの時間を掛けた分だけ、先へ踏み出す
const STEP_REACH = 0.7; // 着いている足が踏み出す先からこれより離れたら運ぶ
const STEP_REACH_IDLE = 0.15; // 止まってからしばらくしたら、これだけずれていても足をそろえ直す
const STEP_TURN = 0.45; // 足の向きが機体からこれよりずれたら運ぶ (rad)
const STEP_SHAKE = 0.22; // 足を着いたときの画面の揺れ（目の前で）
const STEP_SHAKE_FAR = 30; // この距離で揺れが消える
const STEP_BOB = 0.12; // 足を持ち上げている間に腰を上げる高さ
const STEP_DIP = 3; // 足を着いたときに腰を沈める勢い (m/s。腰のばねに足す)
const STEP_ROLL = 0.05; // 足を持ち上げている間に、着いている脚の側へ胴体を傾ける (rad)
const TURN_ACCEL = 12; // 向き直る速さを上げ下げする加速 (rad/s²。向き始めと止まり際をなめらかにする)
// 腰の高さと胴体の倒し方は、攻撃ごとの行き先をばねで追う（急に変わる所をならし、止まり際に少し弾ませて重さを出す）
const POSE_HIP_FREQ = 16;
const POSE_HIP_DAMP = 0.7;
const POSE_LEAN_FREQ = 14;
const POSE_LEAN_DAMP = 0.75;
const BODY_HALF = 1.8; // 当たり判定の箱の半幅（向きによらず囲む）
const BODY_TOP = 6.6;
const TWIST_MAX = 0.6; // 胴体を脚に対してひねる限り (rad)
const BOUNDS_MARGIN = 5; // ステージの端からこれだけ内側までしか歩かない
const DOWN_TIME = 7; // しゃがみ込んでいる時間
const RISE_TIME = 0.9; // 起き上がるのにかける時間
const DOWN_HIP = -1.9; // しゃがみ込んだときに腰を下げる量（窓が跳べば届く高さまで下がる）
const DEAD_HIP = -2.1;
const DOWN_LEAN = 0.5; // しゃがみ込んだときに胴体を余分に前へ倒す (rad)
const HIP_SPEED = 5.5; // 腰を上げ下げする速さ (m/s)
// 部位が故障しても、動きはふつうのまま（腕も垂らさない）。故障した腕の砲は、撃つ性能だけが落ちる
const DOWN_DROOP = 0.7; // しゃがみ込んでいる間に両腕の砲を垂らす角度
const ARM_BROKEN_SPREAD = 3; // 故障した腕の砲は、弾の散らばりがこれだけ大きく、動く先を読まない
const ARM_BROKEN_SHOTS = 0.5; // 故障した腕の砲は、連射の数がこれだけになる
const ARM_BROKEN_SWEEP = 0.25; // 故障した腕 1 本ごとに、薙ぎ払いの数から引く割合
const ARM_BROKEN_GLOW = 0.5; // 故障した腕の砲口の光の強さ
const FLASH_TIME = 0.12; // 当たったときに白く光らせる時間
// 故障した部位: 色を黒ずませ、ときどき火花を散らす（直すと元の色へ戻る）
const BROKEN_DARK = 0.3; // 故障した部位の色の明るさ
const SCATTER_RUBBLE = 220; // 広場に散らしておく細かい瓦礫の数（画質ごとの破片の数を超える分は散らさない）
const ARMOR_CHUNKS = 14; // 部位が壊れたときに飛び散る装甲の破片の数（床に残る）
// 壊れる柱を削る量（world/pillars.ts。柱の体力は 100）
const PILLAR_CRASH = 100; // 突進で激突した
const PILLAR_LASER = 70; // レーザーが当たっている間 (/s)
const PILLAR_RIFT = 40; // 隆起ラインが行き当たった
const SCORCH_STEP = 0.7; // レーザーの焦げ跡を付ける間隔 (m)
const RIFT_CRACK_STEP = 2.5; // 隆起ラインのひびを入れる間隔 (m)
const BROKEN_FADE = 4; // 色が移る速さ (1/s)
const BROKEN_SPARK_GAP = [0.12, 0.5]; // 火花の間隔 (s) の幅
const BROKEN_SPARK_COUNT = 5;
const COLLAPSE_SOUND_DELAY = 0.45; // 止まったときの沈み込む音は、砕ける一打（とどめの止まる時間）が明けてから鳴らす
// 踏みつけ: 足を上げる → 構えて止まる（床に踏む所の輪が出る）→ 踏み下ろす → 踏んだまま止まる
const STOMP_RANGE = 6.5; // 機体の足もとからこれより近づかれたら踏む
const STOMP_COOLDOWN = 3.5; // 踏み終えてから次に踏めるまで
const STOMP_LIFT = 0.5;
const STOMP_HOLD = 0.4;
const STOMP_DROP = 0.12;
const STOMP_RECOVER = 0.8;
const STOMP_HEIGHT = 2.3; // 足を上げる高さ
const STOMP_FWD = 2.0; // 踏む所を、立ち姿勢の足から前へずらせる限り（脚が届く所まで）
const STOMP_BACK = 0.6;
const STOMP_SIDE = 0.4;
const STOMP_RADIUS = 2.6; // 足の下でじかに踏まれる範囲
const STOMP_HIT_HIGH = 1.2; // 足もとからこれより高く跳んでいれば踏まれない
const STOMP_DAMAGE = 30;
const STOMP_PUSH = 9; // 踏まれたときに外へ弾き出す速さ
// 衝撃波: 踏んだ所から輪になって広がる。床に立っていると、輪が通り過ぎるときに足をすくわれる（跳べばかわせる）
const SHOCK_SPEED = 12;
const SHOCK_RANGE = 14;
const SHOCK_AMP = 0.9; // 床のマスを持ち上げる高さ（中心で）
const SHOCK_BAND = 0.7; // 輪の前後これだけの所にいると当たる
const SHOCK_DAMAGE = 12;
const SHOCK_PUSH = 5;
// 銃: 構える（砲口が赤く光る）→ 故障していない腕の砲から交互に撃つ → 間を置く
const GUN_FIRST = 2.5; // 現れてから最初に撃つまで
const GUN_COOLDOWN_MIN = 2.4; // 撃ち終えてから次に構えるまで
const GUN_COOLDOWN_MAX = 3.4;
const GUN_WINDUP = 0.7;
const GUN_INTERVAL = 0.09; // 1 発ごとの間
const GUN_AIM_RATE = 3.5; // 狙いがプレイヤーへ追いつく速さ（遅れるので、横へ動き続ければ外れる）
const GUN_SPREAD = 0.8 * DEG;
const GUN_BULLET_SPEED = 50; // 敵の銃撃役（40）より速く太い弾
const GUN_DAMAGE = 10;
const GUN_TRACER_LEN = 3;
const GUN_TRACER_WIDTH = 0.07;
const GUN_RECOIL = 0.22; // 撃ったときに砲を跳ね上げる角度 (rad)
const GUN_MUZZLE_Z = 2.6; // 砲の座標で砲口の前
const GUN_BARREL_Y = 0.17; // 上下 2 本の砲身
// 偏差射撃: 連射の GUN_LEAD_EVERY 発に 1 発、プレイヤーの動く先（弾が届くまでに進む所）を読んで狙う。読むのは動きの一部だけ
const GUN_LEAD_EVERY = 3;
const GUN_LEAD_AMOUNT = 0.5; // 動く先のうち、この割合だけ読む
const GUN_LEAD_VERTICAL = 0.5; // 上下の動きは、さらにこの割合だけ読む（跳んでいる最中の読みすぎを抑える）
// 薙ぎ払い射撃: 砲を横へ振りながら、腰の高さを扇の形に撃ち続けて弾の壁を作る（跳ぶか、パリィで抜ける）。払い方は 3 通り:
// 片払い（端から端へ。右からか左から）/ 挟み撃ち（両腕が左右の端から真ん中へ寄せる。最後に真ん中で重なる）/ 往復（端から端へ払って戻る）
const SWEEP_CHANCE = 0.4; // 構えるときに薙ぎ払いを選ぶ割合
const SWEEP_WINDUP = 1.0; // 普通の連射より長く構える（砲口の光が速く脈打つ）
const SWEEP_SHOTS_PER = 12; // 撃つ数 = 難易度の 1 本あたりの連射数 × これ
const SWEEP_INTERVAL = 0.04;
const SWEEP_KINDS = ['one', 'one', 'pinch', 'return']; // ここから選ぶ（片払いは右からと左からがあるので 2 つ）
const SWEEP_HALF = 40 * DEG; // プレイヤーの向きから左右へ振る角度
const SWEEP_HEIGHT = 0.7; // 床からこの高さを撃つ（跳べば下を通る）
const SWEEP_GUN_YAW = 0.9; // 薙ぎ払いで砲を胴体に対して横へ振れる限り (rad)
// ミサイルの一斉射: 胴体の上の発射口が赤く点滅する → 左右交互に打ち上げる
const MISSILE_FIRST = 8; // 現れてから最初に撃つまで
const MISSILE_COOLDOWN_MIN = 9;
const MISSILE_COOLDOWN_MAX = 12;
const MISSILE_RANGE_MIN = 10; // プレイヤーがこれより遠ければ撃つ
const MISSILE_WINDUP = 0.7;
const MISSILE_INTERVAL = 0.1;
const MISSILE_PORT_Y = 2.7; // 胴体の座標で発射口の高さ（天井の上）
const MISSILE_PORT_X = 0.55;
const MISSILE_PORT_Z = -0.45;
// 突進: 腰を落として足の噴射を吹かす → プレイヤーのいた所を少し越えるまで滑る → 噴射を切って止まる → 立て直す
const DASH_FIRST = 6; // 現れてから最初に突進できるまで
const DASH_COOLDOWN_MIN = 5;
const DASH_COOLDOWN_MAX = 7.5;
const DASH_RANGE_MIN = 9; // プレイヤーがこの距離より遠く、
const DASH_RANGE_MAX = 40; // この距離より近ければ突進する
const DASH_WINDUP = 1.1;
const DASH_LOCK = 0.75; // 構え始めてからこの時間で向きを決める（それまではプレイヤーを追う。決めたら短く鳴らして、滑る道を点滅させる）
const DASH_PATH_WIDTH = 3.6; // 床に出す、滑る道の幅
const DASH_TURN = 4; // 構えている間に向き直る速さ (rad/s)
const DASH_AIM_TURN = 2.5; // 向きを決めてから飛び出すまでの間は、この遅さでだけプレイヤーを追う（合図のあと横へ走れば外れる） (rad/s)
const DASH_SPEED = 80; // m/s
const DASH_OVERSHOOT = 12; // プレイヤーのいた所からさらに滑る距離
const DASH_MAX = 42;
const DASH_BRAKE = 160; // 止まるときの減速 (m/s²)
const DASH_RECOVER = 0.6;
const DASH_HIT_RADIUS = 2.6; // 機体の芯からこの距離に入ったら撥ねられる
const DASH_HIT_HIGH = 4; // 足もとからこれより高ければ当たらない（上を跳び越せる）
const DASH_HIT_SPEED = 8; // これより遅くなったら撥ねない
const DASH_DAMAGE = 25;
const DASH_PUSH = 14; // 撥ねたときに突進の向きへ飛ばす速さ
const DASH_SIDE_PUSH = 6; // 横へ逃がす速さ
// 壁への激突: 速いうちに柱や壁、ステージの端にぶつかったら、ぶつかった所の床が波打って衝撃波が広がり、機体は跳ね返ってよろめく
const DASH_CRASH_RECOVER = 1.4; // 激突してから立て直すまで（ふつうに止まったときより長い）
const DASH_CRASH_BOUNCE = 1.8; // 跳ね返って下がる距離
const DASH_CRASH_SLAM = {
    radius: 3.5, high: 2, damage: 20, push: 12, shake: 0.6, power: 1.8,
    quake: 1.1, range: 14, speed: 14, shock: 10,
};
// 残骸（投げ込まれた柱など）への衝突: 衝撃波は出さず、その場で止まって少しよろめき、しばらく隙を見せる（続けて突進しない）
const DASH_BUMP_RECOVER = 1.6; // ぶつかってから立て直すまで
const DASH_BUMP_BOUNCE = 0.4; // 跳ね返って下がる距離
// 上昇スタンプ: 腰を落とす → 背中の噴射で真上へ上がりながらプレイヤーの上へ移る → 空中で止まって狙う（床に落ちる所の輪）→
// 噴射を切って落ちる → 両足で床を打ち、大きな衝撃波 → しばらく動けない
const JUMP_FIRST = 10; // 現れてから最初に跳べるまで
const JUMP_COOLDOWN_MIN = 10;
const JUMP_COOLDOWN_MAX = 13;
const JUMP_RANGE_MIN = 8; // プレイヤーがこの距離より遠く、
const JUMP_RANGE_MAX = 30; // この距離より近ければ跳ぶ
const JUMP_CROUCH = 0.6;
const JUMP_RISE = 0.9;
const JUMP_HEIGHT = 12;
const JUMP_HOVER = 1.0;
const JUMP_LOCK = 0.7; // 止まってからこの時間で落ちる所を決める（それまではプレイヤーの上を追う）
const JUMP_TRACK = 12; // 空中でプレイヤーの上を追う速さ (m/s)
const JUMP_FALL_V0 = 8; // 落ち始めの速さ (m/s)
const JUMP_GRAVITY = 60;
const JUMP_RECOVER = 1.5; // 着いてから動けない時間
const JUMP_SLAM = {
    radius: 5, high: 1.5, damage: 40, push: 12, shake: 0.9, power: 1.6,
    quake: 1.4, range: 22, speed: 14, shock: 15,
};
// 足もとに張り付かれ続けたら、跳んで崩す（回り込んで叩き続けるのを崩す）。どちらかを選ぶ:
// 跳び払い: その場で低く跳んで、機体のまわりを両足で打つ / 飛び退き: 背中の噴射でプレイヤーから離れる向きへ跳んで間合いを取り、すぐ撃つ
const HOP_RANGE = 7; // この距離より近くにいる間、張り付かれている時間を数える
const HOP_PRESSURE = 3.5; // 張り付かれている時間がこれを超えたら跳ぶ（離れると半分の速さで減る。難易度では速めない）
const HOP_COOLDOWN = 8; // 跳んでから次に跳べるまで（難易度の頻度で縮む）
const BACK_CHANCE = 0.5; // 飛び退きを選ぶ割合（後ろに降りる所がなければ跳び払い）
const BACK_DISTS = [11, 8, 5]; // 飛び退く距離（遠い方から、降りられる所を探す）
const BACK_ANGLES = [0, 0.6, -0.6, 1.1, -1.1]; // 真後ろからずらして探す角度 (rad)
const BACK_GUN_DELAY = 0.3; // 降りてから、この時間で銃を構えられるようにする
// 飛び退きの着地: 床を軽く揺らすだけで、プレイヤーは打たない
const BACK_SLAM = {
    radius: 2.6, high: 0, damage: 0, push: 0, shake: 0, power: 0.7,
    quake: 0.45, range: 7, speed: 11, shock: 0,
};
const HOP_SLAM = {
    radius: 6.5, high: 1.2, damage: 22, push: 14, shake: 0.7, power: 1.2,
    quake: 0.9, range: 14, speed: 13, shock: 10,
};
// 隅への跳躍: ステージの四隅のうち、今いる所からいちばん近い隅を除いた中から 1 つを選んで跳び移り、降りたらすぐ遠くから撃つ
const CORNER_FIRST = 14; // 現れてから最初に跳べるまで
const CORNER_COOLDOWN_MIN = 13;
const CORNER_COOLDOWN_MAX = 17;
const CORNER_RANGE_MAX = 26; // プレイヤーがこの距離より近ければ跳ぶ（遠くにいるときは跳ばずに撃つ）
const CORNER_INSETS = [2, 5, 8]; // 動ける範囲の端からこれだけ内側を隅とする（柱や箱に重なれば、さらに内側を探す）
const CORNER_MISSILE_CHANCE = 0.4; // 降りてからミサイルを撃つ割合（ほかは銃）
const CORNER_FIRE_DELAY = 0.2; // 降りて立て直してから、この時間で撃ち始める
const CORNER_SLAM = {
    radius: 4, high: 1.2, damage: 20, push: 10, shake: 0.5, power: 1.1,
    quake: 0.8, range: 12, speed: 12, shock: 8,
};
// 連続突進: 突進して止まったら、短い構えでまた突進する（壁に激突したら続けない）
const DASH_CHAIN_MAX = 2; // 続けて突進する回数の上限
const DASH_CHAIN_WINDUP = 0.6;
const DASH_CHAIN_LOCK = 0.4;
// 後退しながら射撃: ふつうの連射の間、プレイヤーが近ければ、向いたまま後ろへ下がる
const BACKPEDAL_RANGE = 15; // プレイヤーがこれより近ければ下がる
const BACKPEDAL_SPEED = 4.5;
const BACKPEDAL_ROOM = 3; // 後ろにこれだけ空きがなければ下がらない
// 横ステップ: 部位を続けて削られたときや、連射の途中で、かかとの噴射で横へ素早く滑る
const SIDE_FIRST = 4;
const SIDE_COOLDOWN = 5;
const SIDE_HITS = 4; // 部位をこれだけ続けて削られたら跳ぶ（1 秒に 0.7 ずつ減る）
const SIDE_GUN_CHANCE = 0.35; // 連射の途中で横へ動く割合
const SIDE_DIST = 7;
const SIDE_TIME = 0.35;
// 床の隆起ライン: 腰を落として溜める（床にプレイヤーへ向かう線を出す）→ 床を打つと、線に沿って床のマスが次々に突き上がりながら走る
// （横へよけるか、跳び越す）。本数は難易度で変わり、扇の形に広がる
const RIFT_FIRST = 7;
const RIFT_COOLDOWN_MIN = 7;
const RIFT_COOLDOWN_MAX = 10;
const RIFT_RANGE_MIN = 7;
const RIFT_RANGE_MAX = 32;
const RIFT_WINDUP = 0.85;
const RIFT_LOCK = 0.55; // 構え始めてからこの時間で線の向きを決める（それまではプレイヤーへ向き直る）
const RIFT_RECOVER = 0.6;
const RIFT_SPREAD = 18 * DEG; // 隣り合う線の開き
const RIFT_SPEED = 32; // 突き上がりが走る速さ (m/s)
const RIFT_LENGTH = 34;
const RIFT_START = 2; // 機体の足もとからこれだけ前から走り出す
const RIFT_WIDTH = 0.9; // 線からこの距離に入ったら当たる
const RIFT_HIGH = 0.9; // 足がこれより高ければ当たらない（跳び越せる）
const RIFT_DAMAGE = 18;
const RIFT_LAUNCH = 9; // 当たったら突き上げる速さ
const RIFT_SPIKE = 1.8; // マスが突き上がる高さ
const RIFT_SPIKE_LIFE = 0.8;
const RIFT_PATH_WIDTH = 1.6; // 床に出す線の幅
// 増援を呼ぶ: 立ち止まって胴体を反らせ、背中の発射口から信号弾を真上へ打ち上げる。空で弾けたら、銃撃役が出現位置から起き上がる。
// 倒すと回復できるので、ボス戦での回復の機会にする（呼んだ敵が残っている間は呼ばない。頻度に難易度の rate は掛けない）
const CALL_FIRST = 14;
const CALL_COOLDOWN_MIN = 20;
const CALL_COOLDOWN_MAX = 28;
const CALL_WINDUP = 0.9;
const CALL_RECOVER = 0.7;
const CALL_RANGE_MIN = 6; // これより近く寄られていたら呼ばない
const SIGNAL_SPEED = 34; // 信号弾が昇る速さ (m/s)
const SIGNAL_TIME = 0.75; // 打ち上げてから弾けるまで
// 腕の薙ぎ払い（近接）: 足もとまで寄られたとき、踏みつけの代わりに出す。胴体をひねって溜め → 両腕の砲で横へ薙ぐ
// （跳ぶか、後ろへ下がってよける）
const SWIPE_CHANCE = 0.5; // 踏みつけの代わりに出す割合
const SWIPE_FRONT = 80 * DEG; // プレイヤーがこの角度より正面寄りにいるときだけ
const SWIPE_WINDUP = 0.7;
const SWIPE_WARN_BLINK = 0.25; // 薙ぐこの時間前から、床の扇を点滅させる
const SWIPE_SWING = 0.22;
const SWIPE_RECOVER = 0.6;
const SWIPE_TWIST = 1.3; // ひねる角度 (rad)。溜めでは片側へ、薙ぐと反対側まで回す
const SWIPE_REACH = 7.5;
const SWIPE_HIGH = 1.1; // 足がこれより高ければ当たらない
const SWIPE_DAMAGE = 25;
const SWIPE_PUSH = 14;
const SWIPE_LIFT = 5;
// レーザー照射: 砲から細い照準線を出してプレイヤーを追う → 太いレーザーを撃ちながら、ゆっくり横へ振る
// （柱の陰に隠れるか、跳んで下をくぐる）
const LASER_FIRST = 12;
const LASER_COOLDOWN_MIN = 9;
const LASER_COOLDOWN_MAX = 12;
const LASER_RANGE_MIN = 10;
const LASER_RANGE_MAX = 45;
const LASER_AIM = 1.2; // 照準線を出している時間
const LASER_LOCK = 0.9; // 構え始めてからこの時間で向きを決める（照準線が点滅する）
const LASER_FIRE = 2.2; // 撃ち続ける時間
const LASER_BROKEN_FIRE = 0.6; // 故障した腕では、撃ち続ける時間がこれだけになる
const LASER_RECOVER = 0.6;
const LASER_SWEEP = 0.7; // 決めた向きから、片側のこの角度から反対側のこの角度まで振る (rad)
const LASER_HEIGHT = 0.7; // プレイヤーの足もとからこの高さを狙う（跳べば下をくぐれる）
const LASER_LEN = 70;
const LASER_RADIUS = 0.45; // 光線からこの距離に体が入ったら当たる
const LASER_DAMAGE = 22;
const LASER_HIT_EVERY = 0.5; // 当たり続けているときに、また削るまで
// 柱投げ: 広場の外のビルの屋上へ跳び乗る → 屋上から柱をもぎ取って頭の上へ持ち上げる → プレイヤーのいる所（床に輪）へ投げ込む →
// 柱は床に突き立って壊れる柱（隠れる場所）になる → 広場へ跳び戻る
const THROW_FIRST = 15;
const THROW_COOLDOWN_MIN = 16;
const THROW_COOLDOWN_MAX = 22;
const THROW_MAX_PILLARS = 6; // 立っている柱がこれだけあれば投げない
const THROW_CROUCH = 0.6;
const THROW_LEAP_BASE = 0.45; // 跳ぶ時間 = これ + 距離 × THROW_LEAP_PER_M
const THROW_LEAP_PER_M = 1 / 75;
const THROW_LEAP_APEX = 5; // 跳ぶ弧の高さ（高い方の端から）
const THROW_LAND = 0.4; // 屋上に降りてから、柱に手をかけるまで
const THROW_RIP = 1.0; // 柱をもぎ取って持ち上げる時間
const THROW_AIM = 0.8; // 狙う時間
const THROW_LOCK = 0.5; // 狙い始めてからこの時間で落ちる所を決める（短く鳴らす）
const THROW_SPEED = 60; // 柱が飛ぶ横の速さ (m/s)。飛ぶ時間は距離で決まる
const THROW_FLIGHT_MIN = 0.4;
const THROW_FLIGHT_MAX = 0.9;
const THROW_GRAVITY = 60; // 柱にかかる重力（放物線で飛ぶ。速く飛ばしても弧が潰れないよう強める）
const THROW_TURN = 0.15; // 手を離してから、柱の向きが飛ぶ向きにそろうまで
const THROW_SETTLE = 0.12; // 突き立つ前のこの時間で、突き立つ向きへそろえる
const THROW_AFTER = 0.3; // 柱が突き立ってから跳び戻るまで
const THROW_RECOVER = 0.6;
const THROW_HOLD_Y = 7.5; // 持ち上げた柱の高さ（足もとから）
const PERCH_OUT = [4, 9]; // 跳び乗る所: 動ける範囲の端からこれだけ外（ビルの屋上）
const PERCH_MIN_H = 6; // これより低い所には跳び乗らない
const PERCH_MAX_H = 40;
const PERCH_FLAT = 1.6; // この距離のまわりも同じ高さなら、屋上とみなす
const PERCH_TRIES = 40;
const THROW_RETURN_IN = 7; // 跳び戻る所: 動ける範囲の端からこれだけ内側
// 柱が突き立つ: 真下にいれば打たれ、まわりへ衝撃波
const THROW_SLAM = {
    radius: 2.8, high: 2, damage: 30, push: 12, shake: 0.6, power: 1.4,
    quake: 0.9, range: 12, speed: 13, shock: 10,
};
// 必殺技: ステージの真ん中へ跳び移る → 腰を落として砲口を強く光らせて溜める → その場で何度も跳んでは床を打って衝撃波を出しながら、
// プレイヤーへ向き直って両腕の砲で撃ち続ける（衝撃波は跳んでかわし、弾は横へ走るか柱の陰に隠れるかパリィで抜ける）→ 熱を逃がして、しばらく動けない。
// 起き上がった直後と、決まった間隔で出す
const ULT_FIRST = 35; // 現れてから最初に出すまで（難易度の頻度では速めない）
const ULT_COOLDOWN_MIN = 45;
const ULT_COOLDOWN_MAX = 55;
const ULT_CENTER_STEPS = [0, 3, 6, 9]; // 真ん中が柱や箱に重なれば、これだけ離れた所を探す
const ULT_CHARGE = 1.5; // 溜める時間
const ULT_TIME = 5.5; // 撃ち続ける時間
const ULT_COOL = 2.5; // 撃ち終えてから動けない時間
const ULT_TURN = 3.4; // プレイヤーへ向き直る速さ (rad/s)
const ULT_INTERVAL = 0.03; // 撃つ間隔（両腕を交互に）
const ULT_BURST_ON = 0.6; // 撃つ時間と、
const ULT_BURST_OFF = 0.35; // 止める時間を繰り返す
const ULT_SPREAD = 1.5; // 弾の散らばり（ふつうの連射に対する倍率）
const ULT_SOUND_EVERY = 3; // 撃つ音はこの数に 1 回だけ鳴らす
const ULT_HOP_EVERY = 1.4; // 跳ぶ間隔（溜め・空中・着地の立て直しを含む）
const ULT_HOP_CROUCH = 0.3; // 跳ぶ前に腰を落とす時間
const ULT_HOP_AIR = 0.65; // 空中にいる時間
const ULT_HOP_HEIGHT = 4; // 跳ぶ高さ
const ULT_SLAM = {
    radius: 4.5, high: 1.2, damage: 20, push: 12, shake: 0.5, power: 1.2,
    quake: 1.0, range: 24, speed: 15, shock: 12,
};
// ハードでは、跳ぶたびの衝撃波をステージ全体へ広げる（range は spawnBoss でステージの広さに合わせる）
const ULT_WIDE_SLAM = { ...ULT_SLAM, quake: 1.2, range: 60, speed: 22 };
// 真ん中への跳び移り
const CENTER_SLAM = {
    radius: 5, high: 1.5, damage: 25, push: 12, shake: 0.8, power: 1.5,
    quake: 1.2, range: 20, speed: 14, shock: 12,
};
// 地響きの大跳躍（ノーマルとハードだけ）: プレイヤーから遠いどこかへ大きく跳び移り、着いたら床全体に衝撃波が素早く広がる
// （衝撃波が足もとを通る瞬間に跳んでかわす。箱の上にいても当たらない）
const QUAKE_FIRST = 18;
const QUAKE_COOLDOWN_MIN = 16;
const QUAKE_COOLDOWN_MAX = 22;
const QUAKE_TRIES = 24; // 跳び移る所の候補の数
const QUAKE_AWAY = 12; // プレイヤーからこれより離れた所を選ぶ（なければいちばん遠い所）
const QUAKE_POP = 0.35; // 空中で止まっている最後のこの時間、噴射で少し上へ跳ね上がって勢いをつける
const QUAKE_POP_HEIGHT = 2;
const QUAKE_DIVE_V0 = 40; // 背中の噴射で床へ突っ込む、落ち始めの速さ (m/s)
const QUAKE_DIVE_GRAVITY = 140;
const QUAKE_WARN_SPACING = 4; // 床に出す衝撃波の予告の輪の間隔 (m)
const QUAKE_WARN_SPEED = 6; // 予告の輪が外へ流れる速さ (m/s)
const QUAKE_WARN_RINGS = 20;
const QUAKE_SLAM = {
    radius: 6, high: 1.5, damage: 35, push: 14, shake: 1, power: 2.2,
    quake: 1.5, range: 60, speed: 30, shock: 22, // range はステージの広さに合わせて spawnBoss で決める
};
const JUMP_HIGH = {
    crouch: JUMP_CROUCH, rise: JUMP_RISE, height: JUMP_HEIGHT, hover: JUMP_HOVER, lock: JUMP_LOCK, track: true, warn: true, back: false,
    recover: JUMP_RECOVER, slam: JUMP_SLAM,
};
const JUMP_HOP = {
    crouch: 0.55, rise: 0.4, height: 4.5, hover: 0.15, lock: 0, track: false, warn: true, back: false, recover: 0.7, slam: HOP_SLAM,
};
const JUMP_BACK = {
    crouch: 0.35, rise: 0.55, height: 3.5, hover: 0, lock: 0, track: false, warn: false, back: true, recover: 0.45, slam: BACK_SLAM,
};
const JUMP_CORNER = {
    crouch: 0.5, rise: 1.2, height: 8, hover: 0.25, lock: 0, track: false, warn: true, back: false, corner: true, recover: 0.5, slam: CORNER_SLAM,
};
const JUMP_CENTER = {
    crouch: 0.7, rise: 1.2, height: 11, hover: 0.4, lock: 0, track: false, warn: true, back: false, center: true, recover: 0.3, slam: CENTER_SLAM,
};
const JUMP_FAR = {
    crouch: 0.8, rise: 1.3, height: 15, hover: 0.5, lock: 0, track: false, warn: true, back: false, far: true, dive: true, recover: 1.2, slam: QUAKE_SLAM,
};
const newFoot = () => ({ pos: new THREE.Vector3(), yaw: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), fromYaw: 0, toYaw: 0, t: -1 });
export const boss = {
    rig: null,
    pos: new THREE.Vector3(), // 足もと
    yaw: 0, // 向き（+Z が 0、+X へ回すと正）
    yawVel: 0, // 向き直る速さ (rad/s)
    speed: 0, // 前へ進む速さ
    twist: 0, // 胴体のひねり
    roll: 0, // 歩くときに胴体を左右へ傾ける量
    poseHip: { x: 0, v: 0 }, // 見た目の腰の高さ（ばね）
    poseLean: { x: 0, v: 0 }, // 見た目の胴体の倒し方（ばね）
    aimPitch: 0, // 砲を上げる角度
    idleT: 0, // 止まってからの時間
    feet: [newFoot(), newFoot()], // [0] が右脚
    block: null, // 当たり判定の箱（blocks に入れてある）
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    limbs: Object.fromEntries(BOSS_LIMBS.map((k) => [k, { hp: BOSS_LIMB_HP, broken: false }])),
    coreHp: BOSS_CORE_HP,
    limbMax: BOSS_LIMB_HP, // 難易度を掛けた体力の最大
    coreMax: BOSS_CORE_HP,
    rate: 1, // 難易度の攻撃の頻度（BOSS_DIFFICULTY の rate）
    bulletSpeed: 1, // 難易度の弾の速さの倍率
    shotsPerArm: 3, // 1 回の連射で腕 1 本が撃つ数
    missileCount: 4, // 一斉射で打ち上げる数
    damage: 1, // プレイヤーが受けるダメージの倍率
    dashSpeed: 1, // 突進の速さの倍率
    ultRate: 1, // 必殺技で撃つ数の倍率
    lead: true, // 偏差射撃をするか
    riftLines: 3, // 隆起ラインの本数
    dashChain: 0.5, // 突進のあとに続けてもう一度突進する割合
    bigQuake: true, // 地響きの大跳躍をするか
    ultWide: false, // 必殺技で跳ぶたびの衝撃波をステージ全体へ広げるか
    rage: 1, // 本体の体力が半分を切ったら、攻撃の頻度にさらに掛ける倍率
    enraged: false, // 本体の体力が半分を切った
    phase: 'walk',
    phaseT: 0, // 今の段に入ってからの時間
    hip: 0, // 腰を下げている量（しゃがみ込み）
    lean: 0, // 胴体を余分に前へ倒している量
    droop: [0, 0], // 両腕の砲を垂らしている角度（[0] が右）
    sparkT: { armR: 0, armL: 0, legR: 0, legL: 0 }, // 故障した部位が次に火花を出すまでの時間
    flash: { armR: FLASH_TIME, armL: FLASH_TIME, legR: FLASH_TIME, legL: FLASH_TIME, core: FLASH_TIME }, // 部位ごとに、最後に当たってからの時間
    // 踏みつけ（leg = 踏む脚の番号。-1 なら踏んでいない）
    stomp: { leg: -1, t: 0, from: new THREE.Vector3(), at: new THREE.Vector3(), cd: 0 },
    stompHip: 0, // 踏みつけで腰を沈める量
    stompLean: 0, // 踏みつけで胴体を前後へ倒す量
    shocks: [], // 広がっている衝撃波（slam = 床を打った強さ）
    // 銃（t = 構え始めてからの時間。-1 なら撃っていない。shots = 残りの弾数、next = 次に撃つ時刻、n = 撃った数。
    // sweep なら薙ぎ払い: kind = 払い方、yaw・dist・y = 扇の真ん中の向き・距離・床の高さ（撃ち始めに決める）、side = 振る向き。
    // armLeft = 腕ごとの残りの弾数、armN = 腕ごとに撃った数）
    gun: { t: -1, cd: 0, shots: 0, next: 0, n: 0, sweep: false, kind: 'one', yaw: 0, dist: 0, y: 0, side: 1, armLeft: [0, 0], armN: [0, 0] },
    aim: new THREE.Vector3(), // 砲が狙っている所（プレイヤーの胸を遅れて追う）
    recoil: [0, 0], // 両腕の砲の跳ね上がり
    gunYaw: [0, 0], // 薙ぎ払いで両腕の砲を横へ振っている角度（胴体に対して）
    sweepAim: [0, 0], // 薙ぎ払いで両腕がいま撃っている向き（世界）
    // ミサイルの一斉射（t = 構え始めてからの時間。-1 なら撃っていない。left = 残りの数、next = 次に撃つ時刻、n = 撃った数）
    missile: { t: -1, cd: 0, left: 0, next: 0, n: 0 },
    // 突進（stage: -1 = していない / 0 = 構え / 1 = 滑る / 2 = 止まる / 3 = 立て直す。left = 滑る残りの距離、v = 速さ）
    // crash = 壁に激突した、bump = 残骸にぶつかった、windup・lock = 今の構えの長さと向きを決める時刻、chain = 続けて突進する残りの回数
    dash: { stage: -1, t: 0, left: 0, len: 0, v: 0, dir: new THREE.Vector3(), hit: false, cd: 0, spark: 0, crash: false, bump: false, windup: DASH_WINDUP, lock: DASH_LOCK, chain: 0 },
    dashHip: 0,
    dashLean: 0,
    jet: 0, // 足の噴射の強さ
    // 上昇スタンプ（stage: -1 = していない / 0 = 腰を落とす / 1 = 上がる / 2 = 狙う / 3 = 落ちる / 4 = 立て直す。
    // from = 跳んだ所、to = 落ちる所、v = 落ちる速さ。cornerCd = 隅への跳躍の残りの待ち時間）
    jump: { stage: -1, t: 0, cd: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), v: 0, kind: JUMP_HIGH, hopCd: 0, close: 0, cornerCd: 0, quakeCd: 0 },
    jumpHip: 0,
    jumpLean: 0,
    backJet: 0, // 背中の噴射の強さ
    // 必殺技（stage: -1 = していない / 0 = 溜める / 1 = 跳びながら撃つ / 2 = 熱を逃がす。pending = 次に動けるときに出す、
    // next = 次に撃つ時刻、n = 撃った数、hop = 跳んだ数）
    ult: { stage: -1, t: 0, cd: 0, pending: false, next: 0, n: 0, hop: 0 },
    ultHip: 0,
    ultLean: 0,
    // 横ステップ（t = 滑り始めてからの時間。-1 なら滑っていない。pressure = 続けて削られた数、gunRoll = 今の連射の途中で動くか）
    side: { t: -1, cd: 0, pressure: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), gunRoll: false, gunWas: false },
    // 隆起ライン（stage: -1 = していない / 0 = 溜める / 1 = 立て直す。yaw = 線の真ん中の向き）
    rift: { stage: -1, t: 0, cd: 0, yaw: 0 },
    // 腕の薙ぎ払い（stage: -1 = していない / 0 = 溜める / 1 = 薙ぐ / 2 = 立て直す。side = 溜めでひねる向き）
    swipe: { stage: -1, t: 0, side: 1, hit: false },
    swipeTwist: 0,
    standHip: 0, // 立ち止まって出す攻撃で腰を下げる量
    standLean: 0, // 立ち止まって出す攻撃で胴体を倒す量
    // 増援を呼ぶ（stage: -1 = していない / 0 = 溜める / 1 = 立て直す）
    call: { stage: -1, t: 0, cd: 0 },
    adds: 2, // 増援で呼ぶ数
    // レーザー（stage: -1 = していない / 0 = 狙う / 1 = 撃つ / 2 = 立て直す。arm = 撃つ腕、yaw・pitch = 決めた向き、
    // side = 振る向き、fire = 撃ち続ける時間、hitCd = 次に削れるまで、gunYaw = 砲を横へ振る角度）
    laser: { stage: -1, t: 0, cd: 0, arm: 0, yaw: 0, pitch: 0, side: 1, fire: 0, hitCd: 0, gunYaw: 0 },
    // 柱投げ（stage: -1 = していない / 0 = 腰を落とす / 1 = 屋上へ跳ぶ / 2 = 降りる / 3 = もぎ取る / 4 = 狙う / 5 = 投げた柱が飛ぶ /
    // 6 = 待つ / 7 = 広場へ跳び戻る / 8 = 立て直す。from・to = 跳ぶ両端、dur = 跳ぶ時間、target = 柱が突き立つ所、fly = 柱の飛び始め）
    thr: {
        stage: -1, t: 0, cd: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), dur: 1, target: new THREE.Vector3(), fly: new THREE.Vector3(),
        vel: new THREE.Vector3(), flight: 1, up: new THREE.Vector3(0, 1, 0), // 柱を投げた初めの速さ、飛ぶ時間、突き立ったときの上の端の向き
        kind: THROWN.pillar, // 投げる物（柱・H 形鋼・床の板・瓦礫の塊）
    },
    arena: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, // ステージの動ける範囲（端の余白を引く前）
    entering: false, // 登場の演出で、砲を向けるまで（体力の表示を隠す）
};
// 足のかかとの噴射の炎（根元が噴射口で、後ろへ伸びる）
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const flameGeo = new THREE.ConeGeometry(0.2, 1, 10).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
const flames = [];
// 背中の噴射口の炎（真下へ伸びる）。噴射口の出口は胴体の座標で (±0.5, 0.71, -1.11)（enemy/mech.ts の背中の噴射口）
const backFlameGeo = new THREE.ConeGeometry(0.3, 1, 12).rotateX(Math.PI).translate(0, -0.5, 0);
const backFlames = [];
// 砲口の光（構えると赤く灯り、撃つと強く光る）
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const glowGeo = new THREE.SphereGeometry(1, 12, 8);
const glows = []; // 砲ごとに上下 2 つ
const portGlows = []; // ミサイルの発射口の光（左右）
// 踏む所の輪（床に置く）
const RING_COLOR = 0xc0392b;
const ringMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
const ringFillMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
const stompRing = new THREE.Group();
{
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), ringMat);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), ringFillMat);
    for (const m of [edge, fill]) {
        m.rotation.x = -Math.PI / 2;
        stompRing.add(m);
    }
    stompRing.visible = false;
}
// 地響きの衝撃波の予告の輪（床に置く。輪ごとに濃さを変える）
const quakeWarn = (() => {
    const group = new THREE.Group();
    const geo = new THREE.RingGeometry(0.985, 1, 128);
    const mats = [];
    const rings = [];
    for (let i = 0; i < QUAKE_WARN_RINGS; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        group.add(m);
        mats.push(mat);
        rings.push(m);
    }
    group.visible = false;
    return { group, mats, rings };
})();
// 上昇スタンプで落ちる所の輪（床に置く）
const jumpRing = (() => {
    const edgeMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
    const fillMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
    const group = new THREE.Group();
    for (const m of [new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), edgeMat), new THREE.Mesh(new THREE.CircleGeometry(1, 96), fillMat)]) {
        m.rotation.x = -Math.PI / 2;
        group.add(m);
    }
    group.visible = false;
    return { group, edgeMat, fillMat };
})();
// 突進で滑る道（床に置く。機体の足もとから前へ、滑る距離だけ伸ばす）
const pathFillMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
const pathEdgeMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
const dashPath = new THREE.Group();
{
    const plane = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); // 原点から +Z へ伸びる
    dashPath.add(new THREE.Mesh(plane(), pathFillMat));
    for (const x of [-0.5, 0.5]) {
        const edge = new THREE.Mesh(plane(), pathEdgeMat);
        edge.scale.x = 0.03;
        edge.position.x = x;
        dashPath.add(edge);
    }
    dashPath.visible = false;
}
// ステージから外す（ステージへ入るたびに呼ぶ。blocks は呼ぶ側で空にしてある）
export function clearBoss() {
    clearMissiles();
    wreck.length = 0;
    death.blown = false;
    sfx.setBossJet(0);
    boss.rig = null;
    boss.block = null;
}
// 機体を作って parent に置き、当たり判定の箱を blocks に足す。bounds はステージの動ける範囲。
// at.breach は登場で突き破る外壁（wall はその壊れる前と後を描いたもの。突き破ったら入れ替える）
export function spawnBoss(parent, at, bounds, wall = null, partySize = 1) {
    attachChunks(parent);
    attachFloorMarks(parent);
    attachPillars(parent);
    boss.arena = { ...bounds };
    scatterRubble(bounds.minX + 2, bounds.maxX - 2, bounds.minZ + 2, bounds.maxZ - 2, SCATTER_RUBBLE);
    const rig = buildMech();
    parent.add(rig.root);
    boss.rig = rig;
    boss.pos.set(at.x, 0, at.z);
    lastPos.copy(boss.pos);
    boss.yaw = at.yaw ?? 0;
    boss.speed = 0;
    boss.twist = 0;
    boss.aimPitch = 0;
    boss.idleT = 0;
    boss.phase = 'walk';
    boss.phaseT = 0;
    boss.hip = 0;
    boss.lean = 0;
    boss.droop = [0, 0];
    for (const k in boss.flash)
        boss.flash[k] = FLASH_TIME;
    boss.bounds = { minX: bounds.minX + BOUNDS_MARGIN, maxX: bounds.maxX - BOUNDS_MARGIN, minZ: bounds.minZ + BOUNDS_MARGIN, maxZ: bounds.maxZ - BOUNDS_MARGIN };
    const level = BOSS_DIFFICULTY[game.difficulty];
    boss.limbMax = BOSS_LIMB_HP * level.hp * partySize;
    boss.coreMax = BOSS_CORE_HP * level.hp * partySize;
    boss.rate = level.rate;
    boss.bulletSpeed = level.bullet;
    boss.shotsPerArm = level.shots;
    boss.missileCount = level.missiles;
    boss.damage = level.damage;
    boss.dashSpeed = level.dash;
    boss.ultRate = level.ult;
    boss.lead = level.lead;
    boss.riftLines = level.rift;
    boss.dashChain = level.chain;
    boss.bigQuake = level.quake;
    // 地響きの衝撃波は、ステージの端から端まで届かせる
    QUAKE_SLAM.range = ULT_WIDE_SLAM.range = ENTER_SLAM.range = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    boss.ultWide = level.ultWide;
    boss.rage = level.rage;
    boss.adds = level.adds;
    boss.enraged = false;
    for (const k of BOSS_LIMBS)
        boss.limbs[k] = { hp: boss.limbMax, broken: false };
    boss.coreHp = boss.coreMax;
    boss.stomp.leg = -1;
    boss.stomp.cd = STOMP_COOLDOWN;
    boss.stompHip = boss.stompLean = 0;
    boss.shocks.length = 0;
    stompRing.visible = false;
    boss.gun = { t: -1, cd: GUN_FIRST, shots: 0, next: 0, n: 0, sweep: false, kind: 'one', yaw: 0, dist: 0, y: 0, side: 1, armLeft: [0, 0], armN: [0, 0] };
    boss.recoil = [0, 0];
    boss.gunYaw = [0, 0];
    boss.missile = { t: -1, cd: MISSILE_FIRST, left: 0, next: 0, n: 0 };
    clearMissiles();
    portGlows.length = 0;
    for (const x of [-MISSILE_PORT_X, MISSILE_PORT_X]) {
        const m = new THREE.Mesh(glowGeo, glowMat);
        m.position.set(x, MISSILE_PORT_Y - 0.1, MISSILE_PORT_Z);
        m.raycast = () => { };
        m.visible = false;
        rig.torso.add(m);
        portGlows.push(m);
    }
    aimTarget(boss.aim);
    glows.length = 0;
    for (const gun of rig.guns) {
        const pair = [GUN_BARREL_Y, -GUN_BARREL_Y].map((y) => {
            const m = new THREE.Mesh(glowGeo, glowMat);
            m.position.set(0, y, GUN_MUZZLE_Z - 0.05);
            m.raycast = () => { }; // 当たりには数えない
            m.visible = false;
            gun.add(m);
            return m;
        });
        glows.push(pair);
    }
    parent.add(stompRing);
    attachQuake(parent);
    boss.dash = {
        stage: -1, t: 0, left: 0, len: 0, v: 0, dir: new THREE.Vector3(), hit: false, cd: DASH_FIRST, spark: 0, crash: false, bump: false, windup: DASH_WINDUP, lock: DASH_LOCK, chain: 0,
    };
    dashPath.visible = false;
    parent.add(dashPath);
    boss.dashHip = boss.dashLean = boss.jet = 0;
    flames.length = 0;
    for (const leg of rig.legs) {
        const m = new THREE.Mesh(flameGeo, flameMat);
        m.position.set(0, -0.1, -0.84); // かかとの噴射口
        m.raycast = () => { };
        m.visible = false;
        leg.foot.add(m);
        flames.push(m);
    }
    boss.jump = {
        stage: -1, t: 0, cd: JUMP_FIRST, from: new THREE.Vector3(), to: new THREE.Vector3(), v: 0, kind: JUMP_HIGH, hopCd: HOP_COOLDOWN, close: 0, cornerCd: CORNER_FIRST, quakeCd: QUAKE_FIRST,
    };
    boss.jumpHip = boss.jumpLean = boss.backJet = 0;
    boss.ult = { stage: -1, t: 0, cd: ULT_FIRST, pending: false, next: 0, n: 0, hop: 0 };
    boss.ultHip = boss.ultLean = 0;
    boss.side = { t: -1, cd: SIDE_FIRST, pressure: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), gunRoll: false, gunWas: false };
    boss.rift = { stage: -1, t: 0, cd: RIFT_FIRST, yaw: 0 };
    rifts.length = 0;
    for (const m of riftPaths)
        parent.add(m.group);
    boss.swipe = { stage: -1, t: 0, side: 1, hit: false };
    boss.call = { stage: -1, t: 0, cd: CALL_FIRST };
    signal.t = -1;
    signal.mesh.visible = false;
    parent.add(signal.mesh);
    boss.swipeTwist = boss.standHip = boss.standLean = 0;
    boss.yawVel = boss.roll = 0;
    boss.laser = { stage: -1, t: 0, cd: LASER_FIRST, arm: 0, yaw: 0, pitch: 0, side: 1, fire: 0, hitCd: 0, gunYaw: 0 };
    boss.thr.stage = -1;
    boss.thr.cd = THROW_FIRST;
    heldPillar.visible = false;
    parent.add(heldPillar);
    parent.add(laserAim, laserBeam, swipeFan.group);
    jumpRing.group.visible = false;
    parent.add(jumpRing.group);
    quakeWarn.group.visible = false;
    parent.add(quakeWarn.group);
    backFlames.length = 0;
    for (const x of [-0.5, 0.5]) {
        const m = new THREE.Mesh(backFlameGeo, flameMat);
        m.position.set(x, 0.71, -1.11);
        m.rotation.x = -TORSO_LEAN; // 噴射口と同じく真下へ
        m.raycast = () => { };
        m.visible = false;
        rig.torso.add(m);
        backFlames.push(m);
    }
    rig.legs.forEach((leg, i) => {
        const f = boss.feet[i];
        const { B } = legRest(leg.side);
        toWorld(B.x, B.z, f.pos);
        f.pos.y = B.y;
        f.yaw = boss.yaw;
        f.t = -1;
    });
    boss.block = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: BODY_TOP, noRay: true };
    blocks.push(boss.block);
    holdEntrance(wall, at.breach);
    updateBlock();
    poseRig();
    return rig.root;
}
// 機体の座標 (x, z) を世界の座標へ
function toWorld(x, z, out) {
    const c = Math.cos(boss.yaw);
    const s = Math.sin(boss.yaw);
    return out.set(boss.pos.x + x * c + z * s, 0, boss.pos.z - x * s + z * c);
}
const local = new THREE.Vector3();
function toLocal(p, out) {
    const c = Math.cos(boss.yaw);
    const s = Math.sin(boss.yaw);
    const dx = p.x - boss.pos.x;
    const dz = p.z - boss.pos.z;
    return out.set(dx * c - dz * s, p.y - boss.pos.y, dx * s + dz * c);
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const legOf = (i) => (i === 0 ? 'legR' : 'legL'); // 脚の番号（[0] が右）の部位
// 機体のいる向きの左右と距離から、音の左右と大きさを決める（at を省くと機体の足もと）
const panTmp = new THREE.Vector3();
function soundAt(at = boss.pos) {
    camera.updateMatrixWorld();
    panTmp.copy(at).applyMatrix4(camera.matrixWorldInverse);
    const pan = THREE.MathUtils.clamp(panTmp.x / Math.max(Math.hypot(panTmp.x, panTmp.z), 1e-3), -1, 1) * 0.6;
    const d = Math.hypot(at.x - position.x, at.z - position.z);
    return { volume: THREE.MathUtils.clamp(10 / Math.max(d, 1), 0.3, 1), pan };
}
// 機体が柱に重なったら（歩いて・滑って・降りて）、体ごと押し崩す
const smashAt = new THREE.Vector3();
const lastPos = new THREE.Vector3(); // 前のフレームの機体の位置
function smashPillars() {
    const r = BODY_HALF * 0.8;
    for (const b of blocks) {
        if (!isPillar(b) || boss.pos.y > b.h)
            continue;
        if (boss.pos.x + r < b.minX || boss.pos.x - r > b.maxX || boss.pos.z + r < b.minZ || boss.pos.z - r > b.maxZ)
            continue;
        damagePillar(b, Infinity, smashAt.set((b.minX + b.maxX) / 2, 2, (b.minZ + b.maxZ) / 2));
    }
}
function updateBlock() {
    const b = boss.block;
    b.minX = boss.pos.x - BODY_HALF;
    b.maxX = boss.pos.x + BODY_HALF;
    b.minZ = boss.pos.z - BODY_HALF;
    b.maxZ = boss.pos.z + BODY_HALF;
    b.y0 = boss.pos.y; // 跳んでいる間は箱ごと持ち上げる
    b.h = boss.pos.y + BODY_TOP;
}
// 機体が動いて重なったプレイヤーを、いちばん浅い向きへ押し出す（上に乗っているときは押さない）
function pushPlayer() {
    const b = boss.block;
    if (position.y >= b.h - 0.1 || position.y + 1.8 <= (b.y0 ?? 0))
        return; // 上に乗っている・下をくぐっている
    const r = PLAYER_RADIUS;
    const px = [position.x - (b.minX - r), b.maxX + r - position.x];
    const pz = [position.z - (b.minZ - r), b.maxZ + r - position.z];
    if (Math.min(...px, ...pz) <= 0)
        return;
    const m = Math.min(...px, ...pz);
    if (m === px[0])
        position.x = b.minX - r;
    else if (m === px[1])
        position.x = b.maxX + r;
    else if (m === pz[0])
        position.z = b.minZ - r;
    else
        position.z = b.maxZ + r;
}
// 通信で受け取った機体の位置に、体の当たりを合わせる。
export function updateRemoteBossCollision() {
    if (!boss.block || !boss.rig?.root.visible)
        return;
    updateBlock();
    pushPlayer();
}
const fwd = new THREE.Vector3();
const target = new THREE.Vector3();
const targetPlayer = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), eye: EYE_HEIGHT, alive: true };
function selectBossTarget() {
    targetPlayer.pos.copy(position);
    targetPlayer.vel.copy(velocity);
    targetPlayer.eye = player.eyeHeight;
    targetPlayer.alive = game.playerHp > 0;
    let best = targetPlayer.alive ? Math.hypot(position.x - boss.pos.x, position.z - boss.pos.z) : Infinity;
    for (const remote of remotePlayers()) {
        const distance = Math.hypot(remote.x - boss.pos.x, remote.z - boss.pos.z);
        if (distance >= best)
            continue;
        best = distance;
        targetPlayer.alive = true;
        targetPlayer.pos.set(remote.x, remote.y, remote.z);
        targetPlayer.vel.set(remote.vx, remote.vy, remote.vz);
        targetPlayer.eye = remote.eyeHeight;
    }
}
export function bossTargetAim(out) {
    return out.set(targetPlayer.pos.x, targetPlayer.pos.y + targetPlayer.eye - 0.35, targetPlayer.pos.z);
}
export function updateBoss(dt) {
    const rig = boss.rig;
    if (rig && death.blown && dt > 0) {
        // 爆発した後は、飛び散った残骸と破片だけを進める
        updateQuake(dt);
        updateChunks(dt);
        updateFloorMarks(dt);
        updateShock(dt);
        updateWreck(dt);
        return;
    }
    if (!rig || !rig.root.visible || dt <= 0)
        return;
    selectBossTarget();
    if (entrance.pending || entrance.t >= 0)
        endBossEntrance(); // 登場の演出を通らずに始まった（場面を直接開いたときなど）
    updateQuake(dt);
    updateChunks(dt);
    updateFloorMarks(dt);
    updateMissiles(dt);
    // ---- 段の移り変わり ----
    boss.phaseT += dt;
    if (boss.phase === 'down' && boss.phaseT >= DOWN_TIME) {
        // 部位を直して起き上がる
        for (const k of BOSS_LIMBS)
            boss.limbs[k] = { hp: boss.limbMax, broken: false };
        setPhase('rise');
        const snd = soundAt();
        sfx.playBossPowerUp(RISE_TIME, snd.volume, snd.pan);
    }
    else if (boss.phase === 'rise' && boss.phaseT >= RISE_TIME) {
        setPhase('walk');
        boss.ult.pending = true; // 起き上がったら必殺技を出す
    }
    if (boss.phase !== 'walk' && boss.stomp.leg >= 0)
        endStomp(true); // 踏む途中でしゃがみ込んだら、足を下ろす
    if (boss.phase !== 'walk' && boss.dash.stage >= 0)
        endDash();
    if (boss.phase !== 'walk' && boss.jump.stage >= 0)
        abortJump(); // 跳んでいる途中でしゃがみ込んだら、その場で落ちる
    if (boss.phase !== 'walk' && boss.ult.stage >= 0)
        endUlt(); // 必殺技の途中でしゃがみ込んだら、やめる
    if (boss.phase !== 'walk')
        stopStandAttacks();
    const jumping = boss.jump.stage >= 0;
    const dashing = boss.dash.stage >= 0;
    const ulting = boss.ult.stage >= 0;
    // 踏んでいる間・突進している間・跳んでいる間・必殺技の間は、ふつうには向き直らず、歩かない
    // 立ち止まって出す攻撃の間と、横へ滑っている間も同じ
    const mobile = boss.phase === 'walk' && boss.stomp.leg < 0 && !dashing && !jumping && !ulting && !standAttack() && boss.side.t < 0;
    // ---- 向き直りと歩き ----
    const dx = targetPlayer.pos.x - boss.pos.x;
    const dz = targetPlayer.pos.z - boss.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const diff = mobile ? wrap(want - boss.yaw) : 0;
    const turnRate = dist < NEAR ? TURN_SPEED_NEAR : TURN_SPEED;
    if (mobile)
        turnToward(want, turnRate, dt);
    const walking = mobile && (dist > FAR || (boss.speed > 0.1 && dist > NEAR));
    // ふつうの連射の間は、プレイヤーが近ければ向いたまま後ろへ下がる
    const backing = mobile && boss.gun.t >= 0 && !boss.gun.sweep && dist < BACKPEDAL_RANGE && roomBehind();
    const goal = backing ? -BACKPEDAL_SPEED : walking && Math.abs(diff) < FACE_TO_WALK ? WALK_SPEED : 0;
    boss.speed += THREE.MathUtils.clamp(goal - boss.speed, -WALK_ACCEL * dt, WALK_ACCEL * dt);
    fwd.set(Math.sin(boss.yaw), 0, Math.cos(boss.yaw));
    boss.pos.addScaledVector(fwd, boss.speed * dt);
    if (boss.thr.stage < 0) {
        // 柱投げで屋上にいる間は、動ける範囲の外にいてよい
        boss.pos.x = THREE.MathUtils.clamp(boss.pos.x, boss.bounds.minX, boss.bounds.maxX);
        boss.pos.z = THREE.MathUtils.clamp(boss.pos.z, boss.bounds.minZ, boss.bounds.maxZ);
    }
    boss.idleT = boss.speed < 0.05 && Math.abs(diff) < 0.05 ? boss.idleT + dt : 0;
    updateDash(dt, dist, want);
    updateJump(dt, dist, want);
    updateUlt(dt, want);
    smashPillars();
    // 体が動いた分だけ、足もとの破片を押しのける（歩く・滑る・横へ跳ぶ）
    if (boss.pos.y <= 0.1)
        sweepChunks(boss.pos.x, boss.pos.z, BODY_HALF + 0.4, (boss.pos.x - lastPos.x) / dt, (boss.pos.z - lastPos.z) / dt);
    lastPos.copy(boss.pos);
    updateSide(dt, dist, want);
    updateRift(dt, dist, want);
    updateSwipe(dt, dist, want);
    updateLaser(dt, dist, want);
    updateThrow(dt, dist, want);
    updateCall(dt, dist, want);
    updateStandPose(dt);
    updateBlock();
    pushPlayer();
    // ---- 足を運ぶ ----
    const stepping = boss.feet.some((f) => f.t >= 0);
    let worst = -1;
    let worstErr = 0;
    rig.legs.forEach((leg, i) => {
        if (i === boss.stomp.leg || dashing || jumping || boss.side.t >= 0 || boss.pos.y > 0)
            return; // 空中や横へ滑っている間は足を運ばない
        const f = boss.feet[i];
        const { B } = legRest(leg.side);
        toWorld(B.x, B.z, target).addScaledVector(fwd, boss.speed * STEP_LEAD);
        if (f.t >= 0) {
            // 運んでいる間も行き先を追いかける（向き直りながら歩くと、行き先が動く）
            f.to.set(target.x, B.y, target.z);
            f.toYaw = boss.yaw;
            return;
        }
        const err = Math.hypot(f.pos.x - target.x, f.pos.z - target.z);
        const turn = Math.abs(wrap(f.yaw - boss.yaw));
        const reach = boss.idleT > 0.4 ? STEP_REACH_IDLE : STEP_REACH;
        const score = Math.max(err / reach, turn / STEP_TURN);
        if (score > 1 && score > worstErr) {
            worst = i;
            worstErr = score;
        }
    });
    // 踏みつけ: 足もとまで寄られたら、足を運び直すより先に踏む
    boss.stomp.cd -= dt * boss.rate;
    // 正面寄りにいれば、代わりに腕で薙ぎ払うこともある
    if (mobile && !stepping && boss.jump.stage < 0 && boss.stomp.cd <= 0 && dist < STOMP_RANGE && targetPlayer.pos.y < STOMP_HIT_HIGH) {
        if (Math.random() < SWIPE_CHANCE && Math.abs(wrap(want - boss.yaw)) < SWIPE_FRONT)
            startSwipe(want);
        else
            startStomp();
    }
    if ((mobile || ulting || standAttack()) && !stepping && worst >= 0 && boss.stomp.leg < 0) { // 必殺技や立ち止まる攻撃で向き直る間も、足を運ぶ
        const f = boss.feet[worst];
        const { B } = legRest(rig.legs[worst].side);
        toWorld(B.x, B.z, target).addScaledVector(fwd, boss.speed * STEP_LEAD);
        f.from.copy(f.pos);
        f.to.set(target.x, B.y, target.z);
        f.fromYaw = f.yaw;
        f.toYaw = boss.yaw;
        f.t = 0;
    }
    let lift = 0;
    let roll = 0;
    boss.feet.forEach((f, i) => {
        if (f.t < 0)
            return;
        f.t += dt;
        const u = Math.min(f.t / STEP_TIME, 1);
        const e = u * u * (3 - 2 * u);
        f.pos.lerpVectors(f.from, f.to, e);
        f.pos.y += STEP_LIFT * Math.sin(Math.PI * u);
        f.yaw = f.fromYaw + wrap(f.toYaw - f.fromYaw) * e;
        lift = Math.max(lift, Math.sin(Math.PI * u));
        roll += rig.legs[i].side * STEP_ROLL * Math.sin(Math.PI * u); // 着いている脚の側へ傾ける
        if (u >= 1) {
            f.t = -1;
            f.pos.copy(f.to);
            boss.poseHip.v -= STEP_DIP; // 重みで腰が沈む
            // 着地: 近いほど強く揺らす
            const near = 1 - Math.min(Math.hypot(position.x - f.pos.x, position.z - f.pos.z) / STEP_SHAKE_FAR, 1);
            if (near > 0)
                hooks.addTrauma(STEP_SHAKE * near * near);
            const snd = soundAt(f.pos);
            sfx.playBossStep(snd.volume, snd.pan);
            // 床の細かい破片が跳ね、踏んだ跡がしばらく残る
            spawnChunks(f.pos, { count: 5, size: [0.05, 0.14], speed: [1.5, 3.5], up: 2.5, spread: 0.6, light: [0.45, 0.7], life: 2.5 });
            spawnImprint(f.pos.x, f.pos.z, 1.3, 1.9, f.yaw, 6);
            pushChunks(f.pos.x, f.pos.z, 2.2, 3, 3);
        }
    });
    boss.roll += (roll - boss.roll) * Math.min(1, dt * 12);
    // ---- 踏みつけ ----
    updateStomp(dt);
    updateShock(dt);
    updateGun(dt, dist);
    updateMissileVolley(dt, dist);
    // ---- 胴体のひねりと砲の狙い ----
    const twist = mobile ? THREE.MathUtils.clamp(wrap(want - boss.yaw), -TWIST_MAX, TWIST_MAX) : 0;
    boss.twist += (twist - boss.twist) * Math.min(1, dt * 10);
    const gunY = 4.5;
    const pitch = Math.atan2(targetPlayer.pos.y + targetPlayer.eye - gunY, Math.max(dist, 1));
    boss.aimPitch += (pitch - boss.aimPitch) * Math.min(1, dt * 10);
    const slack = boss.phase === 'walk' ? 0 : 1; // しゃがみ込んでいる間は両腕とも垂らす
    boss.droop[0] += (slack * DOWN_DROOP - boss.droop[0]) * Math.min(1, dt * 10);
    boss.droop[1] += (slack * DOWN_DROOP - boss.droop[1]) * Math.min(1, dt * 10);
    // しゃがみ込みと起き上がり: 腰を下げて胴体を前へ倒す（窓が下を向いて、中のボットを狙いやすくなる）
    const down = boss.phase === 'down' || boss.phase === 'dead';
    const hipGoal = boss.phase === 'dead' ? DEAD_HIP : down ? DOWN_HIP : 0;
    boss.hip += THREE.MathUtils.clamp(hipGoal - boss.hip, -HIP_SPEED * dt, HIP_SPEED * dt);
    boss.lean += ((down ? DOWN_LEAN : 0) - boss.lean) * Math.min(1, dt * 8);
    // 当たった部位だけを白く光らせる。故障した部位は黒ずませて火花を散らす
    for (const k in boss.flash) {
        const part = k;
        const t = (boss.flash[part] += dt);
        const glow = t < FLASH_TIME ? 0.5 * (1 - t / FLASH_TIME) : 0;
        if (part !== 'core') {
            const broken = boss.limbs[part].broken;
            if (broken)
                brokenSparks(rig, part, dt);
            const shade = broken ? BROKEN_DARK : 1;
            for (const m of rig.mats[part])
                m.color.setScalar(m.color.r + (shade - m.color.r) * Math.min(1, dt * BROKEN_FADE));
        }
        for (const m of rig.mats[part])
            m.emissiveIntensity = glow;
    }
    // 噴射の音
    const jet = Math.max(boss.jet, boss.backJet);
    if (jet > 0.01) {
        const snd = soundAt();
        sfx.setBossJet(jet, snd.volume, snd.pan);
    }
    else
        sfx.setBossJet(0);
    // 足を持ち上げている間は腰を少し上げ、着くと沈める
    poseRig(boss.hip + boss.stompHip + boss.dashHip + boss.jumpHip + boss.ultHip + boss.standHip + STEP_BOB * lift - 0.06 * (1 - lift) * (boss.speed / WALK_SPEED), dt);
    if (!turned)
        boss.yawVel = 0;
    turned = false;
    if (boss.phase === 'dead')
        updateDeath(rig, dt); // 今の姿勢のまま砕くので、骨を動かし終えてから
    rig.root.updateMatrixWorld(true); // 光線の当たりを今の姿勢で調べられるように
}
// ---- 止まった後 ----
// 本体を削りきると沈み込み（とどめのスローと白黒の中）、あちこちから火花と小さな破裂を噴きながら震える。
// 破裂はだんだん間が詰まり、DEATH_BLAST で爆発して、骨ごとの残骸（脚の各節・砲・胴体）に分かれて吹き飛ぶ。
// 残骸は床で跳ねて転がり、そのまま残る（当たり判定はない）
const DEATH_BLAST = 1.4; // 止まってから爆発するまで（ゲームの時間）
const DEATH_POP_GAP = [0.22, 0.04]; // 小さな破裂の間隔（初め → 爆発の直前）
const DEATH_SHAKE = 0.08; // 爆発の直前に震える幅 (m)
const WRECK_SPEED = [7, 15]; // 残骸が飛び出す速さ（爆発の中心から外へ）
const WRECK_UP = [6, 13]; // それに足す上向きの速さ
const WRECK_SPIN = 7; // 回る速さの上限 (rad/s)
const WRECK_GRAVITY = 24;
const WRECK_BOUNCE = 0.3; // 床で跳ね返る速さの割合
const WRECK_FRICTION = 0.55; // 床に当たるたびに残す横の速さの割合
const death = { pop: 0, blown: false };
const wreck = [];
const deathAt = new THREE.Vector3();
const deathDir = new THREE.Vector3();
const wreckBox = new THREE.Box3();
const lerpRange = (r, u) => THREE.MathUtils.lerp(r[0], r[1], u);
function updateDeath(rig, dt) {
    const t = boss.phaseT;
    if (t <= dt)
        death.pop = DEATH_POP_GAP[0];
    const u = Math.min(t / DEATH_BLAST, 1);
    // 爆発が近づくほど激しく震える
    const shake = DEATH_SHAKE * u * u;
    rig.body.position.x = (Math.random() * 2 - 1) * shake;
    rig.body.position.z = (Math.random() * 2 - 1) * shake;
    if ((death.pop -= dt) <= 0) {
        death.pop = lerpRange(DEATH_POP_GAP, u * u);
        ensureMarkers(rig);
        const mk = markers[Math.floor(Math.random() * markers.length)];
        mk.obj.localToWorld(deathAt.copy(mk.offset));
        deathDir.set(Math.random() - 0.5, 0.8, Math.random() - 0.5).normalize();
        spawnSparks(deathAt, deathDir, 10 + Math.round(14 * u), 0.9, 1.2);
        spawnChunks(deathAt, { count: 3, size: [0.1, 0.35], speed: [3, 7], up: 4, dir: deathDir, spread: 0.4, light: [0.2, 0.4] });
        fireBurst(flares, deathAt, 1.2 + 1.5 * u, 0.25, 1.5, 1);
        hooks.addTrauma(0.06 + 0.1 * u);
        const snd = soundAt(deathAt);
        sfx.playBossPop(snd.volume * (0.5 + 0.5 * u), snd.pan);
    }
    if (t >= DEATH_BLAST)
        blowUp(rig);
}
// 爆発: 骨を親から外して残骸にし、外へ吹き飛ばす。子の骨から先に外す（親ごと外すと子も一緒に飛ぶ）
function blowUp(rig) {
    death.blown = true;
    const parent = rig.root.parent;
    rig.body.position.x = rig.body.position.z = 0;
    rig.root.updateMatrixWorld(true);
    rig.torso.localToWorld(deathAt.set(0, 1.2, 0)); // 爆発の中心（胴体の中）
    for (const m of [...flames, ...backFlames, ...portGlows, ...glows.flat()])
        m.visible = false;
    const pieces = [...rig.guns, ...rig.legs.flatMap((l) => [l.foot, l.meta, l.shin, l.thigh]), rig.torso, rig.body];
    for (const obj of pieces) {
        parent.attach(obj);
        obj.getWorldPosition(deathDir).sub(deathAt).setY(0);
        if (deathDir.lengthSq() < 1e-4)
            deathDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        deathDir.normalize().multiplyScalar(lerpRange(WRECK_SPEED, Math.random()));
        deathDir.y = lerpRange(WRECK_UP, Math.random());
        const spin = new THREE.Vector3().randomDirection().multiplyScalar(WRECK_SPIN * (0.4 + 0.6 * Math.random()));
        wreck.push({ obj, vel: deathDir.clone(), spin, rest: false });
    }
    rig.root.visible = false;
    // 当たり判定を消して、通り抜けられるようにする
    const i = blocks.indexOf(boss.block);
    if (i >= 0)
        blocks.splice(i, 1);
    clearMissiles();
    // 火の玉・火花・飛び散る装甲・床の焦げ跡と、床ごと波打つ衝撃
    fireBurst(flares, deathAt, 14, 1.1, 3, 1);
    fireBurst(flares, deathAt, 7, 0.6, 2.4, 2.5);
    spawnSparks(deathAt, UP, 160, 2.2, 2);
    for (let k = 0; k < 30; k++) {
        deathDir.randomDirection();
        deathDir.y = Math.abs(deathDir.y) + 0.2;
        spawnChunks(deathAt, { count: 2, size: [0.15, 0.6], speed: [8, 20], up: 5, dir: deathDir.normalize(), spread: 0.5, light: [0.15, 0.4] });
    }
    spawnScorch(boss.pos.x, boss.pos.z, 9);
    for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 8;
        spawnCrack(boss.pos.x + Math.sin(a) * r, boss.pos.z + Math.cos(a) * r, 3 + 4 * Math.random());
    }
    groundSlam(deathAt.set(boss.pos.x, 0, boss.pos.z), ENTER_SLAM);
    pushChunks(boss.pos.x, boss.pos.z, 18, 9, 7);
    hooks.addTrauma(1);
    const snd = soundAt();
    sfx.playBossExplode(Math.max(snd.volume, 0.7), snd.pan);
}
// 残骸を飛ばす: 落ちながら回り、床に着いたら跳ね返って勢いを失い、止まったらそのまま置いておく
function updateWreck(dt) {
    for (const w of wreck) {
        if (w.rest)
            continue;
        w.vel.y -= WRECK_GRAVITY * dt;
        w.obj.position.addScaledVector(w.vel, dt);
        w.obj.rotation.x += w.spin.x * dt;
        w.obj.rotation.y += w.spin.y * dt;
        w.obj.rotation.z += w.spin.z * dt;
        w.obj.updateMatrixWorld(true);
        wreckBox.setFromObject(w.obj);
        if (wreckBox.min.y >= 0)
            continue;
        w.obj.position.y -= wreckBox.min.y;
        if (w.vel.y < 0) {
            const hard = -w.vel.y;
            if (hard > 5) {
                w.obj.getWorldPosition(deathAt).setY(0.2);
                spawnChunks(deathAt, { count: 4, size: [0.06, 0.2], speed: [1.5, 4], up: 3, spread: 0.8, light: [0.45, 0.65], life: 3 });
                spawnSparks(deathAt, UP, 6, 0.6, 1);
                const snd = soundAt(deathAt);
                sfx.playBossStep(snd.volume * Math.min(hard / 14, 1), snd.pan);
            }
            w.vel.y = hard * WRECK_BOUNCE;
            w.vel.x *= WRECK_FRICTION;
            w.vel.z *= WRECK_FRICTION;
            w.spin.multiplyScalar(WRECK_FRICTION);
        }
        if (w.vel.y < 1 && Math.hypot(w.vel.x, w.vel.z) < 0.4)
            w.rest = true;
    }
}
// ---- 登場 ----
// ステージが組み上がりきったら、正面のビルの外壁を突き破って機体が飛び込んでくる（main.ts の updateStageIntro が進める。その間ゲームの時間は止まっている）。
// 画面の上下に帯を出して、操作できない演出だとわかるようにする:
// 正面のビルの中から、重い足音がだんだん速く近づき、外壁から粉が落ちる（望遠でビルへ寄っていく） →
// 噴射の唸りが高まった瞬間、外壁を突き破って飛び出す。破片がこちらへ飛んできて、視野を一気に引き、目も少しだけ押し戻される →
// 噴射で飛んできて広場に着地し、床を削りながら滑って止まる。目を床すれすれまで下げると、着地の衝撃波が床のマスを
// 目の高さより高く持ち上げながら、破片を吹き付けて迫ってくる。目の前のマスがせり上がって視界がふさがった瞬間に切り替える →
// 巻き上げられた破片が降る中、足もとすれすれから見上げる位置に切り替わっている。足から頭へ目線を上げていく間に、しゃがんだ機体が砲口を灯しながら立ち上がる →
// 両腕の砲をプレイヤーへ向けた瞬間にプレイヤーの目へ戻り、タイトルを叩きつける。
// 突き破る外壁は、ステージ（ruins.ts の breach）が壊れる前と後の 2 通りの箱を返し、main.ts が別々のメッシュにして渡す。
// 突き破った瞬間に入れ替える
const ENTER_RUMBLE = 2.8; // 突き破るまで
const ENTER_STEPS = [0.5, 1.15, 1.7, 2.1, 2.4, 2.6]; // ビルの中の足音の時刻（だんだん速く）
const ENTER_JET_UP = 0.5; // 突き破る前のこの時間、噴射の唸りを高める
const ENTER_FLIGHT = 1.15; // 突き破ってから着地するまで
const ENTER_APEX = 5; // 飛んでいる間に持ち上がる高さ
const ENTER_SKID = 4; // 着地してから滑る距離
const ENTER_SKID_TIME = 0.5;
const ENTER_SETTLE = [0.6, 2.4]; // 着地してから足もとの視点へ切り替えるまでの限り（衝撃波が目に届くのに合わせて、この間で決める）
const ENTER_CROUCH_Y = 0.35; // 着地したら目をこの高さまで下げる（床の波が目の高さを越えて迫ってくる）
const ENTER_CROUCH_TIME = 0.6; // 下げきるまで
const ENTER_ENGULF_AT = 0.2; // 波の先頭が目をこれだけ越えた瞬間に切り替える (m。すぐ前のマスが山の高さまで持ち上がり、視界がふさがる)
const ENTER_SPRAY = 6; // 波の先頭が目からこれより近づいたら、波の前の破片を目へ向けて吹き付ける (m)
const ENTER_RISE = 3.4; // 足もとの視点に切り替えてから、立ち上がって砲を向けるまで
const ENTER_RISE_FROM = 0.4; // そのうちこの割合までは、しゃがんだまま唸りを高める
const ENTER_INSIDE = 4; // 外壁から奥へこれだけ入った所で待つ
const ENTER_DEBRIS = 40; // 突き破ったときに穴から飛ばす大きな破片の数（2 つずつ）
const ENTER_FROM_SKY = 30; // 突き破るビルがないステージでは、この高さの斜め後ろから飛んでくる
const ENTER_LAND = ENTER_RUMBLE + ENTER_FLIGHT;
const ENTER_BARS_IN = 0.7; // 帯を出しきるまで
const ENTER_BARS_OUT = 0.35; // 砲を向けてから帯を引っ込めるまで
const ENTER_ZOOM = -24; // ビルへ寄っていく間に絞る視野 (度)
const ENTER_ZOOM_OUT = 0.6; // 突き破ってから視野を戻しきるまで
const ENTER_PUSH = 0.4; // 突き破るまでに、プレイヤーの目から外壁へ寄っていく割合（突き破ったら少し引き戻す）
const ENTER_PUSH_LIFT = 1.2; // 寄りきったときに目を持ち上げる高さ
const ENTER_PUSH_KEEP = 0.55; // 突き破って押し戻された後も残す寄りの割合（引きすぎない）
const ENTER_PULL = 0.35; // 突き破ってから押し戻されきるまで
const ENTER_LOW_FOV = 16; // 足もとから見上げる間に広げる視野 (度)
const ENTER_LOW_DIST = [6.8, 5.6]; // 足もとの視点の、機体からの距離（切り替えたとき → 砲を向けるとき）
const ENTER_LOW_Y = [0.22, 0.4]; // その高さ
const ENTER_LOW_ANGLE = [32 * DEG, 18 * DEG]; // プレイヤーのいる向きから回り込む角度
const ENTER_TILT = [1.2, 5.6]; // 足もとから見上げる所の高さ（足 → 頭）
const ENTER_SLAM = {
    radius: 7, high: 0, damage: 0, push: 0, shake: 0, power: 2.4,
    quake: 2.2, range: 60, speed: 18, shock: 0, // 当たらない。range はステージの広さに合わせて spawnBoss で決める。迫ってくるのが見えるよう遅めに
};
// main.ts が読む: fov = 視野に足す角度、bars = 帯の出し具合
export const bossEntranceView = { fov: 0, bars: 0 };
// t = 始めてからの時間（-1 = していない）、pending = ステージに置いて始めるのを待っている、
// step = 次に鳴らす足音の番号、side = 足もとの視点で回り込む向き、look = 見ている所、climaxReal = 砲を向けてからの時間、
// spot = 最後に立つ所、from = 飛び出す所、land = 着地する所、wall = 突き破る外壁（なければ null）、hole = 開く穴（楕円）、
// reach = 着地する所から目までの距離、cut = 衝撃波にのまれて足もとの視点へ切り替える時刻、climax = 砲を向ける時刻（始めるときに決める）
const entrance = {
    t: -1, pending: false, step: 0, side: 1, look: new THREE.Vector3(), climaxReal: -1, reach: 0, cut: 0, climax: 0,
    spot: new THREE.Vector3(), from: new THREE.Vector3(), land: new THREE.Vector3(),
    wall: null, hole: { x: 0, y: 4, rx: 4, ry: 4, z: 0 },
};
const enterEye = new THREE.Vector3();
const enterLook = new THREE.Vector3();
const enterAt = new THREE.Vector3();
const enterDir = new THREE.Vector3();
const enterCam = new THREE.Matrix4();
const ENTER_FALL = new THREE.Vector3(0, -1, 0);
const smooth01 = (x) => {
    const u = THREE.MathUtils.clamp(x, 0, 1);
    return u * u * (3 - 2 * u);
};
// 登場を待たせる（spawnBoss から）。突き破る外壁 wall があれば、その奥に隠しておく
function holdEntrance(wall, breach) {
    entrance.pending = true;
    entrance.t = -1;
    boss.entering = true;
    entrance.spot.copy(boss.pos);
    entrance.wall = breach ? wall : null;
    if (breach) {
        entrance.hole = { ...breach.hole };
        entrance.from.set(breach.hole.x, 0, breach.hole.z - ENTER_INSIDE);
    }
    else {
        entrance.from.set(boss.pos.x, ENTER_FROM_SKY, boss.pos.z - ENTER_FROM_SKY);
    }
    // 着地する所: 最後に立つ所から、飛んでくる向きへ滑る分だけ手前
    enterDir.set(boss.pos.x - entrance.from.x, 0, boss.pos.z - entrance.from.z).normalize();
    entrance.land.copy(boss.pos).addScaledVector(enterDir, -ENTER_SKID);
    boss.pos.copy(entrance.from);
    boss.yaw = Math.atan2(enterDir.x, enterDir.z);
    placeFeetAt(0);
}
export function startBossEntrance() {
    if (!boss.rig || !entrance.pending)
        return;
    entrance.pending = false;
    entrance.t = 0;
    entrance.climaxReal = -1;
    entrance.step = 0;
    entrance.side = Math.random() < 0.5 ? -1 : 1;
    entrance.look.set(entrance.hole.x, entrance.hole.y, entrance.hole.z);
    // 着地の衝撃波が、押し戻された後の目を越える時刻。波にのまれた瞬間に切り替える
    entranceEye(ENTER_PUSH * ENTER_PUSH_KEEP, enterEye);
    entrance.reach = Math.hypot(enterEye.x - entrance.land.x, enterEye.z - entrance.land.z);
    entrance.cut = ENTER_LAND + THREE.MathUtils.clamp((entrance.reach + ENTER_ENGULF_AT) / ENTER_SLAM.speed, ENTER_SETTLE[0], ENTER_SETTLE[1]);
    entrance.climax = entrance.cut + ENTER_RISE;
    sfx.playBossApproach(ENTER_RUMBLE, ENTER_JET_UP);
}
// プレイヤーの目から、突き破る外壁へ push の割合だけ寄った目の位置（外壁がなければプレイヤーの目のまま）
function entranceEye(push, out) {
    out.set(position.x, position.y + EYE_HEIGHT, position.z);
    if (!entrance.wall)
        return out;
    const h = entrance.hole;
    out.x += (h.x - out.x) * push;
    out.z += (h.z - out.z) * push;
    out.y += ENTER_PUSH_LIFT * (push / ENTER_PUSH);
    return out;
}
// 砲を向ける瞬間までの時間（ボスがいないか登場し終えていれば 0、まだ始めていなければ Infinity）
export function bossEntranceLeft() {
    if (!boss.rig)
        return 0;
    if (entrance.pending)
        return Infinity;
    return entrance.t >= 0 ? entrance.climax - entrance.t : 0;
}
// 手持ちのカメラのような、ゆっくりした揺れ（見る所を、距離に合わせてずらす）
function handheld(look, eye, t, amount) {
    const d = eye.distanceTo(look) * amount;
    look.x += d * (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3 + 1) * 0.4);
    look.y += d * (Math.sin(t * 1.1 + 2) * 0.5 + Math.sin(t * 2.9) * 0.3);
}
// 穴の中の (u, v)（-1〜1 の楕円の中）の、外壁の表の位置
function holeAt(u, v, out) {
    const h = entrance.hole;
    return out.set(h.x + u * h.rx, Math.max(0.3, h.y + v * h.ry), h.z);
}
// 外壁を突き破る: 壊れた後の外壁に入れ替え、穴の所の破片をこちらへ吹き飛ばす
function burstWall() {
    if (entrance.wall) {
        entrance.wall.intact.visible = false;
        entrance.wall.broken.visible = true;
    }
    for (let k = 0; k < ENTER_DEBRIS; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random());
        holeAt(Math.cos(a) * r, Math.sin(a) * r, enterAt);
        spawnChunks(enterAt, { count: 2, size: [0.4, 1.1], speed: [8, 20], up: 3, dir: enterDir.set(0, 0.15, 1), spread: 0.4, light: [0.35, 0.55] });
    }
    spawnChunks(holeAt(0, 0, enterAt), { count: 30, size: [0.06, 0.2], speed: [8, 18], up: 2, dir: enterDir.set(0, 0.3, 1), spread: entrance.hole.rx * 0.6, light: [0.5, 0.7], life: 4 });
    spawnSparks(holeAt(0, -0.3, enterAt), UP, 30, 1.2, 1.4);
    hooks.addTrauma(0.7);
    sfx.playBossBurst();
}
export function updateBossEntrance(dt) {
    const rig = boss.rig;
    const view = bossEntranceView;
    if (!rig || entrance.t < 0)
        return;
    const was = entrance.t;
    const t = (entrance.t += dt);
    const passed = (at) => was < at && t >= at;
    const h = entrance.hole;
    let back = 0;
    let foot = 0;
    let hip = 0;
    let lean = 0;
    let droop = 0;
    if (t < ENTER_RUMBLE) {
        // ビルの中の足音: 鳴るたびに揺れ、外壁から粉が落ちる
        while (entrance.step < ENTER_STEPS.length && t >= ENTER_STEPS[entrance.step]) {
            const u = entrance.step / (ENTER_STEPS.length - 1);
            entrance.step++;
            sfx.playBossStep(0.5 + 0.5 * u, 0);
            hooks.addTrauma(0.12 + 0.2 * u);
            if (entrance.wall) {
                for (let k = 0; k < 2 + 3 * u; k++) {
                    holeAt(Math.random() * 2.6 - 1.3, Math.random() * 2.2 - 1, enterAt).z += 0.3;
                    spawnChunks(enterAt, { count: 3, size: [0.05, 0.18], speed: [0.5, 2], up: 0, dir: enterDir.set(0, -0.5, 1), light: [0.45, 0.65], life: 4 });
                }
            }
            for (let k = 0; k < 6; k++)
                spawnSpike(h.x + (Math.random() * 2 - 1) * 12, h.z + 1 + Math.random() * 14, 0.05 + 0.15 * u, 0.3);
        }
        // 突き破る直前: 中で噴射に火が入り、腰を落とす
        const jetUp = smooth01((t - ENTER_RUMBLE + ENTER_JET_UP) / ENTER_JET_UP);
        back = foot = jetUp;
        hip = -0.6 * jetUp;
        lean = 0.3 * jetUp;
        hooks.addTrauma(dt * 0.6 * jetUp);
    }
    else if (t < ENTER_LAND) {
        // 噴射で飛んでくる: 前のめりに、脚を後ろへ流す
        const u = (t - ENTER_RUMBLE) / ENTER_FLIGHT;
        boss.pos.lerpVectors(entrance.from, entrance.land, u);
        boss.pos.y = THREE.MathUtils.lerp(entrance.from.y, 0, u * u) + ENTER_APEX * 4 * u * (1 - u);
        back = foot = 1;
        hip = -0.3;
        lean = 0.35;
        droop = 0.3;
        placeFeetAt(0.6);
        hooks.addTrauma(dt * 0.8);
    }
    if (passed(ENTER_RUMBLE))
        burstWall();
    if (passed(ENTER_LAND)) {
        boss.pos.copy(entrance.land);
        placeFeetAt(0);
        groundSlam(enterAt.set(boss.pos.x, 0, boss.pos.z), ENTER_SLAM);
        hooks.addTrauma(1);
        sfx.playBossLanding();
        sfx.playBossHiss(2.2, 0.8, 0, 0.6); // 着地の熱を逃がす
        spawnChunks(enterAt.set(boss.pos.x, 0.5, boss.pos.z), { count: 40, size: [0.15, 0.8], speed: [5, 15], up: 8, spread: 2.5, light: [0.4, 0.65] });
        for (let k = 0; k < 7; k++) {
            const a = Math.random() * Math.PI * 2;
            const r = 4 + Math.random() * 10;
            spawnCrack(boss.pos.x + Math.sin(a) * r, boss.pos.z + Math.cos(a) * r, 3 + 4 * Math.random());
        }
    }
    if (t >= ENTER_LAND) {
        // 床を削りながら滑って止まる
        const s = Math.min((t - ENTER_LAND) / ENTER_SKID_TIME, 1);
        if (s < 1) {
            const prevX = boss.pos.x;
            const prevZ = boss.pos.z;
            boss.pos.lerpVectors(entrance.land, entrance.spot, 1 - (1 - s) ** 3);
            placeFeetAt(0);
            if (dt > 0)
                sweepChunks(boss.pos.x, boss.pos.z, BODY_HALF + 1, (boss.pos.x - prevX) / dt, (boss.pos.z - prevZ) / dt);
            for (const f of boss.feet)
                spawnSparks(f.pos, UP, 2, 0.5, 1);
            if (Math.random() < 0.5)
                spawnCrack(boss.pos.x, boss.pos.z, 2 + Math.random());
        }
        else
            boss.pos.copy(entrance.spot);
        // 着地でしゃがみ込み、足もとの視点に切り替わってしばらくしてから、ゆっくり立ち上がる（胸を張って見下ろす）
        const v = smooth01((t - entrance.cut - ENTER_RISE * ENTER_RISE_FROM) / (ENTER_RISE * (1 - ENTER_RISE_FROM)));
        hip = DOWN_HIP * (1 - v);
        lean = DOWN_LEAN * (1 - v) - 0.12 * v;
        droop = DOWN_DROOP * (1 - v);
    }
    if (passed(entrance.cut)) {
        sfx.playBossPowerUp(ENTER_RISE); // 鳴り終わる瞬間に砲を向ける
        sfx.playBossServo(ENTER_RISE * (1 - ENTER_RISE_FROM), 1, 0, 0.6);
    }
    if (passed(entrance.climax)) {
        boss.entering = false;
        entrance.climaxReal = 0;
        sfx.playBossRoar();
        hooks.addTrauma(0.5);
        pushChunks(boss.pos.x, boss.pos.z, 14, 3, 3);
    }
    if (entrance.climaxReal >= 0)
        entrance.climaxReal += dt;
    // プレイヤーへ向き直る（飛んでくる間は飛ぶ向きのまま）
    if (t >= ENTER_LAND)
        faceToward(Math.atan2(position.x - boss.pos.x, position.z - boss.pos.z), 2, dt);
    // 着地の瞬間は速く沈み込み、立ち上がりはゆっくり
    const follow = Math.min(1, dt * (t < ENTER_LAND + 0.3 ? 22 : 10));
    boss.hip += (hip - boss.hip) * follow;
    boss.lean += (lean - boss.lean) * follow;
    boss.droop[0] = boss.droop[1] = boss.droop[0] + (droop - boss.droop[0]) * follow;
    boss.aimPitch = Math.atan2(position.y + EYE_HEIGHT - 4.5, Math.max(Math.hypot(position.x - boss.pos.x, position.z - boss.pos.z), 1));
    // 噴射の炎
    for (const m of backFlames) {
        m.visible = back > 0.02;
        m.scale.set(1.4 * back, 5 * back * (0.85 + 0.3 * Math.random()), 1.4 * back);
    }
    for (const m of flames) {
        m.visible = foot > 0.02;
        m.scale.set(1.2 * foot, 1.2 * foot, 2.6 * foot * (0.85 + 0.3 * Math.random()));
    }
    // 砲口の光: 立ち上がるにつれて大きく速く脈打ち、砲を向けた瞬間に強く光って、灯ったまま
    const lit = smooth01((t - entrance.cut - ENTER_RISE * 0.25) / (ENTER_RISE * 0.75));
    const flare = entrance.climaxReal >= 0 ? 1 + 2.5 * Math.max(0, 1 - entrance.climaxReal / 0.5) : 1;
    const glowSize = lit <= 0 ? 0 : 0.1 * (0.2 + 1.2 * lit) * (1 + 0.35 * Math.sin(t * (6 + 26 * lit))) * flare;
    for (const pair of glows) {
        for (const m of pair) {
            m.visible = glowSize > 0.01;
            m.scale.setScalar(glowSize);
        }
    }
    // ---- カメラ ----
    const bx = boss.pos.x;
    const bz = boss.pos.z;
    if (t >= entrance.cut && t < entrance.climax) {
        // 足もとすれすれから、回り込みながらゆっくり寄り、足から頭へ目線を上げていく
        const v = (t - entrance.cut) / ENTER_RISE;
        const ang = Math.atan2(position.x - bx, position.z - bz) + entrance.side * THREE.MathUtils.lerp(ENTER_LOW_ANGLE[0], ENTER_LOW_ANGLE[1], smooth01(v));
        const dist = THREE.MathUtils.lerp(ENTER_LOW_DIST[0], ENTER_LOW_DIST[1], smooth01(v));
        enterEye.set(bx + Math.sin(ang) * dist, THREE.MathUtils.lerp(ENTER_LOW_Y[0], ENTER_LOW_Y[1], v), bz + Math.cos(ang) * dist);
        enterLook.set(bx, THREE.MathUtils.lerp(ENTER_TILT[0], ENTER_TILT[1], smooth01(v * 1.15)), bz);
        handheld(enterLook, enterEye, t, 0.006);
        view.fov = ENTER_LOW_FOV;
    }
    else {
        // プレイヤーの目から: 望遠でビルへ寄っていき、突き破ったら視野を一気に引いて飛んでくる機体を追い、着地したら機体を見る。
        // 突き破る外壁があれば、目もだんだん速く外壁へ近づき、突き破った瞬間に破片と一緒に少しだけ押し戻され、そこで着地の衝撃波を受ける
        let push = 0;
        if (t < entrance.cut) {
            const u = Math.min(t / ENTER_RUMBLE, 1);
            push = 0.3 * u + 0.7 * u * u;
            if (t >= ENTER_RUMBLE)
                push = THREE.MathUtils.lerp(ENTER_PUSH_KEEP, 1, (1 - Math.min((t - ENTER_RUMBLE) / ENTER_PULL, 1)) ** 3);
        }
        entranceEye(ENTER_PUSH * push, enterEye);
        if (t >= ENTER_LAND && t < entrance.cut) {
            // 着地したら床すれすれまで目を下げ、迫ってくる床の波を見上げる
            enterEye.y = THREE.MathUtils.lerp(enterEye.y, position.y + ENTER_CROUCH_Y, smooth01((t - ENTER_LAND) / ENTER_CROUCH_TIME));
            // 波の先頭が近づいたら、その前に跳ね上がる破片を目へ吹き付ける
            const gap = entrance.reach - (t - ENTER_LAND) * ENTER_SLAM.speed;
            if (gap > 0 && gap < ENTER_SPRAY) {
                enterDir.set(entrance.land.x - enterEye.x, 0, entrance.land.z - enterEye.z).normalize();
                enterAt.copy(enterEye).addScaledVector(enterDir, gap).setY(0.2);
                enterDir.negate().setY(0.5).normalize();
                spawnChunks(enterAt, { count: 3, size: [0.05, 0.3], speed: [5, 11], up: 3, dir: enterDir, spread: 1.5, light: [0.45, 0.7], life: 2 });
                hooks.addTrauma(dt * 2 * (1 - gap / ENTER_SPRAY));
            }
        }
        let rate = 3;
        if (t < ENTER_RUMBLE) {
            enterAt.set(h.x, h.y, h.z);
            view.fov = ENTER_ZOOM * smooth01(t / (ENTER_RUMBLE * 0.8));
        }
        else if (t < ENTER_LAND) {
            enterAt.set(bx, boss.pos.y + 3, bz);
            rate = 7;
            view.fov = ENTER_ZOOM * (1 - smooth01((t - ENTER_RUMBLE) / ENTER_ZOOM_OUT));
        }
        else {
            enterAt.set(bx, t < entrance.climax ? 2.5 : 4, bz);
            view.fov = 0;
        }
        if (passed(entrance.climax))
            entrance.look.copy(enterAt);
        entrance.look.lerp(enterAt, Math.min(1, dt * rate));
        enterLook.copy(entrance.look);
        handheld(enterLook, enterEye, t, 0.004);
    }
    camera.position.copy(enterEye);
    camera.quaternion.setFromRotationMatrix(enterCam.lookAt(enterEye, enterLook, UP));
    // 帯: 始めに出し、砲を向けたら引っ込める
    view.bars = entrance.climaxReal >= 0 ? 1 - smooth01(entrance.climaxReal / ENTER_BARS_OUT) : smooth01(t / ENTER_BARS_IN);
    if (passed(entrance.cut)) {
        // のまれて切り替わった直後: 大きく揺らし、巻き上げられた破片が目の前に降ってきて、落ちるにつれて視界が開ける
        hooks.addTrauma(0.9);
        sfx.playBossWaveHit();
        enterDir.subVectors(enterLook, enterEye).setY(0).normalize();
        for (let k = 0; k < 8; k++) {
            enterAt.copy(enterEye).addScaledVector(enterDir, 1.2 + Math.random() * 2.5);
            enterAt.y = 0.8 + Math.random() * 2.5;
            spawnChunks(enterAt, { count: 4, size: [0.04, 0.22], speed: [0.5, 2.5], up: 0, dir: ENTER_FALL, spread: 1.2, light: [0.45, 0.7], life: 2.5 });
        }
    }
    updateQuake(dt);
    updateChunks(dt);
    updateFloorMarks(dt);
    updateShock(dt);
    updateBlock();
    poseRig(boss.hip);
    rig.root.updateMatrixWorld(true);
}
// 登場を終えて、ふつうに動ける姿に戻す（main.ts が操作を返すときに呼ぶ）
export function endBossEntrance() {
    Object.assign(bossEntranceView, { fov: 0, bars: 0 });
    if (!boss.rig || (entrance.t < 0 && !entrance.pending))
        return;
    entrance.t = -1;
    entrance.pending = false;
    boss.entering = false;
    boss.pos.copy(entrance.spot);
    if (entrance.wall) {
        entrance.wall.intact.visible = false;
        entrance.wall.broken.visible = true;
    }
    for (const pair of glows)
        for (const m of pair)
            m.visible = false;
    for (const m of [...flames, ...backFlames])
        m.visible = false;
    placeFeetAt(0);
    updateBlock();
    poseRig(boss.hip);
}
// ---- 踏みつけ ----
// 足もとのプレイヤーに近い方の脚で踏む（故障した脚でも踏むが、上げて構えるのが遅い）
function startStomp() {
    const rig = boss.rig;
    let leg = -1;
    let best = Infinity;
    rig.legs.forEach((_, i) => {
        const f = boss.feet[i];
        const d = Math.hypot(targetPlayer.pos.x - f.pos.x, targetPlayer.pos.z - f.pos.z);
        if (d < best) {
            best = d;
            leg = i;
        }
    });
    if (leg < 0)
        return;
    const s = boss.stomp;
    s.leg = leg;
    s.t = 0;
    s.from.copy(boss.feet[leg].pos);
    stompAim(leg, s.at);
    const snd = soundAt(s.from);
    sfx.playBossServo(STOMP_LIFT + 0.15, 1.3 * snd.volume, snd.pan);
}
// 踏む所: プレイヤーの足もとを、その脚が届く範囲に収めたもの
function stompAim(leg, out) {
    const { B } = legRest(boss.rig.legs[leg].side);
    toLocal(targetPlayer.pos, local);
    const x = B.x + THREE.MathUtils.clamp(local.x - B.x, -STOMP_SIDE, STOMP_SIDE);
    const z = THREE.MathUtils.clamp(local.z, B.z - STOMP_BACK, B.z + STOMP_FWD);
    toWorld(x, z, out).y = B.y;
}
const stompAt = new THREE.Vector3();
function updateStomp(dt) {
    const s = boss.stomp;
    let hip = 0;
    let lean = 0;
    let ring = 0;
    if (s.leg >= 0) {
        s.t += dt;
        const f = boss.feet[s.leg];
        const y0 = s.at.y;
        const liftT = STOMP_LIFT;
        const holdT = STOMP_HOLD;
        const tHold = liftT;
        const tDrop = tHold + holdT;
        const tLand = tDrop + STOMP_DROP;
        if (s.t < tHold) {
            // 上げる: プレイヤーを追って踏む所を決め直しながら、その真上へ足を運ぶ
            stompAim(s.leg, s.at);
            const u = s.t / tHold;
            const e = 1 - (1 - u) * (1 - u);
            f.pos.lerpVectors(s.from, s.at, e);
            f.pos.y = y0 + STOMP_HEIGHT * e;
            hip = -0.25 * e;
            lean = -0.12 * e;
            ring = u > 0.4 ? (u - 0.4) / 0.6 : 0;
        }
        else if (s.t < tDrop) {
            // 構える: 上げきった所で震えて止まる
            const u = (s.t - tHold) / holdT;
            f.pos.copy(s.at);
            f.pos.y = y0 + STOMP_HEIGHT + 0.12 * u + 0.03 * Math.sin(s.t * 70);
            hip = -0.25 - 0.08 * u;
            lean = -0.12 - 0.04 * u;
            ring = 1;
        }
        else if (s.t < tLand) {
            // 踏み下ろす
            const u = (s.t - tDrop) / STOMP_DROP;
            f.pos.copy(s.at);
            f.pos.y = y0 + (STOMP_HEIGHT + 0.12) * (1 - u * u);
            hip = -0.33 + 0.1 * u;
            lean = -0.16 + 0.36 * u;
            ring = 1;
        }
        else {
            if (f.pos.y > y0)
                stompLand(s.at);
            f.pos.copy(s.at);
            const u = Math.min((s.t - tLand) / STOMP_RECOVER, 1);
            hip = -0.4 * (1 - u) * (1 - u);
            lean = 0.2 * (1 - u) * (1 - u);
            if (u >= 1)
                endStomp(false);
        }
    }
    boss.stompHip += (hip - boss.stompHip) * Math.min(1, dt * 24);
    boss.stompLean += (lean - boss.stompLean) * Math.min(1, dt * 24);
    // 踏む所の輪: 足が上がるにつれて濃く、踏む直前は点滅させる
    stompRing.visible = ring > 0;
    if (ring > 0) {
        const blink = s.t > STOMP_LIFT + STOMP_HOLD * 0.5 ? 0.5 + 0.5 * Math.cos(s.t * 50) : 1;
        stompRing.position.set(s.at.x, 0.04, s.at.z);
        stompRing.scale.setScalar(STOMP_RADIUS * (1.25 - 0.25 * ring));
        ringMat.opacity = 0.85 * ring * blink;
        ringFillMat.opacity = 0.16 * ring;
    }
}
// 踏む途中でやめる（drop なら足をその場で床へ下ろす）
function endStomp(drop) {
    const s = boss.stomp;
    if (drop && s.leg >= 0)
        boss.feet[s.leg].pos.y = s.at.y;
    s.leg = -1;
    s.cd = STOMP_COOLDOWN;
    stompRing.visible = false;
}
const STOMP_SLAM = {
    radius: STOMP_RADIUS, high: STOMP_HIT_HIGH, damage: STOMP_DAMAGE, push: STOMP_PUSH, shake: 0.7, power: 1,
    quake: SHOCK_AMP, range: SHOCK_RANGE, speed: SHOCK_SPEED, shock: SHOCK_DAMAGE,
};
// 足が床を打った: 足の下にいれば踏まれ、床が波打って衝撃波が広がる
function stompLand(at) {
    groundSlam(at, STOMP_SLAM);
}
function groundSlam(at, o) {
    const dx = position.x - at.x;
    const dz = position.z - at.z;
    const d = Math.hypot(dx, dz);
    const near = 1 - Math.min(d / STEP_SHAKE_FAR, 1);
    hooks.addTrauma(0.15 * o.power + 0.85 * near * near);
    sfx.playBossImpact((1.6 + 0.8 * near) * o.power);
    stompAt.set(at.x, 0, at.z);
    spawnAxeShock(stompAt, o.radius, o.power);
    spawnSparks(stompAt, UP, Math.round(24 * o.power), 1.2, 1.4);
    spawnQuake(at.x, at.z, o.quake, o.range, o.speed);
    if (o.power >= 1)
        spawnCrack(at.x, at.z, o.radius * 1.6); // 床にひびが残る
    pushChunks(at.x, at.z, o.radius * 1.6, 6 * o.power, 5 * o.power);
    spawnChunks(stompAt, { count: Math.round(8 * o.power), size: [0.08, 0.3], speed: [2, 6], up: 4, spread: o.radius * 0.3, light: [0.45, 0.7], life: 5 });
    broadcastBossSlam({ x: at.x, z: at.z, radius: o.radius, power: o.power, quake: o.quake, range: o.range, speed: o.speed });
    const sh = { x: at.x, z: at.z, t: 0, hit: false, remoteHits: new Set(), slam: o };
    boss.shocks.push(sh);
    if (o.damage > 0)
        for (const remote of remotePlayers()) {
            const rx = remote.x - at.x, rz = remote.z - at.z, distance = Math.hypot(rx, rz);
            if (distance < o.radius && remote.y < o.high) {
                sh.remoteHits.add(remote.id);
                sendRemoteBossImpact(remote.id, { damage: o.damage * boss.damage, dx: rx, dz: rz, push: o.push, shake: o.shake });
            }
        }
    if (o.damage > 0 && d < o.radius && position.y < o.high) {
        sh.hit = true; // じかに打たれたら、続く衝撃波では削らない
        hurtPlayer(o.damage, dx, dz, d, o.push, o.shake);
    }
}
// 衝撃波の輪がプレイヤーの所を通り過ぎるとき、床に立っていれば当たる
function updateShock(dt) {
    for (let i = boss.shocks.length - 1; i >= 0; i--) {
        const sh = boss.shocks[i];
        const o = sh.slam;
        sh.t += dt;
        const r = sh.t * o.speed;
        if (r > o.range + SHOCK_BAND) {
            boss.shocks.splice(i, 1);
            continue;
        }
        if (o.shock > 0 || o.quake > 0.5)
            shockChunks(sh.x, sh.z, r, 1.2, 2 + 4 * o.quake); // 輪が通る所の破片を跳ね上げる
        if (o.shock > 0 && r >= o.radius)
            for (const remote of remotePlayers()) {
                if (sh.remoteHits.has(remote.id) || !remote.onGround || remote.y > 0.3)
                    continue;
                const rx = remote.x - sh.x, rz = remote.z - sh.z, distance = Math.hypot(rx, rz);
                if (Math.abs(distance - r) > SHOCK_BAND)
                    continue;
                sh.remoteHits.add(remote.id);
                sendRemoteBossImpact(remote.id, { damage: o.shock * (1 - 0.5 * (distance / o.range)) * boss.damage, dx: rx, dz: rz, push: SHOCK_PUSH, shake: 0.35 });
            }
        if (sh.hit || o.shock <= 0 || r < o.radius || !player.onGround || position.y > 0.3)
            continue;
        const dx = position.x - sh.x;
        const dz = position.z - sh.z;
        const d = Math.hypot(dx, dz);
        if (Math.abs(d - r) > SHOCK_BAND)
            continue;
        sh.hit = true;
        hurtPlayer(o.shock * (1 - 0.5 * (d / o.range)), dx, dz, d, SHOCK_PUSH, 0.35);
    }
}
function hurtPlayer(amount, dx, dz, d, push, shake) {
    hooks.damagePlayer(amount * boss.damage);
    sfx.playHurt();
    hooks.addTrauma(shake);
    velocity.x += (dx / Math.max(d, 1e-3)) * push;
    velocity.z += (dz / Math.max(d, 1e-3)) * push;
}
export function remoteBossSlam(o) {
    const d = Math.hypot(position.x - o.x, position.z - o.z);
    const near = 1 - Math.min(d / STEP_SHAKE_FAR, 1);
    hooks.addTrauma(0.15 * o.power + 0.85 * near * near);
    sfx.playBossImpact((1.6 + 0.8 * near) * o.power);
    stompAt.set(o.x, 0, o.z);
    spawnAxeShock(stompAt, o.radius, o.power);
    spawnSparks(stompAt, UP, Math.round(24 * o.power), 1.2, 1.4);
    spawnQuake(o.x, o.z, o.quake, o.range, o.speed);
}
export function remoteBossImpact(impact) {
    if (game.playerHp <= 0)
        return;
    hooks.damagePlayer(impact.damage);
    sfx.playHurt();
    hooks.addTrauma(impact.shake);
    const d = Math.max(Math.hypot(impact.dx, impact.dz), 1e-3);
    velocity.x += impact.dx / d * impact.push;
    velocity.z += impact.dz / d * impact.push;
    velocity.x += impact.vx ?? 0;
    velocity.y += impact.vy ?? 0;
    velocity.z += impact.vz ?? 0;
    if (impact.minVy !== undefined)
        velocity.y = Math.max(velocity.y, impact.minVy);
}
// ---- 突進 ----
const dashFrom = new THREE.Vector3();
const dashSparkDir = new THREE.Vector3();
const remoteDashHits = new Set();
function updateDash(dt, dist, want) {
    const d = boss.dash;
    const rig = boss.rig;
    let hip = 0;
    let lean = 0;
    let jet = 0;
    if (d.stage < 0) {
        d.cd -= dt * boss.rate;
        // 撃っている間・踏んでいる間・足を運んでいる間は出さない
        if (boss.phase === 'walk' && boss.stomp.leg < 0 && boss.gun.t < 0 && !boss.feet.some((f) => f.t >= 0)
            && boss.jump.stage < 0 && boss.missile.t < 0 && boss.ult.stage < 0 && !standAttack() && boss.side.t < 0 && d.cd <= 0 && dist > DASH_RANGE_MIN && dist < DASH_RANGE_MAX && targetPlayer.alive && canSeePlayer()) {
            d.stage = 0;
            d.t = 0;
            d.hit = false;
            remoteDashHits.clear();
            d.crash = false;
            d.bump = false;
            d.windup = DASH_WINDUP;
            d.lock = DASH_LOCK;
            d.chain = 0;
            for (let k = 0; k < DASH_CHAIN_MAX && Math.random() < boss.dashChain; k++)
                d.chain++;
            boss.speed = 0;
            const snd = soundAt();
            sfx.playBossServo(d.lock, 1.3 * snd.volume, snd.pan, 0.8);
        }
    }
    if (d.stage >= 0) {
        d.t += dt;
        if (d.stage === 0) {
            // 構え: 向きを決めるまでは、プレイヤーへ素早く向き直りながら腰を深く落とし、胴体を後ろへ引いて溜める。噴射がだんだん強く灯る。
            // 向きを決めたら、胴体を前へ倒して飛び出す姿勢になる
            if (d.t < d.lock) {
                turnToward(want, DASH_TURN, dt);
                d.len = Math.min(dist + DASH_OVERSHOOT, DASH_MAX);
                const u = d.t / d.lock;
                const e = 1 - (1 - u) * (1 - u);
                hip = -0.75 * e;
                lean = -0.22 * e;
                jet = 0.1 + 0.35 * u + 0.08 * Math.sin(d.t * 60);
            }
            else {
                // 飛び出す姿勢になっても、プレイヤーを追い続ける（決めた合図は、飛び出す間近の知らせ）
                if (d.t - dt < d.lock)
                    sfx.playSniperLock(1.5);
                turnToward(want, DASH_AIM_TURN, dt);
                d.len = Math.min(dist + DASH_OVERSHOOT, DASH_MAX);
                const u = Math.min((d.t - d.lock) / (d.windup - d.lock), 1);
                hip = -0.75;
                lean = -0.22 + 0.62 * (1 - (1 - u) * (1 - u) * (1 - u));
                jet = 0.6 + 0.1 * Math.sin(d.t * 80);
            }
            if (d.t >= d.windup) {
                d.stage = 1;
                d.t = 0;
                d.len = Math.min(dist + DASH_OVERSHOOT, DASH_MAX);
                d.dir.set(Math.sin(boss.yaw), 0, Math.cos(boss.yaw));
                d.left = d.len;
                d.v = DASH_SPEED * boss.dashSpeed;
                sfx.playBossThrust();
                sfx.playBossImpact(0.7);
                const near = 1 - Math.min(dist / STEP_SHAKE_FAR, 1);
                hooks.addTrauma(0.1 + 0.3 * near * near);
            }
        }
        else if (d.stage === 1 || d.stage === 2) {
            if (d.stage === 1) {
                hip = -0.5;
                lean = 0.45;
                jet = 1;
            }
            else {
                // 噴射を切って、足を踏ん張って止まる（胴体は後ろへ反る）
                d.v = Math.max(0, d.v - DASH_BRAKE * dt);
                hip = -0.6;
                lean = -0.1;
                jet = 0.2;
            }
            const step = d.v * dt;
            // 柱や壁、ステージの端にぶつかったら、その場で止まる（速いうちなら激突）
            dashFrom.set(boss.pos.x, 1, boss.pos.z);
            const ahead = step + BODY_HALF;
            if (castWorld(dashFrom, d.dir, ahead) < ahead) {
                const hit = lastHitBlock();
                if (d.v > DASH_HIT_SPEED) {
                    if (isPillar(hit))
                        dashBump(dist);
                    else
                        dashCrash(dist);
                    damagePillar(hit, PILLAR_CRASH, crashAt);
                }
                d.v = 0;
            }
            else {
                boss.pos.addScaledVector(d.dir, step);
                const x = THREE.MathUtils.clamp(boss.pos.x, boss.bounds.minX, boss.bounds.maxX);
                const z = THREE.MathUtils.clamp(boss.pos.z, boss.bounds.minZ, boss.bounds.maxZ);
                const edge = x !== boss.pos.x || z !== boss.pos.z;
                boss.pos.x = x;
                boss.pos.z = z;
                d.left -= step;
                if (edge) {
                    if (d.v > DASH_HIT_SPEED) {
                        dashCrash(dist);
                        d.v = 0;
                    }
                    else
                        d.left = 0; // ゆっくりなら、止まりにかかる
                }
            }
            if (d.stage === 1 && d.left <= 0)
                d.stage = 2;
            if (d.v > DASH_HIT_SPEED)
                for (const remote of remotePlayers()) {
                    if (remoteDashHits.has(remote.id) || remote.y >= DASH_HIT_HIGH)
                        continue;
                    const mx = boss.pos.x - dashFrom.x, mz = boss.pos.z - dashFrom.z, m2 = mx * mx + mz * mz;
                    const k = m2 > 1e-6 ? THREE.MathUtils.clamp(((remote.x - dashFrom.x) * mx + (remote.z - dashFrom.z) * mz) / m2, 0, 1) : 1;
                    const dx = remote.x - (dashFrom.x + mx * k), dz = remote.z - (dashFrom.z + mz * k);
                    if (Math.hypot(dx, dz) >= DASH_HIT_RADIUS)
                        continue;
                    remoteDashHits.add(remote.id);
                    const side = Math.sign(dx * d.dir.z - dz * d.dir.x) || 1;
                    sendRemoteBossImpact(remote.id, { damage: DASH_DAMAGE * boss.damage, dx: 0, dz: 0, push: 0, shake: 0.8,
                        vx: d.dir.x * DASH_PUSH + d.dir.z * side * DASH_SIDE_PUSH, vz: d.dir.z * DASH_PUSH - d.dir.x * side * DASH_SIDE_PUSH, vy: 4 });
                }
            // 撥ねる: 速いうちに機体の芯の近くへ入ったら、突進の向きと横へ飛ばす（速いので、このフレームに進んだ道のりのどこかで近づいたかを見る）
            if (!d.hit && d.v > DASH_HIT_SPEED && position.y < DASH_HIT_HIGH) {
                const mx = boss.pos.x - dashFrom.x;
                const mz = boss.pos.z - dashFrom.z;
                const m2 = mx * mx + mz * mz;
                const k = m2 > 1e-6 ? THREE.MathUtils.clamp(((position.x - dashFrom.x) * mx + (position.z - dashFrom.z) * mz) / m2, 0, 1) : 1;
                const dx = position.x - (dashFrom.x + mx * k);
                const dz = position.z - (dashFrom.z + mz * k);
                const dd = Math.hypot(dx, dz);
                if (dd < DASH_HIT_RADIUS) {
                    d.hit = true;
                    const side = Math.sign(dx * d.dir.z - dz * d.dir.x) || 1; // 突進の向きから見て、プレイヤーのいる側
                    hurtPlayer(DASH_DAMAGE, 0, 0, 1, 0, 0.8);
                    velocity.x += d.dir.x * DASH_PUSH + d.dir.z * side * DASH_SIDE_PUSH;
                    velocity.z += d.dir.z * DASH_PUSH - d.dir.x * side * DASH_SIDE_PUSH;
                    velocity.y += 4;
                }
            }
            // 滑っている間は、足もとから火花を後ろへ散らす
            d.spark -= dt;
            if (d.v > DASH_HIT_SPEED && d.spark <= 0) {
                d.spark = 0.04;
                dashSparkDir.copy(d.dir).negate().setY(0.3);
                for (const f of boss.feet)
                    spawnSparks(f.pos, dashSparkDir, 3, 0.6, 0.8);
            }
            if (d.v <= 0) {
                d.stage = 3;
                d.t = 0;
            }
        }
        else if (d.bump) {
            // 残骸にぶつかって立て直す: 少しだけ跳ね返り、胴体を軽く反らせてふらつく
            const u = Math.min(d.t / DASH_BUMP_RECOVER, 1);
            const back = Math.min(d.t / 0.2, 1);
            const prev = Math.min((d.t - dt) / 0.2, 1);
            const e = (v) => 1 - (1 - v) * (1 - v);
            boss.pos.addScaledVector(d.dir, -DASH_BUMP_BOUNCE * (e(back) - e(Math.max(prev, 0))));
            boss.pos.x = THREE.MathUtils.clamp(boss.pos.x, boss.bounds.minX, boss.bounds.maxX);
            boss.pos.z = THREE.MathUtils.clamp(boss.pos.z, boss.bounds.minZ, boss.bounds.maxZ);
            const sway = (1 - u) * (1 - u);
            hip = -0.35 * sway;
            lean = -0.18 * sway + 0.06 * Math.sin(d.t * 14) * sway;
            if (u >= 1)
                endDash();
        }
        else if (d.crash) {
            // 激突から立て直す: 跳ね返って後ろへ下がり、胴体を大きく反らせて揺れる
            const u = Math.min(d.t / DASH_CRASH_RECOVER, 1);
            const back = Math.min(d.t / 0.25, 1);
            const prev = Math.min((d.t - dt) / 0.25, 1);
            const e = (v) => 1 - (1 - v) * (1 - v);
            boss.pos.addScaledVector(d.dir, -DASH_CRASH_BOUNCE * (e(back) - e(Math.max(prev, 0))));
            boss.pos.x = THREE.MathUtils.clamp(boss.pos.x, boss.bounds.minX, boss.bounds.maxX);
            boss.pos.z = THREE.MathUtils.clamp(boss.pos.z, boss.bounds.minZ, boss.bounds.maxZ);
            hip = -0.8 * (1 - u) * (1 - u);
            lean = -0.4 * (1 - u) + 0.08 * Math.sin(d.t * 25) * (1 - u);
            if (u >= 1)
                endDash();
        }
        else {
            // 立て直す
            const u = Math.min(d.t / DASH_RECOVER, 1);
            hip = -0.6 * (1 - u) * (1 - u);
            lean = -0.1 * (1 - u);
            if (u >= 1)
                endDash();
        }
        // 足は立ち姿勢の所に付けたまま、機体と一緒に滑らせる（滑っている間は少し浮かせて後ろへ流す）
        if (d.stage >= 0) {
            rig.legs.forEach((leg, i) => {
                const f = boss.feet[i];
                const { B } = legRest(leg.side);
                const run = d.stage === 1 ? 1 : 0;
                toWorld(B.x, B.z - 0.35 * run, f.pos).y = B.y + 0.12 * run;
                f.yaw = boss.yaw;
                f.t = -1;
            });
        }
    }
    // 滑る道: 構えている間だけ床に出す。向きを決めたら濃くして点滅させる
    const show = d.stage === 0 ? Math.min(d.t / 0.3, 1) : 0;
    dashPath.visible = show > 0;
    if (show > 0) {
        const locked = d.t >= d.lock;
        const blink = locked ? 0.5 + 0.5 * Math.cos((d.t - d.lock) * 45) : 1;
        dashPath.position.set(boss.pos.x, 0.04, boss.pos.z);
        dashPath.rotation.y = boss.yaw;
        dashPath.scale.set(DASH_PATH_WIDTH, 1, d.len);
        pathEdgeMat.opacity = 0.85 * show * blink;
        pathFillMat.opacity = (locked ? 0.22 : 0.1) * show;
    }
    boss.dashHip += (hip - boss.dashHip) * Math.min(1, dt * 20);
    boss.dashLean += (lean - boss.dashLean) * Math.min(1, dt * 20);
    boss.jet += (jet - boss.jet) * Math.min(1, dt * 20);
    // 噴射の炎
    flames.forEach((m) => {
        const on = boss.jet;
        m.visible = on > 0.02;
        const flicker = 0.85 + 0.3 * Math.random();
        m.scale.set(0.6 + 0.6 * on, 0.6 + 0.6 * on, 2.4 * on * flicker);
    });
}
// 壁に激突した: ぶつかった所の床を打って衝撃波を広げ、火花を散らす
const crashAt = new THREE.Vector3();
const crashDir = new THREE.Vector3();
function dashCrash(dist) {
    const d = boss.dash;
    d.crash = true;
    crashAt.copy(boss.pos).addScaledVector(d.dir, BODY_HALF);
    crashAt.y = 0;
    groundSlam(crashAt, DASH_CRASH_SLAM);
    sfx.playBossImpact(2.4);
    sfx.playStrikerLand(15, 1.5);
    crashDir.copy(d.dir).negate().setY(0.6).normalize();
    spawnSparks(crashAt.setY(2), crashDir, 40, 1.4, 1.6);
    const near = 1 - Math.min(dist / STEP_SHAKE_FAR, 1);
    hooks.addTrauma(0.35 + 0.6 * near * near);
}
// 残骸にぶつかった: 衝撃波は出さず、当たった所に火花を散らして軽く揺らす
function dashBump(dist) {
    const d = boss.dash;
    d.bump = true;
    crashAt.copy(boss.pos).addScaledVector(d.dir, BODY_HALF);
    crashAt.y = 0;
    sfx.playBossImpact(1.4);
    sfx.playStrikerLand(8, 1.2);
    crashDir.copy(d.dir).negate().setY(0.6).normalize();
    spawnSparks(crashAt.setY(2), crashDir, 24, 1.1, 1.3);
    const near = 1 - Math.min(dist / STEP_SHAKE_FAR, 1);
    hooks.addTrauma(0.15 + 0.3 * near * near);
}
function endDash() {
    const d = boss.dash;
    // 続けて突進する: 短い構えからもう一度
    if (d.chain > 0 && !d.crash && !d.bump && boss.phase === 'walk' && targetPlayer.alive) {
        d.chain--;
        d.stage = 0;
        d.t = 0;
        d.hit = false;
        remoteDashHits.clear();
        d.windup = DASH_CHAIN_WINDUP;
        d.lock = DASH_CHAIN_LOCK;
        const snd = soundAt();
        sfx.playBossServo(DASH_CHAIN_LOCK, 1.3 * snd.volume, snd.pan, 1.1);
        return;
    }
    d.stage = -1;
    d.cd = THREE.MathUtils.lerp(DASH_COOLDOWN_MIN, DASH_COOLDOWN_MAX, Math.random());
}
// ---- 上昇スタンプ ----
export const bossAirborne = () => boss.jump.stage >= 1 && boss.jump.stage <= 3;
const dangers = [];
// 着地範囲にいる間、上から来るスタンプを画面の縁でも知らせる。
export function bossDangers() {
    dangers.length = 0;
    if (!boss.rig || boss.phase !== 'walk' || game.playerHp <= 0)
        return dangers;
    const s = boss.stomp;
    const stompLandTime = STOMP_LIFT + STOMP_HOLD + STOMP_DROP;
    if (s.leg >= 0 && s.t < stompLandTime && position.y < STOMP_HIT_HIGH
        && Math.hypot(position.x - s.at.x, position.z - s.at.z) < STOMP_RADIUS) {
        dangers.push({ x: s.at.x, y: s.at.y + STOMP_HEIGHT, z: s.at.z, k: s.t / stompLandTime, above: true });
    }
    const j = boss.jump;
    const k = j.kind;
    if (j.stage >= 1 && j.stage <= 3 && k.slam.damage > 0 && position.y < k.slam.high) {
        const at = j.stage === 3 ? boss.pos : j.to;
        if (Math.hypot(position.x - at.x, position.z - at.z) < k.slam.radius) {
            const urgency = j.stage === 1 ? 0.5 * Math.min(j.t / k.rise, 1)
                : j.stage === 2 ? 0.5 + 0.5 * Math.min(j.t / Math.max(k.hover, 1e-6), 1) : 1;
            dangers.push({ x: at.x, y: boss.pos.y, z: at.z, k: urgency, above: true });
        }
    }
    return dangers;
}
const jumpAt = new THREE.Vector3();
// 飛び退く先: プレイヤーから離れる向きで、ステージの端の内側にあり、柱や箱に重ならない所（遠い方・真後ろに近い方から探す）。なければ false
function backSpot(out) {
    const away = Math.atan2(boss.pos.x - targetPlayer.pos.x, boss.pos.z - targetPlayer.pos.z);
    const r = BODY_HALF;
    for (const d of BACK_DISTS) {
        for (const da of BACK_ANGLES) {
            const x = boss.pos.x + Math.sin(away + da) * d;
            const z = boss.pos.z + Math.cos(away + da) * d;
            if (x < boss.bounds.minX || x > boss.bounds.maxX || z < boss.bounds.minZ || z > boss.bounds.maxZ)
                continue;
            if (blocks.some((b) => b !== boss.block && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ))
                continue;
            out.set(x, 0, z);
            return true;
        }
    }
    return false;
}
// 跳び移る隅: 四隅のうち今いる所からいちばん近い隅を除き、柱や箱に重ならない所から 1 つを選ぶ。なければ false
const cornerAt = new THREE.Vector3();
function cornerSpot(out) {
    const { minX, maxX, minZ, maxZ } = boss.bounds;
    const r = BODY_HALF;
    const spots = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        for (const inset of CORNER_INSETS) {
            const x = sx < 0 ? minX + inset : maxX - inset;
            const z = sz < 0 ? minZ + inset : maxZ - inset;
            if (x < minX || x > maxX || z < minZ || z > maxZ)
                continue;
            if (blocks.some((b) => b !== boss.block && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ))
                continue;
            spots.push(new THREE.Vector3(x, 0, z));
            break;
        }
    }
    if (spots.length < 2)
        return false;
    const near = (v) => Math.hypot(v.x - boss.pos.x, v.z - boss.pos.z);
    spots.sort((a, b) => near(a) - near(b));
    spots.shift();
    out.copy(spots[Math.floor(Math.random() * spots.length)]);
    return true;
}
// 地響きで跳び移る所: 動ける範囲から候補を選び、柱や箱に重ならず、プレイヤーから QUAKE_AWAY より離れた所のどれか
// （なければいちばん遠い所）。候補がひとつもなければ false
const farAt = new THREE.Vector3();
function farSpot(out) {
    const { minX, maxX, minZ, maxZ } = boss.bounds;
    const r = BODY_HALF;
    let best = -1;
    let picked = false;
    for (let k = 0; k < QUAKE_TRIES; k++) {
        const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
        const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
        if (blocks.some((b) => b !== boss.block && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ))
            continue;
        const d = Math.hypot(x - targetPlayer.pos.x, z - targetPlayer.pos.z);
        if (d > QUAKE_AWAY && !picked) {
            out.set(x, 0, z);
            picked = true;
        }
        else if (!picked && d > best) {
            best = d;
            out.set(x, 0, z);
        }
    }
    return picked || best >= 0;
}
// 必殺技で跳び移る所: 動ける範囲の真ん中。柱や箱に重なれば、まわりの重ならない所を探す（なければ今いる所）
const centerAt = new THREE.Vector3();
function centerSpot(out) {
    const { minX, maxX, minZ, maxZ } = boss.bounds;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const r = BODY_HALF;
    for (const d of ULT_CENTER_STEPS) {
        for (let k = 0; k < (d === 0 ? 1 : 8); k++) {
            const x = cx + Math.sin((k * Math.PI) / 4) * d;
            const z = cz + Math.cos((k * Math.PI) / 4) * d;
            if (x < minX || x > maxX || z < minZ || z > maxZ)
                continue;
            if (blocks.some((b) => b !== boss.block && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ))
                continue;
            return out.set(x, 0, z);
        }
    }
    return out.set(boss.pos.x, 0, boss.pos.z);
}
// 落ちる所: プレイヤーの真上。ステージの端からは内側に収め、柱や箱に重なる所は選ばない（そのときは前の所のまま）
function jumpAim(out) {
    const x = THREE.MathUtils.clamp(targetPlayer.pos.x, boss.bounds.minX, boss.bounds.maxX);
    const z = THREE.MathUtils.clamp(targetPlayer.pos.z, boss.bounds.minZ, boss.bounds.maxZ);
    const r = BODY_HALF;
    for (const b of blocks) {
        if (b === boss.block)
            continue;
        if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ)
            return out;
    }
    return out.set(x, 0, z);
}
function updateJump(dt, dist, want) {
    const j = boss.jump;
    const rig = boss.rig;
    let hip = 0;
    let lean = 0;
    let jet = 0;
    let ring = 0;
    // 足もとに張り付かれている時間
    j.close = dist < HOP_RANGE && targetPlayer.pos.y < JUMP_HEIGHT ? j.close + dt : Math.max(0, j.close - dt * 0.5);
    if (j.stage < 0) {
        j.cd -= dt * boss.rate;
        j.hopCd -= dt * boss.rate;
        j.cornerCd -= dt * boss.rate;
        j.quakeCd -= dt * boss.rate;
        // ほかの攻撃の最中は出さない。高く跳ぶのは足を運んでいない間だけ
        const free = boss.phase === 'walk' && boss.stomp.leg < 0 && boss.gun.t < 0 && boss.dash.stage < 0 && boss.missile.t < 0 && boss.ult.stage < 0
            && !standAttack() && boss.side.t < 0 && targetPlayer.alive;
        const still = free && !boss.feet.some((f) => f.t >= 0);
        const center = still && (boss.ult.pending || boss.ult.cd <= 0); // 必殺技は、ほかの跳び方より先に出す
        const hop = !center && free && j.hopCd <= 0 && j.close > HOP_PRESSURE;
        const quake = !center && !hop && still && boss.bigQuake && j.quakeCd <= 0 && farSpot(farAt);
        const corner = !center && !hop && !quake && still && j.cornerCd <= 0 && dist < CORNER_RANGE_MAX && cornerSpot(cornerAt);
        if (center || hop || quake || corner || (still && j.cd <= 0 && dist > JUMP_RANGE_MIN && dist < JUMP_RANGE_MAX)) {
            if (center)
                centerSpot(centerAt);
            j.kind = center ? JUMP_CENTER : quake ? JUMP_FAR : corner ? JUMP_CORNER : !hop ? JUMP_HIGH : Math.random() < BACK_CHANCE && backSpot(jumpAt) ? JUMP_BACK : JUMP_HOP;
            j.stage = 0;
            j.t = 0;
            j.to.copy(center ? centerAt : quake ? farAt : corner ? cornerAt : boss.pos); // 隅や真ん中へ跳ぶときは、溜めている間から降りる所に輪を出す
            boss.speed = 0;
            const snd = soundAt();
            sfx.playBossServo(j.kind.crouch + 0.1, 1.3 * snd.volume, snd.pan, center ? 0.75 : 0.9);
        }
    }
    const k = j.kind;
    if (j.stage >= 0) {
        j.t += dt;
        if (j.stage === 0) {
            // 腰を深く落として溜める。背中の噴射がだんだん灯る
            const u = Math.min(j.t / k.crouch, 1);
            hip = -0.9 * (1 - (1 - u) * (1 - u));
            lean = 0.1 * u;
            jet = 0.35 * u + 0.08 * Math.sin(j.t * 60);
            if (!k.track && k.warn)
                ring = u; // 跳び払いと隅への跳躍は、打つ範囲を溜めている間から出す
            if (u >= 1) {
                j.stage = 1;
                j.t = 0;
                j.from.copy(boss.pos);
                j.to.copy(k.corner ? cornerAt : k.center ? centerAt : k.far ? farAt : boss.pos);
                if (k.track)
                    jumpAim(j.to);
                else if (k.back)
                    backSpot(j.to); // 飛び退く先は、跳ぶ瞬間のプレイヤーの位置から決め直す（なければ真上へ）
                sfx.playBossThrust();
                sfx.playBossImpact(0.9);
                const near = 1 - Math.min(dist / STEP_SHAKE_FAR, 1);
                hooks.addTrauma(0.15 + 0.35 * near * near);
                spawnQuake(boss.pos.x, boss.pos.z, 0.35, 6, 10); // 噴射で足もとの床がめくれる
                for (const f of boss.feet)
                    spawnSparks(f.pos, UP, 10, 0.8, 1);
            }
        }
        else if (j.stage === 1) {
            // 上がる: 真上へ飛び上がりながら、プレイヤーの上へ寄っていく
            if (k.track)
                jumpAim(j.to);
            const u = Math.min(j.t / k.rise, 1);
            const e = u * u * (3 - 2 * u);
            boss.pos.x = THREE.MathUtils.lerp(j.from.x, j.to.x, e);
            boss.pos.z = THREE.MathUtils.lerp(j.from.z, j.to.z, e);
            boss.pos.y = k.height * (1 - (1 - u) * (1 - u));
            turnToward(want, DASH_TURN * 0.5, dt);
            hip = 0.1;
            lean = k.back ? -0.3 : 0.15 * u; // 飛び退きは胴体を反らせる
            jet = 1;
            ring = k.track ? u : k.warn ? 1 : 0;
            if (u >= 1) {
                j.stage = 2;
                j.t = 0;
            }
        }
        else if (j.stage === 2) {
            // 狙う: 空中で止まって見下ろし、落ちる所を決めるまでプレイヤーの上を追う
            if (j.t < k.lock) {
                if (k.track)
                    jumpAim(j.to);
            }
            else if (j.t - dt < k.lock && k.track)
                sfx.playSniperLock(1.5);
            const dx = j.to.x - boss.pos.x;
            const dz = j.to.z - boss.pos.z;
            const d = Math.hypot(dx, dz);
            const step = Math.min(d, JUMP_TRACK * dt);
            if (d > 1e-4) {
                boss.pos.x += (dx / d) * step;
                boss.pos.z += (dz / d) * step;
            }
            boss.pos.y = k.height + 0.25 * Math.sin(j.t * 4) * Number(k.track);
            lean = k.back ? -0.3 : 0.3;
            jet = 0.6 + 0.12 * Math.sin(j.t * 50);
            // 突っ込む前: 噴射を強めて少し上へ跳ね上がり、脚を縮める
            const pop = k.dive ? Math.max(0, (j.t - (k.hover - QUAKE_POP)) / QUAKE_POP) : 0;
            if (pop > 0) {
                boss.pos.y += QUAKE_POP_HEIGHT * Math.sin((Math.PI / 2) * pop);
                hip = 0.4 * pop;
                lean = 0.3 - 0.5 * pop;
                jet = 1;
                if (j.t - dt < k.hover - QUAKE_POP)
                    sfx.playSniperLock(1.6);
            }
            ring = k.warn ? 1 : 0;
            if (j.t >= k.hover) {
                j.stage = 3;
                j.t = 0;
                j.v = k.dive ? QUAKE_DIVE_V0 : JUMP_FALL_V0;
                if (k.dive)
                    sfx.playBossThrust();
            }
        }
        else if (j.stage === 3) {
            // 落ちる: 噴射を切って、脚を伸ばして一気に落ちる
            j.v += (k.dive ? QUAKE_DIVE_GRAVITY : JUMP_GRAVITY) * dt;
            boss.pos.y -= j.v * dt;
            hip = 0.15;
            lean = 0.1;
            if (k.dive) {
                // 背中の噴射を吹かしたまま、胴体を前へ倒して床へ突っ込む
                jet = 1;
                lean = 0.45;
                hip = 0.3;
            }
            ring = k.warn ? 1 : 0;
            if (boss.pos.y <= 0) {
                boss.pos.y = 0;
                groundSlam(jumpAt.copy(boss.pos), k.slam);
                const snd = soundAt();
                sfx.playBossHiss(0.5, snd.volume, snd.pan, 0.12); // 着いた衝撃を逃がす
                j.stage = 4;
                j.t = 0;
                rig.legs.forEach((leg, i) => {
                    const { B } = legRest(leg.side);
                    toWorld(B.x, B.z, boss.feet[i].pos).y = B.y;
                });
                boss.jumpHip = k.back ? -0.6 : -1.1; // 着いた衝撃で深く沈む
                if (k.back)
                    boss.gun.cd = Math.min(boss.gun.cd, BACK_GUN_DELAY); // 間合いを取ったら、すぐ撃つ
                if (k.corner) {
                    // 隅に降りたら、銃かミサイルのどちらかで撃つ（もう一方は少し待たせて、重ならないようにする）
                    const missile = Math.random() < CORNER_MISSILE_CHANCE && dist > MISSILE_RANGE_MIN;
                    const [now, later] = missile ? [boss.missile, boss.gun] : [boss.gun, boss.missile];
                    now.cd = Math.min(now.cd, CORNER_FIRE_DELAY);
                    later.cd = Math.max(later.cd, 2);
                }
            }
        }
        else {
            // 立て直す（その間は動けない）
            const u = Math.min(j.t / k.recover, 1);
            hip = -1.1 * (1 - u) * (1 - u);
            lean = 0.25 * (1 - u);
            if (u >= 1 || boss.phase !== 'walk')
                endJump();
        }
        // 空中では脚をぶら下げて、少し後ろへ流す
        if (bossAirborne()) {
            rig.legs.forEach((leg, i) => {
                const f = boss.feet[i];
                const { B } = legRest(leg.side);
                const hang = j.stage === 3 ? 0.7 : 0.45;
                toWorld(B.x, B.z - (j.stage === 3 ? 0.05 : 0.3), f.pos).y = boss.pos.y + B.y - hang;
                f.yaw = boss.yaw;
                f.t = -1;
            });
        }
    }
    boss.jumpHip += (hip - boss.jumpHip) * Math.min(1, dt * 18);
    boss.jumpLean += (lean - boss.jumpLean) * Math.min(1, dt * 18);
    boss.backJet += (jet - boss.backJet) * Math.min(1, dt * 20);
    for (const m of backFlames) {
        m.visible = boss.backJet > 0.02;
        const flicker = 0.85 + 0.3 * Math.random();
        m.scale.set(0.7 + 0.6 * boss.backJet, 4 * boss.backJet * flicker, 0.7 + 0.6 * boss.backJet);
    }
    // 落ちる所の輪: 上がるにつれて濃く、落ちる所を決めたら点滅させる
    // 地響きの予告: 降りる所から、衝撃波の届くステージの端まで、輪を何重にも出して外へ流す。落ちるにつれて速く点滅する
    const warn = k.far && j.stage >= 0 && j.stage <= 3 ? (j.stage === 0 ? Math.min(j.t / k.crouch, 1) : 1) : 0;
    quakeWarn.group.visible = warn > 0;
    if (warn > 0) {
        quakeWarn.group.position.set(j.stage === 3 ? boss.pos.x : j.to.x, 0.03, j.stage === 3 ? boss.pos.z : j.to.z);
        const flow = (j.stage === 3 ? 4 : 1) * QUAKE_WARN_SPEED * (performance.now() / 1000);
        const blink = j.stage === 3 ? 0.5 + 0.5 * Math.cos(j.t * 50) : j.stage === 2 ? 0.75 + 0.25 * Math.cos(j.t * 20) : 1;
        quakeWarn.rings.forEach((m, i) => {
            const rad = k.slam.radius + ((i * QUAKE_WARN_SPACING + flow) % (QUAKE_WARN_RINGS * QUAKE_WARN_SPACING));
            m.visible = rad < k.slam.range;
            m.scale.setScalar(rad);
            quakeWarn.mats[i].opacity = 0.6 * warn * blink * (1 - 0.6 * (rad / k.slam.range));
        });
    }
    const rg = jumpRing.group;
    rg.visible = ring > 0;
    if (ring > 0) {
        const locked = j.stage === 3 || (j.stage === 2 && j.t >= k.lock) || !k.track;
        const blink = locked ? 0.5 + 0.5 * Math.cos(j.t * 45) : 1;
        rg.position.set(j.stage === 3 ? boss.pos.x : j.to.x, 0.04, j.stage === 3 ? boss.pos.z : j.to.z);
        rg.scale.setScalar(k.slam.radius * (1.2 - 0.2 * ring));
        jumpRing.edgeMat.opacity = 0.85 * ring * blink;
        jumpRing.fillMat.opacity = (locked ? 0.2 : 0.12) * ring;
    }
}
// 跳んでいる途中でしゃがみ込んだ: 地上にいればやめ、空中にいればその場で落ちる
function abortJump() {
    const j = boss.jump;
    if (j.stage === 1 || j.stage === 2) {
        j.stage = 3;
        j.t = 0;
        j.v = 0;
    }
    else if (j.stage === 0 || j.stage === 4)
        endJump();
}
function endJump() {
    const j = boss.jump;
    j.stage = -1;
    if (j.kind === JUMP_CENTER) {
        if (boss.phase === 'walk')
            startUlt(); // 真ん中に降りたら必殺技（しゃがみ込んでいたら、起き上がってから跳び直す）
    }
    else if (j.kind === JUMP_FAR)
        j.quakeCd = THREE.MathUtils.lerp(QUAKE_COOLDOWN_MIN, QUAKE_COOLDOWN_MAX, Math.random());
    else if (j.kind === JUMP_CORNER)
        j.cornerCd = THREE.MathUtils.lerp(CORNER_COOLDOWN_MIN, CORNER_COOLDOWN_MAX, Math.random());
    else if (j.kind !== JUMP_HIGH) {
        j.hopCd = HOP_COOLDOWN;
        j.close = 0;
    }
    else
        j.cd = THREE.MathUtils.lerp(JUMP_COOLDOWN_MIN, JUMP_COOLDOWN_MAX, Math.random());
}
// ---- 銃 ----
const gunTarget = new THREE.Vector3();
const gunFrom = new THREE.Vector3();
const gunDir = new THREE.Vector3();
const armOf = (i) => (i === 0 ? 'armR' : 'armL');
function updateGun(dt, dist) {
    const g = boss.gun;
    bossTargetAim(gunTarget);
    boss.aim.lerp(gunTarget, 1 - Math.exp(-GUN_AIM_RATE * dt));
    for (let i = 0; i < 2; i++)
        boss.recoil[i] -= boss.recoil[i] * Math.min(1, dt * 10);
    const broken = [0, 1].map((i) => boss.limbs[armOf(i)].broken);
    const brokenArms = Number(broken[0]) + Number(broken[1]);
    // しゃがみ込んでいる間・ほかの攻撃の最中は撃たない（構えていたらやめる）
    if (boss.phase !== 'walk' || boss.stomp.leg >= 0 || boss.dash.stage >= 0 || boss.jump.stage >= 0 || boss.missile.t >= 0 || boss.ult.stage >= 0
        || standAttack() || !targetPlayer.alive) {
        if (g.t >= 0)
            g.cd = Math.max(g.cd, 1);
        g.t = -1;
    }
    else if (g.t < 0) {
        g.cd -= dt * boss.rate;
        if (g.cd <= 0 && dist > STOMP_RANGE && canSeePlayer()) {
            g.t = 0;
            g.n = 0;
            g.sweep = Math.random() < SWEEP_CHANCE;
            // 故障した腕は撃つ数が減る（薙ぎ払いは全体の数が減る）
            const perArm = (i) => (broken[i] ? Math.ceil(boss.shotsPerArm * ARM_BROKEN_SHOTS) : boss.shotsPerArm);
            g.armLeft = g.sweep ? [Infinity, Infinity] : [perArm(0), perArm(1)];
            g.armN = [0, 0];
            g.shots = g.sweep ? Math.round(boss.shotsPerArm * SWEEP_SHOTS_PER * (1 - ARM_BROKEN_SWEEP * brokenArms)) : perArm(0) + perArm(1);
            g.next = g.sweep ? SWEEP_WINDUP : GUN_WINDUP;
            g.side = Math.random() < 0.5 ? -1 : 1;
            g.kind = SWEEP_KINDS[Math.floor(Math.random() * SWEEP_KINDS.length)];
            sfx.playSniperAim(1.5);
            if (g.sweep) {
                const snd = soundAt();
                sfx.playBossServo(SWEEP_WINDUP * 0.6, snd.volume, snd.pan, 1.3);
            }
        }
    }
    else {
        // 薙ぎ払いの扇の真ん中は、撃ち始めるまでプレイヤーを追う
        if (g.sweep && g.n === 0) {
            g.yaw = Math.atan2(targetPlayer.pos.x - boss.pos.x, targetPlayer.pos.z - boss.pos.z);
            g.dist = Math.max(dist, STOMP_RANGE);
            g.y = targetPlayer.pos.y;
        }
        g.t += dt;
        while (g.shots > 0 && g.t >= g.next) {
            // 腕を交互に（片方が撃ち終えていればもう一方）、同じ腕では上下の砲身を交互に
            const arm = g.armLeft[g.n % 2] > 0 ? g.n % 2 : 1 - (g.n % 2);
            const barrel = g.armN[arm] % 2;
            g.armLeft[arm]--;
            g.armN[arm]++;
            // 故障した腕の砲は弾が散らばり、動く先を読まない
            const spread = broken[arm] ? GUN_SPREAD * ARM_BROKEN_SPREAD : GUN_SPREAD;
            if (g.sweep) {
                const a = sweepAngle(arm, g.n / Math.max(g.n + g.shots - 1, 1));
                gunTarget.set(boss.pos.x + Math.sin(a) * g.dist, g.y + SWEEP_HEIGHT, boss.pos.z + Math.cos(a) * g.dist);
                boss.sweepAim[arm] = a;
                fireGun(arm, barrel, gunTarget, broken[arm] ? spread : 0);
            }
            else
                fireGun(arm, barrel, boss.lead && !broken[arm] && g.n % GUN_LEAD_EVERY === GUN_LEAD_EVERY - 1 ? leadTarget(arm, gunTarget) : boss.aim, spread);
            g.n++;
            g.shots--;
            g.next += g.sweep ? SWEEP_INTERVAL : GUN_INTERVAL;
        }
        if (g.shots <= 0 && g.t >= g.next) {
            g.t = -1;
            g.cd = THREE.MathUtils.lerp(GUN_COOLDOWN_MIN, GUN_COOLDOWN_MAX, Math.random());
        }
    }
    // 砲口の光: 構えるにつれて大きく、撃った直後は強く
    // 薙ぎ払いでは、撃っている向きへ砲を横へ振る（撃ち始めるまでは振り始めの向きへ構える）
    for (let i = 0; i < 2; i++) {
        let yawGoal = 0;
        if (g.t >= 0 && g.sweep) {
            const a = g.n === 0 ? sweepAngle(i, 0) : boss.sweepAim[i];
            yawGoal = THREE.MathUtils.clamp(wrap(a - boss.yaw - boss.twist), -SWEEP_GUN_YAW, SWEEP_GUN_YAW);
        }
        else if (boss.laser.stage >= 0 && boss.laser.stage < 2 && i === boss.laser.arm)
            yawGoal = boss.laser.gunYaw; // レーザーを振る
        boss.gunYaw[i] += (yawGoal - boss.gunYaw[i]) * Math.min(1, dt * 24);
    }
    // （薙ぎ払いは構えている間、光が速く脈打つ）
    // 必殺技は、溜める間に光がだんだん大きく速く脈打ち、撃っている間は灯ったまま
    const u = boss.ult;
    const ultGlow = u.stage === 0 ? 1 + 1.5 * (u.t / ULT_CHARGE) : u.stage === 1 ? 1.4 : 0;
    const swipeGlow = boss.swipe.stage === 0 ? 1.6 * Math.min(boss.swipe.t / SWIPE_WINDUP, 1) : 0; // 薙ぎ払いの溜めでも灯す
    const windup = Math.max(g.t >= 0 ? Math.min(g.t / (g.sweep ? SWEEP_WINDUP : GUN_WINDUP), 1) : 0, ultGlow, swipeGlow);
    const pulse = g.sweep && g.n === 0 ? 1 + 0.6 * Math.sin(g.t * 40) : u.stage === 0 ? 1 + 0.5 * Math.sin(u.t * (20 + 30 * (u.t / ULT_CHARGE))) : 1;
    glows.forEach((pair, i) => {
        const on = windup * (broken[i] ? ARM_BROKEN_GLOW : 1);
        const s = 0.1 * on * pulse + 0.35 * (boss.recoil[i] / GUN_RECOIL);
        for (const m of pair) {
            m.visible = s > 0.01;
            m.scale.setScalar(s);
        }
    });
}
function canSeePlayer() {
    boss.rig.torso.getWorldPosition(gunFrom);
    gunDir.subVectors(bossTargetAim(gunTarget), gunFrom);
    const d = gunDir.length();
    return castWorld(gunFrom, gunDir.divideScalar(d), d) >= d;
}
// 薙ぎ払いで arm（[0] が右腕）が撃つ向き（世界）。u は撃ち始めから撃ち終わりまでの進み (0..1)
function sweepAngle(arm, u) {
    const g = boss.gun;
    if (g.kind === 'pinch') {
        // 両腕が、それぞれの側の端から真ん中へ寄せる（右腕は機体の右 = 角度の小さい側）
        const outer = arm === 0 ? -1 : 1;
        return g.yaw + outer * SWEEP_HALF * (1 - u);
    }
    if (g.kind === 'return')
        return g.yaw - g.side * SWEEP_HALF * Math.cos(2 * Math.PI * u); // 端 → 反対の端 → 戻る
    return g.yaw + g.side * SWEEP_HALF * (2 * u - 1);
}
// 偏差射撃の狙う所: プレイヤーの胸が、砲口から弾が届くまでの間に進む所
function leadTarget(i, out) {
    boss.rig.guns[i].localToWorld(gunFrom.set(0, 0, GUN_MUZZLE_Z));
    bossTargetAim(out);
    const t = (gunFrom.distanceTo(out) / (GUN_BULLET_SPEED * boss.bulletSpeed)) * GUN_LEAD_AMOUNT;
    return out.set(out.x + targetPlayer.vel.x * t, out.y + targetPlayer.vel.y * t * GUN_LEAD_VERTICAL, out.z + targetPlayer.vel.z * t);
}
let nextBossShotId = 1;
function fireGun(i, barrel, at, spread, sound = true) {
    const gun = boss.rig.guns[i];
    gun.localToWorld(gunFrom.set(0, barrel ? -GUN_BARREL_Y : GUN_BARREL_Y, GUN_MUZZLE_Z));
    const dir = new THREE.Vector3().subVectors(at, gunFrom).normalize();
    dir.x += (Math.random() * 2 - 1) * spread;
    dir.y += (Math.random() * 2 - 1) * spread;
    dir.z += (Math.random() * 2 - 1) * spread;
    dir.normalize();
    const mesh = new THREE.Mesh(tracerGeo, enemyTracerMat);
    mesh.frustumCulled = false;
    mesh.visible = false; // 尾が伸びるまで出さない
    scene.add(mesh);
    const networkId = nextBossShotId++;
    enemyBullets.push({
        pos: gunFrom.clone(), dir, traveled: 0, tail: 0, hit: false, mesh,
        speed: GUN_BULLET_SPEED * boss.bulletSpeed, damage: GUN_DAMAGE * boss.damage, tracerLen: GUN_TRACER_LEN, tracerWidth: GUN_TRACER_WIDTH, bossPart: armOf(i), networkId,
    });
    broadcastBossShot({ id: networkId, from: [gunFrom.x, gunFrom.y, gunFrom.z], dir: [dir.x, dir.y, dir.z], speed: GUN_BULLET_SPEED * boss.bulletSpeed,
        damage: GUN_DAMAGE * boss.damage, length: GUN_TRACER_LEN, width: GUN_TRACER_WIDTH, part: i === 0 ? 'armR' : 'armL', sound });
    boss.recoil[i] = GUN_RECOIL;
    if (!sound)
        return;
    const d = gunFrom.distanceTo(position);
    sfx.playGunshot(THREE.MathUtils.clamp(8 / Math.max(d, 1), 0.35, 0.9));
}
// ---- 立ち止まって出す攻撃 ----
// 立ち止まって出す攻撃の、腰を下げる量と胴体を倒す量の行き先（攻撃ごとに毎フレーム決め、updateStandPose で近づける）
const standGoal = { hip: 0, lean: 0 };
function updateStandPose(dt) {
    boss.standHip += (standGoal.hip - boss.standHip) * Math.min(1, dt * 16);
    boss.standLean += (standGoal.lean - boss.standLean) * Math.min(1, dt * 16);
    standGoal.hip = standGoal.lean = 0;
}
const standAttack = () => boss.rift.stage >= 0 || boss.swipe.stage >= 0 || boss.laser.stage >= 0 || boss.thr.stage >= 0 || boss.call.stage >= 0;
// ほかの攻撃をしておらず、新しく攻撃を始められる
const canAttack = () => boss.phase === 'walk' && boss.stomp.leg < 0 && boss.gun.t < 0 && boss.dash.stage < 0 && boss.jump.stage < 0
    && boss.missile.t < 0 && boss.ult.stage < 0 && !standAttack() && boss.side.t < 0 && boss.pos.y <= 0 && targetPlayer.alive;
// しゃがみ込んだら、立ち止まって出す攻撃と横ステップをやめる
function stopStandAttacks() {
    if (boss.rift.stage >= 0)
        endRift();
    if (boss.swipe.stage >= 0)
        endSwipe();
    if (boss.laser.stage >= 0)
        endLaser();
    if (boss.call.stage >= 0)
        endCall(); // 溜めの途中なら、打ち上げずにやめる
    if (boss.thr.stage === 0)
        endThrow(); // 屋上へ跳んだあとは、updateThrow で跳び戻る
    boss.side.t = -1;
}
// プレイヤーへ向き直る（rate rad/s）
function faceToward(want, rate, dt) {
    turnToward(want, rate, dt);
}
// 向き直る: 速さを TURN_ACCEL で上げ下げし、行き先の手前で緩めて止まる（rate rad/s を超えない）。
// このフレームで向き直らなかったら、updateBoss の終わりで速さを 0 に戻す
let turned = false;
function turnToward(want, rate, dt) {
    const err = wrap(want - boss.yaw);
    const goal = Math.sign(err) * Math.min(rate, Math.sqrt(2 * TURN_ACCEL * Math.abs(err)));
    boss.yawVel += THREE.MathUtils.clamp(goal - boss.yawVel, -TURN_ACCEL * dt, TURN_ACCEL * dt);
    const step = boss.yawVel * dt;
    boss.yaw = wrap(boss.yaw + (step * err > 0 && Math.abs(step) > Math.abs(err) ? err : step)); // 行き過ぎない
    turned = true;
}
// 機体の座標で (x, z) の向きに、len だけ柱や壁に当たらずに進めるか
const probeFrom = new THREE.Vector3();
const probeDir = new THREE.Vector3();
function clearToward(dirX, dirZ, len) {
    probeFrom.set(boss.pos.x, 1, boss.pos.z);
    probeDir.set(dirX, 0, dirZ).normalize();
    if (castWorld(probeFrom, probeDir, len + BODY_HALF) < len + BODY_HALF)
        return false;
    const x = boss.pos.x + probeDir.x * len;
    const z = boss.pos.z + probeDir.z * len;
    return x >= boss.bounds.minX && x <= boss.bounds.maxX && z >= boss.bounds.minZ && z <= boss.bounds.maxZ;
}
const roomBehind = () => clearToward(-Math.sin(boss.yaw), -Math.cos(boss.yaw), BACKPEDAL_ROOM);
// 足を立ち姿勢の所に付けたまま、機体と一緒に動かす
function plantFeet() {
    boss.rig.legs.forEach((leg, i) => {
        const f = boss.feet[i];
        const { B } = legRest(leg.side);
        toWorld(B.x, B.z, f.pos).y = B.y;
        f.yaw = boss.yaw;
        f.t = -1;
    });
}
// 床に出す線（原点から +Z へ伸びる。隆起ラインの予告）
function makePath() {
    const fillMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
    const edgeMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
    const group = new THREE.Group();
    const plane = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    group.add(new THREE.Mesh(plane(), fillMat));
    for (const x of [-0.5, 0.5]) {
        const edge = new THREE.Mesh(plane(), edgeMat);
        edge.scale.x = 0.06;
        edge.position.x = x;
        group.add(edge);
    }
    group.visible = false;
    return { group, fillMat, edgeMat };
}
// ---- 横ステップ ----
const sideDir = new THREE.Vector3();
function updateSide(dt, dist, want) {
    const sd = boss.side;
    sd.pressure = Math.max(0, sd.pressure - dt * 0.7);
    // 連射を始めたら、その途中で横へ動くかを決める
    const gunOn = boss.gun.t >= 0;
    if (gunOn && !sd.gunWas)
        sd.gunRoll = !boss.gun.sweep && Math.random() < SIDE_GUN_CHANCE;
    sd.gunWas = gunOn;
    if (sd.t < 0) {
        sd.cd -= dt * boss.rate;
        // 連射の途中か、ほかの攻撃をしていないときだけ
        const free = canAttack() || (gunOn && !boss.gun.sweep && boss.phase === 'walk' && boss.stomp.leg < 0 && boss.pos.y <= 0);
        const trigger = sd.pressure >= SIDE_HITS || (gunOn && sd.gunRoll && boss.gun.n >= 2);
        if (sd.cd > 0 || !free || !trigger || dist < 3)
            return;
        // プレイヤーから見て横へ（どちらかへ。ふさがっていれば反対へ）
        const s0 = Math.random() < 0.5 ? -1 : 1;
        const px = Math.cos(want);
        const pz = -Math.sin(want);
        const side = clearToward(px * s0, pz * s0, SIDE_DIST) ? s0 : clearToward(-px * s0, -pz * s0, SIDE_DIST) ? -s0 : 0;
        sd.gunRoll = false;
        if (side === 0)
            return;
        sd.t = 0;
        sd.pressure = 0;
        sd.from.copy(boss.pos);
        sd.to.set(boss.pos.x + px * side * SIDE_DIST, 0, boss.pos.z + pz * side * SIDE_DIST);
        boss.speed = 0;
        for (const f of boss.feet)
            f.t = -1;
        const snd = soundAt();
        sfx.playBossHiss(SIDE_TIME, snd.volume, snd.pan);
        sfx.playBossThrust();
        return;
    }
    sd.t += dt;
    const u = Math.min(sd.t / SIDE_TIME, 1);
    const e = 1 - (1 - u) * (1 - u) * (1 - u);
    boss.pos.lerpVectors(sd.from, sd.to, e);
    faceToward(want, TURN_SPEED_NEAR, dt);
    plantFeet();
    boss.jet = Math.max(boss.jet, 1 - u);
    sideDir.subVectors(sd.from, sd.to).normalize().setY(0.3);
    if (u < 0.8)
        for (const f of boss.feet)
            spawnSparks(f.pos, sideDir, 2, 0.5, 0.8);
    if (u >= 1) {
        sd.t = -1;
        sd.cd = SIDE_COOLDOWN;
    }
}
const rifts = [];
let riftHit = false; // 1 回の隆起ラインで当たるのは 1 度だけ
const remoteRiftHits = new Set();
const riftPaths = Array.from({ length: 5 }, makePath);
const riftFrom = new THREE.Vector3();
const riftDir = new THREE.Vector3();
const riftAt = new THREE.Vector3();
// k 本目の線の向き（真ん中から左右へ交互に開く）
const riftYaw = (k) => boss.rift.yaw + RIFT_SPREAD * Math.ceil(k / 2) * (k % 2 ? 1 : -1);
// 向き yaw の線が柱や壁で止まるまでの長さ
function riftLength(yaw) {
    riftFrom.set(boss.pos.x + Math.sin(yaw) * RIFT_START, 0.4, boss.pos.z + Math.cos(yaw) * RIFT_START);
    riftDir.set(Math.sin(yaw), 0, Math.cos(yaw));
    return castWorld(riftFrom, riftDir, RIFT_LENGTH);
}
function updateRift(dt, dist, want) {
    const rf = boss.rift;
    let hip = 0;
    let lean = 0;
    if (rf.stage < 0) {
        rf.cd -= dt * boss.rate;
        if (rf.cd <= 0 && canAttack() && dist > RIFT_RANGE_MIN && dist < RIFT_RANGE_MAX) {
            rf.stage = 0;
            rf.t = 0;
            rf.yaw = want;
            boss.speed = 0;
            const snd = soundAt();
            sfx.playBossServo(RIFT_LOCK, 1.2 * snd.volume, snd.pan, 0.7);
        }
    }
    else {
        rf.t += dt;
        if (rf.stage === 0) {
            // 溜める: 向きを決めるまでプレイヤーへ向き直りながら、腰を落として胴体を反らせる
            if (rf.t < RIFT_LOCK) {
                faceToward(want, DASH_TURN, dt);
                rf.yaw = boss.yaw;
            }
            else if (rf.t - dt < RIFT_LOCK)
                sfx.playSniperLock(1.2);
            const e = Math.min(rf.t / RIFT_WINDUP, 1);
            hip = -0.5 * e;
            lean = -0.25 * e;
            if (rf.t >= RIFT_WINDUP) {
                // 床を打つ: 線の数だけ突き上がりを走らせる
                rf.stage = 1;
                rf.t = 0;
                riftHit = false;
                remoteRiftHits.clear();
                for (let k = 0; k < boss.riftLines; k++) {
                    const yaw = riftYaw(k);
                    rifts.push({
                        x: boss.pos.x + Math.sin(yaw) * RIFT_START, z: boss.pos.z + Math.cos(yaw) * RIFT_START,
                        dx: Math.sin(yaw), dz: Math.cos(yaw), len: riftLength(yaw), block: lastHitBlock(), crack: RIFT_CRACK_STEP * Math.random(), run: 0, last: NaN, spark: 0,
                    });
                }
                riftAt.set(boss.pos.x + Math.sin(rf.yaw) * 1.5, 0, boss.pos.z + Math.cos(rf.yaw) * 1.5);
                groundSlam(riftAt, BACK_SLAM);
                sfx.playBossImpact(1.4);
            }
        }
        else {
            // 立て直す（打った勢いで前へ沈んでから戻す）
            const e = Math.min(rf.t / RIFT_RECOVER, 1);
            hip = -0.8 * (1 - e) * (1 - e);
            lean = 0.35 * (1 - e) * (1 - e);
            if (e >= 1)
                endRift();
        }
    }
    if (rf.stage >= 0) {
        standGoal.hip = hip;
        standGoal.lean = lean;
    }
    // 床の線: 溜めている間だけ出す。向きを決めたら点滅させる
    riftPaths.forEach((p, k) => {
        const on = rf.stage === 0 && k < boss.riftLines ? Math.min(rf.t / 0.25, 1) : 0;
        p.group.visible = on > 0;
        if (on <= 0)
            return;
        const yaw = riftYaw(k);
        const locked = rf.t >= RIFT_LOCK;
        const blink = locked ? 0.5 + 0.5 * Math.cos((rf.t - RIFT_LOCK) * 45) : 1;
        p.group.position.set(boss.pos.x + Math.sin(yaw) * RIFT_START, 0.045, boss.pos.z + Math.cos(yaw) * RIFT_START);
        p.group.rotation.y = yaw;
        p.group.scale.set(RIFT_PATH_WIDTH, 1, Math.max(riftLength(yaw), 0.1));
        p.edgeMat.opacity = 0.85 * on * blink;
        p.fillMat.opacity = (locked ? 0.2 : 0.1) * on;
    });
    // 走っている突き上がり
    for (let i = rifts.length - 1; i >= 0; i--) {
        const l = rifts[i];
        const prev = l.run;
        l.run = Math.min(l.run + RIFT_SPEED * dt, l.len);
        // 通ったマスを順に突き上げる
        for (let d = prev; d <= l.run; d += 0.5) {
            const x = l.x + l.dx * d;
            const z = l.z + l.dz * d;
            const key = Math.floor(x) * 100003 + Math.floor(z);
            if (key === l.last)
                continue;
            l.last = key;
            spawnSpike(x, z, RIFT_SPIKE * (0.8 + 0.4 * Math.random()), RIFT_SPIKE_LIFE);
        }
        const hx = l.x + l.dx * l.run;
        const hz = l.z + l.dz * l.run;
        for (const remote of remotePlayers()) {
            if (remoteRiftHits.has(remote.id) || remote.y >= RIFT_HIGH)
                continue;
            const dx = remote.x - hx, dz = remote.z - hz, d = Math.hypot(dx, dz);
            if (d >= RIFT_WIDTH + PLAYER_RADIUS)
                continue;
            remoteRiftHits.add(remote.id);
            sendRemoteBossImpact(remote.id, { damage: RIFT_DAMAGE * boss.damage, dx, dz, push: 4, shake: 0.5, minVy: RIFT_LAUNCH });
        }
        l.spark -= dt;
        if (l.spark <= 0) {
            l.spark = 0.06;
            spawnSparks(riftAt.set(hx, 0.3, hz), UP, 3, 0.6, 1);
            pushChunks(hx, hz, 1.6, 2, 7);
        }
        // 先頭に触れたら突き上げられる（足が高ければ当たらない）
        if (!riftHit && position.y < RIFT_HIGH) {
            const dx = position.x - hx;
            const dz = position.z - hz;
            const d = Math.hypot(dx, dz);
            if (d < RIFT_WIDTH + PLAYER_RADIUS) {
                riftHit = true;
                hurtPlayer(RIFT_DAMAGE, dx, dz, d, 4, 0.5);
                velocity.y = Math.max(velocity.y, RIFT_LAUNCH);
            }
        }
        while (l.crack < l.run) {
            spawnCrack(l.x + l.dx * l.crack, l.z + l.dz * l.crack, 1.6 + Math.random());
            l.crack += RIFT_CRACK_STEP;
        }
        if (l.run >= l.len) {
            damagePillar(l.block, PILLAR_RIFT, riftAt.set(hx, 1, hz));
            rifts.splice(i, 1);
        }
    }
}
function endRift() {
    const rf = boss.rift;
    rf.stage = -1;
    rf.cd = THREE.MathUtils.lerp(RIFT_COOLDOWN_MIN, RIFT_COOLDOWN_MAX, Math.random());
    for (const p of riftPaths)
        p.group.visible = false;
}
// ---- 増援を呼ぶ ----
const signal = { t: -1, mesh: (() => {
        const m = new THREE.Mesh(glowGeo, glowMat);
        m.scale.setScalar(0.22);
        m.raycast = () => { };
        return m;
    })() };
const callAt = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
function updateCall(dt, dist, want) {
    updateSignal(dt);
    const c = boss.call;
    if (c.stage < 0) {
        c.cd -= dt;
        if (c.cd <= 0 && canAttack() && signal.t < 0 && dist > CALL_RANGE_MIN && hooks.addsAlive() === 0) {
            c.stage = 0;
            c.t = 0;
            boss.speed = 0;
            const snd = soundAt();
            sfx.playBossServo(CALL_WINDUP, 1.2 * snd.volume, snd.pan, 0.6);
            sfx.playBossHatch(snd.volume, snd.pan);
        }
        return;
    }
    c.t += dt;
    if (c.stage === 0) {
        // 溜める: プレイヤーへ向き直りながら、腰を落として胴体を反らせ、背中の発射口を空へ向ける
        faceToward(want, TURN_SPEED_NEAR, dt);
        const e = Math.min(c.t / CALL_WINDUP, 1);
        standGoal.hip = -0.4 * e;
        standGoal.lean = -0.3 * e;
        if (c.t >= CALL_WINDUP) {
            c.stage = 1;
            c.t = 0;
            boss.rig.torso.localToWorld(callAt.set(0, MISSILE_PORT_Y, MISSILE_PORT_Z));
            signal.t = 0;
            signal.mesh.position.copy(callAt);
            signal.mesh.visible = true;
            fireBurst(flares, callAt, 2.5, 0.3, 2, 1);
            spawnSparks(callAt, DOWN, 12, 0.8, 0.9);
            const snd = soundAt(callAt);
            sfx.playMissileLaunch(snd.volume, snd.pan);
        }
    }
    else {
        // 立て直す（打ち上げた反動で沈んでから戻す）
        const e = Math.min(c.t / CALL_RECOVER, 1);
        standGoal.hip = -0.4 * (1 - e) * (1 - e);
        standGoal.lean = -0.3 * (1 - e) * (1 - e);
        if (e >= 1)
            endCall();
    }
}
function endCall() {
    const c = boss.call;
    c.stage = -1;
    c.cd = THREE.MathUtils.lerp(CALL_COOLDOWN_MIN, CALL_COOLDOWN_MAX, Math.random());
}
// 信号弾: 火花を引いて真上へ昇り、空で弾けたら増援を呼ぶ（機体がしゃがみ込んでも、打ち上げたものは届く）
function updateSignal(dt) {
    if (signal.t < 0)
        return;
    signal.t += dt;
    signal.mesh.position.y += SIGNAL_SPEED * dt;
    spawnSparks(signal.mesh.position, UP, 2, 0.6, 0.6);
    if (signal.t < SIGNAL_TIME)
        return;
    signal.t = -1;
    signal.mesh.visible = false;
    fireBurst(flares, signal.mesh.position, 9, 0.7, 2.6, 1);
    spawnSparks(signal.mesh.position, DOWN, 30, 1.6, 1.4);
    sfx.playMissileBlast(0.35);
    if (boss.phase !== 'dead')
        hooks.callAdds(boss.adds);
}
// ---- 腕の薙ぎ払い ----
// 薙ぐ範囲の扇（床に置く。機体の正面を真ん中に、薙ぐ角度と届く距離だけ広げる）
const swipeFan = (() => {
    const half = SWIPE_TWIST + 0.15;
    const fillMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
    const edgeMat = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false });
    const group = new THREE.Group();
    // 寝かせたとき、角度 -π/2 が機体の正面（+Z）に来る
    const fill = new THREE.Mesh(new THREE.RingGeometry(BODY_HALF, SWIPE_REACH, 48, 1, -Math.PI / 2 - half, 2 * half), fillMat);
    const edge = new THREE.Mesh(new THREE.RingGeometry(SWIPE_REACH - 0.12, SWIPE_REACH, 48, 1, -Math.PI / 2 - half, 2 * half), edgeMat);
    for (const m of [fill, edge]) {
        m.rotation.x = -Math.PI / 2;
        group.add(m);
    }
    group.visible = false;
    return { group, fillMat, edgeMat };
})();
function startSwipe(want) {
    const sw = boss.swipe;
    sw.stage = 0;
    sw.t = 0;
    sw.hit = false;
    remoteSwipeHits.clear();
    sw.side = Math.random() < 0.5 ? -1 : 1;
    boss.speed = 0; // 向き直りは溜めの間に faceToward でする
    const snd = soundAt();
    sfx.playBossServo(SWIPE_WINDUP, 1.3 * snd.volume, snd.pan, 1.2);
}
const swipeAt = new THREE.Vector3();
const remoteSwipeHits = new Set();
function updateSwipe(dt, dist, want) {
    const sw = boss.swipe;
    let goal = 0;
    let hip = 0;
    let lean = 0;
    if (sw.stage === 0) {
        // 溜める: プレイヤーへ向き直りながら、胴体を片側へひねる
        faceToward(want, TURN_SPEED_NEAR, dt);
        const e = Math.min(sw.t / SWIPE_WINDUP, 1);
        goal = sw.side * SWIPE_TWIST * (1 - (1 - e) * (1 - e));
        hip = -0.35 * e;
        lean = 0.15 * e;
        sw.t += dt;
        if (sw.t >= SWIPE_WINDUP) {
            sw.stage = 1;
            sw.t = 0;
            sfx.playStrikerSlash(1.6);
        }
    }
    else if (sw.stage === 1) {
        // 薙ぐ: 反対側まで一気に回す。回した角度がプレイヤーのいる向きを通り過ぎたら当たる
        const prevTwist = boss.swipeTwist;
        sw.t += dt;
        const e = Math.min(sw.t / SWIPE_SWING, 1);
        const k = e * e * (3 - 2 * e);
        boss.swipeTwist = sw.side * SWIPE_TWIST * (1 - 2 * k);
        goal = boss.swipeTwist;
        hip = -0.35;
        lean = 0.25;
        const localDx = position.x - boss.pos.x, localDz = position.z - boss.pos.z;
        const localDist = Math.hypot(localDx, localDz);
        const rel = wrap(Math.atan2(localDx, localDz) - boss.yaw);
        const lo = Math.min(prevTwist, boss.swipeTwist);
        const hi = Math.max(prevTwist, boss.swipeTwist);
        for (const remote of remotePlayers()) {
            if (remoteSwipeHits.has(remote.id) || remote.y >= SWIPE_HIGH)
                continue;
            const dx = remote.x - boss.pos.x, dz = remote.z - boss.pos.z;
            const d = Math.hypot(dx, dz), rel = wrap(Math.atan2(dx, dz) - boss.yaw);
            if (d >= SWIPE_REACH || rel < lo - 0.15 || rel > hi + 0.15)
                continue;
            remoteSwipeHits.add(remote.id);
            const turn = -sw.side, safe = Math.max(d, 1e-3);
            sendRemoteBossImpact(remote.id, { damage: SWIPE_DAMAGE * boss.damage, dx, dz, push: SWIPE_PUSH * 0.6, shake: 0.8,
                vx: dz / safe * turn * SWIPE_PUSH * 0.8, vz: -dx / safe * turn * SWIPE_PUSH * 0.8, minVy: SWIPE_LIFT });
        }
        if (!sw.hit && rel >= lo - 0.15 && rel <= hi + 0.15 && localDist < SWIPE_REACH && position.y < SWIPE_HIGH) {
            sw.hit = true;
            // 薙いだ向き（回す向きの接線）と外へ飛ばす
            const dx = position.x - boss.pos.x;
            const dz = position.z - boss.pos.z;
            const d = Math.max(localDist, 1e-3);
            const turn = -sw.side; // 回している向き（角度が増える向きが +）
            hurtPlayer(SWIPE_DAMAGE, dx, dz, d, SWIPE_PUSH * 0.6, 0.8);
            velocity.x += (dz / d) * turn * SWIPE_PUSH * 0.8;
            velocity.z += (-dx / d) * turn * SWIPE_PUSH * 0.8;
            velocity.y = Math.max(velocity.y, SWIPE_LIFT);
        }
        // 砲口から火花の尾を引く
        for (const gun of boss.rig.guns)
            spawnSparks(gun.localToWorld(swipeAt.set(0, 0, GUN_MUZZLE_Z)), UP, 2, 0.4, 0.8);
        if (sw.t >= SWIPE_SWING) {
            sw.stage = 2;
            sw.t = 0;
        }
    }
    else if (sw.stage === 2) {
        sw.t += dt;
        const e = Math.min(sw.t / SWIPE_RECOVER, 1);
        goal = -sw.side * SWIPE_TWIST * (1 - e);
        hip = -0.35 * (1 - e);
        lean = 0.25 * (1 - e);
        if (e >= 1)
            endSwipe();
    }
    if (sw.stage !== 1)
        boss.swipeTwist += (goal - boss.swipeTwist) * Math.min(1, dt * 14);
    // 床の扇: 溜めるにつれて濃くし、薙ぐ直前は点滅させ、薙いでいる間は灯ったまま
    const fan = swipeFan.group;
    fan.visible = sw.stage === 0 || sw.stage === 1;
    if (fan.visible) {
        const e = sw.stage === 0 ? Math.min(sw.t / SWIPE_WINDUP, 1) : 1;
        const blink = sw.stage === 0 && sw.t > SWIPE_WINDUP - SWIPE_WARN_BLINK ? 0.5 + 0.5 * Math.cos(sw.t * 45) : 1;
        fan.position.set(boss.pos.x, 0.05, boss.pos.z);
        fan.rotation.y = boss.yaw;
        swipeFan.edgeMat.opacity = 0.85 * e * blink;
        swipeFan.fillMat.opacity = (0.08 + 0.17 * e) * blink;
    }
    if (sw.stage >= 0) {
        standGoal.hip = hip;
        standGoal.lean = lean;
    }
}
function endSwipe() {
    boss.swipe.stage = -1;
    swipeFan.group.visible = false;
    boss.stomp.cd = STOMP_COOLDOWN;
}
// ---- レーザー照射 ----
const laserAimMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const laserCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const laserGlowMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const laserGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0); // 根元が原点で、+Y へ伸びる
const laserAim = new THREE.Mesh(laserGeo, laserAimMat);
const laserBeam = new THREE.Group();
{
    const core = new THREE.Mesh(laserGeo, laserCoreMat);
    core.scale.set(0.4, 1, 0.4);
    laserBeam.add(core, new THREE.Mesh(laserGeo, laserGlowMat));
    for (const m of [laserAim, ...laserBeam.children])
        m.raycast = () => { };
    laserAim.visible = laserBeam.visible = false;
}
const laserFrom = new THREE.Vector3();
const scorchLast = new THREE.Vector3(Infinity, 0, Infinity); // 最後に焦げ跡を付けた所
const laserDir = new THREE.Vector3();
const laserEnd = new THREE.Vector3();
const laserPath = new THREE.Line3();
const laserBody = new THREE.Line3();
const laserOnPath = new THREE.Vector3();
const laserOnBody = new THREE.Vector3();
const remoteLaserCooldown = new Map();
// 光線を from から dir へ len だけ伸ばして置く
function placeBeam(obj, radius, len) {
    obj.position.copy(laserFrom);
    obj.quaternion.setFromUnitVectors(UP, laserDir);
    obj.scale.set(radius, len, radius);
}
function updateLaser(dt, dist, want) {
    const lz = boss.laser;
    let showAim = 0;
    let beam = false;
    if (lz.stage < 0) {
        lz.cd -= dt * boss.rate;
        if (lz.cd <= 0 && canAttack() && dist > LASER_RANGE_MIN && dist < LASER_RANGE_MAX && canSeePlayer()) {
            lz.stage = 0;
            lz.t = 0;
            lz.arm = Math.random() < 0.5 ? 0 : 1;
            lz.side = Math.random() < 0.5 ? -1 : 1;
            lz.fire = LASER_FIRE * (boss.limbs[armOf(lz.arm)].broken ? LASER_BROKEN_FIRE : 1);
            lz.hitCd = 0;
            remoteLaserCooldown.clear();
            lz.gunYaw = 0;
            boss.speed = 0;
            sfx.playSniperAim(1.8);
        }
    }
    if (lz.stage >= 0) {
        lz.t += dt;
        const gun = boss.rig.guns[lz.arm];
        gun.localToWorld(laserFrom.set(0, 0, GUN_MUZZLE_Z));
        if (lz.stage === 0) {
            // 狙う: 向きを決めるまでプレイヤーへ向き直り、足もとより少し上を狙う。そのあとは振り始めの向きへ砲を振る
            if (lz.t < LASER_LOCK) {
                faceToward(want, DASH_TURN, dt);
                lz.yaw = want;
                lz.pitch = Math.atan2(targetPlayer.pos.y + LASER_HEIGHT - laserFrom.y, Math.max(Math.hypot(targetPlayer.pos.x - laserFrom.x, targetPlayer.pos.z - laserFrom.z), 1));
            }
            else if (lz.t - dt < LASER_LOCK)
                sfx.playSniperLock(1.5);
            const u = lz.t < LASER_LOCK ? 0 : (lz.t - LASER_LOCK) / (LASER_AIM - LASER_LOCK);
            lz.gunYaw = -lz.side * LASER_SWEEP * Math.min(u, 1);
            showAim = lz.t < LASER_LOCK ? 0.5 : 0.5 + 0.5 * Math.cos((lz.t - LASER_LOCK) * 45);
            if (lz.t >= LASER_AIM) {
                lz.stage = 1;
                lz.t = 0;
                sfx.playSniperShot(2);
                sfx.playBossThrust();
            }
        }
        else if (lz.stage === 1) {
            // 撃つ: 決めた向きの片側から反対側まで、ゆっくり振る
            const u = Math.min(lz.t / lz.fire, 1);
            lz.gunYaw = lz.side * LASER_SWEEP * (2 * u - 1);
            beam = true;
            hooks.addTrauma(dt * 0.4);
            if (u >= 1) {
                lz.stage = 2;
                lz.t = 0;
            }
        }
        else if (lz.t >= LASER_RECOVER)
            endLaser();
    }
    // 光線の向きと、柱や壁・床で止まる所
    const yaw = lz.yaw + lz.gunYaw;
    laserDir.set(Math.sin(yaw) * Math.cos(lz.pitch), Math.sin(lz.pitch), Math.cos(yaw) * Math.cos(lz.pitch));
    const len = lz.stage >= 0 ? castWorld(laserFrom, laserDir, LASER_LEN) : 0;
    const laserBlock = lastHitBlock();
    laserAim.visible = showAim > 0;
    if (showAim > 0) {
        placeBeam(laserAim, 0.035, len);
        laserAimMat.opacity = 0.9 * showAim;
    }
    laserBeam.visible = beam;
    if (beam) {
        placeBeam(laserBeam, LASER_RADIUS * (0.85 + 0.3 * Math.random()), len);
        laserEnd.copy(laserFrom).addScaledVector(laserDir, len);
        spawnSparks(laserEnd, laserDir.clone().negate(), 3, 0.5, 1);
        if (laserEnd.y < 0.5)
            pushChunks(laserEnd.x, laserEnd.z, 1.5, 4, 4);
        // 柱に当たっていれば削り、床に当たっていれば焦がしていく
        if (laserBlock)
            damagePillar(laserBlock, PILLAR_LASER * dt, laserEnd);
        else if (laserEnd.y < 0.1 && Math.hypot(laserEnd.x - scorchLast.x, laserEnd.z - scorchLast.z) > SCORCH_STEP) {
            spawnScorch(laserEnd.x, laserEnd.z, 1.2);
            scorchLast.copy(laserEnd);
        }
        // プレイヤーの体（足もとから頭まで）が光線に触れたら削る
        lz.hitCd -= dt;
        laserPath.set(laserFrom, laserEnd);
        for (const remote of remotePlayers()) {
            const cd = (remoteLaserCooldown.get(remote.id) ?? 0) - dt;
            remoteLaserCooldown.set(remote.id, cd);
            if (cd > 0)
                continue;
            laserBody.start.set(remote.x, remote.y + 0.1, remote.z);
            laserBody.end.set(remote.x, remote.y + remote.eyeHeight, remote.z);
            closestSegmentPoints(laserPath, laserBody, laserOnPath, laserOnBody);
            if (laserOnPath.distanceTo(laserOnBody) >= LASER_RADIUS + PLAYER_RADIUS)
                continue;
            remoteLaserCooldown.set(remote.id, LASER_HIT_EVERY);
            sendRemoteBossImpact(remote.id, { damage: LASER_DAMAGE * boss.damage, dx: 0, dz: 0, push: 0, shake: 0.5,
                vx: (remote.x - laserOnPath.x) * 3, vz: (remote.z - laserOnPath.z) * 3 });
        }
        laserBody.start.set(position.x, position.y + 0.1, position.z);
        laserBody.end.set(position.x, position.y + EYE_HEIGHT, position.z);
        closestSegmentPoints(laserPath, laserBody, laserOnPath, laserOnBody);
        if (lz.hitCd <= 0 && laserOnPath.distanceTo(laserOnBody) < LASER_RADIUS + PLAYER_RADIUS) {
            lz.hitCd = LASER_HIT_EVERY;
            hurtPlayer(LASER_DAMAGE, position.x - laserOnPath.x, position.z - laserOnPath.z, 1, 3, 0.5);
        }
    }
}
function endLaser() {
    const lz = boss.laser;
    lz.stage = -1;
    lz.cd = THREE.MathUtils.lerp(LASER_COOLDOWN_MIN, LASER_COOLDOWN_MAX, Math.random());
    laserAim.visible = laserBeam.visible = false;
}
// ---- 柱投げ ----
// 持ち上げて投げる柱（真ん中が原点。面の格子は柱に付いて回る）
// 持ち上げて投げる柱（真ん中が原点）。中身は投げるたびに作り直し、突き立ったらそのまま壊れる柱の見た目に渡す
const heldPillar = new THREE.Group();
let heldModel = null;
let remoteHeldKind = null;
export function captureBossThrowable() {
    const kind = Object.keys(THROWN).find((key) => THROWN[key] === boss.thr.kind) ?? 'pillar';
    const p = heldPillar.position, q = heldPillar.quaternion;
    return { visible: heldPillar.visible, kind, position: [p.x, p.y, p.z], rotation: [q.x, q.y, q.z, q.w] };
}
export function isBossThrowable(value) {
    if (!value || typeof value !== 'object')
        return false;
    const t = value;
    const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000;
    return typeof t.visible === 'boolean' && typeof t.kind === 'string' && Object.hasOwn(THROWN, t.kind)
        && Array.isArray(t.position) && t.position.length === 3 && t.position.every(finite)
        && Array.isArray(t.rotation) && t.rotation.length === 4 && t.rotation.every(finite);
}
export function applyBossThrowable(t, dt) {
    if (t.visible && (remoteHeldKind !== t.kind || !heldModel)) {
        boss.thr.kind = THROWN[t.kind];
        newHeldModel();
        remoteHeldKind = t.kind;
        heldPillar.position.set(...t.position);
        heldPillar.quaternion.set(...t.rotation).normalize();
    }
    heldPillar.visible = t.visible;
    if (!t.visible)
        return;
    const blend = 1 - Math.exp(-18 * dt);
    heldPillar.position.lerp(heldAt.set(...t.position), blend);
    heldPillar.quaternion.slerp(heldQ.set(...t.rotation).normalize(), blend);
}
function newHeldModel() {
    heldModel?.removeFromParent();
    const k = boss.thr.kind;
    heldModel = k.make();
    heldModel.position.y = -k.len / 2;
    heldPillar.add(heldModel);
}
const heldAt = new THREE.Vector3();
const heldQ = new THREE.Quaternion();
const yawQ = new THREE.Quaternion();
const layQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2); // 縦の柱を横に寝かせる
// 飛んでいる柱: 上の端を up へ向ける。turn が 1 になるまでは、持ち上げていたときの寝かせた向きから回していく
const flyDir = new THREE.Vector3();
const flyQ = new THREE.Quaternion();
function placeFlying(at, up, turn) {
    yawQ.setFromAxisAngle(UP, boss.yaw);
    heldQ.copy(yawQ).multiply(layQ);
    flyQ.setFromUnitVectors(UP, up);
    heldQ.slerp(flyQ, turn);
    heldPillar.position.copy(at);
    heldPillar.quaternion.copy(heldQ);
}
function placeHeld(at, upright) {
    yawQ.setFromAxisAngle(UP, boss.yaw);
    heldQ.copy(yawQ).multiply(layQ);
    heldQ.slerp(yawQ, upright);
    heldPillar.position.copy(at);
    heldPillar.quaternion.copy(heldQ);
}
// 柱を投げる速さを決める: 柱の根元がちょうど th.target に刺さるよう、突き立つときの柱の真ん中を狙う。
// 突き立つ向きは落ちてくる向きで決まり、それで真ん中の位置も変わるので、何度か繰り返して合わせる
const throwEnd = new THREE.Vector3();
function tiltLimit(up) {
    const max = boss.thr.kind.maxTilt;
    const minY = Math.cos(max);
    if (up.y >= minY)
        return up;
    const h = Math.hypot(up.x, up.z);
    const k = Math.sin(max) / Math.max(h, 1e-6);
    return up.set(up.x * k, minY, up.z * k);
}
function aimThrow() {
    const th = boss.thr;
    th.up.set(0, 1, 0);
    for (let i = 0; i < 3; i++) {
        // 柱の真ん中は、根元（床の下 PILLAR_SINK）から柱の向きへ長さの半分
        throwEnd.copy(th.target).addScaledVector(th.up, th.kind.len / 2 - PILLAR_SINK / th.up.y);
        const run = Math.hypot(throwEnd.x - th.fly.x, throwEnd.z - th.fly.z);
        th.flight = THREE.MathUtils.clamp(run / THROW_SPEED, THROW_FLIGHT_MIN, THROW_FLIGHT_MAX);
        const T = th.flight;
        th.vel.set((throwEnd.x - th.fly.x) / T, (throwEnd.y - th.fly.y + 0.5 * THROW_GRAVITY * T * T) / T, (throwEnd.z - th.fly.z) / T);
        th.up.set(-th.vel.x, -(th.vel.y - THROW_GRAVITY * T), -th.vel.z).normalize();
        tiltLimit(th.up);
    }
}
// 屋上で足を着く（hang は空中で脚をぶら下げる量）
function placeFeetAt(hang) {
    boss.rig.legs.forEach((leg, i) => {
        const f = boss.feet[i];
        const { B } = legRest(leg.side);
        toWorld(B.x, B.z, f.pos).y = boss.pos.y + B.y - hang;
        f.yaw = boss.yaw;
        f.t = -1;
    });
}
// 跳び乗る屋上: 動ける範囲の外のビルの上で、まわりも平らな所。y は屋上の高さ。なければ false
function perchSpot(out) {
    const a = boss.arena;
    for (let k = 0; k < PERCH_TRIES; k++) {
        const side = Math.floor(Math.random() * 4);
        const out2 = THREE.MathUtils.lerp(PERCH_OUT[0], PERCH_OUT[1], Math.random());
        const u = THREE.MathUtils.lerp(0.15, 0.85, Math.random());
        const x = side === 0 ? a.minX - out2 : side === 1 ? a.maxX + out2 : THREE.MathUtils.lerp(a.minX, a.maxX, u);
        const z = side === 2 ? a.minZ - out2 : side === 3 ? a.maxZ + out2 : THREE.MathUtils.lerp(a.minZ, a.maxZ, u);
        const top = floorAt(x, z, 1e4);
        if (top < PERCH_MIN_H || top > PERCH_MAX_H)
            continue;
        let flat = true;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (Math.abs(floorAt(x + ox * PERCH_FLAT, z + oz * PERCH_FLAT, 1e4) - top) > 0.3)
                flat = false;
        }
        if (!flat)
            continue;
        out.set(x, top, z);
        return true;
    }
    return false;
}
// 柱が突き立つ所: プレイヤーの足もと。ステージの端からは内側に収め、ほかの柱や箱・機体に重なる所は避ける（まわりを探す）
function throwSpot(out) {
    const half = Math.max(boss.thr.kind.w, boss.thr.kind.d) / 2 + 0.3;
    for (const d of [0, 2.5, 5]) {
        for (let k = 0; k < (d === 0 ? 1 : 8); k++) {
            const x = THREE.MathUtils.clamp(targetPlayer.pos.x + Math.sin((k * Math.PI) / 4) * d, boss.bounds.minX, boss.bounds.maxX);
            const z = THREE.MathUtils.clamp(targetPlayer.pos.z + Math.cos((k * Math.PI) / 4) * d, boss.bounds.minZ, boss.bounds.maxZ);
            if (blocks.some((b) => x + half > b.minX && x - half < b.maxX && z + half > b.minZ && z - half < b.maxZ))
                continue;
            return out.set(x, 0, z);
        }
    }
    return out;
}
// 跳び戻る所: 屋上からいちばん近い、動ける範囲の端の少し内側。柱や箱に重なれば、まわりを探す（なければ真ん中）
function returnSpot(out) {
    const { minX, maxX, minZ, maxZ } = boss.bounds;
    const bx = THREE.MathUtils.clamp(boss.pos.x, minX + THROW_RETURN_IN, maxX - THROW_RETURN_IN);
    const bz = THREE.MathUtils.clamp(boss.pos.z, minZ + THROW_RETURN_IN, maxZ - THROW_RETURN_IN);
    const r = BODY_HALF;
    for (const d of [0, 4, 8]) {
        for (let k = 0; k < (d === 0 ? 1 : 8); k++) {
            const x = bx + Math.sin((k * Math.PI) / 4) * d;
            const z = bz + Math.cos((k * Math.PI) / 4) * d;
            if (x < minX || x > maxX || z < minZ || z > maxZ)
                continue;
            if (blocks.some((b) => b !== boss.block && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ))
                continue;
            return out.set(x, 0, z);
        }
    }
    return centerSpot(out);
}
// 跳び始める
function startLeap(to) {
    const th = boss.thr;
    th.from.copy(boss.pos);
    th.to.copy(to);
    th.dur = THROW_LEAP_BASE + th.from.distanceTo(th.to) * THROW_LEAP_PER_M;
    sfx.playBossThrust();
    sfx.playBossImpact(0.8);
    for (const f of boss.feet)
        spawnSparks(f.pos, UP, 10, 0.8, 1);
}
// 跳んでいる途中: 両端を結ぶ放物線の上（横は一定の速さ。高い方の端より THROW_LEAP_APEX 上を通る）。着いたら true
function leap(u) {
    const th = boss.thr;
    boss.pos.x = THREE.MathUtils.lerp(th.from.x, th.to.x, u);
    boss.pos.z = THREE.MathUtils.lerp(th.from.z, th.to.z, u);
    const top = Math.max(th.from.y, th.to.y) + THROW_LEAP_APEX;
    // 2 次の弧: 始め th.from.y、終わり th.to.y、頂点が top になるように
    const a = th.from.y;
    const c = th.to.y;
    const b = 2 * (top - a) + 2 * Math.sqrt(Math.max((top - a) * (top - c), 0));
    boss.pos.y = a + b * u - (b + a - c) * u * u;
    boss.backJet = Math.max(boss.backJet, 0.9);
    placeFeetAt(0.45);
    return u >= 1;
}
function updateThrow(dt, dist, want) {
    const th = boss.thr;
    let hip = 0;
    let lean = 0;
    if (th.stage < 0) {
        th.cd -= dt * boss.rate;
        if (th.cd <= 0 && canAttack() && pillarCount() < THROW_MAX_PILLARS && perchSpot(th.to)) {
            th.stage = 0;
            th.t = 0;
            boss.speed = 0;
            const snd = soundAt();
            sfx.playBossServo(THROW_CROUCH, 1.3 * snd.volume, snd.pan, 0.8);
        }
    }
    if (th.stage < 0)
        return;
    th.t += dt;
    // 屋上にいる間にしゃがみ込んだら、柱を投げずに跳び戻る
    if (boss.phase !== 'walk' && th.stage >= 2 && th.stage <= 5) {
        heldPillar.visible = false;
        th.stage = 6;
        th.t = THROW_AFTER;
    }
    if (th.stage === 0) {
        // 腰を落として溜め、屋上の方を向く
        faceToward(Math.atan2(th.to.x - boss.pos.x, th.to.z - boss.pos.z), DASH_TURN, dt);
        const e = Math.min(th.t / THROW_CROUCH, 1);
        hip = -0.8 * e;
        lean = 0.1 * e;
        if (th.t >= THROW_CROUCH) {
            startLeap(th.to);
            th.stage = 1;
            th.t = 0;
        }
    }
    else if (th.stage === 1) {
        hip = 0.1;
        lean = 0.2;
        if (leap(Math.min(th.t / th.dur, 1))) {
            boss.pos.copy(th.to);
            placeFeetAt(0);
            th.stage = 2;
            th.t = 0;
            const snd = soundAt();
            sfx.playStrikerLand(15, snd.volume * 1.4);
            for (const f of boss.feet)
                spawnChunks(f.pos, { count: 6, size: [0.1, 0.3], speed: [2, 5], up: 3, light: [0.45, 0.65], life: 4 });
            hooks.addTrauma(0.15);
        }
    }
    else if (th.stage === 2) {
        // 屋上に降りた: 沈んでから、プレイヤーの方へ向き直る
        faceToward(want, DASH_TURN, dt);
        placeFeetAt(0);
        hip = -0.7 * (1 - Math.min(th.t / THROW_LAND, 1));
        if (th.t >= THROW_LAND) {
            th.stage = 3;
            th.t = 0;
            heldPillar.visible = true;
            th.kind = pickThrown();
            newHeldModel();
            const snd = soundAt();
            sfx.playBossServo(THROW_RIP, 1.4 * snd.volume, snd.pan, 0.6);
        }
    }
    else if (th.stage === 3) {
        // もぎ取る: 前の屋上から柱を引き抜き、頭の上へ持ち上げて横に寝かせる
        faceToward(want, DASH_TURN, dt);
        placeFeetAt(0);
        const e = Math.min(th.t / THROW_RIP, 1);
        const k = e * e * (3 - 2 * e);
        heldAt.set(Math.sin(boss.yaw), 0, Math.cos(boss.yaw)).multiplyScalar(3 * (1 - k));
        heldAt.add(boss.pos).setY(boss.pos.y + (th.kind.len / 2) * (1 - k) + THROW_HOLD_Y * k);
        placeHeld(heldAt, 1 - k);
        hip = -0.6 * (1 - k);
        lean = 0.3 * (1 - k) - 0.25 * k;
        if (Math.random() < dt * 20 * (1 - e))
            spawnChunks(heldAt.clone().setY(boss.pos.y + 0.3), { count: 2, size: [0.1, 0.35], speed: [1, 4], up: 3, light: [0.45, 0.6], life: 5 });
        if (th.t - dt < 0.15 && th.t >= 0.15)
            sfx.playBossImpact(0.7);
        if (th.t >= THROW_RIP) {
            th.stage = 4;
            th.t = 0;
            throwSpot(th.target);
            sfx.playSniperAim(1.6);
        }
    }
    else if (th.stage === 4) {
        // 狙う: 胴体を後ろへ引いて振りかぶる。落ちる所を決めるまで、プレイヤーの足もとを追う
        faceToward(want, DASH_TURN, dt);
        placeFeetAt(0);
        if (th.t < THROW_LOCK)
            throwSpot(th.target);
        else if (th.t - dt < THROW_LOCK)
            sfx.playSniperLock(1.4);
        const e = Math.min(th.t / THROW_AIM, 1);
        lean = -0.25 - 0.25 * e;
        hip = -0.2 * e;
        heldAt.set(Math.sin(boss.yaw), 0, Math.cos(boss.yaw)).multiplyScalar(-1.2 * e);
        heldAt.add(boss.pos).setY(boss.pos.y + THROW_HOLD_Y + 0.5 * e);
        placeHeld(heldAt, 0);
        if (th.t >= THROW_AIM) {
            th.stage = 5;
            th.t = 0;
            th.fly.copy(heldAt);
            aimThrow();
            sfx.playBossThrust();
        }
    }
    else if (th.stage === 5) {
        // 柱が飛ぶ: 放物線を描き、根元を飛ぶ向きへ向けて（槍のように）床に突き立つ
        placeFeetAt(0);
        const t = Math.min(th.t, th.flight);
        const e = t / th.flight;
        lean = 0.45 * (1 - e);
        hip = -0.3 * (1 - e);
        heldAt.copy(th.fly).addScaledVector(th.vel, t);
        heldAt.y -= 0.5 * THROW_GRAVITY * t * t;
        flyDir.copy(th.vel).setY(th.vel.y - THROW_GRAVITY * t).normalize().negate(); // 柱の上の端が、飛ぶ向きの後ろ
        const settle = Math.max(0, 1 - (th.flight - t) / THROW_SETTLE);
        if (settle > 0)
            flyDir.lerp(th.up, settle).normalize();
        placeFlying(heldAt, flyDir, Math.min(th.t / THROW_TURN, 1));
        if (e >= 1) {
            heldPillar.visible = false;
            // 飛んできた角度のまま、根元を床にめり込ませて突き立てる（見た目の長さは飛んでいた柱と同じ）
            const model = heldModel;
            model.removeFromParent();
            model.position.y = 0;
            heldModel = null;
            addPillar({ x: th.target.x, z: th.target.z, kind: th.kind, up: th.up, model });
            groundSlam(jumpAt.copy(th.target), THROW_SLAM);
            spawnChunks(heldAt.copy(th.target).setY(0.3), { count: 12, size: [0.15, 0.45], speed: [3, 7], up: 4, spread: 1, light: [0.42, 0.6] });
            th.stage = 6;
            th.t = 0;
        }
    }
    else if (th.stage === 6) {
        placeFeetAt(0);
        if (th.t >= THROW_AFTER) {
            startLeap(returnSpot(jumpAt));
            th.stage = 7;
            th.t = 0;
        }
    }
    else if (th.stage === 7) {
        hip = 0.1;
        lean = 0.2;
        if (leap(Math.min(th.t / th.dur, 1))) {
            boss.pos.copy(th.to).setY(0);
            groundSlam(jumpAt.copy(boss.pos), CORNER_SLAM);
            plantFeet();
            boss.jumpHip = -1;
            th.stage = 8;
            th.t = 0;
        }
    }
    else {
        plantFeet();
        const e = Math.min(th.t / THROW_RECOVER, 1);
        hip = -0.6 * (1 - e) * (1 - e);
        if (e >= 1)
            endThrow();
    }
    if (th.stage >= 0) {
        standGoal.hip = hip;
        standGoal.lean = lean;
    }
}
function endThrow() {
    const th = boss.thr;
    th.stage = -1;
    th.cd = THREE.MathUtils.lerp(THROW_COOLDOWN_MIN, THROW_COOLDOWN_MAX, Math.random());
    heldPillar.visible = false;
}
// ---- 必殺技 ----
function startUlt() {
    const u = boss.ult;
    u.stage = 0;
    u.t = 0;
    u.pending = false;
    u.n = 0;
    u.hop = 0;
    boss.speed = 0;
    const snd = soundAt();
    sfx.playBossUltCharge(ULT_CHARGE, snd.volume, snd.pan);
    sfx.playSniperAim(1.8);
}
function endUlt() {
    const u = boss.ult;
    u.stage = -1;
    u.cd = THREE.MathUtils.lerp(ULT_COOLDOWN_MIN, ULT_COOLDOWN_MAX, Math.random());
    boss.pos.y = 0;
    boss.jump.close = 0; // 足もとに張り付かれていた時間は数え直す
}
function updateUlt(dt, want) {
    const u = boss.ult;
    const rig = boss.rig;
    let hip = 0;
    let lean = 0;
    if (u.stage < 0) {
        u.cd -= dt;
    }
    else {
        u.t += dt;
        // プレイヤーへ向き直る（熱を逃がしている間は向き直らない）
        if (u.stage < 2)
            turnToward(want, ULT_TURN, dt);
        if (u.stage === 0) {
            // 溜める: 腰を落として小刻みに震え、足もとの床が震える
            const e = Math.min(u.t / ULT_CHARGE, 1);
            hip = -0.5 * e + 0.04 * Math.sin(u.t * 70) * e;
            lean = 0.15 * e;
            if (Math.floor((u.t - dt) / 0.3) !== Math.floor(u.t / 0.3))
                spawnQuake(boss.pos.x, boss.pos.z, 0.15 + 0.25 * e, 5, 8);
            hooks.addTrauma(dt * 0.6 * e);
            if (u.t >= ULT_CHARGE) {
                u.stage = 1;
                u.t = 0;
                u.next = 0;
                sfx.playBossThrust();
            }
        }
        else if (u.stage === 1) {
            // 跳ぶ: 腰を落とす → 背中の噴射で跳び上がる → 両足で床を打って衝撃波（これを繰り返す）
            const c = u.t - u.hop * ULT_HOP_EVERY;
            if (c < ULT_HOP_CROUCH) {
                const e = c / ULT_HOP_CROUCH;
                hip = -0.6 * e;
                lean = 0.15 * e;
                boss.pos.y = 0;
            }
            else if (c < ULT_HOP_CROUCH + ULT_HOP_AIR) {
                const v = (c - ULT_HOP_CROUCH) / ULT_HOP_AIR;
                boss.pos.y = ULT_HOP_HEIGHT * 4 * v * (1 - v);
                hip = 0.1;
                lean = 0.2;
                if (c - dt < ULT_HOP_CROUCH) {
                    sfx.playBossImpact(0.7);
                    for (const f of boss.feet)
                        spawnSparks(f.pos, UP, 8, 0.8, 1);
                }
                // 空中では脚をぶら下げる
                rig.legs.forEach((leg, i) => {
                    const f = boss.feet[i];
                    const { B } = legRest(leg.side);
                    toWorld(B.x, B.z - 0.15, f.pos).y = boss.pos.y + B.y - 0.5 * (1 - Math.abs(1 - 2 * v));
                    f.yaw = boss.yaw;
                    f.t = -1;
                });
            }
            else {
                if (boss.pos.y > 0) {
                    // 着いた: 床を打って、足を着いた所へ戻す
                    boss.pos.y = 0;
                    groundSlam(jumpAt.copy(boss.pos), boss.ultWide ? ULT_WIDE_SLAM : ULT_SLAM);
                    boss.ultHip = -0.9;
                    rig.legs.forEach((leg, i) => {
                        const { B } = legRest(leg.side);
                        toWorld(B.x, B.z, boss.feet[i].pos).y = B.y;
                        boss.feet[i].yaw = boss.yaw;
                    });
                }
                const e = Math.min((c - ULT_HOP_CROUCH - ULT_HOP_AIR) / 0.3, 1);
                hip = -0.6 * (1 - e);
                lean = 0.2 * (1 - e);
                if (c >= ULT_HOP_EVERY)
                    u.hop++;
            }
            // 撃つ: 両腕を交互に、プレイヤーを狙う（撃つ時間と止める時間を繰り返す）。故障した腕は 2 回に 1 回しか撃たず、弾が散らばる
            const broken = [0, 1].map((i) => boss.limbs[armOf(i)].broken);
            const cycle = ULT_BURST_ON + ULT_BURST_OFF;
            while (u.t >= u.next) {
                const arm = u.n % 2;
                const barrel = Math.floor(u.n / 2) % 2;
                if (u.next % cycle < ULT_BURST_ON && !(broken[arm] && Math.floor(u.n / 2) % 2 === 1) && targetPlayer.alive) {
                    const spread = GUN_SPREAD * ULT_SPREAD * (broken[arm] ? ARM_BROKEN_SPREAD : 1);
                    fireGun(arm, barrel, boss.aim, spread, u.n % ULT_SOUND_EVERY === 0);
                }
                u.n++;
                u.next += ULT_INTERVAL / boss.ultRate;
            }
            // 撃ち終える時刻を過ぎたら、着いてから熱を逃がす
            if (u.t >= ULT_TIME && boss.pos.y <= 0) {
                u.stage = 2;
                u.t = 0;
                sfx.playBossImpact(0.6);
                const snd = soundAt();
                sfx.playBossHiss(ULT_COOL * 0.8, 1.3 * snd.volume, snd.pan); // 熱を逃がす
            }
        }
        else {
            // 熱を逃がす: 深く沈んで前へうなだれ、火花を散らす（その間は動けない）
            const e = Math.min(u.t / ULT_COOL, 1);
            hip = -0.7 * (1 - e * e);
            lean = 0.35 * (1 - e * e);
            if (Math.random() < dt * 12)
                spawnSparks(rig.torso.getWorldPosition(jumpAt), UP, 3, 0.6, 0.8);
            if (u.t >= ULT_COOL)
                endUlt();
        }
    }
    boss.ultHip += (hip - boss.ultHip) * Math.min(1, dt * 14);
    boss.ultLean += (lean - boss.ultLean) * Math.min(1, dt * 10);
    // 跳ぶたびに背中の噴射を吹かす
    if (u.stage === 1 && boss.pos.y > 0)
        boss.backJet = Math.max(boss.backJet, 0.7);
}
// ---- ミサイルの一斉射 ----
const portAt = new THREE.Vector3();
const portDir = new THREE.Vector3();
function updateMissileVolley(dt, dist) {
    const ms = boss.missile;
    if (boss.phase !== 'walk' || boss.stomp.leg >= 0 || boss.jump.stage >= 0 || boss.dash.stage >= 0 || boss.ult.stage >= 0 || standAttack() || !targetPlayer.alive) {
        if (ms.t >= 0)
            ms.cd = Math.max(ms.cd, 2);
        ms.t = -1;
    }
    else if (ms.t < 0) {
        ms.cd -= dt * boss.rate;
        if (ms.cd <= 0 && boss.gun.t < 0 && dist > MISSILE_RANGE_MIN) {
            ms.t = 0;
            ms.left = boss.missileCount;
            ms.next = MISSILE_WINDUP;
            ms.n = 0;
            sfx.playSniperAim(1.6);
            const snd = soundAt();
            sfx.playBossHatch(snd.volume, snd.pan);
        }
    }
    else {
        ms.t += dt;
        while (ms.left > 0 && ms.t >= ms.next) {
            // 左右の発射口から交互に、上へ少し後ろと外へ散らして打ち上げる
            const side = ms.n % 2 === 0 ? -1 : 1;
            const torso = boss.rig.torso;
            torso.localToWorld(portAt.set(side * MISSILE_PORT_X, MISSILE_PORT_Y, MISSILE_PORT_Z));
            portDir.set(side * (0.25 + 0.3 * Math.random()), 1, -0.3 + 0.3 * Math.random()).transformDirection(torso.matrixWorld);
            launchMissile(portAt, portDir);
            const snd = soundAt(portAt);
            sfx.playMissileLaunch(snd.volume, snd.pan);
            ms.n++;
            ms.left--;
            ms.next += MISSILE_INTERVAL;
        }
        if (ms.left <= 0 && ms.t >= ms.next) {
            ms.t = -1;
            ms.cd = THREE.MathUtils.lerp(MISSILE_COOLDOWN_MIN, MISSILE_COOLDOWN_MAX, Math.random());
        }
    }
    // 発射口の光: 構えている間は点滅し、撃っている間は灯ったまま
    const on = ms.t < 0 ? 0 : ms.t < MISSILE_WINDUP ? (Math.sin(ms.t * 30) > 0 ? 1 : 0.3) : 1;
    for (const m of portGlows) {
        m.visible = on > 0;
        m.scale.setScalar(0.18 * on);
    }
}
// 打ち返したミサイルの向かう先: from にいちばん近い、ダメージの通る部位の目印。なければ false
export function bossOpenPoint(from, out) {
    const rig = boss.rig;
    if (!rig || boss.phase === 'dead')
        return false;
    ensureMarkers(rig);
    let best = Infinity;
    for (const m of markers) {
        if (!bossPartOpen(partOf(m.obj)))
            continue;
        m.obj.localToWorld(mark.copy(m.offset));
        const d = mark.distanceToSquared(from);
        if (d < best) {
            best = d;
            out.copy(mark);
        }
    }
    return best < Infinity;
}
// パリィで弾き返した弾の向かう先: 撃った砲（故障していれば、もう一方の故障していない砲）。どちらもなければ false
export function bossReturnPoint(part, out) {
    const rig = boss.rig;
    if (!rig || boss.phase !== 'walk')
        return false;
    const order = part === 'armR' ? [0, 1] : [1, 0];
    for (const i of order) {
        if (boss.limbs[armOf(i)].broken)
            continue;
        rig.guns[i].localToWorld(out.set(0, 0, 1.0));
        return true;
    }
    return false;
}
function setPhase(p) {
    boss.phase = p;
    boss.phaseT = 0;
}
export function damageBoss(part, amount) {
    const result = damageResult(part, amount);
    if (result !== 'idle' && result !== 'locked')
        boss.flash[part] = 0; // 削れたときだけ、当たった部位を光らせる
    if (result === 'limb' || result === 'break')
        boss.side.pressure += 1; // 続けて削られたら横へ逃げる
    if (result === 'break' || result === 'down')
        shedArmor(part);
    const snd = soundAt();
    if (result === 'break' || result === 'down')
        sfx.playBossBreak(1, snd.pan);
    if (result === 'down')
        sfx.playBossPowerDown(1, snd.pan);
    if (result === 'kill') {
        sfx.playBossCollapse(COLLAPSE_SOUND_DELAY, 1, snd.pan);
        clearMissiles();
    }
    return result;
}
function damageResult(part, amount) {
    if (boss.phase === 'dead')
        return 'idle';
    // しゃがみ込んでいる間は、本体（腰から上）に当てたときだけ通す（腕・脚は 4 つとも故障している）
    if (boss.phase === 'down') {
        if (part !== 'core')
            return 'idle';
        boss.coreHp -= amount;
        if (boss.coreHp > 0) {
            // 本体の体力が半分を切ったら、攻撃の頻度を上げる（イージーは上げない）
            if (!boss.enraged && boss.coreHp <= boss.coreMax / 2 && boss.rage > 1) {
                boss.enraged = true;
                boss.rate *= boss.rage;
            }
            return 'core';
        }
        boss.coreHp = 0;
        setPhase('dead');
        return 'kill';
    }
    if (part === 'core')
        return 'locked';
    const limb = boss.limbs[part];
    if (limb.broken)
        return 'idle';
    limb.hp -= amount;
    if (limb.hp > 0)
        return 'limb';
    limb.hp = 0;
    limb.broken = true;
    if (BOSS_LIMBS.every((k) => boss.limbs[k].broken)) {
        setPhase('down');
        boss.speed = 0;
        return 'down';
    }
    return 'break';
}
// ---- 当たりを調べる ----
const ray = new THREE.Raycaster();
const partOf = (o) => {
    for (; o; o = o.parent)
        if (o.userData.part)
            return o.userData.part;
    return 'core';
};
// 光線が機体のどこかに当たれば、その距離・当たった所・部位を返す（far より遠ければ null）
export function raycastBoss(origin, dir, far) {
    const rig = boss.rig;
    if (!rig || !rig.root.visible)
        return null;
    ray.set(origin, dir);
    ray.far = far;
    const hit = ray.intersectObject(rig.root, true)[0];
    return hit ? { dist: hit.distance, point: hit.point, part: partOf(hit.object), object: hit.object } : null;
}
// 近接の攻撃: 故障した腕・脚は数えない。視線の先 reach + 少しまでに機体があればそこへ当てる。なければ、届く範囲（足もとからの水平の距離が reach 以内、
// 視線から angle 以内）にある部位の目印のうち、いちばん近いものへ当てる。当てる所と部位を返す（届かなければ null）
const MELEE_RAY_EXTRA = 1.2; // 視線の先を調べる距離を、届く距離より延ばす分（機体は大きいので、表面までの距離で測る）
const MELEE_POINT_RADIUS = 0.6; // 目印から表面までのおおよその距離
const MELEE_HEIGHT = 2.6; // 足もとからこの高さまでの目印に届く
const markers = [];
let markersOf = null;
// 部位の目印: すね・かかとの骨・足・太ももの前、砲の先、胴体の窓（骨の座標でのずれ）。近接の当たりと、一閃のロックオンの的に使う
function ensureMarkers(rig) {
    if (markersOf === rig)
        return;
    markersOf = rig;
    markers.length = 0;
    for (const leg of rig.legs) {
        markers.push({ obj: leg.shin, offset: new THREE.Vector3(0, -0.6, -0.4) }, { obj: leg.meta, offset: new THREE.Vector3(0, -0.3, 0.45) });
        markers.push({ obj: leg.foot, offset: new THREE.Vector3(0, 0, 0.3) }, { obj: leg.thigh, offset: new THREE.Vector3(0, -0.6, 0.4) });
    }
    for (const gun of rig.guns)
        markers.push({ obj: gun, offset: new THREE.Vector3(0, 0, 1.0) });
    markers.push({ obj: rig.torso, offset: new THREE.Vector3(0, 1.4, 0.8) });
}
// 目印の数（機体が出ていなければ 0）・i 番目の今の位置・その部位
export function bossTargetCount() {
    const rig = boss.rig;
    if (!rig || !rig.root.visible || boss.phase === 'dead' || bossAirborne())
        return 0; // 跳んでいる間は一閃で狙えない
    ensureMarkers(rig);
    return markers.length;
}
export const bossTargetAt = (i, out) => markers[i].obj.localToWorld(out.copy(markers[i].offset));
export const bossTargetPart = (i) => partOf(markers[i].obj);
// その部位に当てればダメージが通るか（しゃがみ込んでいる間は本体だけ、そうでなければ故障していない腕・脚だけ）
export function bossPartOpen(part) {
    if (!boss.rig || boss.phase === 'dead')
        return false;
    if (boss.phase === 'down')
        return part === 'core';
    return part !== 'core' && !boss.limbs[part].broken;
}
export const bossAlive = () => !!boss.rig && boss.phase !== 'dead';
const mark = new THREE.Vector3();
const toMark = new THREE.Vector3();
const flatLook = new THREE.Vector3();
export function bossMeleeTarget(reach, angle, eye, look) {
    const rig = boss.rig;
    if (!rig || !rig.root.visible || boss.phase === 'dead')
        return null;
    // 故障した腕・脚には当てない（視線の先にあっても、ほかの部位の目印を探す）
    const hittable = (p) => p === 'core' || !boss.limbs[p].broken;
    const onRay = raycastBoss(eye, look, reach + MELEE_RAY_EXTRA);
    if (onRay && hittable(onRay.part))
        return { point: onRay.point.clone(), part: onRay.part };
    ensureMarkers(rig);
    flatLook.set(look.x, 0, look.z).normalize();
    let best = null;
    let bestD = Infinity;
    for (const m of markers) {
        if (!hittable(partOf(m.obj)))
            continue;
        m.obj.localToWorld(mark.copy(m.offset));
        if (mark.y - position.y > MELEE_HEIGHT || mark.y < position.y - 1)
            continue;
        toMark.set(mark.x - position.x, 0, mark.z - position.z);
        const d = toMark.length() - MELEE_POINT_RADIUS;
        if (d > reach || d >= bestD)
            continue;
        if (d > 0.3 && flatLook.lengthSq() > 0 && flatLook.angleTo(toMark.normalize()) > angle)
            continue;
        bestD = d;
        best = { point: mark.clone(), part: partOf(m.obj) };
    }
    return best;
}
// 故障した部位から、間を空けて火花を散らす（その部位の目印のどれかから、上向きに）
const sparkAt = new THREE.Vector3();
const sparkDir = new THREE.Vector3();
// 部位が壊れた: その部位のあちこちから装甲の破片を飛び散らせる（床に残る）
const armorAt = new THREE.Vector3();
const armorDir = new THREE.Vector3();
function shedArmor(part) {
    const rig = boss.rig;
    if (!rig)
        return;
    ensureMarkers(rig);
    const own = markers.filter((mk) => partOf(mk.obj) === part);
    if (own.length === 0)
        return;
    for (let k = 0; k < ARMOR_CHUNKS; k += 2) {
        const mk = own[Math.floor(Math.random() * own.length)];
        mk.obj.localToWorld(armorAt.copy(mk.offset));
        armorDir.set(armorAt.x - boss.pos.x, 0, armorAt.z - boss.pos.z).normalize();
        spawnChunks(armorAt, { count: 2, size: [0.18, 0.55], speed: [3, 8], up: 4, dir: armorDir, spread: 0.3, light: [0.25, 0.45] });
        spawnSparks(armorAt, UP, 6, 0.8, 1);
    }
}
export function showRemoteBossBreak(part, down) {
    boss.rig?.root.updateMatrixWorld(true);
    shedArmor(part);
    const snd = soundAt();
    sfx.playBossBreak(1, snd.pan);
    if (down)
        sfx.playBossPowerDown(1, snd.pan);
}
export function updateRemoteBossDebris(dt) {
    updateChunks(dt);
    updateFloorMarks(dt);
}
function brokenSparks(rig, part, dt) {
    if ((boss.sparkT[part] -= dt) > 0)
        return;
    boss.sparkT[part] = THREE.MathUtils.lerp(BROKEN_SPARK_GAP[0], BROKEN_SPARK_GAP[1], Math.random());
    ensureMarkers(rig);
    let pick = -1;
    let n = 0;
    for (let i = 0; i < markers.length; i++)
        if (partOf(markers[i].obj) === part && Math.random() * ++n < 1)
            pick = i;
    if (pick < 0)
        return;
    markers[pick].obj.localToWorld(sparkAt.copy(markers[pick].offset));
    sparkDir.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
    spawnSparks(sparkAt, sparkDir, BROKEN_SPARK_COUNT, 0.7, 0.8);
}
// 今の状態を骨に当てる。hipY は腰から上を上下させる量
// 値 s.x を goal へばねで寄せる（freq = 固有の速さ (rad/s)、damp = 減衰比）。dt が 0 ならすぐ合わせる
function spring(s, goal, freq, damp, dt) {
    if (dt <= 0) {
        s.x = goal;
        s.v = 0;
        return goal;
    }
    const n = Math.ceil(dt * 120); // 刻みを細かくして、重い場面で揺れ出さないようにする
    const h = dt / n;
    for (let k = 0; k < n; k++) {
        s.v += (freq * freq * (goal - s.x) - 2 * damp * freq * s.v) * h;
        s.x += s.v * h;
    }
    return s.x;
}
// dt を渡すと、腰の高さと胴体の倒し方をばねで追わせる（0 なら行き先にそのまま合わせる）
function poseRig(hipGoal = 0, dt = 0) {
    const rig = boss.rig;
    rig.root.position.copy(boss.pos);
    rig.root.rotation.y = boss.yaw;
    const hipY = spring(boss.poseHip, hipGoal, POSE_HIP_FREQ, POSE_HIP_DAMP, dt);
    rig.body.position.y = hipY;
    const leanGoal = TORSO_LEAN + 0.04 * boss.speed + boss.lean + boss.stompLean + boss.dashLean + boss.jumpLean + boss.ultLean + boss.standLean; // 速く歩くほど前へ傾ける
    const lean = spring(boss.poseLean, leanGoal, POSE_LEAN_FREQ, POSE_LEAN_DAMP, dt);
    rig.torso.rotation.set(lean, boss.twist + boss.swipeTwist, boss.roll);
    rig.guns.forEach((gun, i) => {
        gun.rotation.x = -lean - boss.aimPitch + boss.droop[i] - boss.recoil[i];
        gun.rotation.y = boss.gunYaw[i];
    });
    rig.legs.forEach((leg, i) => {
        const f = boss.feet[i];
        poseMechLeg(leg, hipY, toLocal(f.pos, local), wrap(f.yaw - boss.yaw));
    });
}
function warningEntries() {
    return [
        { object: stompRing, materials: [ringMat, ringFillMat] },
        { object: dashPath, materials: [pathEdgeMat, pathFillMat] },
        { object: jumpRing.group, materials: [jumpRing.edgeMat, jumpRing.fillMat] },
        { object: quakeWarn.group, materials: [] },
        ...quakeWarn.rings.map((object, i) => ({ object, materials: [quakeWarn.mats[i]] })),
        { object: swipeFan.group, materials: [swipeFan.edgeMat, swipeFan.fillMat] },
        { object: laserAim, materials: [laserAimMat] }, { object: laserBeam, materials: [] },
        ...riftPaths.map((p) => ({ object: p.group, materials: [p.edgeMat, p.fillMat] })),
    ];
}
export function captureBossWarnings() {
    return {
        objects: warningEntries().map(({ object: o, materials }) => [Number(o.visible), o.position.x, o.position.y, o.position.z,
            o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z, ...materials.map((m) => m.opacity)]),
        rifts: rifts.map((r) => [r.x, r.z, r.dx, r.dz, r.run]),
    };
}
export function isBossWarnings(value) {
    if (!value || typeof value !== 'object')
        return false;
    const w = value, entries = warningEntries();
    const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10000;
    return Array.isArray(w.objects) && w.objects.length === entries.length
        && w.objects.every((o, i) => Array.isArray(o) && o.length === 11 + entries[i].materials.length && o.every(finite) && (o[0] === 0 || o[0] === 1))
        && Array.isArray(w.rifts) && w.rifts.length <= 5 && w.rifts.every((r) => Array.isArray(r) && r.length === 5 && r.every(finite) && r[4] >= 0 && r[4] <= 200);
}
const remoteRiftProgress = new Map();
export function applyBossWarnings(w) {
    warningEntries().forEach(({ object: o, materials }, i) => {
        const v = w.objects[i];
        o.visible = v[0] === 1;
        o.position.set(v[1], v[2], v[3]);
        o.quaternion.set(v[4], v[5], v[6], v[7]).normalize();
        o.scale.set(v[8], v[9], v[10]);
        materials.forEach((m, j) => { m.opacity = THREE.MathUtils.clamp(v[11 + j], 0, 1); });
    });
    const active = new Set();
    for (const [x, z, dx, dz, run] of w.rifts) {
        const key = `${x.toFixed(2)},${z.toFixed(2)},${dx.toFixed(2)},${dz.toFixed(2)}`;
        active.add(key);
        const start = remoteRiftProgress.get(key) ?? 0;
        for (let d = start; d <= run; d += 1)
            spawnSpike(x + dx * d, z + dz * d, RIFT_SPIKE, RIFT_SPIKE_LIFE);
        remoteRiftProgress.set(key, Math.max(start, Math.floor(run) + 1));
    }
    for (const key of remoteRiftProgress.keys())
        if (!active.has(key))
            remoteRiftProgress.delete(key);
}

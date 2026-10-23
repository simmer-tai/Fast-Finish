# fast-finish

## コードの構成

three.js の一人称アクション。`src/` の TypeScript を `npm run build`（tsc）で `dist/` に書き出す。`dist/` は GitHub Pages で配るのでコミットする。`src` を変えたらビルドして、`dist` も一緒にコミットする。

### フォルダーの役割

- `main.ts`: 全体をつなぐ部分。当たりの処理（ダメージ・スコア・倒したときの演出）、敵の更新と出現、ステージの流れ、毎フレームのループ。
- `weapons/`: 武器ごとのモデル（`kunai.ts`, `sword.ts` …）、攻撃の定義（`*Attacks.ts`）、攻撃の処理（`*Combat.ts`）、手元の武器の動き（`viewModelMotion.ts`）。
- `enemy/`: 敵の体・状態・動き・よろめき・破片・射撃。
- `player/`: 動きの設定・状態・移動・視点・パッドの割り当て・エイムアシスト・倒れたとき。
- `fx/`: カメラ演出・当たりの光・切り跡・斬撃の帯・ポストエフェクト。
- `ui/`: HUD・オプション・武器選択・操作一覧・タイトルと一時停止の画面。
- `world/`: アリーナ・箱と坂・せり上がり・床のグリッドの広がり・レイの当たり判定。
- `combat/`: パリィ。
- `game/`: 武器や演出をまたいで共有する値（`state.ts`）と、本体へのフック（`hooks.ts`）。
- 直下: 描画の土台（`core.ts`）、入力、音（`audio.ts`）、ステージの組み立て（`station.ts` など）、記録とスコア。

### 決まり

- ほかのファイルから書き換える値は、`let` で export しない（import した側からは代入できない）。オブジェクトにまとめてそのプロパティを書き換える: 共有の値は `game`、プレイヤーは `player`、武器ごとは `swordState` などの `*State`。
- 分けたファイルから `main.ts` は import しない（循環する）。当たりの処理など本体にある処理は、`game/hooks.ts` の `hooks` を通して呼ぶ。本体が起動時に `initGameHooks` で中身を入れる。敵は `enemy/env.ts`（`initEnemyEnv`）、移動は `initMovement`、当たりの光は `initHitFx` が同じ役目。
- 互いに import し合うファイルでは、読み込みの最初（関数の外）で相手の値を使わない。

### 動きを確かめる URL

`index.html` に付けると、その場面から始まる。`&near` で敵の目の前に立ち、`&t=0.2` でその時刻で止める。

- `?attack=slash1`（クナイ: slash1 / slash2 / finisher / slideUp / dashSlash）
- `?sword=kesa`（剣: kesa / gyaku / karatake / sweep / charge / issen / thrust）
- `?axe=kesa`（斧: draw / kesa / nagi / kabuto / sweep / air / launch / rush / drive）
- `?striker=windup&yaw=70`（ストライカーの姿勢: ready / windup / slash。yaw は正面から回り込んで見る角度）
- `?grapple`（鎖鎌の引き寄せ）、`?sickleDraw&t=0.2`（鎖鎌の取り出し）、`?focus`（剣の構え）、`?stage=station`（station / warehouse / parking）

## 武器のプレビュー動画

武器選択画面は `previews/<武器ID>.mp4` を音なしでループ再生する（`src/ui/weaponPicker.ts` の `showPickerVideo`）。武器ID は `index.html` の `data-weapon`（kunai / handgun / sword / sickle / axe）。

ユーザーが編集済みの録画（ダウンロードフォルダに置かれることが多い）をプレビューにしたいと言ったら、以下の手順で作る。

### ffmpeg

PATH には無い。pip の `imageio-ffmpeg` に同梱のものを使う。

```
python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
```

無ければ `python -m pip install imageio-ffmpeg`。

### 1. ショットの継ぎ目を探す

#### 区切りの単色フレームがある場合（優先）

ユーザーには、ショットの間にグリーン（#00FF00）かマゼンタ（#FF00FF）の単色クリップ（1〜2 フレーム程度）を挟んでもらうことにしている。ゲーム画面はグレー・白・黒と赤（敵と破片）だけなので、この2色は出てこない。赤は区切りに使わない。

- `signalstats` で各フレームの平均（YAVG / UAVG / VAVG）と最小・最大（YMIN / YMAX）を出す。
- 区切りの判定:
  - 全体の色が上の値に近く、YMAX − YMIN が小さいフレームが区切り。
  - 目安（BT.709 limited）: グリーンは Y≈173, U≈42, V≈26、マゼンタは Y≈79, U≈214, V≈230。
- 連続する区切りフレームはまとめて 1 つの継ぎ目とする。
- 区切りフレームはショットに含めない。その直前で前のショットを終え、直後から次のショットを始める。完成した動画には残さない。
- 見つかった継ぎ目は念のため前後のフレームを並べて確かめる。

#### 区切りが無い場合

- `scdet=threshold=6` で候補を出し、前後のフレームを並べて目で確かめる。撃破フラッシュや画面の白黒反転などのゲーム内演出でも数値が跳ねるので、数値だけで決めない。
- 本物の継ぎ目は、景色が飛ぶ、または画面下中央の残り敵数が飛ぶ（例: 5 → 3）。
- 敵数の飛びがあるのに scdet が反応しない継ぎ目もある。その場合は、その前後を `threshold=2` で細かく見る。
- 継ぎ目はフレーム番号で控える（60fps）。総フレーム数も数えておく。

### 2. 斬線トランジションで書き出す

- 各ショットを `trim=start_frame/end_frame` で切り出し、`xfade=transition=custom` でつなぐ。
- 長さは 12 フレーム（0.2 秒）。白い斬線が「／」の向きに左から右へ走り、線の左側が次のショットになる。
- ループの継ぎ目にも同じ斬線を入れる。
  - 先頭の 12 フレームを最後のショットの後ろに xfade でつなぐ。
  - 本編は 12 フレーム目から始める。

xfade の式（`st()`/`ld()` は使わない。並列で計算されるときに値が混ざって、画面がノイズになる）:

```
dd    = ((X+0.6*Y)/(W+0.6*H)-(1-P)*1.04+0.02)
expr  = if(lt(dd,-0.004),B,if(lt(dd,0.004),if(eq(PLANE,0),255,128),A))
```

PowerShell での組み立て（`$segs` はショットごとの [開始, 終了) フレーム。先頭のショットだけ 12 から始め、最後に [0, 12) を足す）:

```powershell
$D = 12
$segs = @(@(12,382),@(382,1062), ... ,@(1910,2250),@(0,12))
$dd = "((X+0.6*Y)/(W+0.6*H)-(1-P)*1.04+0.02)"
$slash = "if(lt($dd,-0.004),B,if(lt($dd,0.004),if(eq(PLANE,0),255,128),A))"
$f = @(); $i = 0; foreach ($s in $segs) { $f += "[0:v]trim=start_frame=$($s[0]):end_frame=$($s[1]),setpts=PTS-STARTPTS,fps=60[s$i]"; $i++ }
$len = $segs[0][1] - $segs[0][0]; $prev = "s0"
for ($k = 1; $k -lt $segs.Count; $k++) { $off = ($len - $D) / 60; $f += "[$prev][s$k]xfade=transition=custom:duration=$($D/60):offset=$($off.ToString([cultureinfo]::InvariantCulture)):expr='$slash'[x$k]"; $len = $len + ($segs[$k][1]-$segs[$k][0]) - $D; $prev = "x$k" }
& $ff -i $in -filter_complex ($f -join ';') -map "[$prev]" -an -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -movflags +faststart -y previews/<武器ID>.mp4
```

### 3. 確かめる

各トランジションの開始フレームから 0, 3, 6, 9 フレーム目を抜き出してタイル状に並べ、白い斬線が出ていることを目で確かめる。

import * as THREE from 'three';
import { addGlow, removeGlow, type GlowSource } from '../fx/glow.js';
import { RISER_C, limbPath, loftClosed, section } from './bow.js';
import { createFalconMats } from './skinFalconRifle.js';
import { MM, plate, type Outline } from './skinTalon.js';
import { skinFx, type SkinDecor } from './skins.js';

// ---- 弓のスキン: 隼 ----
// ライフル・リボルバーの隼と同じ白い陶器・黒い鋼・金の弓。柄とリムを作り直し、上下のリムを隼の翼に見立てる。
//   リム: 上塗りした黒い鋼の翼。元のリムの中心線をなめらかになぞり、先へ細って、弦を掛ける所を越えて尖る。
//         両面に白い陶器の長い羽根を 1 枚と、付け根から扇に開く金の羽根 3 枚（後ろ＝射手の側へ開くほど長く、翼の後ろの縁から突き出す）。
//         金の羽根はどれもライフルの隼の金の羽根と同じ形（前の縁はまっすぐ、後ろへ一定の幅を張り、先は斜めに絞って尖らせる）
//   肩: 柄の上下の端（リムの差し込み口）を覆う黒い鋼の塊。前へ尖る
//   柄: 白い陶器。ロングボウと同じ 8 角の断面の一本の棒で、握りから上下の端（肩の中）へなだらかに細る。棚のあたりは右へ寄せて、左に矢の通り道を空ける
//   核: 柄の上下（棚の上と握りの下）に 1 つずつ。暗い丸枠に金の輪、芯は金色に光る（当てた瞬間に強まる）。
//       核を付け根に、両面から 1 対の金の羽根の扇（3 枚ずつ）を生やす。リムの金の羽根の付け根へ向けて伸ばし、その付け根を覆う。
//       いちばん内側（面に近い）の羽根は面に寝かせ、外の羽根ほど先を反らす
//   握り: ロングボウと同じく棒を一回り太らせた艶消しの黒の巻きと、上下の端を締める金の紐
//   弦: 金。矢: 黒い軸に金色に光る鏃、白い矢羽、金の筈
// 色の部位（skins.ts の looks）は元のまま残る筈と棚を金にする
// 輪郭は弓のモデルの座標を mm で書く（x は的の側が +、y は上が +、原点は握る位置）。上の部品を柄の中心の高さで上下に映して下にする

const LIMB_T = 22; // リムの横幅
const LIMB_TIP = 18; // 弦を掛ける所から先へ尖らせる長さ
const limbFront = (u: number) => THREE.MathUtils.lerp(9, 3.5, u); // 中心線から前の縁まで
const limbBack = (u: number) => THREE.MathUtils.lerp(8, 3, u); // 中心線から後ろの縁まで
// 金の羽根: 付け根から、リムの向き（中心線の FEATHER_AIM 番目の点へ）を基準に後ろへ開く。[開く角度 (度), 長さ, 面から浮かせる量]
// 外の羽根ほど面から浮かせて、下の羽根の稜線の上に重ねる
const FEATHER_ROOT: [number, number] = [14, 428];
const FEATHER_AIM = 7;
const FEATHERS: [number, number, number][] = [[2, 290, 0.5], [14, 335, 3.5], [26, 385, 6.5]];
const FEATHER_W = 0.13; // リムの羽根の幅（長さに対する割合）。外側の羽根なので、ライフルの隼の金の羽根より広げる
const RIDGE_ROOT = 7; // 羽根の稜線の付け根の高さ (mm)
// 肩: 柄の端とリムの付け根を覆い、前上へ尖る
const SHOULDER: Outline = [[-2, 404], [10, 386], [48, 392], [64, 416], [36, 428], [14, 440]];
const SHOULDER_T = 0.028;
// 柄: ロングボウ（skinLongbow.ts）と同じ作り。8 角の断面の一本の棒で、握りから上下の端（肩の中）へなだらかに細る。
// 中心線は上下の端（リムの付け根）と握りを通る放物線。棚のあたりは右（+Z）へ寄せて、左の面を矢の通る z = 0 にそろえる
const STAVE_END = RISER_C + 0.36; // 上の端（肩の中。下の端は柄の中心の高さで映す）
const STAVE_HALF = STAVE_END - RISER_C;
const END_X = 0.026; // 上下の端の前後の中心（リムの付け根）
const BELLY_X = 0.002; // 握りの所の前後の中心
const STAVE_N = 24;
const staveX = (y: number) => {
  const u = (y - RISER_C) / STAVE_HALF;
  return END_X + (BELLY_X - END_X) * (1 - u * u);
};
const staveU = (y: number) => Math.min(1, Math.abs(y - RISER_C) / STAVE_HALF);
const staveDepth = (y: number) => THREE.MathUtils.lerp(0.03, 0.022, staveU(y)); // 前後の厚み
const staveWidth = (y: number) => THREE.MathUtils.lerp(0.018, 0.015, staveU(y)); // 横幅
const ARROW_Y = 0.07;
const staveShift = (y: number) => 0.009 * Math.max(0, 1 - Math.abs(y - ARROW_Y) / 0.12);
// 握り: 艶消しの黒の巻き（棒を一回り太らせて覆う）と、上下の端を締める金の紐
const GRIP = { from: -0.07, to: 0.045 };
// 核: 柄の上下に 1 つずつ（高さ、m）。前後は柄の中心線に載せ、横幅は柄に合わせて左右を貫く
const CORE_YS = [0.25, -0.15];
// 核から生やす羽根: 核からリムの金の羽根の付け根（FEATHER_ROOT）への向きを基準に、後ろへ開く（下の核は上下に映して同じ形）。
// [開く角度 (度), 長さ, 面から浮かせる量, 先の反り上がり]（mm）。付け根までは約 178 mm なので、その先まで伸ばして覆う。
// 反り上がりは、リムの付け根の辺りでリムの羽根（いちばん外の稜線の頂き 約 25 mm）の上に乗る大きさ
const CORE_FEATHERS: [number, number, number, number][] = [[12, 245, 0.5, 24], [22, 270, 3, 28], [32, 295, 5.5, 32]];
const CORE_FEATHER_W = 0.1; // 核の羽根の幅（長さに対する割合）
const CORE_TOP = 5.5 + RIDGE_ROOT + 1.5; // 核を面から突き出す高さ（いちばん外の羽根の稜線より少し上、mm）
const GLOW_K = 0.5; // にじみの濃さ（弓は大きく目の前にあるので弱め）

const flipY = ([x, y]: [number, number]): [number, number] => [x, 2 * RISER_C / MM - y];

// 中心線の点の並びから、前へ front(i)・後ろへ back(i) mm ずらした線で囲んだ輪郭（折れ目は両側の線の交わる所）
function band(pts: THREE.Vector2[], front: (i: number) => number, back: (i: number) => number, tip?: THREE.Vector2): Outline {
  const normal = (a: THREE.Vector2, b: THREE.Vector2) => {
    const t = b.clone().sub(a).normalize();
    return new THREE.Vector2(t.y, -t.x); // 進む向きに直交して前（+X の側）
  };
  const line = (k: (i: number) => number) => pts.map((p, i): [number, number] => {
    const n0 = normal(pts[Math.max(i - 1, 0)], pts[Math.max(i, 1)]);
    const n1 = normal(pts[Math.min(i, pts.length - 2)], pts[Math.min(i + 1, pts.length - 1)]);
    const n = n0.clone().add(n1).normalize();
    const q = p.clone().addScaledVector(n, k(i) / n.dot(n0));
    return [q.x, q.y];
  });
  const f = line(front);
  const b = line((i) => -back(i));
  return [...f, ...(tip ? [[tip.x, tip.y] as [number, number]] : []), ...b.reverse()];
}

// 羽根の立体: 付け根から dir の向きへ長さ len、幅は長さの wk 倍。先は 1 点に尖らせる。
// 断面は内側（リムの面の側）が平らで、羽軸の稜線から外の縁へふくらみながら薄くなる（外の縁にも厚みを残す）。先へ行くほど稜線は低く、羽根はリムの面から反り上がる。
// face: リムのどちらの面か（+1 で +Z）、sign: 上のリムか下のリムか（-1 で柄の中心の高さで上下に映す）、z0: 内側の面の高さ (mm)、curl: 先の反り上がり (mm)、vane: 羽根の面を羽軸のどちらへ広げるか（+1 で前、-1 で後ろ）
const lerpKeys = (keys: [number, number][], t: number) => {
  const i = Math.max(1, keys.findIndex(([k]) => k >= t));
  const [k0, v0] = keys[i - 1], [k1, v1] = keys[i];
  return v0 + ((v1 - v0) * (t - k0)) / (k1 - k0);
};
// ライフルの隼の金の羽根と同じ形: 羽軸の側の縁はまっすぐ。外の縁は付け根から 3 分の 1 で幅いっぱいに張り、
// 8 割まで同じ幅を保って、先へ斜めに絞って尖らせる
const FEATHER_BACK: [number, number][] = [[0, 0], [0.32, 1], [0.8, 1], [1, 0]]; // 羽軸から外の縁まで（幅の割合）
const FEATHER_STATIONS = [0.06, 0.32, 0.56, 0.8, 0.93];
const RIDGE = [RIDGE_ROOT, 2.5]; // 稜線の高さ（付け根・先、mm）
const EDGE = [2.6, 1]; // 外の縁の厚み（付け根・先、mm）
const BULGE = 1.4; // 稜線と外の縁の間の面のふくらみ (mm)
const CURL = 6; // リムの羽根の先の反り上がり (mm)
function featherMesh(root: THREE.Vector2, dir: THREE.Vector2, len: number, face: number, sign: number, z0: number, mat: THREE.Material, curl = CURL, wk = FEATHER_W, vane = 1) {
  const side = new THREE.Vector2(dir.y, -dir.x); // 前（+X の側）
  const at = (a: number, s: number, z: number) => {
    const y = root.y + dir.y * a + side.y * s;
    return new THREE.Vector3(root.x + dir.x * a + side.x * s, sign > 0 ? y : 2 * RISER_C / MM - y, face * z).multiplyScalar(MM);
  };
  const w = len * wk;
  const rings = FEATHER_STATIONS.map((t) => {
    const a = len * t;
    const base = z0 + curl * t * t;
    const back = vane * w * lerpKeys(FEATHER_BACK, t);
    const edge = THREE.MathUtils.lerp(EDGE[0], EDGE[1], t);
    const ridge = THREE.MathUtils.lerp(RIDGE[0], RIDGE[1], t);
    const ring = [
      at(a, back, base),
      at(a, back, base + edge),
      at(a, back * 0.5, base + (edge + ridge) / 2 + BULGE * (1 - t)),
      at(a, 0, base + ridge),
      at(a, 0, base),
    ];
    return face * sign * vane > 0 ? ring.reverse() : ring; // 面を前へ広げると並びの回りが返る。裏の面と、映した下のリムではさらに表裏が返る
  });
  return loftClosed(rings, at(0, 0, z0), at(len, 0, z0 + curl), mat);
}

export const falconBow: SkinDecor = {
  build(parts, mats, model) {
    const env = mats.metal.envMap;
    const { shell, wing, gold, dark, rim, deep } = createFalconMats(env, mats.metal.flatShading);
    const g = new THREE.Group();
    const add = (outline: Outline, depth: number, mat: THREE.Material, z = 0, bevel?: number) => {
      const m = new THREE.Mesh(plate(outline, depth, bevel), mat);
      m.position.z = z;
      g.add(m);
      return m;
    };
    // リムの両面に貼る薄い板（gap mm だけ面から浮かせる）
    const faces = (outline: Outline, thick: number, mat: THREE.Material, gap: number) => {
      for (const side of [1, -1]) add(outline, thick * MM, mat, side * (LIMB_T / 2 + gap + thick / 2) * MM, 0.0004);
    };

    // 上のリムの輪郭（中心線は元のリムのもの）
    const path = limbPath();
    const pts = path.map(({ p }) => new THREE.Vector2(p.x / MM, p.y / MM));
    const end = path[path.length - 1];
    const tip = end.p.clone().addScaledVector(end.t, LIMB_TIP * MM).divideScalar(MM);
    const n = pts.length - 1;
    const limb = band(pts, (i) => limbFront(i / n), (i) => limbBack(i / n), new THREE.Vector2(tip.x, tip.y));
    // 白い長い羽根: 前の縁に黒い縁を残し、中心線のすぐ前まで。先は尖らせて翼の 3 分の 2 で終える
    const bladePts = pts.slice(1, 13);
    const blade = band(bladePts, (i) => limbFront((i + 1) / n) - 2, () => -1, pts[13].clone().add(new THREE.Vector2(2, 0)));
    // 金の羽根: リムの向きを基準に、後ろ（射手の側）へ扇に開く
    const root = new THREE.Vector2(...FEATHER_ROOT);
    const aim = pts[FEATHER_AIM].clone().sub(root).normalize();
    const feathers = FEATHERS.map(([deg, len, gap]) => ({ dir: aim.clone().rotateAround(new THREE.Vector2(), deg * Math.PI / 180), len, gap }));

    for (const sign of [1, -1]) {
      const map = (o: Outline) => (sign > 0 ? o : o.map(flipY));
      // 翼（リム）と、両面の白い羽根・金の羽根、柄の端の肩
      add(map(limb), LIMB_T * MM, wing, 0, 0.0015);
      faces(map(blade), 1, shell, 0.3);
      for (const f of feathers) for (const face of [1, -1]) g.add(featherMesh(root, f.dir, f.len, face, sign, LIMB_T / 2 + f.gap, gold, CURL, FEATHER_W, -1));
      add(map(SHOULDER), SHOULDER_T, wing, 0, 0.002);
    }
    // 元の柄・握り・リムは隠す
    for (const [name, mesh] of Object.entries(parts)) if (/^(riser|wrap|limb)/.test(name)) mesh.visible = false;

    // 柄: ロングボウと同じ 8 角の棒（grow だけ太らせた断面で、握りの巻きと紐も作る）
    const ring = (y: number, grow = 0) => {
      const slope = (staveX(y + 0.001) - staveX(y - 0.001)) / 0.002;
      const front = new THREE.Vector3(1, -slope, 0).normalize(); // 中心線に直交して前を向く
      return section(new THREE.Vector3(staveX(y), y, 0), front, staveDepth(y) + grow, staveWidth(y) + grow, staveShift(y));
    };
    const stave = (ys: number[], grow: number, mat: THREE.Material) => {
      const cap = (y: number) => new THREE.Vector3(staveX(y), y, staveShift(y));
      g.add(loftClosed(ys.map((y) => ring(y, grow)), cap(ys[0]), cap(ys[ys.length - 1]), mat));
    };
    const low = 2 * RISER_C - STAVE_END;
    stave(Array.from({ length: STAVE_N + 1 }, (_, i) => low + ((STAVE_END - low) * i) / STAVE_N), 0, shell);
    stave(Array.from({ length: 7 }, (_, i) => GRIP.from + ((GRIP.to - GRIP.from) * i) / 6), 0.005, dark);
    for (const y of [GRIP.from - 0.004, GRIP.to + 0.004]) stave([y - 0.002, y + 0.002], 0.007, gold);
    // 棚（元の棚は柄の左の面から離れるので、間を埋める台を足す）
    const shelfY = model.userData.shelfY as number;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.009), gold);
    shelf.position.set(staveX(shelfY) - 0.004, shelfY + 0.0025, -0.0035);
    g.add(shelf);

    // 核: 暗い丸枠に金の輪、芯は金色に光る（Z 軸に沿った円柱で柄を貫く）
    const glows: GlowSource[] = [];
    const disc = (r: number, len: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x * MM, y * MM, z);
      g.add(m);
      return m;
    };
    for (const cy of CORE_YS) {
      const [x, y, t, z] = [staveX(cy) / MM, cy / MM, staveWidth(cy), staveShift(cy)];
      // 核から両面へ 1 対の羽根の扇。リムの羽根の付け根への向きを基準に、後ろ（-X）へ開く。下の核は上下に映した位置で作る
      const sign = y > RISER_C / MM ? 1 : -1;
      const from = new THREE.Vector2(...(sign > 0 ? [x, y] : flipY([x, y])));
      const toRoot = root.clone().sub(from).normalize();
      for (const [deg, len, gap, curl] of CORE_FEATHERS) {
        const dir = toRoot.clone().rotateAround(new THREE.Vector2(), deg * Math.PI / 180);
        for (const face of [1, -1]) {
          g.add(featherMesh(from, dir, len, face, sign, face * (z / MM) + (t / MM) / 2 + gap, gold, curl, CORE_FEATHER_W));
        }
      }
      // 羽根の付け根を押さえる軸として、羽根より上へ突き出す
      const top = 2 * CORE_TOP * MM;
      disc(0.009, t + top, x, y, z, rim);
      disc(0.006, t + top + 0.001, x, y, z, gold);
      const core = disc(0.0032, t + top + 0.0015, x, y, z, deep);
      const glow = addGlow(core, 0xe8b450);
      glows.push(glow);
      core.onBeforeRender = () => {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0025);
        deep.emissiveIntensity = 1.4 + pulse * 0.4 + skinFx.flare * 2;
        glow.strength = (0.4 + pulse * 0.1 + skinFx.flare * 0.5) * GLOW_K;
      };
    }

    // 弦を金にする（外したら元のマテリアルに戻す）
    const strings = (model.userData.strings ?? []) as THREE.Mesh[];
    const keep = strings.map((s) => s.material);
    for (const s of strings) s.material = gold;
    g.userData.undo = () => {
      strings.forEach((s, i) => (s.material = keep[i]));
      for (const glow of glows) removeGlow(glow);
    };
    return g;
  },
};

// ---- 矢 ----
// 子の並び（bow.ts の createArrow）: 軸・鏃・矢羽 3 枚・筈。元に戻す関数を返す
let arrowMats: ReturnType<typeof createFalconMats> | null = null;
export function dressFalconArrow(arrow: THREE.Group, env: THREE.Texture | null) {
  const m = (arrowMats ??= createFalconMats(env, false));
  const meshes = arrow.children as THREE.Mesh[];
  const keep = meshes.map((o) => o.material);
  const [shaft, head, v0, v1, v2, nock] = meshes;
  shaft.material = m.dark;
  head.material = m.deep;
  for (const v of [v0, v1, v2]) v.material = m.shell;
  nock.material = m.gold;
  return () => meshes.forEach((o, i) => (o.material = keep[i]));
}

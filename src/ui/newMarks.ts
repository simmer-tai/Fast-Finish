// ---- NEW の印 ----
// 解放したのにまだ触っていないもの（ロッカーの部品・スキン）に NEW を付ける。カーソルを合わせるか選ぶと消える。
// 触ったものの鍵（'skin:kunai:talon' など）を覚えておく。覚えたものがまだ無いとき（この仕組みが入る前から遊んでいる人と、初めて遊ぶ人）は、
// その時点で解放済みのものを全部触ったことにする（seedSeen）。前からあるものや初めから選べるものに NEW を付けないため
const SEEN_STORE = 'fast-finish.seen';
const seen = new Set<string>();
let fresh = true;
try {
  const saved = localStorage.getItem(SEEN_STORE);
  fresh = saved === null;
  const list = JSON.parse(saved ?? '[]');
  if (Array.isArray(list)) for (const k of list) if (typeof k === 'string') seen.add(k);
} catch {
  // 読めなければ初めてと同じ
}
function save() {
  try {
    localStorage.setItem(SEEN_STORE, JSON.stringify([...seen]));
  } catch {
    // 保存できなくても、この回の間は効いている
  }
}
// 起動したときに、各画面が今解放済みのものの鍵を渡す。覚えたものがあれば何もしない
export function seedSeen(keys: string[]) {
  if (!fresh) return;
  for (const k of keys) seen.add(k);
  save();
}
export const isNew = (key: string, open: boolean) => open && !seen.has(key);
// 触った。初めて触ったときは true
export function markSeen(key: string) {
  if (seen.has(key)) return false;
  seen.add(key);
  save();
  return true;
}
export const NEW_TAG = '<i class="new-tag">NEW</i>';

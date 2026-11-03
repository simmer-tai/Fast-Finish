// ---- CSS のアニメーションを頭からやり直す ----
// クラスを外して offsetWidth を読み、付け直すやり方は、読むたびにページ全体の配置をその場で計算させる。
// キルでは HUD のあちこちが同時にやり直すので、弱い PC ではその 1 フレームが大きく引っかかる。
// ここではクラスを外すだけにしておき、今の処理が終わったところ（描く前）でまとめて 1 度だけスタイルを確定させてから付け直す
const queue = new Map<Element, string[]>();

export function restartAnim(el: Element, ...cls: string[]) {
  el.classList.remove(...cls);
  if (!queue.size) queueMicrotask(flush);
  const list = queue.get(el);
  if (list) list.push(...cls);
  else queue.set(el, cls);
}

function flush() {
  // 外したことをスタイルに反映させる（配置までは計算させない）
  for (const el of queue.keys()) void getComputedStyle(el).animationName;
  for (const [el, cls] of queue) el.classList.add(...cls);
  queue.clear();
}

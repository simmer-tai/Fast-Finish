// リロードした直後のロード画面（index.html の #loader）。最初から出ていて、準備ができたら斜めの帯ごと右へ抜ける。
// 読み込みに失敗したときの表示は index.html の読み込みの処理が出す
const FONT_WAIT_MS = 3000; // フォントの配信が遅くても、これ以上は待たない

// フォントのスタイルシートは画面を止めないように遅れて効かせる（読み終わると media が all になる）
const fontSheetLoaded = new Promise<void>((resolve) => {
  const sheet = document.getElementById('font-sheet') as HTMLLinkElement;
  if (sheet.media === 'all') return resolve();
  sheet.addEventListener('load', () => resolve(), { once: true });
  sheet.addEventListener('error', () => resolve(), { once: true });
});

// スタイルシートが効く前に読み込もうとしても何も起きないので、効いてから字形を読み込む
async function loadFonts() {
  await fontSheetLoaded;
  await Promise.allSettled([
    document.fonts.load('800 100px "Barlow Condensed"', 'FINISH'), // 出す瞬間に別の字形で一瞬出ないよう、太字を先に読み込んでおく
    document.fonts.load('600 100px "Oswald"', 'FASTFINISH'), // ステージの始まりのタイトルの字も先に読み込んでおく
    document.fonts.ready,
  ]);
}

const nextFrames = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

/** work が終わって最初の画面を描いたら onReady を呼び、ロード画面を抜けさせる */
export async function finishLoading(work: Promise<void>, onReady: () => void) {
  const fonts = Promise.race([loadFonts(), new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS))]);
  await Promise.all([work, fonts]);
  await nextFrames();
  onReady();
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.querySelector('.cover')?.addEventListener('animationend', () => loader.remove(), { once: true });
  loader.classList.add('done');
}

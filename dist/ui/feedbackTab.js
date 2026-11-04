// PLAY のフィードバックのタブ。呼びかけを出し、Google フォームを別のタブで開く
import * as sfx from '../audio.js?v=e316db84';
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfHHDXr1eBGzaixyqQfTQe9tSDpmkfiL8bf85zoKaHQjBlPHw/viewform?usp=header';
// スクリーンショットの欄があるので、フォームは Google へのログインが必須になる。開く前に伝えておく
const NOTE_DEFAULT = '別のタブで開きます。スクショも貼れます（Google アカウントでのログインが必要です）。';
const NOTE_THANKS = 'ありがとう！ 書き終わったら、このタブに戻ってきてください。';
// パッドの操作はブラウザにクリックとして扱われず、新しいタブを止められることがある
const NOTE_BLOCKED = 'フォームを開けませんでした。マウスで押すか、ブラウザのポップアップの設定を確かめてください。';
const overlay = document.getElementById('overlay');
const note = overlay.querySelector('[data-feedback-note]');
function setNote(text, thanks = false) {
    note.textContent = text;
    note.classList.toggle('thanks', thanks);
}
export function openFeedbackTab() {
    overlay.classList.add('select-feedback');
    setNote(NOTE_DEFAULT);
}
export function closeFeedbackTab() {
    overlay.classList.remove('select-feedback');
}
// 押したものがフィードバックのタブの中なら受け持つ
export function onFeedbackClick(target) {
    if (!target.closest('[data-action="feedback-send"]'))
        return;
    const opened = window.open(FORM_URL, '_blank');
    if (!opened) {
        sfx.playUiDenied();
        return setNote(NOTE_BLOCKED);
    }
    opened.opener = null;
    sfx.playUiSelect();
    setNote(NOTE_THANKS, true);
}

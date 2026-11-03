// 作者の手元で開いているか（file: か localhost）。まだ公開しないもの（マルチプレイ・パルクールのミッション）は、これが true のときだけ出す
export const localDev = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

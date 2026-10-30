// ---- ゲームパッド ----
// ブラウザの標準配置（Xbox 配置。PS / Switch Pro も同じ並びで届く）を前提に、毎フレーム読む。
// 押した瞬間 / 離した瞬間はここで前のフレームと比べて取り出す
export const PAD = {
    A: 0, B: 1, X: 2, Y: 3,
    LB: 4, RB: 5, LT: 6, RT: 7,
    BACK: 8, START: 9, L3: 10, R3: 11,
    UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};
const BUTTON_COUNT = 16;
const TRIGGER_ON = 0.3; // トリガーはアナログなので、これ以上引いたら押したとみなす
const STICK_DEADZONE = 0.15; // スティックの遊び。中立でもわずかにずれた値が来るので捨てる
const state = {
    connected: false,
    timestamp: 0,
    held: new Array(BUTTON_COUNT).fill(false),
    down: new Array(BUTTON_COUNT).fill(false),
    up: new Array(BUTTON_COUNT).fill(false),
    lx: 0,
    ly: 0,
    rx: 0,
    ry: 0,
};
// 円形の遊びを取ってから、残りを 0..1 に引き伸ばす（遊びの境目で値が跳ばないように）
function readStick(x, y) {
    const m = Math.hypot(x, y);
    if (m < STICK_DEADZONE)
        return [0, 0];
    const k = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
    return [x * k, y * k];
}
export function findPad() {
    const pads = navigator.getGamepads?.() ?? [];
    let fallback = null;
    for (const p of pads) {
        if (!p || !p.connected)
            continue;
        if (p.mapping === 'standard')
            return p;
        fallback ??= p;
    }
    return fallback;
}
export function pollPad() {
    const pad = findPad();
    state.connected = !!pad;
    state.timestamp = pad?.timestamp ?? 0;
    for (let i = 0; i < BUTTON_COUNT; i++) {
        const b = pad?.buttons[i];
        const now = !!b && (b.pressed || b.value > TRIGGER_ON);
        state.down[i] = now && !state.held[i];
        state.up[i] = !now && state.held[i];
        state.held[i] = now;
    }
    [state.lx, state.ly] = pad ? readStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0) : [0, 0];
    [state.rx, state.ry] = pad ? readStick(pad.axes[2] ?? 0, pad.axes[3] ?? 0) : [0, 0];
    return state;
}

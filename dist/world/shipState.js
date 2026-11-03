export const shipState = { roll: 0, pitch: 0, heave: 0, rage: 0, big: 0, warn: Infinity, time: 0, wave: 0, fallen: [] };
let sway;
let phase = 0, cyclesUntilWave = 3;
let waveActive = false;
// 半周（片側へ傾いて戻るまで）ごとに、ときどき浅く傾ける。浅い半周では積み荷が滑り出しても手すりに届く前に止まる
let half = 0, calm = 0; // calm: この半周の傾きの最大（度）。0 なら普通に揺れる
let fixedRage = null, progress = null;
export function resetShipState(sea, hasEnemies) {
    sway = sea?.sway;
    const param = new URLSearchParams(window.location.search).get('rage');
    const parsed = param === null || param.trim() === '' ? NaN : Number(param);
    fixedRage = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : null;
    progress = hasEnemies ? 0 : null;
    phase = 0;
    cyclesUntilWave = 3 - 2 * (fixedRage ?? 0);
    waveActive = false;
    half = 0;
    calm = 0;
    Object.assign(shipState, { roll: 0, pitch: 0, heave: 0, rage: fixedRage ?? 0, big: 0, warn: Infinity, time: 0, wave: 0 });
    shipState.fallen.length = 0;
}
export function setShipProgress(kills, quota) { progress = quota > 0 ? kills / quota : 0; }
export function updateShipState(dt) {
    if (!sway || dt <= 0)
        return;
    shipState.time += dt;
    shipState.rage = Math.max(0, Math.min(1, fixedRage ?? progress ?? shipState.time / 180));
    const period = 14 - 5 * shipState.rage;
    phase += dt / period;
    while (phase >= 1) {
        phase -= 1;
        if (waveActive) {
            waveActive = false;
            cyclesUntilWave = 3 - 2 * shipState.rage;
        }
        else if (--cyclesUntilWave <= 0) {
            waveActive = true;
            shipState.wave++;
        }
    }
    // 荒れるほど浅い半周は減り、少し深くなる（周期が短くなって滑る距離が縮むぶんを補う）。大波の周には混ぜない
    const h = phase < 0.5 ? 0 : 1;
    if (h !== half) {
        half = h;
        calm = !waveActive && Math.random() < 0.4 - 0.2 * shipState.rage ? 4.4 + Math.random() * (0.5 + 0.7 * shipState.rage) : 0;
    }
    shipState.big = waveActive ? Math.sin(Math.PI * phase) : 0;
    const amplitude = calm || Math.min(28, (9 + 7 * shipState.rage) * (1 + 0.8 * shipState.big));
    shipState.roll = amplitude * Math.PI / 180 * Math.sin(phase * 2 * Math.PI);
    shipState.pitch = sway.pitch * Math.PI / 180 * Math.sin(shipState.time * 2 * Math.PI / sway.pitchPeriod + 1.3);
    shipState.heave = sway.heave * Math.sin(shipState.time * 2 * Math.PI / sway.heavePeriod + 0.6);
    shipState.warn = waveActive ? 0 : (Math.ceil(cyclesUntilWave) - phase) * period;
}

import { findPad } from '../gamepad.js';
import { game } from '../game/state.js';
import { options } from '../ui/options.js';
const effects = {
    dash: { priority: 0, pulses: [{ duration: 45, strong: 0.12, weak: 0.25 }] },
    hit: { priority: 1, pulses: [{ duration: 55, strong: 0.22, weak: 0.55 }] },
    heavy: { priority: 2, pulses: [{ duration: 85, strong: 0.65, weak: 0.8 }, { delay: 85, duration: 90, strong: 0.2, weak: 0.08 }] },
    kill: { priority: 3, pulses: [{ duration: 130, strong: 1, weak: 1 }, { delay: 155, duration: 130, strong: 0.8, weak: 0.65 }, { delay: 310, duration: 170, strong: 0.45, weak: 0.2 }] },
    parry: { priority: 4, pulses: [{ duration: 45, strong: 0.3, weak: 1 }, { delay: 65, duration: 80, strong: 0.55, weak: 0.45 }] },
    damage: { priority: 5, pulses: [{ duration: 110, strong: 1, weak: 0.65 }, { delay: 130, duration: 160, strong: 0.4, weak: 0.1 }] },
};
let sequence = 0;
let activeUntil = 0;
let activePriority = -1;
export function rumble(kind) {
    if (!game.usingPad || options.padVibration <= 0)
        return;
    const pad = findPad();
    if (!pad?.vibrationActuator?.playEffect)
        return;
    const effect = effects[kind];
    const now = performance.now();
    if (now < activeUntil && effect.priority < activePriority)
        return;
    const current = ++sequence;
    activePriority = effect.priority;
    activeUntil = now + Math.max(...effect.pulses.map((pulse) => (pulse.delay ?? 0) + pulse.duration));
    for (const pulse of effect.pulses) {
        const play = () => {
            if (current !== sequence || !game.usingPad || options.padVibration <= 0)
                return;
            const currentPad = findPad();
            if (!currentPad || currentPad.index !== pad.index || !currentPad.vibrationActuator?.playEffect)
                return;
            try {
                void currentPad.vibrationActuator.playEffect('dual-rumble', {
                    duration: pulse.duration,
                    strongMagnitude: pulse.strong * options.padVibration,
                    weakMagnitude: pulse.weak * options.padVibration,
                }).catch(() => { });
            }
            catch {
                // 振動に対応していない機器・ブラウザでは何もしない。
            }
        };
        if (pulse.delay)
            setTimeout(play, pulse.delay);
        else
            play();
    }
}

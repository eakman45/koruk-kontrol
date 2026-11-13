// Sesli geri bildirim (iOS'ta ilk dokunuşla açılır)
let ctx = null;
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {}
}
function tone(f, d, start = 0, type = "square", vol = 0.25) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f; g.gain.value = vol;
  o.connect(g); g.connect(ctx.destination);
  const t = ctx.currentTime + start; o.start(t); o.stop(t + d);
}
export function beep(kind, enabled = true) {
  if (!enabled) return;
  try {
    if (kind === "ok") tone(1400, 0.09, 0, "sine", 0.3);
    else if (kind === "warn") { tone(700, 0.15); tone(700, 0.15, 0.22); }
    else if (kind === "bad") for (let i = 0; i < 4; i++) { tone(420, 0.22, i * 0.3); tone(300, 0.12, i * 0.3 + 0.22); }
  } catch {}
  try { navigator.vibrate?.(kind === "bad" ? [200, 80, 200, 80, 200] : kind === "warn" ? [120, 60, 120] : 40); } catch {}
}

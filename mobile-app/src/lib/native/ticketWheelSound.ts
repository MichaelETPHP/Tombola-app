let context: AudioContext | undefined;
let noiseBuffer: AudioBuffer | undefined;
let lastPlayedAt = 0;

/** A short burst of white noise, reused across every tick — this is the
 *  "zzz" ratchet texture; only its filter/gain envelope changes per play. */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.04);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** A loud, mechanical reel-detent "zzz" while a ticket wheel crosses a row —
 *  filtered noise for the ratchet body, layered with a low thump for weight. */
export function playWheelTick(): void {
  if (typeof window === 'undefined') return;
  const nowMs = performance.now();
  if (nowMs - lastPlayedAt < 30) return;
  lastPlayedAt = nowMs;
  try {
    if ((localStorage.getItem('yeneeta_chat_muted') ?? localStorage.getItem('tombola_chat_muted')) === '1') return;
    const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    const play = () => {
      if (!context || context.state !== 'running') return;
      const started = context.currentTime;

      const noise = context.createBufferSource();
      noise.buffer = getNoiseBuffer(context);
      const bandpass = context.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(950, started);
      bandpass.Q.value = 2.8;
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(.22, started);
      noiseGain.gain.exponentialRampToValueAtTime(.001, started + .038);
      noise.connect(bandpass).connect(noiseGain).connect(context.destination);
      noise.onended = () => { noise.disconnect(); bandpass.disconnect(); noiseGain.disconnect(); };
      noise.start(started);
      noise.stop(started + .04);

      const oscillator = context.createOscillator();
      const oscGain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(160, started);
      oscillator.frequency.exponentialRampToValueAtTime(85, started + .022);
      oscGain.gain.setValueAtTime(.11, started);
      oscGain.gain.exponentialRampToValueAtTime(.001, started + .03);
      oscillator.connect(oscGain).connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); oscGain.disconnect(); };
      oscillator.start(started);
      oscillator.stop(started + .032);
    };
    if (context.state === 'suspended') void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    // Sound is feedback only; it must never interrupt ticket selection.
  }
}

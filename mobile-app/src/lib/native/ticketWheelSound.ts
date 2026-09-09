let context: AudioContext | undefined;
let lastPlayedAt = 0;

/** A restrained iOS-style mechanical tick while a ticket wheel crosses a row. */
export function playWheelTick(): void {
  if (typeof window === 'undefined') return;
  const nowMs = performance.now();
  if (nowMs - lastPlayedAt < 34) return;
  lastPlayedAt = nowMs;
  try {
    if ((localStorage.getItem('yeneeta_chat_muted') ?? localStorage.getItem('tombola_chat_muted')) === '1') return;
    const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    const play = () => {
      if (!context || context.state !== 'running') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const started = context.currentTime;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(185, started);
      oscillator.frequency.exponentialRampToValueAtTime(110, started + .018);
      gain.gain.setValueAtTime(.018, started);
      gain.gain.exponentialRampToValueAtTime(.001, started + .022);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(started);
      oscillator.stop(started + .024);
    };
    if (context.state === 'suspended') void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    // Sound is feedback only; it must never interrupt ticket selection.
  }
}

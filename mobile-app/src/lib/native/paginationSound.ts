let context: AudioContext | undefined;

/** A quiet, short tap, only invoked directly by a pagination gesture. */
export function playPaginationSound(): void {
  if (typeof window === 'undefined') return;
  try {
    // Honor the app's existing sound preference, including its legacy key.
    if ((localStorage.getItem('yeneeta_chat_muted') ?? localStorage.getItem('tombola_chat_muted')) === '1') return;
    const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    const play = () => {
      if (!context || context.state !== 'running') return;
      const tone = context.createOscillator();
      const volume = context.createGain();
      const now = context.currentTime;
      tone.type = 'sine';
      tone.frequency.setValueAtTime(740, now);
      tone.frequency.exponentialRampToValueAtTime(410, now + 0.045);
      volume.gain.setValueAtTime(0, now);
      volume.gain.linearRampToValueAtTime(0.045, now + 0.004);
      volume.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      tone.connect(volume);
      volume.connect(context.destination);
      tone.onended = () => { tone.disconnect(); volume.disconnect(); };
      tone.start(now);
      tone.stop(now + 0.06);
    };
    if (context.state === 'suspended') void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    // Audio availability must never prevent moving between pages.
  }
}

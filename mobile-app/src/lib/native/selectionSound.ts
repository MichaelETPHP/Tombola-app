let context: AudioContext | undefined;

/** A quiet chirp for picking/unpicking a ticket number, only invoked directly by that tap. */
export function playSelectionSound(selecting: boolean): void {
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
      const [from, to, duration] = selecting ? [520, 660, 0.05] : [620, 480, 0.045];
      tone.type = 'sine';
      tone.frequency.setValueAtTime(from, now);
      tone.frequency.exponentialRampToValueAtTime(to, now + duration);
      volume.gain.setValueAtTime(0, now);
      volume.gain.linearRampToValueAtTime(0.045, now + 0.004);
      volume.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.01);
      tone.connect(volume);
      volume.connect(context.destination);
      tone.onended = () => { tone.disconnect(); volume.disconnect(); };
      tone.start(now);
      tone.stop(now + duration + 0.015);
    };
    if (context.state === 'suspended') void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    // Audio availability must never prevent selecting a number.
  }
}

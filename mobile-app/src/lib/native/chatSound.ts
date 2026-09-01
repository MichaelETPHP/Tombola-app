const SOUND_URL = '/ding-light-bulb-moment-jam-fx-long-1-00-02.mp3';
const MUTE_KEY = 'tombola_chat_muted';

let audio: HTMLAudioElement | undefined;
let unlocked = false;

/** Call once, high up the tree (root app layout) — a single shared <audio>
 *  element for the whole app, so the room page's own polling and the
 *  global cross-app poller both ring through the same instance instead of
 *  each creating their own (and each needing its own unlock gesture). */
export function initChatSound(): void {
  if (audio || typeof window === 'undefined') return;
  audio = new Audio(SOUND_URL);
  audio.preload = 'auto';
  // Mobile WebKit/Chrome refuse any programmatic play() that didn't
  // originate in a real gesture — including one fired from a poll timer —
  // until the same element has been played once inside an actual tap.
  // Capture-phase + once so this fires on the very first tap anywhere in
  // the app, then never again.
  window.addEventListener('pointerdown', unlockOnce, { capture: true, once: true });
}

function unlockOnce() {
  if (unlocked || !audio) return;
  unlocked = true;
  audio
    .play()
    .then(() => {
      audio!.pause();
      audio!.currentTime = 0;
    })
    .catch(() => {
      unlocked = false;
    });
}

export function playChatSound(): void {
  if (!audio || isChatSoundMuted()) return;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Still locked (no gesture yet this session) — silently skip, the
    // chat itself works fine either way.
  });
}

export function isChatSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setChatSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Private browsing / storage disabled — mute preference just won't
    // persist across sessions.
  }
}

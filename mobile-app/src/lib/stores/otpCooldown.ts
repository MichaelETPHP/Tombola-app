import { readable } from 'svelte/store';

export function formatCooldown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function createOtpCooldown(key: string) {
  let deadline = 0;
  let update: (() => void) | undefined;
  function restore() {
    if (typeof window === 'undefined') return;
    try {
      const stored = Number(window.sessionStorage.getItem(key));
      if (Number.isFinite(stored)) deadline = Math.max(deadline, stored);
    } catch { /* A blocked storage API must not block sign-in. */ }
  }
  const remaining = readable(0, (set) => {
    restore();
    update = () => set(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(() => update?.(), 250);
    return () => { clearInterval(timer); update = undefined; };
  });
  return {
    subscribe: remaining.subscribe,
    start(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 0) return;
      restore();
      deadline = Math.max(deadline, Date.now() + Math.max(1, seconds) * 1000);
      if (typeof window !== 'undefined') {
        try { window.sessionStorage.setItem(key, String(deadline)); } catch { /* Keep the in-memory timer. */ }
      }
      update?.();
    },
  };
}

export const otpRequestCooldown = createOtpCooldown('otp-request-cooldown');
export const otpVerifyCooldown = createOtpCooldown('otp-verify-cooldown');

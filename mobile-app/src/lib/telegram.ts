import { api } from '$lib/api/client.js';
import type { AuthResponse } from '$lib/schemas/index.js';

interface TelegramWebApp {
  initData: string;
  platform: string;
  contentSafeAreaInset?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  onEvent?(eventType: 'contentSafeAreaChanged' | 'fullscreenChanged', callback: () => void): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  requestFullscreen?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  // Bot API 6.9+. Shows Telegram's own native "share your phone number?"
  // popup. Per Telegram's docs the callback receives ONLY a boolean — the
  // actual number is never exposed here, it goes to the bot's backend
  // instead (see api/src/lib/telegram.ts's extractSharedContact).
  requestContact?(callback?: (shared: boolean) => void): void;
}

function syncTelegramContentSafeArea(webApp: TelegramWebApp): void {
  const top = webApp.contentSafeAreaInset?.top;
  if (Number.isFinite(top) && top !== undefined && top > 0) {
    document.documentElement.style.setProperty('--telegram-content-safe-top', `${Math.ceil(top)}px`);
  }
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramMiniApp(): TelegramWebApp | null {
  const webApp = window.Telegram?.WebApp;
  return webApp?.initData ? webApp : null;
}

export function prepareTelegramMiniApp(): TelegramWebApp | null {
  const webApp = getTelegramMiniApp();
  if (!webApp) return null;

  // Mark the document before Telegram paints its final viewport so CSS can
  // suppress browser-style overscroll and draggable images/links without
  // changing the native APK or ordinary PWA experience.
  document.documentElement.classList.add('telegram-mini-app');

  // Telegram can finalize this inset after the first paint or after entering
  // fullscreen. Mirror the live bridge value into our own stable CSS variable
  // so the app header always begins below Telegram's floating controls.
  syncTelegramContentSafeArea(webApp);
  webApp.onEvent?.('contentSafeAreaChanged', () => syncTelegramContentSafeArea(webApp));
  webApp.onEvent?.('fullscreenChanged', () => syncTelegramContentSafeArea(webApp));

  webApp.ready();
  webApp.expand();
  webApp.disableVerticalSwipes?.();
  webApp.enableClosingConfirmation?.();
  webApp.setHeaderColor?.('#00D3A0');
  webApp.setBackgroundColor?.('#E3F9EF');
  webApp.setBottomBarColor?.('#FFFFFF');

  // Fullscreen is available from Bot API 8.0. Keep the version guard as old
  // Telegram clients expose a smaller bridge and throw for unknown methods.
  if (webApp.isVersionAtLeast?.('8.0')) {
    try {
      webApp.requestFullscreen?.();
    } catch {
      // expand() above remains the safe fallback on unsupported clients.
    }
  }
  return webApp;
}

export type TelegramLoginResponse =
  | ({ status: 'authenticated' } & AuthResponse)
  | {
      status: 'contact_required';
      telegramLinkToken: string;
      telegramUser: {
        fullName: string;
        username: string | null;
        photoUrl: string | null;
      };
    };

export function authenticateTelegramMiniApp(webApp: TelegramWebApp): Promise<TelegramLoginResponse> {
  return api.post<TelegramLoginResponse>(
    '/auth/telegram/mini-app',
    { initData: webApp.initData },
    { skipAuth: true }
  );
}

/**
 * Wraps WebApp.requestContact()'s callback API in a promise. Resolves to
 * whether the user approved sharing — never the phone number itself,
 * which this client never sees at all (see the interface comment above).
 */
export function requestTelegramContact(webApp: TelegramWebApp): Promise<boolean> {
  return new Promise((resolve) => {
    if (!webApp.requestContact) {
      resolve(false);
      return;
    }
    webApp.requestContact((shared) => resolve(shared));
  });
}

export type TelegramContactCompletion =
  | ({ status: 'authenticated' } & AuthResponse)
  | { status: 'pending' };

/**
 * Polls the backend to see whether /auth/telegram/webhook has finished
 * processing the contact share yet — that webhook runs asynchronously,
 * entirely outside this request's control, so there's no way to know
 * except by asking again after a short wait.
 */
export function completeTelegramContactLogin(telegramLinkToken: string): Promise<TelegramContactCompletion> {
  return api.post<TelegramContactCompletion>(
    '/auth/telegram/mini-app/complete',
    { telegramLinkToken },
    { skipAuth: true }
  );
}

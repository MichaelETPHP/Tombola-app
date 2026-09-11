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
  // Opens a link in Telegram's own external browser WITHOUT closing this
  // Mini App — it keeps running in the background exactly as it was, so
  // returning to it (rather than following whatever return_url that
  // external browser eventually lands on) is instant, not a fresh reload.
  // try_instant_view must stay off: that mode is for read-only articles
  // and would break an interactive payment form.
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
}

function syncTelegramContentSafeArea(webApp: TelegramWebApp): void {
  const top = webApp.contentSafeAreaInset?.top;
  if (Number.isFinite(top) && top !== undefined && top > 0) {
    document.documentElement.style.setProperty('--telegram-content-safe-top', `${Math.ceil(top)}px`);
  }
  // Telegram's own bottom chrome (the swipe-to-minimize handle, and on
  // clients that stay in non-fullscreen mode, its system bar) sits below
  // the WebView's actual content area exactly like the top controls do —
  // but only the top inset was ever mirrored into CSS, so every
  // fixed-to-the-bottom element (this page's checkout footer, the bottom
  // nav elsewhere) had no idea that strip existed and could sit under it.
  const bottom = webApp.contentSafeAreaInset?.bottom;
  if (Number.isFinite(bottom) && bottom !== undefined && bottom > 0) {
    document.documentElement.style.setProperty('--telegram-content-safe-bottom', `${Math.ceil(bottom)}px`);
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

/**
 * Every one of these is cosmetic/best-effort — none of them being able to
 * run is ever a reason the app itself shouldn't open. `ready`/`expand` used
 * to be called directly (no `?.()`, no try/catch) despite being the only
 * two calls in this function not guarded that way, which meant a throw
 * from either — on a Telegram client/platform where one behaves
 * unexpectedly, e.g. Telegram Desktop's WebView, an older app build, or a
 * mini app relaunched into an already-expanded state — crashed this
 * function, and with it the entire boot sequence, before the rest of the
 * app ever got a chance to render. That's this exact "works in a browser
 * and the APK, but Telegram shows an error and the page never opens" bug:
 * this bridge code only ever runs inside Telegram in the first place.
 */
function safeBridgeCall(name: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.error(`Telegram bridge call failed: ${name}`, error);
  }
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
  safeBridgeCall('syncTelegramContentSafeArea', () => syncTelegramContentSafeArea(webApp));
  safeBridgeCall('onEvent(contentSafeAreaChanged)', () => webApp.onEvent?.('contentSafeAreaChanged', () => syncTelegramContentSafeArea(webApp)));
  safeBridgeCall('onEvent(fullscreenChanged)', () => webApp.onEvent?.('fullscreenChanged', () => syncTelegramContentSafeArea(webApp)));

  safeBridgeCall('ready', () => webApp.ready());
  safeBridgeCall('expand', () => webApp.expand());
  safeBridgeCall('disableVerticalSwipes', () => webApp.disableVerticalSwipes?.());
  safeBridgeCall('enableClosingConfirmation', () => webApp.enableClosingConfirmation?.());
  safeBridgeCall('setHeaderColor', () => webApp.setHeaderColor?.('#00D3A0'));
  safeBridgeCall('setBackgroundColor', () => webApp.setBackgroundColor?.('#E3F9EF'));
  safeBridgeCall('setBottomBarColor', () => webApp.setBottomBarColor?.('#FFFFFF'));

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

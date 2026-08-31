import { api } from '$lib/api/client.js';
import type { AuthResponse } from '$lib/schemas/index.js';

interface TelegramWebApp {
  initData: string;
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  requestFullscreen?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
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
      status: 'phone_required';
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

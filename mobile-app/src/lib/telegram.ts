import { api } from '$lib/api/client.js';
import type { AuthResponse } from '$lib/schemas/index.js';

interface TelegramWebApp {
  initData: string;
  platform: string;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
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
  webApp.ready();
  webApp.expand();
  webApp.disableVerticalSwipes?.();
  webApp.setHeaderColor?.('#00D3A0');
  webApp.setBackgroundColor?.('#E3F9EF');
  webApp.setBottomBarColor?.('#FFFFFF');
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

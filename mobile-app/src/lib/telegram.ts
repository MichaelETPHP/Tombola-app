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

interface TelegramLoginResult {
  id_token?: string;
  error?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
      Login?: {
        auth(
          options: { client_id: number; scope: Array<'profile' | 'phone'>; lang: string; nonce: string },
          callback: (result: TelegramLoginResult) => void
        ): void;
      };
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

let loginSdkPromise: Promise<void> | null = null;
function loadTelegramLoginSdk(): Promise<void> {
  if (window.Telegram?.Login) return Promise.resolve();
  if (loginSdkPromise) return loginSdkPromise;
  loginSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://oauth.telegram.org/js/telegram-login.js?6';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Telegram Login'));
    document.head.appendChild(script);
  });
  return loginSdkPromise;
}

export type TelegramLoginResponse =
  | ({ status: 'authenticated' } & AuthResponse)
  | { status: 'phone_required'; telegramLinkToken: string };

export async function loginWithTelegram(): Promise<TelegramLoginResponse> {
  const nonce = await api.post<{ nonce: string; nonceToken: string; clientId: string }>(
    '/auth/telegram/nonce',
    undefined,
    { skipAuth: true }
  );
  await loadTelegramLoginSdk();
  if (!window.Telegram?.Login) throw new Error('Telegram Login is unavailable');

  const idToken = await new Promise<string>((resolve, reject) => {
    window.Telegram!.Login!.auth(
      {
        client_id: Number(nonce.clientId),
        scope: ['profile', 'phone'],
        lang: document.documentElement.lang || 'en',
        nonce: nonce.nonce,
      },
      (result) => {
        if (result.id_token) resolve(result.id_token);
        else reject(new Error(result.error || 'Telegram login was cancelled'));
      }
    );
  });

  return api.post<TelegramLoginResponse>(
    '/auth/telegram/oidc',
    { idToken, nonceToken: nonce.nonceToken },
    { skipAuth: true }
  );
}

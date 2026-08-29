import { writable } from 'svelte/store';
import { Network, type ConnectionStatus } from '@capacitor/network';

export type ConnectivityReason = 'offline' | 'service-unreachable' | null;

export interface ConnectivityState {
  initialized: boolean;
  connected: boolean;
  checking: boolean;
  connectionType: ConnectionStatus['connectionType'];
  reason: ConnectivityReason;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3435';
const CHECK_INTERVAL_MS = 10_000;
const CHECK_TIMEOUT_MS = 4_500;

const initialState: ConnectivityState = {
  initialized: false,
  connected: false,
  checking: true,
  connectionType: 'unknown',
  reason: null,
};

export const connectivity = writable<ConnectivityState>(initialState);

let started = false;
let deviceConnected = true;
let connectionType: ConnectionStatus['connectionType'] = 'unknown';
let checkInFlight: Promise<boolean> | null = null;
let intervalId: ReturnType<typeof setInterval> | undefined;
let nativeListener: Awaited<ReturnType<typeof Network.addListener>> | undefined;

function setOffline(type: ConnectionStatus['connectionType'] = connectionType): void {
  deviceConnected = false;
  connectionType = type;
  connectivity.set({
    initialized: true,
    connected: false,
    checking: false,
    connectionType,
    reason: 'offline',
  });
}

/** Checks both the device link and Tombola API availability. */
export async function checkConnectivity(): Promise<boolean> {
  if (checkInFlight) return checkInFlight;

  const check = (async () => {
    if (!navigator.onLine || !deviceConnected) {
      setOffline();
      return false;
    }

    connectivity.update((state) => ({ ...state, checking: true, connectionType }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      const connected = response.ok;

      connectivity.set({
        initialized: true,
        connected,
        checking: false,
        connectionType,
        reason: connected ? null : 'service-unreachable',
      });
      return connected;
    } catch {
      connectivity.set({
        initialized: true,
        connected: false,
        checking: false,
        connectionType,
        reason: navigator.onLine ? 'service-unreachable' : 'offline',
      });
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  checkInFlight = check;
  try {
    return await check;
  } finally {
    if (checkInFlight === check) checkInFlight = null;
  }
}

export async function startConnectivityMonitoring(): Promise<void> {
  if (started) return;
  started = true;

  const browserOnline = navigator.onLine;
  deviceConnected = browserOnline;
  if (!browserOnline) setOffline('none');

  try {
    const status = await Network.getStatus();
    deviceConnected = status.connected;
    connectionType = status.connectionType;
    if (!status.connected) setOffline(status.connectionType);
  } catch {
    // Browser online/offline events remain the fallback on unsupported hosts.
  }

  const handleOnline = () => {
    deviceConnected = true;
    void checkConnectivity();
  };
  const handleOffline = () => setOffline('none');

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  try {
    nativeListener = await Network.addListener('networkStatusChange', (status) => {
      deviceConnected = status.connected;
      connectionType = status.connectionType;
      if (status.connected) void checkConnectivity();
      else setOffline(status.connectionType);
    });
  } catch {
    // The web listeners above are sufficient when the native plugin is absent.
  }

  if (deviceConnected) await checkConnectivity();
  intervalId = setInterval(() => void checkConnectivity(), CHECK_INTERVAL_MS);

  // HMR can reload this module during development. Keep cleanup colocated.
  import.meta.hot?.dispose(() => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    if (intervalId) clearInterval(intervalId);
    void nativeListener?.remove();
    started = false;
  });
}

import { writable } from 'svelte/store';

export interface PendingTelegramLink {
  token: string;
  fullName: string;
  username: string | null;
  photoUrl: string | null;
}

export const pendingTelegramLink = writable<PendingTelegramLink | null>(null);


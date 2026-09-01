import { writable } from 'svelte/store';

export interface Payout {
  id: string;
  raffleId: string;
  status: 'pending_claim' | 'id_submitted' | 'verified' | 'rejected' | 'fulfilled' | 'expired';
  claimDeadline: string;
  createdAt: string;
}

// Session-lifetime cache — same reasoning as tickets.store.ts.
export const payouts = writable<Payout[]>([]);

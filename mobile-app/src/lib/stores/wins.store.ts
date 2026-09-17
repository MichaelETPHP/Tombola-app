import { writable } from 'svelte/store';

export interface Payout {
  id: string;
  raffleId: string;
  status: 'pending_claim' | 'id_submitted' | 'verified' | 'rejected' | 'fulfilled' | 'expired';
  claimDeadline: string;
  createdAt: string;
  raffleTitle: string;
  prizeName: string | null;
  prizeTier: number | null;
  grossPrizeValue: number;
  netValue: number;
  idDocumentUrl: string | null;
  deliveryMethod: string | null;
  deliveryAddress: string | null;
}

// Session-lifetime cache — same reasoning as tickets.store.ts.
export const payouts = writable<Payout[]>([]);

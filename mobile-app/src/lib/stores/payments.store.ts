import { writable } from 'svelte/store';

export interface PaymentHistoryItem {
  id: string;
  raffleId: string;
  raffleTitle: string;
  amount: number | string;
  ticketCount: number;
  ticketNumbers: number[];
  ticketCodes: string[];
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  gateway: string;
  chapaReference: string | null;
  paymentMethod: string | null;
  createdAt: string;
}

// Session-lifetime cache — same reasoning as tickets.store.ts.
export const payments = writable<PaymentHistoryItem[]>([]);

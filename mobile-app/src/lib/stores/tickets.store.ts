import { writable } from 'svelte/store';

export interface Ticket {
  id: string;
  raffleId: string;
  ticketNumber: number;
  ticketCode?: string;
  createdAt: string;
  raffleTitle?: string;
  /** The raffle's own deadline — the closest real concept to a ticket "expiring". */
  expiresAt?: string;
  amount?: number;
}

// Session-lifetime cache so switching away from the Tickets tab and back
// repaints the last-known list instantly instead of a skeleton every time,
// while the page still revalidates in the background on each visit.
export const tickets = writable<Ticket[]>([]);

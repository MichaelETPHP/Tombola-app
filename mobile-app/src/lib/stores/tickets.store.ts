import { writable } from 'svelte/store';

export interface Ticket {
  id: string;
  raffleId: string;
  ticketNumber: number;
  ticketCode?: string;
  createdAt: string;
}

// Session-lifetime cache so switching away from the Tickets tab and back
// repaints the last-known list instantly instead of a skeleton every time,
// while the page still revalidates in the background on each visit.
export const tickets = writable<Ticket[]>([]);

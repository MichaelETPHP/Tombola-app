import { writable } from 'svelte/store';

export interface RafflePrize {
  id: string;
  tier: number;
  name: string;
  value: number;
  imageUrl: string | null;
}

export interface Raffle {
  id: string;
  title: string;
  description: string | null;
  prizeName: string;
  prizeValue: number;
  prizeImageUrl: string | null;
  /** Full ranked prize breakdown when this raffle awards more than one
   *  prize — tier 1 always mirrors prizeName/prizeValue/prizeImageUrl
   *  above. Absent or single-entry means an ordinary one-prize raffle. */
  prizes?: RafflePrize[];
  ticketPrice: number;
  ticketCap: number;
  ticketsSold: number;
  maxTicketsPerUser: number;
  status: 'draft' | 'open' | 'locked' | 'awaiting_trigger' | 'drawing' | 'completed' | 'cancelled';
  currentDeadline: string;
  createdAt: string;
}

export const raffles = writable<Raffle[]>([]);
export const currentRaffle = writable<Raffle | null>(null);
export const isLoadingRaffles = writable(false);

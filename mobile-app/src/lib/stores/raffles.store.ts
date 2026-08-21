import { writable } from 'svelte/store';

export interface Raffle {
  id: string;
  title: string;
  description: string | null;
  prizeName: string;
  prizeValue: number;
  prizeImageUrl: string | null;
  ticketPrice: number;
  ticketCap: number;
  ticketsSold: number;
  maxTicketsPerUser: number;
  status: 'open' | 'locked' | 'drawing' | 'completed' | 'cancelled';
  currentDeadline: string;
  createdAt: string;
}

export const raffles = writable<Raffle[]>([]);
export const currentRaffle = writable<Raffle | null>(null);
export const isLoadingRaffles = writable(false);

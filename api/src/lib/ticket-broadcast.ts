import type { WSContext } from 'hono/ws';

/**
 * In-process pub/sub for the admin ticket-grid's live updates — every
 * connected admin socket for a raffle gets an immediate push the instant
 * a ticket sells, no polling. Deliberately in-memory (a Map, not a table
 * or a queue): this only ever needs to reach browser tabs open *right
 * now*, on *this* API instance — there's nothing to persist or replay,
 * and a dropped connection just reconnects and gets a fresh full grid.
 */
const subscribersByRaffle = new Map<string, Set<WSContext>>();

export function subscribeToRaffleTickets(raffleId: string, ws: WSContext): void {
  let sockets = subscribersByRaffle.get(raffleId);
  if (!sockets) {
    sockets = new Set();
    subscribersByRaffle.set(raffleId, sockets);
  }
  sockets.add(ws);
}

export function unsubscribeFromRaffleTickets(raffleId: string, ws: WSContext): void {
  const sockets = subscribersByRaffle.get(raffleId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) subscribersByRaffle.delete(raffleId);
}

export interface SoldTicketUpdate {
  number: number;
  displayNumber: string;
}

/** Best-effort — a dead/slow socket here must never affect ticket issuance. */
export function broadcastTicketsSold(raffleId: string, tickets: SoldTicketUpdate[]): void {
  const sockets = subscribersByRaffle.get(raffleId);
  if (!sockets || sockets.size === 0 || tickets.length === 0) return;
  const payload = JSON.stringify({ type: 'tickets_sold', tickets });
  for (const ws of sockets) {
    try {
      ws.send(payload);
    } catch {
      // Dropped/closing sockets clean themselves up via onClose.
    }
  }
}

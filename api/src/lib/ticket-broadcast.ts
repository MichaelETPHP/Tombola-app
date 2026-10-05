import type { WSContext } from 'hono/ws';
import { findAdminById } from '../db/queries/admin.queries.js';
import { isCurrentAdminSession } from './admin-session.js';
import type { TicketSession } from './websocket-ticket.js';

/**
 * In-process pub/sub for the admin ticket-grid's live updates — every
 * connected admin socket for a raffle gets an immediate push the instant
 * a ticket sells, no polling. Deliberately in-memory (a Map, not a table
 * or a queue): this only ever needs to reach browser tabs open *right
 * now*, on *this* API instance — there's nothing to persist or replay,
 * and a dropped connection just reconnects and gets a fresh full grid.
 */
const subscribersByRaffle = new Map<string, Set<WSContext>>();
const sessions = new Map<WSContext, { session: TicketSession; interval: ReturnType<typeof setInterval>; expiry: ReturnType<typeof setTimeout> }>();

async function validateSubscriber(raffleId: string, ws: WSContext): Promise<boolean> {
  const entry = sessions.get(ws);
  if (!entry) return false;
  try {
    if (entry.session.expiresAt > Date.now() && isCurrentAdminSession(entry.session, await findAdminById(entry.session.sub))
      && sessions.get(ws) === entry && entry.session.expiresAt > Date.now()) return true;
  } catch { /* Fail closed when session state cannot be verified. */ }
  unsubscribeFromRaffleTickets(raffleId, ws);
  try { ws.close(1008, 'Session expired or revoked'); } catch { /* Already closed. */ }
  return false;
}

export function subscribeToRaffleTickets(raffleId: string, ws: WSContext, session: TicketSession): void {
  let sockets = subscribersByRaffle.get(raffleId);
  if (!sockets) {
    sockets = new Set();
    subscribersByRaffle.set(raffleId, sockets);
  }
  sockets.add(ws);
  const interval = setInterval(() => { void validateSubscriber(raffleId, ws); }, 15_000);
  const expiry = setTimeout(() => {
    unsubscribeFromRaffleTickets(raffleId, ws);
    try { ws.close(1008, 'Session expired'); } catch { /* Already closed. */ }
  }, Math.max(0, session.expiresAt - Date.now()));
  sessions.set(ws, { session, interval, expiry });
}

export function unsubscribeFromRaffleTickets(raffleId: string, ws: WSContext): void {
  const entry = sessions.get(ws);
  if (entry) { clearInterval(entry.interval); clearTimeout(entry.expiry); sessions.delete(ws); }
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
export async function broadcastTicketsSold(raffleId: string, tickets: SoldTicketUpdate[]): Promise<void> {
  const sockets = subscribersByRaffle.get(raffleId);
  if (!sockets || sockets.size === 0 || tickets.length === 0) return;
  const payload = JSON.stringify({ type: 'tickets_sold', tickets });
  await Promise.all([...sockets].map(async (ws) => {
    if (!(await validateSubscriber(raffleId, ws))) return;
    try {
      ws.send(payload);
    } catch {
      // Dropped/closing sockets clean themselves up via onClose.
    }
  }));
}

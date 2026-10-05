import { randomBytes } from 'node:crypto';
import type { AccessTokenPayload } from './jwt.js';

export interface TicketSession {
  sub: string;
  role: 'owner' | 'moderator';
  sessionVersion: number;
  expiresAt: number;
}
interface TicketEntry { session: TicketSession; raffleId: string; origin: string; deadline: number }
const tickets = new Map<string, TicketEntry>();

export function issueWebSocketTicket(payload: AccessTokenPayload, raffleId: string, origin: string): string {
  const now = Date.now();
  for (const [key, value] of tickets) if (value.deadline <= now) tickets.delete(key);
  if (tickets.size >= 1000) throw new Error('WebSocket ticket capacity exceeded');
  if (!['owner', 'moderator'].includes(payload.role) || !Number.isSafeInteger(payload.sessionVersion)
    || payload.sessionVersion! < 0 || !Number.isSafeInteger(payload.exp) || payload.exp! * 1000 <= now) {
    throw new Error('Invalid WebSocket session');
  }
  const ticket = randomBytes(32).toString('base64url');
  tickets.set(ticket, {
    session: { sub: payload.sub, role: payload.role as TicketSession['role'], sessionVersion: payload.sessionVersion!, expiresAt: payload.exp! * 1000 },
    raffleId, origin, deadline: Math.min(now + 30_000, payload.exp! * 1000),
  });
  return ticket;
}

export function consumeWebSocketTicket(ticket: string, raffleId: string, origin: string): TicketSession | null {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.deadline <= Date.now() || entry.raffleId !== raffleId || entry.origin !== origin) return null;
  return entry.session;
}

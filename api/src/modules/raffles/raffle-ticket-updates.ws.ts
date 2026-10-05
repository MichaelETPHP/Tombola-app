import { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import { upgradeWebSocket } from 'hono/bun';
import { z } from 'zod';
import { verifyAccessToken } from '../../lib/jwt.js';
import { findAdminById } from '../../db/queries/admin.queries.js';
import { isCurrentAdminSession } from '../../lib/admin-session.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { trustedOrigin } from '../../middleware/trusted-origin.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { issueWebSocketTicket, consumeWebSocketTicket, type TicketSession } from '../../lib/websocket-ticket.js';
import { subscribeToRaffleTickets, unsubscribeFromRaffleTickets } from '../../lib/ticket-broadcast.js';
import type { AppEnv } from '../../types/hono.js';

export const raffleTicketUpdatesRoutes = new Hono<AppEnv & { Variables: { ticketSession: TicketSession } }>();

raffleTicketUpdatesRoutes.post('/:id/ticket-updates/ticket', trustedOrigin, authMiddleware,
  requireRole('owner', 'moderator'), rateLimit({ max: 30, windowSeconds: 60 }), async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const payload = await verifyAccessToken(c.req.header('Authorization')!.slice(7));
    c.header('Cache-Control', 'no-store, private');
    return c.json({ ticket: issueWebSocketTicket(payload, id, c.req.header('Origin')!) });
  });

/**
 * GET /admin/raffles/:id/ticket-updates
 * Live "a ticket just sold" push for the admin ticket grid — see
 * lib/ticket-broadcast.ts for the actual fan-out.
 *
 * A short-lived, one-use ticket travels in Sec-WebSocket-Protocol instead
 * of exposing an administrator's access token in the URL.
 */
raffleTicketUpdatesRoutes.get(
  '/:id/ticket-updates',
  trustedOrigin,
  async (c, next) => {
    const id = z.string().uuid().parse(c.req.param('id'));
    const protocol = c.req.header('Sec-WebSocket-Protocol') ?? '';
    const ticket = protocol.split(',').map((part) => part.trim())
      .find((part) => /^ticket\.[A-Za-z0-9_-]{43}$/.test(part))?.slice(7);
    const session = ticket ? consumeWebSocketTicket(ticket, id, c.req.header('Origin')!) : null;
    if (!session || !isCurrentAdminSession(session, await findAdminById(session.sub))) {
      return c.json({ error: 'Invalid or revoked WebSocket ticket' }, 401);
    }
    c.set('ticketSession', session);
    await next();
  },
  upgradeWebSocket((c) => {
    // Always present — the auth middleware above already ran against this
    // same ':id' route param before Hono would ever reach this handler.
    const raffleId = c.req.param('id') as string;
    const session = c.get('ticketSession');
    let subscriber: WSContext | undefined;
    return {
      onOpen(_event, ws) {
        subscriber = ws;
        subscribeToRaffleTickets(raffleId, ws, session);
      },
      onClose(_event) {
        if (subscriber) unsubscribeFromRaffleTickets(raffleId, subscriber);
      },
      onError(_event) {
        if (subscriber) unsubscribeFromRaffleTickets(raffleId, subscriber);
      },
    };
  })
);

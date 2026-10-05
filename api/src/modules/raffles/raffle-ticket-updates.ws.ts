import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { verifyAccessToken } from '../../lib/jwt.js';
import { findAdminById } from '../../db/queries/admin.queries.js';
import { isCurrentAdminSession } from '../../lib/admin-session.js';
import { subscribeToRaffleTickets, unsubscribeFromRaffleTickets } from '../../lib/ticket-broadcast.js';
import type { AppEnv } from '../../types/hono.js';

export const raffleTicketUpdatesRoutes = new Hono<AppEnv>();

/**
 * GET /admin/raffles/:id/ticket-updates
 * Live "a ticket just sold" push for the admin ticket grid — see
 * lib/ticket-broadcast.ts for the actual fan-out.
 *
 * Browsers' native WebSocket API can't set an Authorization header on the
 * handshake request, so this can't reuse the shared header-based
 * authMiddleware every other admin route uses. The access token instead
 * arrives as a query param and is verified with the exact same
 * admin-session checks authMiddleware itself applies — scoped to just
 * this one route, not a change to how anything else authenticates.
 */
raffleTicketUpdatesRoutes.get(
  '/:id/ticket-updates',
  async (c, next) => {
    const token = c.req.query('token');
    if (!token) return c.json({ error: 'Missing token' }, 401);

    let payload;
    try {
      payload = await verifyAccessToken(token);
    } catch {
      return c.json({ error: 'Invalid token' }, 401);
    }
    if (payload.role !== 'owner' && payload.role !== 'moderator') {
      return c.json({ error: 'Admin access required' }, 403);
    }
    const admin = await findAdminById(payload.sub);
    if (!isCurrentAdminSession(payload, admin)) {
      return c.json({ error: 'Session revoked' }, 401);
    }
    await next();
  },
  upgradeWebSocket((c) => {
    // Always present — the auth middleware above already ran against this
    // same ':id' route param before Hono would ever reach this handler.
    const raffleId = c.req.param('id') as string;
    return {
      onOpen(_event, ws) {
        subscribeToRaffleTickets(raffleId, ws);
      },
      onClose(_event, ws) {
        unsubscribeFromRaffleTickets(raffleId, ws);
      },
    };
  })
);

import { Hono } from 'hono';
import { postRoomMessageSchema, postAdminRoomMessageSchema, listRoomMessagesSchema } from './rooms.schema.js';
import {
  listUserRooms,
  listRoomMessages,
  postRoomMessage,
  listRoomMessagesAsAdmin,
  postRoomMessageAsAdmin,
} from './rooms.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import type { AppEnv } from '../../types/hono.js';

// Mounted at /raffles in index.ts, alongside ticketsRoutes — a room is
// just the chat attached to a specific raffle, not a standalone resource.
export const roomsRoutes = new Hono<AppEnv>();
roomsRoutes.use('*', authMiddleware);

/**
 * GET /raffles/:id/room/messages
 * Polled periodically while a room is open. ?after=<messageId> returns
 * only messages newer than that one — the client's own last-seen id, not
 * a timestamp, so there's no clock-skew ambiguity.
 */
roomsRoutes.get('/:id/room/messages', async (c) => {
  const raffleId = c.req.param('id');
  const user = c.get('user');
  const { after } = listRoomMessagesSchema.parse(c.req.query());
  const messages = await listRoomMessages(raffleId, user.id, after);
  return c.json({ messages });
});

/**
 * POST /raffles/:id/room/messages
 * Text/emoji only (validated in the schema) — links are rejected outright
 * rather than stripped, so the sender knows immediately why it didn't post.
 */
roomsRoutes.post('/:id/room/messages', rateLimit({ max: 30, windowSeconds: 60 }), async (c) => {
  const raffleId = c.req.param('id');
  const user = c.get('user');
  const { content } = postRoomMessageSchema.parse(await c.req.json());
  const message = await postRoomMessage(raffleId, user.id, content);
  return c.json({ message }, 201);
});

// Mounted at /rooms in index.ts — "which rooms am I in", not scoped to
// one raffle, so it can't live on roomsRoutes above.
export const myRoomsRoutes = new Hono<AppEnv>();
myRoomsRoutes.use('*', authMiddleware);

/**
 * GET /rooms
 * Every raffle the current user holds a ticket for, newest activity
 * first — membership is implicit (see hasTicketForRaffle), nothing to
 * "join".
 */
myRoomsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const rooms = await listUserRooms(user.id);
  return c.json({ rooms });
});

// Mounted at /admin/raffles in index.ts, alongside adminRafflesRoutes.
export const adminRoomsRoutes = new Hono<AppEnv>();
adminRoomsRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));

/**
 * GET /admin/raffles/:id/room/messages
 * Three modes via query params, no membership check (any admin can view
 * any raffle's room): ?after=<id> polls for new messages same as the
 * user-facing read; ?before=<id> pages backward through full history —
 * this is the one users can't do, capped at 200 recent messages instead;
 * neither param loads the most recent page.
 */
adminRoomsRoutes.get('/:id/room/messages', async (c) => {
  const raffleId = c.req.param('id');
  const { after, before } = listRoomMessagesSchema.parse(c.req.query());
  const result = await listRoomMessagesAsAdmin(raffleId, { after, before });
  return c.json(result);
});

/**
 * POST /admin/raffles/:id/room/messages
 * Admin posts are exempt from the link-block and the read-only-after-
 * completion rule (e.g. posting the Telegram group link, or a winner
 * announcement after the draw).
 */
adminRoomsRoutes.post('/:id/room/messages', async (c) => {
  const raffleId = c.req.param('id');
  const admin = c.get('admin');
  const { content } = postAdminRoomMessageSchema.parse(await c.req.json());
  const message = await postRoomMessageAsAdmin(raffleId, admin.id, content);
  return c.json({ message }, 201);
});

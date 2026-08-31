import {
  hasTicketForRaffle,
  listUserRooms as dbListUserRooms,
  listRoomMessages as dbListRoomMessages,
  createRoomMessage,
  type DbRoomMessage,
} from '../../db/queries/roomMessages.queries.js';
import { findRaffleById } from '../../db/queries/raffles.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { createHash } from 'node:crypto';

/**
 * `+251911000001` -> `+25191****001`. Keeps the room feeling like a real
 * group chat (a name and a recognizable-but-not-full number, the way
 * Telegram groups show contacts) without ever sending another buyer's
 * complete phone number to every other buyer's device.
 */
function maskPhone(phone: string): string {
  const match = /^(\+251)(\d{2})(\d{4})(\d{3})$/.exec(phone);
  if (!match) return phone;
  const [, prefix, first, , last] = match;
  return `${prefix}${first}****${last}`;
}

/**
 * A stable per-user avatar seed that isn't the raw account id — the same
 * user always hashes to the same value (so their avatar stays consistent
 * across messages), but another room member's client never actually
 * receives a real, queryable database id.
 */
function avatarSeed(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 24);
}

function toApiMessage(message: DbRoomMessage) {
  const isUser = message.senderType === 'user';
  return {
    id: message.id,
    senderType: message.senderType,
    // The account id itself is still never exposed — only a name, a
    // masked phone, and enough to render an avatar consistently across
    // that sender's messages (see senderAvatarSeed below).
    isMine: false as boolean,
    content: message.content,
    createdAt: message.createdAt,
    senderName: isUser ? message.senderFullName || 'Ticket holder' : null,
    senderPhoneMasked: isUser && message.senderPhoneNumber ? maskPhone(message.senderPhoneNumber) : null,
    senderTelegramPhotoUrl: isUser ? message.senderTelegramPhotoUrl : null,
    // A stable per-sender seed for the client's deterministic avatar
    // generator (same util the Profile/Header avatars use) — derived from
    // the message row itself rather than the raw user id.
    senderAvatarSeed: isUser && message.senderUserId ? avatarSeed(message.senderUserId) : null,
  };
}

async function requireMembership(raffleId: string, userId: string) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'raffle.notFound');
  const isMember = await hasTicketForRaffle(raffleId, userId);
  if (!isMember) throw new AppError(403, 'room.notAMember');
  return raffle;
}

export async function listUserRooms(userId: string) {
  return dbListUserRooms(userId);
}

export async function listRoomMessages(raffleId: string, userId: string, afterId?: string) {
  await requireMembership(raffleId, userId);
  const messages = await dbListRoomMessages(raffleId, { after: afterId });
  return messages.map((m) => ({ ...toApiMessage(m), isMine: m.senderUserId === userId }));
}

export async function postRoomMessage(raffleId: string, userId: string, content: string) {
  const raffle = await requireMembership(raffleId, userId);
  if (raffle.status === 'completed' || raffle.status === 'cancelled') {
    throw new AppError(409, 'room.readOnly');
  }
  const message = await createRoomMessage({ raffleId, content, senderUserId: userId });
  return { ...toApiMessage(message), isMine: true };
}

// ── Admin (no membership/read-only restriction — see rooms.routes.ts) ──

const ADMIN_HISTORY_PAGE_SIZE = 50;

export async function listRoomMessagesAsAdmin(
  raffleId: string,
  opts: { after?: string; before?: string } = {}
) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'raffle.notFound');
  const messages = await dbListRoomMessages(raffleId, { ...opts, limit: ADMIN_HISTORY_PAGE_SIZE });
  return {
    messages: messages.map(toApiMessage),
    // A full page came back, so there's probably more before it — an
    // exact count isn't worth a second query just to answer a boolean.
    hasMore: !opts.after && messages.length === ADMIN_HISTORY_PAGE_SIZE,
  };
}

export async function postRoomMessageAsAdmin(raffleId: string, adminId: string, content: string) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'raffle.notFound');
  const message = await createRoomMessage({ raffleId, content, senderAdminId: adminId });
  return toApiMessage(message);
}

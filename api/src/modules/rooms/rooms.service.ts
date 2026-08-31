import {
  hasTicketForRaffle,
  listUserRooms as dbListUserRooms,
  listRoomMessages as dbListRoomMessages,
  createRoomMessage,
  type DbRoomMessage,
} from '../../db/queries/roomMessages.queries.js';
import { findRaffleById } from '../../db/queries/raffles.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

function toApiMessage(message: DbRoomMessage) {
  return {
    id: message.id,
    senderType: message.senderType,
    // Which user posted it is not exposed — the room only needs to show
    // "you" vs "someone else" vs "admin", never cross-reveal other
    // buyers' account ids to each other.
    isMine: false as boolean,
    content: message.content,
    createdAt: message.createdAt,
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

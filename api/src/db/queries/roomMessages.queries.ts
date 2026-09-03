import { sql } from '../client.js';

export interface DbRoomMessage {
  id: string;
  raffleId: string;
  senderType: 'user' | 'admin';
  senderUserId: string | null;
  senderAdminId: string | null;
  content: string;
  createdAt: Date;
  /** Only populated for senderType 'user' — joined in for the group-chat
   *  identity strip (name/phone/avatar). Admin messages stay unattributed
   *  to an individual admin, same as before — they post as "YeneEta". */
  senderFullName: string | null;
  senderPhoneNumber: string | null;
  senderTelegramPhotoUrl: string | null;
}

const SENDER_JOIN = sql`
  LEFT JOIN users su ON su.id = room_messages.sender_user_id
`;
const SENDER_COLUMNS = sql`
  room_messages.*,
  su.full_name AS "senderFullName",
  su.phone_number AS "senderPhoneNumber",
  su.telegram_photo_url AS "senderTelegramPhotoUrl"
`;

/** True if this user holds at least one ticket for this raffle — the whole membership model. */
export async function hasTicketForRaffle(raffleId: string, userId: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM tickets WHERE raffle_id = ${raffleId} AND user_id = ${userId}) AS exists
  `;
  return rows[0].exists;
}

/**
 * Raffles a user has room access to, newest activity first — ticket
 * purchase alone qualifies even before anyone's said anything.
 */
export async function listUserRooms(userId: string): Promise<
  { raffleId: string; title: string; status: string; lastMessageAt: Date | null; lastMessagePreview: string | null }[]
> {
  return sql`
    SELECT
      r.id AS "raffleId",
      r.title,
      r.status,
      m.created_at AS "lastMessageAt",
      m.content AS "lastMessagePreview"
    FROM raffles r
    INNER JOIN (SELECT DISTINCT raffle_id FROM tickets WHERE user_id = ${userId}) t ON t.raffle_id = r.id
    LEFT JOIN LATERAL (
      SELECT content, created_at FROM room_messages
      WHERE room_messages.raffle_id = r.id
      ORDER BY created_at DESC LIMIT 1
    ) m ON true
    ORDER BY COALESCE(m.created_at, r.created_at) DESC
  `;
}

/**
 * Three distinct access patterns, one function:
 *  - `after`  — polling: everything newer than a message the caller already
 *    has. Naturally small, returned oldest-first (the order new messages
 *    get appended to the end of a chat log).
 *  - `before` — loading older history (admin scroll-up): the page of
 *    messages immediately preceding one already on screen. Queried
 *    newest-first (so LIMIT keeps the messages *closest* to that point,
 *    not the oldest ones in the whole room), then reversed for display.
 *  - neither  — initial load: the most recent page in the room. Same
 *    newest-first-then-reverse trick — without it, a long-running room's
 *    first load would show message #1 onward and never reach anything
 *    recent, and polling from that point would never catch up to "now".
 */
export async function listRoomMessages(
  raffleId: string,
  opts: { after?: string; before?: string; limit?: number } = {}
): Promise<DbRoomMessage[]> {
  const limit = opts.limit ?? 50;

  if (opts.after) {
    return sql<DbRoomMessage[]>`
      SELECT ${SENDER_COLUMNS} FROM room_messages
      ${SENDER_JOIN}
      WHERE room_messages.raffle_id = ${raffleId}
        AND room_messages.created_at > (SELECT created_at FROM room_messages WHERE id = ${opts.after})
      ORDER BY room_messages.created_at ASC
      LIMIT 200
    `;
  }

  if (opts.before) {
    const rows = await sql<DbRoomMessage[]>`
      SELECT ${SENDER_COLUMNS} FROM room_messages
      ${SENDER_JOIN}
      WHERE room_messages.raffle_id = ${raffleId}
        AND room_messages.created_at < (SELECT created_at FROM room_messages WHERE id = ${opts.before})
      ORDER BY room_messages.created_at DESC
      LIMIT ${limit}
    `;
    return rows.reverse();
  }

  const rows = await sql<DbRoomMessage[]>`
    SELECT ${SENDER_COLUMNS} FROM room_messages
    ${SENDER_JOIN}
    WHERE room_messages.raffle_id = ${raffleId}
    ORDER BY room_messages.created_at DESC
    LIMIT ${limit}
  `;
  return rows.reverse();
}

export async function createRoomMessage(data: {
  raffleId: string;
  content: string;
  senderUserId?: string;
  senderAdminId?: string;
}): Promise<DbRoomMessage> {
  const senderType = data.senderAdminId ? 'admin' : 'user';
  const rows = await sql<DbRoomMessage[]>`
    INSERT INTO room_messages (raffle_id, sender_type, sender_user_id, sender_admin_id, content)
    VALUES (${data.raffleId}, ${senderType}, ${data.senderUserId ?? null}, ${data.senderAdminId ?? null}, ${data.content})
    RETURNING *
  `;
  return rows[0];
}

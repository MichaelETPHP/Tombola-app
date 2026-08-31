import { z } from 'zod';

// Deliberately imperfect — catching real URLs and Telegram-style links
// covers the actual spam vector without trying to solve URL-detection in
// general. A determined user can still work around this (e.g. spacing
// out characters); this is a light deterrent, not a security boundary.
const LINK_PATTERN = /https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]+\.(com|org|net|io|me|app|co|ly|gg|tg)\b/i;

export const postRoomMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !LINK_PATTERN.test(value), 'Links aren’t allowed here — only text and emoji.'),
});

export const postAdminRoomMessageSchema = z.object({
  content: z.string().trim().min(1).max(500),
});

export const listRoomMessagesSchema = z
  .object({
    after: z.string().uuid().optional(),
    before: z.string().uuid().optional(),
  })
  .refine((data) => !(data.after && data.before), 'Pass either after or before, not both');

export type PostRoomMessageInput = z.infer<typeof postRoomMessageSchema>;
export type PostAdminRoomMessageInput = z.infer<typeof postAdminRoomMessageSchema>;

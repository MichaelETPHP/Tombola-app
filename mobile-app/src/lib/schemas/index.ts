import { z } from 'zod';

// ── Auth Schemas ─────────────────────────────────────────

export const requestOtpSchema = z.object({
  phone: z.string().min(9).max(15),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(9).max(15),
  code: z.string().length(6).regex(/^[0-9]{6}$/),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    phone: z.string(),
    fullName: z.string().nullable(),
    isNewUser: z.boolean(),
    preferredLanguage: z.enum(['en', 'am']).optional(),
    telegramLinked: z.boolean().optional(),
    telegramUsername: z.string().nullable().optional(),
    telegramPhotoUrl: z.string().nullable().optional(),
  }),
});

// ── Raffle Schemas ───────────────────────────────────────

export const rafflePrizeSchema = z.object({
  id: z.string(),
  tier: z.number(),
  name: z.string(),
  value: z.number(),
  imageUrl: z.string().nullable(),
});

export const raffleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  prizeName: z.string(),
  prizeValue: z.number(),
  prizeImageUrl: z.string().nullable(),
  prizes: z.array(rafflePrizeSchema).optional(),
  ticketPrice: z.number(),
  ticketCap: z.number(),
  ticketsSold: z.number(),
  maxTicketsPerUser: z.number(),
  status: z.enum(['draft', 'open', 'locked', 'awaiting_trigger', 'drawing', 'completed', 'cancelled']),
  currentDeadline: z.string(),
  createdAt: z.string(),
});

export const raffleListResponseSchema = z.object({
  raffles: z.array(raffleSchema),
});

// ── Room Schemas ─────────────────────────────────────────
// A room is just the chat attached to a raffle — membership is implicit
// (holding a ticket), not a separate thing to fetch/join.

export const roomMessageSchema = z.object({
  id: z.string(),
  senderType: z.enum(['user', 'admin']),
  isMine: z.boolean(),
  content: z.string(),
  createdAt: z.string(),
  senderName: z.string().nullable(),
  senderPhoneMasked: z.string().nullable(),
  senderTelegramPhotoUrl: z.string().nullable(),
  senderAvatarSeed: z.string().nullable(),
});

export const roomSummarySchema = z.object({
  raffleId: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'open', 'locked', 'awaiting_trigger', 'drawing', 'completed', 'cancelled']),
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
});

// ── Ticket Schemas ───────────────────────────────────────

export const purchaseTicketsSchema = z.object({
  quantity: z.number().int().min(1).max(5),
  paymentGateway: z.enum(['chapa', 'telebirr']).default('chapa'),
});

// ── Inferred Types ───────────────────────────────────────

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Raffle = z.infer<typeof raffleSchema>;
export type RafflePrize = z.infer<typeof rafflePrizeSchema>;
export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>;
export type RoomMessage = z.infer<typeof roomMessageSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;

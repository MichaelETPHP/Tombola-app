import { z } from 'zod';

// ── Auth Schemas ─────────────────────────────────────────
// NOTE: POST /admin/auth/login does not exist on the API yet — there is no
// admins table in the schema to authenticate against. This form and schema
// are ready for it; wire it up once docs/schema.sql defines admin accounts.

export const adminLoginSchema = z.object({
  phone: z.string().trim().transform((value) => {
    if (value.startsWith('+251')) return value;
    if (value.startsWith('0')) return `+251${value.slice(1)}`;
    if (value.startsWith('9')) return `+251${value}`;
    return value;
  }).pipe(z.string().regex(/^\+251[0-9]{9}$/, 'Enter a valid Ethiopian phone number')),
  password: z.string().min(8),
});

export const adminSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: z.enum(['owner', 'moderator']),
});

export const adminAuthResponseSchema = z.object({
  accessToken: z.string(),
  admin: adminSchema,
});

// ── Raffle Schemas ───────────────────────────────────────
// Mirrors api/src/modules/raffles/raffles.schema.ts::createRaffleSchema exactly.

export const createRaffleSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  prizeName: z.string().min(2).max(200),
  prizeValue: z.number().positive(),
  ticketPrice: z.number().positive(),
  ticketCap: z.number().int().positive().min(10),
  maxTicketsPerUser: z.number().int().min(1).max(5),
  deadlineDays: z.number().int().positive().min(1).max(90),
});

export const raffleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  prizeName: z.string(),
  prizeValue: z.number(),
  prizeImageUrl: z.string().nullable(),
  ticketPrice: z.number(),
  ticketCap: z.number(),
  ticketsSold: z.number(),
  maxTicketsPerUser: z.number(),
  status: z.enum(['draft', 'open', 'locked', 'awaiting_trigger', 'drawing', 'completed', 'cancelled']),
  currentDeadline: z.string(),
  opensAt: z.string().optional(),
  deadlineDays: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

// ── Payout Schemas ───────────────────────────────────────
// Mirrors api/src/modules/payouts/payouts.schema.ts. There's no column to
// record which admin acted or free-text notes, so that capability doesn't
// exist here — see docs/README.md for the schema mismatch notes.

export const updatePayoutStatusSchema = z.object({
  status: z.enum(['verified', 'fulfilled', 'rejected']),
});

export const payoutSchema = z.object({
  id: z.string(),
  raffleId: z.string(),
  drawResultId: z.string(),
  winnerUserId: z.string(),
  status: z.enum(['pending_claim', 'id_submitted', 'verified', 'rejected', 'fulfilled', 'expired']),
  grossPrizeValue: z.number(),
  taxWithheld: z.number(),
  netValue: z.number(),
  idDocumentUrl: z.string().nullable(),
  deliveryMethod: z.enum(['pickup', 'delivery']).nullable(),
  deliveryAddress: z.string().nullable(),
  fulfillmentStatus: z.enum(['processing', 'shipped', 'delivered', 'failed']),
  claimDeadline: z.string(),
  claimedAt: z.string().nullable(),
  fulfilledAt: z.string().nullable(),
  createdAt: z.string(),
});

// ── User Schemas ─────────────────────────────────────────

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
});

// ── Inferred Types ───────────────────────────────────────

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type Admin = z.infer<typeof adminSchema>;
export type AdminAuthResponse = z.infer<typeof adminAuthResponseSchema>;
export type CreateRaffleInput = z.infer<typeof createRaffleSchema>;
export type Raffle = z.infer<typeof raffleSchema>;
export type UpdatePayoutStatusInput = z.infer<typeof updatePayoutStatusSchema>;
export type Payout = z.infer<typeof payoutSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

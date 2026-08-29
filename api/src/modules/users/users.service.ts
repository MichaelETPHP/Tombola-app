import { findUserById, updateUser } from '../../db/queries/users.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { UpdateProfileInput } from './users.schema.js';

/**
 * Shape the API exposes for a user profile — keeps `phone` stable for
 * clients even though the DB column is `phone_number`.
 */
function toProfile(user: { id: string; phoneNumber: string; fullName: string | null; preferredLanguage?: 'en' | 'am'; phoneVerifiedAt?: Date | null; status?: string; createdAt?: Date; telegramUserId?: string | null; telegramUsername?: string | null; telegramPhotoUrl?: string | null }, fallbackLanguage: 'en' | 'am' = 'en') {
  return {
    id: user.id,
    phone: user.phoneNumber,
    fullName: user.fullName,
    preferredLanguage: user.preferredLanguage ?? fallbackLanguage,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    status: user.status,
    memberSince: user.createdAt,
    telegramLinked: Boolean(user.telegramUserId),
    telegramUsername: user.telegramUsername ?? null,
    telegramPhotoUrl: user.telegramPhotoUrl ?? null,
  };
}

/**
 * Get user profile by ID.
 */
export async function getUserProfile(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(404, 'user.notFound');
  }
  return toProfile(user);
}

/**
 * Update user profile.
 */
export async function updateUserProfile(userId: string, data: UpdateProfileInput) {
  const user = await updateUser(userId, data);
  if (!user) {
    throw new AppError(404, 'user.notFound');
  }
  return toProfile(user, data.preferredLanguage);
}

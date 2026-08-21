import { findUserById, updateUser } from '../../db/queries/users.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { UpdateProfileInput } from './users.schema.js';

/**
 * Get user profile by ID.
 */
export async function getUserProfile(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}

/**
 * Update user profile.
 */
export async function updateUserProfile(userId: string, data: UpdateProfileInput) {
  const user = await updateUser(userId, { fullName: data.fullName });
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}

import { Hono } from 'hono';
import { updateProfileSchema } from './users.schema.js';
import { getUserProfile, updateUserProfile } from './users.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const usersRoutes = new Hono<AppEnv>();

// All user routes require authentication
usersRoutes.use('*', authMiddleware);

/**
 * GET /users/me
 * Get the authenticated user's profile.
 */
usersRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const profile = await getUserProfile(user.id);
  return c.json({ user: profile });
});

/**
 * PATCH /users/me
 * Update the authenticated user's profile.
 */
usersRoutes.patch('/me', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const data = updateProfileSchema.parse(body);
  const updated = await updateUserProfile(user.id, data);
  return c.json({ user: updated });
});

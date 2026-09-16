import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { sendContactsSmsSchema, deleteContactsSchema } from './contacts.schema.js';
import { listContacts, importContactsFromCsv, deleteContacts, sendSmsToContacts } from './contacts.service.js';
import type { AppEnv } from '../../types/hono.js';

const MAX_CSV_UPLOAD_BYTES = 5 * 1024 * 1024; // a contact list this size is already tens of thousands of rows

export const adminContactsRoutes = new Hono<AppEnv>();

// Imported contacts are not platform users — this whole feature exists
// purely as a bulk-SMS mailing list, same admin-only access level as every
// other bulk-SMS action (see admin.routes.ts's blanket owner+moderator gate).
adminContactsRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));

adminContactsRoutes.get('/', async (c) => {
  return c.json({ contacts: await listContacts() });
});

/**
 * POST /admin/contacts/import
 * Multipart CSV upload — parsed, validated, deduplicated, and merged into
 * the existing contact list. See contacts.service.ts::importContactsFromCsv.
 */
adminContactsRoutes.post(
  '/import',
  bodyLimit({
    maxSize: MAX_CSV_UPLOAD_BYTES,
    onError: (c) => c.json({ error: 'CSV file is too large.' }, 413),
  }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new AppError(400, 'A CSV file is required.');
    const text = await file.text();
    const result = await importContactsFromCsv(text);
    return c.json(result, 201);
  }
);

adminContactsRoutes.delete('/', async (c) => {
  const data = deleteContactsSchema.parse(await c.req.json());
  const result = await deleteContacts(data.phones);
  return c.json(result);
});

adminContactsRoutes.post('/sms', async (c) => {
  const data = sendContactsSmsSchema.parse(await c.req.json());
  const result = await sendSmsToContacts(data.phones, data.message);
  return c.json(result);
});

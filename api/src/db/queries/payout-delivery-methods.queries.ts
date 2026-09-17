import { sql } from '../client.js';

export interface DbDeliveryMethod {
  id: string;
  label: string;
  requiresDetails: boolean;
  detailsLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

/** What a winner sees when submitting a claim. */
export async function listActiveDeliveryMethods(): Promise<DbDeliveryMethod[]> {
  return sql<DbDeliveryMethod[]>`
    SELECT * FROM payout_delivery_methods WHERE is_active ORDER BY sort_order, label
  `;
}

/** What the admin manages — active and deactivated methods both. */
export async function listAllDeliveryMethods(): Promise<DbDeliveryMethod[]> {
  return sql<DbDeliveryMethod[]>`
    SELECT * FROM payout_delivery_methods ORDER BY sort_order, label
  `;
}

export async function findDeliveryMethodById(id: string): Promise<DbDeliveryMethod | null> {
  const rows = await sql<DbDeliveryMethod[]>`SELECT * FROM payout_delivery_methods WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function createDeliveryMethod(data: {
  label: string;
  requiresDetails: boolean;
  detailsLabel: string | null;
  sortOrder: number;
}): Promise<DbDeliveryMethod> {
  const [method] = await sql<DbDeliveryMethod[]>`
    INSERT INTO payout_delivery_methods (label, requires_details, details_label, sort_order)
    VALUES (${data.label}, ${data.requiresDetails}, ${data.detailsLabel}, ${data.sortOrder})
    RETURNING *
  `;
  return method;
}

export async function updateDeliveryMethod(
  id: string,
  data: Partial<{ label: string; requiresDetails: boolean; detailsLabel: string | null; sortOrder: number; isActive: boolean }>
): Promise<DbDeliveryMethod | null> {
  const rows = await sql<DbDeliveryMethod[]>`
    UPDATE payout_delivery_methods SET
      label = COALESCE(${data.label ?? null}, label),
      requires_details = COALESCE(${data.requiresDetails ?? null}, requires_details),
      details_label = CASE WHEN ${'detailsLabel' in data} THEN ${data.detailsLabel ?? null} ELSE details_label END,
      sort_order = COALESCE(${data.sortOrder ?? null}, sort_order),
      is_active = COALESCE(${data.isActive ?? null}, is_active)
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Postgres NUMERIC columns (ticketPrice, prizeValue) serialize as strings
 * over JSON to avoid float precision loss, even though the Raffle type
 * says `number` — format defensively rather than interpolating raw values.
 */
export function formatEtb(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

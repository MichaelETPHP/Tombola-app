const DISPLAY_MODULUS = 100_000; // 5 digits: 00000-99999

/**
 * Derives the two parameters of a modular affine bijection
 * f(i) = (a*i + c) mod 100000 from a raffle's number_seed. With `a`
 * coprime to the modulus, this is a true one-to-one mapping over the
 * *whole* 100,000-value space — sequential internal ticket numbers
 * (1, 2, 3...) land scattered across the full 5-digit range with no two
 * ever colliding. That's what actually makes them read as real lottery
 * picks rather than just a shuffled short list confined to 1..cap.
 */
function deriveParams(seed: number): { a: number; c: number } {
  // `a` must be coprime to 100000 = 2^5 * 5^5 — i.e. odd (never a
  // multiple of 2) and never a multiple of 5. `2k+1` already guarantees
  // odd; nudging off any multiple of 5 by +2 guarantees the rest (a step
  // of 2 can never re-introduce an even number).
  let a = (Math.abs(seed) % 49_989) * 2 + 1;
  while (a % 5 === 0) a += 2;
  // Knuth's multiplicative hash, purely to spread `c` away from `seed`
  // itself — done in BigInt since seed can be up to 2^31 and this
  // multiplier is large enough that the product overflows a safe JS
  // integer otherwise.
  const c = Number((BigInt(Math.abs(seed)) * 2_654_435_761n) % BigInt(DISPLAY_MODULUS));
  return { a, c };
}

/**
 * The number a person actually sees for ticket #`ticketNumber` in a raffle
 * with the given `numberSeed`. A `null` seed (every raffle created before
 * this shipped) falls back to the original plain zero-padded number, so
 * existing raffles/receipts/SMS never change retroactively.
 */
export function ticketDisplayNumber(numberSeed: number | null, ticketNumber: number): string {
  if (numberSeed === null) return String(ticketNumber).padStart(5, '0');
  const { a, c } = deriveParams(numberSeed);
  const index = ticketNumber - 1; // ticket numbers are 1-indexed
  const scrambled = (a * index + c) % DISPLAY_MODULUS;
  return String(scrambled).padStart(5, '0');
}

/** A fresh per-raffle seed — call once at raffle creation, never reused or persisted anywhere else. */
export function generateNumberSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647) + 1; // fits a Postgres INTEGER column
}

/**
 * Provably-fair draw system using a commit-reveal scheme.
 *
 * Flow:
 * 1. At raffle creation: generate a random server seed, hash it (SHA-256),
 *    store the HASH publicly on the raffle record. Keep the raw seed secret.
 * 2. At draw time: the trigger participant clicks a link, which provides
 *    a client seed (click timestamp). Combine server seed + client seed,
 *    hash the combination, and derive the winning ticket index.
 * 3. After the draw: reveal the raw server seed so anyone can verify:
 *    - SHA-256(server_seed) matches the pre-committed hash
 *    - SHA-256(server_seed + client_seed) mod ticket_count = winning index
 */

/**
 * Generate a cryptographically secure random server seed.
 */
export function generateServerSeed(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash a value using SHA-256. Returns hex string.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create the server seed hash for public commitment at raffle creation time.
 * Store this hash on the raffle record — do NOT expose the raw seed yet.
 */
export async function commitServerSeed(serverSeed: string): Promise<string> {
  return sha256(serverSeed);
}

/**
 * Combine server seed and client seed, hash the result, and derive
 * the winning ticket index.
 *
 * @param serverSeed - The secret server seed (revealed after draw)
 * @param clientSeed - The client seed (trigger click timestamp)
 * @param ticketCount - Total number of tickets sold
 * @returns The winning ticket index (0-based) and the combined hash
 */
export async function computeWinner(
  serverSeed: string,
  clientSeed: string,
  ticketCount: number
): Promise<{ winnerIndex: number; combinedHash: string }> {
  if (ticketCount <= 0) {
    throw new Error('ticketCount must be a positive integer');
  }

  const combined = `${serverSeed}:${clientSeed}`;
  const combinedHash = await sha256(combined);

  // Use all 256 bits. The deterministic modulo is transparent and gives
  // each issued ticket one position in the draw pool.
  const winnerIndex = Number(BigInt(`0x${combinedHash}`) % BigInt(ticketCount));

  return { winnerIndex, combinedHash };
}

/**
 * Verify a completed draw's fairness.
 * Anyone with the revealed server seed can call this to confirm:
 * 1. The server seed hashes to the pre-committed hash
 * 2. The winner index is correctly derived
 */
export async function verifyDraw(
  serverSeed: string,
  committedHash: string,
  clientSeed: string,
  ticketCount: number,
  claimedWinnerIndex: number
): Promise<{ valid: boolean; reason?: string }> {
  // Step 1: Verify the server seed matches the committed hash
  const computedHash = await sha256(serverSeed);
  if (computedHash !== committedHash) {
    return {
      valid: false,
      reason: 'Server seed does not match the pre-committed hash',
    };
  }

  // Step 2: Verify the winner index
  const { winnerIndex } = await computeWinner(serverSeed, clientSeed, ticketCount);
  if (winnerIndex !== claimedWinnerIndex) {
    return {
      valid: false,
      reason: `Winner index mismatch: computed ${winnerIndex}, claimed ${claimedWinnerIndex}`,
    };
  }

  return { valid: true };
}

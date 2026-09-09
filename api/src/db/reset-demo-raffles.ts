/** Preview: bun run db:raffles:demo. Replace all raffles: add --apply. */
import { sql, closeDb } from './client.js';
import { createRaffleSchema } from '../modules/raffles/raffles.schema.js';
import { generateServerSeed, commitServerSeed } from '../lib/provably-fair.js';

const samples = [
  {
    title: 'Everyday Essentials — 20 Birr Test Raffle',
    description: 'DEMO / TEST ONLY. Explore the complete raffle experience with a 20 Birr entry. First prize: a wireless headphone set valued at 1,500 Birr. Second prize: a 500 Birr shopping voucher. Limited to 150 tickets, with up to 5 tickets per person. Sample prizes are for demonstration and are not redeemable.',
    prizeName: 'Wireless Headphones', categoryCode: 'ESS', prizeValue: 1500,
    ticketPrice: 20, ticketCap: 150, maxTicketsPerUser: 4, deadlineDays: 30,
    prizeImageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&fit=crop&q=85',
    additionalPrizes: [{ name: 'Shopping Voucher', value: 500 }],
  },
  {
    title: 'Weekend Upgrade — 50 Birr Test Raffle',
    description: 'DEMO / TEST ONLY. Try a premium raffle experience with a 50 Birr entry. First prize: a home espresso machine valued at 6,000 Birr. Second prize: a 1,500 Birr shopping voucher. Third prize: a 500 Birr coffee voucher. Limited to 200 tickets, with up to 5 tickets per person. Sample prizes are for demonstration and are not redeemable.',
    prizeName: 'Home Espresso Machine', categoryCode: 'HOM', prizeValue: 6000,
    ticketPrice: 50, ticketCap: 200, maxTicketsPerUser: 4, deadlineDays: 30,
    prizeImageUrl: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=1200&fit=crop&q=85',
    additionalPrizes: [{ name: 'Shopping Voucher', value: 1500 }, { name: 'Coffee Voucher', value: 500 }],
  },
].map((sample) => createRaffleSchema.parse({ ...sample, status: 'open', isDemo: true, salesEnabled: false }));

async function main() {
  const existing = await sql`SELECT public_code, title, status FROM raffles ORDER BY created_at`;
  console.log(JSON.stringify({ existing, replacements: samples }, null, 2));
  if (!process.argv.includes('--apply')) {
    console.log('Preview only. Use --apply to delete all raffles and their dependent records and insert these two demos. Demo sales start disabled.');
    return;
  }

  const prepared = await Promise.all(samples.map(async (sample) => {
    const seed = generateServerSeed();
    return { ...sample, seed, commitment: await commitServerSeed(seed) };
  }));

  const result = await sql.begin(async (tx) => {
    await tx`SET LOCAL lock_timeout = '10s'`;
    await tx`LOCK TABLE raffles, payouts IN EXCLUSIVE MODE`;
    const [owner] = await tx`SELECT id FROM admin_users WHERE role = 'owner' ORDER BY created_at LIMIT 1`;
    if (!owner) throw new Error('An existing owner account is required.');
    const blocked = await tx`SELECT id FROM payouts WHERE claim_status = 'fulfilled' LIMIT 1`;
    if (blocked.length) throw new Error('Reset refused: a fulfilled payout exists. No records were changed.');
    // Verify the explicit sales-control migration before deleting anything.
    await tx`SELECT sales_enabled, is_demo FROM raffles LIMIT 1`;
    const deleted = await tx`DELETE FROM raffles RETURNING id`;
    for (const raffle of prepared) {
      const [created] = await tx`
        INSERT INTO raffles (
          title, description, prize_name, prize_value, prize_image_url,
          ticket_price, ticket_cap, max_tickets_per_user, deadline_days,
          status, opens_at, deadline_at, created_by, category_code,
          raffle_number, public_code, draw_server_seed, draw_server_seed_hash,
          sales_enabled, is_demo
        ) VALUES (
          ${raffle.title}, ${raffle.description!}, ${raffle.prizeName}, ${raffle.prizeValue}, ${raffle.prizeImageUrl!},
          ${raffle.ticketPrice}, ${raffle.ticketCap}, ${raffle.maxTicketsPerUser}, ${raffle.deadlineDays},
          'open', NOW(), NOW() + ${raffle.deadlineDays} * INTERVAL '1 day', ${owner.id}, ${raffle.categoryCode},
          1, ${`${raffle.categoryCode}-001`}, ${raffle.seed}, ${raffle.commitment}, false, true
        ) RETURNING id
      `;
      const prizes = [{ name: raffle.prizeName, value: raffle.prizeValue }, ...raffle.additionalPrizes ?? []];
      for (const [index, prize] of prizes.entries()) {
        await tx`INSERT INTO raffle_prizes (raffle_id, tier, name, value, image_url)
          VALUES (${created.id}, ${index + 1}, ${prize.name}, ${prize.value}, ${index === 0 ? raffle.prizeImageUrl! : null})`;
      }
    }
    const raffles = await tx`
      SELECT public_code, title, ticket_price, ticket_cap, status, is_demo, sales_enabled,
        (SELECT count(*)::int FROM raffle_prizes p WHERE p.raffle_id = r.id) AS prize_count,
        (SELECT count(*)::int FROM tickets t WHERE t.raffle_id = r.id) AS tickets_sold
      FROM raffles r ORDER BY ticket_price
    `;
    if (raffles.length !== 2 || raffles.some(r => !r.isDemo || r.salesEnabled || r.ticketsSold !== 0)) {
      throw new Error('Verification failed; reset rolled back.');
    }
    return { deletedCount: deleted.length, raffles };
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Demo reset failed');
  process.exitCode = 1;
}).finally(closeDb);

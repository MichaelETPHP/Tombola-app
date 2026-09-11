/** Add six demos without deleting or overwriting existing raffles. Safe to rerun. */
import { sql, closeDb } from './client.js';
import { createRaffle } from './queries/raffles.queries.js';
import { createRaffleSchema } from '../modules/raffles/raffles.schema.js';
import { generateServerSeed, commitServerSeed } from '../lib/provably-fair.js';
import { generateNumberSeed } from '../lib/ticket-display-number.js';

const samples = [
  { title: 'Sound On', prizeName: 'Portable Bluetooth Speaker', categoryCode: 'SND', prizeValue: 2000, ticketPrice: 20, ticketCap: 150, image: 'photo-1608043152269-423dbba4e7e1', additionalPrizes: [], isFeatured: true },
  { title: 'Capture the Moment', prizeName: 'Digital Camera Kit', categoryCode: 'CAM', prizeValue: 12000, ticketPrice: 50, ticketCap: 350, image: 'photo-1516035069371-29a1b244cc32', additionalPrizes: [{ name: 'Camera Carry Bag', value: 1500 }], isFeatured: true },
  { title: 'Time for Something New', prizeName: 'Classic Wristwatch', categoryCode: 'WCH', prizeValue: 2500, ticketPrice: 20, ticketCap: 200, image: 'photo-1524805444758-089113d48a6d', additionalPrizes: [{ name: 'Watch Travel Case', value: 500 }, { name: 'Shopping Voucher', value: 200 }], isFeatured: false },
  { title: 'Ride into the Weekend', prizeName: 'City Bicycle', categoryCode: 'BIK', prizeValue: 18000, ticketPrice: 50, ticketCap: 500, image: 'photo-1485965120184-e220f721d03e', additionalPrizes: [{ name: 'Cycling Helmet', value: 2000 }, { name: 'Bicycle Lock', value: 1000 }], isFeatured: true },
  { title: 'Your Daily Carry', prizeName: 'Everyday Travel Backpack', categoryCode: 'BAG', prizeValue: 1800, ticketPrice: 20, ticketCap: 150, image: 'photo-1553062407-98eeb64c6a62', additionalPrizes: [{ name: 'Travel Accessories Voucher', value: 500 }], isFeatured: false },
  { title: 'Work from Anywhere', prizeName: 'Laptop for Work and Study', categoryCode: 'WRK', prizeValue: 25000, ticketPrice: 50, ticketCap: 600, image: 'photo-1496181133206-80ce9b88a853', additionalPrizes: [], isFeatured: false },
];

async function main() {
  const [owner] = await sql`SELECT id FROM admin_users WHERE role = 'owner' ORDER BY created_at LIMIT 1`;
  if (!owner) throw new Error('An existing owner account is required.');
  const columns = await sql`SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'raffles' AND column_name = 'is_featured'`;
  const featureReady = columns.length > 0;
  if (!featureReady) console.log('Migration 021 is pending. Adding demos now; rerun with --feature-samples after migration to select the three sample highlights.');
  for (const [index, sample] of samples.entries()) {
    const id = `a0210000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    if ((await sql`SELECT id FROM raffles WHERE id = ${id}`).length) {
      if (featureReady && process.argv.includes('--feature-samples')) {
        await sql`UPDATE raffles SET is_featured = ${sample.isFeatured}, updated_at = NOW() WHERE id = ${id} AND is_demo = true`;
      }
      continue;
    }
    const prizes = [{ name: sample.prizeName, value: sample.prizeValue }, ...sample.additionalPrizes];
    const data = createRaffleSchema.parse({
      ...sample,
      title: `${sample.title} — ${sample.ticketPrice} Birr Demo`,
      description: `DEMO / TEST ONLY. ${sample.title}: explore this sample raffle for ${sample.ticketPrice} Birr per ticket. ${prizes.map((p, i) => `Prize ${i + 1}: ${p.name} (${p.value.toLocaleString('en-US')} Birr sample value).`).join(' ')} Limited to ${sample.ticketCap} tickets, with up to 5 per participant. These demonstration prizes are not redeemable.`,
      prizeImageUrl: `https://images.unsplash.com/${sample.image}?w=1200&fit=max&q=85`,
      maxTicketsPerUser: 4, deadlineDays: 30, status: 'open', isDemo: true, salesEnabled: false,
    });
    const drawServerSeed = generateServerSeed();
    await createRaffle({ ...data, id, createdBy: owner.id,
      isFeatured: featureReady ? data.isFeatured : undefined,
      drawServerSeed, drawServerSeedHash: await commitServerSeed(drawServerSeed),
      numberSeed: generateNumberSeed() });
    await sql`UPDATE raffle_prizes SET image_url = ${data.prizeImageUrl!} WHERE raffle_id = ${id} AND tier = 1`;
  }
  const raffles = await sql`
    SELECT public_code, title, ticket_price, COALESCE((to_jsonb(r)->>'is_featured')::boolean, false) AS is_featured, is_demo,
      (SELECT count(*)::int FROM raffle_prizes p WHERE p.raffle_id = r.id) AS prize_count
    FROM raffles r ORDER BY created_at
  `;
  if (raffles.some(r => r.prizeCount < 1 || r.prizeCount > 3)) throw new Error('A raffle has an invalid prize count.');
  console.log(JSON.stringify(raffles, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Could not add demos');
  process.exitCode = 1;
}).finally(closeDb);

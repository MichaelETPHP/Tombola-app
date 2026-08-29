/**
 * 🎰 Tombola Platform — Seed Data Script
 * 
 * Populates the database with realistic sample data for the Ethiopian market:
 * - 1 Admin (owner) account
 * - 10 Sample users with Ethiopian phone numbers
 * - 6 Raffles (varying statuses: open, locked, completed, draft)
 * - Payments, tickets, and related data for the active raffles
 * 
 * Run with: bun src/db/seed.ts
 */

import { sql } from './client.js';


// ── Helpers ──────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function futureDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// Simple bcrypt-style hash using Bun's built-in (for admin password)
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 });
}

// ── Prize Image URLs (using high-quality free stock images) ──────
// These are publicly accessible URLs so the images work immediately.

const PRIZE_IMAGES = {
  iphone: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&h=800&fit=crop&q=80',
  car: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&h=800&fit=crop&q=80',
  tv: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&h=800&fit=crop&q=80',
  jewelry: 'https://images.unsplash.com/photo-1515562141589-67f0d569b6c6?w=800&h=800&fit=crop&q=80',
  macbook: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&h=800&fit=crop&q=80',
  appliances: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&h=800&fit=crop&q=80',
};

// ── Seed Data Definitions ────────────────────────────────────────

const ADMIN_ACCOUNT = {
  phone: '+251911000001',
  password: 'Admin@2024!',  // Will be hashed
  role: 'owner' as const,
};

const SAMPLE_USERS = [
  { phone: '+251912345001', name: 'Abel Tadesse' },
  { phone: '+251912345002', name: 'Bethlehem Girma' },
  { phone: '+251912345003', name: 'Dawit Hailu' },
  { phone: '+251912345004', name: 'Eyerusalem Bekele' },
  { phone: '+251912345005', name: 'Fikru Mekonnen' },
  { phone: '+251912345006', name: 'Gelila Assefa' },
  { phone: '+251912345007', name: 'Henok Yohannes' },
  { phone: '+251912345008', name: 'Iman Jemal' },
  { phone: '+251912345009', name: 'Kidist Worku' },
  { phone: '+251912345010', name: 'Liya Mulugeta' },
];

interface RaffleSeed {
  title: string;
  description: string;
  prizeName: string;
  prizeValue: number;
  prizeImageUrl: string;
  ticketPrice: number;
  ticketCap: number;
  maxTicketsPerUser: number;
  deadlineDays: number;
  status: 'draft' | 'open' | 'locked' | 'completed';
  /** How many tickets should be sold (for open/locked/completed) */
  ticketsToSell: number;
}

const RAFFLES: RaffleSeed[] = [
  {
    title: 'Win an iPhone 16 Pro Max!',
    description: 'Get a chance to win the brand new iPhone 16 Pro Max 256GB in Natural Titanium. This flagship phone features a 6.9-inch Super Retina XDR display, A18 Pro chip, and an advanced camera system. Perfect for tech enthusiasts!',
    prizeName: 'iPhone 16 Pro Max 256GB',
    prizeValue: 120000.00,
    prizeImageUrl: PRIZE_IMAGES.iphone,
    ticketPrice: 100.00,
    ticketCap: 500,
    maxTicketsPerUser: 5,
    deadlineDays: 30,
    status: 'open',
    ticketsToSell: 187,  // ~37% sold
  },
  {
    title: 'Toyota Yaris Mega Raffle',
    description: 'The ultimate prize! Win a brand new 2024 Toyota Yaris sedan delivered to your door in Addis Ababa. Full warranty included. This is your chance to drive home your dream car for just 500 ETB per ticket!',
    prizeName: 'Toyota Yaris 2024 Sedan',
    prizeValue: 2500000.00,
    prizeImageUrl: PRIZE_IMAGES.car,
    ticketPrice: 500.00,
    ticketCap: 2000,
    maxTicketsPerUser: 5,
    deadlineDays: 60,
    status: 'open',
    ticketsToSell: 823,  // ~41% sold
  },
  {
    title: 'Samsung 65" Smart TV',
    description: 'Win a stunning Samsung 65-inch 4K Crystal UHD Smart TV. Transform your living room with cinematic picture quality, smart apps, and built-in streaming. Free delivery in Addis Ababa!',
    prizeName: 'Samsung 65" 4K Crystal UHD TV',
    prizeValue: 85000.00,
    prizeImageUrl: PRIZE_IMAGES.tv,
    ticketPrice: 50.00,
    ticketCap: 300,
    maxTicketsPerUser: 3,
    deadlineDays: 21,
    status: 'locked',  // cap reached!
    ticketsToSell: 300,  // 100% sold
  },
  {
    title: 'Ethiopian Gold Jewelry Collection',
    description: 'A stunning handcrafted 21K gold jewelry set featuring a traditional Ethiopian necklace, matching earrings, and bracelet. Crafted by master goldsmiths in the heart of Addis Ababa. Total weight: 45 grams.',
    prizeName: 'Handcrafted 21K Gold Jewelry Set (45g)',
    prizeValue: 350000.00,
    prizeImageUrl: PRIZE_IMAGES.jewelry,
    ticketPrice: 200.00,
    ticketCap: 1000,
    maxTicketsPerUser: 5,
    deadlineDays: 45,
    status: 'open',
    ticketsToSell: 412,  // ~41% sold
  },
  {
    title: 'MacBook Pro 16" M3 Pro',
    description: 'Apple MacBook Pro 16-inch with M3 Pro chip, 18GB RAM, 512GB SSD. Space Black. The ultimate laptop for professionals and creatives. Includes 1 year of AppleCare+.',
    prizeName: 'MacBook Pro 16" M3 Pro 18GB/512GB',
    prizeValue: 180000.00,
    prizeImageUrl: PRIZE_IMAGES.macbook,
    ticketPrice: 150.00,
    ticketCap: 600,
    maxTicketsPerUser: 4,
    deadlineDays: 14,
    status: 'draft',  // not yet published
    ticketsToSell: 0,
  },
  {
    title: 'Home Appliance Bundle 🏠',
    description: 'Complete home makeover! Win a bundle of premium home appliances including a Samsung French Door Refrigerator, LG Front Load Washing Machine, and a Panasonic Microwave Oven. All brand new with manufacturer warranty.',
    prizeName: 'Samsung Fridge + LG Washer + Panasonic Microwave',
    prizeValue: 250000.00,
    prizeImageUrl: PRIZE_IMAGES.appliances,
    ticketPrice: 200.00,
    ticketCap: 800,
    maxTicketsPerUser: 5,
    deadlineDays: 35,
    status: 'open',
    ticketsToSell: 156,  // ~20% sold
  },
];

// ── Main Seed Function ───────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting Tombola seed...\n');

  // ─── 1. Create Admin ──────────────────────────────────────────
  console.log('👤 Creating admin account...');
  const passwordHash = await hashPassword(ADMIN_ACCOUNT.password);
  
  const [admin] = await sql<{ id: string }[]>`
    INSERT INTO admin_users (phone_number, password_hash, role)
    VALUES (${ADMIN_ACCOUNT.phone}, ${passwordHash}, ${ADMIN_ACCOUNT.role})
    ON CONFLICT (phone_number) DO UPDATE SET password_hash = ${passwordHash}
    RETURNING id
  `;
  console.log(`   ✅ Admin created: ${ADMIN_ACCOUNT.phone} (password: ${ADMIN_ACCOUNT.password})`);
  console.log(`   ID: ${admin.id}\n`);

  // ─── 2. Create Users ──────────────────────────────────────────
  console.log('👥 Creating sample users...');
  const userIds: string[] = [];

  for (const user of SAMPLE_USERS) {
    const [created] = await sql<{ id: string }[]>`
      INSERT INTO users (phone_number, full_name, phone_verified_at, status)
      VALUES (${user.phone}, ${user.name}, NOW(), 'active')
      ON CONFLICT (phone_number) DO UPDATE SET full_name = ${user.name}
      RETURNING id
    `;
    userIds.push(created.id);
    console.log(`   ✅ ${user.name} (${user.phone})`);
  }
  console.log(`   Total: ${userIds.length} users\n`);

  // ─── 3. Create Raffles ────────────────────────────────────────
  console.log('🎰 Creating raffles...');
  
  for (const raffle of RAFFLES) {
    // Compute actual deadline based on status
    let deadlineAt: Date;
    let opensAt: Date;
    let insertStatus: string;

    if (raffle.status === 'locked' || raffle.status === 'completed') {
      // These raffles opened in the past
      opensAt = pastDate(raffle.deadlineDays + 5);
      deadlineAt = pastDate(5);
      insertStatus = raffle.status === 'locked' ? 'open' : 'open'; // insert as open first, will update after tickets
    } else if (raffle.status === 'draft') {
      opensAt = futureDate(3);
      deadlineAt = futureDate(3 + raffle.deadlineDays);
      insertStatus = 'draft';
    } else {
      // Open raffles — opened recently, deadline in the future
      opensAt = pastDate(randomInt(3, 10));
      deadlineAt = futureDate(raffle.deadlineDays);
      insertStatus = 'open';
    }

    const [createdRaffle] = await sql<{ id: string }[]>`
      INSERT INTO raffles (
        title, description, prize_name, prize_value, prize_image_url,
        ticket_price, ticket_cap, max_tickets_per_user, deadline_days,
        status, opens_at, deadline_at, created_by
      ) VALUES (
        ${raffle.title}, ${raffle.description}, ${raffle.prizeName},
        ${raffle.prizeValue}, ${raffle.prizeImageUrl},
        ${raffle.ticketPrice}, ${raffle.ticketCap}, ${raffle.maxTicketsPerUser},
        ${raffle.deadlineDays}, ${insertStatus}, ${opensAt}, ${deadlineAt}, ${admin.id}
      )
      RETURNING id
    `;

    console.log(`   🎲 "${raffle.title}" → status: ${raffle.status}, cap: ${raffle.ticketCap}`);

    // ─── 4. Create Tickets & Payments for non-draft raffles ──────
    if (raffle.ticketsToSell > 0 && raffle.status !== 'draft') {
      console.log(`      💳 Selling ${raffle.ticketsToSell} tickets...`);
      
      let ticketsSold = 0;
      const raffleId = createdRaffle.id;

      while (ticketsSold < raffle.ticketsToSell) {
        // Pick a random user
        const userId = randomElement(userIds);
        
        // Determine how many tickets this user buys (1 to maxTicketsPerUser)
        const maxToBuy = Math.min(
          raffle.maxTicketsPerUser,
          raffle.ticketsToSell - ticketsSold
        );
        const ticketCount = randomInt(1, maxToBuy);
        const amount = ticketCount * raffle.ticketPrice;

        // Check how many tickets this user already has for this raffle
        const [existing] = await sql<{ count: number }[]>`
          SELECT COUNT(*)::int as count FROM tickets 
          WHERE raffle_id = ${raffleId} AND user_id = ${userId}
        `;

        if (existing.count + ticketCount > raffle.maxTicketsPerUser) {
          // Skip this user, they've hit their limit
          continue;
        }

        // Create payment
        const gateway = randomElement(['chapa', 'telebirr'] as const);
        const gatewayRef = `${gateway.toUpperCase()}-${Date.now()}-${randomInt(1000, 9999)}`;

        const [payment] = await sql<{ id: string }[]>`
          INSERT INTO payments (user_id, raffle_id, ticket_count, amount, gateway, gateway_ref, status)
          VALUES (${userId}, ${raffleId}, ${ticketCount}, ${amount}, ${gateway}, ${gatewayRef}, 'completed')
          RETURNING id
        `;

        // Create individual ticket rows
        for (let i = 0; i < ticketCount; i++) {
          ticketsSold++;
          const ticketNumber = ticketsSold;
          
          await sql`
            INSERT INTO tickets (raffle_id, ticket_number, user_id, payment_id, purchased_at)
            VALUES (${raffleId}, ${ticketNumber}, ${userId}, ${payment.id}, 
                    ${new Date(Date.now() - randomInt(0, 7 * 24 * 60 * 60 * 1000))})
          `;
        }
      }

      console.log(`      ✅ ${ticketsSold} tickets sold across ${userIds.length} users`);

      // Update status if locked
      if (raffle.status === 'locked') {
        await sql`UPDATE raffles SET status = 'locked' WHERE id = ${raffleId}`;
        console.log(`      🔒 Raffle locked (cap reached)`);
      }
    }
  }

  // ─── 5. Summary ───────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 SEED COMPLETE! Here\'s what was created:\n');
  
  const [userCount] = await sql<{ c: number }[]>`SELECT COUNT(*)::int as c FROM users`;
  const [adminCount] = await sql<{ c: number }[]>`SELECT COUNT(*)::int as c FROM admin_users`;
  const [raffleCount] = await sql<{ c: number }[]>`SELECT COUNT(*)::int as c FROM raffles`;
  const [ticketCount] = await sql<{ c: number }[]>`SELECT COUNT(*)::int as c FROM tickets`;
  const [paymentCount] = await sql<{ c: number }[]>`SELECT COUNT(*)::int as c FROM payments`;

  console.log(`   👤 Admin accounts:  ${adminCount.c}`);
  console.log(`   👥 Users:           ${userCount.c}`);
  console.log(`   🎰 Raffles:         ${raffleCount.c}`);
  console.log(`   🎫 Tickets:         ${ticketCount.c}`);
  console.log(`   💳 Payments:        ${paymentCount.c}`);
  
  console.log('\n📋 ADMIN LOGIN CREDENTIALS:');
  console.log(`   Phone:    ${ADMIN_ACCOUNT.phone}`);
  console.log(`   Password: ${ADMIN_ACCOUNT.password}`);
  
  console.log('\n📋 SAMPLE USER PHONES (for mobile app OTP login):');
  SAMPLE_USERS.forEach(u => console.log(`   ${u.phone}  →  ${u.name}`));

  console.log('\n' + '═'.repeat(60));
}

// ── Run ──────────────────────────────────────────────────────────

seed()
  .then(() => {
    console.log('\n✅ Done! You can now start the app and see the data.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  });

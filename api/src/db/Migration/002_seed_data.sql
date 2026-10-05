-- ============================================================================
-- TOMBOLA PLATFORM — SEED DATA (v3 - Constraint-Safe)
-- ============================================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

SET search_path TO "Tombola_DB", public;

-- ── 1. GRANT FULL PERMISSIONS TO POSTGRES ROLE ─────────────────
GRANT USAGE ON SCHEMA "Tombola_DB" TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "Tombola_DB" TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "Tombola_DB" TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA "Tombola_DB" GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA "Tombola_DB" GRANT ALL ON SEQUENCES TO postgres;

-- ── 2. TEMPORARILY DISABLE TRIGGERS FOR SEEDING ─────────────────
ALTER TABLE tickets DISABLE TRIGGER ALL;

-- ── 3. CLEAN EXISTING DATA ──────────────────────────────────────
DELETE FROM notifications;
DELETE FROM audit_log;
DELETE FROM payouts;
DELETE FROM draw_results;
DELETE FROM draw_triggers;
DELETE FROM tickets;
DELETE FROM payments;
DELETE FROM raffle_extensions;
DELETE FROM raffles;
DELETE FROM otp_codes;
DELETE FROM users;
DELETE FROM admin_users;

-- ── 4. SEED ADMIN ACCOUNT ───────────────────────────────────────
-- Phone: +251911000001 | Password: Admin@2024!
INSERT INTO admin_users (id, phone_number, password_hash, role) VALUES
  ('a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '+251911000001',
   '$2b$10$MPDlEo8KeVtPYLHSqolhzObZ3bQbk5YANKlfbAdHi7gQeJeFE1Yey',
   'owner');

-- ── 5. SEED 50 SAMPLE USERS ─────────────────────────────────────
INSERT INTO users (id, phone_number, full_name, phone_verified_at, status) VALUES
  ('b0000001-bbbb-4bbb-bbbb-bbbbbbbbbb01', '+251912345001', 'Abel Tadesse',       NOW(), 'active'),
  ('b0000002-bbbb-4bbb-bbbb-bbbbbbbbbb02', '+251912345002', 'Bethlehem Girma',     NOW(), 'active'),
  ('b0000003-bbbb-4bbb-bbbb-bbbbbbbbbb03', '+251912345003', 'Dawit Hailu',         NOW(), 'active'),
  ('b0000004-bbbb-4bbb-bbbb-bbbbbbbbbb04', '+251912345004', 'Eyerusalem Bekele',   NOW(), 'active'),
  ('b0000005-bbbb-4bbb-bbbb-bbbbbbbbbb05', '+251912345005', 'Fikru Mekonnen',      NOW(), 'active'),
  ('b0000006-bbbb-4bbb-bbbb-bbbbbbbbbb06', '+251912345006', 'Gelila Assefa',       NOW(), 'active'),
  ('b0000007-bbbb-4bbb-bbbb-bbbbbbbbbb07', '+251912345007', 'Henok Yohannes',      NOW(), 'active'),
  ('b0000008-bbbb-4bbb-bbbb-bbbbbbbbbb08', '+251912345008', 'Iman Jemal',          NOW(), 'active'),
  ('b0000009-bbbb-4bbb-bbbb-bbbbbbbbbb09', '+251912345009', 'Kidist Worku',        NOW(), 'active'),
  ('b0000010-bbbb-4bbb-bbbb-bbbbbbbbbb10', '+251912345010', 'Liya Mulugeta',       NOW(), 'active'),
  ('b0000011-bbbb-4bbb-bbbb-bbbbbbbbbb11', '+251912345011', 'Mahlet Solomon',      NOW(), 'active'),
  ('b0000012-bbbb-4bbb-bbbb-bbbbbbbbbb12', '+251912345012', 'Natnael Berhanu',     NOW(), 'active'),
  ('b0000013-bbbb-4bbb-bbbb-bbbbbbbbbb13', '+251912345013', 'Rediet Tesfaye',      NOW(), 'active'),
  ('b0000014-bbbb-4bbb-bbbb-bbbbbbbbbb14', '+251912345014', 'Samuel Kebede',       NOW(), 'active'),
  ('b0000015-bbbb-4bbb-bbbb-bbbbbbbbbb15', '+251912345015', 'Tigist Alemayehu',    NOW(), 'active'),
  ('b0000016-bbbb-4bbb-bbbb-bbbbbbbbbb16', '+251912345016', 'Yared Kassahun',      NOW(), 'active'),
  ('b0000017-bbbb-4bbb-bbbb-bbbbbbbbbb17', '+251912345017', 'Zelalem Mengistu',    NOW(), 'active'),
  ('b0000018-bbbb-4bbb-bbbb-bbbbbbbbbb18', '+251912345018', 'Almaz Desta',         NOW(), 'active'),
  ('b0000019-bbbb-4bbb-bbbb-bbbbbbbbbb19', '+251912345019', 'Biruk Wondwossen',    NOW(), 'active'),
  ('b0000020-bbbb-4bbb-bbbb-bbbbbbbbbb20', '+251912345020', 'Chaltu Tolessa',      NOW(), 'active');

-- Generate 80 additional users for realistic participant variety
DO $$
DECLARE
  i INT;
  v_names TEXT[] := ARRAY['Abebe','Aster','Bekele','Daniel','Eskinder','Frehiwot','Getachew','Hanna','Kassahun','Mesfin','Nardos','Robel','Sara','Tewodros','Winta','Yonatan'];
  v_lastnames TEXT[] := ARRAY['Bikila','Girma','Haile','Negash','Sahle','Tadesse','Wolde','Zeleke','Ayele','Dibaba','Worku','Tekle'];
BEGIN
  FOR i IN 21..100 LOOP
    INSERT INTO users (id, phone_number, full_name, phone_verified_at, status)
    VALUES (
      gen_random_uuid(),
      '+25191234' || LPAD(i::text, 4, '0'),
      v_names[1 + (i % array_length(v_names, 1))] || ' ' || v_lastnames[1 + ((i * 3) % array_length(v_lastnames, 1))],
      NOW() - (random() * INTERVAL '30 days'),
      'active'
    )
    ON CONFLICT (phone_number) DO NOTHING;
  END LOOP;
END $$;

-- ── 6. SEED 6 RAFFLES ───────────────────────────────────────────
INSERT INTO raffles (id, title, description, prize_name, prize_value, prize_image_url, ticket_price, ticket_cap, max_tickets_per_user, deadline_days, status, opens_at, deadline_at, created_by) VALUES
  ('c0000001-cccc-4ccc-cccc-cccccccccc01', 'Win an iPhone 16 Pro Max!',
   'Get a chance to win the brand new iPhone 16 Pro Max 256GB in Natural Titanium. This flagship phone features a 6.9-inch Super Retina XDR display, A18 Pro chip, and an advanced camera system. Perfect for tech enthusiasts!',
   'iPhone 16 Pro Max 256GB', 120000.00,
   'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&h=800&fit=crop&q=80',
   100.00, 500, 5, 30, 'open', NOW() - INTERVAL '7 days', NOW() + INTERVAL '23 days',
   'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),

  ('c0000002-cccc-4ccc-cccc-cccccccccc02', 'Toyota Yaris Mega Raffle',
   'The ultimate prize! Win a brand new 2024 Toyota Yaris sedan delivered to your door in Addis Ababa. Full warranty included. Drive home your dream car for just 500 ETB per ticket!',
   'Toyota Yaris 2024 Sedan', 2500000.00,
   'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&h=800&fit=crop&q=80',
   500.00, 2000, 5, 60, 'open', NOW() - INTERVAL '10 days', NOW() + INTERVAL '50 days',
   'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),

  ('c0000003-cccc-4ccc-cccc-cccccccccc03', 'Samsung 65" Smart TV',
   'Win a stunning Samsung 65-inch 4K Crystal UHD Smart TV. Transform your living room with cinematic picture quality, smart apps, and built-in streaming. Free delivery in Addis Ababa!',
   'Samsung 65" 4K Crystal UHD TV', 85000.00,
   'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&h=800&fit=crop&q=80',
   50.00, 300, 3, 21, 'open', NOW() - INTERVAL '18 days', NOW() + INTERVAL '3 days',
   'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),

  ('c0000004-cccc-4ccc-cccc-cccccccccc04', 'Ethiopian Gold Jewelry Collection',
   'A stunning handcrafted 21K gold jewelry set featuring a traditional Ethiopian necklace, matching earrings, and bracelet. Crafted by master goldsmiths in the heart of Addis Ababa. Total weight: 45 grams.',
   'Handcrafted 21K Gold Jewelry Set (45g)', 350000.00,
   'https://images.unsplash.com/photo-1515562141589-67f0d569b6c6?w=800&h=800&fit=crop&q=80',
   200.00, 1000, 5, 45, 'open', NOW() - INTERVAL '5 days', NOW() + INTERVAL '40 days',
   'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),

  ('c0000005-cccc-4ccc-cccc-cccccccccc05', 'MacBook Pro 16" M3 Pro',
   'Apple MacBook Pro 16-inch with M3 Pro chip, 18GB RAM, 512GB SSD. Space Black. The ultimate laptop for professionals and creatives. Includes 1 year of AppleCare+.',
   'MacBook Pro 16" M3 Pro 18GB/512GB', 180000.00,
   'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&h=800&fit=crop&q=80',
   150.00, 600, 4, 14, 'draft', NOW() + INTERVAL '3 days', NOW() + INTERVAL '17 days',
   'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),

  ('c0000006-cccc-4ccc-cccc-cccccccccc06', 'Home Appliance Bundle',
   'Complete home makeover! Win a bundle of premium home appliances including a Samsung French Door Refrigerator, LG Front Load Washing Machine, and a Panasonic Microwave Oven. All brand new with warranty.',
   'Samsung Fridge + LG Washer + Panasonic Microwave', 250000.00,
   'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&h=800&fit=crop&q=80',
   200.00, 800, 5, 35, 'open', NOW() - INTERVAL '4 days', NOW() + INTERVAL '31 days',
   'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

-- ── 7. SEED TICKETS & PAYMENTS ───────────────────────────────────

-- Function to safely fill tickets for a raffle across available users
DO $$
DECLARE
  v_user_ids UUID[];
  v_num_users INT;
  v_uid UUID;
  v_pid UUID;
  v_ticket_num INT;
  v_user_idx INT;
  v_user_tickets INT;
  v_tix_to_buy INT;
  v_tix_left INT;
BEGIN
  -- Grab all user IDs
  SELECT array_agg(id) INTO v_user_ids FROM users;
  v_num_users := array_length(v_user_ids, 1);

  -- ── RAFFLE 1: iPhone (187 tickets, max 5/user) ────────────────
  v_ticket_num := 0;
  v_user_idx := 1;
  WHILE v_ticket_num < 187 LOOP
    v_uid := v_user_ids[1 + ((v_user_idx - 1) % v_num_users)];
    v_tix_to_buy := LEAST(1 + (v_user_idx % 5), 187 - v_ticket_num);
    v_pid := gen_random_uuid();
    
    INSERT INTO payments (id, user_id, raffle_id, ticket_count, amount, gateway, gateway_ref, status, created_at)
    VALUES (v_pid, v_uid, 'c0000001-cccc-4ccc-cccc-cccccccccc01', v_tix_to_buy, v_tix_to_buy * 100.00,
            CASE WHEN v_user_idx % 2 = 0 THEN 'chapa'::payment_gateway ELSE 'telebirr'::payment_gateway END,
            'IPH-' || v_user_idx || '-' || extract(epoch from now())::bigint,
            'completed', NOW() - (random() * INTERVAL '7 days'));

    FOR v_user_tickets IN 1..v_tix_to_buy LOOP
      v_ticket_num := v_ticket_num + 1;
      INSERT INTO tickets (raffle_id, ticket_number, user_id, payment_id, purchased_at)
      VALUES ('c0000001-cccc-4ccc-cccc-cccccccccc01', v_ticket_num, v_uid, v_pid, NOW() - (random() * INTERVAL '7 days'));
    END LOOP;
    v_user_idx := v_user_idx + 1;
  END LOOP;
  RAISE NOTICE 'iPhone Raffle: 187 tickets seeded across % users', v_user_idx - 1;

  -- ── RAFFLE 2: Toyota Yaris (823 tickets, max 10/user) ─────────
  v_ticket_num := 0;
  v_user_idx := 1;
  WHILE v_ticket_num < 823 LOOP
    v_uid := v_user_ids[1 + ((v_user_idx - 1) % v_num_users)];
    v_tix_to_buy := LEAST(1 + (v_user_idx % 10), 823 - v_ticket_num);
    v_pid := gen_random_uuid();
    
    INSERT INTO payments (id, user_id, raffle_id, ticket_count, amount, gateway, gateway_ref, status, created_at)
    VALUES (v_pid, v_uid, 'c0000002-cccc-4ccc-cccc-cccccccccc02', v_tix_to_buy, v_tix_to_buy * 500.00,
            CASE WHEN v_user_idx % 3 = 0 THEN 'telebirr'::payment_gateway ELSE 'chapa'::payment_gateway END,
            'YAR-' || v_user_idx || '-' || extract(epoch from now())::bigint,
            'completed', NOW() - (random() * INTERVAL '10 days'));

    FOR v_user_tickets IN 1..v_tix_to_buy LOOP
      v_ticket_num := v_ticket_num + 1;
      INSERT INTO tickets (raffle_id, ticket_number, user_id, payment_id, purchased_at)
      VALUES ('c0000002-cccc-4ccc-cccc-cccccccccc02', v_ticket_num, v_uid, v_pid, NOW() - (random() * INTERVAL '10 days'));
    END LOOP;
    v_user_idx := v_user_idx + 1;
  END LOOP;
  RAISE NOTICE 'Toyota Yaris: 823 tickets seeded across % users', v_user_idx - 1;

  -- ── RAFFLE 3: Samsung TV (300 tickets = FULL CAP, max 3/user) ─
  v_ticket_num := 0;
  v_user_idx := 1;
  WHILE v_ticket_num < 300 LOOP
    v_uid := v_user_ids[1 + ((v_user_idx - 1) % v_num_users)];
    v_tix_to_buy := LEAST(1 + (v_user_idx % 3), 300 - v_ticket_num);
    v_pid := gen_random_uuid();
    
    INSERT INTO payments (id, user_id, raffle_id, ticket_count, amount, gateway, gateway_ref, status, created_at)
    VALUES (v_pid, v_uid, 'c0000003-cccc-4ccc-cccc-cccccccccc03', v_tix_to_buy, v_tix_to_buy * 50.00,
            CASE WHEN v_user_idx % 2 = 0 THEN 'chapa'::payment_gateway ELSE 'telebirr'::payment_gateway END,
            'TV-' || v_user_idx || '-' || extract(epoch from now())::bigint,
            'completed', NOW() - INTERVAL '18 days' + (v_user_idx * INTERVAL '2 hours'));

    FOR v_user_tickets IN 1..v_tix_to_buy LOOP
      v_ticket_num := v_ticket_num + 1;
      INSERT INTO tickets (raffle_id, ticket_number, user_id, payment_id, purchased_at)
      VALUES ('c0000003-cccc-4ccc-cccc-cccccccccc03', v_ticket_num, v_uid, v_pid, NOW() - INTERVAL '18 days' + (v_user_idx * INTERVAL '2 hours'));
    END LOOP;
    v_user_idx := v_user_idx + 1;
  END LOOP;
  RAISE NOTICE 'Samsung TV: 300 tickets seeded (FULL CAP)';

  -- ── RAFFLE 4: Gold Jewelry (412 tickets, max 5/user) ──────────
  v_ticket_num := 0;
  v_user_idx := 1;
  WHILE v_ticket_num < 412 LOOP
    v_uid := v_user_ids[1 + ((v_user_idx - 1) % v_num_users)];
    v_tix_to_buy := LEAST(1 + (v_user_idx % 5), 412 - v_ticket_num);
    v_pid := gen_random_uuid();
    
    INSERT INTO payments (id, user_id, raffle_id, ticket_count, amount, gateway, gateway_ref, status, created_at)
    VALUES (v_pid, v_uid, 'c0000004-cccc-4ccc-cccc-cccccccccc04', v_tix_to_buy, v_tix_to_buy * 200.00,
            CASE WHEN v_user_idx % 2 = 0 THEN 'telebirr'::payment_gateway ELSE 'chapa'::payment_gateway END,
            'GLD-' || v_user_idx || '-' || extract(epoch from now())::bigint,
            'completed', NOW() - (random() * INTERVAL '5 days'));

    FOR v_user_tickets IN 1..v_tix_to_buy LOOP
      v_ticket_num := v_ticket_num + 1;
      INSERT INTO tickets (raffle_id, ticket_number, user_id, payment_id, purchased_at)
      VALUES ('c0000004-cccc-4ccc-cccc-cccccccccc04', v_ticket_num, v_uid, v_pid, NOW() - (random() * INTERVAL '5 days'));
    END LOOP;
    v_user_idx := v_user_idx + 1;
  END LOOP;
  RAISE NOTICE 'Gold Jewelry: 412 tickets seeded';

  -- ── RAFFLE 6: Home Appliances (156 tickets, max 5/user) ───────
  v_ticket_num := 0;
  v_user_idx := 1;
  WHILE v_ticket_num < 156 LOOP
    v_uid := v_user_ids[1 + ((v_user_idx - 1) % v_num_users)];
    v_tix_to_buy := LEAST(1 + (v_user_idx % 5), 156 - v_ticket_num);
    v_pid := gen_random_uuid();
    
    INSERT INTO payments (id, user_id, raffle_id, ticket_count, amount, gateway, gateway_ref, status, created_at)
    VALUES (v_pid, v_uid, 'c0000006-cccc-4ccc-cccc-cccccccccc06', v_tix_to_buy, v_tix_to_buy * 200.00,
            CASE WHEN v_user_idx % 3 = 0 THEN 'telebirr'::payment_gateway ELSE 'chapa'::payment_gateway END,
            'APP-' || v_user_idx || '-' || extract(epoch from now())::bigint,
            'completed', NOW() - (random() * INTERVAL '4 days'));

    FOR v_user_tickets IN 1..v_tix_to_buy LOOP
      v_ticket_num := v_ticket_num + 1;
      INSERT INTO tickets (raffle_id, ticket_number, user_id, payment_id, purchased_at)
      VALUES ('c0000006-cccc-4ccc-cccc-cccccccccc06', v_ticket_num, v_uid, v_pid, NOW() - (random() * INTERVAL '4 days'));
    END LOOP;
    v_user_idx := v_user_idx + 1;
  END LOOP;
  RAISE NOTICE 'Home Appliances: 156 tickets seeded';
END $$;

-- ── 8. SET LOCKED STATUS FOR COMPLETED RAFFLE ───────────────────
UPDATE raffles SET status = 'locked' WHERE id = 'c0000003-cccc-4ccc-cccc-cccccccccc03';

-- ── 9. RE-ENABLE TRIGGERS ───────────────────────────────────────
ALTER TABLE tickets ENABLE TRIGGER ALL;

-- ── 10. SEED AUDIT LOG ──────────────────────────────────────────
INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata) VALUES
  ('admin', 'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'raffle.created', 'raffle', 'c0000001-cccc-4ccc-cccc-cccccccccc01', '{"title":"Win an iPhone 16 Pro Max!"}'),
  ('admin', 'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'raffle.created', 'raffle', 'c0000002-cccc-4ccc-cccc-cccccccccc02', '{"title":"Toyota Yaris Mega Raffle"}'),
  ('admin', 'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'raffle.created', 'raffle', 'c0000003-cccc-4ccc-cccc-cccccccccc03', '{"title":"Samsung 65 Smart TV"}'),
  ('admin', 'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'raffle.created', 'raffle', 'c0000004-cccc-4ccc-cccc-cccccccccc04', '{"title":"Ethiopian Gold Jewelry Collection"}'),
  ('admin', 'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'raffle.created', 'raffle', 'c0000005-cccc-4ccc-cccc-cccccccccc05', '{"title":"MacBook Pro 16 M3 Pro"}'),
  ('admin', 'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'raffle.created', 'raffle', 'c0000006-cccc-4ccc-cccc-cccccccccc06', '{"title":"Home Appliance Bundle"}'),
  ('system', NULL, 'raffle.locked', 'raffle', 'c0000003-cccc-4ccc-cccc-cccccccccc03', '{"reason":"ticket cap reached","tickets_sold":300}');

-- ── 11. VERIFY SEED RESULTS ─────────────────────────────────────
SELECT 
  r.title, 
  r.status, 
  r.ticket_cap,
  COUNT(t.id) AS tickets_sold,
  r.ticket_cap - COUNT(t.id) AS remaining,
  ROUND(COUNT(t.id)::numeric / r.ticket_cap * 100, 1) || '%' AS fill_pct,
  r.ticket_price || ' ETB' AS price,
  r.prize_value || ' ETB' AS prize
FROM raffles r 
LEFT JOIN tickets t ON t.raffle_id = r.id
GROUP BY r.id 
ORDER BY r.created_at;

SELECT 
  (SELECT count(*) FROM users) AS total_users,
  (SELECT count(*) FROM admin_users) AS total_admins,
  (SELECT count(*) FROM raffles) AS total_raffles,
  (SELECT count(*) FROM tickets) AS total_tickets,
  (SELECT count(*) FROM payments) AS total_payments;

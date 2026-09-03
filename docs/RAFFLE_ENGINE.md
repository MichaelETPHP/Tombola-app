# YeneEta raffle engine

## Entry rules

- A verified phone account may join at most 3 active raffles at once.
- A participant buys 1–5 tickets per raffle. A second purchase is allowed only while their total remains at or below the raffle limit.
- Tickets are created only after payment confirmation. Failed and pending payments do not receive ticket numbers.
- Each issued ticket is one independent chance in the draw.

## Public codes

Every raffle has a three-letter category code and a sequence number. The final ticket code is:

`{CATEGORY}-{RAFFLE NUMBER}-{TICKET NUMBER}`

Example: `LAP-001-00021`.

Ticket numbers increment inside one raffle, are assigned under a database lock, and are never reused.

## Lifecycle

1. The Platform Owner creates a draft. The API generates a secret server seed and publishes only its SHA-256 commitment.
2. The owner publishes the raffle and paid ticket sales begin.
3. At quota, sales lock and the automatic draw is scheduled for 2 days later.
4. At the scheduled time, the server selects one distinct participant as community draw representative and sends a one-time link. The owner may generate or replace this link manually while the raffle is locked.
5. Opening the link only previews the draw. Pressing **Spin** submits the deliberate one-time draw request.
6. The server combines the precommitted seed with click data, hashes it, and maps the result to one ordered ticket row. The representative cannot influence the outcome and may win only through their own tickets.
7. The winning ticket, revealed seed, commitment, client seed, and final hash are stored for verification. A payout claim is created automatically.

## Deadline extension

An expired raffle below quota stops accepting checkout reservations. It is never extended silently. The Platform Owner must choose a later deadline and provide a reason. The previous deadline, new deadline, ticket count, reason, administrator, and audit entry are retained.

## Trigger-link security

- New raw tokens are returned once and sent to the selected participant.
- Only the SHA-256 token hash is stored in PostgreSQL.
- A link expires after 1 hour and can be used once.
- Generating a replacement immediately invalidates the previous pending link.
- Draw execution locks the trigger and raffle rows in one transaction, so retries and simultaneous clicks cannot create two winners.

## Required migration

Apply `api/src/db/Migration/011_raffle_engine.sql` after migration `010_admin_full_name.sql` before deploying this code.

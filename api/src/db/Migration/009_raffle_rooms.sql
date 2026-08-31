-- A "room" is not a real entity of its own — it's just the chat attached
-- to a raffle. Membership is derived from `tickets` (anyone holding a
-- ticket for a raffle can read/post in its room) rather than duplicated
-- into a separate membership table, so there's nothing to keep in sync.
CREATE TABLE "Tombola_DB".room_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id           UUID NOT NULL REFERENCES "Tombola_DB".raffles(id),
    sender_type         VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'admin')),
    sender_user_id      UUID REFERENCES "Tombola_DB".users(id),
    sender_admin_id     UUID REFERENCES "Tombola_DB".admin_users(id),
    content             TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Exactly one sender column set, matching sender_type — never both,
    -- never neither.
    CONSTRAINT chk_room_message_sender CHECK (
        (sender_type = 'user' AND sender_user_id IS NOT NULL AND sender_admin_id IS NULL) OR
        (sender_type = 'admin' AND sender_admin_id IS NOT NULL AND sender_user_id IS NULL)
    )
);

-- Polling reads "messages after cursor X for raffle Y" — this is the one
-- query the whole feature runs on, so it gets a composite index rather
-- than relying on raffle_id alone plus a sort.
CREATE INDEX idx_room_messages_raffle_created ON "Tombola_DB".room_messages(raffle_id, created_at);

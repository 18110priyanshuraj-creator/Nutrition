ALTER TABLE daily_notes ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS daily_notes_idempotency_key_idx ON daily_notes(idempotency_key) WHERE idempotency_key IS NOT NULL;
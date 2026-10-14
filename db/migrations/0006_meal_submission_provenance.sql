ALTER TABLE meal_logs ADD COLUMN request_hash TEXT;
ALTER TABLE meal_items ADD COLUMN portion_amount REAL;
ALTER TABLE meal_items ADD COLUMN portion_unit TEXT;
ALTER TABLE meal_items ADD COLUMN portion_source TEXT NOT NULL DEFAULT 'estimated';
ALTER TABLE meal_items ADD COLUMN preparation_snapshot TEXT NOT NULL DEFAULT 'as described';
ALTER TABLE meal_items ADD COLUMN portion_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS meal_item_correction_requests (
  idempotency_key TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

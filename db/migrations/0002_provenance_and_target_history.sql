ALTER TABLE foods ADD COLUMN source_url TEXT;
ALTER TABLE foods ADD COLUMN source_record_id TEXT;
ALTER TABLE foods ADD COLUMN source_basis TEXT;
ALTER TABLE foods ADD COLUMN last_verified_at TEXT;
ALTER TABLE foods ADD COLUMN source_license_note TEXT;
ALTER TABLE foods ADD COLUMN nutrient_provenance_json TEXT;
CREATE TABLE IF NOT EXISTS nutrient_target_history (
 id TEXT PRIMARY KEY,
 nutrient_key TEXT NOT NULL,
 previous_target REAL,
 next_target REAL,
 previous_min REAL,
 next_min REAL,
 previous_max REAL,
 next_max REAL,
 unit TEXT NOT NULL,
 changed_at TEXT NOT NULL,
 change_source TEXT NOT NULL DEFAULT 'settings'
);
CREATE INDEX IF NOT EXISTS nutrient_target_history_key_date_idx ON nutrient_target_history(nutrient_key, changed_at);
CREATE TABLE IF NOT EXISTS food_data_imports (
 id TEXT PRIMARY KEY,
 dataset_name TEXT NOT NULL,
 dataset_version TEXT NOT NULL,
 source_url TEXT NOT NULL,
 source_license_note TEXT NOT NULL,
 record_count INTEGER NOT NULL,
 imported_at TEXT NOT NULL
);
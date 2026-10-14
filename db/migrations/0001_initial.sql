CREATE TABLE IF NOT EXISTS schema_migrations (
 version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profiles (
 id INTEGER PRIMARY KEY CHECK(id=1), display_name TEXT NOT NULL DEFAULT 'My profile',
 age INTEGER NOT NULL DEFAULT 17, sex TEXT NOT NULL DEFAULT 'male', height_cm REAL NOT NULL DEFAULT 160,
 weight_kg REAL NOT NULL DEFAULT 47, country TEXT NOT NULL DEFAULT 'India',
 diet_preference TEXT NOT NULL DEFAULT 'vegetarian', region TEXT NOT NULL DEFAULT 'Indian home-cooked',
 exercise_frequency TEXT NOT NULL DEFAULT '4–5 days/week', exercise_time TEXT NOT NULL DEFAULT 'Morning',
 timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', units TEXT NOT NULL DEFAULT 'metric',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nutrient_targets (
 nutrient_key TEXT PRIMARY KEY, target REAL, target_min REAL, target_max REAL, unit TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS foods (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]',
 preparation TEXT NOT NULL DEFAULT 'as described', nutrients_json TEXT NOT NULL,
 servings_json TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL, source_version TEXT NOT NULL,
 confidence TEXT NOT NULL CHECK(confidence IN ('verified','estimate','user')),
 completeness TEXT NOT NULL DEFAULT 'partial', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS foods_name_idx ON foods(name);
CREATE TABLE IF NOT EXISTS meal_logs (
 id TEXT PRIMARY KEY, logged_at TEXT NOT NULL, local_date TEXT NOT NULL, meal_type TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'manual', original_text TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS meal_logs_date_idx ON meal_logs(local_date,logged_at);
CREATE TABLE IF NOT EXISTS meal_items (
 id TEXT PRIMARY KEY, meal_id TEXT NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
 food_id TEXT REFERENCES foods(id) ON DELETE SET NULL, food_name TEXT NOT NULL,
 grams REAL NOT NULL CHECK(grams>0 AND grams<=10000), nutrients_json TEXT NOT NULL,
 per100g_snapshot_json TEXT NOT NULL, source_snapshot TEXT NOT NULL, confidence_snapshot TEXT NOT NULL,
 portion_estimated INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS meal_items_meal_idx ON meal_items(meal_id);
CREATE TABLE IF NOT EXISTS measurements (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('weight','height','water','sleep','exercise')),
 value REAL NOT NULL CHECK(value>=0), unit TEXT NOT NULL, activity_type TEXT, note TEXT NOT NULL DEFAULT '',
 recorded_at TEXT NOT NULL, local_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS measurements_date_idx ON measurements(local_date,kind);
CREATE TABLE IF NOT EXISTS daily_notes (
 id TEXT PRIMARY KEY, local_date TEXT NOT NULL, note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS daily_notes_date_idx ON daily_notes(local_date);
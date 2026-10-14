CREATE TABLE IF NOT EXISTS recipes (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 servings REAL NOT NULL CHECK(servings>0 AND servings<=10000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS recipes_name_idx ON recipes(name);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
 id TEXT PRIMARY KEY,
 recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
 food_id TEXT REFERENCES foods(id) ON DELETE SET NULL,
 food_name TEXT NOT NULL,
 grams REAL NOT NULL CHECK(grams>0 AND grams<=10000),
 nutrients_json TEXT NOT NULL,
 per100g_snapshot_json TEXT NOT NULL,
 source_snapshot TEXT NOT NULL,
 confidence_snapshot TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON recipe_ingredients(recipe_id,position);
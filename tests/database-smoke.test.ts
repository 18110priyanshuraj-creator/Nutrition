import Database from "better-sqlite3";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

vi.mock("@/lib/server-auth", () => ({requireOwner: async () => null}));

const originalDatabasePath = process.env.DATABASE_PATH;
let temporaryDirectory: string | undefined;
let closeDatabase: (() => void) | undefined;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "mynutri-db-smoke-"));
  const databasePath = join(temporaryDirectory, "smoke.sqlite");
  process.env.DATABASE_PATH = databasePath;
  const legacy = new Database(databasePath);
  try {
    legacy.exec(readFileSync(join(process.cwd(), "db/migrations/0001_initial.sql"), "utf8"));
    legacy.prepare("INSERT INTO schema_migrations(version) VALUES(?)").run("0001_initial.sql");
    legacy.prepare("INSERT INTO profiles (id,display_name,age,sex,height_cm,weight_kg,country,diet_preference,region,exercise_frequency,exercise_time,timezone,units,created_at,updated_at) VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("Existing fixture profile", 32, "other", 170, 70, "India", "vegan", "test region", "Often", "Morning", "Asia/Kolkata", "metric", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    legacy.prepare("INSERT INTO foods (id,name,aliases_json,preparation,nutrients_json,servings_json,source,source_version,confidence,completeness,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run("milk-cow-toned", "Cow milk, toned", "[]", "fixture", JSON.stringify({kcal: 61}), "[]", "migration fixture", "v1", "estimate", "partial", "2026-01-01T00:00:00.000Z");
    legacy.prepare("INSERT INTO meal_logs (id,logged_at,local_date,meal_type,source,original_text,note,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run("legacy-meal", "2026-10-12T04:00:00.000Z", "2026-10-12", "Breakfast", "manual", "", "", null, "2026-10-12T04:00:00.000Z", "2026-10-12T04:00:00.000Z");
    legacy.prepare("INSERT INTO meal_items (id,meal_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,portion_estimated,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run("legacy-item", "legacy-meal", "milk-cow-toned", "Cow milk, toned", 100, JSON.stringify({kcal: 61}), JSON.stringify({kcal: 61}), "migration fixture", "estimate", 0, "2026-10-12T04:00:00.000Z");
    legacy.prepare("INSERT INTO measurements (id,kind,value,unit,activity_type,note,recorded_at,local_date) VALUES(?,?,?,?,?,?,?,?)")
      .run("legacy-measurement", "weight", 70, "kg", null, "", "2026-10-12T04:00:00.000Z", "2026-10-12");
    legacy.prepare("INSERT INTO daily_notes (id,local_date,note,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run("legacy-note", "2026-10-12", "Preserve this note", "2026-10-12T04:00:00.000Z", "2026-10-12T04:00:00.000Z");
  } finally {
    legacy.close();
  }
});

afterAll(async () => {
  try {
    closeDatabase?.();
  } finally {
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    if (temporaryDirectory) await rm(temporaryDirectory, {recursive: true, force: true});
  }
});

function request(path: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : {"content-type": "application/json", origin: "http://localhost"},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("temporary SQLite-backed meal API", () => {
  it("rejects malformed, incomplete, and reversed measurement date ranges", async () => {
    const {GET} = await import("../app/api/measurements/route");

    for (const query of [
      "?from=2026-02-31&to=2026-03-01",
      "?from=2026-03-01",
      "?to=2026-03-01",
      "?from=2026-03-02&to=2026-03-01",
    ]) {
      const response = await GET(request(`/api/measurements${query}`) as NextRequest);
      expect(response.status).toBe(400);
    }
  });

  it("preserves existing records through later migrations and persists a deterministic meal", async () => {
    const {POST, GET} = await import("../app/api/meals/route");
    const {getDb} = await import("../src/lib/db");
    const db = getDb();
    closeDatabase = () => db.close();
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({count: 6});
    expect(db.prepare("PRAGMA table_info(agent_tasks)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({name: "request"}),
      expect.objectContaining({name: "status"}),
      expect.objectContaining({name: "logs"}),
      expect.objectContaining({name: "checks_json"}),
    ]));
    expect(db.prepare("SELECT display_name,age FROM profiles WHERE id=1").get()).toEqual({
      display_name: "Existing fixture profile",
      age: 32,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM foods WHERE id='milk-cow-toned'").get()).toMatchObject({count: 1});
    expect(db.prepare("SELECT COUNT(*) AS count FROM meal_logs WHERE id='legacy-meal'").get()).toMatchObject({count: 1});
    expect(db.prepare("SELECT COUNT(*) AS count FROM meal_items WHERE id='legacy-item'").get()).toMatchObject({count: 1});
    expect(db.prepare("SELECT COUNT(*) AS count FROM measurements WHERE id='legacy-measurement'").get()).toMatchObject({count: 1});
    expect(db.prepare("SELECT note FROM daily_notes WHERE id='legacy-note'").get()).toEqual({note: "Preserve this note"});

    const meal = {
      localDate: "2026-10-13",
      mealType: "Breakfast",
      source: "manual",
      idempotencyKey: "e7dd7c08-7cf7-4e25-9e6c-668db6448174",
      items: [{foodId: "milk-cow-toned", grams: 100, portionEstimated: true, portionAmount: 1, portionUnit: "glass", portionSource: "estimated", preparation: "liquid", portionNote: "Approximate household glass."}],
    };
    const crossOrigin = new NextRequest("http://localhost/api/meals", {
      method: "POST",
      headers: {"content-type": "application/json", origin: "https://untrusted.example"},
      body: JSON.stringify(meal),
    });
    expect((await POST(crossOrigin)).status).toBe(403);
    const created = await POST(request("/api/meals", "POST", meal) as NextRequest);
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.meal.items[0]).toMatchObject({foodId: "milk-cow-toned", grams: 100, portionAmount: 1, portionUnit: "glass", portionSource: "estimated", preparation: "liquid", portionNote: "Approximate household glass."});
    expect(createdBody.meal.items[0].nutrients.kcal).toBe(61);

    const persistedItem = db.prepare("SELECT portion_amount, portion_unit, portion_source, preparation_snapshot, portion_note FROM meal_items WHERE id=?").get(createdBody.meal.items[0].id) as Record<string, unknown>;
    expect(persistedItem).toEqual({
      portion_amount: 1,
      portion_unit: "glass",
      portion_source: "estimated",
      preparation_snapshot: "liquid",
      portion_note: "Approximate household glass.",
    });

    const duplicate = await POST(request("/api/meals", "POST", meal) as NextRequest);
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).duplicateRequest).toBe(true);

    const mealRoutes = await import("../app/api/meals/[id]/route");
    const context = {params: Promise.resolve({id: createdBody.meal.id})};
    const correction = {
      idempotencyKey: "6032fc17-52ee-4f24-8430-25ea18bb7aa4",
      items: [{foodId: "milk-cow-toned", grams: 129, portionEstimated: true, portionAmount: 0.5, portionUnit: "glass", portionSource: "estimated", preparation: "liquid", portionNote: "Estimated half glass."}],
    };
    const addedCorrection = await mealRoutes.POST(request(`/api/meals/${createdBody.meal.id}`, "POST", correction) as NextRequest, context);
    expect(addedCorrection.status).toBe(201);
    const correctedBody = await addedCorrection.json();
    expect(correctedBody.meal.items).toHaveLength(2);
    const duplicateCorrection = await mealRoutes.POST(request(`/api/meals/${createdBody.meal.id}`, "POST", correction) as NextRequest, context);
    expect(duplicateCorrection.status).toBe(200);
    expect((await duplicateCorrection.json()).duplicateRequest).toBe(true);
    const edited = await mealRoutes.PATCH(request(`/api/meals/${createdBody.meal.id}`, "PATCH", {
      itemId: correctedBody.meal.items[1].id,
      foodId: "milk-cow-toned",
      grams: 150,
    }) as NextRequest, context);
    expect(edited.status).toBe(200);
    expect((await edited.json()).meal.items[1]).toMatchObject({
      grams: 150,
      portionEstimated: false,
      portionAmount: 150,
      portionUnit: "g",
      portionSource: "explicit",
    });

    const reusedKey = await POST(request("/api/meals", "POST", {...meal, mealType: "Lunch"}) as NextRequest);
    expect(reusedKey.status).toBe(409);
    const partialFailure = await POST(request("/api/meals", "POST", {
      ...meal,
      idempotencyKey: "706afbe4-210a-4a15-9264-a0b16f4d4286",
      items: [{foodId: "milk-cow-toned", grams: 100}, {foodId: "missing-food", grams: 100}],
    }) as NextRequest);
    expect(partialFailure.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS count FROM meal_logs WHERE idempotency_key='706afbe4-210a-4a15-9264-a0b16f4d4286'").get()).toMatchObject({count: 0});

    const listed = await GET(request("/api/meals?date=2026-10-13") as NextRequest);
    expect(listed.status).toBe(200);
    expect((await listed.json()).meals).toHaveLength(1);
  });
});

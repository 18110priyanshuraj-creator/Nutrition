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
  process.env.DATABASE_PATH = join(temporaryDirectory, "smoke.sqlite");
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
    headers: body === undefined ? undefined : {"content-type": "application/json"},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("temporary SQLite-backed meal API", () => {
  it("migrates an isolated database and persists/retrieves a deterministic meal", async () => {
    const {POST, GET} = await import("../app/api/meals/route");
    const {getDb} = await import("../src/lib/db");
    const db = getDb();
    closeDatabase = () => db.close();
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({count: 4});

    const meal = {
      localDate: "2026-10-13",
      mealType: "Breakfast",
      source: "manual",
      idempotencyKey: "e7dd7c08-7cf7-4e25-9e6c-668db6448174",
      items: [{foodId: "milk-cow-toned", grams: 100}],
    };
    const created = await POST(request("/api/meals", "POST", meal) as NextRequest);
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.meal.items[0]).toMatchObject({foodId: "milk-cow-toned", grams: 100});
    expect(createdBody.meal.items[0].nutrients.kcal).toBe(61);

    const duplicate = await POST(request("/api/meals", "POST", meal) as NextRequest);
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).duplicateRequest).toBe(true);

    const listed = await GET(request("/api/meals?date=2026-10-13") as NextRequest);
    expect(listed.status).toBe(200);
    expect((await listed.json()).meals).toHaveLength(1);
  });
});

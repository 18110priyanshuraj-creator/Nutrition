import {createHash} from "node:crypto";
import {requireOwner} from "@/lib/server-auth";
import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {calculateNutrients} from "@/lib/nutrition-core";
import {indiaDate, isDate, mealsForDate} from "@/lib/server-data";
import {isSameOriginRequest} from "@/lib/server-origin";

export const runtime = "nodejs";

const itemSchema = z.object({
  foodId: z.string().min(1).max(100),
  grams: z.number().positive().max(10_000),
  portionEstimated: z.boolean().default(false),
  portionAmount: z.number().positive().max(10_000).optional(),
  portionUnit: z.string().trim().min(1).max(24).optional(),
  portionSource: z.enum(["explicit", "estimated", "manual"]).default("manual"),
  preparation: z.string().max(160).default("as described"),
  portionNote: z.string().max(300).default(""),
});

const mealSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  loggedAt: z.string().datetime().optional(),
  mealType: z.string().trim().min(1).max(40),
  source: z.enum(["manual", "text", "photo"]).default("manual"),
  originalText: z.string().max(4000).default(""),
  note: z.string().max(1000).default(""),
  idempotencyKey: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(30),
});

function canonicalRequestHash(value: z.infer<typeof mealSchema>): string {
  const items = value.items
    .map(item => ({
      foodId: item.foodId,
      grams: item.grams,
      portionEstimated: item.portionEstimated,
      portionAmount: item.portionAmount ?? null,
      portionUnit: item.portionUnit ?? null,
      portionSource: item.portionSource,
      preparation: item.preparation,
      portionNote: item.portionNote,
    }))
    .sort((a, b) => a.foodId.localeCompare(b.foodId) || a.grams - b.grams);
  return createHash("sha256").update(JSON.stringify({
    localDate: value.localDate ?? null,
    loggedAt: value.loggedAt ?? null,
    mealType: value.mealType,
    source: value.source,
    originalText: value.originalText,
    note: value.note,
    items,
  })).digest("hex");
}

function savedMeal(id: string, date: string): Record<string, unknown> | null {
  return mealsForDate(date).find(meal => meal.id === id) ?? null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireOwner(request);
  if (unauthorized) return unauthorized;
  const date = request.nextUrl.searchParams.get("date") || indiaDate();
  if (!isDate(date)) return NextResponse.json({error: "Date must be YYYY-MM-DD."}, {status: 400});
  return NextResponse.json({date, meals: mealsForDate(date)}, {headers: {"Cache-Control": "no-store"}});
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireOwner(request);
  if (unauthorized) return unauthorized;
  if (!isSameOriginRequest(request)) return NextResponse.json({error: "Cross-origin meal submissions are not allowed."}, {status: 403});
  const parsed = mealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error: "Meal fields or portion sizes are invalid."}, {status: 400});

  const loggedAt = parsed.data.loggedAt || new Date().toISOString();
  const date = parsed.data.localDate || indiaDate(new Date(loggedAt));
  if (!isDate(date)) return NextResponse.json({error: "Invalid meal date."}, {status: 400});
  const requestHash = canonicalRequestHash(parsed.data);
  const db = getDb();
  const mealId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const save = db.transaction(() => {
      const existing = db.prepare("SELECT id,local_date,request_hash FROM meal_logs WHERE idempotency_key=?")
        .get(parsed.data.idempotencyKey) as {id: string; local_date: string; request_hash: string | null} | undefined;
      if (existing) {
        if (existing.request_hash && existing.request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
        return {id: existing.id, date: existing.local_date, duplicate: true};
      }

      db.prepare("INSERT INTO meal_logs(id,logged_at,local_date,meal_type,source,original_text,note,idempotency_key,created_at,updated_at,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(mealId, loggedAt, date, parsed.data.mealType, parsed.data.source, parsed.data.originalText, parsed.data.note, parsed.data.idempotencyKey, now, now, requestHash);
      const insert = db.prepare("INSERT INTO meal_items(id,meal_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,portion_estimated,portion_amount,portion_unit,portion_source,preparation_snapshot,portion_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      for (const item of parsed.data.items) {
        const food = db.prepare("SELECT * FROM foods WHERE id=?").get(item.foodId) as Record<string, unknown> | undefined;
        if (!food) throw new Error("FOOD_NOT_FOUND");
        const per100g = JSON.parse(String(food.nutrients_json)) as Record<string, number>;
        const nutrients = calculateNutrients(per100g, item.grams);
        insert.run(
          crypto.randomUUID(), mealId, item.foodId, String(food.name), item.grams,
          JSON.stringify(nutrients), JSON.stringify(per100g), String(food.source), String(food.confidence),
          item.portionEstimated ? 1 : 0, item.portionAmount ?? null, item.portionUnit ?? null,
          item.portionSource, item.preparation || String(food.preparation), item.portionNote,
        );
      }
      return {id: mealId, date, duplicate: false};
    }).immediate();
    const meal = savedMeal(save.id, save.date);
    if (!meal) return NextResponse.json({error: "The meal was saved but its canonical result could not be loaded."}, {status: 500});
    return NextResponse.json({ok: true, duplicateRequest: save.duplicate, meal}, {status: save.duplicate ? 200 : 201});
  } catch (error) {
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") {
      return NextResponse.json({error: "This submission key was already used for different meal data. Start a new submission."}, {status: 409});
    }
    if (error instanceof Error && error.message === "FOOD_NOT_FOUND") {
      return NextResponse.json({error: "One selected food is no longer in the catalog. Refresh and try again."}, {status: 400});
    }
    return NextResponse.json({error: "Could not save the meal. Review portions and retry with the same submission."}, {status: 500});
  }
}

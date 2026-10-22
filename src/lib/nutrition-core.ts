import type {NutrientDefinition} from "./nutrients";

export type NutrientValues = Record<string, number | null | undefined>;
export type FoodLike = {id: string; name: string; aliases?: string[]; nutrients: NutrientValues; source?: string; confidence?: string};
export type IntakeItem = {nutrients: NutrientValues};

export function calculateNutrients(per100g: NutrientValues, grams: number): NutrientValues {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 10_000) {
    throw new Error("Portion must be greater than 0 g and at most 10,000 g.");
  }
  const result: NutrientValues = {};
  for (const [key, value] of Object.entries(per100g)) {
    if (typeof value === "number" && Number.isFinite(value)) result[key] = value * grams / 100;
  }
  return result;
}

export type NutrientAggregate = {amount: number; complete: boolean; unknownCount: number; itemCount: number};

export function aggregateIntake(items: IntakeItem[], definitions: NutrientDefinition[]): Record<string, NutrientAggregate> {
  const result: Record<string, NutrientAggregate> = {};
  for (const nutrient of definitions) {
    if (nutrient.qualitative) continue;
    let amount = 0;
    let unknownCount = 0;
    for (const item of items) {
      const value = item.nutrients[nutrient.key];
      if (typeof value === "number" && Number.isFinite(value)) amount += value;
      else unknownCount += 1;
    }
    result[nutrient.key] = {amount, complete: items.length > 0 && unknownCount === 0, unknownCount, itemCount: items.length};
  }
  return result;
}

export function getRemaining(target: number | null | undefined, intake: number | null | undefined): number | null {
  if (target === null || target === undefined || !Number.isFinite(target) || target <= 0 ||
      intake === null || intake === undefined || !Number.isFinite(intake)) return null;
  return Math.max(0, target - intake);
}

export function getProgress(target: number | null | undefined, intake: number | null | undefined): number | null {
  if (target === null || target === undefined || !Number.isFinite(target) || target <= 0 ||
      intake === null || intake === undefined || !Number.isFinite(intake)) return null;
  return intake / target * 100;
}

export function initialMacroEnergy() {
  const proteinKcal = 80 * 4;
  const carbsKcal = 300 * 4;
  const fatKcal = 75 * 9;
  const impliedKcal = proteinKcal + carbsKcal + fatKcal;
  return {proteinKcal, carbsKcal, fatKcal, impliedKcal, targetKcal: 2400, gapKcal: 2400 - impliedKcal};
}

export type PortionConversion = {
  grams: number;
  estimated: boolean;
  source: "user-specified" | "food-specific estimate";
  note: string;
};

const unitAliases: Record<string, string> = {
  gram: "g", grams: "g", gm: "g", kilogram: "kg", kilograms: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", half: "half", halves: "half", serving: "serving", servings: "serving",
  banana: "piece", bananas: "piece", egg: "piece", eggs: "piece",
  chapati: "roti", chapathis: "roti", rotis: "roti",
  bowlful: "bowl", bowls: "bowl", cups: "cup", glasses: "glass",
  tablespoon: "tbsp", tablespoons: "tbsp", teaspoon: "tsp", teaspoons: "tsp",
};

function foodKind(foodName: string): string {
  const name = foodName.toLocaleLowerCase().normalize("NFKC");
  if (/sattu|roasted gram flour|bhuna chana|सत्तू/.test(name)) return "sattu-powder";
  if (/almond|badam|बादाम/.test(name)) return "almond";
  if (/walnut|akhrot|अखरोट/.test(name)) return "walnut";
  if (/amla|gooseberry|आंवला/.test(name)) return "amla";
  if (/moringa|drumstick leaf|सहजन/.test(name) && /powder|churna|पाउडर/.test(name)) return "moringa-powder";
  if (/rice|chawal|चावल/.test(name) && /cooked|boiled|पका|चावल/.test(name)) return "cooked-rice";
  if (/roti|chapati|chapathi|phulka|रोटी|चपाती/.test(name)) return "roti";
  if (/dal|daal|lentil|दाल/.test(name) && /cooked|boiled|दाल/.test(name)) return "cooked-dal";
  if (/milk|doodh|दूध/.test(name)) return "milk";
  if (/banana|kela|केला/.test(name)) return "banana";
  if (/egg|anda|अंडा/.test(name)) return "egg";
  return "";
}

function householdGrams(kind: string, unit: string): number | null {
  const portions: Record<string, Record<string, number>> = {
    "sattu-powder": {serving: 30, tsp: 2.7, tbsp: 8, cup: 90},
    almond: {piece: 1.2, tbsp: 9, cup: 143},
    walnut: {piece: 4, half: 2, tbsp: 7.5, cup: 117},
    amla: {piece: 35},
    "moringa-powder": {tsp: 2.5, tbsp: 7.5},
    "cooked-rice": {katori: 150, bowl: 180, cup: 158},
    roti: {piece: 40, roti: 40},
    "cooked-dal": {katori: 150, bowl: 180, cup: 240},
    milk: {ml: 1.03, glass: 258, cup: 247, tbsp: 15.45, tsp: 5.15},
    banana: {piece: 118},
    egg: {piece: 50},
  };
  return portions[kind]?.[unit] ?? null;
}

const portionEstimateNotes: Record<string, string> = {
  almond: "Approximate kernel weight based on USDA FoodData Central SR Legacy record 170567 (1 almond = 1.2 g); nutrient values in this catalog record remain provisional.",
  walnut: "Approximate edible-kernel weight based on USDA FoodData Central SR Legacy record 170187 (28 g edible yield for 7 nuts; 28.35 g for 14 halves); shells excluded.",
  "sattu-powder": "Approximate 30 g starter serving of dry sattu flour; estimate only and not a verified nutrient database record.",
};

export function unitToGrams(amount: number, unit: string, foodName = ""): PortionConversion {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Quantity must be greater than zero.");
  const normalizedUnit = unit.toLocaleLowerCase().trim();
  const canonicalUnit = unitAliases[normalizedUnit] ?? normalizedUnit;
  let grams: number;
  let estimated: boolean;
  if (canonicalUnit === "g") {
    grams = amount;
    estimated = false;
  } else if (canonicalUnit === "kg") {
    grams = amount * 1000;
    estimated = false;
  } else {
    const kind = foodKind(foodName);
    if (kind === "walnut" && (/in[- ]shell|with shell/i.test(foodName) ||
        (/whole walnut/i.test(foodName) && !/whole walnut kernel|walnut kernel/i.test(foodName)))) {
      throw new Error("Walnut portions must describe edible kernels; in-shell weight is not supported.");
    }
    const converted = householdGrams(kind, canonicalUnit);
    if (converted === null) throw new Error("This unit has no supported conversion for the selected food. Enter grams or choose a supported food-specific serving.");
    grams = amount * converted;
    estimated = true;
  }
  if (!Number.isFinite(grams) || grams <= 0 || grams > 10_000) {
    throw new Error("Converted portion must be greater than 0 g and at most 10,000 g.");
  }
  grams = Math.round(grams * 1000) / 1000;
  return {
    grams,
    estimated,
    source: estimated ? "food-specific estimate" : "user-specified",
    note: estimated
      ? portionEstimateNotes[foodKind(foodName)] ?? "Provisional food-specific household estimate; approximate and not verified IFCT/ICMR-NIN data."
      : "Gram quantity supplied directly by the user.",
  };
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^{}()|[\]\\$]/g, "\\$&");
}

export type ParsedCandidate = {
  foodId: string;
  name: string;
  grams: number | null;
  amount: number | null;
  unit: string | null;
  estimated: boolean;
  confidence: "medium";
  note: string;
};

const quantityPattern = String.raw`(\d+(?:[.,]\d+)?)\s*(kilograms?|kg|grams?|gm|g|millilit(?:er|re)s?|ml|pieces?|pcs?|halves?|half|roti|chapatis?|katoris?|bowls?|cups?|glasses?|tablespoons?|tbsp|teaspoons?|tsp)?`;

function portionBefore(text: string): {amount: number; unit: string} | null {
  const match = new RegExp(String.raw`(?:^|[\s,;])${quantityPattern}\s*$`, "i").exec(text);
  return match ? {amount: Number(match[1].replace(",", ".")), unit: match[2] ?? ""} : null;
}

function portionAfter(text: string): {amount: number; unit: string} | null {
  const match = new RegExp(String.raw`^\s*${quantityPattern}`, "i").exec(text);
  return match ? {amount: Number(match[1].replace(",", ".")), unit: match[2] ?? ""} : null;
}

export function parseKnownFoods(text: string, foods: FoodLike[]): ParsedCandidate[] {
  const normalized = text.toLocaleLowerCase().normalize("NFKC").replace(/[०-९]/g, digit => String("०१२३४५६७८९".indexOf(digit)));
  const output: ParsedCandidate[] = [];
  const sorted = [...foods].sort((a, b) =>
    Math.max(b.name.length, ...(b.aliases ?? []).map(alias => alias.length)) -
    Math.max(a.name.length, ...(a.aliases ?? []).map(alias => alias.length))
  );
  const used = new Set<string>();
  for (const food of sorted) {
    const aliases = [food.name, ...(food.aliases ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      const pattern = new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegex(alias.toLocaleLowerCase())}(?![\p{L}\p{N}])`, "giu");
      const match = pattern.exec(normalized);
      if (!match || used.has(food.id)) continue;
      const before = portionBefore(normalized.slice(0, match.index));
      const after = portionAfter(normalized.slice(match.index + match[0].length));
      const quantity = after ?? before;
      const kind = foodKind(food.name);
      const isCountFood = Boolean(kind && householdGrams(kind, "piece") !== null);
      const defaultUnit = isCountFood ? "piece" : householdGrams(kind, "serving") !== null ? "serving" : "";
      const amount = quantity?.amount ?? 1;
      const unit = quantity?.unit || defaultUnit;
      const itemContext = normalized.slice(Math.max(0, match.index - 24), match.index + match[0].length + 24);
      let converted: PortionConversion | null = null;
      let note = "";
      try {
        if (foodKind(food.name) === "walnut" && /in[- ]shell|with shell|whole walnut/i.test(itemContext) && !/kernel/i.test(itemContext)) {
          throw new Error("Walnut portions must describe edible kernels; in-shell or ambiguous whole-walnut weights are not supported.");
        }
        if (unit) converted = unitToGrams(amount, unit, food.name);
        else throw new Error("No quantity or supported default portion was stated; enter an explicit portion.");
      } catch (error) {
        note = error instanceof Error ? error.message : "Portion needs clarification.";
      }
      if (converted && !quantity) {
        note = "Quantity was not stated; one food-specific " + (unit === "piece" ? "piece" : "serving") + " estimate was used. " + converted.note;
      } else if (converted && quantity && !quantity.unit) {
        note = "The count was interpreted using a food-specific piece estimate. " + converted.note;
      } else if (converted) {
        note = converted.note;
      }
      output.push({
        foodId: food.id,
        name: food.name,
        grams: converted?.grams ?? null,
        amount: quantity?.amount ?? (converted ? 1 : null),
        unit: quantity?.unit || (unit || null),
        estimated: converted?.estimated ?? true,
        confidence: "medium",
        note,
      });
      used.add(food.id);
      break;
    }
  }
  return output;
}

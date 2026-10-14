"use client";

import {useState} from "react";
import {NUTRIENTS, formatNutrient} from "@/lib/nutrients";
import {AlertTriangle, Check, Trash2} from "lucide-react";
import styles from "./meal-log-result.module.css";

type RecordRow = Record<string, unknown>;
export type CorrectionCandidate = {
  key: string;
  foodId: string | null;
  foodName: string;
  grams: number | null;
  amount: number | null;
  unit: string | null;
  portionEstimated: boolean;
  confidence: string;
  preparation: string;
  notes: string;
  portionNote: string;
};

type CorrectionSelection = {foodId: string; grams: number; candidate: CorrectionCandidate};
type Props = {
  meal: RecordRow | null;
  candidates: CorrectionCandidate[];
  foods: Array<{id: string; name: string}>;
  saving: boolean;
  onSaveCorrections: (items: CorrectionSelection[]) => void;
  onViewDiary: () => void;
  onEdit: () => void;
  onUndo: () => void;
};

const macroKeys = ["kcal", "protein_g", "carbs_g", "fat_g"] as const;

export default function MealLogResult({meal, candidates, foods, saving, onSaveCorrections, onViewDiary, onEdit, onUndo}: Props) {
  const [selections, setSelections] = useState<Record<string, {foodId: string; grams: string}>>({});
  const items = Array.isArray(meal?.items) ? meal.items as RecordRow[] : [];
  const nutrients = NUTRIENTS.filter(item => !item.qualitative);
  const knownNutrientCount = items.reduce((count, item) =>
    count + nutrients.filter(nutrient => typeof (item.nutrients as Record<string, unknown> | undefined)?.[nutrient.key] === "number").length, 0
  );
  const totalNutrientCount = items.length * nutrients.length;

  function saveCorrections() {
    const corrected = candidates.flatMap(candidate => {
      const selection = selections[candidate.key];
      const grams = Number(selection?.grams ?? candidate.grams ?? "");
      if (!selection?.foodId || !Number.isFinite(grams) || grams <= 0 || grams > 10_000) return [];
      return [{foodId: selection.foodId, grams, candidate}];
    });
    if (corrected.length) onSaveCorrections(corrected);
  }

  return (
    <section className={`panel ${styles.result}`} aria-live="polite">
      {meal ? (
        <>
          <div className="panel-header">
            <div>
              <div className="eyebrow">SAVED MEAL</div>
              <h3 className="panel-title">{String(meal.mealType)} · {String(meal.localDate)}</h3>
              <p className="panel-subtitle">{items.length} item(s) · saved {new Date(String(meal.loggedAt)).toLocaleTimeString("en-IN", {timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit"})}</p>
            </div>
            <span className="pill success"><Check size={12}/> Logged</span>
          </div>
          <div className={styles.totals}>
            {macroKeys.map(key => {
              const values = items.map(item => (item.nutrients as Record<string, unknown> | undefined)?.[key]);
              const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
              const total = known.reduce((sum, value) => sum + value, 0);
              const label = NUTRIENTS.find(item => item.key === key)?.label ?? key;
              return <div className={styles.metric} key={key}><span>{label}</span><strong>{known.length === values.length && values.length ? formatNutrient(key, total) : known.length ? `${formatNutrient(key, total)} known · partial` : "Unknown"}</strong></div>;
            })}
          </div>
          <p className={styles.completeness}>Nutrient data: {totalNutrientCount ? `${knownNutrientCount} of ${totalNutrientCount} tracked item values available` : "no nutrient values available"}. Missing values remain unknown.</p>
          {meal.originalText ? <details className={styles.original}><summary>Original description</summary><p>{String(meal.originalText)}</p></details> : null}
          <div className={styles.items}>
            {items.map((item, index) => (
              <div className={styles.item} key={String(item.id ?? index)}>
                <div><strong>{String(item.foodName)}</strong><div className="meal-meta">
                  {item.portionAmount ? `${String(item.portionAmount)} ${String(item.portionUnit ?? "")} → ` : ""}
                  {Number(item.grams).toLocaleString("en-IN", {maximumFractionDigits: 1})} g
                  {item.portionEstimated ? " · estimated portion" : ""}
                </div><div className="meal-meta">{String(item.source ?? "Food catalog")} · {String(item.confidence ?? "estimate")} · {String(item.preparation ?? "as described")}</div>
                {item.portionNote ? <div className="meal-meta">{String(item.portionNote)}</div> : null}</div>
                {item.portionEstimated ? <span className="pill warn">Approximate</span> : null}
              </div>
            ))}
          </div>
          {candidates.length ? (
            <div className={styles.corrections}>
              <div className="notice warning"><AlertTriangle size={15}/><span>Not logged yet: choose a catalog match and portion for each uncertain item. These foods have not been included in the saved totals.</span></div>
              {candidates.map(candidate => {
                const selection = selections[candidate.key] ?? {foodId: candidate.foodId ?? "", grams: candidate.grams === null ? "" : String(candidate.grams)};
                return <div className={styles.correctionRow} key={candidate.key}>
                  <strong>{candidate.foodName}</strong>
                  <span className="candidate-note">{candidate.notes || `${candidate.confidence} confidence`}</span>
                  <label>Catalog match
                    <select className="select-control" value={selection.foodId} onChange={event => setSelections(current => ({...current, [candidate.key]: {...selection, foodId: event.target.value}}))}>
                      <option value="">Choose food…</option>{foods.map(food => <option key={food.id} value={food.id}>{food.name}</option>)}
                    </select>
                  </label>
                  <label>Portion (g)
                    <input className="input-control" type="number" min="0.1" max="10000" step="any" value={selection.grams} onChange={event => setSelections(current => ({...current, [candidate.key]: {...selection, grams: event.target.value}}))}/>
                  </label>
                </div>;
              })}
              <button className="primary-button" type="button" disabled={saving || candidates.some(candidate => {
                const selection = selections[candidate.key] ?? {foodId: candidate.foodId ?? "", grams: candidate.grams === null ? "" : String(candidate.grams)};
                return !selection.foodId || !Number.isFinite(Number(selection.grams)) || Number(selection.grams) <= 0 || Number(selection.grams) > 10_000;
              })} onClick={saveCorrections}>{saving ? "Saving corrections…" : "Save corrected items"}</button>
            </div>
          ) : null}
          <div className={`button-row ${styles.actions}`}>
            <button className="secondary-button" type="button" onClick={onViewDiary}>View in diary</button>
            <button className="secondary-button" type="button" onClick={onEdit}>Edit</button>
            <button className="secondary-button" type="button" onClick={onUndo}><Trash2 size={14}/> Undo meal</button>
          </div>
        </>
      ) : (
        <>
          <h3 className="panel-title">Review only the uncertain items</h3>
          <p className="panel-subtitle">No meal was saved. Choose catalog matches and portions below; the original description is still available above.</p>
          {candidates.map(candidate => {
            const selection = selections[candidate.key] ?? {foodId: candidate.foodId ?? "", grams: candidate.grams === null ? "" : String(candidate.grams)};
            return <div className={styles.correctionRow} key={candidate.key}>
              <strong>{candidate.foodName}</strong><span className="candidate-note">{candidate.notes || `${candidate.confidence} confidence`}</span>
              <label>Catalog match<select className="select-control" value={selection.foodId} onChange={event => setSelections(current => ({...current, [candidate.key]: {...selection, foodId: event.target.value}}))}><option value="">Choose food…</option>{foods.map(food => <option key={food.id} value={food.id}>{food.name}</option>)}</select></label>
              <label>Portion (g)<input className="input-control" type="number" min="0.1" max="10000" step="any" value={selection.grams} onChange={event => setSelections(current => ({...current, [candidate.key]: {...selection, grams: event.target.value}}))}/></label>
            </div>;
          })}
          {candidates.length ? <button className="primary-button" type="button" disabled={saving || candidates.some(candidate => {
            const selection = selections[candidate.key] ?? {foodId: candidate.foodId ?? "", grams: candidate.grams === null ? "" : String(candidate.grams)};
            return !selection.foodId || !Number.isFinite(Number(selection.grams)) || Number(selection.grams) <= 0 || Number(selection.grams) > 10_000;
          })} onClick={saveCorrections}>{saving ? "Saving…" : "Log corrected meal"}</button> : null}
        </>
      )}
    </section>
  );
}

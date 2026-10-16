"use client";

import {NUTRIENTS, formatNutrient} from "@/lib/nutrients";
import {Check, Trash2} from "lucide-react";
import styles from "./meal-log-result.module.css";

type RecordRow = Record<string, unknown>;
type Props = {
  meal: RecordRow;
  onViewDiary: () => void;
  onEdit: () => void;
  onUndo: () => void;
};

const macroKeys = ["kcal", "protein_g", "carbs_g", "fat_g"] as const;

export default function MealLogResult({meal, onViewDiary, onEdit, onUndo}: Props) {
  const items = Array.isArray(meal.items) ? meal.items as RecordRow[] : [];
  const nutrients = NUTRIENTS.filter(item => !item.qualitative);
  const knownNutrientCount = items.reduce((count, item) =>
    count + nutrients.filter(nutrient => typeof (item.nutrients as Record<string, unknown> | undefined)?.[nutrient.key] === "number").length, 0
  );
  const totalNutrientCount = items.length * nutrients.length;

  return (
    <section className={`panel ${styles.result}`} aria-live="polite">
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
      <div className={`button-row ${styles.actions}`}>
        <button className="secondary-button" type="button" onClick={onViewDiary}>View in diary</button>
        <button className="secondary-button" type="button" onClick={onEdit}>Edit</button>
        <button className="secondary-button" type="button" onClick={onUndo}><Trash2 size={14}/> Undo meal</button>
      </div>
    </section>
  );
}

import { useState } from "react";
import MealCard from "./MealCard.jsx";
import { MEAL_SLOTS, MEALS } from "./mealData.js";
import Button from "../UI/Button.jsx";

function ChevronIcon({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SlotRow({ slot, selections, onSelect }) {
  const [open, setOpen] = useState(false);
  const selected = selections[slot.id];
  const meals = MEALS[slot.id];

  return (
    <div>
      {/* Slot header — always visible */}
      <div
        className="slot-header"
        onClick={() => setOpen(o => !o)}
        style={{ outline: "none" }}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setOpen(o => !o)}
        aria-expanded={open}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="slot-time">{slot.time}</span>
          <span className="slot-name">{slot.label}</span>
          {selected && !open && (
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>
              — {selected.name}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selected && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: "var(--green-600)",
              background: "var(--green-50)",
              border: "1px solid var(--green-100)",
              borderRadius: 6, padding: "2px 8px",
            }}>
              {selected.kcal} kcal
            </span>
          )}
          {!selected && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No meal selected</span>
          )}
          <ChevronIcon open={open} />
        </div>
      </div>

      {/* Selected meal summary bar (when collapsed) */}
      {!open && selected && (
        <div className="selected-bar">
          <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { val: selected.kcal, lbl: "kcal",  cls: "macro-kcal" },
              { val: `${selected.protein}g`, lbl: "prot",  cls: "macro-protein" },
              { val: `${selected.carbs}g`,   lbl: "carbs", cls: "macro-carbs" },
              { val: `${selected.fat}g`,     lbl: "fat",   cls: "macro-fat" },
            ].map(m => (
              <span key={m.lbl} className={`macro-chip ${m.cls}`}>
                <span className="macro-val">{m.val}</span>
                <span className="macro-lbl">&nbsp;{m.lbl}</span>
              </span>
            ))}
          </div>
          <Button
            variant="ghost" size="sm"
            style={{ marginLeft: "auto" }}
            onClick={e => { e.stopPropagation(); setOpen(true); }}
          >
            Change
          </Button>
        </div>
      )}

      {/* Expanded meal grid */}
      {open && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
          paddingBottom: 14,
        }}>
          {meals.map(meal => (
            <MealCard
              key={meal.id}
              meal={meal}
              selected={selected?.id === meal.id}
              onSelect={m => { onSelect(slot.id, m); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MatrixGrid({ selections, onSelect }) {
  const filledCount = Object.values(selections).filter(Boolean).length;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 12,
      }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text-primary)" }}>{filledCount}</strong>
          {" / 5 meals selected"}
        </span>
        {filledCount > 0 && (
          <Button
            variant="ghost" size="sm"
            onClick={() => {
              // Clear all — parent needs to expose reset
              MEAL_SLOTS.forEach(s => onSelect(s.id, null));
            }}
          >
            Clear all
          </Button>
        )}
      </div>

      {MEAL_SLOTS.map(slot => (
        <SlotRow
          key={slot.id}
          slot={slot}
          selections={selections}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

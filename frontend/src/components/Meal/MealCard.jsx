/**
 * MealCard — individual selectable meal option
 */
export default function MealCard({ meal, selected, onSelect }) {
  return (
    <div
      className={`meal-card ${selected ? "selected" : ""}`}
      onClick={() => onSelect(meal)}
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(meal)}
    >
      {selected && <div className="meal-card-check">✓</div>}

      <div className="meal-name">{meal.name}</div>

      <div className="macro-row">
        <span className="macro-chip macro-kcal">
          <span className="macro-val">{meal.kcal}</span>
          <span className="macro-lbl">kcal</span>
        </span>
        <span className="macro-chip macro-protein">
          <span className="macro-val">{meal.protein}g</span>
          <span className="macro-lbl">prot</span>
        </span>
        <span className="macro-chip macro-carbs">
          <span className="macro-val">{meal.carbs}g</span>
          <span className="macro-lbl">carbs</span>
        </span>
        <span className="macro-chip macro-fat">
          <span className="macro-val">{meal.fat}g</span>
          <span className="macro-lbl">fat</span>
        </span>
      </div>

      <div className="tag-row">
        {meal.tags.map(t => (
          <span key={t} className="meal-tag">{t}</span>
        ))}
      </div>

      {meal.healthNote && (
        <div style={{
          marginTop: 8, fontSize: 12,
          color: "var(--green-700)",
          borderTop: "1px solid var(--green-100)",
          paddingTop: 8, lineHeight: 1.4,
          fontStyle: "italic",
        }}>
          {meal.healthNote}
        </div>
      )}
    </div>
  );
}

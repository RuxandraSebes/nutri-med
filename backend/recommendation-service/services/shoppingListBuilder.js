/**
 * Build a consolidated shopping list from meal_matrix.weekly (7×4) and optional flat meals.
 */

function consolidateShoppingList(meal_matrix) {
  if (!meal_matrix || typeof meal_matrix !== "object") return [];

  const counts = new Map();

  function addName(name) {
    const n = String(name || "").trim();
    if (!n) return;
    counts.set(n, (counts.get(n) || 0) + 1);
  }

  function consumeFoods(obj) {
    if (!obj || typeof obj !== "object") return;
    const foods = obj.foods;
    if (!Array.isArray(foods)) return;
    for (const f of foods) {
      if (typeof f === "string") addName(f);
      else if (f && typeof f === "object") addName(f.name || f.item || f.food);
    }
  }

  const weekly = meal_matrix.weekly;
  if (weekly && typeof weekly === "object") {
    for (const dayKey of Object.keys(weekly)) {
      const day = weekly[dayKey];
      if (!day || typeof day !== "object") continue;
      for (const mealKey of Object.keys(day)) {
        if (mealKey === "day_total_kcal") continue;
        consumeFoods(day[mealKey]);
      }
    }
  }

  if (Array.isArray(meal_matrix.meals)) {
    for (const m of meal_matrix.meals) {
      consumeFoods(m);
      if (typeof m?.name === "string" && m.name && !Array.isArray(m.foods)) {
        addName(m.name);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([item, n]) => ({
      item,
      qty: n > 1 ? `${n}× across meals` : "1×",
    }));
}

module.exports = { consolidateShoppingList };

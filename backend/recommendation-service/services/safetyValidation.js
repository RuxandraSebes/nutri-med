function normalizeList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return [];
}

function collectAllergenTerms(assembledPatient, assembledSpecialist) {
  const terms = new Set();
  const prefs = assembledPatient?.preferences || {};
  normalizeList(prefs.food_aversions).forEach((t) => terms.add(t));

  const strict = assembledSpecialist?.strict_constraints;
  if (strict && typeof strict === "object") {
    normalizeList(strict.allergies).forEach((t) => terms.add(t));
  }

  const legacyAllergies = assembledSpecialist?.clinical_constraints;
  if (Array.isArray(legacyAllergies)) {
    legacyAllergies
      .filter((c) => c.type === "allergy")
      .forEach((c) => {
        if (c.value) terms.add(String(c.value));
      });
  }

  return [...terms];
}

function flattenPlanText(meal_matrix) {
  if (!meal_matrix) return "";
  try {
    return JSON.stringify(meal_matrix).toLowerCase();
  } catch {
    return String(meal_matrix).toLowerCase();
  }
}

function validateApprovedPlan(assembledPatient, assembledSpecialist, meal_matrix) {
  const errors = [];
  const warnings = [];
  const blob = flattenPlanText(meal_matrix);

  const allergens = collectAllergenTerms(assembledPatient, assembledSpecialist);
  for (const a of allergens) {
    const needle = a.toLowerCase();
    if (needle.length >= 2 && blob.includes(needle)) {
      errors.push(
        `Potential allergen / aversion "${a}" appears in the meal plan text — remove or substitute before publishing.`,
      );
    }
  }

  const disease = (
    assembledSpecialist?.primary_disease ||
    assembledSpecialist?.clinical_assessment?.primary_disease ||
    ""
  ).toLowerCase();

  if (/hypertension|blood pressure|hipertensi/i.test(disease)) {
    if (/\b(bacon|salami|soy sauce|instant noodles|pickled)\b/i.test(blob)) {
      warnings.push(
        "Hypertension context: verify sodium-heavy foods (processed meats, soy sauce, pickles).",
      );
    }
  }

  if (/diabetes|diabet/i.test(disease)) {
    if (/\b(sugar soda|frosting|candy|syrup)\b/i.test(blob)) {
      warnings.push(
        "Diabetes context: verify added sugars / high-GI items in the staged plan.",
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  validateApprovedPlan,
  collectAllergenTerms,
};

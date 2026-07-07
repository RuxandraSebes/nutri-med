export function normalizePlanForDashboard(raw) {
  if (!raw) return null;
  if (raw.plan?.meal_matrix != null || raw.plan?.clinical_strategy != null) {
    return {
      ...raw,
      plan_id: raw.plan_id ?? raw.id,
      status: raw.status ?? raw.plan?.status ?? "pending",
    };
  }

  return {
    plan_id: raw.id,
    id: raw.id,
    status: raw.status ?? "pending",
    patient_id: raw.patient_id,
    specialist_id: raw.specialist_id,
    created_at: raw.created_at,
    plan: {
      clinical_strategy: raw.clinical_strategy ?? "",
      meal_matrix: raw.meal_matrix ?? null,
      shopping_list: raw.shopping_list ?? [],
      llm_outputs: raw.llm_outputs ?? null,
      target_macros: raw.target_macros ?? null,
    },
  };
}

export function planHasMatrix(plan) {
  const normalized = normalizePlanForDashboard(plan);
  const weekly = normalized?.plan?.meal_matrix?.weekly;
  return weekly != null && typeof weekly === "object" && Object.keys(weekly).length > 0;
}

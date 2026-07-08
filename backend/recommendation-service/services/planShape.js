function ragMatrixToPlanShape(ragResult, patient) {
  const { matrix, tdee, clinical_notes, foods_used, validation_warnings } = ragResult;

  const MEAL_TIMES = {
    Breakfast: "08:00",
    Lunch: "13:00",
    Dinner: "19:00",
    Snack: "15:30",
    "Morning Snack": "15:30",
  };

  const DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const firstDay = matrix[DAYS[0]] || {};
  const meals = Object.entries(firstDay)
    .filter(([key]) => key !== "day_total_kcal")
    .map(([mealName, mealData]) => ({
      time: MEAL_TIMES[mealName] || "00:00",
      name: (mealData.foods || []).map((f) => f.name).join(" + "),
      notes: `${mealData.meal_kcal || 0} kcal`,
      foods: mealData.foods || [],
    }));

  const shopping_list = (foods_used || []).map((item) => ({
    item,
    qty: "as needed",
  }));

  return {
    clinical_strategy:
      clinical_notes || "RAG-generated personalized nutrition plan.",
    meal_matrix: {
      day: "7-day plan",
      meals,
      weekly: matrix,
      context: {
        activity_level: patient?.lifestyle?.activity_level || null,
        tdee: tdee?.kcal || null,
        validation_warnings: validation_warnings || [],
      },
    },
    shopping_list,
    llm_outputs: null,
    target_macros: tdee || null,
  };
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient_id: row.patient_id,
    specialist_id: row.specialist_id,
    status: row.status,
    clinical_strategy: row.clinical_strategy,
    meal_matrix: row.meal_matrix,
    shopping_list: row.shopping_list,
    llm_outputs: row.llm_outputs,
    target_macros: row.target_macros,
    created_at: row.created_at,
  };
}

module.exports = {
  ragMatrixToPlanShape,
  rowToApi,
};

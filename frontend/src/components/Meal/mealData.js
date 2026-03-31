export const MEAL_SLOTS = [
  { id: "breakfast",       label: "Breakfast",       time: "08:00" },
  { id: "morning_snack",   label: "Morning Snack",   time: "10:30" },
  { id: "lunch",           label: "Lunch",           time: "13:00" },
  { id: "afternoon_snack", label: "Afternoon Snack", time: "16:00" },
  { id: "dinner",          label: "Dinner",          time: "19:00" },
];

export const MEALS = {
  breakfast: [
    { id: "b1", name: "Oat & Berry Bowl",     kcal: 340, protein: 12, carbs: 58, fat: 7,  tags: ["high-fiber", "low-GI"],     healthNote: "Rich in β-glucan; supports glycaemic control.",   ingredients: [{ item: "Rolled oats",      qty: "80g" }, { item: "Mixed berries",  qty: "100g" }, { item: "Greek yogurt",  qty: "120g" }, { item: "Chia seeds",    qty: "10g" }] },
    { id: "b2", name: "Veggie Omelette",       kcal: 310, protein: 22, carbs: 8,  fat: 18, tags: ["high-protein", "low-carb"], healthNote: "Complete amino acid profile; high satiety.",       ingredients: [{ item: "Eggs (large)",     qty: "3" },   { item: "Spinach",       qty: "60g" },  { item: "Cherry toms",  qty: "80g" },  { item: "Feta cheese",  qty: "30g" }] },
    { id: "b3", name: "Avocado Rye Toast",     kcal: 390, protein: 10, carbs: 42, fat: 20, tags: ["healthy-fats"],             healthNote: "Monounsaturated fats support HDL cholesterol.",    ingredients: [{ item: "Rye bread",        qty: "2 slices" }, { item: "Avocado",    qty: "½ medium" }, { item: "Lemon juice",   qty: "5ml" },  { item: "Seasoning",    qty: "2g" }] },
    { id: "b4", name: "Protein Smoothie",      kcal: 320, protein: 28, carbs: 34, fat: 6,  tags: ["high-protein", "quick"],    healthNote: "Fast-absorbing protein ideal post morning walk.",  ingredients: [{ item: "Whey protein",     qty: "30g" },  { item: "Banana (sm)", qty: "1" },    { item: "Almond milk",  qty: "250ml" }, { item: "Peanut butter", qty: "15g" }] },
    { id: "b5", name: "Greek Yogurt Parfait",  kcal: 280, protein: 18, carbs: 40, fat: 5,  tags: ["probiotic", "low-fat"],     healthNote: "Live cultures support gut microbiome diversity.",  ingredients: [{ item: "Greek yogurt 0%",  qty: "200g" }, { item: "Granola",    qty: "40g" },  { item: "Honey",        qty: "10g" },  { item: "Kiwi",         qty: "1 medium" }] },
    { id: "b6", name: "Buckwheat Pancakes",    kcal: 360, protein: 14, carbs: 52, fat: 9,  tags: ["gluten-free", "complex-carbs"], healthNote: "Rutin content supports vascular integrity.",    ingredients: [{ item: "Buckwheat flour",  qty: "80g" },  { item: "Egg",        qty: "1 large" }, { item: "Oat milk",   qty: "150ml" }, { item: "Maple syrup",  qty: "15ml" }] },
  ],
  morning_snack: [
    { id: "ms1", name: "Apple & Almond Butter", kcal: 210, protein: 5,  carbs: 28, fat: 10, tags: ["low-GI"],           healthNote: "Pectin slows gastric emptying; stable glucose.",    ingredients: [{ item: "Apple (medium)",   qty: "1" },    { item: "Almond butter", qty: "25g" }] },
    { id: "ms2", name: "Cottage Cheese Cup",    kcal: 180, protein: 20, carbs: 8,  fat: 5,  tags: ["high-protein"],     healthNote: "Casein protein provides sustained amino release.",  ingredients: [{ item: "Cottage cheese",   qty: "150g" }, { item: "Pineapple chunks", qty: "50g" }] },
    { id: "ms3", name: "Hummus & Veg Sticks",   kcal: 160, protein: 6,  carbs: 18, fat: 7,  tags: ["plant-based"],      healthNote: "Chickpea-based; iron + folate rich.",               ingredients: [{ item: "Hummus",           qty: "60g" },  { item: "Cucumber",  qty: "80g" },  { item: "Carrot sticks",  qty: "60g" }] },
    { id: "ms4", name: "Mixed Nuts & Dates",    kcal: 240, protein: 6,  carbs: 22, fat: 15, tags: ["energy-dense"],     healthNote: "Magnesium and selenium from nuts support thyroid.", ingredients: [{ item: "Mixed nuts",       qty: "30g" },  { item: "Medjool dates", qty: "2 pcs" }] },
    { id: "ms5", name: "Rice Cakes & Salmon",   kcal: 190, protein: 14, carbs: 20, fat: 5,  tags: ["omega-3"],          healthNote: "DHA from salmon supports neurological function.",   ingredients: [{ item: "Rice cakes",       qty: "2 pcs" }, { item: "Smoked salmon", qty: "40g" }, { item: "Cream cheese light", qty: "20g" }] },
    { id: "ms6", name: "Green Smoothie",        kcal: 170, protein: 5,  carbs: 32, fat: 3,  tags: ["micronutrients"],   healthNote: "Chlorophyll-rich; supports detoxification.",         ingredients: [{ item: "Spinach",          qty: "60g" },  { item: "Green apple", qty: "1 small" }, { item: "Cucumber", qty: "80g" }, { item: "Ginger", qty: "5g" }, { item: "Water", qty: "200ml" }] },
  ],
  lunch: [
    { id: "l1", name: "Grilled Chicken Bowl",   kcal: 480, protein: 42, carbs: 45, fat: 12, tags: ["high-protein", "balanced"],       healthNote: "Leucine-dense protein triggers optimal mTOR.",    ingredients: [{ item: "Chicken breast",  qty: "180g" }, { item: "Brown rice",  qty: "80g" }, { item: "Roasted veg", qty: "150g" }, { item: "Olive oil", qty: "10ml" }] },
    { id: "l2", name: "Mediterranean Salad",    kcal: 420, protein: 18, carbs: 38, fat: 22, tags: ["mediterranean", "anti-inflam."],  healthNote: "Polyphenols from olives reduce CRP markers.",     ingredients: [{ item: "Chickpeas",       qty: "120g" }, { item: "Cucumber",   qty: "100g" }, { item: "Cherry toms", qty: "80g" }, { item: "Feta", qty: "40g" }, { item: "Olives", qty: "30g" }, { item: "Quinoa", qty: "60g" }] },
    { id: "l3", name: "Red Lentil Soup",        kcal: 380, protein: 20, carbs: 58, fat: 6,  tags: ["plant-based", "high-fiber"],      healthNote: "Resistant starch feeds Bifidobacterium.",         ingredients: [{ item: "Red lentils",     qty: "80g" },  { item: "Carrot",     qty: "100g" }, { item: "Celery",     qty: "80g" }, { item: "Onion", qty: "60g" }, { item: "Cumin", qty: "3g" }, { item: "Rye bread", qty: "1 slice" }] },
    { id: "l4", name: "Tuna Noodle Salad",      kcal: 440, protein: 35, carbs: 42, fat: 10, tags: ["omega-3"],                        healthNote: "EPA reduces triglyceride levels.",                 ingredients: [{ item: "Tuna in water",   qty: "150g" }, { item: "Soba noodles", qty: "80g" }, { item: "Edamame", qty: "60g" }, { item: "Sesame oil", qty: "8ml" }, { item: "Soy sauce", qty: "10ml" }] },
    { id: "l5", name: "Turkey Wrap",            kcal: 460, protein: 38, carbs: 40, fat: 14, tags: ["lean-protein"],                   healthNote: "Tryptophan precursor to serotonin.",              ingredients: [{ item: "Whole wheat wrap", qty: "1 large" }, { item: "Turkey breast", qty: "120g" }, { item: "Lettuce", qty: "40g" }, { item: "Tomato", qty: "60g" }, { item: "Avocado", qty: "¼" }, { item: "Mustard", qty: "10g" }] },
    { id: "l6", name: "Salmon & Sweet Potato",  kcal: 520, protein: 40, carbs: 50, fat: 16, tags: ["omega-3", "complex-carbs"],       healthNote: "Vitamin D3 + carotenoids — immune synergy.",     ingredients: [{ item: "Salmon fillet",   qty: "160g" }, { item: "Sweet potato", qty: "200g" }, { item: "Asparagus", qty: "120g" }, { item: "Lemon", qty: "½" }, { item: "Olive oil", qty: "12ml" }] },
  ],
  afternoon_snack: [
    { id: "as1", name: "Low-Sugar Protein Bar", kcal: 200, protein: 20, carbs: 22, fat: 5,  tags: ["convenient"],        healthNote: "Choose bars with <5g added sugar.",                 ingredients: [{ item: "Protein bar (low sugar)", qty: "1 × 55g" }] },
    { id: "as2", name: "Edamame",               kcal: 150, protein: 13, carbs: 12, fat: 6,  tags: ["plant-based"],       healthNote: "Complete plant protein; isoflavones support bones.", ingredients: [{ item: "Edamame (in pod)", qty: "150g" }, { item: "Sea salt", qty: "1g" }] },
    { id: "as3", name: "Dark Choc & Walnuts",   kcal: 220, protein: 5,  carbs: 16, fat: 16, tags: ["antioxidants"],      healthNote: "Flavanols improve endothelial function.",           ingredients: [{ item: "Dark chocolate 85%", qty: "20g" }, { item: "Walnuts", qty: "25g" }] },
    { id: "as4", name: "Pear & Edam",           kcal: 190, protein: 9,  carbs: 22, fat: 8,  tags: ["balanced"],          healthNote: "Calcium + fibre pairing supports satiety.",         ingredients: [{ item: "Pear (medium)",   qty: "1" },    { item: "Edam cheese",  qty: "30g" }] },
    { id: "as5", name: "Kefir & Peach",         kcal: 160, protein: 10, carbs: 18, fat: 4,  tags: ["probiotic"],         healthNote: "50+ probiotic strains; enhances microbiome.",       ingredients: [{ item: "Plain kefir",     qty: "200ml" }, { item: "Peach (small)", qty: "1" }] },
    { id: "as6", name: "Trail Mix",             kcal: 230, protein: 7,  carbs: 24, fat: 13, tags: ["energy"],            healthNote: "Zinc from pumpkin seeds supports immune function.", ingredients: [{ item: "Pumpkin seeds",   qty: "20g" },  { item: "Dried cranberries", qty: "20g" }, { item: "Cashews", qty: "25g" }] },
  ],
  dinner: [
    { id: "d1", name: "Baked Cod & Wild Rice",  kcal: 430, protein: 38, carbs: 36, fat: 12, tags: ["lean-protein", "low-calorie"],   healthNote: "White fish — high protein, low saturated fat.",   ingredients: [{ item: "Cod fillet",      qty: "200g" }, { item: "Zucchini",    qty: "150g" }, { item: "Bell pepper",  qty: "100g" }, { item: "Cherry toms", qty: "80g" }, { item: "Olive oil", qty: "12ml" }, { item: "Wild rice", qty: "60g" }] },
    { id: "d2", name: "Chicken Stir-Fry",       kcal: 460, protein: 40, carbs: 42, fat: 13, tags: ["asian", "high-protein"],         healthNote: "Cruciferous veg (broccoli) supports Phase 2 detox.", ingredients: [{ item: "Chicken thigh",  qty: "180g" }, { item: "Broccoli",    qty: "150g" }, { item: "Snap peas",    qty: "80g" }, { item: "Jasmine rice", qty: "70g" }, { item: "Ginger & garlic", qty: "10g" }, { item: "Tamari", qty: "15ml" }] },
    { id: "d3", name: "Beef & Lentil Stew",     kcal: 490, protein: 38, carbs: 48, fat: 15, tags: ["iron-rich", "hearty"],           healthNote: "Haem iron + vitamin C from tomatoes = optimal absorption.", ingredients: [{ item: "Lean beef",    qty: "150g" }, { item: "Green lentils", qty: "80g" }, { item: "Carrot", qty: "100g" }, { item: "Onion", qty: "80g" }, { item: "Canned tomatoes", qty: "200g" }, { item: "Rosemary", qty: "2g" }] },
    { id: "d4", name: "Tofu Buddha Bowl",       kcal: 420, protein: 22, carbs: 52, fat: 14, tags: ["vegan", "plant-based"],          healthNote: "Farro provides selenium + manganese.",             ingredients: [{ item: "Firm tofu",       qty: "180g" }, { item: "Farro",       qty: "70g" }, { item: "Roasted beets", qty: "100g" }, { item: "Kale", qty: "80g" }, { item: "Tahini", qty: "20g" }, { item: "Lemon", qty: "½" }] },
    { id: "d5", name: "Shrimp & Cauli Rice",    kcal: 380, protein: 35, carbs: 22, fat: 14, tags: ["low-carb", "seafood"],           healthNote: "Iodine from shrimp supports thyroid function.",    ingredients: [{ item: "Shrimp",          qty: "200g" }, { item: "Cauliflower rice", qty: "200g" }, { item: "Garlic", qty: "10g" }, { item: "Butter", qty: "10g" }, { item: "Parsley", qty: "5g" }, { item: "Lemon", qty: "½" }] },
    { id: "d6", name: "Turkey Meatballs",       kcal: 470, protein: 42, carbs: 40, fat: 14, tags: ["lean-protein", "mediterranean"], healthNote: "Lycopene from passata — reduced prostate risk.",   ingredients: [{ item: "Turkey mince",    qty: "200g" }, { item: "Whole wheat pasta", qty: "70g" }, { item: "Passata", qty: "200ml" }, { item: "Parmesan", qty: "20g" }, { item: "Fresh basil", qty: "5g" }] },
  ],
};

// ── Shopping list aggregator ───────────────────────────────────────────────────
export function buildShoppingList(selections) {
  const map = {};
  for (const slot of Object.keys(selections)) {
    const meal = selections[slot];
    if (!meal) continue;
    for (const { item, qty } of meal.ingredients) {
      const key = item.toLowerCase().trim();
      if (!map[key]) map[key] = { item, quantities: [], category: categorise(item) };
      map[key].quantities.push(qty);
    }
  }

  const items = Object.values(map);
  const categories = ["Produce", "Protein & Seafood", "Dairy & Eggs", "Grains & Bread", "Pantry"];
  const grouped = {};
  for (const cat of categories) {
    grouped[cat] = items.filter(i => i.category === cat).sort((a, b) => a.item.localeCompare(b.item));
  }
  return grouped;
}

const PRODUCE    = /(spinach|kale|tomato|cucumber|avocado|pepper|zucchini|broccoli|carrot|onion|lettuce|asparagus|celery|kiwi|apple|pear|banana|peach|beet|parsley|basil|ginger|garlic|lemon|lime|berry|berries|pineapple|snap pea|edamame)/i;
const PROTEIN    = /(chicken|salmon|cod|beef|turkey|tuna|shrimp|egg|tofu|fish|mince|cottage|peanut|almond)/i;
const DAIRY      = /(yogurt|cheese|kefir|butter|cream|milk|feta|parmesan|edam)/i;
const GRAINS     = /(oat|rice|pasta|bread|flour|farro|noodle|quinoa|buckwheat|tortilla|wrap|rye|granola)/i;

function categorise(item) {
  if (PRODUCE.test(item))  return "Produce";
  if (PROTEIN.test(item))  return "Protein & Seafood";
  if (DAIRY.test(item))    return "Dairy & Eggs";
  if (GRAINS.test(item))   return "Grains & Bread";
  return "Pantry";
}

// ── Daily macro totals ────────────────────────────────────────────────────────
export function calcDailyMacros(selections) {
  let kcal = 0, protein = 0, carbs = 0, fat = 0;
  for (const meal of Object.values(selections)) {
    if (!meal) continue;
    kcal += meal.kcal; protein += meal.protein;
    carbs += meal.carbs; fat += meal.fat;
  }
  return { kcal, protein, carbs, fat };
}

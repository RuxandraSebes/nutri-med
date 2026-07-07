const RULES = [
  { re: /\begg\b|\beggs\b/i, step: 50, min: 50 },
  {
    re: /chicken|turkey|beef|pork|salmon|tuna|cod|shrimp|lamb|sardine|mackerel|crab|fish|meat/i,
    step: 10,
    min: 10,
  },
  {
    re: /oat|rice|bread|pasta|potato|quinoa|grain|banana|apple|berry|fruit|yogurt|milk|cheese|bean|lentil|chickpea|tofu|nut|seed/i,
    step: 5,
    min: 5,
  },
  {
    re: /broccoli|spinach|kale|carrot|pepper|vegetable|salad|lettuce|tomato|cucumber/i,
    step: 5,
    min: 5,
  },
];

export function portionStepForName(name) {
  const n = String(name || "");
  for (const { re, step, min } of RULES) {
    if (re.test(n)) return { step, min };
  }
  return { step: 5, min: 5 };
}

export function roundPortionG(name, portionG) {
  const p = Number(portionG);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const { step, min } = portionStepForName(name);
  const clamped = Math.max(min, p);
  const rounded = Math.round(clamped / step) * step;
  return Math.max(min, rounded);
}

/**
 * ProgressRing — SVG circular progress indicator
 *
 * Props:
 *   value   — current value
 *   max     — target value
 *   size    — diameter in px (default 96)
 *   stroke  — stroke width (default 8)
 *   color   — CSS color string
 *   label   — string below the ring
 *   unit    — unit suffix (e.g. "kcal", "g")
 */
export default function ProgressRing({
  value = 0,
  max = 100,
  size = 96,
  stroke = 8,
  color = "var(--primary)",
  label,
  unit = "",
}) {
  const r   = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(1, value / max);
  const dash = circ * pct;

  return (
    <div className="progress-ring-wrap">
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke="var(--gray-200)"
            strokeWidth={stroke}
          />
          {/* Fill */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        {/* Center label */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontWeight: 700, fontSize: size < 80 ? 14 : 18, lineHeight: 1, color: "var(--text-primary)" }}>
            {value.toLocaleString()}
          </span>
          {unit && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{unit}</span>
          )}
        </div>
      </div>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", textAlign: "center" }}>
          {label}
        </span>
      )}
    </div>
  );
}

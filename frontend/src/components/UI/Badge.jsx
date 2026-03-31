/**
 * Badge atom
 *
 * Props:
 *   variant  — "blue" | "green" | "amber" | "red" | "gray"
 *   dot      — bool (shows a colored dot prefix)
 */
export default function Badge({ variant = "gray", dot = false, children, className = "", ...rest }) {
  const cls = `badge badge-${variant} ${className}`;
  const dotColor = {
    blue:  "var(--blue-600)",
    green: "var(--green-600)",
    amber: "var(--amber-600)",
    red:   "var(--red-600)",
    gray:  "var(--gray-400)",
  }[variant];

  return (
    <span className={cls} {...rest}>
      {dot && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: dotColor, flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  );
}

/**
 * ConstraintPill — for allergy / restriction clinical badges
 */
export function ConstraintPill({ type, value, onRemove }) {
  const isAllergy = type === "allergy";
  return (
    <span className={`constraint-pill ${isAllergy ? "constraint-allergy" : "constraint-restriction"}`}>
      <span style={{ fontSize: 10 }}>{isAllergy ? "⚠" : "⊘"}</span>
      {value}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "0 0 0 4px", color: "inherit", fontSize: 13, lineHeight: 1,
          }}
          title="Remove"
        >×</button>
      )}
    </span>
  );
}

/**
 * StatusBadge — for plan status (pending / approved / rejected)
 */
export function StatusBadge({ status }) {
  const map = {
    pending:  { variant: "amber", label: "Pending Review", dot: true },
    approved: { variant: "green", label: "Approved",       dot: true },
    rejected: { variant: "red",   label: "Rejected",       dot: true },
    modify:   { variant: "amber", label: "Modify",         dot: true },
  };
  const cfg = map[status] ?? map.pending;
  return <Badge variant={cfg.variant} dot={cfg.dot}>{cfg.label}</Badge>;
}

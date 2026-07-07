export default function ClinicalInput({
  label,
  hint,
  unit,
  error,
  type = "input",
  children,
  className = "",
  ...rest
}) {
  const Tag = type === "textarea" ? "textarea" : type === "select" ? "select" : "input";

  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Tag
          className={`${type === "textarea" ? "textarea" : type === "select" ? "select" : "input"}`}
          style={{
            paddingRight: unit ? 44 : undefined,
            borderColor: error ? "var(--danger)" : undefined,
          }}
          {...rest}
        >
          {children}
        </Tag>
        {unit && (
          <span style={{
            position: "absolute", right: 12,
            fontSize: 12, color: "var(--text-muted)",
            pointerEvents: "none", fontWeight: 500,
          }}>{unit}</span>
        )}
      </div>
      {hint  && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-hint" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

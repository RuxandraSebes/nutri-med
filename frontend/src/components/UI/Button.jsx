/**
 * Button atom
 *
 * Props:
 *   variant  — "primary" | "green" | "ghost" | "danger" | "warning"
 *   size     — "sm" | "md" | "lg"
 *   loading  — bool
 *   icon     — ReactNode (prepended)
 *   iconEnd  — ReactNode (appended)
 */
export default function Button({
  variant = "ghost",
  size = "md",
  loading = false,
  icon,
  iconEnd,
  disabled,
  children,
  className = "",
  ...rest
}) {
  const variantClass = {
    primary: "btn-primary",
    green:   "btn-green",
    ghost:   "btn-ghost",
    danger:  "btn-danger",
    warning: "btn-warning",
  }[variant] ?? "btn-ghost";

  const sizeClass = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {!loading && iconEnd}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "spin 0.75s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

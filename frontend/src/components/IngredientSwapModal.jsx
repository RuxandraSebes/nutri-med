import { useEffect, useState } from "react";
import { recommendationApi } from "../api/recommendationApi.js";

function MacroLine({ alt }) {
  return (
    <div style={{ fontSize: 12, color: "var(--sd-text-3, var(--pd-text-3))", marginTop: 6 }}>
      {alt.portion_g}g · {Math.round(alt.kcal || 0)} kcal · P {alt.protein_g}g · C{" "}
      {alt.carbs_g}g · F {alt.fat_g}g
    </div>
  );
}

export default function IngredientSwapModal({
  patientId,
  oldName,
  onClose,
  onApplied,
  onError,
  theme = "sd",
}) {
  const c = (suffix) => `${theme}-swap-${suffix}`;
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await recommendationApi.suggestIngredientSwaps(patientId, {
          oldName,
        });
        if (cancelled) return;
        setAlternatives(data.alternatives || []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load swap options");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, oldName]);

  async function pick(alt) {
    setApplying(alt.name);
    setError("");
    try {
      const updated = await recommendationApi.applyIngredientSwap(patientId, {
        oldName,
        replacement: alt,
      });
      onApplied(updated, alt);
    } catch (e) {
      const msg = e.message || "Swap failed";
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setApplying(null);
    }
  }

  const alertClass =
    theme === "pd" ? "pd-alert pd-alert-error" : "sd-alert sd-alert-error";

  return (
    <div className={c("overlay")} role="dialog" aria-modal="true">
      <div className={c("modal")}>
        <div className={c("header")}>
          <div>
            <div className={c("title")}>Swap ingredient</div>
            <div className={c("sub")}>
              Replace <strong>{oldName}</strong> everywhere in your weekly plan
            </div>
          </div>
          <button type="button" className={c("close")} onClick={onClose}>
            ×
          </button>
        </div>

        {loading && (
          <p style={{ fontSize: 13.5, color: "var(--sd-text-3, var(--pd-text-3))" }}>
            AI is suggesting alternatives, this can take 1-2 minutes on first run.
          </p>
        )}
        {error && (
          <div className={alertClass} style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {!loading && alternatives.length === 0 && !error && (
          <p style={{ fontSize: 13.5, color: "var(--sd-text-3, var(--pd-text-3))" }}>
            No alternatives returned. Try again later.
          </p>
        )}

        <div className={c("options")}>
          {alternatives.map((alt) => (
            <button
              key={alt.name}
              type="button"
              className={c("option")}
              disabled={!!applying}
              onClick={() => pick(alt)}
            >
              <div className={c("option-name")}>{alt.name}</div>
              {alt.reason && (
                <div className={c("option-reason")}>{alt.reason}</div>
              )}
              <MacroLine alt={alt} />
              {applying === alt.name && (
                <span style={{ fontSize: 12, marginTop: 8, display: "block" }}>
                  Applying…
                </span>
              )}
            </button>
          ))}
        </div>

        <p className={c("footnote")}>
          Your choice updates every meal that uses this ingredient and refreshes
          your shopping list. Your specialist sees the updated plan on their
          dashboard.
        </p>
      </div>
    </div>
  );
}

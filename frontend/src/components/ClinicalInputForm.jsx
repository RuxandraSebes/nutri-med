import Button from "./UI/Button.jsx";
import {
  inputClass,
  labelClass,
  sectionCardClass,
  sectionTitleClass,
} from "./specialistStyles.js";

function MetricInputCard({
  label: lbl,
  unit,
  value,
  onChange,
  placeholder,
  normalRange,
  type = "text",
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{lbl}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <input
          type={type}
          className={`${inputClass} flex-1 min-w-0`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
        {unit ? (
          <span className="shrink-0 text-xs text-slate-500">{unit}</span>
        ) : null}
      </div>
      {normalRange ? (
        <div className="mt-1.5 text-[11px] text-slate-400">
          Normal: {normalRange}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tab 1: full-width patient search + single-page clinical form.
 */
export default function ClinicalInputForm({
  dashboardData,
  setDashboardData,
  searchBusy,
  onSearch,
  submit,
  busy,
  error,
}) {
  const d = dashboardData;
  const setClinical = (patch) =>
    setDashboardData((prev) => ({ ...prev, ...patch }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Find patient — same max width as form below */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Find patient</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search by public ID or numeric record id, then select a row.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className={`${inputClass} min-w-[200px] flex-1`}
            placeholder="Search by public ID (e.g. PT-…) or numeric record id"
            value={d.searchQ}
            onChange={(e) => setClinical({ searchQ: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          <Button variant="primary" loading={searchBusy} onClick={onSearch}>
            Search
          </Button>
        </div>
        {d.searchResults?.length > 0 && (
          <div className="mt-4 grid max-h-[200px] gap-1.5 overflow-auto">
            {d.searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setClinical({ selectedRecordId: p.id })}
                className={`flex justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  d.selectedRecordId === p.id
                    ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="font-semibold text-slate-900">
                  {p.public_patient_id || `#${p.id}`}
                </span>
                <span className="text-xs text-slate-500">id {p.id}</span>
              </button>
            ))}
          </div>
        )}
        {d.selectedRecordId ? (
          <div className="mt-3 text-sm font-semibold text-emerald-700">
            Selected record #{d.selectedRecordId}
          </div>
        ) : null}
      </div>

      {/* Clinical input — single scrollable page */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-slate-900">
            Clinical input
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Complete all sections, then generate the AI meal matrix for review.
          </p>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto pr-1">
          {!d.selectedRecordId ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Select a patient above before entering clinical data.
            </div>
          ) : null}

          {/* Diagnosis */}
          <section className={sectionCardClass}>
            <h3 className={sectionTitleClass}>Diagnosis</h3>
            <div className="grid gap-4">
              <label className="block">
                <span className={labelClass}>Primary disease / ICD-10 label</span>
                <input
                  className={inputClass}
                  value={d.primaryDisease}
                  onChange={(e) =>
                    setClinical({ primaryDisease: e.target.value })
                  }
                  placeholder="PCOS"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Severity</span>
                <select
                  className={inputClass}
                  value={d.severity}
                  onChange={(e) => setClinical({ severity: e.target.value })}
                >
                  <option value="Mild">Mild</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Severe">Severe</option>
                  <option value="High">High</option>
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>
                  Comorbidities (one per line or comma-separated)
                </span>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={d.comorbiditiesText}
                  onChange={(e) =>
                    setClinical({ comorbiditiesText: e.target.value })
                  }
                  placeholder="None"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Genetic / family risk factors</span>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={d.geneticText}
                  onChange={(e) =>
                    setClinical({ geneticText: e.target.value })
                  }
                  placeholder="Type 2 Diabetes in family history"
                />
              </label>
            </div>
          </section>

          {/* Biometric markers — card-style inputs */}
          <section className={sectionCardClass}>
            <h3 className={sectionTitleClass}>Biometric markers</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricInputCard
                label="Systolic BP"
                unit="mmHg"
                normalRange="90–120"
                value={d.systolic}
                onChange={(e) => setClinical({ systolic: e.target.value })}
                placeholder="120"
              />
              <MetricInputCard
                label="Diastolic BP"
                unit="mmHg"
                normalRange="60–80"
                value={d.diastolic}
                onChange={(e) => setClinical({ diastolic: e.target.value })}
                placeholder="80"
              />
              <MetricInputCard
                label="Fasting glucose"
                unit="mg/dL"
                normalRange="70–99"
                value={d.glucose}
                onChange={(e) => setClinical({ glucose: e.target.value })}
                placeholder="92"
              />
              <MetricInputCard
                label="Total cholesterol"
                unit="mg/dL"
                normalRange="< 200"
                value={d.cholesterol}
                onChange={(e) => setClinical({ cholesterol: e.target.value })}
                placeholder="185"
              />
            </div>
          </section>

          {/* Body composition */}
          <section className={sectionCardClass}>
            <h3 className={sectionTitleClass}>Body composition</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricInputCard
                label="Body fat"
                unit="%"
                value={d.fatPct}
                onChange={(e) => setClinical({ fatPct: e.target.value })}
                placeholder="22.5"
              />
              <MetricInputCard
                label="Water"
                unit="%"
                value={d.waterPct}
                onChange={(e) => setClinical({ waterPct: e.target.value })}
                placeholder="55.0"
              />
              <MetricInputCard
                label="Muscle mass"
                unit="kg"
                value={d.muscleKg}
                onChange={(e) => setClinical({ muscleKg: e.target.value })}
                placeholder="42.1"
              />
              <MetricInputCard
                label="Visceral fat"
                value={d.visceral}
                onChange={(e) => setClinical({ visceral: e.target.value })}
                placeholder="6"
                normalRange="Smart scale index"
              />
              <div className="sm:col-span-2">
                <MetricInputCard
                  label="Metabolic age"
                  value={d.metabolicAge}
                  onChange={(e) =>
                    setClinical({ metabolicAge: e.target.value })
                  }
                  placeholder="24"
                />
              </div>
            </div>
          </section>

          {/* Clinical constraints */}
          <section className={sectionCardClass}>
            <h3 className={sectionTitleClass}>Clinical constraints</h3>
            <div className="grid gap-4">
              <label className="block">
                <span className={labelClass}>
                  Allergies (comma or newline)
                </span>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={d.allergiesText}
                  onChange={(e) =>
                    setClinical({ allergiesText: e.target.value })
                  }
                  placeholder="Peanuts"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Dietary restrictions</span>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={d.restrictionsText}
                  onChange={(e) =>
                    setClinical({ restrictionsText: e.target.value })
                  }
                  placeholder="Low_Sugar, Anti_Inflammatory"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Mandatory clinical notes</span>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={d.mandatoryNotes}
                  onChange={(e) =>
                    setClinical({ mandatoryNotes: e.target.value })
                  }
                  placeholder="Prioritize high-fiber foods…"
                />
              </label>
            </div>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
          <Button
            variant="green"
            loading={busy}
            disabled={!d.selectedRecordId}
            onClick={submit}
          >
            Submit &amp; generate plan
          </Button>
          {error ? (
            <span className="text-sm text-red-600" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

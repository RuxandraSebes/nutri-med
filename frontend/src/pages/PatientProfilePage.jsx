import { useEffect, useState } from "react";
import { patientApi } from "../api/baseFetch.js";
import Button from "../components/UI/Button.jsx";
import ClinicalInput from "../components/UI/ClinicalInput.jsx";
import "./PatientProfilePage.css";

function SelectOther({
  label,
  selectValue,
  onSelectChange,
  otherValue,
  onOtherChange,
  options,
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <ClinicalInput
        label={label}
        type="select"
        value={selectValue}
        onChange={(e) => onSelectChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="Other">Other (specify below)</option>
      </ClinicalInput>
      {selectValue === "Other" && (
        <ClinicalInput
          label="Your answer"
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Type here…"
        />
      )}
    </div>
  );
}

export default function PatientProfilePage() {
  const [busy, setBusy] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Female");
  const [genderOther, setGenderOther] = useState("");
  const [height_cm, setHeight_cm] = useState("");
  const [weight_kg, setWeight_kg] = useState("");

  const [activity, setActivity] = useState("Sedentary");
  const [activityOther, setActivityOther] = useState("");
  const [weekly_exercise_hours, setWeeklyExercise] = useState("");
  const [daily_steps, setDailySteps] = useState("");
  const [sleep, setSleep] = useState("Moderate");
  const [sleepOther, setSleepOther] = useState("");
  const [alcohol, setAlcohol] = useState("None");
  const [alcoholOther, setAlcoholOther] = useState("");
  const [smoking, setSmoking] = useState("No");
  const [smokingOther, setSmokingOther] = useState("");

  const [cuisine, setCuisine] = useState("Mediterranean");
  const [cuisineOther, setCuisineOther] = useState("");
  const [food_aversions, setFoodAversions] = useState("");
  const [cultural, setCultural] = useState("None");
  const [culturalOther, setCulturalOther] = useState("");
  const [goal, setGoal] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await patientApi.getMe();
        if (cancelled || !p) return;
        const d = p.demographics || {};
        const l = p.lifestyle || {};
        const pr = p.preferences || {};
        // Food diary is edited from the Patient Dashboard (single source in FE).

        setAge(d.age ?? "");
        const g = d.gender || "Female";
        if (["Female", "Male", "Non-binary", "Prefer not to say"].includes(g)) {
          setGender(g);
        } else {
          setGender("Other");
          setGenderOther(g);
        }
        setHeight_cm(d.height_cm ?? "");
        setWeight_kg(d.weight_kg ?? "");

        const pa = l.physical_activity_level || l.activity_level || "Sedentary";
        if (
          ["Sedentary", "Light", "Moderate", "Active", "Very active"].includes(
            pa,
          )
        ) {
          setActivity(pa);
        } else {
          setActivity("Other");
          setActivityOther(pa);
        }
        setWeeklyExercise(l.weekly_exercise_hours ?? "");
        setDailySteps(l.daily_steps_reported ?? "");
        const sl = l.sleep_quality_subjective || "Moderate";
        if (["Poor", "Moderate", "Good", "Excellent"].includes(sl)) {
          setSleep(sl);
        } else {
          setSleep("Other");
          setSleepOther(sl);
        }
        const al = l.alcohol_consumption || "None";
        if (["None", "Occasional", "Moderate", "Heavy"].includes(al)) {
          setAlcohol(al);
        } else {
          setAlcohol("Other");
          setAlcoholOther(al);
        }
        const sm = l.smoking_habit || "No";
        if (["No", "Former", "Yes"].includes(sm)) {
          setSmoking(sm);
        } else {
          setSmoking("Other");
          setSmokingOther(sm);
        }

        const cu = pr.preferred_cuisine || "Mediterranean";
        if (
          [
            "Mediterranean",
            "Asian",
            "Latin",
            "Middle Eastern",
            "Nordic",
            "Traditional Romanian",
          ].includes(cu)
        ) {
          setCuisine(cu);
        } else {
          setCuisine("Other");
          setCuisineOther(cu);
        }
        setFoodAversions((pr.food_aversions || []).join(", "));
        const cr = pr.cultural_religious_restrictions || "None";
        if (["None", "Halal", "Kosher", "Vegetarian", "Vegan"].includes(cr)) {
          setCultural(cr);
        } else {
          setCultural("Other");
          setCulturalOther(cr);
        }
        setGoal(pr.goal || "");

      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load profile");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resolve(val, other) {
    return val === "Other" ? (other || "").trim() || "Other" : val;
  }

  async function save(e) {
    e.preventDefault();
    setSaveBusy(true);
    setError("");
    setMsg("");
    try {
      const demographics = {
        age: age === "" ? null : Number(age),
        gender: resolve(gender, genderOther),
        height_cm: height_cm === "" ? null : Number(height_cm),
        weight_kg: weight_kg === "" ? null : Number(weight_kg),
      };
      const lifestyle = {
        physical_activity_level: resolve(activity, activityOther),
        weekly_exercise_hours:
          weekly_exercise_hours === "" ? null : Number(weekly_exercise_hours),
        daily_steps_reported: daily_steps === "" ? null : Number(daily_steps),
        sleep_quality_subjective: resolve(sleep, sleepOther),
        alcohol_consumption: resolve(alcohol, alcoholOther),
        smoking_habit: resolve(smoking, smokingOther),
      };
      const preferences = {
        preferred_cuisine: resolve(cuisine, cuisineOther),
        food_aversions: food_aversions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        cultural_religious_restrictions: resolve(cultural, culturalOther),
        goal: goal.trim() || null,
      };

      await patientApi.putMe({
        demographics,
        lifestyle,
        preferences,
      });
      setMsg("Profile saved.");
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaveBusy(false);
    }
  }

  if (busy) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        Loading profile…
      </div>
    );
  }

  return (
    <div className="patientProfilePage">
      <h1 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
        My health profile
      </h1>
      <p className="subtitle" style={{ marginBottom: 24 }}>
        Demographics, lifestyle, and preferences. Use “Other” where you need a
        custom answer.
      </p>

      <form onSubmit={save}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="section-title">Demographics</div>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 14 }}>
            <div className="grid-2">
              <ClinicalInput
                label="Age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="22"
              />
              <SelectOther
                label="Gender"
                selectValue={gender}
                onSelectChange={setGender}
                otherValue={genderOther}
                onOtherChange={setGenderOther}
                options={["Female", "Male", "Non-binary", "Prefer not to say"]}
              />
            </div>
            <div className="grid-2">
              <ClinicalInput
                label="Height (cm)"
                value={height_cm}
                onChange={(e) => setHeight_cm(e.target.value)}
                placeholder="161"
              />
              <ClinicalInput
                label="Weight (kg)"
                value={weight_kg}
                onChange={(e) => setWeight_kg(e.target.value)}
                placeholder="56"
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="section-title">Lifestyle</div>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 14 }}>
            <SelectOther
              label="Physical activity level"
              selectValue={activity}
              onSelectChange={setActivity}
              otherValue={activityOther}
              onOtherChange={setActivityOther}
              options={["Sedentary", "Light", "Moderate", "Active", "Very active"]}
            />
            <div className="grid-2">
              <ClinicalInput
                label="Weekly exercise (hours)"
                value={weekly_exercise_hours}
                onChange={(e) => setWeeklyExercise(e.target.value)}
                placeholder="2"
              />
              <ClinicalInput
                label="Daily steps (reported)"
                value={daily_steps}
                onChange={(e) => setDailySteps(e.target.value)}
                placeholder="4500"
              />
            </div>
            <SelectOther
              label="Sleep quality (subjective)"
              selectValue={sleep}
              onSelectChange={setSleep}
              otherValue={sleepOther}
              onOtherChange={setSleepOther}
              options={["Poor", "Moderate", "Good", "Excellent"]}
            />
            <div className="grid-2">
              <SelectOther
                label="Alcohol consumption"
                selectValue={alcohol}
                onSelectChange={setAlcohol}
                otherValue={alcoholOther}
                onOtherChange={setAlcoholOther}
                options={["None", "Occasional", "Moderate", "Heavy"]}
              />
              <SelectOther
                label="Smoking"
                selectValue={smoking}
                onSelectChange={setSmoking}
                otherValue={smokingOther}
                onOtherChange={setSmokingOther}
                options={["No", "Former", "Yes"]}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="section-title">Preferences & goals</div>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 14 }}>
            <SelectOther
              label="Preferred cuisine"
              selectValue={cuisine}
              onSelectChange={setCuisine}
              otherValue={cuisineOther}
              onOtherChange={setCuisineOther}
              options={[
                "Mediterranean",
                "Asian",
                "Latin",
                "Middle Eastern",
                "Nordic",
                "Traditional Romanian",
              ]}
            />
            <ClinicalInput
              label="Food aversions (comma-separated)"
              value={food_aversions}
              onChange={(e) => setFoodAversions(e.target.value)}
              placeholder="cilantro, mushrooms"
            />
            <SelectOther
              label="Cultural / religious restrictions"
              selectValue={cultural}
              onSelectChange={setCultural}
              otherValue={culturalOther}
              onOtherChange={setCulturalOther}
              options={["None", "Halal", "Kosher", "Vegetarian", "Vegan"]}
            />
            <label className="field">
              <span className="field-label">Health goal</span>
              <textarea
                className="textarea"
                rows={3}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Weight management and hormonal balance"
              />
            </label>
          </div>
        </div>

        {error ? (
          <div className="danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        ) : null}
        {msg ? (
          <div
            style={{
              marginBottom: 12,
              color: "var(--green-600)",
              fontWeight: 600,
            }}
          >
            {msg}
          </div>
        ) : null}

        <Button variant="primary" type="submit" loading={saveBusy}>
          Save profile
        </Button>
      </form>
    </div>
  );
}

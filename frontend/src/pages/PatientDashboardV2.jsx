import { useEffect, useState } from "react";
import { patientApi, recommendationApi, journalApi } from "../api/baseFetch.js";
import IngredientSwapModal from "../components/IngredientSwapModal.jsx";
import MarkdownContent from "../components/UI/MarkdownContent.jsx";
import Icon from "../components/UI/Icon.jsx";
import Spinner from "../components/UI/Spinner.jsx";
import "./PatientDashboardV2.css";

import {
  Icons,
  Btn,
  StatusPill,
  DailyMacroBanner,
  MealTimelineRow,
  DayCard,
  ShoppingList,
  JournalReviewCard,
  EmptyState,
} from "./PatientDashboardV2.parts.jsx";

const TABS = [
  { id: "today", label: "Today", icon: Icons.home },
  { id: "plan", label: "Diet Plan", icon: Icons.calendar },
  { id: "shopping", label: "Shopping", icon: Icons.cart },
  { id: "profile", label: "My Profile", icon: Icons.user },
];

export default function PatientDashboardV2() {
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("today");
  const [diaryDraft, setDiaryDraft] = useState("");
  const [diarySaving, setDiarySaving] = useState(false);
  const [diaryMsg, setDiaryMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [swapMsg, setSwapMsg] = useState("");
  const [journalReview, setJournalReview] = useState(null);
  const [journalError, setJournalError] = useState("");

  const recordId = profile?.record_id;
  const isApproved = plan?.status === "approved";

  async function refresh() {
    if (!recordId) return;
    setRefreshing(true);
    try {
      const p = await recommendationApi.getLatestPlan(recordId);
      setPlan(p);
    } catch (e) {
      if (e.status !== 404) setError(e.message);
      else setPlan(null);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await patientApi.getMe();
        if (cancelled) return;
        setProfile(me);
        setDiaryDraft(me?.daily_log?.["24h_food_diary_text"] || "");
        if (me?.record_id) {
          try {
            const p = await recommendationApi.getLatestPlan(me.record_id);
            if (!cancelled) setPlan(p);
          } catch (pe) {
            if (!cancelled && pe.status !== 404) setError(pe.message);
          }
          try {
            const jr = await journalApi.getLatestReview(me.record_id);
            if (!cancelled) setJournalReview(jr);
          } catch (je) {
            if (!cancelled && je.status !== 404) setJournalError(je.message);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveDiary() {
    setDiarySaving(true);
    setDiaryMsg("");
    try {
      const updated = await patientApi.putMe({
        daily_log: { "24h_food_diary_text": diaryDraft.trim() || null },
      });
      setProfile(updated);
      setDiaryMsg("Saved!");
      setTimeout(() => setDiaryMsg(""), 3000);
    } catch (e) {
      setError(e.message || "Could not save");
    } finally {
      setDiarySaving(false);
    }
  }

  const weekly = plan?.meal_matrix?.weekly ?? plan?.plan?.meal_matrix?.weekly;
  const meals = plan?.meal_matrix?.meals ?? plan?.plan?.meal_matrix?.meals;
  const shoppingList = plan?.shopping_list ?? plan?.plan?.shopping_list;
  const targetMacros = plan?.target_macros ?? plan?.plan?.target_macros;
  const clinicalStrategy =
    plan?.plan?.clinical_strategy ?? plan?.clinical_strategy;

  const DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  if (busy) {
    return (
      <div className="pd-loading">
        <Spinner size={32} />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  return (
    <div className="pd-root">
      <div className="pd-page-header">
        <div>
          <h1 className="pd-page-title">My Health Dashboard</h1>
          <p className="pd-page-subtitle">
            {profile?.patient_id ? (
              <>
                <span className="pd-patient-id">{profile.patient_id}</span> ·
                Your personalised nutrition plan
              </>
            ) : (
              "Your personalised nutrition plan"
            )}
          </p>
        </div>
        <div className="pd-header-actions">
          {plan?.status && <StatusPill status={plan.status} />}
          <Btn
            variant="ghost"
            size="sm"
            loading={refreshing}
            onClick={refresh}
            disabled={!recordId}
          >
            <Icon d={Icons.refresh} size={14} />
            Refresh
          </Btn>
        </div>
      </div>

      {error && (
        <div className="pd-alert pd-alert-error">
          <Icon d={Icons.alert} size={15} />
          {error}
        </div>
      )}

      <div className="pd-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`pd-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon d={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "today" && (
        <div className="pd-tab-content">
          {isApproved && targetMacros ? (
            <section className="pd-section">
              <div className="pd-section-header">
                <Icon d={Icons.bolt} size={16} stroke="#6366f1" />
                <h2 className="pd-section-title">Daily targets</h2>
              </div>
              <DailyMacroBanner targetMacros={targetMacros} />
            </section>
          ) : (
            <div className="pd-pending-card">
              <div className="pd-pending-icon">
                <Icon
                  d={Icons.info}
                  size={22}
                  stroke="#0ea5e9"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <div className="pd-pending-title">
                  {plan ? "Awaiting specialist approval" : "No plan yet"}
                </div>
                <div className="pd-pending-sub">
                  {plan
                    ? "Your specialist is reviewing your nutrition plan. Check back soon."
                    : "Your specialist will generate a personalised plan for you."}
                </div>
              </div>
            </div>
          )}

          {isApproved && clinicalStrategy && (
            <section className="pd-section">
              <div className="pd-section-header">
                <Icon d={Icons.note} size={16} stroke="#6366f1" />
                <h2 className="pd-section-title">Clinical strategy</h2>
              </div>
              <div className="pd-strategy-box">
                <MarkdownContent content={clinicalStrategy} />
              </div>
            </section>
          )}

          <section className="pd-section">
            <div className="pd-section-header">
              <Icon d={Icons.note} size={16} stroke="#6366f1" />
              <h2 className="pd-section-title">24h food diary</h2>
              <span className="pd-section-badge">
                {plan?.status === "pending" ? "Under review" : ""}
              </span>
            </div>
            <div className="pd-diary-card">
              <p className="pd-diary-hint">
                Log everything you've eaten today. Your specialist can review
                this separately and leave you a score and per-food notes
                below.
              </p>
              <textarea
                className="pd-diary-textarea"
                rows={6}
                value={diaryDraft}
                onChange={(e) => setDiaryDraft(e.target.value)}
                placeholder="Breakfast: Oatmeal with berries and a coffee&#10;Lunch: Grilled chicken salad&#10;Dinner: Salmon with vegetables…"
              />
              <div className="pd-diary-footer">
                <Btn
                  variant="primary"
                  size="sm"
                  loading={diarySaving}
                  onClick={saveDiary}
                >
                  <Icon d={Icons.save} size={14} />
                  Save diary
                </Btn>
                {diaryMsg && <span className="pd-diary-saved">{diaryMsg}</span>}
              </div>
            </div>
          </section>

          <section className="pd-section">
            <div className="pd-section-header">
              <Icon d={Icons.bolt} size={16} stroke="#10b981" />
              <h2 className="pd-section-title">Journal review</h2>
            </div>
            {journalError && (
              <div className="pd-alert pd-alert-error">
                <Icon d={Icons.alert} size={15} />
                {journalError}
              </div>
            )}
            {journalReview?.status === "approved" ? (
              <JournalReviewCard review={journalReview} />
            ) : (
              <EmptyState
                icon={Icons.note}
                title="No journal review yet"
                subtitle="Your specialist hasn't reviewed your food diary yet"
              />
            )}
          </section>
        </div>
      )}

      {activeTab === "plan" && (
        <div className="pd-tab-content">
          {!isApproved ? (
            <EmptyState
              icon={Icons.calendar}
              title="Plan not available"
              subtitle="Your specialist needs to approve a plan first"
            />
          ) : (
            <>
              {meals?.length > 0 && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.clock} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Daily meal schedule</h2>
                  </div>
                  <div className="pd-timeline">
                    {meals.map((m, i) => (
                      <MealTimelineRow
                        key={`${m.time}-${i}`}
                        meal={m}
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              )}

              {weekly && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.calendar} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Weekly plan</h2>
                  </div>
                  <div className="pd-week-grid">
                    {DAYS.map((day) => (
                      <DayCard key={day} day={day} dayData={weekly[day]} />
                    ))}
                  </div>
                </section>
              )}

              {!meals?.length && !weekly && (
                <EmptyState
                  icon={Icons.calendar}
                  title="No meal data"
                  subtitle="Regenerate plan for full meal details"
                />
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "shopping" && (
        <div className="pd-tab-content">
          {!isApproved ? (
            <EmptyState
              icon={Icons.cart}
              title="No shopping list"
              subtitle="Approve a plan to see ingredients"
            />
          ) : (
            <section className="pd-section">
              <div className="pd-section-header">
                <Icon d={Icons.cart} size={16} stroke="#6366f1" />
                <h2 className="pd-section-title">Ingredients to buy</h2>
                <span className="pd-section-hint">
                  Tap to check off · Swap for AI alternatives
                </span>
              </div>
              {swapMsg && (
                <div className="pd-alert pd-alert-success">{swapMsg}</div>
              )}
              <ShoppingList
                items={shoppingList}
                recordId={recordId}
                onPlanUpdated={(row, { oldName, alt }) => {
                  setPlan(row);
                  setSwapMsg(
                    `Replaced "${oldName}" with "${alt.name}" across all meals.`,
                  );
                  setTimeout(() => setSwapMsg(""), 6000);
                }}
                onSwapError={(msg) => setError(msg)}
              />
            </section>
          )}
        </div>
      )}

      {activeTab === "profile" && (
        <div className="pd-tab-content">
          {!profile ? (
            <EmptyState
              icon={Icons.user}
              title="No profile data"
              subtitle="Complete your profile to help the specialist"
            />
          ) : (
            <>
              <section className="pd-section">
                <div className="pd-section-header">
                  <Icon d={Icons.user} size={16} stroke="#6366f1" />
                  <h2 className="pd-section-title">Demographics</h2>
                  <a href="/patient/profile" className="pd-section-link">
                    Edit profile →
                  </a>
                </div>
                <div className="pd-profile-grid">
                  {[
                    ["Age", profile.demographics?.age, "yr"],
                    ["Gender", profile.demographics?.gender],
                    ["Height", profile.demographics?.height_cm, "cm"],
                    ["Weight", profile.demographics?.weight_kg, "kg"],
                    ["BMI", profile.demographics?.bmi],
                  ]
                    .filter(([, v]) => v != null)
                    .map(([label, val, unit]) => (
                      <div key={label} className="pd-profile-tile">
                        <div className="pd-profile-tile-label">{label}</div>
                        <div className="pd-profile-tile-value">
                          {val}
                          {unit && (
                            <span className="pd-profile-unit"> {unit}</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </section>

              {profile.lifestyle && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.heart} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Lifestyle</h2>
                  </div>
                  <div className="pd-profile-grid">
                    {[
                      ["Activity", profile.lifestyle.physical_activity_level],
                      [
                        "Exercise",
                        profile.lifestyle.weekly_exercise_hours,
                        "h/wk",
                      ],
                      ["Steps", profile.lifestyle.daily_steps_reported, "/day"],
                      ["Sleep", profile.lifestyle.sleep_quality_subjective],
                      ["Alcohol", profile.lifestyle.alcohol_consumption],
                      ["Smoking", profile.lifestyle.smoking_habit],
                    ]
                      .filter(([, v]) => v != null)
                      .map(([label, val, unit]) => (
                        <div key={label} className="pd-profile-tile">
                          <div className="pd-profile-tile-label">{label}</div>
                          <div className="pd-profile-tile-value">
                            {val}
                            {unit && (
                              <span className="pd-profile-unit">{unit}</span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {profile.preferences && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.star} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Preferences & goals</h2>
                  </div>
                  <div className="pd-profile-detail-card">
                    {profile.preferences.preferred_cuisine && (
                      <div className="pd-detail-row">
                        <span className="pd-detail-label">
                          Cuisine preference
                        </span>
                        <span className="pd-detail-value">
                          {profile.preferences.preferred_cuisine}
                        </span>
                      </div>
                    )}
                    {profile.preferences.cultural_religious_restrictions && (
                      <div className="pd-detail-row">
                        <span className="pd-detail-label">
                          Dietary restrictions
                        </span>
                        <span className="pd-detail-value">
                          {profile.preferences.cultural_religious_restrictions}
                        </span>
                      </div>
                    )}
                    {Array.isArray(profile.preferences.food_aversions) &&
                      profile.preferences.food_aversions.length > 0 && (
                        <div className="pd-detail-row">
                          <span className="pd-detail-label">
                            Food aversions
                          </span>
                          <span className="pd-detail-value">
                            {profile.preferences.food_aversions.join(", ")}
                          </span>
                        </div>
                      )}
                    {profile.preferences.goal && (
                      <div className="pd-detail-row">
                        <span className="pd-detail-label">Health goal</span>
                        <span className="pd-detail-value">
                          {profile.preferences.goal}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const PATIENT_SERVICE_URL =
  process.env.PATIENT_SERVICE_URL || "http://localhost:3001";
const MEDICAL_SERVICE_URL =
  process.env.MEDICAL_SERVICE_URL || "http://localhost:3002";

async function fetchJson(url, init = {}) {
  const resp = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Fetch failed ${resp.status} ${url}: ${text}`);
  }
  return await resp.json();
}

async function resolveOwnPatientRecordId(userId) {
  const j = await fetchJson(
    `${PATIENT_SERVICE_URL}/internal/patients/by-user/${userId}`,
  );
  return j.record_id;
}

async function assertCanAccessPatientJournal(auth, patientId) {
  if (auth.role === "specialist") return;
  if (auth.role !== "patient") {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  const rid = await resolveOwnPatientRecordId(auth.userId);
  if (Number(rid) !== Number(patientId)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

async function fetchPatientAndSpecialistContext(patientId) {
  const patient = await fetchJson(
    `${PATIENT_SERVICE_URL}/internal/patients/${patientId}`,
  );
  const specialist = await fetchJson(
    `${MEDICAL_SERVICE_URL}/patients/${patientId}/specialist-object`,
  ).catch(() => null);

  return { patient, specialist };
}

module.exports = {
  assertCanAccessPatientJournal,
  fetchPatientAndSpecialistContext,
};

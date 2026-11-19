// Frontend service layer — real backend edition.
//
// Every function keeps the exact shape the screens were built against (the old
// localStorage mock), but now calls the Node/Express API on :3001 with a JWT
// from POST /auth/login. Claim identities in the UI are the human references
// (CLM-2026-0142); the backend accepts refs wherever a claim id is needed.
// Notifications are a thin client-side feed fed by triage results (no backend
// table yet). All triage scores come from the real llama3.2:3b AI service —
// nothing here invents results.

import {
  CLAIM_STATUS,
  SCORING_METHOD,
  EVIDENCE_STATE,
  URGENCY_URGENT_THRESHOLD,
  ROLE_LABELS,
  ROLES,
} from "../constants.js";

const API_BASE = "http://localhost:3001/api";
const TOKEN_KEY = "ins04-token";

// ---------------------------------------------------------------- utilities

let listeners = [];
function emitChange() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* listener errors must not break others */ }
  });
}
export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
}

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "content-type": "application/json" };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch { /* empty body */ }
  if (!res.ok) {
    // A 401 means the stored token no longer matches a live user (e.g. the
    // database was reseeded). Drop the stale credentials so the next page
    // load lands on the login screen instead of a cascade of error states.
    if (res.status === 401) {
      try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage */ }
      try { sessionStorage.removeItem("ins04-session"); } catch { /* storage */ }
      const err = new Error("Session expired — please sign in again.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }
    const err = new Error(payload?.message || `Request failed (${res.status})`);
    if (payload?.details && Array.isArray(payload.details) && payload.details.length) {
      const fieldErrors = {};
      for (const d of payload.details) {
        if (d?.field) fieldErrors[d.field.split(".")[0]] = d.message;
      }
      if (Object.keys(fieldErrors).length) err.fieldErrors = fieldErrors;
    }
    err.reason =
      (typeof payload?.details === "string" ? payload.details : null) ||
      payload?.details?.[0]?.message ||
      payload?.message;
    err.code = payload?.code;
    throw err;
  }
  return payload;
}

const unwrap = (payload) => payload?.data;
const unwrapList = (payload) => payload?.data ?? [];

// ------------------------------------------------------------- shape mappers

export function mapScore(s) {
  if (!s) return null;
  return {
    claimId: s.claim_id ?? s.claimId ?? null,
    value: Number(s.value),
    factors: s.factors ?? [],
    tags: s.tags ?? null,
    coverageEvidence: s.coverage_evidence ?? s.coverageEvidence ?? [],
    evidenceState: s.evidence_state ?? s.evidenceState ?? EVIDENCE_STATE.PARTIAL,
    scoringMethod: s.scoring_method ?? s.scoringMethod,
    needsHumanReview: Boolean(s.needs_human_review ?? s.needsHumanReview),
    latencyMs: s.latency_ms ?? s.latencyMs ?? null,
    costUsd: s.cost_usd ?? s.costUsd ?? 0,
    processedAt: s.processed_at ?? s.processedAt,
    warnings: s.warnings ?? [],
  };
}

export function mapClaim(c) {
  if (!c) return null;
  return {
    id: c.ref,
    uuid: c.id,
    eventId: c.event_id ?? c.eventId,
    eventRegion: c.event_region ?? null,
    eventName: c.event_name ?? null,
    policyId: c.policy_id ?? c.policyId,
    policyholderId: c.policyholder_user_id ?? c.policyholderId ?? null,
    contactName: c.contact_name ?? c.contactName ?? null,
    contactEmail: c.contact_email ?? c.contactEmail ?? null,
    location: c.location,
    peril: c.peril,
    incidentDate: (c.incident_date ?? c.incidentDate ?? "").slice(0, 10),
    description: c.description ?? "",
    severity: c.severity,
    hardshipFlags: c.hardship_flags ?? c.hardshipFlags ?? [],
    documents: c.documents ?? [],
    status: c.status,
    receivedAt: c.received_at ?? c.receivedAt,
    clusterId: c.cluster_id ?? c.clusterId ?? null,
    clusterName: c.cluster_name ?? null,
    clusterManual: Boolean(c.cluster_manual ?? c.clusterManual),
    assignedAdjusterId: c.assigned_resource_id ?? c.assignedAdjusterId ?? null,
    adjusterName: c.adjuster_name ?? null,
    triageError: c.triage_error ?? c.triageError ?? null,
    score: mapScore(c.score),
    timeline: Array.isArray(c.timeline)
      ? c.timeline.map((t) => ({ ts: t.occurred_at ?? t.ts ?? t.occurredAt, label: t.label, actor: t.actor }))
      : [],
    assignments: Array.isArray(c.assignments)
      ? c.assignments.map((a) => ({
          id: a.id,
          adjusterId: a.resource_id ?? a.adjusterId,
          adjusterName: a.adjuster_name ?? a.adjusterName ?? null,
          note: a.note,
          assignedAt: a.assigned_at ?? a.assignedAt,
        }))
      : [],
  };
}

function mapCluster(cl) {
  return {
    id: cl.id,
    eventId: cl.event_id ?? cl.eventId,
    key: cl.key,
    peril: cl.peril,
    location: cl.location,
    name: cl.name,
    note: cl.note,
    createdAt: cl.created_at ?? cl.createdAt,
    claims: (cl.claims ?? []).map((c) => mapClaim(c)),
    claimCount: cl.claimCount ?? cl.claim_count ?? (cl.claims?.length ?? 0),
    unassignedCount: cl.unassignedCount ?? cl.unassigned_count ?? 0,
    highestPriority: cl.highestPriority ?? null,
  };
}

// ------------------------------------------------------------------- events

export async function getEvents() {
  const events = unwrapList(await request("/events?page=1&pageSize=100"));
  return events.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    region: e.region,
    declaredAt: e.declared_at ?? e.declaredAt,
    status: e.status,
    summary: e.summary ?? "",
    claimCount: e.claimCount ?? e.claim_count ?? 0,
  }));
}

export async function declareEvent(payload) {
  const errors = {};
  if (!payload.name || payload.name.trim().length < 3) errors.name = "Event name must be at least 3 characters.";
  if (!payload.type) errors.type = "Select an event type.";
  if (!payload.region || payload.region.trim().length < 3) errors.region = "Region must be at least 3 characters.";
  if (!payload.declaredAt) errors.declaredAt = "Declared-at timestamp is required.";
  if (Object.keys(errors).length) throw Object.assign(new Error("Validation failed"), { fieldErrors: errors });

  const event = unwrap(await request("/events", {
    method: "POST",
    body: {
      name: payload.name.trim(),
      type: payload.type,
      region: payload.region.trim(),
      declaredAt: new Date(payload.declaredAt).toISOString(),
      summary: payload.summary?.trim() || undefined,
    },
  }));
  emitChange();
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    region: event.region,
    declaredAt: event.declared_at ?? event.declaredAt,
    status: event.status,
    summary: event.summary ?? "",
    claimCount: 0,
  };
}

const EVENT_STATUS_LABELS_API = { active: "Active", monitoring: "Monitoring", closed: "Closed" };

export async function setEventStatus(eventId, status) {
  const event = unwrap(await request(`/events/${eventId}/status`, { method: "PATCH", body: { status } }));
  emitChange();
  return {
    id: event.id,
    name: event.name,
    status: event.status,
    summary: event.summary ?? "",
  };
}

// ------------------------------------------------------------------- claims

export async function getClaims(eventId = null) {
  const suffix = eventId ? `&eventId=${encodeURIComponent(eventId)}` : "";
  const { data } = await request(`/claims?page=1&pageSize=100${suffix}`);
  return data.map(mapClaim);
}

export async function getClaim(claimId) {
  return mapClaim(unwrap(await request(`/claims/${encodeURIComponent(claimId)}`)));
}

export async function getClaimsForPolicyholder(_policyholderId, _email = null) {
  // Resolved from the JWT identity server-side (/claims/mine).
  const claims = unwrapList(await request("/claims/mine"));
  return claims.map(mapClaim);
}

// Preferred active event for claims with no explicit event: the active event
// driving the surge (most claims), falling back to the most recently declared.
async function resolveFallbackEventId() {
  const events = await getEvents();
  const active = events
    .filter((e) => e.status === "active")
    .sort((a, b) => b.claimCount - a.claimCount || new Date(b.declaredAt) - new Date(a.declaredAt));
  return active[0]?.id || events[0]?.id || null;
}

export async function submitClaim(payload) {
  const eventId = payload.eventId || (await resolveFallbackEventId());
  const claim = mapClaim(unwrap(await request("/claims", {
    method: "POST",
    body: {
      eventId,
      policyId: payload.policyId.trim(),
      contactName: payload.contactName.trim(),
      contactEmail: payload.contactEmail.trim(),
      location: payload.location.trim(),
      peril: payload.peril,
      incidentDate: payload.incidentDate,
      description: payload.description.trim(),
      severity: payload.severity,
      hardshipFlags: payload.hardshipFlags || [],
      documents: payload.documents || [],
    },
  })));
  logActivityLocal("Intake", `New claim ${claim.id} submitted`, "Triage pending", claim.contactName);
  emitChange();
  // Triage runs on the server asynchronously in spirit — kick it off in the
  // background so the queue shows "pending" now and a score when it lands.
  scheduleTriage(claim.uuid);
  return claim;
}

export async function runTriageNow(claimId) {
  // Manual trigger (the "Retry triage" action). Awaits the real AI scoring.
  const result = unwrap(await request("/ai/run", { method: "POST", body: { claimId } }));
  emitChange();
  return { id: result.ref, status: result.status, score: mapScore(result.score) };
}

async function scheduleTriage(claimUuid, delayMs = 1200) {
  setTimeout(async () => {
    try {
      const claim = unwrap(await request(`/claims/${claimUuid}`));
      if (!claim || ![CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.TRIAGE_PENDING].includes(claim.status)) return;
      const result = unwrap(await request("/ai/run", { method: "POST", body: { claimId: claimUuid } }));
      const score = mapScore(result.score);
      if (score && score.scoringMethod === SCORING_METHOD.RULES_FALLBACK) {
        notify(`Claim ${result.ref} fell back to rules-based scoring`, true);
      }
      if (score && score.value >= URGENCY_URGENT_THRESHOLD) {
        notify(`Urgent claim ${result.ref} is awaiting review`, true);
      }
      logActivityLocal("Triage", `Claim ${result.ref} scored`, score.scoringMethod === SCORING_METHOD.AI_ASSISTED ? "AI-assisted" : "Fallback", "AI service");
    } catch {
      // Background triage failure surfaces via the queue's pending state and
      // the drawer's Retry action — no phantom score is ever invented here.
    } finally {
      emitChange();
    }
  }, delayMs);
}

export async function updateClaimStatus(claimId, newStatus) {
  const claim = mapClaim(unwrap(await request(`/claims/${encodeURIComponent(claimId)}/status`, {
    method: "PATCH",
    body: { status: newStatus },
  })));
  emitChange();
  if (newStatus === CLAIM_STATUS.INFO_REQUIRED) {
    notify(`Claim ${claim.id} requires further information from the policyholder`, true);
  }
  return claim;
}

export async function markForHumanReview(claimId) {
  const claim = mapClaim(unwrap(await request(`/claims/${encodeURIComponent(claimId)}/flag-review`, { method: "POST" })));
  emitChange();
  return claim;
}

// --------------------------------------------------------------- assignment

export async function getAdjusters() {
  const adjusters = unwrapList(await request("/adjusters"));
  return adjusters.map((a) => ({
    id: a.id,
    name: a.name,
    region: a.region,
    phone: a.phone,
    capacity: a.capacity,
    status: a.status,
    load: a.load ?? 0,
    claims: [],
  }));
}

export async function assignClaim(claimId, adjusterId) {
  const claim = mapClaim(unwrap(await request(`/claims/${encodeURIComponent(claimId)}/assign`, {
    method: "POST",
    body: { adjusterId },
  })));
  emitChange();
  return claim;
}

export async function unassignClaim(claimId) {
  const claim = mapClaim(unwrap(await request(`/claims/${encodeURIComponent(claimId)}/unassign`, { method: "POST" })));
  emitChange();
  return claim;
}

// ---------------------------------------------------------------- clusters

export async function getClusters(eventId) {
  const clusters = unwrapList(await request(`/clusters?eventId=${encodeURIComponent(eventId)}&page=1&pageSize=100`));
  return clusters.map(mapCluster);
}

export async function rebuildClusters(eventId) {
  const res = unwrap(await request(`/events/${eventId}/clusters/rebuild`, { method: "POST" }));
  emitChange();
  logActivityLocal("Cluster", `Clusters rebuilt: ${res.clusters} group(s), ${res.unclustered} ungrouped claim(s)`, `${res.clusters} groups`, "You");
  return res; // { clusters, unclustered }
}

export async function moveClaimToCluster(claimId, clusterId) {
  const claim = mapClaim(unwrap(await request(`/claims/${encodeURIComponent(claimId)}/move-cluster`, {
    method: "POST",
    body: { clusterId },
  })));
  emitChange();
  return claim;
}

// ------------------------------------------------------------- batch intake

// rows come from intakeTemplate.normalizeRows (Excel/CSV template contract).
export async function importClaimsRows(rows, eventId, onProgress) {
  const errors = [];
  const res = unwrap(await request("/claims/batch", {
    method: "POST",
    body: {
      eventId,
      rows: rows.map((r) => ({
        ref: r.reference || undefined,
        policyId: r.policyId || undefined,
        contactName: r.contactName || undefined,
        contactEmail: r.contactEmail || undefined,
        location: r.location,
        peril: r.peril,
        severity: r.severity,
        incidentDate: r.incidentDate || undefined,
        hardshipFlags: r.hardshipFlags || [],
        description: r.description || undefined,
      })),
    },
  }));
  for (const e of res.errors ?? []) {
    errors.push({ line: e.line, message: e.message });
  }
  onProgress?.({ done: res.created, total: rows.length });

  // Queue real triage for each imported claim (background).
  (res.refs ?? []).forEach((ref, i) => {
    setTimeout(async () => {
      try {
        const created = unwrap(await request(`/claims/${encodeURIComponent(ref)}`));
        await request("/ai/run", { method: "POST", body: { claimId: created.id } });
        notify(`Imported claim ${ref} scored`, false);
      } catch { /* surfaced via queue pending state */ } finally {
        emitChange();
      }
    }, 400 + i * 600);
  });

  logActivityLocal("Batch intake", `Batch import: ${res.created} claims created`, res.failed ? "Partial" : "OK", "System");
  emitChange();
  return { created: res.created, errors, failed: res.failed };
}

// ------------------------------------------------------------- activity etc.

export async function getActivity() {
  const rows = unwrapList(await request("/activity?page=1&pageSize=12"));
  return rows.map((a) => ({
    id: a.id,
    at: a.created_at,
    claimId: a.claim_ref ?? null,
    action: a.action,
    label: a.label,
    statusLabel: a.status_label,
    source: a.source,
  }));
}

// ---------------------------------------------- notifications (client feed)

const NOTIFY_KEY = "ins04-notifications";

function loadNotifications() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFY_KEY)) || [];
  } catch {
    return [];
  }
}

function persistNotifications(list) {
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(list.slice(0, 40)));
  } catch { /* storage may be unavailable */ }
}

function notify(text, unread = true) {
  const list = loadNotifications();
  list.unshift({ id: `n-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, text, at: new Date().toISOString(), unread });
  persistNotifications(list);
}

function logActivityLocal(_action, label, statusLabel, source) {
  // Server-side activity log records operational events; notifications mirror
  // the notable ones for the bell menu.
  if (statusLabel && /urgent|fail/i.test(label)) notify(label, true);
  void source;
}

export async function getNotifications() {
  return loadNotifications();
}

export async function markNotificationsRead() {
  const list = loadNotifications().map((n) => ({ ...n, unread: false }));
  persistNotifications(list);
  emitChange();
}

export async function getAIHealth() {
  return unwrap(await request("/ai/health"));
}

// --------------------------------------------------- auto-distribution (crew)

// Cluster-first, capacity-first plan: how many claims land on each adjuster,
// which clusters move whole, and what stays unassigned (crew capacity reached).
export async function previewAutoAssign() {
  return unwrap(await request("/assignments/preview"));
}

export async function applyAutoAssign() {
  const res = unwrap(await request("/assignments/auto", { method: "POST" }));
  emitChange();
  return res;
}

// ------------------------------------------------------------------- auth

export async function login(email, password) {
  const { data } = await request("/auth/login", { method: "POST", body: { email, password } });
  try {
    sessionStorage.setItem(TOKEN_KEY, data.token);
  } catch { /* storage may be unavailable */ }
  const u = data.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role],
    policyId: u.policyId ?? null,
    adjusterId: u.adjusterId ?? null,
    home: u.role === ROLES.MANAGER ? "/dashboard" : u.role === ROLES.ADJUSTER ? "/my-queue" : "/my-claims",
    token: data.token,
  };
}

export function logout() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* storage may be unavailable */ }
}

// Legacy exports kept for compatibility with older call sites/tests.
export function generateClaimRef() {
  return `CLM-2026-${String(Date.now()).slice(-6)}`;
}

export function resetDemoData() {
  // No-op with a real backend — data lives in Postgres.
  emitChange();
}

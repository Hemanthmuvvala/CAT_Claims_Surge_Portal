import { db } from "../lib/db.js";
import { claimDao, clusterDao, scoreDao, activityDao, assignmentDao, resourceDao, eventDao } from "../data-access/index.js";
import { scoreClaim } from "./triageEngine.js";
import { aiService } from "./aiService.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { getAdjusterStatus } from "../lib/adjusterStatus.js";
import {
  computeClusterKey,
  normalizePerilFamily,
  clusterDisplayName,
  rebuildClustersForEvent,
} from "../lib/clusterLogic.js";

export const CLAIM_STATUSES = [
  "submitted",
  "triage_pending",
  "triaged",
  "assigned",
  "in_review",
  "info_required",
  "assessment_complete",
  "closed",
];

// Statuses an adjuster may set — operational only, never coverage decisions.
export const ADJUSTER_ALLOWED_STATUSES = ["assigned", "in_review", "info_required", "assessment_complete"];

export const claimService = {
  // Standalone cluster functions are exposed on the service object too so
  // routes can call everything uniformly.
  rebuildClusters,
  moveClaimToCluster,

  // Claim ids with a triage run currently in progress (double-run guard).
  _inflightTriage: new Set(),

  async create(input) {
    let eventId = input.eventId;
    if (eventId) {
      const chosen = await eventDao.byId(eventId);
      if (!chosen) throw badRequest("Unknown eventId", [{ field: "eventId", message: "Event does not exist" }]);
      if (chosen.status === "closed") {
        throw badRequest("That event is closed for claims intake", [{ field: "eventId", message: "Event is closed" }]);
      }
    } else {
      // "Not sure / other": attach to the active event driving the surge —
      // the active event with the most claims (fallback: most recently declared).
      const candidates = await db("events").where("status", "active");
      const counts = await db("claims")
        .whereIn("event_id", candidates.length ? candidates.map((e) => e.id) : ["00000000-0000-0000-0000-000000000000"])
        .select("event_id")
        .count("id as n")
        .groupBy("event_id");
      const countBy = new Map(counts.map((r) => [r.event_id, Number(r.n)]));
      const ranked = [...candidates].sort(
        (a, b) => (countBy.get(b.id) ?? 0) - (countBy.get(a.id) ?? 0) || new Date(b.declared_at) - new Date(a.declared_at)
      );
      eventId = ranked[0]?.id ?? null;
      if (!eventId) throw badRequest("No open CAT event is accepting claims right now", [{ field: "eventId", message: "No active event" }]);
    }
    const event = await eventDao.byId(eventId);
    if (!event) throw badRequest("Unknown eventId", [{ field: "eventId", message: "Event does not exist" }]);

    const ref = await nextRef();
    const claim = await claimDao.create({
      ref,
      event_id: event.id,
      policy_id: input.policyId,
      policyholder_user_id: input.policyholderUserId ?? null,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      location: input.location,
      peril: input.peril,
      incident_date: input.incidentDate,
      description: input.description,
      severity: input.severity,
      hardship_flags: JSON.stringify(input.hardshipFlags ?? []),
      documents: JSON.stringify(input.documents ?? []),
      status: "triage_pending",
    });

    await claimDao.addTimeline(claim.id, "Claim received", input.contactName || "Intake");
    await claimDao.addTimeline(claim.id, "Queued for triage", "System");
    await activityDao.log({
      claimId: claim.id,
      action: "Intake",
      label: `New claim ${ref} submitted`,
      statusLabel: "Triage pending",
      source: input.contactName || "Intake",
    });
    await autoCluster(claim);
    // Server-owned triage: the score must appear even if the claimant closes
    // their browser straight after submitting (fire-and-forget; failures are
    // visible in the queue and via the drawer's Retry action).
    claimService.runTriage(claim.ref).catch(() => {});
    return claim;
  },

  async importBatch(input) {
    const event = await eventDao.byId(input.eventId);
    if (!event) throw badRequest("Unknown eventId");

    const created = [];
    const errors = [];
    const severities = ["critical", "high", "medium", "low"];
    const HARDSHIP_FLAGS = [
      "Elderly resident",
      "Medical needs",
      "No power / water",
      "Displaced from home",
      "Young children",
      "Livelihood at risk",
    ];
    const flagSet = new Set(HARDSHIP_FLAGS.map((f) => f.toLowerCase()));

    const normalizeFlags = (raw) => {
      const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[;,]/);
      const flags = [];
      const unknown = [];
      for (const item of list) {
        const f = String(item ?? "").trim();
        if (!f) continue;
        const known = HARDSHIP_FLAGS.find((h) => h.toLowerCase() === f.toLowerCase());
        if (known) {
          if (!flags.includes(known)) flags.push(known);
        } else unknown.push(f);
      }
      return { flags, unknown };
    };

    // Duplicate refs (within the batch or already stored) are rejected per row.
    const existingRefs = new Set((await db("claims").select("ref")).map((r) => r.ref));
    const seenRefs = new Set();

    for (const [i, row] of input.rows.entries()) {
      const lineNo = i + 1;
      if (!row.location || !row.peril) {
        errors.push({ line: lineNo, message: "location and peril are required" });
        continue;
      }
      if (!severities.includes(row.severity)) {
        errors.push({ line: lineNo, message: `severity must be one of: ${severities.join(", ")}` });
        continue;
      }
      if (row.contactEmail && !/^\S+@\S+\.\S+$/.test(row.contactEmail)) {
        errors.push({ line: lineNo, message: `"${row.contactEmail}" is not a valid email address` });
        continue;
      }
      const { flags, unknown } = normalizeFlags(row.hardshipFlags);
      if (unknown.length) {
        errors.push({ line: lineNo, message: `Unknown hardship flag(s): ${unknown.join(", ")}. Valid: ${HARDSHIP_FLAGS.join(", ")}` });
        continue;
      }
      const wantedRef = row.ref?.trim();
      if (wantedRef) {
        if (existingRefs.has(wantedRef) || seenRefs.has(wantedRef)) {
          errors.push({ line: lineNo, message: `Reference "${wantedRef}" already exists — references must be unique` });
          continue;
        }
        seenRefs.add(wantedRef);
      }
      try {
        const ref = wantedRef || (await nextRef());
        const claim = await claimDao.create({
          ref,
          event_id: input.eventId,
          policy_id: row.policyId || "POL-BATCH",
          contact_name: row.contactName || null,
          contact_email: row.contactEmail || null,
          location: row.location,
          peril: row.peril,
          incident_date: row.incidentDate || new Date().toISOString().slice(0, 10),
          description: row.description || "Imported via batch intake.",
          severity: row.severity,
          hardship_flags: JSON.stringify(flags),
          documents: JSON.stringify([]),
          status: "triage_pending",
        });
        await claimDao.addTimeline(claim.id, "Claim received (batch import)", "Batch intake");
        await claimDao.addTimeline(claim.id, "Queued for triage", "System");
        await autoCluster(claim);
        created.push(claim.ref);
      } catch (err) {
        errors.push({ line: lineNo, message: err.message });
      }
    }

    if (created.length) {
      await activityDao.log({
        action: "Batch intake",
        label: `Batch import: ${created.length} claims created`,
        statusLabel: errors.length ? `${errors.length} validation errors` : "OK",
        source: "Batch intake",
      });
      // Triage every imported claim server-side (staggered so the local LLM
      // processes them one at a time).
      created.forEach((ref, i) => {
        setTimeout(() => {
          claimService.runTriage(ref).catch(() => {});
        }, 800 + i * 1500);
      });
    }
    return { created: created.length, refs: created, failed: errors.length, errors };
  },

  async detail(id) {
    const claim = await claimDao.byIdOrRef(id);
    if (!claim) throw notFound("Claim not found");
    const [score, timeline, assignments] = await Promise.all([
      claimDao.latestScore(claim.id),
      claimDao.timeline(claim.id),
      assignmentDao.forClaim(claim.id),
    ]);
    return { ...claim, score, timeline, assignments };
  },

  /**
   * Run triage for a claim: try the AI service first (with timeout), fall back
   * to deterministic rules scoring. Persists a PriorityScore row and moves the
   * claim to `triaged` on success. Never implies approval/denial.
   *
   * Both the server (auto after intake) and the browser (fast feedback) may
   * trigger triage for the same claim — an in-flight set keeps the second
   * caller from double-scoring; it returns the current state instead.
   */
  async runTriage(id, { forceMethod } = {}) {
    const claim = await claimDao.byIdOrRef(id);
    if (!claim) throw notFound("Claim not found");

    if (claimService._inflightTriage.has(claim.id)) {
      const latest = await claimDao.latestScore(claim.id);
      return { ...claim, score: latest ?? null };
    }
    if (!["submitted", "triage_pending", "triaged"].includes(claim.status)) {
      throw conflict(`Claim ${claim.ref} is ${claim.status} — triage is only run before assignment`);
    }
    claimService._inflightTriage.add(claim.id);
    try {
      return await claimService._doTriage(claim, { forceMethod });
    } finally {
      claimService._inflightTriage.delete(claim.id);
    }
  },

  async _doTriage(claim, { forceMethod } = {}) {
    const scoringStartedAt = performance.now();
    let outcome = null;
    if (forceMethod !== "rules_fallback") {
      // Give the AI embedding registry our current clusters so its
      // clusterSuggestion refers to real cluster ids (best effort, never fatal).
      const eventClusters = await clusterDao.list(claim.event_id);
      await aiService.syncClusters(eventClusters);
      outcome = await aiService.requestScore(claim);
    }
    let method = outcome?.method ?? "rules_fallback";
    const currentProviderStatus = aiService.health();
    let providerStatus =
      outcome?.providerStatus ??
      (currentProviderStatus === "operational"
        ? "operational"
        : currentProviderStatus === "unavailable"
          ? "unavailable"
          : "degraded");

    if (!outcome) {
      const result = scoreClaim(claim, { method: "rules_fallback", providerStatus });
      outcome = { result, method: "rules_fallback", providerStatus };
      method = "rules_fallback";
    }

    const latencyMs = Math.round(performance.now() - scoringStartedAt);
    outcome.result.latencyMs = latencyMs;
    const isAi = method === "ai_assisted";
    const scoreRow = await scoreDao.create({
      claim_id: claim.id,
      value: outcome.result.score,
      factors: JSON.stringify(outcome.result.factors),
      tags: outcome.result.tags ? JSON.stringify(outcome.result.tags) : null,
      scoring_method: method,
      latency_ms: latencyMs,
      cost_usd: 0,
      evidence_state: outcome.result.evidenceState,
      coverage_evidence: JSON.stringify(outcome.result.coverageEvidence),
      needs_human_review: outcome.result.needsHumanReview,
      warnings: JSON.stringify(outcome.result.warnings),
      processed_at: new Date(),
    });

    // Advisory cluster refinement: the AI may propose the claim joins a
    // different cluster (near-miss street matches, free-text locations).
    // Applied only when the suggested cluster id really exists in our registry.
    if (isAi && outcome.result.clusterSuggestion?.clusterId) {
      const target = await clusterDao.byId(outcome.result.clusterSuggestion.clusterId);
      if (target && target.event_id === claim.event_id) {
        await clusterDao.attachClaim(target.id, claim.id);
        await claimDao.update(claim.id, { cluster_id: target.id });
        await claimDao.addTimeline(
          claim.id,
          `AI cluster suggestion applied: joined "${target.name}" (${Math.round(
            (outcome.result.clusterSuggestion.similarity ?? 0) * 100
          )}% similarity)`,
          "AI service"
        );
      }
    }

    await claimDao.update(claim.id, { status: "triaged" });
    await claimDao.addTimeline(
      claim.id,
      `Triage scored (${method === "ai_assisted" ? "AI-assisted" : "rules fallback"})`,
      method === "ai_assisted" ? "AI service" : "Rules engine"
    );
    await activityDao.log({
      claimId: claim.id,
      action: "Triage",
      label: `Claim ${claim.ref} scored`,
      statusLabel: method === "ai_assisted" ? "AI-assisted" : "Fallback",
      source: method === "ai_assisted" ? "AI service" : "Rules engine",
    });

    return { ...claim, status: "triaged", score: scoreRow };
  },

  async updateStatus(id, newStatus, actor) {
    const claim = await claimDao.byIdOrRef(id);
    if (!claim) throw notFound("Claim not found");
    if (!CLAIM_STATUSES.includes(newStatus)) {
      throw badRequest(`Invalid status: ${newStatus}`);
    }
    if (claim.status === newStatus) return claim; // idempotent
    await claimDao.update(claim.id, { status: newStatus });
    await claimDao.addTimeline(claim.id, statusLabel(newStatus), actor);
    await activityDao.log({
      claimId: claim.id,
      action: "Status",
      label: `Claim ${claim.ref} → ${statusLabel(newStatus)}`,
      statusLabel: statusLabel(newStatus),
      source: actor,
    });
    return claimDao.byId(claim.id);
  },

  async assign(id, resourceId, actor = "Manager") {
    const claim = await claimDao.byIdOrRef(id);
    if (!claim) throw notFound("Claim not found");
    const resource = await resourceDao.byId(resourceId);
    if (!resource) throw badRequest("Unknown adjusterId");

    // Idempotency: already assigned to this adjuster → no-op success.
    if (claim.assigned_resource_id === resourceId) return claimDao.byId(claim.id);

    if (resource.status === "unavailable") {
      throw conflict("Assignment blocked", `${resource.name} is currently unavailable.`);
    }
    const load = await claimDao.activeLoad(resourceId);
    if (load >= resource.capacity) {
      throw conflict(
        "Assignment blocked",
        `${resource.name} is at full capacity (${load}/${resource.capacity}). Choose an adjuster with available capacity.`
      );
    }
    if (!["triaged", "assigned"].includes(claim.status)) {
      throw conflict(`Claim ${claim.ref} is ${claim.status} — only triaged claims can be assigned`);
    }

    await assignmentDao.create({ claim_id: claim.id, resource_id: resourceId, note: `Assigned by ${actor}` });
    await claimDao.update(claim.id, { status: "assigned", assigned_resource_id: resourceId });
    await claimDao.addTimeline(claim.id, "Assigned for assessment", `Assigned to ${resource.name}`);
    await activityDao.log({
      claimId: claim.id,
      action: "Assignment",
      label: `Claim ${claim.ref} assigned to ${resource.name}`,
      statusLabel: "Assigned",
      source: actor,
    });
    return claimDao.byId(claim.id);
  },

  async unassign(id, actor = "Manager") {
    const claim = await claimDao.byIdOrRef(id);
    if (!claim) throw notFound("Claim not found");
    await claimDao.update(claim.id, {
      status: claim.status === "assigned" ? "triaged" : claim.status,
      assigned_resource_id: null,
    });
    await claimDao.addTimeline(claim.id, "Returned to queue", actor);
    await activityDao.log({
      claimId: claim.id,
      action: "Assignment",
      label: `Claim ${claim.ref} returned to queue`,
      statusLabel: "Unassigned",
      source: actor,
    });
    return claimDao.byId(claim.id);
  },

  /**
   * Crew auto-distribution plan (no side effects — powers the preview modal).
   *
   * Rules:
   * - Eligible: triaged + unassigned claims (assignment happens after triage).
   * - Whole clusters go to ONE adjuster whenever their remaining capacity
   *   fits the entire group (best-fit placement).
   * - If nobody can take the whole cluster, its claims split equally across
   *   adjusters with spare capacity (most remaining capacity first).
   * - Urgent clusters are placed first (highest priority score wins).
   * - When the whole crew fills up, leftover claims stay unassigned.
   */
  async distributionPlan() {
    const eligible = await claimDao.base()
      .where("c.status", "triaged")
      .whereNull("c.assigned_resource_id")
      // cluster_name comes from the clusters join in base() — not a column on claims
      .select("c.id", "c.ref", "c.cluster_id", "c.received_at");

    const scoreRows = eligible.length
      ? await db("priority_scores as ps")
          .whereIn("ps.claim_id", eligible.map((r) => r.id))
          .orderBy("ps.processed_at", "desc")
          .select("ps.claim_id", "ps.value")
      : [];
    const scoreBy = new Map(); // first row per claim = latest score
    for (const s of scoreRows) if (!scoreBy.has(s.claim_id)) scoreBy.set(s.claim_id, Number(s.value));

    const pool = [];
    for (const r of await resourceDao.list()) {
      const load = await claimDao.activeLoad(r.id);
      pool.push({
        id: r.id, name: r.name, region: r.region,
        status: getAdjusterStatus(r.status, load, r.capacity),
        load, capacity: r.capacity,
        remaining: Math.max(0, r.capacity - load),
        claimRefs: [], clusters: [],
      });
    }
    const crewCapacityTotal = pool.reduce((s, p) => s + p.capacity, 0);
    const crewCapacityOpen = pool.reduce((s, p) => s + p.remaining, 0);

    // Group claims by cluster; unclustered claims travel as singleton groups.
    const groupMap = new Map();
    for (const c of eligible) {
      const key = c.cluster_id || `__solo__${c.id}`;
      if (!groupMap.has(key)) groupMap.set(key, { clusterId: c.cluster_id, clusterName: c.cluster_name, claims: [] });
      groupMap.get(key).claims.push(c);
    }
    const groups = [...groupMap.values()];
    for (const g of groups) {
      for (const c of g.claims) c.score = scoreBy.get(c.id) ?? null;
      g.claims.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || new Date(a.received_at) - new Date(b.received_at));
      g.maxScore = g.claims[0]?.score ?? 0;
    }
    groups.sort((a, b) => b.maxScore - a.maxScore);

    const placeWhole = (group) => {
      const size = group.claims.length;
      // Balance across the crew: the adjuster with the most spare capacity
      // takes the next whole cluster (self-levels as remaining shrinks).
      const fits = pool
        .filter((p) => p.status !== "unavailable" && p.remaining >= size)
        .sort((a, b) => b.remaining - a.remaining || b.capacity - a.capacity || a.name.localeCompare(b.name));
      if (!fits.length) return false;
      const target = fits[0];
      target.claimRefs.push(...group.claims.map((c) => c.ref));
      target.remaining -= size;
      if (group.clusterId) target.clusters.push({ name: group.clusterName, count: size });
      return true;
    };

    const openPool = () =>
      pool.filter((p) => p.status !== "unavailable" && p.remaining > 0).sort((a, b) => b.remaining - a.remaining);

    const unassigned = [];
    for (const group of groups) {
      if (placeWhole(group)) continue;
      // Split equally across whoever still has capacity, urgent claims first.
      for (const claim of group.claims) {
        const target = openPool()[0];
        if (!target) {
          unassigned.push(claim);
          continue;
        }
        target.claimRefs.push(claim.ref);
        target.remaining -= 1;
        if (group.clusterId) {
          const tracked = target.clusters.find((x) => x.name === group.clusterName);
          if (tracked) tracked.count += 1;
          else target.clusters.push({ name: group.clusterName, count: 1, partial: true });
        }
      }
    }

    const perAdjuster = pool.map((p) => ({
      id: p.id,
      name: p.name,
      region: p.region,
      status: p.status,
      load: p.load,
      capacity: p.capacity,
      assignedCount: p.claimRefs.length,
      newTotal: p.load + p.claimRefs.length,
      remainingAfter: Math.max(0, p.remaining),
      clusters: p.clusters,
      claimRefs: p.claimRefs,
    }));
    const assignedTotal = perAdjuster.reduce((s, a) => s + a.assignedCount, 0);

    const awaitingTriage = Number(
      (
        await db("claims")
          .whereIn("status", ["submitted", "triage_pending"])
          .whereNull("assigned_resource_id")
          .count("id as n")
          .first()
      ).n
    );

    return {
      eligible: eligible.length,
      assignedTotal,
      unassignedTotal: unassigned.length,
      unassigned: unassigned.map((c) => ({ ref: c.ref, score: c.score, clusterName: c.cluster_name })),
      crewCapacityTotal,
      crewCapacityOpen,
      awaitingTriage,
      perAdjuster,
    };
  },

  /** Apply the distribution plan: one assignment per claim, capacity-guarded. */
  async applyDistribution(actor = "Manager") {
    const plan = await this.distributionPlan();
    const failed = [];
    let assigned = 0;
    for (const adj of plan.perAdjuster) {
      for (const ref of adj.claimRefs) {
        try {
          await this.assign(ref, adj.id, actor);
          assigned += 1;
        } catch (err) {
          failed.push({ ref, reason: err.message });
        }
      }
    }
    await activityDao.log({
      action: "Assignment",
      label: `Auto-distribution: ${assigned} claim(s) assigned across the crew`,
      statusLabel: plan.unassignedTotal ? `${plan.unassignedTotal} left unassigned` : "All assigned",
      source: actor,
    });
    return {
      assigned,
      failed,
      eligible: plan.eligible,
      unassigned: plan.unassigned,
      unassignedTotal: plan.unassignedTotal,
      perAdjuster: plan.perAdjuster,
    };
  },

  async flagForReview(id, actor = "Manager") {
    const claim = await claimDao.byIdOrRef(id);
    if (!claim) throw notFound("Claim not found");
    const score = await claimDao.latestScore(claim.id);
    if (score) {
      await db("priority_scores").where("id", score.id).update({ needs_human_review: true });
    }
    await claimDao.addTimeline(claim.id, "Flagged for human review", actor);
    await activityDao.log({
      claimId: claim.id,
      action: "Review",
      label: `Claim ${claim.ref} flagged for human review`,
      statusLabel: "Flagged",
      source: actor,
    });
    return claimDao.byId(claim.id);
  },

  /** Dashboard summary for one event. */
  async eventSummary(eventId) {
    const event = await eventDao.byId(eventId);
    if (!event) throw notFound("Event not found");
    const rows = await db("claims")
      .where("event_id", eventId)
      .select("status", "severity");

    const total = rows.length;
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

    const scores = await db("priority_scores as ps")
      .join("claims as c", "c.id", "ps.claim_id")
      .where("c.event_id", eventId)
      .select("ps.value", "ps.scoring_method", "ps.latency_ms", "ps.cost_usd");

    const urgentAwaiting = scores.filter((s) => s.value >= 85).length;
    const fallback = scores.filter((s) => s.scoring_method === "rules_fallback").length;
    const avgLatency = scores.length
      ? Math.round(scores.reduce((a, s) => a + (s.latency_ms || 0), 0) / scores.length)
      : 0;
    const totalCost = scores.reduce((a, s) => a + Number(s.cost_usd || 0), 0);

    return {
      event: { ...event, claimCount: total },
      totals: {
        total,
        triaged: scores.length,
        pending: (byStatus.submitted || 0) + (byStatus.triage_pending || 0),
        urgentAwaiting,
        fallback,
        perMinute: Number((scores.length / (24 * 60)).toFixed(2)),
      },
      byStatus,
      aiHealth: {
        modelStatus: aiService.health(),
        avgLatencyMs: avgLatency,
        fallbackRatePct: scores.length ? Math.round((fallback / scores.length) * 100) : 0,
        totalCostUsd: Math.round(totalCost * 100) / 100,
        costPerClaimUsd: scores.length ? Math.round((totalCost / scores.length) * 100) / 100 : 0,
        lastUpdated: new Date().toISOString(),
      },
    };
  },
};

async function nextRef() {
  // Atomic: a sequence can never hand the same number to two concurrent
  // inserts (the old count(*)+142 derivation collided under load).
  const { rows } = await db.raw("SELECT nextval('claim_ref_seq') AS n");
  return `CLM-2026-0${Number(rows[0].n)}`;
}

function statusLabel(status) {
  return {
    submitted: "Submitted",
    triage_pending: "Triage pending",
    triaged: "Triaged",
    assigned: "Assigned",
    in_review: "Review in progress",
    info_required: "Info required",
    assessment_complete: "Assessment complete",
    closed: "Closed",
  }[status];
}

/**
 * Auto-group a new claim by (peril family, street block). Attaches the claim to
 * the existing cluster with the same key, or pairs it with one unclustered,
 * manually-unmoved neighbour sharing the key (minimum 2 claims per cluster).
 * Mirrors frontend/src/services/api.js attachClaimAuto.
 */
export async function autoCluster(claim) {
  const key = computeClusterKey(claim);
  if (!key.split("||")[1]) return null; // no location -> cannot place on a street

  const existing = await db("clusters").where({ event_id: claim.event_id, key }).first();
  if (existing) {
    await clusterDao.attachClaim(existing.id, claim.id);
    await claimDao.update(claim.id, { cluster_id: existing.id });
    return existing;
  }

  const peer = await db("claims as c")
    .leftJoin("cluster_claims as cc", "cc.claim_id", "c.id")
    .where("c.event_id", claim.event_id)
    .where("c.id", "!=", claim.id)
    .where("c.cluster_manual", false)
    .whereNull("c.cluster_id")
    .whereNull("cc.claim_id")
    .first()
    .catch(() => null);
  if (!peer) return null; // singleton stays unclustered until a neighbour arrives

  const { display } = normalizePerilFamily(claim.peril);
  // Two concurrent intakes from the same street both pass the "existing"
  // check above; ON CONFLICT IGNORE makes the second insert a no-op and the
  // re-fetch routes that claim onto the winning cluster (no 500, no dupes).
  const inserted = await db("clusters")
    .insert({
      event_id: claim.event_id,
      key,
      peril_family: display,
      location_key: key.split("||")[1],
      peril: display,
      location: String(claim.location || "").trim(),
      name: clusterDisplayName(display, claim.location),
      note: "Auto-grouped by peril and street block.",
    })
    .onConflict(["event_id", "key"])
    .ignore()
    .returning("*");
  const cluster =
    inserted[0] ?? (await db("clusters").where({ event_id: claim.event_id, key }).first());
  await clusterDao.attachClaim(cluster.id, claim.id);
  await clusterDao.attachClaim(cluster.id, peer.id);
  await claimDao.update(claim.id, { cluster_id: cluster.id });
  await claimDao.update(peer.id, { cluster_id: cluster.id });
  return cluster;
}

/**
 * Recompute automatic clusters for an event. Claims the manager moved by hand
 * (cluster_manual) keep their assignment as long as the target cluster's key
 * still exists after the rebuild. Mirrors frontend attachEventClusters.
 */
export async function rebuildClusters(eventId, actor = "Manager") {
  const event = await eventDao.byId(eventId);
  if (!event) throw notFound("Event not found");

  const claims = await db("claims").where("event_id", eventId).select("*");
  const oldClusters = await clusterDao.list(eventId);
  const oldById = new Map(oldClusters.map((r) => [r.id, r]));

  // Manual moves: claimId -> old target cluster id.
  const manual = new Map();
  for (const c of claims) {
    if (c.cluster_manual && c.cluster_id) manual.set(c.id, c.cluster_id);
  }
  const autoClaims = claims.filter((c) => !manual.has(c.id));
  const { clusters, assignment } = rebuildClustersForEvent(autoClaims);
  const claimToKey = new Map(assignment);

  // Final key set: rebuilt clusters + old keys still needed by manual moves.
  const finalDefs = new Map(); // key -> cluster definition
  for (const cl of clusters) {
    finalDefs.set(cl.key, {
      peril_family: cl.perilFamily,
      location_key: cl.locationKey,
      peril: cl.peril,
      location: cl.location,
      name: cl.name,
      note: cl.note,
    });
  }
  const manualKeyByClaim = new Map(); // claimId -> old target key
  for (const [claimId, targetId] of manual) {
    const oldRow = oldById.get(targetId);
    if (!oldRow) continue; // dangling target — move falls out
    if (!finalDefs.has(oldRow.key)) {
      finalDefs.set(oldRow.key, {
        peril_family: oldRow.peril_family || normalizePerilFamily(oldRow.peril).display,
        location_key: oldRow.location_key || oldRow.key.split("||")[1] || oldRow.key,
        peril: oldRow.peril,
        location: oldRow.location,
        name: oldRow.name,
        note: oldRow.note || "Kept from manual grouping.",
      });
    }
    manualKeyByClaim.set(claimId, oldRow.key);
  }

  // Reconcile clusters in place: delete obsolete rows (junction cascades),
  // keep survivors, create missing ones.
  for (const oldRow of oldClusters) {
    if (!finalDefs.has(oldRow.key)) {
      await db("claims").where("cluster_id", oldRow.id).update({ cluster_id: null });
      await clusterDao.deleteById(oldRow.id);
    }
  }
  const keyToId = new Map();
  for (const [key, def] of finalDefs) {
    const existing = await db("clusters").where({ event_id: eventId, key }).first();
    if (existing) {
      keyToId.set(key, existing.id);
    } else {
      const [row] = await db("clusters")
        .insert({ event_id: eventId, key, ...def })
        .returning("id");
      keyToId.set(key, row.id ?? row);
    }
  }

  // Apply final assignments (manual wins over auto).
  for (const c of claims) {
    let targetKey = null;
    let isManual = false;
    if (manualKeyByClaim.has(c.id)) {
      targetKey = manualKeyByClaim.get(c.id);
      isManual = true;
    } else if (claimToKey.has(c.id)) {
      targetKey = claimToKey.get(c.id);
    }
    const clusterId = targetKey ? keyToId.get(targetKey) ?? null : null;
    await clusterDao.detachClaim(c.id);
    if (clusterId) await clusterDao.attachClaim(clusterId, c.id);
    if (c.cluster_id !== clusterId || Boolean(c.cluster_manual) !== isManual) {
      await claimDao.update(c.id, { cluster_id: clusterId, cluster_manual: isManual });
    }
  }

  const clusterCount = keyToId.size;
  const unclustered = claims.filter((c) => {
    const manualKeep = manualKeyByClaim.has(c.id) && keyToId.get(manualKeyByClaim.get(c.id));
    const autoKey = claimToKey.get(c.id);
    return !(manualKeep || (autoKey && keyToId.get(autoKey)));
  }).length;

  await activityDao.log({
    action: "Cluster",
    label: `Clusters rebuilt: ${clusterCount} group(s), ${unclustered} ungrouped claim(s)`,
    statusLabel: `${clusterCount} groups`,
    source: actor,
  });
  return { clusters: clusterCount, unclustered };
}

/**
 * Move a claim into a cluster (or out of any cluster with clusterId = null).
 * The move is marked manual so later rebuilds preserve it while the target
 * cluster exists.
 */
export async function moveClaimToCluster(claimId, targetClusterId, actor = "Manager") {
  const claim = await claimDao.byIdOrRef(claimId);
  if (!claim) throw notFound("Claim not found");

  let cluster = null;
  if (targetClusterId) {
    cluster = await clusterDao.byId(targetClusterId);
    if (!cluster) throw notFound("Cluster not found");
    if (cluster.event_id !== claim.event_id) {
      throw badRequest("The target cluster belongs to a different CAT event");
    }
    await clusterDao.detachClaim(claim.id);
    await clusterDao.attachClaim(cluster.id, claim.id);
    await claimDao.update(claim.id, { cluster_id: cluster.id, cluster_manual: true });
    await claimDao.addTimeline(claim.id, `Moved to cluster "${cluster.name}"`, actor);
    await activityDao.log({
      claimId: claim.id,
      action: "Cluster",
      label: `Claim ${claim.ref} moved to cluster "${cluster.name}"`,
      statusLabel: "Moved",
      source: actor,
    });
  } else {
    await clusterDao.detachClaim(claim.id);
    await claimDao.update(claim.id, { cluster_id: null, cluster_manual: true });
    await claimDao.addTimeline(claim.id, "Removed from its cluster", actor);
    await activityDao.log({
      claimId: claim.id,
      action: "Cluster",
      label: `Claim ${claim.ref} removed from its cluster`,
      statusLabel: "Ungrouped",
      source: actor,
    });
  }
  return claimDao.byId(claim.id);
}

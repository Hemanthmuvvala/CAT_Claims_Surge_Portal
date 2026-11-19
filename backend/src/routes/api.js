import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { eventDao, claimDao, clusterDao, resourceDao, assignmentDao, activityDao, scoreDao, userDao } from "../data-access/index.js";
import { claimService, ADJUSTER_ALLOWED_STATUSES } from "../services/claimService.js";
import { aiService } from "../services/aiService.js";
import { validate } from "../lib/validate.js";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { signJwt } from "../lib/jwt.js";
import { verifyPassword, hashPassword } from "../lib/passwords.js";
import { config } from "../lib/config.js";
import { getAdjusterStatus } from "../lib/adjusterStatus.js";
import { createEventBody, eventsQuery, claimsQuery, createClaimBody, batchImportBody, updateStatusBody, assignBody, aiRunBody, idParam, listQuery, loginBody, eventStatusBody, moveClusterBody } from "../schemas.js";

export const api = Router();

// ---------------------------------------------------------------- health
api.get("/health", async (_req, res) => {
  let dbOk = true;
  try {
    await db.raw("select 1");
  } catch {
    dbOk = false;
  }
  const aiHealth = await aiService.probeHealth();
  res.json({
    status: dbOk ? "ok" : "degraded",
    app: { version: "0.1.0", uptimeSec: Math.round(process.uptime()) },
    db: dbOk ? "reachable" : "unreachable",
    aiService: aiHealth
      ? {
          mode: "ai_service",
          status: aiHealth.status,
          llm: aiHealth.llm,
          embedder: aiHealth.embedder,
          kbDocuments: aiHealth.kbDocuments,
          kbChunks: aiHealth.kbChunks,
          note: aiHealth.note,
        }
      : { mode: "rules_fallback", status: "unavailable", note: "Python AI service unreachable — rules-based fallback scoring will be used" },
  });
});

// ---------------------------------------------------------------- auth (JWT)
api.post("/auth/login", validate({ body: loginBody }), async (req, res, next) => {
  try {
    const { email, password } = req.validatedBody;
    const user = await userDao.withResource(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw unauthorized("Invalid email or password");
    }
    const token = signJwt(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        policyId: user.policy_id ?? null,
        adjusterId: user.resource_id ?? null,
        name: user.name,
      },
      config.jwtSecret,
      config.jwtExpiresIn
    );
    res.json({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          policyId: user.policy_id ?? null,
          adjusterId: user.resource_id ?? null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- events
api.get("/events", validate({ query: eventsQuery }), async (req, res, next) => {
  try {
    const { page, pageSize, status } = req.validatedQuery;
    const [items, total] = await Promise.all([eventDao.list({ status, page, pageSize }), eventDao.count(status)]);
    const withCounts = await Promise.all(
      items.map(async (e) => ({ ...e, claimCount: await eventDao.claimCount(e.id) }))
    );
    res.json({ data: withCounts, meta: { page, pageSize, total } });
  } catch (err) {
    next(err);
  }
});

api.post("/events", validate({ body: createEventBody }), async (req, res, next) => {
  try {
    const b = req.validatedBody;
    const [event] = await eventDao.create({
      name: b.name,
      type: b.type,
      region: b.region,
      declared_at: new Date(b.declaredAt),
      status: "active",
      summary: b.summary ?? null,
    });
    await activityDao.log({
      action: "Event",
      label: `CAT event declared: ${event.name}`,
      statusLabel: "Active",
      source: req.caller.name,
    });
    res.status(201).json({ data: { ...event, claimCount: 0 } });
  } catch (err) {
    next(err);
  }
});

api.get("/events/:id/summary", validate({ params: idParam }), async (req, res, next) => {
  try {
    res.json({ data: await claimService.eventSummary(req.validatedParams.id) });
  } catch (err) {
    next(err);
  }
});

api.get("/events/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const event = await eventDao.byId(req.validatedParams.id);
    if (!event) throw notFound("Event not found");
    res.json({ data: { ...event, claimCount: await eventDao.claimCount(event.id) } });
  } catch (err) {
    next(err);
  }
});

// Event lifecycle: manager activates / monitors / closes a CAT event.
api.patch("/events/:id/status", validate({ params: idParam, body: eventStatusBody }), async (req, res, next) => {
  try {
    if (req.caller.role !== "manager") throw forbidden("Only the CAT response manager can change event status");
    const event = await eventDao.byId(req.validatedParams.id);
    if (!event) throw notFound("Event not found");
    const { status } = req.validatedBody;
    if (event.status === status) return res.json({ data: event });
    const [updated] = await eventDao.update(event.id, { status });
    await activityDao.log({
      action: "Event",
      label: `${event.name} — status set to ${status}`,
      statusLabel: status,
      source: req.caller.name,
    });
    res.json({ data: { ...updated, claimCount: await eventDao.claimCount(event.id) } });
  } catch (err) {
    next(err);
  }
});

// Rebuild automatic clusters for one event (keeps manual moves where valid).
api.post("/events/:id/clusters/rebuild", validate({ params: idParam }), async (req, res, next) => {
  try {
    if (req.caller.role !== "manager" && req.caller.role !== "adjuster") {
      throw forbidden("Requires role: manager or adjuster");
    }
    const result = await claimService.rebuildClusters(req.validatedParams.id, req.caller.name);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- claims
api.get("/claims", validate({ query: claimsQuery }), async (req, res, next) => {
  try {
    const q = req.validatedQuery;
    const filters = { eventId: q.eventId, status: q.status, severity: q.severity, assigned: q.assigned, method: q.method, clusterId: q.clusterId };
    const [items, total] = await Promise.all([
      claimDao.list({ ...filters, page: q.page, pageSize: q.pageSize }),
      claimDao.count(filters),
    ]);
    res.json({ data: items, meta: { page: q.page, pageSize: q.pageSize, total } });
  } catch (err) {
    next(err);
  }
});

api.get("/claims/mine", validate({ query: listQuery }), async (req, res, next) => {
  try {
    // Policyholder's own claims — resolved from the JWT identity (with a demo
    // header fallback so prototype scripts keep working).
    const policyId = req.caller.policyId;
    const email = req.caller.email?.toLowerCase();
    const userId = req.caller.id;
    if (!policyId && !email && !/^[0-9a-f-]{36}$/i.test(userId ?? "")) {
      throw badRequest("Missing policyholder identity — sign in to view your claims");
    }
    let q = claimDao.base().where(function () {
      if (policyId) this.orWhere("c.policy_id", policyId);
      if (email) this.orWhereRaw("lower(c.contact_email) = ?", [email]);
      if (uuidRe.test(userId)) this.orWhere("c.policyholder_user_id", userId);
    });
    const items = await q.orderBy("c.received_at", "desc");
    // Timeline accompanies each claim (the policyholder status screen renders it).
    const data = await Promise.all(
      items.map(async (c) => {
        const timeline = await claimDao.timeline(c.id);
        return sanitizeForPolicyholder({ ...c, timeline });
      })
    );
    res.json({ data, meta: { page: 1, pageSize: data.length, total: data.length } });
  } catch (err) {
    next(err);
  }
});

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

api.post("/claims", validate({ body: createClaimBody }), async (req, res, next) => {
  try {
    // Policyholder submissions are stamped with the JWT identity so the claim
    // is permanently linked to their account (not just matched by policy id).
    const claim = await claimService.create({
      ...req.validatedBody,
      policyholderUserId: req.caller.role === "policyholder" ? req.caller.id : null,
    });
    res.status(201).json({ data: claim });
  } catch (err) {
    next(err);
  }
});

api.post("/claims/batch", validate({ body: batchImportBody }), async (req, res, next) => {
  try {
    const result = await claimService.importBatch(req.validatedBody);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

api.get("/claims/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    const detail = await claimService.detail(req.validatedParams.id);
    if (req.caller.role === "adjuster" && detail.assigned_resource_id !== req.caller.adjusterId) {
      throw forbidden("Adjusters may only view claims assigned to them");
    }
    // Policyholders may only read their own claim (isolation; JWT will own this).
    if (req.caller.role === "policyholder") {
      const owns = detail.policy_id === req.caller.policyId;
      if (!owns) throw forbidden("This claim is not linked to your account");
      return res.json({ data: sanitizeForPolicyholder(detail) });
    }
    res.json({ data: detail });
  } catch (err) {
    next(err);
  }
});

api.patch("/claims/:id/status", validate({ params: idParam, body: updateStatusBody }), async (req, res, next) => {
  try {
    const { status } = req.validatedBody;
    if (req.caller.role === "adjuster" && !ADJUSTER_ALLOWED_STATUSES.includes(status)) {
      throw forbidden(`Adjusters may only set: ${ADJUSTER_ALLOWED_STATUSES.join(", ")}`);
    }
    const claim = await claimService.updateStatus(req.validatedParams.id, status, req.caller.name);
    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

api.post("/claims/:id/assign", validate({ params: idParam, body: assignBody.pick({ adjusterId: true }) }), async (req, res, next) => {
  try {
    if (req.caller.role !== "manager") throw forbidden("Only the CAT response manager can assign claims");
    const claim = await claimService.assign(req.validatedParams.id, req.validatedBody.adjusterId, req.caller.name);
    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

api.post("/claims/:id/unassign", validate({ params: idParam }), async (req, res, next) => {
  try {
    if (req.caller.role !== "manager") throw forbidden("Only the CAT response manager can unassign claims");
    const claim = await claimService.unassign(req.validatedParams.id, req.caller.name);
    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

api.post("/claims/:id/flag-review", validate({ params: idParam }), async (req, res, next) => {
  try {
    const claim = await claimService.flagForReview(req.validatedParams.id, req.caller.name);
    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

// Manual cluster move (manager). clusterId = null ungroups the claim.
api.post("/claims/:id/move-cluster", validate({ params: idParam, body: moveClusterBody }), async (req, res, next) => {
  try {
    if (req.caller.role !== "manager" && req.caller.role !== "adjuster") {
      throw forbidden("Requires role: manager or adjuster");
    }
    const claim = await claimService.moveClaimToCluster(
      req.validatedParams.id,
      req.validatedBody.clusterId,
      req.caller.name
    );
    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- clusters
api.get("/clusters", validate({ query: listQuery.extend({ eventId: z.string().min(6).optional() }) }), async (req, res, next) => {
  try {
    if (!["manager", "adjuster"].includes(req.caller.role)) {
      throw forbidden("Cluster context requires a manager or adjuster account");
    }
    const { eventId, page, pageSize } = req.validatedQuery;
    if (!eventId) throw badRequest("eventId query parameter is required");
    let clusters = await clusterDao.list(eventId);
    const total = clusters.length;
    clusters = clusters.slice((page - 1) * pageSize, page * pageSize);
    const members = await clusterDao.memberClaimsForClusters(clusters.map((cl) => cl.id));
    const membersByCluster = new Map(clusters.map((cl) => [cl.id, []]));
    for (const member of members) {
      const clusterMembers = membersByCluster.get(member.cluster_id);
      if (clusterMembers) clusterMembers.push(member);
    }
    const data = clusters.map((cl) => {
      const allMembers = membersByCluster.get(cl.id) ?? [];
      const clusterMembers = req.caller.role === "adjuster"
        ? allMembers.map(sanitizeClusterMemberForAdjuster)
        : allMembers;
      const scores = clusterMembers.map((member) => member.score).filter(Boolean);
      return {
        ...cl,
        claims: clusterMembers,
        claimCount: clusterMembers.length,
        unassignedCount: clusterMembers.filter((member) => ["triaged", "triage_pending", "submitted"].includes(member.status)).length,
        highestPriority: scores.length ? Math.max(...scores.map((score) => score.value)) : null,
      };
    });
    res.json({ data, meta: { page, pageSize, total } });
  } catch (err) {
    next(err);
  }
});

api.get("/clusters/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    if (!["manager", "adjuster"].includes(req.caller.role)) {
      throw forbidden("Cluster context requires a manager or adjuster account");
    }
    const cluster = await clusterDao.byId(req.validatedParams.id);
    if (!cluster) throw notFound("Cluster not found");
    const allMembers = await clusterDao.memberClaims(cluster.id);
    const members = req.caller.role === "adjuster"
      ? allMembers.map(sanitizeClusterMemberForAdjuster)
      : allMembers;
    res.json({ data: { ...cluster, claims: members, claimCount: members.length } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- resources / adjusters
api.get("/adjusters", async (_req, res, next) => {
  try {
    const [resources, loads] = await Promise.all([resourceDao.list(), claimDao.activeLoads()]);
    const data = resources.map((resource) => ({
      ...resource,
      load: loads.get(resource.id) ?? 0,
    }));
    for (const resource of data) {
      resource.status = getAdjusterStatus(resource.status, resource.load, resource.capacity);
    }
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- assignments
api.get("/assignments", validate({ query: listQuery.extend({ claimId: z.string().uuid().optional() }) }), async (req, res, next) => {
  try {
    const { claimId, page, pageSize } = req.validatedQuery;
    let q = db("assignments as a")
      .join("claims as c", "c.id", "a.claim_id")
      .join("resources as r", "r.id", "a.resource_id")
      .select("a.*", "c.ref as claim_ref", "c.status as claim_status", "c.severity", "c.cluster_id", "r.name as adjuster_name")
      .orderBy("a.assigned_at", "desc");
    if (claimId) q = q.where("a.claim_id", claimId);
    const rows = await q;
    res.json({ data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: rows.length } });
  } catch (err) {
    next(err);
  }
});

// Auto-distribution preview — shows how many claims land on each adjuster
// (cluster-first, capacity-first) without committing anything.
api.get("/assignments/preview", async (req, res, next) => {
  try {
    if (req.caller.role !== "manager") throw forbidden("Only the CAT response manager can preview the auto-distribution");
    const plan = await claimService.distributionPlan();
    res.json({ data: plan });
  } catch (err) {
    next(err);
  }
});

// One-click crew distribution: applies the same plan the preview showed.
api.post("/assignments/auto", async (req, res, next) => {
  try {
    if (req.caller.role !== "manager") throw forbidden("Only the CAT response manager can run the auto-distribution");
    const result = await claimService.applyDistribution(req.caller.name);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- priority scores
api.get("/priority-scores", validate({ query: listQuery.extend({ claimId: z.string().uuid() }) }), async (req, res, next) => {
  try {
    const { claimId } = req.validatedQuery;
    const rows = await scoreDao.listForClaim(claimId);
    res.json({ data: rows, meta: { page: 1, pageSize: rows.length, total: rows.length } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- AI orchestration
api.get("/ai/health", async (_req, res, next) => {
  try {
    const stats = await scoreDao.stats();
    const live = await aiService.probeHealth();
    res.json({
      data: {
        modelStatus: live?.status === "operational" ? "operational" : aiService.health() === "operational" ? "degraded" : aiService.health(),
        avgLatencyMs: stats?.avg_latency_ms ?? 0,
        fallbackRatePct: stats?.fallback_pct ?? 0,
        totalCostUsd: Math.round(Number(stats?.total_cost_usd ?? 0) * 100) / 100,
        costPerClaimUsd: stats?.scored ? Math.round((Number(stats.total_cost_usd) / stats.scored) * 100) / 100 : 0,
        scored: stats?.scored ?? 0,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

api.post("/ai/run", validate({ body: aiRunBody }), async (req, res, next) => {
  try {
    const { claimId, ref, forceMethod } = req.validatedBody;
    let claim = null;
    if (claimId) claim = await claimDao.byIdOrRef(claimId);
    else if (ref) claim = await claimDao.byRef(ref);
    if (!claim) throw notFound("Claim not found");

    const result = await claimService.runTriage(claim.id, { forceMethod: forceMethod === "rules_fallback" ? "rules_fallback" : undefined });
    res.json({
      data: {
        claimId: result.id,
        ref: result.ref,
        status: result.status,
        score: result.score
          ? {
              value: result.score.value,
              factors: result.score.factors,
              tags: result.score.tags,
              coverageEvidence: result.score.coverage_evidence,
              evidenceState: result.score.evidence_state,
              scoringMethod: result.score.scoring_method,
              needsHumanReview: result.score.needs_human_review,
              latencyMs: result.score.latency_ms,
              costUsd: result.score.cost_usd,
              processedAt: result.score.processed_at,
              warnings: result.score.warnings,
            }
          : null,
      },
      meta: {
        note:
          result.score?.scoring_method === "ai_assisted"
            ? "Scored by the local llama3.2:3b AI service; deterministic scorer produced the numeric priority."
            : "AI service unavailable — deterministic rules fallback produced this score.",
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- activity
api.get("/activity", validate({ query: listQuery }), async (req, res, next) => {
  try {
    const { page, pageSize } = req.validatedQuery;
    const rows = await activityDao.list(page * pageSize);
    res.json({ data: rows.slice((page - 1) * pageSize), meta: { page, pageSize, total: rows.length } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- users (minimal, for JWT later)
api.get("/users", async (_req, res, next) => {
  try {
    const rows = await db("users").select("id", "email", "name", "role", "policy_id");
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

api.post("/users", async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      role: z.enum(["manager", "adjuster", "policyholder"]),
      policyId: z.string().optional(),
      password: z.string().min(6).optional(),
      adjusterId: z.string().uuid().optional(),
    });
    const b = schema.parse(req.body ?? {});
    const user = await userDao.create({
      email: b.email.toLowerCase(),
      name: b.name,
      role: b.role,
      policy_id: b.policyId ?? null,
      resource_id: b.adjusterId ?? null,
      password_hash: b.password ? hashPassword(b.password) : null,
    });
    res.status(201).json({ data: { id: user[0].id, email: user[0].email, name: user[0].name, role: user[0].role } });
  } catch (err) {
    next(err);
  }
});

// Policyholder-safe view: strips internal-only fields (scores, factors, notes).
function sanitizeForPolicyholder(claim) {
  const { score, assignments, contact_email, contact_name, policyholder_user_id, ...safe } = claim;
  void score; void assignments; void contact_email; void contact_name; void policyholder_user_id;
  return {
    ...safe,
    adjusterName: claim.adjuster_name ? "A dedicated claims specialist" : null,
    timeline: claim.timeline,
  };
}

function sanitizeClusterMemberForAdjuster(claim) {
  return {
    id: claim.id,
    ref: claim.ref,
    status: claim.status,
    assigned_resource_id: claim.assigned_resource_id,
    score: claim.score,
  };
}

import { db } from "../lib/db.js";

// Guard against slug-shaped ids ("evt-varuna", "CLM-…") reaching uuid casts,
// which Postgres rejects with a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

export const eventDao = {
  list({ status, page = 1, pageSize = 20 }) {
    const q = db("events").orderBy("declared_at", "desc");
    if (status) q.where("status", status);
    return q.limit(pageSize).offset((page - 1) * pageSize);
  },
  count(status) {
    const q = db("events").count("id as n");
    if (status) q.where("status", status);
    return q.first().then((r) => Number(r.n));
  },
  byId(id) {
    if (!isUuid(id)) return Promise.resolve(undefined);
    return db("events").where("id", id).first();
  },
  update(id, patch) {
    if (!isUuid(id)) return Promise.resolve([]);
    return db("events").where("id", id).update(patch).returning("*");
  },
  create(data) {
    return db("events").insert(data).returning("*");
  },
  claimCount(eventId) {
    if (!isUuid(eventId)) return Promise.resolve(0);
    return db("claims").where("event_id", eventId).count("id as n").first().then((r) => Number(r.n));
  },
};

export const claimDao = {
  base() {
    return db("claims as c")
      .leftJoin("resources as r", "r.id", "c.assigned_resource_id")
      .leftJoin("events as e", "e.id", "c.event_id")
      .leftJoin("clusters as cl", "cl.id", "c.cluster_id")
      .select(
        "c.*",
        "r.name as adjuster_name",
        "e.name as event_name",
        "e.region as event_region",
        "cl.name as cluster_name",
        "cl.key as cluster_key"
      );
  },

  list({ eventId, status, severity, assigned, method, clusterId, page = 1, pageSize = 20 }) {
    const q = claimDao.base();
    q.select(
      db.raw(
        "(select to_jsonb(ps) from priority_scores ps where ps.claim_id = c.id order by ps.processed_at desc limit 1) as score"
      )
    );
    if (eventId) {
      if (!isUuid(eventId)) return Promise.resolve([]);
      q.where("c.event_id", eventId);
    }
    if (status) q.where("c.status", status);
    if (severity) q.where("c.severity", severity);
    if (clusterId) q.where("c.cluster_id", clusterId);
    if (assigned === "unassigned") q.whereNull("c.assigned_resource_id");
    if (assigned === "assigned") q.whereNotNull("c.assigned_resource_id");
    if (method === "unscored") {
      q.whereNotExists(function () {
        this.select(1).from("priority_scores as ps").whereRaw("ps.claim_id = c.id");
      });
    } else if (method === "ai" || method === "fallback") {
      q.whereExists(function () {
        this.select(1)
          .from("priority_scores as ps")
          .whereRaw("ps.claim_id = c.id")
          .where("ps.scoring_method", method === "ai" ? "ai_assisted" : "rules_fallback");
      });
    }
    return q.orderBy("c.received_at", "desc").limit(pageSize).offset((page - 1) * pageSize);
  },

  count(filters) {
    const q = db("claims as c").count("c.id as n");
    if (filters.eventId) {
      if (!isUuid(filters.eventId)) return Promise.resolve(0);
      q.where("c.event_id", filters.eventId);
    }
    if (filters.status) q.where("c.status", filters.status);
    if (filters.severity) q.where("c.severity", filters.severity);
    if (filters.clusterId) q.where("c.cluster_id", filters.clusterId);
    if (filters.assigned === "unassigned") q.whereNull("c.assigned_resource_id");
    if (filters.assigned === "assigned") q.whereNotNull("c.assigned_resource_id");
    return q.first().then((r) => Number(r.n));
  },

  byId(id) {
    return claimDao.base().where("c.id", id).first();
  },

  byRef(ref) {
    return claimDao.base().where("c.ref", ref).first();
  },

  // Accepts either a UUID (internal id) or a human reference (CLM-2026-0142).
  byIdOrRef(idOrRef) {
    if (!idOrRef) return Promise.resolve(undefined);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef)
      ? claimDao.byId(idOrRef)
      : claimDao.byRef(idOrRef);
  },

  byIdForPolicyholder(id, policyId) {
    return claimDao.base().where("c.id", id).andWhere("c.policy_id", policyId).first();
  },

  listForPolicyholder(policyId) {
    return claimDao.base().where("c.policy_id", policyId).orderBy("c.received_at", "desc");
  },

  async create(data) {
    const [row] = await db("claims").insert(data).returning("*");
    return row;
  },

  update(id, patch) {
    return db("claims").where("id", id).update(patch).returning("*");
  },

  latestScore(claimId) {
    return db("priority_scores").where("claim_id", claimId).orderBy("processed_at", "desc").first();
  },

  timeline(claimId) {
    return db("claim_events").where("claim_id", claimId).orderBy("occurred_at", "asc");
  },

  addTimeline(claimId, label, actor) {
    return db("claim_events").insert({ claim_id: claimId, label, actor });
  },

  activeLoad(resourceId) {
    return db("claims as c")
      .where("c.assigned_resource_id", resourceId)
      .whereNotIn("c.status", ["closed"])
      .count("c.id as n")
      .first()
      .then((r) => Number(r.n));
  },
  activeLoads() {
    return db("claims")
      .select("assigned_resource_id")
      .count("id as load")
      .whereNotNull("assigned_resource_id")
      .whereNot("status", "closed")
      .groupBy("assigned_resource_id")
      .then((rows) => new Map(rows.map((row) => [row.assigned_resource_id, Number(row.load)])));
  },
};

export const clusterDao = {
  list(eventId) {
    if (!isUuid(eventId)) return Promise.resolve([]);
    return db("clusters as cl")
      .where("cl.event_id", eventId)
      .select("cl.*")
      .select(
        db.raw(
          `(select count(*) from cluster_claims cc join claims c on c.id = cc.claim_id where cc.cluster_id = cl.id) as claim_count`
        )
      )
      .orderBy("cl.name");
  },
  byId(id) {
    return db("clusters").where("id", id).first();
  },
  memberClaims(clusterId) {
    return claimDao
      .base()
      .join("cluster_claims as cc", "cc.claim_id", "c.id")
      .where("cc.cluster_id", clusterId)
      .select("c.*", "r.name as adjuster_name", "e.name as event_name", "e.region as event_region", "cl.name as cluster_name", "cl.key as cluster_key")
      .select(latestScoreJson())
      .orderBy("c.received_at", "desc");
  },
  memberClaimsForClusters(clusterIds) {
    if (!clusterIds.length) return Promise.resolve([]);
    return claimDao
      .base()
      .join("cluster_claims as cc", "cc.claim_id", "c.id")
      .whereRaw("cc.cluster_id = c.cluster_id")
      .whereIn("cc.cluster_id", clusterIds)
      .select("cc.cluster_id", "c.*", "r.name as adjuster_name", "e.name as event_name", "e.region as event_region", "cl.name as cluster_name", "cl.key as cluster_key")
      .select(latestScoreJson())
      .orderBy("c.received_at", "desc");
  },
  findOrCreate(eventId, key, defaults) {
    return db("clusters").where({ event_id: eventId, key }).first().then((row) => {
      if (row) return row;
      return db("clusters").insert({ event_id: eventId, key, ...defaults }).returning("*").then(([r]) => r);
    });
  },
  attachClaim(clusterId, claimId) {
    return db("cluster_claims").insert({ cluster_id: clusterId, claim_id: claimId }).onConflict().ignore();
  },
  detachClaim(claimId) {
    return db("cluster_claims").where("claim_id", claimId).del();
  },
  deleteById(clusterId) {
    return db("clusters").where("id", clusterId).del();
  },
  /** Rows currently attached to each cluster of the event: claim_id -> cluster_id */
  membershipByEvent(eventId) {
    return db("cluster_claims as cc")
      .join("clusters as cl", "cl.id", "cc.cluster_id")
      .where("cl.event_id", eventId)
      .select("cc.claim_id", "cc.cluster_id");
  },
  clearForEvent(eventId) {
    return db("clusters").where("event_id", eventId).del();
  },
  create(data) {
    return db("clusters").insert(data).returning("*");
  },
};

export const resourceDao = {
  list() {
    return db("resources").orderBy("name");
  },
  byId(id) {
    return db("resources").where("id", id).first();
  },
};

export const assignmentDao = {
  forClaim(claimId) {
    return db("assignments as a")
      .join("resources as r", "r.id", "a.resource_id")
      .where("a.claim_id", claimId)
      .orderBy("a.assigned_at", "desc")
      .select("a.*", "r.name as adjuster_name");
  },
  latestForClaim(claimId) {
    return assignmentDao.forClaim(claimId).then((rows) => rows[0] || null);
  },
  create(data) {
    return db("assignments").insert(data).returning("*");
  },
};

export const scoreDao = {
  async create(data) {
    const [row] = await db("priority_scores").insert(data).returning("*");
    return row;
  },
  listForClaim(claimId) {
    return db("priority_scores").where("claim_id", claimId).orderBy("processed_at", "desc");
  },
  stats() {
    return db("priority_scores")
      .select(
        db.raw("count(*)::int as scored"),
        db.raw("coalesce(round(avg(latency_ms)), 0)::int as avg_latency_ms"),
        db.raw(`coalesce(round(100.0 * sum(case when scoring_method = 'rules_fallback' then 1 else 0 end) / count(*)), 0)::int as fallback_pct`),
        db.raw("coalesce(sum(cost_usd), 0)::float as total_cost_usd")
      )
      .first();
  },
};

export const activityDao = {
  log({ claimId = null, action, label, statusLabel = null, source = "System" }) {
    return db("activity_log").insert({ claim_id: claimId, action, label, status_label: statusLabel, source });
  },
  list(limit = 12) {
    return db("activity_log as al")
      .leftJoin("claims as c", "c.id", "al.claim_id")
      .select("al.*", "c.ref as claim_ref")
      .orderBy("al.created_at", "desc")
      .limit(limit);
  },
};

export const userDao = {
  byEmail(email) {
    return db("users").where("email", String(email || "").toLowerCase()).first();
  },
  byId(id) {
    return db("users").where("id", id).first();
  },
  create(data) {
    return db("users").insert(data).returning("*");
  },
  update(id, patch) {
    return db("users").where("id", id).update(patch).returning("*");
  },
  withResource(email) {
    // Explicit column selection: both tables have an `id`, and a naive select *
    // join lets the resource id shadow the user id.
    return db("users as u")
      .leftJoin("resources as r", "r.id", "u.resource_id")
      .where("u.email", String(email || "").toLowerCase())
      .select("u.*", "r.name as adjuster_name")
      .first();
  },
};

function latestScoreJson() {
  return db.raw(
    "(select to_jsonb(ps) from priority_scores ps where ps.claim_id = c.id order by ps.processed_at desc limit 1) as score"
  );
}

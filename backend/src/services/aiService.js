// Thin HTTP client for the Python FastAPI AI service.
//
// The Node app owns orchestration: it calls the AI service with a timeout and
// falls back to the rules engine when the service is down, rate-limited or
// returns an invalid payload. The browser never talks to the AI service.

import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

let cachedStatus = { status: "unknown", checkedAt: 0 };
let cachedHealth = null; // { payload, checkedAt }

export const aiService = {
  /**
   * Ask the Python AI service to score a claim.
   * Returns { result, method, providerStatus } on success, or null when the
   * service is unavailable/invalid (caller falls back to rules scoring).
   */
  async requestScore(claim) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    try {
      const res = await fetch(`${config.aiServiceUrl}/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimId: claim.ref,
          severity: claim.severity,
          peril: claim.peril,
          hardshipFlags: claim.hardship_flags ?? [],
          description: claim.description,
          policyId: claim.policy_id,
          documents: claim.documents ?? [],
          location: claim.location,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        cachedStatus = { status: res.status === 429 ? "degraded" : "unavailable", checkedAt: Date.now() };
        return null;
      }
      const json = await res.json();
      const result = validateAiResult(json);
      if (!result) {
        cachedStatus = { status: "degraded", checkedAt: Date.now() };
        return null;
      }
      cachedStatus = { status: "operational", checkedAt: Date.now() };
      return { result, method: "ai_assisted", providerStatus: "operational" };
    } catch (err) {
      cachedStatus = { status: "unavailable", checkedAt: Date.now() };
      logger.debug({ err: err.message }, "AI service unreachable — will use rules fallback");
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Push the event's known clusters into the AI embedding registry so
   * /score can return a meaningful clusterSuggestion. Best effort.
   */
  async syncClusters(clusters) {
    if (!Array.isArray(clusters) || clusters.length === 0) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${config.aiServiceUrl}/clusters/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clusters: clusters.map((c) => ({
            clusterId: String(c.id),
            label: c.name,
            sampleText: `${c.name} ${c.key ?? ""}`.slice(0, 2000),
          })),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) logger.debug({ status: res.status }, "cluster sync non-ok");
    } catch (err) {
      logger.debug({ err: err.message }, "cluster sync skipped");
    }
  },

  /**
   * Live probe of the AI service /health. Cached for 10s so the dashboard can
   * poll without hammering the local model server.
   */
  async probeHealth() {
    const fresh = cachedHealth && Date.now() - cachedHealth.checkedAt < 10000;
    if (fresh) return cachedHealth.payload;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${config.aiServiceUrl}/health`, { signal: controller.signal });
      if (!res.ok) {
        cachedHealth = { payload: null, checkedAt: Date.now() };
        return null;
      }
      const payload = await res.json();
      cachedHealth = { payload, checkedAt: Date.now() };
      cachedStatus = { status: payload.status === "operational" ? "operational" : "degraded", checkedAt: Date.now() };
      return payload;
    } catch {
      cachedHealth = { payload: null, checkedAt: Date.now() };
      cachedStatus = { status: "unavailable", checkedAt: Date.now() };
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  health() {
    return cachedStatus.status;
  },
};

// Guardrail: reject malformed AI payloads instead of trusting them blindly.
function validateAiResult(json) {
  const v = json ?? {};
  const score = Number(v.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (!Array.isArray(v.factors)) return null;
  return {
    claimId: v.claimId ?? null,
    score: Math.round(score),
    factors: v.factors,
    tags: sanitizeTags(v.tags),
    coverageEvidence: Array.isArray(v.coverageEvidence) ? v.coverageEvidence : [],
    evidenceState: ["available", "partial", "missing"].includes(v.evidenceState) ? v.evidenceState : "partial",
    scoringMethod: "ai_assisted",
    needsHumanReview: v.needsHumanReview !== false, // AI can never waive human review
    clusterSuggestion: sanitizeClusterSuggestion(v.clusterSuggestion),
    latencyMs: Number.isFinite(Number(v.latencyMs)) ? Math.round(Number(v.latencyMs)) : null,
    tokensPrompt: Number.isFinite(Number(v.tokensPrompt)) ? Number(v.tokensPrompt) : 0,
    tokensCompletion: Number.isFinite(Number(v.tokensCompletion)) ? Number(v.tokensCompletion) : 0,
    processedAt: v.processedAt ?? new Date().toISOString(),
    warnings: Array.isArray(v.warnings) ? v.warnings : ["Result validated by deterministic guardrails."],
  };
}

function sanitizeTags(tags) {
  const t = tags ?? null;
  if (!t || typeof t !== "object" || Array.isArray(t)) return null;
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === "string").slice(0, 10) : []);
  return {
    perilType: ["wind", "water", "fire", "impact", "other"].includes(t.peril_type) ? t.peril_type : t.perilType ?? "other",
    damageType: ["structural", "content", "landscape", "vehicle", "unclear"].includes(t.damage_type) ? t.damage_type : t.damageType ?? "unclear",
    severitySignals: arr(t.severity_signals ?? t.severitySignals),
    hardshipSignals: arr(t.hardship_signals ?? t.hardshipSignals),
    urgencyIndicators: arr(t.urgency_indicators ?? t.urgencyIndicators),
    documentsReferenced: arr(t.documents_referenced ?? t.documentsReferenced),
    summary: typeof t.summary === "string" ? t.summary.slice(0, 400) : "",
  };
}

function sanitizeClusterSuggestion(s) {
  if (!s || typeof s !== "object") return null;
  const similarity = Number(s.similarity);
  return {
    clusterId: typeof s.clusterId === "string" && s.clusterId ? s.clusterId : null,
    similarity: Number.isFinite(similarity) && similarity >= 0 && similarity <= 1 ? similarity : 0,
    basis: typeof s.basis === "string" ? s.basis.slice(0, 200) : "",
  };
}

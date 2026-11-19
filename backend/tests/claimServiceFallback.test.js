import test from "node:test";
import assert from "node:assert/strict";
import { activityDao, claimDao, clusterDao, scoreDao } from "../src/data-access/index.js";
import { aiService } from "../src/services/aiService.js";
import { claimService } from "../src/services/claimService.js";

test("AI request failure scores and persists the claim with rules fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originals = {
    listClusters: clusterDao.list,
    syncClusters: aiService.syncClusters,
    createScore: scoreDao.create,
    updateClaim: claimDao.update,
    addTimeline: claimDao.addTimeline,
    logActivity: activityDao.log,
  };
  let persistedScore;

  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  clusterDao.list = async () => [];
  aiService.syncClusters = async () => {};
  scoreDao.create = async (score) => {
    persistedScore = score;
    return score;
  };
  claimDao.update = async () => [];
  claimDao.addTimeline = async () => [];
  activityDao.log = async () => [];

  try {
    const result = await claimService._doTriage({
      id: "00000000-0000-4000-8000-000000000001",
      ref: "CLM-TEST-FALLBACK",
      event_id: "00000000-0000-4000-8000-000000000002",
      severity: "critical",
      peril: "Storm surge / flooding",
      hardship_flags: ["Displaced from home"],
      description: "Rising water is entering the home.",
      policy_id: "POL-12345",
      documents: [],
    });

    assert.equal(aiService.health(), "unavailable");
    assert.equal(persistedScore.scoring_method, "rules_fallback");
    assert.equal(result.score.scoring_method, "rules_fallback");
    assert.equal(persistedScore.value, 95);
    assert.match(persistedScore.warnings, /AI provider unavailable/);
    assert.equal(result.status, "triaged");
  } finally {
    globalThis.fetch = originalFetch;
    clusterDao.list = originals.listClusters;
    aiService.syncClusters = originals.syncClusters;
    scoreDao.create = originals.createScore;
    claimDao.update = originals.updateClaim;
    claimDao.addTimeline = originals.addTimeline;
    activityDao.log = originals.logActivity;
  }
});

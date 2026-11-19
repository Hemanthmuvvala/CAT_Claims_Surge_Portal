import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db.js";
import { activityDao, claimDao, clusterDao } from "../src/data-access/index.js";
import { claimService } from "../src/services/claimService.js";

test("moving a claim replaces its old cluster membership", async () => {
  const originals = {
    findClaim: claimDao.byIdOrRef,
    findCluster: clusterDao.byId,
    detachClaim: clusterDao.detachClaim,
    attachClaim: clusterDao.attachClaim,
    updateClaim: claimDao.update,
    addTimeline: claimDao.addTimeline,
    logActivity: activityDao.log,
  };
  const calls = [];

  claimDao.byIdOrRef = async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    ref: "CLM-TEST-MOVE",
    event_id: "00000000-0000-4000-8000-000000000002",
  });
  clusterDao.byId = async () => ({
    id: "00000000-0000-4000-8000-000000000003",
    event_id: "00000000-0000-4000-8000-000000000002",
    name: "Target cluster",
  });
  clusterDao.detachClaim = async (claimId) => calls.push(["detach", claimId]);
  clusterDao.attachClaim = async (clusterId, claimId) => calls.push(["attach", clusterId, claimId]);
  claimDao.update = async (claimId, patch) => calls.push(["update", claimId, patch]);
  claimDao.addTimeline = async () => {};
  activityDao.log = async () => {};

  try {
    await claimService.moveClaimToCluster(
      "CLM-TEST-MOVE",
      "00000000-0000-4000-8000-000000000003"
    );

    assert.deepEqual(calls.map(([action]) => action), ["detach", "attach", "update"]);
  } finally {
    claimDao.byIdOrRef = originals.findClaim;
    clusterDao.byId = originals.findCluster;
    clusterDao.detachClaim = originals.detachClaim;
    clusterDao.attachClaim = originals.attachClaim;
    claimDao.update = originals.updateClaim;
    claimDao.addTimeline = originals.addTimeline;
    activityDao.log = originals.logActivity;
    await db.destroy();
  }
});

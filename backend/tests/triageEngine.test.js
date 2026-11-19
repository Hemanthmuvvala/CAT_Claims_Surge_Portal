import test from "node:test";
import assert from "node:assert/strict";
import { scoreClaim } from "../src/services/triageEngine.js";

const claim = (overrides = {}) => ({
  id: "claim-test",
  severity: "critical",
  peril: "Storm surge / flooding",
  hardship_flags: ["Displaced from home"],
  policy_id: "POL-12345",
  documents: [],
  ...overrides,
});

test("fallback applies the primary scorer's shared severity, hardship and water weights", () => {
  const result = scoreClaim(claim(), { providerStatus: "degraded" });
  assert.equal(result.score, 85);
  assert.deepEqual(result.factors.map(({ weight }) => weight), [43, 22, 20]);
  assert.equal(result.factors.reduce((sum, factor) => sum + factor.weight, 0), result.score);
});

test("explicit time pressure adds the same 10-point urgency factor", () => {
  const result = scoreClaim(claim({ description: "Rising water is entering the home." }));
  assert.equal(result.score, 95);
  assert.deepEqual(result.factors.map(({ weight }) => weight), [43, 22, 20, 10]);
});

test("AI outage does not itself increase claim priority", () => {
  const degraded = scoreClaim(claim({ description: "Roof damage reported." }), {
    providerStatus: "degraded",
  });
  const operational = scoreClaim(claim({ description: "Roof damage reported." }), {
    providerStatus: "operational",
  });
  assert.equal(degraded.score, operational.score);
});

test("medical hardship and fire use the primary scorer's weights", () => {
  const result = scoreClaim(
    claim({ severity: "high", peril: "Wildfire", hardship_flags: ["Medical needs"] }),
    { providerStatus: "operational" }
  );
  assert.deepEqual(result.factors.map(({ weight }) => weight), [30, 22, 13, 22]);
  assert.equal(result.score, 87);
});

test("capped factor weights still sum to the capped score", () => {
  const result = scoreClaim(
    claim({
      peril: "fire and flood",
      hardship_flags: ["Medical needs"],
      description: "Rising water is entering the home; evacuating now.",
    }),
    { providerStatus: "degraded" }
  );
  assert.equal(result.score, 97);
  assert.equal(result.factors.reduce((sum, factor) => sum + factor.weight, 0), 97);
  assert.ok(result.factors.some(({ detail }) => detail.includes("Score cap applied")));
});

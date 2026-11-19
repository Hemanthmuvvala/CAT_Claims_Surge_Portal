// Deterministic rules-based triage engine.
//
// This is the fallback (and current dummy) scorer used whenever the Python AI
// service is unreachable or rate-limited. It produces exactly the mock AI
// contract the frontend expects:
//   { claimId, score, factors, coverageEvidence, evidenceState,
//     scoringMethod, needsHumanReview, processedAt, warnings }
//
// When the AI service is integrated, aiService.requestScore() will be the
// primary path and this engine remains the graceful fallback.

const SEVERITY_WEIGHT = { critical: 43, high: 30, medium: 17, low: 6 };
const WATER_PERIL = /flood|surge|water|rain|ingress|leak/i;
const FIRE_PERIL = /fire|flame|smoke|burn|combustion|ash/i;
const MEDICAL_SIGNAL = /medical|device|elderly|children|child|baby|infant|oxygen|disabled|hospital/i;
const URGENCY_SIGNAL = /rising water|open[- ]to[- ]weather|exposed to weather|evacuat|trapped|unsafe|collapse|safety hazard|no power|without (?:power|electricity|water)/i;
const CAP = 97;

export function scoreClaim(claim, { method = "rules_fallback", providerStatus = "degraded" } = {}) {
  const factors = [];
  const sev = (claim.severity || "medium").toLowerCase();
  addCappedFactor(factors, {
    label: `${sev.charAt(0).toUpperCase()}${sev.slice(1)} severity reported`,
    weight: SEVERITY_WEIGHT[sev] ?? 17,
    detail: severityDetail(sev),
  });

  const hardship = claim.hardship_flags || [];
  if (hardship.length > 0) {
    addCappedFactor(factors, {
      label: "Vulnerability / hardship signals",
      weight: 22,
      detail: `${hardship.join(", ")}.`,
    });
  }

  if (hardship.length > 0 && MEDICAL_SIGNAL.test(hardship.join(" "))) {
    addCappedFactor(factors, {
      label: "Vulnerable household — expedite",
      weight: 13,
      detail: "Medical dependency or vulnerable person flagged — welfare risk grows with delay.",
    });
  }
  if (WATER_PERIL.test(claim.peril || "")) {
    addCappedFactor(factors, {
      label: "Active water ingress",
      weight: 20,
      detail: "Water-related peril reported — deterioration risk.",
    });
  }
  if (FIRE_PERIL.test(claim.peril || "")) {
    addCappedFactor(factors, {
      label: "Active fire / combustion damage",
      weight: 22,
      detail: "Fire-related peril reported — progressive deterioration and safety risk.",
    });
  }
  const urgency = URGENCY_SIGNAL.exec(claim.description || "");
  if (urgency) {
    addCappedFactor(factors, {
      label: "Urgency / time pressure",
      weight: 10,
      detail: `Time pressure described in the claim: ${urgency[0]}.`,
    });
  }

  const value = factors.reduce((sum, factor) => sum + factor.weight, 0);

  const warnings = [];
  if (method === "rules_fallback") {
    warnings.push(
      providerStatus === "unavailable"
        ? "AI provider unavailable — scored by deterministic rules-based fallback."
        : "AI provider degraded — scored by deterministic rules-based fallback."
    );
  }
  if (!(claim.documents || []).length) {
    warnings.push("No supporting documents attached; evidence not yet verified.");
  }

  const evidenceState = (claim.documents || []).length
    ? "available"
    : claim.policy_id
      ? "partial"
      : "missing";

  const coverageEvidence = claim.policy_id
    ? [{ source: "Policy administration system", ref: `Policy ${claim.policy_id} — schedule & perils section` }]
    : [];

  return {
    claimId: claim.id,
    score: value,
    factors,
    coverageEvidence,
    evidenceState,
    scoringMethod: method,
    needsHumanReview: true,
    processedAt: new Date().toISOString(),
    warnings,
  };
}

function addCappedFactor(factors, factor) {
  const used = factors.reduce((sum, existing) => sum + existing.weight, 0);
  const weight = Math.min(factor.weight, Math.max(0, CAP - used));
  factors.push({
    ...factor,
    weight,
    detail:
      weight < factor.weight
        ? `${factor.detail} Score cap applied; ${weight} of ${factor.weight} points counted.`
        : factor.detail,
  });
}

function severityDetail(sev) {
  return {
    critical: "Reported structural damage and safety risk at the property.",
    high: "Significant damage reported; habitability may be affected.",
    medium: "Moderate damage; property is still habitable.",
    low: "Minor damage reported.",
  }[sev] ?? "Moderate damage; property is still habitable.";
}

// Central domain constants — single source of truth for statuses, roles and labels.

export const ROLES = {
  POLICYHOLDER: "policyholder",
  MANAGER: "manager",
  ADJUSTER: "adjuster",
};

export const ROLE_LABELS = {
  [ROLES.POLICYHOLDER]: "Policyholder / Claimant",
  [ROLES.MANAGER]: "CAT Response Manager",
  [ROLES.ADJUSTER]: "Adjuster / Surge Team",
};

// Internal operational claim statuses.
export const CLAIM_STATUS = {
  SUBMITTED: "submitted",
  TRIAGE_PENDING: "triage_pending",
  TRIAGED: "triaged",
  ASSIGNED: "assigned",
  IN_REVIEW: "in_review",
  INFO_REQUIRED: "info_required",
  ASSESSMENT_COMPLETE: "assessment_complete",
  CLOSED: "closed",
};

export const CLAIM_STATUS_LABELS = {
  [CLAIM_STATUS.SUBMITTED]: "Submitted",
  [CLAIM_STATUS.TRIAGE_PENDING]: "Triage pending",
  [CLAIM_STATUS.TRIAGED]: "Triaged",
  [CLAIM_STATUS.ASSIGNED]: "Assigned",
  [CLAIM_STATUS.IN_REVIEW]: "Review in progress",
  [CLAIM_STATUS.INFO_REQUIRED]: "Info required",
  [CLAIM_STATUS.ASSIGNMENT_COMPLETE]: "Assessment complete",
  [CLAIM_STATUS.ASSESSMENT_COMPLETE]: "Assessment complete",
  [CLAIM_STATUS.CLOSED]: "Closed",
};

// Badge tone per internal status (never colour-only — labels always accompany).
export const CLAIM_STATUS_TONES = {
  [CLAIM_STATUS.SUBMITTED]: "blue",
  [CLAIM_STATUS.TRIAGE_PENDING]: "amber",
  [CLAIM_STATUS.TRIAGED]: "blue",
  [CLAIM_STATUS.ASSIGNED]: "teal",
  [CLAIM_STATUS.IN_REVIEW]: "teal",
  [CLAIM_STATUS.INFO_REQUIRED]: "amber",
  [CLAIM_STATUS.ASSESSMENT_COMPLETE]: "green",
  [CLAIM_STATUS.CLOSED]: "neutral",
};

// Adjuster statuses an adjuster is permitted to set (operational only — no coverage decisions).
export const ADJUSTER_ALLOWED_STATUSES = [
  CLAIM_STATUS.ASSIGNED,
  CLAIM_STATUS.IN_REVIEW,
  CLAIM_STATUS.INFO_REQUIRED,
  CLAIM_STATUS.ASSESSMENT_COMPLETE,
];

// Claimant-safe view of each internal status: plain language, no internal detail.
export const CLAIMANT_STATUS = {
  [CLAIM_STATUS.SUBMITTED]: {
    label: "Claim received",
    description: "We have received your claim and it is in our queue for initial review.",
  },
  [CLAIM_STATUS.TRIAGE_PENDING]: {
    label: "Initial review",
    description: "Our response team is reviewing your claim to understand what happened and how urgently you need help.",
  },
  [CLAIM_STATUS.TRIAGED]: {
    label: "Initial review",
    description: "Your claim has been reviewed and prioritised. It will be assigned to a specialist shortly.",
  },
  [CLAIM_STATUS.ASSIGNED]: {
    label: "Assigned for assessment",
    description: "A claims specialist has been assigned to assess your claim.",
  },
  [CLAIM_STATUS.IN_REVIEW]: {
    label: "Review in progress",
    description: "Your claims specialist is actively reviewing the details of your claim.",
  },
  [CLAIM_STATUS.INFO_REQUIRED]: {
    label: "Further information required",
    description: "We need a little more information from you before we can continue. Please check your messages.",
  },
  [CLAIM_STATUS.ASSESSMENT_COMPLETE]: {
    label: "Assessment complete",
    description: "The assessment of your claim is complete. Our team will contact you about the next steps.",
  },
  [CLAIM_STATUS.CLOSED]: {
    label: "Closed",
    description: "This claim has been completed. Contact us if you need anything further.",
  },
};

// Policyholder timeline stages (fixed stage list; a claim's actual status decides which are done).
export const TIMELINE_STAGES = [
  { key: "received", title: "Claim received", statusKeys: [CLAIM_STATUS.SUBMITTED] },
  { key: "initial_review", title: "Initial review", statusKeys: [CLAIM_STATUS.TRIAGE_PENDING, CLAIM_STATUS.TRIAGED] },
  { key: "assigned", title: "Assigned for assessment", statusKeys: [CLAIM_STATUS.ASSIGNED] },
  { key: "in_progress", title: "Review in progress", statusKeys: [CLAIM_STATUS.IN_REVIEW, CLAIM_STATUS.INFO_REQUIRED] },
  { key: "next_steps", title: "Next steps", statusKeys: [CLAIM_STATUS.ASSESSMENT_COMPLETE, CLAIM_STATUS.CLOSED] },
];

export const SEVERITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export const SEVERITY_LABELS = {
  [SEVERITY.CRITICAL]: "Critical",
  [SEVERITY.HIGH]: "High",
  [SEVERITY.MEDIUM]: "Medium",
  [SEVERITY.LOW]: "Low",
};

export const SEVERITY_TONES = {
  [SEVERITY.CRITICAL]: "red",
  [SEVERITY.HIGH]: "amber",
  [SEVERITY.MEDIUM]: "blue",
  [SEVERITY.LOW]: "neutral",
};

// Triage urgency bands derived from the priority score (0–100).
export const URGENCY_BANDS = [
  { min: 85, label: "Critical", tone: "red" },
  { min: 65, label: "High", tone: "amber" },
  { min: 40, label: "Medium", tone: "blue" },
  { min: 0, label: "Low", tone: "neutral" },
];

export const SCORING_METHOD = {
  AI_ASSISTED: "ai_assisted",
  RULES_FALLBACK: "rules_fallback",
};

export const SCORING_METHOD_LABELS = {
  [SCORING_METHOD.AI_ASSISTED]: "AI-assisted",
  [SCORING_METHOD.RULES_FALLBACK]: "Rules-based fallback",
};

export const EVIDENCE_STATE = {
  AVAILABLE: "available",
  PARTIAL: "partial",
  MISSING: "missing",
};

export const EVIDENCE_STATE_LABELS = {
  [EVIDENCE_STATE.AVAILABLE]: "Policy evidence available",
  [EVIDENCE_STATE.PARTIAL]: "Policy evidence partial",
  [EVIDENCE_STATE.MISSING]: "Policy evidence missing",
};

export const EVENT_STATUS = {
  ACTIVE: "active",
  MONITORING: "monitoring",
  CLOSED: "closed",
};

export const EVENT_STATUS_LABELS = {
  [EVENT_STATUS.ACTIVE]: "Active",
  [EVENT_STATUS.MONITORING]: "Monitoring",
  [EVENT_STATUS.CLOSED]: "Closed",
};

export const EVENT_STATUS_TONES = {
  [EVENT_STATUS.ACTIVE]: "red",
  [EVENT_STATUS.MONITORING]: "amber",
  [EVENT_STATUS.CLOSED]: "neutral",
};

export const ADJUSTER_STATUS = {
  AVAILABLE: "available",
  NEAR_CAPACITY: "near_capacity",
  OVERLOADED: "overloaded",
  UNAVAILABLE: "unavailable",
};

export const ADJUSTER_STATUS_LABELS = {
  [ADJUSTER_STATUS.AVAILABLE]: "Available",
  [ADJUSTER_STATUS.NEAR_CAPACITY]: "Near capacity",
  [ADJUSTER_STATUS.OVERLOADED]: "Overloaded",
  [ADJUSTER_STATUS.UNAVAILABLE]: "Unavailable",
};

export const ADJUSTER_STATUS_TONES = {
  [ADJUSTER_STATUS.AVAILABLE]: "teal",
  [ADJUSTER_STATUS.NEAR_CAPACITY]: "amber",
  [ADJUSTER_STATUS.OVERLOADED]: "red",
  [ADJUSTER_STATUS.UNAVAILABLE]: "neutral",
};

export const PERILS = ["Storm surge / flooding", "Wind damage", "Wildfire", "Hail", "Structural collapse"];

export const URGENCY_URGENT_THRESHOLD = 85;

export function urgencyBand(score) {
  if (score == null) return { label: "Not scored", tone: "neutral" };
  return URGENCY_BANDS.find((b) => score >= b.min) || URGENCY_BANDS[URGENCY_BANDS.length - 1];
}

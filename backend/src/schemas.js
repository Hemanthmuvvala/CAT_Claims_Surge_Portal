import { z } from "zod";

// Claim refs (CLM-2026-0142) and cluster/event ids flow through the same
// routes, so path ids accept either a UUID or a human reference.
export const idParam = z.object({ id: z.string().trim().min(4, "Invalid id format") });

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const eventsQuery = listQuery.extend({
  status: z.enum(["active", "monitoring", "closed"]).optional(),
});

export const createEventBody = z.object({
  name: z.string().trim().min(3),
  type: z.string().trim().min(3),
  region: z.string().trim().min(3),
  declaredAt: z.string().datetime({ offset: true }).or(z.string().min(10)),
  summary: z.string().trim().max(500).optional(),
});

export const claimsQuery = listQuery.extend({
  eventId: z.string().min(6).optional(),
  status: z
    .enum(["submitted", "triage_pending", "triaged", "assigned", "in_review", "info_required", "assessment_complete", "closed"])
    .optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  assigned: z.enum(["assigned", "unassigned"]).optional(),
  method: z.enum(["ai", "fallback", "unscored"]).optional(),
  clusterId: z.string().uuid().optional(),
});

export const createClaimBody = z.object({
  // Empty/absent = "Not sure / other" — the service binds the claim to the
  // active event driving the surge (most claims; fallback most recently
  // declared), exactly like the frontend intake flow promises.
  eventId: z.string().min(6).optional().or(z.literal("")),
  policyId: z.string().trim().regex(/^POL-\d{4,6}(-[A-Z])?$/i, "Format: POL-12345"),
  contactName: z.string().trim().min(2),
  contactEmail: z.string().trim().email(),
  location: z.string().trim().min(5),
  peril: z.string().trim().min(3),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((d) => new Date(d) <= new Date(), "Incident date cannot be in the future"),
  description: z.string().trim().min(20),
  severity: z.enum(["critical", "high", "medium", "low"]),
  hardshipFlags: z.array(z.string()).max(10).default([]),
  documents: z.array(z.string()).max(20).default([]),
});

export const batchImportBody = z.object({
  eventId: z.string().min(6),
  rows: z
    .array(
      z.object({
        ref: z.string().trim().optional(),
        policyId: z.string().trim().optional(),
        contactName: z.string().trim().optional(),
        contactEmail: z.string().trim().optional(),
        location: z.string().trim().min(3),
        peril: z.string().trim().min(3),
        severity: z.string().trim().toLowerCase(),
        incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        hardshipFlags: z.union([z.array(z.string()), z.string()]).optional(),
        description: z.string().trim().optional(),
      })
    )
    .min(1)
    .max(1000),
});

export const updateStatusBody = z.object({
  status: z.enum([
    "triage_pending",
    "triaged",
    "assigned",
    "in_review",
    "info_required",
    "assessment_complete",
    "closed",
  ]),
});

export const assignBody = z.object({
  claimId: z.string().min(4),
  adjusterId: z.string().min(4),
});

export const aiRunBody = z.object({
  claimId: z.string().min(4).optional(),
  ref: z.string().optional(),
  forceMethod: z.enum(["ai", "rules_fallback"]).optional(),
});

export const moveClusterBody = z.object({
  clusterId: z.string().min(4).nullable(),
});

export const eventStatusBody = z.object({
  status: z.enum(["active", "monitoring", "closed"]),
});

export const loginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const policyholderClaimsQuery = listQuery.extend({
  policyId: z.string().trim().min(3).optional(),
});

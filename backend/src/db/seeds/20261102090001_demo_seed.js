"use strict";

// Seed script — reproducible synthetic dataset (no real PII).
// Run: npm run seed   (after npm run migrate)

import { hashPassword } from "../../lib/passwords.js";
import {
  computeClusterKey,
  normalizePerilFamily,
  clusterDisplayName,
} from "../../lib/clusterLogic.js";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms);

const ADJUSTERS = [
  { name: "Marcus Chen", region: "Visakhapatnam — Sagar Nagar", capacity: 14, status: "available", phone: "555-0141" },
  { name: "Elena Rodriguez", region: "Visakhapatnam — Akkayyapalem", capacity: 12, status: "available", phone: "555-0142" },
  { name: "David Okafor", region: "Hyderabad — Khairatabad", capacity: 10, status: "near_capacity", phone: "555-0143" },
  { name: "Sarah Whitfield", region: "Hyderabad — Somajiguda", capacity: 12, status: "overloaded", phone: "555-0144" },
  { name: "James Park", region: "Vikarabad — Ananthagiri", capacity: 10, status: "available", phone: "555-0145" },
  { name: "Aisha Bello", region: "On leave", capacity: 8, status: "unavailable", phone: "555-0146" },
];

const EVENTS = [
  {
    key: "evt-hudhud",
    name: "Cyclone Hudhud",
    type: "Tropical cyclone",
    region: "Visakhapatnam — Coastal Andhra Pradesh",
    declaredAt: ago(52 * HOUR),
    status: "active",
    summary: "Severe cyclonic storm made landfall near Visakhapatnam. Widespread wind and storm-surge damage across coastal mandals.",
  },
  {
    key: "evt-arnab",
    name: "Cyclone Arnab",
    type: "Tropical cyclone",
    region: "Nellore — Coastal Andhra Pradesh",
    declaredAt: ago(26 * HOUR),
    status: "monitoring",
    summary: "Cyclonic storm tracking along the Nellore coast. Landfall expected within 36 hours — claims intake standing by.",
  },
  {
    key: "evt-murasu",
    name: "Cyclone Murasu",
    type: "Tropical cyclone",
    region: "Kakinada — Coastal Andhra Pradesh",
    declaredAt: ago(12 * DAY),
    status: "closed",
    summary: "Weakened and exited land. Claims intake closed; residual assessments continue.",
  },
  {
    key: "evt-riverside",
    name: "Hyderabad Urban Flooding",
    type: "Urban flood",
    region: "Khairatabad — Hyderabad, Telangana",
    declaredAt: ago(20 * HOUR),
    status: "active",
    summary: "Overnight cloudburst overwhelmed storm-water drains in low-lying Hyderabad localities; Musi backwater flooded ground floors.",
  },
  {
    key: "evt-wildfire",
    name: "Ananthagiri Hills Wildfire",
    type: "Wildfire",
    region: "Ananthagiri Hills — Vikarabad, Telangana",
    declaredAt: ago(9 * DAY),
    status: "closed",
    summary: "Summer scrub fire spread along the forest fringe. Isolated outbuildings affected; containment reached.",
  },
];

// Demo credentials: every account's password is "demo1234" (hashed with scrypt).
const USERS = [
  { email: "priya.raman@example.com", name: "Priya Raman", role: "policyholder", policyId: "POL-77341-A", adjuster: null },
  { email: "maya.alvarez@catresponse.com", name: "Maya Alvarez", role: "manager", policyId: null, adjuster: null },
  { email: "marcus.chen@catresponse.com", name: "Marcus Chen", role: "adjuster", policyId: null, adjuster: "Marcus Chen" },
];

const HARDSHIP = {
  ELDERLY: "Elderly resident",
  MEDICAL: "Medical needs",
  NO_POWER: "No power / water",
  DISPLACED: "Displaced from home",
  CHILDREN: "Young children",
  LIVELIHOOD: "Livelihood at risk",
};

let claimSeq = 140;
const ref = () => `CLM-2026-0${claimSeq++}`;

function factor(label, weight, detail) {
  return { label, weight, detail };
}

const F = {
  critical: () => factor("Critical severity", 32, "Reported structural damage and safety risk at the property."),
  high: () => factor("High severity", 24, "Significant damage reported; habitability may be affected."),
  medium: () => factor("Medium severity", 14, "Moderate damage; property is still habitable."),
  low: () => factor("Low severity", 6, "Minor damage reported."),
  hardship: (flags) => factor("Vulnerability / hardship signals", 22, `${flags.join(", ")}.`),
  water: () => factor("Active water ingress", 18, "Ongoing water ingress reported — deterioration risk."),
  cluster: () => factor("Part of high-density cluster", 12, "Multiple related claims in the same street/area."),
  sla: () => factor("Approaching response target", 10, "Time awaiting human review is close to the event response target."),
};

export async function seed(knex) {
  // Idempotent: clear in FK-safe order, then insert.
  await knex("activity_log").del();
  await knex("claim_events").del();
  await knex("assignments").del();
  await knex("priority_scores").del();
  await knex("cluster_claims").del();
  await knex("claims").del();
  await knex("clusters").del();
  await knex("resources").del();
  await knex("events").del();
  await knex("users").del();

  // --- users ---
  const userIds = {};
  for (const u of USERS) {
    const [row] = await knex("users")
      .insert({
        email: u.email,
        name: u.name,
        role: u.role,
        policy_id: u.policyId,
        password_hash: hashPassword("demo1234"),
      })
      .returning("id");
    userIds[u.email] = row.id ?? row;
  }

  // --- events ---
  const eventIds = {};
  for (const e of EVENTS) {
    const [row] = await knex("events")
      .insert({
        name: e.name,
        type: e.type,
        region: e.region,
        declared_at: e.declaredAt,
        status: e.status,
        summary: e.summary,
      })
      .returning("id");
    eventIds[e.key] = row.id ?? row;
  }

  // --- resources ---
  const adjusterIds = {};
  for (const a of ADJUSTERS) {
    const [row] = await knex("resources")
      .insert({ name: a.name, region: a.region, phone: a.phone, capacity: a.capacity, status: a.status })
      .returning("id");
    adjusterIds[a.name] = row.id ?? row;
  }

  // Link adjuster logins to their surge-team resource (for JWT-scoped views).
  for (const u of USERS) {
    if (u.adjuster && adjusterIds[u.adjuster]) {
      await knex("users").where("id", userIds[u.email]).update({ resource_id: adjusterIds[u.adjuster] });
    }
  }

  // --- clusters ---
  // Keys derive from the same (peril family, street block) logic the runtime
  // clustering uses, so seeded groups behave identically after a rebuild.
  const clusterIds = {};
  const CLUSTERS = [
    { id: "clu-esplanade", event: "evt-hudhud", rep: { peril: "Storm surge / flooding", location: "12 Sagar Nagar, Visakhapatnam" }, note: "Low-lying coastal lane near the shoreline; surge inundation reported at multiple addresses." },
    { id: "clu-marina", event: "evt-hudhud", rep: { peril: "Wind damage", location: "48 Akkayyapalem, Visakhapatnam" }, note: "Dense middle-ring locality; repeated roof-tile losses in the same construction era." },
    { id: "clu-dune", event: "evt-hudhud", rep: { peril: "Wind damage", location: "23 Gajuwaka, Visakhapatnam" }, note: "Gajuwaka hillside properties; mixed wind and surge exposure." },
    { id: "clu-anchorage", event: "evt-hudhud", rep: { peril: "Wind damage", location: "31 Rushikonda, Visakhapatnam" }, note: "Hill-facing homes; hail and wind reports clustered on south-facing roofs." },
    { id: "clu-kelvin", event: "evt-riverside", rep: { peril: "Storm surge / flooding", location: "5 Khairatabad, Hyderabad" }, note: "Low-lying street beside the storm-water drain; overnight backflow flooded ground floors." },
    { id: "clu-somajiguda", event: "evt-riverside", rep: { peril: "Storm surge / flooding", location: "19 Somajiguda, Hyderabad" }, note: "Narrow lanes behind the main road; street flooding peaked after midnight." },
  ];
  for (const c of CLUSTERS) {
    const key = computeClusterKey(c.rep);
    const { display } = normalizePerilFamily(c.rep.peril);
    const [row] = await knex("clusters")
      .insert({
        event_id: eventIds[c.event],
        key,
        peril_family: display,
        location_key: key.split("||")[1],
        peril: display,
        location: c.rep.location,
        name: clusterDisplayName(display, c.rep.location),
        note: c.note,
      })
      .returning("id");
    clusterIds[c.id] = row.id ?? row;
  }

  // --- claims ---
  const claim = (o) => ({
    ref: ref(),
    event_id: eventIds["evt-hudhud"],
    policy_id: "POL-77012-C",
    contact_name: null,
    contact_email: null,
    location: "Visakhapatnam",
    peril: "Storm surge / flooding",
    incident_date: ago(30 * HOUR).toISOString().slice(0, 10),
    description: "",
    severity: "medium",
    hardship_flags: [],
    status: "triaged",
    received_at: ago(26 * HOUR),
    documents: [],
    ...o,
  });

  const CLAIMS = [
    claim({ location: "12 Sagar Nagar, Visakhapatnam", peril: "Storm surge / flooding", severity: "critical", hardship_flags: [HARDSHIP.DISPLACED, HARDSHIP.NO_POWER], status: "in_review", description: "Storm surge entered ground floor; water 1.2m deep at peak. Family staying with relatives.", cluster: "clu-esplanade", received_at: ago(30 * HOUR), assignee: "Marcus Chen" }),
    claim({ location: "48 Akkayyapalem, Visakhapatnam", peril: "Wind damage", severity: "high", hardship_flags: [HARDSHIP.ELDERLY], status: "assigned", description: "Roof tiles lifted, ceiling water damage in two rooms. Resident is 81 and alone.", cluster: "clu-marina", received_at: ago(28 * HOUR), assignee: "Elena Rodriguez" }),
    claim({ location: "7 Sagar Nagar, Visakhapatnam", peril: "Storm surge / flooding", severity: "high", hardship_flags: [HARDSHIP.MEDICAL], status: "in_review", description: "Water ingress through failed window seals; medical equipment in the home needs stable power.", cluster: "clu-esplanade", received_at: ago(27 * HOUR), assignee: "Marcus Chen" }),
    claim({ location: "23 Gajuwaka, Visakhapatnam", peril: "Wind damage", severity: "medium", status: "assessment_complete", description: "Fence and garage door damage from wind-borne debris.", cluster: "clu-dune", received_at: ago(29 * HOUR), method: "rules_fallback", assignee: "Sarah Whitfield" }),
    claim({ location: "5 Khairatabad, Hyderabad", event: "evt-riverside", severity: "high", hardship_flags: [HARDSHIP.CHILDREN, HARDSHIP.DISPLACED], status: "info_required", description: "Floodwater entered rear of property overnight. Family of four relocated to evacuation centre.", cluster: "clu-kelvin", received_at: ago(15 * HOUR), assignee: "David Okafor" }),
    claim({ location: "90 Sagar Nagar, Visakhapatnam", severity: "critical", hardship_flags: [HARDSHIP.DISPLACED, HARDSHIP.CHILDREN], status: "triaged", description: "Ground floor fully flooded; structural concerns about the rear wall. Family in evacuation centre.", cluster: "clu-esplanade", received_at: ago(24 * HOUR) }),
    claim({ location: "2 Akkayyapalem, Visakhapatnam", severity: "critical", hardship_flags: [HARDSHIP.ELDERLY, HARDSHIP.NO_POWER], status: "triaged", description: "Elderly couple without power for 26 hours; water in kitchen and lounge.", cluster: "clu-marina", received_at: ago(22 * HOUR) }),
    claim({ location: "31 Rushikonda, Visakhapatnam", peril: "Wind damage", severity: "high", hardship_flags: [HARDSHIP.LIVELIHOOD], status: "triaged", description: "Roof damage over home workshop — policyholder's livelihood tools exposed to weather.", cluster: "clu-anchorage", received_at: ago(20 * HOUR) }),
    claim({ location: "17 Gajuwaka, Visakhapatnam", severity: "high", hardship_flags: [HARDSHIP.DISPLACED], status: "triaged", description: "Water ingress continuing; carpet and skirting saturated. Family moved to a motel.", cluster: "clu-dune", received_at: ago(19 * HOUR), method: "rules_fallback" }),
    claim({ location: "44 Akkayyapalem, Visakhapatnam", peril: "Wind damage", severity: "medium", status: "triaged", description: "Broken roof tiles and gutter damage; minor interior staining.", cluster: null, received_at: ago(18 * HOUR) }),
    claim({ location: "62 Rushikonda, Visakhapatnam", peril: "Hail", severity: "medium", hardship_flags: [HARDSHIP.ELDERLY], status: "triaged", description: "Hail damage to skylights; water staining on ceiling of front room.", cluster: "clu-anchorage", received_at: ago(16 * HOUR) }),
    claim({ location: "8 Gajuwaka, Visakhapatnam", peril: "Wind damage", severity: "low", status: "triaged", description: "Minor damage to garden fencing and external awning.", cluster: "clu-dune", received_at: ago(14 * HOUR) }),
    claim({ location: "105 Sagar Nagar, Visakhapatnam", severity: "critical", hardship_flags: [HARDSHIP.DISPLACED], status: "triaged", method: "rules_fallback", description: "Water is still rising in the street; ground floor submerged. Neighbours report similar damage.", cluster: "clu-esplanade", received_at: ago(75 * 60 * 1000) }),
    claim({ location: "3 Akkayyapalem, Visakhapatnam", peril: "Wind damage", severity: "medium", status: "triaged", method: "rules_fallback", description: "Part of the carport collapsed onto a vehicle during the peak winds.", cluster: "clu-marina", received_at: ago(45 * 60 * 1000) }),
    claim({
      location: "14 Sagar Nagar, Visakhapatnam",
      policy_id: "POL-77341-A",
      contact_name: "Priya Raman",
      contact_email: "priya.raman@example.com",
      policyholder: "priya.raman@example.com",
      severity: "high",
      hardship_flags: [HARDSHIP.DISPLACED, HARDSHIP.NO_POWER],
      status: "in_review",
      description: "Storm surge pushed water into our ground floor overnight. We are staying with family nearby.",
      cluster: "clu-esplanade",
      received_at: ago(21 * HOUR),
      assignee: "Marcus Chen",
    }),
    claim({ location: "71 Gajuwaka, Visakhapatnam", peril: "Wind damage", severity: "medium", status: "closed", description: "Storm-chaser damage; assessment completed earlier today.", cluster: "clu-dune", received_at: ago(34 * HOUR), assignee: "Sarah Whitfield" }),
    claim({ event: "evt-riverside", location: "19 Somajiguda, Hyderabad", severity: "low", status: "triaged", description: "Water reached the garage only; no living areas affected.", cluster: "clu-somajiguda", received_at: ago(12 * HOUR), method: "rules_fallback" }),
    claim({ event: "evt-riverside", location: "22 Somajiguda, Hyderabad", severity: "medium", status: "triaged", method: "rules_fallback", description: "Backyard pooling; water approaching rear door level.", cluster: "clu-somajiguda", received_at: ago(55 * 60 * 1000) }),
    claim({ event: "evt-wildfire", location: "Ananthagiri Forest Road, Vikarabad", peril: "Wildfire", severity: "high", status: "closed", description: "Outbuilding destroyed; main dwelling smoke-affected.", received_at: ago(8 * DAY), method: "rules_fallback", assignee: "James Park" }),
  ];

  const claimRows = [];
  for (const c of CLAIMS) {
    const eventId = eventIds[c.event || "evt-hudhud"];
    const [row] = await knex("claims")
      .insert({
        ref: c.ref,
        event_id: eventId,
        policy_id: c.policy_id,
        policyholder_user_id: c.policyholder ? userIds[c.policyholder] : null,
        contact_name: c.contact_name ?? null,
        contact_email: c.contact_email ?? null,
        location: c.location,
        peril: c.peril,
        incident_date: c.incident_date,
        description: c.description,
        severity: c.severity,
        hardship_flags: JSON.stringify(c.hardship_flags),
        documents: JSON.stringify(c.documents),
        status: c.status,
        cluster_id: c.cluster ? clusterIds[c.cluster] : null,
        assigned_resource_id: c.assignee ? adjusterIds[c.assignee] : null,
        received_at: c.received_at,
      })
      .returning("id");
    const claimId = row.id ?? row;
    claimRows.push({ ...c, id: claimId });

    // timeline
    await knex("claim_events").insert({ claim_id: claimId, label: "Claim received", actor: c.contact_name || "Intake", occurred_at: c.received_at });
    if (c.status !== "triage_pending" && c.status !== "submitted") {
      await knex("claim_events").insert({ claim_id: claimId, label: "Queued for triage", actor: "System", occurred_at: new Date(+c.received_at + 5 * 60 * 1000) });
      await knex("claim_events").insert({
        claim_id: claimId,
        label: `Triage scored (${c.method === "rules_fallback" ? "rules fallback" : "AI-assisted"})`,
        actor: c.method === "rules_fallback" ? "Rules engine" : "AI service",
        occurred_at: new Date(+c.received_at + 12 * 60 * 1000),
      });
    }
    if (c.assignee) {
      await knex("claim_events").insert({ claim_id: claimId, label: "Assigned for assessment", actor: `Assigned to ${c.assignee}`, occurred_at: new Date(+c.received_at + 30 * 60 * 1000) });
    }
    if (["in_review", "info_required", "assessment_complete", "closed"].includes(c.status)) {
      await knex("claim_events").insert({ claim_id: claimId, label: "Review in progress", actor: "Assigned adjuster", occurred_at: new Date(+c.received_at + 2 * HOUR) });
    }
  }

  // --- cluster membership (junction rows mirror claims.cluster_id) ---
  for (const c of claimRows) {
    if (c.cluster) {
      await knex("cluster_claims").insert({
        cluster_id: clusterIds[c.cluster],
        claim_id: c.id,
      }).onConflict().ignore();
    }
  }

  // --- priority scores (dummy AI results; rules_fallback where flagged) ---
  for (const c of claimRows) {
    if (["triage_pending", "submitted"].includes(c.status)) continue;
    const method = c.method === "rules_fallback" ? "rules_fallback" : "ai_assisted";
    const factors = [];
    if (c.severity === "critical") factors.push(F.critical());
    else if (c.severity === "high") factors.push(F.high());
    else if (c.severity === "low") factors.push(F.low());
    else factors.push(F.medium());
    if (c.hardship_flags.length) factors.push(F.hardship(c.hardship_flags));
    if (/flood|surge|water/i.test(c.peril)) factors.push(F.water());
    if (c.cluster) factors.push(F.cluster());
    if (method === "rules_fallback") factors.push(F.sla());

    const value =
      Math.min(97,
        ({ critical: 34, high: 24, medium: 14, low: 6 }[c.severity] ?? 14) +
        c.hardship_flags.length * 9 +
        (/flood|surge|water/i.test(c.peril) ? 14 : 6) +
        (method === "rules_fallback" ? 6 : 0));

    const warnings = method === "rules_fallback"
      ? ["AI provider degraded — scored by deterministic rules-based fallback."]
      : [];
    if (!c.documents.length) warnings.push("No supporting documents attached; evidence not yet verified.");

    await knex("priority_scores").insert({
      claim_id: c.id,
      value,
      factors: JSON.stringify(factors),
      scoring_method: method,
      processed_at: new Date(+c.received_at + 12 * 60 * 1000),
      latency_ms: method === "ai_assisted" ? 1600 + Math.floor(Math.random() * 900) : 45,
      cost_usd: method === "ai_assisted" ? 0.34 : 0.001,
      evidence_state: c.documents.length ? "available" : c.policy_id ? "partial" : "missing",
      coverage_evidence: JSON.stringify(
        c.policy_id
          ? [{ source: "Policy administration system", ref: `Policy ${c.policy_id} — schedule & perils section` }]
          : []
      ),
      needs_human_review: true,
      warnings: JSON.stringify(warnings),
    });
  }

  // --- assignments (history) ---
  for (const c of claimRows) {
    if (c.assignee) {
      await knex("assignments").insert({
        claim_id: c.id,
        resource_id: adjusterIds[c.assignee],
        note: `Assigned by Maya Alvarez`,
        assigned_at: new Date(+c.received_at + 30 * 60 * 1000),
      });
    }
  }

  // --- activity feed ---
  const activities = [
    { action: "Batch intake", label: "Batch import INT-2231 completed", status_label: "18 imported, 2 validation errors", source: "System", created_at: ago(6 * 60 * 1000) },
    { action: "Triage", label: "Triage batch scored (rules fallback)", status_label: "Fallback", source: "Rules engine", created_at: ago(19 * 60 * 1000) },
    { action: "Assignment", label: "Claim assigned", status_label: "Assigned", source: "Maya Alvarez", created_at: ago(48 * 60 * 1000) },
    { action: "SLA", label: "SLA warning acknowledged", status_label: "Urgent queue", source: "System", created_at: ago(2 * HOUR) },
  ];
  await knex("activity_log").insert(activities);

  // Keep the claim-ref sequence in sync (seed refs are CLM-2026-0140 …).
  // claimSeq is now one past the last used number.
  await knex.raw("SELECT setval('claim_ref_seq', ?, true)", [claimSeq - 1]);
};

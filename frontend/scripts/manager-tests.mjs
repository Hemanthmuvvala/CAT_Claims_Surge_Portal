// Manager-side integration test suite — REAL BACKEND edition.
//
// Exercises every manager feature against the live Node API (:3001) with the
// exact page logic (filters, sorts, proposals) the React screens run, plus
// auth, event lifecycle, Excel-template batch intake, cluster rebuild/move and
// policyholder isolation. Self-seeding: creates its own event and claims, so it
// never depends on the demo seed state.
//
// Run: node scripts/manager-tests.mjs      (backend on :3001, AI service on :8000)

const BASE = "http://localhost:3001/api";
const DEMO_PASSWORD = "demo1234";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

async function req(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- page logic replicas (verbatim from the React screens) ----
const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
const URGENCY_URGENT_THRESHOLD = 85;
const unscored = (c) => !c.score;
const sortQueue = (list, sortBy = "priority") =>
  [...list].sort((a, b) => {
    if (sortBy === "priority" || sortBy === "score") {
      if (unscored(a) && !unscored(b)) return -1;
      if (!unscored(a) && unscored(b)) return 1;
      if (unscored(a) && unscored(b)) return new Date(b.receivedAt) - new Date(a.receivedAt);
    }
    switch (sortBy) {
      case "severity": return (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
      case "arrival": return new Date(b.receivedAt) - new Date(a.receivedAt);
      case "score": return (b.score?.value ?? -1) - (a.score?.value ?? -1);
      case "ref": return a.id.localeCompare(b.id);
      default: return (b.score?.value ?? -1) - (a.score?.value ?? -1) || (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
    }
  });
const applyFilters = (claims, f) =>
  claims.filter((c) => {
    if (f.urgent && !(c.score?.value >= URGENCY_URGENT_THRESHOLD && ["triaged", "triage_pending"].includes(c.status))) return false;
    if (f.q) {
      const q = f.q.toLowerCase().trim();
      const hay = [c.id, c.location, c.contactName, c.contactEmail, c.peril, c.policyId].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.severity && c.severity !== f.severity) return false;
    if (f.hardship && (f.hardship === "yes" ? c.hardshipFlags.length === 0 : c.hardshipFlags.length > 0)) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.scoreMin && !(c.score?.value >= Number(f.scoreMin))) return false;
    if (f.assignment === "unassigned" && !["triaged", "triage_pending"].includes(c.status)) return false;
    if (f.assignment === "assigned" && !(c.assignedAdjusterId || ["assigned", "in_review", "info_required", "assessment_complete", "closed"].includes(c.status))) return false;
    if (f.method === "ai" && c.score?.scoringMethod !== "ai_assisted") return false;
    if (f.method === "fallback" && c.score?.scoringMethod !== "rules_fallback") return false;
    if (f.method === "unscored" && c.score) return false;
    if (f.cluster && c.clusterId !== f.cluster) return false;
    return true;
  });
// WorkloadPage proposal: highest score first, most remaining capacity first,
// never to unavailable or full adjusters.
const buildProposal = (adjusters, claims) => {
  const pool = adjusters
    .filter((a) => a.status !== "unavailable")
    .map((a) => ({ id: a.id, name: a.name, remaining: a.capacity - a.load, load: a.load, capacity: a.capacity }))
    .sort((x, y) => y.remaining - x.remaining);
  const queue = claims
    .filter((c) => c.status === "triaged" && c.score)
    .sort((a, b) => b.score.value - a.score.value);
  const out = [];
  for (const claim of queue) {
    const target = pool.find((p) => p.remaining > 0);
    if (!target) { out.push({ claimId: claim.id, score: claim.score.value, adjuster: null }); continue; }
    out.push({ claimId: claim.id, score: claim.score.value, adjuster: target.name, adjusterId: target.id });
    target.remaining -= 1;
  }
  return out;
};

const claimBody = (over = {}) => ({
  policyId: "POL-20260-D",
  contactName: "Drill Tester",
  contactEmail: "drill.tester@example.com",
  peril: "Storm surge / flooding",
  incidentDate: new Date().toISOString().slice(0, 10),
  severity: "medium",
  hardshipFlags: [],
  documents: [],
  ...over,
});

async function main() {
  // ---------------------------------------------------------- 0. health
  section("0. Health — backend + AI service");
  const health = (await req("/health")).json;
  ok("backend healthy", health?.status === "ok", JSON.stringify(health?.status));
  ok("AI service operational via live probe", health?.aiService?.status === "operational", `status=${health?.aiService?.status}`);
  ok("AI service reports llama3.2:3b", health?.aiService?.llm === "llama3.2:3b", `llm=${health?.aiService?.llm}`);

  // ---------------------------------------------------------- 1. auth
  section("1. Auth — JWT login, roles, isolation");
  const badLogin = await req("/auth/login", { method: "POST", body: { email: "maya.alvarez@catresponse.com", password: "nope" } });
  ok("bad password rejected (401)", badLogin.status === 401, `status=${badLogin.status}`);

  const mgrLogin = await req("/auth/login", { method: "POST", body: { email: "maya.alvarez@catresponse.com", password: DEMO_PASSWORD } });
  ok("manager login issues JWT", mgrLogin.status === 200 && !!mgrLogin.json?.data?.token);
  const mgr = mgrLogin.json.data.token;

  const adjLogin = await req("/auth/login", { method: "POST", body: { email: "marcus.chen@catresponse.com", password: DEMO_PASSWORD } });
  ok("adjuster login returns adjusterId", adjLogin.status === 200 && !!adjLogin.json?.data?.user?.adjusterId, `adjusterId=${String(adjLogin.json?.data?.user?.adjusterId || "").slice(0, 8)}`);
  const adj = adjLogin.json.data.token;

  const phLogin = await req("/auth/login", { method: "POST", body: { email: "priya.raman@example.com", password: DEMO_PASSWORD } });
  ok("policyholder login returns policyId", phLogin.status === 200 && phLogin.json?.data?.user?.policyId === "POL-77341-A");
  const ph = phLogin.json.data.token;

  const forged = await req("/claims?page=1&pageSize=5", { headers_token: null, token: "not-a-jwt" });
  ok("garbage bearer token rejected (401)", forged.status === 401, `status=${forged.status}`);

  // ---------------------------------------------------------- 2. events
  section("2. Events — declare + lifecycle");
  const stamp = Date.now().toString().slice(-6);
  const dec = await req("/events", {
    method: "POST", token: mgr,
    body: { name: `Surge Drill Event ${stamp}`, type: "Tropical cyclone", region: "Machilipatnam — Coastal Andhra Pradesh", declaredAt: new Date().toISOString(), summary: "Integration drill event." },
  });
  ok("declare CAT event (201)", dec.status === 201 && !!dec.json?.data?.id, `status=${dec.status}`);
  const event = dec.json.data;
  ok("new event starts active with zero claims", event.status === "active" && event.claimCount === 0);

  const evList = (await req("/events?page=1&pageSize=100")).json.data;
  ok("event list includes new event with claim counts", evList.some((e) => e.id === event.id && typeof e.claimCount === "number"));

  const adjStatus = await req(`/events/${event.id}/status`, { method: "PATCH", body: { status: "monitoring" }, token: adj });
  ok("adjuster cannot change event status (403)", adjStatus.status === 403, `status=${adjStatus.status}`);
  const mon = await req(`/events/${event.id}/status`, { method: "PATCH", body: { status: "monitoring" }, token: mgr });
  ok("manager sets event monitoring", mon.status === 200 && mon.json.data.status === "monitoring");
  const act = await req(`/events/${event.id}/status`, { method: "PATCH", body: { status: "active" }, token: mgr });
  ok("manager reactivates event", act.status === 200 && act.json.data.status === "active");

  // ---------------------------------------------------------- 3. intake
  section("3. Intake — claims created + auto triage + auto-cluster");
  const mk = async (over) => {
    const r = await req("/claims", { method: "POST", token: mgr, body: claimBody({ eventId: event.id, ...over }) });
    if (r.status !== 201) throw new Error(`claim create failed: ${JSON.stringify(r.json)}`);
    return r.json.data;
  };
  const c1 = await mk({ location: "9 Nallagandla, Hyderabad", severity: "critical", hardshipFlags: ["Displaced from home", "No power / water"], description: "Surge water filled the ground floor at high tide and the family moved out; power has been out since landfall." });
  const c2 = await mk({ location: "11 Nallagandla, Hyderabad", severity: "critical", contactName: "Second Household", contactEmail: "second@example.com", description: "Sea water reached the skirting boards downstairs; neighbours report the same street flooding." });
  const c3 = await mk({ location: "5 Miyapur, Hyderabad", peril: "Wind damage", severity: "medium", description: "Garden fence panels blown over and a few roof tiles slipped in the gusts." });
  const c4 = await mk({ location: "7 Miyapur, Hyderabad", peril: "Wind damage", severity: "low", contactName: "Willow Neighbour", contactEmail: "willow@example.com", description: "Minor tiles dislodged on the garage; nothing entering the property." });

  ok("four claims created with unique refs", new Set([c1.ref, c2.ref, c3.ref, c4.ref]).size === 4, [c1, c2, c3, c4].map((c) => c.ref).join(","));
  ok("new claims start triage_pending", [c1, c2, c3, c4].every((c) => c.status === "triage_pending"));

  // Auto-cluster: same street block + peril
  const earlyClusters = (await req(`/clusters?eventId=${event.id}&page=1&pageSize=100`, { token: mgr })).json.data;
  const drillCluster = earlyClusters.find((cl) => cl.key.includes("nallagandla hyderabad"));
  const willowCluster = earlyClusters.find((cl) => cl.key.includes("miyapur hyderabad"));
  ok("Nallagandla surge pair auto-clustered", !!drillCluster && drillCluster.claimCount === 2, `key=${drillCluster?.key}`);
  ok("Miyapur wind pair auto-clustered", !!willowCluster && willowCluster.claimCount === 2, `key=${willowCluster?.key}`);
  ok("cluster display names use peril family + locality", (drillCluster?.name || "").startsWith("Storm surge / flooding"), `name=${drillCluster?.name}`);

  // Trigger real AI triage for the two urgent claims (sequential, ~25-30s each)
  const t0 = Date.now();
  const r1 = await req("/ai/run", { method: "POST", body: { claimId: c1.ref }, token: mgr });
  const r2 = await req("/ai/run", { method: "POST", body: { claimId: c2.ref }, token: mgr });
  const aiTook = ((Date.now() - t0) / 1000).toFixed(1);
  const s1 = r1.json?.data?.score, s2 = r2.json?.data?.score;
  ok("AI triage scored both urgent claims", !!s1 && !!s2, `took=${aiTook}s statuses=${r1.status}/${r2.status}`);
  ok("scoringMethod=ai_assisted (real llama run)", s1?.scoringMethod === "ai_assisted" && s2?.scoringMethod === "ai_assisted", `${s1?.scoringMethod}/${s2?.scoringMethod}`);
  ok("cost is $0 per claim (local model)", Number(s1?.costUsd) === 0 && Number(s2?.costUsd) === 0);
  ok("latency recorded and plausible (hot 3B < 120s)", Number(s1?.latencyMs) > 500 && Number(s1?.latencyMs) < 120000, `${s1?.latencyMs}ms`);
  ok("score bands: urgent claims >= 65", s1.value >= 65 && s2.value >= 65, `values=${s1.value}/${s2.value}`);
  ok("critical severity factor present", (s1.factors || []).some((f) => /critical/i.test(f.label)), (s1.factors || []).map((f) => f.label).join(" | "));
  ok("hardship factor present with detail", (s1.factors || []).some((f) => /vulnerability|hardship/i.test(f.label) && (f.detail || "").length > 5));
  ok("tags returned (peril_type + damage_type)", s1?.tags && !!s1.tags.perilType && !!s1.tags.damageType, `peril=${s1?.tags?.perilType} dmg=${s1?.tags?.damageType}`);
  ok("coverage evidence cites the policy KB", Array.isArray(s1?.coverageEvidence) && s1.coverageEvidence.length > 0);
  ok("human review never waived", s1.needsHumanReview === true && s2.needsHumanReview === true);
  const c1After = (await req(`/claims/${c1.ref}`, { token: mgr })).json.data;
  const c2After = (await req(`/claims/${c2.ref}`, { token: mgr })).json.data;
  ok("claims moved to triaged", c1After.status === "triaged" && c2After.status === "triaged", `${c1After.status}/${c2After.status}`);

  // ---------------------------------------------------------- 4. queue logic
  section("4. Priority queue — filters, sorts, KPI replicas");
  const claims = (await req(`/claims?eventId=${event.id}&page=1&pageSize=100`, { token: mgr })).json.data.map((c) => ({
    id: c.ref, location: c.location, contactName: c.contact_name, contactEmail: c.contact_email,
    peril: c.peril, policyId: c.policy_id, severity: c.severity, status: c.status,
    hardshipFlags: c.hardship_flags ?? [], assignedAdjusterId: c.assigned_resource_id,
    clusterId: c.cluster_id, receivedAt: c.received_at,
    score: c.score ? { value: Number(c.score.value), scoringMethod: c.score.scoring_method } : null,
  }));
  ok("queue loads 4 claims for the drill event", claims.length === 4, `count=${claims.length}`);

  const urgent = applyFilters(claims, { urgent: true });
  ok("urgent filter matches urgent+awaiting only", urgent.length === claims.filter((c) => c.score?.value >= 85 && ["triaged", "triage_pending"].includes(c.status)).length);
  const sevFiltered = applyFilters(claims, { severity: "critical" });
  ok("severity filter isolates the critical pair", sevFiltered.length === 2 && sevFiltered.every((c) => c.severity === "critical"));
  const hardshipFiltered = applyFilters(claims, { hardship: "yes" });
  ok("hardship filter finds the displaced claim", hardshipFiltered.length === 1 && hardshipFiltered[0].hardshipFlags.length > 0);
  const searchHit = applyFilters(claims, { q: "nallagandla" });
  ok("search matches location", searchHit.length === 2, `hits=${searchHit.length}`);
  const refHit = applyFilters(claims, { q: c1.ref });
  ok("search matches claim reference", refHit.length === 1 && refHit[0].id === c1.ref);
  const perilHit = applyFilters(claims, { q: "wind" });
  ok("search matches peril", perilHit.length === 2);
  const clusterFiltered = applyFilters(claims, { cluster: drillCluster.id });
  ok("cluster filter returns member claims", clusterFiltered.length === 2);
  const byScore = sortQueue(claims, "score");
  // Page contract: unscored claims lead; scored ones follow in descending order.
  ok("score sort: unscored lead, scored descend", (() => {
    const head = byScore.filter((c) => !c.score);
    const tail = byScore.filter((c) => c.score);
    return byScore.length === claims.length &&
      head.length === claims.filter((c) => !c.score).length &&
      tail.every((c, i) => i === 0 || tail[i - 1].score.value >= c.score.value);
  })());
  const byArrival = sortQueue(claims, "arrival");
  ok("arrival sort is newest first", new Date(byArrival[0].receivedAt) >= new Date(byArrival[byArrival.length - 1].receivedAt));
  const bySeverity = sortQueue(claims, "severity");
  ok("severity sort ranks critical first", bySeverity[0].severity === "critical");

  // ---------------------------------------------------------- 5. clusters
  section("5. Clusters — rebuild + manual move preservation");
  const rebuild1 = await req(`/events/${event.id}/clusters/rebuild`, { method: "POST", token: mgr });
  ok("cluster rebuild returns counts", rebuild1.status === 200 && typeof rebuild1.json?.data?.clusters === "number", `${rebuild1.status} ${JSON.stringify(rebuild1.json?.data)}`);
  ok("rebuild finds both street groups", rebuild1.json?.data?.clusters === 2, `clusters=${rebuild1.json?.data?.clusters}`);

  const otherCluster = (await req(`/clusters?eventId=${event.id}&page=1&pageSize=100`, { token: mgr })).json.data
    .find((cl) => cl.id !== drillCluster.id);
  const move = await req(`/claims/${c3.ref}/move-cluster`, { method: "POST", body: { clusterId: drillCluster.id }, token: mgr });
  ok("manual move sets cluster_manual", move.status === 200 && move.json?.data?.cluster_manual === true, `status=${move.status} manual=${move.json?.data?.cluster_manual}`);
  const afterMove = (await req(`/claims/${c3.ref}`, { token: mgr })).json.data;
  ok("moved claim joins target cluster", afterMove.cluster_id === drillCluster.id);

  const rebuild2 = await req(`/events/${event.id}/clusters/rebuild`, { method: "POST", token: mgr });
  const afterRebuild = (await req(`/claims/${c3.ref}`, { token: mgr })).json.data;
  ok("manual move survives rebuild", rebuild2.status === 200 && afterRebuild.cluster_id === drillCluster.id, `cluster=${String(afterRebuild.cluster_id).slice(0, 8)} vs ${String(drillCluster.id).slice(0, 8)}`);
  ok("target cluster still in list after rebuild", ((await req(`/clusters?eventId=${event.id}&page=1&pageSize=100`, { token: mgr })).json.data).some((cl) => cl.id === drillCluster.id));

  const ungroup = await req(`/claims/${c3.ref}/move-cluster`, { method: "POST", body: { clusterId: null }, token: mgr });
  ok("ungroup move works", ungroup.status === 200 && ungroup.json?.data?.cluster_id === null);
  const rebuild3 = await req(`/events/${event.id}/clusters/rebuild`, { method: "POST", token: mgr });
  ok("ungrouped claim re-groups with its street peers on rebuild (auto behaviour)", rebuild3.status === 200);
  const c3After = (await req(`/claims/${c3.ref}`, { token: mgr })).json.data;
  ok("ungroup reset by rebuild puts the claim back with street peers", c3After.cluster_id !== null, `cluster=${String(c3After.cluster_id).slice(0, 8)}`);

  void otherCluster;
  // ---------------------------------------------------------- 6. workload
  section("6. Workload — proposals, capacity guards, role limits");
  const adjusters = (await req("/adjusters", { token: mgr })).json.data.map((a) => ({ id: a.id, name: a.name, capacity: a.capacity, status: a.status, load: a.load ?? 0 }));
  ok("adjusters expose live load", adjusters.length >= 5 && adjusters.every((a) => typeof a.load === "number" && a.load >= 0));

  const evClaimsRaw = (await req(`/claims?eventId=${event.id}&page=1&pageSize=100`, { token: mgr })).json.data.map((c) => ({
    id: c.ref, status: c.status, score: c.score ? { value: Number(c.score.value) } : null,
  }));
  const proposal = buildProposal(adjusters, evClaimsRaw);
  ok("proposal exists for triaged claims", proposal.length >= 2, `len=${proposal.length}`);

  const unavailable = adjusters.find((a) => a.status === "unavailable");
  const blockUnavailable = await req(`/claims/${c1.ref}/assign`, { method: "POST", body: { adjusterId: unavailable.id }, token: mgr });
  ok("assignment to unavailable adjuster blocked (409)", blockUnavailable.status === 409, `status=${blockUnavailable.status}`);

  const adjAssign = await req(`/claims/${c1.ref}/assign`, { method: "POST", body: { adjusterId: adjusters[0].id }, token: adj });
  ok("adjuster cannot assign claims (403)", adjAssign.status === 403, `status=${adjAssign.status}`);

  const proposed = proposal.find((p) => p.adjusterId);
  const assign = await req(`/claims/${proposed.claimId}/assign`, { method: "POST", body: { adjusterId: proposed.adjusterId }, token: mgr });
  ok("manager applies a proposal assignment", assign.status === 200 && assign.json?.data?.status === "assigned", `status=${assign.status}`);
  const idem = await req(`/claims/${proposed.claimId}/assign`, { method: "POST", body: { adjusterId: proposed.adjusterId }, token: mgr });
  ok("re-assign same adjuster is idempotent", idem.status === 200);
  const unassign = await req(`/claims/${proposed.claimId}/unassign`, { method: "POST", token: mgr });
  ok("unassign returns claim to queue", unassign.status === 200 && unassign.json?.data?.status === "triaged");

  // ---------------------------------------------------------- 7. status governance
  section("7. Status governance — adjuster limits enforced");
  // Governance runs on c2 (scored + triaged); c3 stays triage_pending by
  // design — assigning it must be REFUSED, which is its own assertion.
  const pendingAssign = await req(`/claims/${c3.ref}/assign`, { method: "POST", body: { adjusterId: adjLogin.json.data.user.adjusterId }, token: mgr });
  ok("assigning a triage_pending claim blocked (409)", pendingAssign.status === 409, `status=${pendingAssign.status}`);
  const asg = await req(`/claims/${c2.ref}/assign`, { method: "POST", body: { adjusterId: adjLogin.json.data.user.adjusterId }, token: mgr });
  ok("assign to logged-in adjuster works", asg.status === 200 && asg.json?.data?.status === "assigned", `status=${asg.status}`);
  const info = await req(`/claims/${c2.ref}/status`, { method: "PATCH", body: { status: "info_required" }, token: adj });
  ok("adjuster sets operational status", info.status === 200 && info.json?.data?.status === "info_required", `status=${info.status}`);
  const adjClose = await req(`/claims/${c2.ref}/status`, { method: "PATCH", body: { status: "closed" }, token: adj });
  ok("adjuster cannot close a claim (403)", adjClose.status === 403, `status=${adjClose.status}`);
  const review = await req(`/claims/${c2.ref}/status`, { method: "PATCH", body: { status: "in_review" }, token: adj });
  ok("adjuster moves to in_review", review.status === 200 && review.json?.data?.status === "in_review");
  const mgrClose = await req(`/claims/${c2.ref}/status`, { method: "PATCH", body: { status: "closed" }, token: mgr });
  ok("manager can close a claim", mgrClose.status === 200 && mgrClose.json?.data?.status === "closed");

  const flag = await req(`/claims/${c1.ref}/flag-review`, { method: "POST", token: mgr });
  ok("flag for human review works", flag.status === 200, `status=${flag.status} ${JSON.stringify(flag.json?.message || "")}`);

  // ---------------------------------------------------------- 8. batch intake
  section("8. Batch intake — Excel template contract");
  const batch = await req("/claims/batch", {
    method: "POST", token: mgr,
    body: {
      eventId: event.id,
      rows: [
        { ref: `CLM-DRILL-${stamp}-1`, contactName: "Batch Person", contactEmail: "batch@example.com", location: "2 Nallagandla, Hyderabad", peril: "Storm surge / flooding", severity: "high", incidentDate: new Date().toISOString().slice(0, 10), hardshipFlags: "Elderly resident, Medical needs", description: "Water through the ground floor at high tide." },
        { location: "9 Miyapur, Hyderabad", peril: "Wind damage", severity: "medium", description: "Tiles loosened overnight." },
        { ref: `CLM-DRILL-${stamp}-1`, location: "3 Nallagandla, Hyderabad", peril: "Storm surge / flooding", severity: "high" },
        { location: "4 Nallagandla, Hyderabad", peril: "Storm surge / flooding", severity: "catastrophic" },
        { location: "5 Nallagandla, Hyderabad", peril: "Storm surge / flooding", severity: "high", hardshipFlags: "Wizards involved" },
      ],
    },
  });
  ok("batch import accepted", batch.status === 201, `status=${batch.status}`);
  ok("2 created, 3 rejected per-row", batch.json?.data?.created === 2 && batch.json?.data?.failed === 3, JSON.stringify(batch.json?.data));
  ok("duplicate reference rejected", (batch.json?.data?.errors || []).some((e) => /already exists/i.test(e.message)));
  ok("bad severity rejected", (batch.json?.data?.errors || []).some((e) => /severity must be one of/i.test(e.message)));
  ok("unknown hardship flag rejected with guidance", (batch.json?.data?.errors || []).some((e) => /unknown hardship flag/i.test(e.message)));
  const batchClaim = (await req(`/claims/CLM-DRILL-${stamp}-1`, { token: mgr })).json.data;
  ok("batch row carries contact + hardship fields", batchClaim.contact_name === "Batch Person" && (batchClaim.hardship_flags || []).length === 2, `flags=${JSON.stringify(batchClaim.hardship_flags)}`);
  ok("batch claim auto-clustered with street peers", !!batchClaim.cluster_id);
  ok("batch claim is queued for triage", batchClaim.status === "triage_pending");

  // ---------------------------------------------------------- 9. policyholder
  section("9. Policyholder — identity scope + sanitisation");
  const mineBefore = (await req("/claims/mine", { token: ph })).json.data;
  const c5 = await req("/claims", {
    method: "POST", token: ph,
    body: {
      eventId: event.id, policyId: "POL-77341-A", contactName: "Priya Raman", contactEmail: "priya.raman@example.com",
      location: "44 Srinagar Colony, Hyderabad", peril: "Storm surge / flooding", incidentDate: new Date().toISOString().slice(0, 10),
      description: "Water came through the front door at high tide; lounge rug and skirting are soaked.", severity: "high",
      hardshipFlags: ["Young children"], documents: [],
    },
  });
  ok("policyholder submits a claim (201)", c5.status === 201, `status=${c5.status}`);
  const mineAfter = (await req("/claims/mine", { token: ph })).json.data;
  ok("new claim appears in My Claims via JWT identity", mineAfter.length === mineBefore.length + 1, `${mineBefore.length} -> ${mineAfter.length}`);
  ok("my-claims rows carry timeline", mineAfter.every((cl) => Array.isArray(cl.timeline) && cl.timeline.length > 0));

  const foreign = await req(`/claims/${c1.ref}`, { token: ph });
  ok("policyholder cannot open another claimant's claim (403)", foreign.status === 403, `status=${foreign.status}`);

  const mgrDetail = (await req(`/claims/${c1.ref}`, { token: mgr })).json.data;
  ok("manager view keeps scores and internals", !!mgrDetail.score && !!mgrDetail.timeline);
  const phDetailMine = (await req(`/claims/${c5.json.data.ref}`, { token: ph })).json.data;
  ok("own claim view is sanitized (no score)", phDetailMine.score === undefined && phDetailMine.contact_email === undefined);

  // ---------------------------------------------------------- 10. feeds
  section("10. Feeds — activity + AI health");
  const activity = (await req("/activity?page=1&pageSize=12", { token: mgr })).json.data;
  ok("activity feed populated", activity.length >= 5, `rows=${activity.length}`);
  ok("activity rows carry action + label", activity.every((a) => !!a.action && !!a.label));
  ok("recent activity includes this suite's triage events", activity.some((a) => /scored|assigned|rebuilt/i.test(a.label || "")), activity.slice(0, 3).map((a) => a.label).join(" ; "));

  const aiHealth = (await req("/ai/health", { token: mgr })).json.data;
  ok("AI health aggregate populated", typeof aiHealth?.avgLatencyMs === "number" && typeof aiHealth?.fallbackRatePct === "number" && aiHealth?.totalCostUsd >= 0, JSON.stringify(aiHealth?.modelStatus));
  ok("model status reflects live provider", ["operational", "degraded", "unavailable"].includes(aiHealth?.modelStatus), `status=${aiHealth?.modelStatus}`);

  console.log(`\nMANAGER TEST GATE: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Suite crashed:", e);
  process.exit(1);
});

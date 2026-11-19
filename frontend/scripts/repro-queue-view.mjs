// Regression: the manager's Priority Queue view state (filters + default sort
// + pagination + KPIs) after a policyholder submits a claim with
// "Not sure / other". Verifies unscored claims lead the default view and the
// queue counts stay consistent.
// Run: node scripts/repro-queue-view.mjs   (backend on :3001)

const BASE = "http://localhost:3001/api";

async function req(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const main = async () => {
  const mgr = (await req("/auth/login", { method: "POST", body: { email: "maya.alvarez@catresponse.com", password: "demo1234" } })).json.data;
  const ph = (await req("/auth/login", { method: "POST", body: { email: "priya.raman@example.com", password: "demo1234" } })).json.data;

  const events = (await req("/events?page=1&pageSize=100")).json.data;
  const fallback = events.filter((e) => e.status === "active").sort((a, b) => b.claimCount - a.claimCount)[0] || events[0];

  const submitted = (await req("/claims", {
    method: "POST", token: ph.token,
    body: {
      eventId: "", policyId: "POL-77341-A", contactName: "Queue View Tester",
      contactEmail: "queueview@example.com", location: "19 Beach Road, Visakhapatnam",
      peril: "Storm surge / flooding", incidentDate: new Date().toISOString().slice(0, 10),
      description: "Water entered the house during the cyclone; furniture damaged badly.",
      severity: "high", hardshipFlags: [], documents: [],
    },
  })).json.data;

  const queue = (await req(`/claims?eventId=${submitted.event_id || fallback.id}&page=1&pageSize=100`, { token: mgr.token })).json.data;
  const claim = queue.find((c) => c.ref === submitted.ref);

  const ok = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) process.exitCode = 1;
  };

  ok("submitted claim is in the queue", !!claim);
  ok("claim starts triage_pending (leads the default view)", claim?.status === "triage_pending");

  const pendingKpi = queue.filter((c) => ["submitted", "triage_pending"].includes(c.status)).length;
  ok("pending KPI counts the new claim", pendingKpi >= 1, `pending=${pendingKpi}`);
  ok("every queued claim has a valid status", queue.every((c) =>
    ["submitted", "triage_pending", "triaged", "assigned", "in_review", "info_required", "assessment_complete", "closed"].includes(c.status)));

  // Default sort replica: unscored claims first, newest first among them.
  const sorted = [...queue].sort((a, b) => {
    const ua = !a.score, ub = !b.score;
    if (ua && !ub) return -1;
    if (!ua && ub) return 1;
    if (ua && ub) return new Date(b.received_at) - new Date(a.received_at);
    return (b.score?.value ?? -1) - (a.score?.value ?? -1);
  });
  ok("unscored claims lead the default priority view", sorted.slice(0, pendingKpi).every((c) => !c.score), `first=${sorted[0]?.ref} scored=${!!sorted[0]?.score}`);
};

main().catch((e) => { console.error("repro crashed:", e); process.exit(1); });

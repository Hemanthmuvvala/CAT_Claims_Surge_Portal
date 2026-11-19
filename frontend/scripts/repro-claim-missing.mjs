// Regression: a policyholder submits with "Not sure / other" (no eventId) —
// the claim must bind to the fallback active event and appear in the manager
// queue for that event.
// Run: node scripts/repro-claim-missing.mjs   (backend on :3001)

const BASE = "http://localhost:3001/api";

async function req(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const login = async (email) =>
  (await req("/auth/login", { method: "POST", body: { email, password: "demo1234" } })).json.data;

const main = async () => {
  const ph = await login("priya.raman@example.com");
  const mgr = await login("maya.alvarez@catresponse.com");

  const events = (await req("/events?page=1&pageSize=100")).json.data;
  const before = new Map(events.map((e) => [e.id, e.claimCount]));
  const fallback =
    events
      .filter((e) => e.status === "active")
      .sort((a, b) => b.claimCount - a.claimCount || new Date(b.declared_at) - new Date(a.declared_at))[0] || events[0];
  console.log(`Fallback event: ${fallback.name} (${fallback.status}, ${fallback.claimCount} claims)`);

  const createRes = await req("/claims", {
    method: "POST", token: ph.token,
    body: {
      eventId: "", // intentionally empty — the UI's "Not sure / other"
      policyId: "POL-77341-A", contactName: "Priya Raman", contactEmail: "priya.raman@example.com",
      location: "31 Falaknuma, Hyderabad", peril: "Storm surge / flooding",
      incidentDate: new Date().toISOString().slice(0, 10),
      description: "The tide came over the sea wall and soaked the hallway carpet tonight.",
      severity: "high", hardshipFlags: ["Displaced from home"], documents: [],
    },
  });
  if (createRes.status !== 201) {
    console.error("POST /claims failed:", createRes.status, JSON.stringify(createRes.json));
    process.exit(1);
  }
  const created = createRes.json.data;
  console.log("Created:", created.ref);

  const bound = (await req(`/claims/${created.ref}`)).json.data;
  const claimCount = (await req(`/events/${bound.event_id}`)).json.data.claimCount;
  const queue = (await req(`/claims?eventId=${bound.event_id}&page=1&pageSize=100`, { token: mgr.token })).json.data;
  const inQueue = queue.some((c) => c.ref === created.ref);

  const ok = (name, cond) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
    if (!cond) process.exitCode = 1;
  };
  ok("claim did NOT keep the empty eventId", !!bound.event_id);
  ok("claim bound to the fallback active event", bound.event_id === fallback.id, `${bound.event_id}`);
  ok("event claim count incremented", claimCount === (before.get(fallback.id) ?? 0) + 1, `${claimCount}`);
  ok("claim IS in the manager queue for that event", inQueue, `queue=${queue.length}`);
};

main().catch((e) => { console.error("repro crashed:", e); process.exit(1); });

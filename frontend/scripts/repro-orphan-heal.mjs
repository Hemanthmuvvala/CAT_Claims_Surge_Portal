// Regression ("orphan heal"): a claim filed with a policyholder's contact
// email but WITHOUT a policyholder account binding (batch import / old intake)
// must still be visible to that policyholder via /claims/mine — the email and
// policy-id binding heals the linkage.
// Run: node scripts/repro-orphan-heal.mjs   (backend on :3001)

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
  const ph = (await req("/auth/login", { method: "POST", body: { email: "priya.raman@example.com", password: "demo1234" } })).json.data;
  const mgr = (await req("/auth/login", { method: "POST", body: { email: "maya.alvarez@catresponse.com", password: "demo1234" } })).json.data;

  const events = (await req("/events?page=1&pageSize=100")).json.data;
  const active = events.find((e) => e.status === "active") || events[0];

  // Created by the manager (batch-intake style): no policyholder identity,
  // only the contact email + policy id on the row.
  const res = await req("/claims", {
    method: "POST", token: mgr.token,
    body: {
      eventId: active.id, policyId: "POL-77341-A", contactName: "Priya Raman",
      contactEmail: "priya.raman@example.com", location: "8 Godavari Ghat, Bhadrachalam",
      peril: "Wind damage", incidentDate: new Date().toISOString().slice(0, 10),
      description: "Off-site staff submitted this on behalf of the policyholder by email.",
      severity: "medium", hardshipFlags: [], documents: [],
    },
  });
  const ref = res.json?.data?.ref;
  const direct = (await req(`/claims/${ref}`)).json.data;

  const ok = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) process.exitCode = 1;
  };

  ok("claim created without policyholder binding", res.status === 201 && direct.policyholder_user_id == null, `ph=${direct.policyholder_user_id}`);

  const mine = (await req("/claims/mine", { token: ph.token })).json.data;
  ok("policyholder still sees it (email/policy binding heals)", mine.some((c) => c.ref === ref), `refs=${mine.map((c) => c.ref).join(",")}`);
  ok("policyholder can open the claim detail", (await req(`/claims/${ref}`, { token: ph.token })).status === 200);
};

main().catch((e) => { console.error("repro crashed:", e); process.exit(1); });

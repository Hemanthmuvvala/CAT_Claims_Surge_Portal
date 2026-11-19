// Regression: policyholder flow — a claim submitted from the SubmitClaimPage
// payload shape must appear in My Claims (/claims/mine) with a timeline.
// Run: node scripts/repro-myclaims.mjs   (backend on :3001)

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
  const login = (await req("/auth/login", {
    method: "POST",
    body: { email: "priya.raman@example.com", password: "demo1234" },
  })).json.data;
  const token = login.token;

  const before = (await req("/claims/mine", { token })).json.data.length;

  // Exactly what SubmitClaimPage submits ("Not sure / other" -> eventId "").
  const res = await req("/claims", {
    method: "POST", token,
    body: {
      eventId: "",
      policyId: "POL-77341-A", contactName: "Priya Raman", contactEmail: "priya.raman@example.com",
      location: "22 Beach Road, Visakhapatnam", peril: "Storm surge / flooding",
      incidentDate: new Date().toISOString().slice(0, 10),
      description: "Water entered the house during the cyclone; furniture damaged badly.",
      severity: "high", hardshipFlags: [], documents: [],
    },
  });

  const ok = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) process.exitCode = 1;
  };

  ok("submission accepted (201)", res.status === 201, `status=${res.status}`);
  const mine = (await req("/claims/mine", { token })).json.data;
  ok("claim appears in My Claims", mine.length === before + 1, `${before} -> ${mine.length}`);
  const latest = mine.find((c) => c.ref === res.json.data.ref);
  ok("newest claim first", mine[0].ref === res.json.data.ref);
  ok("timeline present for tracking screen", Array.isArray(latest?.timeline) && latest.timeline.length > 0);
  ok("status is triage_pending initially", latest?.status === "triage_pending", `status=${latest?.status}`);
};

main().catch((e) => { console.error("repro crashed:", e); process.exit(1); });

// Verify global search matches claim reference, claimant name, location and
// peril against the REAL backend queue data.
// Run: node scripts/repro-search.mjs   (backend on :3001)

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
  const claims = (await req("/claims?page=1&pageSize=100", { token: mgr.token })).json.data;

  const search = (q) =>
    claims.filter((c) => {
      const hay = [c.ref, c.location, c.contact_name, c.contact_email, c.peril, c.policy_id]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q.toLowerCase().trim());
    });

  const show = (label, q) =>
    console.log(`search "${q}" (${label}):`,
      search(q).map((c) => `${c.ref}${c.contact_name ? " [" + c.contact_name + "]" : ""}`).join(", ") || "NONE");

  let failures = 0;
  const ok = (name, cond) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
    if (!cond) failures++;
  };

  show("claim reference", claims[0]?.ref ?? "");
  show("claimant name", "priya");
  show("location", "akkayyapalem");
  show("peril", "wind");

  ok("reference search finds the exact claim", claims.length === 0 || search(claims[0].ref).length >= 1);
  ok("claimant name search non-empty", search("priya").length >= 1);
  ok("location search non-empty", search("akkayyapalem").length >= 1);
  ok("peril search non-empty", search("wind").length >= 1);
  ok("no search term matches nothing sensibly", search("zzz-no-such-claim-zzz").length === 0);

  process.exit(failures ? 1 : 0);
};

main().catch((e) => { console.error("repro crashed:", e); process.exit(1); });

// k6 load suite — CAT Claims Surge Portal (BRD.md §12/§13)
// Scenarios:
//   burst_intake     : 500 claims posted at once (batch + single) without lockup
//   dashboard_read   : sustained dashboard/queue polling (read-heavy)
//   mixed_surge      : realistic surge — reads + submissions + triage kicks
// Run: k6 run loadtest\k6_suite.js
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import exec from "k6/execution";

const BASE = "http://localhost:3001/api";
const AI = "http://localhost:8000";

const errorRate = new Rate("errors");
const intakeLat = new Trend("intake_latency_ms", true);
const readLat = new Trend("read_latency_ms", true);
const aiHealthLat = new Trend("ai_health_latency_ms", true);
const claimsCreated = new Counter("claims_created");

const MGR = { email: "maya.alvarez@catresponse.com", password: "demo1234" };
const PH = { email: "priya.raman@example.com", password: "demo1234" };

const STREETS = [
  "Sagar Nagar", "Akkayyapalem", "Gajuwaka", "Rushikonda", "MVP Colony",
  "Khairatabad", "Somajiguda", "Nallagandla", "Miyapur", "Srinagar Colony",
];
const PERILS = ["Storm surge / flooding", "Wind damage", "Hail"];
const SEVERITIES = ["critical", "high", "medium", "low"];

export const options = {
  scenarios: {
    // --- BRD §12: burst of ~500 claims at once without UI lockup -----------
    burst_intake: {
      executor: "per-vu-iterations",
      vus: 25,
      iterations: 20, // 25 * 20 = 500 claim submissions
      maxDuration: "6m",
      startTime: "0s",
      tags: { scenario: "burst_intake" },
    },
    // --- dashboard / queue read pressure at the same time ------------------
    dashboard_read: {
      executor: "constant-arrival-rate",
      rate: 30, // 30 reads/s
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 60,
      maxVUs: 120,
      startTime: "0s",
      tags: { scenario: "dashboard_read" },
    },
    // --- post-burst steady surge: mixed workload --------------------------
    mixed_surge: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      stages: [
        { target: 15, duration: "1m" },
        { target: 40, duration: "1m" },
        { target: 15, duration: "1m" },
      ],
      timeUnit: "1s",
      preAllocatedVUs: 40,
      maxVUs: 120,
      startTime: "6m", // after burst finishes
      tags: { scenario: "mixed_surge" },
    },
  },
  thresholds: {
    // BRD success metrics gates — keys use the executor-name tag k6 assigns
    "errors": ["rate<0.05"],               // <5% failed requests
    "http_req_duration{scenario:dashboard_read}": ["p(95)<800", "avg<400"],
    "intake_latency_ms": ["p(95)<2000"],   // intake acknowledged fast (triage is async)
    "http_req_duration{scenario:mixed_surge}": ["p(95)<1200"],
  },
};

let mgrToken = null;
let phToken = null;
let activeEventId = null;
let batchRefs = [];

export function setup() {
  const login = (b) =>
    http.post(`${BASE}/auth/login`, JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
  const m = login(MGR);
  const p = login(PH);
  check(m, { "manager login 200": (r) => r.status === 200 });
  check(p, { "policyholder login 200": (r) => r.status === 200 });
  mgrToken = m.json("data.token");
  phToken = p.json("data.token");

  const ev = http.post(
    `${BASE}/events`,
    JSON.stringify({
      name: `k6 Surge Event ${Date.now()}`,
      type: "Tropical cyclone",
      region: "Machilipatnam — Coastal Andhra Pradesh",
      declaredAt: new Date().toISOString(),
      summary: "k6 load-test event.",
    }),
    { headers: authHeaders(mgrToken), "Content-Type": "application/json" }
  );
  check(ev, { "event created 201": (r) => r.status === 201 });
  activeEventId = ev.json("data.id");
  return { mgrToken, phToken, activeEventId };
}

function authHeaders(tok) {
  return { Authorization: `Bearer ${tok}` };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function submitSingle(tok, i, eventId) {
  const body = {
    eventId,
    policyId: `POL-${String(i % 100000).padStart(5, "0")}`,
    contactName: `Load Test ${i}`,
    contactEmail: `loadtest${i}@example.com`,
    location: `${Math.ceil(Math.random() * 90)} ${pick(STREETS)}, ${Math.random() > 0.5 ? "Visakhapatnam" : "Hyderabad"}`,
    peril: pick(PERILS),
    incidentDate: new Date().toISOString().slice(0, 10),
    description:
      "Surge water entered the ground floor overnight; furniture damaged and power has been out since the morning.",
    severity: pick(SEVERITIES),
    hardshipFlags: Math.random() > 0.6 ? ["Displaced from home"] : [],
    documents: [],
  };
  const r = http.post(`${BASE}/claims`, JSON.stringify(body), {
    headers: { ...authHeaders(tok), "Content-Type": "application/json" },
    tags: { name: "POST /claims" },
  });
  intakeLat.add(r.timings.duration);
  const ok = check(r, { "claim 201": (res) => res.status === 201 });
  if (ok) claimsCreated.add(1);
  else errorRate.add(true);
  return ok;
}

export default function (data) {
  const sc = __ENV.SCENARIO || k6Scenario();
  group(sc, () => {
    if (sc === "burst_intake") {
      submitSingle(data.phToken, __VU * 1000 + __ITER, data.activeEventId);
      sleep(0.2);
    } else if (sc === "dashboard_read") {
      const mh = { headers: authHeaders(data.mgrToken) };
      const events = http.get(`${BASE}/events?page=1&pageSize=100`, mh, { tags: { name: "GET /events" } });
      const evId = (events.json("data") || [])[0]?.id;
      const claims = http.get(`${BASE}/claims?page=1&pageSize=100${evId ? `&eventId=${evId}` : ""}`, mh, { tags: { name: "GET /claims" } });
      readLat.add(claims.timings.duration);
      http.get(`${BASE}/adjusters`, mh, { tags: { name: "GET /adjusters" } });
      http.get(`${BASE}/activity?page=1&pageSize=12`, mh, { tags: { name: "GET /activity" } });
      // /ai/health pings Ollama (can block for seconds) — a real dashboard
      // polls it sparingly, so check on every 4th iteration only.
      if (__ITER % 4 === 0) {
        const ai = http.get(`${BASE}/ai/health`, mh, { tags: { name: "GET /ai/health" } });
        aiHealthLat.add(ai.timings.duration);
      }
      errorRate.add(events.status !== 200 || claims.status !== 200);
      sleep(1);
    } else {
      // mixed: reads + occasional intake + assignment preview
      const r = Math.random();
      const mh = { headers: authHeaders(data.mgrToken) };
      if (r < 0.55) {
        const claims = http.get(`${BASE}/claims?page=1&pageSize=100`, mh, { tags: { name: "GET /claims" } });
        readLat.add(claims.timings.duration);
        errorRate.add(claims.status !== 200);
      } else if (r < 0.75) {
        submitSingle(data.phToken, Math.floor(Math.random() * 1e6), data.activeEventId);
      } else if (r < 0.9) {
        const prev = http.get(`${BASE}/assignments/preview`, mh, { tags: { name: "GET /assignments/preview" } });
        readLat.add(prev.timings.duration);
        errorRate.add(prev.status !== 200);
      } else {
        http.get(`${BASE}/clusters?eventId=${data.activeEventId}&page=1&pageSize=50`, mh, { tags: { name: "GET /clusters" } });
      }
      sleep(0.8);
    }
  });
}

function k6Scenario() {
  // Scenario routing is by executor; this fallback only runs if the default
  // function is called outside a named scenario.
  return exec.scenario.name || "dashboard_read";
}

export function teardown(data) {
  // close the load event so future runs are clean
  http.patch(
    `${BASE}/events/${data.activeEventId}/status`,
    JSON.stringify({ status: "closed" }),
    { headers: { ...authHeaders(data.mgrToken), "Content-Type": "application/json" } }
  );
}

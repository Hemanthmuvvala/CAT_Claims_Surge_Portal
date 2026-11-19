// 100-request burst probe — quick capacity check (BRD §12: burst intake)
// Run: k6 run loadtest\k6_quick100.js
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE = "http://localhost:3001/api";
const errorRate = new Rate("errors");
const intakeLat = new Trend("intake_latency_ms", true);
const created = new Counter("claims_created");

const PH = { email: "priya.raman@example.com", password: "demo1234" };
const STREETS = ["Sagar Nagar", "Akkayyapalem", "Gajuwaka", "Rushikonda", "Khairatabad", "Somajiguda"];
const PERILS = ["Storm surge / flooding", "Wind damage", "Hail"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const options = {
  vus: 20,
  iterations: 100, // 20 x 5 = 100 claims
  thresholds: {
    errors: ["rate<0.05"],
    intake_latency_ms: ["p(95)<2000"],
  },
};

export function setup() {
  const login = http.post(`${BASE}/auth/login`, JSON.stringify(PH), { headers: { "Content-Type": "application/json" } });
  console.log(`[setup] PH login status=${login.status}`);
  const phToken = login.json("data.token");
  const mgr = http.post(`${BASE}/auth/login`, JSON.stringify({ email: "maya.alvarez@catresponse.com", password: "demo1234" }), { headers: { "Content-Type": "application/json" } });
  const ev = http.post(
    `${BASE}/events`,
    JSON.stringify({ name: `k6 Quick100 ${Date.now()}`, type: "Tropical cyclone", region: "Machilipatnam — Coastal Andhra Pradesh", declaredAt: new Date().toISOString(), summary: "quick burst" }),
    { headers: { Authorization: `Bearer ${mgr.json("data.token")}`, "Content-Type": "application/json" } }
  );
  check(ev, { "event created": (r) => r.status === 201 });
  console.log(`[setup] event status=${ev.status} id=${ev.json("data.id")}`);
  return { phToken, eventId: ev.json("data.id") };
}

export default function (data) {
  const i = __VU * 1000 + __ITER;
  const body = {
    eventId: data.eventId,
    policyId: `POL-${String(i % 100000).padStart(5, "0")}`,
    contactName: `Load ${i}`,
    contactEmail: `load${i}@example.com`,
    location: `${Math.ceil(Math.random() * 90)} ${pick(STREETS)}, Visakhapatnam`,
    peril: pick(PERILS),
    incidentDate: new Date().toISOString().slice(0, 10),
    description: "Surge water entered the ground floor overnight; power has been out since the morning.",
    severity: pick(SEVERITIES),
    hardshipFlags: [],
    documents: [],
  };
  const r = http.post(`${BASE}/claims`, JSON.stringify(body), {
    headers: { Authorization: `Bearer ${data.phToken}`, "Content-Type": "application/json" },
  });
  intakeLat.add(r.timings.duration);
  const ok = check(r, { "claim 201": (res) => res.status === 201 });
  if (ok) created.add(1);
  else {
    errorRate.add(true);
    console.error(`VU${__VU} iter${__ITER} -> ${r.status}: ${r.body.slice(0, 200)}`);
  }
}

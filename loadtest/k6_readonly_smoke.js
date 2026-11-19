import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3001/api";
const errors = new Rate("api_errors");
const readLatency = new Trend("read_latency_ms", true);

export const options = {
  vus: 5,
  iterations: 10,
  thresholds: {
    api_errors: ["rate<0.01"],
    read_latency_ms: ["p(95)<2000"],
  },
};

export function setup() {
  const response = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: "maya.alvarez@catresponse.com", password: "demo1234" }),
    { headers: { "Content-Type": "application/json" } }
  );
  const ok = check(response, { "manager login succeeds": (r) => r.status === 200 });
  if (!ok) throw new Error(`Manager login failed with HTTP ${response.status}`);
  return { token: response.json("data.token") };
}

export default function ({ token }) {
  const params = { headers: { Authorization: `Bearer ${token}` } };
  const claims = http.get(`${BASE}/claims?page=1&pageSize=20`, params);
  const claimsOk = check(claims, {
    "claims endpoint returns 200": (r) => r.status === 200,
    "claims response includes data": (r) => Array.isArray(r.json("data")),
  });
  readLatency.add(claims.timings.duration);
  errors.add(!claimsOk);

  const adjusters = http.get(`${BASE}/adjusters`, params);
  const adjustersOk = check(adjusters, {
    "adjusters endpoint returns 200": (r) => r.status === 200,
    "adjusters response includes data": (r) => Array.isArray(r.json("data")),
  });
  readLatency.add(adjusters.timings.duration);
  errors.add(!adjustersOk);
  sleep(0.1);
}

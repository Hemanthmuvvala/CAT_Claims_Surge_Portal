const d = require("./k6_results.json");
const m = d.metrics;
const lines = [];
for (const k of Object.keys(m).sort()) {
  const v = m[k];
  if (v.type === "trend") {
    lines.push(`${k}: avg=${Math.round(v.avg)}ms p95=${Math.round(v["p(95)"])}ms max=${Math.round(v.max)}ms`);
  } else if (v.type === "rate") {
    lines.push(`${k}: ${(v.value * 100).toFixed(2)}%`);
  } else if (v.type === "counter") {
    lines.push(`${k}: ${v.value}`);
  }
}
console.log(lines.join("\n"));

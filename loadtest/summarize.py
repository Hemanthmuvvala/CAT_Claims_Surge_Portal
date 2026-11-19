import json

with open("loadtest/k6_results.json", encoding="utf-8") as f:
    d = json.load(f)
m = d["metrics"]

def fmt_trend(v):
    return "avg=%.0fms p90=%.0f p95=%.0f max=%.0f" % (v["avg"], v["p(90)"], v["p(95)"], v["max"])

out = []
for k in sorted(m):
    v = m[k]
    t = v.get("type")
    if t == "trend":
        out.append("%s: %s" % (k, fmt_trend(v)))
    elif t == "rate":
        out.append("%s: %.2f%%" % (k, v["value"] * 100))
    elif t == "counter":
        out.append("%s: %.0f" % (k, v["value"]))

print("\n".join(out))

import { useState } from "react";

// Dependency-free SVG area/line chart with labelled axes and hover tooltip.
export function AreaChart({ data, xKey = "t", series, height = 220 }) {
  const [hover, setHover] = useState(null);
  const W = 560;
  const H = height;
  const padL = 34, padR = 10, padT = 12, padB = 24;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const maxVal = Math.max(...data.flatMap((d) => series.map((s) => d[s.key])), 5);
  const yMax = Math.ceil(maxVal / 5) * 5;
  const x = (i) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => padT + ih - (v / yMax) * ih;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={`Claims received and triaged over time. Peaks around ${data[Math.floor(data.length / 2)]?.[xKey]}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e4eaf0" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} fontSize="10" fill="#5b6573" textAnchor="end">{t}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[s.key])}`).join(" ");
          const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={s.color} fillOpacity={0.12} stroke="none" />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {data.map((d, i) => (
                <circle key={i} cx={x(i)} cy={y(d[s.key])} r={hover === i ? 4 : 2.4} fill={s.color} stroke="#fff" strokeWidth={hover === i ? 2 : 0} />
              ))}
            </g>
          );
        })}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={x(i) - iw / (data.length * 2)} y={padT} width={iw / data.length} height={ih} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            {hover === i && <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + ih} stroke="#5b6573" strokeDasharray="3 3" />}
            <text x={x(i)} y={H - 7} fontSize="10" fill="#5b6573" textAnchor="middle">{d[xKey]}</text>
          </g>
        ))}
      </svg>
      {hover != null && (
        <div style={{
          position: "absolute", left: `min(calc(100% - 150px), ${(x(hover) / W) * 100}%)`, top: 0,
          background: "#17365d", color: "#fff", borderRadius: 8, padding: "7px 10px",
          fontSize: 12, pointerEvents: "none", boxShadow: "0 4px 14px rgba(23,54,93,.25)", zIndex: 5,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>{data[hover][xKey]}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
              {s.label}: <strong>{data[hover][s.key]}</strong>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "#5b6573" }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

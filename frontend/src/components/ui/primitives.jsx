import { Fragment } from "react";
import { Inbox, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

export function Badge({ tone = "neutral", children, dot = true }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function KpiCard({ label, value, meta, tone, clickable, onClick }) {
  return (
    <button type="button" className={`kpi-card${clickable ? " clickable" : ""}`} onClick={onClick} disabled={!clickable}>
      <span className="kpi-label">
        {label}
        {tone && <Badge tone={tone} dot={false}>{tone === "red" ? "Urgent" : tone === "amber" ? "Watch" : "OK"}</Badge>}
      </span>
      <span className="kpi-value">{value}</span>
      {meta && <span className="kpi-meta">{meta}</span>}
    </button>
  );
}

export function ProgressBar({ value, max, warnAt = 0.75, overAt = 1 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const cls = pct >= overAt * 100 ? "over" : pct >= warnAt * 100 ? "warn" : "";
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`progress-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}

export function Banner({ tone = "info", icon: Icon, children }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {Icon && <Icon size={17} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div>{children}</div>
    </div>
  );
}

export function Avatar({ name, className = "" }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return <span className={`avatar ${className}`}>{initials}</span>;
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="state-block">
      <span className="state-icon"><Icon size={22} /></span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div className="state-block">
      <span className="state-icon"><AlertTriangle size={22} /></span>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="state-block">
      <Loader2 size={26} style={{ animation: "spin 1s linear infinite" }} />
      <p style={{ marginTop: 10 }}>{label}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function SkeletonRows({ rows = 6, cols = 6 }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}><div className="skeleton" style={{ width: `${55 + ((r + c) % 4) * 12}%` }} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function StatTile({ label, value, sub }) {
  return (
    <div className="card card-pad" style={{ padding: "13px 16px" }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 24 }}>{value}</div>
      {sub && <div className="kpi-meta">{sub}</div>}
    </div>
  );
}

export function Clamp({ lines = 2, children }) {
  return (
    <span
      style={{
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
      title={typeof children === "string" ? children : undefined}
    >
      {children}
    </span>
  );
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

export { Fragment };

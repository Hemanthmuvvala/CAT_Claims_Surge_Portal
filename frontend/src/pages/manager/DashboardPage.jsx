import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, CloudLightning, AlertTriangle, Clock, Zap, Users,
  Inbox, Timer, CheckCircle2, ChevronRight,
} from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES, SEVERITY_LABELS,
  URGENCY_URGENT_THRESHOLD,
} from "../../constants.js";
import { Badge, KpiCard, Loading, ErrorState, Banner, ProgressBar, fmtRelative, fmtDateTime } from "../../components/ui/primitives.jsx";
import { DeclareEventModal } from "./EventsPage.jsx";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { activeEventId, toast, dataVersion } = useApp();
  const [state, setState] = useState({ status: "loading" });
  const [declareOpen, setDeclareOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [claims, adjusters, activity, aiHealth] = await Promise.all([
        api.getClaims(activeEventId),
        api.getAdjusters(),
        api.getActivity(),
        api.getAIHealth(),
      ]);
      setState({ status: "ready", claims, adjusters, activity, aiHealth });
    } catch {
      setState({ status: "error" });
    }
  }, [activeEventId]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (state.status === "loading") return <Loading label="Loading command centre⬦" />;
  if (state.status === "error") return <ErrorState message="We could not load the dashboard data." onRetry={load} />;

  const { claims, adjusters, activity, aiHealth } = state;
  const total = claims.length;
  const triaged = claims.filter((c) => c.score).length;
  const pending = claims.filter((c) => c.status === CLAIM_STATUS.TRIAGE_PENDING || c.status === CLAIM_STATUS.SUBMITTED).length;
  const urgentAwaiting = claims.filter(
    (c) => c.score?.value >= URGENCY_URGENT_THRESHOLD && (c.status === CLAIM_STATUS.TRIAGED || c.status === CLAIM_STATUS.TRIAGE_PENDING)
  ).length;
  const inProgress = claims.filter((c) => [CLAIM_STATUS.ASSIGNED, CLAIM_STATUS.IN_REVIEW, CLAIM_STATUS.INFO_REQUIRED].includes(c.status)).length;
  const completed = claims.filter((c) => [CLAIM_STATUS.ASSESSMENT_COMPLETE, CLAIM_STATUS.CLOSED].includes(c.status)).length;
  const urgentBeyondTarget = claims.filter(
    (c) => c.score?.value >= URGENCY_URGENT_THRESHOLD && (c.status === CLAIM_STATUS.TRIAGED || c.status === CLAIM_STATUS.TRIAGE_PENDING)
  );
  const unassigned = claims.filter((c) => c.status === CLAIM_STATUS.TRIAGED || c.status === CLAIM_STATUS.TRIAGE_PENDING).length;

  const totalLoad = adjusters.filter((a) => a.status !== "unavailable").reduce((s, a) => s + a.load, 0);
  const totalCapacity = adjusters.filter((a) => a.status !== "unavailable").reduce((s, a) => s + a.capacity, 0);
  const availableAdjusters = adjusters.filter((a) => a.status !== "unavailable" && a.load < a.capacity).length;

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>CAT Command Centre</h1>
          </div>
          <p className="page-desc">Monitor catastrophe intake, triage performance and response capacity.</p>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => navigate("/intake")}>
            <Upload size={15} /> Import Claims
          </button>
          <button className="btn btn-navy" onClick={() => setDeclareOpen(true)}>
            <CloudLightning size={15} /> Declare CAT Event
          </button>
        </div>
      </div>

      {(aiHealth.modelStatus === "degraded" || aiHealth.modelStatus === "unavailable") && (
        <Banner tone={aiHealth.modelStatus === "unavailable" ? "error" : "warn"} icon={AlertTriangle}>
          <strong>{aiHealth.modelStatus === "unavailable" ? "AI service unavailable." : "AI provider degraded."}</strong>{" "}
          {aiHealth.modelStatus === "unavailable"
            ? "New claims cannot be AI-scored until the provider recovers. Triage will queue or fail visibly with retry actions."
            : "Rules-based fallback scoring is active for some claims. Priority scores remain triage support only and require human review."}
        </Banner>
      )}

      <div className="kpi-row">
        <KpiCard label="Total Claims Received" value={total} />
        <KpiCard label="Claims Triaged" value={triaged} />
        <KpiCard label="Pending Claims" value={pending} clickable={false} />
        <KpiCard
          label="Urgent Claims Awaiting Review"
          value={urgentAwaiting}
          tone={urgentAwaiting > 0 ? "red" : "green"}
          clickable
          onClick={() => navigate("/queue?urgent=1")}
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="card-title"><Inbox size={16} /> Queue health</div>
          <div className="grid-3" style={{ marginTop: 12, textAlign: "center" }}>
            {[
              { label: "Pending", value: pending, tone: "amber" },
              { label: "In progress", value: inProgress, tone: "blue" },
              { label: "Completed", value: completed, tone: "green" },
            ].map((q) => (
              <div key={q.label}>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#17365d" }}>{q.value}</div>
                <Badge tone={q.tone}>{q.label}</Badge>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <Zap size={15} color="#b42318" />
            <span style={{ fontSize: 13 }}>
              <strong>{urgentBeyondTarget.length}</strong> urgent claim{urgentBeyondTarget.length === 1 ? "" : "s"} beyond the configured response target
            </span>
            <ChevronRight size={14} style={{ marginLeft: "auto", color: "#5b6573" }} />
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/queue?urgent=1")}>Review</button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="row-between">
            <div className="card-title"><Users size={16} /> Adjuster capacity</div>
            <span className="small muted">{totalLoad}/{totalCapacity} active</span>
          </div>
          <div style={{ margin: "10px 0 4px" }}>
            <ProgressBar value={totalLoad} max={totalCapacity} />
          </div>
          <div className="small muted">
            {availableAdjusters} of {adjusters.length} adjusters available · {unassigned} claim{unassigned === 1 ? "" : "s"} unassigned
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => navigate("/workload")}>
            Open workload view <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div className="card-title"><Users size={16} /> Adjuster workload distribution</div>
          <div className="card-sub">Active claims against configured capacity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {adjusters.filter((a) => a.status !== "unavailable").map((a) => {
              const pct = Math.round((a.load / a.capacity) * 100);
              return (
                <div key={a.id}>
                  <div className="row-between small" style={{ marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{a.name}</span>
                    <span className="muted">{a.load}/{a.capacity} · {pct}%</span>
                  </div>
                  <ProgressBar value={a.load} max={a.capacity} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad">
            <div className="row-between">
              <div className="card-title"><Zap size={16} /> AI Processing Health</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
              {[
                { label: "Median triage latency", value: `${(aiHealth.avgLatencyMs / 1000).toFixed(1)}s` },
                { label: "Fallback rate", value: `${aiHealth.fallbackRatePct}%` },
              ].map((m) => (
                <div key={m.label}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#17365d" }}>{m.value}</div>
                  <div className="small muted">{m.label}</div>
                </div>
              ))}
            </div>
            <div className="row-between" style={{ marginTop: 12 }}>
              <span className="small muted">Model status</span>
              <Badge tone={aiHealth.modelStatus === "operational" ? "green" : aiHealth.modelStatus === "degraded" ? "amber" : "red"}>
                {aiHealth.modelStatus === "operational" ? "Operational" : aiHealth.modelStatus === "degraded" ? "Degraded" : "Unavailable"}
              </Badge>
            </div>
            <div className="row-between" style={{ marginTop: 6 }}>
              <span className="small muted">Total processing cost</span>
              <span className="small" style={{ fontWeight: 600 }}>$0.00 (local model)</span>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>Last updated {fmtRelative(aiHealth.lastUpdated)}</div>
          </div>

          <div className="card card-pad">
            <div className="card-title"><AlertTriangle size={16} /> Operational alerts</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
              {urgentAwaiting > 0 && (
                <Alert tone="warn" text={`${urgentAwaiting} urgent claim${urgentAwaiting === 1 ? "" : "s"} awaiting assignment`} action={() => navigate("/queue?urgent=1")} actionLabel="Review" />
              )}
              {aiHealth.fallbackRatePct > 0 && (
                <Alert tone="warn" text={`Rules-based fallback scoring active (${aiHealth.fallbackRatePct}% of claims)`} />
              )}
              {availableAdjusters === 0 && <Alert tone="error" text="No adjusters available — assignments will be blocked" />}
              {urgentAwaiting === 0 && aiHealth.fallbackRatePct === 0 && availableAdjusters > 0 && (
                <Alert tone="ok" text="All queues within target · no active alerts" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row-between" style={{ padding: "14px 20px 0" }}>
          <div className="card-title"><Timer size={16} /> Recent activity</div>
        </div>
        <div className="table-wrap" style={{ border: "none", marginTop: 10 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th><th>Claim / event</th><th>Action</th><th>Status</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.id} className={a.claimId ? "clickable" : ""} onClick={() => a.claimId && navigate(`/claims/${a.claimId}`)}>
                  <td className="muted small">{fmtDateTime(a.at)}</td>
                  <td style={{ maxWidth: 280 }}>{a.claimId ? <span className="mono">{a.claimId}</span> : a.label}</td>
                  <td>{a.action}</td>
                  <td><Badge tone={activityTone(a)}>{a.statusLabel}</Badge></td>
                  <td className="muted small">{a.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeclareEventModal
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        onDeclared={() => toast("CAT event declared", { body: "The event is now active and available in the selector." })}
      />
    </>
  );
}

function activityTone(a) {
  const s = a.statusLabel.toLowerCase();
  if (s.includes("fail") || s.includes("urgent")) return "red";
  if (s.includes("fallback") || s.includes("error")) return "amber";
  if (s.includes("assigned") || s.includes("complete")) return "green";
  return "blue";
}

function Alert({ tone, text, action, actionLabel }) {
  const color = { warn: "#d97706", error: "#b42318", ok: "#28734b" }[tone];
  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div className="row" style={{ alignItems: "flex-start", fontSize: 13 }}>
      <Icon size={15} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ flex: 1 }}>{text}</span>
      {action && <button className="btn btn-ghost btn-sm" onClick={action}>{actionLabel}</button>}
    </div>
  );
}

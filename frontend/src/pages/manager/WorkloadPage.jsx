import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, Layers3, Inbox, Scale, Wand2, AlertTriangle, ShieldAlert } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES,
  ADJUSTER_STATUS, ADJUSTER_STATUS_LABELS, ADJUSTER_STATUS_TONES,
  URGENCY_URGENT_THRESHOLD, urgencyBand,
} from "../../constants.js";
import { Badge, Loading, ErrorState, EmptyState, ProgressBar, fmtRelative, fmtDateTime, Avatar } from "../../components/ui/primitives.jsx";
import { Modal } from "../../components/ui/overlays.jsx";

const ASSIGNMENTS_PAGE_SIZE = 10;

export default function WorkloadPage() {
  const { toast, dataVersion } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading" });
  const [filter, setFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [adjusters, claims] = await Promise.all([api.getAdjusters(), api.getClaims(null)]);
      setState({ status: "ready", adjusters, claims });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const { adjusters, claims } = state.status === "ready" ? state : { adjusters: [], claims: [] };

  const stats = useMemo(() => {
    const active = adjusters.filter((a) => a.status !== ADJUSTER_STATUS.UNAVAILABLE);
    const totalLoad = active.reduce((s, a) => s + a.load, 0);
    const mean = active.length ? totalLoad / active.length : 0;
    const maxDeviation = active.reduce((m, a) => Math.max(m, a.load - mean), 0);
    return {
      total: adjusters.length,
      available: adjusters.filter((a) => a.status !== ADJUSTER_STATUS.UNAVAILABLE && a.load < a.capacity).length,
      totalLoad,
      unassigned: claims.filter((c) => [CLAIM_STATUS.TRIAGED, CLAIM_STATUS.TRIAGE_PENDING].includes(c.status)).length,
      maxDeviation: Math.round(maxDeviation * 10) / 10,
      mean: Math.round(mean * 10) / 10,
    };
  }, [adjusters, claims]);

  const unassignedUrgent = claims.filter(
    (c) => c.score?.value >= URGENCY_URGENT_THRESHOLD && c.status === CLAIM_STATUS.TRIAGED
  );

  useEffect(() => {
    setAssignmentPage(1);
  }, [filter, eventFilter]);

  // Crew auto-distribution: the backend computes a cluster-first,
  // capacity-first plan; the modal shows how many claims land on each person
  // before anything is committed.
  const [plan, setPlan] = useState(null);
  const [planState, setPlanState] = useState("idle"); // loading | ready | error | applying
  const openPreview = useCallback(async () => {
    setPreviewOpen(true);
    setPlanState("loading");
    try {
      setPlan(await api.previewAutoAssign());
      setPlanState("ready");
    } catch {
      setPlanState("error");
    }
  }, []);
  const runAutoAssign = async () => {
    setPlanState("applying");
    try {
      const res = await api.applyAutoAssign();
      setPreviewOpen(false);
      toast(`Auto-assigned ${res.assigned} claim${res.assigned === 1 ? "" : "s"}`, {
        body: res.unassignedTotal
          ? `${res.unassignedTotal} claim${res.unassignedTotal === 1 ? "" : "s"} stay unassigned — crew capacity reached.`
          : "Every eligible claim found an owner.",
        tone: res.unassignedTotal ? "warn" : "success",
      });
      await load();
    } catch {
      setPlanState("ready");
      toast("Auto-assign failed", { body: "Nothing was committed. Please try again.", tone: "error" });
    }
  };

  // Event options for the catastrophe filter (hooks must precede any early return).
  const eventOptions = useMemo(() => {
    const seen = new Map();
    for (const c of (state.status === "ready" ? state.claims : [])) {
      if (c.eventId && !seen.has(c.eventId)) seen.set(c.eventId, c.eventName || "Unknown event");
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [state]);

  if (state.status === "loading") return <Loading label="Loading workload⬦" />;
  if (state.status === "error") return <ErrorState message="We could not load adjuster workload." onRetry={load} />;

  const assignmentRows = claims
    .filter((c) => c.assignedAdjusterId || c.status === CLAIM_STATUS.TRIAGED)
    .filter((c) => {
      if (eventFilter && c.eventId !== eventFilter) return false;
      if (filter === "overloaded") return adjusters.find((a) => a.id === c.assignedAdjusterId)?.status === ADJUSTER_STATUS.OVERLOADED;
      if (filter === "available") {
        const adjuster = adjusters.find((a) => a.id === c.assignedAdjusterId);
        return adjuster && adjuster.status !== ADJUSTER_STATUS.UNAVAILABLE && adjuster.load < adjuster.capacity;
      }
      if (filter === "unassigned") return c.status === CLAIM_STATUS.TRIAGED;
      if (filter === "urgent") return c.score?.value >= URGENCY_URGENT_THRESHOLD;
      return true;
    });
  const assignmentPageCount = Math.max(1, Math.ceil(assignmentRows.length / ASSIGNMENTS_PAGE_SIZE));
  const visibleAssignmentRows = assignmentRows.slice(
    (assignmentPage - 1) * ASSIGNMENTS_PAGE_SIZE,
    assignmentPage * ASSIGNMENTS_PAGE_SIZE
  );

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>Adjuster Workload</h1>
          </div>
          <p className="page-desc">Balance claim assignments against team capacity and protect response quality during surge conditions.</p>
        </div>
        <button className="btn btn-primary" onClick={openPreview}>
          <Wand2 size={15} /> Auto-Assign by Cluster
        </button>
      </div>

      {unassignedUrgent.length > 0 && (
        <div className="banner banner-warn" role="alert">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>{unassignedUrgent.length} urgent claim{unassignedUrgent.length === 1 ? "" : "s"} unassigned:</strong>{" "}
            {unassignedUrgent.map((c) => c.id).join(", ")}. These should be assigned first.
          </span>
        </div>
      )}

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <StatBox label="Total adjusters" value={stats.total} />
        <StatBox label="Available now" value={stats.available} tone={stats.available ? "teal" : "red"} />
        <StatBox label="Active workload" value={`${stats.totalLoad} claims`} />
        <StatBox label="Unassigned claims" value={stats.unassigned} tone={stats.unassigned ? "amber" : "green"} />
        <StatBox label="Max deviation from mean" value={`+${stats.maxDeviation}`} sub={`Team mean ${stats.mean} · Threshold not configured`} />
      </div>

      <div className="grid-2" style={{ alignItems: "start", marginBottom: 18 }}>
        <div className="card card-pad">
          <div className="card-title"><Users size={16} /> Capacity per adjuster</div>
          <div className="card-sub">Teal = normal · Amber = near capacity · Red = overloaded</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
            {adjusters.map((a) => {
              const pct = Math.round((a.load / a.capacity) * 100);
              const deviation = a.status === ADJUSTER_STATUS.UNAVAILABLE ? "—" : `${a.load - stats.mean >= 0 ? "+" : ""}${Math.round((a.load - stats.mean) * 10) / 10} vs mean`;
              return (
                <div key={a.id}>
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <Avatar name={a.name} />
                      <span>
                        <span style={{ fontWeight: 600, display: "block", fontSize: 13.5 }}>{a.name}</span>
                        <span className="small muted">{a.region}</span>
                      </span>
                    </span>
                    <span className="row" style={{ gap: 8 }}>
                      <Badge tone={ADJUSTER_STATUS_TONES[a.status]}>{ADJUSTER_STATUS_LABELS[a.status]}</Badge>
                      <span className="small" style={{ fontWeight: 600 }}>{a.load}/{a.capacity} · {pct}%</span>
                    </span>
                  </div>
                  <ProgressBar value={a.load} max={a.capacity} />
                  <div className="small muted" style={{ marginTop: 3 }}>{deviation}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div style={{ padding: "14px 18px 0" }}>
            <div className="row-between">
              <div className="card-title"><Layers3 size={16} /> Assignments</div>
              <div className="row" style={{ gap: 8 }}>
                <select
                  className="select"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  aria-label="Filter by catastrophe event"
                  style={{ maxWidth: 230 }}
                >
                  <option value="">All cyclones / events</option>
                  {eventOptions.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
                <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter assignments">
                  <option value="">All assignments</option>
                  <option value="overloaded">On overloaded adjusters</option>
                  <option value="available">On available adjusters</option>
                  <option value="unassigned">Unassigned claims</option>
                  <option value="urgent">Urgent claims</option>
                </select>
              </div>
            </div>
          </div>
          {assignmentRows.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing to show">No assignments match this filter.</EmptyState>
          ) : (
            <div className="table-wrap" style={{ border: "none", marginTop: 10 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Claim</th><th>Priority</th><th>Cluster</th><th>Assigned to</th><th>Assigned</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {visibleAssignmentRows.map((c) => {
                    const a = adjusters.find((x) => x.id === c.assignedAdjusterId);
                    const band = c.score ? urgencyBand(c.score.value) : null;
                    return (
                      <tr key={c.id} className="clickable" onClick={() => navigate(`/claims/${c.id}`)}>
                        <td className="mono">{c.id}</td>
                        <td>{c.score ? <Badge tone={band.tone} dot={false}>{c.score.value} · {band.label}</Badge> : <span className="muted small">Pending</span>}</td>
                        <td className="small">{c.clusterName || <span className="muted">—</span>}</td>
                        <td className="small">{a?.name || <span className="muted">Unassigned</span>}</td>
                        <td className="small muted" title={fmtDateTime(c.receivedAt)}>{fmtRelative(c.receivedAt)}</td>
                        <td><Badge tone={CLAIM_STATUS_TONES[c.status]}>{CLAIM_STATUS_LABELS[c.status]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {assignmentRows.length > ASSIGNMENTS_PAGE_SIZE && (
            <div className="pagination">
              <span className="muted">
                Showing {(assignmentPage - 1) * ASSIGNMENTS_PAGE_SIZE + 1}–
                {Math.min(assignmentPage * ASSIGNMENTS_PAGE_SIZE, assignmentRows.length)} of {assignmentRows.length}
              </span>
              <button disabled={assignmentPage === 1} onClick={() => setAssignmentPage((p) => p - 1)}>Prev</button>
              {Array.from({ length: assignmentPageCount }).map((_, i) => (
                <button
                  key={i}
                  className={assignmentPage === i + 1 ? "active" : ""}
                  onClick={() => setAssignmentPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={assignmentPage === assignmentPageCount}
                onClick={() => setAssignmentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={previewOpen}
        title="Crew distribution preview"
        onClose={() => setPreviewOpen(false)}
        width={760}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPreviewOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={runAutoAssign}
              disabled={planState !== "ready" || !plan || plan.assignedTotal === 0}
            >
              Apply {plan ? plan.assignedTotal : 0} assignment{plan && plan.assignedTotal === 1 ? "" : "s"}
            </button>
          </>
        }
      >
        {planState === "loading" && <Loading label="Computing distribution⬦" />}
        {planState === "error" && (
          <ErrorState message="We could not compute the distribution plan." onRetry={openPreview} />
        )}
        {planState !== "loading" && planState !== "error" && plan && (
          <>
            <div className="banner banner-info">
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Whole clusters go to one adjuster when capacity allows; otherwise claims split equally
                across the crew. Urgent clusters are placed first. Once everyone is at capacity,
                remaining claims stay unassigned.
              </span>
            </div>

            <div className="row" style={{ gap: 14, margin: "12px 0 14px", flexWrap: "wrap", fontSize: 13 }}>
              <span><strong>{plan.eligible}</strong> eligible claim{plan.eligible === 1 ? "" : "s"}</span>
              <span className="muted">·</span>
              <span><strong style={{ color: "#28734b" }}>{plan.assignedTotal}</strong> will be assigned</span>
              <span className="muted">·</span>
              <span><strong style={{ color: plan.unassignedTotal ? "#b42318" : undefined }}>{plan.unassignedTotal}</strong> stay unassigned</span>
              {plan.awaitingTriage > 0 && (
                <>
                  <span className="muted">·</span>
                  <span className="muted">{plan.awaitingTriage} still awaiting triage (not part of this run)</span>
                </>
              )}
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Adjuster</th><th>Status</th><th>Current</th><th>+Auto</th><th>New total</th><th style={{ minWidth: 110 }}>After run</th><th>Clusters</th></tr>
                </thead>
                <tbody>
                  {plan.perAdjuster.map((a) => {
                    const pct = a.capacity ? Math.round((a.newTotal / a.capacity) * 100) : 0;
                    return (
                      <tr key={a.id}>
                        <td>
                          <span style={{ fontWeight: 600, display: "block" }}>{a.name}</span>
                          <span className="small muted">{a.region}</span>
                        </td>
                        <td><Badge tone={ADJUSTER_STATUS_TONES[a.status]}>{ADJUSTER_STATUS_LABELS[a.status]}</Badge></td>
                        <td>{a.load}</td>
                        <td style={{ fontWeight: 700, color: a.assignedCount ? "#0f766e" : "#5b6573" }}>
                          {a.assignedCount ? `+${a.assignedCount}` : "—"}
                        </td>
                        <td>{a.newTotal}/{a.capacity} <span className="small muted">({pct}%)</span></td>
                        <td><ProgressBar value={a.newTotal} max={a.capacity} /></td>
                        <td className="small">
                          {a.clusters.length
                            ? a.clusters.map((cl) => `${cl.name} × ${cl.count}${cl.partial ? " (split)" : ""}`).join(", ")
                            : <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {plan.unassignedTotal > 0 && (
              <div className="banner banner-warn" style={{ marginTop: 12 }} role="alert">
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>{plan.unassignedTotal} claim{plan.unassignedTotal === 1 ? "" : "s"} will remain unassigned</strong> — the
                  whole crew is at capacity ({plan.crewCapacityTotal} total slots): {plan.unassigned.map((u) => u.ref).join(", ")}.
                </span>
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

function StatBox({ label, value, sub, tone }) {
  return (
    <div className="card card-pad" style={{ padding: "13px 16px" }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 24, color: tone === "red" ? "#b42318" : undefined }}>{value}</div>
      {sub && <div className="kpi-meta">{sub}</div>}
    </div>
  );
}

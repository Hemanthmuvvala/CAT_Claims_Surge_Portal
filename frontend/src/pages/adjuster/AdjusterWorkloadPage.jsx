import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, CheckCircle2 } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES,
  ADJUSTER_STATUS_LABELS, ADJUSTER_STATUS_TONES, urgencyBand,
} from "../../constants.js";
import { Badge, Loading, ErrorState, fmtRelative, Clamp } from "../../components/ui/primitives.jsx";

export default function AdjusterWorkloadPage() {
  const { session, dataVersion } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading" });
  const myId = session?.adjusterId || "adj-1";

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [claims, adjusters] = await Promise.all([api.getClaims(null), api.getAdjusters()]);
      setState({ status: "ready", claims, me: adjusters.find((a) => a.id === myId) });
    } catch {
      setState({ status: "error" });
    }
  }, [myId]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (state.status === "loading") return <Loading label="Loading workload summary⬦" />;
  if (state.status === "error") return <ErrorState message="We could not load your workload." onRetry={load} />;

  const { claims, me } = state;
  if (!me) return <ErrorState title="Adjuster profile not found" message="The signed-in session is not linked to an adjuster record." />;

  const mine = claims.filter((c) => c.assignedAdjusterId === myId && c.status !== CLAIM_STATUS.CLOSED);
  const byStatus = Object.values(CLAIM_STATUS).map((s) => ({ s, n: mine.filter((c) => c.status === s).length })).filter((x) => x.n > 0);
  const completed = mine.filter((c) => c.status === CLAIM_STATUS.ASSESSMENT_COMPLETE || c.status === CLAIM_STATUS.CLOSED).length;

  return (
    <>
      <div className="page-header">
        <div className="row" style={{ gap: 10 }}>
          <h1>Workload Summary</h1>
        </div>
        <p className="page-desc">Your capacity and your assigned claims.</p>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 16 }}>
        <div className="card card-pad" style={{ padding: "13px 16px" }}>
          <div className="kpi-label">Assigned to me</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{mine.length}</div>
          <div className="kpi-meta">Active claims in your queue</div>
        </div>
        <div className="card card-pad" style={{ padding: "13px 16px" }}>
          <div className="kpi-label">Completed</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{completed}</div>
          <div className="kpi-meta">Assessments finished</div>
        </div>
        <div className="card card-pad" style={{ padding: "13px 16px" }}>
          <div className="kpi-label">Capacity</div>
          <div className="kpi-value" style={{ fontSize: 24 }}>{me.load}/{me.capacity}</div>
          <div className="kpi-meta">
            <Badge tone={ADJUSTER_STATUS_TONES[me.status]}>
              {ADJUSTER_STATUS_LABELS[me.status]}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <div className="card-title"><BarChart3 size={16} /> My claims by status</div>
          {byStatus.length === 0 ? (
            <p className="small muted" style={{ marginTop: 8 }}>No active claims.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {byStatus.map(({ s, n }) => (
                <div key={s} className="row-between">
                  <Badge tone={CLAIM_STATUS_TONES[s]}>{CLAIM_STATUS_LABELS[s]}</Badge>
                  <strong style={{ color: "#17365d" }}>{n}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-title"><CheckCircle2 size={16} /> My assigned claims</div>
          {mine.length === 0 ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              No claims assigned yet. The CAT manager assigns claims from the Priority Queue.
            </p>
          ) : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead><tr><th>Claim</th><th>Location</th><th>Priority</th><th>Status</th><th>Received</th></tr></thead>
                <tbody>
                  {mine
                    .slice()
                    .sort((a, b) => (b.score?.value ?? -1) - (a.score?.value ?? -1))
                    .map((c) => {
                      const band = c.score ? urgencyBand(c.score.value) : null;
                      return (
                        <tr key={c.id} className="clickable" onClick={() => navigate(`/claims/${c.id}`)}>
                          <td className="mono">{c.id}</td>
                          <td><Clamp lines={1}>{c.location}</Clamp></td>
                          <td>
                            {c.score ? (
                              <Badge tone={band.tone} dot={false}>{c.score.value} · {band.label}</Badge>
                            ) : (
                              <span className="muted small">Pending</span>
                            )}
                          </td>
                          <td><Badge tone={CLAIM_STATUS_TONES[c.status]}>{CLAIM_STATUS_LABELS[c.status]}</Badge></td>
                          <td className="small muted">{fmtRelative(c.receivedAt)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

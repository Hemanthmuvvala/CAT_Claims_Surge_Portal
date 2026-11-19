import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Info } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import { CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES, urgencyBand } from "../../constants.js";
import { Badge, Loading, ErrorState, EmptyState } from "../../components/ui/primitives.jsx";

export default function AdjusterClustersPage() {
  const { activeEventId, session, dataVersion } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading" });
  const myId = session?.adjusterId || "adj-1";

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const clusters = await api.getClusters(activeEventId);
      setState({ status: "ready", clusters });
    } catch {
      setState({ status: "error" });
    }
  }, [activeEventId]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (state.status === "loading") return <Loading label="Loading cluster context…" />;
  if (state.status === "error") return <ErrorState message="We could not load cluster context." onRetry={load} />;

  const { clusters } = state;
  const relevant = clusters.filter((cl) => cl.claims.some((c) => c.assignedAdjusterId === myId));

  return (
    <>
      <div className="page-header">
        <div className="row" style={{ gap: 10 }}>
          <h1>Cluster Context</h1>
        </div>
        <p className="page-desc">Clusters related to your assigned claims — useful for spotting nearby claims that may need a coordinated visit. Other claims are shown as summaries only.</p>
      </div>

      <div className="banner banner-info">
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        Clusters group claims related by location and peril. They do not by themselves establish a common cause or coverage.
      </div>

      {relevant.length === 0 ? (
        <div className="card">
          <EmptyState icon={Layers} title="No clusters relate to your claims yet">
            Once you are assigned claims inside a cluster, its context will appear here.
          </EmptyState>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {relevant.map((cl) => {
            const mine = cl.claims.filter((c) => c.assignedAdjusterId === myId);
            const others = cl.claims.filter((c) => c.assignedAdjusterId !== myId);
            return (
              <div className="card card-pad" key={cl.id}>
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <div>
                    <div className="card-title"><Layers size={16} /> {cl.name}</div>
                    <div className="card-sub">{cl.location} · {cl.peril}</div>
                  </div>
                  <Badge tone="blue">{cl.claimCount} claims</Badge>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Claim</th><th>Yours / others</th><th>Priority</th><th>Status</th></tr></thead>
                    <tbody>
                      {cl.claims.map((c) => {
                        const band = c.score ? urgencyBand(c.score.value) : null;
                        const assignedToMe = c.assignedAdjusterId === myId;
                        return (
                          <tr
                            key={c.id}
                            className={assignedToMe ? "clickable" : undefined}
                            onClick={assignedToMe ? () => navigate(`/claims/${c.id}`) : undefined}
                            title={assignedToMe ? "Open your assigned claim" : "Summary only: this claim is not assigned to you"}
                          >
                            <td className="mono">{c.id}</td>
                            <td>
                              {assignedToMe
                                ? <Badge tone="teal" dot={false}>Assigned to you</Badge>
                                : <span className="small muted">Other adjuster / unassigned · summary only</span>}
                            </td>
                            <td>{c.score ? <Badge tone={band.tone} dot={false}>{c.score.value} · {band.label}</Badge> : "—"}</td>
                            <td><Badge tone={CLAIM_STATUS_TONES[c.status]}>{CLAIM_STATUS_LABELS[c.status]}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

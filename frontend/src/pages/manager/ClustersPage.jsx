import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, Info, Layers, RefreshCw, GripVertical } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES,
  SEVERITY_LABELS, SEVERITY_TONES, urgencyBand, PERILS,
} from "../../constants.js";
import { Badge, Loading, ErrorState, EmptyState } from "../../components/ui/primitives.jsx";

const PERIL_COLORS = {
  "Storm surge / flooding": "#1f4e79",
  "Wind damage": "#0f766e",
  Wildfire: "#b42318",
  Hail: "#d97706",
  "Structural collapse": "#5b6573",
  Earthquake: "#7c3aed",
};

export default function ClustersPage() {
  const { activeEventId, dataVersion, toast } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading" });
  const [perilFilter, setPerilFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [dragClaimId, setDragClaimId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // cluster id | "none"
  const [rebuilding, setRebuilding] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [clusters, claims] = await Promise.all([api.getClusters(activeEventId), api.getClaims(activeEventId)]);
      setState({ status: "ready", clusters, claims, unclustered: claims.filter((c) => !c.clusterId) });
    } catch {
      setState({ status: "error" });
    }
  }, [activeEventId]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const filtered = useMemo(
    () => (state.clusters || []).filter((c) => !perilFilter || c.peril === perilFilter),
    [state.clusters, perilFilter]
  );
  const selected = (state.clusters || []).find((c) => c.id === selectedId) || null;

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const res = await api.rebuildClusters(activeEventId);
      toast("Clusters rebuilt", { body: `${res.clusters} group(s) · ${res.unclustered} claim(s) not grouped. Manual moves were kept where the target cluster still exists.`, tone: "success" });
    } catch {
      toast("Could not rebuild clusters", { tone: "error" });
    } finally {
      setRebuilding(false);
    }
  };

  const drop = async (target) => {
    setDropTarget(null);
    const claimId = dragClaimId;
    setDragClaimId(null);
    if (!claimId) return;
    const cluster = target === "none" ? null : (state.clusters || []).find((c) => c.id === target);
    try {
      await api.moveClaimToCluster(claimId, target === "none" ? null : target);
      toast(cluster ? `Moved to ${cluster.name}` : "Removed from cluster", { tone: "success" });
    } catch (err) {
      toast(err.reason || "Could not move the claim", { tone: "error" });
    }
  };

  const dragHandlers = (target) => ({
    onDragOver: (e) => { e.preventDefault(); setDropTarget(target); },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e) => { e.preventDefault(); drop(target); },
  });

  if (state.status === "loading") return <Loading label="Loading clusters…" />;
  if (state.status === "error") return <ErrorState message="We could not load claim clusters." onRetry={load} />;

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>Claim Clusters</h1>
          </div>
          <p className="page-desc">Group related claims by location and peril to coordinate catastrophe response.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <select className="select" value={perilFilter} onChange={(e) => setPerilFilter(e.target.value)} aria-label="Filter by peril">
            <option value="">All perils</option>
            {PERILS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={rebuild} disabled={rebuilding}>
            <RefreshCw size={15} /> {rebuilding ? "Rebuilding…" : "Rebuild clusters"}
          </button>
        </div>
      </div>

      <div className="banner banner-info">
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Claims are auto-grouped by <strong>peril + street block</strong> after intake (minimum 2 claims per group). Drag a claim onto another
          cluster to move it, or onto “Not grouped” to ungroup — moves are kept on rebuild.
        </span>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="stack" style={{ gap: 10 }}>
            {filtered.length === 0 && (
              <div className="card">
                <EmptyState
                  icon={Layers}
                  title={state.clusters.length === 0 ? "No clusters for this event" : "No clusters match this filter"}
                >
                  Claims stay ungrouped until at least two share a peril and street.
                </EmptyState>
              </div>
            )}
            {filtered.map((c) => (
              <div
                key={c.id}
                className="card"
                style={{
                  padding: "13px 16px", textAlign: "left", width: "100%", fontFamily: "inherit",
                  borderColor: selectedId === c.id || dropTarget === c.id ? "#0f766e" : undefined,
                  background: selectedId === c.id ? "#f4faf9" : dropTarget === c.id ? "#eef7f6" : undefined,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedId(c.id)}
                {...dragHandlers(c.id)}
              >
                <div className="row-between">
                  <span style={{ fontWeight: 600, display: "inline-flex", gap: 7, alignItems: "center" }}>
                    <span className="legend-swatch" style={{ background: PERIL_COLORS[c.peril] || "#5b6573" }} />
                    {c.name}
                  </span>
                  <Badge tone="blue">{c.claimCount} claims</Badge>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {c.location} · {c.peril}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                  <Badge tone={c.highestPriority && urgencyBand(c.highestPriority).tone} dot={false}>
                    Top priority {c.highestPriority ?? "—"}
                  </Badge>
                  {c.unassignedCount > 0
                    ? <Badge tone="amber" dot={false}>{c.unassignedCount} unassigned</Badge>
                    : <Badge tone="green" dot={false}>All assigned</Badge>}
                </div>
              </div>
            ))}

            {(state.unclustered.length > 0 || dropTarget === "none") && (
              <div
                className="card card-pad"
                style={{ borderColor: dropTarget === "none" ? "#0f766e" : undefined, background: dropTarget === "none" ? "#eef7f6" : undefined }}
                {...dragHandlers("none")}
              >
                <div className="card-title"><Layers size={16} /> Not grouped yet ({state.unclustered.length})</div>
                <p className="small muted" style={{ marginTop: 4 }}>
                  Single claims with no street-block match. Drop claims here to ungroup, or onto a cluster above to move them.
                </p>
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {state.unclustered.slice(0, 24).map((c) => (
                    <span
                      key={c.id}
                      draggable
                      onDragStart={() => setDragClaimId(c.id)}
                      onDragEnd={() => { setDragClaimId(null); setDropTarget(null); }}
                      className="small mono"
                      style={{ border: "1px solid #d9e1e8", borderRadius: 6, padding: "3px 8px", background: "#f4f7fa", cursor: "grab", display: "inline-flex", alignItems: "center", gap: 4 }}
                      title={`${c.location} — drag onto a cluster`}
                    >
                      <GripVertical size={11} /> {c.id}
                    </span>
                  ))}
                  {state.unclustered.length > 24 && <span className="small muted">+{state.unclustered.length - 24} more…</span>}
                </div>
              </div>
            )}
          </div>

          {selected ? (
            <div className="card card-pad" style={{ position: "sticky", top: 76 }}>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <div>
                  <div className="card-title"><MapPin size={16} /> {selected.name} — cluster detail</div>
                  <div className="card-sub">{selected.note}</div>
                </div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                {[
                  { label: "Related claims", value: selected.claimCount },
                  { label: "Highest priority", value: selected.highestPriority ?? "—" },
                  { label: "Unassigned", value: selected.unassignedCount },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#f7fafc", border: "1px solid #d9e1e8", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 21, fontWeight: 700, color: "#17365d" }}>{s.value}</div>
                    <div className="small muted">{s.label}</div>
                  </div>
                ))}
              </div>
              <p className="small muted" style={{ marginBottom: 6 }}>Drag a claim row onto a cluster card to move it.</p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Claim</th><th>Severity</th><th>Score</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {selected.claims.map((c) => (
                      <tr
                        key={c.id}
                        className="clickable"
                        draggable
                        onDragStart={() => setDragClaimId(c.id)}
                        onDragEnd={() => { setDragClaimId(null); setDropTarget(null); }}
                        onClick={() => navigate(`/claims/${c.id}`)}
                        style={{ cursor: dragClaimId === c.id ? "grabbing" : undefined }}
                      >
                        <td className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><GripVertical size={11} />{c.id}</td>
                        <td><Badge tone={SEVERITY_TONES[c.severity]} dot={false}>{SEVERITY_LABELS[c.severity]}</Badge></td>
                        <td>{c.score ? <strong>{c.score.value}</strong> : <span className="muted small">Pending</span>}</td>
                        <td><Badge tone={CLAIM_STATUS_TONES[c.status]}>{CLAIM_STATUS_LABELS[c.status]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 12 }}
                to={`/queue?cluster=${selected.id}`}
              >
                View member claims in Priority Queue
              </Link>
            </div>
          ) : (
            <div className="card">
              <EmptyState icon={Layers} title="Select a cluster">
                Choose a cluster on the left to see its summary, member claims and assignment overview.
              </EmptyState>
            </div>
          )}
        </div>
    </>
  );
}

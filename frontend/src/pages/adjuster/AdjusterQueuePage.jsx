import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Inbox, Zap, CircleDashed, Search, X } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES,
  ADJUSTER_STATUS, ADJUSTER_STATUS_LABELS, ADJUSTER_STATUS_TONES,
  URGENCY_URGENT_THRESHOLD, urgencyBand,
} from "../../constants.js";
import { Badge, Loading, ErrorState, EmptyState, StatTile, fmtRelative, fmtDateTime, Clamp } from "../../components/ui/primitives.jsx";

export default function AdjusterQueuePage() {
  const { session, dataVersion } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ status: "loading" });
  const [search, setSearch] = useState(params.get("q") || "");

  // Demo session is bound to Marcus Chen (adj-1). In production this comes from the JWT.
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

  const { claims, me } = state.status === "ready" ? state : { claims: [], me: null };

  const mine = useMemo(
    () =>
      claims
        .filter((c) => c.assignedAdjusterId === myId && c.status !== CLAIM_STATUS.CLOSED)
        .filter((c) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase().trim();
          const hay = [c.id, c.location, c.contactName, c.peril].filter(Boolean).join(" ").toLowerCase();
          return hay.includes(q);
        })
        .sort((a, b) => (b.score?.value ?? -1) - (a.score?.value ?? -1)),
    [claims, myId, search]
  );
  const completed = claims.filter((c) => c.assignedAdjusterId === myId && c.status === CLAIM_STATUS.ASSESSMENT_COMPLETE).length;

  if (state.status === "loading") return <Loading label="Loading your work queue⬦" />;
  if (state.status === "error") return <ErrorState message="We could not load your assigned claims." onRetry={load} />;

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>My Work Queue</h1>
          </div>
          <p className="page-desc">Claims assigned to you, ordered by triage priority. Open a claim to review its triage explanation and update its status.</p>
        </div>
        {me && (
          <Badge tone={ADJUSTER_STATUS_TONES[me.status]}>
            {ADJUSTER_STATUS_LABELS[me.status]} · {me.load}/{me.capacity} active claims
          </Badge>
        )}
      </div>

      <div className="filter-bar">
        <div className="topbar-search" style={{ margin: 0, width: 260 }}>
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              const next = new URLSearchParams(params);
              if (e.target.value.trim()) next.set("q", e.target.value.trim());
              else next.delete("q");
              setParams(next, { replace: true });
            }}
            placeholder="Search claim ref, claimant name, location⬦"
            aria-label="Search your claims"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setParams({}, { replace: true }); }}
              aria-label="Clear search"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "#5b6573" }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <span className="result-count">{mine.length} of {claims.filter((c) => c.assignedAdjusterId === myId && c.status !== CLAIM_STATUS.CLOSED).length} assigned claims</span>
      </div>

      {mine.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Inbox}
            title={search ? "No claims match your search" : "No claims assigned to you yet"}
            action={
              search ? (
                <button className="btn btn-secondary" onClick={() => { setSearch(""); setParams({}, { replace: true }); }}>Clear search</button>
              ) : (
                <button className="btn btn-secondary" onClick={load}>Refresh queue</button>
              )
            }
          >
            {search
              ? "Try a different claim reference, claimant name or location."
              : "The CAT manager assigns claims from the Priority Queue. New assignments will appear here automatically."}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
            <StatTile label="Assigned to me" value={mine.length} />
            <StatTile
              label="Urgent in my queue"
              value={mine.filter((c) => c.score?.value >= URGENCY_URGENT_THRESHOLD).length}
              sub={mine.some((c) => c.score?.value >= URGENCY_URGENT_THRESHOLD) ? "Work these first" : "None — good"}
            />
            <StatTile label="Awaiting my update" value={mine.filter((c) => c.status === CLAIM_STATUS.ASSIGNED).length} />
            <StatTile label="Completed" value={completed} />
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Claim reference</th><th>Location</th><th>Priority</th><th>Status</th><th>Received</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {mine.map((c) => {
                  const band = c.score ? urgencyBand(c.score.value) : null;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/claims/${c.id}`)}>
                      <td className="mono">{c.id}</td>
                      <td><Clamp lines={1}>{c.location}</Clamp></td>
                      <td>
                        {c.score ? (
                          <span className="row" style={{ gap: 7 }}>
                            <strong style={{ color: "#17365d" }}>{c.score.value}</strong>
                            <Badge tone={band.tone} dot={false}>{band.label}</Badge>
                          </span>
                        ) : (
                          <Badge tone="amber" dot={false}><CircleDashed size={11} /> Pending</Badge>
                        )}
                      </td>
                      <td><Badge tone={CLAIM_STATUS_TONES[c.status]}>{CLAIM_STATUS_LABELS[c.status]}</Badge></td>
                      <td className="small muted" title={fmtDateTime(c.receivedAt)}>{fmtRelative(c.receivedAt)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/claims/${c.id}`)}>Open</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

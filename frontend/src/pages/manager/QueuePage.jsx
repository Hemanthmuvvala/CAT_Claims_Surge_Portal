import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X, FilterX, ChevronDown, ChevronUp, Zap, CircleDashed, Scale, Inbox } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES,
  SEVERITY, SEVERITY_LABELS, SEVERITY_TONES, SCORING_METHOD,
  URGENCY_URGENT_THRESHOLD, urgencyBand,
} from "../../constants.js";
import { Badge, Loading, ErrorState, EmptyState, fmtRelative, fmtDateTime, Clamp } from "../../components/ui/primitives.jsx";
import { ClaimDrawer } from "../../components/claims/ClaimDrawer.jsx";

const PAGE_SIZE = 20;

const DEFAULT_FILTERS = {
  q: "",
  severity: "",
  hardship: "",
  status: "",
  scoreMin: "",
  assignment: "",
  method: "",
  cluster: "",
  sort: "priority",
};

export default function QueuePage() {
  const { activeEventId, toast, dataVersion } = useApp();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ status: "loading" });
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    q: params.get("q") || "",
    cluster: params.get("cluster") || "",
    urgent: params.get("urgent") === "1",
  }));
  const [drawerClaimId, setDrawerClaimId] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", claims: await api.getClaims(activeEventId), adjusters: await api.getAdjusters() });
    } catch {
      setState({ status: "error" });
    }
  }, [activeEventId]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Keep filters in sync when navigation changes the URL params (global search, urgent KPI, cluster links).
  useEffect(() => {
    setFilters((f) => ({
      ...f,
      q: params.get("q") ?? f.q,
      cluster: params.get("cluster") ?? f.cluster,
      urgent: params.get("urgent") === "1" ? true : f.urgent,
    }));
  }, [params]);

  const claims = state.status === "ready" ? state.claims : [];
  const adjusters = state.status === "ready" ? state.adjusters : [];

  const filtered = useMemo(() => {
    let list = claims.filter((c) => {
      if (filters.urgent && !(c.score?.value >= URGENCY_URGENT_THRESHOLD && (c.status === CLAIM_STATUS.TRIAGED || c.status === CLAIM_STATUS.TRIAGE_PENDING))) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase().trim();
        const haystack = [c.id, c.location, c.contactName, c.contactEmail, c.peril, c.policyId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.severity && c.severity !== filters.severity) return false;
      if (filters.hardship && (filters.hardship === "yes" ? c.hardshipFlags.length === 0 : c.hardshipFlags.length > 0)) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.scoreMin && !(c.score?.value >= Number(filters.scoreMin))) return false;
      if (filters.assignment === "unassigned" && !(c.status === CLAIM_STATUS.TRIAGED || c.status === CLAIM_STATUS.TRIAGE_PENDING)) return false;
      if (filters.assignment === "assigned" && !(c.assignedAdjusterId || [CLAIM_STATUS.ASSIGNED, CLAIM_STATUS.IN_REVIEW, CLAIM_STATUS.INFO_REQUIRED, CLAIM_STATUS.ASSESSMENT_COMPLETE, CLAIM_STATUS.CLOSED].includes(c.status))) return false;
      if (filters.method === "ai" && c.score?.scoringMethod !== SCORING_METHOD.AI_ASSISTED) return false;
      if (filters.method === "fallback" && c.score?.scoringMethod !== SCORING_METHOD.RULES_FALLBACK) return false;
      if (filters.method === "unscored" && c.score) return false;
      if (filters.cluster && c.clusterId !== filters.cluster) return false;
      return true;
    });

    const sevRank = { [SEVERITY.CRITICAL]: 0, [SEVERITY.HIGH]: 1, [SEVERITY.MEDIUM]: 2, [SEVERITY.LOW]: 3 };
    const unscored = (c) => !c.score;
    list.sort((a, b) => {
      // Unprocessed (triage-pending) claims lead the DEFAULT priority view —
      // a manager must see new arrivals immediately. Explicit sorts respect
      // the user's chosen ordering.
      if (filters.sort === "priority" || filters.sort === "score") {
        if (unscored(a) && !unscored(b)) return -1;
        if (!unscored(a) && unscored(b)) return 1;
        if (unscored(a) && unscored(b)) return new Date(b.receivedAt) - new Date(a.receivedAt);
      }
      switch (filters.sort) {
        case "severity": return (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
        case "arrival": return new Date(b.receivedAt) - new Date(a.receivedAt);
        case "score": return (b.score?.value ?? -1) - (a.score?.value ?? -1);
        case "ref": return a.id.localeCompare(b.id);
        default:
          return (b.score?.value ?? -1) - (a.score?.value ?? -1) || (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
      }
    });
    return list;
  }, [claims, filters]);

  const counts = useMemo(() => {
    const urgentAwaiting = claims.filter(
      (c) => c.score?.value >= URGENCY_URGENT_THRESHOLD && (c.status === CLAIM_STATUS.TRIAGED || c.status === CLAIM_STATUS.TRIAGE_PENDING)
    ).length;
    const fallback = claims.filter((c) => c.score?.scoringMethod === SCORING_METHOD.RULES_FALLBACK).length;
    const awaitingTriage = claims.filter((c) => c.status === CLAIM_STATUS.TRIAGE_PENDING || c.status === CLAIM_STATUS.SUBMITTED).length;
    return { total: claims.length, urgentAwaiting, fallback, awaitingTriage };
  }, [claims]);

  const activeChips = Object.entries(filters)
    .filter(([k, v]) => v && k !== "sort")
    .map(([k, v]) => ({
      key: k,
      label:
        k === "q" ? `Search: "${v}"` :
        k === "severity" ? `Severity: ${SEVERITY_LABELS[v]}` :
        k === "hardship" ? `Hardship: ${v === "yes" ? "With signals" : "No signals"}` :
        k === "status" ? `Status: ${CLAIM_STATUS_LABELS[v]}` :
        k === "scoreMin" ? `Score   ${v}` :
        k === "assignment" ? (v === "assigned" ? "Assigned" : "Unassigned") :
        k === "method" ? (v === "ai" ? "AI-scored" : v === "fallback" ? "Rules fallback" : "Unscored") :
        k === "cluster" ? "Cluster member" :
        k === "urgent" ? "Urgent only" : v,
    }));

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setParams({});
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (state.status === "loading") return <Loading label="Loading priority queue⬦" />;
  if (state.status === "error") return <ErrorState message="We could not load the claims queue." onRetry={load} />;

  return (
    <>
      <div className="page-header">
        <div className="row" style={{ gap: 10 }}>
          <h1>Priority Queue</h1>
        </div>
        <p className="page-desc">Review claims in recommended triage order and understand the factors behind each priority score.</p>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
        <QueueStat icon={<Inbox size={16} />} label="Total claims in event" value={counts.total} />
        <QueueStat icon={<Zap size={16} color="#b42318" />} label="Urgent awaiting assignment" value={counts.urgentAwaiting} tone={counts.urgentAwaiting ? "red" : "green"} />
        <QueueStat
          icon={<CircleDashed size={16} color="#d97706" />}
          label="Awaiting triage"
          value={counts.awaitingTriage}
          tone={counts.awaitingTriage ? "amber" : "green"}
          onClick={() => setFilter("status", CLAIM_STATUS.TRIAGE_PENDING)}
        />
        <QueueStat icon={<Scale size={16} color="#d97706" />} label="Using rules-based fallback" value={counts.fallback} />
      </div>

      {counts.awaitingTriage > 0 && (
        <div className="banner banner-warn" role="status">
          <CircleDashed size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>{counts.awaitingTriage} claim{counts.awaitingTriage === 1 ? "" : "s"} awaiting triage</strong> — shown
            at the top of the queue, newest first. Scores appear automatically within a few seconds.
          </span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setFilter("status", CLAIM_STATUS.TRIAGE_PENDING)}>
            Show only these
          </button>
        </div>
      )}

      <div className="filter-bar">
        <div className="topbar-search" style={{ margin: 0, width: 220 }}>
          <Search size={14} />
          <input
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="Search claim reference or location⬦"
            aria-label="Search claims"
          />
        </div>
        <select className="select" value={filters.severity} onChange={(e) => setFilter("severity", e.target.value)} aria-label="Filter by severity">
          <option value="">All severities</option>
          {Object.values(SEVERITY).map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
        </select>
        <select className="select" value={filters.hardship} onChange={(e) => setFilter("hardship", e.target.value)} aria-label="Filter by hardship">
          <option value="">Hardship: any</option>
          <option value="yes">With hardship signals</option>
          <option value="no">No hardship signals</option>
        </select>
        <select className="select" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.values(CLAIM_STATUS).map((s) => <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>)}
        </select>
        <select className="select" value={filters.scoreMin} onChange={(e) => setFilter("scoreMin", e.target.value)} aria-label="Minimum priority score">
          <option value="">Any priority score</option>
          <option value="85">Score   85 (urgent)</option>
          <option value="65">Score   65</option>
          <option value="40">Score   40</option>
        </select>
        <select className="select" value={filters.assignment} onChange={(e) => setFilter("assignment", e.target.value)} aria-label="Assigned or unassigned">
          <option value="">Assigned &amp; unassigned</option>
          <option value="unassigned">Unassigned only</option>
          <option value="assigned">Assigned only</option>
        </select>
        <select className="select" value={filters.method} onChange={(e) => setFilter("method", e.target.value)} aria-label="Scoring method">
          <option value="">Any scoring method</option>
          <option value="ai">AI-scored</option>
          <option value="fallback">Rules fallback</option>
          <option value="unscored">Not yet scored</option>
        </select>
        <select className="select" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)} aria-label="Sort by">
          <option value="priority">Sort: priority</option>
          <option value="severity">Sort: severity</option>
          <option value="arrival">Sort: arrival time</option>
          <option value="score">Sort: score</option>
        </select>
        <span className="result-count">{filtered.length} of {claims.length} claims</span>
      </div>

      {activeChips.length > 0 && (
        <div className="filter-chips">
          {activeChips.map((c) => (
            <span className="chip" key={c.key}>
              {c.label}
              <button onClick={() => setFilter(c.key, c.key === "urgent" ? false : "")} aria-label={`Remove filter ${c.label}`}>
                <X size={12} />
              </button>
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
            <FilterX size={13} /> Reset filters
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No claims match these filters"
            action={<button className="btn btn-secondary" onClick={clearFilters}><FilterX size={14} /> Reset filters</button>}
          >
            Try widening the severity, status or score filters, or reset them to see the full queue.
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <Th label="Claim reference" sortKey="ref" filters={filters} setFilter={setFilter} />
                <th>Location</th>
                <th>Peril</th>
                <th>Severity</th>
                <th>Hardship</th>
                <Th label="Score" sortKey="score" filters={filters} setFilter={setFilter} />
                <th>Main priority factors</th>
                <th>Status</th>
                <th>Adjuster</th>
                <Th label="Received" sortKey="arrival" filters={filters} setFilter={setFilter} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const band = c.score ? urgencyBand(c.score.value) : null;
                const adjuster = adjusters.find((a) => a.id === c.assignedAdjusterId);
                return (
                  <tr key={c.id} className="clickable" onClick={() => setDrawerClaimId(c.id)}>
                    <td className="mono">{c.id}</td>
                    <td><Clamp lines={1}>{c.location}</Clamp></td>
                    <td className="small">{c.peril}</td>
                    <td><Badge tone={SEVERITY_TONES[c.severity]} dot={false}>{SEVERITY_LABELS[c.severity]}</Badge></td>
                    <td>{c.hardshipFlags.length ? <Badge tone="amber" dot={false}>{c.hardshipFlags.length} signal{c.hardshipFlags.length > 1 ? "s" : ""}</Badge> : <span className="muted small">—</span>}</td>
                    <td>
                      {c.score ? (
                        <span className="row" style={{ gap: 7 }}>
                          <strong style={{ fontSize: 15, color: "#17365d" }}>{c.score.value}</strong>
                          <Badge tone={band.tone} dot={false}>{band.label}</Badge>
                        </span>
                      ) : c.triageError ? (
                        <Badge tone="red" dot={false}>Triage failed</Badge>
                      ) : (
                        <Badge tone="amber" dot={false}><CircleDashed size={11} /> Pending</Badge>
                      )}
                    </td>
                    <td className="small muted"><Clamp lines={2}>{c.score ? c.score.factors.slice(0, 2).map((f) => f.label).join("; ") : c.triageError ? "Retry available in drawer" : "Awaiting triage"}</Clamp></td>
                    <td><Badge tone={CLAIM_STATUS_TONES[c.status]}>{CLAIM_STATUS_LABELS[c.status]}</Badge></td>
                    <td className="small">{adjuster?.name || <span className="muted">Unassigned</span>}</td>
                    <td className="small muted" title={fmtDateTime(c.receivedAt)}>{fmtRelative(c.receivedAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDrawerClaimId(c.id)}>Open</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="pagination">
          <span className="muted">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button key={i} className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>
          ))}
          <button disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      <ClaimDrawer
        claimId={drawerClaimId}
        onClose={() => setDrawerClaimId(null)}
        onChanged={(msg) => {
          load();
          if (typeof msg === "string") toast(msg, { body: "Queue refreshed." });
        }}
      />
    </>
  );
}

function QueueStat({ icon, label, value, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="card card-pad"
      style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: onClick ? "pointer" : "default", fontFamily: "inherit" }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 8, background: "#eef2f6", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#17365d" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: tone === "red" && value > 0 ? "#b42318" : tone === "amber" && value > 0 ? "#93510a" : "#17365d" }}>{value}</div>
        <div className="small muted">{label}</div>
      </div>
    </button>
  );
}

function Th({ label, sortKey, filters, setFilter }) {
  const active = filters.sort === sortKey;
  return (
    <th>
      <button
        className="sort-btn"
        onClick={() => setFilter("sort", sortKey)}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        {active ? <ChevronUp size={12} /> : <ChevronDown size={12} style={{ opacity: 0.4 }} />}
      </button>
    </th>
  );
}

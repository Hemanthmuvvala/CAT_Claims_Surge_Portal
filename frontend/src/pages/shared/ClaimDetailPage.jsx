import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, MapPin, CloudLightning, FileText, AlertTriangle, Zap, ShieldAlert,
  Flag, UserMinus, Layers, Clock,
} from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES, ADJUSTER_ALLOWED_STATUSES,
  SEVERITY_LABELS, SEVERITY_TONES, SCORING_METHOD, SCORING_METHOD_LABELS,
  EVIDENCE_STATE_LABELS, urgencyBand,
} from "../../constants.js";
import { Badge, Loading, ErrorState, Banner, fmtDateTime, fmtRelative } from "../../components/ui/primitives.jsx";
import { AssignControl } from "../../components/claims/AssignControl.jsx";

export default function ClaimDetailPage() {
  const { claimId } = useParams();
  const { role, session, toast, dataVersion } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading" });
  const [adjusters, setAdjusters] = useState([]);
  const [cluster, setCluster] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const claim = await api.getClaim(claimId);
      const [adjusters, events] = await Promise.all([api.getAdjusters(), api.getEvents()]);
      const cluster = claim.clusterId ? (await api.getClusters(claim.eventId)).find((c) => c.id === claim.clusterId) : null;
      setState({ status: "ready", claim, events, adjuster: adjusters.find((a) => a.id === claim.assignedAdjusterId) || null });
      setAdjusters(adjusters);
      setCluster(cluster);
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }, [claimId]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (state.status === "loading") return <Loading label="Loading claim⬦" />;
  if (state.status === "error") {
    return (
      <div className="card">
        <ErrorState
          title={state.message === "Claim not found" ? "Claim not found" : "Could not load claim"}
          message={
            state.message === "Claim not found"
              ? "This claim does not exist or you do not have access to it."
              : "We could not load this claim. Check your connection and try again."
          }
          onRetry={state.message === "Claim not found" ? null : load}
        />
        <div style={{ textAlign: "center", paddingBottom: 20 }}>
          <BackLink role={role} />
        </div>
      </div>
    );
  }

  const { claim, adjuster, events } = state;
  const event = events.find((e) => e.id === claim.eventId);
  const band = claim.score ? urgencyBand(claim.score.value) : null;
  const isManager = role === "manager";
  const isAssignedToMe = role === "adjuster" && session?.adjusterId === claim.assignedAdjusterId;

  // Demo adjuster session maps to Marcus Chen (adj-1).
  const canUpdateStatus = role === "adjuster" && claim.assignedAdjusterId === (session?.adjusterId || "adj-1");

  const act = async (fn, msg) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      toast(msg);
    } catch (err) {
      setError(err.reason || err.message || "The operation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <BackLink role={role} />
      </div>

      <div className="page-header page-header-row">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1 style={{ fontFamily: "inherit" }}>{claim.id}</h1>
          </div>
          <p className="page-desc">{claim.location} · {claim.peril}</p>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Badge tone={CLAIM_STATUS_TONES[claim.status]}>{CLAIM_STATUS_LABELS[claim.status]}</Badge>
          <Badge tone={SEVERITY_TONES[claim.severity]} dot={false}>{SEVERITY_LABELS[claim.severity]} severity</Badge>
          {claim.score && <Badge tone={band.tone} dot={false}>{band.label} · {claim.score.value}</Badge>}
        </div>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      {role === "adjuster" && claim.assignedAdjusterId && !canUpdateStatus && (
        <Banner tone="warn" icon={ShieldAlert}>
          This claim is assigned to another adjuster. You can view it, but only the assigned adjuster can update its status.
        </Banner>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: "1.2fr 1fr", alignItems: "start" }}>
        {/* Left: claim facts */}
        <div className="stack">
          <div className="card card-pad">
            <div className="card-title"><FileText size={16} /> Claim information</div>
            <dl className="kv-list" style={{ marginTop: 12 }}>
              <dt>Policy reference</dt><dd>{claim.policyId}</dd>
              <dt>Catastrophe event</dt><dd><CloudLightning size={13} style={{ verticalAlign: "-2px" }} /> {event ? `${event.name} — ${event.region}` : claim.eventId}</dd>
              <dt>Incident date</dt><dd>{claim.incidentDate}</dd>
              <dt>Location</dt><dd><MapPin size={13} style={{ verticalAlign: "-2px" }} /> {claim.location}</dd>
              <dt>Peril / damage type</dt><dd>{claim.peril}</dd>
              <dt>Hardship signals</dt><dd>{claim.hardshipFlags.length ? claim.hardshipFlags.join(", ") : "None recorded"}</dd>
              <dt>Claimant contact</dt><dd>{claim.contactName || "Batch import — contact details pending"}{claim.contactEmail ? ` · ${claim.contactEmail}` : ""}</dd>
              <dt>Received</dt><dd>{fmtDateTime(claim.receivedAt)} <span className="muted small">({fmtRelative(claim.receivedAt)})</span></dd>
              <dt>Assigned adjuster</dt><dd>{adjuster?.name || "Unassigned"}</dd>
              <dt>Supporting documents</dt>
              <dd>
                {claim.documents.length
                  ? claim.documents.map((d) => <div key={d}><FileText size={12} style={{ verticalAlign: "-1px" }} /> {d}</div>)
                  : <span className="muted">No documents attached yet</span>}
              </dd>
            </dl>
            <div className="drawer-section">
              <h4>Description of loss</h4>
              <p style={{ fontSize: 13.5 }}>{claim.description || <span className="muted">No description provided.</span>}</p>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title"><Layers size={16} /> Cluster context</div>
            {cluster ? (
              <>
                <p className="small muted" style={{ margin: "6px 0 10px" }}>
                  Related by location/peril: <strong style={{ color: "#202a35" }}>{cluster.name}</strong> — {cluster.note}
                </p>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  <Badge tone="blue" dot={false}>{cluster.claimCount} related claims</Badge>
                  <Badge tone={cluster.unassignedCount ? "amber" : "green"} dot={false}>{cluster.unassignedCount} unassigned</Badge>
                  {isManager && (
                    <Link className="btn btn-ghost btn-sm" to={`/queue?cluster=${cluster.id}`}>Open cluster in Priority Queue</Link>
                  )}
                </div>
              </>
            ) : (
              <p className="small muted" style={{ marginTop: 8 }}>This claim has not been grouped into a cluster.</p>
            )}
          </div>

          <div className="card card-pad">
            <div className="card-title"><Clock size={16} /> Processing timeline</div>
            <div className="timeline" style={{ marginTop: 14 }}>
              {[...claim.timeline].reverse().map((t, i, arr) => (
                <div className={`tl-step ${i === 0 ? "current" : "done"}`} key={i}>
                  <span className="tl-dot">{i === 0 && <span />}</span>
                  <div className="tl-title">{t.label}</div>
                  <div className="tl-meta">{fmtDateTime(t.ts)} · {t.actor}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: triage + actions */}
        <div className="stack">
          {claim.triageError && (
            <div className="card card-pad" style={{ borderColor: "#eccfcb" }}>
              <div className="card-title" style={{ color: "#b42318" }}><AlertTriangle size={16} /> Triage failed</div>
              <p className="small muted" style={{ margin: "8px 0 12px" }}>{claim.triageError}</p>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => api.runTriageNow(claim.id), "Triage retry started")}>
                Retry triage
              </button>
            </div>
          )}

          {claim.status === CLAIM_STATUS.TRIAGE_PENDING && !claim.triageError && (
            <div className="card card-pad">
              <div className="card-title"><Zap size={16} /> Triage in progress</div>
              <p className="small muted" style={{ marginTop: 8 }}>
                This claim is queued for scoring. A priority score, contributing factors and evidence state will appear
                here when processing completes. No result is shown before then.
              </p>
            </div>
          )}

          {claim.score && (
            <div className="card card-pad">
              <div className="row-between">
                <div className="card-title"><Zap size={16} /> Triage result (AI)</div>
                <Badge tone={claim.score.scoringMethod === SCORING_METHOD.AI_ASSISTED ? "teal" : "amber"} dot={false}>
                  {SCORING_METHOD_LABELS[claim.score.scoringMethod]}
                </Badge>
              </div>
              <div className="row" style={{ gap: 10, margin: "12px 0 8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 34, fontWeight: 700, color: "#17365d" }}>{claim.score.value}</span>
                <div>
                  <Badge tone={band.tone}>{band.label} urgency</Badge>
                  <div className="small muted" style={{ marginTop: 3 }}>0–100 triage support score</div>
                </div>
              </div>
              <p className="small muted" style={{ marginBottom: 12 }}>
                Triage support only — this score never approves, denies or settles a claim. Coverage decisions require
                authorised human review.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {claim.score.factors.map((f, i) => (
                  <div key={i} style={{ border: "1px solid #d9e1e8", borderRadius: 8, padding: "9px 12px" }}>
                    <div className="row-between">
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
                      <span className="small muted">weight {f.weight}</span>
                    </div>
                    <div className="small muted">{f.detail}</div>
                  </div>
                ))}
              </div>
              <dl className="kv-list" style={{ marginTop: 12 }}>
                <dt>Processed at</dt><dd>{fmtDateTime(claim.score.processedAt)}</dd>
                <dt>Latency</dt><dd>{claim.score.latencyMs} ms</dd>
                <dt>Human review</dt>
                <dd>
                  {claim.score.needsHumanReview
                    ? <Badge tone="blue" dot={false}>Required before any decision</Badge>
                    : "Not flagged"}
                </dd>
              </dl>
              {claim.score.warnings.length > 0 && (
                <div className="banner banner-warn" style={{ marginTop: 10, marginBottom: 0 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{claim.score.warnings.join(" ")}</span>
                </div>
              )}
            </div>
          )}

          <div className="card card-pad">
            <div className="card-title"><FileText size={16} /> Policy evidence</div>
            {claim.score?.coverageEvidence.length ? (
              <>
                <Badge tone={claim.score.evidenceState === "available" ? "green" : claim.score.evidenceState === "partial" ? "amber" : "red"} dot={false}>
                  {EVIDENCE_STATE_LABELS[claim.score.evidenceState]}
                </Badge>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13 }}>
                  {claim.score.coverageEvidence.map((ev, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{ev.source} — <span className="muted">{ev.ref}</span></li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="small muted" style={{ marginTop: 8 }}>
                No policy evidence retrieved yet. <strong style={{ color: "#b42318" }}>Do not assume coverage</strong> — evidence must be verified by an authorised reviewer.
              </p>
            )}
          </div>

          {/* Role actions */}
          <div className="card card-pad">
            <div className="card-title"><ShieldAlert size={16} /> Actions</div>

            {isManager && (
              <>
                {(claim.status === CLAIM_STATUS.TRIAGED || claim.status === CLAIM_STATUS.ASSIGNED) ? (
                  <div style={{ marginTop: 10 }}>
                    <p className="small muted" style={{ marginBottom: 8 }}>
                      {claim.assignedAdjusterId ? "Reassign to another adjuster:" : "Assign to an adjuster with available capacity:"}
                    </p>
                    <AssignControl
                      claimId={claim.id}
                      currentAdjusterId={claim.assignedAdjusterId}
                      onAssigned={() => { load(); toast("Claim assigned"); }}
                      onError={(reason) => setError(reason)}
                    />
                    {claim.assignedAdjusterId && (
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={() => act(() => api.unassignClaim(claim.id), "Claim returned to queue")}>
                        <UserMinus size={14} /> Return to queue
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="small muted" style={{ marginTop: 8 }}>
                    Assignment is available once triage completes (status “Triaged⬝).
                  </p>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 10 }}
                  disabled={busy || claim.score?.needsHumanReview}
                  onClick={() => act(() => api.markForHumanReview(claim.id), "Flagged for human review")}
                >
                  <Flag size={14} /> Mark for human review
                </button>
              </>
            )}

            {role === "adjuster" && (
              canUpdateStatus ? (
                <StatusUpdateControl claim={claim} busy={busy} onUpdate={(s) => act(() => api.updateClaimStatus(claim.id, s, session?.name || "Adjuster"), "Status updated")} />
              ) : claim.assignedAdjusterId ? (
                <p className="small muted" style={{ marginTop: 8 }}>Only the assigned adjuster can update this claim's status.</p>
              ) : (
                <p className="small muted" style={{ marginTop: 8 }}>This claim is not assigned yet. The CAT manager assigns claims from the Priority Queue.</p>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatusUpdateControl({ claim, busy, onUpdate }) {
  const [next, setNext] = useState("");
  return (
    <div style={{ marginTop: 10 }}>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Update the operational status. You can only set statuses permitted for adjusters — coverage decisions are
        never made here.
      </p>
      <div className="row">
        <select className="select" style={{ flex: 1 }} value={next} onChange={(e) => setNext(e.target.value)} aria-label="New status">
          <option value="">Select new status⬦</option>
          {ADJUSTER_ALLOWED_STATUSES.filter((s) => s !== claim.status).map((s) => (
            <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={!next || busy} onClick={() => { onUpdate(next); setNext(""); }}>
          Update
        </button>
      </div>
    </div>
  );
}

function BackLink({ role }) {
  const to = role === "adjuster" ? "/my-queue" : "/queue";
  return (
    <Link to={to} className="btn btn-ghost btn-sm" style={{ padding: "4px 8px" }}>
      <ArrowLeft size={14} /> Back to {role === "adjuster" ? "work queue" : "priority queue"}
    </Link>
  );
}

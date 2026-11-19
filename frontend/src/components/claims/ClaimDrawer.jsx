import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin, CloudLightning, AlertTriangle, FileText, Clock, Zap, Flag,
} from "lucide-react";
import * as api from "../../services/api.js";
import { useApp } from "../../context/AppContext.jsx";
import {
  CLAIM_STATUS, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES,
  SEVERITY_LABELS, SEVERITY_TONES, SCORING_METHOD, SCORING_METHOD_LABELS,
  EVIDENCE_STATE_LABELS, urgencyBand,
} from "../../constants.js";
import { Badge, Loading, fmtDateTime, fmtRelative } from "../ui/primitives.jsx";
import { Drawer } from "../ui/overlays.jsx";
import { AssignControl } from "./AssignControl.jsx";

// Right-side claim drawer for the manager's Priority Queue.
export function ClaimDrawer({ claimId, onClose, onChanged }) {
  const { dataVersion } = useApp();
  const [claim, setClaim] = useState(null);
  const [event, setEvent] = useState(null);
  const [adjusterName, setAdjusterName] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!claimId) return;
    setError("");
    try {
      const [c, events] = await Promise.all([api.getClaim(claimId), api.getEvents()]);
      setClaim(c);
      setEvent(events.find((e) => e.id === c.eventId) || null);
      const adjusters = await api.getAdjusters();
      const a = adjusters.find((x) => x.id === c.assignedAdjusterId);
      setAdjusterName(a?.name || null);
    } catch {
      setError("Could not load this claim. It may have been removed.");
    }
  }, [claimId]);

  useEffect(() => {
    if (!claimId) return;
    setClaim(null);
    refresh();
  }, [claimId, refresh]);

  // Keep the drawer live: triage completing, assignments or status changes
  // elsewhere bump the shared data version.
  useEffect(() => {
    if (claimId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const act = async (fn, successMsg) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      const fresh = await api.getClaim(claimId);
      setClaim(fresh);
      onChanged?.(successMsg);
    } catch (err) {
      setError(err.reason || err.message || "The operation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!claimId) return null;

  const band = claim?.score ? urgencyBand(claim.score.value) : null;

  return (
    <Drawer
      open={!!claimId}
      onClose={onClose}
      title={claim ? claim.id : "Loading claim…"}
      subtitle={claim ? `${claim.location} · ${claim.peril}` : ""}
      footer={
        claim && (
          <>
            {claim.status === CLAIM_STATUS.TRIAGE_PENDING && !claim.triageError && (
              <span className="small muted" style={{ marginRight: "auto", alignSelf: "center" }}>
                <Clock size={13} style={{ verticalAlign: "-2px" }} /> Triage in progress…
              </span>
            )}
            <Link className="btn btn-secondary" to={`/claims/${claim.id}`}>View full details</Link>
          </>
        )
      }
    >
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {!claim ? (
        <Loading label="Loading claim…" />
      ) : (
        <>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Badge tone={CLAIM_STATUS_TONES[claim.status]}>{CLAIM_STATUS_LABELS[claim.status]}</Badge>
            <Badge tone={SEVERITY_TONES[claim.severity]}>{SEVERITY_LABELS[claim.severity]}</Badge>
            {claim.score && <Badge tone={band.tone}>{band.label} · score {claim.score.value}</Badge>}
          </div>

          {claim.triageError && (
            <div className="banner banner-error" role="alert">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                {claim.triageError}
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => api.runTriageNow(claim.id), "Triage retry started")}>
                    Retry triage
                  </button>
                </div>
              </div>
            </div>
          )}

          {claim.status === CLAIM_STATUS.TRIAGE_PENDING && !claim.triageError && (
            <div className="banner banner-info">
              <Zap size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Triage is queued. A priority score will appear here once processing completes — no score is invented before then.</span>
            </div>
          )}

          <dl className="kv-list">
            <dt>Claim reference</dt><dd className="mono">{claim.id}</dd>
            <dt>Catastrophe event</dt><dd><CloudLightning size={13} style={{ verticalAlign: "-2px" }} /> {event ? `${event.name} — ${event.region}` : claim.eventId}</dd>
            <dt>Location</dt><dd><MapPin size={13} style={{ verticalAlign: "-2px" }} /> {claim.location}</dd>
            <dt>Policy reference</dt><dd>{claim.policyId}</dd>
            <dt>Severity (reported)</dt><dd><Badge tone={SEVERITY_TONES[claim.severity]} dot={false}>{SEVERITY_LABELS[claim.severity]}</Badge></dd>
            <dt>Hardship signals</dt>
            <dd>
              {claim.hardshipFlags.length ? claim.hardshipFlags.join(", ") : <span className="muted">None recorded</span>}
            </dd>
            <dt>Received</dt><dd>{fmtDateTime(claim.receivedAt)} <span className="muted small">({fmtRelative(claim.receivedAt)})</span></dd>
            <dt>Assigned adjuster</dt><dd>{adjusterName || <span className="muted">Unassigned</span>}</dd>
          </dl>

          <div className="drawer-section">
            <h4>Description of loss</h4>
            <p style={{ fontSize: 13.5 }}>{claim.description || <span className="muted">No description provided.</span>}</p>
          </div>

          {claim.score && (
            <div className="drawer-section">
              <h4>AI-assisted triage</h4>
              <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: "#17365d" }}>{claim.score.value}</span>
                <Badge tone={band.tone}>{band.label} urgency</Badge>
                <Badge tone={claim.score.scoringMethod === SCORING_METHOD.AI_ASSISTED ? "teal" : "amber"} dot={false}>
                  {SCORING_METHOD_LABELS[claim.score.scoringMethod]}
                </Badge>
                {claim.score.needsHumanReview && <Badge tone="blue" dot={false}>Human review required</Badge>}
              </div>
              <p className="small muted" style={{ marginBottom: 10 }}>
                This score supports triage ordering only. It is <strong>not</strong> a coverage decision —
                coverage eligibility always requires authorised human review.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {claim.score.factors.map((f, i) => (
                  <div key={i} className="card" style={{ padding: "9px 12px", boxShadow: "none" }}>
                    <div className="row-between">
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
                      <span className="small muted">weight {f.weight}</span>
                    </div>
                    <div className="small muted">{f.detail}</div>
                  </div>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                <strong>Plain language:</strong> this claim ranks {band.label.toLowerCase()} because {claim.score.factors[0]?.detail?.toLowerCase()}{claim.hardshipFlags.length ? ", combined with hardship indicators in the household" : ""}.
              </p>
              <dl className="kv-list" style={{ marginTop: 10 }}>
                <dt>Processed at</dt><dd>{fmtDateTime(claim.score.processedAt)}</dd>
                <dt>Latency</dt><dd>{claim.score.latencyMs} ms</dd>
              </dl>
              {claim.score.warnings.length > 0 && (
                <div className="banner banner-warn" style={{ marginTop: 10 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{claim.score.warnings.join(" ")}</span>
                </div>
              )}
            </div>
          )}

          <div className="drawer-section">
            <h4>Policy evidence</h4>
            {claim.score && claim.score.coverageEvidence.length ? (
              <>
                <Badge tone={claim.score.evidenceState === "available" ? "green" : claim.score.evidenceState === "partial" ? "amber" : "red"} dot={false}>
                  {EVIDENCE_STATE_LABELS[claim.score.evidenceState]}
                </Badge>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13 }}>
                  {claim.score.coverageEvidence.map((ev, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <FileText size={12} style={{ verticalAlign: "-1px" }} /> {ev.source} — <span className="muted">{ev.ref}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="banner banner-warn">
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>No policy evidence has been retrieved for this claim yet. Do not assume coverage — the policy review must be completed by an authorised person.</span>
              </div>
            )}
            <p className="small muted" style={{ marginTop: 8 }}>Coverage decision requires authorised review.</p>
          </div>

          <div className="drawer-section">
            <h4>Actions</h4>
            {(claim.status === CLAIM_STATUS.TRIAGED || claim.status === CLAIM_STATUS.ASSIGNED) && (
              <>
                <p className="small muted" style={{ marginBottom: 8 }}>
                  {claim.assignedAdjusterId ? "Reassign this claim to another adjuster with available capacity:" : "Assign this claim to an adjuster with available capacity:"}
                </p>
                <AssignControl
                  claimId={claim.id}
                  currentAdjusterId={claim.assignedAdjusterId}
                      onAssigned={async () => {
                        await refresh();
                        onChanged?.("Claim assigned");
                      }}
                  onError={(reason) => setError(reason)}
                />
              </>
            )}
            {claim.status !== CLAIM_STATUS.TRIAGE_PENDING && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 10 }}
                disabled={busy || claim.score?.needsHumanReview}
                title={claim.score?.needsHumanReview ? "Already flagged for human review" : undefined}
                onClick={() => act(() => api.markForHumanReview(claim.id), "Claim flagged for human review")}
              >
                <Flag size={14} /> Mark for human review
              </button>
            )}
          </div>

          <div className="drawer-section">
            <h4>Processing timeline</h4>
            <div className="timeline" style={{ marginTop: 4 }}>
              {[...claim.timeline].reverse().map((t, i, arr) => (
                <div className={`tl-step ${i === 0 ? "current" : "done"}`} key={i}>
                  <span className="tl-dot">{i === 0 && <span />}</span>
                  <div className="tl-title">{t.label}</div>
                  <div className="tl-meta">{fmtDateTime(t.ts)} · {t.actor}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}

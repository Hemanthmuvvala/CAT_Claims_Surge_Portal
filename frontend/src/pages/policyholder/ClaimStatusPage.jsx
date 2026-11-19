import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShieldOff, FileQuestion, CheckCircle2, Circle, Clock, Info } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import { CLAIM_STATUS, CLAIMANT_STATUS, TIMELINE_STAGES } from "../../constants.js";
import { Badge, Loading, fmtDateTime } from "../../components/ui/primitives.jsx";

export default function ClaimStatusPage() {
  const { claimId } = useParams();
  const { session, dataVersion } = useApp();
  const [state, setState] = useState({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [claims, events] = await Promise.all([
        api.getClaimsForPolicyholder(session?.id || "ph-demo-1", session?.email),
        api.getEvents(),
      ]);
      const claim = claims.find((c) => c.id === claimId);
      if (!claim) {
        setState({ status: "error", kind: claims.some((c) => c.id === claimId) ? "denied" : "notfound" });
        return;
      }
      setState({ status: "ready", claim, event: events.find((e) => e.id === claim.eventId) || null });
    } catch {
      setState({ status: "error", kind: "network" });
    }
  }, [claimId, session]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (state.status === "loading") return <Loading label="Loading your claim…" />;

  if (state.status === "error") {
    return (
      <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
        <div className="state-block">
          <span className="state-icon">
            {state.kind === "denied" ? <ShieldOff size={22} /> : state.kind === "network" ? <Info size={22} /> : <FileQuestion size={22} />}
          </span>
          <h3>
            {state.kind === "denied" ? "This claim is not linked to your account" : state.kind === "network" ? "Connection problem" : "Claim not found"}
          </h3>
          <p>
            {state.kind === "denied"
              ? "For your security, you can only view claims submitted from your own account."
              : state.kind === "network"
                ? "We could not reach the service. Please check your connection and try again."
                : "We couldn't find a claim with that reference on your account. Check the reference in My Claims."}
          </p>
          <Link className="btn btn-secondary" to="/my-claims">Back to My Claims</Link>
        </div>
      </div>
    );
  }

  const { claim, event } = state;
  const cs = CLAIMANT_STATUS[claim.status] || CLAIMANT_STATUS[CLAIM_STATUS.SUBMITTED];

  // Timeline: a stage is done if the claim has moved past it; current stage matches actual status.
  const stageIndex = (key) => TIMELINE_STAGES.findIndex((s) => s.key === key);
  const currentIndex = (() => {
    const match = TIMELINE_STAGES.findIndex((s) => s.statusKeys.includes(claim.status));
    return match === -1 ? 0 : match;
  })();

  const needsInfo = claim.status === CLAIM_STATUS.INFO_REQUIRED;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="page-header page-header-row">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>Track your claim</h1>
          </div>
          <p className="page-desc">A plain-language view of where your claim is and what happens next.</p>
        </div>
        <Link to="/my-claims" className="btn btn-secondary btn-sm">All my claims</Link>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="small muted">Claim reference</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "#1f4e79" }}>{claim.id}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="small muted">Current status</div>
            <Badge tone={needsInfo ? "amber" : "teal"}>{cs.label}</Badge>
            <div className="small muted" style={{ marginTop: 4 }}>Updated {fmtDateTime(claim.timeline.at(-1)?.ts || claim.receivedAt)}</div>
          </div>
        </div>
        <div className="drawer-section" style={{ border: "none", paddingTop: 12, marginTop: 4 }}>
          <p style={{ fontSize: 14 }}>{cs.description}</p>
          {needsInfo && (
            <div className="banner banner-warn" style={{ marginTop: 12, marginBottom: 0 }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Your claims specialist has asked for more information. In the production system you would receive a
                secure message describing exactly what is needed — this prototype does not include messaging.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <div className="card-title">Progress</div>
          <div className="timeline" style={{ marginTop: 16 }}>
            {TIMELINE_STAGES.map((s, i) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              return (
                <div className={`tl-step ${done ? "done" : current ? "current" : "pending"}`} key={s.key}>
                  <span className="tl-dot">{done && <CheckCircle2 size={11} />}{current && <span />}{!done && !current && <Circle size={7} style={{ color: "#b9c6d2" }} />}</span>
                  <div className="tl-title">{s.title}</div>
                  <div className="tl-meta">
                    {done ? "Completed" : current ? "In progress now" : "Upcoming"}
                    {current && claim.timeline.at(-1) ? ` · ${fmtDateTime(claim.timeline.at(-1).ts)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>
            Every claim is different — this timeline reflects your claim's actual status, not a fixed schedule.
          </p>
        </div>

        <div className="stack">
          <div className="card card-pad" style={{ borderLeft: "4px solid #0f766e" }}>
            <div className="card-title">What happens next?</div>
            <p style={{ fontSize: 14, marginTop: 8 }}>
              {nextStep(claim.status)}
            </p>
            <p className="small muted" style={{ marginTop: 10 }}>
              {actionRequired(claim.status)}
            </p>
          </div>

          <div className="card card-pad">
            <div className="card-title">Your claim at a glance</div>
            <dl className="kv-list" style={{ marginTop: 10 }}>
              <dt>Event</dt><dd>{event ? `${event.name} — ${event.region}` : "Recorded event"}</dd>
              <dt>Damage type</dt><dd>{claim.peril}</dd>
              <dt>Location</dt><dd>{claim.location}</dd>
              <dt>Reported</dt><dd>{fmtDateTime(claim.receivedAt)}</dd>
              <dt>Handled by</dt><dd>{claim.assignedAdjusterId ? "A dedicated claims specialist" : "Our response team — a specialist will be assigned"}</dd>
            </dl>
          </div>

          <div className="card card-pad">
            <div className="card-title">Need help?</div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Catastrophe support line: <strong style={{ color: "#202a35" }}>555-0100</strong> (7am–9pm, every day)
              <br />Email: <strong style={{ color: "#202a35" }}>cat-support@demo-insurer.example</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function nextStep(status) {
  switch (status) {
    case CLAIM_STATUS.SUBMITTED:
    case CLAIM_STATUS.TRIAGE_PENDING:
    case CLAIM_STATUS.TRIAGED:
      return "Our response team is reviewing your claim now. Once the initial review is complete, a claims specialist will be assigned to assess the damage.";
    case CLAIM_STATUS.ASSIGNED:
      return "A claims specialist has been assigned and will begin assessing your claim shortly.";
    case CLAIM_STATUS.IN_REVIEW:
      return "Your claims specialist is actively reviewing your claim. No action is needed from you right now.";
    case CLAIM_STATUS.INFO_REQUIRED:
      return "We need a little more information before we can continue. Please check the secure messages from our team.";
    case CLAIM_STATUS.ASSESSMENT_COMPLETE:
      return "The assessment is complete. Our team will contact you to talk about the next steps for your claim.";
    default:
      return "This claim has been completed. If anything changes or you need help again, contact us any time.";
  }
}

function actionRequired(status) {
  return status === CLAIM_STATUS.INFO_REQUIRED
    ? "Action needed: please respond to our request for more information."
    : "No action is needed from you right now.";
}

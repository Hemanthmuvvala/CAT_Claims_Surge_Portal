import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Files, ChevronRight } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import { CLAIM_STATUS, CLAIMANT_STATUS } from "../../constants.js";
import { Badge, Loading, ErrorState, EmptyState, fmtDateTime } from "../../components/ui/primitives.jsx";

export default function MyClaimsPage() {
  const { session, dataVersion } = useApp();
  const [state, setState] = useState({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [claims, events] = await Promise.all([
        api.getClaimsForPolicyholder(session?.id || "ph-demo-1", session?.email),
        api.getEvents(),
      ]);
      const eventMap = Object.fromEntries(events.map((e) => [e.id, e]));
      setState({ status: "ready", claims, eventMap });
    } catch {
      setState({ status: "error" });
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (state.status === "loading") return <Loading label="Loading your claims…" />;
  if (state.status === "error") return <ErrorState message="We could not load your claims. Please try again." onRetry={load} />;

  const claims = state.claims;
  const eventMap = state.eventMap || {};

  return (
    <>
      <div className="page-header">
        <h1>My Claims</h1>
        <p className="page-desc">Every claim you have submitted. Select one to see its current status and progress.</p>
      </div>

      {claims.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Files}
            title="You haven't submitted any claims yet"
            action={<Link className="btn btn-primary" to="/submit">Submit a Claim</Link>}
          >
            If your property was affected by a catastrophe event, submit a claim and we will start helping you right away.
          </EmptyState>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {claims.map((c) => {
            const cs = CLAIMANT_STATUS[c.status] || CLAIMANT_STATUS[CLAIM_STATUS.SUBMITTED];
            return (
              <Link
                key={c.id}
                to={`/my-claims/${c.id}`}
                className="card card-pad"
                style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", color: "inherit", textDecoration: "none" }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontWeight: 700, color: "#1f4e79" }}>{c.id}</span>
                    <Badge tone={c.status === CLAIM_STATUS.INFO_REQUIRED ? "amber" : c.status === CLAIM_STATUS.ASSESSMENT_COMPLETE || c.status === CLAIM_STATUS.CLOSED ? "green" : "teal"}>
                      {cs.label}
                    </Badge>
                  </div>
                  <div className="small muted" style={{ marginTop: 5 }}>
                    {eventMap[c.eventId] ? `${eventMap[c.eventId].name} · ` : ""}
                    {c.location} · {c.peril} · submitted {fmtDateTime(c.receivedAt)}
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: "#5b6573" }} />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

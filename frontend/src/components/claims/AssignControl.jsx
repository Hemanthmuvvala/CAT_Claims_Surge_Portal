import { useEffect, useState } from "react";
import { UserCheck, ShieldAlert } from "lucide-react";
import * as api from "../../services/api.js";
import { ADJUSTER_STATUS, ADJUSTER_STATUS_LABELS, ADJUSTER_STATUS_TONES } from "../../constants.js";
import { Badge } from "../ui/primitives.jsx";

// Shared assignment control: lists eligible adjusters, disables full/unavailable
// ones (the system must never assign to an unavailable or full adjuster).
export function AssignControl({ claimId, currentAdjusterId, onAssigned, onError }) {
  const [adjusters, setAdjusters] = useState(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    api.getAdjusters().then((as) => {
      if (!on) return;
      setAdjusters(as);
      const firstEligible = as.find((a) => a.status !== ADJUSTER_STATUS.UNAVAILABLE && a.load < a.capacity);
      setSelected(firstEligible?.id || "");
    });
    return () => { on = false; };
  }, [claimId]);

  if (!adjusters) return <div className="skeleton" style={{ height: 34 }} />;

  const eligible = adjusters.filter((a) => a.id !== currentAdjusterId);
  const selectedAdjuster = adjusters.find((a) => a.id === selected);

  const assign = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.assignClaim(claimId, selected);
      onAssigned?.(selectedAdjuster);
    } catch (err) {
      onError?.(err.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <select className="select" style={{ flex: 1 }} value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Select adjuster">
          <option value="">Select adjuster…</option>
          {eligible.map((a) => {
            const full = a.load >= a.capacity || a.status === ADJUSTER_STATUS.UNAVAILABLE;
            return (
              <option key={a.id} value={a.id} disabled={full}>
                {a.name} — {a.load}/{a.capacity} active · {ADJUSTER_STATUS_LABELS[a.status]}{full ? " (unavailable)" : ""}
              </option>
            );
          })}
        </select>
        <button className="btn btn-primary" onClick={assign} disabled={!selected || busy}>
          <UserCheck size={15} /> {busy ? "Assigning…" : "Assign"}
        </button>
      </div>
      {selectedAdjuster && (
        <p className="hint" style={{ marginTop: 6 }}>
          <Badge tone={ADJUSTER_STATUS_TONES[selectedAdjuster.status]}>{ADJUSTER_STATUS_LABELS[selectedAdjuster.status]}</Badge>{" "}
          Capacity after assignment: {selectedAdjuster.load + 1}/{selectedAdjuster.capacity}
        </p>
      )}
      {eligible.every((a) => a.load >= a.capacity || a.status === ADJUSTER_STATUS.UNAVAILABLE) && (
        <div className="banner banner-warn" style={{ marginTop: 8 }}>
          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>No adjusters have available capacity right now. The claim stays in the queue — assignment is blocked until capacity frees up.</span>
        </div>
      )}
    </div>
  );
}

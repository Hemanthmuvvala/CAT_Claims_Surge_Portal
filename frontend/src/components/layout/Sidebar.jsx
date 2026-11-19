import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ListFilter, MapPin, Users, CloudLightning, Upload,
  Inbox, BarChart3, Layers, FilePlus2, Files, LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext.jsx";
import { ROLES, CLAIM_STATUS, URGENCY_URGENT_THRESHOLD } from "../../constants.js";
import * as api from "../../services/api.js";

const MANAGER_NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/queue", label: "Priority Queue", icon: ListFilter },
  { to: "/clusters", label: "Claim Clusters", icon: MapPin },
  { to: "/workload", label: "Adjuster Workload", icon: Users },
  { to: "/events", label: "CAT Events", icon: CloudLightning },
  { to: "/intake", label: "Bulk Claim Intake", icon: Upload },
];

const ADJUSTER_NAV = [
  { to: "/my-queue", label: "My Work Queue", icon: Inbox },
  { to: "/my-workload", label: "Workload Summary", icon: BarChart3 },
  { to: "/my-clusters", label: "Cluster Context", icon: Layers },
];

const POLICYHOLDER_NAV = [
  { to: "/submit", label: "Submit a Claim", icon: FilePlus2 },
  { to: "/my-claims", label: "My Claims", icon: Files },
];

function navFor(role) {
  if (role === ROLES.MANAGER) return { section: "Operations", items: MANAGER_NAV };
  if (role === ROLES.ADJUSTER) return { section: "Surge team", items: ADJUSTER_NAV };
  return { section: "My account", items: POLICYHOLDER_NAV };
}

export function Sidebar({ open, onClose }) {
  const { session, signOut, dataVersion, activeEventId } = useApp();
  const { section, items } = navFor(session?.role);

  return (
    <aside className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden="true">
          <CloudLightning size={19} color="#fff" />
        </span>
        <div>
          <div className="brand-name">CAT RESPONSE</div>
          <div className="brand-sub">Claims Surge Portal</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">{section}</div>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            <Icon size={17} />
            {label}
          </NavLink>
        ))}

        {session?.role === ROLES.MANAGER && (
          <NavLink to="/queue?urgent=1" className="nav-item">
            <ListFilter size={17} />
            Urgent queue
            <UrgentBadge eventId={activeEventId} dataVersion={dataVersion} />
          </NavLink>
        )}
      </nav>

      <div style={{ padding: 12 }}>
        <button className="btn btn-secondary btn-block" style={{ background: "rgba(255,255,255,.1)", color: "#fff", borderColor: "rgba(255,255,255,.25)" }} onClick={signOut}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}

function UrgentBadge({ eventId, dataVersion }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    setCount(0);
    api.getClaims(eventId).then((claims) => {
      if (!active) return;
      setCount(claims.filter(
        (claim) =>
          claim.score?.value >= URGENCY_URGENT_THRESHOLD &&
          (claim.status === CLAIM_STATUS.TRIAGED || claim.status === CLAIM_STATUS.TRIAGE_PENDING)
      ).length);
    }).catch((error) => {
      if (!active) return;
      console.error("Could not load urgent queue count", error);
      setCount(0);
    });
    return () => { active = false; };
  }, [eventId, dataVersion]);

  if (!count) return null;
  return <span className="nav-badge">{count}</span>;
}

export default Sidebar;

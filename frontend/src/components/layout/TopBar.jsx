import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, Search, Bell, HelpCircle, ChevronDown, LogOut, User, CloudLightning, ExternalLink, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import { Dropdown } from "../ui/overlays.jsx";
import { Avatar, Badge, fmtRelative } from "../ui/primitives.jsx";
import { getEvents, getNotifications, markNotificationsRead } from "../../services/api.js";
import { EVENT_STATUS, EVENT_STATUS_LABELS, EVENT_STATUS_TONES, ROLES } from "../../constants.js";
import { DeclareEventModal } from "../../pages/manager/EventsPage.jsx";

const CRUMB_LABELS = {
  dashboard: "CAT Command Centre",
  queue: "Priority Queue",
  clusters: "Claim Clusters",
  workload: "Adjuster Workload",
  events: "CAT Events",
  intake: "Bulk Claim Intake",
  "my-queue": "My Work Queue",
  "my-workload": "Workload Summary",
  "my-clusters": "Cluster Context",
  submit: "Submit a Claim",
  "my-claims": "My Claims",
  claims: "Claim Details",
  login: "Sign in",
};

export function TopBar({ onOpenSidebar }) {
  const { session, role, activeEventId, setActiveEventId, toast, dataVersion } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [q, setQ] = useState("");
  const [declareOpen, setDeclareOpen] = useState(false);

  useEffect(() => {
    let on = true;
    getEvents().then((es) => on && setEvents(es));
    getNotifications().then((ns) => on && setNotifications(ns));
    return () => { on = false; };
  }, [location.pathname, activeEventId, dataVersion]);

  const activeEvent = events.find((e) => e.id === activeEventId) || events[0];
  const unread = notifications.filter((n) => n.unread).length;
  const segments = location.pathname.split("/").filter(Boolean);
  const isInternal = role === ROLES.MANAGER || role === ROLES.ADJUSTER;

  return (
    <header className="topbar">
      <button className="topbar-icon-btn" onClick={onOpenSidebar} aria-label="Open navigation">
        <Menu size={19} />
      </button>

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {segments.map((seg, i) => {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg);
          const label = CRUMB_LABELS[seg] || (isUuid ? "Claim" : segments[i - 1] === "claims" ? seg.toUpperCase() : seg);
          const to = "/" + segments.slice(0, i + 1).join("/");
          const last = i === segments.length - 1;
          return (
            <span key={to} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true">/</span>
              {last ? <span className="crumb-current clamp-text">{label}</span> : <Link to={to}>{label}</Link>}
            </span>
          );
        })}
      </nav>

      {isInternal && activeEvent && (
        <Dropdown
          label={null}
          align="right"
          buttonClass="btn btn-secondary btn-sm"
          buttonContent={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CloudLightning size={14} color="#b42318" />
              <span style={{ textAlign: "left", lineHeight: 1.2 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>
                  {activeEvent.name} — {activeEvent.region}
                </span>
                <span style={{ fontSize: 10.5, color: "#5b6573" }}>{activeEvent.type}</span>
              </span>
              <Badge tone={EVENT_STATUS_TONES[activeEvent.status]}>{EVENT_STATUS_LABELS[activeEvent.status]}</Badge>
              <ChevronDown size={13} />
            </span>
          }
        >
          {events.map((e) => (
            <button key={e.id} onClick={() => setActiveEventId(e.id)}>
              <span style={{ flex: 1, textAlign: "left" }}>
                {e.name} — {e.region}
              </span>
              <Badge tone={EVENT_STATUS_TONES[e.status]} dot={false}>{EVENT_STATUS_LABELS[e.status]}</Badge>
            </button>
          ))}
          {role === ROLES.MANAGER && (
            <>
              <div className="dropdown-sep" />
              <button onClick={() => setDeclareOpen(true)}>
                <CloudLightning size={15} /> Declare CAT Event…
              </button>
            </>
          )}
        </Dropdown>
      )}

      {isInternal && (
        <form
          className="topbar-search"
          onSubmit={(e) => {
            e.preventDefault();
            const term = q.trim();
            if (!term) return;
            navigate(role === ROLES.ADJUSTER ? `/my-queue?q=${encodeURIComponent(term)}` : `/queue?q=${encodeURIComponent(term)}`);
            setQ("");
          }}
          role="search"
        >
          <Search size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search claim ref or claimant name…"
            aria-label="Global claim search"
          />
        </form>
      )}

      <div className="row" style={{ marginLeft: isInternal ? 0 : "auto" }}>
        {isInternal && (
          <Dropdown
            align="right"
            buttonClass="topbar-icon-btn"
            buttonContent={
              <>
                <Bell size={18} />
                {unread > 0 && <span className="dot-badge">{unread}</span>}
              </>
            }
          >
            <div style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "#5b6573" }}>Notifications</div>
            {notifications.length === 0 && <div style={{ padding: "8px 12px", fontSize: 13 }} className="muted">No notifications</div>}
            {notifications.slice(0, 6).map((n) => (
              <div key={n.id} style={{ padding: "7px 10px", fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start", maxWidth: 320 }}>
                {n.unread ? <AlertTriangle size={13} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} /> : <CheckCircle2 size={13} color="#28734b" style={{ marginTop: 2, flexShrink: 0 }} />}
                <span>
                  {n.text}
                  <span style={{ display: "block", fontSize: 11, color: "#5b6573" }}>{fmtRelative(n.at)}</span>
                </span>
              </div>
            ))}
            <div className="dropdown-sep" />
            <button onClick={() => markNotificationsRead().then(() => toast("Notifications marked as read"))}>
              Mark all as read
            </button>
          </Dropdown>
        )}

        <button className="topbar-icon-btn" aria-label="Help" title="Help centre" onClick={() => toast("Help centre", { body: "Support: cat-support@demo-insurer.example · 555-0100", tone: "info" })}>
          <HelpCircle size={18} />
        </button>

        <Dropdown
          align="right"
          buttonClass="topbar-icon-btn"
          buttonContent={<Avatar name={session?.name} />}
        >
          <div style={{ padding: "7px 10px" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{session?.name}</div>
            <div style={{ fontSize: 11.5, color: "#5b6573" }}>{session?.roleLabel}</div>
          </div>
          <div className="dropdown-sep" />
          <button className="disabled" title="Available in a future release"><User size={15} /> Profile</button>
          <button className="disabled" title="Available in a future release"><User size={15} /> Preferences</button>
          <button onClick={() => toast("Help", { body: "Contact the CAT response support desk for assistance.", tone: "info" })}>
            <Info size={15} /> Help
          </button>
          <div className="dropdown-sep" />
          <SignOutItem />
        </Dropdown>
      </div>

      <DeclareEventModal open={declareOpen} onClose={() => setDeclareOpen(false)} onDeclared={() => toast("CAT event declared", { body: "The event is now active and available in the selector." })} />
    </header>
  );
}

function SignOutItem() {
  const { signOut } = useApp();
  return (
    <button onClick={signOut}>
      <LogOut size={15} /> Sign out
    </button>
  );
}

import { useCallback, useEffect, useState } from "react";
import { CloudLightning, MapPin, CalendarClock, FileText, Inbox, Plus } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import { EVENT_STATUS, EVENT_STATUS_LABELS, EVENT_STATUS_TONES, PERILS } from "../../constants.js";
import { Badge, Field, Loading, ErrorState, EmptyState, fmtDateTime } from "../../components/ui/primitives.jsx";
import { Modal } from "../../components/ui/overlays.jsx";

export function DeclareEventModal({ open, onClose, onDeclared }) {
  const [form, setForm] = useState({ name: "", type: "", region: "", declaredAt: "", summary: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [fatal, setFatal] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFatal("");
    try {
      await api.declareEvent(form);
      setForm({ name: "", type: "", region: "", declaredAt: "", summary: "" });
      onDeclared?.();
      onClose?.();
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      else setFatal("Could not declare the event. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Declare CAT Event"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" form="declare-event-form" disabled={saving}>
            {saving ? "Declaring⬦" : "Declare event"}
          </button>
        </>
      }
    >
      {fatal && <div className="banner banner-error" role="alert">{fatal}</div>}
      <form id="declare-event-form" onSubmit={submit} noValidate>
        <Field label="Event name" htmlFor="ev-name" error={errors.name} hint="e.g. Cyclone Arnab">
          <input id="ev-name" className={`input${errors.name ? " invalid" : ""}`} value={form.name} onChange={set("name")} />
        </Field>
        <div className="form-grid-2">
          <Field label="Event type" htmlFor="ev-type" error={errors.type}>
            <select id="ev-type" className={`select${errors.type ? " invalid" : ""}`} value={form.type} onChange={set("type")}>
              <option value="">Select type⬦</option>
              {["Tropical cyclone", "Riverine flood", "Flash flood", "Wildfire", "Hailstorm", "Earthquake"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Region" htmlFor="ev-region" error={errors.region} hint="e.g. Khairatabad — Hyderabad, Telangana">
            <input id="ev-region" className={`input${errors.region ? " invalid" : ""}`} value={form.region} onChange={set("region")} />
          </Field>
        </div>
        <Field label="Declared at" htmlFor="ev-declared" error={errors.declaredAt}>
          <input id="ev-declared" type="datetime-local" className={`input${errors.declaredAt ? " invalid" : ""}`} value={form.declaredAt} onChange={set("declaredAt")} />
        </Field>
        <Field label="Summary (optional)" htmlFor="ev-summary">
          <textarea id="ev-summary" className="textarea" value={form.summary} onChange={set("summary")} placeholder="Short operational context for the response team⬦" />
        </Field>
      </form>
    </Modal>
  );
}

export default function EventsPage() {
  const { activeEventId, setActiveEventId, toast, dataVersion } = useApp();
  const [state, setState] = useState({ status: "loading" });
  const [declareOpen, setDeclareOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", events: await api.getEvents() });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  if (state.status === "loading") return <Loading label="Loading events⬦" />;
  if (state.status === "error") return <ErrorState message="We could not load the CAT event registry." onRetry={load} />;

  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>CAT Events</h1>
          </div>
          <p className="page-desc">Declared catastrophe events. Operational screens are scoped to the selected event.</p>
        </div>
        <button className="btn btn-navy" onClick={() => setDeclareOpen(true)}>
          <Plus size={15} /> Declare CAT Event
        </button>
      </div>

      {state.events.length === 0 ? (
        <div className="card"><EmptyState icon={CloudLightning} title="No events declared">Declare a CAT event to begin receiving and triaging claims.</EmptyState></div>
      ) : (
        <div className="grid-2">
          {state.events.map((e) => (
            <div className="card card-pad" key={e.id}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div className="card-title"><CloudLightning size={16} /> {e.name}</div>
                <Badge tone={EVENT_STATUS_TONES[e.status]}>{EVENT_STATUS_LABELS[e.status]}</Badge>
              </div>
              <dl className="kv-list">
                <dt>Type</dt><dd>{e.type}</dd>
                <dt>Region</dt><dd><MapPin size={13} style={{ verticalAlign: "-2px" }} /> {e.region}</dd>
                <dt>Declared at</dt><dd><CalendarClock size={13} style={{ verticalAlign: "-2px" }} /> {fmtDateTime(e.declaredAt)}</dd>
                <dt>Claims</dt><dd><Inbox size={13} style={{ verticalAlign: "-2px" }} /> {e.claimCount} received</dd>
                {e.summary && (<><dt>Summary</dt><dd className="small muted">{e.summary}</dd></>)}
              </dl>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    try {
                      if (e.status !== EVENT_STATUS.ACTIVE) await api.setEventStatus(e.id, EVENT_STATUS.ACTIVE);
                      setActiveEventId(e.id);
                      toast(`${e.name} is now the active event`, { body: "Operational screens now scope to this event.", tone: "success" });
                    } catch {
                      toast("Could not activate the event", { tone: "error" });
                    }
                  }}
                >
                  Set as active event
                </button>
                {e.status !== EVENT_STATUS.CLOSED && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      try {
                        await api.setEventStatus(e.id, EVENT_STATUS.CLOSED);
                        if (activeEventId === e.id) {
                          const nextActive = (await api.getEvents()).find((x) => x.status === EVENT_STATUS.ACTIVE);
                          setActiveEventId(nextActive?.id || "");
                        }
                        toast(`${e.name} closed`, { body: "Claims intake is closed and the event was removed from policyholder options.", tone: "info" });
                      } catch {
                        toast("Could not close the event", { tone: "error" });
                      }
                    }}
                  >
                    <FileText size={13} /> Close event
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DeclareEventModal
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        onDeclared={() => toast("CAT event declared", { body: "The event is now active and available in the selector." })}
      />
    </>
  );
}

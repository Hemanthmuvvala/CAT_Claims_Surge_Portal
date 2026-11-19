import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FilePlus2, PartyPopper } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import { SEVERITY, SEVERITY_LABELS, PERILS } from "../../constants.js";
import { Field, Loading, ErrorState, Banner, fmtDateTime } from "../../components/ui/primitives.jsx";
import { DEMO_EVENTS, HARDSHIP_OPTIONS, SEVERITY_HELP } from "../../data/seed.js";

export default function SubmitClaimPage() {
  const { session, toast, dataVersion } = useApp();
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [form, setForm] = useState({
    policyId: session?.policyId || "",
    contactName: session?.name || "",
    contactEmail: session?.email || "",
    eventId: "",
    peril: "",
    incidentDate: new Date().toISOString().slice(0, 10),
    location: "",
    description: "",
    severity: SEVERITY.MEDIUM,
    hardshipFlags: [],
    documents: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [fatal, setFatal] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    api.getEvents().then((es) => setEvents(es)).catch(() => setEvents([]));
  }, [dataVersion]);

  useEffect(() => {
    if (!events) return;
    if (form.eventId && !events.some((e) => e.id === form.eventId && e.status === "active")) {
      setForm((f) => ({ ...f, eventId: "" }));
    }
  }, [events, form.eventId]);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const toggleHardship = (flag) =>
    setForm((f) => ({
      ...f,
      hardshipFlags: f.hardshipFlags.includes(flag) ? f.hardshipFlags.filter((x) => x !== flag) : [...f.hardshipFlags, flag],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFatal("");
    try {
      const claim = await api.submitClaim({
        ...form,
        policyholderId: session?.id || null,
        documents: form.documents.split(",").map((d) => d.trim()).filter(Boolean),
      });
      setConfirmation(claim);
      toast("Claim submitted", { body: `${claim.id} — keep this reference for your records.` });
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      else setFatal("We could not submit your claim. Please try again — nothing was lost.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div style={{ maxWidth: 640, margin: "30px auto" }}>
        <div className="card card-pad" style={{ textAlign: "center", padding: "40px 32px" }}>
          <span style={{ width: 56, height: 56, borderRadius: "999px", background: "#e8f3ed", color: "#28734b", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <CheckCircle2 size={30} />
          </span>
          <h1 style={{ fontSize: 24, color: "#17365d" }}>Your claim has been received</h1>
          <p className="muted" style={{ margin: "10px 0 18px" }}>
            We know this is a difficult time. Our catastrophe response team is already reviewing your claim.
          </p>
          <div style={{ background: "#f4f7fa", border: "1px solid #d9e1e8", borderRadius: 10, padding: "14px 18px", textAlign: "left", marginBottom: 18 }}>
            <div className="small muted">Your claim reference</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1f4e79", fontFamily: "Consolas, monospace" }}>{confirmation.id}</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Received {fmtDateTime(confirmation.receivedAt)}
              {confirmation.eventId && (() => {
                const ev = events.find((e) => e.id === confirmation.eventId);
                return ev ? <> · attached to <strong style={{ color: "#202a35" }}>{ev.name} — {ev.region}</strong></> : null;
              })()}
            </div>
          </div>
          <div className="banner banner-info" style={{ textAlign: "left" }}>
            <PartyPopper size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>What happens next?</strong> Your claim enters our initial review. You can follow its progress any
              time under <strong>My Claims</strong> — we will show you a plain-language status and any next step.
            </span>
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 6 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/my-claims/${confirmation.id}`)}>Track this claim</button>
            <button className="btn btn-secondary" onClick={() => { setConfirmation(null); setForm((f) => ({ ...f, peril: "", location: "", description: "", hardshipFlags: [] })); }}>
              Submit another claim
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!events) return <Loading label="Preparing the claim form…" />;
  if (!events.length) return <ErrorState message="We could not load the current catastrophe events. Please try again later." />;

  const activeEvents = events.filter((e) => e.status === "active");

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      <div className="page-header">
        <h1>Submit a Claim</h1>
        <p className="page-desc">
          Tell us what happened and where. We only ask for what we need to start helping you — keep it in your own words.
        </p>
      </div>

      {fatal && <div className="banner banner-error" role="alert">{fatal}</div>}

      <form className="card card-pad" onSubmit={submit} noValidate>
        <div className="form-grid-2">
          <Field label="Your full name" htmlFor="f-name" error={errors.contactName}>
            <input id="f-name" className={`input${errors.contactName ? " invalid" : ""}`} value={form.contactName} onChange={set("contactName")} />
          </Field>
          <Field label="Email address" htmlFor="f-email" error={errors.contactEmail} hint="We use this only to contact you about this claim.">
            <input id="f-email" type="email" className={`input${errors.contactEmail ? " invalid" : ""}`} value={form.contactEmail} onChange={set("contactEmail")} />
          </Field>
          <Field label="Policy reference" htmlFor="f-policy" error={errors.policyId} hint="Format: POL-12345 — shown on your policy documents.">
            <input id="f-policy" className={`input${errors.policyId ? " invalid" : ""}`} value={form.policyId} onChange={set("policyId")} placeholder="POL-12345" />
          </Field>
          <Field label="Catastrophe event (if known)" htmlFor="f-event" error={errors.eventId} hint="Not sure? Leave it on 'Not sure' — we'll attach your claim to the ongoing response.">
            <select id="f-event" className={`select${errors.eventId ? " invalid" : ""}`} value={form.eventId} onChange={set("eventId")}>
              <option value="">Not sure / other</option>
              {activeEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name} — {ev.region}</option>
              ))}
            </select>
          </Field>
          <Field label="Type of damage" htmlFor="f-peril" error={errors.peril}>
            <select id="f-peril" className={`select${errors.peril ? " invalid" : ""}`} value={form.peril} onChange={set("peril")}>
              <option value="">Select…</option>
              {PERILS.map((p) => <option key={p}>{p}</option>)}
              <option value="Other">Other</option>
            </select>
          </Field>
          <Field label="Date the incident occurred" htmlFor="f-date" error={errors.incidentDate}>
            <input id="f-date" type="date" max={new Date().toISOString().slice(0, 10)} className={`input${errors.incidentDate ? " invalid" : ""}`} value={form.incidentDate} onChange={set("incidentDate")} />
          </Field>
        </div>

        <Field label="Where did the damage happen?" htmlFor="f-location" error={errors.location} hint="Street address or a clear description of the location.">
          <input id="f-location" className={`input${errors.location ? " invalid" : ""}`} value={form.location} onChange={set("location")} placeholder="e.g. Flat 402, Sagar Nagar, Visakhapatnam" />
        </Field>

        <Field label="Describe what happened" htmlFor="f-desc" error={errors.description} hint="What happened, which parts of the property are affected, and anything still getting worse.">
          <textarea id="f-desc" className={`textarea${errors.description ? " invalid" : ""}`} value={form.description} onChange={set("description")} />
        </Field>

        <Field label="How bad is the damage?" htmlFor="f-severity">
          <select id="f-severity" className="select" value={form.severity} onChange={set("severity")}>
            {Object.values(SEVERITY).map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]} — {SEVERITY_HELP[s]}</option>
            ))}
          </select>
        </Field>

        <div className="field">
          <label>Do any of these apply to your household? <span className="muted" style={{ fontWeight: 400 }}>(optional — helps us prioritise support)</span></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {HARDSHIP_OPTIONS.map((h) => (
              <label className="checkbox-row" key={h}>
                <input type="checkbox" checked={form.hardshipFlags.includes(h)} onChange={() => toggleHardship(h)} />
                {h}
              </label>
            ))}
          </div>
        </div>

        <Field label="Supporting documents (optional)" htmlFor="f-docs" hint="Comma-separated references, e.g. photos or receipts you already uploaded to your insurer app.">
          <input id="f-docs" className="input" value={form.documents} onChange={set("documents")} placeholder="DOC-2231, DOC-2232" />
        </Field>

        <Banner tone="info">
          Your claim is triaged by the insurer's CAT response team and always reviewed by a human adjuster.
          No final approval or payment decision is made automatically here.
        </Banner>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          <FilePlus2 size={15} /> {submitting ? "Submitting…" : "Submit claim"}
        </button>
      </form>
    </div>
  );
}

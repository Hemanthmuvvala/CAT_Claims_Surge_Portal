import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CloudLightning, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, KeyRound } from "lucide-react";
import { useApp } from "../context/AppContext.jsx";
import { Field } from "../components/ui/primitives.jsx";
import { DEMO_POLICYHOLDER } from "../data/seed.js";
import { login as apiLogin } from "../services/api.js";

const DEMO_PASSWORD = "demo1234";

// Email addresses the backend seed issues JWTs for.
const DEMO_HINTS = [
  { label: "CAT Response Manager", email: "maya.alvarez@catresponse.com" },
  { label: "Adjuster / Surge Team", email: "marcus.chen@catresponse.com" },
  { label: "Policyholder / Claimant", email: DEMO_POLICYHOLDER.email },
];

export default function LoginPage() {
  const { session, signIn } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!email.trim()) fe.email = "Enter your email address.";
    if (!password) fe.password = "Enter your password.";
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;

    setBusy(true);
    setError("");
    try {
      // JWT exchange against the backend identity service (POST /auth/login).
      const account = await apiLogin(email.trim().toLowerCase(), password);
      signIn(account);
      navigate(account.home);
    } catch {
      setError("Invalid email or password. Please try again.");
      setBusy(false);
      return;
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-left">
        <div className="row" style={{ gap: 12, marginBottom: 26 }}>
          <span className="brand-mark" style={{ width: 42, height: 42 }}>
            <CloudLightning size={22} />
          </span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.04em" }}>CAT RESPONSE</div>
            <div style={{ fontSize: 12.5, opacity: 0.75 }}>Claims Surge Portal</div>
          </div>
        </div>
        <h1 style={{ fontSize: 30, lineHeight: 1.2, marginBottom: 12 }}>
          Keep the queue sane when catastrophe strikes.
        </h1>
        <p style={{ opacity: 0.78, fontSize: 14.5, maxWidth: 420 }}>
          Triage thousands of claims in minutes, protect vulnerable customers first, and coordinate
          surge teams — with human reviewers always in control of coverage decisions.
        </p>
      </div>

      <div className="login-right">
        <div className="login-card">
          <h2 style={{ fontSize: 21, color: "#17365d", marginBottom: 4 }}>Sign in</h2>
          <p className="muted" style={{ marginBottom: 18, fontSize: 13.5 }}>
            Use your work or policyholder account to continue.
          </p>

          {error && (
            <div className="banner banner-error" role="alert" style={{ marginBottom: 14 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            <Field label="Email address" htmlFor="login-email" error={fieldErrors.email}>
              <div style={{ position: "relative" }}>
                <Mail size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#5b6573", pointerEvents: "none" }} />
                <input
                  id="login-email"
                  className={`input${fieldErrors.email ? " invalid" : ""}`}
                  style={{ paddingLeft: 32 }}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); setFieldErrors((f) => ({ ...f, email: undefined })); }}
                  placeholder="name@company.com"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="login-password" error={fieldErrors.password}>
              <div style={{ position: "relative" }}>
                <Lock size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#5b6573", pointerEvents: "none" }} />
                <input
                  id="login-password"
                  className={`input${fieldErrors.password ? " invalid" : ""}`}
                  style={{ paddingLeft: 32, paddingRight: 36 }}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); setFieldErrors((f) => ({ ...f, password: undefined })); }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#5b6573", padding: 4, display: "flex" }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <div className="row-between" style={{ marginBottom: 16 }}>
              <label className="small" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" /> Remember me
              </label>
              <a href="#forgot" className="small" onClick={(e) => e.preventDefault()}>Forgot password?</a>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Signing in…" : <>Sign in <ArrowRight size={15} /></>}
            </button>
          </form>

          <div style={{ marginTop: 18, borderTop: "1px solid #d9e1e8", paddingTop: 14 }}>
            <div className="small" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <KeyRound size={13} /> Demo access — password is <span className="mono">{DEMO_PASSWORD}</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {DEMO_HINTS.map((h) => (
                <button
                  key={h.email}
                  type="button"
                  className="row-between small"
                  style={{ background: "#f4f7fa", border: "1px solid #d9e1e8", borderRadius: 8, padding: "7px 10px", cursor: "pointer", textAlign: "left", width: "100%" }}
                  onClick={() => { setEmail(h.email); setPassword(DEMO_PASSWORD); setError(""); setFieldErrors({}); }}
                >
                  <span style={{ fontWeight: 600 }}>{h.label}</span>
                  <span className="mono muted">{h.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

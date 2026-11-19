import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";

export function Modal({ open, title, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="topbar-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-overlay" onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-header">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="topbar-icon-btn" style={{ color: "#fff" }} onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </aside>
    </>,
    document.body
  );
}

export function Dropdown({ label, children, align = "left", buttonClass = "", buttonContent }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button type="button" className={buttonClass} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {buttonContent}
        {label && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {label} <ChevronDown size={13} />
          </span>
        )}
      </button>
      {open && (
        <div className="dropdown-menu" style={align === "right" ? { right: 0 } : { left: 0 }} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function ToastStack() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return createPortal(
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone || ""}`} role="status">
          {t.tone === "error" ? (
            <AlertTriangle size={16} color="#b42318" style={{ flexShrink: 0, marginTop: 1 }} />
          ) : t.tone === "warn" ? (
            <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          ) : t.tone === "info" ? (
            <Info size={16} color="#1f4e79" style={{ flexShrink: 0, marginTop: 1 }} />
          ) : (
            <CheckCircle2 size={16} color="#28734b" style={{ flexShrink: 0, marginTop: 1 }} />
          )}
          <div style={{ flex: 1 }}>
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="small muted">{t.body}</div>}
          </div>
          <button className="topbar-icon-btn" style={{ padding: 2 }} onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

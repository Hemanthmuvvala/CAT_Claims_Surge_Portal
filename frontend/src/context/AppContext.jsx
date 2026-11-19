import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import * as api from "../services/api.js";
import { ROLES } from "../constants.js";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("ins04-session")) || null;
    } catch {
      return null;
    }
  });
  const [activeEventId, setActiveEventId] = useState("evt-varuna");
  const [toasts, setToasts] = useState([]);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => api.subscribe(() => setDataVersion((v) => v + 1)), []);

  useEffect(() => {
    if (session) sessionStorage.setItem("ins04-session", JSON.stringify(session));
    else sessionStorage.removeItem("ins04-session");
  }, [session]);

  // Bootstrap the active event from the real backend: the default slug only
  // makes sense until the first events load — then pin the busiest active one.
  useEffect(() => {
    let on = true;
    api
      .getEvents()
      .then((es) => {
        if (!on || !es.length) return;
        setActiveEventId((cur) =>
          es.some((e) => e.id === cur) ? cur : es.find((e) => e.status === "active")?.id ?? es[0].id
        );
      })
      .catch(() => { /* backend offline — pages show their own error states */ });
    return () => { on = false; };
  }, []);

  const signIn = useCallback((s) => setSession(s), []);
  const signOut = useCallback(() => {
    api.logout(); // clears the stored JWT
    setSession(null);
  }, []);

  const toast = useCallback((title, opts = {}) => {
    const id = `t-${Date.now()}-${Math.random()}`;
    setToasts((ts) => [...ts, { id, title, ...opts }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), opts.duration || 4600);
  }, []);
  const dismissToast = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const value = useMemo(
    () => ({
      session,
      role: session?.role ?? null,
      activeEventId,
      setActiveEventId,
      signIn,
      signOut,
      toast,
      dismissToast,
      toasts,
      dataVersion,
      isManager: session?.role === ROLES.MANAGER,
      isAdjuster: session?.role === ROLES.ADJUSTER,
      isPolicyholder: session?.role === ROLES.POLICYHOLDER,
    }),
    [session, activeEventId, toasts, dataVersion, signIn, signOut, toast, dismissToast]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

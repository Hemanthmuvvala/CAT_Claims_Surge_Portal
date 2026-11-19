import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useState } from "react";
import { useApp } from "./context/AppContext.jsx";
import { ROLES } from "./constants.js";
import Sidebar from "./components/layout/Sidebar.jsx";
import { TopBar } from "./components/layout/TopBar.jsx";
import { ToastStack } from "./components/ui/overlays.jsx";
import LoginPage from "./pages/LoginPage.jsx";

import DashboardPage from "./pages/manager/DashboardPage.jsx";
import QueuePage from "./pages/manager/QueuePage.jsx";
import ClustersPage from "./pages/manager/ClustersPage.jsx";
import WorkloadPage from "./pages/manager/WorkloadPage.jsx";
import EventsPage from "./pages/manager/EventsPage.jsx";
import IntakePage from "./pages/manager/IntakePage.jsx";
import ClaimDetailPage from "./pages/shared/ClaimDetailPage.jsx";
import AdjusterQueuePage from "./pages/adjuster/AdjusterQueuePage.jsx";
import AdjusterWorkloadPage from "./pages/adjuster/AdjusterWorkloadPage.jsx";
import AdjusterClustersPage from "./pages/adjuster/AdjusterClustersPage.jsx";
import SubmitClaimPage from "./pages/policyholder/SubmitClaimPage.jsx";
import MyClaimsPage from "./pages/policyholder/MyClaimsPage.jsx";
import ClaimStatusPage from "./pages/policyholder/ClaimStatusPage.jsx";

function homeFor(role) {
  if (role === ROLES.MANAGER) return "/dashboard";
  if (role === ROLES.ADJUSTER) return "/my-queue";
  return "/my-claims";
}

function Shell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`app-shell${sidebarOpen ? " nav-open" : ""}`}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-area">
        <TopBar onOpenSidebar={() => setSidebarOpen((o) => !o)} />
        <main className="content">{children}</main>
      </div>
      <ToastStack />
      {sidebarOpen && (
        <div className="drawer-overlay nav-overlay" style={{ zIndex: 35 }} onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
}

export default function App() {
  const { session, role } = useApp();
  const location = useLocation();

  if (!location.pathname.startsWith("/login") && !session) {
    return <Navigate to="/login" replace />;
  }

  const managerOnly = (el) =>
    !session ? <Navigate to="/login" replace /> : role === ROLES.MANAGER ? <Shell>{el}</Shell> : <Navigate to={homeFor(role)} replace />;
  const adjusterOnly = (el) =>
    !session ? <Navigate to="/login" replace /> : role === ROLES.ADJUSTER ? <Shell>{el}</Shell> : <Navigate to={homeFor(role)} replace />;
  const policyholderOnly = (el) =>
    !session ? <Navigate to="/login" replace /> : role === ROLES.POLICYHOLDER ? <Shell>{el}</Shell> : <Navigate to={homeFor(role)} replace />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* CAT Response Manager */}
      <Route path="/dashboard" element={managerOnly(<DashboardPage />)} />
      <Route path="/queue" element={managerOnly(<QueuePage />)} />
      <Route path="/clusters" element={managerOnly(<ClustersPage />)} />
      <Route path="/workload" element={managerOnly(<WorkloadPage />)} />
      <Route path="/events" element={managerOnly(<EventsPage />)} />
      <Route path="/intake" element={managerOnly(<IntakePage />)} />

      {/* Shared claim detail (manager + adjuster) */}
      <Route
        path="/claims/:claimId"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : role === ROLES.POLICYHOLDER ? (
            <Navigate to="/my-claims" replace />
          ) : (
            <Shell>
              <ClaimDetailPage />
            </Shell>
          )
        }
      />

      {/* Adjuster */}
      <Route path="/my-queue" element={adjusterOnly(<AdjusterQueuePage />)} />
      <Route path="/my-workload" element={adjusterOnly(<AdjusterWorkloadPage />)} />
      <Route path="/my-clusters" element={adjusterOnly(<AdjusterClustersPage />)} />

      {/* Policyholder */}
      <Route path="/submit" element={policyholderOnly(<SubmitClaimPage />)} />
      <Route path="/my-claims" element={policyholderOnly(<MyClaimsPage />)} />
      <Route path="/my-claims/:claimId" element={policyholderOnly(<ClaimStatusPage />)} />

      <Route path="*" element={<Navigate to={session ? homeFor(role) : "/login"} replace />} />
    </Routes>
  );
}

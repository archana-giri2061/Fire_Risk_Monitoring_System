/**
 * App.tsx — Root router
 * All pages are lazy-loaded for faster initial load.
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import "./styles/theme.css";

const Landing     = lazy(() => import("./pages/LandingPage"));
const Dashboard   = lazy(() => import("./pages/Home"));
const Forecast    = lazy(() => import("./pages/Forecast"));
const IoTMonitor  = lazy(() => import("./pages/Iotmonitor"));
const Alerts      = lazy(() => import("./pages/alerts"));
const MLAnalytics = lazy(() => import("./pages/MLAnalytics"));

function Loader() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#091c18", gap: 12, color: "rgba(255,255,255,.4)", fontSize: 14 }}>
      <div className="spinner" />
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/"             element={<Landing />} />
            <Route path="/home"         element={<Dashboard />} />
            <Route path="/forecast"     element={<Forecast />} />
            <Route path="/iot"          element={<IoTMonitor />} />
            <Route path="/alerts"       element={<Alerts />} />
            <Route path="/ml-analytics" element={<MLAnalytics />} />
            <Route path="*"             element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}
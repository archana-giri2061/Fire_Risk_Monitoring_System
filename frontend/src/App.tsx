// Root router for the entire application.
// All pages are lazy-loaded so the initial bundle only contains the router
// and the shared theme — each page's code is fetched on first navigation to that route.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import "./styles/theme.css"; // global design tokens, resets, and utility classes

// each import() call creates a separate code-split chunk that loads on demand
const Landing     = lazy(() => import("./pages/LandingPage"));  // "/" — public marketing/intro page
const Dashboard   = lazy(() => import("./pages/Home"));          // "/home" — live weather and risk overview
const Forecast    = lazy(() => import("./pages/Forecast"));      // "/forecast" — 7-day ML risk forecast
const IoTMonitor  = lazy(() => import("./pages/Iotmonitor"));    // "/iot" — live ESP32 sensor readings
const Alerts      = lazy(() => import("./pages/alerts"));        // "/alerts" — alert history and email controls
const MLAnalytics = lazy(() => import("./pages/MLAnalytics"));   // "/ml-analytics" — model metrics and charts

// full-screen loading indicator shown by Suspense while a lazy page chunk is being fetched.
// uses the shared .spinner class from theme.css so the animation matches the rest of the app.
function Loader() {
  return (
    <div style={{
      minHeight:      "100vh",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      background:     "#091c18",   // matches --bg-base so there is no colour flash during load
      gap:            12,
      color:          "rgba(255,255,255,.4)",
      fontSize:       14,
    }}>
      <div className="spinner" />
      Loading...
    </div>
  );
}

export default function App() {
  return (
    // BrowserRouter enables client-side navigation using the HTML5 History API
    <BrowserRouter>
      {/* app-shell ensures the dark background fills the full viewport at all times */}
      <div className="app-shell">
        {/* Suspense catches any lazy page that has not loaded yet and shows Loader in its place */}
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/"             element={<Landing />} />
            <Route path="/home"         element={<Dashboard />} />
            <Route path="/forecast"     element={<Forecast />} />
            <Route path="/iot"          element={<IoTMonitor />} />
            <Route path="/alerts"       element={<Alerts />} />
            <Route path="/ml-analytics" element={<MLAnalytics />} />
            {/* catch-all redirect — any unrecognised URL sends the user back to the landing page */}
            <Route path="*"             element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Home";
import Landing from "./pages/LandingPage";
import Forecast from "./pages/Forecast";
import IoTMonitor from "./pages/Iotmonitor";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/"         element={<Landing />} />
          <Route path="/home"     element={<Dashboard />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/iot"      element={<IoTMonitor />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
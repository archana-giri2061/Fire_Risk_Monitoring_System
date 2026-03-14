import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Readings from "./pages/Readings";
import Forecast from "./pages/Forecast";
import Notifications from "./pages/Notifications";
import LandingPage from "./pages/LandingPage";

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<LandingPage />} />
           <Route path="/Home" element={<Home />} />
          <Route path="/readings" element={<Readings />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/notifications" element={<Notifications />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
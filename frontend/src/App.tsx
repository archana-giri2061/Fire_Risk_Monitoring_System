import { HashRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Readings from "./pages/Readings";
import Forecast from "./pages/Forecast";
import Notifications from "./pages/Notifications";

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/readings" element={<Readings />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/notifications" element={<Notifications />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
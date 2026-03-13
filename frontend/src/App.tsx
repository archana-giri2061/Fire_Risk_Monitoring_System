import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";

const Home = lazy(() => import("./pages/Home"));
const Readings = lazy(() => import("./pages/Readings"));
const Forecast = lazy(() => import("./pages/Forecast"));
const Notifications = lazy(() => import("./pages/Notifications"));

export default function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/readings" element={<Readings />} />
        <Route path="/forecast" element={<Forecast />} />
        <Route path="/notifications" element={<Notifications />} />
      </Routes>
    </Suspense>
  );
}
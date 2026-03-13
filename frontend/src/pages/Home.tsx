import HeroSection from "../components/HeroSection";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const regionRisk = [
  { region: "Kathmandu", risk: 40 },
  { region: "Chitwan", risk: 68 },
  { region: "Pokhara", risk: 52 },
  { region: "Dang", risk: 79 },
  { region: "Banke", risk: 84 },
];

export default function Home() {
  return (
    <div className="page">
      <HeroSection />

      <section className="stats-grid">
        <div className="stat-card">
          <p>Total Sensors</p>
          <h3>128</h3>
          <span>+12 active today</span>
        </div>
        <div className="stat-card">
          <p>Forecast Areas</p>
          <h3>24</h3>
          <span>Updated every hour</span>
        </div>
        <div className="stat-card">
          <p>Alerts Sent</p>
          <h3>16</h3>
          <span>Last 24 hours</span>
        </div>
        <div className="stat-card">
          <p>Highest Risk</p>
          <h3>84%</h3>
          <span>Banke region</span>
        </div>
      </section>

      <section className="content-grid">
        <div className="glass-card chart-card">
          <div className="section-head">
            <h3>Region Risk Comparison</h3>
            <button className="soft-btn">Weekly</button>
          </div>

          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={regionRisk}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8e7d2" />
                <XAxis dataKey="region" stroke="#dce9d9" />
                <YAxis stroke="#dce9d9" />
                <Tooltip />
                <Bar dataKey="risk" fill="#4D774E" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card side-card">
          <div className="section-head">
            <h3>Hero Image Space</h3>
            <button className="soft-btn">Replace Later</button>
          </div>

          <div className="image-placeholder medium">
            <span>Add forest / map / wildfire image here</span>
          </div>
        </div>
      </section>
    </div>
  );
}
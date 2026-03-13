import HeroSection from "../components/HeroSection";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const readingsTrend = [
  { day: "Mon", temperature: 26, humidity: 70, wind: 12 },
  { day: "Tue", temperature: 28, humidity: 64, wind: 15 },
  { day: "Wed", temperature: 30, humidity: 58, wind: 18 },
  { day: "Thu", temperature: 31, humidity: 55, wind: 21 },
  { day: "Fri", temperature: 29, humidity: 60, wind: 14 },
  { day: "Sat", temperature: 32, humidity: 50, wind: 23 },
  { day: "Sun", temperature: 33, humidity: 47, wind: 24 },
];

const regionRisk = [
  { region: "Kathmandu", risk: 40 },
  { region: "Chitwan", risk: 68 },
  { region: "Pokhara", risk: 52 },
  { region: "Dang", risk: 79 },
  { region: "Banke", risk: 84 },
];

const alertBreakdown = [
  { name: "Low", value: 35 },
  { name: "Moderate", value: 40 },
  { name: "High", value: 25 },
];

const COLORS = ["#9DC88D", "#4D774E", "#F1B24A"];

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
            <h3>Environmental Trend</h3>
            <button className="soft-btn">Details</button>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={readingsTrend}>
              <defs>
                <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F1B24A" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#F1B24A" stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="humidityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9DC88D" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#9DC88D" stopOpacity={0.08} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#d8e7d2" />
              <XAxis dataKey="day" stroke="#dce9d9" />
              <YAxis stroke="#dce9d9" />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="temperature"
                stroke="#F1B24A"
                fill="url(#tempFill)"
                strokeWidth={3}
              />
              <Area
                type="monotone"
                dataKey="humidity"
                stroke="#9DC88D"
                fill="url(#humidityFill)"
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
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

      <section className="content-grid second-grid">
        <div className="glass-card chart-card">
          <div className="section-head">
            <h3>Region Risk Comparison</h3>
            <button className="soft-btn">Weekly</button>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={regionRisk}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8e7d2" />
              <XAxis dataKey="region" stroke="#dce9d9" />
              <YAxis stroke="#dce9d9" />
              <Tooltip />
              <Bar dataKey="risk" fill="#4D774E" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card pie-card">
          <div className="section-head">
            <h3>Alert Distribution</h3>
            <button className="soft-btn">Overview</button>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={alertBreakdown}
                dataKey="value"
                nameKey="name"
                outerRadius={95}
                innerRadius={55}
              >
                {alertBreakdown.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
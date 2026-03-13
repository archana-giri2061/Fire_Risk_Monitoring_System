import { BellRing, Flame, MapPinned, ShieldAlert } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-overlay" />

      <div className="hero-left">
        <span className="hero-tag">Real-Time Forest Monitoring</span>
        <h2>
          Protecting forests with <span>smart wildfire alerts</span>
        </h2>
        <p>
          वन दृष्टि helps monitor live sensor readings, forecast environmental
          conditions, and send instant alerts when wildfire risk increases.
        </p>

        <div className="hero-buttons">
          <button className="primary-btn">Explore Dashboard</button>
          <button className="secondary-btn">View Alerts</button>
        </div>

        <div className="hero-mini-cards">
          <div className="mini-card">
            <Flame size={18} />
            <div>
              <h4>Risk Tracking</h4>
              <p>Live wildfire monitoring</p>
            </div>
          </div>

          <div className="mini-card">
            <BellRing size={18} />
            <div>
              <h4>Alert Engine</h4>
              <p>Instant community alerts</p>
            </div>
          </div>

          <div className="mini-card">
            <MapPinned size={18} />
            <div>
              <h4>Forecast Zones</h4>
              <p>Location based insights</p>
            </div>
          </div>

          <div className="mini-card">
            <ShieldAlert size={18} />
            <div>
              <h4>Preparedness</h4>
              <p>Actionable warnings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-right">
        <div className="image-placeholder large">
          <span>Add Background / Forest Image Here</span>
        </div>

        <div className="floating-card top-card">
          <p>Today Risk Level</p>
          <h3>Moderate</h3>
        </div>

        <div className="floating-card bottom-card">
          <p>Latest Alert</p>
          <h3>Dry wind detected</h3>
        </div>
      </div>
    </section>
  );
}
import "../css/footer.css";

export default function Footer() {
  return (
    <footer className="footer">

      <div className="footer__container">

        {/* LEFT SECTION */}
        <div className="footer__brand">
          <h2>वन दृष्टि</h2>
          <p>
            AI-powered wildfire risk monitoring system designed to
            track environmental conditions and provide early alerts
            to help protect forests and communities.
          </p>
        </div>

        {/* QUICK LINKS */}
        <div className="footer__links">
          <h3>Quick Links</h3>
          <a href="#home">Home</a>
          <a href="#readings">Readings</a>
          <a href="#forecast">Forecast</a>
          <a href="#notifications">Notifications</a>
        </div>

        {/* SYSTEM INFO */}
        <div className="footer__system">
          <h3>System</h3>
          <p>Real-time Monitoring</p>
          <p>Weather Data Analysis</p>
          <p>Fire Risk Prediction</p>
          <p>Emergency Alerts</p>
        </div>

      </div>

      <div className="footer__bottom">
        <p>© 2026 वन दृष्टि | Forest Fire Risk Monitoring System</p>
      </div>

    </footer>
  );
}
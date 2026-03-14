import Navbar from "../components/Navbar";
import Footer from "../components/footer";
import "../css/landingPage.css";
import "../css/footer.css";
import fireImage from "../assets/BackgroundImage.jpg";
import { Link } from "react-router-dom";
export default function LandingPage() {
  return (
    <div className="landingPage">
      <Navbar />

      <section className="heroSection" id="home">
        <div className="heroSection__overlay"></div>

        <div className="heroSection__content">
          <span className="heroSection__tag">
            Early Detection • Smart Monitoring • Fire Risk Alerts
          </span>

          <h2>वन दृष्टि</h2>

          <h3>AI-Powered Forest Fire Risk Monitoring System</h3>

          <p>
            Monitor real-time environmental conditions, forecast wildfire danger,
            and receive timely early warning alerts for forests and communities.
          </p>

         <div className="heroSection__buttons">
            <Link to="/home" className="heroSection__primaryBtn">
                Explore Dashboard
            </Link>

            <Link to="/forecast" className="heroSection__secondaryBtn">
                View Forecast
            </Link>
</div>
        </div>

        <div className="heroSection__imageCard">
          <img
            src={fireImage}
            alt="Forest Fire Monitoring"
            className="heroSection__image"
          />
        </div>
      </section>

      <section className="landingInfo">
        <div className="landingInfo__card" id="readings">
          <h4>Live Readings</h4>
          <p>
            Track real-time temperature, humidity, wind speed, rainfall,
            and other environmental conditions.
          </p>
        </div>

        <div className="landingInfo__card" id="forecast">
          <h4>Forecast Insights</h4>
          <p>
            View predicted fire risk trends using weather forecast data
            and intelligent machine learning analysis.
          </p>
        </div>

        <div className="landingInfo__card">
          <h4>Smart Alerts</h4>
          <p>
            Receive fast notifications when fire risk reaches dangerous levels
            so action can be taken early.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
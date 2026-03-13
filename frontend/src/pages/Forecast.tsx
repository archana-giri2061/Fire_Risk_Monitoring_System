const forecastRows = [
  { day: "Monday", temp: "30°C", humidity: "55%", wind: "18 km/h", risk: "Moderate" },
  { day: "Tuesday", temp: "32°C", humidity: "49%", wind: "22 km/h", risk: "High" },
  { day: "Wednesday", temp: "33°C", humidity: "45%", wind: "25 km/h", risk: "High" },
  { day: "Thursday", temp: "29°C", humidity: "59%", wind: "16 km/h", risk: "Moderate" },
  { day: "Friday", temp: "27°C", humidity: "66%", wind: "11 km/h", risk: "Low" },
];

export default function Forecast() {
  return (
    <div className="page narrow-page">
      <div className="page-title-block">
        <h2>Forecast Overview</h2>
        <p>Predicted weather and wildfire risk outlook for upcoming days.</p>
      </div>

      <div className="glass-card forecast-banner">
        <div>
          <span className="hero-tag">Upcoming Risk Outlook</span>
          <h3>Elevated fire danger expected mid-week</h3>
          <p>High temperature, reduced humidity, and dry winds may increase wildfire probability.</p>
        </div>

        <div className="image-placeholder medium-banner">
          <span>Add forecast image / map</span>
        </div>
      </div>

      <div className="glass-card table-card">
        <div className="section-head">
          <h3>5 Day Forecast Table</h3>
          <button className="secondary-btn small">Refresh</button>
        </div>

        <div className="table-wrap">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Temperature</th>
                <th>Humidity</th>
                <th>Wind Speed</th>
                <th>Predicted Risk</th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{row.temp}</td>
                  <td>{row.humidity}</td>
                  <td>{row.wind}</td>
                  <td>
                    <span className={`status-pill ${row.risk.toLowerCase()}`}>
                      {row.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
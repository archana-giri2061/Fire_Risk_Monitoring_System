const readingData = [
  { id: 1, station: "Sensor-A01", temp: "31°C", humidity: "49%", wind: "22 km/h", status: "High" },
  { id: 2, station: "Sensor-A02", temp: "28°C", humidity: "58%", wind: "14 km/h", status: "Moderate" },
  { id: 3, station: "Sensor-B11", temp: "25°C", humidity: "67%", wind: "10 km/h", status: "Low" },
  { id: 4, station: "Sensor-C08", temp: "33°C", humidity: "43%", wind: "24 km/h", status: "High" },
  { id: 5, station: "Sensor-D02", temp: "27°C", humidity: "62%", wind: "12 km/h", status: "Moderate" },
];

export default function Readings() {
  return (
    <div className="page narrow-page">
      <div className="page-title-block">
        <h2>Live Readings</h2>
        <p>Current environmental sensor values across active monitoring stations.</p>
      </div>

      <div className="glass-card table-card">
        <div className="section-head">
          <h3>Sensor Data Table</h3>
          <button className="primary-btn small">Export</button>
        </div>

        <div className="table-wrap">
          <table className="custom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Station</th>
                <th>Temperature</th>
                <th>Humidity</th>
                <th>Wind</th>
                <th>Risk Status</th>
              </tr>
            </thead>
            <tbody>
              {readingData.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.station}</td>
                  <td>{item.temp}</td>
                  <td>{item.humidity}</td>
                  <td>{item.wind}</td>
                  <td>
                    <span className={`status-pill ${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dual-grid">
        <div className="glass-card">
          <h3 className="card-title">Reading Snapshot</h3>
          <div className="image-placeholder small-box">
            <span>Add chart / camera / station image</span>
          </div>
        </div>

        <div className="glass-card">
          <h3 className="card-title">Station Notes</h3>
          <ul className="notes-list">
            <li>Sensor-A01 shows dry conditions and increasing wind speed.</li>
            <li>Sensor-C08 has the highest current wildfire risk score.</li>
            <li>Humidity drop pattern observed in western region stations.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
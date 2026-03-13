const notifications = [
  {
    title: "High Risk Alert - Banke",
    message: "Temperature and dry wind pattern indicate elevated wildfire risk.",
    time: "5 min ago",
    level: "high",
  },
  {
    title: "Moderate Risk - Chitwan",
    message: "Humidity dropped below expected threshold this afternoon.",
    time: "25 min ago",
    level: "moderate",
  },
  {
    title: "System Update",
    message: "Latest forecast synced successfully from weather service.",
    time: "1 hr ago",
    level: "low",
  },
];

export default function Notifications() {
  return (
    <div className="page narrow-page">
      <div className="page-title-block">
        <h2>Notification Bar</h2>
        <p>All wildfire alerts, system updates, and environmental warnings.</p>
      </div>

      <div className="notifications-list">
        {notifications.map((item, index) => (
          <div className={`glass-card notification-item ${item.level}`} key={index}>
            <div className="notification-left">
              <div className={`dot ${item.level}`} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
              </div>
            </div>

            <div className="notification-right">
              <span>{item.time}</span>
              <button className="soft-btn">View</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
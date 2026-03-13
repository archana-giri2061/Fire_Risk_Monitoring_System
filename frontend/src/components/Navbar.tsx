import { Bell, Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "nav-link active" : "nav-link";

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand-wrap">
          <div className="logo-box">
            <span>LOGO</span>
          </div>

          <div className="brand-text">
            <h1>वन दृष्टि</h1>
            <p>Wildfire Risk Monitoring System</p>
          </div>
        </div>

        <nav className="desktop-nav">
          <NavLink to="/" className={navClass}>
            Home
          </NavLink>
          <NavLink to="/readings" className={navClass}>
            Readings
          </NavLink>
          <NavLink to="/forecast" className={navClass}>
            Forecast
          </NavLink>
          <NavLink to="/notifications" className={navClass}>
            Notification Bar
          </NavLink>
        </nav>

        <div className="nav-actions">
          <button className="icon-btn">
            <Bell size={18} />
          </button>

          <button className="mobile-menu-btn" onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mobile-nav">
          <NavLink to="/" className={navClass} onClick={() => setOpen(false)}>
            Home
          </NavLink>
          <NavLink to="/readings" className={navClass} onClick={() => setOpen(false)}>
            Readings
          </NavLink>
          <NavLink to="/forecast" className={navClass} onClick={() => setOpen(false)}>
            Forecast
          </NavLink>
          <NavLink to="/notifications" className={navClass} onClick={() => setOpen(false)}>
            Notification Bar
          </NavLink>
        </div>
      )}
    </header>
  );
}
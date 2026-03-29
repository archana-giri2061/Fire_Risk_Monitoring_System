import { Bell } from "lucide-react";
import "../css/navbar.css";
import logo from "../assets/logo.png";
import { Link } from "react-router-dom";
export default function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar__left">
        <Link to ="/home" className="navbar__logoBox"><img src={logo} alt="Logo"/></Link>
      </div>

      <nav className="navbar__center">
        <a href="home" className="active">Home</a>
        <a href="readings">Readings</a>
        <a href="forecast">Forecast</a>
      </nav>

     <div className="navbar__right">
      <Link to="/notifications" className="navbar__bell" aria-label="Notifications">
        <Bell size={20} />
        <span className="navbar__dot"></span>
     </Link>
    </div>
    </header>
  );
}
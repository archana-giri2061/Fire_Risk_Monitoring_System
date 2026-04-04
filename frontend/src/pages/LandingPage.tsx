/* eslint-disable react-hooks/refs */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Flame, BellRing, ShieldAlert, Wind, Thermometer, Droplets,
  Brain, AlertTriangle, ArrowRight, Check,
  Database, Cpu, Globe, Activity, Mail, TreePine,
} from "lucide-react";
import logo from "../assets/logo.png";

// ── animated counter ──────────────────────────────────────────────────────
function useCounter(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration, start]);
  return count;
}

// ── intersection observer ─────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const [inView, setInView] = useState(false);
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(node);
  }, [threshold]);
  return { ref, inView };
}

// ── risk badge ────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: "Low" | "Moderate" | "High" | "Extreme" }) {
  const map = {
    Low:      { color: "#9DC88D", bg: "rgba(157,200,141,0.18)", label: "🟢 Low" },
    Moderate: { color: "#F1B24A", bg: "rgba(241,178,74,0.18)",  label: "🟡 Moderate" },
    High:     { color: "#ff8c42", bg: "rgba(255,140,66,0.18)",  label: "🟠 High" },
    Extreme:  { color: "#ff4d4d", bg: "rgba(255,77,77,0.18)",   label: "🔴 Extreme" },
  };
  const s = map[level];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 999,
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}44`,
      fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

// ── main component ────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const statsRef = useInView();
  const featRef  = useInView();
  const howRef   = useInView();

  const c1 = useCounter(60,  1800, statsRef.inView);
  const c2 = useCounter(7,   1200, statsRef.inView);
  const c3 = useCounter(98,  2000, statsRef.inView);
  const c4 = useCounter(4,   1000, statsRef.inView);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onHoverUp   = (e: React.MouseEvent<HTMLElement>) =>
    (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
  const onHoverDown = (e: React.MouseEvent<HTMLElement>) =>
    (e.currentTarget as HTMLElement).style.transform = "translateY(0)";

  return (
    <div style={{
      minHeight: "100vh", fontFamily: "'Inter', sans-serif", overflowX: "hidden",
      background: "linear-gradient(158deg,#091c18 0%,#164A41 52%,#1a3d35 100%)",
    }}>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "14px 20px",
        background: scrollY > 60 ? "rgba(8,24,20,0.95)" : "transparent",
        backdropFilter: scrollY > 60 ? "blur(20px)" : "none",
        borderBottom: scrollY > 60 ? "1px solid rgba(255,255,255,0.07)" : "none",
        transition: "all 0.4s ease",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex",
                      alignItems: "center", justifyContent: "space-between" }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={logo} alt="वन दृष्टि"
              style={{ height: 42, width: 42, borderRadius: 12, objectFit: "cover" }} />
            <div>
              <div style={{ fontFamily: "'Noto Sans Devanagari',sans-serif", fontSize: 18,
                            fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                वन दृष्टि
              </div>
              <div style={{ fontSize: 9, color: "#9DC88D", letterSpacing: 1, textTransform: "uppercase" }}>
                Forest Fire Monitor
              </div>
            </div>
          </div>

          {/* Desktop nav links */}
          <div className="nav-links" style={{ display: "flex", gap: 4 }}>
            {["Features", "How It Works", "Technology", "Alerts"].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
                style={{ padding: "10px 16px", borderRadius: 999, fontSize: 14,
                         color: "rgba(255,255,255,0.75)", textDecoration: "none", transition: "background 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >{item}</a>
            ))}
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link to="/home" className="nav-cta" style={{
              padding: "10px 22px", borderRadius: 999,
              background: "linear-gradient(135deg,#F1B24A,#ffd278)",
              color: "#1d241e", fontWeight: 800, fontSize: 13,
              textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 8px 28px rgba(241,178,74,0.32)", transition: "transform 0.2s",
            }} onMouseEnter={onHoverUp} onMouseLeave={onHoverDown}>
              Dashboard <ArrowRight size={13} />
            </Link>

            {/* Hamburger */}
            <button className="hamburger" onClick={() => setMenuOpen(p => !p)} style={{
              display: "none", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#fff",
              flexDirection: "column", gap: 5, alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ width: 20, height: 2, background: "#fff", borderRadius: 2,
                             transform: menuOpen ? "rotate(45deg) translateY(7px)" : "none", transition: "0.3s" }} />
              <span style={{ width: 20, height: 2, background: "#fff", borderRadius: 2,
                             opacity: menuOpen ? 0 : 1, transition: "0.3s" }} />
              <span style={{ width: 20, height: 2, background: "#fff", borderRadius: 2,
                             transform: menuOpen ? "rotate(-45deg) translateY(-7px)" : "none", transition: "0.3s" }} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "rgba(8,24,20,0.97)", backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 4,
          }}>
            {["Features", "How It Works", "Technology", "Alerts"].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
                onClick={() => setMenuOpen(false)}
                style={{ padding: "13px 16px", borderRadius: 12, fontSize: 15,
                         color: "rgba(255,255,255,0.8)", textDecoration: "none",
                         background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {item}
              </a>
            ))}
            <Link to="/home" onClick={() => setMenuOpen(false)} style={{
              marginTop: 8, padding: "13px 16px", borderRadius: 12, fontSize: 15,
              background: "linear-gradient(135deg,#F1B24A,#ffd278)", color: "#1d241e",
              fontWeight: 800, textDecoration: "none", textAlign: "center",
            }}>
              Open Dashboard
            </Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section style={{
        minHeight: "100vh", position: "relative",
        display: "flex", alignItems: "center",
        padding: "110px 20px 80px",
        background: `
          radial-gradient(circle at 18% 52%, rgba(157,200,141,0.13) 0%, transparent 48%),
          radial-gradient(circle at 82% 18%, rgba(241,178,74,0.10) 0%, transparent 40%),
          radial-gradient(circle at 60% 82%, rgba(255,77,77,0.06) 0%, transparent 32%),
          linear-gradient(158deg,#091c18 0%,#164A41 52%,#1a3d35 100%)`,
        overflow: "hidden",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", width: "100%", position: "relative", zIndex: 2 }}>
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>

            {/* Left */}
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "7px 16px", borderRadius: 999, marginBottom: 22,
                background: "rgba(255,77,77,0.12)", border: "1px solid rgba(255,77,77,0.25)",
                color: "#ff8080", fontSize: 12, fontWeight: 600,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%",
                               background: "#ff4d4d", animation: "pulse 2s infinite" }} />
                Live Forest Monitoring Active
              </div>

              <h1 style={{ fontSize: "clamp(2.2rem,5vw,4.2rem)", lineHeight: 1.05,
                           fontWeight: 900, color: "#fff", marginBottom: 20, letterSpacing: "-1px" }}>
                Detect Wildfire Risk{" "}
                <span style={{ background: "linear-gradient(135deg,#9DC88D,#F1B24A)",
                               WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Before It Spreads
                </span>
              </h1>

              <p style={{ fontSize: 16, lineHeight: 1.85, color: "rgba(255,255,255,0.68)",
                          marginBottom: 32, maxWidth: 510 }}>
                <strong style={{ color: "#fff", fontFamily: "'Noto Sans Devanagari',sans-serif" }}>
                  वन दृष्टि
                </strong>{" "}
                uses machine learning and real-time weather data to predict wildfire risk
                for the next 7 days — protecting forests and communities in Lumbini, Nepal.
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
                <Link to="/home" style={{
                  padding: "14px 28px", borderRadius: 999,
                  background: "linear-gradient(135deg,#F1B24A,#ffd278)",
                  color: "#1d241e", fontWeight: 800, fontSize: 15,
                  textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 12px 40px rgba(241,178,74,0.35)", transition: "all 0.25s",
                }} onMouseEnter={onHoverUp} onMouseLeave={onHoverDown}>
                  <Flame size={16} /> Explore Dashboard
                </Link>
              </div>

              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                {[
                  { val: "60+",      label: "Days Monitored" },
                  { val: "98%",      label: "Model Accuracy" },
                  { val: "4 Levels", label: "Risk Categories" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#9DC88D" }}>{s.val}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — dashboard preview card */}
            <div className="hero-card-wrap" style={{ position: "relative" }}>
              <div style={{
                background: "rgba(10,28,25,0.78)", border: "1px solid rgba(255,255,255,0.11)",
                borderRadius: 28, padding: 24, backdropFilter: "blur(20px)",
                boxShadow: "0 40px 80px rgba(0,0,0,0.45)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                              alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>🌿 Lumbini Forest Zone</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9DC88D" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%",
                                   background: "#9DC88D", animation: "pulse 2s infinite" }} />
                    Live
                  </span>
                </div>

                <div style={{ textAlign: "center", padding: "14px 0 16px" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>Current Risk Level</div>
                  <div style={{ fontSize: 50, fontWeight: 900, lineHeight: 1,
                                background: "linear-gradient(135deg,#F1B24A,#ff8c42)",
                                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    HIGH
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Confidence: 87%</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {[
                    { icon: <Thermometer size={13} />, label: "Temp",     value: "34°C",    color: "#ff8c42" },
                    { icon: <Droplets size={13} />,    label: "Humidity", value: "28%",     color: "#60a5fa" },
                    { icon: <Wind size={13} />,        label: "Wind",     value: "22 km/h", color: "#9DC88D" },
                  ].map(w => (
                    <div key={w.label} style={{
                      background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 6px",
                      textAlign: "center", border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      <div style={{ color: w.color, display: "flex", justifyContent: "center", marginBottom: 4 }}>
                        {w.icon}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{w.value}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>{w.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginBottom: 8, letterSpacing: 1 }}>
                    7-DAY FORECAST
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[
                      { day: "Mon", color: "#ff8c42" },
                      { day: "Tue", color: "#ff8c42" },
                      { day: "Wed", color: "#ff4d4d" },
                      { day: "Thu", color: "#F1B24A" },
                      { day: "Fri", color: "#F1B24A" },
                      { day: "Sat", color: "#9DC88D" },
                      { day: "Sun", color: "#9DC88D" },
                    ].map(d => (
                      <div key={d.day} style={{
                        flex: 1, textAlign: "center", padding: "7px 2px", borderRadius: 9,
                        background: `${d.color}18`, border: `1px solid ${d.color}30`,
                      }}>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", marginBottom: 4 }}>{d.day}</div>
                        <div style={{ width: 5, height: 5, borderRadius: "50%",
                                      background: d.color, margin: "0 auto 4px" }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  background: "rgba(255,77,77,0.11)", border: "1px solid rgba(255,77,77,0.24)",
                  borderRadius: 10, padding: "9px 12px",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <AlertTriangle size={13} color="#ff6b6b" />
                  <span style={{ fontSize: 11, color: "#ff9999" }}>Alert sent — Wed extreme risk detected</span>
                </div>
              </div>

              {/* floating ML badge */}
              <div className="badge-ml" style={{
                position: "absolute", top: -14, right: -14, zIndex: 3,
                background: "linear-gradient(135deg,#164A41,#4D774E)",
                border: "1px solid rgba(157,200,141,0.3)",
                borderRadius: 14, padding: "9px 14px",
                boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
              }}>
                <div style={{ fontSize: 9, color: "#9DC88D", marginBottom: 2 }}>Powered by</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff",
                              display: "flex", alignItems: "center", gap: 5 }}>
                  <Brain size={12} color="#F1B24A" /> XGBoost ML
                </div>
              </div>

              {/* floating alert badge */}
              <div className="badge-alert" style={{
                position: "absolute", bottom: -14, left: -14, zIndex: 3,
                background: "rgba(10,28,25,0.92)", border: "1px solid rgba(241,178,74,0.28)",
                borderRadius: 14, padding: "9px 14px",
                boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", gap: 9,
              }}>
                <BellRing size={14} color="#F1B24A" />
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Last alert sent</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>2 hours ago</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section ref={statsRef.ref as React.RefCallback<HTMLElement>} style={{
        padding: "64px 20px",
        background: "rgba(0,0,0,0.22)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {[
              { n: c1, suf: " days",   label: "Archive Weather Data",       icon: <Database size={20} />,    color: "#9DC88D" },
              { n: c2, suf: "-day",    label: "Forecast Prediction Window", icon: <Activity size={20} />,    color: "#F1B24A" },
              { n: c3, suf: "%",       label: "Model Accuracy Rate",        icon: <Cpu size={20} />,         color: "#60a5fa" },
              { n: c4, suf: " levels", label: "Risk Classification Levels", icon: <ShieldAlert size={20} />, color: "#ff8c42" },
            ].map(s => (
              <div key={s.label} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 20, padding: "22px 16px", textAlign: "center", transition: "all 0.3s",
              }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-4px)"; el.style.borderColor = "rgba(255,255,255,0.16)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(0)"; el.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <div style={{ color: s.color, display: "flex", justifyContent: "center", marginBottom: 12 }}>{s.icon}</div>
                <div style={{ fontSize: 38, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.n}{s.suf}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.48)", marginTop: 8, lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" ref={featRef.ref as React.RefCallback<HTMLElement>}
               style={{ padding: "80px 20px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              display: "inline-block", padding: "7px 18px", borderRadius: 999, marginBottom: 16,
              background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)",
              color: "#9DC88D", fontSize: 12, fontWeight: 600,
            }}>Core Features</div>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "#fff",
                         marginBottom: 12, lineHeight: 1.1 }}>
              Everything you need to{" "}
              <span style={{ color: "#9DC88D" }}>fight wildfires</span>
            </h2>
          </div>

          <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {[
              { icon: <Database size={24} />, color: "#60a5fa", title: "Real-Time Weather Data",
                desc: "Fetches daily weather from Open-Meteo API — temperature, humidity, wind speed, precipitation — stored in PostgreSQL.",
                pts: ["60-day rolling archive", "7-day forecast ingestion", "Auto-sync every 30 min"] },
              { icon: <Brain size={24} />, color: "#F1B24A", title: "XGBoost ML Model",
                desc: "Trained on historical forest fire data from Nepal. Auto-retrains on fresh data every sync cycle.",
                pts: ["6 weather features", "4-class classification", "5-fold cross-validation"] },
              { icon: <ShieldAlert size={24} />, color: "#ff8c42", title: "Risk Classification",
                desc: "Classifies each forecast day into one of four fire risk categories using fixed thresholds.",
                pts: ["Low / Moderate / High / Extreme", "Probability confidence score", "7-day risk calendar"] },
              { icon: <Mail size={24} />, color: "#c084fc", title: "Automated Email Alerts",
                desc: "Sends rich HTML email alerts when High or Extreme risk is detected — auto-triggered after every prediction.",
                pts: ["Auto-triggered alerts", "HTML email with risk table", "Alert history in database"] },
              { icon: <Activity size={24} />, color: "#34d399", title: "Live Dashboard",
                desc: "Visual monitoring dashboard showing weather readings, risk trends, and 7-day forecast.",
                pts: ["Temperature & humidity trends", "Wind and rainfall data", "IoT sensor integration"] },
              { icon: <TreePine size={24} />, color: "#9DC88D", title: "Forest Area Monitoring",
                desc: "Location-specific monitoring for Lumbini zone with condition scoring and recommended actions.",
                pts: ["GPS-based monitoring", "Area condition scoring", "Action recommendations"] },
            ].map((f, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 22, padding: 24,
                opacity: featRef.inView ? 1 : 0,
                transform: featRef.inView ? "translateY(0)" : "translateY(28px)",
                transition: `opacity 0.55s ease ${i * 0.09}s, transform 0.55s ease ${i * 0.09}s`,
              }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(255,255,255,0.07)"; el.style.transform = "translateY(-4px)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = "rgba(255,255,255,0.04)"; el.style.transform = "translateY(0)"; }}
              >
                <div style={{ width: 46, height: 46, borderRadius: 14, marginBottom: 16,
                              background: `${f.color}18`, border: `1px solid ${f.color}30`,
                              display: "flex", alignItems: "center", justifyContent: "center", color: f.color }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 9 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.52)", lineHeight: 1.75, marginBottom: 16 }}>{f.desc}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {f.pts.map(pt => (
                    <div key={pt} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                                    background: `${f.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={9} color={f.color} />
                      </div>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" ref={howRef.ref as React.RefCallback<HTMLElement>} style={{
        padding: "80px 20px",
        background: "rgba(0,0,0,0.16)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{
              display: "inline-block", padding: "7px 18px", borderRadius: 999, marginBottom: 16,
              background: "rgba(241,178,74,0.12)", border: "1px solid rgba(241,178,74,0.25)",
              color: "#F1B24A", fontSize: 12, fontWeight: 600,
            }}>Automated Pipeline</div>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "#fff", marginBottom: 12 }}>
              Runs every <span style={{ color: "#F1B24A" }}>30 minutes</span> automatically
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.56)", maxWidth: 480, margin: "0 auto" }}>
              No manual intervention needed. The entire system syncs, retrains, predicts, and alerts on its own.
            </p>
          </div>

          <div style={{ position: "relative" }}>
            {/* connector line — desktop only */}
            <div className="pipeline-line" style={{
              position: "absolute", top: 38, left: "9%", right: "9%", height: 2,
              background: "linear-gradient(90deg,#9DC88D,#F1B24A,#ff8c42,#ff4d4d,#c084fc)",
              opacity: 0.25,
            }} />

            <div className="how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, position: "relative" }}>
              {[
                { step: "01", icon: <Globe size={20} />,    color: "#9DC88D", title: "Fetch Weather",  desc: "Open-Meteo pulls 60-day archive + 7-day forecast" },
                { step: "02", icon: <Database size={20} />, color: "#F1B24A", title: "Clean Database", desc: "Old rows deleted, fresh data saved to PostgreSQL" },
                { step: "03", icon: <Brain size={20} />,    color: "#ff8c42", title: "Retrain Model",  desc: "XGBoost retrained on the latest 60 days of data" },
                { step: "04", icon: <Cpu size={20} />,      color: "#ff4d4d", title: "Predict Risk",   desc: "ML model classifies risk for each of next 7 days" },
                { step: "05", icon: <BellRing size={20} />, color: "#c084fc", title: "Send Alert",     desc: "Email fires automatically if High/Extreme detected" },
              ].map((s, i) => (
                <div key={i} style={{
                  textAlign: "center",
                  opacity: howRef.inView ? 1 : 0,
                  transform: howRef.inView ? "translateY(0)" : "translateY(28px)",
                  transition: `opacity 0.55s ease ${i * 0.13}s, transform 0.55s ease ${i * 0.13}s`,
                }}>
                  <div style={{
                    width: 68, height: 68, borderRadius: "50%", margin: "0 auto 18px",
                    background: `${s.color}15`, border: `2px solid ${s.color}38`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: s.color, position: "relative", zIndex: 2,
                    boxShadow: `0 0 28px ${s.color}18`,
                  }}>
                    {s.icon}
                    <div style={{
                      position: "absolute", top: -7, right: -7,
                      width: 22, height: 22, borderRadius: "50%",
                      background: s.color, color: "#1d241e",
                      fontSize: 9, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{s.step}</div>
                  </div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{s.title}</h4>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.48)", lineHeight: 1.65 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── RISK LEVELS ── */}
      <section id="alerts" style={{ padding: "80px 20px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="risk-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
            <div>
              <div style={{
                display: "inline-block", padding: "7px 18px", borderRadius: 999, marginBottom: 20,
                background: "rgba(255,77,77,0.12)", border: "1px solid rgba(255,77,77,0.25)",
                color: "#ff8080", fontSize: 12, fontWeight: 600,
              }}>Risk Classification</div>
              <h2 style={{ fontSize: "clamp(1.7rem,3.5vw,2.7rem)", fontWeight: 900, color: "#fff",
                           marginBottom: 16, lineHeight: 1.1 }}>
                4 Risk Levels,{" "}
                <span style={{ color: "#ff8080" }}>Clear Actions</span>
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.58)", lineHeight: 1.8, marginBottom: 26 }}>
                When High or Extreme risk is predicted, email alerts are automatically
                sent to forest officials and community members.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { level: "Low" as const,      action: "Routine monitoring — no special measures needed" },
                  { level: "Moderate" as const, action: "Increase patrol frequency and ban open burning" },
                  { level: "High" as const,     action: "Alert forest officials — email auto-sent" },
                  { level: "Extreme" as const,  action: "Emergency response — evacuation warnings issued" },
                ].map(item => (
                  <div key={item.level} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                    borderRadius: 12, background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap",
                    }}>
                    <RiskBadge level={item.level} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.58)" }}>{item.action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Email preview */}
            <div style={{
              background: "rgba(10,28,25,0.82)", border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 22, overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.45)",
            }}>
              <div style={{ background: "#dc2626", padding: "20px 22px", textAlign: "center" }}>
                <div style={{ fontSize: 30, marginBottom: 4 }}>🔥</div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0 }}>Wildfire Risk Alert</h3>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", margin: "4px 0 0" }}>🔴 Extreme Risk Level Detected</p>
              </div>
              <div style={{ padding: 20 }}>
                <div style={{
                  background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)",
                  borderRadius: 10, padding: "11px 14px", marginBottom: 18,
                  display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>📍 Location</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Lumbini Forest Zone</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.38)" }}>
                    lat: 28.002<br />lon: 83.036
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)",
                              letterSpacing: 1, marginBottom: 10 }}>
                  📊 HIGH-RISK DAYS DETECTED
                </div>
                {[
                  { date: "2026-03-29", level: "High" as const,    prob: "82%" },
                  { date: "2026-03-30", level: "Extreme" as const, prob: "94%" },
                  { date: "2026-03-31", level: "High" as const,    prob: "78%" },
                ].map(d => (
                  <div key={d.date} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    flexWrap: "wrap", gap: 6,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{d.date}</span>
                    <RiskBadge level={d.level} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{d.prob}</span>
                  </div>
                ))}
                <div style={{
                  marginTop: 18, background: "rgba(241,178,74,0.08)",
                  border: "1px solid rgba(241,178,74,0.2)", borderRadius: 10,
                  padding: "11px 12px", fontSize: 12, color: "rgba(255,255,255,0.58)", lineHeight: 1.7,
                }}>
                  ⚡ <strong style={{ color: "#F1B24A" }}>Actions:</strong> Activate emergency teams.
                  Pre-position firefighting equipment. Issue public evacuation warnings.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section id="technology" style={{
        padding: "80px 20px",
        background: "rgba(0,0,0,0.16)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{
              display: "inline-block", padding: "7px 18px", borderRadius: 999, marginBottom: 16,
              background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)",
              color: "#60a5fa", fontSize: 12, fontWeight: 600,
            }}>Tech Stack</div>
            <h2 style={{ fontSize: "clamp(1.8rem,4vw,3rem)", fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>
              Built with modern <span style={{ color: "#60a5fa" }}>technology</span>
            </h2>
          </div>
          <div className="tech-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {[
              { name: "React + TypeScript", role: "Frontend UI",   icon: "⚛️", color: "#60a5fa" },
              { name: "Node.js + Express",  role: "Backend API",   icon: "🟢", color: "#9DC88D" },
              { name: "PostgreSQL",         role: "Database",      icon: "🐘", color: "#60a5fa" },
              { name: "XGBoost",            role: "ML Model",      icon: "🤖", color: "#F1B24A" },
              { name: "Open-Meteo API",     role: "Weather Data",  icon: "🌤️", color: "#34d399" },
              { name: "Nodemailer SMTP",    role: "Email Alerts",  icon: "📧", color: "#c084fc" },
              { name: "Python + sklearn",   role: "Data Pipeline", icon: "🐍", color: "#fbbf24" },
              { name: "Lucide React",       role: "Icon System",   icon: "✨", color: "#f472b6" },
            ].map(t => (
              <div key={t.name} style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: "18px 14px", textAlign: "center", transition: "all 0.25s",
              }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-4px)"; el.style.borderColor = `${t.color}30`; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(0)"; el.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <div style={{ fontSize: 28, marginBottom: 9 }}>{t.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: t.color }}>{t.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "80px 20px" }}>
        <div style={{
          maxWidth: 720, margin: "0 auto", textAlign: "center",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 28, padding: "52px 32px",
          boxShadow: "0 40px 80px rgba(0,0,0,0.3)",
        }}>
          <div style={{ fontSize: 42, marginBottom: 16 }}>🌿</div>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 900, color: "#fff",
                       marginBottom: 16, lineHeight: 1.1 }}>
            Ready to protect{" "}
            <span style={{ color: "#9DC88D" }}>our forests?</span>
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.58)", lineHeight: 1.85, marginBottom: 30 }}>
            वन दृष्टि is actively monitoring the Lumbini forest zone 24/7.
            Open the dashboard to see live predictions and weather data right now.
          </p>
          <Link to="/home" style={{
            padding: "14px 34px", borderRadius: 999,
            background: "linear-gradient(135deg,#9DC88D,#4D774E)",
            color: "#fff", fontWeight: 800, fontSize: 14,
            textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
            boxShadow: "0 12px 40px rgba(157,200,141,0.28)", transition: "all 0.25s",
          }} onMouseEnter={onHoverUp} onMouseLeave={onHoverDown}>
            <Flame size={15} /> Open Dashboard
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: "48px 20px 24px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.28)",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 36, marginBottom: 36 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <img src={logo} alt="Logo" style={{ height: 38, width: 38, borderRadius: 10, objectFit: "cover" }} />
                <div style={{ fontFamily: "'Noto Sans Devanagari',sans-serif", fontSize: 18,
                              fontWeight: 800, color: "#fff" }}>
                  वन दृष्टि
                </div>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.48)", lineHeight: 1.8, maxWidth: 260 }}>
                AI-powered wildfire risk monitoring for Nepal's forest zones.
                Protecting communities through data-driven early warnings.
              </p>
            </div>

            {[
              { title: "Navigation",
                links: [{ label: "Home", to: "/" }, { label: "Dashboard", to: "/home" }] },
              { title: "System",
                links: [
                  { label: "ML Model",     to: "/home" },
                  { label: "Weather Sync", to: "/home" },
                  { label: "Alert Engine", to: "/home" },
                  { label: "Sensor Data",  to: "/home" },
                ]},
              { title: "Risk Levels",
                links: [
                  { label: "🟢 Low Risk",  to: "/home" },
                  { label: "🟡 Moderate",  to: "/home" },
                  { label: "🟠 High Risk", to: "/home" },
                  { label: "🔴 Extreme",   to: "/home" },
                ]},
            ].map(col => (
              <div key={col.title}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.38)",
                             textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>
                  {col.title}
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.links.map(lk => (
                    <Link key={lk.label} to={lk.to} style={{
                      fontSize: 13, color: "rgba(255,255,255,0.56)",
                      textDecoration: "none", transition: "color 0.2s",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#9DC88D")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.56)")}
                    >{lk.label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)" }}>
              © 2026 वन दृष्टि | Forest Fire Risk Monitoring System | Lumbini, Nepal
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)" }}>
              Powered by XGBoost ML + Open-Meteo API
            </p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.45; transform:scale(1.35); }
        }

        /* Tablet — ≤ 1024px */
        @media (max-width: 1024px) {
          .nav-links { display: none !important; }
          .hamburger { display: flex !important; }
          .hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .hero-card-wrap { margin-top: 24px; }
          .badge-ml   { top: -10px !important; right: -6px !important; }
          .badge-alert { bottom: -10px !important; left: -6px !important; }
          .stats-grid { grid-template-columns: repeat(2,1fr) !important; }
          .feat-grid  { grid-template-columns: repeat(2,1fr) !important; }
          .how-grid   { grid-template-columns: repeat(3,1fr) !important; gap: 20px !important; }
          .pipeline-line { display: none !important; }
          .risk-grid  { grid-template-columns: 1fr !important; gap: 36px !important; }
          .tech-grid  { grid-template-columns: repeat(4,1fr) !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 28px !important; }
          .nav-cta span:last-child { display: none; }
        }

        /* Mobile — ≤ 640px */
        @media (max-width: 640px) {
          .nav-cta { padding: 8px 16px !important; font-size: 12px !important; }
          .hero-grid { gap: 36px !important; }
          .stats-grid { grid-template-columns: repeat(2,1fr) !important; gap: 12px !important; }
          .feat-grid  { grid-template-columns: 1fr !important; }
          .how-grid   { grid-template-columns: repeat(2,1fr) !important; gap: 16px !important; }
          .risk-grid  { grid-template-columns: 1fr !important; }
          .tech-grid  { grid-template-columns: repeat(2,1fr) !important; gap: 10px !important; }
          .footer-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .badge-ml, .badge-alert { display: none !important; }
          section { padding-left: 16px !important; padding-right: 16px !important; }
          nav { padding-left: 16px !important; padding-right: 16px !important; }
        }

        /* Small mobile — ≤ 400px */
        @media (max-width: 400px) {
          .how-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
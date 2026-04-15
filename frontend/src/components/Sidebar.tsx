/**
 * Sidebar.tsx
 * ───────────
 * Shared navigation sidebar used by every dashboard page.
 * Desktop: collapsible rail.  Mobile: slide-over drawer.
 */
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, CalendarDays, Wifi, Bell,
  BarChart2, Activity, Menu, X,
} from "lucide-react";
import { useIsMobile } from "../hooks/useIsMobile";
import logo from "../assets/logo.png";

/* ── Nav items ─────────────────────────────────────────────── */
const LINKS = [
  { to: "/home",         icon: <LayoutDashboard size={18} />, label: "Dashboard"    },
  { to: "/forecast",     icon: <CalendarDays    size={18} />, label: "Forecast"     },
  { to: "/iot",          icon: <Wifi            size={18} />, label: "IoT Monitor"  },
  { to: "/alerts",       icon: <Bell            size={18} />, label: "Alerts"       },
  { to: "/ml-analytics", icon: <BarChart2       size={18} />, label: "ML Analytics" },
  { to: "/",             icon: <Activity        size={18} />, label: "Home"         },
];

/* ── NavLink ────────────────────────────────────────────────── */
function NavLink({
  to, icon, label, active, collapsed, onClick,
}: {
  to: string; icon: React.ReactNode; label: string;
  active: boolean; collapsed?: boolean; onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: collapsed ? "12px 0" : "12px 14px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 14,
        background: active
          ? "linear-gradient(135deg,rgba(241,178,74,.22),rgba(241,178,74,.08))"
          : "transparent",
        border: active ? "1px solid rgba(241,178,74,.25)" : "1px solid transparent",
        color: active ? "#F1B24A" : "rgba(255,255,255,.58)",
        fontWeight: active ? 700 : 500,
        fontSize: 14,
        transition: "background .2s",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.06)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

/* ── Brand ──────────────────────────────────────────────────── */
function Brand({ showText }: { showText: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <img src={logo} alt="वन दृष्टि" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
      {showText && (
        <div>
          <div style={{ fontFamily: "var(--font-dev,sans-serif)", fontSize: 16, fontWeight: 800 }}>वन दृष्टि</div>
          <div style={{ fontSize: 10, color: "#9DC88D" }}>Fire Monitor</div>
        </div>
      )}
    </div>
  );
}

/* ── Shared sidebar styles ──────────────────────────────────── */
const sidebarBase: React.CSSProperties = {
  background: "rgba(8,22,18,.92)",
  backdropFilter: "blur(20px)",
  borderRight: "1px solid rgba(255,255,255,.07)",
  display: "flex",
  flexDirection: "column",
};
const headerStyle: React.CSSProperties = {
  padding: "20px 16px 16px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderBottom: "1px solid rgba(255,255,255,.07)",
};

/* ── Mobile drawer ──────────────────────────────────────────── */
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loc = useLocation();
  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 40, backdropFilter: "blur(4px)" }} />
      )}
      <aside style={{
        ...sidebarBase,
        position: "fixed", top: 0, left: 0, bottom: 0, width: 260,
        zIndex: 50,
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .3s ease",
      }}>
        <div style={{ ...headerStyle, justifyContent: "space-between" }}>
          <Brand showText />
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {LINKS.map(lk => (
            <NavLink key={lk.to} {...lk} active={loc.pathname === lk.to} onClick={onClose} />
          ))}
        </nav>
      </aside>
    </>
  );
}

/* ── Desktop rail ───────────────────────────────────────────── */
function DesktopRail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const loc = useLocation();
  return (
    <aside style={{
      ...sidebarBase,
      width: collapsed ? 68 : 220,
      minHeight: "100vh",
      flexShrink: 0,
      overflow: "hidden",
      transition: "width .3s ease",
      position: "sticky", top: 0, alignSelf: "flex-start",
    }}>
      <div style={headerStyle}>
        <Brand showText={!collapsed} />
      </div>
      <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {LINKS.map(lk => (
          <NavLink key={lk.to} {...lk} active={loc.pathname === lk.to} collapsed={collapsed} />
        ))}
      </nav>
      <button
        onClick={onToggle}
        style={{
          margin: 10, padding: 10, borderRadius: 12, cursor: "pointer",
          border: "1px solid rgba(255,255,255,.08)",
          background: "rgba(255,255,255,.05)",
          color: "rgba(255,255,255,.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {collapsed ? <Menu size={16} /> : <X size={16} />}
      </button>
    </aside>
  );
}

/* ── Public API ─────────────────────────────────────────────── */
export interface SidebarProps {
  collapsed:    boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen?:  boolean;
  setMobileOpen?: (v: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: SidebarProps) {
  const isMobile = useIsMobile();
  if (isMobile)
    return <MobileDrawer open={!!mobileOpen} onClose={() => setMobileOpen?.(false)} />;
  return <DesktopRail collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />;
}
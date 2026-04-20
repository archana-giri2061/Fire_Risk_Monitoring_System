// Sidebar.tsx
// Shared navigation sidebar used by every dashboard page via PageShell.tsx.
// Renders as a collapsible rail on desktop and a slide-over drawer on mobile.
// The active route is highlighted using react-router-dom's useLocation hook.

import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, CalendarDays, Wifi, Bell,
  BarChart2, Activity, Menu, X,
} from "lucide-react";
import { useIsMobile } from "../hooks/useIsMobile";
import logo            from "../assets/logo.png";


// Navigation link definitions — each entry maps a route path to an icon and label.
// Rendered by both the desktop rail and the mobile drawer from a single source.
const LINKS = [
  { to: "/home",         icon: <LayoutDashboard size={18} />, label: "Dashboard"    },
  { to: "/forecast",     icon: <CalendarDays    size={18} />, label: "Forecast"     },
  { to: "/iot",          icon: <Wifi            size={18} />, label: "IoT Monitor"  },
  { to: "/alerts",       icon: <Bell            size={18} />, label: "Alerts"       },
  { to: "/ml-analytics", icon: <BarChart2       size={18} />, label: "ML Analytics" },
  { to: "/",             icon: <Activity        size={18} />, label: "Home"         },
];


// Individual navigation link rendered inside both the desktop rail and mobile drawer.
// Active state is indicated by a highlighted background and amber text color.
// In collapsed mode only the icon is shown — the label is hidden to save space.
// Hover background is applied via inline event handlers rather than CSS classes
// because the component uses inline styles throughout for portability.
function NavLink({
  to, icon, label, active, collapsed, onClick,
}: {
  to:        string;
  icon:      React.ReactNode;
  label:     string;
  active:    boolean;
  collapsed?: boolean;   // When true only the icon is rendered, no label text
  onClick?:  () => void; // Used by the mobile drawer to close itself on navigation
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            12,
        padding:        collapsed ? "12px 0" : "12px 14px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius:   14,
        // Active link gets a subtle amber gradient background and matching border
        background: active
          ? "linear-gradient(135deg,rgba(241,178,74,.22),rgba(241,178,74,.08))"
          : "transparent",
        border:     active ? "1px solid rgba(241,178,74,.25)" : "1px solid transparent",
        color:      active ? "#F1B24A" : "rgba(255,255,255,.58)",
        fontWeight: active ? 700 : 500,
        fontSize:   14,
        transition: "background .2s",
      }}
      // Hover effect applied inline since there are no CSS class names available
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.06)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {icon}
      {/* Label is hidden in collapsed desktop mode to show only the icon */}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}


// Brand logo and name displayed at the top of the sidebar.
// showText controls whether the text beside the logo is visible —
// hidden when the desktop rail is collapsed to icon-only width.
function Brand({ showText }: { showText: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <img
        src={logo}
        alt="Van Drishti"
        style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
      />
      {showText && (
        <div>
          <div style={{ fontFamily: "var(--font-dev,sans-serif)", fontSize: 16, fontWeight: 800 }}>
            Van Drishti
          </div>
          <div style={{ fontSize: 10, color: "#9DC88D" }}>Fire Monitor</div>
        </div>
      )}
    </div>
  );
}


// Base styles shared by both the mobile drawer and the desktop rail.
// Extracted to avoid duplication since both components spread this object.
const sidebarBase: React.CSSProperties = {
  background:    "rgba(8,22,18,.92)",
  backdropFilter: "blur(20px)",
  borderRight:   "1px solid rgba(255,255,255,.07)",
  display:       "flex",
  flexDirection: "column",
};

// Styles for the top header row that contains the Brand logo and collapse button
const headerStyle: React.CSSProperties = {
  padding:     "20px 16px 16px",
  display:     "flex",
  alignItems:  "center",
  gap:         12,
  borderBottom: "1px solid rgba(255,255,255,.07)",
};


// Mobile slide-over drawer that covers the left side of the screen.
// A semi-transparent backdrop is rendered behind it so clicking outside closes it.
// The drawer slides in and out using a CSS transform transition.
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loc = useLocation();
  return (
    <>
      {/* Backdrop overlay — clicking it closes the drawer */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0,
            background:    "rgba(0,0,0,.6)",
            zIndex:        40,
            backdropFilter: "blur(4px)",
          }}
        />
      )}

      <aside style={{
        ...sidebarBase,
        position: "fixed", top: 0, left: 0, bottom: 0, width: 260,
        zIndex:    50,
        // Slide in from the left when open, slide out when closed
        transform:  open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .3s ease",
      }}>
        <div style={{ ...headerStyle, justifyContent: "space-between" }}>
          <Brand showText />
          {/* Close button in the header row */}
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {LINKS.map(lk => (
            // Pass onClose as onClick so the drawer closes when a link is tapped
            <NavLink key={lk.to} {...lk} active={loc.pathname === lk.to} onClick={onClose} />
          ))}
        </nav>
      </aside>
    </>
  );
}


// Desktop sticky sidebar rail that collapses to icon-only width.
// Sticks to the top of the viewport as the page content scrolls.
// The collapse toggle button is rendered at the bottom of the rail.
function DesktopRail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const loc = useLocation();
  return (
    <aside style={{
      ...sidebarBase,
      width:      collapsed ? 68 : 220,  // Narrow in icon mode, wider with labels
      minHeight:  "100vh",
      flexShrink: 0,
      overflow:   "hidden",
      transition: "width .3s ease",     // Smooth width animation on collapse/expand
      position:   "sticky", top: 0,
      alignSelf:  "flex-start",         // Required for sticky to work inside a flex container
    }}>
      <div style={headerStyle}>
        {/* Hide text beside logo when collapsed — only the icon remains visible */}
        <Brand showText={!collapsed} />
      </div>

      <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {LINKS.map(lk => (
          <NavLink key={lk.to} {...lk} active={loc.pathname === lk.to} collapsed={collapsed} />
        ))}
      </nav>

      {/* Collapse toggle at the bottom — shows Menu icon when collapsed, X when expanded */}
      <button
        onClick={onToggle}
        style={{
          margin: 10, padding: 10, borderRadius: 12, cursor: "pointer",
          border:      "1px solid rgba(255,255,255,.08)",
          background:  "rgba(255,255,255,.05)",
          color:       "rgba(255,255,255,.5)",
          display:     "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {collapsed ? <Menu size={16} /> : <X size={16} />}
      </button>
    </aside>
  );
}


// Props accepted by the public Sidebar component.
// Collapse and drawer state is lifted to PageShell so both the sidebar
// and the hamburger button in the top bar share the same state.
export interface SidebarProps {
  collapsed:      boolean;
  setCollapsed:   (v: boolean) => void;
  mobileOpen?:    boolean;       // Only used on mobile — undefined on desktop
  setMobileOpen?: (v: boolean) => void;
}

// Public export — renders MobileDrawer on mobile viewports and DesktopRail otherwise.
// The isMobile check is the single branching point so both variants are fully
// isolated and neither renders unnecessary DOM nodes on the wrong viewport size.
export function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: SidebarProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileDrawer open={!!mobileOpen} onClose={() => setMobileOpen?.(false)} />;
  }
  return <DesktopRail collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />;
}
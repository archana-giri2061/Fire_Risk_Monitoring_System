/**
 * PageShell.tsx
 * ─────────────
 * Wraps every dashboard page with the Sidebar + sticky top-bar.
 * Keeps layout boilerplate in one place.
 */
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  title:    string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, subtitle, actions, children }: Props) {
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        collapsed={collapsed}     setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}   setMobileOpen={setMobileOpen}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* ── Sticky top bar ── */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && (
              <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
                <Menu size={22} />
              </button>
            )}
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, margin: 0 }}>{title}</h1>
              {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
        </header>

        {/* ── Page content ── */}
        <main style={{ flex: 1, padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
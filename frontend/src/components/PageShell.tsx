// PageShell.tsx
// Layout wrapper used by every dashboard page.
// Renders the Sidebar alongside a sticky top bar containing the page title,
// an optional subtitle, and optional action buttons. Page-specific content
// is rendered inside the main area via the children prop.
// Keeping this boilerplate in one component means layout changes only need
// to be made in one place.

import { useState }      from "react";
import { Menu }          from "lucide-react";
import { Sidebar }       from "./Sidebar";
import { useIsMobile }   from "../hooks/useIsMobile";

interface Props {
  title:     string;            // Page heading shown in the top bar
  subtitle?: React.ReactNode;   // Optional secondary line below the title
  actions?:  React.ReactNode;   // Optional buttons or controls shown on the right of the top bar
  children:  React.ReactNode;   // Page-specific content rendered in the main area
}

export function PageShell({ title, subtitle, actions, children }: Props) {
  // Controls whether the sidebar is collapsed to icon-only width on desktop
  const [collapsed,  setCollapsed]  = useState(false);

  // Controls whether the sidebar drawer is open on mobile
  const [mobileOpen, setMobileOpen] = useState(false);

  // True when the viewport is narrower than the mobile breakpoint
  const isMobile = useIsMobile();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>

      {/* Sidebar receives both desktop collapse state and mobile drawer state
          so it can handle both layout modes from a single component */}
      <Sidebar
        collapsed={collapsed}    setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}  setMobileOpen={setMobileOpen}
      />

      {/* Main content column — flex: 1 fills the remaining width beside the sidebar.
          minWidth: 0 prevents flex children from overflowing on narrow screens. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Sticky top bar — always visible when the user scrolls the page content */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

            {/* Hamburger button — only rendered on mobile to open the sidebar drawer.
                Hidden on desktop because the sidebar is always visible there. */}
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                style={{
                  background: "none", border: "none",
                  color: "#fff", cursor: "pointer", padding: 4,
                }}
              >
                <Menu size={22} />
              </button>
            )}

            {/* Page title and optional subtitle — font size scales down on mobile */}
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, margin: 0 }}>
                {title}
              </h1>
              {subtitle && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          {/* Optional action buttons shown on the right side of the top bar.
              Examples: sync button, admin login trigger, export button. */}
          {actions && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {actions}
            </div>
          )}
        </header>

        {/* Page content area — scrollable, with padding that adapts to screen size */}
        <main style={{
          flex: 1,
          padding:        isMobile ? 16 : 24,
          display:        "flex",
          flexDirection:  "column",
          gap:            isMobile ? 14 : 20,
          overflowY:      "auto",
        }}>
          {children}
        </main>

      </div>
    </div>
  );
}
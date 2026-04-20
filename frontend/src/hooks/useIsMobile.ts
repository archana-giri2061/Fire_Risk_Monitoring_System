// useIsMobile.ts
// React hook that returns true when the viewport width is below the given
// breakpoint. Updates automatically when the window is resized so components
// re-render correctly when the user switches between mobile and desktop widths.

import { useEffect, useState } from "react";


// Returns true if the current viewport width is below bp pixels, false otherwise.
// Attaches a resize listener on mount and removes it on unmount to prevent
// memory leaks. Re-runs the effect if bp changes so the hook works correctly
// when a custom breakpoint is passed rather than the default 768px.
//
// Parameters:
//   bp: Breakpoint in pixels below which the viewport is considered mobile (default 768)
export function useIsMobile(bp = 768): boolean {
  // Initialise from window.innerWidth immediately so the first render is correct
  // and there is no flash of the wrong layout before the effect runs
  const [isMobile, setIsMobile] = useState(window.innerWidth < bp);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener("resize", fn);
    // Remove the listener when the component unmounts or bp changes
    return () => window.removeEventListener("resize", fn);
  }, [bp]);

  return isMobile;
}
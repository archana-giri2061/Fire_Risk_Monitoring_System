/** useIsMobile.ts — viewport width breakpoint hook */
import { useEffect, useState } from "react";

export function useIsMobile(bp = 768): boolean {
  const [isMobile, setIsMobile] = useState(window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return isMobile;
}
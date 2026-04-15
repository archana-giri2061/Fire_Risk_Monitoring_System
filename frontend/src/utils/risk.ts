/** risk.ts — shared risk-level colour helpers used across all pages */

export const RISK_COLOR: Record<string, string> = {
  Low:      "#9DC88D",
  Moderate: "#F1B24A",
  High:     "#FF8C42",
  Extreme:  "#FF4D4D",
  Unknown:  "#888888",
};

export const RISK_BG: Record<string, string> = {
  Low:      "rgba(157,200,141,0.15)",
  Moderate: "rgba(241,178,74, 0.15)",
  High:     "rgba(255,140,66, 0.15)",
  Extreme:  "rgba(255,77, 77, 0.15)",
  Unknown:  "rgba(136,136,136,0.10)",
};

export const RISK_BORDER: Record<string, string> = {
  Low:      "rgba(157,200,141,0.30)",
  Moderate: "rgba(241,178,74, 0.30)",
  High:     "rgba(255,140,66, 0.30)",
  Extreme:  "rgba(255,77, 77, 0.30)",
  Unknown:  "rgba(136,136,136,0.18)",
};

export const RISK_ICON: Record<string, string> = {
  Low: "🟢", Moderate: "🟡", High: "🟠", Extreme: "🔴", Unknown: "⚪",
};

export const riskColor  = (l: string) => RISK_COLOR[l]  ?? RISK_COLOR.Unknown;
export const riskBg     = (l: string) => RISK_BG[l]     ?? RISK_BG.Unknown;
export const riskBorder = (l: string) => RISK_BORDER[l] ?? RISK_BORDER.Unknown;
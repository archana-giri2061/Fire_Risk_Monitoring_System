// Shared risk-level colour helpers used across all pages.
// Every visual treatment for a risk tier — solid colour, tinted background,
// border, and icon — is defined once here so changing a tier's appearance
// only ever requires editing this file.

// Solid foreground colour for each risk tier.
// Used for large text values, chart lines, badge labels, and icon tints.
export const RISK_COLOR: Record<string, string> = {
  Low:      "#9DC88D", // soft green
  Moderate: "#F1B24A", // amber
  High:     "#FF8C42", // orange
  Extreme:  "#FF4D4D", // red
  Unknown:  "#888888", // neutral grey — shown when no prediction is available yet
};

// Semi-transparent tinted background for each risk tier.
// Used as the fill colour for banners, card backgrounds, and badge chips
// so the tier is visually distinct without being overpowering.
export const RISK_BG: Record<string, string> = {
  Low:      "rgba(157,200,141,0.15)",
  Moderate: "rgba(241,178,74, 0.15)",
  High:     "rgba(255,140,66, 0.15)",
  Extreme:  "rgba(255,77, 77, 0.15)",
  Unknown:  "rgba(136,136,136,0.10)", // slightly lower opacity so Unknown feels de-emphasised
};

// Semi-transparent border colour for each risk tier.
// Used on cards, badges, and banners that need a coloured outline to match
// their background tint without being as saturated as the solid foreground colour.
export const RISK_BORDER: Record<string, string> = {
  Low:      "rgba(157,200,141,0.30)",
  Moderate: "rgba(241,178,74, 0.30)",
  High:     "rgba(255,140,66, 0.30)",
  Extreme:  "rgba(255,77, 77, 0.30)",
  Unknown:  "rgba(136,136,136,0.18)",
};

// Emoji dot icon for each risk tier.
// Used in compact spaces like forecast row labels and history badges
// where a small coloured circle communicates the tier faster than text.
export const RISK_ICON: Record<string, string> = {
  Low:      "🟢",
  Moderate: "🟡",
  High:     "🟠",
  Extreme:  "🔴",
  Unknown:  "⚪",
};

// Convenience wrappers that look up a tier's solid colour, background tint,
// or border colour and fall back to the Unknown entry when the label is not
// recognised — prevents undefined values crashing inline style objects.
export const riskColor  = (l: string) => RISK_COLOR[l]  ?? RISK_COLOR.Unknown;
export const riskBg     = (l: string) => RISK_BG[l]     ?? RISK_BG.Unknown;
export const riskBorder = (l: string) => RISK_BORDER[l] ?? RISK_BORDER.Unknown;
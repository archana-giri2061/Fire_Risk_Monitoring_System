/**
 * useRiskSound — plays browser audio alerts based on fire risk level
 *
 * Usage:
 *   import { useRiskSound } from "../hooks/useRiskSound";
 *   const { playRiskAlert } = useRiskSound();
 *   playRiskAlert("Extreme");   // 🔴 loud urgent alarm
 *   playRiskAlert("High");      // 🔶 serious warning beep
 *   playRiskAlert("Moderate");  // ⚠️  soft chime
 *   playRiskAlert("Low");       // ✅  gentle single ping
 */

import { useCallback, useRef } from "react";

type RiskLevel = "Low" | "Moderate" | "High" | "Extreme";

// ── Web Audio API tone generator ────────────────────────────────────────────
function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

interface ToneConfig {
  frequency:  number;
  duration:   number;   // seconds
  type:       OscillatorType;
  gain:       number;   // 0–1
  ramp:       boolean;  // true = fade out
}

function playTone(ctx: AudioContext, config: ToneConfig, startAt = 0): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type      = config.type;
  osc.frequency.setValueAtTime(config.frequency, ctx.currentTime + startAt);
  gain.gain.setValueAtTime(config.gain, ctx.currentTime + startAt);

  if (config.ramp) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + config.duration);
  }

  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + config.duration);
}

// ── Sound patterns per risk level ───────────────────────────────────────────

/** 🔴 EXTREME — Rapid urgent alarm (3 bursts, high-pitched) */
function playExtremeSound(ctx: AudioContext): void {
  const pattern = [
    // Three rapid high-pitch alarm bursts
    { frequency: 1400, duration: 0.18, type: "square" as OscillatorType, gain: 0.8, ramp: false },
    { frequency: 900,  duration: 0.12, type: "square" as OscillatorType, gain: 0.6, ramp: false },
    { frequency: 1400, duration: 0.18, type: "square" as OscillatorType, gain: 0.8, ramp: false },
    { frequency: 900,  duration: 0.12, type: "square" as OscillatorType, gain: 0.6, ramp: false },
    { frequency: 1400, duration: 0.18, type: "square" as OscillatorType, gain: 0.8, ramp: false },
    { frequency: 900,  duration: 0.12, type: "square" as OscillatorType, gain: 0.6, ramp: false },
  ];

  let offset = 0;
  for (const tone of pattern) {
    playTone(ctx, tone, offset);
    offset += tone.duration + 0.05;
  }
}

/** 🔶 HIGH — Two serious warning tones */
function playHighSound(ctx: AudioContext): void {
  // Deep-low then sharp high — classic "danger" signal
  playTone(ctx, { frequency: 520, duration: 0.3, type: "sawtooth", gain: 0.6, ramp: false }, 0.0);
  playTone(ctx, { frequency: 780, duration: 0.4, type: "sawtooth", gain: 0.7, ramp: true  }, 0.4);
  playTone(ctx, { frequency: 520, duration: 0.3, type: "sawtooth", gain: 0.6, ramp: false }, 0.9);
  playTone(ctx, { frequency: 780, duration: 0.4, type: "sawtooth", gain: 0.7, ramp: true  }, 1.3);
}

/** ⚠️ MODERATE — Two-note ascending chime */
function playModerateSound(ctx: AudioContext): void {
  playTone(ctx, { frequency: 440, duration: 0.25, type: "sine", gain: 0.45, ramp: true }, 0.0);
  playTone(ctx, { frequency: 550, duration: 0.35, type: "sine", gain: 0.45, ramp: true }, 0.3);
}

/** ✅ LOW — Single gentle ping */
function playLowSound(ctx: AudioContext): void {
  playTone(ctx, { frequency: 660, duration: 0.4, type: "sine", gain: 0.3, ramp: true }, 0.0);
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useRiskSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = createAudioContext();
    }
    // Browser requires user gesture before audio — resume if suspended
    if (ctxRef.current?.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playRiskAlert = useCallback(
    (riskLevel: RiskLevel | string): void => {
      const ctx = getCtx();
      if (!ctx) {
        console.warn("[useRiskSound] Web Audio API not available in this browser.");
        return;
      }

      switch (riskLevel) {
        case "Extreme":  playExtremeSound(ctx); break;
        case "High":     playHighSound(ctx);    break;
        case "Moderate": playModerateSound(ctx); break;
        case "Low":
        default:         playLowSound(ctx);     break;
      }
    },
    [getCtx],
  );

  return { playRiskAlert };
}

// ── Standalone helper (outside React) ──────────────────────────────────────
export function triggerRiskSound(riskLevel: RiskLevel | string): void {
  const ctx = createAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  switch (riskLevel) {
    case "Extreme":  playExtremeSound(ctx); break;
    case "High":     playHighSound(ctx);    break;
    case "Moderate": playModerateSound(ctx); break;
    default:         playLowSound(ctx);     break;
  }
}

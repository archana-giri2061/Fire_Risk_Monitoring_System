// useRiskSound.ts
// React hook and standalone helper for playing browser audio alerts
// based on fire risk level using the Web Audio API.
// No audio files are needed — all sounds are synthesised programmatically
// from oscillators so the hook works without any network requests.
//
// Usage:
//   const { playRiskAlert } = useRiskSound();
//   playRiskAlert("Extreme");  // Rapid urgent alarm
//   playRiskAlert("High");     // Serious warning beep
//   playRiskAlert("Moderate"); // Soft ascending chime
//   playRiskAlert("Low");      // Gentle single ping

import { useCallback, useRef } from "react";

// Union type restricting risk level strings to the four valid values
type RiskLevel = "Low" | "Moderate" | "High" | "Extreme";


// Creates a new Web Audio API AudioContext, handling the webkit- prefixed
// version for older Safari compatibility.
// Returns null if the browser does not support the Web Audio API so callers
// can degrade gracefully without throwing.
function createAudioContext(): AudioContext | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}


// Configuration for a single synthesised tone
interface ToneConfig {
  frequency: number;        // Oscillator frequency in Hz
  duration:  number;        // How long the tone plays in seconds
  type:      OscillatorType; // Waveform shape: "sine", "square", "sawtooth", "triangle"
  gain:      number;        // Volume from 0.0 (silent) to 1.0 (full)
  ramp:      boolean;       // When true, volume fades to silence over the duration
}

// Schedules a single tone to play on the given AudioContext.
// Uses the Web Audio API's precise scheduling so multiple tones can be
// queued at exact offsets without timer drift.
//
// Parameters:
//   ctx     : The active AudioContext to play through
//   config  : Frequency, duration, waveform, gain, and fade settings
//   startAt : Seconds from ctx.currentTime when this tone should begin (default 0)
function playTone(ctx: AudioContext, config: ToneConfig, startAt = 0): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  // Route the oscillator through the gain node to the output
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = config.type;
  osc.frequency.setValueAtTime(config.frequency, ctx.currentTime + startAt);
  gain.gain.setValueAtTime(config.gain, ctx.currentTime + startAt);

  if (config.ramp) {
    // Exponential fade to near-silence — sounds more natural than a hard cutoff
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + config.duration);
  }

  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + config.duration);
}


// Plays a rapid alternating high-pitch alarm for Extreme risk.
// Six square-wave bursts at 1400 Hz and 900 Hz create an urgent siren effect.
// Square waves are used because they sound harsher and more alarming than sine waves.
function playExtremeSound(ctx: AudioContext): void {
  const pattern = [
    { frequency: 1400, duration: 0.18, type: "square" as OscillatorType, gain: 0.8, ramp: false },
    { frequency: 900,  duration: 0.12, type: "square" as OscillatorType, gain: 0.6, ramp: false },
    { frequency: 1400, duration: 0.18, type: "square" as OscillatorType, gain: 0.8, ramp: false },
    { frequency: 900,  duration: 0.12, type: "square" as OscillatorType, gain: 0.6, ramp: false },
    { frequency: 1400, duration: 0.18, type: "square" as OscillatorType, gain: 0.8, ramp: false },
    { frequency: 900,  duration: 0.12, type: "square" as OscillatorType, gain: 0.6, ramp: false },
  ];

  // Schedule each tone sequentially with a 50ms gap between bursts
  let offset = 0;
  for (const tone of pattern) {
    playTone(ctx, tone, offset);
    offset += tone.duration + 0.05;
  }
}

// Plays two pairs of ascending sawtooth tones for High risk.
// Low-then-high frequency pairs create a classic "danger" warning signal.
// Sawtooth waves are used because they sound sharper and more urgent than sine waves.
function playHighSound(ctx: AudioContext): void {
  playTone(ctx, { frequency: 520, duration: 0.3, type: "sawtooth", gain: 0.6, ramp: false }, 0.0);
  playTone(ctx, { frequency: 780, duration: 0.4, type: "sawtooth", gain: 0.7, ramp: true  }, 0.4);
  playTone(ctx, { frequency: 520, duration: 0.3, type: "sawtooth", gain: 0.6, ramp: false }, 0.9);
  playTone(ctx, { frequency: 780, duration: 0.4, type: "sawtooth", gain: 0.7, ramp: true  }, 1.3);
}

// Plays a two-note ascending chime for Moderate risk.
// Sine waves with a fade-out give a softer, less alarming sound than sawtooth or square.
function playModerateSound(ctx: AudioContext): void {
  playTone(ctx, { frequency: 440, duration: 0.25, type: "sine", gain: 0.45, ramp: true }, 0.0);
  playTone(ctx, { frequency: 550, duration: 0.35, type: "sine", gain: 0.45, ramp: true }, 0.3);
}

// Plays a single gentle ping for Low risk.
// Quiet sine wave with a fade-out — barely intrusive, just informational.
function playLowSound(ctx: AudioContext): void {
  playTone(ctx, { frequency: 660, duration: 0.4, type: "sine", gain: 0.3, ramp: true }, 0.0);
}


// React hook that provides a stable playRiskAlert function for use inside components.
// Keeps a single AudioContext instance alive in a ref across renders so each call
// to playRiskAlert does not create a new context. Most browsers limit the number of
// simultaneous AudioContext instances, so reusing one avoids hitting that limit.
export function useRiskSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  // Returns the existing AudioContext or creates a new one if needed.
  // Resumes a suspended context — browsers suspend audio until a user gesture
  // has occurred on the page, so this handles the first interaction correctly.
  const getCtx = useCallback((): AudioContext | null => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = createAudioContext();
    }
    if (ctxRef.current?.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  // Plays the appropriate sound pattern for the given risk level.
  // Wrapped in useCallback so the function reference is stable between renders
  // and can safely be passed as a prop or included in dependency arrays.
  const playRiskAlert = useCallback(
    (riskLevel: RiskLevel | string): void => {
      const ctx = getCtx();
      if (!ctx) {
        console.warn("[useRiskSound] Web Audio API not available in this browser.");
        return;
      }

      switch (riskLevel) {
        case "Extreme":  playExtremeSound(ctx);  break;
        case "High":     playHighSound(ctx);     break;
        case "Moderate": playModerateSound(ctx); break;
        case "Low":
        default:         playLowSound(ctx);      break;
      }
    },
    [getCtx],
  );

  return { playRiskAlert };
}


// Standalone helper for playing a risk sound outside of a React component.
// Creates a fresh AudioContext on each call since there is no ref to reuse.
// Used by non-component code that needs to trigger an alert sound directly
// without going through the hook, e.g. in a service worker or event handler.
export function triggerRiskSound(riskLevel: RiskLevel | string): void {
  const ctx = createAudioContext();
  if (!ctx) return;

  // Resume immediately in case the context starts in a suspended state
  if (ctx.state === "suspended") ctx.resume();

  switch (riskLevel) {
    case "Extreme":  playExtremeSound(ctx);  break;
    case "High":     playHighSound(ctx);     break;
    case "Moderate": playModerateSound(ctx); break;
    default:         playLowSound(ctx);      break;
  }
}
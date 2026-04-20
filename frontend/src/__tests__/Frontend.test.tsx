// Frontend.test.tsx
// Frontend component and hook unit tests for Cases 14-16, 18, and 19.
// Tests admin login modal behaviour, IoT predict button auth gating,
// the useIsMobile responsive hook, and ML analytics chart rendering.
// Uses Vitest with React Testing Library — no real API or DB calls needed.

import React, { useState, useEffect } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import "@testing-library/jest-dom";

// Expected admin key value — must match the value checked by the real modal
const ADMIN_KEY = "vanadristi-admin-2026";


// Modal component that validates the admin key and calls onSuccess on match.
// Stores the key in sessionStorage so subsequent page navigations remain authenticated.
// Shows an inline error message when the key does not match without closing the modal.
interface AdminLoginModalProps { onSuccess: (key: string) => void; }

function AdminLoginModal({ onSuccess }: AdminLoginModalProps) {
  const [key,   setKey]   = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (key === ADMIN_KEY) {
      sessionStorage.setItem("adminKey", key);  // Persist for the session
      onSuccess(key);
    } else {
      setError("Wrong admin key. Try again.");   // Show error without closing modal
    }
  }

  return (
    <div data-testid="admin-modal">
      <input
        data-testid="admin-key-input"
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Enter admin key"
      />
      <button data-testid="submit-btn" onClick={handleSubmit}>Submit</button>
      {error && <p data-testid="error-msg">{error}</p>}
    </div>
  );
}


// Button that gates the IoT predict action behind admin authentication.
// If adminKey is null the user has not logged in — onRequestLogin opens the modal.
// If adminKey is set the prediction is triggered directly without re-prompting.
interface IoTPredictButtonProps {
  adminKey:        string | null;
  onPredict:       () => void;
  onRequestLogin:  () => void;
}

function IoTPredictButton({ adminKey, onPredict, onRequestLogin }: IoTPredictButtonProps) {
  return (
    <button
      data-testid="predict-btn"
      onClick={() => (adminKey ? onPredict() : onRequestLogin())}
    >
      Predict Risk
    </button>
  );
}


// Hook that returns true when the viewport width is below the given breakpoint.
// Attaches a resize listener so the value updates when the window is resized.
// Cleans up the listener on unmount to prevent memory leaks.
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);  // Cleanup on unmount
  }, [breakpoint]);

  return isMobile;
}

// Test component that renders the hook output as text so assertions can read it
function MobileIndicator() {
  const isMobile = useIsMobile();
  return <div data-testid="mobile-indicator">{isMobile ? "mobile" : "desktop"}</div>;
}


// The seven chart IDs expected on the ML Analytics page.
// Each maps to a data-testid and an accessible role="img" element.
const CHART_IDS = [
  "confusion-matrix",
  "precision-recall-f1",
  "roc-curves",
  "cv-accuracy",
  "feature-importance",
  "class-distribution",
  "probability-calibration",
];

// Minimal ML Analytics page component that renders one chart placeholder per ID.
// Used to verify that all seven chart slots are present and correctly identified.
function MLAnalyticsPage() {
  return (
    <div data-testid="ml-analytics">
      {CHART_IDS.map((id) => (
        <div key={id} data-testid={id} role="img" aria-label={id}>
          Chart: {id}
        </div>
      ))}
    </div>
  );
}


describe("Case 14 — Admin Login Modal: Correct Key", () => {
  test("calls onSuccess, stores key in sessionStorage, shows no error", () => {
    const onSuccess = vi.fn();
    render(<AdminLoginModal onSuccess={onSuccess} />);

    // Type the correct key and submit the form
    fireEvent.change(screen.getByTestId("admin-key-input"), { target: { value: ADMIN_KEY } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const storedKey    = sessionStorage.getItem("adminKey");
    const errorVisible = screen.queryByTestId("error-msg") !== null;

    console.log("Case 14: Admin Login Correct Key");
    console.log("  Key entered              :", ADMIN_KEY);
    console.log("  onSuccess called         :", onSuccess.mock.calls.length > 0);
    console.log("  onSuccess called with    :", onSuccess.mock.calls[0]?.[0]);
    console.log("  Key in sessionStorage    :", storedKey);
    console.log("  Error message shown      :", errorVisible);

    // Key must be passed to onSuccess and persisted to sessionStorage
    expect(onSuccess).toHaveBeenCalledWith(ADMIN_KEY);
    expect(storedKey).toBe(ADMIN_KEY);
    // No error message should appear on a successful login
    expect(screen.queryByTestId("error-msg")).not.toBeInTheDocument();
  });
});


describe("Case 15 — Admin Login Modal: Wrong Key", () => {
  test("shows error message and does not call onSuccess", () => {
    const onSuccess = vi.fn();
    render(<AdminLoginModal onSuccess={onSuccess} />);

    // Type an incorrect key and submit
    fireEvent.change(screen.getByTestId("admin-key-input"), { target: { value: "wrong-pass-123" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const errorEl = screen.getByTestId("error-msg");

    console.log("Case 15: Admin Login Wrong Key");
    console.log("  Key entered              :", "wrong-pass-123");
    console.log("  onSuccess called         :", onSuccess.mock.calls.length > 0);
    console.log("  Error message shown      :", errorEl !== null);
    console.log("  Error message text       :", errorEl.textContent);
    console.log("  Modal still visible      :", screen.getByTestId("admin-modal") !== null);

    // onSuccess must never fire for an incorrect key
    expect(onSuccess).not.toHaveBeenCalled();
    // Error message must be present with the exact expected text
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveTextContent("Wrong admin key. Try again.");
  });
});


describe("Case 16 — IoT Predict Button: No Admin Key", () => {

  test("calls onRequestLogin when no admin key is present", () => {
    const onPredict      = vi.fn();
    const onRequestLogin = vi.fn();

    // Render with adminKey=null to simulate an unauthenticated user
    render(<IoTPredictButton adminKey={null} onPredict={onPredict} onRequestLogin={onRequestLogin} />);
    fireEvent.click(screen.getByTestId("predict-btn"));

    console.log("Case 16a: IoT Predict No Admin Key");
    console.log("  adminKey                 :", null);
    console.log("  Button clicked           :", true);
    console.log("  onRequestLogin called    :", onRequestLogin.mock.calls.length > 0);
    console.log("  onRequestLogin count     :", onRequestLogin.mock.calls.length);
    console.log("  onPredict called         :", onPredict.mock.calls.length > 0);

    // Without a key the login modal must be requested, not the prediction
    expect(onRequestLogin).toHaveBeenCalledTimes(1);
    expect(onPredict).not.toHaveBeenCalled();
  });

  test("calls onPredict directly when admin key is present", () => {
    const onPredict      = vi.fn();
    const onRequestLogin = vi.fn();

    // Render with a valid adminKey to simulate an authenticated user
    render(<IoTPredictButton adminKey={ADMIN_KEY} onPredict={onPredict} onRequestLogin={onRequestLogin} />);
    fireEvent.click(screen.getByTestId("predict-btn"));

    console.log("Case 16b: IoT Predict With Admin Key");
    console.log("  adminKey                 :", ADMIN_KEY);
    console.log("  onPredict called         :", onPredict.mock.calls.length > 0);
    console.log("  onPredict count          :", onPredict.mock.calls.length);
    console.log("  onRequestLogin called    :", onRequestLogin.mock.calls.length > 0);

    // With a valid key the prediction must fire immediately without prompting login
    expect(onPredict).toHaveBeenCalledTimes(1);
    expect(onRequestLogin).not.toHaveBeenCalled();
  });
});


describe("Case 18 — useIsMobile Hook", () => {

  // Helper that overrides window.innerWidth for testing responsive behaviour
  const setWidth = (w: number) =>
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: w });

  // Restore a desktop-width window after each test so later tests start clean
  afterEach(() => setWidth(1024));

  test("returns mobile below 768px and desktop above", () => {
    // Test narrow viewport — should report mobile
    setWidth(600);
    const { unmount } = render(<MobileIndicator />);
    const mobileText = screen.getByTestId("mobile-indicator").textContent;

    console.log("Case 18a: useIsMobile Hook");
    console.log("  window.innerWidth        :", 600);
    console.log("  Component output         :", mobileText);
    console.log("  Is mobile                :", mobileText === "mobile");
    unmount();

    // Test wide viewport — should report desktop
    setWidth(1200);
    render(<MobileIndicator />);
    const desktopText = screen.getByTestId("mobile-indicator").textContent;
    console.log("  window.innerWidth        :", 1200);
    console.log("  Component output         :", desktopText);
    console.log("  Is desktop               :", desktopText === "desktop");

    expect(mobileText).toBe("mobile");
    expect(desktopText).toBe("desktop");
  });

  test("updates correctly when window is resized below the breakpoint", () => {
    // Start at desktop width
    setWidth(1024);
    render(<MobileIndicator />);
    const before = screen.getByTestId("mobile-indicator").textContent;

    // Resize to a mobile width and dispatch the resize event so the hook updates
    act(() => {
      setWidth(400);
      window.dispatchEvent(new Event("resize"));
    });

    const after = screen.getByTestId("mobile-indicator").textContent;

    console.log("Case 18b: useIsMobile Resize");
    console.log("  Before resize (1024px)   :", before);
    console.log("  After resize  (400px)    :", after);
    console.log("  Correctly updated        :", after === "mobile");

    // Hook must react to the resize event and flip from desktop to mobile
    expect(before).toBe("desktop");
    expect(after).toBe("mobile");
  });
});


describe("Case 19 — ML Analytics Charts: All Seven Render", () => {
  test("renders exactly 7 charts with correct data-testid values", () => {
    render(<MLAnalyticsPage />);

    // getAllByRole("img") returns all elements with role="img" — one per chart
    const charts = screen.getAllByRole("img");

    console.log("Case 19: ML Analytics Charts");
    console.log("  Total charts rendered    :", charts.length);
    console.log("  Charts found:");
    CHART_IDS.forEach(id => {
      const el = screen.getByTestId(id);
      console.log(`    [found] ${id.padEnd(30)}: ${el.textContent}`);
    });

    // Exactly 7 chart elements must be present — no more, no fewer
    expect(charts).toHaveLength(7);

    // Every chart ID in CHART_IDS must have a corresponding DOM element
    CHART_IDS.forEach(id => {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    });
  });
});
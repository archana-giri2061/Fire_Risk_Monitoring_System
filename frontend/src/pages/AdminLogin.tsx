// AdminLogin.tsx (pages)
// Full-page admin login component used when accessing protected routes directly.
// Validates the admin key client-side first, then verifies it against the backend
// before calling onLogin() so both the frontend config and the server agree.
//
// Two-step validation:
//   1. Compare against VITE_ADMIN_API_KEY from the Vite environment
//   2. Send a real request to /api/ml/metrics with x-admin-key and check for 401

import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

interface Props {
  onLogin:  (key: string) => void;  // Called with the verified key on successful login
  onCancel: () => void;             // Called when the user dismisses without logging in
}

export default function AdminLogin({ onLogin, onCancel }: Props) {
  const [key,     setKey]     = useState("");     // Current value of the key input field
  const [show,    setShow]    = useState(false);  // Whether the key is shown as plain text
  const [error,   setError]   = useState("");     // Inline error message below the input
  const [loading, setLoading] = useState(false);  // True while the backend request is in flight

  const submit = async () => {
    // Reject empty submissions before making any network calls
    if (!key.trim()) { setError("Enter admin key"); return; }

    // Step 1: Compare against the expected key from the Vite environment.
    // Falls back to the hardcoded development key if VITE_ADMIN_API_KEY is not set.
    const EXPECTED = import.meta.env.VITE_ADMIN_API_KEY as string | undefined
      ?? "vanadristi-admin-2026";
    if (key.trim() !== EXPECTED) {
      setError("Wrong admin key. Try again.");
      return;
    }

    // Step 2: Verify the key is accepted by the live backend.
    // A 401 response means the server rejected the key even though it matched
    // the client-side value — this catches mismatches between VITE_ADMIN_API_KEY
    // and ADMIN_API_KEY on the server.
    setLoading(true);
    try {
      const res = await fetch(
        `${(import.meta.env.VITE_API_URL as string || "http://localhost:3000")}/api/ml/metrics`,
        { headers: { "x-admin-key": key.trim(), "Content-Type": "application/json" } },
      );
      if (res.status === 401) {
        setError("Wrong admin key. Try again.");
      } else {
        // Both checks passed — pass the key to the parent for storage and use
        onLogin(key.trim());
      }
    } catch {
      // Network error — even though the client-side key matched, we cannot confirm
      // the backend accepted it, so reject for safety rather than granting access
      setError("Cannot reach server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Key input with lock icon on the left and show/hide toggle on the right */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <div style={{
          position: "absolute", left: 12, top: "50%",
          transform: "translateY(-50%)",
          color: "rgba(255,255,255,0.4)",
        }}>
          <Lock size={15} />
        </div>
        <input
          type={show ? "text" : "password"}
          value={key}
          onChange={e => { setKey(e.target.value); setError(""); }}  // Clear error on each keystroke
          onKeyDown={e => e.key === "Enter" && submit()}             // Allow Enter to submit
          placeholder="Enter admin key"
          autoFocus
          style={{
            width: "100%", padding: "10px 40px 10px 36px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.06)",
            // Red border tint when an error is present to draw attention to the field
            border: error
              ? "1px solid rgba(255,77,77,0.5)"
              : "1px solid rgba(255,255,255,0.12)",
            color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
          }}
        />
        {/* Toggle between password dots and plain text display */}
        <button
          onClick={() => setShow(!show)}
          style={{
            position: "absolute", right: 10, top: "50%",
            transform: "translateY(-50%)",
            background: "none", border: "none",
            color: "rgba(255,255,255,0.35)", cursor: "pointer", padding: 4,
          }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      {/* Inline error message — only rendered when error state is non-empty */}
      {error && (
        <div style={{ fontSize: 12, color: "#ff9999", marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Hint reminding developers where to configure the expected key on the server */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>
        Set{" "}
        <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3 }}>
          ADMIN_API_KEY
        </code>{" "}
        in your EC2{" "}
        <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3 }}>
          .env
        </code>{" "}
        file.
      </div>

      {/* Action buttons — Login triggers the two-step verification, Cancel dismisses */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={loading}
          style={{
            flex: 1, padding: "10px", borderRadius: 12,
            background: "rgba(241,178,74,0.15)",
            border: "1px solid rgba(241,178,74,0.3)",
            color: "#F1B24A", fontWeight: 700, fontSize: 14,
            cursor: loading ? "wait" : "pointer",  // Wait cursor during backend verification
          }}
        >
          {loading ? "Verifying" : "Login"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "10px 16px", borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
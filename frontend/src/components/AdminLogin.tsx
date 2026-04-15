/**
 * AdminLogin.tsx
 * ──────────────
 * Password modal for admin-gated actions.
 * Validates the key client-side then verifies against the backend.
 */
import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

interface Props {
  onLogin:  (key: string) => void;
  onCancel: () => void;
}

export default function AdminLogin({ onLogin, onCancel }: Props) {
  const [key, setKey]         = useState("");
  const [show, setShow]       = useState(false);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!key.trim()) { setError("Enter admin key"); return; }

    const EXPECTED = (import.meta.env.VITE_ADMIN_API_KEY as string | undefined) ?? "vanadristi-admin-2026";
    if (key.trim() !== EXPECTED) { setError("Wrong admin key. Try again."); return; }

    setLoading(true);
    try {
      const res = await fetch(
        `${(import.meta.env.VITE_API_URL as string || "http://localhost:3000")}/api/ml/metrics`,
        { headers: { "x-admin-key": key.trim(), "Content-Type": "application/json" } },
      );
      if (res.status === 401) setError("Wrong admin key. Try again.");
      else onLogin(key.trim());
    } catch {
      setError("Cannot reach server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Key input */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,.4)" }} />
        <input
          type={show ? "text" : "password"}
          value={key}
          onChange={e => { setKey(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Enter admin key…"
          autoFocus
          style={{
            width: "100%", padding: "10px 38px 10px 36px",
            borderRadius: 12,
            background: "rgba(255,255,255,.06)",
            border: error ? "1px solid rgba(255,77,77,.5)" : "1px solid rgba(255,255,255,.12)",
            color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
          }}
        />
        <button
          onClick={() => setShow(s => !s)}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,.35)", cursor: "pointer", padding: 4 }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: "#ff9999", marginBottom: 14 }}>❌ {error}</div>}

      <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginBottom: 16 }}>
        Set <code style={{ background: "rgba(255,255,255,.08)", padding: "1px 5px", borderRadius: 3 }}>ADMIN_API_KEY</code> in your <code style={{ background: "rgba(255,255,255,.08)", padding: "1px 5px", borderRadius: 3 }}>.env</code> file.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={loading}
          style={{ flex: 1, padding: 10, borderRadius: 12, background: "rgba(241,178,74,.15)", border: "1px solid rgba(241,178,74,.3)", color: "#F1B24A", fontWeight: 700, fontSize: 14, cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "Verifying…" : "Login"}
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "10px 16px", borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.5)", fontSize: 14, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
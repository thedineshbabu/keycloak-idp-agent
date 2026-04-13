import { useState, useEffect, useCallback, createContext, useContext, useMemo, useRef } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ── Theme ─────────────────────────────────────────────────────────────────────

const DARK = {
  bg: "#0a0e1a",
  surface: "#111827",
  surfaceAlt: "#1a2236",
  border: "#1e2d45",
  accent: "#3b82f6",
  accentGlow: "#1d4ed8",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#94a3b8",
};

const LITE = {
  bg: "#f0f4f8",
  surface: "#ffffff",
  surfaceAlt: "#f1f5f9",
  border: "#dde3ec",
  accent: "#2563eb",
  accentGlow: "#1d4ed8",
  success: "#059669",
  warning: "#b45309",
  error: "#dc2626",
  text: "#0f172a",
  textMuted: "#64748b",
  textDim: "#334155",
};

const ThemeCtx = createContext("dark");
const useColors = () => {
  const theme = useContext(ThemeCtx);
  return theme === "dark" ? DARK : LITE;
};

const makeStyles = (C) => ({
  app: {
    minHeight: "100vh",
    backgroundColor: C.bg,
    color: C.text,
    fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    borderBottom: `1px solid ${C.border}`,
    padding: "16px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
  },
  headerTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: C.accent,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  headerSub: {
    fontSize: "11px",
    color: C.textMuted,
    marginTop: "2px",
  },
  main: {
    display: "flex",
    flex: 1,
    height: "calc(100vh - 65px)",
  },
  sidebar: {
    width: "220px",
    borderRight: `1px solid ${C.border}`,
    backgroundColor: C.surface,
    padding: "16px 0",
  },
  sidebarItem: (active) => ({
    padding: "10px 20px",
    fontSize: "12px",
    cursor: "pointer",
    color: active ? C.accent : C.textDim,
    backgroundColor: active ? C.accentGlow + "22" : "transparent",
    borderLeft: `2px solid ${active ? C.accent : "transparent"}`,
    letterSpacing: "0.05em",
    transition: "all 0.15s",
  }),
  sidebarSection: {
    fontSize: "10px",
    color: C.textMuted,
    padding: "16px 20px 6px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  content: {
    flex: 1,
    padding: "28px 36px",
    overflowY: "auto",
  },
  card: {
    backgroundColor: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "20px",
  },
  cardTitle: {
    fontSize: "12px",
    fontWeight: 700,
    color: C.accent,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: "20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "11px",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 600,
  },
  input: {
    backgroundColor: C.surfaceAlt,
    border: `1px solid ${C.border}`,
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "12px",
    color: C.text,
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
    width: "100%",
    boxSizing: "border-box",
  },
  textarea: {
    backgroundColor: C.surfaceAlt,
    border: `1px solid ${C.border}`,
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "11px",
    color: C.text,
    fontFamily: "inherit",
    outline: "none",
    resize: "vertical",
    minHeight: "80px",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    backgroundColor: C.surfaceAlt,
    border: `1px solid ${C.border}`,
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "12px",
    color: C.text,
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    cursor: "pointer",
  },
  btn: (variant = "primary") => ({
    padding: "10px 20px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    fontFamily: "inherit",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    transition: "all 0.15s",
    ...(variant === "primary" && {
      backgroundColor: C.accent,
      color: "#fff",
    }),
    ...(variant === "secondary" && {
      backgroundColor: "transparent",
      color: C.textDim,
      border: `1px solid ${C.border}`,
    }),
    ...(variant === "danger" && {
      backgroundColor: C.error + "22",
      color: C.error,
      border: `1px solid ${C.error}44`,
    }),
  }),
  statusDot: (status) => ({
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor:
      status === "pass" ? C.success :
      status === "warn" ? C.warning :
      status === "fail" ? C.error : C.textMuted,
    marginRight: "8px",
    flexShrink: 0,
  }),
  stepRow: {
    display: "flex",
    alignItems: "flex-start",
    padding: "10px 0",
    borderBottom: `1px solid ${C.border}`,
    gap: "12px",
    fontSize: "12px",
  },
  tag: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "3px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    backgroundColor: color + "22",
    color: color,
    border: `1px solid ${color}44`,
  }),
  idpRow: {
    display: "flex",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: `1px solid ${C.border}`,
    gap: "16px",
    fontSize: "12px",
  },
  statCard: {
    backgroundColor: C.surfaceAlt,
    border: `1px solid ${C.border}`,
    borderRadius: "6px",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statValue: {
    fontSize: "22px",
    fontWeight: 700,
    color: C.accent,
  },
  statLabel: {
    fontSize: "10px",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "16px",
    marginBottom: "20px",
  },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "8px",
  },
  barTrack: {
    flex: 1,
    backgroundColor: C.surfaceAlt,
    borderRadius: "3px",
    height: "18px",
    overflow: "hidden",
  },
  certRow: {
    display: "flex",
    alignItems: "center",
    padding: "10px 14px",
    borderLeft: "3px solid",
    borderRadius: "4px",
    marginBottom: "8px",
    backgroundColor: C.surfaceAlt,
    gap: "16px",
    fontSize: "12px",
  },
});

const useStyles = () => {
  const C = useColors();
  return useMemo(() => makeStyles(C), [C]);
};

// ── Auth-aware fetch helper ────────────────────────────────────────────────────
// _accessToken is set by App once OIDC auth succeeds and cleared on logout.
let _accessToken = null;

function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (_accessToken) headers["Authorization"] = `Bearer ${_accessToken}`;
  return fetch(`${API}${path}`, { ...opts, headers });
}

/** Extract a readable string from a FastAPI error response body. */
function apiErrorMsg(body, status) {
  if (status === 403) return "You need admin privileges to perform this action";
  if (!body || typeof body !== "object") return `HTTP ${status}`;
  // FastAPI wraps downstream text in `detail`; that text may itself be JSON
  let detail = body.detail;
  if (typeof detail === "string") {
    try { detail = JSON.parse(detail); } catch { /* keep as string */ }
  }
  if (detail && typeof detail === "object") {
    if (detail.error_details?.message) {
      const { message, code } = detail.error_details;
      return code ? `${message} (code ${code})` : message;
    }
    if (detail.message) return detail.message;
  }
  if (typeof detail === "string" && detail) return detail;
  return `HTTP ${status}`;
}

// ── Domain tag input ──────────────────────────────────────────────────────────

function DomainTagInput({ value, onChange }) {
  const C = useColors();
  const [input, setInput] = useState("");

  const addDomain = () => {
    const d = input.trim().toLowerCase();
    if (d && !value.includes(d)) onChange([...value, d]);
    setInput("");
  };

  const removeDomain = (d) => onChange(value.filter((x) => x !== d));

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addDomain();
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeDomain(value[value.length - 1]);
    }
  };

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center",
      backgroundColor: C.surfaceAlt, border: `1px solid ${C.border}`,
      borderRadius: "4px", padding: "6px 8px", minHeight: "38px",
    }}>
      {value.map((d) => (
        <span key={d} style={{
          backgroundColor: C.accent + "22", color: C.accent,
          border: `1px solid ${C.accent}44`, borderRadius: "3px",
          padding: "2px 8px", fontSize: "11px",
          display: "flex", alignItems: "center", gap: "5px",
        }}>
          {d}
          <span
            onClick={() => removeDomain(d)}
            style={{ cursor: "pointer", color: C.textMuted, fontWeight: 700, lineHeight: 1 }}
          >×</span>
        </span>
      ))}
      <input
        style={{
          border: "none", background: "transparent", outline: "none",
          fontSize: "12px", color: C.text, fontFamily: "inherit",
          flex: "1", minWidth: "140px",
        }}
        placeholder={value.length === 0 ? "Type domain and press Enter..." : "Add another domain..."}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={addDomain}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────


function ThemeToggle({ theme, onToggle }) {
  const C = useColors();
  return (
    <button
      onClick={onToggle}
      style={{
        padding: "4px 12px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        border: `1px solid ${C.border}`,
        backgroundColor: "transparent",
        color: C.textMuted,
        fontFamily: "inherit",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        transition: "all 0.15s",
      }}
    >
      {theme === "dark" ? "◑ Lite" : "◐ Dark"}
    </button>
  );
}

function StatusStep({ step }) {
  const C = useColors();
  const S = useStyles();
  const color = step.status === "pass" ? C.success : step.status === "warn" ? C.warning : C.error;
  return (
    <div style={S.stepRow}>
      <span style={S.statusDot(step.status)} />
      <div style={{ flex: 1 }}>
        <div style={{ color: C.textDim, marginBottom: "2px" }}>{step.step}</div>
        <div style={{ color, fontSize: "11px" }}>{step.detail}</div>
        {step.sample_claims && (
          <pre style={{ marginTop: "6px", fontSize: "10px", color: C.textMuted, backgroundColor: C.surfaceAlt, padding: "8px", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(step.sample_claims, null, 2)}
          </pre>
        )}
      </div>
      <span style={S.tag(color)}>{step.status}</span>
    </div>
  );
}

function ResultPanel({ result }) {
  const C = useColors();
  const S = useStyles();
  if (!result) return null;
  const statusColor = result.status === "success" ? C.success : result.status === "needs_input" ? C.warning : C.error;

  return (
    <div style={{ ...S.card, border: `1px solid ${statusColor}44` }}>
      <div style={{ ...S.cardTitle, color: statusColor }}>
        ● Result — <span style={{ textTransform: "none", fontWeight: 400 }}>{result.status}</span>
      </div>

      {result.message && (
        <div style={{ fontSize: "12px", color: C.textDim, lineHeight: "1.7", marginBottom: "16px" }}>
          {result.message}
        </div>
      )}

      {result.missing_fields && result.missing_fields.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Missing Fields</div>
          {result.missing_fields.map((f) => (
            <div key={f.field} style={{ padding: "8px 12px", backgroundColor: C.surfaceAlt, borderRadius: "4px", marginBottom: "6px", fontSize: "11px" }}>
              <span style={{ color: C.warning, fontWeight: 700 }}>{f.label}</span>
              <span style={{ color: C.textMuted }}> — {f.description}</span>
              {f.example && (
                <div style={{ color: C.textMuted, marginTop: "2px" }}>
                  Example: <span style={{ color: C.textDim }}>{typeof f.example === "string" ? f.example : JSON.stringify(f.example)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.simulation && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Auth Flow Simulation</div>
          {result.simulation.steps.map((s, i) => <StatusStep key={i} step={s} />)}
        </div>
      )}

      {result.llm_review && (result.llm_review.issues?.length > 0 || result.llm_review.suggestions?.length > 0) && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>LLM Review</div>
          {result.llm_review.issues?.map((i, idx) => (
            <div key={idx} style={{ fontSize: "11px", color: C.error, padding: "4px 0" }}>⚠ {i}</div>
          ))}
          {result.llm_review.suggestions?.map((s, idx) => (
            <div key={idx} style={{ fontSize: "11px", color: C.textDim, padding: "4px 0" }}>→ {s}</div>
          ))}
        </div>
      )}

      {result.iam_response && (
        <div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>IAM Response</div>
          <pre style={{ fontSize: "10px", color: C.success, backgroundColor: C.surfaceAlt, padding: "12px", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(result.iam_response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────

function OnboardView() {
  const C = useColors();
  const S = useStyles();
  const [form, setForm] = useState({
    idp_name: "", protocol: "saml", email_domains: [],
    entity_id: "", sso_url: "", certificate: "", slo_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch("/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ status: "error", message: String(e) });
    }
    setLoading(false);
  };

  const clear = () => {
    setForm({ idp_name: "", protocol: "saml", email_domains: [], entity_id: "", sso_url: "", certificate: "", slo_url: "" });
    setResult(null);
  };

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>◈ Onboard New IDP</div>
        <div style={S.grid2}>
          <div style={S.fieldGroup}>
            <label style={S.label}>IDP Name *</label>
            <input style={S.input} placeholder="Acme Corp SSO" value={form.idp_name} onChange={set("idp_name")} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Protocol *</label>
            <select style={S.select} value={form.protocol} onChange={set("protocol")}>
              <option value="saml">SAML 2.0</option>
              <option value="oidc">OIDC</option>
            </select>
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Entity ID *</label>
            <input style={S.input} placeholder="https://idp.acmecorp.com/saml" value={form.entity_id} onChange={set("entity_id")} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>SSO URL *</label>
            <input style={S.input} placeholder="https://idp.acmecorp.com/saml/sso" value={form.sso_url} onChange={set("sso_url")} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>SLO URL</label>
            <input style={S.input} placeholder="https://idp.acmecorp.com/saml/slo" value={form.slo_url} onChange={set("slo_url")} />
          </div>
        </div>

        {/* Multi-domain input — full width */}
        <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
          <label style={S.label}>Email Domains * <span style={{ color: C.textMuted, fontSize: "10px", fontWeight: 400, textTransform: "none" }}>(press Enter or comma to add each)</span></label>
          <DomainTagInput
            value={form.email_domains}
            onChange={(domains) => setForm({ ...form, email_domains: domains })}
          />
        </div>

        <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
          <label style={S.label}>X.509 Certificate *</label>
          <textarea style={S.textarea} placeholder="Paste base64-encoded certificate..." value={form.certificate} onChange={set("certificate")} rows={4} />
        </div>

        <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
          <button style={S.btn("primary")} onClick={submit} disabled={loading}>
            {loading ? "⟳ Processing..." : "▶ Run Agent"}
          </button>
          <button style={S.btn("secondary")} onClick={clear}>✕ Clear</button>
        </div>
      </div>
      <ResultPanel result={result} />
    </div>
  );
}

function UpdateView() {
  const C = useColors();
  const S = useStyles();
  const [domain, setDomain] = useState("");
  const [existing, setExisting] = useState(null);
  const [updates, setUpdates] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fetching, setFetching] = useState(false);

  const fetchIDP = async () => {
    setFetching(true);
    setExisting(null);
    setResult(null);
    try {
      const res = await apiFetch("/idps");
      const all = await res.json();
      const found = all.find((i) => {
        const domains = Array.isArray(i.email_domains) ? i.email_domains : [i.email_domain];
        return domains.includes(domain);
      });
      setExisting(found || null);
      if (!found) setResult({ status: "not_found", message: `No IDP found for domain '${domain}'` });
    } catch (e) {
      setResult({ status: "error", message: String(e) });
    }
    setFetching(false);
  };

  const submitUpdate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch("/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_domain: domain, updates }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ status: "error", message: String(e) });
    }
    setLoading(false);
  };

  const editableFields = ["sso_url", "slo_url", "certificate", "entity_id"];

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>◈ Update Existing IDP</div>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "20px" }}>
          <div style={{ ...S.fieldGroup, flex: 1 }}>
            <label style={S.label}>Search by Email Domain</label>
            <input style={S.input} placeholder="acmecorp.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <button style={S.btn("secondary")} onClick={fetchIDP} disabled={fetching || !domain}>
            {fetching ? "⟳" : "Fetch IDP"}
          </button>
        </div>

        {existing && (
          <>
            <div style={{ fontSize: "11px", color: C.success, marginBottom: "4px" }}>
              ✓ Found: <span style={{ color: C.text }}>{existing.idp_name}</span>
            </div>
            <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "16px" }}>
              Domains: {(existing.email_domains || [existing.email_domain]).join(", ")}
            </div>
            <div style={S.grid2}>
              {editableFields.map((field) => (
                <div key={field} style={S.fieldGroup}>
                  <label style={S.label}>{field.replace(/_/g, " ")}</label>
                  {field === "certificate" ? (
                    <textarea
                      style={S.textarea}
                      defaultValue={existing[field] || ""}
                      onChange={(e) => setUpdates({ ...updates, [field]: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <input
                      style={S.input}
                      defaultValue={existing[field] || ""}
                      onChange={(e) => setUpdates({ ...updates, [field]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Email domains editable as tags */}
            <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
              <label style={S.label}>Email Domains <span style={{ color: C.textMuted, fontSize: "10px", fontWeight: 400, textTransform: "none" }}>(press Enter or comma to add)</span></label>
              <DomainTagInput
                value={updates.email_domains ?? (existing.email_domains || [])}
                onChange={(domains) => setUpdates({ ...updates, email_domains: domains })}
              />
            </div>

            <div style={{ marginTop: "20px" }}>
              <button
                style={S.btn("primary")}
                onClick={submitUpdate}
                disabled={loading || Object.keys(updates).length === 0}
              >
                {loading ? "⟳ Updating..." : "▶ Apply Updates"}
              </button>
            </div>
          </>
        )}
      </div>
      <ResultPanel result={result} />
    </div>
  );
}

function GetIDPView({ isAdmin }) {
  const C = useColors();
  const S = useStyles();
  const [input, setInput] = useState("");
  const [idp, setIdp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // mode: "view" | "edit" | "clone"
  const [mode, setMode] = useState("view");

  // edit state
  const [updates, setUpdates] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  // clone state
  const [cloneForm, setCloneForm] = useState(null);
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState(null);

  // Extract domain from email or return input as-is
  const parsedDomain = input.includes("@") ? input.split("@").pop().trim() : input.trim();

  const search = async () => {
    if (!parsedDomain) return;
    setLoading(true);
    setIdp(null);
    setError(null);
    setMode("view");
    setUpdates({});
    setSaveResult(null);
    setCloneForm(null);
    setCloneResult(null);
    try {
      const res = await apiFetch(`/idps/${encodeURIComponent(parsedDomain)}`);
      if (res.ok) {
        setIdp(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || `No IDP found for domain '${parsedDomain}'`);
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  const saveEdits = async () => {
    if (Object.keys(updates).length === 0) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await apiFetch("/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_domain: parsedDomain, updates }),
      });
      const data = await res.json();
      setSaveResult(data);
      if (data.status === "success") {
        setIdp({ ...idp, ...updates });
        setMode("view");
        setUpdates({});
      }
    } catch (e) {
      setSaveResult({ status: "error", message: String(e) });
    }
    setSaving(false);
  };

  const startClone = () => {
    // Pre-fill all SAML attributes except email_domains
    setCloneForm({
      idp_name: `${idp.idp_name} (clone)`,
      protocol: idp.protocol || "saml",
      entity_id: idp.entity_id || "",
      sso_url: idp.sso_url || "",
      slo_url: idp.slo_url || "",
      certificate: idp.certificate || "",
      email_domains: [],          // intentionally blank — user must provide
    });
    setCloneResult(null);
    setMode("clone");
  };

  const submitClone = async () => {
    setCloning(true);
    setCloneResult(null);
    try {
      const res = await apiFetch("/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloneForm),
      });
      const data = await res.json();
      setCloneResult(data);
    } catch (e) {
      setCloneResult({ status: "error", message: String(e) });
    }
    setCloning(false);
  };

  const setClone = (k) => (e) => setCloneForm({ ...cloneForm, [k]: e.target.value });

  const editableFields = ["sso_url", "slo_url", "certificate", "entity_id"];

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>◈ Get IDP by Domain</div>

        {/* ── Search bar ── */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "8px" }}>
          <div style={{ ...S.fieldGroup, flex: 1, marginBottom: 0 }}>
            <label style={S.label}>Email or Domain</label>
            <input
              style={S.input}
              placeholder="user@acmecorp.com or acmecorp.com"
              value={input}
              onChange={(e) => { setInput(e.target.value); setIdp(null); setError(null); setMode("view"); }}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <button style={S.btn("secondary")} onClick={search} disabled={loading || !parsedDomain}>
            {loading ? "⟳" : "Lookup"}
          </button>
        </div>

        {input.includes("@") && parsedDomain && (
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "16px" }}>
            Domain extracted: <span style={{ color: C.accent }}>{parsedDomain}</span>
          </div>
        )}

        {error && (
          <div style={{ color: C.error, fontSize: "12px", marginTop: "8px" }}>{error}</div>
        )}

        {/* ── Read-only view ── */}
        {idp && mode === "view" && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: C.success }}>
                ✓ Found: <span style={{ color: C.text, fontWeight: 600 }}>{idp.idp_name}</span>
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    style={{ ...S.btn("secondary"), padding: "4px 14px", fontSize: "11px" }}
                    onClick={() => { setMode("edit"); setSaveResult(null); }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    style={{ ...S.btn("secondary"), padding: "4px 14px", fontSize: "11px", borderColor: C.accent, color: C.accent }}
                    onClick={startClone}
                  >
                    ⎘ Clone
                  </button>
                </div>
              )}
            </div>
            {Object.entries(idp).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: "16px", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: "12px" }}>
                <span style={{ width: "180px", color: C.textMuted, flexShrink: 0 }}>{k}</span>
                <span style={{ color: C.text, wordBreak: "break-all" }}>
                  {Array.isArray(v) ? v.join(", ") : String(v ?? "—")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Edit mode ── */}
        {idp && mode === "edit" && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "11px", color: C.accent, marginBottom: "16px", fontWeight: 600 }}>
              Editing: <span style={{ color: C.text }}>{idp.idp_name}</span>
              <span style={{ color: C.textMuted, fontWeight: 400 }}> — {parsedDomain}</span>
            </div>

            <div style={S.grid2}>
              {editableFields.map((field) => (
                <div key={field} style={S.fieldGroup}>
                  <label style={S.label}>{field.replace(/_/g, " ")}</label>
                  {field === "certificate" ? (
                    <textarea
                      style={S.textarea}
                      defaultValue={idp[field] || ""}
                      onChange={(e) => setUpdates({ ...updates, [field]: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <input
                      style={S.input}
                      defaultValue={idp[field] || ""}
                      onChange={(e) => setUpdates({ ...updates, [field]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
              <label style={S.label}>
                Email Domains{" "}
                <span style={{ color: C.textMuted, fontSize: "10px", fontWeight: 400, textTransform: "none" }}>
                  (press Enter or comma to add)
                </span>
              </label>
              <DomainTagInput
                value={updates.email_domains ?? (idp.email_domains || [])}
                onChange={(domains) => setUpdates({ ...updates, email_domains: domains })}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
              <button style={S.btn("primary")} onClick={saveEdits} disabled={saving || Object.keys(updates).length === 0}>
                {saving ? "⟳ Saving..." : "▶ Save Changes"}
              </button>
              <button style={S.btn("secondary")} onClick={() => { setMode("view"); setUpdates({}); setSaveResult(null); }} disabled={saving}>
                ✕ Cancel
              </button>
            </div>

            {saveResult && (
              <div style={{ marginTop: "12px", fontSize: "12px", color: saveResult.status === "success" ? C.success : C.error }}>
                {saveResult.status === "success" ? "✓ Changes saved successfully." : `✗ ${saveResult.message || JSON.stringify(saveResult)}`}
              </div>
            )}
          </div>
        )}

        {/* ── Clone mode ── */}
        {idp && mode === "clone" && cloneForm && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "11px", color: C.accent, marginBottom: "4px", fontWeight: 600 }}>
              ⎘ Cloning from: <span style={{ color: C.textMuted, fontWeight: 400 }}>{idp.idp_name}</span>
            </div>
            <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "16px" }}>
              SAML attributes pre-filled. Provide a new name and at least one email domain.
            </div>

            <div style={S.grid2}>
              <div style={S.fieldGroup}>
                <label style={S.label}>IDP Name *</label>
                <input style={S.input} value={cloneForm.idp_name} onChange={setClone("idp_name")} />
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>Protocol</label>
                <select style={S.select} value={cloneForm.protocol} onChange={setClone("protocol")}>
                  <option value="saml">SAML 2.0</option>
                  <option value="oidc">OIDC</option>
                </select>
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>Entity ID</label>
                <input style={S.input} value={cloneForm.entity_id} onChange={setClone("entity_id")} />
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>SSO URL</label>
                <input style={S.input} value={cloneForm.sso_url} onChange={setClone("sso_url")} />
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>SLO URL</label>
                <input style={S.input} value={cloneForm.slo_url} onChange={setClone("slo_url")} />
              </div>
            </div>

            <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
              <label style={S.label}>
                Email Domains *{" "}
                <span style={{ color: C.warning, fontSize: "10px", fontWeight: 400, textTransform: "none" }}>
                  (not copied — enter new domains)
                </span>
              </label>
              <DomainTagInput
                value={cloneForm.email_domains}
                onChange={(domains) => setCloneForm({ ...cloneForm, email_domains: domains })}
              />
            </div>

            <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
              <label style={S.label}>X.509 Certificate</label>
              <textarea
                style={S.textarea}
                value={cloneForm.certificate}
                onChange={setClone("certificate")}
                rows={3}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
              <button
                style={S.btn("primary")}
                onClick={submitClone}
                disabled={cloning || !cloneForm.idp_name.trim() || cloneForm.email_domains.length === 0}
              >
                {cloning ? "⟳ Onboarding..." : "▶ Onboard Clone"}
              </button>
              <button style={S.btn("secondary")} onClick={() => { setMode("view"); setCloneResult(null); }} disabled={cloning}>
                ✕ Cancel
              </button>
            </div>

            {cloneResult && (
              <div style={{ marginTop: "12px", fontSize: "12px", color: cloneResult.status === "success" ? C.success : C.error }}>
                {cloneResult.status === "success"
                  ? `✓ Clone onboarded successfully as "${cloneForm.idp_name}".`
                  : `✗ ${cloneResult.message || JSON.stringify(cloneResult)}`}
              </div>
            )}
          </div>
        )}
      </div>
      <ResultPanel result={
        (mode === "edit" && saveResult && saveResult.status !== "success") ? saveResult :
        (mode === "clone" && cloneResult && cloneResult.status !== "success") ? cloneResult :
        null
      } />
    </div>
  );
}

function MyIDPView({ user }) {
  const C = useColors();
  const S = useStyles();
  const defaultDomain = user?.email?.split("@")[1] ?? "";
  const [form, setForm] = useState({
    idp_name: "", protocol: "saml", email_domains: defaultDomain ? [defaultDomain] : [],
    entity_id: "", sso_url: "", certificate: "", slo_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch("/onboard-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ status: "error", message: String(e) });
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>◈ Add My IDP</div>
        {user?.email && (
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "16px" }}>
            Registering IDP for <span style={{ color: C.accent }}>{user.email}</span>
          </div>
        )}
        <div style={S.grid2}>
          <div style={S.fieldGroup}>
            <label style={S.label}>IDP Name *</label>
            <input style={S.input} placeholder="My Org SSO" value={form.idp_name} onChange={set("idp_name")} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Protocol *</label>
            <select style={S.select} value={form.protocol} onChange={set("protocol")}>
              <option value="saml">SAML 2.0</option>
              <option value="oidc">OIDC</option>
            </select>
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Entity ID *</label>
            <input style={S.input} placeholder="https://idp.myorg.com/saml" value={form.entity_id} onChange={set("entity_id")} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>SSO URL *</label>
            <input style={S.input} placeholder="https://idp.myorg.com/saml/sso" value={form.sso_url} onChange={set("sso_url")} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>SLO URL</label>
            <input style={S.input} placeholder="https://idp.myorg.com/saml/slo" value={form.slo_url} onChange={set("slo_url")} />
          </div>
        </div>

        <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
          <label style={S.label}>Email Domains * <span style={{ color: C.textMuted, fontSize: "10px", fontWeight: 400, textTransform: "none" }}>(press Enter or comma to add)</span></label>
          <DomainTagInput
            value={form.email_domains}
            onChange={(domains) => setForm({ ...form, email_domains: domains })}
          />
        </div>

        <div style={{ ...S.fieldGroup, marginTop: "16px" }}>
          <label style={S.label}>X.509 Certificate *</label>
          <textarea style={S.textarea} placeholder="Paste base64-encoded certificate..." value={form.certificate} onChange={set("certificate")} rows={4} />
        </div>

        <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
          <button style={S.btn("primary")} onClick={submit} disabled={loading}>
            {loading ? "⟳ Processing..." : "▶ Register IDP"}
          </button>
          <button style={S.btn("secondary")} onClick={() => { setForm({ idp_name: "", protocol: "saml", email_domains: defaultDomain ? [defaultDomain] : [], entity_id: "", sso_url: "", certificate: "", slo_url: "" }); setResult(null); }}>✕ Clear</button>
        </div>
      </div>
      <ResultPanel result={result} />
    </div>
  );
}

function IDPListView() {
  const C = useColors();
  const S = useStyles();
  const [idps, setIdps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/idps")
      .then((r) => r.json())
      .then(setIdps)
      .catch(() => setIdps([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>◈ Configured IDPs</div>
      {loading && <div style={{ color: C.textMuted, fontSize: "12px" }}>Loading...</div>}
      {!loading && idps.length === 0 && <div style={{ color: C.textMuted, fontSize: "12px" }}>No IDPs found.</div>}
      {idps.map((idp, i) => {
        const domains = Array.isArray(idp.email_domains)
          ? idp.email_domains
          : idp.email_domain ? [idp.email_domain] : [];
        return (
          <div key={i} style={S.idpRow}>
            <span style={{ width: "140px", color: C.text, fontWeight: 600 }}>{idp.idp_name}</span>
            <span style={{ flex: 1, color: C.textMuted, fontSize: "11px" }}>
              {domains.map((d) => (
                <span key={d} style={{ ...S.tag(C.accent), marginRight: "4px" }}>{d}</span>
              ))}
            </span>
            <span style={S.tag(C.accent)}>{idp.protocol}</span>
            <span style={S.tag(idp.is_active ? C.success : C.error)}>
              {idp.is_active ? "active" : "inactive"}
            </span>
            <span style={{ color: C.textMuted, fontSize: "11px", width: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {idp.entity_id}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function BarChart({ data, valueKey, labelKey }) {
  const C = useColors();
  const S = useStyles();
  if (!data.length) return <div style={{ color: C.textMuted, fontSize: "12px" }}>No data.</div>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0)) || 1;
  return (
    <div>
      {data.map((item, i) => (
        <div key={i} style={S.barRow}>
          <div style={{ width: "130px", fontSize: "11px", color: C.textDim, textAlign: "right", flexShrink: 0 }}>
            {item[labelKey]}
          </div>
          <div style={S.barTrack}>
            <div style={{
              width: `${Math.round((Number(item[valueKey]) / max) * 100)}%`,
              backgroundColor: C.accent,
              height: "100%",
              transition: "width 0.4s",
              minWidth: "2px",
            }} />
          </div>
          <div style={{ width: "70px", fontSize: "11px", color: C.textMuted, textAlign: "right", flexShrink: 0 }}>
            {Number(item[valueKey]).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, valueKey, labelKey }) {
  const C = useColors();
  if (data.length < 2) return <div style={{ color: C.textMuted, fontSize: "12px" }}>Not enough data.</div>;
  const W = 560; const H = 100; const PAD = 30;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0)) || 1;
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - (Number(d[valueKey]) / max) * (H - 2 * PAD);
    return [x, y];
  });
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100px" }}>
      <polyline points={polyline} fill="none" stroke={C.accent} strokeWidth="1.5" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3" fill={C.accent} />
          {i % Math.ceil(data.length / 7) === 0 && (
            <text x={x} y={H - 4} textAnchor="middle" fontSize="8" fill={C.textMuted}>
              {String(data[i][labelKey]).slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Usage View ────────────────────────────────────────────────────────────────

function UsageView() {
  const C = useColors();
  const S = useStyles();
  const [summary, setSummary] = useState(null);
  const [byProvider, setByProvider] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, t, r] = await Promise.all([
        apiFetch("/usage/summary").then((x) => x.json()),
        apiFetch("/usage/by-provider").then((x) => x.json()),
        apiFetch("/usage/timeline").then((x) => x.json()),
        apiFetch("/usage/recent").then((x) => x.json()),
      ]);
      setSummary(s);
      setByProvider(p);
      setTimeline(t);
      setRecent(r);
    } catch {
      setSummary({ total_tokens: 0, total_cost_usd: 0, by_operation: [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const topModel = byProvider.reduce((a, b) => (Number(b.tokens) > Number(a.tokens || 0) ? b : a), {});

  const thRow = { color: C.textMuted, textAlign: "left" };
  const th = { padding: "6px 12px 6px 0", borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.07em" };
  const td = (extra = {}) => ({ padding: "8px 12px 8px 0", ...extra });

  return (
    <div>
      {loading && <div style={{ color: C.textMuted, fontSize: "12px" }}>Loading...</div>}
      {!loading && summary && (
        <>
          <div style={S.grid3}>
            <div style={S.statCard}>
              <div style={S.statValue}>{Number(summary.total_tokens).toLocaleString()}</div>
              <div style={S.statLabel}>Total Tokens (30d)</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statValue}>${Number(summary.total_cost_usd).toFixed(4)}</div>
              <div style={S.statLabel}>Estimated Cost (30d)</div>
            </div>
            <div style={S.statCard}>
              <div style={{ ...S.statValue, fontSize: "14px" }}>{topModel.model || "—"}</div>
              <div style={S.statLabel}>Most Used Model</div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>◈ Tokens by Operation</div>
            <BarChart data={summary.by_operation} valueKey="tokens" labelKey="operation" />
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>◈ Daily Token Usage (last 30 days)</div>
            <LineChart data={timeline} valueKey="tokens" labelKey="date" />
          </div>

          {byProvider.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>◈ Provider Breakdown</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={thRow}>
                    {["Provider", "Model", "Calls", "Tokens", "Cost"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byProvider.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={td({ color: C.text })}>{r.llm_provider}</td>
                      <td style={td({ color: C.textDim })}>{r.model}</td>
                      <td style={td({ color: C.textMuted })}>{r.calls}</td>
                      <td style={td({ color: C.textMuted })}>{Number(r.tokens).toLocaleString()}</td>
                      <td style={td({ color: C.accent })}>${Number(r.cost).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recent.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>◈ Recent LLM Calls</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={thRow}>
                    {["Operation", "Model", "Tokens", "Cost", "Duration", "Status", "Time"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={td({ color: C.text })}>{r.operation}</td>
                      <td style={td({ color: C.textDim })}>{r.model}</td>
                      <td style={td({ color: C.textMuted })}>{r.total_tokens}</td>
                      <td style={td({ color: C.accent })}>${Number(r.estimated_cost_usd).toFixed(5)}</td>
                      <td style={td({ color: C.textMuted })}>{r.duration_ms}ms</td>
                      <td style={td()}>
                        <span style={S.tag(r.success ? C.success : C.error)}>
                          {r.success ? "ok" : "fail"}
                        </span>
                      </td>
                      <td style={td({ color: C.textMuted })}>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Certificate View ──────────────────────────────────────────────────────────

function CertificatesView({ isAdmin }) {
  const C = useColors();
  const S = useStyles();
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [rotateDomain, setRotateDomain] = useState("");
  const [newCert, setNewCert] = useState("");
  const [rotateResult, setRotateResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/certificates/scan").then((x) => x.json());
      setCerts(data);
    } catch {
      setCerts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusColor = (s) =>
    s === "critical" ? C.error :
    s === "warning"  ? C.warning :
    s === "ok"       ? C.success : C.textMuted;

  const critical = certs.filter((c) => c.certificate_status?.status === "critical");

  const submitRotate = async () => {
    if (!rotateDomain || !newCert) return;
    setRotating(true);
    setRotateResult(null);
    try {
      const res = await apiFetch("/certificates/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_domain: rotateDomain, new_certificate: newCert }),
      });
      const data = await res.json();
      setRotateResult(data);
      if (data.status === "success") load();
    } catch (e) {
      setRotateResult({ status: "error", message: String(e) });
    }
    setRotating(false);
  };

  return (
    <div>
      {critical.length > 0 && (
        <div style={{ backgroundColor: C.error + "18", border: `1px solid ${C.error}44`, borderRadius: "6px", padding: "12px 16px", marginBottom: "20px", fontSize: "12px", color: C.error }}>
          ⚠ {critical.length} certificate{critical.length > 1 ? "s" : ""} expiring within 14 days:{" "}
          {critical.map((c) => c.idp_name).join(", ")}
        </div>
      )}

      <div style={S.card}>
        <div style={{ ...S.cardTitle, display: "flex", justifyContent: "space-between" }}>
          <span>◈ Certificate Health</span>
          <button style={S.btn("secondary")} onClick={load} disabled={loading}>
            {loading ? "⟳" : "Refresh"}
          </button>
        </div>
        {loading && <div style={{ color: C.textMuted, fontSize: "12px" }}>Scanning...</div>}
        {!loading && certs.length === 0 && <div style={{ color: C.textMuted, fontSize: "12px" }}>No IDPs found.</div>}
        {certs.map((c, i) => {
          const cs = c.certificate_status;
          const color = statusColor(cs.status);
          const domains = c.email_domains || [];
          return (
            <div key={i} style={{ ...S.certRow, borderLeftColor: color }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: C.text }}>{c.idp_name}</div>
                <div style={{ color: C.textMuted, fontSize: "11px", marginTop: "3px" }}>
                  {domains.map((d) => (
                    <span key={d} style={{ ...S.tag(C.accent), marginRight: "4px" }}>{d}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: "120px" }}>
                {cs.days_remaining != null ? (
                  <>
                    <div style={{ color, fontWeight: 700 }}>{cs.days_remaining}d remaining</div>
                    <div style={{ color: C.textMuted, fontSize: "10px" }}>{cs.expiry_date?.slice(0, 10)}</div>
                  </>
                ) : (
                  <div style={{ color: C.textMuted, fontSize: "11px" }}>{cs.message || cs.error || cs.status}</div>
                )}
              </div>
              <span style={S.tag(color)}>{cs.status}</span>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div style={S.card}>
          <div style={S.cardTitle}>◈ Rotate Certificate</div>
          <div style={{ ...S.grid2, marginBottom: "16px" }}>
            <div style={S.fieldGroup}>
              <label style={S.label}>Email Domain</label>
              <input style={S.input} placeholder="acmecorp.com" value={rotateDomain}
                onChange={(e) => setRotateDomain(e.target.value)} />
            </div>
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>New Certificate (PEM or base64)</label>
            <textarea style={S.textarea} rows={5}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              value={newCert} onChange={(e) => setNewCert(e.target.value)} />
          </div>
          <div style={{ marginTop: "16px" }}>
            <button style={S.btn("primary")} onClick={submitRotate}
              disabled={rotating || !rotateDomain || !newCert}>
              {rotating ? "⟳ Rotating..." : "▶ Rotate Certificate"}
            </button>
          </div>
          {rotateResult && (
            <div style={{ marginTop: "16px", padding: "12px", borderRadius: "4px",
              backgroundColor: C.surfaceAlt, fontSize: "11px",
              color: rotateResult.status === "success" ? C.success : C.error }}>
              {rotateResult.status === "success"
                ? `✓ Certificate rotated for ${rotateDomain}`
                : `✗ ${rotateResult.message || rotateResult.status}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── OIDC / Keycloak PKCE auth ─────────────────────────────────────────────────

const OIDC = {
  base:      (import.meta.env.VITE_KEYCLOAK_URL ?? "") + "/realms/" + (import.meta.env.VITE_KEYCLOAK_REALM ?? "master") + "/protocol/openid-connect",
  clientId:  import.meta.env.VITE_KEYCLOAK_CLIENT ?? "",
  scope:     "openid email profile",
  redirectUri: () => window.location.origin + "/",
};

function _b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function _randomB64url(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return _b64url(arr.buffer);
}

async function _codeChallenge(verifier) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return _b64url(buf);
}

function _parseIdToken(token) {
  try {
    const [, b64] = token.split(".");
    const json = JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
    return {
      sub:   json.sub,
      email: json.email,
      name:  json.name || json.preferred_username,
      roles: [
        ...(json.realm_access?.roles || []),
        ...(json.resource_access?.[OIDC.clientId]?.roles || []),
      ],
    };
  } catch {
    return null;
  }
}

// Redirect to Keycloak with login_hint = captured email
async function oidcLogin(email) {
  const state     = _randomB64url(16);
  const verifier  = _randomB64url(32);
  const challenge = await _codeChallenge(verifier);

  sessionStorage.setItem("oidc_state",    state);
  sessionStorage.setItem("oidc_verifier", verifier);

  const params = new URLSearchParams({
    client_id:             OIDC.clientId,
    redirect_uri:          OIDC.redirectUri(),
    response_type:         "code",
    scope:                 OIDC.scope,
    state,
    code_challenge:        challenge,
    code_challenge_method: "S256",
    ...(email ? { login_hint: email } : {}),
  });

  window.location.href = `${OIDC.base}/auth?${params}`;
}

function oidcLogout(idToken) {
  _accessToken = null;
  sessionStorage.removeItem("oidc_token");
  const params = new URLSearchParams({
    client_id:                OIDC.clientId,
    post_logout_redirect_uri: OIDC.redirectUri(),
    ...(idToken ? { id_token_hint: idToken } : {}),
  });
  window.location.href = `${OIDC.base}/logout?${params}`;
}

// Returns { status: "loading" | "login" | "ready", user?, token?, error? }
function useOidcAuth() {
  const [auth, setAuth] = useState({ status: "loading" });

  useEffect(() => {
    (async () => {
      const q     = new URLSearchParams(window.location.search);
      const code  = q.get("code");
      const state = q.get("state");
      const error = q.get("error");

      // ── Keycloak error redirect ──────────────────────────────────────────
      if (error) {
        window.history.replaceState({}, "", window.location.pathname);
        setAuth({ status: "login", error: q.get("error_description") || error });
        return;
      }

      // ── Authorization code callback ──────────────────────────────────────
      if (code && state) {
        const savedState = sessionStorage.getItem("oidc_state");
        const verifier   = sessionStorage.getItem("oidc_verifier");
        sessionStorage.removeItem("oidc_state");
        sessionStorage.removeItem("oidc_verifier");
        window.history.replaceState({}, "", window.location.pathname);

        if (state !== savedState) {
          setAuth({ status: "login", error: "State mismatch — possible CSRF, please try again." });
          return;
        }

        try {
          const resp = await fetch(`${OIDC.base}/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type:    "authorization_code",
              client_id:     OIDC.clientId,
              code,
              redirect_uri:  OIDC.redirectUri(),
              code_verifier: verifier,
            }),
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`${resp.status} — ${txt}`);
          }
          const tokenData = await resp.json();
          const stored    = { ...tokenData, expires_at: Date.now() + tokenData.expires_in * 1000 };
          sessionStorage.setItem("oidc_token", JSON.stringify(stored));
          const user = _parseIdToken(tokenData.id_token);
          setAuth({ status: "ready", user, token: stored });
        } catch (e) {
          setAuth({ status: "login", error: `Token exchange failed: ${e.message}` });
        }
        return;
      }

      // ── Restore existing session ─────────────────────────────────────────
      const raw = sessionStorage.getItem("oidc_token");
      if (raw) {
        try {
          const stored = JSON.parse(raw);
          if (stored.expires_at > Date.now()) {
            const user = _parseIdToken(stored.id_token);
            if (user) {
              setAuth({ status: "ready", user, token: stored });
              return;
            }
          }
        } catch { /* fall through */ }
        sessionStorage.removeItem("oidc_token");
      }

      setAuth({ status: "login" });
    })();
  }, []);

  return auth;
}

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage({ error }) {
  const C = useColors();
  const [email, setEmail] = useState("");
  const [busy, setBusy]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    await oidcLogin(email.trim());
    // page navigates away; no need to reset busy
  };

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: C.bg, color: C.text,
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        backgroundColor: C.surface, border: `1px solid ${C.border}`,
        borderRadius: "8px", padding: "40px 36px",
        width: "100%", maxWidth: "360px",
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: C.accent, letterSpacing: "0.12em" }}>
            ⬡ TALENT SUITE
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px", letterSpacing: "0.06em" }}>
            Platform Agent
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: C.error + "18", border: `1px solid ${C.error}44`,
            borderRadius: "4px", padding: "10px 14px", marginBottom: "20px",
            fontSize: "11px", color: C.error, lineHeight: "1.5",
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block", fontSize: "10px", fontWeight: 600,
              color: C.textMuted, textTransform: "uppercase",
              letterSpacing: "0.1em", marginBottom: "8px",
            }}>
              Work Email
            </label>
            <input
              type="email"
              required
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                backgroundColor: C.surfaceAlt, border: `1px solid ${C.border}`,
                borderRadius: "4px", padding: "10px 14px",
                fontSize: "13px", color: C.text,
                fontFamily: "inherit", outline: "none",
                transition: "border-color 0.15s",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={busy || !email.trim()}
            style={{
              width: "100%", padding: "11px",
              backgroundColor: C.accent, color: "#fff",
              border: "none", borderRadius: "4px",
              fontSize: "12px", fontWeight: 700,
              fontFamily: "inherit", letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: busy ? "wait" : "pointer",
              opacity: busy || !email.trim() ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {busy ? "Redirecting to Keycloak..." : "Continue with SSO →"}
          </button>
        </form>

        <div style={{
          marginTop: "24px", fontSize: "10px", color: C.textMuted,
          textAlign: "center", lineHeight: "1.8",
        }}>
          Your email is passed as a login hint so Keycloak can<br />
          route you to your organization's identity provider.
        </div>
      </div>
    </div>
  );
}

// ── Client Explorer ───────────────────────────────────────────────────────────

function ClientExplorerView() {
  const C = useColors();
  const S = useStyles();
  const [search, setSearch]         = useState("");
  const [clients, setClients]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [products, setProducts]     = useState([]);
  const [tab, setTab]               = useState("overview");
  const [initialLoad, setInitialLoad] = useState(true);

  const loadClients = async (q = "") => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/platform/clients?search=${encodeURIComponent(q)}&limit=30`);
      if (res.ok) {
        const d = await res.json();
        setClients(Array.isArray(d) ? d : d.data || d.clients || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(apiErrorMsg(err, res.status));
        setClients([]);
      }
    } catch (e) {
      setError(String(e));
      setClients([]);
    }
    setLoading(false);
    setInitialLoad(false);
  };

  const loadDetail = async (id) => {
    setDetail(null); setProducts([]); setDetailError(null);
    try {
      const [dRes, pRes] = await Promise.all([
        apiFetch(`/platform/clients/${id}`),
        apiFetch(`/platform/clients/${id}/products`),
      ]);
      if (dRes.ok) setDetail(await dRes.json());
      else { const e = await dRes.json().catch(() => ({})); setDetailError(apiErrorMsg(e, dRes.status)); }
      if (pRes.ok) { const p = await pRes.json(); setProducts(Array.isArray(p) ? p : []); }
    } catch (e) { setDetailError(String(e)); }
  };

  useEffect(() => { loadClients(); }, []);

  const pick = (client) => {
    const id = client.client_key || client.clientKey || client.id;
    setSelectedId(id); setTab("overview"); loadDetail(id);
  };

  const field = (label, val) => val != null && val !== "" ? (
    <div key={label} style={S.fieldGroup}>
      <label style={S.label}>{label}</label>
      <div style={{ fontSize: "13px", color: C.text }}>{String(val)}</div>
    </div>
  ) : null;

  return (
    <div>
      {/* Search bar */}
      <div style={S.card}>
        <div style={S.cardTitle}>◈ Client Explorer</div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Search by client name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadClients(search)}
          />
          <button style={S.btn("primary")} onClick={() => loadClients(search)} disabled={loading}>
            {loading ? "…" : "Search"}
          </button>
          <button style={S.btn("secondary")} onClick={() => { setSearch(""); loadClients(""); }}>
            Reset
          </button>
        </div>

        {loading && <div style={{ fontSize: "12px", color: C.textMuted }}>Loading clients…</div>}
        {error && (
          <div style={{ fontSize: "12px", color: C.error, padding: "8px 12px", borderRadius: "4px",
            backgroundColor: C.error + "18", border: `1px solid ${C.error}44`, marginBottom: "8px" }}>
            Error: {error}
          </div>
        )}
        {!loading && !error && !initialLoad && clients.length === 0 && (
          <div style={{ fontSize: "12px", color: C.textMuted }}>No clients found.</div>
        )}

        {clients.map((c) => {
          const id = c.client_key || c.clientKey || c.id;
          const name = c.client_name || c.clientName || c.name || "—";
          const code = c.client_code || c.clientCode || "";
          const pams = c.pams_id || c.pamsId || "";
          return (
            <div
              key={id}
              onClick={() => pick(c)}
              style={{
                ...S.idpRow, cursor: "pointer", borderRadius: "4px",
                paddingLeft: "10px", paddingRight: "10px",
                backgroundColor: selectedId === id ? C.accentGlow + "18" : "transparent",
                borderLeft: `2px solid ${selectedId === id ? C.accent : "transparent"}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", color: C.text, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>
                  {[code && `Code: ${code}`, pams && `PAMS: ${pams}`].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {c.industry_key && <span style={S.tag(C.accent)}>{c.industry_key}</span>}
                {c.head_count > 0 && (
                  <span style={{ fontSize: "11px", color: C.textMuted }}>
                    {Number(c.head_count).toLocaleString()} emp
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div style={S.card}>
          {detailError && (
            <div style={{ fontSize: "12px", color: C.error, padding: "8px 12px", borderRadius: "4px",
              backgroundColor: C.error + "18", border: `1px solid ${C.error}44`, marginBottom: "12px" }}>
              Error loading detail: {detailError}
            </div>
          )}
          {!detail && !detailError && (
            <div style={{ fontSize: "12px", color: C.textMuted }}>Loading details…</div>
          )}
          {detail && (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                {["overview", "products", "sso"].map((t) => (
                  <button key={t} style={{ ...S.btn(tab === t ? "primary" : "secondary"), padding: "6px 14px", fontSize: "11px" }}
                    onClick={() => setTab(t)}>{t.toUpperCase()}</button>
                ))}
              </div>

              {tab === "overview" && (
                <div style={S.grid2}>
                  {field("Client Name",  detail.client_name  || detail.clientName)}
                  {field("Client Code",  detail.client_code  || detail.clientCode)}
                  {field("PAMS ID",      detail.pams_id      || detail.pamsId)}
                  {field("Industry",     detail.industry_key || detail.industryKey)}
                  {field("Sector",       detail.sector_key   || detail.sectorKey)}
                  {field("Head Count",   detail.head_count   || detail.headCount)}
                  {field("Revenue",      detail.revenue)}
                  {field("Currency",     detail.currency_key || detail.currencyKey)}
                  {field("Market Cap",   detail.market_cap   || detail.marketCap)}
                  {field("Description",  detail.description)}
                </div>
              )}

              {tab === "products" && (
                products.length === 0
                  ? <div style={{ fontSize: "12px", color: C.textMuted }}>No products found.</div>
                  : products.map((p, i) => (
                    <div key={i} style={S.idpRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", color: C.text }}>{p.product_name || p.productName || p.name}</div>
                        <div style={{ fontSize: "11px", color: C.textMuted }}>{p.offering || p.productType || ""}</div>
                      </div>
                      <span style={S.tag(C.accent)}>{p.product_key || p.productKey || ""}</span>
                    </div>
                  ))
              )}

              {tab === "sso" && (
                <div style={{ fontSize: "12px", color: C.textMuted, lineHeight: "1.8" }}>
                  To view or edit SSO config for this client, use
                  <strong style={{ color: C.accent }}> Manage → Get IDP by Domain</strong> and
                  enter the client's email domain.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ── User Management ───────────────────────────────────────────────────────────

function UserManagementView({ isAdmin }) {
  const C = useColors();
  const S = useStyles();
  const [email, setEmail]         = useState("");
  const [userData, setUserData]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [actionBusy, setActionBusy] = useState("");
  const [actionMsg, setActionMsg] = useState(null);

  const searchUser = async () => {
    const q = email.trim();
    if (!q) return;
    setLoading(true); setUserData(null); setActionMsg(null); setSearched(false); setSearchError(null);
    try {
      const res = await apiFetch(`/platform/users/search?email=${encodeURIComponent(q)}`);
      if (res.ok) {
        const d = await res.json();
        const u = Array.isArray(d) ? d[0] : (d.data ? (Array.isArray(d.data) ? d.data[0] : d.data) : d);
        setUserData(u || null);
        // If we got a user key, fetch full details
        const uid = u?.user_key || u?.userId || u?.id;
        if (uid) {
          const dRes = await apiFetch(`/platform/users/${uid}/details`);
          if (dRes.ok) setUserData(await dRes.json());
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setSearchError(apiErrorMsg(err, res.status));
      }
    } catch (e) {
      setSearchError(String(e));
    }
    setLoading(false); setSearched(true);
  };

  const doAction = async (type) => {
    setActionBusy(type); setActionMsg(null);
    const uid = userData?.user_key || userData?.userId || userData?.id || "";
    const userEmail = userData?.email || email;
    try {
      let res;
      if (type === "reset-password") {
        res = await apiFetch("/platform/users/reset-password", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail }),
        });
      } else if (type === "magic-link") {
        res = await apiFetch("/platform/users/magic-link", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail, user_id: uid, redirect_url: "" }),
        });
      } else if (type === "lock" || type === "unlock") {
        res = await apiFetch("/platform/users/lock", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: type, user_keys: [uid] }),
        });
      } else if (type === "activate" || type === "deactivate") {
        res = await apiFetch("/platform/users/status", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: type === "activate" ? "active" : "inactive", user_keys: [uid] }),
        });
      }
      const ok = res?.ok ?? false;
      const body = ok ? (await res.json().catch(() => ({}))) : {};
      setActionMsg({ type, ok, body });
    } catch (e) {
      setActionMsg({ type, ok: false, body: { error: String(e) } });
    }
    setActionBusy("");
  };

  const Badge = ({ label, positive }) => (
    <span style={{
      padding: "2px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.05em",
      background: (positive ? C.success : C.error) + "22",
      border: `1px solid ${(positive ? C.success : C.error)}44`,
      color: positive ? C.success : C.error,
    }}>{label}</span>
  );

  const ACTIONS = [
    { id: "reset-password", label: "Reset Password", v: "secondary" },
    { id: "magic-link",     label: "Magic Link",     v: "secondary" },
    { id: "unlock",         label: "Unlock",         v: "secondary" },
    { id: "lock",           label: "Lock",           v: "danger"    },
    { id: "activate",       label: "Activate",       v: "secondary" },
    { id: "deactivate",     label: "Deactivate",     v: "danger"    },
  ];

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>◈ User Management</div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Search by email address…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchUser()}
          />
          <button style={S.btn("primary")} onClick={searchUser} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {searchError && (
          <div style={{ fontSize: "12px", color: C.error, padding: "8px 12px", borderRadius: "4px",
            backgroundColor: C.error + "18", border: `1px solid ${C.error}44`, marginBottom: "8px" }}>
            Error: {searchError}
          </div>
        )}
        {searched && !userData && !searchError && (
          <div style={{ fontSize: "12px", color: C.textMuted }}>No user found for "{email}".</div>
        )}

        {userData && (
          <>
            {/* User card */}
            <div style={{
              backgroundColor: C.surfaceAlt, border: `1px solid ${C.border}`,
              borderRadius: "6px", padding: "16px 20px", marginBottom: "16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: C.text }}>
                    {userData.name || `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || "—"}
                  </div>
                  <div style={{ fontSize: "12px", color: C.textMuted, marginTop: "2px" }}>{userData.email}</div>
                  {userData.department && (
                    <div style={{ fontSize: "11px", color: C.textDim, marginTop: "2px" }}>{userData.department}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {userData.status && (
                    <Badge label={userData.status} positive={userData.status === "active"} />
                  )}
                  {userData.isLocked !== undefined && (
                    <Badge label={userData.isLocked ? "locked" : "unlocked"} positive={!userData.isLocked} />
                  )}
                </div>
              </div>

              {userData.roles?.length > 0 && (
                <div style={{ marginBottom: "8px" }}>
                  <div style={S.label}>Roles</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                    {userData.roles.map((r, i) => (
                      <span key={i} style={S.tag(C.accent)}>
                        {typeof r === "string" ? r : r.roleName || r.role_name || r.name || JSON.stringify(r)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {userData.teams?.length > 0 && (
                <div>
                  <div style={S.label}>Teams</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                    {userData.teams.map((t, i) => (
                      <span key={i} style={S.tag(C.textDim)}>
                        {typeof t === "string" ? t : t.teamName || t.group_name || t.name || JSON.stringify(t)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {isAdmin ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                {ACTIONS.map(({ id, label, v }) => (
                  <button
                    key={id}
                    style={{ ...S.btn(v), padding: "8px 14px", fontSize: "11px", opacity: actionBusy ? 0.6 : 1 }}
                    onClick={() => doAction(id)}
                    disabled={!!actionBusy}
                  >
                    {actionBusy === id ? "…" : label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: "12px", padding: "10px 14px", borderRadius: "4px", fontSize: "12px", backgroundColor: "#f5a62318", color: "#f5a623" }}>
                You need admin privileges to perform this action
              </div>
            )}

            {actionMsg && (
              <div style={{
                padding: "10px 14px", borderRadius: "4px", fontSize: "12px",
                backgroundColor: (actionMsg.ok ? C.success : C.error) + "18",
                border: `1px solid ${actionMsg.ok ? C.success : C.error}44`,
                color: actionMsg.ok ? C.success : C.error,
              }}>
                {actionMsg.ok
                  ? `${actionMsg.type} completed.`
                  : `Failed: ${actionMsg.body?.detail || actionMsg.body?.error || "Unknown error"}`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ── Unified Chat helpers ──────────────────────────────────────────────────────

// Map tool names → which service they belong to
function sourceService(toolName) {
  if (toolName.startsWith("keycloak_")) return "keycloak";
  if (toolName.startsWith("iam_"))      return "iam";
  if (toolName.startsWith("core_"))     return "core";
  if (toolName.startsWith("dd_"))       return "datadog";
  return "other";
}

function sourceColor(C, service) {
  if (service === "keycloak") return C.accent;
  if (service === "iam")      return C.success;
  if (service === "core")     return C.warning;
  if (service === "datadog")  return "#632CA6";
  return C.textMuted;
}

// Deduplicate to one badge per service
function uniqueServiceSources(sources) {
  const seen = new Set();
  return (sources || []).filter((s) => {
    const svc = sourceService(s);
    if (seen.has(svc)) return false;
    seen.add(svc);
    return true;
  });
}

const CHAT_SUGGESTIONS = [
  { text: "What roles exist in this realm?",          svc: "keycloak" },
  { text: "Who has the agent-admin role?",            svc: "keycloak" },
  { text: "Show authorization policies for a client", svc: "keycloak" },
  { text: "Find user john@acmecorp.com",              svc: "iam"      },
  { text: "List all IAM platform roles",              svc: "iam"      },
  { text: "Show all communities",                     svc: "iam"      },
  { text: "Search for client Acme",                   svc: "core"     },
  { text: "What's the login mode for acmecorp.com?",  svc: "core"     },
  { text: "Show SSO config for acmecorp.com",         svc: "core"     },
  { text: "Why can't user john@example.com log in?",        svc: "datadog" },
  { text: "Show auth errors for login service in last hour", svc: "datadog" },
  { text: "What's the error rate for the login service?",    svc: "datadog" },
  { text: "Are there active alerts on authentication?",      svc: "datadog" },
];

// ── Markdown renderer for assistant messages ─────────────────────────────────

// Renders **bold** and `code` spans inline
function stripMdEscapes(text) {
  return text.replace(/\\([_*~`|])/g, "$1");
}

function renderInlineMd(text) {
  const clean = stripMdEscapes(text);
  const parts = clean.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} style={{
          fontSize: "11px", padding: "1px 5px", borderRadius: "3px",
          background: "rgba(128,128,128,0.15)", fontFamily: "monospace",
        }}>
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

// Renders a comma-separated value as small tag chips when count > 3
function TagChips({ value, C }) {
  const tags = value.split(",").map((t) => stripMdEscapes(t.trim())).filter(Boolean);
  if (tags.length <= 3) return <span style={{ wordBreak: "break-word" }}>{tags.join(", ")}</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "3px" }}>
      {tags.map((tag, i) => (
        <span key={i} style={{
          padding: "2px 7px", borderRadius: "3px", fontSize: "10px",
          background: C.surfaceAlt, border: `1px solid ${C.border}`,
          color: C.textDim, whiteSpace: "nowrap",
        }}>
          {tag}
        </span>
      ))}
    </div>
  );
}

// Parses markdown into key-value tables, bullet lists, headings, and plain text
function MarkdownMessage({ text, C }) {
  const lines = text.split("\n");
  const segments = [];
  let kvBuffer = [];

  const flushKv = () => {
    if (kvBuffer.length > 0) {
      segments.push({ type: "kv", items: [...kvBuffer] });
      kvBuffer = [];
    }
  };

  for (const line of lines) {
    // * **Key:** Value  or  - **Key:** Value  (bullet kv)
    const kvBullet = line.match(/^[\*\-]\s+\*\*([^:*]+):\*\*\s*(.*)$/);
    if (kvBullet) {
      kvBuffer.push({ key: kvBullet[1].trim(), value: kvBullet[2].trim() });
      continue;
    }
    // **Key:** Value  (standalone kv, no bullet)
    const kvPlain = line.match(/^\*\*([^:*]+):\*\*\s+(.+)$/);
    if (kvPlain) {
      kvBuffer.push({ key: kvPlain[1].trim(), value: kvPlain[2].trim() });
      continue;
    }

    flushKv();

    if (line.trim() === "") { segments.push({ type: "br" }); continue; }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { segments.push({ type: "heading", level: heading[1].length, content: heading[2] }); continue; }

    const bullet = line.match(/^[\*\-]\s+(.+)$/);
    if (bullet) { segments.push({ type: "bullet", content: bullet[1] }); continue; }

    segments.push({ type: "text", content: line });
  }
  flushKv();

  return (
    <div style={{ fontSize: "13px", lineHeight: "1.65" }}>
      {segments.map((seg, i) => {
        if (seg.type === "kv") {
          return (
            <table key={i} style={{
              borderCollapse: "collapse", width: "100%", margin: "6px 0 10px", fontSize: "12px",
            }}>
              <tbody>
                {seg.items.map((item, j) => (
                  <tr key={j} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{
                      padding: "5px 14px 5px 0", fontWeight: 700, color: C.textMuted,
                      whiteSpace: "nowrap", verticalAlign: "top",
                      fontSize: "11px", textTransform: "uppercase",
                      letterSpacing: "0.05em", minWidth: "100px",
                    }}>
                      {item.key}
                    </td>
                    <td style={{ padding: "5px 0", verticalAlign: "top", wordBreak: "break-word" }}>
                      {item.value.includes(",") && item.value.split(",").length > 3
                        ? <TagChips value={item.value} C={C} />
                        : <span>{renderInlineMd(item.value)}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (seg.type === "br")
          return <div key={i} style={{ height: "6px" }} />;
        if (seg.type === "heading") {
          return (
            <div key={i} style={{
              fontWeight: 700, color: C.accent, fontSize: seg.level === 1 ? "13px" : "12px",
              textTransform: "uppercase", letterSpacing: "0.08em", margin: "8px 0 4px",
            }}>
              {seg.content}
            </div>
          );
        }
        if (seg.type === "bullet") {
          return (
            <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "3px", alignItems: "flex-start" }}>
              <span style={{ color: C.accent, flexShrink: 0, lineHeight: "1.65" }}>·</span>
              <span style={{ wordBreak: "break-word" }}>{renderInlineMd(seg.content)}</span>
            </div>
          );
        }
        return (
          <div key={i} style={{ marginBottom: "2px", wordBreak: "break-word" }}>
            {renderInlineMd(seg.content)}
          </div>
        );
      })}
    </div>
  );
}

// ── Unified Chat View ────────────────────────────────────────────────────────

function UnifiedChatView({ user }) {
  const C = useColors();
  const S = useStyles();

  const defaultRealm = import.meta.env.VITE_KEYCLOAK_REALM || "master";
  const [realm, setRealm]           = useState(defaultRealm);
  const [realms, setRealms]         = useState([{ realm: defaultRealm, displayName: defaultRealm }]);

  const [sessions, setSessions]     = useState([]);
  const [activeSession, setActive]  = useState(null);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending]       = useState(false);

  const bottomRef = useRef(null);

  // Load available Keycloak realms for the realm selector
  useEffect(() => {
    apiFetch("/policy/realms")
      .then((r) => r.json())
      .then((d) => {
        if (d.realms?.length) {
          setRealms(d.realms);
          const pref = d.realms.find((r) => r.realm === defaultRealm);
          setRealm((pref ?? d.realms[0]).realm);
        }
      })
      .catch(() => {});
  }, []);

  // Load session list on mount
  useEffect(() => {
    apiFetch("/chat/sessions")
      .then((r) => r.ok ? r.json() : [])
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, []);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSession) { setMessages([]); return; }
    setLoadingMessages(true);
    apiFetch(`/chat/sessions/${activeSession}`)
      .then((r) => r.ok ? r.json() : { messages: [] })
      .then((d) => setMessages(d.messages || []))
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [activeSession]);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    const optimistic = { role: "user", message: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await apiFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          realm,
          session_id: activeSession || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (!activeSession) {
          const preview = text.length > 60 ? text.slice(0, 57) + "..." : text;
          setSessions((prev) => [{
            session_id: data.session_id,
            first_message: preview,
            created_at: new Date().toISOString(),
            message_count: 1,
          }, ...prev]);
          setActive(data.session_id);
        }
        setMessages((prev) => [...prev, {
          role: "assistant",
          message: data.reply || "",
          created_at: new Date().toISOString(),
          sources: data.sources || [],
          token_usage: data.token_usage || null,
        }]);
      } else {
        let errMsg = "Error: could not reach the server.";
        try {
          const errData = await res.json();
          if (errData.detail) errMsg = errData.detail;
        } catch {}
        setMessages((prev) => [...prev, {
          role: "assistant",
          message: errMsg,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        message: `Error: ${err}`,
        created_at: new Date().toISOString(),
      }]);
    }
    setSending(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startNew = () => { setActive(null); setMessages([]); };

  const fmtTime = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div style={{ display: "flex", gap: "20px", height: "calc(100vh - 140px)" }}>

      {/* Session list */}
      <div style={{
        width: "240px", flexShrink: 0,
        backgroundColor: C.surface, border: `1px solid ${C.border}`,
        borderRadius: "8px", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
          fontSize: "11px", fontWeight: 700, color: C.accent,
          textTransform: "uppercase", letterSpacing: "0.1em",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          Sessions
          <button
            onClick={startNew}
            style={{
              background: C.accent + "22", border: `1px solid ${C.accent}44`,
              color: C.accent, borderRadius: "4px", padding: "3px 8px",
              fontSize: "10px", cursor: "pointer", fontFamily: "inherit",
              fontWeight: 700, letterSpacing: "0.05em",
            }}
          >
            + New
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingSessions ? (
            <div style={{ padding: "16px", fontSize: "11px", color: C.textMuted }}>Loading...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: "16px", fontSize: "11px", color: C.textMuted, lineHeight: "1.6" }}>
              No conversations yet. Type a message to start one.
            </div>
          ) : sessions.map((s) => (
            <div
              key={s.session_id}
              onClick={() => setActive(s.session_id)}
              style={{
                padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                cursor: "pointer",
                backgroundColor: activeSession === s.session_id ? C.accentGlow + "22" : "transparent",
                borderLeft: `2px solid ${activeSession === s.session_id ? C.accent : "transparent"}`,
                transition: "all 0.15s",
              }}
            >
              <div style={{
                fontSize: "11px", color: activeSession === s.session_id ? C.text : C.textDim,
                marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {s.first_message || "—"}
              </div>
              <div style={{ fontSize: "10px", color: C.textMuted }}>
                {fmtTime(s.created_at)}
                {s.message_count > 0 && (
                  <span style={{ marginLeft: "6px" }}>
                    · {s.message_count} msg{s.message_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        backgroundColor: C.surface, border: `1px solid ${C.border}`,
        borderRadius: "8px", overflow: "hidden",
      }}>

        {/* Header with realm selector */}
        <div style={{
          padding: "12px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "12px", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              fontWeight: 700, color: C.accent, textTransform: "uppercase",
              letterSpacing: "0.1em", fontSize: "11px",
            }}>
              Platform Assistant
            </span>
            <span style={{ fontSize: "10px", color: C.textMuted }}>
              Keycloak · IAM · Core
              {activeSession && ` · ${activeSession.slice(0, 8)}...`}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: C.textMuted }}>Realm:</span>
            <select
              value={realm}
              onChange={(e) => setRealm(e.target.value)}
              style={{
                background: C.surfaceAlt, color: C.text, border: `1px solid ${C.border}`,
                borderRadius: "4px", padding: "3px 8px", fontSize: "11px",
                fontFamily: "inherit", cursor: "pointer", outline: "none",
              }}
            >
              {realms.map((r) => (
                <option key={r.realm} value={r.realm}>{r.displayName || r.realm}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "20px",
          display: "flex", flexDirection: "column", gap: "14px",
        }}>
          {loadingMessages ? (
            <div style={{ fontSize: "12px", color: C.textMuted, textAlign: "center", marginTop: "40px" }}>
              Loading...
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", marginTop: "40px" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>&#11041;</div>
              <div style={{ fontSize: "12px", color: C.textMuted, lineHeight: "1.8", marginBottom: "24px" }}>
                Ask anything about Keycloak, IAM users, or Core platform clients.
              </div>
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "6px",
                justifyContent: "center", maxWidth: "600px", margin: "0 auto",
              }}>
                {CHAT_SUGGESTIONS.map((s) => {
                  const col = sourceColor(C, s.svc);
                  return (
                    <button
                      key={s.text}
                      onClick={() => setInput(s.text)}
                      style={{
                        padding: "5px 12px", fontSize: "11px", borderRadius: "12px",
                        border: `1px solid ${col}44`, background: col + "18",
                        color: col, cursor: "pointer", fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                    >
                      {s.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const isUser   = m.role === "user";
              const dedupSrc = isUser ? [] : uniqueServiceSources(m.sources);
              return (
                <div
                  key={i}
                  style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}
                >
                  <div style={{
                    maxWidth: "78%", padding: "10px 14px",
                    borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    fontSize: "13px", lineHeight: "1.65",
                    backgroundColor: isUser ? C.accent + "22" : C.surfaceAlt,
                    border: `1px solid ${isUser ? C.accent + "44" : C.border}`,
                    color: C.text, whiteSpace: isUser ? "pre-wrap" : undefined, wordBreak: "break-word",
                  }}>
                    {isUser ? m.message : <MarkdownMessage text={m.message} C={C} />}
                    <div style={{
                      fontSize: "10px", color: C.textMuted,
                      marginTop: "6px", textAlign: isUser ? "right" : "left",
                    }}>
                      {isUser ? (user?.name || user?.email || "you") : "assistant"} · {fmtTime(m.created_at)}
                    </div>
                  </div>

                  {/* Service source badges */}
                  {!isUser && (dedupSrc.length > 0 || m.token_usage) && (
                    <div style={{
                      display: "flex", alignItems: "center", flexWrap: "wrap",
                      gap: "5px", marginTop: "4px", maxWidth: "78%",
                    }}>
                      {dedupSrc.map((src) => {
                        const svc = sourceService(src);
                        const col = sourceColor(C, svc);
                        return (
                          <span key={src} style={{
                            padding: "2px 7px", borderRadius: "10px", fontSize: "10px",
                            background: col + "18", border: `1px solid ${col}44`, color: col,
                            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                          }}>
                            {svc}
                          </span>
                        );
                      })}
                      {m.token_usage && (
                        <span style={{ fontSize: "10px", color: C.textMuted }}>
                          {m.token_usage.total_tokens ?? 0} tokens
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                padding: "10px 16px", borderRadius: "12px 12px 12px 2px",
                backgroundColor: C.surfaceAlt, border: `1px solid ${C.border}`,
                fontSize: "13px", color: C.textMuted,
              }}>
                ...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: "12px 16px", borderTop: `1px solid ${C.border}`,
          display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0,
        }}>
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about Keycloak roles, IAM users, Core clients... (Enter to send, Shift+Enter for newline)"
            style={{
              flex: 1, background: C.surfaceAlt, color: C.text,
              border: `1px solid ${C.border}`, borderRadius: "6px",
              padding: "10px 12px", fontSize: "13px", fontFamily: "inherit",
              resize: "none", outline: "none",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            style={{
              ...S.btn("primary"),
              opacity: sending || !input.trim() ? 0.5 : 1,
              alignSelf: "flex-end",
              padding: "10px 18px",
            }}
          >
            {sending ? "..." : "Send ->"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Token Setup View ──────────────────────────────────────────────────────────

function TokenSetupView() {
  const C = useColors();
  const S = useStyles();

  const defaultRealm  = import.meta.env.VITE_KEYCLOAK_REALM  ?? "";
  const defaultClient = import.meta.env.VITE_KEYCLOAK_CLIENT ?? "";

  const [realm,         setRealm]         = useState(defaultRealm);
  const [clientId,      setClientId]      = useState(defaultClient);
  const [attributeName, setAttributeName] = useState("userId");
  const [claimName,     setClaimName]     = useState("userId");
  const [status,        setStatus]        = useState(null);   // null | {exists,mapper} | {created,mapper}
  const [error,         setError]         = useState(null);
  const [busy,          setBusy]          = useState(false);

  const check = async () => {
    setBusy(true); setStatus(null); setError(null);
    try {
      const res = await apiFetch(
        `/admin/userid-mapper?realm=${encodeURIComponent(realm)}&client_id=${encodeURIComponent(clientId)}&claim_name=${encodeURIComponent(claimName)}`
      );
      if (res.ok) setStatus(await res.json());
      else { const e = await res.json().catch(() => ({})); setError(apiErrorMsg(e, res.status)); }
    } catch (e) { setError(String(e)); }
    setBusy(false);
  };

  const setup = async () => {
    setBusy(true); setStatus(null); setError(null);
    try {
      const params = new URLSearchParams({
        realm,
        client_id:      clientId,
        attribute_name: attributeName,
        claim_name:     claimName,
      });
      const res = await apiFetch(`/admin/userid-mapper?${params}`, { method: "POST" });
      if (res.ok) setStatus(await res.json());
      else { const e = await res.json().catch(() => ({})); setError(apiErrorMsg(e, res.status)); }
    } catch (e) { setError(String(e)); }
    setBusy(false);
  };

  const mapperExists = status?.exists === true || status?.created === false;
  const justCreated  = status?.created === true;

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Token Claim Setup — userId</div>
      <p style={{ fontSize: "12px", color: C.textMuted, margin: "0 0 20px" }}>
        The Core API requires a <code style={{ background: C.surfaceAlt, padding: "1px 5px", borderRadius: "3px" }}>userId</code> claim
        in the Keycloak access token. Use this panel to add the protocol mapper to your OIDC client.
        Each user must also have a <code style={{ background: C.surfaceAlt, padding: "1px 5px", borderRadius: "3px" }}>userId</code> attribute
        set on their Keycloak profile.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div style={S.fieldGroup}>
          <label style={S.label}>Realm</label>
          <input style={S.input} value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="master" />
        </div>
        <div style={S.fieldGroup}>
          <label style={S.label}>Client ID</label>
          <input style={S.input} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="your-client-id" />
        </div>
        <div style={S.fieldGroup}>
          <label style={S.label}>Keycloak User Attribute</label>
          <input style={S.input} value={attributeName} onChange={(e) => setAttributeName(e.target.value)} placeholder="userId" />
        </div>
        <div style={S.fieldGroup}>
          <label style={S.label}>JWT Claim Name</label>
          <input style={S.input} value={claimName} onChange={(e) => setClaimName(e.target.value)} placeholder="userId" />
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <button style={S.btn("secondary")} onClick={check} disabled={busy || !realm || !clientId}>
          {busy ? "Checking…" : "Check Status"}
        </button>
        <button style={S.btn("primary")} onClick={setup} disabled={busy || !realm || !clientId}>
          {busy ? "Setting up…" : "Setup Mapper"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: "12px", color: C.error, background: C.error + "18",
          border: `1px solid ${C.error}44`, borderRadius: "4px", padding: "10px 14px" }}>
          {error}
        </div>
      )}

      {status && (
        <div style={{ fontSize: "12px", borderRadius: "4px", padding: "10px 14px",
          color:       justCreated  ? C.success : mapperExists ? C.success : C.warning,
          background:  justCreated  ? C.success + "18" : mapperExists ? C.success + "18" : C.warning + "18",
          border: `1px solid ${justCreated || mapperExists ? C.success : C.warning}44` }}>
          {justCreated  && "Mapper created successfully. New tokens will include the userId claim."}
          {mapperExists && !justCreated && "Mapper already exists — no changes made."}
          {!justCreated && !mapperExists && !status.exists && "Mapper not found. Click Setup Mapper to create it."}
          {status.mapper && (
            <pre style={{ marginTop: "8px", fontSize: "10px", color: C.textMuted,
              background: C.surfaceAlt, padding: "8px", borderRadius: "4px", overflow: "auto" }}>
              {JSON.stringify(status.mapper, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Realm Snapshot View ───────────────────────────────────────────────────────

function RealmSnapshotView() {
  const C = useColors();
  const S = useStyles();
  const [realms, setRealms]         = useState([]);
  const [realm, setRealm]           = useState("");
  const [label, setLabel]           = useState("");
  const [snapshots, setSnapshots]   = useState([]);
  const [taking, setTaking]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [viewSnap, setViewSnap]     = useState(null);  // full snapshot JSON
  const [loadingSnap, setLoadingSnap] = useState(null);
  const [error, setError]           = useState("");
  const [msg, setMsg]               = useState("");

  useEffect(() => {
    apiFetch("/policy/realms").then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : [];
      setRealms(list);
      if (list.length > 0) setRealm(list[0].realm);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (realm) loadSnapshots();
  }, [realm]);

  async function loadSnapshots() {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`/admin/snapshots/${realm}`);
      const data = await r.json();
      if (!r.ok) { setError(data.detail || "Failed to load snapshots"); return; }
      setSnapshots(data);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function takeSnapshot() {
    setTaking(true); setError(""); setMsg("");
    try {
      const r = await apiFetch(`/admin/snapshots/${realm}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || null }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.detail || "Snapshot failed"); return; }
      setMsg(`Snapshot saved: ${data.label}`);
      setLabel("");
      loadSnapshots();
    } catch (e) { setError(String(e)); }
    finally { setTaking(false); }
  }

  async function viewSnapshot(id) {
    setLoadingSnap(id);
    try {
      const r = await apiFetch(`/admin/snapshots/${realm}/${id}`);
      const data = await r.json();
      if (!r.ok) { setError(data.detail || "Failed to load snapshot"); return; }
      setViewSnap(data);
    } catch (e) { setError(String(e)); }
    finally { setLoadingSnap(null); }
  }

  async function downloadSnapshot(snap) {
    const r = await apiFetch(`/admin/snapshots/${realm}/${snap.id}`);
    const data = await r.json();
    const blob = new Blob([JSON.stringify(data.snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${realm}-snapshot-${snap.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteSnapshot(id) {
    if (!confirm("Delete this snapshot?")) return;
    const r = await apiFetch(`/admin/snapshots/${realm}/${id}`, { method: "DELETE" });
    if (r.ok) { loadSnapshots(); setMsg("Snapshot deleted"); }
    else { const d = await r.json(); setError(d.detail || "Delete failed"); }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : "—";
  const fmtSize = (b) => b ? (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`) : "—";

  const inputStyle = {
    background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: "6px",
    color: C.text, padding: "8px 12px", fontSize: "12px", outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={S.card}>
        <div style={S.cardTitle}>◈ Realm Snapshots</div>
        <p style={{ margin: "0 0 16px", fontSize: "12px", color: C.textMuted }}>
          Export and store a realm&apos;s configuration (clients, IDPs, roles, groups) as a
          timestamped snapshot. Use it to audit drift or restore a known-good state.
        </p>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <select value={realm} onChange={e => setRealm(e.target.value)}
            style={{ ...inputStyle, minWidth: "160px" }}>
            {realms.map(r => <option key={r.realm} value={r.realm}>{r.realm}</option>)}
          </select>
          <input placeholder="Label (optional)" value={label}
            onChange={e => setLabel(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: "180px" }} />
          <button style={S.btn("primary")} onClick={takeSnapshot} disabled={taking || !realm}>
            {taking ? "Taking…" : "Take Snapshot"}
          </button>
        </div>

        {error && <div style={{ marginTop: "10px", fontSize: "12px", color: C.error,
          background: C.error + "18", border: `1px solid ${C.error}44`,
          borderRadius: "4px", padding: "8px 12px" }}>{error}</div>}
        {msg && <div style={{ marginTop: "10px", fontSize: "12px", color: C.success,
          background: C.success + "18", border: `1px solid ${C.success}44`,
          borderRadius: "4px", padding: "8px 12px" }}>{msg}</div>}
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: "14px" }}>
          <div style={S.cardTitle}>◈ Saved Snapshots</div>
          <button style={S.btn("secondary")} onClick={loadSnapshots} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {snapshots.length === 0 && !loading && (
          <div style={{ fontSize: "12px", color: C.textMuted, padding: "16px 0" }}>
            No snapshots yet for <strong>{realm}</strong>. Take one above.
          </div>
        )}
        {snapshots.map(snap => (
          <div key={snap.id} style={{ display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 12px", marginBottom: "6px", borderRadius: "6px",
            background: C.surfaceAlt, border: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "120px" }}>
              <div style={{ fontSize: "12px", color: C.text, fontWeight: 600 }}>
                {snap.label}
              </div>
              <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "2px" }}>
                {fmtDate(snap.created_at)} · {fmtSize(snap.size_bytes)} · by {snap.created_by}
              </div>
            </div>
            <button style={S.btn("secondary")} disabled={loadingSnap === snap.id}
              onClick={() => viewSnapshot(snap.id)}>
              {loadingSnap === snap.id ? "Loading…" : "View"}
            </button>
            <button style={S.btn("secondary")} onClick={() => downloadSnapshot(snap)}>
              Download
            </button>
            <button style={S.btn("danger")} onClick={() => deleteSnapshot(snap.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>

      {viewSnap && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "12px" }}>
            <div style={S.cardTitle}>◈ {viewSnap.label}</div>
            <button style={S.btn("secondary")} onClick={() => setViewSnap(null)}>Close</button>
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginBottom: "10px" }}>
            Snapshot #{viewSnap.id} · {fmtDate(viewSnap.created_at)} · by {viewSnap.created_by}
          </div>
          <pre style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`,
            borderRadius: "6px", padding: "14px", fontSize: "10px", color: C.textDim,
            overflow: "auto", maxHeight: "500px", margin: 0 }}>
            {JSON.stringify(viewSnap.snapshot, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── User Activity Timeline View ───────────────────────────────────────────────

function UserActivityView() {
  const C = useColors();
  const S = useStyles();
  const [realms, setRealms]         = useState([]);
  const [realm, setRealm]           = useState("");
  const [userId, setUserId]         = useState("");
  const [days, setDays]             = useState(30);
  const [timeline, setTimeline]     = useState(null);
  const [sessions, setSessions]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => {
    apiFetch("/policy/realms").then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : [];
      setRealms(list);
      if (list.length > 0) setRealm(list[0].realm);
    }).catch(() => {});
  }, []);

  async function loadActivity() {
    if (!userId.trim() || !realm) return;
    setLoading(true); setError(""); setTimeline(null); setSessions(null);
    try {
      const [evtRes, sessRes] = await Promise.all([
        apiFetch(`/platform/users/${encodeURIComponent(userId.trim())}/activity?realm=${realm}&days=${days}`),
        apiFetch(`/platform/users/${encodeURIComponent(userId.trim())}/sessions?realm=${realm}`),
      ]);
      const evtData  = await evtRes.json();
      const sessData = await sessRes.json();
      if (!evtRes.ok) { setError(evtData.detail || "Failed to load activity"); return; }
      setTimeline(evtData);
      setSessions(sessRes.ok ? sessData : null);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  const EVENT_COLORS = {
    LOGIN:        "#10b981",
    LOGOUT:       "#64748b",
    LOGIN_ERROR:  "#ef4444",
    REGISTER:     "#3b82f6",
    UPDATE_EMAIL: "#f59e0b",
    UPDATE_PROFILE: "#f59e0b",
    UPDATE_PASSWORD: "#f59e0b",
    RESET_PASSWORD: "#f59e0b",
    CREATE:       "#3b82f6",
    UPDATE:       "#f59e0b",
    DELETE:       "#ef4444",
    ACTION:       "#8b5cf6",
  };
  const evtColor = (type) => EVENT_COLORS[type] || C.textMuted;
  const evtBg    = (type) => (evtColor(type)) + "20";

  const fmtTs = (ms) => ms ? new Date(ms).toLocaleString() : "—";

  const inputStyle = {
    background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: "6px",
    color: C.text, padding: "8px 12px", fontSize: "12px", outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={S.card}>
        <div style={S.cardTitle}>◈ User Activity Timeline</div>
        <p style={{ margin: "0 0 16px", fontSize: "12px", color: C.textMuted }}>
          View login history, role changes, and admin actions for a Keycloak user.
          Enter the user&apos;s Keycloak UUID or username.
        </p>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <select value={realm} onChange={e => setRealm(e.target.value)}
            style={{ ...inputStyle, minWidth: "140px" }}>
            {realms.map(r => <option key={r.realm} value={r.realm}>{r.realm}</option>)}
          </select>
          <input placeholder="User ID or username" value={userId}
            onChange={e => setUserId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadActivity()}
            style={{ ...inputStyle, flex: 1, minWidth: "200px" }} />
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            style={{ ...inputStyle, width: "120px" }}>
            {[7, 14, 30, 60, 90].map(d =>
              <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button style={S.btn("primary")} onClick={loadActivity}
            disabled={loading || !userId.trim() || !realm}>
            {loading ? "Loading…" : "Load Activity"}
          </button>
        </div>
        {error && <div style={{ marginTop: "10px", fontSize: "12px", color: C.error,
          background: C.error + "18", border: `1px solid ${C.error}44`,
          borderRadius: "4px", padding: "8px 12px" }}>{error}</div>}
      </div>

      {sessions && (
        <div style={S.card}>
          <div style={S.cardTitle}>◈ Active Sessions</div>
          {sessions.sessions?.length === 0 ? (
            <div style={{ fontSize: "12px", color: C.textMuted }}>No active sessions.</div>
          ) : (
            sessions.sessions?.map((s, i) => (
              <div key={i} style={{ padding: "10px 12px", marginBottom: "6px",
                borderRadius: "6px", background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", color: C.success }}>● Active</span>
                  <span style={{ fontSize: "11px", color: C.textDim }}>
                    Started: {fmtTs(s.start)}
                  </span>
                  <span style={{ fontSize: "11px", color: C.textDim }}>
                    Last seen: {fmtTs(s.lastAccess)}
                  </span>
                  {s.ipAddress && (
                    <span style={{ fontSize: "11px", color: C.textMuted }}>
                      IP: {s.ipAddress}
                    </span>
                  )}
                </div>
                {s.clients && Object.values(s.clients).length > 0 && (
                  <div style={{ marginTop: "6px", fontSize: "11px", color: C.textMuted }}>
                    Clients: {Object.values(s.clients).join(", ")}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {timeline && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: "14px" }}>
            <div style={S.cardTitle}>◈ Event Timeline</div>
            <span style={{ fontSize: "11px", color: C.textMuted }}>
              {timeline.events?.length ?? 0} events · last {days} days
            </span>
          </div>
          {timeline.events?.length === 0 && (
            <div style={{ fontSize: "12px", color: C.textMuted }}>
              No events found for this user in the selected period.
            </div>
          )}
          {timeline.events?.map((ev, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", padding: "8px 0",
              borderBottom: `1px solid ${C.border}30`, alignItems: "flex-start" }}>
              <div style={{ minWidth: "130px", fontSize: "10px", color: C.textMuted,
                paddingTop: "2px", flexShrink: 0 }}>
                {fmtTs(ev.timestamp)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px",
                    borderRadius: "4px", background: evtBg(ev.type), color: evtColor(ev.type),
                    letterSpacing: "0.04em" }}>
                    {ev.type}
                  </span>
                  {ev.source === "admin" && (
                    <span style={{ fontSize: "10px", color: C.textMuted }}>
                      admin action by {ev.actor || "unknown"}
                    </span>
                  )}
                  {ev.client && (
                    <span style={{ fontSize: "10px", color: C.textMuted }}>
                      client: {ev.client}
                    </span>
                  )}
                  {ev.ip && (
                    <span style={{ fontSize: "10px", color: C.textMuted }}>
                      {ev.ip}
                    </span>
                  )}
                  {ev.error && (
                    <span style={{ fontSize: "10px", color: C.error }}>
                      error: {ev.error}
                    </span>
                  )}
                </div>
                {ev.details && Object.keys(ev.details).length > 0 && (
                  <div style={{ fontSize: "10px", color: C.textMuted }}>
                    {Object.entries(ev.details).map(([k, v]) =>
                      <span key={k} style={{ marginRight: "10px" }}>{k}: {v}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView]         = useState("clients");
  const [theme, setTheme]        = useState("dark");
  const auth                     = useOidcAuth();

  const C = theme === "dark" ? DARK : LITE;
  const S = useMemo(() => makeStyles(C), [C]);

  // Keep the module-level token in sync so apiFetch() picks it up
  if (auth.status === "ready") {
    _accessToken = auth.token?.access_token ?? null;
  }

  // ── Loading splash ─────────────────────────────────────────────────────────
  if (auth.status === "loading") {
    return (
      <ThemeCtx.Provider value={theme}>
        <div style={{ ...S.app, alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: C.textMuted, fontSize: "12px", letterSpacing: "0.08em" }}>
            Authenticating...
          </div>
        </div>
      </ThemeCtx.Provider>
    );
  }

  // ── Login page ─────────────────────────────────────────────────────────────
  if (auth.status === "login") {
    return (
      <ThemeCtx.Provider value={theme}>
        <LoginPage error={auth.error} />
      </ThemeCtx.Provider>
    );
  }

  // ── Authenticated shell ────────────────────────────────────────────────────
  const { user, token } = auth;
  const isAdmin = user?.roles?.includes("agent-admin") ?? false;

  const navItems = [
    { id: "clients",      label: "Client Explorer",    section: "Platform"     },
    { id: "users",        label: "User Management",    section: "Platform"     },
    { id: "get-idp",      label: "Get IDP by Domain",  section: "Manage"       },
    { id: "my-idp",       label: "Add My IDP",         section: "Manage"       },
    { id: "onboard",      label: "Onboard New IDP",    section: "Manage",      adminOnly: true },
    { id: "update",       label: "Update IDP",         section: "Manage",      adminOnly: true },
    { id: "token-setup",  label: "Token Claim Setup",  section: "Admin",       adminOnly: true },
    { id: "snapshots",   label: "Realm Snapshots",    section: "Admin",       adminOnly: true },
    { id: "usage",        label: "Token Usage",        section: "Observe"      },
    { id: "certificates", label: "Certificates",       section: "Observe"      },
    { id: "activity",    label: "User Activity",      section: "Observe"      },
    { id: "assistant",    label: "Platform Assistant", section: "Intelligence" },
  ].filter((n) => !n.adminOnly || isAdmin);

  const sections = [...new Set(navItems.map((n) => n.section))];

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={S.app}>
        <header style={S.header}>
          <div>
            <div style={S.headerTitle}>⬡ Talent Suite Platform Agent</div>
            <div style={S.headerSub}>Platform Intelligence &amp; Management</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <ThemeToggle theme={theme} onToggle={() => setTheme((t) => t === "dark" ? "lite" : "dark")} />
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", color: C.textDim }}>
                {user?.name || user?.email}
              </span>
              <button style={S.btn("secondary")} onClick={() => oidcLogout(token?.id_token)}>
                Logout
              </button>
            </div>
          </div>
        </header>

        <div style={S.main}>
          <nav style={S.sidebar}>
            {sections.map((section) => (
              <div key={section}>
                <div style={S.sidebarSection}>{section}</div>
                {navItems.filter((n) => n.section === section).map((item) => (
                  <div
                    key={item.id}
                    style={S.sidebarItem(view === item.id)}
                    onClick={() => setView(item.id)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            ))}
          </nav>

          <main style={S.content}>
            {view === "clients"      && <ClientExplorerView />}
            {view === "users"        && <UserManagementView isAdmin={isAdmin} />}
            {view === "onboard"      && <OnboardView />}
            {view === "update"       && <UpdateView />}
            {view === "get-idp"      && <GetIDPView isAdmin={isAdmin} />}
            {view === "my-idp"       && <MyIDPView user={user} />}
            {view === "usage"        && <UsageView />}
            {view === "certificates" && <CertificatesView isAdmin={isAdmin} />}
            {view === "assistant"    && <UnifiedChatView user={user} />}
            {view === "token-setup"  && <TokenSetupView />}
            {view === "snapshots"    && <RealmSnapshotView />}
            {view === "activity"     && <UserActivityView />}
          </main>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}

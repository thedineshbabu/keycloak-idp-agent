import { useState, useEffect, useCallback, createContext, useContext, useMemo } from "react";

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
  llmBadge: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  badge: (active) => ({
    padding: "4px 12px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${active ? C.accent : C.border}`,
    backgroundColor: active ? C.accentGlow + "33" : "transparent",
    color: active ? C.accent : C.textMuted,
    transition: "all 0.15s",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  }),
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

function LLMSelector({ value, onChange }) {
  const S = useStyles();
  const C = useColors();
  return (
    <div style={S.llmBadge}>
      <span style={{ fontSize: "10px", color: C.textMuted, marginRight: "4px" }}>LLM:</span>
      {["openai", "gemini"].map((p) => (
        <button key={p} style={S.badge(value === p)} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

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

function OnboardView({ llmProvider }) {
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
        body: JSON.stringify({ ...form, llm_provider: llmProvider }),
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

function UpdateView({ llmProvider }) {
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
        body: JSON.stringify({ email_domain: domain, updates, llm_provider: llmProvider }),
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

function GetIDPView({ llmProvider }) {
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
        body: JSON.stringify({ email_domain: parsedDomain, updates, llm_provider: llmProvider ?? "openai" }),
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
        body: JSON.stringify({ ...cloneForm, llm_provider: llmProvider ?? "openai" }),
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

function MyIDPView({ llmProvider, user }) {
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
        body: JSON.stringify({ ...form, llm_provider: llmProvider }),
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

function CertificatesView() {
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
    </div>
  );
}

// ── OIDC / Keycloak PKCE auth ─────────────────────────────────────────────────

const OIDC = {
  base:      (import.meta.env.VITE_KEYCLOAK_URL ?? "") + "/protocol/openid-connect",
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
            ⬡ IDP AGENT
          </div>
          <div style={{ fontSize: "11px", color: C.textMuted, marginTop: "6px", letterSpacing: "0.06em" }}>
            Keycloak IDP Management
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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView]         = useState("onboard");
  const [llmProvider, setLlm]   = useState("gemini");
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
  const isAdmin = user?.roles?.includes("agent-admin") ?? true;

  const navItems = [
    { id: "get-idp",      label: "Get IDP by Domain", section: "Manage"  },
    { id: "my-idp",       label: "Add My IDP",         section: "Manage"  },
    { id: "usage",        label: "Token Usage",        section: "Observe" },
    { id: "certificates", label: "Certificates",       section: "Observe" },
    { id: "onboard",      label: "Onboard New IDP",    section: "Actions", adminOnly: true },
    { id: "update",       label: "Update IDP",         section: "Actions", adminOnly: true },
  ].filter((n) => !n.adminOnly || isAdmin);

  const sections = [...new Set(navItems.map((n) => n.section))];

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={S.app}>
        <header style={S.header}>
          <div>
            <div style={S.headerTitle}>⬡ Keycloak IDP Agent</div>
            <div style={S.headerSub}>Agentic IDP Onboarding &amp; Management</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <LLMSelector value={llmProvider} onChange={setLlm} />
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
            {view === "onboard"      && <OnboardView llmProvider={llmProvider} />}
            {view === "update"       && <UpdateView llmProvider={llmProvider} />}
            {view === "get-idp"      && <GetIDPView llmProvider={llmProvider} />}
            {view === "my-idp"       && <MyIDPView llmProvider={llmProvider} user={user} />}
            {view === "usage"        && <UsageView />}
            {view === "certificates" && <CertificatesView />}
          </main>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}

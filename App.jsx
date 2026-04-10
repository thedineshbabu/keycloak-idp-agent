import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const COLORS = {
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

const styles = {
  app: {
    minHeight: "100vh",
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    borderBottom: `1px solid ${COLORS.border}`,
    padding: "16px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: COLORS.accent,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  headerSub: {
    fontSize: "11px",
    color: COLORS.textMuted,
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
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    backgroundColor: active ? COLORS.accentGlow + "33" : "transparent",
    color: active ? COLORS.accent : COLORS.textMuted,
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
    borderRight: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.surface,
    padding: "16px 0",
  },
  sidebarItem: (active) => ({
    padding: "10px 20px",
    fontSize: "12px",
    cursor: "pointer",
    color: active ? COLORS.accent : COLORS.textDim,
    backgroundColor: active ? COLORS.accentGlow + "22" : "transparent",
    borderLeft: `2px solid ${active ? COLORS.accent : "transparent"}`,
    letterSpacing: "0.05em",
    transition: "all 0.15s",
  }),
  sidebarSection: {
    fontSize: "10px",
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "20px",
  },
  cardTitle: {
    fontSize: "12px",
    fontWeight: 700,
    color: COLORS.accent,
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
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 600,
  },
  input: {
    backgroundColor: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "12px",
    color: COLORS.text,
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
    width: "100%",
    boxSizing: "border-box",
  },
  textarea: {
    backgroundColor: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "11px",
    color: COLORS.text,
    fontFamily: "inherit",
    outline: "none",
    resize: "vertical",
    minHeight: "80px",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    backgroundColor: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "12px",
    color: COLORS.text,
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
      backgroundColor: COLORS.accent,
      color: "#fff",
    }),
    ...(variant === "secondary" && {
      backgroundColor: "transparent",
      color: COLORS.textDim,
      border: `1px solid ${COLORS.border}`,
    }),
    ...(variant === "danger" && {
      backgroundColor: COLORS.error + "22",
      color: COLORS.error,
      border: `1px solid ${COLORS.error}44`,
    }),
  }),
  statusDot: (status) => ({
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor:
      status === "pass" ? COLORS.success :
      status === "warn" ? COLORS.warning :
      status === "fail" ? COLORS.error : COLORS.textMuted,
    marginRight: "8px",
  }),
  stepRow: {
    display: "flex",
    alignItems: "flex-start",
    padding: "10px 0",
    borderBottom: `1px solid ${COLORS.border}`,
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
    borderBottom: `1px solid ${COLORS.border}`,
    gap: "16px",
    fontSize: "12px",
  },
  statCard: {
    backgroundColor: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "6px",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statValue: {
    fontSize: "22px",
    fontWeight: 700,
    color: COLORS.accent,
  },
  statLabel: {
    fontSize: "10px",
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surfaceAlt,
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
    backgroundColor: COLORS.surfaceAlt,
    gap: "16px",
    fontSize: "12px",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function LLMSelector({ value, onChange }) {
  return (
    <div style={styles.llmBadge}>
      <span style={{ fontSize: "10px", color: COLORS.textMuted, marginRight: "4px" }}>LLM:</span>
      {["openai", "gemini"].map((p) => (
        <button key={p} style={styles.badge(value === p)} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

function StatusStep({ step }) {
  const color = step.status === "pass" ? COLORS.success : step.status === "warn" ? COLORS.warning : COLORS.error;
  return (
    <div style={styles.stepRow}>
      <span style={styles.statusDot(step.status)} />
      <div style={{ flex: 1 }}>
        <div style={{ color: COLORS.textDim, marginBottom: "2px" }}>{step.step}</div>
        <div style={{ color: color, fontSize: "11px" }}>{step.detail}</div>
        {step.sample_claims && (
          <pre style={{ marginTop: "6px", fontSize: "10px", color: COLORS.textMuted, backgroundColor: COLORS.surfaceAlt, padding: "8px", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(step.sample_claims, null, 2)}
          </pre>
        )}
      </div>
      <span style={styles.tag(color)}>{step.status}</span>
    </div>
  );
}

function ResultPanel({ result }) {
  if (!result) return null;
  const statusColor = result.status === "success" ? COLORS.success : result.status === "needs_input" ? COLORS.warning : COLORS.error;

  return (
    <div style={{ ...styles.card, border: `1px solid ${statusColor}44` }}>
      <div style={{ ...styles.cardTitle, color: statusColor }}>
        ● Result — <span style={{ textTransform: "none", fontWeight: 400 }}>{result.status}</span>
      </div>

      {result.message && (
        <div style={{ fontSize: "12px", color: COLORS.textDim, lineHeight: "1.7", marginBottom: "16px" }}>
          {result.message}
        </div>
      )}

      {result.missing_fields && result.missing_fields.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: COLORS.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Missing Fields</div>
          {result.missing_fields.map((f) => (
            <div key={f.field} style={{ padding: "8px 12px", backgroundColor: COLORS.surfaceAlt, borderRadius: "4px", marginBottom: "6px", fontSize: "11px" }}>
              <span style={{ color: COLORS.warning, fontWeight: 700 }}>{f.label}</span>
              <span style={{ color: COLORS.textMuted }}> — {f.description}</span>
              {f.example && <div style={{ color: COLORS.textMuted, marginTop: "2px" }}>Example: <span style={{ color: COLORS.textDim }}>{typeof f.example === "string" ? f.example : JSON.stringify(f.example)}</span></div>}
            </div>
          ))}
        </div>
      )}

      {result.simulation && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: COLORS.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Auth Flow Simulation</div>
          {result.simulation.steps.map((s, i) => <StatusStep key={i} step={s} />)}
        </div>
      )}

      {result.llm_review && (result.llm_review.issues?.length > 0 || result.llm_review.suggestions?.length > 0) && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: COLORS.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>LLM Review</div>
          {result.llm_review.issues?.map((i, idx) => (
            <div key={idx} style={{ fontSize: "11px", color: COLORS.error, padding: "4px 0" }}>⚠ {i}</div>
          ))}
          {result.llm_review.suggestions?.map((s, idx) => (
            <div key={idx} style={{ fontSize: "11px", color: COLORS.textDim, padding: "4px 0" }}>→ {s}</div>
          ))}
        </div>
      )}

      {result.iam_response && (
        <div>
          <div style={{ fontSize: "11px", color: COLORS.textMuted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>IAM Response</div>
          <pre style={{ fontSize: "10px", color: COLORS.success, backgroundColor: COLORS.surfaceAlt, padding: "12px", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(result.iam_response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────

function OnboardView({ llmProvider }) {
  const [form, setForm] = useState({
    idp_name: "", protocol: "saml", email_domain: "", entity_id: "",
    sso_url: "", certificate: "", slo_url: "", roles_attribute: ""
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, llm_provider: llmProvider })
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ status: "error", message: String(e) });
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>◈ Onboard New IDP</div>
        <div style={styles.grid2}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>IDP Name *</label>
            <input style={styles.input} placeholder="Acme Corp SSO" value={form.idp_name} onChange={set("idp_name")} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Protocol *</label>
            <select style={styles.select} value={form.protocol} onChange={set("protocol")}>
              <option value="saml">SAML 2.0</option>
              <option value="oidc">OIDC</option>
            </select>
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email Domain *</label>
            <input style={styles.input} placeholder="acmecorp.com" value={form.email_domain} onChange={set("email_domain")} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Entity ID *</label>
            <input style={styles.input} placeholder="https://idp.acmecorp.com/saml" value={form.entity_id} onChange={set("entity_id")} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>SSO URL *</label>
            <input style={styles.input} placeholder="https://idp.acmecorp.com/saml/sso" value={form.sso_url} onChange={set("sso_url")} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>SLO URL</label>
            <input style={styles.input} placeholder="https://idp.acmecorp.com/saml/slo" value={form.slo_url} onChange={set("slo_url")} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Roles Attribute</label>
            <input style={styles.input} placeholder="groups" value={form.roles_attribute} onChange={set("roles_attribute")} />
          </div>
        </div>
        <div style={{ ...styles.fieldGroup, marginTop: "16px" }}>
          <label style={styles.label}>X.509 Certificate *</label>
          <textarea style={styles.textarea} placeholder="Paste base64-encoded certificate..." value={form.certificate} onChange={set("certificate")} rows={4} />
        </div>
        <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
          <button style={styles.btn("primary")} onClick={submit} disabled={loading}>
            {loading ? "⟳ Processing..." : "▶ Run Agent"}
          </button>
          <button style={styles.btn("secondary")} onClick={() => { setForm({ idp_name: "", protocol: "saml", email_domain: "", entity_id: "", sso_url: "", certificate: "", slo_url: "", roles_attribute: "" }); setResult(null); }}>
            ✕ Clear
          </button>
        </div>
      </div>
      <ResultPanel result={result} />
    </div>
  );
}

function UpdateView({ llmProvider }) {
  const [domain, setDomain] = useState("");
  const [existing, setExisting] = useState(null);
  const [updates, setUpdates] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fetching, setFetching] = useState(false);

  const fetchIDp = async () => {
    setFetching(true);
    try {
      const res = await fetch(`${API}/idps`);
      const all = await res.json();
      const found = all.find((i) => i.email_domain === domain);
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
      const res = await fetch(`${API}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_domain: domain, updates, llm_provider: llmProvider })
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ status: "error", message: String(e) });
    }
    setLoading(false);
  };

  const editableFields = ["sso_url", "slo_url", "certificate", "entity_id", "roles_attribute"];

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>◈ Update Existing IDP</div>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "20px" }}>
          <div style={{ ...styles.fieldGroup, flex: 1 }}>
            <label style={styles.label}>Email Domain</label>
            <input style={styles.input} placeholder="acmecorp.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <button style={styles.btn("secondary")} onClick={fetchIDp} disabled={fetching || !domain}>
            {fetching ? "⟳" : "Fetch IDP"}
          </button>
        </div>

        {existing && (
          <>
            <div style={{ fontSize: "11px", color: COLORS.success, marginBottom: "16px" }}>
              ✓ Found: <span style={{ color: COLORS.text }}>{existing.idp_name}</span>
            </div>
            <div style={styles.grid2}>
              {editableFields.map((field) => (
                <div key={field} style={styles.fieldGroup}>
                  <label style={styles.label}>{field.replace(/_/g, " ")}</label>
                  {field === "certificate" ? (
                    <textarea style={styles.textarea}
                      defaultValue={existing[field] || ""}
                      onChange={(e) => setUpdates({ ...updates, [field]: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <input style={styles.input}
                      defaultValue={existing[field] || ""}
                      onChange={(e) => setUpdates({ ...updates, [field]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: "20px" }}>
              <button style={styles.btn("primary")} onClick={submitUpdate} disabled={loading || Object.keys(updates).length === 0}>
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

function IDPListView() {
  const [idps, setIdps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/idps`)
      .then((r) => r.json())
      .then(setIdps)
      .catch(() => setIdps([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>◈ Configured IDPs</div>
      {loading && <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>Loading...</div>}
      {!loading && idps.length === 0 && <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>No IDPs found.</div>}
      {idps.map((idp, i) => (
        <div key={i} style={styles.idpRow}>
          <span style={{ width: "140px", color: COLORS.text, fontWeight: 600 }}>{idp.idp_name}</span>
          <span style={{ width: "160px", color: COLORS.textMuted }}>{idp.email_domain}</span>
          <span style={styles.tag(COLORS.accent)}>{idp.protocol}</span>
          <span style={styles.tag(idp.is_active ? COLORS.success : COLORS.error)}>
            {idp.is_active ? "active" : "inactive"}
          </span>
          <span style={{ color: COLORS.textMuted, fontSize: "11px", flex: 1 }}>{idp.entity_id}</span>
        </div>
      ))}
    </div>
  );
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function BarChart({ data, valueKey, labelKey }) {
  if (!data.length) return <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>No data.</div>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0)) || 1;
  return (
    <div>
      {data.map((item, i) => (
        <div key={i} style={styles.barRow}>
          <div style={{ width: "130px", fontSize: "11px", color: COLORS.textDim, textAlign: "right", flexShrink: 0 }}>
            {item[labelKey]}
          </div>
          <div style={styles.barTrack}>
            <div style={{
              width: `${Math.round((Number(item[valueKey]) / max) * 100)}%`,
              backgroundColor: COLORS.accent,
              height: "100%",
              transition: "width 0.4s",
              minWidth: "2px",
            }} />
          </div>
          <div style={{ width: "70px", fontSize: "11px", color: COLORS.textMuted, textAlign: "right", flexShrink: 0 }}>
            {Number(item[valueKey]).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, valueKey, labelKey }) {
  if (data.length < 2) return <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>Not enough data.</div>;
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
      <polyline points={polyline} fill="none" stroke={COLORS.accent} strokeWidth="1.5" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3" fill={COLORS.accent} />
          {i % Math.ceil(data.length / 7) === 0 && (
            <text x={x} y={H - 4} textAnchor="middle" fontSize="8" fill={COLORS.textMuted}>
              {String(data[i][labelKey]).slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Usage View (Item 1) ───────────────────────────────────────────────────────

function UsageView() {
  const [summary, setSummary] = useState(null);
  const [byProvider, setByProvider] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, t, r] = await Promise.all([
        fetch(`${API}/usage/summary`).then((x) => x.json()),
        fetch(`${API}/usage/by-provider`).then((x) => x.json()),
        fetch(`${API}/usage/timeline`).then((x) => x.json()),
        fetch(`${API}/usage/recent`).then((x) => x.json()),
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

  return (
    <div>
      {loading && <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>Loading...</div>}
      {!loading && summary && (
        <>
          {/* Summary cards */}
          <div style={styles.grid3}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{Number(summary.total_tokens).toLocaleString()}</div>
              <div style={styles.statLabel}>Total Tokens (30d)</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>${Number(summary.total_cost_usd).toFixed(4)}</div>
              <div style={styles.statLabel}>Estimated Cost (30d)</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue} style={{ fontSize: "14px", ...styles.statValue }}>{topModel.model || "—"}</div>
              <div style={styles.statLabel}>Most Used Model</div>
            </div>
          </div>

          {/* Bar chart — tokens per operation */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>◈ Tokens by Operation</div>
            <BarChart data={summary.by_operation} valueKey="tokens" labelKey="operation" />
          </div>

          {/* Line chart — daily usage */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>◈ Daily Token Usage (last 30 days)</div>
            <LineChart data={timeline} valueKey="tokens" labelKey="date" />
          </div>

          {/* Provider breakdown */}
          {byProvider.length > 0 && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>◈ Provider Breakdown</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ color: COLORS.textMuted, textAlign: "left" }}>
                    {["Provider", "Model", "Calls", "Tokens", "Cost"].map((h) => (
                      <th key={h} style={{ padding: "6px 12px 6px 0", borderBottom: `1px solid ${COLORS.border}`, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byProvider.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "8px 12px 8px 0", color: COLORS.text }}>{r.llm_provider}</td>
                      <td style={{ padding: "8px 12px 8px 0", color: COLORS.textDim }}>{r.model}</td>
                      <td style={{ padding: "8px 12px 8px 0", color: COLORS.textMuted }}>{r.calls}</td>
                      <td style={{ padding: "8px 12px 8px 0", color: COLORS.textMuted }}>{Number(r.tokens).toLocaleString()}</td>
                      <td style={{ padding: "8px 0", color: COLORS.accent }}>${Number(r.cost).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent calls table */}
          {recent.length > 0 && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>◈ Recent LLM Calls</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ color: COLORS.textMuted, textAlign: "left" }}>
                    {["Operation", "Model", "Tokens", "Cost", "Duration", "Status", "Time"].map((h) => (
                      <th key={h} style={{ padding: "6px 12px 6px 0", borderBottom: `1px solid ${COLORS.border}`, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "7px 12px 7px 0", color: COLORS.text }}>{r.operation}</td>
                      <td style={{ padding: "7px 12px 7px 0", color: COLORS.textDim }}>{r.model}</td>
                      <td style={{ padding: "7px 12px 7px 0", color: COLORS.textMuted }}>{r.total_tokens}</td>
                      <td style={{ padding: "7px 12px 7px 0", color: COLORS.accent }}>${Number(r.estimated_cost_usd).toFixed(5)}</td>
                      <td style={{ padding: "7px 12px 7px 0", color: COLORS.textMuted }}>{r.duration_ms}ms</td>
                      <td style={{ padding: "7px 12px 7px 0" }}>
                        <span style={styles.tag(r.success ? COLORS.success : COLORS.error)}>
                          {r.success ? "ok" : "fail"}
                        </span>
                      </td>
                      <td style={{ padding: "7px 0", color: COLORS.textMuted }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
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

// ── Certificate View (Item 3) ─────────────────────────────────────────────────

function CertificatesView() {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [rotateDomain, setRotateDomain] = useState("");
  const [newCert, setNewCert] = useState("");
  const [rotateResult, setRotateResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(`${API}/certificates/scan`).then((x) => x.json());
      setCerts(data);
    } catch {
      setCerts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusColor = (s) =>
    s === "critical" ? COLORS.error :
    s === "warning"  ? COLORS.warning :
    s === "ok"       ? COLORS.success : COLORS.textMuted;

  const critical = certs.filter((c) => c.certificate_status?.status === "critical");

  const submitRotate = async () => {
    if (!rotateDomain || !newCert) return;
    setRotating(true);
    setRotateResult(null);
    try {
      const res = await fetch(`${API}/certificates/rotate`, {
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
      {/* Critical alert banner */}
      {critical.length > 0 && (
        <div style={{ backgroundColor: COLORS.error + "18", border: `1px solid ${COLORS.error}44`, borderRadius: "6px", padding: "12px 16px", marginBottom: "20px", fontSize: "12px", color: COLORS.error }}>
          ⚠ {critical.length} certificate{critical.length > 1 ? "s" : ""} expiring within 14 days:{" "}
          {critical.map((c) => c.idp_name).join(", ")}
        </div>
      )}

      {/* Certificate health grid */}
      <div style={styles.card}>
        <div style={{ ...styles.cardTitle, display: "flex", justifyContent: "space-between" }}>
          <span>◈ Certificate Health</span>
          <button style={styles.btn("secondary")} onClick={load} disabled={loading}>
            {loading ? "⟳" : "Refresh"}
          </button>
        </div>
        {loading && <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>Scanning...</div>}
        {!loading && certs.length === 0 && (
          <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>No IDPs found.</div>
        )}
        {certs.map((c, i) => {
          const cs = c.certificate_status;
          const color = statusColor(cs.status);
          return (
            <div key={i} style={{ ...styles.certRow, borderLeftColor: color }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: COLORS.text }}>{c.idp_name}</div>
                <div style={{ color: COLORS.textMuted, fontSize: "11px" }}>{c.email_domain}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: "120px" }}>
                {cs.days_remaining != null ? (
                  <>
                    <div style={{ color, fontWeight: 700 }}>{cs.days_remaining}d remaining</div>
                    <div style={{ color: COLORS.textMuted, fontSize: "10px" }}>{cs.expiry_date?.slice(0, 10)}</div>
                  </>
                ) : (
                  <div style={{ color: COLORS.textMuted, fontSize: "11px" }}>{cs.message || cs.error || cs.status}</div>
                )}
              </div>
              <span style={styles.tag(color)}>{cs.status}</span>
            </div>
          );
        })}
      </div>

      {/* Rotate Certificate panel */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>◈ Rotate Certificate</div>
        <div style={{ ...styles.grid2, marginBottom: "16px" }}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email Domain</label>
            <input style={styles.input} placeholder="acmecorp.com" value={rotateDomain}
              onChange={(e) => setRotateDomain(e.target.value)} />
          </div>
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>New Certificate (PEM or base64)</label>
          <textarea style={styles.textarea} rows={5}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={newCert} onChange={(e) => setNewCert(e.target.value)} />
        </div>
        <div style={{ marginTop: "16px" }}>
          <button style={styles.btn("primary")} onClick={submitRotate}
            disabled={rotating || !rotateDomain || !newCert}>
            {rotating ? "⟳ Rotating..." : "▶ Rotate Certificate"}
          </button>
        </div>
        {rotateResult && (
          <div style={{ marginTop: "16px", padding: "12px", borderRadius: "4px",
            backgroundColor: COLORS.surfaceAlt, fontSize: "11px",
            color: rotateResult.status === "success" ? COLORS.success : COLORS.error }}>
            {rotateResult.status === "success"
              ? `✓ Certificate rotated for ${rotateDomain}`
              : `✗ ${rotateResult.message || rotateResult.status}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

// ── Keycloak integration (Item 2) — optional, requires keycloak-js ───────────
// To activate: npm install keycloak-js and set VITE_KEYCLOAK_ENABLED=true
const KEYCLOAK_ENABLED = (typeof import.meta !== "undefined" &&
  import.meta.env?.VITE_KEYCLOAK_ENABLED === "true");

function useKeycloak() {
  const [user, setUser] = useState(null);
  const [kcReady, setKcReady] = useState(!KEYCLOAK_ENABLED);

  useEffect(() => {
    if (!KEYCLOAK_ENABLED) return;
    import("./keycloak.js").then(({ default: kc }) => {
      kc.init({ onLoad: "login-required" }).then((authenticated) => {
        if (authenticated) {
          setUser({
            name: kc.tokenParsed?.name || kc.tokenParsed?.preferred_username,
            email: kc.tokenParsed?.email,
            roles: [
              ...(kc.tokenParsed?.realm_access?.roles || []),
              ...(kc.tokenParsed?.resource_access?.["idp-agent-ui"]?.roles || []),
            ],
            logout: () => kc.logout(),
          });
        }
        setKcReady(true);
      });
    }).catch(() => setKcReady(true));
  }, []);

  return { user, kcReady };
}

export default function App() {
  const [view, setView] = useState("onboard");
  const [llmProvider, setLlmProvider] = useState("openai");
  const { user, kcReady } = useKeycloak();

  if (!kcReady) {
    return (
      <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: COLORS.textMuted, fontSize: "12px" }}>Authenticating...</div>
      </div>
    );
  }

  const isAdmin = !KEYCLOAK_ENABLED || user?.roles?.includes("agent-admin");

  const navItems = [
    { id: "idps",         label: "All IDPs",       section: "Manage"      },
    { id: "usage",        label: "Token Usage",     section: "Observe"     },
    { id: "certificates", label: "Certificates",    section: "Observe"     },
    { id: "onboard",      label: "Onboard New IDP", section: "Actions", adminOnly: true },
    { id: "update",       label: "Update IDP",      section: "Actions", adminOnly: true },
  ].filter((n) => !n.adminOnly || isAdmin);

  const sections = [...new Set(navItems.map((n) => n.section))];

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <div style={styles.headerTitle}>⬡ Keycloak IDP Agent</div>
          <div style={styles.headerSub}>Agentic IDP Onboarding & Management</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <LLMSelector value={llmProvider} onChange={setLlmProvider} />
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", color: COLORS.textDim }}>{user.name || user.email}</span>
              <button style={styles.btn("secondary")} onClick={user.logout}>Logout</button>
            </div>
          )}
        </div>
      </header>

      <div style={styles.main}>
        <nav style={styles.sidebar}>
          {sections.map((section) => (
            <div key={section}>
              <div style={styles.sidebarSection}>{section}</div>
              {navItems.filter((n) => n.section === section).map((item) => (
                <div key={item.id} style={styles.sidebarItem(view === item.id)} onClick={() => setView(item.id)}>
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <main style={styles.content}>
          {view === "onboard"      && <OnboardView llmProvider={llmProvider} />}
          {view === "update"       && <UpdateView llmProvider={llmProvider} />}
          {view === "idps"         && <IDPListView />}
          {view === "usage"        && <UsageView />}
          {view === "certificates" && <CertificatesView />}
        </main>
      </div>
    </div>
  );
}

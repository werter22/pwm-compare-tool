export default function Stepper({
  current,
  total,
  label,
}: {
  current: number; // 1-based
  total: number;
  label?: string;
}) {
  const pct = Math.round((current / Math.max(1, total)) * 100);

  return (
    <div style={{ marginBottom: "var(--s-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>
          Schritt {current} / {total}
          {label ? <span style={{ color: "var(--text-muted)", fontWeight: 600 }}> · {label}</span> : null}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{pct}%</div>
      </div>

      <div style={{ marginTop: 8, height: 10, background: "var(--muted)", borderRadius: "var(--r-pill)", border: "1px solid var(--border)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: "var(--r-pill)" }} />
      </div>
    </div>
  );
}

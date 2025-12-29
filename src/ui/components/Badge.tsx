export default function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "crit";
  children: React.ReactNode;
}) {
  const map = {
    neutral: { bg: "var(--muted)", fg: "var(--text)" },
    ok: { bg: "var(--ok-bg)", fg: "var(--ok-fg)" },
    warn: { bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
    crit: { bg: "var(--crit-bg)", fg: "var(--crit-fg)" },
  } as const;

  const s = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: "var(--r-pill)",
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </span>
  );
}

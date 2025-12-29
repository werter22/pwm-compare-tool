export type ChipOption<T extends string> = { value: T; label: string };

export default function ChipGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ChipOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--r-pill)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              background: active ? "rgba(11,58,130,0.08)" : "var(--surface)",
              color: "var(--text)",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

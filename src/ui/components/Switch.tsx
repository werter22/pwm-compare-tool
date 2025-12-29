export default function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 46,
        height: 26,
        borderRadius: "var(--r-pill)",
        border: "1px solid var(--border)",
        background: disabled ? "var(--muted)" : checked ? "var(--accent)" : "var(--muted)",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
      aria-pressed={checked}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "white",
          position: "absolute",
          top: 1.5,
          left: checked ? 22 : 2,
          transition: "left 120ms ease",
          boxShadow: "var(--shadow-sm)",
        }}
      />
    </button>
  );
}

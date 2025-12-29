import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

export default function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: "var(--r-sm)",
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  };

  const styles: Record<Variant, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "white" },
    secondary: { background: "var(--muted)", color: "var(--text)", borderColor: "var(--border)" },
    ghost: { background: "transparent", color: "var(--text)", borderColor: "var(--border)" },
  };

  return <button {...props} style={{ ...base, ...styles[variant], ...props.style }} />;
}

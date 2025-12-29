import type { ReactNode } from "react";
import { useState } from "react";

export default function AccordionSection({
  title,
  subtitle,
  defaultOpen,
  right,
  children,
  accent,
  tint,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  right?: ReactNode;
  children: ReactNode;
  /** Optional visual grouping (e.g. Domain color) */
  accent?: string;
  /** Optional subtle header tint */
  tint?: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{
        border: "1px solid var(--surface-border)",
        borderLeft: accent ? `4px solid ${accent}` : undefined,
        borderRadius: "var(--r-lg)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          padding: "12px 14px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          background: tint ?? "transparent",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          {subtitle ? (
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 13 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {right}
      </summary>

      <div style={{ padding: "12px 14px" }}>{children}</div>
    </details>
  );
}

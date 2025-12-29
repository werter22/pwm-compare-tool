import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p style={{ marginTop: "var(--s-2)", maxWidth: 780 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

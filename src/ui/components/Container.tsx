import type { ReactNode } from "react";

export default function Container({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 var(--s-5)" }}>
      {children}
    </div>
  );
}

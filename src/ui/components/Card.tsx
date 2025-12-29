import type { ReactNode, HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export default function Card({ children, style, ...rest }: Props) {
  return (
    <div
      {...rest}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border, var(--border))",
        borderRadius: "var(--r-lg, var(--r-md))",
        boxShadow: "var(--shadow-sm)",
        padding: "var(--s-4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

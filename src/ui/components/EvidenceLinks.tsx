import type { EvidenceLink } from "../../domain/types";

export default function EvidenceLinks({ links }: { links: EvidenceLink[] }) {
  if (!links || links.length === 0) return <span style={{ color: "#777" }}>Keine Evidenz-Links</span>;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {links.map((l, idx) => (
        <a
          key={idx}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid #ddd",
            textDecoration: "none"
          }}
          title={l.url}
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

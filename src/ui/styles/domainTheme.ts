export type DomainTheme = {
  /** Accent line / key color */
  accent: string;
  /** Subtle background tint (works with the frosted theme) */
  tint: string;
};

// Keep colors explicit and stable (3-domain palette).
// If you want to tune them later, do it here in one place.
export function domainTheme(domainId: string): DomainTheme {
  switch (domainId) {
    // Security & Compliance
    case "d1":
      return {
        accent: "#2F6B3C",
        tint: "rgba(47, 107, 60, 0.08)",
      };

    // Datenhoheit, Lieferkette & Governance
    case "d2":
      return {
        accent: "#B56A3B",
        tint: "rgba(181, 106, 59, 0.10)",
      };

    // Produkt, Betrieb & Adoption
    case "d3":
      return {
        accent: "#2E5D73",
        tint: "rgba(46, 93, 115, 0.10)",
      };

    default:
      return {
        accent: "var(--border)",
        tint: "var(--muted)",
      };
  }
}

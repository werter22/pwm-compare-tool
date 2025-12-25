import type { Tree } from "../domain/types";

export type Rail = {
  key: string;
  title: string;
  helper: string;
  keywords: string[];
};

export const RAILS: Rail[] = [
  {
    key: "data_residency",
    title: "Datenstandort / Datenresidenz",
    helper: "Wo liegen Daten, welche Regionen sind steuerbar, Jurisdiktion/Policy.",
    keywords: ["datenresidenz", "data residency", "jurisdiktion", "region", "standort", "schweiz", "switzerland", "eu"]
  },
  {
    key: "self_hosting",
    title: "Self-Hosting / On-Prem",
    helper: "Option für On-Prem/Self-Hosting (falls relevant oder zwingend).",
    keywords: ["self-host", "self host", "on-prem", "on prem", "on-premise", "on premise", "selfhosting"]
  },
  {
    key: "sso",
    title: "SSO (SAML/OIDC)",
    helper: "Zentrale Anmeldung für Adoption und Sicherheit.",
    keywords: ["sso", "saml", "oidc", "openid", "single sign-on"]
  },
  {
    key: "scim",
    title: "SCIM / Provisioning",
    helper: "Automatisierte Benutzerverwaltung (Joiner/Mover/Leaver).",
    keywords: ["scim", "provision", "provisioning", "user lifecycle"]
  },
  {
    key: "rbac",
    title: "Rollen & Rechte (RBAC)",
    helper: "Feingranulare Adminrechte und Rollenmodell.",
    keywords: ["rbac", "rollen", "role based", "berechtigung"]
  },
  {
    key: "audit",
    title: "Nachweise (ISO/SOC/PenTest)",
    helper: "Auditberichte und belastbare Nachweise.",
    keywords: ["soc", "soc 2", "iso 27001", "iso", "audit", "penetration", "pen test", "nachweise", "compliance"]
  },
  {
    key: "crypto_zk",
    title: "Kryptodesign / Zero Knowledge",
    helper: "E2E/Zero Knowledge, Schluesselkonzept, Recovery-Modell.",
    keywords: ["zero knowledge", "end-to-end", "e2e", "krypto", "crypt", "encryption", "schluessel", "key", "recovery"]
  },
  {
    key: "incident_ops",
    title: "Betrieb (SLA/Status/Incidents)",
    helper: "Verfügbarkeit, Status-Historie, Incident Response.",
    keywords: ["sla", "status", "incident", "vorfall", "rto", "rpo", "availability", "zuverlaessigkeit", "performance"]
  },
  {
    key: "export_exit",
    title: "Export & Exit (Lock-in)",
    helper: "Exportfähigkeit, API-Offenheit, Exit-Regeln.",
    keywords: ["export", "exit", "lock-in", "vendor lock", "api", "migration"]
  },
  {
    key: "support",
    title: "Support & Enablement",
    helper: "Support-SLAs, Doku, Onboarding, Sprachen/Zeitzonen.",
    keywords: ["support", "onboarding", "doku", "documentation", "csm", "success", "schulung", "training"]
  }
];

function norm(s: string) {
  return (s ?? "").toLowerCase();
}

export function findSubIdsByKeywords(tree: Tree, keywords: string[]): string[] {
  const keys = keywords.map(norm);
  const hits: string[] = [];

  for (const d of tree.domains) {
    for (const c of d.criteria) {
      for (const sc of c.subcriteria) {
        const hay = norm(sc.name + " " + (sc.short_desc ?? ""));
        if (keys.some((k) => hay.includes(k))) hits.push(sc.id);
      }
    }
  }
  return Array.from(new Set(hits));
}

export function subIdsForRail(tree: Tree, rail: Rail): string[] {
  return findSubIdsByKeywords(tree, rail.keywords);
}

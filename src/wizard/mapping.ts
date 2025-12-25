import type { Preference, Tree, RelevanceLevel } from "../domain/types";
import type { WizardAnswers } from "./questions";

type Patch = Partial<Pick<Preference, "relevance_level" | "weight" | "is_ko" | "ko_threshold">>;

const KO_THRESHOLD_DEFAULT: 1 | 2 = 2;

// Keywords (Prototyp): passe sie an eure tatsächlichen Subkriterium-Namen an
const KEYWORDS = {
  selfHosting: ["self-host", "self host", "on-prem", "on prem", "on-premise", "on premise", "selfhosting"],
  dataResidency: ["datenresidenz", "data residency", "standort", "region", "switzerland", "schweiz", "jurisdiktion"],
  sso: ["sso", "saml", "oidc", "openid", "single sign-on"],
  scim: ["scim", "provision", "provisioning", "user lifecycle"],
  rbac: ["rbac", "rollen", "role based", "berechtigung"],
  auditEvidence: ["soc", "soc 2", "iso 27001", "iso", "audit", "penetration", "pen test", "nachweise", "compliance"],
  cryptoZk: ["zero knowledge", "end-to-end", "e2e", "krypto", "crypt", "encryption", "schluessel", "key"],
  incidentOps: ["sla", "status", "incident", "vorfall", "rto", "rpo", "availability", "zuverlaessigkeit", "performance"],
  exportExit: ["export", "exit", "lock-in", "vendor lock", "api", "migration"]
};

function norm(s: string) {
  return (s ?? "").toLowerCase();
}

function findSubIdsByKeywords(tree: Tree, keywords: string[]): string[] {
  const hits: string[] = [];
  const keys = keywords.map(norm);

  for (const d of tree.domains) {
    for (const c of d.criteria) {
      for (const sc of c.subcriteria) {
        const hay = norm(sc.name + " " + (sc.short_desc ?? ""));
        if (keys.some(k => hay.includes(k))) hits.push(sc.id);
      }
    }
  }
  return Array.from(new Set(hits));
}

function findAllSubIdsByDomain(tree: Tree, domainId: string): string[] {
  const d = tree.domains.find(x => x.id === domainId);
  if (!d) return [];
  const out: string[] = [];
  for (const c of d.criteria) for (const s of c.subcriteria) out.push(s.id);
  return out;
}

function applyPatch(prefs: Preference[], ids: string[], patch: Patch): Preference[] {
  const idSet = new Set(ids);
  return prefs.map(p => (idSet.has(p.subcriterion_id) ? { ...p, ...patch } : p));
}

function setRelevanceAndWeight(level: RelevanceLevel, weight: number, isKo = false): Patch {
  return {
    relevance_level: level,
    weight,
    is_ko: isKo,
    ko_threshold: isKo ? KO_THRESHOLD_DEFAULT : undefined
  };
}

function applyDomainMultiplier(prefs: Preference[], ids: string[], factor: number): Preference[] {
  const idSet = new Set(ids);
  return prefs.map(p => {
    if (!idSet.has(p.subcriterion_id)) return p;
    if (p.relevance_level === "nicht_relevant") return p;
    const w = Math.round((p.weight ?? 0) * factor);
    return { ...p, weight: Math.max(0, Math.min(10, w)) };
  });
}

export function applyWizardAnswers(args: {
  tree: Tree;
  preferences: Preference[];
  answers: WizardAnswers;
}): { next: Preference[]; summary: string[] } {
  const { tree, preferences, answers } = args;
  let next = [...preferences];
  const summary: string[] = [];

  // 1) Domänen-Grobgewichtung via Multiplikatoren
  const securityIds = findAllSubIdsByDomain(tree, "d1");
  const governanceIds = findAllSubIdsByDomain(tree, "d2");
  const productIds = findAllSubIdsByDomain(tree, "d3");

  // Sensitivity
  if (answers.sensitivity === "normal") {
    next = applyDomainMultiplier(next, securityIds, 0.9);
    next = applyDomainMultiplier(next, governanceIds, 1.0);
    summary.push("Sicherheit: normal gewichtet.");
  } else if (answers.sensitivity === "sensibel") {
    next = applyDomainMultiplier(next, securityIds, 1.15);
    next = applyDomainMultiplier(next, governanceIds, 1.1);
    summary.push("Sicherheit & Nachweise: wichtiger gewichtet (sensibel).");
  } else {
    next = applyDomainMultiplier(next, securityIds, 1.35);
    next = applyDomainMultiplier(next, governanceIds, 1.25);
    summary.push("Sicherheit & Compliance: stark priorisiert (reguliert).");
  }

  // Cost focus (wir ziehen Produkt/Adoption nicht runter, sondern pushen TCO)
  if (answers.costFocus === "kosten") {
    const tcoIds = findSubIdsByKeywords(tree, ["tco", "total cost", "kosten"]);
    next = applyPatch(next, tcoIds, { relevance_level: "muss", weight: 8 });
    summary.push("Kosten/TCO: hoch gewichtet.");
  } else if (answers.costFocus === "security") {
    next = applyDomainMultiplier(next, securityIds, 1.1);
    summary.push("Sicherheit vor Kosten: Sicherheit zusätzlich betont.");
  } else {
    summary.push("Kostenfokus: Balance.");
  }

  // 2) Leitplanken: konkrete Themen (KO / Muss / Sollte)
  // Self-Hosting
  const selfHostIds = findSubIdsByKeywords(tree, KEYWORDS.selfHosting);
  if (answers.hosting === "self_host_ko") {
    next = applyPatch(next, selfHostIds, { relevance_level: "muss", weight: 10, is_ko: true, ko_threshold: KO_THRESHOLD_DEFAULT });
    summary.push("Zwingend (KO): Self-Hosting muss möglich sein.");
  } else if (answers.hosting === "self_host_nice") {
    next = applyPatch(next, selfHostIds, { relevance_level: "sollte", weight: 6, is_ko: false });
    summary.push("Self-Hosting: als wichtig markiert (kein KO).");
  } else {
    // SaaS ok → Self-Hosting nicht pushen
  }

  // SSO
  const ssoIds = findSubIdsByKeywords(tree, KEYWORDS.sso);
  if (answers.sso === "zwingend") {
    next = applyPatch(next, ssoIds, { relevance_level: "muss", weight: 9, is_ko: true, ko_threshold: KO_THRESHOLD_DEFAULT });
    summary.push("Zwingend (KO): SSO ist erforderlich.");
  } else if (answers.sso === "gut") {
    next = applyPatch(next, ssoIds, { relevance_level: "sollte", weight: 6, is_ko: false });
    summary.push("SSO: wichtig (kein KO).");
  }

  // Datenstandort / Jurisdiktion
  const dataIds = findSubIdsByKeywords(tree, KEYWORDS.dataResidency);
  if (answers.dataResidency === "ch") {
    next = applyPatch(next, dataIds, { relevance_level: "muss", weight: 9, is_ko: true, ko_threshold: KO_THRESHOLD_DEFAULT });
    summary.push("Zwingend (KO): Datenstandort Schweiz (CH).");
  } else if (answers.dataResidency === "ch_eu") {
    next = applyPatch(next, dataIds, { relevance_level: "muss", weight: 8, is_ko: false });
    summary.push("Datenstandort: CH/EU stark gewichtet.");
  } else if (answers.dataResidency === "eu") {
    next = applyPatch(next, dataIds, { relevance_level: "sollte", weight: 6, is_ko: false });
    summary.push("Datenstandort: EU wichtig.");
  } else {
    // egal
  }

  // Teamgroesse → SCIM/Provisioning + RBAC wichtiger bei grossen Teams
  const scimIds = findSubIdsByKeywords(tree, KEYWORDS.scim);
  const rbacIds = findSubIdsByKeywords(tree, KEYWORDS.rbac);

  if (answers.teamSize === "gt200") {
    next = applyPatch(next, scimIds, { relevance_level: "muss", weight: 8 });
    next = applyPatch(next, rbacIds, { relevance_level: "muss", weight: 8 });
    summary.push("Grosses Team: SCIM/Provisioning und Rollen (RBAC) hoch priorisiert.");
  } else if (answers.teamSize === "20_200") {
    next = applyPatch(next, scimIds, { relevance_level: "sollte", weight: 6 });
    next = applyPatch(next, rbacIds, { relevance_level: "sollte", weight: 6 });
    summary.push("Mittleres Team: SCIM und Rollen als wichtig gesetzt.");
  }

  // Support/Verfügbarkeit → SLA/Incident/Status
  const opsIds = findSubIdsByKeywords(tree, KEYWORDS.incidentOps);
  if (answers.support === "sehr_wichtig") {
    next = applyPatch(next, opsIds, { relevance_level: "muss", weight: 8 });
    summary.push("Betrieb: SLA/Status/Incident-Handling stark gewichtet.");
  } else if (answers.support === "wichtig") {
    next = applyPatch(next, opsIds, { relevance_level: "sollte", weight: 6 });
    summary.push("Betrieb: SLA/Status/Incident-Handling wichtig.");
  }

  // Sicherheits-Leitplanken (immer ein bisschen, wenn sensibel/reguliert)
  if (answers.sensitivity !== "normal") {
    const auditIds = findSubIdsByKeywords(tree, KEYWORDS.auditEvidence);
    const cryptoIds = findSubIdsByKeywords(tree, KEYWORDS.cryptoZk);
    next = applyPatch(next, auditIds, { relevance_level: "muss", weight: answers.sensitivity === "reguliert" ? 9 : 7 });
    next = applyPatch(next, cryptoIds, { relevance_level: "muss", weight: answers.sensitivity === "reguliert" ? 9 : 7 });
    summary.push("Nachweise & Kryptodesign: als Muss gesetzt (sensibel/reguliert).");
  }

  // Exit/Lock-in immer mindestens sollte
  const exitIds = findSubIdsByKeywords(tree, KEYWORDS.exportExit);
  next = applyPatch(next, exitIds, { relevance_level: "sollte", weight: 5 });
  summary.push("Exit/Export: als wichtig (Sollte) gesetzt.");

  // 3) Schutz: wenn KO auf sehr viele Subkriterien matcht, ist das ok – UI warnt später.
  // (Optional später: KO-Count Limit + Warnung im Wizard)

  return { next, summary };
}

import type { Preference, Tree } from "../domain/types";
import type { WizardAnswers } from "./questions";

export type RailConfigItem = {
  key: string;
  title: string;
  helper: string;
  subcriterion_ids: string[];
};

type Patch = Partial<Pick<Preference, "relevance_level" | "weight" | "is_ko" | "ko_threshold">>;

const KO_THRESHOLD_DEFAULT: 1 | 2 = 2;

/**
 * IDs kommen config-basiert aus rails.config.json (wird im Wizard geladen).
 * Vorteil: stabil, deterministisch, keine Keyword-Magie.
 */
function idsForRailKey(tree: Tree, rails: RailConfigItem[], key: string): string[] {
  const rail = rails.find((r) => r.key === key);
  if (!rail) return [];

  // Safety-Filter: nur IDs, die im Tree existieren
  const valid = new Set<string>();
  for (const d of tree.domains) for (const c of d.criteria) for (const s of c.subcriteria) valid.add(s.id);

  return (rail.subcriterion_ids ?? []).filter((id) => valid.has(id));
}

function findAllSubIdsByDomain(tree: Tree, domainId: string): string[] {
  const d = tree.domains.find((x) => x.id === domainId);
  if (!d) return [];
  const out: string[] = [];
  for (const c of d.criteria) for (const s of c.subcriteria) out.push(s.id);
  return out;
}

function applyPatch(prefs: Preference[], ids: string[], patch: Patch): Preference[] {
  if (ids.length === 0) return prefs;
  const idSet = new Set(ids);
  return prefs.map((p) => (idSet.has(p.subcriterion_id) ? { ...p, ...patch } : p));
}

function applyDomainMultiplier(prefs: Preference[], ids: string[], factor: number): Preference[] {
  if (ids.length === 0) return prefs;
  const idSet = new Set(ids);
  return prefs.map((p) => {
    if (!idSet.has(p.subcriterion_id)) return p;
    if (p.relevance_level === "nicht_relevant") return p;
    const w = Math.round((p.weight ?? 0) * factor);
    return { ...p, weight: Math.max(0, Math.min(10, w)) };
  });
}

function noteIfMissing(summary: string[], ids: string[], msgOk: string, msgMissing: string) {
  summary.push(ids.length > 0 ? msgOk : msgMissing);
}

export function applyWizardAnswers(args: {
  tree: Tree;
  preferences: Preference[];
  answers: WizardAnswers;
  rails: RailConfigItem[];
}): { next: Preference[]; summary: string[] } {
  const { tree, preferences, answers, rails } = args;
  let next = [...preferences];
  const summary: string[] = [];

  // 1) Domänen-Grobgewichtung via Multiplikatoren
  const securityIds = findAllSubIdsByDomain(tree, "d1");
  const governanceIds = findAllSubIdsByDomain(tree, "d2");

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

  // 2) Kostenfokus (optional über Rail-Key "tco")
  if (answers.costFocus === "kosten") {
    const tcoIds = idsForRailKey(tree, rails, "tco");
    next = applyPatch(next, tcoIds, { relevance_level: "muss", weight: 8 });
    noteIfMissing(
      summary,
      tcoIds,
      "Kosten/TCO: hoch gewichtet.",
      "Kosten/TCO: (noch nicht gemappt in rails.config.json)."
    );
  } else if (answers.costFocus === "security") {
    next = applyDomainMultiplier(next, securityIds, 1.1);
    summary.push("Sicherheit vor Kosten: Sicherheit zusätzlich betont.");
  } else {
    summary.push("Kostenfokus: Balance.");
  }

  // 3) Leitplanken: konkrete Themen (KO / Muss / Sollte)
  const selfHostIds = idsForRailKey(tree, rails, "self_hosting");
  const ssoIds = idsForRailKey(tree, rails, "sso");
  const dataIds = idsForRailKey(tree, rails, "data_residency");
  const scimIds = idsForRailKey(tree, rails, "scim");
  const rbacIds = idsForRailKey(tree, rails, "rbac");
  const opsIds = idsForRailKey(tree, rails, "incident_ops");
  const auditIds = idsForRailKey(tree, rails, "audit_evidence");
  const cryptoIds = idsForRailKey(tree, rails, "crypto_zk");
  const exitIds = idsForRailKey(tree, rails, "export_exit");

  // Self-Hosting
  if (answers.hosting === "self_host_ko") {
    next = applyPatch(next, selfHostIds, {
      relevance_level: "muss",
      weight: 10,
      is_ko: true,
      ko_threshold: KO_THRESHOLD_DEFAULT,
    });
    noteIfMissing(
      summary,
      selfHostIds,
      "Zwingend (KO): Self-Hosting muss möglich sein.",
      "Self-Hosting KO: (kein Mapping gefunden in rails.config.json)."
    );
  } else if (answers.hosting === "self_host_nice") {
    next = applyPatch(next, selfHostIds, { relevance_level: "sollte", weight: 6, is_ko: false });
    noteIfMissing(
      summary,
      selfHostIds,
      "Self-Hosting: als wichtig markiert (kein KO).",
      "Self-Hosting: (kein Mapping gefunden in rails.config.json)."
    );
  }

  // SSO
  if (answers.sso === "zwingend") {
    next = applyPatch(next, ssoIds, {
      relevance_level: "muss",
      weight: 9,
      is_ko: true,
      ko_threshold: KO_THRESHOLD_DEFAULT,
    });
    noteIfMissing(summary, ssoIds, "Zwingend (KO): SSO ist erforderlich.", "SSO KO: (kein Mapping gefunden).");
  } else if (answers.sso === "gut") {
    next = applyPatch(next, ssoIds, { relevance_level: "sollte", weight: 6, is_ko: false });
    noteIfMissing(summary, ssoIds, "SSO: wichtig (kein KO).", "SSO: (kein Mapping gefunden).");
  }

  // Datenstandort / Jurisdiktion
  if (answers.dataResidency === "ch") {
    next = applyPatch(next, dataIds, {
      relevance_level: "muss",
      weight: 9,
      is_ko: true,
      ko_threshold: KO_THRESHOLD_DEFAULT,
    });
    noteIfMissing(summary, dataIds, "Zwingend (KO): Datenstandort Schweiz (CH).", "Datenstandort CH: (kein Mapping gefunden).");
  } else if (answers.dataResidency === "ch_eu") {
    next = applyPatch(next, dataIds, { relevance_level: "muss", weight: 8, is_ko: false });
    noteIfMissing(summary, dataIds, "Datenstandort: CH/EU stark gewichtet.", "Datenstandort CH/EU: (kein Mapping gefunden).");
  } else if (answers.dataResidency === "eu") {
    next = applyPatch(next, dataIds, { relevance_level: "sollte", weight: 6, is_ko: false });
    noteIfMissing(summary, dataIds, "Datenstandort: EU wichtig.", "Datenstandort EU: (kein Mapping gefunden).");
  }

  // Teamgroesse → SCIM/Provisioning + RBAC
  if (answers.teamSize === "gt200") {
    next = applyPatch(next, scimIds, { relevance_level: "muss", weight: 8 });
    next = applyPatch(next, rbacIds, { relevance_level: "muss", weight: 8 });
    summary.push("Grosses Team: SCIM/Provisioning und Rollen (RBAC) hoch priorisiert.");
  } else if (answers.teamSize === "20_200") {
    next = applyPatch(next, scimIds, { relevance_level: "sollte", weight: 6 });
    next = applyPatch(next, rbacIds, { relevance_level: "sollte", weight: 6 });
    summary.push("Mittleres Team: SCIM und Rollen als wichtig gesetzt.");
  }

  // Betrieb / Support → SLA/Incident/Status
  if (answers.support === "sehr_wichtig") {
    next = applyPatch(next, opsIds, { relevance_level: "muss", weight: 8 });
    noteIfMissing(summary, opsIds, "Betrieb: SLA/Status/Incident-Handling stark gewichtet.", "Betrieb: (kein Mapping gefunden).");
  } else if (answers.support === "wichtig") {
    next = applyPatch(next, opsIds, { relevance_level: "sollte", weight: 6 });
    noteIfMissing(summary, opsIds, "Betrieb: SLA/Status/Incident-Handling wichtig.", "Betrieb: (kein Mapping gefunden).");
  }

  // Nachweise & Kryptodesign für sensibel/reguliert
  if (answers.sensitivity !== "normal") {
    next = applyPatch(next, auditIds, {
      relevance_level: "muss",
      weight: answers.sensitivity === "reguliert" ? 9 : 7,
    });
    next = applyPatch(next, cryptoIds, {
      relevance_level: "muss",
      weight: answers.sensitivity === "reguliert" ? 9 : 7,
    });
    summary.push("Nachweise & Kryptodesign: als Muss gesetzt (sensibel/reguliert).");
  }

  // Exit/Lock-in immer mindestens sollte
  next = applyPatch(next, exitIds, { relevance_level: "sollte", weight: 5 });
  noteIfMissing(summary, exitIds, "Exit/Export: als wichtig (Sollte) gesetzt.", "Exit/Export: (kein Mapping gefunden).");

  return { next, summary };
}

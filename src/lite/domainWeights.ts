import type { Preference, Tree } from "../domain/types";

export type DomainMultipliers = { d1: number; d2: number; d3: number };

const LS_KEY = "pwm_compare_domain_multipliers_v1";

export function loadDomainMultipliers(): DomainMultipliers {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { d1: 1, d2: 1, d3: 1 };
    const v = JSON.parse(raw);
    return {
      d1: typeof v.d1 === "number" ? v.d1 : 1,
      d2: typeof v.d2 === "number" ? v.d2 : 1,
      d3: typeof v.d3 === "number" ? v.d3 : 1
    };
  } catch {
    return { d1: 1, d2: 1, d3: 1 };
  }
}

export function saveDomainMultipliers(m: DomainMultipliers) {
  localStorage.setItem(LS_KEY, JSON.stringify(m));
}

function clampWeight(w: number) {
  return Math.max(0, Math.min(10, w));
}

function subIdsByDomain(tree: Tree, domainId: "d1" | "d2" | "d3"): string[] {
  const d = tree.domains.find((x) => x.id === domainId);
  if (!d) return [];
  const out: string[] = [];
  for (const c of d.criteria) for (const s of c.subcriteria) out.push(s.id);
  return out;
}

/**
 * Wendet neue Multiplikatoren relativ zu den bisherigen an:
 * neueGewichte = alteGewichte * (next/prev) pro Domäne
 */
export function applyDomainMultiplierChange(args: {
  tree: Tree;
  preferences: Preference[];
  prev: DomainMultipliers;
  next: DomainMultipliers;
}): Preference[] {
  const { tree, preferences, prev, next } = args;

  const ids1 = new Set(subIdsByDomain(tree, "d1"));
  const ids2 = new Set(subIdsByDomain(tree, "d2"));
  const ids3 = new Set(subIdsByDomain(tree, "d3"));

  const f1 = prev.d1 > 0 ? next.d1 / prev.d1 : 1;
  const f2 = prev.d2 > 0 ? next.d2 / prev.d2 : 1;
  const f3 = prev.d3 > 0 ? next.d3 / prev.d3 : 1;

  return preferences.map((p) => {
    if (p.relevance_level === "nicht_relevant") return p;
    if (p.weight <= 0) return p;

    let factor = 1;
    if (ids1.has(p.subcriterion_id)) factor = f1;
    else if (ids2.has(p.subcriterion_id)) factor = f2;
    else if (ids3.has(p.subcriterion_id)) factor = f3;

    if (factor === 1) return p;

    return { ...p, weight: clampWeight(Math.round(p.weight * factor)) };
  });
}

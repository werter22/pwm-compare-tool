import type { Preference, RelevanceLevel, Tree } from "../domain/types";

const LS_KEY = "pwm_compare_preferences_v1";

const DEFAULT_WEIGHT: Record<RelevanceLevel, number> = {
  muss: 5,
  sollte: 3,
  kann: 1,
  nicht_relevant: 0
};

export function makeDefaultPreference(subcriterion_id: string): Preference {
  return {
    subcriterion_id,
    relevance_level: "sollte",
    is_ko: false,
    weight: DEFAULT_WEIGHT["sollte"],
    ko_threshold: 2
  };
}

export function loadPreferences(): Preference[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Preference[];
  } catch {
    return [];
  }
}

export function savePreferences(prefs: Preference[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(prefs));
}

export function ensurePreferencesForTree(tree: Tree, existing: Preference[]): Preference[] {
  const map = new Map(existing.map(p => [p.subcriterion_id, p]));
  for (const d of tree.domains) {
    for (const c of d.criteria) {
      for (const s of c.subcriteria) {
        if (!map.has(s.id)) map.set(s.id, makeDefaultPreference(s.id));
      }
    }
  }
  return Array.from(map.values());
}

export function setRelevance(
  prefs: Preference[],
  subId: string,
  level: RelevanceLevel
): Preference[] {
  return prefs.map(p => {
    if (p.subcriterion_id !== subId) return p;

    const weight = DEFAULT_WEIGHT[level];
    // Wenn nicht relevant: KO automatisch aus, threshold egal
    return {
      ...p,
      relevance_level: level,
      weight,
      is_ko: level === "nicht_relevant" ? false : p.is_ko
    };
  });
}

export function setWeight(prefs: Preference[], subId: string, weight: number): Preference[] {
  return prefs.map(p => (p.subcriterion_id === subId ? { ...p, weight } : p));
}

export function setKO(prefs: Preference[], subId: string, is_ko: boolean): Preference[] {
  return prefs.map(p => {
    if (p.subcriterion_id !== subId) return p;
    if (p.relevance_level === "nicht_relevant") return { ...p, is_ko: false };
    return { ...p, is_ko };
  });
}

export function setKOThreshold(prefs: Preference[], subId: string, t: 1 | 2): Preference[] {
  return prefs.map(p => (p.subcriterion_id === subId ? { ...p, ko_threshold: t } : p));
}

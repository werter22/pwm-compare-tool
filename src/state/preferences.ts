import type { Preference, RelevanceLevel, Tree } from "../domain/types";

const LS_KEY = "pwm_compare_preferences_v1";

const DEFAULT_WEIGHT: Record<RelevanceLevel, number> = {
  muss: 5,
  sollte: 3,
  kann: 1,
  nicht_relevant: 0
};

const DEFAULT_LEVEL: RelevanceLevel = "kann"; // NEU: neutral

export function makeDefaultPreference(subcriterion_id: string): Preference {
  return {
    subcriterion_id,
    relevance_level: DEFAULT_LEVEL,
    is_ko: false,
    weight: DEFAULT_WEIGHT[DEFAULT_LEVEL],
    ko_threshold: 2
  };
}

// NEU: robust gegen alte LocalStorage-Daten (fehlende Felder)
function normalizePreference(p: any): Preference {
  const relevance_level: RelevanceLevel =
    p?.relevance_level ?? DEFAULT_LEVEL;

  const weight =
    typeof p?.weight === "number" ? p.weight : DEFAULT_WEIGHT[relevance_level];

  const is_ko =
    relevance_level === "nicht_relevant" ? false : !!p?.is_ko;

  return {
    subcriterion_id: String(p?.subcriterion_id),
    relevance_level,
    weight,
    is_ko,
    ko_threshold: (p?.ko_threshold ?? 2) as 1 | 2
  };
}

export function loadPreferences(): Preference[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizePreference);
  } catch {
    return [];
  }
}

export function savePreferences(prefs: Preference[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(prefs));
}

// NEU
export function clearPreferences() {
  localStorage.removeItem(LS_KEY);
}

export function ensurePreferencesForTree(tree: Tree, existing: Preference[]): Preference[] {
  const map = new Map<string, Preference>();

  // existing zuerst normalisieren (wichtig!)
  for (const p of existing as any[]) {
    const np = normalizePreference(p);
    if (np.subcriterion_id) map.set(np.subcriterion_id, np);
  }

  for (const d of tree.domains) {
    for (const c of d.criteria) {
      for (const s of c.subcriteria) {
        if (!map.has(s.id)) map.set(s.id, makeDefaultPreference(s.id));
      }
    }
  }
  return Array.from(map.values());
}

export function setRelevance(prefs: Preference[], subId: string, level: RelevanceLevel): Preference[] {
  return prefs.map(p => {
    if (p.subcriterion_id !== subId) return p;
    const weight = DEFAULT_WEIGHT[level];
    return {
      ...p,
      relevance_level: level,
      weight,
      is_ko: level === "nicht_relevant" ? false : p.is_ko,
      ko_threshold: 2 // immer stabil
    };
  });
}

export function setKO(prefs: Preference[], subId: string, is_ko: boolean): Preference[] {
  return prefs.map(p => {
    if (p.subcriterion_id !== subId) return p;
    if (p.relevance_level === "nicht_relevant") return { ...p, is_ko: false, ko_threshold: 2 };
    return { ...p, is_ko, ko_threshold: 2 };
  });
}

export function setKOThreshold(prefs: Preference[], subId: string, t: 1 | 2): Preference[] {
  return prefs.map(p => (p.subcriterion_id === subId ? { ...p, ko_threshold: t } : p));
}

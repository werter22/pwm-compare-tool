import type { Preference, RelevanceLevel, Tree } from "../domain/types";

const LS_KEY = "pwm_compare_preferences_v1";
const LS_APPLIED_KEY = "pwm_compare_preferences_applied_v1";

// Vanilla-Baseline (gleichgewichtet, keine KO).
// Wichtig: Diese Defaults dürfen NICHT automatisch in LocalStorage geschrieben werden.
const DEFAULT_WEIGHT: Record<RelevanceLevel, number> = {
  muss: 10,
  sollte: 5,
  kann: 1,
  nicht_relevant: 0,
};

const DEFAULT_LEVEL: RelevanceLevel = "kann";

type PrefLike = Record<string, unknown>;

function asPrefLike(v: unknown): PrefLike {
  return v && typeof v === "object" ? (v as PrefLike) : {};
}

function normalizeThreshold(v: unknown): 1 | 2 {
  return v === 1 || v === 2 ? v : 2;
}

export function makeDefaultPreference(subcriterion_id: string): Preference {
  return {
    subcriterion_id,
    relevance_level: DEFAULT_LEVEL,
    is_ko: false,
    weight: DEFAULT_WEIGHT[DEFAULT_LEVEL],
    ko_threshold: 2,
  };
}

// Robust gegen alte / kaputte LocalStorage-Daten
function normalizePreference(p: unknown): Preference {
  const obj = asPrefLike(p);

  const levelRaw = obj["relevance_level"];
  const level: RelevanceLevel =
    levelRaw === "muss" ||
    levelRaw === "sollte" ||
    levelRaw === "kann" ||
    levelRaw === "nicht_relevant"
      ? levelRaw
      : DEFAULT_LEVEL;

  const wRaw = obj["weight"];
  const weight =
    typeof wRaw === "number" && Number.isFinite(wRaw) ? wRaw : DEFAULT_WEIGHT[level];

  const is_ko = level === "nicht_relevant" ? false : Boolean(obj["is_ko"]);

  return {
    subcriterion_id: String(obj["subcriterion_id"] ?? ""),
    relevance_level: level,
    weight,
    is_ko,
    ko_threshold: normalizeThreshold(obj["ko_threshold"]),
  };
}

export function loadPreferences(): Preference[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizePreference).filter((p) => !!p.subcriterion_id);
  } catch {
    return [];
  }
}

/**
 * Speichert Preferences, markiert sie aber NICHT als "angewendet".
 * (Wichtig für Draft-Mode / Vanilla-Flow.)
 */
export function savePreferences(prefs: Preference[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(prefs));
}

export function saveAppliedPreferences(prefs: Preference[]) {
  savePreferences(prefs);
  localStorage.setItem(LS_APPLIED_KEY, "1");
}

export function preferencesApplied(): boolean {
  return localStorage.getItem(LS_APPLIED_KEY) === "1";
}

export function clearPreferences() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_APPLIED_KEY);
}

export function ensurePreferencesForTree(tree: Tree, existing: Preference[]): Preference[] {
  const map = new Map<string, Preference>();

  for (const p of existing) {
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

/** Vanilla = Tree vollständig, gleichgewichtet, keine KO. (Nicht persistieren.) */
export function makeVanillaPreferences(tree: Tree): Preference[] {
  return ensurePreferencesForTree(tree, []);
}

export function setRelevance(prefs: Preference[], subId: string, level: RelevanceLevel): Preference[] {
  return prefs.map((p) => {
    if (p.subcriterion_id !== subId) return p;
    const weight = DEFAULT_WEIGHT[level];
    return {
      ...p,
      relevance_level: level,
      weight,
      is_ko: level === "nicht_relevant" ? false : p.is_ko,
      ko_threshold: 2,
    };
  });
}

export function setKO(prefs: Preference[], subId: string, is_ko: boolean): Preference[] {
  return prefs.map((p) => {
    if (p.subcriterion_id !== subId) return p;
    if (p.relevance_level === "nicht_relevant") return { ...p, is_ko: false, ko_threshold: 2 };
    return { ...p, is_ko, ko_threshold: 2 };
  });
}

export function setKOThreshold(prefs: Preference[], subId: string, t: 1 | 2): Preference[] {
  return prefs.map((p) => (p.subcriterion_id === subId ? { ...p, ko_threshold: t } : p));
}

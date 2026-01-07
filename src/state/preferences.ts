import type { Preference, RelevanceLevel, Tree } from "../domain/types";

const LS_KEY = "pwm_compare_preferences_v1";
const LS_APPLIED_KEY = "pwm_compare_preferences_applied_v1";

/**
 * OPTION 2 (Source of Truth = weight)
 * - weight ist die Wahrheit (0..10)
 * - relevance_level wird aus weight abgeleitet (2A)
 * - KO ist harte Constraint: is_ko => weight=10 & relevance_level="muss"
 */

const KO_THRESHOLD_DEFAULT: 1 | 2 = 2;

// Defaults (wenn user "Relevanz" auswählt, wird weight auf diese Werte gesetzt)
const DEFAULT_WEIGHT_BY_LEVEL: Record<RelevanceLevel, number> = {
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
  return v === 1 || v === 2 ? v : KO_THRESHOLD_DEFAULT;
}

function clampInt(n: number, min: number, max: number): number {
  const x = Math.round(n);
  return Math.max(min, Math.min(max, x));
}

/**
 * 2A: Relevanz aus Weight ableiten.
 * (Schwellen so gewählt, dass "7" weiterhin als "muss" gelten kann.)
 */
function deriveRelevanceFromWeight(weight: number): RelevanceLevel {
  if (weight <= 0) return "nicht_relevant";
  if (weight >= 7) return "muss";
  if (weight >= 4) return "sollte";
  return "kann";
}

export function makeDefaultPreference(subcriterion_id: string): Preference {
  const weight = DEFAULT_WEIGHT_BY_LEVEL[DEFAULT_LEVEL];
  return {
    subcriterion_id,
    weight,
    relevance_level: deriveRelevanceFromWeight(weight),
    is_ko: false,
    ko_threshold: KO_THRESHOLD_DEFAULT,
  };
}

/**
 * Normalisiert ein einzelnes Preference-Objekt robust (auch alte/kaputte LS-Daten).
 * Quelle der Wahrheit bleibt weight (mit KO-Constraint).
 */
function normalizePreference(p: unknown): Preference {
  const obj = asPrefLike(p);

  const subcriterion_id = String(obj["subcriterion_id"] ?? "");

  const levelRaw = obj["relevance_level"];
  const levelMaybe: RelevanceLevel | undefined =
    levelRaw === "muss" || levelRaw === "sollte" || levelRaw === "kann" || levelRaw === "nicht_relevant"
      ? levelRaw
      : undefined;

  const wRaw = obj["weight"];
  const weightRaw =
    typeof wRaw === "number" && Number.isFinite(wRaw)
      ? wRaw
      : levelMaybe
      ? DEFAULT_WEIGHT_BY_LEVEL[levelMaybe]
      : DEFAULT_WEIGHT_BY_LEVEL[DEFAULT_LEVEL];

  let weight = clampInt(weightRaw, 0, 10);

  let is_ko = Boolean(obj["is_ko"]);
  let ko_threshold = normalizeThreshold(obj["ko_threshold"]);

  // KO-Constraint (hart)
  if (is_ko) {
    weight = 10;
  }

  // Wenn Gewicht 0 => nicht relevant => KO aus + Threshold default
  if (weight === 0) {
    is_ko = false;
    ko_threshold = KO_THRESHOLD_DEFAULT;
  }

  // Threshold ist nur sinnvoll wenn KO aktiv
  if (!is_ko) {
    ko_threshold = KO_THRESHOLD_DEFAULT;
  }

  const relevance_level: RelevanceLevel = is_ko ? "muss" : deriveRelevanceFromWeight(weight);

  return {
    subcriterion_id,
    weight,
    relevance_level,
    is_ko,
    ko_threshold,
  };
}

/**
 * Normalisiert komplette Liste (wird zentral überall verwendet).
 */
export function normalizePreferences(prefs: Preference[]): Preference[] {
  return prefs.map((p) => normalizePreference(p)).filter((p) => !!p.subcriterion_id);
}

export function loadPreferences(): Preference[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return normalizePreferences(arr as Preference[]);
  } catch {
    return [];
  }
}

/**
 * Speichert Preferences (immer normalisiert).
 * Markiert sie NICHT automatisch als "angewendet" (Draft/Preview friendly).
 */
export function savePreferences(prefs: Preference[]) {
  const normalized = normalizePreferences(prefs);
  localStorage.setItem(LS_KEY, JSON.stringify(normalized));
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

  return normalizePreferences(Array.from(map.values()));
}

/** Vanilla = Tree vollständig, gleichgewichtet, keine KO. (Nicht persistieren.) */
export function makeVanillaPreferences(tree: Tree): Preference[] {
  return ensurePreferencesForTree(tree, []);
}

/* ---------------------------
   Mutations (single source of truth)
---------------------------- */

function updateMany(
  prefs: Preference[],
  ids: string[],
  fn: (p: Preference) => Preference
): Preference[] {
  if (!ids.length) return prefs;
  const set = new Set(ids);
  const next = prefs.map((p) => (set.has(p.subcriterion_id) ? fn(p) : p));
  return normalizePreferences(next);
}

/** Weight setzen (Quelle der Wahrheit). */
export function setWeight(prefs: Preference[], subId: string, weight: number): Preference[] {
  const next = prefs.map((p) => (p.subcriterion_id === subId ? { ...p, weight } : p));
  return normalizePreferences(next);
}

export function setWeightMany(prefs: Preference[], ids: string[], weight: number): Preference[] {
  return updateMany(prefs, ids, (p) => ({ ...p, weight }));
}

/**
 * Relevanz setzen = Convenience:
 * setzt weight auf Default-Wert der Stufe (muss/sollte/kann/0)
 * (relevance_level wird danach wieder aus weight abgeleitet)
 */
export function setRelevance(prefs: Preference[], subId: string, level: RelevanceLevel): Preference[] {
  return setWeight(prefs, subId, DEFAULT_WEIGHT_BY_LEVEL[level]);
}

export function setRelevanceMany(prefs: Preference[], ids: string[], level: RelevanceLevel): Preference[] {
  return setWeightMany(prefs, ids, DEFAULT_WEIGHT_BY_LEVEL[level]);
}

/**
 * KO toggeln (hart):
 * - KO an => weight=10, relevance="muss"
 * - KO aus => weight bleibt (aber threshold wird normalisiert zurück)
 */
export function setKO(prefs: Preference[], subId: string, is_ko: boolean): Preference[] {
  const next = prefs.map((p) => {
    if (p.subcriterion_id !== subId) return p;
    return {
      ...p,
      is_ko,
      weight: is_ko ? 10 : p.weight,
      ko_threshold: KO_THRESHOLD_DEFAULT,
    };
  });
  return normalizePreferences(next);
}

export function setKOMany(prefs: Preference[], ids: string[], is_ko: boolean): Preference[] {
  return updateMany(prefs, ids, (p) => ({
    ...p,
    is_ko,
    weight: is_ko ? 10 : p.weight,
    ko_threshold: KO_THRESHOLD_DEFAULT,
  }));
}

/**
 * Threshold setzen (wirksam nur wenn KO aktiv; sonst normalisiert zurück auf 2).
 */
export function setKOThreshold(prefs: Preference[], subId: string, t: 1 | 2): Preference[] {
  const next = prefs.map((p) => (p.subcriterion_id === subId ? { ...p, ko_threshold: t } : p));
  return normalizePreferences(next);
}

export function setKOThresholdMany(prefs: Preference[], ids: string[], t: 1 | 2): Preference[] {
  return updateMany(prefs, ids, (p) => ({ ...p, ko_threshold: t }));
}

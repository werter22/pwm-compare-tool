import type { Preference, Product, ProductEvaluation, Score, ScoreValue, Tree } from "../domain/types";

function buildScoreMap(scores: Score[]) {
  const map = new Map<string, Map<string, ScoreValue>>();
  for (const sc of scores) {
    if (!map.has(sc.product_id)) map.set(sc.product_id, new Map());
    map.get(sc.product_id)!.set(sc.subcriterion_id, sc.score);
  }
  return map;
}

function buildPrefMap(prefs: Preference[]) {
  return new Map(prefs.map(p => [p.subcriterion_id, p]));
}

function allSubcriterionIds(tree: Tree): string[] {
  const ids: string[] = [];
  for (const d of tree.domains) for (const c of d.criteria) for (const s of c.subcriteria) ids.push(s.id);
  return ids;
}

export function evaluateProducts(args: {
  products: Product[];
  tree: Tree;
  scores: Score[];
  preferences: Preference[];
}): ProductEvaluation[] {
  const { products, tree, scores, preferences } = args;

  const scoreMap = buildScoreMap(scores);
  const prefMap = buildPrefMap(preferences);
  const subIds = allSubcriterionIds(tree);

  // Max möglich für Normalisierung: Sum(weight * 2) nur für relevante Kriterien (weight>0)
  let maxPossible = 0;
  for (const subId of subIds) {
    const pref = prefMap.get(subId);
    if (!pref) continue;
    if (pref.weight > 0) maxPossible += pref.weight * 2;
  }
  if (maxPossible <= 0) maxPossible = 1; // Avoid division by zero

  const out: ProductEvaluation[] = [];

  for (const p of products) {
    let totalRaw = 0;
    const ko_violations: ProductEvaluation["ko_violations"] = [];

    const pScores = scoreMap.get(p.id) ?? new Map<string, ScoreValue>();

    for (const subId of subIds) {
      const pref = prefMap.get(subId);
      if (!pref) continue;

      // Gewicht 0 => ignorieren
      if (pref.weight <= 0 || pref.relevance_level === "nicht_relevant") continue;

      const s: ScoreValue = pScores.get(subId) ?? 0; // fehlender Score => 0 (kritisch)
      totalRaw += pref.weight * s;

      // KO als harter Filter (nur markieren, Filter in UI)
      if (pref.is_ko && s < pref.ko_threshold) {
        ko_violations.push({
          subcriterion_id: subId,
          threshold: pref.ko_threshold,
          actual_score: s
        });
      }
    }

    const totalNorm = Math.round((totalRaw / maxPossible) * 100);

    out.push({
      product_id: p.id,
      total_raw: totalRaw,
      total_norm_0_100: Math.max(0, Math.min(100, totalNorm)),
      ko_violations
    });
  }

  // Sortierung: erst KO-frei, dann nach Score absteigend (optional)
  out.sort((a, b) => {
    const aKo = a.ko_violations.length > 0 ? 1 : 0;
    const bKo = b.ko_violations.length > 0 ? 1 : 0;
    if (aKo !== bKo) return aKo - bKo;
    return b.total_norm_0_100 - a.total_norm_0_100;
  });

  return out;
}

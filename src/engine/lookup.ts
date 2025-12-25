import type { Score, ScoreValue } from "../domain/types";

export function makeScoreLookup(scores: Score[]) {
  const map = new Map<string, Map<string, Score>>();
  for (const s of scores) {
    if (!map.has(s.product_id)) map.set(s.product_id, new Map());
    map.get(s.product_id)!.set(s.subcriterion_id, s);
  }
  return map;
}

export function getScoreValueOrZero(score?: Score): ScoreValue {
  return (score?.score ?? 0) as ScoreValue;
}

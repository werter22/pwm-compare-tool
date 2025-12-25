export type ScoreValue = 0 | 1 | 2;
export type RelevanceLevel = "muss" | "sollte" | "kann" | "nicht_relevant";

export interface Product {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
}

export interface EvidenceLink {
  label: string;
  url: string;
  type?: "audit" | "dpa" | "whitepaper" | "doc" | "other";
  date?: string; // optional
}

export interface Score {
  product_id: string;
  subcriterion_id: string;
  score: ScoreValue;
  audit_comment: string; // 1–4 Saetze
  evidenz_links: EvidenceLink[];
}

export interface Subcriterion {
  id: string;
  name: string;
  short_desc?: string;
}

export interface CriterionNode {
  id: string;
  name: string;
  subcriteria: Subcriterion[];
}

export interface DomainNode {
  id: string;
  name: string;
  criteria: CriterionNode[];
}

export interface Tree {
  domains: DomainNode[];
}

export interface Preference {
  subcriterion_id: string;
  relevance_level: RelevanceLevel;
  is_ko: boolean;
  weight: number;          // numerisch
  ko_threshold: 1 | 2;     // z. B. mind. 2 (Stark) oder mind. 1
}

export interface KOViolation {
  subcriterion_id: string;
  threshold: 1 | 2;
  actual_score: ScoreValue;
}

export interface ProductEvaluation {
  product_id: string;
  total_raw: number;
  total_norm_0_100: number;
  ko_violations: KOViolation[];
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { Preference, Product, Score, Tree } from "../../domain/types";
import { getProducts, getScores, getTree } from "../../api/repo";
import { ensurePreferencesForTree, loadPreferences, savePreferences } from "../../state/preferences";
import { evaluateProducts } from "../../engine/evaluate";
import { loadCompareSelection, toggleCompareSelection } from "../../state/compare";

import Container from "../components/Container";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import AccordionSection from "../components/AccordionSection";
import ScorePill from "../components/ScorePill";

import { domainTheme } from "../styles/domainTheme";

function getShortDesc(x: any): string | undefined {
  return (x?.short_desc ?? x?.shortDesc ?? undefined) as any;
}

function formatKoViolation(k: any): string {
  if (typeof k === "string") return k;
  return String(k?.label ?? k?.name ?? k?.subcriterion_id ?? k?.subcriterionId ?? "Unbekannt");
}

/** intensive heat color (red -> green) */
function heatColor(pct01: number) {
  const p = Math.max(0, Math.min(1, avoidNaN(pct01)));
  // Hue 0 (rot) .. 120 (grün)
  const hue = 120 * p;
  // kräftig
  return `hsl(${hue} 95% 40%)`;
}
function avoidNaN(x: number) {
  return Number.isFinite(x) ? x : 0;
}

function HeatBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.round(ratio * 100);

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          height: 10,
          borderRadius: "var(--r-pill)",
          background: "rgba(0,0,0,0.14)", // dunkler als vorher
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: heatColor(ratio),
            borderRadius: "var(--r-pill)",
          }}
        />
      </div>
    </div>
  );
}

type Stat = {
  visibleCount: number;
  sum: number; // sum score (0..2)
  max: number; // 2 * visibleCount
  criticalCount: number; // score == 0
  sourcesCount: number; // total evid links count
  withSourcesCount: number; // how many subcriteria have at least 1 source
};

export default function ProductRoute() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [tree, setTree] = useState<Tree | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>(loadCompareSelection());

  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);

  useEffect(() => {
    async function load() {
      const [p, t, s] = await Promise.all([getProducts(), getTree(), getScores()]);
      setProducts(p);
      setTree(t);
      setScores(s);

      const stored = loadPreferences();
      const ensured = ensurePreferencesForTree(t, stored);
      setPrefs(ensured);
      savePreferences(ensured);
    }
    load().catch(console.error);
  }, []);

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);

  const scoreMap = useMemo(() => {
    const m = new Map<string, Score>();
    for (const sc of scores) {
      if (sc.product_id === id) m.set(sc.subcriterion_id, sc);
    }
    return m;
  }, [scores, id]);

  const prefMap = useMemo(() => new Map(prefs.map((p) => [p.subcriterion_id, p])), [prefs]);

  const evalForProduct = useMemo(() => {
    if (!tree || !product) return null;
    const evs = evaluateProducts({ products: [product], tree, scores, preferences: prefs });
    return evs[0] ?? null;
  }, [tree, product, scores, prefs]);

  const selectedForCompare = !!(id && compareIds.includes(id));

  // --- helpers: stats on a list of subcriteria ids (filter-aware)
  const calcStatForSubcriteria = (subcriteria: any[]): Stat => {
    let visibleCount = 0;
    let sum = 0;
    let max = 0;
    let criticalCount = 0;
    let sourcesCount = 0;
    let withSourcesCount = 0;

    for (const sc of subcriteria) {
      const pref = prefMap.get(sc.id);
      const rel = pref?.relevance_level ?? "kann";

      const scScore = scoreMap.get(sc.id);
      const score = ((scScore?.score ?? 0) as 0 | 1 | 2) ?? 0;

      if (onlyRelevant && rel === "nicht_relevant") continue;
      if (onlyCritical && score !== 0) continue;

      visibleCount += 1;
      sum += score;
      max += 2;
      if (score === 0) criticalCount += 1;

      const evid = (scScore as any)?.evidenz_links ?? (scScore as any)?.evidence_links ?? [];
      const evCount = Array.isArray(evid) ? evid.length : 0;
      sourcesCount += evCount;
      if (evCount > 0) withSourcesCount += 1;
    }

    return { visibleCount, sum, max, criticalCount, sourcesCount, withSourcesCount };
  };

  const domainStats = useMemo(() => {
    if (!tree) return new Map<string, Stat>();
    const m = new Map<string, Stat>();

    for (const d of (tree as any).domains) {
      const allSubs: any[] = [];
      for (const c of d.criteria) for (const sc of c.subcriteria) allSubs.push(sc);
      m.set(d.id, calcStatForSubcriteria(allSubs));
    }
    return m;
  }, [tree, prefMap, scoreMap, onlyRelevant, onlyCritical]); // depends on filter + maps


  if (!tree) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader title="Produkt" subtitle="Lade Daten…" />
        </div>
      </Container>
    );
  }

  if (!product) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader title="Produkt nicht gefunden" subtitle="Bitte zurück zum Ranking." />
          <div style={{ marginTop: "var(--s-4)" }}>
            <Link to="/ranking">Zum Ranking</Link>
          </div>
        </div>
      </Container>
    );
  }

  const totalScore = Math.round(evalForProduct?.total_norm_0_100 ?? 0);
  const koViolations: any[] = (evalForProduct?.ko_violations ?? []) as any[];

  return (
    <Container>
      <div style={{ padding: "var(--s-6) 0" }}>
        <PageHeader
          title={product.name}
          subtitle="Details nach Domäne → Kriterium → Unterkriterium. Alle Scores sind nachweisbasiert (read-only)."
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>

              <Button
                variant={selectedForCompare ? "primary" : "ghost"}
                onClick={() => {
                  if (!id) return;
                  const next = toggleCompareSelection(id);
                  setCompareIds(next);
                }}
                title="Für Vergleich auswählen (max. 3)"
              >
                {selectedForCompare ? "Für Vergleich gewählt" : "Vergleichen"}
              </Button>

                <Button variant="primary" onClick={() => nav("/ranking")}>
                Zurück
              </Button>
            </div>
          }
        />

        {/* Übersicht: sinnvoll + keine Doppel-Domänen */}
        <div style={{ marginTop: "var(--s-5)" }}>
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 260 }}>
                <h2 style={{ fontSize: 18, marginTop: 0 }}>Übersicht</h2>

                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge tone="neutral">Gesamt: {totalScore} / 100</Badge>
                  {koViolations.length > 0 ? (
                    <Badge tone="warn">KO-Verstoss: {koViolations.length}</Badge>
                  ) : (
                    <Badge tone="ok">Kein KO-Verstoss</Badge>
                  )}
                </div>

                {koViolations.length > 0 && (
                  <div style={{ marginTop: "var(--s-3)", color: "var(--text-muted)", fontSize: 13 }}>
                    {koViolations.slice(0, 2).map((k, i) => (
                      <div key={i}>• fällt durch KO: {formatKoViolation(k)}</div>
                    ))}
                    {koViolations.length > 2 ? <div>• …</div> : null}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-muted)", fontSize: 14 }}>
                  <input type="checkbox" checked={onlyRelevant} onChange={(e) => setOnlyRelevant(e.target.checked)} />
                  Nur relevante anzeigen
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-muted)", fontSize: 14 }}>
                  <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} />
                  Nur kritische (Score 0)
                </label>
              </div>
            </div>

            {/* Domain Mini-Übersicht (nur Kacheln, kein Accordion-Duplikat) */}
            <div style={{ marginTop: "var(--s-4)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {(tree as any).domains.map((d: any) => {
                const th = domainTheme(d.id);
                const st = domainStats.get(d.id) ?? { visibleCount: 0, sum: 0, max: 0, criticalCount: 0, sourcesCount: 0, withSourcesCount: 0 };

                return (
                  <div
                    key={d.id}
                    onClick={() => {
                      const el = document.getElementById(`domain-${d.id}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    style={{
                      cursor: "pointer",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md)",
                      padding: "12px 12px 10px",
                      background: th.tint,
                      position: "relative",
                      overflow: "hidden",
                    }}
                    title="Zum Abschnitt scrollen"
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 5,
                        background: th.accent,
                      }}
                    />
                    <div style={{ paddingLeft: 8 }}>
                      <div style={{ fontWeight: 900 }}>{d.name}</div>

                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Badge tone={st.criticalCount > 0 ? "warn" : "neutral"}>Kritisch: {st.criticalCount}</Badge>
                        <Badge tone="neutral">
                          {st.sum} / {st.max}
                        </Badge>
                      </div>

                      <HeatBar value={st.sum} max={st.max} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Domains (nur 1× – hier ist der Deep Dive) */}
        <div style={{ marginTop: "var(--s-5)", display: "grid", gap: 12 }}>
          {(tree as any).domains.map((d: any, dIdx: number) => {
            const th = domainTheme(d.id);
            const st = domainStats.get(d.id) ?? { visibleCount: 0, sum: 0, max: 0, criticalCount: 0, sourcesCount: 0, withSourcesCount: 0 };

            return (
              <div key={d.id} id={`domain-${d.id}`}>
                <AccordionSection
                  title={d.name}
                  subtitle={getShortDesc(d)}
                  defaultOpen={dIdx === 0}
                  right={
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <Badge tone={st.criticalCount > 0 ? "warn" : "neutral"}>Kritisch: {st.criticalCount}</Badge>
                      <Badge tone="neutral">
                        {st.sum} / {st.max}
                      </Badge>
                      <Badge tone="neutral">{d.criteria.length} Kriterien</Badge>
                    </div>
                  }
                >
                  {/* Domain “Panel” styling */}
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-md)",
                      background: th.tint,
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: th.accent }} />

                    <div style={{ padding: "12px 12px 12px 18px" }}>
                      <HeatBar value={st.sum} max={st.max} />

                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {d.criteria.map((c: any) => {
                          const cStat = calcStatForSubcriteria(c.subcriteria);
                          const subVisibleCount = cStat.visibleCount;

                          return (
                            <AccordionSection
                              key={c.id}
                              title={c.name}
                              subtitle={subVisibleCount === 0 ? "Keine Treffer mit aktuellen Filtern." : undefined}
                              defaultOpen={false}
                              right={
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  <Badge tone={cStat.criticalCount > 0 ? "warn" : "neutral"}>Kritisch: {cStat.criticalCount}</Badge>
                                  <Badge tone="neutral">
                                    {cStat.sum} / {cStat.max}
                                  </Badge>
                                  <Badge tone={subVisibleCount === 0 ? "warn" : "neutral"}>{subVisibleCount} Unterkriterien</Badge>
                                </div>
                              }
                            >
                              {/* Criterion progress */}
                              <div style={{ marginTop: 8 }}>
                                <HeatBar value={cStat.sum} max={cStat.max} />
                              </div>

                              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                                {c.subcriteria.map((sc: any) => {
                                  const scScore = scoreMap.get(sc.id);
                                  const score = ((scScore?.score ?? 0) as 0 | 1 | 2) ?? 0;

                                  const pref = prefMap.get(sc.id);
                                  const relevance = pref?.relevance_level ?? "kann";

                                  if (onlyRelevant && relevance === "nicht_relevant") return null;
                                  if (onlyCritical && score !== 0) return null;

                                  const evid = (scScore as any)?.evidenz_links ?? (scScore as any)?.evidence_links ?? [];
                                  const evidCount = Array.isArray(evid) ? evid.length : 0;
                                  const comment = (scScore as any)?.audit_comment ?? "";

                                  return (
                                    <div
                                      key={sc.id}
                                      style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: "var(--r-md)",
                                        padding: "var(--s-4)",
                                        background: "var(--surface)",
                                        position: "relative",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {/* subtle domain accent strip */}
                                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: th.accent, opacity: 0.9 }} />

                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                                        <div style={{ minWidth: 0, paddingLeft: 6 }}>
                                          <div style={{ fontWeight: 900 }}>{sc.name}</div>

                                          {getShortDesc(sc) ? (
                                            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>
                                              {getShortDesc(sc)}
                                            </div>
                                          ) : null}

                                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                            <Badge tone="neutral">{relevance}</Badge>
                                          </div>
                                        </div>

                                        <ScorePill score={score} />
                                      </div>

                                      {/* “Warum” bleibt, aber wirkt weniger noisy */}
                                      <details style={{ marginTop: "var(--s-3)" }}>
                                        <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 800 }}>
                                          Warum dieser Score?
                                        </summary>

                                        <div style={{ marginTop: "var(--s-3)", display: "grid", gap: 12 }}>
                                          <div style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.55 }}>
                                            {comment ? (
                                              comment
                                            ) : (
                                              <span style={{ color: "var(--text-muted)" }}>Kein Audit-Kommentar hinterlegt.</span>
                                            )}
                                          </div>

                                          <div>
                                            <div style={{ fontWeight: 900, fontSize: 13 }}>Evidenz</div>
                                            <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                                              {evidCount === 0 ? (
                                                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                                                  Keine Evidenz-Links hinterlegt.
                                                </div>
                                              ) : (
                                                evid.map((l: any, i: number) => (
                                                  <div key={i} style={{ fontSize: 13 }}>
                                                    {l?.url ? (
                                                      <a href={l.url} target="_blank" rel="noreferrer">
                                                        {l.label || "Quelle"}
                                                      </a>
                                                    ) : (
                                                      <span style={{ color: "var(--text-muted)" }}>{l?.label || "Quelle"}</span>
                                                    )}
                                                  </div>
                                                ))
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </details>
                                    </div>
                                  );
                                })}
                              </div>
                            </AccordionSection>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </AccordionSection>
              </div>
            );
          })}
        </div>
      </div>
    </Container>
  );
}

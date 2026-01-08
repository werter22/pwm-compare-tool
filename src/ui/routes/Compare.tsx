import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Preference, Product, Score, Tree } from "../../domain/types";
import { getProducts, getScores, getTree } from "../../api/repo";
import { ensurePreferencesForTree, loadPreferences, savePreferences } from "../../state/preferences";
import { loadCompareSelection, toggleCompareSelection } from "../../state/compare";

import Container from "../components/Container";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import ScorePill from "../components/ScorePill";
import { domainTheme } from "../styles/domainTheme";

function getShortDesc(x: any): string | undefined {
  return (x?.short_desc ?? x?.shortDesc ?? undefined) as any;
}

function isDifferent(values: Array<0 | 1 | 2>) {
  if (values.length <= 1) return false;
  return values.some((v) => v !== values[0]);
}

/** Kleine, ruhige Progressbar (für Kriterien-Übersicht) */
function MiniProgress({
  valuePct,
  label,
  afterLabel,
}: {
  valuePct: number;
  label?: string;
  afterLabel?: any; // bewusst minimal, ohne extra React-Typen
}) {
  const v = Math.max(0, Math.min(100, valuePct));
  const hue = (v / 100) * 120;
  const fill = `hsl(${hue} 70% 42%)`;

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
      <div
        style={{
          width: "100%",
          height: 10,
          background: "var(--muted-2, rgba(0,0,0,0.10))",
          borderRadius: "var(--r-pill)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${v}%`,
            height: "100%",
            background: fill,
            borderRadius: "var(--r-pill)",
            transition: "width 180ms ease, background-color 180ms ease",
          }}
        />
      </div>

      {(label || afterLabel) ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {label ? (
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)" }}>
              {label}
            </div>
          ) : null}
          {afterLabel}
        </div>
      ) : null}
    </div>
  );
}


type CriterionProgress = { pct: number; sum: number; max: number };

export default function Compare() {
  const nav = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [tree, setTree] = useState<Tree | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);

  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [compact, setCompact] = useState(true); // default Kompakt = true
  const [compareIds, setCompareIds] = useState<string[]>(loadCompareSelection());

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

  const compareProducts = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    return compareIds.map((id) => map.get(id)).filter(Boolean) as Product[];
  }, [compareIds, products]);

  const scoreByProductAndSub = useMemo(() => {
    const m = new Map<string, Map<string, Score>>();
    for (const pid of compareIds) m.set(pid, new Map());

    for (const s of scores) {
      if (!compareIds.includes(s.product_id)) continue;
      if (!m.has(s.product_id)) m.set(s.product_id, new Map());
      m.get(s.product_id)!.set(s.subcriterion_id, s);
    }
    return m;
  }, [scores, compareIds]);

  const prefMap = useMemo(() => new Map(prefs.map((p) => [p.subcriterion_id, p])), [prefs]);

  // --- KO-VERSTÖSSE: pro Produkt ein Set von Subcriterion-IDs, die KO verletzen (score < threshold)
  const koViolationByProduct = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of compareProducts) m.set(p.id, new Set<string>());

    for (const pref of prefs) {
      if (!pref?.is_ko) continue;
      const subId = pref.subcriterion_id;
      const thr = ((pref.ko_threshold ?? 2) as 1 | 2) ?? 2;

      for (const p of compareProducts) {
        const scScore = scoreByProductAndSub.get(p.id)?.get(subId);
        const score = ((scScore?.score ?? 0) as 0 | 1 | 2) ?? 0;
        if (score < thr) m.get(p.id)?.add(subId);
      }
    }

    return m;
  }, [prefs, compareProducts, scoreByProductAndSub]);

  const isKoViolation = (productId: string, subId: string) => koViolationByProduct.get(productId)?.has(subId) ?? false;

  // Styles (dezent, wie Product-Detail)
  const KO_VIOLATION_BORDER = "2px solid rgba(220, 38, 38, 0.30)";
  const KO_VIOLATION_BG = "rgba(220, 38, 38, 0.04)";
  const KO_VIOLATION_STRIP = "var(--crit-border)";

  const cols = compareProducts.length;

  if (!tree) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader title="Vergleich" subtitle="Lade Daten…" />
        </div>
      </Container>
    );
  }

  if (cols < 2) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader
            title="Vergleich"
            subtitle="Wähle mindestens zwei Produkte im Ranking aus, um sie hier nebeneinander zu vergleichen."
            right={
              <Button variant="secondary" onClick={() => nav("/ranking")}>
                Zum Ranking
              </Button>
            }
          />
          <div style={{ marginTop: "var(--s-5)" }}>
            <Card>
              <p style={{ color: "var(--text-muted)" }}>
                Tipp: Im Ranking auf <strong>Vergleichen</strong> klicken. Danach erscheint „Vergleich öffnen“.
              </p>
            </Card>
          </div>
        </div>
      </Container>
    );
  }

  const gridTemplate = `minmax(280px, 1.25fr) repeat(${cols}, minmax(260px, 1fr))`;

  // Kriterium-Progress pro Produkt
  function criterionProgress(c: any, productId: string): CriterionProgress {
    const subs = c.subcriteria ?? [];
    const n = subs.length;
    const max = 2 * n;
    const sum = subs.reduce((acc: number, sc: any) => {
      const s = scoreByProductAndSub.get(productId)?.get(sc.id)?.score ?? 0;
      return acc + (s as number);
    }, 0);
    const pct = max > 0 ? (sum / max) * 100 : 0;
    return { pct, sum, max };
  }

  // ob ein Kriterium (bei onlyDiffs) überhaupt relevant sichtbar bleibt
  function criterionHasAnyDiff(c: any): boolean {
    const subs = c.subcriteria ?? [];
    for (const sc of subs) {
      const values = compareProducts.map((p) => {
        const s = scoreByProductAndSub.get(p.id)?.get(sc.id)?.score ?? 0;
        return s as 0 | 1 | 2;
      });
      if (isDifferent(values)) return true;
    }
    return false;
  }

  function criterionHasKoViolation(c: any, productId: string) {
    const subs = c.subcriteria ?? [];
    for (const sc of subs) {
      const pref = prefMap.get(sc.id);
      if (!pref?.is_ko) continue;

      const thr = ((pref.ko_threshold ?? 2) as 1 | 2);
      const score = (scoreByProductAndSub.get(productId)?.get(sc.id)?.score ?? 0) as 0 | 1 | 2;

      if (score < thr) return true;
    }
    return false;
  }

  return (
    <Container>
      <div style={{ padding: "var(--s-6) 0" }}>
        <PageHeader
          title="Vergleich"
          subtitle="Unterkriterien nebeneinander. „Nur Unterschiede“ hilft, schnell die relevanten Differenzen zu sehen."
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="danger"
                onClick={() => {
                  compareProducts.forEach((p) => toggleCompareSelection(p.id));
                  setCompareIds([]);
                }}
              >
                Auswahl leeren
              </Button>
              <Button variant="primary" onClick={() => nav("/ranking")}>
                Zurück
              </Button>
            </div>
          }
        />

        {/* Table */}
        <div style={{ marginTop: "var(--s-5)" }}>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
              boxShadow: "var(--shadow-sm)",
              background: "var(--surface)",
            }}
          >
            {/* Sticky Header */}
            <div
              style={{
                position: "sticky",
                zIndex: 10,
                background: "rgba(255, 255, 255, 0.79)",
                backdropFilter: "blur(8px)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: gridTemplate }}>
                {/* Left header cell with controls */}
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ marginTop: 2, display: "grid", gap: 6 }}>
                    <label
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        color: "var(--text-muted)",
                        fontSize: 13,
                      }}
                    >
                      <input type="checkbox" checked={onlyDiffs} onChange={(e) => setOnlyDiffs(e.target.checked)} />
                      Nur Unterschiede
                    </label>

                    <label
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        color: "var(--text-muted)",
                        fontSize: 13,
                      }}
                    >
                      <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                      Kompakt
                    </label>
                  </div>
                </div>

                {/* Product header cells */}
                {compareProducts.map((p) => (
                  <div key={p.id} style={{ padding: "12px 14px" }}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        alignItems: "center",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{p.name}</div>

                      <button
                        onClick={() => {
                          const next = toggleCompareSelection(p.id);
                          setCompareIds(next);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer",
                          color: "var(--accent)",
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                        title="Aus Vergleich entfernen"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div style={{ display: "grid", gap: 0 }}>
              {tree.domains.map((d: any) => {
                const theme = domainTheme(d.id);

                return (
                  <div key={d.id}>
                    {/* Domain row */}
                    <div
                      style={{
                        padding: "10px 14px",
                        background: theme.tint,
                        borderTop: "1px solid var(--border)",
                        fontWeight: 900,
                        borderLeft: `6px solid ${theme.accent}`,
                      }}
                    >
                      {d.name}
                      {getShortDesc(d) ? (
                        <span style={{ marginLeft: 8, color: "var(--text-muted)", fontWeight: 700, fontSize: 12 }}>
                          {getShortDesc(d)}
                        </span>
                      ) : null}
                    </div>

                    {d.criteria.map((c: any) => {
                      if (onlyDiffs && !criterionHasAnyDiff(c)) return null;

                      return (
                        <details
                          key={c.id}
                          style={{
                            borderTop: "1px solid var(--border)",
                            background: "white",
                          }}
                        >
                          <summary
                            style={{
                              listStyle: "none",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: gridTemplate,
                                alignItems: "center",
                                background: "rgba(246,247,249,0.55)",
                                borderLeft: `4px solid ${theme.accent}`,
                              }}
                            >
                              <div style={{ padding: "12px 14px" }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 900 }}>▸</span>
                                  <div style={{ fontWeight: 900 }}>{c.name}</div>
                                </div>
                                {!compact && getShortDesc(c) ? (
                                  <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12 }}>
                                    {getShortDesc(c)}
                                  </div>
                                ) : null}
                              </div>

                              {compareProducts.map((p) => {
                                const pr = criterionProgress(c, p.id);
                                const hasKoV = criterionHasKoViolation(c, p.id);

                                return (
                                  <div key={p.id} style={{ padding: "12px 14px" }}>
                                    <MiniProgress
                                      valuePct={pr.pct}
                                      label={`${pr.sum}/${pr.max}`}
                                      afterLabel={hasKoV ? <Badge tone="crit">KO-Verstoss</Badge> : null}
                                    />
                                  </div>
                                );
                              })}

                            </div>
                          </summary>

                          {/* Subcriteria rows */}
                          <div>
                            {c.subcriteria.map((sc: any, idx: number) => {
                              const values = compareProducts.map((p) => {
                                const s = scoreByProductAndSub.get(p.id)?.get(sc.id)?.score ?? 0;
                                return s as 0 | 1 | 2;
                              });

                              if (onlyDiffs && !isDifferent(values)) return null;

                              const pref = prefMap.get(sc.id);
                              const relevance = (pref?.relevance_level ?? "kann").replace("_", " ");
                              const isKO = !!pref?.is_ko;
                              const koTh = (pref?.ko_threshold ?? 2) as 1 | 2;

                              const zebra = idx % 2 === 0 ? "white" : "rgba(246,247,249,0.55)";

                              return (
                                <div
                                  key={sc.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: gridTemplate,
                                    borderTop: "1px solid var(--border)",
                                    background: zebra,
                                  }}
                                >
                                  {/* Left cell */}
                                  <div style={{ padding: "12px 14px" }}>
                                    <div style={{ fontWeight: 800, fontSize: 13 }}>{sc.name}</div>

                                    {!compact && getShortDesc(sc) ? (
                                      <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.35 }}>
                                        {getShortDesc(sc)}
                                      </div>
                                    ) : null}

                                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <Badge tone="neutral">{relevance}</Badge>
                                      {isKO ? <Badge tone="warn">KO ≥ {koTh}</Badge> : null}
                                      {!compact && typeof pref?.weight === "number" ? (
                                        <Badge tone="neutral">Gewicht: {pref.weight}</Badge>
                                      ) : null}
                                    </div>
                                  </div>

                                  {/* Product cells */}
                                  {compareProducts.map((p) => {
                                    const scScore: any = scoreByProductAndSub.get(p.id)?.get(sc.id);
                                    const score = (scScore?.score ?? 0) as 0 | 1 | 2;

                                    const comment = (scScore?.audit_comment ?? "") as string;
                                    const evid = scScore?.evidenz_links ?? scScore?.evidence_links ?? [];

                                    const violated = isKoViolation(p.id, sc.id);

                                    return (
                                      <div key={p.id} style={{ padding: "12px 14px" }}>
                                        {/* KO-Verstoss: dezente Hervorhebung NUR wenn wirklich verletzt */}
                                        <div
                                          style={{
                                            position: "relative",
                                            borderRadius: "var(--r-md)",
                                            padding: compact ? "10px 10px" : "10px 10px",
                                            border: violated ? KO_VIOLATION_BORDER : "1px solid transparent",
                                            background: violated ? KO_VIOLATION_BG : "transparent",
                                            overflow: "hidden",
                                          }}
                                        >
                                          {violated ? (
                                            <div
                                              style={{
                                                position: "absolute",
                                                left: 0,
                                                top: 0,
                                                bottom: 0,
                                                width: 4,
                                                background: KO_VIOLATION_STRIP,
                                                opacity: 0.95,
                                              }}
                                            />
                                          ) : null}

                                          <div style={{ display: "flex", justifyContent: "center" }}>
                                            <ScorePill score={score} />
                                          </div>

                                          {/* nur im Verstoss-Fall eine klare, kleine Markierung (keine Doppel-"KO") */}
                                          {violated ? (
                                            <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
                                              <Badge tone="crit">KO-Verstoss</Badge>
                                            </div>
                                          ) : null}

                                          {!compact && (
                                            <div
                                              style={{
                                                marginTop: 10,
                                                color: "var(--text)",
                                                fontSize: 13,
                                                lineHeight: 1.45,
                                              }}
                                            >
                                              {comment ? (
                                                <details>
                                                  <summary
                                                    style={{
                                                      cursor: "pointer",
                                                      color: "var(--text)",
                                                      fontWeight: 700,
                                                      fontSize: 13,
                                                    }}
                                                  >
                                                    <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 12 }}>
                                                      Mehr anzeigen
                                                    </span>
                                                  </summary>
                                                  <div style={{ marginTop: 8 }}>{comment}</div>
                                                </details>
                                              ) : (
                                                <span style={{ color: "var(--text-muted)" }}>Kein Audit-Kommentar.</span>
                                              )}
                                            </div>
                                          )}

                                          {!compact && evid?.length > 0 && (
                                            <details style={{ marginTop: 10 }}>
                                              <summary
                                                style={{
                                                  cursor: "pointer",
                                                  color: "var(--accent)",
                                                  fontWeight: 800,
                                                  fontSize: 12,
                                                }}
                                              >
                                                Quellen ({evid.length})
                                              </summary>
                                              <div style={{ marginTop: 8, display: "grid", gap: 6, fontSize: 12 }}>
                                                {evid.slice(0, 6).map((l: any, i: number) => (
                                                  <div key={i}>
                                                    {l?.url ? (
                                                      <a href={l.url} target="_blank" rel="noreferrer">
                                                        {l.label || "Quelle"}
                                                      </a>
                                                    ) : (
                                                      <span style={{ color: "var(--text-muted)" }}>{l?.label || "Quelle"}</span>
                                                    )}
                                                  </div>
                                                ))}
                                                {evid.length > 6 ? <div style={{ color: "var(--text-muted)" }}>…</div> : null}
                                              </div>
                                            </details>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: "var(--s-4)" }}>
            <Card>
              <p style={{ color: "var(--text-muted)", margin: 0 }}>
                Tipp: „Kompakt“ zeigt primär Scores & Relevanz. Für Kommentare/Quellen und Gewichte einfach Kompakt deaktivieren.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </Container>
  );
}

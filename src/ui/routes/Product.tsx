import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Product, Score, Tree, Preference, RelevanceLevel } from "../../domain/types";
import { getProducts, getScores, getTree } from "../../api/repo";
import { makeScoreLookup, getScoreValueOrZero } from "../../engine/lookup";
import {
  ensurePreferencesForTree,
  loadPreferences,
  savePreferences,
  setKO,
  setKOThreshold,
  setRelevance,
  setWeight
} from "../../state/preferences";
import ScorePill from "../components/ScorePill";
import EvidenceLinks from "../components/EvidenceLinks";

function clampWeight(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(10, x));
}

export default function ProductPage() {
  const { id } = useParams();
  const productId = id ?? "";

  const [products, setProducts] = useState<Product[]>([]);
  const [tree, setTree] = useState<Tree | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);

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

  const product = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  const prefMap = useMemo(() => new Map(prefs.map(p => [p.subcriterion_id, p])), [prefs]);
  const scoreLookup = useMemo(() => makeScoreLookup(scores), [scores]);
  const scoreMapForProduct = useMemo(
    () => scoreLookup.get(productId) ?? new Map(),
    [scoreLookup, productId]
  );

  function updatePrefs(next: Preference[]) {
    setPrefs(next);
    savePreferences(next);
  }

  if (!tree) {
    return (
      <main style={{ padding: 24 }}>
        <p>Lade Daten…</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main style={{ padding: 24 }}>
        <p>Produkt nicht gefunden.</p>
        <p><Link to="/ranking">Zurück zum Ranking</Link></p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>{product.name}</h1>
          {product.description && <p style={{ marginTop: 8, color: "#555" }}>{product.description}</p>}
        </div>
        <Link to="/ranking">← Ranking</Link>
      </header>

      <p style={{ color: "#666", marginTop: 8 }}>
        Scores sind nachweisbasiert (read-only). Du kannst Relevanz, Gewicht und KO steuern.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {tree.domains.map((d) => (
          <section key={d.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>{d.name}</h2>

            {d.criteria.map((c) => (
              <div key={c.id} style={{ marginTop: 12 }}>
                <h3 style={{ margin: "12px 0 8px", fontSize: 16 }}>{c.name}</h3>

                <div style={{ display: "grid", gap: 10 }}>
                  {c.subcriteria.map((s) => {
                    const scoreObj = scoreMapForProduct.get(s.id);
                    const scoreVal = getScoreValueOrZero(scoreObj);
                    const pref = prefMap.get(s.id);

                    // Falls Pref fehlt (sollte nicht passieren), defensiv:
                    const relevance: RelevanceLevel = pref?.relevance_level ?? "sollte";
                    const isNA = relevance === "nicht_relevant";

                    return (
                      <div
                        key={s.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 340px",
                          gap: 12,
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #eee",
                          background: isNA ? "#fafafa" : "white",
                          opacity: isNA ? 0.7 : 1
                        }}
                      >
                        {/* Left: read-only evidence */}
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <strong>{s.name}</strong>
                            <ScorePill score={scoreVal} />
                          </div>

                          {s.short_desc && <p style={{ margin: "6px 0 0", color: "#555" }}>{s.short_desc}</p>}

                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer" }}>Warum dieser Score?</summary>
                            <div style={{ marginTop: 8 }}>
                              <p style={{ marginTop: 0 }}>{scoreObj?.audit_comment ?? "Kein Kommentar vorhanden."}</p>
                              <EvidenceLinks links={scoreObj?.evidenz_links ?? []} />
                            </div>
                          </details>
                        </div>

                        {/* Right: expert-lite controls */}
                        <div style={{ borderLeft: "1px solid #eee", paddingLeft: 12 }}>
                          <label style={{ display: "block", fontSize: 12, color: "#666" }}>Relevanz</label>
                          <select
                            value={relevance}
                            onChange={(e) => updatePrefs(setRelevance(prefs, s.id, e.target.value as RelevanceLevel))}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
                          >
                            <option value="muss">Muss</option>
                            <option value="sollte">Sollte</option>
                            <option value="kann">Kann</option>
                            <option value="nicht_relevant">Nicht relevant / nicht anwendbar</option>
                          </select>

                          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={pref?.is_ko ?? false}
                                disabled={isNA}
                                onChange={(e) => updatePrefs(setKO(prefs, s.id, e.target.checked))}
                              />
                              KO-Kriterium
                            </label>

                            <select
                              value={pref?.ko_threshold ?? 2}
                              disabled={isNA || !(pref?.is_ko ?? false)}
                              onChange={(e) => updatePrefs(setKOThreshold(prefs, s.id, Number(e.target.value) as 1 | 2))}
                              style={{ padding: 6, borderRadius: 8, border: "1px solid #ddd" }}
                              title="Mindest-Score für KO"
                            >
                              <option value={2}>Mindest-Score: 2</option>
                              <option value={1}>Mindest-Score: 1</option>
                            </select>
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <label style={{ display: "block", fontSize: 12, color: "#666" }}>
                              Gewicht (0–10)
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={10}
                              step={1}
                              value={pref?.weight ?? 0}
                              disabled={isNA}
                              onChange={(e) => updatePrefs(setWeight(prefs, s.id, clampWeight(Number(e.target.value))))}
                              style={{ width: "100%" }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
                              <span>0</span>
                              <span><strong>{pref?.weight ?? 0}</strong></span>
                              <span>10</span>
                            </div>
                          </div>

                          {(pref?.is_ko ?? false) && !isNA && scoreVal < (pref?.ko_threshold ?? 2) && (
                            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#ffe5e5", fontSize: 12 }}>
                              Dieses Produkt faellt bei diesem KO-Kriterium durch (Score {scoreVal} &lt; {pref?.ko_threshold}).
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

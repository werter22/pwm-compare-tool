import { useEffect, useMemo, useState } from "react";
import type { Product, Score, Tree, Preference } from "../../domain/types";
import { getProducts, getScores, getTree } from "../../api/repo";
import { evaluateProducts } from "../../engine/evaluate";
import { ensurePreferencesForTree, loadPreferences, savePreferences } from "../../state/preferences";
import { loadCompareSelection, toggleCompareSelection } from "../../state/compare";
import { Link } from "react-router-dom";

export default function Ranking() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tree, setTree] = useState<Tree | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [onlyNoKO, setOnlyNoKO] = useState(false);

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

  const evals = useMemo(() => {
    if (!tree) return [];
    return evaluateProducts({ products, tree, scores, preferences: prefs });
  }, [products, tree, scores, prefs]);

  const evalMap = useMemo(() => new Map(evals.map((e) => [e.product_id, e])), [evals]);

  const visible = useMemo(() => {
    if (!onlyNoKO) return products;
    return products.filter((p) => (evalMap.get(p.id)?.ko_violations.length ?? 0) === 0);
  }, [products, onlyNoKO, evalMap]);

  const compareLink = useMemo(() => {
    // Compare Route nimmt ?p=p1,p2 (max 3)
    return `/compare?p=${compareIds.join(",")}`;
  }, [compareIds]);

  if (!tree) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Ranking</h1>
        <p>Lade Daten…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap"
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Ranking</h1>
          <p style={{ marginTop: 8, color: "#555" }}>
            Prototyp: Scores sind nachweisbasiert (read-only). Du steuerst Relevanz/Gewicht/KO.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {compareIds.length >= 2 && (
            <Link to={compareLink} style={{ fontWeight: 600 }}>
              Vergleich öffnen ({compareIds.length})
            </Link>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={onlyNoKO}
              onChange={(e) => setOnlyNoKO(e.target.checked)}
            />
            Nur ohne KO-Verstoss
          </label>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
          marginTop: 16
        }}
      >
        {visible.map((p) => {
          const ev = evalMap.get(p.id);
          const score = ev?.total_norm_0_100 ?? 0;
          const koCount = ev?.ko_violations.length ?? 0;

          const inCompare = compareIds.includes(p.id);
          const compareAtLimit = !inCompare && compareIds.length >= 3;

          return (
            <article
              key={p.id}
              style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>{p.name}</h2>
              {p.description && <p style={{ marginTop: 6, color: "#555" }}>{p.description}</p>}

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <strong>{score} / 100</strong>
                {koCount > 0 ? (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#ffe5e5"
                    }}
                  >
                    KO: {koCount}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#e7f7ea"
                    }}
                  >
                    OK
                  </span>
                )}
              </div>

              <div style={{ marginTop: 10, height: 8, background: "#eee", borderRadius: 999 }}>
                <div
                  style={{
                    width: `${score}%`,
                    height: "100%",
                    background: "#333",
                    borderRadius: 999
                  }}
                />
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Link to={`/product/${p.id}`}>Details öffnen</Link>

                <button
                  onClick={() => setCompareIds(toggleCompareSelection(p.id))}
                  disabled={compareAtLimit}
                  title={compareAtLimit ? "Maximal 3 Produkte im Vergleich" : ""}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: inCompare ? "#333" : "white",
                    color: inCompare ? "white" : "black",
                    cursor: compareAtLimit ? "not-allowed" : "pointer",
                    opacity: compareAtLimit ? 0.6 : 1
                  }}
                >
                  {inCompare ? "Im Vergleich" : "Vergleichen"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <section style={{ marginTop: 24, padding: 12, border: "1px dashed #ccc", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Nächster Schritt</h3>
        <p style={{ marginBottom: 0 }}>
          Als nächstes bauen wir den Vergleich auf Unterkriterien-Ebene (nur Unterschiede / nur Muss/KO) und danach den Wizard.
        </p>
      </section>
    </main>
  );
}

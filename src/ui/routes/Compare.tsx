import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Product, Preference, Score, Tree, ScoreValue } from "../../domain/types";
import { getProducts, getScores, getTree } from "../../api/repo";
import { ensurePreferencesForTree, loadPreferences, savePreferences } from "../../state/preferences";
import { loadCompareSelection } from "../../state/compare";
import { makeScoreLookup, getScoreValueOrZero } from "../../engine/lookup";
import ScorePill from "../components/ScorePill";
import EvidenceLinks from "../components/EvidenceLinks";

function useQueryParam(name: string) {
  const loc = useLocation();
  return useMemo(() => new URLSearchParams(loc.search).get(name), [loc.search, name]);
}

function prefMapFrom(prefs: Preference[]) {
  return new Map(prefs.map((p) => [p.subcriterion_id, p]));
}

function isKOViolation(pref: Preference | undefined, scoreVal: ScoreValue) {
  if (!pref) return false;
  if (pref.relevance_level === "nicht_relevant") return false;
  if (!pref.is_ko) return false;
  return scoreVal < pref.ko_threshold;
}

export default function Compare() {
  const pParam = useQueryParam("p") ?? "";

  // 1) IDs aus URL, 2) fallback localStorage, 3) max 3
  const selectedIds = useMemo(() => {
    const fromUrl = pParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const base = fromUrl.length > 0 ? fromUrl : loadCompareSelection();
    return base.slice(0, 3);
  }, [pParam]);

  const [products, setProducts] = useState<Product[]>([]);
  const [tree, setTree] = useState<Tree | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [onlyDiffs, setOnlyDiffs] = useState(true);
  const [onlyMustOrKO, setOnlyMustOrKO] = useState(false);

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

  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.includes(p.id));
  }, [products, selectedIds]);

  const scoreLookup = useMemo(() => makeScoreLookup(scores), [scores]);
  const prefMap = useMemo(() => prefMapFrom(prefs), [prefs]);

  // Rows: flach für Tabelle, aber mit Domain/Kriterium-Labels
  const rows = useMemo(() => {
    if (!tree) return [];

    const out: Array<{
      domainName: string;
      criterionName: string;
      subId: string;
      subName: string;
      shortDesc?: string;
      pref?: Preference;
      // pro Produkt eine Zelle
      cells: Array<{
        productId: string;
        scoreVal: ScoreValue;
        scoreObj?: Score;
        isKoFail: boolean;
      }>;
      isDifferent: boolean;
    }> = [];

    for (const d of tree.domains) {
      for (const c of d.criteria) {
        for (const s of c.subcriteria) {
          const pref = prefMap.get(s.id);

          // optional: NA komplett ausblenden im Compare
          if (pref?.relevance_level === "nicht_relevant") continue;

          const cells = selectedProducts.map((p) => {
            const scoreObj = scoreLookup.get(p.id)?.get(s.id);
            const scoreVal = getScoreValueOrZero(scoreObj);
            return {
              productId: p.id,
              scoreVal,
              scoreObj,
              isKoFail: isKOViolation(pref, scoreVal)
            };
          });

          const first = cells[0]?.scoreVal ?? 0;
          const isDifferent = cells.some((x) => x.scoreVal !== first);

          out.push({
            domainName: d.name,
            criterionName: c.name,
            subId: s.id,
            subName: s.name,
            shortDesc: s.short_desc,
            pref,
            cells,
            isDifferent
          });
        }
      }
    }
    return out;
  }, [tree, selectedProducts, scoreLookup, prefMap]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (onlyDiffs && !r.isDifferent) return false;

      if (onlyMustOrKO) {
        const rel = r.pref?.relevance_level;
        const isKo = r.pref?.is_ko ?? false;
        if (!(rel === "muss" || isKo)) return false;
      }

      return true;
    });
  }, [rows, onlyDiffs, onlyMustOrKO]);

  if (!tree) {
    return (
      <main style={{ padding: 24 }}>
        <p>Lade Daten…</p>
      </main>
    );
  }

  if (selectedProducts.length < 2) {
    return (
      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <h1>Vergleich</h1>
        <p>Bitte wähle mindestens 2 Produkte aus (im Ranking „Vergleichen“ klicken).</p>
        <p style={{ marginTop: 8 }}>
          Beispiel: <code>/#/compare?p=p1,p2</code>
        </p>
        <p>
          <Link to="/ranking">← Ranking</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Vergleich</h1>
          <p style={{ marginTop: 8, color: "#555" }}>
            Standard: nur Unterschiede. KO-Verstoss wird pro Zelle markiert.
          </p>
        </div>
        <Link to="/ranking">← Ranking</Link>
      </header>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={onlyDiffs} onChange={(e) => setOnlyDiffs(e.target.checked)} />
          Nur Unterschiede
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={onlyMustOrKO} onChange={(e) => setOnlyMustOrKO(e.target.checked)} />
          Nur Muss/KO
        </label>
      </div>

      <div style={{ marginTop: 16, overflowX: "auto", border: "1px solid #ddd", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #ddd", width: 420 }}>
                Unterkriterium
              </th>

              {selectedProducts.map((p) => (
                <th key={p.id} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #ddd" }}>
                  {p.name}
                  <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
                    <Link to={`/product/${p.id}`}>Details</Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => (
              <tr key={r.subId}>
                <td style={{ verticalAlign: "top", padding: 12, borderBottom: "1px solid #eee" }}>
                  <div style={{ fontSize: 12, color: "#777" }}>
                    {r.domainName} → {r.criterionName}
                  </div>

                  <div style={{ fontWeight: 700 }}>{r.subName}</div>

                  {r.shortDesc && (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>
                      {r.shortDesc}
                    </div>
                  )}

                  {(r.pref?.is_ko ?? false) && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        padding: "3px 8px",
                        display: "inline-block",
                        borderRadius: 999,
                        background: "#ffe5e5"
                      }}
                      title="KO-Kriterium: Produkt muss Mindest-Score erreichen"
                    >
                      KO (min {r.pref?.ko_threshold ?? 2})
                    </div>
                  )}

                  {r.pref?.relevance_level === "muss" && (
                    <div
                      style={{
                        marginTop: 6,
                        marginLeft: 6,
                        fontSize: 12,
                        padding: "3px 8px",
                        display: "inline-block",
                        borderRadius: 999,
                        background: "#e8f0ff"
                      }}
                      title="Relevanz: Muss"
                    >
                      Muss
                    </div>
                  )}
                </td>

                {r.cells.map((cell) => (
                  <td
                    key={cell.productId}
                    style={{
                      verticalAlign: "top",
                      padding: 12,
                      borderBottom: "1px solid #eee",
                      background: cell.isKoFail ? "#fff1f1" : "transparent"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <ScorePill score={cell.scoreVal} />
                      {cell.isKoFail && (
                        <span
                          style={{
                            fontSize: 12,
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "#ffe5e5"
                          }}
                          title="KO-Verstoss"
                        >
                          KO
                        </span>
                      )}
                    </div>

                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer" }}>Evidenz</summary>
                      <div style={{ marginTop: 8 }}>
                        <p style={{ marginTop: 0 }}>
                          {cell.scoreObj?.audit_comment ?? "Kein Kommentar vorhanden."}
                        </p>
                        <EvidenceLinks links={cell.scoreObj?.evidenz_links ?? []} />
                      </div>
                    </details>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, color: "#777", fontSize: 12 }}>
        Tipp: Setze KO-Kriterien und Relevanz im Produktdetail (Expert-lite). Der Vergleich respektiert diese Einstellungen.
      </p>
    </main>
  );
}

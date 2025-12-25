import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Preference, Product, Score, Tree, RelevanceLevel } from "../../domain/types";
import { getProducts, getScores, getTree } from "../../api/repo";
import { ensurePreferencesForTree, loadPreferences, savePreferences } from "../../state/preferences";
import { evaluateProducts } from "../../engine/evaluate";
import { RAILS, subIdsForRail } from "../../lite/rails";
import {
  applyDomainMultiplierChange,
  loadDomainMultipliers,
  saveDomainMultipliers,
  type DomainMultipliers
} from "../../lite/domainWeights";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function applyToMany(
  prefs: Preference[],
  ids: string[],
  updater: (p: Preference) => Preference
): Preference[] {
  const idSet = new Set(ids);
  return prefs.map((p) => (idSet.has(p.subcriterion_id) ? updater(p) : p));
}

function setRailRelevance(prefs: Preference[], ids: string[], level: RelevanceLevel): Preference[] {
  const defaultWeight: Record<RelevanceLevel, number> = {
    muss: 8,
    sollte: 5,
    kann: 2,
    nicht_relevant: 0
  };

  return applyToMany(prefs, ids, (p) => {
    const w = defaultWeight[level];
    return {
      ...p,
      relevance_level: level,
      weight: w,
      is_ko: level === "nicht_relevant" ? false : p.is_ko
    };
  });
}

function setRailKO(prefs: Preference[], ids: string[], isKo: boolean): Preference[] {
  return applyToMany(prefs, ids, (p) => {
    if (p.relevance_level === "nicht_relevant") return { ...p, is_ko: false };
    return {
      ...p,
      is_ko: isKo,
      ko_threshold: isKo ? 2 : p.ko_threshold
    };
  });
}

function setRailWeight(prefs: Preference[], ids: string[], weight: number): Preference[] {
  const w = clamp(weight, 0, 10);
  return applyToMany(prefs, ids, (p) => {
    if (p.relevance_level === "nicht_relevant") return p;
    return { ...p, weight: w };
  });
}

export default function Lite() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [advanced, setAdvanced] = useState(false);

  const [mult, setMult] = useState<DomainMultipliers>(loadDomainMultipliers());

  useEffect(() => {
    async function load() {
      const [t, p, s] = await Promise.all([getTree(), getProducts(), getScores()]);
      setTree(t);
      setProducts(p);
      setScores(s);

      const stored = loadPreferences();
      const ensured = ensurePreferencesForTree(t, stored);
      setPrefs(ensured);
      savePreferences(ensured);
    }
    load().catch(console.error);
  }, []);

  const prefMap = useMemo(() => new Map(prefs.map((p) => [p.subcriterion_id, p])), [prefs]);

  const railsResolved = useMemo(() => {
    if (!tree) return [];
    return RAILS.map((r) => {
      const ids = subIdsForRail(tree, r);
      return { rail: r, ids };
    }).filter((x) => x.ids.length > 0);
  }, [tree]);

  const evals = useMemo(() => {
    if (!tree) return [];
    return evaluateProducts({ products, tree, scores, preferences: prefs });
  }, [products, tree, scores, prefs]);

  const remainingIfFilterKO = useMemo(() => {
    // Anzahl Produkte ohne KO-Verstoss
    return evals.filter((e) => e.ko_violations.length === 0).length;
  }, [evals]);

  function persist(nextPrefs: Preference[]) {
    setPrefs(nextPrefs);
    savePreferences(nextPrefs);
  }

  function onChangeDomain(domainId: "d1" | "d2" | "d3", percent: number) {
    if (!tree) return;

    const nextMult: DomainMultipliers = {
      ...mult,
      [domainId]: clamp(percent / 100, 0.5, 1.5)
    };

    const nextPrefs = applyDomainMultiplierChange({
      tree,
      preferences: prefs,
      prev: mult,
      next: nextMult
    });

    setMult(nextMult);
    saveDomainMultipliers(nextMult);
    persist(nextPrefs);
  }

  if (!tree) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Lite-Einstellungen</h1>
        <p>Lade Daten…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Lite-Einstellungen</h1>
          <p style={{ marginTop: 8, color: "#555" }}>
            Wenige Hebel, grosse Wirkung: Domänen-Fokus + Zwingend (KO) + Relevanz.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link to="/wizard">Wizard</Link>
          <Link to="/ranking">Ranking</Link>
        </div>
      </header>

      {products.length > 0 && remainingIfFilterKO === 0 && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fff1f1", border: "1px solid #f3b4b4" }}>
          <strong>Hinweis:</strong> Mit den aktuellen Zwingend-Kriterien bleibt kein Produkt ohne KO-Verstoss uebrig.
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Tipp: Setze weniger „Zwingend“ oder senke Anforderungen (z. B. von Zwingend auf Muss).
          </div>
        </div>
      )}

      {/* Domänen-Regler */}
      <section style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Fokus nach Domäne</h2>

        <div style={{ display: "grid", gap: 14 }}>
          {[
            { id: "d1" as const, label: "Sicherheit & Compliance" },
            { id: "d2" as const, label: "Datenhoheit, Lieferkette & Governance" },
            { id: "d3" as const, label: "Produkt, Betrieb & Adoption" }
          ].map((d) => {
            const value = Math.round(mult[d.id] * 100);
            return (
              <div key={d.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{d.label}</strong>
                  <span style={{ color: "#666" }}>{value}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={value}
                  onChange={(e) => onChangeDomain(d.id, Number(e.target.value))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
                  <span>weniger</span>
                  <span>normal</span>
                  <span>mehr</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Diese Regler passen Gewichte innerhalb der Domäne an (ohne Details zu zeigen).
        </div>
      </section>

      {/* Leitplanken */}
      <section style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Leitplanken</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            Erweitert (Gewicht anzeigen)
          </label>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {railsResolved.map(({ rail, ids }) => {
            // repräsentativer Pref (erste ID)
            const p0 = prefMap.get(ids[0]);
            const relevance = p0?.relevance_level ?? "sollte";
            const isKo = p0?.is_ko ?? false;
            const weight = p0?.weight ?? 5;

            return (
              <div key={rail.key} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{rail.title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>{rail.helper}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                      {ids.length} passende Unterkriterien
                    </div>
                  </div>

                  <div style={{ minWidth: 320 }}>
                    <label style={{ display: "block", fontSize: 12, color: "#666" }}>Relevanz</label>
                    <select
                      value={relevance}
                      onChange={(e) => persist(setRailRelevance(prefs, ids, e.target.value as RelevanceLevel))}
                      style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                    >
                      <option value="muss">Muss</option>
                      <option value="sollte">Sollte</option>
                      <option value="kann">Kann</option>
                      <option value="nicht_relevant">Nicht relevant / nicht anwendbar</option>
                    </select>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={isKo}
                          disabled={relevance === "nicht_relevant"}
                          onChange={(e) => persist(setRailKO(prefs, ids, e.target.checked))}
                        />
                        Zwingend (KO)
                      </label>

                      {isKo && relevance !== "nicht_relevant" && (
                        <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: "#ffe5e5" }}>
                          Mindest-Score: 2
                        </span>
                      )}
                    </div>

                    {advanced && (
                      <div style={{ marginTop: 10 }}>
                        <label style={{ display: "block", fontSize: 12, color: "#666" }}>Gewicht (0–10)</label>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={1}
                          value={weight}
                          disabled={relevance === "nicht_relevant"}
                          onChange={(e) => persist(setRailWeight(prefs, ids, Number(e.target.value)))}
                          style={{ width: "100%" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
                          <span>0</span>
                          <span><strong>{weight}</strong></span>
                          <span>10</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                  <strong>Zwingend (KO)</strong>: Erfuellt ein Produkt das nicht, faellt es aus der Auswahl – unabhängig vom Score.
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          Profi-Pfad: Oeffne ein Produktdetail und passe Unterkriterien granular an (Expert-lite).
        </div>
      </section>
    </main>
  );
}

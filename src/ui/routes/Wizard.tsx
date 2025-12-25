import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Preference, Tree } from "../../domain/types";
import { getTree } from "../../api/repo";
import { ensurePreferencesForTree, loadPreferences, savePreferences } from "../../state/preferences";
import { DEFAULT_ANSWERS, QUESTIONS, type WizardAnswers } from "../../wizard/questions";
import { applyWizardAnswers } from "../../wizard/mapping";

export default function Wizard() {
  const nav = useNavigate();

  const [tree, setTree] = useState<Tree | null>(null);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [answers, setAnswers] = useState<WizardAnswers>(DEFAULT_ANSWERS);
  const [appliedSummary, setAppliedSummary] = useState<string[] | null>(null);

  useEffect(() => {
    async function load() {
      const t = await getTree();
      setTree(t);

      const stored = loadPreferences();
      const ensured = ensurePreferencesForTree(t, stored);
      setPrefs(ensured);
      savePreferences(ensured);
    }
    load().catch(console.error);
  }, []);

  const preview = useMemo(() => {
    if (!tree) return null;
    return applyWizardAnswers({ tree, preferences: prefs, answers });
  }, [tree, prefs, answers]);

  function setAnswer<K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function onApply() {
    if (!tree || !preview) return;
    savePreferences(preview.next);
    setPrefs(preview.next);
    setAppliedSummary(preview.summary);
  }

  if (!tree) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Einrichtung (Wizard)</h1>
        <p>Lade Kriterien…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Einrichtung</h1>
          <p style={{ marginTop: 8, color: "#555" }}>
            Wir setzen daraus eine erste Gewichtung und – wo sinnvoll – „Zwingend“-Kriterien (KO).
          </p>
        </div>
        <Link to="/ranking">← Ranking</Link>
      </header>

      <section style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Kurzfragen</h2>

        <div style={{ display: "grid", gap: 14 }}>
          {QUESTIONS.map((q) => {
            const value = answers[q.id];
            return (
              <div key={q.id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                <div style={{ fontWeight: 700 }}>{q.title}</div>
                {q.helper && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{q.helper}</div>}

                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {q.options.map((opt) => (
                    <label key={String(opt.value)} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <input
                        type="radio"
                        name={String(q.id)}
                        checked={value === opt.value}
                        onChange={() => setAnswer(q.id, opt.value as any)}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <div>{opt.label}</div>
                        {opt.helper && <div style={{ fontSize: 12, color: "#666" }}>{opt.helper}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button
            onClick={onApply}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "#333",
              color: "white",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            Empfehlung anwenden
          </button>

          <button
            onClick={() => setAnswers(DEFAULT_ANSWERS)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer"
            }}
          >
            Zuruecksetzen
          </button>

          <button
            onClick={() => nav("/ranking")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer"
            }}
          >
            Zum Ranking
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          <strong>Zwingend (KO)</strong>: Wenn ein Produkt das nicht erfuellt, faellt es aus der Auswahl – unabhängig vom Score.
        </div>
      </section>

      <section style={{ marginTop: 16, border: "1px dashed #ccc", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Zusammenfassung</h2>

        {!preview ? (
          <p>Berechne Vorschlag…</p>
        ) : (
          <>
            <ul style={{ marginTop: 8 }}>
              {preview.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>

            {appliedSummary && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "#e7f7ea" }}>
                <strong>Gespeichert.</strong> Du kannst Details im Produkt-Detail (Expert-lite) weiter verfeinern.
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              Tipp: Wenn dir nach dem Anwenden zu viele Produkte rausfallen, reduziere „Zwingend“-Punkte im Produktdetail.
            </div>
          </>
        )}
      </section>
    </main>
  );
}

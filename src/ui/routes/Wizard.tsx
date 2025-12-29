import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Container from "../components/Container";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Stepper from "../components/Stepper";
import OptionCard from "../components/OptionCard";

import { getTree, getRailsConfig } from "../../api/repo";
import type { Preference, Tree } from "../../domain/types";
import {
  ensurePreferencesForTree,
  loadPreferences,
  savePreferences,
  clearPreferences,
} from "../../state/preferences";

import type { WizardAnswers } from "../../wizard/questions";
import { QUESTIONS } from "../../wizard/questions";
import { applyWizardAnswers } from "../../wizard/mapping";

type RailConfigItem = {
  key: string;
  title: string;
  helper: string;
  subcriterion_ids: string[];
};

function patchPrefsForSubIds(
  prefs: Preference[],
  ids: string[],
  patch: Partial<Pick<Preference, "relevance_level" | "is_ko" | "ko_threshold">>
) {
  const set = new Set(ids);
  return prefs.map((p) => (set.has(p.subcriterion_id) ? { ...p, ...patch } : p));
}

function railState(prefs: Preference[], ids: string[]) {
  const set = new Set(ids);
  const items = prefs.filter((p) => set.has(p.subcriterion_id));

  if (items.length === 0) {
    return { relevance_level: "nicht_relevant" as const, is_ko: false, mixed: true };
  }

  const rel = items[0].relevance_level;
  const ko = !!items[0].is_ko;
  const mixed = items.some((x) => x.relevance_level !== rel) || items.some((x) => !!x.is_ko !== ko);

  return { relevance_level: rel, is_ko: ko, mixed };
}

function optionTone(label: string): "neutral" | "warn" {
  const s = (label ?? "").toLowerCase();
  return s.includes("ko") || s.includes("zwingend") ? "warn" : "neutral";
}

function isCompleteAnswers(a: Partial<WizardAnswers>): a is WizardAnswers {
  return QUESTIONS.every((q) => a[q.id] != null);
}

function FeintuningBlock(props: {
  rails: RailConfigItem[];
  prefs: Preference[];
  draftPrefs: Preference[] | null;
  setDraftPrefs: (next: Preference[] | null) => void;
  draftDirty: boolean;
  setDraftDirty: (v: boolean) => void;
  onApply: (next: Preference[]) => void;
  onDiscard: () => void;
}) {
  const {
    rails,
    prefs,
    draftPrefs,
    setDraftPrefs,
    draftDirty,
    setDraftDirty,
    onApply,
    onDiscard,
  } = props;

  const baseDraft = draftPrefs ?? prefs;

  return (
    <div style={{ marginTop: "var(--s-5)" }}>
      <details
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          if (open && !draftPrefs) {
            setDraftPrefs(prefs);
            setDraftDirty(false);
          }
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--accent)" }}>
          Erweitert: Feintuning (optional){" "}
          {draftDirty ? (
            <span style={{ marginLeft: 8 }}>
              <Badge tone="warn">Entwurf</Badge>
            </span>
          ) : null}
        </summary>

        <div style={{ marginTop: "var(--s-4)", display: "grid", gap: 10 }}>
          {/* Handholding / Info */}
          <Card>
            <div style={{ display: "grid", gap: 6 }}>
              <strong>Optionales Feintuning</strong>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Änderungen hier sind ein <strong>Entwurf</strong> und beeinflussen das Ranking erst,
                wenn du unten auf <strong>„Änderungen anwenden“</strong> klickst.
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Tipp: „Nicht relevant“ blendet ein Thema aus. „KO“ markiert ein hartes Muss (unter
                Schwelle = KO-Verstoss).
              </div>
            </div>
          </Card>

          {rails.length === 0 ? (
            <Card>
              <p style={{ margin: 0, color: "var(--text-muted)" }}>
                Rails-Konfiguration konnte nicht geladen werden. Prüfe{" "}
                <code>public/fixtures/rails.config.json</code>.
              </p>
            </Card>
          ) : (
            rails.map((r) => {
              const st = railState(baseDraft, r.subcriterion_ids);

              return (
                <div
                  key={r.key}
                  style={{
                    padding: "var(--s-4)",
                    borderRadius: "var(--r-lg)",
                    border: "1px solid var(--surface-border)",
                    background: "var(--surface)",
                    backdropFilter: `blur(var(--surface-blur))`,
                    WebkitBackdropFilter: `blur(var(--surface-blur))`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 260 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{r.title}</strong>
                        {st.mixed ? (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(gemischt)</span>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>
                        {r.helper}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          fontSize: 13,
                          color: "var(--text-muted)",
                        }}
                      >
                        Relevanz
                        <select
                          value={st.relevance_level}
                          onChange={(e) => {
                            const relevance_level = e.target.value as Preference["relevance_level"];
                            const next = patchPrefsForSubIds(baseDraft, r.subcriterion_ids, {
                              relevance_level,
                              is_ko: relevance_level === "nicht_relevant" ? false : st.is_ko,
                              ko_threshold: 2,
                            });
                            setDraftPrefs(next);
                            setDraftDirty(true);
                          }}
                        >
                          <option value="muss">Muss</option>
                          <option value="sollte">Sollte</option>
                          <option value="kann">Kann</option>
                          <option value="nicht_relevant">Nicht relevant</option>
                        </select>
                      </label>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          color: "var(--text-muted)",
                          marginTop: 18,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={st.is_ko}
                          disabled={st.relevance_level === "nicht_relevant"}
                          onChange={(e) => {
                            const is_ko = e.target.checked;
                            const next = patchPrefsForSubIds(baseDraft, r.subcriterion_ids, {
                              is_ko,
                              ko_threshold: 2, // immer gültig, nie undefined
                            });
                            setDraftPrefs(next);
                            setDraftDirty(true);
                          }}
                        />
                        KO
                      </label>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button
              variant="secondary"
              disabled={!draftDirty}
              onClick={() => {
                onDiscard();
              }}
            >
              Verwerfen
            </Button>

            <Button
              disabled={!draftDirty || !draftPrefs}
              onClick={() => {
                if (!draftPrefs) return;
                onApply(draftPrefs);
              }}
            >
              Aenderungen anwenden
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}

export default function Wizard() {
  const nav = useNavigate();

  const [tree, setTree] = useState<Tree | null>(null);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [answers, setAnswers] = useState<Partial<WizardAnswers>>({});

  const [rails, setRails] = useState<RailConfigItem[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [appliedSummary, setAppliedSummary] = useState<string[] | null>(null);

  // Draft fürs Feintuning (wirkt erst nach explizitem Anwenden)
  const [draftPrefs, setDraftPrefs] = useState<Preference[] | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);

  useEffect(() => {
    async function load() {
      const t = await getTree();
      setTree(t);

      const stored = loadPreferences();
      const ensured = ensurePreferencesForTree(t, stored);
      setPrefs(ensured);
    }
    load().catch(console.error);
  }, []);

  useEffect(() => {
    async function load() {
      const rc = await getRailsConfig();
      setRails(rc as RailConfigItem[]);
    }
    load().catch(console.error);
  }, []);

  const step = QUESTIONS[stepIdx];
  const total = QUESTIONS.length;

  const cols = step.options.length === 4 ? 4 : 3;

  const complete = isCompleteAnswers(answers);

  const preview = useMemo(() => {
    if (!tree) return null;

    // Solange nicht alles beantwortet ist: keine Änderungen/keine Summary
    if (!complete) return { next: prefs, summary: [] as string[] };

    return applyWizardAnswers({
      tree,
      preferences: prefs,
      answers: answers as WizardAnswers,
      rails,
    });
  }, [tree, prefs, answers, rails, complete]);

  // Wenn Result Screen sichtbar wird: Draft initialisieren
  useEffect(() => {
    if (!appliedSummary) return;
    setDraftPrefs(prefs);
    setDraftDirty(false);
  }, [appliedSummary, prefs]);

  if (!tree) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader title="Wizard" subtitle="Lade Daten…" />
        </div>
      </Container>
    );
  }

  function resetAll() {
    setAnswers({});
    setStepIdx(0);
    setAppliedSummary(null);

    setDraftPrefs(null);
    setDraftDirty(false);

    // Preferences wirklich neutral/blank machen
    clearPreferences();
    if (tree) {
      const neutral = ensurePreferencesForTree(tree, []);
      setPrefs(neutral);
      savePreferences(neutral);
    }
  }

  // Result Screen
  if (appliedSummary) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader
            title="Empfehlung angewendet"
            subtitle="Du kannst jetzt das Ranking ansehen. Optional kannst du unten noch Feintuning machen."
            right={
              <Button variant="ghost" onClick={resetAll}>
                Zuruecksetzen
              </Button>
            }
          />

          <div style={{ marginTop: "var(--s-5)" }}>
            <Card>
              <h2 style={{ fontSize: 18, marginTop: 0 }}>Zusammenfassung</h2>

              <div style={{ marginTop: "var(--s-3)", display: "grid", gap: 8 }}>
                {appliedSummary.map((x, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <Badge tone="neutral">•</Badge>
                    <div style={{ color: "var(--text)" }}>{x}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "var(--s-5)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button onClick={() => nav("/ranking")}>Zum Ranking</Button>
                <Button variant="ghost" onClick={() => nav("/")}>
                  Start
                </Button>
              </div>
            </Card>
          </div>

          <FeintuningBlock
            rails={rails}
            prefs={prefs}
            draftPrefs={draftPrefs}
            setDraftPrefs={setDraftPrefs}
            draftDirty={draftDirty}
            setDraftDirty={setDraftDirty}
            onDiscard={() => {
              setDraftPrefs(prefs);
              setDraftDirty(false);
            }}
            onApply={(next) => {
              setPrefs(next);
              savePreferences(next);
              setDraftDirty(false);
            }}
          />
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div style={{ padding: "var(--s-6) 0" }}>
        <PageHeader
          title="Wizard"
          subtitle="Beantworte ein paar Fragen. Wir setzen daraus eine sinnvolle Startgewichtung und (falls passend) KO-Kriterien."
          right={
            <Button variant="ghost" onClick={resetAll}>
              Zuruecksetzen
            </Button>
          }
        />

        <div style={{ marginTop: "var(--s-5)" }}>
          <Stepper current={stepIdx + 1} total={total} label={step.title} />

          <Card>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{step.title}</div>
                {step.helper && (
                  <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>
                    {step.helper}
                  </div>
                )}
              </div>

              <div className="wizardOptionsGrid" data-cols={String(cols)} style={{ marginTop: 6 }}>
                {step.options.map((opt) => {
                  const selected = answers[step.id] === (opt.value as any);
                  const tone = optionTone(opt.label);

                  return (
                    <OptionCard
                      key={String(opt.value)}
                      title={opt.label}
                      description={opt.helper}
                      selected={selected}
                      badge={tone === "warn" ? <Badge tone="warn">Zwingend/KO</Badge> : undefined}
                      onClick={() => setAnswers((a) => ({ ...a, [step.id]: opt.value as any }))}
                    />
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: "var(--s-4)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Button
                  variant="secondary"
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  disabled={stepIdx === 0}
                >
                  Zurueck
                </Button>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="ghost" onClick={() => nav("/ranking")} title="Ohne Wizard weiter">
                    Ueberspringen
                  </Button>

                  {stepIdx < total - 1 ? (
                    <Button onClick={() => setStepIdx((i) => i + 1)}>Weiter</Button>
                  ) : (
                    <Button
                      disabled={!complete || !preview}
                      title={!complete ? "Bitte alle Fragen beantworten oder überspringen." : undefined}
                      onClick={() => {
                        if (!preview) return;

                        savePreferences(preview.next);
                        localStorage.setItem("wizard_completed", "true");

                        setPrefs(preview.next);
                        setAppliedSummary(preview.summary);
                      }}
                    >
                      Empfehlung anwenden
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Live-Vorschau */}
          <div style={{ marginTop: "var(--s-4)" }}>
            <Card>
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Was wird gesetzt?</h2>
              <p style={{ marginTop: "var(--s-2)" }}>
                Kurz zusammengefasst. Solange nicht alle Fragen beantwortet sind, bleibt das neutral.
              </p>

              {(preview?.summary ?? []).length === 0 ? (
                <p style={{ marginTop: "var(--s-3)", color: "var(--text-muted)", fontSize: 13 }}>
                  Noch keine Empfehlung aktiv. Beantworte alle Fragen oder überspringe den Wizard.
                </p>
              ) : (
                <div style={{ marginTop: "var(--s-3)", display: "grid", gap: 8 }}>
                  {(preview?.summary ?? []).slice(0, 6).map((x, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <Badge tone="neutral">•</Badge>
                      <div style={{ color: "var(--text)" }}>{x}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Feintuning immer sichtbar (Draft-only, kein Einfluss ohne Apply) */}
          <FeintuningBlock
            rails={rails}
            prefs={prefs}
            draftPrefs={draftPrefs}
            setDraftPrefs={setDraftPrefs}
            draftDirty={draftDirty}
            setDraftDirty={setDraftDirty}
            onDiscard={() => {
              setDraftPrefs(prefs);
              setDraftDirty(false);
            }}
            onApply={(next) => {
              setPrefs(next);
              savePreferences(next);
              setDraftDirty(false);
            }}
          />
        </div>
      </div>
    </Container>
  );
}

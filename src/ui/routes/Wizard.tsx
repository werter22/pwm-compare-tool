import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Container from "../components/Container";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import OptionCard from "../components/OptionCard";

import { domainTheme } from "../styles/domainTheme";

import { getTree, getRailsConfig } from "../../api/repo";
import type { Preference, RelevanceLevel, Tree } from "../../domain/types";
import { ensurePreferencesForTree, loadPreferences, savePreferences, clearPreferences } from "../../state/preferences";

import type { WizardAnswers } from "../../wizard/questions";
import { QUESTIONS } from "../../wizard/questions";
import { applyWizardAnswers } from "../../wizard/mapping";

type RailConfigItem = {
  key: string;
  title: string;
  helper: string;
  subcriterion_ids: string[];
};

type Stage = "questions" | "feintuning" | "summary";

const AUTO_WEIGHT: Record<RelevanceLevel, number> = {
  muss: 10,
  sollte: 5,
  kann: 1,
  nicht_relevant: 0,
};

function isCompleteAnswers(a: Partial<WizardAnswers>): a is WizardAnswers {
  return QUESTIONS.every((q) => a[q.id] != null);
}

function patchPrefsForSubIds(
  prefs: Preference[],
  ids: string[],
  patch: Partial<Pick<Preference, "relevance_level" | "is_ko" | "ko_threshold" | "weight">>
) {
  const set = new Set(ids);
  return prefs.map((p) => (set.has(p.subcriterion_id) ? { ...p, ...patch } : p));
}

function railState(prefs: Preference[], ids: string[]) {
  const set = new Set(ids);
  const items = prefs.filter((p) => set.has(p.subcriterion_id));

  if (items.length === 0) {
    return {
      relevance_level: "nicht_relevant" as const,
      is_ko: false,
      ko_threshold: 2 as 1 | 2,
      rel_mixed: true,
      ko_mixed: true,
      thr_mixed: true,
      mixed: true,
    };
  }

  const rel = items[0].relevance_level;
  const ko = !!items[0].is_ko;
  const thr = ((items[0].ko_threshold ?? 2) as 1 | 2);

  const rel_mixed = items.some((x) => x.relevance_level !== rel);
  const ko_mixed = items.some((x) => !!x.is_ko !== ko);
  const thr_mixed = items.some((x) => ((x.ko_threshold ?? 2) as 1 | 2) !== thr);

  return {
    relevance_level: rel,
    is_ko: ko,
    ko_threshold: thr,
    rel_mixed,
    ko_mixed,
    thr_mixed,
    mixed: rel_mixed || ko_mixed || thr_mixed,
  };
}


function ScrollToTopFab(props: { visible: boolean }) {
  const { visible } = props;

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 50,
        borderRadius: "var(--r-pill)",
        border: "1px solid var(--surface-border)",
        background: "var(--surface)",
        color: "var(--text)",
        padding: "10px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 900,
      }}
      aria-label="Nach oben"
      title="Nach oben"
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>↑</span>
      <span style={{ fontSize: 13 }}>Nach oben</span>
    </button>
  );
}

function WizardTabs(props: {
  active: Stage;
  onGo: (s: Stage) => void;
  disabled?: Partial<Record<Stage, boolean>>;
}) {
  const { active, onGo, disabled } = props;

  const items: Array<{ id: Stage; label: string; helper: string }> = [
    { id: "questions", label: "Fragebogen", helper: "Startgewichtung" },
    { id: "feintuning", label: "Feintuning", helper: "KO & Relevanz" },
    { id: "summary", label: "Zusammenfassung", helper: "Slider (0–10)" },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 10,
        marginTop: "var(--s-4)",
      }}
    >
      {items.map((it) => {
        const isActive = active === it.id;
        const isDisabled = !!disabled?.[it.id];
        return (
          <button
            key={it.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onGo(it.id)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: "var(--r-lg)",
              border: isActive ? "1px solid var(--accent)" : "1px solid var(--surface-border)",
              background: isActive ? "var(--surface)" : "var(--surface)",
              cursor: isDisabled ? "not-allowed" : "pointer",
              opacity: isDisabled ? 0.5 : 1,
              boxShadow: isActive ? "0 0 0 2px rgba(0,0,0,0.02)" : undefined,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: "var(--text)" }}>{it.label}</div>
              {isActive ? <Badge tone="neutral">Aktiv</Badge> : null}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>{it.helper}</div>
          </button>
        );
      })}
    </div>
  );
}

function FeintuningStep(props: {
  rails: RailConfigItem[];
  draftPrefs: Preference[];
  setDraftPrefs: (next: Preference[]) => void;
  setDirty: (v: boolean) => void;
}) {
  const { rails, draftPrefs, setDraftPrefs, setDirty } = props;

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredRails = useMemo(() => {
    if (!normalizedQuery) return rails;
    return rails.filter((r) => {
      const hay = `${r.title} ${r.helper ?? ""} ${r.key}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [rails, normalizedQuery]);

  const KO_HELP =
    "KO = hartes Muss. Wenn der Score unter dem Mindestscore liegt, gilt das Produkt als KO-Verstoß (Ausschluss).";

  const THRESH_HELP =
    'Streng = Mindestscore 2 ("Stark"). Flexibel = Mindestscore 1 ("Ausreichend").';

  const pillSelectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "999px",
    border: "1px solid var(--surface-border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 800,
    outline: "none",
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <strong>Feintuning & KO (optional)</strong>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Änderungen sind Vorschau und wirken erst nach <strong>„Einstellungen übernehmen“</strong>.
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              <span title={KO_HELP} style={{ cursor: "help", textDecoration: "underline dotted" }}>
                Was bedeutet KO?
              </span>{" "}
              <span style={{ color: "var(--text-muted)" }}>– {THRESH_HELP}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {filteredRails.length}/{rails.length}
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen (z.B. SSO, SCIM, Self-Hosting)…"
              style={{
                width: 360,
                maxWidth: "100%",
                padding: "10px 12px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--surface-border)",
                background: "var(--surface)",
                color: "var(--text)",
                outline: "none",
              }}
            />

            {query ? (
              <Button variant="ghost" onClick={() => setQuery("")}>
                Reset
              </Button>
            ) : null}
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
      ) : filteredRails.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            Keine Treffer für <strong>{query}</strong>.
          </p>
        </Card>
      ) : (
        filteredRails.map((r) => {
          const st = railState(draftPrefs, r.subcriterion_ids);

          // Threshold ist nur sinnvoll wenn KO aktiv und nicht "nicht relevant"
          const thresholdEnabled = st.is_ko && st.relevance_level !== "nicht_relevant";

          // Relevanz ist "gelockt", sobald KO aktiv ist (damit KO = Muss konsistent bleibt)
          const relevanceLocked = st.is_ko && st.relevance_level !== "nicht_relevant";

          return (
            <div
              key={r.key}
              style={{
                padding: "var(--s-4)",
                borderRadius: "var(--r-lg)",
                border: "1px solid var(--surface-border)",
                background: "var(--surface)",
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
                <div style={{ minWidth: 280 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{r.title}</strong>
                    {st.mixed ? (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(gemischt)</span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>{r.helper}</div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-end",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Relevanz */}
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      color: "var(--text-muted)",
                      minWidth: 150,
                    }}
                    title={relevanceLocked ? "Relevanz ist gelockt, weil KO aktiv ist (KO = Muss)." : undefined}
                  >
                    Relevanz
                    <select
                      value={st.relevance_level}
                      disabled={relevanceLocked}
                      style={{
                        opacity: relevanceLocked ? 0.6 : 1,
                        cursor: relevanceLocked ? "not-allowed" : "pointer",
                      }}
                      onChange={(e) => {
                        const relevance_level = e.target.value as RelevanceLevel;

                        // Konsequenz: Nicht relevant => KO aus + Gewicht 0 + Threshold reset
                        if (relevance_level === "nicht_relevant") {
                          const next = patchPrefsForSubIds(draftPrefs, r.subcriterion_ids, {
                            relevance_level: "nicht_relevant",
                            weight: 0,
                            is_ko: false,
                            ko_threshold: 2,
                          });
                          setDraftPrefs(next);
                          setDirty(true);
                          return;
                        }

                        const weight = AUTO_WEIGHT[relevance_level];

                        const next = patchPrefsForSubIds(draftPrefs, r.subcriterion_ids, {
                          relevance_level,
                          weight,
                          is_ko: st.is_ko,
                          ko_threshold: (st.ko_threshold ?? 2) as 1 | 2,
                        });

                        setDraftPrefs(next);
                        setDirty(true);
                      }}
                    >
                      <option value="muss">Muss</option>
                      <option value="sollte">Sollte</option>
                      <option value="kann">Kann</option>
                      <option value="nicht_relevant">Nicht relevant</option>
                    </select>
                  </label>

                  {/* KO */}
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      color: "var(--text-muted)",
                      minWidth: 80,
                    }}
                    title={KO_HELP}
                  >
                    KO
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={st.is_ko}
                        disabled={st.relevance_level === "nicht_relevant"}
                        onChange={(e) => {
                          const is_ko = e.target.checked;

                          // KO aktiv => Muss + Gewicht 10 (konsequent)
                          // KO aus => nur is_ko zurücksetzen, Rest bleibt (User kann Relevanz danach bewusst ändern)
                          const patch = is_ko
                            ? ({
                                is_ko: true,
                                ko_threshold: (st.ko_threshold ?? 2) as 1 | 2,
                                relevance_level: "muss",
                                weight: 10,
                              } as const)
                            : ({
                                is_ko: false,
                                ko_threshold: (st.ko_threshold ?? 2) as 1 | 2,
                              } as const);

                          const next = patchPrefsForSubIds(draftPrefs, r.subcriterion_ids, patch);
                          setDraftPrefs(next);
                          setDirty(true);
                        }}
                      />
                      <span
                        title={KO_HELP}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          border: "1px solid var(--surface-border)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          cursor: "help",
                          color: "var(--text-muted)",
                          userSelect: "none",
                        }}
                      >
                        i
                      </span>
                    </div>
                  </label>

                  {/* Mindestscore (Pill) – immer Platz reserviert, aber disabled+faded wenn KO aus */}
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      color: "var(--text-muted)",
                      minWidth: 190,
                      opacity: thresholdEnabled ? 1 : 0.35,
                    }}
                    title={THRESH_HELP}
                  >
                    Mindestscore
                    <select
                      value={String(st.ko_threshold ?? 2)}
                      disabled={!thresholdEnabled}
                      onChange={(e) => {
                        const ko_threshold = ((Number(e.target.value) as 1 | 2) ?? 2) as 1 | 2;
                        const next = patchPrefsForSubIds(draftPrefs, r.subcriterion_ids, { ko_threshold });
                        setDraftPrefs(next);
                        setDirty(true);
                      }}
                      style={pillSelectStyle}
                    >
                      <option value="2">Streng</option>
                      <option value="1">Flexibel</option>
                    </select>
                  </label>

                  {thresholdEnabled && st.thr_mixed ? (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>(Mindestscore gemischt)</span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}


type FlatNode = {
  domainId: string;
  domainName: string;
  criterionId: string;
  criterionName: string;
  subId: string;
  subName: string;
  subDesc?: string;
};


function AdvancedSummaryStep(props: {
  tree: Tree;
  draftPrefs: Preference[];
  setDraftPrefs: (next: Preference[]) => void;
  setDirty: (v: boolean) => void;

  baseline: Preference[];
  resetAllToBaseline: () => void;
}) {
  const { tree, draftPrefs, setDraftPrefs, setDirty, baseline, resetAllToBaseline } = props;

  const [query, setQuery] = useState("");
  const [onlyKO, setOnlyKO] = useState(false);
  const [openDesc, setOpenDesc] = useState<Record<string, boolean>>({});

  const flat = useMemo<FlatNode[]>(() => {
    const out: FlatNode[] = [];
    for (const d of tree.domains) {
      for (const c of d.criteria) {
        for (const s of c.subcriteria) {
          const subDesc =
            ("short_desc" in s && typeof (s as { short_desc?: unknown }).short_desc === "string"
              ? (s as { short_desc?: string }).short_desc
              : undefined) ??
            ("helper" in s && typeof (s as { helper?: unknown }).helper === "string"
              ? (s as { helper?: string }).helper
              : undefined);


          out.push({
            domainId: d.id,
            domainName: d.name,
            criterionId: c.id,
            criterionName: c.name,
            subId: s.id,
            subName: s.name,
            subDesc,
          });

        }
      }
    }
    return out;
  }, [tree]);

  const prefById = useMemo(() => {
    const m = new Map<string, Preference>();
    for (const p of draftPrefs) m.set(p.subcriterion_id, p);
    return m;
  }, [draftPrefs]);

  const baselineById = useMemo(() => {
    const m = new Map<string, Preference>();
    for (const p of baseline) m.set(p.subcriterion_id, p);
    return m;
  }, [baseline]);

  const normalizedQuery = query.trim().toLowerCase();

  const matches = (n: FlatNode, p: Preference) => {
    if (onlyKO && !p.is_ko) return false;
    if (!normalizedQuery) return true;
    const hay = `${n.subName} ${n.criterionName} ${n.domainName}`.toLowerCase();
    return hay.includes(normalizedQuery);
  };

  function setWeight(subId: string, w: number) {
    const next = draftPrefs.map((p) => (p.subcriterion_id === subId ? { ...p, weight: w } : p));
    setDraftPrefs(next);
    setDirty(true);
  }
  
  // Group by domain -> criterion
  const domains = useMemo(() => {
    const byDomain = new Map<string, { domainId: string; domainName: string; criteria: Map<string, { id: string; name: string; subs: FlatNode[] }> }>();

    for (const n of flat) {
      const p = prefById.get(n.subId);
      if (!p) continue;
      if (!matches(n, p)) continue;

      if (!byDomain.has(n.domainId)) {
        byDomain.set(n.domainId, { domainId: n.domainId, domainName: n.domainName, criteria: new Map() });
      }
      const d = byDomain.get(n.domainId)!;
      if (!d.criteria.has(n.criterionId)) {
        d.criteria.set(n.criterionId, { id: n.criterionId, name: n.criterionName, subs: [] });
      }
      d.criteria.get(n.criterionId)!.subs.push(n);
    }

    // preserve tree order
    const ordered: Array<{ domainId: string; domainName: string; criteria: Array<{ id: string; name: string; subs: FlatNode[] }> }> = [];
    for (const d of tree.domains) {
      const g = byDomain.get(d.id);
      if (!g) continue;
      const critOrdered: Array<{ id: string; name: string; subs: FlatNode[] }> = [];
      for (const c of d.criteria) {
        const cg = g.criteria.get(c.id);
        if (cg && cg.subs.length) critOrdered.push(cg);
      }
      if (critOrdered.length) ordered.push({ domainId: d.id, domainName: d.name, criteria: critOrdered });
    }
    return ordered;
  }, [flat, prefById, onlyKO, normalizedQuery, tree.domains, matches, tree]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card>
        <div style={{ display: "grid", gap: 6 }}>
          <strong>Zusammenfassung & Gewichte (optional)</strong>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Hier siehst du alles strukturiert nach Domäne. Du kannst Gewichte final per Slider (0–10) anpassen.
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Hinweis: <strong>0</strong> bedeutet „zählt nicht in die Gewichtung“. KO bleibt aktiv, falls gesetzt.
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 280px" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Suche</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Domain, Kriterium oder Unterkriterium…"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--surface-border)",
                background: "var(--surface)",
                color: "var(--text)",
              }}
            />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 18 }}>
            <input type="checkbox" checked={onlyKO} onChange={(e) => setOnlyKO(e.target.checked)} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Nur KO</span>
          </label>

          <div style={{ flex: "1 1 auto" }} />

          <Button variant="secondary" onClick={resetAllToBaseline}>
            Alles zuruecksetzen
          </Button>
        </div>
      </Card>

      {domains.length === 0 ? (
        <Card>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Keine Treffer. Passe Suche/Filter an.</div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {domains.map((d) => {
            const theme = domainTheme(d.domainId);

            return (
              <div
                key={d.domainId}
                style={{
                  borderRadius: "var(--r-lg)",
                  border: "1px solid var(--surface-border)",
                  background: theme.tint,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    background: "var(--surface)",
                    borderLeft: `6px solid ${theme.accent}`,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 950, fontSize: 15 }}>{d.domainName}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Gewichte & KO pro Unterkriterium
                  </div>
                </div>

                <div style={{ padding: 12, display: "grid", gap: 10 }}>
                  {d.criteria.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        borderRadius: "var(--r-lg)",
                        border: "1px solid var(--surface-border)",
                        background: "var(--surface)",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid var(--surface-border)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.subs.length} Unterkriterien</div>
                      </div>

                      <div style={{ padding: 12, display: "grid", gap: 10 }}>
                        {c.subs.map((s) => {
                          const p = prefById.get(s.subId)!;
                          const base = baselineById.get(s.subId);
                          const isCustom = !!base && p.weight !== base.weight;

                          return (
                            <div
                              key={s.subId}
                              style={{
                                padding: "10px 12px",
                                borderRadius: "var(--r-lg)",
                                border: "1px solid var(--surface-border)",
                                background: "var(--surface)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  flexWrap: "wrap",
                                  alignItems: "flex-start",
                                }}
                              >
                                <div style={{ minWidth: 260 }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setOpenDesc((prev) => ({
                                          ...prev,
                                          [s.subId]: !prev[s.subId],
                                        }))
                                      }
                                      disabled={!s.subDesc}
                                      aria-label={openDesc[s.subId] ? "Beschreibung einklappen" : "Beschreibung ausklappen"}
                                      title={s.subDesc ? "Beschreibung anzeigen" : "Keine Beschreibung verfügbar"}
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: "var(--r-md)",
                                        border: "1px solid var(--surface-border)",
                                        background: "var(--surface)",
                                        cursor: s.subDesc ? "pointer" : "not-allowed",
                                        opacity: s.subDesc ? 1 : 0.5,
                                        display: "grid",
                                        placeItems: "center",
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: "inline-block",
                                          transform: openDesc[s.subId] ? "rotate(90deg)" : "rotate(0deg)",
                                          transition: "transform 120ms ease",
                                          fontWeight: 900,
                                        }}
                                      >
                                        ▸
                                      </span>
                                    </button>

                                    <strong>{s.subName}</strong>
                                    {p.is_ko ? <Badge tone="warn">KO</Badge> : null}
                                    {isCustom ? <Badge tone="neutral">Custom</Badge> : null}
                                    {p.weight === 0 ? <Badge tone="neutral">0</Badge> : null}
                                  </div>

                                  <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12 }}>
                                    {openDesc[s.subId] && s.subDesc ? (
                                      <div
                                        style={{
                                          marginTop: 6,
                                          color: "var(--text-muted)",
                                          fontSize: 13,
                                          lineHeight: 1.35,
                                          maxWidth: 400,
                                        }}
                                      >
                                        {s.subDesc}
                                      </div>
                                    ) : null}


                                    <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12 }}>
                                      Relevanz: <strong>{p.relevance_level}</strong>
                                    </div>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    gap: 10,
                                    alignItems: "flex-start",
                                    alignSelf: "flex-start",
                                    flexWrap: "wrap",
                                  }}
                                >

                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
                                      <span>Gewicht</span>
                                      <span style={{ fontWeight: 900, color: "var(--text)" }}>{p.weight}</span>
                                    </div>

                                    <input
                                      type="range"
                                      min={0}
                                      max={10}
                                      step={1}
                                      value={p.weight}
                                      onChange={(e) => setWeight(s.subId, Number(e.target.value))}
                                      style={{ width: 260 }}
                                    />


                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Wizard() {
  const nav = useNavigate();

  const [tree, setTree] = useState<Tree | null>(null);

  // Base = aktueller Stand (applied oder vanilla). Wird NICHT automatisch gespeichert.
  const [prefs, setPrefs] = useState<Preference[]>([]);

  // Draft = Arbeit im Wizard (Preview). Commit nur via "Einstellungen übernehmen".
  const [draftPrefs, setDraftPrefs] = useState<Preference[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showTopFab, setShowTopFab] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  const [answers, setAnswers] = useState<Partial<WizardAnswers>>({});
  const [rails, setRails] = useState<RailConfigItem[]>([]);

  const [stage, setStage] = useState<Stage>("questions");
  const [stepIdx, setStepIdx] = useState(0);

  // Baseline für Summary-Auto-Reset = Snapshot nach Fragebogen + Feintuning
  const [summaryBaseline, setSummaryBaseline] = useState<Preference[] | null>(null);

  useEffect(() => {
    async function load() {
      const t = await getTree();
      setTree(t);

      const stored = loadPreferences();
      const ensured = ensurePreferencesForTree(t, stored);

      setPrefs(ensured);
      setDraftPrefs(ensured);
      setDirty(false);
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

  useEffect(() => {
    if (stage !== "summary") {
      setShowTopFab(false);
      return;
    }

    const onScroll = () => {
      setShowTopFab(window.scrollY > 600);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [stage]);


  const complete = isCompleteAnswers(answers);

  const wizardPreview = useMemo(() => {
    if (!tree) return null;

    if (!complete) {
      return { next: prefs, summary: [] as string[] };
    }

    return applyWizardAnswers({
      tree,
      preferences: prefs,
      answers: answers as WizardAnswers,
      rails,
    });
  }, [tree, prefs, answers, rails, complete]);

  function resetAll() {
    setAnswers({});
    setStepIdx(0);
    setStage("questions");
    setSummaryBaseline(null);

    setDirty(false);

    clearPreferences();
    const neutral = tree ? ensurePreferencesForTree(tree, []) : [];
    setPrefs(neutral);
    setDraftPrefs(neutral);
  }

  function continueWithDefaults() {
    const ok = window.confirm(
      "Ohne Wizard fortfahren?\n\nDu nutzt Standardwerte (alle Gewichte gleich). Du kannst später jederzeit anpassen."
    );
    if (!ok) return;
    nav("/ranking");
  }

  function skipQuestionnaire() {
    // Step 1 überspringen, aber im Wizard bleiben (Step 2).
    // Draft wird auf neutrale/aktuelle prefs gesetzt (keine Questionnaire-Map).
    setStage("feintuning");
    setDraftPrefs(prefs);
    setDirty(false);
    setSummaryBaseline(null);
  }

  function applyDraft() {
    savePreferences(draftPrefs);
    localStorage.setItem("wizard_completed", "true");
    setPrefs(draftPrefs);
    setDirty(false);
    setJustApplied(true);

    // kleines Feedback, ohne extra Toast-System
    window.setTimeout(() => setJustApplied(false), 1800);
  }

  function goStage(target: Stage) {
    if (!wizardPreview) {
      setStage(target);
      return;
    }

    if (target === "questions") {
      setStage("questions");
      return;
    }

    if (target === "feintuning") {
      // Draft = Questionnaire result (oder neutral)
      setDraftPrefs(wizardPreview.next);
      setDirty((wizardPreview.summary ?? []).length > 0);
      setSummaryBaseline(null);
      setStage("feintuning");
      return;
    }

    // target === "summary"
    // Baseline = Snapshot nach Fragebogen + Feintuning
    setSummaryBaseline(draftPrefs.map((p) => ({ ...p })));
    setStage("summary");
  }

  if (!tree) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader title="Wizard" subtitle="Lade Daten…" />
        </div>
      </Container>
    );
  }

  const step = QUESTIONS[stepIdx];
  const cols = step.options.length === 4 ? 4 : 3;

  // Disable clicking "Summary" when not meaningful? (optional) – ich lasse es absichtlich offen (alles optional).
  const disabledTabs: Partial<Record<Stage, boolean>> = {};

  // Right actions: keep "Ohne Wizard fortfahren" safe (top right).
  const rightActions = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {stage === "questions" ? (
        <Button
          variant="secondary"
          onClick={skipQuestionnaire}
          title="Fragebogen überspringen und mit Feintuning fortfahren"
        >
          Fragebogen ueberspringen
        </Button>
      ) : null}

      <Button variant="ghost" onClick={continueWithDefaults} title="Standardwerte verwenden (ohne Wizard)">
        Ohne Wizard fortfahren
      </Button>

      <Button variant="ghost" onClick={resetAll}>
        Zuruecksetzen
      </Button>
    </div>
  );


  // FEINTUNING reset should only reset feintuning changes (to questionnaire baseline)
  function resetFeintuningToQuestionnaireBaseline() {
    const baseline = wizardPreview?.next ?? prefs;
    setDraftPrefs(baseline);
    setDirty((wizardPreview?.summary ?? []).length > 0);
  }

  function resetSummaryToBaseline() {
    if (!summaryBaseline) return;
    setDraftPrefs(summaryBaseline.map((p) => ({ ...p })));
    setDirty(true);
  }

  return (
    <Container>
      <div style={{ padding: "var(--s-6) 0" }}>
        <PageHeader
          title="Wizard"
          subtitle={
            stage === "questions"
              ? "Schritt 1 (optional): Fragen beantworten für eine Startgewichtung."
              : stage === "feintuning"
                ? "Schritt 2 (optional): Feintuning & KO."
                : "Schritt 3 (optional): Zusammenfassung & finale Gewichte (Slider 0–10)."
          }
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {justApplied ? <Badge tone="neutral">Gespeichert</Badge> : null}
              {rightActions}
            </div>
          }

        />

        <WizardTabs
          active={stage}
          onGo={(s) => {
            if (s === stage) return;

            // Wenn von questions direkt in summary: erst questionnaire-baseline setzen
            if (stage === "questions" && (s === "feintuning" || s === "summary")) {
              goStage("feintuning");
              if (s === "summary") {
                // next tick: baseline & stage
                setTimeout(() => goStage("summary"), 0);
              }
              return;
            }

            if (stage === "feintuning" && s === "summary") {
              goStage("summary");
              return;
            }

            // von summary zurück
            if (stage === "summary" && s === "feintuning") {
              setSummaryBaseline(null);
              setStage("feintuning");
              return;
            }
            if (stage === "summary" && s === "questions") {
              setSummaryBaseline(null);
              setStage("questions");
              return;
            }

            goStage(s);
          }}
          disabled={disabledTabs}
        />

        {/* QUESTIONS */}
        {stage === "questions" ? (
          <div style={{ marginTop: "var(--s-5)" }}>
            <Card>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{step.title}</div>
                  {step.helper ? (
                    <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>
                      {step.helper}
                    </div>
                  ) : null}
                </div>

                <div className="wizardOptionsGrid" data-cols={String(cols)} style={{ marginTop: 6 }}>
                  {step.options.map((opt) => {
                    const selected = answers[step.id] === (opt.value as never);


                    return (
                      <OptionCard
                        key={String(opt.value)}
                        title={opt.label}
                        description={opt.helper}
                        selected={selected}

                        onClick={() => setAnswers((a) => ({ ...a, [step.id]: opt.value as never }))}
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
                    {stepIdx < QUESTIONS.length - 1 ? (
                      <Button onClick={() => setStepIdx((i) => i + 1)}>Weiter</Button>
                    ) : (
                      <Button onClick={() => goStage("feintuning")} title="Weiter zu Feintuning (optional)">
                        Weiter: Feintuning
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {/* FEINTUNING */}
        {stage === "feintuning" ? (
          <div style={{ marginTop: "var(--s-5)" }}>
            <Card>
              {/* Buttons TOP (wie gewünscht) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: "var(--s-4)",
                }}
              >
                <Button variant="secondary" onClick={() => setStage("questions")}>
                  Zurueck
                </Button>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="secondary" onClick={resetFeintuningToQuestionnaireBaseline} title="Nur Feintuning zurücksetzen">
                    Feintuning zuruecksetzen
                  </Button>
                  <Button variant="ghost" onClick={applyDraft} title="Speichert die Einstellungen (bleibt im Wizard)">
                    Einstellungen uebernehmen
                  </Button>
                  <Button onClick={() => goStage("summary")}>Weiter: Zusammenfassung</Button>
                </div>
              </div>

              <FeintuningStep
                rails={rails}
                draftPrefs={draftPrefs}
                setDraftPrefs={setDraftPrefs}
                setDirty={setDirty}
              />
            </Card>
          </div>
        ) : null}

        {/* SUMMARY / ADVANCED */}
        {stage === "summary" ? (
          <div style={{ marginTop: "var(--s-5)" }}>
            <Card>
              {/* Buttons TOP */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: "var(--s-4)",
                }}
              >
                <Button variant="secondary" onClick={() => setStage("feintuning")}>
                  Zurueck
                </Button>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="secondary" onClick={resetSummaryToBaseline} disabled={!summaryBaseline}>
                    Zusammenfassung zuruecksetzen
                  </Button>
                  <Button onClick={applyDraft}>Einstellungen uebernehmen</Button>

                </div>
              </div>

              <AdvancedSummaryStep
                tree={tree}
                draftPrefs={draftPrefs}
                setDraftPrefs={setDraftPrefs}
                setDirty={setDirty}
                baseline={summaryBaseline ?? draftPrefs.map((p) => ({ ...p }))}
                resetAllToBaseline={resetSummaryToBaseline}
              />
            </Card>

            {dirty ? (
              <div style={{ marginTop: "var(--s-3)", color: "var(--text-muted)", fontSize: 13 }}>
                Hinweis: Du bist in der Vorschau. Erst mit <strong>„Einstellungen uebernehmen“</strong> wird gespeichert.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <ScrollToTopFab visible={stage === "summary" && showTopFab} />
    </Container>
  );
}

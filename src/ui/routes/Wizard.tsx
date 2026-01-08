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
import {
  ensurePreferencesForTree,
  loadPreferences,
  savePreferences,
  clearPreferences,
  setRelevanceMany,
  setKOMany,
  setKOThresholdMany,
  setWeight,
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

type Stage = "questions" | "feintuning" | "summary";
const KO_THRESHOLD_DEFAULT: 1 | 2 = 2;

function isCompleteAnswers(a: Partial<WizardAnswers>): a is WizardAnswers {
  return QUESTIONS.every((q) => a[q.id] != null);
}

// stabile "Signatur" um Draft vs Applied zu vergleichen (ohne deep-equal libs)
function prefsSignature(prefs: Preference[]): string {
  return prefs
    .slice()
    .sort((a, b) => a.subcriterion_id.localeCompare(b.subcriterion_id))
    .map((p) => {
      const thr = (p.ko_threshold ?? KO_THRESHOLD_DEFAULT) as 1 | 2;
      const ko = p.is_ko ? 1 : 0;
      return `${p.subcriterion_id}:${p.relevance_level}:${ko}:${thr}:${p.weight}`;
    })
    .join("|");
}

function railState(prefs: Preference[], ids: string[]) {
  const set = new Set(ids);
  const items = prefs.filter((p) => set.has(p.subcriterion_id));

  if (items.length === 0) {
    return {
      relevance_level: "nicht_relevant" as const,
      is_ko: false,
      ko_threshold: KO_THRESHOLD_DEFAULT as 1 | 2,
      rel_mixed: true,
      ko_mixed: true,
      thr_mixed: true,
      mixed: true,
    };
  }

  const rel = items[0].relevance_level;
  const ko = !!items[0].is_ko;
  const thr = ((items[0].ko_threshold ?? KO_THRESHOLD_DEFAULT) as 1 | 2);

  const rel_mixed = items.some((x) => x.relevance_level !== rel);
  const ko_mixed = items.some((x) => !!x.is_ko !== ko);
  const thr_mixed = items.some((x) => ((x.ko_threshold ?? KO_THRESHOLD_DEFAULT) as 1 | 2) !== thr);

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
              background: "var(--surface)",
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
  markDraft: () => void;
}) {
  const { rails, draftPrefs, setDraftPrefs, markDraft } = props;

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
    "KO = hartes Muss. Wenn der Score unter dem Mindestscore liegt, gilt das Produkt als KO-Verstoss (Ausschluss).";
  const THRESH_HELP = 'Streng = Mindestscore 2 ("Stark"). Flexibel = Mindestscore 1 ("Ausreichend").';

  const pillSelectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "999px",
    border: "1px solid var(--surface-border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontWeight: 800,
    outline: "none",
  };

  const pillSelectStyleDisabled: React.CSSProperties = {
    ...pillSelectStyle,
    opacity: 0.6,
    cursor: "not-allowed",
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <strong>Feintuning & KO</strong>
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

          const thresholdEnabled = st.is_ko && st.relevance_level !== "nicht_relevant";
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
                    {st.mixed ? <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(gemischt)</span> : null}
                  </div>
                  <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>{r.helper}</div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridAutoFlow: "column",
                    gridAutoColumns: "max-content",
                    gap: 12,
                    alignItems: "end",
                    justifyContent: "end",
                    width: "100%",
                    maxWidth: 520,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 13,
                      color: "var(--text-muted)",
                      minWidth: 165,
                    }}
                    title={relevanceLocked ? "Relevanz ist gelockt, weil KO aktiv ist." : undefined}
                  >
                    Relevanz
                    <select
                      value={st.relevance_level}
                      disabled={relevanceLocked}
                      onChange={(e) => {
                        const level = e.target.value as RelevanceLevel;
                        const next = setRelevanceMany(draftPrefs, r.subcriterion_ids, level);
                        setDraftPrefs(next);
                        markDraft();
                      }}
                      style={relevanceLocked ? pillSelectStyleDisabled : pillSelectStyle}
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
                          const next = setKOMany(draftPrefs, r.subcriterion_ids, e.target.checked);
                          setDraftPrefs(next);
                          markDraft();
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
                      value={String(st.ko_threshold ?? KO_THRESHOLD_DEFAULT)}
                      disabled={!thresholdEnabled}
                      onChange={(e) => {
                        const t = (Number(e.target.value) as 1 | 2) || KO_THRESHOLD_DEFAULT;
                        const next = setKOThresholdMany(draftPrefs, r.subcriterion_ids, t);
                        setDraftPrefs(next);
                        markDraft();
                      }}
                      style={thresholdEnabled ? pillSelectStyle : pillSelectStyleDisabled}
                    >
                      <option value="2">Streng</option>
                      <option value="1">Flexibel</option>
                    </select>
                  </label>

                  {thresholdEnabled && st.thr_mixed ? (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "end" }}>
                      (Mindestscore gemischt)
                    </span>
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
  markDraft: () => void;

  baseline: Preference[];
  resetAllToBaseline: () => void;
}) {
  const { tree, draftPrefs, setDraftPrefs, markDraft, baseline, resetAllToBaseline } = props;

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

  const domains = useMemo(() => {
    const byDomain = new Map<
      string,
      {
        domainId: string;
        domainName: string;
        criteria: Map<string, { id: string; name: string; subs: FlatNode[] }>;
      }
    >();

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

    const ordered: Array<{
      domainId: string;
      domainName: string;
      criteria: Array<{ id: string; name: string; subs: FlatNode[] }>;
    }> = [];

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
  }, [flat, prefById, onlyKO, normalizedQuery, tree, matches]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card>
        <div style={{ display: "grid", gap: 6 }}>
          <strong>Zusammenfassung & Gewichte</strong>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Hier siehst du alles strukturiert nach Domäne. Du kannst Gewichte final per Slider (0–10) anpassen.
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Hinweis: <strong>0</strong> bedeutet „zählt nicht in die Gewichtung“. KO bleibt aktiv, falls gesetzt.
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            KO-Regel: <strong>KO fixiert Gewicht auf 10</strong>.
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

          <Button variant="danger" onClick={resetAllToBaseline}>
            Alle Gewichte zurücksetzen
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

                          const isKoLocked = !!p.is_ko;

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
                                          maxWidth: 420,
                                        }}
                                      >
                                        {s.subDesc}
                                      </div>
                                    ) : null}

                                    <div style={{ marginTop: 6 }}>
                                      Relevanz: <strong>{p.relevance_level}</strong>
                                      {isKoLocked ? (
                                        <span title="KO ist aktiv: Gewicht ist fix auf 10."> · Gewicht fix (10)</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: 12,
                                        color: "var(--text-muted)",
                                      }}
                                    >
                                      <span>Gewicht</span>
                                      <span style={{ fontWeight: 900, color: "var(--text)" }}>{p.weight}</span>
                                    </div>

                                    <input
                                      type="range"
                                      min={0}
                                      max={10}
                                      step={1}
                                      value={p.weight}
                                      disabled={isKoLocked}
                                      onChange={(e) => {
                                        const next = setWeight(draftPrefs, s.subId, Number(e.target.value));
                                        setDraftPrefs(next);
                                        markDraft();
                                      }}
                                      title={isKoLocked ? "KO ist aktiv: Gewicht ist fix auf 10." : "Gewicht 0–10 anpassen"}
                                      style={{
                                        width: 260,
                                        cursor: isKoLocked ? "not-allowed" : "pointer",
                                        opacity: isKoLocked ? 0.6 : 1,
                                      }}
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

  // Applied (Source of Truth für Ranking/Compare/Product)
  const [prefs, setPrefs] = useState<Preference[]>([]);

  // Draft (nur im Wizard)
  const [draftPrefs, setDraftPrefs] = useState<Preference[]>([]);
  const [isDraft, setIsDraft] = useState(false);

  const [showTopFab, setShowTopFab] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  const [answers, setAnswers] = useState<Partial<WizardAnswers>>({});
  const [rails, setRails] = useState<RailConfigItem[]>([]);

  const [stage, setStage] = useState<Stage>("questions");
  const [stepIdx, setStepIdx] = useState(0);

  // Baseline für Summary-Reset = Snapshot beim Eintritt in Summary
  const [summaryBaseline, setSummaryBaseline] = useState<Preference[] | null>(null);

  useEffect(() => {
    async function load() {
      const t = await getTree();
      setTree(t);

      const stored = loadPreferences();
      const ensured = ensurePreferencesForTree(t, stored);

      setPrefs(ensured);
      setDraftPrefs(ensured);
      setIsDraft(false);
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

    const onScroll = () => setShowTopFab(window.scrollY > 600);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [stage]);

  const complete = isCompleteAnswers(answers);

  const wizardPreview = useMemo(() => {
    if (!tree) return null;
    if (!complete) return { next: prefs, summary: [] as string[] };

    return applyWizardAnswers({
      tree,
      preferences: prefs,
      answers: answers as WizardAnswers,
      rails,
    });
  }, [tree, prefs, answers, rails, complete]);

  const hasChanges = useMemo(() => {
    return prefsSignature(prefs) !== prefsSignature(draftPrefs);
  }, [prefs, draftPrefs]);

  function markDraft() {
    if (!isDraft) setIsDraft(true);
  }

  function discardDraft() {
    setDraftPrefs(prefs);
    setIsDraft(false);
    setSummaryBaseline(null);
  }

  function confirmDiscardIfNeeded(): boolean {
    if (!hasChanges) return true;
    return window.confirm("Du hast ungespeicherte Änderungen. Änderungen verwerfen?");
  }

  function resetAll() {
    if (hasChanges) {
      const ok = window.confirm("Alles zurücksetzen? (Das löscht auch gespeicherte Einstellungen.)");
      if (!ok) return;
    }

    setAnswers({});
    setStepIdx(0);
    setStage("questions");
    setSummaryBaseline(null);

    setIsDraft(false);

    clearPreferences();
    const neutral = tree ? ensurePreferencesForTree(tree, []) : [];
    setPrefs(neutral);
    setDraftPrefs(neutral);
  }

  function continueWithDefaults() {
    const msg = hasChanges
      ? "Ohne Wizard fortfahren?\n\nDu hast ungespeicherte Änderungen – diese würden verworfen."
      : "Ohne Wizard fortfahren?\n\nDu nutzt Standardwerte (oder bereits gespeicherte). Du kannst später jederzeit anpassen.";

    const ok = window.confirm(msg);
    if (!ok) return;

    if (hasChanges) discardDraft();
    nav("/ranking");
  }

  function skipQuestionnaire() {
    // optional: keine Drafts erzeugen – direkt in Feintuning mit aktuellem Stand
    if (!confirmDiscardIfNeeded()) return;
    discardDraft();
    setStage("feintuning");
    setSummaryBaseline(null);
  }

  function applyDraft() {
    if (!tree) return;

    savePreferences(draftPrefs); // normalisiert beim Speichern (via preferences.ts)
    localStorage.setItem("wizard_completed", "true");

    // direkt wieder aus storage ziehen -> applied == wirklich gespeicherter Stand
    const stored = loadPreferences();
    const ensured = ensurePreferencesForTree(tree, stored);

    setPrefs(ensured);
    setDraftPrefs(ensured);
    setIsDraft(false);

    setJustApplied(true);
    window.setTimeout(() => setJustApplied(false), 1800);
  }

  function goStage(target: Stage) {
    if (!wizardPreview) {
      setStage(target);
      return;
    }

    if (target === stage) return;

    // wenn Draft-Änderungen existieren und ein Wechsel potentiell verwirrt: warnen
    // (wir halten es minimal: warnen nur, wenn wirklich Änderungen existieren)
    if (hasChanges) {
      const ok = window.confirm("Du hast ungespeicherte Änderungen. Trotzdem wechseln?");
      if (!ok) return;
    }

    if (target === "questions") {
      setSummaryBaseline(null);
      setStage("questions");
      return;
    }

    if (target === "feintuning") {
      // Feintuning startet aus Questionnaire-Preview (wenn komplett) – sonst aus applied
      setDraftPrefs(wizardPreview.next);
      setIsDraft(false);
      setSummaryBaseline(null);
      setStage("feintuning");
      return;
    }

    // target === "summary"
    setSummaryBaseline(draftPrefs.map((p) => ({ ...p })));
    setStage("summary");
  }

  function goBack() {
    if (stage === "questions") {
      setStepIdx((i) => Math.max(0, i - 1));
      return;
    }

    if (stage === "feintuning") {
      if (!confirmDiscardIfNeeded()) return;
      setStage("questions");
      setSummaryBaseline(null);
      return;
    }

    // summary -> feintuning
    if (!confirmDiscardIfNeeded()) return;
    setStage("feintuning");
    setSummaryBaseline(null);
  }

  function goNext() {
    if (stage === "questions") {
      if (stepIdx < QUESTIONS.length - 1) {
        setStepIdx((i) => i + 1);
      } else {
        goStage("feintuning");
      }
      return;
    }

    if (stage === "feintuning") {
      goStage("summary");
      return;
    }
  }

  function resetFeintuningToQuestionnaireBaseline() {
    const baseline = wizardPreview?.next ?? prefs;
    setDraftPrefs(baseline);
    markDraft();
  }

  function resetSummaryToBaseline() {
    if (!summaryBaseline) return;
    setDraftPrefs(summaryBaseline.map((p) => ({ ...p })));
    markDraft();
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

  const disabledTabs: Partial<Record<Stage, boolean>> = {};

  // konsistente Header-Bar (statt stage-spezifischer “Footer”-Navigation)
  const headerBar = (
    <div
      style={{
        marginTop: "var(--s-4)",
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button
          variant="primary"
          onClick={goBack}
          disabled={stage === "questions" && stepIdx === 0}
          title={stage === "questions" ? "Zur vorherigen Frage" : "Zurück"}
        >
          Zurück
        </Button>

        {stage === "questions" ? (
          <Button
            variant="ghost"
            onClick={skipQuestionnaire}
            title="Fragebogen überspringen und mit Feintuning fortfahren"
          >
            Überspringen
          </Button>
        ) : null}

        {stage === "feintuning" ? (
          <Button variant="danger" onClick={resetFeintuningToQuestionnaireBaseline} title="Nur Feintuning zurücksetzen">
            Feintuning zurücksetzen
          </Button>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {hasChanges ? (
          <>
            <Button variant="ghost" onClick={discardDraft} title="Änderungen verwerfen">
              Verwerfen
            </Button>
            <Button onClick={applyDraft} title="Einstellungen speichern">
              Einstellungen übernehmen
            </Button>
          </>
        ) : null}

        {stage !== "summary" ? (
          <Button onClick={goNext}>
            {stage === "questions"
              ? stepIdx < QUESTIONS.length - 1
                ? "Weiter"
                : "Weiter: Feintuning"
              : "Weiter: Zusammenfassung"}
          </Button>
        ) : <Button onClick={() => nav("/ranking")}>Zum Ranking</Button>}
      </div>
    </div>
  );

  const rightActions = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
      {justApplied ? <Badge tone="neutral">Gespeichert</Badge> : null}
      {isDraft && !hasChanges ? <Badge tone="neutral">Vorschau</Badge> : null}
      {hasChanges ? <Badge tone="neutral">Ungespeichert</Badge> : null}

      <Button variant="ghost" onClick={continueWithDefaults} title="Zum Ranking (ohne Wizard)">
        Ohne Wizard fortfahren
      </Button>

      <Button variant="danger" onClick={resetAll}>
        Wizard Zurücksetzen
      </Button>
    </div>
  );

  return (
    <Container>
      <div style={{ padding: "var(--s-6) 0" }}>
        <PageHeader
          title="Wizard"
          subtitle={
            stage === "questions"
              ? "Schritt 1: Fragen beantworten für eine Startgewichtung."
              : stage === "feintuning"
                ? "Schritt 2: Feintuning & KO."
                : "Schritt 3: Zusammenfassung & finale Gewichte."
          }
          right={rightActions}
        />

        <WizardTabs
          active={stage}
          onGo={(s) => {
            // Tabs sind Navigation -> sauberer Stage Switch
            goStage(s);
          }}
          disabled={disabledTabs}
        />

        {headerBar}

        {/* QUESTIONS */}
        {stage === "questions" ? (
          <div style={{ marginTop: "var(--s-5)" }}>
            <Card>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{step.title}</div>
                  {step.helper ? (
                    <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>{step.helper}</div>
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
                        onClick={() => {
                          setAnswers((a) => ({ ...a, [step.id]: opt.value as never }));
                          // Fragebogen ist “Draft im Wizard”, aber erst Apply schreibt wirklich
                          markDraft();
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {/* FEINTUNING */}
        {stage === "feintuning" ? (
          <div style={{ marginTop: "var(--s-5)" }}>
            <FeintuningStep
              rails={rails}
              draftPrefs={draftPrefs}
              setDraftPrefs={setDraftPrefs}
              markDraft={markDraft}
            />
          </div>
        ) : null}

        {/* SUMMARY */}
        {stage === "summary" ? (
          <div style={{ marginTop: "var(--s-5)" }}>
            <AdvancedSummaryStep
              tree={tree}
              draftPrefs={draftPrefs}
              setDraftPrefs={setDraftPrefs}
              markDraft={markDraft}
              baseline={summaryBaseline ?? draftPrefs.map((p) => ({ ...p }))}
              resetAllToBaseline={resetSummaryToBaseline}
            />

            {hasChanges ? (
              <div style={{ marginTop: "var(--s-3)", color: "var(--text-muted)", fontSize: 13 }}>
                Hinweis: Du bist in der Vorschau. Erst mit <strong>„Einstellungen übernehmen“</strong> wird gespeichert.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <ScrollToTopFab visible={stage === "summary" && showTopFab} />
    </Container>
  );
}

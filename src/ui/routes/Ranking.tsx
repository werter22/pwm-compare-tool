import { useEffect, useMemo, useState } from "react";
import type { Product, Score, Tree, Preference } from "../../domain/types";
import { getProducts, getScores, getTree } from "../../api/repo";
import { evaluateProducts } from "../../engine/evaluate";
import { ensurePreferencesForTree, loadPreferences, savePreferences } from "../../state/preferences";
import { loadCompareSelection, toggleCompareSelection } from "../../state/compare";
import { Link} from "react-router-dom";

import Container from "../components/Container";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
const SHOW_REST_KEY = "ranking_show_rest_products";


function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        marginTop: "var(--s-3)",
        height: 10,
        background: "var(--surface-2, #e5e7eb)",
        borderRadius: "var(--r-pill)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          width: `${v}%`,
          height: "100%",
          background: "var(--accent)",
          borderRadius: "var(--r-pill)",
        }}
      />
    </div>
  );
}

function resolveLogoUrl(logoUrl?: string) {
  if (!logoUrl) return null;
  const u = logoUrl.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
  return `${import.meta.env.BASE_URL}${u.replace(/^\//, "")}`;
}

function ProductLogo({ p }: { p: Product }) {
  const url = resolveLogoUrl(p.logoUrl);
  const initials =
    (p.name ?? "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "white",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        flex: "0 0 auto",
      }}
      title={p.name}
    >
      {url ? (
        <img
          src={url}
          alt={`${p.name} Logo`}
          style={{ width: 24, height: 24, objectFit: "contain" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span style={{ fontWeight: 900, fontSize: 12, color: "var(--text-muted)" }}>{initials}</span>
      )}
    </div>
  );
}

type RankedRow = { p: Product; score: number; koCount: number };

function ProductCardRow({
  row,
  compareIds,
  setCompareIds,
}: {
  row: RankedRow;
  compareIds: string[];
  setCompareIds: (ids: string[]) => void;
}) {
  const { p, score, koCount } = row;
  const selected = compareIds.includes(p.id);
  const canOpenCompare = selected && compareIds.length >= 2;

  return (
    <Card>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <ProductLogo p={p} />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 18, margin: 0 }}>{p.name}</h3>
          </div>
        </div>

        {/* Score + KO nebeneinander */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
          {koCount > 0 ? <Badge tone="warn">{`KO: ${koCount}`}</Badge> : null}
          <div style={{ fontWeight: 900, fontSize: 16 }}>{score} / 100</div>
        </div>
      </div>

      <ProgressBar value={score} />

      {/* Actions: 2 Zeilen, Link rechts bündig zur Button-Kante */}
      {/* Actions: Grid, damit "Vergleich öffnen" exakt unter dem Compare-Button sitzt */}
      <div
        style={{
          marginTop: "var(--s-4)",
          display: "grid",
          gridTemplateColumns: "auto auto",
          justifyContent: "start",
          gap: 8,
          alignItems: "start",
        }}
      >
        {/* Links: Details */}
        <div>
          <Link to={`/product/${p.id}`} style={{ textDecoration: "none" }}>
            <Button>Details</Button>
          </Link>
        </div>

        {/* Rechts: Compare Button */}
        <div>
          <Button
            variant={selected ? "primary" : "secondary"}
            onClick={() => {
              const nextIds = toggleCompareSelection(p.id);
              setCompareIds(nextIds);
            }}
            title="Für Vergleich auswählen (max. 3)"
          >
            {selected ? "Für Vergleich gewählt" : "Vergleichen"}
          </Button>
        </div>

        {/* Rechts darunter: Vergleich öffnen (nur wenn sinnvoll) */}
        {canOpenCompare ? (
          <>
            <div /> {/* leere linke Zelle */}
            <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: 4, marginTop: -10 }}>
              <Link
                to="/compare"
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  color: "var(--accent)",
                  textDecoration: "none",
                  padding: "6px 0",
                }}
                title="Vergleich öffnen"
              >
                Vergleich öffnen →
              </Link>
            </div>
          </>
        ) : null}
      </div>


      {koCount > 0 && (
        <div
          style={{
            marginTop: "var(--s-3)",
            padding: "10px 12px",
            borderRadius: "var(--r-sm)",
            background: "var(--warn-bg)",
            border: "1px solid var(--border)",
            color: "var(--warn-fg)",
            fontSize: 13,
          }}
        >
          Dieses Produkt fällt durch mindestens ein KO-Kriterium. Nutze „Nur ohne KO-Verstoss“, um es auszublenden.
        </div>
      )}
    </Card>
  );
}

export default function Ranking() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tree, setTree] = useState<Tree | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [onlyNoKO, setOnlyNoKO] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>(loadCompareSelection());

  const [showRest, setShowRest] = useState<boolean>(() => {
    return sessionStorage.getItem(SHOW_REST_KEY) === "1";
  });


  useEffect(() => {
    sessionStorage.setItem(SHOW_REST_KEY, showRest ? "1" : "0");
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
  }, [showRest]);

  const evals = useMemo(() => {
    if (!tree) return [];
    return evaluateProducts({ products, tree, scores, preferences: prefs });
  }, [products, tree, scores, prefs]);

  const evalMap = useMemo(() => new Map(evals.map((e) => [e.product_id, e])), [evals]);

  const visibleProducts = useMemo(() => {
    if (!onlyNoKO) return products;
    return products.filter((p) => (evalMap.get(p.id)?.ko_violations.length ?? 0) === 0);
  }, [products, onlyNoKO, evalMap]);

  const rankedVisible: RankedRow[] = useMemo(() => {
    return [...visibleProducts]
      .map((p) => {
        const ev = evalMap.get(p.id);
        const score = Math.round(ev?.total_norm_0_100 ?? 0);
        const koCount = ev?.ko_violations.length ?? 0;
        return { p, score, koCount };
      })
      .sort((a, b) => b.score - a.score);
  }, [visibleProducts, evalMap]);

  const top3 = rankedVisible.slice(0, 3);
  const top3Ids = useMemo(() => new Set(top3.map((x) => x.p.id)), [top3]);

  const restRanked = useMemo(() => rankedVisible.filter((x) => !top3Ids.has(x.p.id)), [rankedVisible, top3Ids]);

  if (!tree) {
    return (
      <Container>
        <div style={{ padding: "var(--s-6) 0" }}>
          <PageHeader title="Ranking" subtitle="Lade Daten…" />
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div style={{ padding: "var(--s-6) 0" }}>
        <PageHeader
          title="Ranking"
          subtitle="Top-Empfehlungen basierend auf deinen aktuellen Gewichten und KO-Kriterien."
          right={
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                userSelect: "none",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              <input type="checkbox" checked={onlyNoKO} onChange={(e) => setOnlyNoKO(e.target.checked)} />
              Nur ohne KO-Verstoss
            </label>
          }
        />

        {/* Top Empfehlungen */}
        <div style={{ marginTop: "var(--s-5)" }}>
          <h2 style={{ marginTop: 0, paddingBottom: "var(--s-3)" }}>Top Empfehlungen</h2>

          {top3.length === 0 ? (
            <Card>
              <p style={{ margin: 0, color: "var(--text-muted)" }}>
                Mit den aktuellen Filtern bleibt kein Produkt übrig. Deaktiviere „Nur ohne KO-Verstoss“ oder lockere KO-Kriterien.
              </p>
            </Card>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, 340px)",
                gap: 12,
                justifyContent: "start",
              }}
            >
              {top3.map((row) => (
                <ProductCardRow key={row.p.id} row={row} compareIds={compareIds} setCompareIds={setCompareIds} />
              ))}
            </div>

          )}
        </div>

        {/* Alle weiteren Produkte */}
        <div style={{ marginTop: "var(--s-5)" }}>
          <details
            open={showRest}
            onToggle={(e) => {
              const next = (e.currentTarget as HTMLDetailsElement).open;
              setShowRest(next);
              sessionStorage.setItem(SHOW_REST_KEY, next ? "1" : "0");
            }}
            style={{ borderRadius: "var(--r-sm)" }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--accent)" }}>
              {showRest ? "Alle weiteren Produkte ausblenden" : `Alle weiteren Produkte anzeigen (${restRanked.length})`}
            </summary>

            <div
              style={{
                marginTop: "var(--s-4)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, 340px)",
                gap: 12,
                justifyContent: "start",
              }}
            >
              {restRanked.map((row) => (
                <ProductCardRow key={row.p.id} row={row} compareIds={compareIds} setCompareIds={setCompareIds} />
              ))}
            </div>

          </details>

        </div>
      </div>
    </Container>
  );
}

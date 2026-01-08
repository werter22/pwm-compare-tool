import { Link } from "react-router-dom";

import Container from "../components/Container";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";

function LinkButton({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <Button variant={variant}>{children}</Button>
    </Link>
  );
}

export default function Home() {
  return (
    <Container>
      <div style={{ padding: "var(--s-6) 0" }}>
        <PageHeader
          title="Passwortmanager vergleichen"
          subtitle="Nachweisbasierte Scores (read-only). Du steuerst Relevanz, Gewichte und KO-Kriterien um den für dich besten Passwortmanager zu finden."
        />

        {/* Primary entry cards */}
        <div
          style={{
            marginTop: "var(--s-6)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "var(--s-4)",
            alignItems: "stretch",
          }}
        >
          <Card style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.01em" }}>
                In 2 Minuten zur Empfehlung
              </h2>
              <Badge tone="ok">Quickstart</Badge>
            </div>

            <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              Der Wizard führt dich in <strong>3 optionalen Schritten</strong> zu einer passenden Gewichtung:
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 2 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Badge tone="neutral">1</Badge>
                <div>
                  <strong>Fragebogen</strong>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Setzt eine sinnvolle Startgewichtung.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Badge tone="neutral">2</Badge>
                <div>
                  <strong>Feintuning</strong>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Relevanz korrigieren, KO-Kriterien setzen.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Badge tone="neutral">3</Badge>
                <div>
                  <strong>Zusammenfassung</strong>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Alle Unterkriterien als Übersicht + Slider.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "var(--s-3)" }}>
              <LinkButton to="/wizard">Wizard starten</LinkButton>
            </div>

            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>
              Hinweis: Änderungen wirken erst, wenn du im Wizard auf <strong>„Einstellungen übernehmen“</strong> klickst.
            </div>
          </Card>

          <Card style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.01em" }}>
                Direkt loslegen
              </h2>
            </div>

            <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              Du kannst jederzeit mit <strong>Standardwerten</strong> starten (alle Gewichte gleich) und später im Wizard anpassen.
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <LinkButton to="/ranking">Zum Ranking</LinkButton>
            </div>

            <Card
              style={{
                padding: "var(--s-3)",
                background: "var(--muted)",
                border: "1px solid var(--border)",
                boxShadow: "none",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Tipp</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                Starte im Ranking, entferne Produkte, schalte „Nur Unterschiede“ oder „Kompakt“ ein und gehe
                bei Bedarf zurück in den Wizard für Gewichtung & KO.
              </div>
            </Card>
          </Card>
        </div>

        {/* Feature grid */}
        <div style={{ marginTop: "var(--s-6)" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Was macht dieses Tool stark?</h2>
          <div
            style={{
              marginTop: "var(--s-4)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "var(--s-4)",
            }}
          >
            <Card style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>Nachweisbasiert</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                Jeder Score ist mit Audit-Kommentar und Evidence-Links begründet.
              </div>
            </Card>

            <Card style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>KO-Kriterien</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                Definiere harte Muss-Anforderungen – bei Verstoss fliegt ein Produkt aus der Empfehlung.
              </div>
            </Card>

            <Card style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>Vergleich & Deep Dive</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                Kompakter Compare-Modus für schnellen Scan, Detailansicht für Begründungen & Quellen.
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Container>
  );
}

import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Passwortmanager vergleichen (Prototyp)</h1>
      <p style={{ color: "#555", maxWidth: 780 }}>
        Die Scores sind nachweisbasiert (read-only). Du steuerst Relevanz, Gewichte und KO-Kriterien – und siehst live, wie sich das Ranking verändert.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 16 }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>In 2 Minuten zur Empfehlung</h2>
          <p style={{ color: "#555" }}>
            Wizard beantwortet ein paar Fragen und setzt sinnvolle Gewichte sowie (optional) KO-Kriterien.
          </p>
          <Link
            to="/wizard"
            style={{ display: "inline-block", padding: "10px 12px", borderRadius: 10, background: "#111", color: "#fff", textDecoration: "none", fontWeight: 600 }}
          >
            Wizard starten
          </Link>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Direkt ins Ranking</h2>
          <p style={{ color: "#555" }}>
            Für Profis oder wenn du schon weisst, was du willst: Ranking ansehen, Details prüfen, vergleichen.
          </p>
          <Link to="/ranking">Zum Ranking</Link>
          <p style={{ marginTop: 8, color: "#555" }}>
            Tipp: Nach dem Wizard kannst du im Result-Screen unter „Erweitert“ noch Feintuning machen.
          </p>

        </section>
      </div>
    </main>
  );
}

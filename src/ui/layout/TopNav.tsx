import { NavLink, useLocation } from "react-router-dom";
import Container from "../components/Container";
import Button from "../components/Button";

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        padding: "8px 10px",
        borderRadius: "var(--r-sm)",
        textDecoration: "none",
        color: "var(--text)",
        background: isActive ? "var(--muted)" : "transparent",
        border: isActive ? "1px solid var(--border)" : "1px solid transparent",
        fontWeight: 600,
        fontSize: 14,
      })}
    >
      {label}
    </NavLink>
  );
}

export default function TopNav() {
  const loc = useLocation();

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--border)" }}>
      <Container>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <strong style={{ letterSpacing: "-0.01em" }}>PWM Vergleich</strong>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Prototyp</span>
          </div>

          <nav style={{ display: "flex", gap: 6, marginLeft: 8 }}>
            <TabLink to="/ranking" label="Ranking" />
            <TabLink to="/compare" label="Vergleich" />
          </nav>

          <div style={{ flex: 1 }} />

          {/* CTA */}
          <NavLink to="/wizard" style={{ textDecoration: "none" }}>
            <Button variant="primary">
              {loc.pathname.startsWith("/wizard") ? "Wizard" : "Wizard starten"}
            </Button>
          </NavLink>
        </div>
      </Container>
    </header>
  );
}

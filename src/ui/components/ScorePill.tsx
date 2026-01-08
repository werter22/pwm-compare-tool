import type { ScoreValue } from "../../domain/types";

function labelForScore(s: ScoreValue) {
  if (s === 2) return "Stark";
  if (s === 1) return "Ausreichend";
  return "Schwach";
}

export default function ScorePill({ score }: { score: ScoreValue }) {
  const label = labelForScore(score);

  // gleiche Optik wie vorher – nur Farben aus Tokens
  const bg = score === 2 ? "var(--ok-bg)" : score === 1 ? "var(--warn-bg)" : "var(--crit-bg)";
  const border = score === 2 ? "var(--ok-border)" : score === 1 ? "var(--warn-border)" : "var(--crit-border)";

  return (
    <span
      title={`${score} = ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text)",
      }}
    >
      <span style={{ width: 18, textAlign: "center" }}>{score}</span>
      <span>{label}</span>
    </span>
  );
}

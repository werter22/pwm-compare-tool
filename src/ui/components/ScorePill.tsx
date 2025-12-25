import type { ScoreValue } from "../../domain/types";

function labelForScore(s: ScoreValue) {
  if (s === 2) return "Stark";
  if (s === 1) return "Ausreichend";
  return "Kritisch";
}

export default function ScorePill({ score }: { score: ScoreValue }) {
  const label = labelForScore(score);

  const bg =
    score === 2 ? "#e7f7ea" :
    score === 1 ? "#fff4d6" :
    "#ffe5e5";

  const border =
    score === 2 ? "#7fd18c" :
    score === 1 ? "#f0c36a" :
    "#e38a8a";

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
        fontWeight: 600
      }}
    >
      <span style={{ width: 18, textAlign: "center" }}>{score}</span>
      <span>{label}</span>
    </span>
  );
}

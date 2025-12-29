import Card from "./Card";

export default function OptionCard({
  title,
  description,
  selected,
  onClick,
  badge,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        cursor: "pointer",
        outline: selected ? "2px solid var(--accent)" : "2px solid transparent",
        outlineOffset: 2,
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>{title}</div>

          {description ? (
            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.35 }}>
              {description}
            </div>
          ) : null}
        </div>

        {badge ? <div style={{ flex: "0 0 auto" }}>{badge}</div> : null}
      </div>
    </Card>
  );
}

export type WizardAnswers = {
  sensitivity: "normal" | "sensibel" | "reguliert";
  dataResidency: "egal" | "eu" | "ch_eu" | "ch";
  hosting: "saas_ok" | "self_host_nice" | "self_host_ko";
  sso: "nicht_noetig" | "gut" | "zwingend";
  teamSize: "lt20" | "20_200" | "gt200";
  support: "standard" | "wichtig" | "sehr_wichtig";
  costFocus: "kosten" | "balance" | "security";
};

export const DEFAULT_ANSWERS: WizardAnswers = {
  sensitivity: "sensibel",
  dataResidency: "ch_eu",
  hosting: "saas_ok",
  sso: "gut",
  teamSize: "20_200",
  support: "wichtig",
  costFocus: "balance"
};

export type WizardQuestion = {
  id: keyof WizardAnswers;
  title: string;
  helper?: string;
  options: Array<{ value: WizardAnswers[keyof WizardAnswers]; label: string; helper?: string }>;
};

export const QUESTIONS: WizardQuestion[] = [
  {
    id: "sensitivity",
    title: "Wie sensibel sind eure Daten und Zugänge?",
    helper: "Das beeinflusst, wie stark wir Sicherheit, Nachweise und Vorfall-Resilienz gewichten.",
    options: [
      { value: "normal", label: "Normal" },
      { value: "sensibel", label: "Sensibel (Kundendaten, Admin-Zugänge)" },
      { value: "reguliert", label: "Sehr sensibel / reguliert (z. B. Finanz, Gesundheit)" }
    ]
  },
  {
    id: "dataResidency",
    title: "Wo sollen eure Daten idealerweise liegen?",
    helper: "Wir setzen daraus Prioritäten für Datenresidenz/Jurisdiktion.",
    options: [
      { value: "egal", label: "Egal" },
      { value: "eu", label: "EU reicht" },
      { value: "ch_eu", label: "Schweiz oder EU (CH/EU)" },
      { value: "ch", label: "Schweiz (CH)" }
    ]
  },
  {
    id: "hosting",
    title: "Betriebsmodell",
    helper: "Wenn etwas zwingend ist, setzen wir es als Zwingend (KO).",
    options: [
      { value: "saas_ok", label: "SaaS ist ok" },
      { value: "self_host_nice", label: "Self-Hosting wäre gut (nice-to-have)" },
      { value: "self_host_ko", label: "Self-Hosting ist zwingend (Zwingend/KO)" }
    ]
  },
  {
    id: "sso",
    title: "Zentrale Anmeldung (SSO)",
    helper: "Für KMU oft ein grosser Hebel für Sicherheit und Adoption.",
    options: [
      { value: "nicht_noetig", label: "Brauchen wir nicht" },
      { value: "gut", label: "Wäre gut zu haben" },
      { value: "zwingend", label: "Zwingend (Zwingend/KO)" }
    ]
  },
  {
    id: "teamSize",
    title: "Teamgroesse",
    helper: "Ab mittleren Teams werden SCIM/Provisioning und Rollen oft wichtiger.",
    options: [
      { value: "lt20", label: "< 20" },
      { value: "20_200", label: "20–200" },
      { value: "gt200", label: "> 200" }
    ]
  },
  {
    id: "support",
    title: "Support & Verfuegbarkeit",
    helper: "Gewichtet SLA, Status/Incident-Handling und Betrieb.",
    options: [
      { value: "standard", label: "Standard reicht" },
      { value: "wichtig", label: "Wichtig" },
      { value: "sehr_wichtig", label: "Sehr wichtig" }
    ]
  },
  {
    id: "costFocus",
    title: "Kostenfokus",
    helper: "Beinflusst, wie stark TCO/Kostenbestandteile gewichtet werden.",
    options: [
      { value: "kosten", label: "Kosten im Vordergrund" },
      { value: "balance", label: "Balance" },
      { value: "security", label: "Sicherheit vor Kosten" }
    ]
  }
];

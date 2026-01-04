# PWM Compare Tool (Prototype)

Nachweisbasierter Password-Manager-Vergleich mit **Wizard (Gewichtung + KO)**, **Ranking**, **Compare** und **Product Detail**.

- **Scores** sind read-only und werden pro Subkriterium mit **Audit-Kommentar** & **Evidence-Links** begründet.
- **Wizard** führt optional durch **Startgewichtung → Feintuning (KO/Relevant) → Zusammenfassung (Slider 0–10)**.
- **Draft-Mode**: Änderungen wirken erst nach **„Einstellungen übernehmen“**.

---

## Demo (GitHub Pages)

- **Live Prototype:** https://werter22.github.io/pwm-compare-tool/#/wizard

---

## Was dieses Tool löst

Viele Vergleiche sind Bauchgefühl oder Marketing. Dieses Tool setzt auf:

- **Transparenz:** jeder Score hat Begründung + Quellen
- **Kontrolle:** du bestimmst Relevanz, Gewichte und KO-Kriterien
- **Progressive Disclosure:** Anfänger nutzen den **Fragebogen** für eine personalisierte Empfehlung, Feintuning/Slider sind optional für Fortgeschrittene

---

## How to use (in 60 Sekunden)

### 1) Vanilla Start (ohne Wizard)
- Öffne **Ranking**
- Standardmäßig sind alle Subkriterien **gleich gewichtet** (neutral)
- Vergleiche Produkte, öffne Details, nutze Compare

### 2) Wizard (optional, empfohlen)
Der Wizard ist in **3 optionale Schritte** gegliedert:

1. **Fragebogen** – setzt eine sinnvolle Startgewichtung  
2. **Feintuning** – KO & Relevanz für Themenblöcke (Rails)  
3. **Zusammenfassung** – komplette Übersicht: Domain → Kriterium → Subkriterium + Slider (0–10)

> Du kannst jeden Schritt überspringen. Wenn alles übersprungen wird, bleibt alles **neutral**.

---

## Features

### Wizard (Draft-Mode / Reset-Logik)
- **Reset** = alles neutral / blank
- **Entwurf**: Änderungen im Wizard sind zunächst Vorschau
- Erst **„Einstellungen übernehmen“** speichert und beeinflusst Ranking/Compare

### KO-Kriterien
- KO = „hartes Muss“
- Wenn ein Subkriterium als KO markiert ist und `score < ko_threshold` → **KO-Verstoß**
- KO hilft, Tools auszuschließen, die kritische Mindestanforderungen nicht erfüllen

### Compare & Product Detail
- **Kompakt** ist Default (Gewicht-Pill nur im Non-Compact Modus)
- Audit-Kommentare sind **expand/collapse**
- **Domain-Themes** helfen beim Scannen

---

## Datenmodell

### Tree
**Domains → Criteria → Subcriteria**

Subcriteria enthalten:
- Scores je Produkt: `0 | 1 | 2`
- `audit_comment`
- `evidence_links[]`
- `short_desc`

### Preferences (pro Subcriterion)
- `relevance_level`: `muss | sollte | kann | nicht_relevant`
- `weight`: `0..10`
- `is_ko`: boolean
- `ko_threshold`: number (z.B. 2)

---

## Scoring (High-Level)

- Ein Subkriterium hat `score ∈ {0,1,2}`
- `weight` (0–10) skaliert den Einfluss auf den Gesamtscore
- `weight = 0` bedeutet: zählt nicht in die Gewichtung  
  (KO kann trotzdem aktiv bleiben, falls gesetzt)

> Das exakte Verhalten bei KO (Ausschluss vs. harte Abwertung) hängt von der Ranking-Implementierung ab.

---

## Tech Stack

- React 19 + TypeScript (strict)
- Vite
- React Router (`react-router-dom`)
- ESLint

---

## Local Development

### Voraussetzungen
- Node.js >= 18 empfohlen
- npm (oder kompatibler Package Manager)

### Install
```bash
npm install

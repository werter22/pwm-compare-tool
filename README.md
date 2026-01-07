# PWM Compare Tool (Prototype)

Nachweisbasierter Password-Manager-Vergleich mit **Wizard (Gewichtung + KO)**, **Ranking**, **Compare** und **Product Detail**.

- **Scores** sind read-only und werden pro Subkriterium mit **Audit-Kommentar** & **Evidence-Links** begründet.
- **Wizard** führt optional durch **Startgewichtung → Feintuning (KO/Relevant) → Zusammenfassung (Slider 0–10)**.
- **Draft-Mode**: Änderungen wirken erst nach **„Einstellungen übernehmen“**.

---

## Demo (GitHub Pages)

- **Live Prototype:** https://werter22.github.io/pwm-compare-tool/#/

---

## Was dieses Tool löst

Viele Vergleiche sind Bauchgefühl oder Marketing. Dieses Tool setzt auf:

- **Transparenz:** jeder Score hat Begründung + Quellen
- **Kontrolle:** du bestimmst Relevanz, Gewichte und KO-Kriterien
- **Progressive Disclosure:** Anfänger nutzen den **Fragebogen** für eine personalisierte Empfehlung, Feintuning/Slider sind optional für Fortgeschrittene

---

## How to use (in 60 Sekunden)

### 1) Direktstart (Ranking / ohne Wizard)
- Öffne **Ranking**
- Standardmässig sind alle Subkriterien **gleich gewichtet** (neutral)
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
- Wenn ein Subkriterium als KO markiert ist und `score < ko_threshold` → **KO-Verstoss**
- KO hilft, Tools auszuschliessen, die kritische Mindestanforderungen nicht erfüllen

### Compare & Product Detail
- **Kompakt** ist Default (Gewicht-Pill nur im Non-Compact Modus)
- Audit-Kommentare sind **expand/collapse**
- **Domain-Themes** helfen beim Scannen

---

## Datenmodell & Architektur

### ER-Diagramm

![ERD](docs/diagrams/erd.drawio.svg)

### Tree vs. Scores vs. Preferences

**1) Tree (Taxonomie / Schema)**  
`Domains → Criteria → Subcriteria` definiert *was* bewertet wird.

- `subcriteria[].short_desc` = kurze Beschreibung/Prüfhinweis im UI

**2) Scores (Fakten / read-only)**  
Scores gehören zu **Produkt × Subkriterium**:

- `product_id`
- `subcriterion_id`
- `score` (`0 | 1 | 2`)
- `audit_comment`
- `evidenz_links[]` (EvidenceLinks am ScoreRecord)

**3) Preferences (User Settings)**  
Preferences gehören zu **Subkriterium** (User steuert Wichtigkeit/KO):

- `relevance_level`: `muss | sollte | kann | nicht_relevant`
- `weight`: `0..10`
- `is_ko`: boolean
- `ko_threshold`: number (z.B. 2)

> Relevanz ist UX/Presets; gerechnet wird über `weight` (0–10).

---

## Scoring (High-Level)

- Ein Subkriterium hat `score ∈ {0,1,2}`
- `weight` (0–10) skaliert den Einfluss auf den Gesamtscore
- `weight = 0` bedeutet: zählt nicht in die Gewichtung  

KO:
- Wenn `is_ko=true` und `score < ko_threshold` → KO-Verstoss

> Ob KO ein Produkt komplett ausschliesst oder “hart abwertet” ist in der Ranking-Implementierung definiert.

---

## Fixtures / Datenquellen

Die App lädt Daten aus `public/fixtures/`:

- `products.json` – Produktliste
- `tree.json` – Domains/Kriterien/Subkriterien (+ `short_desc` pro Subkriterium)
- `scores.json` – ScoreRecords (Produkt × Subkriterium) inkl. Evidence
- `rails.config.json` – Gruppen für Feintuning

User Preferences werden im Browser gespeichert (LocalStorage).

---

## Neue Produkte hinzufügen (Kurz-Guide)

1. **Produkt ergänzen:** `public/fixtures/products.json` (`id`, `name`, `logoUrl`)
2. **Scores ergänzen:** pro relevantem `subcriterion_id` einen ScoreRecord in `public/fixtures/scores.json`
3. **Evidence:** pro ScoreRecord `evidenz_links[]` mit `{ label, url }`
4. **Qualität:** Audit-Kommentar + belastbare Quellen, konsistente Abdeckung über Subkriterien

---

## Tech Stack

- React 19 + TypeScript (strict)
- Vite

---

## Local Development

### Voraussetzungen
- Node.js >= 18 empfohlen
- npm (oder kompatibler Package Manager)

### Install
```bash
npm install

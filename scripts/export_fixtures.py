import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from openpyxl import load_workbook

INPUT = Path("scripts/input/Passwortmanagement_Kriterienkatalog.xlsx")
OUTDIR = Path("public/fixtures")
OUT_TREE = OUTDIR / "tree.json"
OUT_PRODUCTS = OUTDIR / "products.json"
OUT_SCORES = OUTDIR / "scores.json"

# Excel-Domänenüberschriften -> UI-Domänen
DOMAIN_MAP = {
    "Security & Compliance": ("d1", "Sicherheit & Compliance"),
    "Datenhoheit, Lieferkette & Governance": ("d2", "Datenhoheit, Lieferkette & Governance"),
    "Produkt, Betrieb & Adoption": ("d3", "Produkt, Betrieb & Adoption"),
}

NON_PRODUCT_SHEETS = {
    "Kriterienkatalog",
    "Security & Compliance",
    "Datenhoheit, Lieferkette & Gove",
    "Produkt, Betrieb & Adoption_x0009_",
    "Vorlage",
    "Stammdaten",
    "Mastersheet",
}

CHAPTER_RE = re.compile(r"^\d+(\.\d+)+$")  # z.B. 3.1.1

def slug(s: str) -> str:
    s = (s or "").strip().lower()
    s = (s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss"))
    s = s.replace("&", " und ")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")

def is_empty(v: Any) -> bool:
    return v is None or str(v).strip() == ""

def split_evidence(raw: Any) -> List[str]:
    if is_empty(raw):
        return []
    s = str(raw).strip()
    # split on newline and semicolon
    parts = re.split(r"[\n;]+", s)
    parts = [p.strip() for p in parts if p.strip()]
    return parts

def parse_evidence_links(evid_raw: Any, fundstelle: Any = None) -> List[Dict[str, str]]:
    parts = split_evidence(evid_raw)
    fund = "" if is_empty(fundstelle) else str(fundstelle).strip()

    links: List[Dict[str, str]] = []
    for p in parts:
        # patterns:
        # - "Label: https://..."
        # - "https://..."
        m = re.search(r"(https?://\S+)", p)
        if m:
            url = m.group(1).rstrip(").,")
            label = p.replace(url, "").strip(" :-–—\t")
            if not label:
                label = "Quelle"
            if fund:
                label = f"{label} – {fund}"
            links.append({"label": label, "url": url})
        else:
            # Text ohne URL: trotzdem als Evidenz aufnehmen (url leer)
            label = p
            if fund:
                label = f"{label} – {fund}"
            links.append({"label": label, "url": ""})
    return links

def find_header_row(ws, max_rows=80, max_cols=25) -> Tuple[int, Dict[str, int]]:
    """
    Sucht die Headerzeile anhand von "ID (Kapitel)" und baut Map Header->Spaltenindex (1-basiert).
    """
    for r in range(1, max_rows + 1):
        row_vals = [ws.cell(r, c).value for c in range(1, max_cols + 1)]
        row_norm = [str(v).strip() if isinstance(v, str) else v for v in row_vals]
        if "ID (Kapitel)" in row_norm and "Unterkriterium" in row_norm:
            col_map: Dict[str, int] = {}
            for idx, v in enumerate(row_norm, start=1):
                if isinstance(v, str) and v.strip():
                    col_map[v.strip()] = idx
            return r, col_map
    raise RuntimeError(f"Headerzeile nicht gefunden in Sheet '{ws.title}'")

def iter_data_rows(ws, header_row: int):
    for r in range(header_row + 1, ws.max_row + 1):
        yield r

def parse_tree_from_template(ws) -> Dict[str, Any]:
    header_row, cols = find_header_row(ws)

    # wir erwarten mind. diese Spalten
    col_id = cols.get("ID (Kapitel)")
    col_crit = cols.get("Kriterium")
    col_sub = cols.get("Unterkriterium")
    col_pruef = cols.get("Prüfverfahren (Zusammenfassung)") or cols.get("Prüfverfahren...one,")  # fallback

    if not (col_id and col_crit and col_sub):
        raise RuntimeError("Notwendige Spalten fehlen im Template (ID/Kriterium/Unterkriterium)")

    domains_out: List[Dict[str, Any]] = []
    domain_by_id: Dict[str, Dict[str, Any]] = {}
    criterion_index: Dict[Tuple[str, str], Dict[str, Any]] = {}

    current_domain_id: Optional[str] = None
    current_domain: Optional[Dict[str, Any]] = None
    current_criterion_name: Optional[str] = None
    current_criterion_key: Optional[str] = None  # z.B. "3.1"
    current_criterion_id: Optional[str] = None

    # Domain-Heading steht in der Vorlage oft in Spalte A, oberhalb der Headerzeile oder zwischen Blöcken.
    # Wir scannen alle Zeilen; wenn in Spalte A ein Domain-Name steht, wechseln wir den Domain-Kontext.
    for r in range(1, ws.max_row + 1):
        a = ws.cell(r, 1).value
        if isinstance(a, str) and a.strip() in DOMAIN_MAP:
            did, dname = DOMAIN_MAP[a.strip()]
            current_domain_id = did
            current_domain = domain_by_id.get(did)
            if not current_domain:
                current_domain = {"id": did, "name": dname, "criteria": []}
                domain_by_id[did] = current_domain
                domains_out.append(current_domain)

            # Reset criterion context when domain changes
            current_criterion_name = None
            current_criterion_key = None
            current_criterion_id = None

        # Datenzeilen beginnen erst nach Header
        if r <= header_row:
            continue

        chap = ws.cell(r, col_id).value
        sub = ws.cell(r, col_sub).value
        crit = ws.cell(r, col_crit).value

        if is_empty(chap) or not isinstance(chap, str) or not CHAPTER_RE.match(chap.strip()):
            continue
        if is_empty(sub) or current_domain is None or current_domain_id is None:
            continue

        chap = chap.strip()
        sub_name = str(sub).strip()

        # Criterion aktualisieren, wenn Zelle befüllt (sonst fortschreiben)
        if not is_empty(crit):
            crit_name_raw = str(crit).strip()
            current_criterion_name = crit_name_raw
            # Kriterium-Schluessel = erste zwei Kapitelteile (z.B. 3.1 aus 3.1.1)
            parts = chap.split(".")
            current_criterion_key = ".".join(parts[:2]) if len(parts) >= 2 else chap
            current_criterion_id = f"c_{current_domain_id}_{current_criterion_key.replace('.', '_')}"

        if not current_criterion_name or not current_criterion_key or not current_criterion_id:
            # falls Excel mal ohne Kriteriumsname startet, skip (sollte nicht passieren)
            continue

        crit_key = (current_domain_id, current_criterion_key)
        criterion_node = criterion_index.get(crit_key)
        if not criterion_node:
            # Name ohne Kapitelpräfix schöner darstellen:
            # z.B. "3.1 Sicherheitsarchitektur" -> "Sicherheitsarchitektur"
            name_clean = re.sub(r"^\d+(\.\d+)?\s+", "", current_criterion_name).strip()
            criterion_node = {"id": current_criterion_id, "name": name_clean or current_criterion_name, "subcriteria": []}
            criterion_index[crit_key] = criterion_node
            current_domain["criteria"].append(criterion_node)

        # Subcriterion-ID stabil nur aus Kapitel-ID
        sub_id = f"s_{chap.replace('.', '_')}"
        short_desc = ""
        if col_pruef:
            pruef = ws.cell(r, col_pruef).value
            if not is_empty(pruef):
                txt = re.sub(r"\s+", " ", str(pruef).strip())
                short_desc = txt[:180] + ("…" if len(txt) > 180 else "")

        # duplikate vermeiden
        if not any(sc["id"] == sub_id for sc in criterion_node["subcriteria"]):
            criterion_node["subcriteria"].append({"id": sub_id, "name": sub_name, "short_desc": short_desc})

    return {"domains": domains_out}

def parse_product_scores(ws, product_id: str) -> List[Dict[str, Any]]:
    header_row, cols = find_header_row(ws)

    col_id = cols.get("ID (Kapitel)")
    col_score = cols.get("Scoring (2 - 1 - 0)")
    col_evid = cols.get("Evidenz-Link/Quelle")
    col_fund = cols.get("Fundstelle")
    col_comment = cols.get("Kommentar (Kurzbefund)")

    if not col_id or not col_score:
        raise RuntimeError(f"Scoring/ID Spalten fehlen in Sheet '{ws.title}'")

    out: List[Dict[str, Any]] = []

    for r in iter_data_rows(ws, header_row):
        chap = ws.cell(r, col_id).value
        if is_empty(chap) or not isinstance(chap, str) or not CHAPTER_RE.match(chap.strip()):
            continue

        chap = chap.strip()
        subcriterion_id = f"s_{chap.replace('.', '_')}"

        raw_score = ws.cell(r, col_score).value
        score: int
        if raw_score in (0, 1, 2):
            score = int(raw_score)
        else:
            # falls leer/unerwartet -> 0 (Prototyp: "mangels Nachweis nicht beurteilbar")
            score = 0

        audit_comment = ""
        if col_comment:
            v = ws.cell(r, col_comment).value
            if not is_empty(v):
                audit_comment = re.sub(r"\s+", " ", str(v).strip())

        evid = ws.cell(r, col_evid).value if col_evid else None
        fund = ws.cell(r, col_fund).value if col_fund else None
        evidenz_links = parse_evidence_links(evid, fund)

        out.append({
            "product_id": product_id,
            "subcriterion_id": subcriterion_id,
            "score": score,
            "audit_comment": audit_comment,
            "evidenz_links": evidenz_links
        })

    return out

def main():
    if not INPUT.exists():
        raise FileNotFoundError(f"Excel nicht gefunden: {INPUT}")

    wb = load_workbook(INPUT, data_only=True)

    # 1) tree.json aus Vorlage (falls vorhanden), sonst aus erstem Produkt-Sheet
    if "Vorlage" in wb.sheetnames:
        ws_template = wb["Vorlage"]
    else:
        # fallback: erstes Sheet, das nicht in NON_PRODUCT_SHEETS ist
        product_sheets = [s for s in wb.sheetnames if s not in NON_PRODUCT_SHEETS]
        if not product_sheets:
            raise RuntimeError("Keine Produkt-Sheets gefunden")
        ws_template = wb[product_sheets[0]]

    tree = parse_tree_from_template(ws_template)

    # 2) Produkte = alle Sheets ausser non-product
    product_sheetnames = [s for s in wb.sheetnames if s not in NON_PRODUCT_SHEETS]
    products = [{"id": slug(s), "name": s, "description": ""} for s in product_sheetnames]

    # 3) scores.json aus jedem Produkt-Sheet
    scores: List[Dict[str, Any]] = []
    for s in product_sheetnames:
        pid = slug(s)
        ws = wb[s]
        scores.extend(parse_product_scores(ws, pid))

    OUTDIR.mkdir(parents=True, exist_ok=True)
    OUT_TREE.write_text(json.dumps(tree, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_PRODUCTS.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_SCORES.write_text(json.dumps(scores, ensure_ascii=False, indent=2), encoding="utf-8")

    print("OK: exported fixtures")
    print(f"- {OUT_TREE}")
    print(f"- {OUT_PRODUCTS}")
    print(f"- {OUT_SCORES}")
    print(f"Produkte: {len(products)} | Score-Zeilen: {len(scores)}")

if __name__ == "__main__":
    main()

// Rangliste-Seite: laedt data/index.json + data/kw/<jahr>_KW<kw>_ranking.json und rendert
// eine filter-/sortierbare Tabelle. Reiner Vanilla-JS, kein Build-Step, keine Abhaengigkeiten.

const COLUMNS = [
  { key: "DIS", label: "DIS" },
  // "(*)" + Kopfzeilen-Hover erklaeren die Klammerzahl (User-Vorgabe 2026-08-31), da "Original-RL
  // zum Vergleich" als volles Label in der schmalen Tabellenspalte zu lang waere -- die Spieler-
  // Detailseite (spieler.js) behaelt das ausgeschriebene Label, dort ist genug Platz.
  { key: "Ranglistenplatz", label: "Rang (*)", numeric: true,
    tooltip: "In Klammern: Rang desselben Spielers in der Original-Rangliste (zum Vergleich)." },
  { key: "FRang", label: "FRang", numeric: true },
  { key: "Nachname", label: "Nachname" },
  { key: "Vorname", label: "Vorname" },
  { key: "GJahr", label: "GJahr", numeric: true },
  { key: "AKL1", label: "AKL1" },
  { key: "AKL2", label: "AKL2" },
  { key: "Points", label: "Punkte", numeric: true },
  // H2H-Vergleich mit den 5 naechsten Ranglisten-Nachbarn oben/unten (Zaehlung + Prozent,
  // User-Vorgabe 2026-08-31, echte Ergebnisdaten bislang nur fuer KW30/2026 vorhanden -- fuer
  // jede andere Woche zeigen die Zellen "-"), siehe renderH2hCell()/renderH2hPercentCell() weiter
  // unten. Kein echtes Datenfeld -- buildRowFragment() rendert diese Spalten gesondert.
  { key: "H2H", label: "H2H (*)", sortable: false,
    tooltip: "Kopf-an-Kopf-Bilanz gegen die 5 nächsten Ranglisten-Nachbarn oberhalb und unterhalb "
      + "(anhand echter Turnierergebnisse): ✓ = Rangfolge bestätigt, ✗ = widerspricht ihr. "
      + "Zum Überfahren: Details je Nachbar." },
  { key: "H2HPct", label: "H2H in% (*)", sortable: false,
    tooltip: "Anteil ✓ an allen entschiedenen Vergleichen (✓+✗) mit den 5 nächsten Ranglisten-"
      + "Nachbarn oberhalb und unterhalb — je höher, desto mehr bestätigen echte Ergebnisse diesen "
      + "Rangbereich. Zum Überfahren: Details je Nachbar." },
  { key: "Turniere", label: "#Turniere", numeric: true },
  { key: "Verein", label: "Verein" },
  { key: "Bezirk", label: "Bezirk" },
  { key: "LVName", label: "LVName" },
  { key: "Gruppe", label: "Gruppe" },
  { key: "SpielerID", label: "SpielerID" },
  { key: "ClubID", label: "ClubID" },
];

const DIS_ORDER = ["HE", "DE", "HD", "DD", "HM", "DM"];

// Nur Spieler mit regulaerer DBV-SpielerID anzeigen (2 Ziffern + Bindestrich + weitere
// Zeichen, z.B. "07-047769") -- das Format auslaendischer Teilnehmer ohne DBV-Mitgliedschaft
// ("LAND-Name", z.B. "CZE-SoucekCyril") faellt bewusst durch, siehe CLAUDE.md "Rein
// deutsch"-Regel. User-Vorgabe 2026-08-22: solche Zeilen streichen und ohne sie
// durchnummerieren.
const VALID_SPIELER_ID_RE = /^\d{2}-.+$/;

// Schalter (User-Vorgabe 2026-08-24): true = Filter (Selects, Textfelder, Altersklasse-
// Mehrfachauswahl) werden erst bei Klick auf den "Suche"-Button bzw. Enter in einem Textfeld
// angewendet -- wie im Original https://www.badminton.de/.../u19-rangliste/. false = bisherige
// Technik bleibt erhalten: jede Filteraenderung aktualisiert die Tabelle sofort. In beiden
// Faellen zeigt das erstmalige Laden einer Woche unveraendert alle Datensaetze.
const SEARCH_REQUIRES_SUBMIT = true;

// Performance (User-Vorgabe 2026-08-24): bei ~18000-26000 Zeilen dauerte das initiale
// renderBody() aller Zeilen ~10s (DOM-Knoten- und Listener-Erzeugung). Statt sofort alle
// gefilterten/sortierten Zeilen zu rendern, werden nur die ersten PAGE_SIZE gerendert; der
// Rest wird per "Mehr laden"-Button bzw. automatisch beim Scrollen nachgeladen
// (siehe loadMore()/state.visibleCount). state.visibleCount wird ausschliesslich in render()
// gesetzt, das bei jeder Filter-/Sortier-/Wochenaenderung laeuft -- so zeigt ein neuer Filter
// nie nur noch die alten sichtbaren Zeilen von vorher.
const PAGE_SIZE = 1000;

// Nach dem Filtern muss der je DIS global durchnummerierte Ranglistenplatz luecken-frei neu
// vergeben werden (sonst blieben entfernte Spieler als Zahlensprung sichtbar) -- Reihenfolge
// bleibt die urspruengliche (Ranglistenplatz aufsteigend).
function renumberRanglistenplatz(rows) {
  const byDis = new Map();
  for (const r of rows) {
    if (!byDis.has(r.DIS)) byDis.set(r.DIS, []);
    byDis.get(r.DIS).push(r);
  }
  for (const group of byDis.values()) {
    group.sort((a, b) => Number(a.Ranglistenplatz) - Number(b.Ranglistenplatz));
    group.forEach((r, i) => { r.Ranglistenplatz = i + 1; });
  }
}

// Spaltenbreiten als Vielfaches der jeweiligen Header-Textbreite (User-Vorgabe 2026-08-22):
// Nachname/Vorname 1,5x, Verein 2x, Bezirk 3x. Wird per Canvas-Textmessung exakt anhand der
// tatsaechlich gerenderten Schriftart bestimmt (nicht nur ueber "ch"-Einheiten geschaetzt) und
// als eine dynamische Stylesheet-Regel injiziert, die th UND td ueber [data-key] trifft --
// robust gegenueber spaeterer Spaltenumsortierung.
const COLUMN_WIDTH_MULTIPLIERS = { Nachname: 1.5, Vorname: 1.5, Verein: 2, Bezirk: 3 };
let _measureCanvas = null;
function measureTextWidth(text, font) {
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}
// Manuelles Verbreitern/Verschmalern per Drag am Spaltenrand (User-Vorgabe 2026-08-29: die
// Multiplikator-Breiten oben reichen z.B. bei langen Vereinsnamen nicht aus) -- ueberschreibt die
// Multiplikator-Breite je Spalte, sobald der Nutzer sie einmal manuell gezogen hat. Pro Seite
// (nicht global) in localStorage gemerkt, da alle Varianten dieselbe Origin teilen, aber
// unterschiedliche Spaltensaetze haben -- location.pathname als Schluessel haelt das JS
// variantenagnostisch (kein hartkodierter Variantenname, siehe Konvention oben).
const COL_WIDTH_STORAGE_KEY = "col-widths:" + location.pathname;
let customColumnWidths = {};
try {
  customColumnWidths = JSON.parse(localStorage.getItem(COL_WIDTH_STORAGE_KEY) || "{}");
} catch { customColumnWidths = {}; }

function saveCustomColumnWidths() {
  try { localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(customColumnWidths)); } catch {}
}

function startColumnResize(e, th, col) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startWidth = th.getBoundingClientRect().width;
  const resizer = e.currentTarget;
  resizer.classList.add("resizing");

  function onMove(ev) {
    const newWidth = Math.max(30, Math.round(startWidth + (ev.clientX - startX)));
    customColumnWidths[col.key] = newWidth;
    applyColumnWidths();
  }
  function onUp() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    resizer.classList.remove("resizing");
    saveCustomColumnWidths();
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function applyColumnWidths() {
  let styleEl = document.getElementById("column-width-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "column-width-style";
    document.head.appendChild(styleEl);
  }
  const sampleTh = document.querySelector("#table-head th");
  const font = sampleTh ? getComputedStyle(sampleTh).font : getComputedStyle(document.body).font;
  const rules = [];
  for (const col of COLUMNS) {
    const custom = customColumnWidths[col.key];
    if (custom) {
      rules.push(`th[data-key="${col.key}"], td[data-key="${col.key}"] { width: ${custom}px; min-width: ${custom}px; max-width: ${custom}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`);
      continue;
    }
    const multiplier = COLUMN_WIDTH_MULTIPLIERS[col.key];
    if (!multiplier) continue;
    const target = Math.ceil(measureTextWidth(col.label, font) * multiplier);
    rules.push(`th[data-key="${col.key}"], td[data-key="${col.key}"] { max-width: ${target}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`);
  }
  styleEl.textContent = rules.join("\n");
}

const state = {
  index: null,
  currentWeek: null,   // {year, kw, ...} aus index.json
  rows: [],
  sortKey: "DIS",
  sortDir: "asc",
  tab: "current",
  aklOptions: [],       // [{value,label}], gebaut aus AKL2 (grob) + AKL1 (fein) der aktuellen Woche
  aklSelected: new Set(),
  bezirkOptions: [],     // [{value,label}], alle vorkommenden Bezirke der aktuellen Woche
  bezirkSelected: new Set(),
  sortedRows: [],        // volle gefilterte+sortierte Liste der aktuellen Woche (fuer loadMore())
  visibleCount: 0,        // wie viele davon aktuell im DOM stehen
};

let loadMoreObserver = null;

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Fehler beim Laden von ${path}: ${res.status}`);
  return res.json();
}

function uniqueSorted(rows, key) {
  return [...new Set(rows.map(r => r[key]).filter(v => v !== null && v !== undefined && v !== ""))]
    .sort((a, b) => String(a).localeCompare(String(b), "de"));
}

function fillSelect(select, values, keepFirst = true) {
  const current = select.value;
  const firstOption = keepFirst ? select.querySelector("option") : null;
  select.innerHTML = "";
  if (firstOption) select.appendChild(firstOption);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  if (values.includes(current)) select.value = current;
}

function aklNumber(v) {
  const m = /^U(\d+)/.exec(v || "");
  return m ? Number(m[1]) : null;
}

// Baut die Optionsliste fuer die Altersklasse-Mehrfachauswahl aus den Daten der aktuellen
// Woche: fuer jede grobe AKL2-Gruppe (absteigend U19->U09, wie bei badminton.de) erst die
// Gruppe selbst, dann ihre feinen AKL1-Auspraegungen (z.B. U19, U19-1, U19-2). Die Kind-Werte
// werden aus den tatsaechlich vorkommenden (AKL1,AKL2)-Paaren ermittelt statt aus der
// Namenskonvention abgeleitet, da z.B. U09 drei statt zwei Kinder hat (U09-0/-1/-2).
function buildAklOptions(rows) {
  const children = new Map(); // AKL2 -> Set(AKL1)
  for (const r of rows) {
    if (!r.AKL2) continue;
    if (!children.has(r.AKL2)) children.set(r.AKL2, new Set());
    if (r.AKL1) children.get(r.AKL2).add(r.AKL1);
  }
  const akl2List = [...children.keys()].sort((a, b) => (aklNumber(b) ?? -1) - (aklNumber(a) ?? -1));
  const options = [];
  for (const akl2 of akl2List) {
    options.push({ value: akl2, label: akl2 });
    for (const akl1 of [...children.get(akl2)].sort((a, b) => a.localeCompare(b, "de"))) {
      options.push({ value: akl1, label: akl1 });
    }
  }
  return options;
}

function populateFilterOptions(rows) {
  fillSelect(document.getElementById("f-dis"), uniqueSorted(rows, "DIS"));
  fillSelect(document.getElementById("f-gs"), uniqueSorted(rows, "GS"));
  fillSelect(document.getElementById("f-gruppe"), uniqueSorted(rows, "Gruppe"));
  fillSelect(document.getElementById("f-lv"), uniqueSorted(rows, "LVName"));
  state.aklOptions = buildAklOptions(rows);
  state.bezirkOptions = uniqueSorted(rows, "Bezirk").map(v => ({ value: v, label: v }));
}

function getFilters() {
  return {
    DIS: document.getElementById("f-dis").value,
    GS: document.getElementById("f-gs").value,
    Gruppe: document.getElementById("f-gruppe").value,
    LVName: document.getElementById("f-lv").value,
    Vorname: document.getElementById("f-vorname").value.trim().toLowerCase(),
    Nachname: document.getElementById("f-nachname").value.trim().toLowerCase(),
    Verein: document.getElementById("f-verein").value.trim().toLowerCase(),
  };
}

function applyFilters(rows) {
  const f = getFilters();
  const akl = state.aklSelected;
  const bezirk = state.bezirkSelected;
  return rows.filter(r => {
    if (f.DIS && r.DIS !== f.DIS) return false;
    if (f.GS && r.GS !== f.GS) return false;
    if (akl.size > 0 && !akl.has(r.AKL2) && !akl.has(r.AKL1)) return false;
    if (f.Gruppe && r.Gruppe !== f.Gruppe) return false;
    if (f.LVName && r.LVName !== f.LVName) return false;
    if (bezirk.size > 0 && !bezirk.has(r.Bezirk)) return false;
    if (f.Vorname && !String(r.Vorname || "").toLowerCase().includes(f.Vorname)) return false;
    if (f.Nachname && !String(r.Nachname || "").toLowerCase().includes(f.Nachname)) return false;
    if (f.Verein && !String(r.Verein || "").toLowerCase().includes(f.Verein)) return false;
    return true;
  });
}

function disRank(v) {
  const i = DIS_ORDER.indexOf(v);
  return i === -1 ? DIS_ORDER.length : i;
}

function sortRows(rows) {
  const { sortKey, sortDir } = state;
  const col = COLUMNS.find(c => c.key === sortKey);
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === "DIS") {
      const d = (disRank(a.DIS) - disRank(b.DIS)) * dir;
      if (d !== 0) return d;
      return Number(a.Ranglistenplatz) - Number(b.Ranglistenplatz);
    }
    let av = a[sortKey], bv = b[sortKey];
    if (av === null || av === undefined) av = "";
    if (bv === null || bv === undefined) bv = "";
    if (col && col.numeric) return (Number(av) - Number(bv)) * dir;
    return String(av).localeCompare(String(bv), "de") * dir;
  });
}

function renderHead() {
  const tr = document.getElementById("table-head");
  tr.innerHTML = "";
  for (const col of COLUMNS) {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.dataset.key = col.key;
    if (col.tooltip) th.title = col.tooltip;
    if (state.sortKey === col.key) {
      th.classList.add(state.sortDir === "asc" ? "sorted-asc" : "sorted-desc");
    }
    th.addEventListener("click", () => {
      if (col.sortable === false) return;
      if (state.sortKey === col.key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = col.key;
        state.sortDir = "asc";
      }
      render();
    });
    const resizer = document.createElement("span");
    resizer.className = "col-resizer";
    resizer.title = "Ziehen zum Verbreitern/Verschmälern, Doppelklick zum Zurücksetzen";
    resizer.addEventListener("mousedown", (e) => startColumnResize(e, th, col));
    resizer.addEventListener("click", (e) => e.stopPropagation());
    resizer.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      delete customColumnWidths[col.key];
      saveCustomColumnWidths();
      applyColumnWidths();
    });
    th.appendChild(resizer);
    tr.appendChild(th);
  }
  applyColumnWidths();
}

// Baut ein DocumentFragment mit <tr>-Zeilen fuer die uebergebenen (bereits gefilterten/
// sortierten und ggf. schon geslicten) Zeilen. Getrennt von renderBody()/loadMore(), damit
// beide dieselbe Zeilenerzeugung nutzen -- renderBody() ersetzt den gesamten tbody-Inhalt,
// loadMore() haengt nur an.
function buildRowFragment(rows) {
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const col of COLUMNS) {
      const td = document.createElement("td");
      td.dataset.key = col.key;
      if (col.key === "Ranglistenplatz") {
        // Eigenen Rang plus Original-RL-Rang in Klammern (User-Vorgabe 2026-08-31), z.B. "5 (3)"
        // -- row.OriginalRang kommt aus der H2H-Anreicherung, siehe loadWeek()/mergeH2hData().
        td.textContent = row.OriginalRang != null
          ? `${row.Ranglistenplatz} (${row.OriginalRang})` : String(row.Ranglistenplatz ?? "");
        td.title = "Rang (Original-RL zum Vergleich)";
        tr.appendChild(td);
        continue;
      }
      if (col.key === "H2H") {
        renderH2hCell(td, row);
        tr.appendChild(td);
        continue;
      }
      if (col.key === "H2HPct") {
        renderH2hPercentCell(td, row);
        tr.appendChild(td);
        continue;
      }
      const raw = row[col.key];
      let display = (raw === null || raw === undefined) ? "" : raw;
      // "DBV-Gruppe X" -> "X" bzw. LVName auf die ersten 3 Zeichen (= LV-Kuerzel, z.B.
      // "BAW-Baden-Wuerttemberg" -> "BAW") kuerzen -- nur Anzeige, Filterwerte bleiben
      // unveraendert die vollen Rohwerte.
      if (col.key === "Gruppe" && typeof display === "string") {
        display = display.replace(/DBV-Gruppe\s*/i, "").trim();
      } else if (col.key === "LVName" && typeof display === "string") {
        display = display.slice(0, 3);
      }
      td.textContent = display;
      if (raw !== null && raw !== undefined &&
          (COLUMN_WIDTH_MULTIPLIERS[col.key] || col.key === "LVName" || col.key === "Gruppe")) {
        td.title = String(raw);
      }
      tr.appendChild(td);
    }
    tr.addEventListener("click", () => {
      const params = new URLSearchParams({
        id: row.SpielerID, year: state.currentWeek.year, kw: state.currentWeek.kw,
        name: `${row.Vorname || ""} ${row.Nachname || ""}`.trim(),
      });
      window.location.href = `spieler.html?${params.toString()}`;
    });
    frag.appendChild(tr);
  }
  return frag;
}

// Spalte "H2H" (User-Vorgabe 2026-08-31): Zelleninhalt ist eine kompakte gruen/rot-Zaehlung statt
// des reinen Worts "H2H" -- informativer auf einen Blick (wie viele der 10 Ranglisten-Nachbarn
// bestaetigen die Rangfolge vs. widersprechen ihr), das volle Detail (Turnier+Ergebnis je Nachbar)
// erscheint im Hover-Kasten (siehe showH2hTooltip()).
function renderH2hCell(td, row) {
  const entries = row.H2H || [];
  if (entries.length === 0) {
    td.textContent = "–";
    td.className = "h2h-cell h2h-empty";
    return;
  }
  const gruen = entries.filter(e => e.Konkordanz === "gruen").length;
  const rot = entries.filter(e => e.Konkordanz === "rot").length;
  td.className = "h2h-cell";
  td.innerHTML = `<span class="h2h-gruen">${gruen}✓</span> <span class="h2h-rot">${rot}✗</span>`;
  td.addEventListener("mouseenter", (evt) => showH2hTooltip(evt, row));
  td.addEventListener("mouseleave", hideH2hTooltip);
}

// Spalte "H2H in%" (User-Vorgabe 2026-08-31): dieselbe gruen/rot-Bilanz wie "H2H", als
// Prozentsatz statt Zaehlung -- Anteil bestaetigter (gruen) an allen entschiedenen (gruen+rot)
// Vergleichen, "neutral" (kein/unentschiedenes Ergebnis) zaehlt nicht mit, analog der
// Konkordanzrate in compare_rankings_h2h.py. Derselbe Hover-Kasten wie bei "H2H".
function renderH2hPercentCell(td, row) {
  const entries = row.H2H || [];
  const gruen = entries.filter(e => e.Konkordanz === "gruen").length;
  const rot = entries.filter(e => e.Konkordanz === "rot").length;
  const entschieden = gruen + rot;
  if (entschieden === 0) {
    td.textContent = "–";
    td.className = "h2h-cell h2h-empty";
    return;
  }
  const pct = Math.round((gruen / entschieden) * 100);
  const cls = pct >= 50 ? "h2h-gruen" : "h2h-rot";
  td.className = "h2h-cell";
  td.innerHTML = `<span class="${cls}">${pct}%</span>`;
  td.addEventListener("mouseenter", (evt) => showH2hTooltip(evt, row));
  td.addEventListener("mouseleave", hideH2hTooltip);
}

function renderBody(rows) {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = COLUMNS.length;
    td.className = "empty-state";
    td.textContent = "Keine Einträge für die aktuelle Filterauswahl.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  tbody.appendChild(buildRowFragment(rows));
}

// Haengt die naechsten PAGE_SIZE Zeilen aus state.sortedRows an den bestehenden tbody an,
// statt neu zu rendern. Wird per Klick auf "Mehr laden" oder automatisch beim Scrollen
// (siehe setupLoadMoreObserver) aufgerufen.
function loadMore() {
  const { sortedRows, visibleCount } = state;
  const next = Math.min(visibleCount + PAGE_SIZE, sortedRows.length);
  if (next <= visibleCount) return;
  document.getElementById("table-body").appendChild(buildRowFragment(sortedRows.slice(visibleCount, next)));
  state.visibleCount = next;
  updateLoadMoreControl();
}

function updateLoadMoreControl() {
  const row = document.getElementById("load-more-row");
  const info = document.getElementById("load-more-info");
  const remaining = state.sortedRows.length - state.visibleCount;
  if (remaining <= 0) {
    row.style.display = "none";
    return;
  }
  row.style.display = "flex";
  info.textContent = `${state.visibleCount} von ${state.sortedRows.length} angezeigt`;
}

function setupLoadMoreObserver() {
  const sentinel = document.getElementById("load-more-row");
  document.getElementById("btn-load-more").addEventListener("click", loadMore);
  loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) loadMore();
  }, { rootMargin: "800px 0px" });
  loadMoreObserver.observe(sentinel);
}

// Wird von allen Filter-Steuerelementen aufgerufen statt direkt render() -- so entscheidet
// allein SEARCH_REQUIRES_SUBMIT, ob eine Filteraenderung sofort wirkt oder erst der
// "Suche"-Button (bzw. Enter) sie anwendet.
function applyFilterChange() {
  if (!SEARCH_REQUIRES_SUBMIT) render();
}

function render() {
  const loadingEl = document.getElementById("loading-indicator");
  loadingEl.style.display = "inline";
  // Doppeltes rAF erzwingt einen Paint mit sichtbarem Wartezeichen, bevor die
  // synchrone Filter-/Sortier-/Render-Arbeit (bei ~18000 Zeilen spürbar) startet.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      renderHead();
      const filtered = applyFilters(state.rows);
      const sorted = sortRows(filtered);
      sorted.forEach((r, i) => { r.FRang = i + 1; });
      state.sortedRows = sorted;
      state.visibleCount = Math.min(PAGE_SIZE, sorted.length);
      renderBody(sorted.slice(0, state.visibleCount));
      updateLoadMoreControl();
      document.getElementById("row-count").textContent =
        `${sorted.length} von ${state.rows.length} Einträgen`;
      loadingEl.style.display = "none";
    });
  });
}

// H2H-Anreicherung (User-Vorgabe 2026-08-31): laedt <stem>_h2h_test.json (siehe
// tools/debug_build_h2h_hover_test_data.py) und mischt OriginalRang/H2H in state.rows -- echte
// Ergebnisdaten liegen bislang nur fuer KW30/2026 vor, fuer jede andere Woche existiert diese
// Datei nicht, dann bleiben beide Felder schlicht undefined (Rang-Spalte zeigt nur den eigenen
// Rang, H2H-Spalte zeigt "-").
async function mergeH2hData(week) {
  const stem = `${week.year}_KW${String(week.kw).padStart(2, "0")}`;
  let enrichment;
  try {
    enrichment = await fetchJson(`data/kw/${stem}_h2h_test.json`);
  } catch {
    return; // keine Testdaten fuer diese Woche -- kein Fehler, nur keine Anreicherung
  }
  const byKey = new Map(enrichment.map(e => [`${e.SpielerID}|${e.DIS}`, e]));
  for (const r of state.rows) {
    const e = byKey.get(`${r.SpielerID}|${r.DIS}`);
    if (e) {
      r.OriginalRang = e.OriginalRang;
      r.H2H = e.H2H;
    }
  }
}

let h2hTooltipEl = null;
function ensureH2hTooltip() {
  if (!h2hTooltipEl) {
    h2hTooltipEl = document.createElement("div");
    h2hTooltipEl.id = "h2h-tooltip";
    h2hTooltipEl.hidden = true;
    document.body.appendChild(h2hTooltipEl);
  }
  return h2hTooltipEl;
}

function h2hEntryHtml(e) {
  const matchesHtml = e.Matches.length
    ? e.Matches.map(m => `<div class="h2h-match">${escapeHtmlLocal(m.Turnier)}: <strong>${m.Ergebnis}</strong></div>`).join("")
    : `<div class="h2h-match h2h-none">kein Vergleich</div>`;
  return `
    <div class="h2h-entry h2h-${e.Konkordanz}">
      <div class="h2h-entry-head">Rang ${e.Rang} &middot; ${escapeHtmlLocal(e.Name)}</div>
      ${matchesHtml}
    </div>`;
}

function escapeHtmlLocal(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function showH2hTooltip(evt, row) {
  const el = ensureH2hTooltip();
  const oben = (row.H2H || []).filter(e => e.Richtung === "oben").slice().reverse();
  const unten = (row.H2H || []).filter(e => e.Richtung === "unten");
  el.innerHTML = `
    <div class="h2h-section-title">▲ Nachbarn oberhalb</div>
    ${oben.length ? oben.map(h2hEntryHtml).join("") : '<div class="h2h-match h2h-none">keine (bereits Rang 1)</div>'}
    <div class="h2h-section-title">▼ Nachbarn unterhalb</div>
    ${unten.length ? unten.map(h2hEntryHtml).join("") : '<div class="h2h-match h2h-none">keine (bereits letzter Rang)</div>'}`;
  el.hidden = false;
  const cellRect = evt.currentTarget.getBoundingClientRect();
  const viewportH = document.documentElement.clientHeight;
  // Unter der Zelle platzieren, ausser es ist nicht genug Platz bis zum unteren Fensterrand --
  // dann oberhalb der Zelle (sonst waere der Kasten bei Zeilen nahe am unteren Bildschirmrand
  // teilweise/ganz unsichtbar).
  const spaceBelow = viewportH - cellRect.bottom;
  const top = spaceBelow >= el.offsetHeight + 8
    ? window.scrollY + cellRect.bottom + 4
    : window.scrollY + cellRect.top - el.offsetHeight - 4;
  let left = window.scrollX + cellRect.left;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  el.style.top = `${Math.max(window.scrollY + 4, top)}px`;
  el.style.left = `${left}px`;
}

function hideH2hTooltip() {
  if (h2hTooltipEl) h2hTooltipEl.hidden = true;
}

async function loadWeek(week) {
  document.getElementById("loading-indicator").style.display = "inline";
  state.currentWeek = week;
  const rawRows = await fetchJson(week.ranking_file);
  state.rows = rawRows.filter(r => VALID_SPIELER_ID_RE.test(r.SpielerID || ""));
  renumberRanglistenplatz(state.rows);
  await mergeH2hData(week);
  populateFilterOptions(state.rows);
  document.getElementById("tab-current").textContent = `Rangliste ${week.label}`;
  document.getElementById("updated-at").textContent = `zuletzt aktualisiert: ${week.updated_at}`;
  render();
}

function setupTabs() {
  document.getElementById("tab-current").addEventListener("click", () => {
    state.tab = "current";
    document.getElementById("tab-current").classList.add("active");
    document.getElementById("tab-history").classList.remove("active");
    document.getElementById("history-picker").style.display = "none";
    loadWeek(state.index.latest);
  });
  document.getElementById("tab-history").addEventListener("click", () => {
    state.tab = "history";
    document.getElementById("tab-history").classList.add("active");
    document.getElementById("tab-current").classList.remove("active");
    document.getElementById("history-picker").style.display = "block";
  });
}

function setupWeekSelect() {
  const select = document.getElementById("week-select");
  select.innerHTML = "";
  for (const w of [...state.index.weeks].reverse()) {
    const opt = document.createElement("option");
    opt.value = `${w.year}_${w.kw}`;
    opt.textContent = w.label;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    const week = state.index.weeks.find(w => `${w.year}_${w.kw}` === select.value);
    if (week) loadWeek(week);
  });
}

// Generische Mehrfachauswahl-Combobox (Chips im Feld + Dropdown-Liste, die beim Tippen filtert),
// Vorbild badminton.de -- urspruenglich nur fuer Altersklasse, seit 2026-08-31 auch fuer Bezirk
// (User-Vorgabe: Bezirk soll beim Tippen genauso aufpoppen wie Altersklasse, da ein <select> bei
// >100 moeglichen Bezirken unhandlich waere). Klick auf eine Option oder Enter auf der aktiven
// Zeile schaltet sie an/aus, die Liste bleibt danach offen, damit mehrere Werte nacheinander
// gewaehlt werden koennen. `selected` ist das state.*Selected-Set, `getOptions` liefert bei jedem
// Aufruf frisch die aktuelle [{value,label}]-Liste (aendert sich pro geladener Woche).
function createMultiSelectWidget({ msId, controlId, inputId, chipsId, listId, clearAllId,
                                    getOptions, selected, onChange }) {
  const control = document.getElementById(controlId);
  const input = document.getElementById(inputId);
  const chipsEl = document.getElementById(chipsId);
  const list = document.getElementById(listId);
  const clearAllBtn = document.getElementById(clearAllId);
  let activeIndex = -1;

  function visibleOptions() {
    const q = input.value.trim().toLowerCase();
    const opts = getOptions();
    return q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
  }

  function renderChips() {
    chipsEl.innerHTML = "";
    for (const value of selected) {
      const chip = document.createElement("span");
      chip.className = "ms-chip";
      const text = document.createElement("span");
      text.textContent = value;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.title = `${value} entfernen`;
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        selected.delete(value);
        renderChips();
        renderList();
        onChange();
      });
      chip.appendChild(btn);
      chip.appendChild(text);
      chipsEl.appendChild(chip);
    }
    clearAllBtn.hidden = selected.size === 0;
    input.placeholder = selected.size === 0 ? "-- alle --" : "";
  }

  function renderList() {
    const opts = visibleOptions();
    list.innerHTML = "";
    if (opts.length === 0) {
      const li = document.createElement("li");
      li.className = "ms-option is-empty";
      li.textContent = "keine Treffer";
      list.appendChild(li);
      activeIndex = -1;
      return;
    }
    if (activeIndex >= opts.length) activeIndex = opts.length - 1;
    opts.forEach((opt, i) => {
      const li = document.createElement("li");
      li.className = "ms-option";
      li.setAttribute("role", "option");
      li.textContent = opt.label;
      if (selected.has(opt.value)) li.classList.add("is-selected");
      if (i === activeIndex) li.classList.add("is-active");
      li.addEventListener("mousedown", (evt) => {
        // mousedown statt click: verhindert, dass der Input vor der Auswahl den Fokus verliert.
        evt.preventDefault();
        toggleValue(opt.value);
      });
      list.appendChild(li);
    });
  }

  function toggleValue(value) {
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    input.value = "";
    activeIndex = -1;
    renderChips();
    renderList();
    openList();
    input.focus();
    onChange();
  }

  function openList() {
    list.hidden = false;
    renderList();
  }
  function closeList() {
    list.hidden = true;
    activeIndex = -1;
  }

  control.addEventListener("click", () => { input.focus(); openList(); });
  input.addEventListener("focus", openList);
  input.addEventListener("input", () => { activeIndex = -1; openList(); });
  input.addEventListener("keydown", (evt) => {
    const opts = visibleOptions();
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      if (list.hidden) { openList(); return; }
      activeIndex = Math.min(activeIndex + 1, opts.length - 1);
      renderList();
    } else if (evt.key === "ArrowUp") {
      evt.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderList();
    } else if (evt.key === "Enter") {
      evt.preventDefault();
      if (!list.hidden && activeIndex >= 0 && opts[activeIndex]) {
        toggleValue(opts[activeIndex].value);
      }
    } else if (evt.key === "Escape") {
      closeList();
    } else if (evt.key === "Backspace" && input.value === "" && selected.size > 0) {
      const last = [...selected].pop();
      selected.delete(last);
      renderChips();
      renderList();
      onChange();
    }
  });
  clearAllBtn.addEventListener("click", (evt) => {
    evt.stopPropagation();
    selected.clear();
    input.value = "";
    renderChips();
    renderList();
    onChange();
  });
  document.addEventListener("click", (evt) => {
    if (!document.getElementById(msId).contains(evt.target)) closeList();
  });

  renderChips();

  return {
    reset() {
      selected.clear();
      input.value = "";
      renderChips();
      if (!list.hidden) renderList();
    },
  };
}

function setupAklWidget() {
  return createMultiSelectWidget({
    msId: "f-akl-ms", controlId: "f-akl-control", inputId: "f-akl-input",
    chipsId: "f-akl-chips", listId: "f-akl-options", clearAllId: "f-akl-clearall",
    getOptions: () => state.aklOptions, selected: state.aklSelected, onChange: applyFilterChange,
  });
}

function setupBezirkWidget() {
  return createMultiSelectWidget({
    msId: "f-bezirk-ms", controlId: "f-bezirk-control", inputId: "f-bezirk-input",
    chipsId: "f-bezirk-chips", listId: "f-bezirk-options", clearAllId: "f-bezirk-clearall",
    getOptions: () => state.bezirkOptions, selected: state.bezirkSelected, onChange: applyFilterChange,
  });
}

function setupFilterListeners() {
  const ids = ["f-dis", "f-gs", "f-gruppe", "f-lv", "f-vorname", "f-nachname", "f-verein"];
  for (const id of ids) {
    const el = document.getElementById(id);
    el.addEventListener("input", applyFilterChange);
    el.addEventListener("change", applyFilterChange);
    if (SEARCH_REQUIRES_SUBMIT) {
      // Enter in einem Textfeld loest die Suche direkt aus, ohne dass der Button geklickt
      // werden muss (Vorbild badminton.de).
      el.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") { evt.preventDefault(); render(); }
      });
    }
  }
  const aklWidget = setupAklWidget();
  const bezirkWidget = setupBezirkWidget();
  document.getElementById("btn-search").addEventListener("click", render);
  document.getElementById("reset-filters").addEventListener("click", () => {
    for (const id of ids) {
      document.getElementById(id).value = "";
    }
    aklWidget.reset();
    bezirkWidget.reset();
    render();
  });
}

async function init() {
  document.getElementById("loading-indicator").style.display = "inline";
  state.index = await fetchJson("data/index.json");
  if (!state.index.latest) {
    document.getElementById("loading-indicator").style.display = "none";
    document.getElementById("table-body").innerHTML =
      '<tr><td class="empty-state">Keine Ranglisten-Daten gefunden. export_ranking_web.py ausführen.</td></tr>';
    return;
  }
  setupTabs();
  setupWeekSelect();
  setupFilterListeners();
  setupLoadMoreObserver();
  await loadWeek(state.index.latest);
}

init().catch(err => {
  console.error("Fehler beim Initialisieren der Rangliste:", err);
  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.style.display = "none";
  document.getElementById("table-body").innerHTML =
    `<tr><td class="empty-state">Fehler beim Laden der Daten: ${err.message}</td></tr>`;
});

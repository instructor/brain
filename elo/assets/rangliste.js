// Rangliste-Seite: laedt data/index.json + data/kw/<jahr>_KW<kw>_ranking.json und rendert
// eine filter-/sortierbare Tabelle. Reiner Vanilla-JS, kein Build-Step, keine Abhaengigkeiten.

const COLUMNS = [
  { key: "DIS", label: "DIS" },
  { key: "Ranglistenplatz", label: "Rang", numeric: true },
  { key: "FRang", label: "FRang", numeric: true },
  { key: "Nachname", label: "Nachname" },
  { key: "Vorname", label: "Vorname" },
  { key: "GS", label: "GS" },
  { key: "SpielerID", label: "SpielerID" },
  { key: "GJahr", label: "GJahr", numeric: true },
  { key: "AKL1", label: "AKL1" },
  { key: "AKL2", label: "AKL2" },
  { key: "Points", label: "Punkte", numeric: true },
  // Anzeige "34/56/16" (Anzahl DISTINKTER Turniere je Jahr aus TOURNAMENT_COUNT_YEARS in
  // build_elo_ranking.py, aktuell 2024/2025/2026 -- bei einer Erweiterung dieser Liste muss das
  // Label hier manuell mitgezogen werden, siehe Kommentar dort). sortKey zeigt auf das separate
  // numerische TurniereTotal-Feld, da der String selbst nicht sinnvoll numerisch sortierbar ist.
  { key: "Turniere", label: "#Turniere\n2024/25/26", numeric: true, sortKey: "TurniereTotal",
    multiline: true },
  { key: "Verein", label: "Verein" },
  { key: "Bezirk", label: "Bezirk" },
  { key: "LVName", label: "LVName" },
  { key: "Gruppe", label: "Gruppe" },
  { key: "ClubID", label: "ClubID" },
];

const DIS_ORDER = ["HE", "DE", "HD", "DD", "HM", "DM"];

const state = {
  index: null,
  currentWeek: null,   // {year, kw, ...} aus index.json
  rows: [],
  sortKey: "DIS",
  sortDir: "asc",
  tab: "current",
  aklOptions: [],       // [{value,label}], gebaut aus AKL2 (grob) + AKL1 (fein) der aktuellen Woche
  aklSelected: new Set(),
  aklActiveIndex: -1,
};

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
}

function getFilters() {
  return {
    DIS: document.getElementById("f-dis").value,
    GS: document.getElementById("f-gs").value,
    Gruppe: document.getElementById("f-gruppe").value,
    LVName: document.getElementById("f-lv").value,
    Bezirk: document.getElementById("f-bezirk").value.trim().toLowerCase(),
    Vorname: document.getElementById("f-vorname").value.trim().toLowerCase(),
    Nachname: document.getElementById("f-nachname").value.trim().toLowerCase(),
    Verein: document.getElementById("f-verein").value.trim().toLowerCase(),
  };
}

function applyFilters(rows) {
  const f = getFilters();
  const akl = state.aklSelected;
  return rows.filter(r => {
    if (f.DIS && r.DIS !== f.DIS) return false;
    if (f.GS && r.GS !== f.GS) return false;
    if (akl.size > 0 && !akl.has(r.AKL2) && !akl.has(r.AKL1)) return false;
    if (f.Gruppe && r.Gruppe !== f.Gruppe) return false;
    if (f.LVName && r.LVName !== f.LVName) return false;
    if (f.Bezirk && !String(r.Bezirk || "").toLowerCase().includes(f.Bezirk)) return false;
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
    const compareKey = col && col.sortKey ? col.sortKey : sortKey;
    let av = a[compareKey], bv = b[compareKey];
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
    if (col.multiline) th.classList.add("th-multiline");
    if (state.sortKey === col.key) {
      th.classList.add(state.sortDir === "asc" ? "sorted-asc" : "sorted-desc");
    }
    th.addEventListener("click", () => {
      if (state.sortKey === col.key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = col.key;
        state.sortDir = "asc";
      }
      render();
    });
    tr.appendChild(th);
  }
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
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const col of COLUMNS) {
      const td = document.createElement("td");
      const v = row[col.key];
      td.textContent = (v === null || v === undefined) ? "" : v;
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
  tbody.appendChild(frag);
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
      renderBody(sorted);
      document.getElementById("row-count").textContent =
        `${sorted.length} von ${state.rows.length} Einträgen`;
      loadingEl.style.display = "none";
    });
  });
}

async function loadWeek(week) {
  document.getElementById("loading-indicator").style.display = "inline";
  state.currentWeek = week;
  state.rows = await fetchJson(week.ranking_file);
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

// Altersklasse: Mehrfachauswahl-Combobox (Chips im Feld + Dropdown-Liste), Vorbild
// badminton.de. Ausgewaehlte Werte liegen in state.aklSelected; Klick auf eine Option
// oder Enter auf der aktiven Zeile schaltet sie an/aus, die Liste bleibt danach offen,
// damit mehrere Werte nacheinander gewaehlt werden koennen.
function setupAklWidget() {
  const control = document.getElementById("f-akl-control");
  const input = document.getElementById("f-akl-input");
  const chipsEl = document.getElementById("f-akl-chips");
  const list = document.getElementById("f-akl-options");
  const clearAllBtn = document.getElementById("f-akl-clearall");

  function visibleOptions() {
    const q = input.value.trim().toLowerCase();
    const opts = q ? state.aklOptions.filter(o => o.label.toLowerCase().includes(q)) : state.aklOptions;
    return opts;
  }

  function renderChips() {
    chipsEl.innerHTML = "";
    for (const value of state.aklSelected) {
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
        state.aklSelected.delete(value);
        renderChips();
        renderList();
        render();
      });
      chip.appendChild(btn);
      chip.appendChild(text);
      chipsEl.appendChild(chip);
    }
    clearAllBtn.hidden = state.aklSelected.size === 0;
    input.placeholder = state.aklSelected.size === 0 ? "-- alle --" : "";
  }

  function renderList() {
    const opts = visibleOptions();
    list.innerHTML = "";
    if (opts.length === 0) {
      const li = document.createElement("li");
      li.className = "ms-option is-empty";
      li.textContent = "keine Treffer";
      list.appendChild(li);
      state.aklActiveIndex = -1;
      return;
    }
    if (state.aklActiveIndex >= opts.length) state.aklActiveIndex = opts.length - 1;
    opts.forEach((opt, i) => {
      const li = document.createElement("li");
      li.className = "ms-option";
      li.setAttribute("role", "option");
      li.textContent = opt.label;
      if (state.aklSelected.has(opt.value)) li.classList.add("is-selected");
      if (i === state.aklActiveIndex) li.classList.add("is-active");
      li.addEventListener("mousedown", (evt) => {
        // mousedown statt click: verhindert, dass der Input vor der Auswahl den Fokus verliert.
        evt.preventDefault();
        toggleValue(opt.value);
      });
      list.appendChild(li);
    });
  }

  function toggleValue(value) {
    if (state.aklSelected.has(value)) state.aklSelected.delete(value);
    else state.aklSelected.add(value);
    input.value = "";
    state.aklActiveIndex = -1;
    renderChips();
    renderList();
    openList();
    input.focus();
    render();
  }

  function openList() {
    list.hidden = false;
    renderList();
  }
  function closeList() {
    list.hidden = true;
    state.aklActiveIndex = -1;
  }

  control.addEventListener("click", () => { input.focus(); openList(); });
  input.addEventListener("focus", openList);
  input.addEventListener("input", () => { state.aklActiveIndex = -1; openList(); });
  input.addEventListener("keydown", (evt) => {
    const opts = visibleOptions();
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      if (list.hidden) { openList(); return; }
      state.aklActiveIndex = Math.min(state.aklActiveIndex + 1, opts.length - 1);
      renderList();
    } else if (evt.key === "ArrowUp") {
      evt.preventDefault();
      state.aklActiveIndex = Math.max(state.aklActiveIndex - 1, 0);
      renderList();
    } else if (evt.key === "Enter") {
      evt.preventDefault();
      if (!list.hidden && state.aklActiveIndex >= 0 && opts[state.aklActiveIndex]) {
        toggleValue(opts[state.aklActiveIndex].value);
      }
    } else if (evt.key === "Escape") {
      closeList();
    } else if (evt.key === "Backspace" && input.value === "" && state.aklSelected.size > 0) {
      const last = [...state.aklSelected].pop();
      state.aklSelected.delete(last);
      renderChips();
      renderList();
      render();
    }
  });
  clearAllBtn.addEventListener("click", (evt) => {
    evt.stopPropagation();
    state.aklSelected.clear();
    input.value = "";
    renderChips();
    renderList();
    render();
  });
  document.addEventListener("click", (evt) => {
    if (!document.getElementById("f-akl-ms").contains(evt.target)) closeList();
  });

  renderChips();
}

function setupFilterListeners() {
  const ids = ["f-dis", "f-gs", "f-gruppe", "f-lv", "f-bezirk", "f-vorname", "f-nachname", "f-verein"];
  for (const id of ids) {
    const el = document.getElementById(id);
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  setupAklWidget();
  document.getElementById("reset-filters").addEventListener("click", () => {
    for (const id of ids) {
      document.getElementById(id).value = "";
    }
    state.aklSelected.clear();
    document.getElementById("f-akl-input").value = "";
    document.getElementById("f-akl-chips").innerHTML = "";
    document.getElementById("f-akl-clearall").hidden = true;
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
  await loadWeek(state.index.latest);
}

init().catch(err => {
  console.error("Fehler beim Initialisieren der Rangliste:", err);
  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.style.display = "none";
  document.getElementById("table-body").innerHTML =
    `<tr><td class="empty-state">Fehler beim Laden der Daten: ${err.message}</td></tr>`;
});

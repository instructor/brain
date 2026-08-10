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
  { key: "Turniere", label: "Turniere", numeric: true },
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
  if (select.multiple) {
    const current = Array.from(select.selectedOptions).map(o => o.value);
    select.innerHTML = "";
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      opt.selected = current.includes(v);
      select.appendChild(opt);
    }
    return;
  }
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

function populateFilterOptions(rows) {
  fillSelect(document.getElementById("f-dis"), uniqueSorted(rows, "DIS"));
  fillSelect(document.getElementById("f-gs"), uniqueSorted(rows, "GS"));
  fillSelect(document.getElementById("f-akl"), uniqueSorted(rows, "AKL2"));
  fillSelect(document.getElementById("f-gruppe"), uniqueSorted(rows, "Gruppe"));
  fillSelect(document.getElementById("f-lv"), uniqueSorted(rows, "LVName"));
}

function getFilters() {
  return {
    DIS: document.getElementById("f-dis").value,
    GS: document.getElementById("f-gs").value,
    AKL2: Array.from(document.getElementById("f-akl").selectedOptions).map(o => o.value),
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
  return rows.filter(r => {
    if (f.DIS && r.DIS !== f.DIS) return false;
    if (f.GS && r.GS !== f.GS) return false;
    if (f.AKL2.length && !f.AKL2.includes(r.AKL2)) return false;
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
    td.textContent = "Keine Eintraege fuer die aktuelle Filterauswahl.";
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
  renderHead();
  const filtered = applyFilters(state.rows);
  const sorted = sortRows(filtered);
  renderBody(sorted);
  document.getElementById("row-count").textContent =
    `${sorted.length} von ${state.rows.length} Eintraegen`;
}

async function loadWeek(week) {
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

function setupFilterListeners() {
  const ids = ["f-dis", "f-gs", "f-akl", "f-gruppe", "f-lv", "f-bezirk", "f-vorname", "f-nachname", "f-verein"];
  for (const id of ids) {
    const el = document.getElementById(id);
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
  document.getElementById("reset-filters").addEventListener("click", () => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el.multiple) {
        for (const opt of el.options) opt.selected = false;
      } else {
        el.value = "";
      }
    }
    render();
  });
}

async function init() {
  state.index = await fetchJson("data/index.json");
  if (!state.index.latest) {
    document.getElementById("table-body").innerHTML =
      '<tr><td class="empty-state">Keine Ranglisten-Daten gefunden. export_ranking_web.py ausfuehren.</td></tr>';
    return;
  }
  setupTabs();
  setupWeekSelect();
  setupFilterListeners();
  await loadWeek(state.index.latest);
}

init();

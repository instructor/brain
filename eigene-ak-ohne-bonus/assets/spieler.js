// Spieler-Detailseite: liest ?id=&year=&kw=&name= aus der URL, laedt data/kw/<jahr>_KW<kw>_
// {ranking,details}.json und zeigt Zusammenfassung + Turnierergebnisse je Disziplin.

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Fehler beim Laden von ${path}: ${res.status}`);
  return res.json();
}

function weekLabel(jahr, kw) {
  return `${jahr}-${String(kw).padStart(2, "0")}`;
}

// Muss zu rangliste.js' Filter/Renumbering passen, sonst zeigt diese Seite einen anderen
// Ranglistenplatz als die Tabelle (siehe dort fuer Begruendung).
const VALID_SPIELER_ID_RE = /^\d{2}-.+$/;
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

// Breite der "Turnier"-Spalte auf das 5-fache der Header-Textbreite begrenzen (User-Vorgabe
// 2026-08-22), per Canvas-Textmessung wie bei rangliste.js -- einmalig injizierte Stylesheet-
// Regel, greift ueber alle DIS-Bloecke der Seite (Turnier ist immer die erste Spalte).
let _measureCanvas = null;
function measureTextWidth(text, font) {
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}
function applyTurnierColumnWidth() {
  let styleEl = document.getElementById("turnier-col-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "turnier-col-style";
    document.head.appendChild(styleEl);
  }
  const font = getComputedStyle(document.body).font || "14px Arial";
  const target = Math.ceil(measureTextWidth("Turnier", font) * 5);
  styleEl.textContent =
    `.results-table th.col-turnier, .results-table td.col-turnier { max-width: ${target}px; ` +
    `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`;
}

// Höherspielen-Badge (seit 2026-09-02, User-Vorgabe): zeigt bei row.Hoehergespielt die exakte
// Alters-Transition (z.B. "Höher U15 > U17"), plus je nach row.HoeherspielLabel ein
// Zusatz-Badge, wenn keine lokalen Matchdaten vorlagen -- rein informativ (kein Bonuspunkte-
// Anspruch wie bei der eigene-ak-Variante, siehe deren eigenes assets/spieler.js). Badge-Klassen
// aus badges.css (identisch in allen 4 Nicht-eigene-ak-Variantenordnern).
function hoeherBadgeHtml(row) {
  if (!row.Hoehergespielt) return "";
  const hoch = `<span class="badge badge-hoch">Höher ${row.EigeneAK ?? ""} &gt; ${row.KonkurrenzAKL ?? ""}</span>`;
  switch (row.HoeherspielLabel) {
    case "hoeher_bwf_bec":
      return `${hoch} <span class="badge badge-gap">BWF/BEC-Punkte</span>`;
    case "hoeher_o19":
      return `${hoch} <span class="badge badge-o19">O19 RLT/Mst</span>`;
    case "hoeher_datenluecke":
      return `${hoch} <span class="badge badge-gap">Datenlücke</span>`;
    default:
      // "hoeher_matches" -- lokale Matchdaten vorhanden, kein Gap-Badge noetig.
      return hoch;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Match-Detailpanel (User-Vorgabe 2026-09-02): eigene-ak's Turnier-Matchliste auf diese Variante
// erweitert -- nur Runde/Gegner/Ergebnis, kein Sieg-/Gegnerstaerke-Nachweis (siehe hoeherspiel.
// classify_hochspielen). Gezeigt fuer jedes Turnier mit row.Matches, unabhaengig von
// row.Hoehergespielt (analog eigene-ak: alle Turniere, nicht nur hochgespielte).
function renderMatchPanel(row) {
  const details = document.createElement("details");
  details.className = "hoch-panel";
  const summary = document.createElement("summary");
  summary.innerHTML = `
    <span class="sum-turnier">${escapeHtml(row.RankingTournamentName)}</span>
    <span class="sum-meta">${escapeHtml(row.Konkurrenz)} · Platz ${row.Platz ?? "?"} · KW ${weekLabel(row.Jahr, row.KW)}</span>
    <span class="sum-spacer"></span>
    ${hoeherBadgeHtml(row)}`;
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "panel-body";
  const table = document.createElement("table");
  table.className = "match-table";
  table.innerHTML = `<thead><tr><th>Runde</th><th>Gegner</th><th>Ergebnis</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  for (const m of row.Matches) {
    const tr = document.createElement("tr");
    tr.classList.add(m.Ergebnis === "Sieg" ? "win" : "loss");
    tr.innerHTML = `<td>${m.Runde ?? ""}</td><td>${escapeHtml((m.Gegner || []).join(" / "))}</td><td>${m.Ergebnis}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  body.appendChild(table);
  details.appendChild(body);
  return details;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const spielerId = params.get("id");
  const year = Number(params.get("year"));
  const kw = Number(params.get("kw"));
  const name = params.get("name") || "";

  document.getElementById("player-name").textContent = `Rangliste von ${name}`;
  document.getElementById("player-id").textContent = `(${spielerId})`;

  const stem = `${year}_KW${String(kw).padStart(2, "0")}`;
  const [rankingRaw, details] = await Promise.all([
    fetchJson(`data/kw/${stem}_ranking.json`),
    fetchJson(`data/kw/${stem}_details.json`),
  ]);
  const ranking = rankingRaw.filter(r => VALID_SPIELER_ID_RE.test(r.SpielerID || ""));
  renumberRanglistenplatz(ranking);

  const myRanking = ranking.filter(r => String(r.SpielerID) === spielerId);
  const summaryBody = document.getElementById("summary-body");
  for (const r of myRanking) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.DIS}</td><td>${r.Ranglistenplatz ?? ""}</td><td>${r.Points ?? ""}</td>`;
    summaryBody.appendChild(tr);
  }
  if (myRanking.length === 0) {
    summaryBody.innerHTML = '<tr><td colspan="3" class="empty-state">Keine Ranglisten-Einträge für diese Woche.</td></tr>';
  }

  const myDetails = details.filter(d => String(d.SpielerID) === spielerId);
  const byDis = {};
  for (const d of myDetails) {
    (byDis[d.DIS] ??= []).push(d);
  }

  const container = document.getElementById("dis-blocks");
  const disOrder = myRanking.map(r => r.DIS);
  for (const dis of disOrder) {
    const rows = (byDis[dis] || []).slice().sort((a, b) => b.Punkte - a.Punkte);
    const block = document.createElement("div");
    block.className = "dis-block";

    const heading = document.createElement("h2");
    heading.textContent = `${dis} Ergebnisse`;
    block.appendChild(heading);

    const table = document.createElement("table");
    table.className = "results-table";
    table.innerHTML = `<thead><tr>
        <th class="col-turnier">Turnier</th><th>Konkurrenz</th><th>Woche</th><th>Platz</th><th></th><th>Punkte</th>
      </tr></thead>`;
    const tbody = document.createElement("tbody");
    let top5Sum = 0;
    const matchRows = [];
    for (const row of rows) {
      const tr = document.createElement("tr");
      if (row.IstTop5) { tr.classList.add("top5"); top5Sum += row.Punkte || 0; }
      // Turnier verlinken wie auf der Elo-Detailseite (dbv.turnier.de), wenn eine URL
      // bekannt ist (siehe export_ranking_web.py TurnierURL-Anreicherung); sonst reiner Text.
      const name = row.RankingTournamentName ?? "";
      const nameAttr = name.replace(/"/g, "&quot;");
      const turnierCell = row.TurnierURL
        ? `<a href="${row.TurnierURL}" target="_blank" rel="noopener">${name}</a>`
        : name;
      if (row.Matches && row.Matches.length) matchRows.push(row);
      tr.innerHTML = `
        <td class="col-turnier" title="${nameAttr}">${turnierCell}</td>
        <td>${row.Konkurrenz ?? ""}</td>
        <td>${weekLabel(row.Jahr, row.KW)}</td>
        <td>${row.Platz ?? ""}</td>
        <td>${hoeherBadgeHtml(row)}</td>
        <td>${row.Punkte ?? ""}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    block.appendChild(table);

    const total = document.createElement("p");
    total.className = "dis-total";
    total.textContent = `Summe (beste 5, ★ markiert): ${top5Sum} Punkte`;
    block.appendChild(total);

    for (const row of matchRows) { block.appendChild(renderMatchPanel(row)); }

    container.appendChild(block);
  }
  if (disOrder.length === 0) {
    container.innerHTML = '<p class="empty-state">Keine Turnierergebnisse gefunden.</p>';
  }
  applyTurnierColumnWidth();
  document.getElementById("loading-indicator").style.display = "none";
}

init().catch(err => {
  console.error("Fehler beim Laden der Spielerdetails:", err);
  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.style.display = "none";
  document.getElementById("dis-blocks").innerHTML =
    `<p class="empty-state">Fehler beim Laden der Daten: ${err.message}</p>`;
});

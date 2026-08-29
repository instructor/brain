// Spieler-Detailseite: liest ?id=&year=&kw=&name= aus der URL, laedt data/kw/<jahr>_KW<kw>_
// {ranking,details}.json und zeigt Zusammenfassung + Turnierergebnisse je Disziplin.
//
// Erweiterung gegenueber der Basisversion (assets/spieler.js der anderen Varianten, siehe dort):
// jedes Turnier zeigt zusaetzlich Punkte-eigene-AK/Bonus/Gesamtpunkte, und fuer hoehergespielte
// Turniere (row.Hoehergespielt) ein Aufklapp-Panel mit Match-fuer-Match-Nachweis des
// Hoeherspielen-Bonus (siehe hoeherspiel.compute_row_points/ranking_engine.DETAIL_COLUMNS) --
// auch Bonus=0-Faelle werden angezeigt, nicht nur bonusrelevante Siege (User-Vorgabe 2026-08-28).

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Fehler beim Laden von ${path}: ${res.status}`);
  return res.json();
}

function weekLabel(jahr, kw) {
  return `${jahr}-${String(kw).padStart(2, "0")}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "";
  return Number(n).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

function fmtSigned(n) {
  if (n == null || Number.isNaN(n)) return "";
  const v = Number(n);
  return (v >= 0 ? "+" : "") + fmtNum(v);
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

function bonusBadgeHtml(row) {
  switch (row.BonusStatus) {
    case "bonus_angewendet":
      return `<span class="badge badge-hoch">höhergespielt</span> <span class="badge badge-bonus">Bonus ${fmtSigned(row.Bonus)}</span>`;
    case "kein_bonus":
      return `<span class="badge badge-hoch">höhergespielt</span> <span class="badge badge-nobonus">kein Bonus</span>`;
    case "bwf_bec_punkte":
      return `<span class="badge badge-hoch">höhergespielt</span> <span class="badge badge-gap">BWF/BEC-Punkte</span>`;
    case "datenluecke":
      return `<span class="badge badge-hoch">höhergespielt</span> <span class="badge badge-gap">Datenlücke</span>`;
    default:
      return `<span class="badge badge-hoch">höhergespielt</span>`;
  }
}

function renderHochPanel(row) {
  const details = document.createElement("details");
  details.className = "hoch-panel";

  const summary = document.createElement("summary");
  const badge = row.BonusStatus === "bonus_angewendet" ? `<span class="badge badge-bonus">Bonus ${fmtSigned(row.Bonus)}</span>`
    : row.BonusStatus === "kein_bonus" ? `<span class="badge badge-nobonus">kein Bonus</span>`
    : row.BonusStatus === "bwf_bec_punkte" ? `<span class="badge badge-gap">BWF/BEC-Punkte</span>`
    : `<span class="badge badge-gap">Datenlücke</span>`;
  summary.innerHTML = `
    <span class="sum-turnier">${escapeHtml(row.RankingTournamentName)}</span>
    <span class="sum-meta">${escapeHtml(row.Konkurrenz)} · Platz ${row.Platz ?? "?"} · KW ${weekLabel(row.Jahr, row.KW)}</span>
    <span class="sum-spacer"></span>
    ${badge}`;
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "panel-body";

  const isBwf = row.BonusStatus === "bwf_bec_punkte";
  const statStrip = document.createElement("div");
  statStrip.className = "stat-strip";
  const stats = [
    ["Platz", row.Platz ?? "", false],
    ["Punkte eigene AK (a)", fmtNum(row.PunkteEigeneAK), false],
    ["Punkte gespielte AK (b)", fmtNum(row.PunkteGespielteAK), false],
  ];
  if (row.AnzahlMatches != null) stats.push(["Matches (n)", row.AnzahlMatches, false]);
  stats.push(["Bonus", fmtSigned(row.Bonus), false]);
  stats.push(["Gesamtpunkte", isBwf ? `${fmtNum(row.Punkte)}*` : fmtNum(row.Punkte), true]);
  for (const [label, value, final] of stats) {
    const div = document.createElement("div");
    div.className = "stat" + (final ? " stat-final" : "");
    div.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
    statStrip.appendChild(div);
  }
  body.appendChild(statStrip);

  if (row.Matches && row.Matches.length) {
    const hasO19 = row.Matches.some(m => m.GegnerErwachsen !== null && m.GegnerErwachsen !== undefined);
    const table = document.createElement("table");
    table.className = "match-table";
    table.innerHTML = hasO19
      ? `<thead><tr><th>Runde</th><th>Gegner</th><th>Ergebnis</th><th>Gegner-Status</th><th>Grund</th></tr></thead>`
      : `<thead><tr><th>Runde</th><th>Gegner</th><th>Ergebnis</th><th>Gegner nativ?</th><th>Vorwochenpunkte eigene → Gegner</th><th>Grund</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const m of row.Matches) {
      const tr = document.createElement("tr");
      tr.classList.add(m.Ergebnis === "Sieg" ? "win" : "loss");
      const ergebnisCls = m.Ergebnis === "Sieg" ? "stronger" : "";
      const gegner = escapeHtml((m.Gegner || []).join(" / "));
      if (hasO19) {
        const status = m.GegnerErwachsen === true ? "native O19-Spieler/in"
          : m.GegnerErwachsen === false ? "selbst noch U19-ranglistenfähig" : "—";
        tr.innerHTML = `
          <td>${m.Runde ?? ""}</td>
          <td>${gegner}</td>
          <td class="${ergebnisCls}">${m.Ergebnis}</td>
          <td>${status}</td>
          <td class="grund">${escapeHtml(m.Grund)}</td>`;
      } else {
        const nativCls = m.GegnerNativ === true ? "stronger" : "";
        const nativText = m.GegnerNativ === true ? "ja" : m.GegnerNativ === false ? "nein" : "—";
        const hatPunkte = m.EigenePunkte != null && m.GegnerPunkte != null;
        const staerker = hatPunkte && m.GegnerPunkte > m.EigenePunkte;
        const punkteText = hatPunkte
          ? `${fmtNum(m.EigenePunkte)} → ${fmtNum(m.GegnerPunkte)}${(m.Gegner || []).length > 1 ? " (Ø)" : ""}`
          : "—";
        tr.innerHTML = `
          <td>${m.Runde ?? ""}</td>
          <td>${gegner}</td>
          <td class="${ergebnisCls}">${m.Ergebnis}</td>
          <td class="${nativCls}">${nativText}</td>
          <td class="num ${staerker ? "stronger" : ""}">${punkteText}</td>
          <td class="grund">${escapeHtml(m.Grund)}</td>`;
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  } else if (row.BonusStatus === "bwf_bec_punkte") {
    const note = document.createElement("div");
    note.className = "gap-note";
    note.innerHTML = `<strong>BWF/BEC-Punkte</strong> — Bei internationalen BWF/BEC-Turnieren ` +
      `zählen die vollen Punkte der gespielten Altersklasse, auch weil die Matchdaten und ` +
      `Ergebnisse nicht vorliegen.`;
    body.appendChild(note);
  } else if (row.BonusStatus === "datenluecke") {
    const note = document.createElement("div");
    note.className = "gap-note";
    note.innerHTML = `<strong>Bonus konnte nicht berechnet werden</strong> — für dieses Turnier ` +
      `liegt keine Matchinformation vor. Wertung deshalb mit Bonus = 0 Punkte.`;
    body.appendChild(note);
  }

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
    tr.innerHTML = `<td>${r.DIS}</td><td>${r.Ranglistenplatz ?? ""}</td><td>${fmtNum(r.Points)}</td>`;
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

  let anyBwf = false;
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
    table.className = "results-table tourn-table";
    table.innerHTML = `<thead><tr>
        <th class="col-turnier">Turnier</th><th>Konkurrenz</th><th>Woche</th><th>Platz</th><th></th>
        <th>Punkte eigene AK</th><th>Bonus</th><th>Gesamtpunkte</th>
      </tr></thead>`;
    const tbody = document.createElement("tbody");
    let top5Sum = 0;
    const hochRows = [];
    for (const row of rows) {
      const tr = document.createElement("tr");
      if (row.IstTop5) { tr.classList.add("top5"); top5Sum += row.Punkte || 0; }
      const tname = row.RankingTournamentName ?? "";
      const nameAttr = escapeHtml(tname);
      const turnierCell = row.TurnierURL
        ? `<a href="${row.TurnierURL}" target="_blank" rel="noopener">${escapeHtml(tname)}</a>`
        : escapeHtml(tname);
      const hoch = !!row.Hoehergespielt;
      if (hoch) {
        hochRows.push(row);
        if (row.BonusStatus === "bwf_bec_punkte") anyBwf = true;
      }
      const punkteEigeneAK = hoch ? row.PunkteEigeneAK : row.Punkte;
      const bonusCell = hoch ? fmtSigned(row.Bonus) : "—";
      const gesamtCell = row.BonusStatus === "bwf_bec_punkte" ? `${fmtNum(row.Punkte)}*` : fmtNum(row.Punkte);
      tr.innerHTML = `
        <td class="col-turnier" title="${nameAttr}">${turnierCell}</td>
        <td>${escapeHtml(row.Konkurrenz)}</td>
        <td>${weekLabel(row.Jahr, row.KW)}</td>
        <td>${row.Platz ?? ""}</td>
        <td>${hoch ? bonusBadgeHtml(row) : ""}</td>
        <td class="num">${fmtNum(punkteEigeneAK)}</td>
        <td class="num">${bonusCell}</td>
        <td class="num">${gesamtCell}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    block.appendChild(table);

    const total = document.createElement("p");
    total.className = "dis-total";
    total.textContent = `Summe (beste 5, ★ markiert): ${fmtNum(top5Sum)} Punkte`;
    block.appendChild(total);

    for (const row of hochRows) {
      block.appendChild(renderHochPanel(row));
    }

    container.appendChild(block);
  }
  if (disOrder.length === 0) {
    container.innerHTML = '<p class="empty-state">Keine Turnierergebnisse gefunden.</p>';
  }
  if (anyBwf) {
    const note = document.createElement("p");
    note.className = "hoeherspiel-footnote";
    note.textContent = "* Bei BWF/BEC-Turnieren werden bei Höherspielen die Punkte der höheren AK vergeben.";
    container.appendChild(note);
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

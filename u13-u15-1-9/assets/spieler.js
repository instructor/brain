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

async function init() {
  const params = new URLSearchParams(window.location.search);
  const spielerId = params.get("id");
  const year = Number(params.get("year"));
  const kw = Number(params.get("kw"));
  const name = params.get("name") || "";

  document.getElementById("player-name").textContent = `Rangliste von ${name}`;
  document.getElementById("player-id").textContent = `(${spielerId})`;

  const stem = `${year}_KW${String(kw).padStart(2, "0")}`;
  const [ranking, details] = await Promise.all([
    fetchJson(`data/kw/${stem}_ranking.json`),
    fetchJson(`data/kw/${stem}_details.json`),
  ]);

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
        <th>Turnier</th><th>Konkurrenz</th><th>Woche</th><th>Platz</th><th>Punkte</th>
      </tr></thead>`;
    const tbody = document.createElement("tbody");
    let top5Sum = 0;
    for (const row of rows) {
      const tr = document.createElement("tr");
      if (row.IstTop5) { tr.classList.add("top5"); top5Sum += row.Punkte || 0; }
      tr.innerHTML = `
        <td>${row.RankingTournamentName ?? ""}</td>
        <td>${row.Konkurrenz ?? ""}</td>
        <td>${weekLabel(row.Jahr, row.KW)}</td>
        <td>${row.Platz ?? ""}</td>
        <td>${row.Punkte ?? ""}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    block.appendChild(table);

    const total = document.createElement("p");
    total.className = "dis-total";
    total.textContent = `Summe (beste 5, ★ markiert): ${top5Sum} Punkte`;
    block.appendChild(total);

    container.appendChild(block);
  }
  if (disOrder.length === 0) {
    container.innerHTML = '<p class="empty-state">Keine Turnierergebnisse gefunden.</p>';
  }
}

init();

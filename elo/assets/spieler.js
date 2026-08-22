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

  // Elo-Detailschema (siehe build_elo_ranking.py DETAIL_COLUMNS): pro Zeile ein Match, nicht ein
  // Turnier-Gesamtergebnis -- letzte 5 Turniere je Disziplin, davon jeweils alle Matches
  // (User-Vorgabe 2026-08-21). Turnier-Reihenfolge/Match-Reihenfolge folgt der Datenreihenfolge
  // (build_detail_rows liefert bereits neueste-zuerst).
  const myDetails = details.filter(d => String(d.SpielerID) === spielerId);
  const byDis = {};
  for (const d of myDetails) {
    (byDis[d.DIS] ??= []).push(d);
  }

  const container = document.getElementById("dis-blocks");
  const disOrder = myRanking.map(r => r.DIS);
  for (const dis of disOrder) {
    const rows = byDis[dis] || [];
    const block = document.createElement("div");
    block.className = "dis-block";

    const heading = document.createElement("h2");
    heading.textContent = `${dis} — letzte Turniere`;
    block.appendChild(heading);

    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Keine erfassten Matches für diese Disziplin.";
      block.appendChild(empty);
      container.appendChild(block);
      continue;
    }

    const byTurnier = {};
    const turnierOrder = [];
    for (const row of rows) {
      if (!(row.Turnier in byTurnier)) { byTurnier[row.Turnier] = []; turnierOrder.push(row.Turnier); }
      byTurnier[row.Turnier].push(row);
    }

    for (const turnier of turnierOrder) {
      const matches = byTurnier[turnier];
      // Partner nur bei Doppel/Mixed vorhanden (siehe elo_engine._log_team) -- Spalte pro
      // Turnier-Block ein-/ausblenden statt fest je DIS, damit die Tabelle robust bleibt, falls
      // ein Turnier abweichend erfasst wurde (User-Vorgabe 2026-08-22).
      const hasPartner = matches.some(m => m.Partner);
      const sub = document.createElement("h3");
      if (matches[0].TurnierURL) {
        const link = document.createElement("a");
        link.href = matches[0].TurnierURL;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = turnier;
        sub.appendChild(link);
        sub.append(` (${matches[0].Datum})`);
      } else {
        sub.textContent = `${turnier} (${matches[0].Datum})`;
      }
      block.appendChild(sub);

      const table = document.createElement("table");
      table.className = "results-table";
      table.innerHTML = `<thead><tr>
          <th>Datum</th><th>Gegner</th>${hasPartner ? "<th>Partner</th>" : ""}
          <th>Ergebnis</th><th>Erwartungswert</th>
          <th>Rating vorher → nachher</th><th>Δ</th>
        </tr></thead>`;
      const tbody = document.createElement("tbody");
      let netDelta = 0;
      for (const m of matches) {
        const tr = document.createElement("tr");
        tr.classList.add(m.Ergebnis === "Sieg" ? "win" : "loss");
        const delta = m.Delta ?? 0;
        netDelta += delta;
        tr.innerHTML = `
          <td>${m.Datum ?? ""}</td>
          <td>${m.Gegner ?? ""}</td>
          ${hasPartner ? `<td>${m.Partner ?? ""}</td>` : ""}
          <td>${m.Ergebnis ?? ""}</td>
          <td>${m.Erwartungswert != null ? (m.Erwartungswert * 100).toFixed(1) + " %" : ""}</td>
          <td>${m.RatingVorher ?? ""} → ${m.RatingNachher ?? ""}</td>
          <td class="${delta >= 0 ? "delta-pos" : "delta-neg"}">${delta >= 0 ? "+" : ""}${delta.toFixed(1)}</td>`;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      block.appendChild(table);

      const total = document.createElement("p");
      total.className = "dis-total";
      total.textContent = `Rating-Änderung in diesem Turnier: ${netDelta >= 0 ? "+" : ""}${netDelta.toFixed(1)}`;
      block.appendChild(total);
    }

    container.appendChild(block);
  }
  if (disOrder.length === 0) {
    container.innerHTML = '<p class="empty-state">Keine Ranglisten-Einträge gefunden.</p>';
  }
}

init();

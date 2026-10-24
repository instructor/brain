// H2H-Ausreisser-Erklaerung (2026-10-18): vergleich.html?id=&dis=&year=&kw=&nachbarn=id1,id2,...
// fasst zusammen, warum ein Spieler in der Rangliste anders steht, als seine direkten Begegnungen
// mit den Nachbarn aus dem H2H-Hover nahelegen (ein Link je Hover-Box, Vorbild: Analyse Aarya
// Dahiya DE U15 KW40/2026). Alles wird erst hier im Browser aus den ohnehin vorhandenen
// Wochendateien {ranking,details,h2h_test}.json berechnet -- kein Build-Schritt; die Nachbarn kommen
// per URL aus der Box und passen damit zur jeweiligen Filterauswahl der Tabelle. Die Gruende sind
// feste Regeln (Hoeherspielen, fruehere AK, Turnierzahl, gemeinsame Turniere, Breite vs. Begegnungen,
// Gegenprobe mit Punkten der eigenen AK, Vergleich mit Original), keine Einzelfallpruefung.
// Seit 2026-10-21 in allen Varianten dieselbe Datei; Unterschiede nur ueber window.VGL_CONFIG in
// vergleich.html: original = true -> kein Abschnitt "Bezug zur Variante"; hoeher = wie Ergebnisse
// in der hoeheren AK zaehlen ("voll" = Punkte der gespielten AK, "bonus" = eigene AK + Teilbonus,
// "keine" = nur eigene AK -> Grund "hoehere AK" entfaellt).
const VGL = Object.assign({ original: false, hoeher: "voll" }, window.VGL_CONFIG || {});

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Fehler beim Laden von ${path}: ${res.status}`);
  return res.json();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "";
  return Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

// Wie rangliste.js/spieler.js: nur Zeilen mit DBV-SpielerID, gemeinsamer Rang bei Punktgleichheit.
const VALID_SPIELER_ID_RE = /^\d{2}-.+$/;
function renumberRanglistenplatz(rows) {
  const byDis = new Map();
  for (const r of rows) {
    if (!byDis.has(r.DIS)) byDis.set(r.DIS, []);
    byDis.get(r.DIS).push(r);
  }
  for (const group of byDis.values()) {
    group.sort((a, b) => Number(a.Ranglistenplatz) - Number(b.Ranglistenplatz));
    group.forEach((r, i) => {
      const prev = group[i - 1];
      r.Ranglistenplatz = prev && Number(prev.Points) === Number(r.Points) ? prev.Ranglistenplatz : i + 1;
    });
  }
}

const summe = arr => arr.reduce((s, x) => s + Number(x || 0), 0);
const nm = r => escapeHtml(`${r.Vorname || ""} ${r.Nachname || ""}`.trim());
const aufzaehlen = arr => arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} und ${arr[arr.length - 1]}`;

// Top 5 aus den Detailzeilen: IstTop5 wie von der Engine markiert, Rueckfall die 5 hoechsten.
function top5(rows) {
  const markiert = rows.filter(d => d.IstTop5);
  return (markiert.length ? markiert : rows.slice(0, 5)).slice().sort((a, b) => b.Punkte - a.Punkte);
}
const hoeherTop5 = rows => top5(rows).filter(d => d.Hoehergespielt);

// Gegenprobe: Hoeherspiel-Ergebnisse mit den Punkten der eigenen AK, dann neu die besten 5.
function eigeneAkWerte(rows) {
  return rows.map(d => ({ d, w: d.Hoehergespielt && d.PunkteEigeneAK != null ? d.PunkteEigeneAK : d.Punkte }))
    .sort((a, b) => b.w - a.w).slice(0, 5);
}

function ergebnisTabelle(r, rows) {
  const t5 = new Set(top5(rows));
  const zeilen = rows.map(d => {
    const tag = d.Hoehergespielt
      ? `<span class="vgl-tag vgl-tag-hoch">höher ${escapeHtml(d.EigeneAK)} &gt; ${escapeHtml(d.KonkurrenzAKL)}</span>` : "";
    const turnier = d.TurnierURL
      ? `<a href="${escapeHtml(d.TurnierURL)}" target="_blank" rel="noopener">${escapeHtml(d.RankingTournamentName)}</a>`
      : escapeHtml(d.RankingTournamentName);
    return `<tr class="${t5.has(d) ? "" : "vgl-nicht-top5"}"><td>${turnier}</td><td>${escapeHtml(d.Konkurrenz)}${tag}</td>
      <td class="num">${d.Platz ?? ""}</td><td class="num">${fmtNum(d.Punkte)}</td></tr>`;
  }).join("");
  return `<table class="vgl-tab"><thead><tr><th>Turnier</th><th>Konkurrenz</th><th>Platz</th><th>Punkte</th></tr></thead>
    <tbody>${zeilen}</tbody></table>`;
}

async function init() {
  const p = new URLSearchParams(window.location.search);
  const idX = p.get("id"), dis = p.get("dis");
  let year = Number(p.get("year")), kw = Number(p.get("kw"));
  const nachbarIds = (p.get("nachbarn") || "").split(",").filter(Boolean);
  const inhalt = document.getElementById("vgl-inhalt");
  if (!idX || !dis || !nachbarIds.length) {
    inhalt.innerHTML = `<p class="empty-state">Unvollständiger Link. Bitte die Erklärung über den Link oben in der
      H2H-Box der Rangliste öffnen.</p>`;
    return;
  }
  // Abgeschnittener Link (z.B. "year=202" ohne kw): auf die neueste Woche der Variante zurueckfallen
  if (!(year >= 2000 && kw >= 1 && kw <= 53)) {
    const index = await fetchJson("data/index.json");
    ({ year, kw } = index.latest);
  }
  const stem = `${year}_KW${String(kw).padStart(2, "0")}`;

  const [rankingRaw, details, h2h] = await Promise.all([
    fetchJson(`data/kw/${stem}_ranking.json`),
    fetchJson(`data/kw/${stem}_details.json`),
    fetchJson(`data/kw/${stem}_h2h_test.json`).catch(() => null),
  ]);
  const ranking = rankingRaw.filter(r => VALID_SPIELER_ID_RE.test(r.SpielerID || "") && r.DIS === dis);
  renumberRanglistenplatz(ranking);
  const byId = new Map(ranking.map(r => [r.SpielerID, r]));
  const X = byId.get(idX);
  if (!X || !h2h) {
    inhalt.innerHTML = `<p class="empty-state">Spieler oder H2H-Daten für ${escapeHtml(dis)} in dieser Woche nicht gefunden.</p>`;
    return;
  }
  const detailsVon = new Map();
  for (const d of details) {
    if (d.DIS !== dis) continue;
    if (!detailsVon.has(d.SpielerID)) detailsVon.set(d.SpielerID, []);
    detailsVon.get(d.SpielerID).push(d);
  }
  for (const rows of detailsVon.values()) rows.sort((a, b) => b.Punkte - a.Punkte);
  const dX = detailsVon.get(idX) || [];
  const dt = id => detailsVon.get(id) || [];

  // Platz innerhalb der eigenen AK-Teilliste (wie "U15-Platz" in der Tabelle mit AK-Filter)
  const akl = X.AKL2;
  const akPunkte = ranking.filter(r => r.AKL2 === akl).map(r => Number(r.Points));
  const akPlatz = r => r.AKL2 === akl ? 1 + akPunkte.filter(v => v > Number(r.Points)).length : null;
  const platzText = r => r.AKL2 === akl ? `${akPlatz(r)}` : `gesamt ${r.Ranglistenplatz} (${escapeHtml(r.AKL2)})`;

  // Direkte Begegnungen aus Sicht von X (Gegnerliste ist an die SpielerID gebunden, nicht an die DIS)
  const hX = h2h.Rows.find(e => e.SpielerID === idX && e.DIS === dis);
  const gegner = new Map((hX?.Opponents || []).map(([id, ms]) => [id, ms.map(([t, s]) => ({ turnier: h2h.Turniere[t], sieg: !!s }))]));
  const nachbarn = nachbarIds.map(id => byId.get(id)).filter(Boolean).map(r => {
    const ms = gegner.get(r.SpielerID) || [];
    const w = ms.filter(m => m.sieg).length, l = ms.length - w;
    const oben = Number(r.Points) > Number(X.Points);
    const gleich = Number(r.Points) === Number(X.Points);
    const bew = !ms.length || w === l || gleich ? "neutral" : (oben ? (w > l ? "rot" : "gruen") : (l > w ? "rot" : "gruen"));
    return { r, ms, w, l, oben, bew };
  }).sort((a, b) => Number(b.r.Points) - Number(a.r.Points));
  const nGruen = nachbarn.filter(n => n.bew === "gruen").length, nRot = nachbarn.filter(n => n.bew === "rot").length;
  const zuTief = nachbarn.filter(n => n.bew === "rot" && n.oben);   // X hat gegen Hoehere gewonnen
  const zuHoch = nachbarn.filter(n => n.bew === "rot" && !n.oben);  // Tiefere haben gegen X gewonnen
  // Doppel/Mixed: H2H zaehlt partnerunabhaengig, Partner sind in den Daten nicht enthalten (2026-10-21)
  const doppel = ["HD", "DD", "HM", "DM"].includes(dis);
  // Knapper Abstand (< 1 % der Punkte von X): Reihenfolge haengt an einem einzelnen Ergebnis
  const knapp = n => Math.abs(Number(n.r.Points) - Number(X.Points)) < 0.01 * Number(X.Points);

  // "Sportlich": Einfuegeposition unter den Nachbarn mit den wenigsten Widerspruechen
  let besteK = nachbarn.filter(n => n.oben).length, besteFehler = Infinity;
  const aktK = besteK;
  for (let k = 0; k <= nachbarn.length; k++) {
    let fehler = 0;
    nachbarn.forEach((n, i) => { if (i < k ? n.w > n.l : n.l > n.w) fehler++; });
    if (fehler < besteFehler || (fehler === besteFehler && Math.abs(k - aktK) < Math.abs(besteK - aktK))) {
      besteK = k; besteFehler = fehler;
    }
  }
  let sportlich = "";
  if (besteK !== aktK) {
    // hoeher: X rueckt direkt vor nachbarn[besteK] (uebernimmt dessen Platz); tiefer: X rueckt direkt
    // hinter nachbarn[besteK-1], der dabei um eins aufrueckt -- X uebernimmt dessen bisherigen Platz.
    const bezug = besteK < aktK ? nachbarn[besteK].r : nachbarn[besteK - 1].r;
    const ziel = bezug.AKL2 === akl ? akPlatz(bezug) : null;
    const wo = ziel ? `auf Platz ${ziel}${besteK > aktK ? " (tiefer)" : ""}` : (besteK > aktK ? "tiefer" : "höher");
    sportlich = doppel
      ? `Rein nach den direkten Begegnungen stünde ${nm(X)} eher ${wo}.`
      : `Nach den direkten Begegnungen gehört ${nm(X)} eher ${wo}.`;
  }
  if (zuTief.length && zuHoch.length) {
    sportlich += ` Der Unterschied zeigt sich aber in beide Richtungen: gegenüber ${aufzaehlen(zuHoch.map(n => nm(n.r)))} steht ${nm(X)} höher, als die direkten Begegnungen nahelegen.`;
  }
  if (doppel && nRot) {
    sportlich += ` Im ${dis === "HM" || dis === "DM" ? "Mixed" : "Doppel"} zählen die Begegnungen unabhängig vom Partner. Ein Teil des Unterschieds kann deshalb an
      wechselnden Partnern liegen.`;
  }

  // --- Warum zu tief: Ursachen deuten statt Ergebnisse aufzaehlen (User-Vorgabe 2026-10-21;
  // die Zahlen stehen in der H2H-Tabelle und unter "Ergebnisse im Wertungszeitraum")
  const tiefPunkte = [];
  const knappVor = zuTief.filter(knapp);
  if (knappVor.length) {
    tiefPunkte.push(`${nm(X)} liegt nur knapp hinter ${aufzaehlen(knappVor.map(n => nm(n.r)))}. Schon ein etwas besseres
      Ergebnis würde die Reihenfolge drehen.`);
  }
  if (zuTief.length) {
    const hochX = hoeherTop5(dX);
    const mitMehrHoch = VGL.hoeher === "keine" ? []
      : zuTief.filter(n => summe(hoeherTop5(dt(n.r.SpielerID)).map(d => d.Punkte)) > summe(hochX.map(d => d.Punkte)));
    if (mitMehrHoch.length) {
      const wer = `${aufzaehlen(mitMehrHoch.map(n => nm(n.r)))} ${mitMehrHoch.length === 1 ? "holt" : "holen"}`;
      tiefPunkte.push((VGL.hoeher === "bonus"
        ? `<b>Siege in der höheren AK bringen Bonuspunkte.</b> ${wer} einen großen Teil der Punkte in der höheren AK,
          wo jeder Sieg zusätzliche Punkte bringt.`
        : `<b>Die gespielte höhere AK zählt voll.</b> ${wer} einen großen Teil der Punkte in der höheren AK, wo auch
          Plätze im Mittelfeld viele Punkte bringen.`)
        + ` ${nm(X)} nutzt diesen Weg ${hochX.length ? "seltener" : "nicht"}.`);
    }
    // Gemeinsame Turniere (gleiches Turnier, gleiche Konkurrenz), in denen X meist besser war
    const imFeldBesser = zuTief.filter(n => {
      const paare = dX.map(a => [a, dt(n.r.SpielerID).find(b => b.RankingTournamentID === a.RankingTournamentID && b.Konkurrenz === a.Konkurrenz)])
        .filter(([a, b]) => b && a.Platz && b.Platz);
      return paare.length >= 2 && paare.filter(([a, b]) => a.Platz < b.Platz).length > paare.length / 2;
    });
    if (imFeldBesser.length) {
      tiefPunkte.push(`Wo ${nm(X)} und ${aufzaehlen(imFeldBesser.map(n => nm(n.r)))} im selben Feld standen, lag ${nm(X)}
        meist vorn. Der Rückstand kommt also nicht aus der Leistung, sondern aus der Auswahl der Turniere.`);
    }
    // Fruehere (juengere) AK und Turnierzahl
    const altX = dX.filter(d => !d.Hoehergespielt && d.EigeneAK && d.EigeneAK !== akl && d.Platz <= 8);
    if (altX.length) {
      tiefPunkte.push(`Ein Teil der Erfolge von ${nm(X)} stammt noch aus der ${escapeHtml(altX[0].EigeneAK)} und zählt nach
        deren niedrigerer Punktetabelle.`);
    }
    const tz = zuTief.map(n => Number(n.r.Turniere));
    if (Number(X.Turniere) < Math.min(...tz) * 0.85) {
      tiefPunkte.push(`${nm(X)} hat weniger Turniere gespielt und damit weniger Gelegenheiten für hohe Ergebnisse.`);
    }
    if (mitMehrHoch.length || imFeldBesser.length) {
      tiefPunkte.push(`Der Rang bildet hier eher den Turnierkalender ab als die direkte Spielstärke.`);
    }
  }

  // --- Warum zu hoch: die Tieferen haben gewonnen, aber schwaechere Best-5
  const hochPunkte = zuHoch.map(n => {
    const t5n = top5(dt(n.r.SpielerID)), t5x = top5(dX);
    let warum;
    if (knapp(n)) warum = "liegt aber nur knapp dahinter. Schon ein etwas besseres Ergebnis würde die Reihenfolge drehen";
    else if (t5n.length < 5) warum = "spielt aber zu wenige Turniere, um die Siege in Punkte umzusetzen";
    else {
      const stark = t5n.filter(d => d.Punkte >= (t5x[2]?.Punkte ?? 0)).length;
      warum = stark === 1 ? "hat aber neben einem Spitzenergebnis zu wenig Breite"
        : stark === 0 ? "erreicht aber nicht die Spitzenergebnisse, die in der Rangliste zählen"
        : "verliert aber Punkte durch die schwächeren hinteren Ergebnisse unter den besten 5";
    }
    const begegnung = n.ms.length > 1 ? "die direkten Begegnungen" : "die direkte Begegnung";
    return `${nm(n.r)} gewinnt ${begegnung}, ${warum}.`;
  });
  if (zuHoch.some(n => !knapp(n))) {
    hochPunkte.push(`Die Ergebnisse von ${nm(X)} sind breiter und konstanter. Das ist der Zielkonflikt einer
      Best-5-Rangliste: Breite schlägt direkte Begegnungen.`);
  }

  // --- Gegenprobe: Hoeherspiel-Ergebnisse mit Punkten der eigenen AK
  let gegenprobe = "";
  const beteiligte = [X, ...nachbarn.map(n => n.r)];
  if (beteiligte.some(r => dt(r.SpielerID).some(d => d.Hoehergespielt && d.PunkteEigeneAK != null))) {
    const neu = new Map();
    for (const r of ranking) if (r.AKL2 === akl) neu.set(r.SpielerID, summe(eigeneAkWerte(dt(r.SpielerID)).map(x => x.w)));
    const alleNeu = [...neu.values()];
    const neuPlatz = id => 1 + alleNeu.filter(v => v > neu.get(id)).length;
    const wX = neu.get(idX);
    const ueberholt = zuTief.filter(n => neu.has(n.r.SpielerID) && neu.get(n.r.SpielerID) < wX);
    const bleibt = zuTief.filter(n => neu.has(n.r.SpielerID) && neu.get(n.r.SpielerID) >= wX);
    const pNeu = neuPlatz(idX), pAlt = akPlatz(X);
    let satz = `Wertet man alle Höherspiel-Ergebnisse mit den Punkten der eigenen AK, `;
    if (pNeu < pAlt) {
      satz += `rückt ${nm(X)} auf Platz ${pNeu}`;
      satz += ueberholt.length ? `, vor ${aufzaehlen(ueberholt.map(n => nm(n.r)))}.` : ".";
    } else if (pNeu === pAlt) {
      satz += `bliebe ${nm(X)} auf Platz ${pNeu}.`;
    } else {
      satz += `fiele ${nm(X)} auf Platz ${pNeu}. ${nm(X)} profitiert also selbst von Ergebnissen in der höheren AK.`;
    }
    if (bleibt.length) {
      const top = bleibt.map(n => {
        const d = eigeneAkWerte(dt(n.r.SpielerID))[0]?.d;
        return d ? `${nm(n.r)} mit Platz ${d.Platz} in ${escapeHtml(d.RankingTournamentName)} (${fmtNum(d.Punkte)})` : nm(n.r);
      });
      satz += ` ${aufzaehlen(bleibt.map(n => nm(n.r)))} ${bleibt.length === 1 ? "bleibt" : "bleiben"} trotz verlorener
        H2H vor ${nm(X)}. Der Grund sind hohe Einzelergebnisse, etwa ${aufzaehlen(top.slice(0, 2))}.`;
    }
    gegenprobe = satz;
  }

  // --- Bezug zur Variante: Punkte wie im Original?
  let variante = "";
  if (!VGL.original && hX?.OriginalPunkte != null) {
    const gleich = Number(hX.OriginalPunkte) === Number(X.Points);
    variante = gleich
      // ohne Rang: OriginalRang ist global ueber alle AK und nicht mit den AK-Plaetzen oben vergleichbar (2026-10-21)
      ? `Die Punkte von ${nm(X)} sind hier und in der Original-Rangliste gleich. Der Unterschied zwischen Rang und
         H2H-Ergebnissen besteht also schon im Original und entsteht nicht durch die Regel dieser Variante.`
      : `In der Original-Rangliste hat ${nm(X)} ${fmtNum(hX.OriginalPunkte)} Punkte, hier ${fmtNum(X.Points)}.`;
    const tiefHoch = zuTief.flatMap(n => hoeherTop5(dt(n.r.SpielerID)));
    if (gleich && tiefHoch.length && tiefHoch.every(d => /^vorne\s/.test(d.BonusStatus || ""))) {
      variante += ` Sie verkleinert ihn aber auch nicht, weil alle Beteiligten ihre Höherspiel-Plätze in der vorderen Hälfte
        erreicht haben. Den Unterschied macht das Niveau der Turniere in der höheren AK; dafür bräuchte es einen
        Abschlag bei Ergebnissen aus der höheren AK.`;
    }
  }

  // --- Ausgabe
  const verein = X.Verein ? `${escapeHtml(X.Verein)}, ` : "";
  const pct = nGruen + nRot ? Math.round(100 * nGruen / (nGruen + nRot)) : null;
  document.title = `${`${X.Vorname || ""} ${X.Nachname || ""}`.trim()} – Rang vs. H2H`;
  document.getElementById("vgl-titel").textContent = "Woher kommt der Unterschied zwischen Rang und H2H-Vergleich?";
  document.getElementById("vgl-sub").innerHTML = `${nm(X)} (${verein}Jg. ${X.GJahr ?? ""}) steht in KW${String(kw).padStart(2, "0")}/${year}
    im ${escapeHtml(dis)} ${escapeHtml(akl)} auf Platz ${akPlatz(X)} (gesamt ${X.Ranglistenplatz}, ${fmtNum(X.Points)} Pkt.).
    Gegen die Nachbarn zeigt die H2H-Spalte <span class="vgl-sieg">${nGruen}✓</span> <span class="vgl-niederlage">${nRot}✗</span>${pct != null ? ` (${pct} %)` : ""}.`;

  const bewText = { gruen: `<span class="vgl-sieg">✓</span>`, rot: `<span class="vgl-niederlage">✗</span>`, neutral: `<span title="ausgeglichen oder gleicher Rang">○</span>` };
  const tabelle = `<table class="vgl-tab"><thead><tr><th>Platz ${escapeHtml(akl)}</th><th>Spieler</th><th title="Siege–Niederlagen von ${nm(X)}">Bilanz</th><th></th></tr></thead><tbody>
    ${[...nachbarn.filter(n => n.oben), { r: X, ich: true }, ...nachbarn.filter(n => !n.oben)].map(n => n.ich
      ? `<tr class="vgl-ich"><td>${platzText(X)}</td><td><b>${nm(X)}</b></td><td></td><td></td></tr>`
      : `<tr><td>${platzText(n.r)}</td><td>${nm(n.r)}</td><td class="num">${n.w}–${n.l}</td><td>${bewText[n.bew]}</td></tr>`).join("")}
    </tbody></table>${sportlich ? `<p>${sportlich}</p>` : ""}`;

  const abschnitt = (titel, punkte) => punkte.length
    ? `<div class="vgl-box"><h2>${titel}</h2>${punkte.map(t => `<p>${t}</p>`).join("")}</div>` : "";
  const ergebnisse = [X, ...zuTief.map(n => n.r), ...zuHoch.map(n => n.r)].map((r, i) =>
    `<details${i === 0 ? " open" : ""}><summary>${nm(r)}: ${fmtNum(r.Points)} Punkte, ${dt(r.SpielerID).length} Ergebnisse</summary>
     ${ergebnisTabelle(r, dt(r.SpielerID))}</details>`).join("");

  inhalt.innerHTML = `
    <div class="vgl-box"><h2>H2H gegen die Nachbarn</h2>${tabelle}</div>
    ${abschnitt(`Warum ${nm(X)} tiefer steht als im H2H-Vergleich`, tiefPunkte)}
    ${abschnitt(`Die andere Richtung: ${aufzaehlen(zuHoch.map(n => nm(n.r)))}`, hochPunkte)}
    ${abschnitt("Gegenprobe", gegenprobe ? [gegenprobe] : [])}
    ${abschnitt("Bezug zur Variante", variante ? [variante] : [])}
    ${!nRot ? `<div class="vgl-box"><p>Kein Unterschied: die Rangliste passt zu allen entschiedenen Begegnungen.</p></div>` : ""}
    <div class="vgl-box"><h2>Ergebnisse im Wertungszeitraum</h2><p class="vgl-sub">grau = zählt nicht (nicht unter den besten 5)</p>${ergebnisse}</div>`;
}

init().catch(err => {
  document.getElementById("vgl-inhalt").innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
}).finally(() => {
  document.getElementById("loading-indicator").style.display = "none";
});

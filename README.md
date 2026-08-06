# Das "BRAIN" Projekt (Badminton RAnking INsights)

Basierend auf umfangreichen Datenbeständen werden mittels Analytics(*) Zusammenhänge und Erkenntnisse über die DBV Ranglistentabellen U19 veranschaulicht.

Mit einer Eigenentwicklung in Python werden alle DBV Ranglistentabellen seit 1.1.2020, also dem Bestehen des Jugendwettkampfsystems (JWS) in eine SQLite3-Datenbank importiert. Die Datensätze enthalten Spielerinformationen, deren Vereine/Bezirke/BLVs/Gruppen, und sind nach Disziplinen getrennt. Mittels Python Scripts werden daraus Statistiken aus der DB erzeugt und visualisiert.

Geplant sind weitere Auswertungen, z.B. Anzahl aktiver Spieler/BLV im Zeitverlauf. Später auch Import von Turnierergebnissen und Aussagen über die Güte der RL-Tabelle (direkter Vergleich 2 Gegner, Qualität der Setzlisten etc.)

---

(*) Analytics ist die systematische computergestützte Analyse von Daten oder Statistiken und dient der Entdeckung, Interpretation und Kommunikation von aussagekräftigen Mustern in Daten. (https://en.wikipedia.org/wiki/Analytics , Abruf: 5 Dez. 2023).

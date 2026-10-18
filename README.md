# SignalDesk – Helles Forex-Dashboard

Next.js-App für EURUSD, GBPUSD, USDJPY und AUDUSD mit 1H-Candlestick-Chart, neun Indikator-/Price-Action-Prüfungen und möglichen Entry-, SL-, TP1-, TP2- und TP3-Niveaus.

## Installation auf GitHub / Vercel

1. Lade den **Inhalt** dieses Projektordners mit beibehaltener Ordnerstruktur in dein bestehendes GitHub-Repository. Die Ordner `app/`, `app/api/candles/`, `lib/` und `public/` müssen erhalten bleiben.
2. Vercel erkennt die Next.js-App und baut bei GitHub-Änderungen normalerweise automatisch neu.
3. In Vercel → Project Settings → Environment Variables: `TWELVEDATA_API_KEY` mit deinem eigenen Key setzen. Schlüssel niemals in GitHub veröffentlichen.
4. Bei Bedarf in Vercel → Deployments → Redeploy auslösen.

## API-Credits

- Automatischer Browserabruf: einmal pro Stunde für den ausgewählten Markt.
- Der Button **Jetzt aktualisieren** ruft die eigene Next.js-API-Route erneut auf. Der Twelve-Data-Abruf wird **serverseitig für 3600 Sekunden zwischengespeichert**; wiederholte Klicks lösen normalerweise keine zusätzliche Anbieterabfrage aus.
- Andere Symbole verursachen eigene Abrufe. Bei mehreren Vercel-Instanzen, Cache-Evictions oder anderen API-Nutzern ist das Kontingent nicht garantiert.
- Wenn das Tageslimit erreicht ist, kann der Browser zuvor gespeicherte Daten zeigen, mit Fehlerhinweis.
- Das 1H-Signal nutzt nur abgeschlossene Stundenkerzen; es ist keine automatische Orderausführung.

## Lokal starten

```bash
npm install
cp .env.example .env.local
# .env.local: TWELVEDATA_API_KEY=dein_key
npm run dev
```

Öffne http://localhost:3000. Strategien sind nicht validiert oder backgetestet; keine Anlageberatung.

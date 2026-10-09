<div align="center">

# 👑 Reign

**Besiedeln, handeln und bauen auf einer handgemachten Voxel-Insel, direkt im Browser.**

[English](README.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · **Deutsch**

[![Demo spielen](https://img.shields.io/badge/spielen-Demo%20gegen%20Bots-f5b301?style=for-the-badge)](https://reign-khaki.vercel.app)

![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00?logo=svelte&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r180-000000?logo=threedotjs&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)

<img src="docs/screenshots/home.jpg" alt="Hauptmenü von Reign mit der Voxel-Insel auf dem Tisch" width="100%">

</div>

Reign ist eine Mehrspieler-Umsetzung des klassischen Brettspiels ums Besiedeln, Handeln und Bauen,
gebaut aus Mikro-Voxeln und spielbar im Browser. Jedes Feld, jede Figur, jeder Würfel, jeder
Kartenstapel und die gemütliche Stube um den Tisch bestehen aus winzigen Voxeln und werden zur
Laufzeit erzeugt. Spiele das vollständige klassische Spiel mit Freunden oder Bots, oder wechsle zu
**Reign Extended**: Charaktere mit Kräften, ein Ereignisstapel, neue Gebäude und Inseln in jeder
Form und Größe.

> **Gleich ausprobieren:** Auf [reign-khaki.vercel.app](https://reign-khaki.vercel.app) läuft die
> Version nur mit Bots im Browser. Kein Konto, keine Installation.

> Das Spiel gibt es auf Deutsch, Englisch, Russisch und Chinesisch. Die Sprache wechselst du in
> den Einstellungen oder direkt beim Anmelden.

## Inhalt

- [Höhepunkte](#höhepunkte)
- [Screenshots](#screenshots)
- [Spielmodi](#spielmodi)
- [Gemeinsam spielen](#gemeinsam-spielen)
- [Schnellstart](#schnellstart)
- [Reign betreiben](#reign-betreiben)
- [Konfiguration](#konfiguration)
- [Steuerung](#steuerung)
- [Entwickler-Cheats](#entwickler-cheats)
- [Aufbau](#aufbau)
- [Inhalte hinzufügen](#inhalte-hinzufügen)
- [Tests](#tests)

## Höhepunkte

- 🎲 **Das komplette Grundspiel.** Zufällige Insel aus 19 Feldern mit Häfen, Aufbau im
  Schlangenverfahren, Würfelerträge, der Räuber, Entwicklungskarten, Längste Handelsstraße und
  Größte Rittermacht, Handel mit Bank, Häfen und Mitspielern, Sieg bei 10 Punkten.
- 🧱 **Eine lebendige Voxel-Welt.** Wogende Felder, grasende Schafe, Gischt in den Untiefen, echt
  rollende Würfel, Karten, die von den Feldern in deine Hand fliegen, und eine warme Taverne um
  den Tisch.
- 🏰 **Reign Extended.** 16 Charaktere mit Eigenschaften und Kräften, eine Charakterwahl,
  13 Ereigniskarten, Werkstätten, Steinstraßen und Lagerhäuser sowie Inseln von 12 bis 240 Feldern
  für bis zu 8 Spieler.
- 🧑‍🤝‍🧑 **Für Freunde gemacht.** Konten mit Voxel-Avataren, Freunde und Online-Status,
  Einladungen, Spielverlauf, Zuschauer, geheime Taubenpost und Wiedereinstieg in verlassene Partien.
- 🤖 **Bots, die jede Regel beherrschen.** Sie füllen jeden freien Platz, handeln, bauen, setzen
  Charakterkräfte ein und reagieren auf Ereignisse.
- 🛡️ **Der Server hat das Sagen.** Der Server führt die Regeln aus und schickt jedem Spieler nur,
  was er sehen darf. Fremde Hände, der Stapel und der Würfel-Seed bleiben geheim.
- 🌍 **Vier Sprachen.** Englisch, Russisch, vereinfachtes Chinesisch und Deutsch, passend zum
  Browser und in den Einstellungen oder beim Anmelden umschaltbar.
- 📚 **Eingebautes Tutorial.** Ein vollständig bebildertes Regelbuch für beide Modi, im
  Hauptmenü und im Spielmenü.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/table.jpg" alt="Eine laufende Partie mit der Oberfläche"><br><sub><b>Am Tisch.</b> Deine Felder und Erträge, die Chronik, Tafeln für jeden Spieler und das Baumenü.</sub></td>
    <td width="50%"><img src="docs/screenshots/closeup.jpg" alt="Nahaufnahme der Voxel-Insel"><br><sub><b>Ganz nah.</b> Jedes Feld ist ein kleines Diorama, hier mit Lagerhaus, Räuber und Schafen.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/lobby.jpg" alt="Die Lobby von Reign Extended"><br><sub><b>Die Lobby.</b> Der Gastgeber wählt Modus, Insel, Charaktere, Gebäude, Ereignisse, Siegpunkte und Zugzeit.</sub></td>
    <td><img src="docs/screenshots/draft.jpg" alt="Die Charakterwahl"><br><sub><b>Charakterwahl.</b> Sechzehn Charaktere mit je einer Eigenschaft und einer Kraft; wer zuerst siedelt, wählt zuletzt.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/events.jpg" alt="Eine Ereigniskarte wird aufgedeckt"><br><sub><b>Ereignisstapel.</b> Jede Runde eine neue Karte: Feste, Stürme, Kometen und Banditen.</sub></td>
    <td><img src="docs/screenshots/islands.jpg" alt="Auswahl der Insel"><br><sub><b>Inseln.</b> Vorlagen, ein Karteneditor und ein Generator für zufällige Inseln.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/eight-players.jpg" alt="Eine Partie zu acht auf einer großen Insel"><br><sub><b>Große Tische.</b> Große Inseln bieten Platz für bis zu acht Spieler, mit passend größerer Bank und größerem Stapel.</sub></td>
  </tr>
</table>

## Spielmodi

Der Gastgeber wählt den Modus in der Lobby, und jede Option unten ist ein Schalter, den er selbst
bedient.

### Classic

Das Standardspiel, genau wie immer: die zufällige Insel aus 19 Feldern, Standardregeln, 2 bis 4
Spieler und 10 Punkte zum Sieg.

### Reign Extended

Alles aus Classic, und dazu:

| Funktion | Was sie bringt |
| --- | --- |
| **Charaktere** | 16 Charaktere, jeder mit einer Eigenschaft, die eine Regel verbiegt, etwa 3:1-Handel mit der Bank, billigere Städte oder zwei Karten stehlen. Der Gastgeber kann sie wählen lassen, einzelne weglassen, Doppelte erlauben oder sie abschalten. |
| **Kräfte** | Jeder Charakter hat außerdem eine Kraft, etwa so viel wert wie eine Entwicklungskarte: Markttag, Voraussicht, Fluch, Segen, Schabernack und mehr. Einmal pro Partie oder alle 4 bzw. 6 Runden neu aufgeladen. |
| **Ereignisstapel** | 13 Ereigniskarten, jede oder jede zweite Runde wird eine aufgedeckt: Erntefest, Komet, Erdbeben, Königlicher Erlass, Rattenplage, Banditenaufstand und weitere. Der Gastgeber kann jede Karte herausnehmen. |
| **Gebäude** | **Werkstätten** (+1 Karte, wenn ihr Feld dir Ertrag bringt), **Steinstraßen** (zählen doppelt für die Längste Handelsstraße) und **Lagerhäuser** (3 Karten sicher vor Räuber und Ereignissen). |
| **Inseln** | Sechs vorgefertigte Formen von der klassischen Insel bis zum Reich aus 37 Feldern, ein Editor für eigene Inseln und ein Zufallsgenerator (12 bis 240 Felder; rund, lang, zerklüftet oder verbundene Inseln, mit Seen). |
| **Große Tische** | Eine Insel bietet einem Spieler pro fünf Feldern Platz, von 4 bis 8, in acht Farben. Bank und Stapel wachsen mit dem Tisch. |
| **Hausregeln** | Siegpunkte von 3 bis 30 (begrenzt durch Insel und Tischgröße), Handkartenlimit bei einer 7 von 3 bis 20 und eine Zugzeit von 30 Sekunden bis 3 Minuten. |

## Gemeinsam spielen

- **Konten.** Anmelden mit Benutzername, Spitzname, Passwort und einem von zwölf Voxel-Avataren,
  alles später änderbar.
- **Freunde.** Freunde per Benutzername hinzufügen, sehen, wer online, am Tisch oder in einer
  Partie ist, und sie in die eigene Lobby einladen.
- **Spielverlauf.** Jede Partie wird mit Charakteren und Ergebnissen gespeichert, für dich und
  deine Freunde.
- **Einladungslinks.** Raum erstellen und den Link oder den Raumcode teilen.
- **Zuschauer.** Mit dem Code einer laufenden Partie kann man zusehen, ohne die Karten anderer zu
  sehen.
- **Taubenpost.** Schicke einem Mitspieler private Nachrichten per Brieftaube. Nur ihr beide könnt
  sie lesen.
- **Verlassen und zurückkehren.** Ein Bot übernimmt den Platz, bis der Spieler zurückkommt. Eine
  Partie wird erst abgebrochen, wenn alle gegangen sind.
- **Pause.** Gegen Bots hält das geöffnete Menü den Tisch an.

## Schnellstart

Du brauchst **Node 20+** und **pnpm** (`corepack enable` liefert die passende Version).

```bash
pnpm install
pnpm dev          # Spielserver auf :8787 + Vite auf :5173
```

Öffne <http://localhost:5173>, lege ein Konto an und klicke auf **Gegen Bots spielen** oder
**Raum erstellen** und teile den Einladungslink. Um mit anderen im lokalen Netz zu spielen, öffne
das Spiel über die LAN-Adresse deines Rechners (zum Beispiel `http://192.168.1.20:5173`), damit der
Link dorthin zeigt.

Eine Datenbank musst du nicht einrichten: Ohne `DATABASE_URL` startet der Server
[PGlite](https://pglite.dev) (nach WebAssembly kompiliertes Postgres) im eigenen Prozess und legt
die Daten in `./data/db` ab. Lösche den Ordner, um von vorn zu beginnen.

## Reign betreiben

### Produktions-Build

```bash
pnpm build
pnpm start        # ein Prozess liefert Seite, /api und WebSocket auf http://localhost:8787
```

### Docker

```bash
docker compose up -d --build        # Spiel + Postgres auf http://localhost:8787
docker compose down                 # anhalten
```

Das Image baut den Client und startet den Produktionsserver in einem kleinen Container ohne
Root-Rechte, mit Health-Check auf `/health`. Compose startet außerdem Postgres 17 mit den Daten im
Volume `db`.

Ohne Compose:

```bash
docker build -t reign .
docker run -p 8787:8787 -e DATABASE_URL=postgres://user:pass@host:5432/reign reign
```

Ohne `DATABASE_URL` speichert der Container seine Daten mit PGlite in sich selbst (sie gehen
verloren, wenn der Container entfernt wird).

Zum Entwickeln ohne lokales Node startet `docker compose --profile dev up --build` den Befehl
`pnpm dev` aus deiner Arbeitskopie, mit Hot Reload auf <http://localhost:5173>.

### Eigener Server mit HTTPS

1. Kopiere `.env.example` nach `.env`.
2. Setze ein echtes `POSTGRES_PASSWORD` (Buchstaben und Ziffern, z. B. `openssl rand -hex 24`).
3. Setze `DOMAIN` und lass den DNS-A-Eintrag auf den Server zeigen.
4. Setze `BIND=127.0.0.1`, damit Port 8787 nur lokal antwortet und Spieler über HTTPS kommen.

```bash
docker compose --profile https up -d --build   # Spiel + Postgres + Caddy auf den Ports 80 und 443
```

Caddy holt und erneuert ein Let's-Encrypt-Zertifikat und reicht Seite, `/api` und WebSocket an
das Spiel weiter. Ohne Domain lässt du das Profil aus und spielst auf `http://<server-ip>:8787`.

### Offline-Build (nur Bots)

```bash
pnpm build:offline      # statische Seite in dist/offline
pnpm dev:offline        # dasselbe mit Hot Reload auf http://localhost:5173
```

Der Offline-Build braucht weder Server noch Konten: Regeln und Bots laufen in der Seite selbst,
mit demselben `Room` wie auf dem Server hinter einem Ersatz-WebSocket. Du spielst einen lokalen
Platz gegen Bots in beiden Modi; Spitzname, Avatar und gespeicherte Karten bleiben im Browser.
`vercel.json` baut genau diese Version, daher lässt sich das Repository unverändert auf Vercel oder
jedem statischen Hoster veröffentlichen.

### Render

`render.yaml` stellt das Spiel als Node-Webdienst mit einer kostenlosen Render-Postgres-Datenbank
bereit. Dasselbe Docker-Image läuft auch auf jedem Host mit WebSocket-Unterstützung, etwa Fly.io,
Railway oder einem VPS.

## Konfiguration

| Variable | Standard | Verwendet von | Bedeutung |
| --- | --- | --- | --- |
| `PORT` | `8787` | Server, Compose | Port, auf dem das Spiel lauscht. |
| `DATABASE_URL` | *(leer)* | Server | `postgres://`-URL. Leer heißt eingebautes PGlite in `./data/db`. |
| `NODE_ENV` | | Server | Mit `production` sind Entwickler-Cheats nie aktiv. |
| `POSTGRES_PASSWORD` | `change-me` | Compose | Passwort des mitgelieferten Postgres, vor dem ersten Start setzen. |
| `BIND` | `0.0.0.0` | Compose | Adresse, auf der der Spielport veröffentlicht wird. |
| `DOMAIN` | `localhost` | Compose (`https`) | Domain, für die Caddy ein Zertifikat holt. |

## Steuerung

| Eingabe | Aktion |
| --- | --- |
| Ziehen | Tisch drehen |
| Rechts ziehen oder zwei Finger | Verschieben |
| Mausrad oder Zwei-Finger-Zoom | Zoomen |
| Darüberfahren, dann klicken | Figur an leuchtenden Steinen und Ringen ansehen, dann setzen |
| `Esc` | Baumodus abbrechen, Handelsfenster schließen oder Spielmenü öffnen |
| `` ` `` | Cheat-Panel öffnen (nur Dev-Server) |

Beim Aufbau und beim Versetzen des Räubers hebt das Spielbrett alle gültigen Plätze hervor.

## Entwickler-Cheats

`pnpm dev` startet den Server mit `--dev`, und jede Partie bekommt ein Cheat-Panel: Drücke `` ` ``
oder klicke auf den Hammer unter dem Menüknopf. Damit gibst du jedem Spieler Karten oder eine
sofort spielbare Entwicklungskarte, legst den nächsten Wurf fest, deckst ein gewähltes Ereignis
auf, beendest den Aufbau, machst Bots schneller oder gewinnst auf der Stelle. Jede Nutzung
hinterlässt eine Zeile `[cheat]` in der Chronik. `pnpm start`, Docker und alles mit
`NODE_ENV=production` schalten es nie ein, und der Server lehnt Cheat-Nachrichten dort ab.

## Aufbau

```
src/shared/   Regel-Engine, Spielbrett-Geometrie, Bots und Netzwerkprotokoll (ohne DOM und Three.js)
  board/        Hex-Mathematik, Topologie, Kartenvorlagen, zufällige Inseln
  rules/        Konfiguration, Engine, Abfragen, Ansichtsfilter, Bots, Charaktere, Ereignisse, Gebäude
src/server/   Node-HTTP- und WebSocket-Server: Räume, Lobby, Plätze, Wiederverbinden, Bots,
              statische Dateien, Konten und Datenbank (db.ts, accounts.ts, api.ts), Präsenz und
              Einladungen (hub.ts)
src/client/   Oberfläche mit Vite + Svelte 5 über einer Three.js-Szene
  scene/        Voxel-Engine (Mesher mit gebackenem AO, Voxel-Shader mit Fasen), Inselgelände,
                Figuren, Raum, Licht, Kamera, Würfel, Partikel, Nachbearbeitung, Porträts
  ui/           Hauptmenü, Lobby, HUD, Handel, Dialoge, Tutorial, Konten, Taubenpost
  offline/      Server in der Seite für den Build nur mit Bots
tests/        Engine, Räume, Konten, Extended-Inhalte und komplette simulierte Bot-Partien
scripts/      Screenshot-, End-to-End- und Entwicklungs-Helfer
```

- **Der Server hat das letzte Wort.** Clients schicken Aktionen; der Server prüft sie mit der
  gemeinsamen Engine und sendet jedem Spieler eine gefilterte Ansicht. Fremde Hände werden zu
  Zahlen, Stapel und Würfel-Seed werden nie verschickt.
- **Die Engine ist rein.** `applyAction(state, player, action)` liefert einen neuen Zustand und
  Ereignisse. Die Ereignisse steuern Animationen, Klänge und die Chronik.
- **Karten sind Daten.** Ein `Board` besteht aus Hexfeldern (Gelände und Zahl) und Häfen; die
  Topologie wird daraus abgeleitet, also funktioniert jede Form.
- **Inhalte sind Daten.** Rohstoffe, Gelände, Kosten und der Entwicklungsstapel stehen in
  `src/shared/rules/config.ts`; Charaktere, Ereignisse und Gebäude haben eigene Dateien.
- **Classic bleibt Classic.** Alles Neue greift nur bei `state.mode === 'extended'`, und ein Test
  stellt sicher, dass Classic-Partien unverändert bleiben.

## Inhalte hinzufügen

- **Charaktere:** `rules/characters.ts`. Eigenschaften greifen über `costOf`, `tradeRatios`,
  `discardLimit` und `longestRoadMin` in `rules/queries.ts`; Kräfte laufen über die Aktion
  `usePower`, und Bots bekommen eine Regel in `bot.ts`. Porträts sind Voxel-Büsten in
  `scene/portraits.ts`.
- **Ereignisse:** Karten und ihre Wirkung stehen in `rules/events.ts`.
- **Gebäude:** `rules/buildings.ts` listet die Schalter des Gastgebers; Modelle liegen in
  `scene/board/`.
- **Rohstoffe und Felder:** `config.ts` erweitern, dann Gelände in `scene/board/terrain.ts` und
  Modelle in `scene/board/models.ts` ergänzen.
- **Karten:** Vorlagen sind als Text in `board/maps.ts` gezeichnet; `generateBoard(tiles, rng)`
  verteilt Felder auf jede Form.
- **Texte und Sprachen:** Jeder Text für Spieler läuft über `t('English text')` aus
  `src/client/i18n`; der englische Text ist der Schlüssel. Jede Sprache ist eine Datei in
  `src/client/i18n/locales`, Fehlendes erscheint auf Englisch. `pnpm i18n` zeigt, was fehlt.
  Eine neue Sprache ist eine neue Datei plus eine Zeile in `languages.ts`.
- **Tutorial:** Jede Extended-Funktion bekommt eine Seite in `ui/tutorial/` und eine Zeile in
  `chapters.ts`.

## Tests

```bash
pnpm test         # Regel-Engine, Räume, Konten und komplette simulierte Bot-Partien
pnpm check        # Svelte- und TypeScript-Prüfungen
node scripts/e2e.mjs http://localhost:8787 test-results/e2e 300   # Browser-Smoke-Test gegen einen laufenden Server
```

Mit `TEST_DATABASE_URL` laufen die Konto-Tests zusätzlich gegen ein echtes Postgres.

<div align="center">
<sub>Gemacht aus Voxeln, Würfeln und sehr vielen Schafen. 🐑</sub>
</div>

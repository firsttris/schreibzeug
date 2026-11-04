# Installation { #installation }

Schreibzeug ist ein Server (Bun, `apps/server`), der die Web-App, die Datei-API, das
Relay für die Zusammenarbeit und den MCP-Endpunkt über einen Port ausliefert. Alles, was er
speichert, liegt in einem Datenordner: die SQLite-Datenbank `schreibzeug.db`, die Dateiinhalte
unter `blobs/` und `auth-secret`.

## Mit Docker Compose { #with-docker-compose }

Der Ordner `deploy/` im Repository enthält, was ein Server braucht: `compose.yaml` (der
Schreibzeug-Server und Caddy, der das HTTPS-Zertifikat von Let's Encrypt holt), `.env.example` und
das `Caddyfile`. Die Programme kommen von Docker Hub; auf dem Server wird nichts gebaut. Auf einem
Server mit Docker (oder Podman), einem DNS-Eintrag für die Adresse und offenen Ports 80 und 443:

```bash
# Die Konfiguration (compose.yaml, .env.example, Caddyfile); die Programme kommen von Docker Hub
git clone https://github.com/firsttris/schreibzeug /opt/schreibzeug && cd /opt/schreibzeug
cp deploy/.env.example deploy/.env
nano deploy/.env                                          # Domain, Mail für Let's Encrypt, Version
docker compose -f deploy/compose.yaml up -d schreibzeug   # nur Schreibzeug, auf 127.0.0.1:3000
```

Leg das erste Konto an, bevor der Server von außen erreichbar ist: Auf einem geschlossenen Server
kann nur das erste Konto frei angelegt werden, und zwar von dem, der zuerst kommt. Es ist ein Konto
wie jedes andere: Es übernimmt die Dateien aus der Zeit vor den Konten, falls es welche gibt, und
hat keine Rechte über die anderen; einen Administrator gibt es nicht
([Konten für Administratoren](accounts.md#for-administrators)). Danach kommen neue Konten über
Links: Jeder Link, den jemand zum Teilen einer Datei oder eines Ordners erstellt, öffnet für die
Person, die ihm folgt, die Registrierung. Mit `SCHREIBZEUG_OPEN_SIGNUP=true` darf sich jeder
registrieren, der den Server erreicht ([Konten](accounts.md#sign-up)). Liegt der Port auf
127.0.0.1, öffne ihn über einen SSH-Tunnel (`ssh -L 3000:127.0.0.1:3000 <server>`, dann
`http://localhost:3000`), leg das Konto an und starte dann auch Caddy:

```bash
docker compose -f deploy/compose.yaml up -d               # auch Caddy: https://<domain>
```

Caddy ist der einzige Proxy, dem der Server vertraut (`SCHREIBZEUG_TRUSTED_PROXIES`, seine feste
Adresse in `compose.yaml`), damit Anmeldeversuche pro Client gezählt werden
([unten](#behind-a-reverse-proxy)). Port 3000 bleibt für den Tunnel auf 127.0.0.1.

Mit [Kontext](kontext.md) ist nichts davon nötig: Kontexts `deploy/compose.yaml` bringt
Schreibzeug als seine „Dokumente“ mit, angemeldet über Kontext.

### Das Image { #the-image }

Das Image `tristanteu/schreibzeug` (Docker Hub, auch `ghcr.io/firsttris/schreibzeug`) wird mit
jedem Release für amd64 veröffentlicht (`.github/workflows/release.yml`, aus `docker/Dockerfile`).
Jedes Release erscheint unter drei Tags (`firsttris/workflows` `docker-release.yml`): seiner
Version (`:0.1.7`), seiner Minor-Version (`:0.1`, die mit dem neuesten Patch-Release mitwandert)
und `:latest`; eine Vorabversion wie `0.2.0-rc.1` bekommt stattdessen ihre Version und `:next`.
Leg eine Version fest, wie es `SCHREIBZEUG_VERSION` in `deploy/.env` tut, statt `:latest` zu
nehmen: Ein Update passiert dann, wenn du es willst, nach einem Blick ins
[Changelog](https://github.com/firsttris/schreibzeug/blob/main/CHANGELOG.md) und einem Backup
([Updates](#updates)).

Der Server im Image läuft als unprivilegierter Benutzer `bun` (uid 1000) und schreibt nur nach
`/data`. Betreib einen Server pro Datenordner: Die Sitzungen der Zusammenarbeit und die Aufträge
für offene Dokumente liegen im Speicher des Servers ([Zusammenarbeit](collaboration.md#saving)),
eine zweite Instanz auf denselben Daten sähe also die Bearbeiter der ersten nicht.

So baust du das Image selbst aus dem Repository:

```bash
git clone https://github.com/firsttris/schreibzeug && cd schreibzeug
docker build -f docker/Dockerfile -t tristanteu/schreibzeug .
```

Der Build lädt das festgelegte Euro-Office-Release herunter und erzeugt dessen Schriften mit einem
Werkzeug für Linux x86_64, er braucht also eine amd64-Maschine (oder Emulation). Mit Podman geht es
genauso.

### Ohne Compose { #without-compose }

Ein Container, hinter einem eigenen Reverse Proxy ([unten](#behind-a-reverse-proxy)):

```bash
docker run -d --name schreibzeug --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data \
  -e SCHREIBZEUG_URL=https://office.example.org \
  -e SCHREIBZEUG_TRUSTED_PROXIES=172.16.0.0/12 \
  tristanteu/schreibzeug:0.1
```

Der Port wird nur auf 127.0.0.1 veröffentlicht, für den Proxy auf derselben Maschine, der HTTPS
ergänzt. Docker schreibt für einen veröffentlichten Port eigene Firewall-Regeln, noch vor ufw oder
firewalld; `-p 3000:3000` würde also einfaches HTTP ins Internet stellen, egal was die Firewall
sagt. Setz `SCHREIBZEUG_URL` auf die Adresse, die die Leute öffnen: Hinter HTTPS lehnt der Server
ohne sie Anmeldungen und Änderungen ab, und die Anmeldung über einen OpenID-Connect-Anbieter
braucht sie. `SCHREIBZEUG_TRUSTED_PROXIES` nennt den Proxy so, wie ihn der Server im Container
sieht: das Docker-Netz ([unten](#behind-a-reverse-proxy)). Auch hier kommt zuerst das erste Konto,
über den Tunnel, wie oben.

Nur zum Ausprobieren auf dem eigenen Rechner: `docker run -d -p 127.0.0.1:3000:3000 -v
schreibzeug-data:/data tristanteu/schreibzeug`, dann http://localhost:3000.

## Einstellungen { #settings }

Alle Einstellungen sind Umgebungsvariablen (`apps/server/src/config.ts`); das Image setzt
`PORT=3000`, `SCHREIBZEUG_DATA_DIR=/data` und `SCHREIBZEUG_WEB_DIR=/app/web`.

| Variable | Standard | |
|---|---|---|
| `SCHREIBZEUG_DATA_DIR` | `data` | Der Datenordner: Datenbank, Dateiinhalte, Secret |
| `PORT` | `3000` | Der Port, auf dem der Server lauscht |
| `SCHREIBZEUG_URL` | – | Die Adresse, die die Leute öffnen, z. B. `https://office.example.org`: die Basis der Anmeldung über Kontext (mit `OIDC_*` Pflicht), die Audience der Tokens von Kontext, die Links, die die MCP-Werkzeuge ausgeben, und der Origin, von dem die Änderungen des Browsers kommen müssen. Setz sie hinter einem HTTPS-Proxy: Der Server selbst sieht `http://`, ohne sie wird der `https://`-Origin des Browsers also abgelehnt |
| `SCHREIBZEUG_MAX_UPLOAD_MB` | `512` | Die größte Datei, die hochgeladen oder gespeichert werden kann |
| `SCHREIBZEUG_AUTH_SECRET` | erzeugt | Signiert die Sitzungs-Cookies (mindestens 32 Zeichen); ohne die Variable wird eins erzeugt und im Datenordner abgelegt |
| `SCHREIBZEUG_OPEN_SIGNUP` | `false` | `true`: Jeder, der den Server erreicht, darf ein Konto anlegen |
| `SCHREIBZEUG_TRUSTED_ORIGINS` | – | Weitere Origins, deren Seiten sich anmelden und mit einer Sitzung Änderungen vornehmen dürfen, durch Kommas getrennt. Selten nötig: Der Origin, an den eine Anfrage geht, und `SCHREIBZEUG_URL` gelten ohnehin als vertrauenswürdig, und die Desktop-App zeigt die eigenen Seiten des Servers |
| `SCHREIBZEUG_TRUSTED_PROXIES` | – | Die Reverse Proxys vor dem Server, so wie der Server sie sieht: IP-Adressen oder CIDR-Bereiche, durch Kommas getrennt ([unten](#behind-a-reverse-proxy)) |
| `SCHREIBZEUG_WEB_DIR` | – | Die gebaute Web-App, die neben der API ausgeliefert wird (im Image gesetzt) |
| `SCHREIBZEUG_EMBED_ORIGIN` | – | Die eine Website, die Schreibzeug in einem Frame zeigen darf ([Kontext](kontext.md)) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | – | Anmeldung über einen OpenID-Connect-Anbieter, alle drei zusammen ([Kontext](kontext.md)) |
| `OIDC_NAME` | `Kontext` | Der Name auf dem Anmeldeknopf |
| `SCHREIBZEUG_VERSIONS` | `thin` | `thin`: Ältere Versionen werden mit dem Alter ausgedünnt, behaltene bleiben ([Versionen](files.md#versions)); `all`: Jede Speicherung bleibt als Version erhalten |

## Hinter einem Reverse Proxy { #behind-a-reverse-proxy }

Mit Compose bringt `deploy/` dafür ein fertig eingerichtetes Caddy mit (`deploy/Caddyfile`); dieser
Abschnitt ist für einen eigenen Proxy. Stell Schreibzeug hinter einen Proxy, der HTTPS terminiert
und WebSockets durchreicht: Das Bearbeiten läuft über `/api/collab/<file>`, Aufträge für ein
offenes Dokument über `/api/agent/<file>`. Mit Caddy:

```
office.example.org {
	reverse_proxy localhost:3000
}
```

Mit nginx: `Upgrade` und `Connection` weiterreichen, die Adresse, von der die Anfrage kam, an
`X-Forwarded-For` anhängen und Bodys so groß zulassen, wie Uploads sein dürfen:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 512m;
}
```

Nenn den Proxy in `SCHREIBZEUG_TRUSTED_PROXIES`, so wie der Server ihn sieht: `127.0.0.1`, wenn er
auf derselben Maschine läuft, das Docker-Netz (z. B. `172.16.0.0/12`), wenn der Server in einem
Container läuft und der Proxy ihn über einen veröffentlichten Port erreicht. Anmeldung und
Registrierung erlauben pro Client ein paar Versuche in zehn Sekunden (das Rate-Limit von Better
Auth). Der Server zählt einen Client nach der Adresse der Verbindung und ignoriert, was ein Client
selbst in `X-Forwarded-For` schreibt; nur hinter einem hier genannten Proxy nimmt er die
weitergereichte Kette und zählt nach der ersten Adresse darin, von rechts gesehen, die keiner der
Proxys ist (`apps/server/src/auth/client-ip.ts`). Fehlt die Einstellung hinter einem Proxy, zählt
jeder Client als der Proxy, und alle teilen sich diese paar Versuche. Steht ein Proxy davor,
veröffentliche den Port nur für ihn (`-p 127.0.0.1:3000:3000`), damit niemand den Server an ihm
vorbei erreicht.

Der Server komprimiert die App und die Bearbeitungs-Engine selbst (Brotli oder gzip) und sagt den
Browsern, die Engine dauerhaft zu behalten
([schnelles Öffnen](engine.md#opening-fast-on-a-phone-too)); der Proxy braucht keine eigene
Kompression und muss `Cache-Control`, `ETag` und `Content-Encoding` weiterreichen, wie Caddy und
nginx es mit den Einstellungen oben tun.

`client_max_body_size` passt zu `SCHREIBZEUG_MAX_UPLOAD_MB` (standardmäßig 512); sind die Dateien
kleiner, senk beide, z. B. auf `100m` und `100`, damit der Proxy zu große Bodys abweist, bevor sie
den Server erreichen.

## Backups { #backups }

Sichere den Datenordner; er enthält alles. Die Datenbank läuft im WAL-Modus, kopier sie also bei
gestopptem Server: Einer Kopie, die während des Schreibens entsteht, kann fehlen, was noch in
`schreibzeug.db-wal` steht. Das Image hat kein `sqlite3`; archivier das Volume stattdessen mit
einem Wegwerf-Container, hier in den aktuellen Ordner. Mit Compose heißt das Volume
`schreibzeug_schreibzeug-data` (der Name des Projekts zuerst):

```bash
cd /opt/schreibzeug
docker compose -f deploy/compose.yaml stop schreibzeug
docker run --rm -v schreibzeug_schreibzeug-data:/data:ro -v "$PWD":/backup alpine \
  tar -czf /backup/schreibzeug-$(date +%F).tar.gz -C /data .
docker compose -f deploy/compose.yaml start schreibzeug
```

Ohne Compose dasselbe mit `docker stop schreibzeug`, dem Volume `schreibzeug-data` und
`docker start schreibzeug`. Ein vom Host eingebundener Ordner (`-v /srv/schreibzeug:/data`)
genauso, bei gestopptem Container: `sudo tar -czf schreibzeug-$(date +%F).tar.gz -C /srv/schreibzeug .`

Bewahr `auth-secret` (oder `SCHREIBZEUG_AUTH_SECRET`) mit dem Backup auf: Es signiert die
Sitzungs-Cookies, und ohne es muss sich jeder neu anmelden.

### Wiederherstellen { #restore }

Mit Compose ist das Volume das in `compose.yaml` genannte, das Archiv kommt also dort hinein:
Sichere zuerst, was jetzt darin liegt (oben), leere es dann und pack aus, bei gestopptem Server.
Das `chown` gibt alles, den obersten Ordner des Volumes eingeschlossen, an uid 1000, als die der
Server läuft:

```bash
cd /opt/schreibzeug
docker compose -f deploy/compose.yaml stop schreibzeug
docker run --rm -v schreibzeug_schreibzeug-data:/data -v "$PWD":/backup alpine \
  sh -c 'find /data -mindepth 1 -delete && tar -xzf /backup/schreibzeug-2026-10-27.tar.gz -C /data && chown -R 1000:1000 /data'
docker compose -f deploy/compose.yaml start schreibzeug
```

Ohne Compose pack das Archiv in ein neues, leeres Volume aus und start den Container darauf; das
alte Volume bleibt, bis du es entfernst. Das `chown` gibt alles, den obersten Ordner des Volumes
eingeschlossen, an uid 1000, als die der Server läuft:

```bash
docker rm -f schreibzeug
docker volume create schreibzeug-restored
docker run --rm -v schreibzeug-restored:/data -v "$PWD":/backup alpine \
  sh -c 'tar -xzf /backup/schreibzeug-2026-10-27.tar.gz -C /data && chown -R 1000:1000 /data'
```

Dann start ihn wie unter [Ohne Compose](#without-compose), mit `-v schreibzeug-restored:/data`.
In beiden Fällen: Nimm dieselbe Image-Version, mit der das Backup gemacht wurde, oder eine neuere
(das Schema wird beim Start nach vorn gebracht, nie zurück).

## Updates { #updates }

Was sich geändert hat und welche Updates einen eigenen Schritt brauchen, steht im
[Changelog](https://github.com/firsttris/schreibzeug/blob/main/CHANGELOG.md). Mach zuerst ein
[Backup](#backups): Das Datenbankschema wird beim Start auf den neuesten Stand gebracht
(`apps/server/drizzle`) und nie zurück, das Backup ist also der Weg zurück zur älteren Version.

Mit Compose holt `git pull`, was sich in `deploy/` geändert hat, und die Version in `.env` wählt
das Image:

```bash
cd /opt/schreibzeug && git pull
nano deploy/.env    # SCHREIBZEUG_VERSION auf die neue Version, z. B. 0.1.9; neue Zeilen aus .env.example
docker compose -f deploy/compose.yaml pull && docker compose -f deploy/compose.yaml up -d
```

`deploy/.env` ist deine eigene Kopie und ändert sich mit `git pull` nicht; `git diff ORIG_HEAD --
deploy/` zeigt, was sich dort geändert hat. Caddy hat in `compose.yaml` eine feste Version; eine
neue kommt mit `git pull`.

Ohne Compose holst du die neue Version und startest den Container neu, mit denselben
Einstellungen:

```bash
docker pull tristanteu/schreibzeug:0.1
docker rm -f schreibzeug
docker run -d --name schreibzeug --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data \
  -e SCHREIBZEUG_URL=https://office.example.org \
  -e SCHREIBZEUG_TRUSTED_PROXIES=172.16.0.0/12 \
  tristanteu/schreibzeug:0.1
```

Für den Wechsel auf eine andere Minor-Version änderst du das Tag an beiden Stellen (z. B. auf
`:0.2`).

Images bis 0.1.3 ließen den Server als root laufen; seit 0.1.4 läuft er als `bun` (uid 1000). Ein
Daten-Volume aus einem älteren Image gehört root, und der Server kann nicht hineinschreiben. Gib es
einmal an uid 1000, bei gestopptem Container:

```bash
docker stop schreibzeug
docker run --rm --user root -v schreibzeug-data:/data tristanteu/schreibzeug:0.1 chown -R 1000:1000 /data
```

Ein vom Host eingebundener Ordner (`-v /srv/schreibzeug:/data`) genauso:
`sudo chown -R 1000:1000 /srv/schreibzeug`.

## Eigene Änderungen { #your-own-changes }

Die AGPL verlangt, dass Leute, die ein geändertes Schreibzeug über das Netz nutzen, an seinen
Quellcode kommen. Die App verlinkt den Quellcode im Editor unter **Hilfe → Über Schreibzeug**, und
dieser Link steht fest im Code: `SOURCE_URL` in `apps/web/src/editor/help-dialogs.tsx` zeigt auf
dieses Repository. Betreibst du eine Version mit eigenen Änderungen, lass ihn auf deinen Quellcode
zeigen (deinen Fork, in der Version, die du betreibst), bevor du das Image baust.

## Fehlersuche { #troubleshooting }

Was den Server anhalten lässt, schreibt er in sein Log: `docker logs schreibzeug`.

- **Die Anmeldung schlägt fehl, oder Speichern, Hochladen und Teilen antworten mit 403**
  („Invalid origin“, „Diese Anfrage kommt nicht von Schreibzeug.“): Hinter einem HTTPS-Proxy sieht
  der Server `http://`, der `https://`-Origin des Browsers ist also nicht sein eigener. Setz
  `SCHREIBZEUG_URL` auf die Adresse, die die Leute öffnen (`apps/server/src/auth/origin.ts`).
- **Die Dateiliste funktioniert, aber Dokumente öffnen sich nicht** („Der Server ist nicht
  erreichbar.“ im Editor): Der Proxy reicht keine WebSockets durch, die das Bearbeiten braucht
  (`/api/collab/<file>`). Reich `Upgrade` und `Connection` weiter wie im
  [nginx-Beispiel](#behind-a-reverse-proxy).
- **Der Container hält beim Start an oder startet immer wieder neu**, mit „attempt to write a
  readonly database“ oder „unable to open database file“ im Log: Das Daten-Volume gehört root, aus
  einem Image vor 0.1.4, oder der vom Host eingebundene Ordner tut es. Gib es an uid 1000
  ([Updates](#updates)).
- **Der Server startet nicht** mit „Invalid configuration“ und „Signing in through OIDC
  (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET) needs SCHREIBZEUG_URL“: Setz `SCHREIBZEUG_URL`
  (`apps/server/src/config.ts`). Ein ungültiger Wert einer anderen Einstellung hält ihn genauso an
  und nennt die Einstellung.
- **Die Anmeldung schlägt nach ein paar Versuchen für alle fehl** (429, „Too many requests. Please
  try again later.“ – zu viele Anfragen): Der Proxy ist nicht in `SCHREIBZEUG_TRUSTED_PROXIES`
  genannt, also zählt jeder Client als der Proxy ([oben](#behind-a-reverse-proxy)).

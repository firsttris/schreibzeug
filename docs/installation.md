# Installation

Schreibzeug is one server (Bun, `apps/server`) that serves the web app, the files API, the
collaboration relay and the MCP endpoint from one port. Everything it keeps lives in one data
folder: the SQLite database `schreibzeug.db`, the file contents under `blobs/`, and `auth-secret`.

## With Docker Compose

The repository's `deploy/` folder holds what a server needs: `compose.yaml` (the Schreibzeug
server and Caddy, which gets the HTTPS certificate from Let's Encrypt), `.env.example` and the
`Caddyfile`. The programs come from Docker Hub; nothing is built on the server. On a server with
Docker (or Podman), a DNS record for the address and the ports 80 and 443 open:

```bash
# The configuration (compose.yaml, .env.example, Caddyfile); the programs come from Docker Hub
git clone https://github.com/firsttris/schreibzeug /opt/schreibzeug && cd /opt/schreibzeug
cp deploy/.env.example deploy/.env
nano deploy/.env                                          # domain, mail for Let's Encrypt, version
docker compose -f deploy/compose.yaml up -d schreibzeug   # Schreibzeug alone, on 127.0.0.1:3000
```

Create the first account before the server can be reached from outside: on a closed server only
the first account can be made freely, by whoever comes first. It is an account like every other
one: it takes over the files from before there were accounts, if any, and has no rights over the
others; there is no administrator ([accounts for administrators](accounts.md#for-administrators)).
Afterwards new accounts come through links: any link someone creates to share a file or folder
opens the sign-up for the person who follows it. With `SCHREIBZEUG_OPEN_SIGNUP=true` anyone who
reaches the server may sign up ([accounts](accounts.md#sign-up)). With the port on 127.0.0.1,
open it through an SSH tunnel (`ssh -L 3000:127.0.0.1:3000 <server>`, then
`http://localhost:3000`) and create the account, then start Caddy as well:

```bash
docker compose -f deploy/compose.yaml up -d               # Caddy too: https://<domain>
```

Caddy is the only proxy the server trusts (`SCHREIBZEUG_TRUSTED_PROXIES`, its fixed address in
`compose.yaml`), so sign-ins count per client ([below](#behind-a-reverse-proxy)). Port 3000 stays
on 127.0.0.1 for the tunnel.

With [Kontext](kontext.md) none of this is needed: Kontext's `deploy/compose.yaml` brings
Schreibzeug as its "documents", signed in through Kontext.

### The image

The image `tristanteu/schreibzeug` (Docker Hub, also `ghcr.io/firsttris/schreibzeug`) is published
for amd64 with every release (`.github/workflows/release.yml`, from `docker/Dockerfile`).
Each release is published under three tags (`firsttris/workflows` `docker-release.yml`): its
version (`:0.1.7`), its minor version (`:0.1`, moved to the newest patch release) and `:latest`; a
pre-release such as `0.2.0-rc.1` gets its version and `:next` instead. Pin a version, as
`SCHREIBZEUG_VERSION` in `deploy/.env` does, rather than `:latest`: an update then happens when
you choose it, after a look at the
[changelog](https://github.com/firsttris/schreibzeug/blob/main/CHANGELOG.md), and a backup
([updates](#updates)).

The server in the image runs as the unprivileged user `bun` (uid 1000) and writes only `/data`.
Run one server per data folder: the collaboration sessions and the jobs for open documents live in
the server's memory ([collaboration](collaboration.md#saving)), so a second instance on the
same data would not see the first one's editors.

To build the image yourself from the repository:

```bash
git clone https://github.com/firsttris/schreibzeug && cd schreibzeug
docker build -f docker/Dockerfile -t tristanteu/schreibzeug .
```

The build downloads the pinned Euro-Office release and generates its fonts with a Linux x86_64
tool, so it needs an amd64 machine (or emulation). Podman works the same way.

### Without Compose

One container, behind a reverse proxy of your own ([below](#behind-a-reverse-proxy)):

```bash
docker run -d --name schreibzeug --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data \
  -e SCHREIBZEUG_URL=https://office.example.org \
  -e SCHREIBZEUG_TRUSTED_PROXIES=172.16.0.0/12 \
  tristanteu/schreibzeug:0.1
```

The port is published on 127.0.0.1 only, for the proxy on the same machine, which adds HTTPS.
Docker writes its own firewall rules for a published port, ahead of ufw or firewalld, so
`-p 3000:3000` would put plain HTTP on the internet whatever the firewall says. Set
`SCHREIBZEUG_URL` to the address people open: behind HTTPS the server refuses sign-in and changes
without it, and sign-in through an OpenID Connect provider needs it.
`SCHREIBZEUG_TRUSTED_PROXIES` names the proxy as the server in the container sees it, the Docker
network ([below](#behind-a-reverse-proxy)). The first account comes first here too, through the
tunnel, as above.

Only trying it on your own computer: `docker run -d -p 127.0.0.1:3000:3000 -v
schreibzeug-data:/data tristanteu/schreibzeug`, then http://localhost:3000.

## Settings

All settings are environment variables (`apps/server/src/config.ts`); the image sets
`PORT=3000`, `SCHREIBZEUG_DATA_DIR=/data` and `SCHREIBZEUG_WEB_DIR=/app/web`.

| Variable | Default | |
|---|---|---|
| `SCHREIBZEUG_DATA_DIR` | `data` | The data folder: database, file contents, secret |
| `PORT` | `3000` | The port the server listens on |
| `SCHREIBZEUG_URL` | – | The address people open, e.g. `https://office.example.org`: the base of the sign-in through Kontext (required with `OIDC_*`), the audience of Kontext's tokens, the links the MCP tools give, and the origin the browser's changes must come from. Set it behind an HTTPS proxy: the server itself sees `http://`, so without it the browser's `https://` origin is refused |
| `SCHREIBZEUG_MAX_UPLOAD_MB` | `512` | The largest file that can be uploaded or saved |
| `SCHREIBZEUG_AUTH_SECRET` | generated | Signs the session cookies (at least 32 characters); without it one is generated and kept in the data folder |
| `SCHREIBZEUG_OPEN_SIGNUP` | `false` | `true`: anyone who reaches the server may create an account |
| `SCHREIBZEUG_TRUSTED_ORIGINS` | – | More origins whose pages may sign in and, with a session, change things, separated by commas. Rarely needed: the origin a request is sent to and `SCHREIBZEUG_URL` are trusted anyway, and the desktop app shows the server's own pages |
| `SCHREIBZEUG_TRUSTED_PROXIES` | – | The reverse proxies in front of the server, as the server sees them: IP addresses or CIDR ranges, separated by commas ([below](#behind-a-reverse-proxy)) |
| `SCHREIBZEUG_WEB_DIR` | – | The built web app to serve beside the API (set in the image) |
| `SCHREIBZEUG_EMBED_ORIGIN` | – | The one site that may show Schreibzeug in a frame ([Kontext](kontext.md)) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | – | Sign-in through an OpenID Connect provider, all three together ([Kontext](kontext.md)) |
| `OIDC_NAME` | `Kontext` | The name on the sign-in button |
| `SCHREIBZEUG_VERSIONS` | `thin` | `thin`: older versions are thinned out with age, kept ones stay ([versions](files.md#versions)); `all`: every save stays as a version |

## Behind a reverse proxy

With Compose, `deploy/` brings Caddy set up for this (`deploy/Caddyfile`); this section is for a
proxy of your own. Put Schreibzeug behind a proxy that terminates HTTPS and passes WebSockets:
editing goes over `/api/collab/<file>` and jobs for an open document over `/api/agent/<file>`.
With Caddy:

```
office.example.org {
	reverse_proxy localhost:3000
}
```

With nginx, forward `Upgrade` and `Connection`, append the address the request came from to
`X-Forwarded-For`, and allow bodies as large as uploads may be:

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

Name the proxy in `SCHREIBZEUG_TRUSTED_PROXIES`, as the server sees it: `127.0.0.1` when it runs on
the same machine, the Docker network (e.g. `172.16.0.0/12`) when the server runs in a container and
the proxy reaches it through a published port. Sign-in and sign-up allow a few tries per client in
ten seconds (Better Auth's rate limit). The server counts a client by the address of the connection
and ignores what a client writes into `X-Forwarded-For` itself; only behind a proxy named here it
takes the forwarded chain and counts by the first address in it, from the right, that is not one
of the proxies (`apps/server/src/auth/client-ip.ts`). Without the setting behind a proxy, every
client counts as the proxy, and all of them share those few tries. When a proxy is in front, publish
the port only for it (`-p 127.0.0.1:3000:3000`), so nobody reaches the server around it.

The server compresses the app and the editing engine itself (Brotli or gzip) and tells browsers to
keep the engine for good ([opening fast](engine.md#opening-fast-on-a-phone-too)); the proxy needs no
compression of its own and must pass `Cache-Control`, `ETag` and `Content-Encoding` on, as Caddy
and nginx do with the settings above.

`client_max_body_size` matches `SCHREIBZEUG_MAX_UPLOAD_MB` (512 by default); when the files are
smaller, lower both, e.g. to `100m` and `100`, so the proxy turns away oversized bodies before they
reach the server.

## Backups

Back up the data folder; it holds everything. The database runs in WAL mode, so copy it while the
server is stopped: a copy taken while it writes can miss what is still in `schreibzeug.db-wal`.
The image has no `sqlite3`; archive the volume with a throwaway container instead, here into the
current folder. With Compose the volume is `schreibzeug_schreibzeug-data` (the project's name
first):

```bash
cd /opt/schreibzeug
docker compose -f deploy/compose.yaml stop schreibzeug
docker run --rm -v schreibzeug_schreibzeug-data:/data:ro -v "$PWD":/backup alpine \
  tar -czf /backup/schreibzeug-$(date +%F).tar.gz -C /data .
docker compose -f deploy/compose.yaml start schreibzeug
```

Without Compose the same with `docker stop schreibzeug`, the volume `schreibzeug-data` and
`docker start schreibzeug`. A folder mounted from the host (`-v /srv/schreibzeug:/data`) the same
way, with the container stopped: `sudo tar -czf schreibzeug-$(date +%F).tar.gz -C /srv/schreibzeug .`

Keep `auth-secret` (or `SCHREIBZEUG_AUTH_SECRET`) with the backup: it signs the session cookies,
and without it everyone has to sign in again.

### Restore

With Compose the volume is the one named in `compose.yaml`, so the archive goes into it: back up
what is there now first (above), then empty it and unpack, with the server stopped. The `chown`
hands everything, the volume's top folder included, to uid 1000, which the server runs as:

```bash
cd /opt/schreibzeug
docker compose -f deploy/compose.yaml stop schreibzeug
docker run --rm -v schreibzeug_schreibzeug-data:/data -v "$PWD":/backup alpine \
  sh -c 'find /data -mindepth 1 -delete && tar -xzf /backup/schreibzeug-2026-10-27.tar.gz -C /data && chown -R 1000:1000 /data'
docker compose -f deploy/compose.yaml start schreibzeug
```

Without Compose, unpack the archive into a new, empty volume and start the container on it; the
old volume stays until you remove it. The `chown` hands everything, the volume's top folder included, to uid 1000,
which the server runs as:

```bash
docker rm -f schreibzeug
docker volume create schreibzeug-restored
docker run --rm -v schreibzeug-restored:/data -v "$PWD":/backup alpine \
  sh -c 'tar -xzf /backup/schreibzeug-2026-10-27.tar.gz -C /data && chown -R 1000:1000 /data'
```

Then start it as under [without Compose](#without-compose), with `-v schreibzeug-restored:/data`.
Either way, use the same image version the backup was made with or a newer one (the schema is brought forward at start, never
back).

## Updates

What changed and which updates need a step of their own is in the
[changelog](https://github.com/firsttris/schreibzeug/blob/main/CHANGELOG.md). Make a
[backup](#backups) first: the database schema is brought up to date at start
(`apps/server/drizzle`) and never back, so the backup is the way back to the older version.

With Compose, `git pull` brings what changed in `deploy/`, and the version in `.env` chooses the
image:

```bash
cd /opt/schreibzeug && git pull
nano deploy/.env    # SCHREIBZEUG_VERSION to the new version, e.g. 0.1.9; new lines from .env.example
docker compose -f deploy/compose.yaml pull && docker compose -f deploy/compose.yaml up -d
```

`deploy/.env` is your own copy and does not change with `git pull`; `git diff ORIG_HEAD --
deploy/` shows what changed there. Caddy has a fixed version in `compose.yaml`; a new one comes
with `git pull`.

Without Compose, pull the new version and start the container again, with the same settings:

```bash
docker pull tristanteu/schreibzeug:0.1
docker rm -f schreibzeug
docker run -d --name schreibzeug --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data \
  -e SCHREIBZEUG_URL=https://office.example.org \
  -e SCHREIBZEUG_TRUSTED_PROXIES=172.16.0.0/12 \
  tristanteu/schreibzeug:0.1
```

For a move to another minor version, change the tag in both places (e.g. to `:0.2`).

Images up to 0.1.3 ran the server as root; since 0.1.4 it runs as `bun` (uid 1000). A data volume
from an older image belongs to root, and the server cannot write it. Hand it to uid 1000 once, with
the container stopped:

```bash
docker stop schreibzeug
docker run --rm --user root -v schreibzeug-data:/data tristanteu/schreibzeug:0.1 chown -R 1000:1000 /data
```

A folder mounted from the host (`-v /srv/schreibzeug:/data`) the same way:
`sudo chown -R 1000:1000 /srv/schreibzeug`.

## Your own changes

The AGPL asks that people who use a changed Schreibzeug over the network can get its source. The
app links to the source in **Hilfe → Über Schreibzeug** in the editor, and that link is fixed in the
code: `SOURCE_URL` in `apps/web/src/editor/help-dialogs.tsx` points at this repository. When you
run a version with changes of your own, point it at your source (your fork, at the version you run)
before you build the image.

## Troubleshooting

The server writes to its log what makes it stop: `docker logs schreibzeug`.

- **Sign-in fails, or saving, uploading and sharing answer 403** ("Invalid origin", "Diese Anfrage
  kommt nicht von Schreibzeug."): behind an HTTPS proxy the server sees `http://`, so the browser's
  `https://` origin is not its own. Set `SCHREIBZEUG_URL` to the address people open
  (`apps/server/src/auth/origin.ts`).
- **The file list works, but documents do not open** ("Der Server ist nicht erreichbar." in the
  editor): the proxy does not pass WebSockets on, which editing needs (`/api/collab/<file>`). Pass
  `Upgrade` and `Connection` on as in the [nginx example](#behind-a-reverse-proxy).
- **The container stops at start, or keeps restarting**, with "attempt to write a readonly
  database" or "unable to open database file" in the log: the data volume belongs to root, from an
  image before 0.1.4, or the folder mounted from the host does. Hand it to uid 1000
  ([updates](#updates)).
- **The server refuses to start** with "Invalid configuration" and "Signing in through OIDC
  (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET) needs SCHREIBZEUG_URL": set `SCHREIBZEUG_URL`
  (`apps/server/src/config.ts`). An invalid value of any other setting stops it the same way and
  names the setting.
- **Sign-in fails for everyone after a few tries** (429, "Too many requests. Please try again
  later."): the proxy is not named in `SCHREIBZEUG_TRUSTED_PROXIES`, so every client counts as
  the proxy ([above](#behind-a-reverse-proxy)).

# Installation

Schreibzeug is one server (Bun, `apps/server`) that serves the web app, the files API, the
collaboration relay and the MCP endpoint from one port. Everything it keeps lives in one data
folder: the SQLite database `schreibzeug.db`, the file contents under `blobs/`, and `auth-secret`.

## Docker

The image `tristanteu/schreibzeug` (Docker Hub, also `ghcr.io/firsttris/schreibzeug`) is published
for amd64 with every release (`.github/workflows/release.yml`, from `docker/Dockerfile`):

```bash
docker run -d --name schreibzeug --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data \
  -e SCHREIBZEUG_URL=https://office.example.org \
  tristanteu/schreibzeug
```

The port is published on 127.0.0.1 only, for the [reverse proxy](#behind-a-reverse-proxy) on the
same machine, which adds HTTPS. Docker writes its own firewall rules for a published port, ahead of
ufw or firewalld, so `-p 3000:3000` would put plain HTTP on the internet whatever the firewall
says. Set `SCHREIBZEUG_URL` to the address people open; sign-in through an OpenID Connect provider
needs it.

The server in the image runs as the unprivileged user `bun` (uid 1000) and writes only `/data`.

Until the first release, build the image from the repository:

```bash
git clone https://github.com/firsttris/schreibzeug && cd schreibzeug
docker build -f docker/Dockerfile -t tristanteu/schreibzeug .
```

The build downloads the pinned Euro-Office release and generates its fonts with a Linux x86_64
tool, so it needs an amd64 machine (or emulation). Podman works the same way.

With Docker Compose:

```yaml
services:
  schreibzeug:
    image: tristanteu/schreibzeug
    restart: unless-stopped
    ports: ["127.0.0.1:3000:3000"]
    volumes: ["schreibzeug-data:/data"]
    environment:
      SCHREIBZEUG_URL: https://office.example.org
volumes:
  schreibzeug-data:
```

Create the first account before the server can be reached from outside: it owns the installation,
and only it can be made freely, by whoever comes first; afterwards new accounts come through
invitation links, or from anyone with `SCHREIBZEUG_OPEN_SIGNUP=true`
([accounts](accounts.md#sign-up)). With the port on 127.0.0.1, open it through an SSH tunnel
(`ssh -L 3000:127.0.0.1:3000 <server>`, then `http://localhost:3000`) and create the account, then
switch on the proxy.

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
| `SCHREIBZEUG_TRUSTED_ORIGINS` | – | More origins that may sign in and, with a session, change things, separated by commas (the desktop app) |
| `SCHREIBZEUG_TRUSTED_PROXIES` | – | The reverse proxies in front of the server, as the server sees them: IP addresses or CIDR ranges, separated by commas ([below](#behind-a-reverse-proxy)) |
| `SCHREIBZEUG_WEB_DIR` | – | The built web app to serve beside the API (set in the image) |
| `SCHREIBZEUG_EMBED_ORIGIN` | – | The one site that may show Schreibzeug in a frame ([Kontext](kontext.md)) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | – | Sign-in through an OpenID Connect provider, all three together ([Kontext](kontext.md)) |
| `OIDC_NAME` | `Kontext` | The name on the sign-in button |

## Behind a reverse proxy

Put Schreibzeug behind a proxy that terminates HTTPS and passes WebSockets: editing goes over
`/api/collab/<file>` and jobs for an open document over `/api/agent/<file>`. With Caddy:

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

## Backups and updates

Back up the data folder; it holds everything. The database runs in WAL mode, so copy it while the
server is stopped, or take a consistent copy with `sqlite3 /data/schreibzeug.db ".backup backup.db"`
and copy `blobs/` and `auth-secret` beside it.

To update, pull the new image and start the container again; the database schema is brought up to
date at start (`apps/server/drizzle`).

```bash
docker pull tristanteu/schreibzeug && docker rm -f schreibzeug && docker run … # as above
```

Images before the server ran as `bun` ran it as root, so a data volume from then belongs to root
and the server cannot write it. Hand it to uid 1000 once, with the container stopped:

```bash
docker run --rm --user root -v schreibzeug-data:/data tristanteu/schreibzeug chown -R 1000:1000 /data
```

A folder mounted from the host (`-v /srv/schreibzeug:/data`) the same way:
`sudo chown -R 1000:1000 /srv/schreibzeug`.

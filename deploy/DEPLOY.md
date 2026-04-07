# Deploy DevOps Insight (Docker)

## 1. `docker compose` vs `docker-compose`

| Command | Meaning |
|--------|---------|
| `docker-compose` (with hyphen) | Standalone **Compose V1** (Python). Your machine has this — use it if `docker compose` fails. |
| `docker compose` (space) | **Compose V2** plugin (`docker` subcommand). Needs package `docker-compose-plugin`. |

If you see:

```text
unknown shorthand flag: 'f' in -f
```

when running `docker compose -f ...`, the V2 plugin is **not** installed (or `docker` is very old). **Use the hyphenated command** for all steps below:

```bash
docker-compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d
```

(Optional) Install V2 on Ubuntu:

```bash
sudo apt-get update
sudo apt-get install docker-compose-plugin
docker compose version
```

---

## 2. Choose a stack

### A. Production-style: HTTPS only (Caddy + Let’s Encrypt)

- UI: `https://opspilot.encipherhealth.com` (no host port 3000 — **no port clash** with Caddy).
- Requires DNS **A** record for the hostname → this server, and ports **80** and **443** open.

```bash
cd ~/arulG/DevOps-Insight   # or your clone path
cp .env.example .env          # then edit MONGODB_URI, mail, etc.

docker-compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

Ensure `deploy/Caddyfile.docker` has the correct `server_name` (hostname).

### B. LAN / lab: HTTP on port 3000 (no Caddy)

```bash
docker-compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

Open `http://SERVER_IP:3000`.

### C. HTTPS **and** direct HTTP on 3000 (debug)

Compose **merges** files; `lan` adds a single frontend publish.

```bash
docker-compose -f docker-compose.yml -f docker-compose.lan.yml -f deploy/docker-compose.caddy.yml up -d --build
```

---

## 3. Azure AD (MSAL)

In **Azure Portal** → App registration → **Authentication** → **Single-page application**, register **every** URL you use, for example:

- `https://opspilot.encipherhealth.com`
- `http://192.168.x.x:3000` (if you use LAN compose)

---

## 4. Environment (`.env`)

At minimum set **`MONGODB_URI`** if you are not using the optional `local-db` Mongo profile.

Other variables: see `.env.example` in the repo.

---

## 5. If a container fails to start

```bash
docker-compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml down
docker rm -f devops-frontend devops-caddy 2>/dev/null
docker-compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

Logs:

```bash
docker logs devops-frontend
docker logs devops-caddy
docker logs devops-backend
```

---

## 6. Why “address already in use” on `devops-frontend`

- Publishing **`3000:80`** on the host while something else (or a **duplicate** merged `ports` entry) already uses **3000** causes this.
- **Fix:** Base `docker-compose.yml` **does not** publish the frontend. With **only** the Caddy file, traffic goes **Caddy → `frontend:80` inside Docker** — no host port for nginx, so no clash.
- Use **`docker-compose.lan.yml`** only when you need `http://IP:3000`.

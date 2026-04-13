# Local Deploy (No Caddy)

This setup runs only:
- `backend`
- `frontend`
- `rabbitmq`

Frontend is published at `http://SERVER_IP:3000` and proxies `/api` to backend.

## 1) Start services

Use the command style your machine supports:

- Compose V1:
  - `docker-compose up -d --build`
- Compose V2:
  - `docker compose up -d --build`

If `docker compose` prints `unknown shorthand flag: 'f'`, use `docker-compose`.

## 2) If frontend is unhealthy

This repo now uses a robust healthcheck (`wget -q -O /dev/null ...`) for alpine nginx.
Rebuild frontend image and recreate container:

- `docker-compose build --no-cache frontend`
- `docker-compose up -d --force-recreate frontend`
- `docker ps`
- `docker logs devops-frontend --tail 100`

## 3) Use a local domain name (hosts file)

On each client machine (or your own machine), add:

- Linux/macOS `/etc/hosts`
- Windows `C:\Windows\System32\drivers\etc\hosts`

Entry:

- `<SERVER_IP> shipit.encipherhealth.com`

Then open:

- `http://shipit.encipherhealth.com:3000`

## 4) Azure login note

For MSAL, Azure App Registration must include every redirect URI you use.
Add these in Azure Portal -> App registrations -> Authentication -> SPA:

- `http://shipit.encipherhealth.com:3000`
- (optional) `http://SERVER_IP:3000`

If you later move to HTTPS, add:

- `https://shipit.encipherhealth.com`


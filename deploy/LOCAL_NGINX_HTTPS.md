# Ubuntu: Local domain + NGINX HTTPS (no warning) + Docker

This is for **local/LAN** use where you want to open:

- `https://opspilot.encipherhealth.com/` (NO `:3000`)

and avoid browser “Not secure” / strikethrough.

Because this domain previously used HTTPS, browsers often enforce HTTPS via **HSTS**. So the correct local solution is: **NGINX on 443 + a trusted local cert**.

---

## A) Docker: run app on port 3000 (internal), NGINX will expose 443/80

On the **server** (where Docker runs):

```bash
cd ~/arulG/DevOps-Insight
git pull

docker-compose down
docker-compose up -d --build

docker ps
```

Expected:
- `devops-frontend` published on `0.0.0.0:3000->80/tcp`
- `devops-backend` on `8080`

If frontend shows `unhealthy`, rebuild frontend (repo already includes curl-based healthcheck):

```bash
docker-compose build --no-cache frontend
docker-compose up -d --force-recreate frontend
docker ps
```

---

## B) Hosts file: point the domain to your server LAN IP

On **each client machine** that opens the site:

Linux:

```bash
sudo nano /etc/hosts
```

Add:

```text
192.168.1.68 opspilot.encipherhealth.com
```

Verify:

```bash
getent hosts opspilot.encipherhealth.com
```

---

## C) Install NGINX + mkcert on the server

```bash
sudo apt update
sudo apt install -y nginx libnss3-tools
sudo snap install mkcert

# install a local root CA into the SERVER trust store (needed for mkcert)
mkcert -install
```

---

## D) Create the HTTPS certificate (server)

```bash
sudo mkdir -p /etc/nginx/certs
cd /etc/nginx/certs

sudo mkcert -key-file opspilot.key -cert-file opspilot.crt opspilot.encipherhealth.com
```

---

## E) Enable NGINX site (server)

Copy the repo config:

```bash
sudo cp deploy/nginx-local-https.conf /etc/nginx/sites-available/opspilot.encipherhealth.com
sudo ln -sf /etc/nginx/sites-available/opspilot.encipherhealth.com /etc/nginx/sites-enabled/opspilot.encipherhealth.com
sudo nginx -t
sudo systemctl restart nginx
```

Firewall:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Test from server:

```bash
curl -Ik https://opspilot.encipherhealth.com/
```

---

## F) Make clients trust the cert (NO warning)

Each **client** that opens the site must trust the mkcert root CA.

On the **client** (Ubuntu):

```bash
sudo apt update
sudo apt install -y libnss3-tools
sudo snap install mkcert
mkcert -install
```

Then reopen Chrome.

> If your client is Windows, tell me and I’ll give the exact import steps.

---

## G) Azure MSAL redirect URI (required)

Azure Portal → App Registration → Authentication → **Single-page application**:

Add:
- `https://opspilot.encipherhealth.com`

Then login will work on your local domain over HTTPS.


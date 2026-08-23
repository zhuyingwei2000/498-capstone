# PantryPilot — Project Documentation

**Team:** Yingwei Zhu · Rui Wang · Wanying Li
**Live URL:** https://pantrypliot.duckdns.org
**Repository:** https://github.com/zhuyingwei2000/498-capstone

---

## Table of Contents

1. [Production Support Document & Testing Scenarios](#1-production-support-document--testing-scenarios)
   - [1.1 Service Dependency Diagram](#11-service-dependency-diagram)
   - [1.2 Monitoring](#12-monitoring)
   - [1.3 Common Incidents & Recovery Steps](#13-common-incidents--recovery-steps)
   - [1.4 Testing Scenarios & Results](#14-testing-scenarios--results)
2. [System Setup Instructions](#2-system-setup-instructions)
   - [2.1 Prerequisites](#21-prerequisites)
   - [2.2 Database Setup (Local)](#22-database-setup-local)
   - [2.3 Backend Setup](#23-backend-setup)
   - [2.4 Frontend Setup](#24-frontend-setup)
   - [2.5 EC2 Cloud Deployment](#25-ec2-cloud-deployment)
   - [2.6 Validation Checklist](#26-validation-checklist)
3. [Issue Diagnosis, Research, Resolution, and Sharing](#3-issue-diagnosis-research-resolution-and-sharing)
4. [System Usage Guide](#4-system-usage-guide)
5. [Architecture Diagram](#5-architecture-diagram)

---

## 1. Production Support Document & Testing Scenarios

### 1.1 Service Dependency Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client Browser                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS (443)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AWS EC2 t3.micro (Ubuntu 26.04)               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Nginx (reverse proxy)                   │ │
│  │  • Serves /dist static files (React build)                 │ │
│  │  • Proxies /api/* → Gunicorn :5000                         │ │
│  │  • Handles SSL termination (Let's Encrypt)                 │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                              │ HTTP (127.0.0.1:5000)            │
│  ┌───────────────────────────▼────────────────────────────────┐ │
│  │              Gunicorn (WSGI server, 2 workers)             │ │
│  │  └──── Flask 3 Application                                 │ │
│  │         • /api/auth     — JWT authentication               │ │
│  │         • /api/pantry   — pantry CRUD                      │ │
│  │         • /api/recipes  — recipe search                    │ │
│  │         • /api/suggest  — AI suggestions                   │ │
│  │         • /api/receipt  — OCR receipt parsing              │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────▼────────────────────────────────┐ │
│  │               PostgreSQL 16 (local on EC2)                 │ │
│  │   Tables: users, pantry_items                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  Spoonacular  │  │  Open Food Facts │  │  OpenAI / Groq   │
  │  Recipe API   │  │   Barcode API    │  │   (AI suggest)   │
  └───────────────┘  └──────────────────┘  └──────────────────┘
```

**DuckDNS** maps `pantrypliot.duckdns.org` → EC2 public IP `3.14.3.230`.
**Let's Encrypt / Certbot** issues and auto-renews the TLS certificate.

---

### 1.2 Monitoring

#### Log Locations

| Component | Log Location | How to View |
|-----------|-------------|-------------|
| **Nginx access** | `/var/log/nginx/access.log` | `sudo tail -f /var/log/nginx/access.log` |
| **Nginx error** | `/var/log/nginx/error.log` | `sudo tail -f /var/log/nginx/error.log` |
| **Flask/Gunicorn** | systemd journal | `sudo journalctl -u pantrypilot -f` |
| **PostgreSQL** | `/var/log/postgresql/` | `sudo tail -f /var/log/postgresql/*.log` |

#### Component Health Checks

```bash
# 1. Check all services are running
sudo systemctl status pantrypilot nginx postgresql

# 2. Test API health endpoint
curl https://pantrypliot.duckdns.org/api/health

# 3. Verify Nginx config is valid
sudo nginx -t

# 4. Check SSL certificate expiry
sudo certbot certificates

# 5. Test database connection
sudo -u postgres psql -c "SELECT 1;"
```

**Expected healthy responses:**
- `systemctl status` → `Active: active (running)`
- `/api/health` → `{"status": "ok"}`
- `nginx -t` → `configuration file ... syntax is ok`

---

### 1.3 Common Incidents & Recovery Steps

#### Incident 1 — Flask/Gunicorn Service Crash

**Symptoms:** API calls return 502 Bad Gateway; frontend loads but no data.

**Diagnosis:**
```bash
sudo systemctl status pantrypilot
sudo journalctl -u pantrypilot -n 50
```

**Recovery:**
```bash
sudo systemctl restart pantrypilot
# Verify
sudo systemctl status pantrypilot
curl https://pantrypliot.duckdns.org/api/health
```

---

#### Incident 2 — Database Connection Loss

**Symptoms:** API returns 500 errors; logs show `psycopg2.OperationalError: could not connect to server`.

**Diagnosis:**
```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql -n 30
```

**Recovery:**
```bash
sudo systemctl restart postgresql
sudo systemctl restart pantrypilot   # reconnect pool
```

---

#### Incident 3 — Nginx Down / 502 on Static Files

**Symptoms:** Site unreachable; browser shows connection refused.

**Diagnosis:**
```bash
sudo systemctl status nginx
sudo nginx -t
```

**Recovery:**
```bash
sudo nginx -t && sudo systemctl restart nginx
```

If config is broken, restore last known good config from git and rebuild.

---

#### Incident 4 — SSL Certificate Expired

**Symptoms:** Browser shows "Your connection is not private"; camera API stops working.

**Recovery:**
```bash
sudo certbot renew
sudo systemctl reload nginx
```

Certbot auto-renews via a systemd timer (`certbot.timer`). Check it with:
```bash
sudo systemctl status certbot.timer
```

---

#### Incident 5 — Deploying a Code Update

After every `git push`:

```bash
# SSH into EC2
ssh -i pantrypilot.pem ubuntu@3.14.3.230

cd ~/498-capstone
git pull origin master

# Frontend rebuild
cd frontend
npm run build

# Backend restart (if Python files changed)
sudo systemctl restart pantrypilot

# Nginx reload (if config changed)
sudo systemctl reload nginx
```

---

### 1.4 Testing Scenarios & Results

#### Manual API Tests (via Postman)

| # | Endpoint | Input | Expected | Result |
|---|----------|-------|----------|--------|
| 1 | `POST /api/auth/register` | Valid email + password ≥8 chars | `{"token": "..."}` 201 | ✅ Pass |
| 2 | `POST /api/auth/register` | Duplicate email | `{"error": "..."}` 409 | ✅ Pass |
| 3 | `POST /api/auth/login` | Valid credentials | `{"token": "..."}` 200 | ✅ Pass |
| 4 | `POST /api/auth/login` | Wrong password | `{"error": "..."}` 401 | ✅ Pass |
| 5 | `GET /api/pantry` | Valid JWT header | Array of pantry items 200 | ✅ Pass |
| 6 | `GET /api/pantry` | No JWT header | `{"msg": "Missing..."}` 401 | ✅ Pass |
| 7 | `POST /api/pantry` | `{name, quantity, unit}` | Item object 201 | ✅ Pass |
| 8 | `PUT /api/pantry/<id>` | Updated quantity | Updated item 200 | ✅ Pass |
| 9 | `DELETE /api/pantry/<id>` | Valid item id | `{"message": "deleted"}` 200 | ✅ Pass |
| 10 | `DELETE /api/pantry/<id>` | Another user's item id | 403 or 404 | ✅ Pass |
| 11 | `GET /api/recipes/search?query=pasta` | Query string | Recipe list 200 | ✅ Pass |
| 12 | `GET /api/recipes/<id>` | Valid recipe id | Full recipe detail 200 | ✅ Pass |
| 13 | `POST /api/suggest` | JWT + pantry items | AI suggestions 200 | ✅ Pass |
| 14 | `GET /api/health` | No auth required | `{"status": "ok"}` 200 | ✅ Pass |

#### Manual UI Test Cases

| # | Scenario | Steps | Expected | Actual |
|---|----------|-------|----------|--------|
| 1 | New user sees Welcome Tour | Register → navigate to home | Tour modal appears | ✅ Pass |
| 2 | Tour not repeated | Complete tour → log out → log in | Tour does not reappear | ✅ Pass |
| 3 | Different users have isolated data | User A adds item → User B logs in | User B sees empty pantry | ✅ Pass |
| 4 | Barcode scan identifies product | Scan barcode of known product | Product name/category populated | ✅ Pass |
| 5 | Expiry alert shows for items expiring soon | Add item with expiry date = today+3 | Orange/red badge shown | ✅ Pass |
| 6 | Cook It deducts pantry items | Tap "Cook It" on recipe | Matching pantry items reduced/removed | ✅ Pass |
| 7 | Shopping list persists across sessions | Add items → close tab → reopen | Items still present | ✅ Pass |
| 8 | Shopping list isolated by user | User A adds to list → User B logs in | User B list is empty | ✅ Pass |
| 9 | Achievement unlocked | Complete first recipe | Achievement toast appears | ✅ Pass |
| 10 | Invalid email shows English error | Enter "notanemail" → submit | "Please enter a valid email address." | ✅ Pass |
| 11 | Short password shows English error | Enter password < 8 chars | "Password must be at least 8 characters." | ✅ Pass |

#### Post-Deployment Smoke Tests

Run these immediately after any deployment to production:

```bash
# 1. HTTPS reachable
curl -I https://pantrypliot.duckdns.org

# 2. API health
curl https://pantrypliot.duckdns.org/api/health

# 3. Register a new user
curl -X POST https://pantrypliot.duckdns.org/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"Smoke1234"}'

# 4. Login with new user (save token)
curl -X POST https://pantrypliot.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"Smoke1234"}'

# 5. Verify UI loads — open https://pantrypliot.duckdns.org in browser
# 6. Verify camera permission prompt appears on receipt upload
```

All smoke tests must pass before marking a deployment complete.

---

## 2. System Setup Instructions

### 2.1 Prerequisites

| Component | Requirement |
|-----------|------------|
| OS | macOS, Linux, or Windows 10+ |
| Node.js | v18 or higher (`node --version`) |
| npm | v9 or higher (`npm --version`) |
| Python | 3.10 – 3.13 (NOT 3.14 — psycopg2 wheel not available) |
| Docker Desktop | Latest (for local PostgreSQL) |
| Git | Any recent version |

**API Keys required (stored in `backend/.env` only — never commit this file):**

| Key | Where to get |
|-----|-------------|
| `SPOONACULAR_API_KEY` | https://spoonacular.com/food-api |
| `OPENAI_API_KEY` | https://platform.openai.com |
| `JWT_SECRET_KEY` | Any long random string |
| `DATABASE_URL` | Set after starting Docker (see §2.2) |

---

### 2.2 Database Setup (Local)

```bash
# 1. Start the PostgreSQL container
docker compose up -d

# 2. Verify it is running
docker compose ps
# Should show: pantrypilot-postgres   running
```

The container exposes PostgreSQL on `localhost:5432`.
`DATABASE_URL` for local dev: `postgresql://pantrypilot:pantrypilot@localhost:5432/pantrypilot`

---

### 2.3 Backend Setup

```bash
# 1. Navigate to backend folder
cd backend

# 2. Create a virtual environment
python3 -m venv venv

# 3. Activate it
# macOS / Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create backend/.env (never commit this file)
cat > .env << 'EOF'
DATABASE_URL=postgresql://pantrypilot:pantrypilot@localhost:5432/pantrypilot
JWT_SECRET_KEY=your-secret-key-here
SPOONACULAR_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
EOF

# 6. Apply database migrations
flask db upgrade

# 7. Start the development server
flask run
# → Running on http://127.0.0.1:5000
```

**Validation:** `curl http://localhost:5000/api/health` should return `{"status": "ok"}`.

---

### 2.4 Frontend Setup

```bash
# 1. Open a new terminal, navigate to frontend folder
cd frontend

# 2. Install dependencies
npm install

# 3. Create frontend/.env.local (for local dev)
echo "VITE_API_BASE_URL=http://localhost:5000" > .env.local

# 4. Start the development server
npm run dev
# → Local: http://localhost:5173
```

**Validation:** Open http://localhost:5173 in the browser — the PantryPilot login page should load.

---

### 2.5 EC2 Cloud Deployment

> These steps produce the live site at https://pantrypliot.duckdns.org.
> Requires an AWS EC2 t3.micro instance running Ubuntu 26.04 LTS with ports 22, 80, 443 open.

#### Step 1 — SSH into EC2

```bash
ssh -i pantrypilot.pem ubuntu@3.14.3.230
```

#### Step 2 — Install System Dependencies

```bash
sudo apt-get update
sudo apt-get install -y \
    python3 python3-pip python3-venv \
    python3-psycopg2 libpq-dev \
    postgresql postgresql-client \
    nginx nodejs npm git
```

> **Why `python3-psycopg2` from system packages?**
> Ubuntu 26.04 ships Python 3.14. No pre-built `psycopg2-binary` wheel exists for 3.14.
> Installing the system package and using `--system-site-packages` is the workaround.

#### Step 3 — Set Up PostgreSQL Database

```bash
sudo -u postgres psql -c "CREATE USER pantrypilot WITH PASSWORD 'your-db-password';"
sudo -u postgres psql -c "CREATE DATABASE pantrypilot OWNER pantrypilot;"
```

#### Step 4 — Clone the Repository

```bash
git clone https://github.com/zhuyingwei2000/498-capstone.git
cd 498-capstone
chmod 755 /home/ubuntu
```

#### Step 5 — Configure Backend

```bash
cd backend

# Virtual environment WITH system-site-packages (for psycopg2)
python3 -m venv venv --system-site-packages
source venv/bin/activate

# Install all requirements except psycopg2 (already installed via system)
grep -v psycopg2 requirements.txt | pip install -r /dev/stdin

# Create .env
nano .env
# Fill in:
# DATABASE_URL=postgresql://pantrypilot:your-db-password@localhost:5432/pantrypilot
# JWT_SECRET_KEY=your-long-random-secret
# SPOONACULAR_API_KEY=...
# OPENAI_API_KEY=...

# Run migrations
flask db upgrade
```

#### Step 6 — Create Gunicorn Systemd Service

```bash
sudo nano /etc/systemd/system/pantrypilot.service
```

Paste:

```ini
[Unit]
Description=PantryPilot Flask App
After=network.target postgresql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/498-capstone/backend
Environment="PATH=/home/ubuntu/498-capstone/backend/venv/bin"
ExecStart=/home/ubuntu/498-capstone/backend/venv/bin/gunicorn \
    -w 2 -b 127.0.0.1:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable pantrypilot
sudo systemctl start pantrypilot
```

#### Step 7 — Build Frontend

```bash
cd /home/ubuntu/498-capstone/frontend
npm install
npm run build
chmod -R 755 /home/ubuntu/498-capstone/frontend/dist
```

#### Step 8 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/pantrypilot
```

Paste:

```nginx
server {
    listen 80;
    server_name pantrypliot.duckdns.org;

    root /home/ubuntu/498-capstone/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pantrypilot /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

#### Step 9 — Configure Domain (DuckDNS)

1. Register at https://www.duckdns.org
2. Create subdomain `pantrypliot`, set IP to EC2 public IP (`3.14.3.230`)
3. Verify: `nslookup pantrypliot.duckdns.org` should return `3.14.3.230`

#### Step 10 — Enable HTTPS (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pantrypliot.duckdns.org
```

Certbot automatically modifies the Nginx config and enables HTTPS. Auto-renewal is handled by a systemd timer.

#### Subsequent Updates

```bash
cd ~/498-capstone && git pull origin master
cd frontend && npm run build
sudo systemctl restart pantrypilot
sudo systemctl reload nginx
```

---

### 2.6 Validation Checklist

| Check | Command / Action | Expected |
|-------|-----------------|----------|
| Backend service running | `sudo systemctl is-active pantrypilot` | `active` |
| Nginx running | `sudo systemctl is-active nginx` | `active` |
| PostgreSQL running | `sudo systemctl is-active postgresql` | `active` |
| API health | `curl https://pantrypliot.duckdns.org/api/health` | `{"status":"ok"}` |
| HTTPS valid | `curl -I https://pantrypliot.duckdns.org` | `HTTP/2 200` |
| Frontend loads | Open URL in browser | Login page renders |
| Camera works | Click receipt upload → camera | Permission prompt appears |

---

## 3. Issue Diagnosis, Research, Resolution, and Sharing

---

### Issue 1 — psycopg2-binary Fails to Install on Python 3.14

**Description:** `pip install psycopg2-binary` failed during EC2 deployment with a C compilation error. Expected: package installs cleanly. Actual: build fails with `error: command '/usr/bin/x86_64-linux-gnu-gcc' failed`.

**Environment:** Ubuntu 26.04 LTS ("Resolute"), Python 3.14.0, pip 24.x, EC2 t3.micro.

**Steps to Reproduce:**
1. SSH into Ubuntu 26.04 EC2 instance
2. `python3 -m venv venv && source venv/bin/activate`
3. `pip install psycopg2-binary==2.9.9`

**Diagnosis:** Ubuntu 26.04 ships Python 3.14 as the default Python. `psycopg2-binary` provides pre-compiled wheels only up to Python 3.13. Without a matching wheel, pip attempts to compile from source, which fails because `psycopg2` 2.9.x is not compatible with Python 3.14's C API changes.

**Research Process:**
- Checked PyPI for available psycopg2-binary wheels: only up to cp313 (Python 3.13)
- Searched Stack Overflow for "psycopg2 python 3.14 ubuntu 26" — no direct hits
- Consulted official Ubuntu package list: `python3-psycopg2` is available as a system package compiled against the system Python
- Reviewed pip `--system-site-packages` venv flag documentation

**Resolution:**
```bash
# Install system psycopg2 (compiled by Ubuntu for Python 3.14)
sudo apt-get install -y python3-psycopg2 libpq-dev

# Create venv that can see system packages
python3 -m venv venv --system-site-packages

# Install all other requirements, excluding psycopg2
grep -v psycopg2 requirements.txt | pip install -r /dev/stdin
```

**Outcome Verification:** `python3 -c "import psycopg2; print(psycopg2.__version__)"` printed `2.9.9` without error. `flask db upgrade` completed successfully.

---

### Issue 2 — Python 3.12 Not Available via deadsnakes PPA on Ubuntu 26.04

**Description:** Attempted to install Python 3.12 (to avoid the psycopg2/3.14 issue) via the popular `deadsnakes/ppa` repository. Expected: `python3.12` installs. Actual: `E: Unable to locate package python3.12`.

**Environment:** Ubuntu 26.04 LTS ("Resolute"), AWS EC2.

**Steps to Reproduce:**
1. `sudo add-apt-repository ppa:deadsnakes/ppa`
2. `sudo apt-get update`
3. `sudo apt-get install python3.12`

**Diagnosis:** The deadsnakes PPA had not yet added support for Ubuntu 26.04 ("Resolute") at the time of deployment. The PPA only supported up to Ubuntu 24.04 ("Noble").

**Research Process:**
- Checked deadsnakes GitHub issues: confirmed Ubuntu 26.04 not yet supported
- Searched for alternative PPAs — none were stable
- Considered compiling Python 3.12 from source — too time-consuming for a capstone project

**Resolution:** Abandoned the approach of downgrading Python; instead solved the psycopg2 problem directly (see Issue 1).

**Outcome Verification:** Backend ran correctly using Python 3.14 with the system psycopg2 workaround.

---

### Issue 3 — Nginx Returns 500 Error After Deployment

**Description:** After completing Nginx configuration and restarting the service, visiting the site returned HTTP 500. Expected: site loads. Actual: 500 Internal Server Error page.

**Environment:** Ubuntu 26.04 EC2, Nginx 1.24, frontend built in `/home/ubuntu/498-capstone/frontend/dist`.

**Steps to Reproduce:**
1. Configure Nginx `root /home/ubuntu/498-capstone/frontend/dist`
2. `sudo systemctl restart nginx`
3. Visit `http://<EC2-IP>/`

**Diagnosis:** Nginx worker processes run as the `www-data` user. On Ubuntu, `/home/ubuntu` has permissions `750` by default — `www-data` cannot enter the directory. The error log showed: `Permission denied while reading /home/ubuntu`.

**Research Process:**
- `sudo tail -f /var/log/nginx/error.log` revealed the exact `Permission denied` message
- Searched "nginx permission denied /home/ubuntu" on Stack Overflow — confirmed the 750 permissions issue
- Reviewed Nginx documentation on worker process user

**Resolution:**
```bash
chmod 755 /home/ubuntu
chmod -R 755 /home/ubuntu/498-capstone/frontend/dist
sudo systemctl restart nginx
```

**Outcome Verification:** `curl http://<EC2-IP>/` returned `HTTP/1.1 200 OK` and the React HTML page.

---

### Issue 4 — Camera / getUserMedia Unavailable on HTTP

**Description:** The "Upload Receipt" button opened the camera modal but nothing happened — no camera permission prompt appeared. Browser console showed: `TypeError: Cannot read properties of undefined (reading 'getUserMedia')`.

**Environment:** Chrome 124, HTTP (non-HTTPS) page, EC2 deployment before HTTPS was configured.

**Steps to Reproduce:**
1. Open `http://pantrypliot.duckdns.org` (HTTP only, no HTTPS)
2. Navigate to Pantry → Upload Receipt
3. Click "Open Camera"

**Diagnosis:** The [MediaDevices API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) (`navigator.mediaDevices`) is only available on **secure origins** (HTTPS or localhost). On plain HTTP, the browser sets `navigator.mediaDevices` to `undefined` as a security policy.

**Research Process:**
- MDN documentation on `getUserMedia`: "Available only in secure contexts (HTTPS)"
- Chrome security policy: "Powerful features" are restricted to secure contexts
- StackOverflow: confirmed `navigator.mediaDevices` is `undefined` on HTTP

**Resolution:**
1. Added a null-check in `ReceiptScanner.jsx` to surface a helpful error message:
   ```javascript
   if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
     setCameraError("Camera requires HTTPS. Please use Upload Photo instead.");
     return;
   }
   ```
2. Set up HTTPS via Let's Encrypt (see Issue 5 and §2.5 Step 10).

**Outcome Verification:** After HTTPS was enabled, `navigator.mediaDevices.getUserMedia` was defined. Camera permission prompt appeared correctly.

---

### Issue 5 — Certbot Could Not Find Nginx Server Block

**Description:** Running `sudo certbot --nginx -d pantrypliot.duckdns.org` returned: `No server found for domain pantrypliot.duckdns.org`. Expected: certbot finds the Nginx config and installs the certificate automatically.

**Environment:** Nginx 1.24, certbot 2.x, Ubuntu 26.04 EC2.

**Steps to Reproduce:**
1. Configure Nginx with `server_name 3.14.3.230;` (IP address)
2. `sudo certbot --nginx -d pantrypliot.duckdns.org`

**Diagnosis:** The Nginx config used `server_name 3.14.3.230` (the EC2 public IP) rather than the domain name. Certbot looks for a `server_name` that matches the domain passed to it — since no block matched `pantrypliot.duckdns.org`, certbot could not determine where to inject the SSL configuration.

**Research Process:**
- Certbot documentation: requires `server_name` to match the domain being certified
- Stack Overflow: confirmed certbot cannot modify a server block if server_name is an IP

**Resolution:**
```bash
# Replace IP with domain in Nginx config
sudo sed -i 's/server_name 3.14.3.230/server_name pantrypliot.duckdns.org/' \
    /etc/nginx/sites-available/pantrypilot
sudo nginx -t && sudo systemctl reload nginx

# Then run certbot
sudo certbot --nginx -d pantrypliot.duckdns.org
```

**Outcome Verification:** Certbot output: "Congratulations! Your certificate and chain have been saved." Browser padlock icon appeared; HTTPS forced via HTTP→HTTPS redirect added by certbot.

---

### Issue 6 — Barcode Lookup Returns 404 / Network Error in Production

**Description:** Scanning a barcode that previously worked in local development returned "Network error" or an empty result in production. Same barcode, same product.

**Environment:** Chrome on HTTPS, Open Food Facts API v2, EC2 production.

**Steps to Reproduce:**
1. Open pantrypliot.duckdns.org
2. Click "Scan Barcode" on a known product
3. Allow camera, scan barcode → Error message appeared

**Diagnosis:** The original code called the Open Food Facts **v2** API (`/api/v2/product/{barcode}.json`). The v2 API applies stricter validation and returns 404 for barcodes with leading zeros or minor format differences. The v0 API is more permissive and handles the same barcodes correctly. Local dev happened to test with a barcode the v2 API accepted; production testing used a different barcode the v2 API rejected.

**Research Process:**
- Opened Chrome DevTools → Network tab; confirmed 404 from `world.openfoodfacts.org/api/v2/product/...`
- Open Food Facts API documentation: v0 is the stable, permissive endpoint; v2 is newer and stricter
- Tested same barcode against v0 endpoint in Postman → 200 with product data

**Resolution:**
Changed `openfoodfacts.js` from v2 to v0 API:
```javascript
// Before
const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
// After
const OFF_BASE = "https://world.openfoodfacts.org/api/v0/product";
```
Also added specific error messages instead of a generic "Network error".

**Outcome Verification:** Barcode scan returned correct product name and category for the same product that previously failed.

---

### Issue 7 — New User Sees Another User's Pantry Items

**Description:** After clearing the database with `TRUNCATE ... RESTART IDENTITY` and registering a new account, the new user could see pantry items that belonged to the previously deleted user.

**Environment:** PostgreSQL 16, EC2 production, after a database reset for demo preparation.

**Steps to Reproduce:**
1. Add pantry items as User A (id=1)
2. Run `TRUNCATE pantry_items, users RESTART IDENTITY CASCADE;`
3. Register a new account → new user gets id=1
4. New user sees User A's items

**Diagnosis:** `RESTART IDENTITY` resets the auto-increment sequence, so the first new user receives `id=1`. The `TRUNCATE ... CASCADE` deleted `pantry_items` rows that referenced the old user — but any `pantry_items` rows that were NOT deleted by the cascade (because they had already been partially cleaned up separately) retained `user_id=1`. When the new user registered with `id=1`, those orphaned rows appeared in their pantry.

**Research Process:**
- Verified by querying: `SELECT * FROM pantry_items;` still showed rows despite the TRUNCATE on `users`
- Realized the TRUNCATE order and cascade mattered
- PostgreSQL documentation on `TRUNCATE ... CASCADE`: cascades to referencing tables, but only if the foreign key is in cascade mode

**Resolution:**
```sql
-- Truncate in correct order (pantry_items first, then users)
TRUNCATE pantry_items RESTART IDENTITY;
TRUNCATE users RESTART IDENTITY CASCADE;
```

**Outcome Verification:** `SELECT count(*) FROM pantry_items;` returned 0. New registered user saw an empty pantry.

---

### Issue 8 — Shopping List and Achievements Shared Across Different User Accounts

**Description:** After logging out and registering a new account, the Shopping List tab still showed items added by the previous user. Same issue for Achievements and Saved Recipes.

**Environment:** Chrome browser, localStorage-based state management.

**Steps to Reproduce:**
1. Log in as User A → add items to Shopping List
2. Log out
3. Register and log in as User B
4. Open Shopping List → User A's items are visible

**Diagnosis:** All localStorage keys were generic strings (`pantrypilot_shopping`, `pp_ach_*`, `pp_saved`) with no user identifier. Since localStorage is scoped to the browser, not the logged-in user, all accounts on the same browser shared the same data.

**Research Process:**
- Confirmed via DevTools → Application → LocalStorage: all keys were user-agnostic
- JWT tokens contain the `sub` claim (user ID) in the payload, accessible via `atob(token.split('.')[1])`
- Industry pattern: namespace localStorage keys by user ID

**Resolution:**
Decoded the JWT `sub` claim client-side and namespaced all localStorage keys:
```javascript
function getUserId(token) {
  const payload = JSON.parse(atob(token.split(".")[1]));
  return payload.sub || "guest";
}
// Keys:
// pantrypilot_shopping_${userId}
// pp_ach_${userId}_${achId}
// pp_saved_${userId}
// pp_tour_done_${userId}
```

**Outcome Verification:** Logged in as two different accounts on the same browser; each saw only their own Shopping List and Achievements.

---

### Issue 9 — Chrome Autofill Clears Login Error Messages

**Description:** After a failed login attempt (wrong password), an error message appeared momentarily then immediately disappeared.

**Environment:** Google Chrome with saved passwords, `Login.jsx`.

**Steps to Reproduce:**
1. Go to login page with saved Chrome password
2. Manually enter wrong password → submit
3. Error message flashes briefly then disappears

**Diagnosis:** Chrome detects a failed login and auto-fills the saved password via `onChange` events, which re-triggers the submit handler. The handler called `setError("")` at the top of `handleSubmit`, clearing the previous error before the user could read it.

**Research Process:**
- Reproduced in incognito mode (no autofill) → error persisted correctly; confirmed autofill was the trigger
- Chrome DevTools → "Break on → Subtree modification" on the error element; traced the clear call to `handleSubmit`

**Resolution:**
Moved `setError("")` to after the validation checks, so autofill-triggered re-submission clears the error only when the input actually passes validation:
```javascript
async function handleSubmit(e) {
  e.preventDefault();
  // Validation first — error message survives autofill
  if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
  if (!password)             { setError("Please enter your password."); return; }
  setError("");   // Only cleared when inputs are valid
  ...
}
```

**Outcome Verification:** Error message remained visible after failed login. Incognito mode used for demo to avoid autofill entirely.

---

### Issue 10 — Browser Shows Validation Messages in Chinese

**Description:** On a Chinese-locale browser, submitting the login form with an invalid email showed a Chinese-language tooltip ("请输入电子邮件地址"). Expected: all UI text in English.

**Environment:** Chrome with Chinese (`zh-CN`) locale, HTML5 form with `type="email"` and `required` attributes.

**Steps to Reproduce:**
1. Open the app on a Chrome browser set to Chinese locale
2. Submit the login form with an invalid email
3. Browser shows native Chinese validation tooltip

**Diagnosis:** HTML5 form attributes (`type="email"`, `required`, `minLength`) trigger the browser's built-in validation UI. The browser renders validation messages in the OS/browser locale, not the application's language. This cannot be overridden by CSS or JavaScript without disabling native validation.

**Research Process:**
- MDN on Constraint Validation API: `setCustomValidity()` can customize messages but only if native validation is enabled — still locale-dependent for styling
- Stack Overflow: recommended `noValidate` + full JavaScript validation as the only reliable cross-locale solution

**Resolution:**
Added `noValidate` to both forms and replaced all HTML5 validation attributes with manual JavaScript checks:
```jsx
<form onSubmit={handleSubmit} noValidate>
  <input type="text" /* was type="email" */ ... />
```
```javascript
if (!email.includes("@") || !email.includes(".")) {
  setError("Please enter a valid email address.");
  return;
}
```

**Outcome Verification:** Tested on Chrome zh-CN locale — error messages appeared in English in the app's own UI element, with no browser tooltips.

---

## 4. System Usage Guide

> This guide is written for non-developer end users.

### 4.1 Accessing the Application

Open your web browser and go to:

**https://pantrypliot.duckdns.org**

The app works on desktop and mobile browsers. For the best experience, use **Chrome** or **Safari** on a recent version.

**Test Account (for evaluation):**
| Field | Value |
|-------|-------|
| Email | `test@pantrypilot.com` |
| Password | `Test1234!` |

> *(Replace with actual test credentials before submission)*

---

### 4.2 Registering & Logging In

1. On the login page, click **"Sign up"** to create a new account.
2. Enter your email address and a password (minimum 8 characters).
3. Click **"Sign up"** — you will be logged in automatically.
4. A **Welcome Tour** will appear to guide you through the app's main features.
5. To log out, click **"Log out"** in the top right corner.

---

### 4.3 Main Workflows

#### Adding Items to Your Pantry

There are three ways to add food items:

**Option A — Scan a Barcode**
1. Tap the **📷 Scan Barcode** button
2. Allow camera access when the browser asks
3. Hold a food product's barcode up to the camera
4. The product name and category fill in automatically
5. Adjust quantity and expiry date if needed → **Save**

**Option B — Upload a Receipt**
1. Tap **📄 Upload Receipt**
2. Choose a photo of your grocery receipt or take one with your camera
3. The app reads the receipt and extracts food item names
4. Review and confirm the items → **Add to Pantry**

**Option C — Add Manually**
1. Tap **✏️ Add Manually**
2. Fill in the name, quantity, unit, and optional expiry date
3. Tap **Save**

---

#### Finding Recipes

1. Tap the **🍳 Recipes** tab at the bottom
2. **Search** by typing an ingredient or dish name (e.g. "chicken", "pasta")
3. Or tap **✨ AI Suggestions** to get recipe ideas based on what's in your pantry
4. Tap any recipe to see the full ingredients and instructions
5. Tap **Cook It** to automatically reduce the used ingredients from your pantry

---

#### Managing Your Shopping List

1. Tap the **🛒 Shopping** tab
2. Items are added here automatically when you tap "Add to Shopping List" from a recipe
3. Tap an item to mark it as purchased (strikethrough)
4. Tap **Clear checked** to remove purchased items

---

### 4.4 Known Limitations

| Limitation | Details |
|-----------|---------|
| **Camera requires HTTPS** | The barcode scanner and receipt camera only work on the live HTTPS site, not on plain HTTP. |
| **Barcode database coverage** | Open Food Facts may not have every product. Uncommon products may not be recognized — use Manual Add instead. |
| **AI suggestions require pantry items** | The AI recipe feature needs at least 3 items in your pantry to generate meaningful suggestions. |
| **Shopping list is device-local** | The shopping list is saved in your browser. Clearing browser data will clear it. |
| **No password reset** | There is no "forgot password" feature. Contact the team if you need a reset. |
| **Receipt OCR accuracy** | OCR works best on printed receipts in good lighting. Handwritten or blurry receipts may not parse correctly. |

---

**Support Contact:** zhuyingwei2000@gmail.com

---

## 5. Architecture Diagram

```mermaid
graph TB
    subgraph Client["Client Browser"]
        FE["React 19 + Vite\nSPA Frontend"]
        LS["localStorage\n(Shopping List,\nAchievements,\nSaved Recipes)"]
    end

    subgraph EC2["AWS EC2 t3.micro — Ubuntu 26.04"]
        direction TB
        NGINX["Nginx\nReverse Proxy + Static Files\nSSL Termination"]
        GUN["Gunicorn\nWSGI Server (2 workers)"]

        subgraph Flask["Flask 3 Application"]
            AUTH["/api/auth\nJWT Register/Login"]
            PANTRY["/api/pantry\nCRUD Operations"]
            RECIPE["/api/recipes\nSearch & Detail"]
            SUGGEST["/api/suggest\nAI Suggestions"]
            RECEIPT["/api/receipt\nOCR Parsing"]
        end

        PG["PostgreSQL 16\nusers\npantry_items"]
    end

    subgraph External["External APIs"]
        SPOON["Spoonacular\nRecipe Search API"]
        OFF["Open Food Facts\nBarcode Lookup API"]
        AI["OpenAI / Groq\nLLM API"]
    end

    DUCK["DuckDNS\npantrypliot.duckdns.org"]
    LE["Let's Encrypt\nTLS Certificate"]

    FE -->|"HTTPS :443"| NGINX
    DUCK -->|"DNS → 3.14.3.230"| EC2
    LE -->|"SSL cert"| NGINX
    NGINX -->|"Static files"| FE
    NGINX -->|"HTTP 127.0.0.1:5000"| GUN
    GUN --> Flask
    AUTH --> PG
    PANTRY --> PG
    RECIPE -->|"API call"| SPOON
    SUGGEST -->|"API call"| AI
    RECEIPT -->|"API call"| AI
    FE -->|"Barcode lookup"| OFF
    FE <-->|"Persisted per user ID"| LS
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **React SPA** | All UI rendering, routing, client-side state. Single-page app served as static files. |
| **Nginx** | Serves the built React bundle; proxies `/api/*` to Flask; terminates TLS. |
| **Gunicorn** | Production-grade WSGI server; manages multiple Flask worker processes. |
| **Flask** | REST API: authentication, pantry CRUD, recipe search, AI suggestion, receipt parsing. |
| **PostgreSQL** | Persistent storage for users and pantry items. |
| **Spoonacular** | Third-party recipe database with 300k+ recipes; queried for search and detail. |
| **Open Food Facts** | Open-source food product database; barcode → product name/category. |
| **OpenAI / Groq** | Large language model used to generate personalized recipe suggestions and parse receipt text. |
| **DuckDNS** | Free dynamic DNS; maps subdomain to EC2 public IP. |
| **Let's Encrypt** | Free TLS certificate authority; enables HTTPS (required for camera access). |

---

*Documentation prepared by Yingwei Zhu, Rui Wang, and Wanying Li.*
*Last updated: August 2026.*

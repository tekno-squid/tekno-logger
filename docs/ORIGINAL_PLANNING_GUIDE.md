# Logger Repo — Copilot Guide & External Setup (v1)

This canvas gives you (1) a **single file** you can drop into your repo to steer GitHub Copilot in VS Code to scaffold the project, and (2) **external service setup steps** (Render, DreamHost MySQL, Discord, GitHub) tailored to the “overflow + debugger/alerter” design (no forwarding, tiny retention, optional Discord alerts via UI).

---

## 1) File for GitHub Copilot

Create this file at the repo root:

**`COPILOT_BRIEF.md`**

```md
# Project: Minimal Overflow Logger (Render service + MySQL hot store)

## Mission
Build a small logging service used as (1) a backup when other providers exceed quota and (2) a debugging/alert surface. **Do not forward** to Sentry/Logtail; apps use those directly. The service must accept batched logs, enforce quotas/sampling, store 24–72h of hot data in MySQL, and optionally send Discord alerts (configurable in the UI).

## Tech Constraints
- Host: Render free web service (Node + Fastify, or PHP ok; prefer Node/Fastify).
- DB: DreamHost shared MySQL for hot store (24–72h retention). Keep schema portable to Postgres.
- No background daemons. Use HTTP cron endpoints plus Render cron / GitHub Actions to trigger.
- Avoid external services unless listed in this brief. No Cloudflare dependency.

## Core Requirements (MVP)
1) **API**
   - `POST /log` — accept **JSON array** (optionally gzip). Headers: `X-Project-Key`, `X-Signature: sha256=<HMAC(raw-body)>`.
     - Caps: **≤512KB** payload, **≤250** events/batch. Return 429 with `Retry-After` when per‑minute cap exceeded.
     - Server sampling: dynamic step‑down of non‑error levels under load; never drop `error`/`fatal`.
     - For each event: `ts`, `level`, `message`, `source`, `env`, `ctx` (JSON), optional `user_id`, `request_id`, `tags`.
     - Compute `fingerprint = sha1(message|source|ctx.stack?)` and store.
   - `GET /logs` — filter by `project_id`, `level?`, `fingerprint?`, `q?` (message LIKE or FT if available), `from`, `to`, `limit` (≤500), order desc.
   - `GET /logs/:id` — single event.
   - `GET /healthz` — service health.
   - `GET /config` — sampling defaults per project (used by clients; cache 5m).
   - Admin endpoints (secured by admin token): `POST /admin/maintain` (5‑min tasks), `POST /admin/purge` (daily purge), `GET/POST /admin/project` (CRUD minimal), `GET/POST /admin/alerts` (project alert config).

2) **DB Schema (MySQL)**
   - `projects(id PK, slug UNIQUE, name, api_key_hash CHAR(64), retention_days INT DEFAULT 3, minute_cap INT DEFAULT 5000, default_sample_json JSON, created_at TIMESTAMP)`
   - `logs(id BIGINT PK AUTO_INCREMENT, project_id INT, ts DATETIME(3), day_id INT, level ENUM('debug','info','warn','error','fatal'), source VARCHAR(64), env VARCHAR(32), message VARCHAR(1024), ctx_json JSON NULL, user_id VARCHAR(64) NULL, request_id VARCHAR(64) NULL, tags VARCHAR(128) NULL, fingerprint CHAR(40) NULL, KEY idx_proj_ts(project_id, ts), KEY idx_proj_level_ts(project_id, level, ts), KEY idx_proj_fp_ts(project_id, fingerprint, ts))`
   - `project_minute_counters(project_id INT, minute_utc INT, count INT, PRIMARY KEY(project_id, minute_utc))`
   - `alert_settings(project_id INT PK, enabled TINYINT(1) DEFAULT 0, discord_webhook VARCHAR(255) NULL, spike_n INT DEFAULT 5, spike_window_sec INT DEFAULT 60, error_rate_n INT DEFAULT 50, error_rate_window_sec INT DEFAULT 60, heartbeat_grace_sec INT DEFAULT 600)`
   - (Optional) `fingerprints(project_id INT, fingerprint CHAR(40), last_seen DATETIME(3), last_alert DATETIME(3) NULL, count_1m INT DEFAULT 0, PRIMARY KEY(project_id, fingerprint))`

3) **Retention & Jobs**
   - Keep **3 days** of logs (default). Nightly purge by `day_id` older than cutoff.
   - 5‑minute job: decay/reset small counters, ensure indices OK.
   - Jobs are triggered via HTTP with an **admin token** header.

4) **Security**
   - Ingest requires valid `X-Project-Key` (sha256 hash stored) **and** HMAC signature with `HMAC_SECRET`.
   - Admin endpoints require `X-Admin-Token` equal to `ADMIN_TOKEN` env.
   - Enforce payload size, rows per batch, and per‑minute counters.

5) **UI (minimal but useful)**
   - Single-page HTML (Vanilla/HTMX/Alpine or minimal React) served from same app.
   - Tabs: **Dashboard** (error rate, top fingerprints last hour), **Search** (filters + table + JSON expand), **Alerts** (enable/disable Discord + thresholds), **Projects** (list + create key/hash).
   - Each alert shows a link to a filtered search (project + fingerprint + last 60m).

6) **Config & Env**
   - `.env` keys (document in README):
     - `PORT`, `NODE_ENV`
     - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
     - `HMAC_SECRET`, `ADMIN_TOKEN`
     - `DEFAULT_RETENTION_DAYS` (3), `MAX_PAYLOAD_BYTES` (524288), `MAX_EVENTS_PER_POST` (250)
   - Provide `npm scripts`: `dev`, `start`, `migrate`, `seed` (create admin and initial project), `purge`, `maintain` (these last two call internal endpoints).

## Coding Tasks (in order)
1) **Scaffold** a Fastify app with typed routes and a small router module. Add `dotenv`, `mysql2/promise`, and a minimal query helper.
2) **Migrations**: create tables above. Provide a `migrate` script.
3) Implement `/log`: parse/gzip if present, validate headers, enforce caps, compute `day_id`, bulk insert via one multi-row statement, update minute counter via upsert.
4) Implement `/logs`, `/logs/:id`, `/healthz`, `/config`.
5) Implement **admin** endpoints and in-app handlers for `maintain` and `purge`.
6) Implement **UI** (single page) with fetch-based forms and a simple table; prettify JSON context. Add Alerts settings form.
7) Add **Discord alert service** (optional): helper to fire webhooks; integrate with spike/error-rate rules; include suppression window.
8) Write README with Render deploy steps and DreamHost MySQL connection notes.

## Acceptance Criteria
- Posting 300KB/200-event batch responds `<300ms` locally and `<1s` on Render.
- Caps work: 429 returned when minute counter exceeds project cap; `Retry-After: 60` header present.
- With alerts enabled, sending 5 identical `error` events within 60s triggers exactly **one** Discord message, with subsequent repeats suppressed for 15m and the message includes a suppressed count.
- Purge job removes rows older than retention and keeps fresh data intact.
- UI can filter by project/level/time and shows at least 100 recent events paginated.

## Nice-to-haves (do after MVP)
- Add optional FULLTEXT(message) if MySQL version supports it and dataset is small.
- Add generated columns for `route`, `status`, `duration_ms` extracted from `ctx_json`.
- Export search results to NDJSON.

## Style & Quality
- Keep endpoints small and synchronous to DB; avoid over-abstraction.
- Validate input strictly; never trust client `level`/`env` sizes.
- Prefer prepared statements and one multi-row insert per batch.

```

---

## 2) External Service Setup Steps

### A) Render (service host)
1. **Create a new Web Service** in Render → connect this GitHub repo.
2. **Environment**: Node 18+.
3. **Build command**: `npm ci && npm run build` (or `npm ci` if no build step).
4. **Start command**: `npm start`.
5. **Environment Variables** (Render → Environment):
   - `PORT` = `10000` (Render provides `$PORT` automatically; your app should read `process.env.PORT`).
   - `NODE_ENV` = `production`
   - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` (DreamHost MySQL credentials)
   - `HMAC_SECRET` (random 32–64 chars)
   - `ADMIN_TOKEN` (random 32–64 chars)
   - `DEFAULT_RETENTION_DAYS` = `3`
   - `MAX_PAYLOAD_BYTES` = `524288`
   - `MAX_EVENTS_PER_POST` = `250`
6. **Health Check**: set `/healthz` as health check endpoint.
7. **Cron** options:
   - If Render Cron is available on your plan: create 2 cron jobs hitting:
     - `POST https://<service>.onrender.com/admin/maintain` (every 5 minutes) with header `X-Admin-Token: <ADMIN_TOKEN>`
     - `POST https://<service>.onrender.com/admin/purge` (daily at 03:10 UTC)
   - If Cron is not available: create a **GitHub Actions** workflow to cURL those endpoints on schedule (see section D).

### B) DreamHost MySQL (hot storage)
1. In the DreamHost panel, create a **MySQL database** and **DB user**.
2. Note the **MySQL hostname** (e.g., `mysql.example.com`).
3. Under **MySQL → Users → Allowable Hosts**, add “**%**” or your Render egress IPs (preferred: add the **Render service IP** if listed; otherwise `%` and rotate password periodically). DreamHost requires allowlisting remote hosts to connect.
4. From local dev or a MySQL client, run the **migrations** (or let the app’s `npm run migrate` connect using your local env to create tables).
5. Set `retention_days` per project (default 3).

### C) Discord (optional alerts)
1. In the target Discord server, create a **Webhook** (Server Settings → Integrations → Webhooks → New Webhook).
2. Copy the **Webhook URL**.
3. In the app UI (Alerts tab), paste the URL, toggle alerts on, and set thresholds.
4. Use the UI to send a **test alert**.

### D) GitHub (repo + optional scheduled triggers)
1. Create a **GitHub repository** for the project; push the code.
2. In **Settings → Secrets and variables → Actions → New repository secret**, add (if you plan to run scheduled cURLs):
   - `ADMIN_TOKEN`
   - Optionally `SERVICE_URL` (e.g., `https://your-service.onrender.com`).
3. Add a workflow `.github/workflows/scheduled-maintenance.yml` (if you’re not using Render Cron):

```yaml
name: Scheduled maintenance
on:
  schedule:
    - cron: '*/5 * * * *'
    - cron: '10 3 * * *'
jobs:
  hit-maintenance:
    runs-on: ubuntu-latest
    steps:
      - name: Maintain (every 5 min)
        if: "${{ github.event.schedule == '*/5 * * * *' }}"
        run: |
          curl -s -X POST "$SERVICE_URL/admin/maintain" -H "X-Admin-Token: $ADMIN_TOKEN"
      - name: Purge (daily)
        if: "${{ github.event.schedule == '10 3 * * *' }}"
        run: |
          curl -s -X POST "$SERVICE_URL/admin/purge" -H "X-Admin-Token: $ADMIN_TOKEN"
```

4. Optionally add a `deploy` workflow if you want CI/CD to Render via `render.yaml` or manual deploys.

### E) Local Dev (optional)
1. Copy `.env.example` → `.env` and fill values for local MySQL or Docker MySQL.
2. `npm run migrate` then `npm run dev` to start the API on `http://localhost:3000`.
3. `curl` test ingest, then open `http://localhost:3000/` for UI.

---

## 3) Quick Prompts for Copilot Chat (paste as-is)

**Bootstrap the service (Fastify + MySQL)**
> Create a Fastify app with routes for POST /log, GET /logs, GET /logs/:id, GET /healthz, GET /config, POST /admin/maintain, POST /admin/purge, and minimal admin/project CRUD. Use mysql2/promise. Add a query helper and env loader. Add npm scripts: dev, start, migrate, seed, purge, maintain.

**Implement /log with caps + HMAC**
> Implement /log to accept an array of events, enforce MAX_PAYLOAD_BYTES and MAX_EVENTS_PER_POST, require X-Project-Key and X-Signature (sha256 HMAC over raw body). Compute day_id and fingerprint, and bulk insert with one multi-row statement. Update per-minute project counter via INSERT ... ON DUPLICATE KEY UPDATE.

**Add nightly purge + 5-min maintenance endpoints**
> Add handlers for /admin/purge (delete logs older than retention_days by day_id) and /admin/maintain (cleanup stale counters). Secure these with X-Admin-Token.

**Minimal UI**
> Add a single-page UI with tabs: Dashboard, Search, Alerts, Projects. Implement fetch calls to the API, show a table of results with expandable JSON context, and an alerts form that saves Discord webhook URL and thresholds.

---

## 4) Done Criteria Checklist
- [ ] Render service deployed, `/healthz` returns `{ ok: true }`.
- [ ] DreamHost MySQL reachable from Render; migrations created all tables.
- [ ] `/log` accepts a 200‑event batch and returns `{ accepted: 200 }`.
- [ ] 429 returned with `Retry-After` when exceeding per-minute cap.
- [ ] `/admin/purge` removes data older than retention; `/admin/maintain` runs cleanly.
- [ ] UI shows last hour’s errors and can filter by project and fingerprint.
- [ ] Discord alerts can be toggled and tested from the UI.

---

**End of v1**


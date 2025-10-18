# Project: Minimal Overflow Logger (Render service + MySQL hot store)

## Mission
Build a small logging service used as (1) a backup when other providers exceed quota and (2) a debugging/alert surface. **Do not forward** to Sentry/Logtail; apps use those directly. The service must accept batched logs, enforce quotas/sampling, store 24–72h of hot data in MySQL, and optionally send Discord alerts (configurable in the UI).

## Tech Constraints
- Host: Render free web service (Node + Fastify, TypeScript preferred).
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
   - `GET /healthz` — service health + database connectivity check.
   - `GET /metrics` — basic service metrics (requests, errors, DB connections).
   - `GET /config` — sampling defaults per project (used by clients; cache 5m).
   - Admin endpoints (secured by admin token): `POST /admin/maintain` (5‑min tasks), `POST /admin/purge` (daily purge), `GET/POST /admin/project` (CRUD minimal), `GET/POST /admin/alerts` (project alert config).

2) **DB Schema (MySQL)**
   - `projects(id PK, slug UNIQUE, name, api_key_hash CHAR(64), retention_days INT DEFAULT 3, minute_cap INT DEFAULT 5000, default_sample_json JSON, created_at TIMESTAMP, updated_at TIMESTAMP)`
   - `logs(id BIGINT PK AUTO_INCREMENT, project_id INT, ts DATETIME(3), day_id INT, level ENUM('debug','info','warn','error','fatal'), source VARCHAR(64), env VARCHAR(32), message VARCHAR(1024), ctx_json JSON NULL, user_id VARCHAR(64) NULL, request_id VARCHAR(64) NULL, tags VARCHAR(128) NULL, fingerprint CHAR(40) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_proj_ts(project_id, ts), KEY idx_proj_level_ts(project_id, level, ts), KEY idx_proj_fp_ts(project_id, fingerprint, ts))`
   - `project_minute_counters(project_id INT, minute_utc INT, count INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(project_id, minute_utc))`
   - `alert_settings(project_id INT PK, enabled TINYINT(1) DEFAULT 0, discord_webhook VARCHAR(255) NULL, spike_n INT DEFAULT 5, spike_window_sec INT DEFAULT 60, error_rate_n INT DEFAULT 50, error_rate_window_sec INT DEFAULT 60, heartbeat_grace_sec INT DEFAULT 600, created_at TIMESTAMP, updated_at TIMESTAMP)`
   - (Optional) `fingerprints(project_id INT, fingerprint CHAR(40), last_seen DATETIME(3), last_alert DATETIME(3) NULL, count_1m INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(project_id, fingerprint))`

3) **Security & Rate Limiting**
   - Ingest requires valid `X-Project-Key` (sha256 hash stored) **and** HMAC signature with `HMAC_SECRET`.
   - Admin endpoints require `X-Admin-Token` equal to `ADMIN_TOKEN` env.
   - Rate limiting per IP and per project separately.
   - Input validation with Zod schemas.
   - Proper error handling and sanitization.

4) **TypeScript Structure**
   - Strong typing for all API endpoints and database models.
   - Zod schemas for request/response validation.
   - Proper error types and handling.
   - Service layer separation (database, alerts, validation).

5) **UI (minimal but functional)**
   - Single-page HTML (Vanilla JS with fetch API) served from same app.
   - Tabs: **Dashboard** (error rate, top fingerprints last hour), **Search** (filters + table + JSON expand), **Alerts** (enable/disable Discord + thresholds), **Projects** (list + create key/hash).
   - Each alert shows a link to a filtered search (project + fingerprint + last 60m).
   - Responsive design with clean, functional interface.

6) **Config & Environment**
   - `.env` keys (document in README):
     - `PORT`, `NODE_ENV`
     - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
     - `HMAC_SECRET`, `ADMIN_TOKEN`
     - `DEFAULT_RETENTION_DAYS` (3), `MAX_PAYLOAD_BYTES` (524288), `MAX_EVENTS_PER_POST` (250)
   - Validation of required environment variables on startup.
   - Graceful shutdown handling for database connections.

## Coding Tasks (in order)
1) **Setup TypeScript + Fastify** with proper project structure, types, and basic routing.
2) **Database layer** with connection pooling, query helpers, and migration system.
3) **Authentication middleware** for API keys and admin tokens.
4) **Rate limiting middleware** with per-project and per-IP limits.
5) **Core logging endpoints** with validation, HMAC verification, and batch processing.
6) **Query endpoints** with filtering and pagination.
7) **Admin endpoints** for maintenance and project management.
8) **Alert system** with Discord webhooks and threshold monitoring.
9) **UI implementation** with clean, functional interface.
10) **Testing** with comprehensive test coverage for critical paths.

## Acceptance Criteria
- Posting 300KB/200-event batch responds `<300ms` locally and `<1s` on Render.
- Rate limiting works: 429 returned when limits exceeded with proper `Retry-After` headers.
- HMAC validation prevents unauthorized log ingestion.
- Alerts fire correctly with suppression windows and proper formatting.
- Purge job maintains data integrity while cleaning old records.
- UI provides effective log searching and project management.
- All endpoints have proper TypeScript types and validation.
- Database connections are properly pooled and cleaned up.

## Style & Quality
- Use TypeScript strictly with proper types throughout.
- Implement proper error handling with structured error responses.
- Use prepared statements for all database queries.
- Keep business logic in service layers, not route handlers.
- Implement graceful shutdown and health checks.
- Follow REST conventions for API design.
- Use environment-based configuration with validation.
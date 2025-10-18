# Tekno Logger - AI Development Guide

## 🎯 Project Architecture

**Overflow logging service** - Backup for when primary logging providers (Sentry, Logtail) hit quotas. Built with Fastify + TypeScript + MySQL, designed for Render deployment with DreamHost MySQL.

### Core Design Pattern: Self-Triggering Maintenance
- **Key Innovation**: Maintenance runs during normal `/log` requests (every 5+ minutes), not via expensive cron jobs
- **Implementation**: Check `last_maintenance` timestamp in `/log` handler → fire async maintenance if >5min → continue processing logs
- **Critical**: Maintenance MUST be non-blocking (`setImmediate()` or similar) to avoid slowing log ingestion

## 🛠️ Development Workflow

### Essential Commands
```bash
npm run dev           # tsx watch src/index.ts (hot reload)
npm run migrate:dev   # tsx scripts/migrate.ts (dev DB setup)
npm run seed:dev      # tsx scripts/seed.ts (test data)
npm run build         # TypeScript compilation
npm run test          # Vitest testing
```

### Path Aliases (tsconfig.json)
Use `@/` imports consistently:
```typescript
import { validateLogEvent } from '@/services/logger';
import type { LogEvent } from '@/types';
```

## 🗂️ Architecture Layers

### Service Boundaries
- **`src/routes/`** - Pure HTTP handlers (thin, delegate to services)
- **`src/services/`** - Core business logic (database, alerts, logging)
- **`src/middleware/`** - Cross-cutting concerns (auth, rate limiting)
- **`src/types/`** - Shared TypeScript definitions

### Critical Integration Points

#### 1. HMAC Authentication (`src/middleware/auth.ts`)
- **Validate against RAW request body**, not parsed JSON
- **Two-factor auth**: `X-Project-Key` (project lookup) + `X-Signature` (HMAC verification)
- Admin routes use separate `X-Admin-Token` header

#### 2. Rate Limiting (`src/middleware/rateLimit.ts`)
- **Dual limits**: Per-project (5000/min) AND per-IP (100/min)
- **Storage**: `project_minute_counters` table with `minute_utc` (Unix timestamp truncated)
- **Return**: 429 with `Retry-After: 60` header when exceeded

#### 3. Database Layer (`src/services/database.ts`)
- **Connection pooling**: min 2, max 10 (DreamHost shared hosting limits)
- **Bulk inserts**: Single multi-row statement for log batches
- **Prepared statements**: ALL queries must use parameterized queries

## 📊 Data Flow Patterns

### Log Ingestion Flow
```
POST /log → auth middleware → rate limit → bulk validation → fingerprint calc → bulk DB insert → async maintenance check
```

### Key Calculations
- **day_id**: `YYYYMMDD` format for efficient purging
- **fingerprint**: `SHA1(message + source + ctx.stack?)` - use for deduplication
- **minute_utc**: `Math.floor(Date.now() / 1000 / 60)` for rate limiting

### Self-Maintenance Trigger (Critical Pattern)
```typescript
// In POST /log handler after successful log processing
if (shouldRunMaintenance()) {
  setImmediate(async () => {
    try {
      await runMaintenanceTasks();
    } catch (error) {
      // Log but don't fail the request
    }
  });
}
```

## 🔧 Project-Specific Conventions

### Environment Configuration
- **Zod validation** in `src/config.ts` - fail fast on startup if env vars missing
- **Required vars**: DB credentials, HMAC_SECRET, ADMIN_TOKEN
- **Limits**: MAX_PAYLOAD_BYTES (524288), MAX_EVENTS_PER_POST (250)

### Error Handling
- **Never throw** in maintenance tasks (use try/catch, log errors)
- **Return 429** for rate limits with proper headers
- **Structured responses**: `{ error: string, code?: string }` format

### TypeScript Patterns
- **Strict mode** enabled - no `any` types allowed
- **Zod schemas** for all request/response validation
- **Path aliases** mandatory for imports
- **Explicit return types** on all functions (ESLint enforced)

## 🚨 Critical Constraints

### Performance Requirements
- **<300ms** response for 300KB/200-event batch locally
- **<1s** response on Render deployment
- **Non-blocking** maintenance execution

### Security Requirements
- **HMAC verification** prevents log injection attacks
- **SQL injection prevention** via prepared statements only
- **Input validation** - validate payload sizes before processing

### Deployment Specifics
- **Render + DreamHost MySQL** - connection pooling essential
- **Graceful shutdown** - close DB connections properly
- **Health checks** at `/healthz` - must check DB connectivity

## 🎨 Frontend Integration

### Vanilla JS SPA (`public/`)
- **Class-based** architecture (`TeknoLogger` main class)
- **Tab navigation** with `data-tab` attributes
- **API calls** via fetch with proper error handling
- **No framework** - vanilla JS with modern ES6+ patterns

Use this guide to maintain consistency with the established patterns and architectural decisions.
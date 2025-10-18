# PROJECT PLAN: Tekno Logger

> **Minimal overflow logging service for backup logging and debugging**  
> A production-ready service to catch logs when primary providers exceed quota, with 24-72h retention and Discord alerts.

## 📋 Development Checklist

### Phase 1: Core Infrastructure ⚡
- [ ] **Environment Configuration**
  - [ ] Implement `src/config.ts` with Zod validation for all env vars
  - [ ] Add startup validation that fails fast on missing required config
  - [ ] Create environment-specific configs (dev/staging/prod)

- [ ] **Database Layer**
  - [ ] Create `migrations/001_initial_schema.sql` with all required tables
  - [ ] Implement `src/services/database.ts` with connection pooling
  - [ ] Add database health checks and reconnection logic
  - [ ] Create migration runner script in `scripts/migrate.ts`

- [ ] **TypeScript Foundation**
  - [ ] Define all types in `src/types/index.ts` (LogEvent, Project, etc.)
  - [ ] Create Zod schemas for request/response validation
  - [ ] Set up path aliases and ensure clean imports

### Phase 2: Core API 🛠️
- [ ] **Application Bootstrap**
  - [ ] Implement `src/app.ts` Fastify application factory
  - [ ] Add graceful shutdown handling in `src/index.ts`
  - [ ] Configure middleware pipeline (CORS, helmet, etc.)

- [ ] **Authentication Middleware**
  - [ ] Implement HMAC signature verification in `src/middleware/auth.ts`
  - [ ] Add API key validation for projects
  - [ ] Create admin token authentication

- [ ] **Rate Limiting**
  - [ ] Implement per-project rate limiting in `src/middleware/rateLimit.ts`
  - [ ] Add per-IP rate limiting
  - [ ] Store and track minute-based counters

- [ ] **Core Logging Endpoints**
  - [ ] Implement `POST /log` in `src/routes/logs.ts`
    - [ ] Validate payload size (≤512KB) and event count (≤250)
    - [ ] Process gzip compression if present
    - [ ] Compute fingerprint (SHA1 of message + source + stack)
    - [ ] Bulk insert with single multi-row statement
  - [ ] Implement `GET /logs` query endpoint in `src/routes/query.ts`
  - [ ] Implement `GET /logs/:id` single event endpoint

### Phase 3: System Endpoints 📊
- [ ] **Health & Metrics**
  - [ ] Implement `GET /healthz` in `src/routes/system.ts`
  - [ ] Add `GET /metrics` with basic service stats
  - [ ] Include database connectivity checks

- [ ] **Self-Triggering Maintenance**
  - [ ] Add maintenance state tracking (last run timestamp, in-progress flag)
  - [ ] Implement smart triggering in `/log` endpoint (check every request)
  - [ ] Create maintenance tasks: cleanup counters, health checks
  - [ ] Ensure maintenance runs async (non-blocking for log ingestion)

- [ ] **Admin Endpoints**
  - [ ] Implement project CRUD in `src/routes/admin.ts`
  - [ ] Add `POST /admin/maintain` (manual trigger fallback)
  - [ ] Add `POST /admin/purge` (manual daily cleanup)
  - [ ] Secure all admin routes with admin token

- [ ] **Configuration Endpoint**
  - [ ] Implement `GET /config` for client sampling defaults
  - [ ] Add 5-minute caching for performance

### Phase 4: Alert System 🔔
- [ ] **Discord Integration**
  - [ ] Implement Discord webhook service in `src/services/alerts.ts`
  - [ ] Add spike detection (N events in X seconds)
  - [ ] Add error rate monitoring
  - [ ] Implement suppression windows (15-minute cooldowns)

- [ ] **Alert Management**
  - [ ] Create alert settings CRUD endpoints
  - [ ] Add test alert functionality
  - [ ] Include alert links to filtered log searches

### Phase 5: User Interface 🎨
- [ ] **Frontend Integration**
  - [ ] Serve static files from `public/` directory
  - [ ] Wire up API calls in `public/js/app.js`
  - [ ] Test all dashboard functionality

- [ ] **Dashboard Features**
  - [ ] Error rate display (last hour)
  - [ ] Total events counter
  - [ ] Top fingerprints list
  - [ ] Recent errors feed

- [ ] **Search Interface**
  - [ ] Project filter dropdown
  - [ ] Level filter (debug/info/warn/error/fatal)
  - [ ] Message search with LIKE queries
  - [ ] Time range filtering
  - [ ] Result pagination

### Phase 6: Production Readiness 🚀
- [ ] **Testing**
  - [ ] Write unit tests for core services
  - [ ] Add integration tests for API endpoints
  - [ ] Test rate limiting and security
  - [ ] Performance test with 300KB/200-event batches
  - [ ] Test self-triggering maintenance under load

- [ ] **Deployment Preparation**
  - [ ] Validate `render.yaml` configuration
  - [ ] Verify environment variable setup
  - [ ] Test database migrations on fresh instance
  - [ ] Verify self-maintenance works in production

- [ ] **Documentation**
  - [ ] Update README.md with deployment steps and maintenance approach
  - [ ] Document manual admin endpoints as fallbacks

## 🎯 Success Criteria

### Performance Targets
- [ ] **Local Response Times**: 300KB/200-event batch responds <300ms
- [ ] **Render Response Times**: Same batch responds <1s on Render
- [ ] **Rate Limiting**: 429 responses with proper `Retry-After` headers
- [ ] **Database Performance**: Bulk inserts handle 250 events efficiently

### Security Validation
- [ ] **HMAC Security**: Signature verification prevents unauthorized ingestion
- [ ] **Rate Protection**: Per-project and per-IP limits work correctly
- [ ] **Admin Security**: Admin endpoints require valid tokens
- [ ] **Input Validation**: All endpoints reject malformed requests

### Alert System Testing
- [ ] **Spike Detection**: 5 identical errors in 60s trigger ONE Discord alert
- [ ] **Suppression**: Subsequent alerts suppressed for 15m with count tracking
- [ ] **Error Rates**: High error rate thresholds trigger correctly
- [ ] **Test Alerts**: Manual test alert functionality works

### Data Management & Self-Maintenance
- [ ] **Self-Triggering**: Maintenance runs automatically during normal traffic (every 5+ minutes)
- [ ] **Non-Blocking**: Maintenance doesn't slow down log ingestion responses
- [ ] **Retention**: Manual purge removes data older than retention period
- [ ] **Data Integrity**: Fresh data remains intact after purge
- [ ] **Fallback**: Manual admin endpoints work when self-maintenance fails
- [ ] **Migration**: Database schema creates successfully on fresh instance

## 📚 Documentation (Minimal)

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | Project overview & deployment | ✅ Complete |
| `PROJECT_PLAN.md` | Development checklist (this file) | ✅ Complete |
| `.env.example` | Environment configuration template | ✅ Complete |

## 🔄 Development Workflow

### Daily Development
1. **Start with**: Environment setup and database connection
2. **Build incrementally**: One endpoint at a time with tests
3. **Test frequently**: Use provided test scripts and manual verification
4. **Commit often**: Small, focused commits with clear messages

### Testing Strategy
```bash
npm run test          # Unit tests
npm run test:coverage # Coverage report
npm run dev           # Local development server
npm run lint          # Code quality checks
```

### Deployment Process
1. **Local testing**: Verify all features work with sample data
2. **Environment prep**: Set up Render + DreamHost services
3. **Initial deploy**: Push to Render with environment variables
4. **Data setup**: Run migrations and create initial project
5. **Monitoring**: Verify health checks and self-triggering maintenance

## � Self-Triggering Maintenance Strategy

### Core Implementation
- **Trigger Point**: Check maintenance needed on every `/log` request
- **Timing**: Run maintenance if last run >5 minutes ago
- **Execution**: Fire-and-forget async execution (don't block log response)
- **State Tracking**: Store `last_maintenance` timestamp and `in_progress` flag
- **Safety**: Skip if maintenance already running

### Maintenance Tasks (Quick Operations)
```typescript
async function runMaintenance() {
  // 1. Cleanup expired minute counters (older than 2 hours)
  // 2. Update maintenance timestamp
  // 3. Basic health checks
  // 4. Clear old fingerprint counts
  // Total execution time: <30 seconds
}
```

### Purge Strategy
- **Manual Trigger**: `POST /admin/purge` when convenient
- **Frequency**: Daily or as-needed basis
- **Alternative**: Smart daily check (first request each day triggers purge)

### Benefits
- ✅ **Zero external costs** (no GitHub Actions/cron services)
- ✅ **Self-healing** system that maintains itself
- ✅ **Traffic-responsive** (busy periods = more frequent maintenance)
- ✅ **No external dependencies** to fail

## �🚨 Critical Implementation Notes

### Database Considerations
- **Connection Pooling**: Use min 2, max 10 connections for DreamHost
- **Query Optimization**: Always use prepared statements
- **Bulk Operations**: Single multi-row inserts for log batches
- **Index Strategy**: Ensure queries use project_id + timestamp indexes

### Security Requirements
- **HMAC Verification**: Validate against raw request body, not parsed JSON
- **Rate Limiting**: Implement sliding window for accurate per-minute counts
- **SQL Injection**: Use parameterized queries exclusively
- **Input Validation**: Validate all input sizes and types strictly

### Performance Optimization
- **Fingerprint Computation**: Cache expensive SHA1 operations where possible
- **Batch Processing**: Process log arrays efficiently without N+1 queries
- **Memory Usage**: Stream large payloads, don't load everything into memory
- **Response Time**: Optimize for sub-second response times under load

---

**🎯 Goal**: Production-ready overflow logging service that reliably handles backup logging needs with professional-grade security, performance, and maintainability.
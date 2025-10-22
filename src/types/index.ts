import { z } from 'zod';

// ===== CORE DOMAIN TYPES =====

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEvent {
  ts?: string; // ISO 8601 timestamp, optional (defaults to current time)
  level: LogLevel;
  message: string;
  source?: string; // e.g., "api.database", "worker.processor" - defaults to project slug
  env?: string; // e.g., "production", "staging", "development" - defaults to "production"
  ctx?: Record<string, unknown>; // JSON context object
  user_id?: string;
  request_id?: string;
  tags?: string; // Comma-separated tags
}

export interface StoredLogEvent extends LogEvent {
  id: number;
  project_id: number;
  day_id: number; // YYYYMMDD format for efficient purging
  fingerprint: string; // SHA1 hash for deduplication
  ctx_json?: string; // Serialized JSON
  created_at: Date;
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  api_key_hash: string; // SHA256 hash of API key
  retention_days: number;
  minute_cap: number; // Rate limit per minute
  default_sample_json?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface AlertSettings {
  project_id: number;
  enabled: boolean;
  discord_webhook?: string;
  spike_n: number; // Number of events to trigger spike alert
  spike_window_sec: number; // Time window for spike detection
  error_rate_n: number; // Number of errors to trigger rate alert
  error_rate_window_sec: number; // Time window for error rate
  heartbeat_grace_sec: number; // Grace period for heartbeat alerts
  created_at: Date;
  updated_at: Date;
}

export interface ProjectMinuteCounter {
  project_id: number;
  minute_utc: number; // Unix timestamp truncated to minute
  count: number;
  created_at: Date;
}

export interface FingerprintTracker {
  project_id: number;
  fingerprint: string;
  last_seen: Date;
  last_alert?: Date;
  count_1m: number; // Rolling 1-minute count
  created_at: Date;
}

// ===== ZOD VALIDATION SCHEMAS =====

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'fatal']);

export const logEventSchema = z.object({
  ts: z.string().datetime().optional(), // ISO 8601 format, defaults to current time
  level: logLevelSchema,
  message: z.string().min(1).max(1024),
  source: z.string().min(1).max(64).optional(), // Defaults to project slug
  env: z.string().min(1).max(32).optional(), // Defaults to 'production'
  ctx: z.record(z.unknown()).optional(),
  user_id: z.string().max(64).optional(),
  request_id: z.string().max(64).optional(),
  tags: z.string().max(128).optional(),
});

export const logBatchSchema = z.array(logEventSchema).min(1).max(250);

export const projectCreateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  retention_days: z.number().int().min(1).max(30).default(3),
  minute_cap: z.number().int().min(1).default(5000),
});

export const alertSettingsSchema = z.object({
  enabled: z.boolean(),
  discord_webhook: z.string().url().optional(),
  spike_n: z.number().int().min(1).default(5),
  spike_window_sec: z.number().int().min(1).default(60),
  error_rate_n: z.number().int().min(1).default(50),
  error_rate_window_sec: z.number().int().min(1).default(60),
  heartbeat_grace_sec: z.number().int().min(1).default(600),
});

// ===== API REQUEST/RESPONSE TYPES =====

export interface LogIngestionRequest {
  events: LogEvent[];
}

export interface LogIngestionResponse {
  accepted: number;
  rejected: number;
  errors?: string[];
}

export interface LogQueryParams {
  project_id?: number;
  level?: LogLevel;
  fingerprint?: string;
  q?: string; // Message search query
  from?: string; // ISO timestamp  
  to?: string; // ISO timestamp
  limit?: number;
  offset?: number;
}

export interface LogQueryResponse {
  logs: StoredLogEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface HealthCheckResponse {
  ok: boolean;
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected' | 'error';
  version: string;
}

export interface MetricsResponse {
  requests_total: number;
  requests_per_minute: number;
  errors_total: number;
  error_rate: number;
  database_connections: number;
  maintenance_last_run?: string;
}

export interface ProjectStatsResponse {
  errorRate: number; // Percentage
  totalEvents: number;
  topFingerprint: string | null;
}

// ===== ERROR TYPES =====

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
    public code?: string
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public query?: string,
    public code?: string
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// ===== UTILITY TYPES =====

export interface MaintenanceState {
  last_maintenance: Date;
  last_purge: Date;
  maintenance_in_progress: boolean;
}

export interface ServiceMetrics {
  startTime: Date;
  requestCount: number;
  errorCount: number;
  lastMaintenanceRun?: Date;
  databaseConnectionsActive: number;
}

// Type helper for database query results
export type DatabaseRow = Record<string, unknown>;

// Type helper for API error responses
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}
import { createHash } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { appConfig } from '@/config';
import { executeInsert, executeBulkInsert, executeQuerySingle, executeQuery } from '@/services/database';
import { cleanupExpiredCounters, purgeOldLogs } from '@/services/database';
import { cleanupExpiredRateLimitCounters } from '@/middleware/rateLimit';
import { logBatchSchema, type LogEvent, ValidationError, AuthenticationError } from '@/types';
import { createHmac, timingSafeEqual } from 'crypto';

// Self-triggering maintenance state
let lastMaintenanceTime = 0;
const MAINTENANCE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Log routes plugin
 */
const logsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/log - Bulk log ingestion endpoint
  fastify.post('/log', {
    schema: {
      body: {
        type: 'object',
        properties: {
          events: { 
            type: 'array',
            items: { type: 'object' },
            minItems: 1,
            maxItems: 250
          }
        },
        required: ['events']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            received: { type: 'number' },
            processed: { type: 'number' },
            requestId: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      // TEMPORARY: Inline authentication since middleware isn't working
      const headers = request.headers as any;
      const projectKey = headers['x-project-key'];
      const signature = headers['x-signature'];
      
      request.log.info({ projectKey: projectKey?.slice(0, 10), hasSignature: !!signature }, 'Auth headers received');
      
      // Validate required headers
      if (!projectKey) {
        request.log.warn('Missing project key');
        throw new AuthenticationError('Project key required', 'PROJECT_KEY_MISSING');
      }
      
      if (!signature) {
        request.log.warn('Missing signature');
        throw new AuthenticationError('Signature required', 'SIGNATURE_MISSING');
      }
      
      // Look up project in database using API key hash
      const apiKeyHash = createHash('sha256').update(projectKey).digest('hex');
      request.log.info({ apiKeyHash: apiKeyHash.slice(0, 8) }, 'Looking up project');
      
      const project = await executeQuerySingle<{
        id: number;
        slug: string;
        name: string;
        api_key_hash: string;
      }>('SELECT id, slug, name, api_key_hash FROM projects WHERE api_key_hash = ? LIMIT 1', [apiKeyHash]);
      
      request.log.info({ projectFound: !!project }, 'Project lookup result');
      
      if (!project) {
        request.log.warn({ apiKeyHash: apiKeyHash.slice(0, 8) }, 'Project not found');
        throw new AuthenticationError('Invalid project key', 'PROJECT_NOT_FOUND');
      }
      
      // Verify HMAC signature against raw request body
      const rawBody = request.rawBody || JSON.stringify(request.body);
      request.log.info({ rawBodyLength: rawBody.length, hasRawBody: !!request.rawBody }, 'Verifying HMAC');
      
      const expectedSignature = createHmac('sha256', appConfig.security.hmacSecret)
        .update(rawBody)
        .digest('hex');
      
      request.log.info({ 
        expectedSig: expectedSignature.slice(0, 8),
        receivedSig: signature.slice(0, 8)
      }, 'HMAC comparison');
      
      if (!timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      )) {
        request.log.warn('HMAC signature mismatch');
        throw new AuthenticationError('Invalid signature', 'SIGNATURE_INVALID');
      }
      
      // Set project on request (simulate middleware behavior)
      request.project = {
        id: project.id,
        key: projectKey,
        slug: project.slug,
        name: project.name,
        isActive: true
      };
      
      request.log.info({ projectId: project.id }, 'Authentication successful');
    } catch (error) {
      request.log.error({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error?.constructor?.name
      }, 'Authentication error in inline auth');
      
      // Re-throw authentication errors
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      // Wrap other errors as authentication errors
      throw new AuthenticationError(
        error instanceof Error ? error.message : 'Authentication failed',
        'AUTH_ERROR'
      );
    }
    
    // Continue with normal processing
    // Validate authenticated project
    if (!request.project) {
      request.log.error('Project not set after authentication');
      throw new ValidationError('Project authentication required', 'PROJECT_REQUIRED');
    }

    const { events } = request.body as { events: LogEvent[] };
    
    // Validate events using Zod schema
    try {
      logBatchSchema.parse(events);
    } catch (error) {
      request.log.error({ 
        validationError: error,
        sampleEvent: events[0]
      }, 'Event validation failed');
      throw new ValidationError(
        `Invalid event data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INVALID_EVENT_DATA'
      );
    }
    
    // Validate payload limits
    if (events.length > appConfig.limits.maxEventsPerPost) {
      throw new ValidationError(
        `Too many events: ${events.length}/${appConfig.limits.maxEventsPerPost}`,
        'TOO_MANY_EVENTS'
      );
    }
    
    // Process events for bulk insert
    const processedEvents = await processLogEvents(events, request.project.id, request.project.slug);
    
    request.log.info({
      processedCount: processedEvents.length,
      firstEvent: processedEvents[0]
    }, 'Events processed');
    
    // Bulk insert logs
    if (processedEvents.length > 0) {
      await bulkInsertLogs(processedEvents);
      request.log.info({ insertedCount: processedEvents.length }, 'Bulk insert completed');
    }
    
    // Self-triggering maintenance (NON-BLOCKING)
    checkAndTriggerMaintenance(fastify.log);
    
    const processingTime = Date.now() - startTime;
    
    fastify.log.info({
      requestId,
      projectId: request.project.id,
      projectKey: request.project.key,
      received: events.length,
      processed: processedEvents.length,
      processingTime,
      ip: request.clientIp
    }, 'Log batch processed');
    
    return {
      received: events.length,
      processed: processedEvents.length,
      requestId
    };
  });
  
  // GET /api/log - Query logs (basic endpoint for debugging)
  fastify.get('/log', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 100, maximum: 1000 },
          offset: { type: 'number', default: 0 },
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          since: { type: 'string' }, // ISO date string
        }
      }
    }
  }, async (request, reply) => {
    if (!request.project) {
      throw new ValidationError('Project authentication required', 'PROJECT_REQUIRED');
    }
    
    const { limit, offset, level, since } = request.query as any;
    
    // Build query
    let query = `
      SELECT id, level, message, source, ctx_json as context, fingerprint, created_at, day_id
      FROM logs 
      WHERE project_id = ?
    `;
    const params: any[] = [request.project.id];
    
    if (level) {
      query += ` AND level = ?`;
      params.push(level);
    }
    
    if (since) {
      query += ` AND created_at >= ?`;
      params.push(new Date(since));
    }
    
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const logs = await executeQuery(query, params);
    
    return {
      logs,
      limit,
      offset,
      total: logs.length
    };
  });
};

/**
 * Process log events for database insertion
 */
async function processLogEvents(events: LogEvent[], projectId: number, projectSlug: string): Promise<Array<{
  project_id: number;
  ts: Date;
  level: string;
  message: string;
  source: string;
  env: string;
  context: Record<string, unknown> | null;
  user_id: string | null;
  request_id: string | null;
  tags: string | null;
  fingerprint: string;
  day_id: number;
  created_at: Date;
}>> {
  const currentTime = new Date();
  const dayId = getDayId(currentTime);
  
  return events.map(event => ({
    project_id: projectId,
    ts: event.ts ? new Date(event.ts) : currentTime,
    level: event.level,
    message: event.message.substring(0, 1024), // Truncate to schema limit
    source: (event.source || projectSlug).substring(0, 64), // Default to project slug, truncate to schema limit
    env: (event.env || 'production').substring(0, 32), // Default to production, truncate to schema limit
    context: event.ctx || null,
    user_id: event.user_id?.substring(0, 64) || null,
    request_id: event.request_id?.substring(0, 64) || null,
    tags: event.tags?.substring(0, 128) || null,
    fingerprint: calculateLogFingerprint(event),
    day_id: dayId,
    created_at: currentTime
  }));
}

/**
 * Calculate log fingerprint for deduplication
 */
function calculateLogFingerprint(event: LogEvent): string {
  // Create fingerprint from message + source + stack trace (if present)
  const fingerprintData = [
    event.message,
    event.source || '',
    event.ctx?.stack || ''
  ].join('|');
  
  return createHash('sha1')
    .update(fingerprintData, 'utf8')
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for space efficiency
}

/**
 * Get day ID in YYYYMMDD format for efficient purging
 */
function getDayId(date: Date): number {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return parseInt(`${year}${month}${day}`, 10);
}

/**
 * Bulk insert processed log events
 */
async function bulkInsertLogs(events: any[]): Promise<void> {
  if (events.length === 0) return;
  
  const query = `
    INSERT INTO logs (project_id, ts, level, message, source, env, ctx_json, user_id, request_id, tags, fingerprint, day_id, created_at)
    VALUES 
  `;
  
  const values = events.map(event => [
    event.project_id,
    event.ts,
    event.level,
    event.message,
    event.source,
    event.env,
    event.context ? JSON.stringify(event.context) : null,
    event.user_id,
    event.request_id,
    event.tags,
    event.fingerprint,
    event.day_id,
    event.created_at
  ]);
  
  await executeBulkInsert(query, values);
}

/**
 * CRITICAL: Self-triggering maintenance pattern
 * Runs maintenance tasks during normal log requests to avoid expensive cron jobs
 */
function checkAndTriggerMaintenance(logger: any): void {
  const now = Date.now();
  
  // Check if maintenance should run (every 5+ minutes)
  if (now - lastMaintenanceTime < MAINTENANCE_INTERVAL) {
    return; // Too soon
  }
  
  // Update maintenance timestamp immediately to prevent concurrent runs
  lastMaintenanceTime = now;
  
  // Run maintenance asynchronously (NON-BLOCKING)
  setImmediate(async () => {
    try {
      await runMaintenanceTasks(logger);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ error: errorMsg, stack: errorStack }, 'Maintenance task failed');
      // Don't throw - maintenance failures shouldn't affect log ingestion
    }
  });
}

/**
 * Run all maintenance tasks
 */
async function runMaintenanceTasks(logger: any): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting self-triggered maintenance');
  
  try {
    // 1. Clean expired rate limit counters
    const expiredCounters = await cleanupExpiredRateLimitCounters();
    
    // 2. Clean expired database counters (project activity tracking)
    const expiredDbCounters = await cleanupExpiredCounters();
    
    // 3. Purge old logs beyond retention period
    const purgedLogs = await purgeOldLogs(appConfig.limits.retentionDays);
    
    const duration = Date.now() - startTime;
    
    logger.info({
      duration,
      expiredCounters,
      expiredDbCounters,
      purgedLogs
    }, 'Maintenance completed successfully');
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({ 
      error: errorMsg, 
      stack: errorStack,
      duration: Date.now() - startTime 
    }, 'Maintenance task failed');
    
    throw error;
  }
}

export default logsRoutes;
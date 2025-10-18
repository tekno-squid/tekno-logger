import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { appConfig } from '@/config';
import { executeQuery, executeQuerySingle } from '@/services/database';
import { RateLimitError } from '@/types';

interface RateLimit {
  type: 'project' | 'ip';
  key: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Database-backed rate limiting plugin
 * 
 * Implements two-tier rate limiting:
 * 1. Per-project: 5000 requests per minute (configured)
 * 2. Per-IP: 100 requests per minute (configured)
 * 
 * Uses minute-based windows stored in database for persistence across restarts
 */
export const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip rate limiting for health checks and static files
    if (request.url === '/healthz' || request.url.startsWith('/static/')) {
      return;
    }

    // Apply rate limits
    await checkRateLimit(request, reply);
  });
};

/**
 * Check both project and IP rate limits
 */
async function checkRateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const currentMinute = getCurrentMinute();
  
  // Check IP rate limit (always applied)
  await checkIpRateLimit(request, reply, currentMinute);
  
  // Check project rate limit (only for authenticated requests)
  if (request.project) {
    await checkProjectRateLimit(request, reply, currentMinute);
  }
}

/**
 * Check IP-based rate limit
 */
async function checkIpRateLimit(request: FastifyRequest, reply: FastifyReply, minuteUtc: number): Promise<void> {
  const ip = request.clientIp || 'unknown';
  const limit = appConfig.limits.rateLimit.perIP;
  
  const count = await incrementCounter('ip', ip, minuteUtc);
  
  if (count > limit) {
    request.log.warn({ 
      ip, 
      count, 
      limit, 
      minute: minuteUtc 
    }, 'IP rate limit exceeded');
    
    reply.header('Retry-After', '60');
    throw new RateLimitError(`IP rate limit exceeded: ${count}/${limit} per minute`, 60, 'IP_RATE_LIMIT_EXCEEDED');
  }
  
  // Add rate limit headers
  reply.header('X-RateLimit-Limit-IP', limit.toString());
  reply.header('X-RateLimit-Remaining-IP', Math.max(0, limit - count).toString());
  reply.header('X-RateLimit-Reset-IP', ((minuteUtc + 1) * 60).toString());
}

/**
 * Check project-based rate limit
 */
async function checkProjectRateLimit(request: FastifyRequest, reply: FastifyReply, minuteUtc: number): Promise<void> {
  const projectId = request.project?.id;
  const limit = appConfig.limits.rateLimit.perProject;
  
  if (!projectId) {
    return; // No project authenticated
  }
  
  const count = await incrementCounter('project', projectId.toString(), minuteUtc);
  
  if (count > limit) {
    request.log.warn({ 
      projectId, 
      projectKey: request.project?.key,
      count, 
      limit, 
      minute: minuteUtc 
    }, 'Project rate limit exceeded');
    
    reply.header('Retry-After', '60');
    throw new RateLimitError(`Project rate limit exceeded: ${count}/${limit} per minute`, 60, 'PROJECT_RATE_LIMIT_EXCEEDED');
  }
  
  // Add rate limit headers
  reply.header('X-RateLimit-Limit-Project', limit.toString());
  reply.header('X-RateLimit-Remaining-Project', Math.max(0, limit - count).toString());
  reply.header('X-RateLimit-Reset-Project', ((minuteUtc + 1) * 60).toString());
}

/**
 * Increment rate limit counter for given type/key/minute
 * Returns the current count after increment
 */
async function incrementCounter(type: 'project' | 'ip', key: string, minuteUtc: number): Promise<number> {
  // Use INSERT ... ON DUPLICATE KEY UPDATE for atomic increment
  await executeQuery(`
    INSERT INTO project_minute_counters (type, key_value, minute_utc, count)
    VALUES (?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE count = count + 1
  `, [type, key, minuteUtc]);
  
  // Get the current count
  const result = await executeQuerySingle<{ count: number }>(`
    SELECT count FROM project_minute_counters 
    WHERE type = ? AND key_value = ? AND minute_utc = ?
  `, [type, key, minuteUtc]);
  
  return result?.count || 1;
}

/**
 * Get current UTC minute as Unix timestamp
 * Used as the time window for rate limiting
 */
function getCurrentMinute(): number {
  return Math.floor(Date.now() / 1000 / 60);
}

/**
 * Clean up expired rate limit counters (called by maintenance)
 */
export async function cleanupExpiredRateLimitCounters(): Promise<number> {
  // Remove counters older than 2 minutes (current + 1 buffer)
  const cutoffMinute = getCurrentMinute() - 2;
  
  const result = await executeQuery(`
    DELETE FROM project_minute_counters 
    WHERE minute_utc < ?
  `, [cutoffMinute]);
  
  return (result as any).affectedRows ?? 0;
}

/**
 * Get current rate limit status for a project/IP (for monitoring)
 */
export async function getRateLimitStatus(type: 'project' | 'ip', key: string): Promise<{
  currentCount: number;
  limit: number;
  resetTime: number;
  remaining: number;
}> {
  const currentMinute = getCurrentMinute();
  const limit = type === 'project' 
    ? appConfig.limits.rateLimit.perProject 
    : appConfig.limits.rateLimit.perIP;
  
  const result = await executeQuerySingle<{ count: number }>(`
    SELECT count FROM project_minute_counters 
    WHERE type = ? AND key_value = ? AND minute_utc = ?
  `, [type, key, currentMinute]);
  
  const currentCount = result?.count || 0;
  
  return {
    currentCount,
    limit,
    resetTime: (currentMinute + 1) * 60, // Next minute in Unix timestamp
    remaining: Math.max(0, limit - currentCount)
  };
}

// Export plugin as default
export default rateLimitPlugin;
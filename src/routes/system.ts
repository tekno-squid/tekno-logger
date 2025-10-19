import type { FastifyPluginAsync } from 'fastify';
import { appConfig } from '@/config';
import { testConnection, executeQuerySingle } from '@/services/database';
import { getRateLimitStatus } from '@/middleware/rateLimit';

/**
 * System health and status routes plugin
 */
const systemRoutes: FastifyPluginAsync = async (fastify) => {
  
  // GET /api/health - Enhanced health check with database connectivity
  fastify.get('/health', async (request, reply) => {
    const startTime = Date.now();
    const health: any = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: {
        name: appConfig.service.name,
        version: appConfig.service.version,
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: appConfig.isDevelopment ? 'development' : 'production'
      },
      checks: {}
    };

    // Database connectivity check
    try {
      await testConnection();
      health.checks.database = {
        status: 'healthy',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      health.status = 'degraded';
      health.checks.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Memory usage check
    const memUsage = process.memoryUsage();
    health.checks.memory = {
      status: memUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'warning', // 500MB threshold
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024) // MB
    };

    health.responseTime = Date.now() - startTime;

    const statusCode = health.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(health);
  });

  // GET /api/stats - Basic service statistics
  fastify.get('/stats', async (request, reply) => {
    const stats: any = {
      timestamp: new Date().toISOString(),
      service: {
        name: appConfig.service.name,
        version: appConfig.service.version,
        uptime: process.uptime()
      }
    };

    try {
      // Get total log count (last 24 hours)
      const dayId = getCurrentDayId();
      const logStats = await executeQuerySingle<{
        total_logs: number;
        total_projects: number;
        total_errors: number;
      }>(`
        SELECT 
          COUNT(*) as total_logs,
          COUNT(DISTINCT project_id) as total_projects,
          SUM(CASE WHEN level IN ('error', 'fatal') THEN 1 ELSE 0 END) as total_errors
        FROM logs 
        WHERE day_id >= ?
      `, [dayId]);

      stats.logs = {
        last24h: logStats?.total_logs || 0,
        errors: logStats?.total_errors || 0,
        activeProjects: logStats?.total_projects || 0
      };

      // Get rate limit status for demonstration (using a dummy project ID)
      if (request.project) {
        const rateLimitStatus = await getRateLimitStatus('project', request.project.id.toString());
        stats.rateLimit = {
          projectLimit: rateLimitStatus.limit,
          projectRemaining: rateLimitStatus.remaining,
          resetTime: rateLimitStatus.resetTime
        };
      }

    } catch (error) {
      fastify.log.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get stats');
      stats.error = 'Unable to retrieve statistics';
    }

    return stats;
  });

  // GET /api/projects - List projects (authenticated)
  fastify.get('/projects', async (request, reply) => {
    // Only return current project info for authenticated requests
    if (!request.project) {
      throw new Error('Authentication required');
    }

    try {
      const project = await executeQuerySingle<{
        id: number;
        key: string;
        name: string;
        is_active: boolean;
        created_at: Date;
      }>(`
        SELECT id, key, name, is_active, created_at
        FROM projects 
        WHERE id = ?
      `, [request.project.id]);

      if (!project) {
        throw new Error('Project not found');
      }

      // Get recent log stats for this project
      const dayId = getCurrentDayId();
      const logStats = await executeQuerySingle<{
        total_logs: number;
        error_count: number;
        last_log_at: Date | null;
      }>(`
        SELECT 
          COUNT(*) as total_logs,
          SUM(CASE WHEN level IN ('error', 'fatal') THEN 1 ELSE 0 END) as error_count,
          MAX(created_at) as last_log_at
        FROM logs 
        WHERE project_id = ? AND day_id >= ?
      `, [request.project.id, dayId]);

      return {
        project: {
          id: project.id,
          key: project.key,
          name: project.name,
          isActive: project.is_active,
          createdAt: project.created_at
        },
        stats: {
          logsLast24h: logStats?.total_logs || 0,
          errorsLast24h: logStats?.error_count || 0,
          lastLogAt: logStats?.last_log_at || null
        }
      };

    } catch (error) {
      fastify.log.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get project info');
      throw error;
    }
  });
};

/**
 * Get current day ID in YYYYMMDD format
 */
function getCurrentDayId(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return parseInt(`${year}${month}${day}`, 10);
}

export default systemRoutes;
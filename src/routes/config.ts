import type { FastifyPluginAsync } from 'fastify';
import { executeQuery } from '@/services/database';
import { appConfig } from '@/config';

// Cache for configuration response (5-minute cache)
let configCache: {
  data: any;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Configuration endpoint for client sampling defaults
 * Returns service configuration and project defaults
 */
export const configRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /config - Get service configuration for clients
   * Cached for 5 minutes for performance
   */
  fastify.get('/config', async (request, reply) => {
    try {
      const now = Date.now();
      
      // Return cached data if still valid
      if (configCache && (now - configCache.timestamp) < CACHE_DURATION) {
        return configCache.data;
      }

      // Get project count and basic stats
      const projectStats = await executeQuery(`
        SELECT 
          COUNT(*) as total_projects,
          AVG(retention_days) as avg_retention_days,
          AVG(minute_cap) as avg_minute_cap
        FROM projects
      `);

      const stats = projectStats[0] as any;

      // Build configuration response
      const config = {
        service: {
          name: appConfig.service.name,
          version: appConfig.service.version,
          environment: appConfig.isDevelopment ? 'development' : 'production'
        },
        limits: {
          max_payload_bytes: appConfig.limits.maxPayloadBytes,
          max_events_per_post: appConfig.limits.maxEventsPerPost,
          default_minute_cap: 5000,
          default_retention_days: 3
        },
        defaults: {
          sampling: {
            debug: 0.1,    // 10% sampling for debug logs
            info: 0.5,     // 50% sampling for info logs  
            warn: 1.0,     // 100% sampling for warnings
            error: 1.0,    // 100% sampling for errors
            fatal: 1.0     // 100% sampling for fatal errors
          },
          batch_size: 100,   // Recommended batch size for clients
          flush_interval: 30 // Recommended flush interval in seconds
        },
        stats: {
          total_projects: stats.total_projects || 0,
          avg_retention_days: Math.round(stats.avg_retention_days || 3),
          avg_minute_cap: Math.round(stats.avg_minute_cap || 5000)
        },
        endpoints: {
          log_ingestion: '/api/log',
          log_query: '/api/log',
          health_check: '/api/health',
          statistics: '/api/stats'
        },
        timestamp: new Date().toISOString()
      };

      // Update cache
      configCache = {
        data: config,
        timestamp: now
      };

      return config;
    } catch (error) {
      fastify.log.error('Failed to get configuration: %s', error instanceof Error ? error.message : String(error));
      
      // Return minimal config on error
      return {
        service: {
          name: appConfig.service.name,
          version: appConfig.service.version,
          environment: appConfig.isDevelopment ? 'development' : 'production'
        },
        limits: {
          max_payload_bytes: appConfig.limits.maxPayloadBytes,
          max_events_per_post: appConfig.limits.maxEventsPerPost,
          default_minute_cap: 5000,
          default_retention_days: 3
        },
        defaults: {
          sampling: {
            debug: 0.1,
            info: 0.5,
            warn: 1.0,
            error: 1.0,
            fatal: 1.0
          },
          batch_size: 100,
          flush_interval: 30
        },
        error: 'Failed to load full configuration',
        timestamp: new Date().toISOString()
      };
    }
  });

  /**
   * DELETE /config/cache - Clear configuration cache (admin only)
   * Note: This endpoint should be moved to admin routes for proper auth
   */
  fastify.delete('/config/cache', async (request, reply) => {
    // TODO: Add admin authentication check here
    configCache = null;
    return {
      success: true,
      message: 'Configuration cache cleared'
    };
  });
};

export default configRoutes;
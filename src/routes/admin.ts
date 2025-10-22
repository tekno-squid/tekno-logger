import type { FastifyPluginAsync } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { executeQuery, executeQuerySingle, getCurrentTimestamp } from '@/services/database';
import { runMaintenance, runDailyPurge } from '@/services/maintenance';
import { projectCreateSchema, type Project, ValidationError, DatabaseError } from '@/types';
import { appConfig } from '@/config';

/**
 * Administrative routes for project management and maintenance
 * All routes require admin authentication via X-Admin-Token header
 */
export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ===== PROJECT MANAGEMENT =====
  
  /**
   * GET /admin/projects - List all projects
   */
  fastify.get('/projects', async (request, reply) => {
    try {
      const projects = await executeQuery(`
        SELECT 
          id, slug, name, retention_days, minute_cap,
          default_sample_json, created_at, updated_at
        FROM projects 
        ORDER BY created_at DESC
      `);

      return {
        success: true,
        projects: projects.map(project => ({
          ...project,
          default_sample_json: project.default_sample_json ? JSON.parse(project.default_sample_json as string) : null
        }))
      };
    } catch (error) {
      throw new DatabaseError('Failed to fetch projects');
    }
  });

  /**
   * POST /admin/projects - Create new project
   */
  fastify.post<{
    Body: {
      name: string;
      slug: string;
      retention_days?: number;
      minute_cap?: number;
    }
  }>('/projects', async (request, reply) => {
    try {
      // Validate input
      const validatedData = projectCreateSchema.parse(request.body);
      
      // Check if slug already exists
      const existingProject = await executeQuerySingle(
        'SELECT id FROM projects WHERE slug = ?',
        [validatedData.slug]
      );
      
      if (existingProject) {
        throw new ValidationError('Project slug already exists');
      }

      // Generate API key and hash it
      const apiKey = `tkl_${randomBytes(32).toString('hex')}`;
      const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

      // Insert new project
      const result = await executeQuery(`
        INSERT INTO projects (slug, name, api_key_hash, retention_days, minute_cap, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        validatedData.slug,
        validatedData.name,
        apiKeyHash,
        validatedData.retention_days,
        validatedData.minute_cap,
        getCurrentTimestamp(),
        getCurrentTimestamp()
      ]);

      const projectId = (result as any).insertId;

      return {
        success: true,
        project: {
          id: projectId,
          slug: validatedData.slug,
          name: validatedData.name,
          api_key: apiKey, // Only returned on creation!
          retention_days: validatedData.retention_days,
          minute_cap: validatedData.minute_cap,
          created_at: getCurrentTimestamp()
        }
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return reply.code(400).send({ error: error.message });
      }
      throw new DatabaseError('Failed to create project');
    }
  });

  /**
   * GET /admin/projects/:id - Get project details
   */
  fastify.get<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    try {
      const projectId = parseInt(request.params.id);
      if (isNaN(projectId)) {
        return reply.code(400).send({ error: 'Invalid project ID' });
      }

      const project = await executeQuerySingle(`
        SELECT 
          id, slug, name, retention_days, minute_cap,
          default_sample_json, created_at, updated_at
        FROM projects 
        WHERE id = ?
      `, [projectId]);

      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      return {
        success: true,
        project: {
          ...project,
          default_sample_json: project.default_sample_json ? JSON.parse(project.default_sample_json as string) : null
        }
      };
    } catch (error) {
      throw new DatabaseError('Failed to fetch project');
    }
  });

  /**
   * PUT /admin/projects/:id - Update project
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      retention_days?: number;
      minute_cap?: number;
      default_sample_json?: Record<string, unknown>;
    }
  }>('/projects/:id', async (request, reply) => {
    try {
      const projectId = parseInt(request.params.id);
      if (isNaN(projectId)) {
        return reply.code(400).send({ error: 'Invalid project ID' });
      }

      // Check if project exists
      const existingProject = await executeQuerySingle(
        'SELECT id FROM projects WHERE id = ?',
        [projectId]
      );
      
      if (!existingProject) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const { name, retention_days, minute_cap, default_sample_json } = request.body;
      
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      
      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (retention_days !== undefined) {
        updates.push('retention_days = ?');
        values.push(retention_days);
      }
      if (minute_cap !== undefined) {
        updates.push('minute_cap = ?');
        values.push(minute_cap);
      }
      if (default_sample_json !== undefined) {
        updates.push('default_sample_json = ?');
        values.push(JSON.stringify(default_sample_json));
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      updates.push('updated_at = ?');
      values.push(getCurrentTimestamp());
      values.push(projectId);

      await executeQuery(`
        UPDATE projects 
        SET ${updates.join(', ')}
        WHERE id = ?
      `, values);

      return { success: true, message: 'Project updated successfully' };
    } catch (error) {
      throw new DatabaseError('Failed to update project');
    }
  });

  /**
   * DELETE /admin/projects/:id - Delete project and all its data
   */
  fastify.delete<{
    Params: { id: string }
  }>('/projects/:id', async (request, reply) => {
    try {
      const projectId = parseInt(request.params.id);
      if (isNaN(projectId)) {
        return reply.code(400).send({ error: 'Invalid project ID' });
      }

      // Check if project exists
      const existingProject = await executeQuerySingle(
        'SELECT id, name FROM projects WHERE id = ?',
        [projectId]
      );
      
      if (!existingProject) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      // Delete all related data (cascading delete)
      await executeQuery('DELETE FROM logs WHERE project_id = ?', [projectId]);
      await executeQuery('DELETE FROM project_minute_counters WHERE project_id = ?', [projectId]);
      await executeQuery('DELETE FROM fingerprint_trackers WHERE project_id = ?', [projectId]);
      await executeQuery('DELETE FROM alert_settings WHERE project_id = ?', [projectId]);
      await executeQuery('DELETE FROM projects WHERE id = ?', [projectId]);

      return { 
        success: true, 
        message: `Project "${existingProject.name}" and all its data deleted successfully` 
      };
    } catch (error) {
      throw new DatabaseError('Failed to delete project');
    }
  });

  // ===== MAINTENANCE ENDPOINTS =====

  /**
   * POST /admin/maintenance - Manually trigger maintenance
   */
  fastify.post('/maintenance', async (request, reply) => {
    try {
      await runMaintenance();
      return { 
        success: true, 
        message: 'Maintenance completed successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Manual maintenance failed: %s', error instanceof Error ? error.message : String(error));
      return reply.code(500).send({ 
        error: 'Maintenance failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /admin/purge - Manually trigger daily purge
   */
  fastify.post('/purge', async (request, reply) => {
    try {
      const result = await runDailyPurge();
      return { 
        success: true, 
        message: 'Purge completed successfully',
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Manual purge failed: %s', error instanceof Error ? error.message : String(error));
      return reply.code(500).send({ 
        error: 'Purge failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /admin/maintenance/status - Get maintenance status
   */
  fastify.get('/maintenance/status', async (request, reply) => {
    try {
      const maintenanceState = await executeQuerySingle(`
        SELECT last_maintenance, maintenance_in_progress 
        FROM maintenance_state 
        LIMIT 1
      `);

      const now = new Date();
      const lastMaintenance = maintenanceState?.last_maintenance ? new Date(maintenanceState.last_maintenance as string) : null;
      const inProgress = maintenanceState?.maintenance_in_progress === 1;
      
      const timeSinceLastMaintenance = lastMaintenance 
        ? Math.floor((now.getTime() - lastMaintenance.getTime()) / 1000) 
        : null;

      return {
        success: true,
        maintenance: {
          last_run: lastMaintenance?.toISOString() || null,
          in_progress: inProgress,
          seconds_since_last_run: timeSinceLastMaintenance,
          should_run_soon: timeSinceLastMaintenance ? timeSinceLastMaintenance > 300 : true // >5 minutes
        }
      };
    } catch (error) {
      throw new DatabaseError('Failed to get maintenance status');
    }
  });

  /**
   * GET /admin/testing/config - Get testing services configuration
   */
  fastify.get('/testing/config', async (request, reply) => {
    const testingConfig = {
      sentry: {
        enabled: !!appConfig.testing.sentryDsn
        // Never expose DSN in API responses for security
      },
      betterstack: {
        enabled: !!appConfig.testing.betterstackToken,
        hasToken: !!appConfig.testing.betterstackToken
      },
      teknoLogger: {
        enabled: true,
        endpoint: '/api/log',
        hasTestProject: !!(appConfig.testing.teknoProjectSlug && appConfig.testing.teknoApiKey),
        projectSlug: appConfig.testing.teknoProjectSlug || null
      }
    };

    return {
      success: true,
      services: testingConfig
    };
  });

  /**
   * GET /admin/testing/tekno-credentials - Get Tekno Logger testing credentials
   */
  fastify.get('/testing/tekno-credentials', async (request, reply) => {
    if (!appConfig.testing.teknoProjectSlug || !appConfig.testing.teknoApiKey) {
      return reply.code(404).send({
        error: 'Tekno Logger testing credentials not configured',
        message: 'Set TEST_TEKNO_PROJECT_SLUG and TEST_TEKNO_API_KEY environment variables'
      });
    }

    return {
      success: true,
      projectSlug: appConfig.testing.teknoProjectSlug,
      apiKey: appConfig.testing.teknoApiKey,
      hmacSecret: appConfig.security.hmacSecret
    };
  });

  /**
   * GET /admin/logs/recent - Get recent logs for debugging
   */
  fastify.get('/logs/recent', async (request, reply) => {
    const { limit = 50, projectId } = request.query as any;
    
    let query = `
      SELECT 
        l.id, 
        l.project_id, 
        p.slug as project_slug,
        l.level, 
        l.message, 
        l.source, 
        l.env,
        l.ctx_json as context, 
        l.fingerprint, 
        l.created_at,
        l.day_id
      FROM logs l
      LEFT JOIN projects p ON l.project_id = p.id
    `;
    const params: any[] = [];
    
    if (projectId) {
      query += ` WHERE l.project_id = ?`;
      params.push(projectId);
    }
    
    query += ` ORDER BY l.created_at DESC LIMIT ?`;
    params.push(limit);
    
    const logs = await executeQuery(query, params);
    
    return {
      logs,
      count: logs.length,
      limit
    };
  });
};

export default adminRoutes;
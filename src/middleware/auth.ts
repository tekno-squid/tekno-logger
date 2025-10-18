import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { appConfig } from '@/config';
import { executeQuerySingle } from '@/services/database';
import { AuthenticationError, ValidationError } from '@/types';

interface AuthHeaders {
  'x-project-key'?: string;
  'x-signature'?: string;
  'x-admin-token'?: string;
}

/**
 * HMAC Authentication Plugin
 * 
 * Two-factor authentication:
 * 1. X-Project-Key header - identifies the project
 * 2. X-Signature header - HMAC-SHA256 signature of raw request body
 * 
 * For admin routes, uses X-Admin-Token instead
 */
export const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Add authentication hooks to specific routes
  fastify.addHook('preHandler', async (request, reply) => {
    const isApiRoute = request.url.startsWith('/api/');
    const isAdminRoute = request.url.startsWith('/admin/');
    const isHealthCheck = request.url === '/healthz';
    
    // Skip auth for public routes
    if (!isApiRoute && !isAdminRoute) {
      return;
    }
    
    // Skip auth for health check
    if (isHealthCheck) {
      return;
    }
    
    // Handle admin authentication
    if (isAdminRoute) {
      await authenticateAdmin(request, reply);
      return;
    }
    
    // Handle API authentication
    if (isApiRoute) {
      await authenticateProject(request, reply);
      return;
    }
  });
};

/**
 * Authenticate admin requests using admin token
 */
async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const headers = request.headers as AuthHeaders;
  const adminToken = headers['x-admin-token'];
  
  if (!adminToken) {
    throw new AuthenticationError('Admin token required', 'ADMIN_TOKEN_MISSING');
  }
  
  if (!timingSafeEqual(
    Buffer.from(adminToken, 'utf8'),
    Buffer.from(appConfig.security.adminToken, 'utf8')
  )) {
    throw new AuthenticationError('Invalid admin token', 'ADMIN_TOKEN_INVALID');
  }
  
  // Admin authenticated successfully
  request.log.info({ ip: request.clientIp }, 'Admin authenticated');
}

/**
 * Authenticate project requests using project key + HMAC signature
 */
async function authenticateProject(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const headers = request.headers as AuthHeaders;
  const projectKey = headers['x-project-key'];
  const signature = headers['x-signature'];
  
  // Validate required headers
  if (!projectKey) {
    throw new AuthenticationError('Project key required', 'PROJECT_KEY_MISSING');
  }
  
  if (!signature) {
    throw new AuthenticationError('Signature required', 'SIGNATURE_MISSING');
  }
  
  // Look up project in database
  const project = await executeQuerySingle<{
    id: number;
    key: string;
    name: string;
    secret: string;
    is_active: boolean;
  }>('SELECT id, key, name, secret, is_active FROM projects WHERE key = ? LIMIT 1', [projectKey]);
  
  if (!project) {
    throw new AuthenticationError('Invalid project key', 'PROJECT_NOT_FOUND');
  }
  
  if (!project.is_active) {
    throw new AuthenticationError('Project is disabled', 'PROJECT_DISABLED');
  }
  
  // Verify HMAC signature against raw request body
  const rawBody = await getRawRequestBody(request);
  const expectedSignature = calculateHmacSignature(rawBody, project.secret);
  
  if (!timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )) {
    throw new AuthenticationError('Invalid signature', 'SIGNATURE_INVALID');
  }
  
  // Authentication successful - attach project to request
  request.project = {
    id: project.id,
    key: project.key,
    name: project.name,
    isActive: project.is_active
  };
  
  request.log.info({ 
    projectId: project.id, 
    projectKey: project.key,
    ip: request.clientIp 
  }, 'Project authenticated');
}

/**
 * Get raw request body for HMAC verification
 * CRITICAL: Must use raw body, not parsed JSON
 */
async function getRawRequestBody(request: FastifyRequest): Promise<string> {
  // For POST requests, get the raw body
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    // Fastify stores raw body in request.body for verification
    if (typeof request.body === 'string') {
      return request.body;
    }
    
    if (Buffer.isBuffer(request.body)) {
      return request.body.toString('utf8');
    }
    
    if (typeof request.body === 'object' && request.body !== null) {
      return JSON.stringify(request.body);
    }
    
    return '';
  }
  
  // For GET requests, use query string
  return request.url.split('?')[1] || '';
}

/**
 * Calculate HMAC-SHA256 signature
 */
export function calculateHmacSignature(data: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(data, 'utf8')
    .digest('hex');
}

/**
 * Generate a secure project secret (for testing/setup)
 */
export function generateProjectSecret(): string {
  return createHmac('sha256', appConfig.security.hmacSecret)
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .substring(0, 32);
}

/**
 * Validate HMAC signature for external use
 */
export function validateHmacSignature(data: string, signature: string, secret: string): boolean {
  const expectedSignature = calculateHmacSignature(data, secret);
  
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    return false;
  }
}

// Export plugin as default
export default authPlugin;
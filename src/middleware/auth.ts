import { createHmac, createHash, timingSafeEqual } from 'crypto';
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
  console.log('🔐 Auth plugin registered successfully');
  
  // Add authentication hooks to specific routes
  fastify.addHook('preHandler', async (request, reply) => {
    console.log('🔍 Auth middleware hook called for:', request.method, request.url);
    
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
      console.log('🚀 Calling authenticateProject for API route');
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
  try {
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
    
    // Look up project in database using API key hash with retry logic
    const apiKeyHash = createHash('sha256').update(projectKey).digest('hex');
    
    request.log.info({ apiKeyHash: apiKeyHash.slice(0, 8) + '...' }, 'Looking up project by API key hash');
    
    let project: {
      id: number;
      slug: string;
      name: string;
      api_key_hash: string;
    } | null = null;
    
    try {
      // Add timeout and retry logic for database queries
      const result = await Promise.race([
        executeQuerySingle<{
          id: number;
          slug: string;
          name: string;
          api_key_hash: string;
        }>('SELECT id, slug, name, api_key_hash FROM projects WHERE api_key_hash = ? LIMIT 1', [apiKeyHash]),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 10000)
        )
      ]);
      project = result;
      
      request.log.info({ projectFound: !!project, projectId: project?.id }, 'Project lookup result');
    } catch (error) {
      request.log.error({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        apiKeyHash: apiKeyHash.slice(0, 8) + '...' 
      }, 'Database query failed during authentication');
      throw new AuthenticationError('Authentication service unavailable', 'DATABASE_ERROR');
    }
    
    if (!project) {
      throw new AuthenticationError('Invalid project key', 'PROJECT_NOT_FOUND');
    }
    
    // Verify HMAC signature against raw request body using the HMAC secret from config
    const rawBody = await getRawRequestBody(request);
    const expectedSignature = calculateHmacSignature(rawBody, appConfig.security.hmacSecret);
    
    request.log.info({ 
      rawBodyLength: rawBody.length,
      expectedSig: expectedSignature.slice(0, 8) + '...',
      receivedSig: signature.slice(0, 8) + '...'
    }, 'HMAC signature verification');
    
    if (!timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )) {
      throw new AuthenticationError('Invalid signature', 'SIGNATURE_INVALID');
    }
    
    // Authentication successful - attach project to request
    request.project = {
      id: project.id,
      key: projectKey, // Use the provided API key
      name: project.name,
      isActive: true // Projects in the table are active (no is_active field)
    };
    
    request.log.info({ 
      projectId: project.id, 
      projectSlug: project.slug,
      ip: request.clientIp 
    }, 'Project authenticated successfully');
  } catch (error) {
    // Re-throw authentication errors
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    // Log unexpected errors and throw as authentication error
    request.log.error({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'Unexpected error in authentication');
    
    throw new AuthenticationError('Authentication failed', 'AUTH_ERROR');
  }
}

/**
 * Get raw request body for HMAC verification
 * CRITICAL: Must use raw body, not parsed JSON
 */
async function getRawRequestBody(request: FastifyRequest): Promise<string> {
  // For POST requests, get the raw body that was captured in preParsing hook
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    // Use the raw body captured in the preParsing hook
    if (request.rawBody) {
      return request.rawBody;
    }
    
    // Fallback: if rawBody is not available, try to reconstruct from parsed body
    if (request.body && typeof request.body === 'object') {
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
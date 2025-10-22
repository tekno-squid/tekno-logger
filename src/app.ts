import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { resolve } from 'path';
import { appConfig } from '@/config';
import { AuthenticationError, ValidationError } from '@/types';

// Type definitions for our application
declare module 'fastify' {
  interface FastifyRequest {
    // Custom properties we'll add via middleware
    project?: {
      id: number;
      key: string;
      name: string;
      isActive: boolean;
    };
    clientIp?: string;
    rawBody?: string; // For HMAC verification
  }
}

export interface AppOptions {
  logger?: boolean;
  development?: boolean;
}

/**
 * Creates and configures a Fastify application instance
 */
export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? appConfig.isDevelopment,
    maxParamLength: 200, // Limit parameter length for security
    bodyLimit: appConfig.limits.maxPayloadBytes, // Global payload limit
    trustProxy: true, // Trust proxy headers for rate limiting
    disableRequestLogging: !appConfig.isDevelopment, // Reduce noise in production
  });

  // Register built-in plugins
  await registerCorePlugins(app);

  // Register custom middleware
  await registerMiddleware(app);

  // Register application routes
  await registerRoutes(app);

  // Global error handler
  app.setErrorHandler(async (error, request, reply) => {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log error with context
    app.log.error({
      errorId,
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      ip: request.clientIp,
      project: request.project?.key
    }, 'Request error');

    // Handle custom error types
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        error: error.message,
        code: (error as any).code || 'AUTHENTICATION_ERROR'
      });
    }

    if (error instanceof ValidationError) {
      return reply.status(400).send({
        error: error.message,
        code: (error as any).code || 'VALIDATION_ERROR'
      });
    }

    // Determine error response based on error type
    if (error.statusCode === 429) {
      // Rate limit error - preserve headers
      const retryAfter = reply.getHeader('Retry-After') ?? 60;
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter
      });
    }

    if (error.statusCode && error.statusCode < 500) {
      // Client error - safe to expose message
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code || 'CLIENT_ERROR'
      });
    }

    // Server error - don't expose details
    return reply.status(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      errorId
    });
  });

  // Global not found handler
  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: 'Not found',
      code: 'NOT_FOUND'
    });
  });

  return app;
}

/**
 * Register Fastify core plugins
 */
async function registerCorePlugins(app: FastifyInstance): Promise<void> {
  // CORS support for web interface
  await app.register(import('@fastify/cors'), {
    origin: appConfig.isDevelopment 
      ? true // Allow all origins in development
      : [appConfig.server.publicUrl], // Restrict to public URL in production
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Key', 'X-Signature', 'X-Admin-Token']
  });

  // Static file serving for web interface
  await app.register(import('@fastify/static'), {
    root: resolve(process.cwd(), appConfig.paths.publicDir),
    prefix: '/', // Serve at root
  });

  // Security headers
  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  // Request logging in development
  if (appConfig.isDevelopment) {
    app.addHook('onRequest', async (request, reply) => {
      app.log.info({
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      }, 'Incoming request');
    });
  }
}

/**
 * Register custom middleware
 */
async function registerMiddleware(app: FastifyInstance): Promise<void> {
  // Raw body preservation (must be before JSON parsing)
  app.addHook('preParsing', async (request, reply, payload) => {
    // Only capture raw body for API routes that need HMAC verification
    if (request.url.startsWith('/api/') && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      const chunks: Buffer[] = [];
      payload.on('data', (chunk: any) => {
        // Ensure chunk is a Buffer, convert if it's a string
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
        chunks.push(buffer);
      });
      payload.on('end', () => {
        request.rawBody = Buffer.concat(chunks).toString('utf8');
      });
    }
    return payload;
  });

  // Client IP extraction
  app.addHook('onRequest', async (request, reply) => {
    request.clientIp = request.ip || 
                      request.headers['x-forwarded-for']?.toString().split(',')[0] ||
                      request.headers['x-real-ip']?.toString() ||
                      request.connection.remoteAddress ||
                      'unknown';
  });

  // Import and register middleware modules
  await app.register(import('@/middleware/auth'));
  await app.register(import('@/middleware/rateLimit'));
}

/**
 * Register application routes
 */
async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check route (no auth required)
  app.get('/healthz', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: appConfig.service.name,
      version: appConfig.service.version
    };
  });

  // API routes
  await app.register(import('@/routes/logs'), { prefix: '/api' });
  await app.register(import('@/routes/system'), { prefix: '/api' });
  await app.register(import('@/routes/config'), { prefix: '/' }); // Config at root level
  await app.register(import('@/routes/admin'), { prefix: '/admin' });
}

/**
 * Gracefully close the application
 */
export async function closeApp(app: FastifyInstance): Promise<void> {
  try {
    await app.close();
    console.log('🔌 Server closed gracefully');
  } catch (error) {
    console.error('❌ Error closing server:', error);
    throw error;
  }
}
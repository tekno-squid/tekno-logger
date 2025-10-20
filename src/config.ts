import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const configSchema = z.object({
  // Server Configuration
  PORT: z.string().transform(Number).pipe(z.number().int().positive().default(3000)),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  
  // Database Configuration
  DB_HOST: z.string().min(1, 'Database host is required'),
  DB_NAME: z.string().min(1, 'Database name is required'), 
  DB_USER: z.string().min(1, 'Database user is required'),
  DB_PASS: z.string().min(1, 'Database password is required'),
  DB_POOL_MIN: z.string().optional().transform(val => val ? Number(val) : 2).pipe(z.number().int().min(1)),
  DB_POOL_MAX: z.string().optional().transform(val => val ? Number(val) : 10).pipe(z.number().int().min(1)),
  
  // Security Configuration
  HMAC_SECRET: z.string().min(32, 'HMAC secret must be at least 32 characters'),
  ADMIN_TOKEN: z.string().min(32, 'Admin token must be at least 32 characters'),
  
  // Service Limits (Optional with defaults)
  DEFAULT_RETENTION_DAYS: z.string().optional().transform(val => val ? Number(val) : 3).pipe(z.number().int().min(1)),
  MAX_PAYLOAD_BYTES: z.string().optional().transform(val => val ? Number(val) : 524288).pipe(z.number().int().positive()),
  MAX_EVENTS_PER_POST: z.string().optional().transform(val => val ? Number(val) : 250).pipe(z.number().int().positive()),
  RATE_LIMIT_PER_MINUTE: z.string().optional().transform(val => val ? Number(val) : 5000).pipe(z.number().int().positive()),
  RATE_LIMIT_PER_IP: z.string().optional().transform(val => val ? Number(val) : 100).pipe(z.number().int().positive()),
  
  // Optional Service Configuration
  SERVICE_NAME: z.string().default('tekno-logger'),
  SERVICE_VERSION: z.string().default('1.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Optional External Services
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  
  // Optional Testing Services
  TEST_SENTRY_DSN: z.string().url().optional(),
  TEST_BETTERSTACK_TOKEN: z.string().optional(),
});

// Validate and parse configuration
let config: z.infer<typeof configSchema>;

try {
  config = configSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Configuration validation failed:');
    error.errors.forEach(err => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    console.error('\n💡 Check your .env file and ensure all required variables are set.');
    process.exit(1);
  }
  throw error;
}

// Derived configuration values
export const appConfig = {
  ...config,
  
  // Computed values
  isDevelopment: config.NODE_ENV === 'development',
  isProduction: config.NODE_ENV === 'production',
  
  // Database connection configuration
  database: {
    host: config.DB_HOST,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASS,
    connectionLimit: config.DB_POOL_MAX,
    charset: 'utf8mb4',
    // Pool configuration (not passed directly to MySQL2)
    poolMin: config.DB_POOL_MIN,
    poolMax: config.DB_POOL_MAX,
  },
  
  // Security configuration
  security: {
    hmacSecret: config.HMAC_SECRET,
    adminToken: config.ADMIN_TOKEN,
  },
  
  // Service limits
  limits: {
    retentionDays: config.DEFAULT_RETENTION_DAYS,
    maxPayloadBytes: config.MAX_PAYLOAD_BYTES,
    maxEventsPerPost: config.MAX_EVENTS_PER_POST,
    rateLimit: {
      perProject: config.RATE_LIMIT_PER_MINUTE,
      perIP: config.RATE_LIMIT_PER_IP,
    },
  },
  
  // Service metadata
  service: {
    name: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    logLevel: config.LOG_LEVEL,
  },

  // Server configuration
  server: {
    port: config.PORT,
    host: '0.0.0.0', // Bind to all interfaces for Render
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${config.PORT}`,
  },

  // Path configuration
  paths: {
    publicDir: process.env.PUBLIC_DIR || 'public',
  },
  
  // External services
  external: {
    discordWebhook: config.DISCORD_WEBHOOK_URL,
    sentryDsn: config.SENTRY_DSN,
  },

  // Testing services
  testing: {
    sentryDsn: config.TEST_SENTRY_DSN,
    betterstackToken: config.TEST_BETTERSTACK_TOKEN,
  },
};

// Configuration validation logging
if (config.NODE_ENV === 'development') {
  console.log('✅ Configuration loaded successfully');
  console.log(`📊 Database: ${config.DB_HOST}/${config.DB_NAME}`);
  console.log(`🔒 HMAC Secret: ${config.HMAC_SECRET.slice(0, 8)}...`);
  console.log(`🚦 Rate Limits: ${config.RATE_LIMIT_PER_MINUTE}/min per project, ${config.RATE_LIMIT_PER_IP}/min per IP`);
}

export type AppConfig = typeof appConfig;
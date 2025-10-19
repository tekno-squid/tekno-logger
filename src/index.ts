import 'dotenv/config';
import { appConfig } from '@/config';
import { initializeDatabase, closeDatabase } from '@/services/database';
import { createApp, closeApp } from '@/app';

/**
 * Main server entry point
 * Initializes database, starts the Fastify server, and handles graceful shutdown
 */
async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof createApp>> | null = null;

  try {
    console.log('🚀 Starting Tekno Logger...');
    console.log(`📦 Service: ${appConfig.service.name} v${appConfig.service.version}`);
    console.log(`🌍 Environment: ${appConfig.isDevelopment ? 'development' : 'production'}`);
    
    // Initialize database connection
    console.log('📊 Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database connected');

    // Create and configure Fastify application
    console.log('⚙️  Creating Fastify application...');
    app = await createApp({
      logger: appConfig.isDevelopment,
      development: appConfig.isDevelopment
    });
    console.log('✅ Application configured');

    // Start the server
    console.log(`🚀 Starting server on ${appConfig.server.host}:${appConfig.server.port}...`);
    await app.listen({
      port: appConfig.server.port,
      host: appConfig.server.host
    });
    
    console.log('🎉 Server started successfully!');
    console.log(`📍 Health check: http://${appConfig.server.host}:${appConfig.server.port}/healthz`);
    console.log(`🔗 Public URL: ${appConfig.server.publicUrl}`);
    
    if (appConfig.isDevelopment) {
      console.log('🛠️  Development mode - hot reload enabled');
      console.log(`📝 API endpoint: http://localhost:${appConfig.server.port}/api/log`);
    }

  } catch (error) {
    console.error('❌ Failed to start server:');
    console.error(error);
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Close Fastify server
      if (app) {
        console.log('🔌 Closing HTTP server...');
        await closeApp(app);
      }

      // Close database connections
      console.log('🔌 Closing database connections...');
      await closeDatabase();

      console.log('✅ Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:');
      console.error(error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
}

// Start the application
if (require.main === module) {
  main();
}
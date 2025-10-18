#!/usr/bin/env tsx

import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { initializeDatabase, closeDatabase, executeQuery, executeQuerySingle } from '../src/services/database';

interface Migration {
  filename: string;
  version: number;
  content: string;
}

async function ensureMigrationsTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_executed_at (executed_at)
    )
  `;
  
  await executeQuery(createTableQuery);
}

async function getExecutedMigrations(): Promise<Set<number>> {
  const results = await executeQuery<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(results.map(row => row.version));
}

async function loadMigrations(): Promise<Migration[]> {
  const migrationsDir = resolve(__dirname, '../migrations');
  
  try {
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
    
    const migrations: Migration[] = [];
    
    for (const filename of sqlFiles) {
      const match = filename.match(/^(\d+)_/);
      if (!match || !match[1]) {
        console.warn(`⚠️  Skipping migration file with invalid name: ${filename}`);
        continue;
      }
      
      const version = parseInt(match[1], 10);
      const filepath = join(migrationsDir, filename);
      const content = await readFile(filepath, 'utf-8');
      
      migrations.push({ filename, version, content });
    }
    
    return migrations.sort((a, b) => a.version - b.version);
  } catch (error) {
    console.error('❌ Failed to load migrations:', error);
    throw error;
  }
}

async function executeMigration(migration: Migration): Promise<void> {
  console.log(`🔄 Executing migration ${migration.version}: ${migration.filename}`);
  
  try {
    // Split the migration content by semicolons and execute each statement
    const statements = migration.content
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        await executeQuery(statement);
      }
    }
    
    // Record the migration as executed
    await executeQuery(
      'INSERT INTO schema_migrations (version, filename) VALUES (?, ?)',
      [migration.version, migration.filename]
    );
    
    console.log(`✅ Migration ${migration.version} completed successfully`);
  } catch (error) {
    console.error(`❌ Migration ${migration.version} failed:`, error);
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  try {
    console.log('🚀 Starting database migrations...');
    
    // Initialize database connection
    await initializeDatabase();
    console.log('📊 Database connection established');
    
    // Ensure migrations tracking table exists
    await ensureMigrationsTable();
    console.log('📋 Migrations table ready');
    
    // Load all migration files
    const migrations = await loadMigrations();
    console.log(`📁 Found ${migrations.length} migration files`);
    
    // Get already executed migrations
    const executedMigrations = await getExecutedMigrations();
    console.log(`✅ ${executedMigrations.size} migrations already executed`);
    
    // Filter out already executed migrations
    const pendingMigrations = migrations.filter(m => !executedMigrations.has(m.version));
    
    if (pendingMigrations.length === 0) {
      console.log('🎉 All migrations are up to date!');
      return;
    }
    
    console.log(`🔧 ${pendingMigrations.length} migrations to execute`);
    
    // Execute pending migrations in order
    for (const migration of pendingMigrations) {
      await executeMigration(migration);
    }
    
    console.log('🎉 All migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration process failed:', error);
    throw error;
  } finally {
    await closeDatabase();
    console.log('🔌 Database connection closed');
  }
}

async function showMigrationStatus(): Promise<void> {
  try {
    await initializeDatabase();
    await ensureMigrationsTable();
    
    const migrations = await loadMigrations();
    const executedMigrations = await getExecutedMigrations();
    
    console.log('\n📊 Migration Status:');
    console.log('='.repeat(50));
    
    for (const migration of migrations) {
      const status = executedMigrations.has(migration.version) ? '✅' : '⏳';
      console.log(`${status} ${migration.version.toString().padStart(3, '0')}: ${migration.filename}`);
    }
    
    console.log('='.repeat(50));
    console.log(`Total: ${migrations.length} | Executed: ${executedMigrations.size} | Pending: ${migrations.length - executedMigrations.size}`);
    
  } catch (error) {
    console.error('❌ Failed to get migration status:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Command line interface
async function main(): Promise<void> {
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'status':
        await showMigrationStatus();
        break;
      case 'up':
      case undefined:
        await runMigrations();
        break;
      default:
        console.log('Usage: tsx scripts/migrate.ts [command]');
        console.log('Commands:');
        console.log('  up      Run pending migrations (default)');
        console.log('  status  Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}
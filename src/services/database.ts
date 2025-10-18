import mysql from 'mysql2/promise';
import { appConfig } from '@/config';
import { DatabaseError, type DatabaseRow } from '@/types';

// Global connection pool
let pool: mysql.Pool | null = null;

// Connection health state
let isHealthy = false;
let lastHealthCheck = new Date();

export async function initializeDatabase(): Promise<void> {
  try {
    // Create connection pool with only MySQL2-compatible settings
    pool = mysql.createPool({
      host: appConfig.database.host,
      database: appConfig.database.database,
      user: appConfig.database.user,
      password: appConfig.database.password,
      connectionLimit: appConfig.database.connectionLimit,
      charset: appConfig.database.charset,
      // Additional pool configuration
      queueLimit: 0,
      multipleStatements: false, // Security: prevent SQL injection via multiple statements
      timezone: 'Z', // Use UTC
      dateStrings: false, // Return Date objects, not strings
      typeCast: (field, next) => {
        // Custom type casting for better TypeScript compatibility
        if (field.type === 'TINY' && field.length === 1) {
          return field.string() === '1'; // Convert TINYINT(1) to boolean
        }
        if (field.type === 'JSON') {
          const value = field.string();
          return value ? JSON.parse(value) : null;
        }
        return next();
      },
    });

    // Test initial connection
    await testConnection();
    isHealthy = true;
    
    if (appConfig.isDevelopment) {
      console.log('✅ Database connection pool initialized');
      console.log(`📊 Pool config: ${appConfig.database.connectionLimit} max connections`);
    }
  } catch (error) {
    isHealthy = false;
    throw new DatabaseError(
      'Failed to initialize database connection pool',
      undefined,
      'DB_INIT_FAILED'
    );
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isHealthy = false;
    
    if (appConfig.isDevelopment) {
      console.log('🔌 Database connection pool closed');
    }
  }
}

export async function testConnection(): Promise<void> {
  if (!pool) {
    throw new DatabaseError('Database pool not initialized', undefined, 'DB_NOT_INITIALIZED');
  }

  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    
    isHealthy = true;
    lastHealthCheck = new Date();
  } catch (error) {
    isHealthy = false;
    throw new DatabaseError(
      'Database connection test failed',
      undefined,
      'DB_CONNECTION_FAILED'
    );
  }
}

export function getDatabaseHealth(): { 
  isHealthy: boolean; 
  lastCheck: Date; 
  activeConnections: number;
} {
  return {
    isHealthy,
    lastCheck: lastHealthCheck,
    activeConnections: pool ? (pool.config.connectionLimit || 10) - ((pool as any)._freeConnections?.length || 0) : 0,
  };
}

// ===== QUERY EXECUTION HELPERS =====

export async function executeQuery<T = DatabaseRow>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!pool) {
    throw new DatabaseError('Database pool not initialized', query, 'DB_NOT_INITIALIZED');
  }

  try {
    const [rows] = await pool.execute(query, params);
    return rows as T[];
  } catch (error) {
    // Enhanced error handling with query context
    const message = error instanceof Error ? error.message : 'Unknown database error';
    throw new DatabaseError(
      `Query execution failed: ${message}`,
      query,
      'DB_QUERY_FAILED'
    );
  }
}

export async function executeQuerySingle<T = DatabaseRow>(
  query: string,
  params: unknown[] = []
): Promise<T | null> {
  const results = await executeQuery<T>(query, params);
  return results.length > 0 ? results[0]! : null;
}

export async function executeInsert(
  query: string,
  params: unknown[] = []
): Promise<{ insertId: number; affectedRows: number }> {
  if (!pool) {
    throw new DatabaseError('Database pool not initialized', query, 'DB_NOT_INITIALIZED');
  }

  try {
    const [result] = await pool.execute(query, params);
    const insertResult = result as mysql.ResultSetHeader;
    
    return {
      insertId: insertResult.insertId,
      affectedRows: insertResult.affectedRows,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    throw new DatabaseError(
      `Insert query failed: ${message}`,
      query,
      'DB_INSERT_FAILED'
    );
  }
}

export async function executeBulkInsert(
  query: string,
  values: unknown[][]
): Promise<{ affectedRows: number; insertId?: number }> {
  if (!pool) {
    throw new DatabaseError('Database pool not initialized', query, 'DB_NOT_INITIALIZED');
  }

  if (values.length === 0) {
    return { affectedRows: 0 };
  }

  try {
    // Use a single multi-row insert for better performance
    const placeholders = values.map(() => `(${values[0]!.map(() => '?').join(', ')})`).join(', ');
    const finalQuery = query + placeholders;
    const flatParams = values.flat();
    
    const [result] = await pool.execute(finalQuery, flatParams);
    const insertResult = result as mysql.ResultSetHeader;
    
    return {
      affectedRows: insertResult.affectedRows,
      insertId: insertResult.insertId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    throw new DatabaseError(
      `Bulk insert failed: ${message}`,
      query,
      'DB_BULK_INSERT_FAILED'
    );
  }
}

// ===== TRANSACTION HELPERS =====

export async function withTransaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  if (!pool) {
    throw new DatabaseError('Database pool not initialized', undefined, 'DB_NOT_INITIALIZED');
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ===== MAINTENANCE HELPERS =====

export async function cleanupExpiredCounters(olderThanMinutes: number = 120): Promise<number> {
  const cutoffTime = Math.floor(Date.now() / 1000 / 60) - olderThanMinutes;
  
  const result = await executeQuery(
    'DELETE FROM project_minute_counters WHERE minute_utc < ?',
    [cutoffTime]
  );
  
  return (result as any).affectedRows ?? 0;
}

export async function purgeOldLogs(retentionDays: number): Promise<number> {
  const cutoffDayId = new Date();
  cutoffDayId.setDate(cutoffDayId.getDate() - retentionDays);
  const dayIdCutoff = parseInt(cutoffDayId.toISOString().slice(0, 10).replace(/-/g, ''));
  
  const result = await executeQuery(
    'DELETE FROM logs WHERE day_id < ?',
    [dayIdCutoff]
  );
  
  return (result as any).affectedRows ?? 0;
}

// ===== UTILITY HELPERS =====

export function generateDayId(date: Date = new Date()): number {
  return parseInt(date.toISOString().slice(0, 10).replace(/-/g, ''));
}

export function generateMinuteUtc(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 1000 / 60);
}

export function escapeIdentifier(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`';
}

// Export the pool for advanced usage (use sparingly)
export function getPool(): mysql.Pool | null {
  return pool;
}
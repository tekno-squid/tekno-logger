import { executeQuery, executeQuerySingle, generateDayId } from '@/services/database';
import { DatabaseError } from '@/types';

/**
 * Maintenance service for automatic cleanup tasks
 * These functions are called by the self-triggering maintenance system
 */

/**
 * Check if maintenance should run
 */
export async function shouldRunMaintenance(): Promise<boolean> {
  try {
    const state = await executeQuerySingle(`
      SELECT last_maintenance, maintenance_in_progress 
      FROM maintenance_state 
      LIMIT 1
    `);

    // If no state record exists, create one and run maintenance
    if (!state) {
      await executeQuery(`
        INSERT INTO maintenance_state (last_maintenance, maintenance_in_progress)
        VALUES (?, ?)
      `, [new Date(), false]);
      return true;
    }

    // Don't run if already in progress
    if (state.maintenance_in_progress) {
      return false;
    }

    // Run if more than 5 minutes since last maintenance
    const lastMaintenance = new Date(state.last_maintenance as string);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    return lastMaintenance < fiveMinutesAgo;
  } catch (error) {
    console.error('Error checking maintenance status:', error);
    return false; // Don't run maintenance if we can't check status
  }
}

/**
 * Set maintenance in progress flag
 */
export async function setMaintenanceInProgress(inProgress: boolean): Promise<void> {
  await executeQuery(`
    UPDATE maintenance_state 
    SET maintenance_in_progress = ?
  `, [inProgress]);
}

/**
 * Update last maintenance timestamp
 */
export async function updateLastMaintenance(): Promise<void> {
  await executeQuery(`
    UPDATE maintenance_state 
    SET last_maintenance = ?, maintenance_in_progress = ?
  `, [new Date(), false]);
}

/**
 * Run routine maintenance tasks
 * - Clean up expired rate limit counters
 * - Clean up old fingerprint trackers
 * - Update maintenance timestamp
 */
export async function runMaintenance(): Promise<void> {
  try {
    // Mark maintenance as in progress
    await setMaintenanceInProgress(true);

    // Clean up rate limit counters older than 2 hours
    const twoHoursAgoMinute = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000 / 60);
    await executeQuery(
      'DELETE FROM project_minute_counters WHERE minute_utc < ?',
      [twoHoursAgoMinute]
    );

    // Clean up fingerprint trackers older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await executeQuery(
      'DELETE FROM fingerprint_trackers WHERE last_seen < ?',
      [oneDayAgo]
    );

    // Update maintenance timestamp and clear in-progress flag
    await updateLastMaintenance();

    console.log('✅ Maintenance completed successfully');
  } catch (error) {
    // Clear in-progress flag even if maintenance failed
    try {
      await setMaintenanceInProgress(false);
    } catch (clearError) {
      console.error('Failed to clear maintenance in-progress flag:', clearError);
    }
    
    throw new DatabaseError(`Maintenance failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Run daily purge of old data based on project retention settings
 */
export async function runDailyPurge(): Promise<{ deletedLogs: number; deletedProjects: string[] }> {
  try {
    let totalDeletedLogs = 0;
    const deletedProjects: string[] = [];

    // Get all projects with their retention settings
    const projects = await executeQuery(`
      SELECT id, slug, retention_days 
      FROM projects 
      WHERE retention_days > 0
    `);

    for (const project of projects as any[]) {
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - project.retention_days);
      const retentionDayId = generateDayId(retentionDate);

      // Delete logs older than retention period for this project
      const result = await executeQuery(
        'DELETE FROM logs WHERE project_id = ? AND day_id < ?',
        [project.id, retentionDayId]
      );

      const deletedCount = (result as any).affectedRows || 0;
      if (deletedCount > 0) {
        totalDeletedLogs += deletedCount;
        deletedProjects.push(`${project.slug}: ${deletedCount} logs`);
        console.log(`🗑️ Purged ${deletedCount} logs from project ${project.slug} (older than ${project.retention_days} days)`);
      }
    }

    return {
      deletedLogs: totalDeletedLogs,
      deletedProjects
    };
  } catch (error) {
    throw new DatabaseError(`Daily purge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get maintenance statistics
 */
export async function getMaintenanceStats(): Promise<{
  lastMaintenance: Date | null;
  inProgress: boolean;
  totalCounters: number;
  totalTrackers: number;
}> {
  try {
    const state = await executeQuerySingle(`
      SELECT last_maintenance, maintenance_in_progress 
      FROM maintenance_state 
      LIMIT 1
    `);

    const counterCount = await executeQuerySingle(`
      SELECT COUNT(*) as count 
      FROM project_minute_counters
    `);

    const trackerCount = await executeQuerySingle(`
      SELECT COUNT(*) as count 
      FROM fingerprint_trackers
    `);

    return {
      lastMaintenance: state?.last_maintenance ? new Date(state.last_maintenance as string) : null,
      inProgress: state?.maintenance_in_progress === 1 || false,
      totalCounters: (counterCount as any)?.count || 0,
      totalTrackers: (trackerCount as any)?.count || 0
    };
  } catch (error) {
    throw new DatabaseError(`Failed to get maintenance stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
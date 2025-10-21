import 'dotenv/config';
import { createHash } from 'crypto';
import { initializeDatabase, closeDatabase, executeQuery } from '../src/services/database';
import { appConfig } from '../src/config';

/**
 * Create test project for Tekno Logger testing
 * This ensures the test project exists in the database with the correct API key hash
 */
async function createTestProject(): Promise<void> {
  console.log('🚀 Creating test project for Tekno Logger testing...');

  if (!appConfig.testing.teknoProjectSlug || !appConfig.testing.teknoApiKey) {
    console.error('❌ TEST_TEKNO_PROJECT_SLUG and TEST_TEKNO_API_KEY environment variables must be set');
    process.exit(1);
  }

  try {
    // Initialize database connection
    await initializeDatabase();
    console.log('✅ Database connected');

    // Calculate API key hash
    const apiKeyHash = createHash('sha256').update(appConfig.testing.teknoApiKey).digest('hex');
    
    console.log('📊 Test project details:');
    console.log(`   Slug: ${appConfig.testing.teknoProjectSlug}`);
    console.log(`   API Key: ${appConfig.testing.teknoApiKey.slice(0, 12)}...`);
    console.log(`   API Key Hash: ${apiKeyHash.slice(0, 16)}...`);

    // Check if project already exists
    const existingProject = await executeQuery(
      'SELECT id, slug, name FROM projects WHERE slug = ? OR api_key_hash = ?',
      [appConfig.testing.teknoProjectSlug, apiKeyHash]
    );

    if (existingProject.length > 0) {
      console.log('⚠️  Test project already exists, updating...');
      
      // Update existing project
      await executeQuery(`
        UPDATE projects 
        SET slug = ?, api_key_hash = ?, name = ?, updated_at = NOW()
        WHERE id = ?
      `, [
        appConfig.testing.teknoProjectSlug,
        apiKeyHash,
        'Tekno Logger Test Project',
        existingProject[0].id
      ]);
      
      console.log('✅ Test project updated successfully');
    } else {
      // Create new project
      const result = await executeQuery(`
        INSERT INTO projects (slug, api_key_hash, name, retention_days, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
      `, [
        appConfig.testing.teknoProjectSlug,
        apiKeyHash,
        'Tekno Logger Test Project',
        3 // 3 days retention for test project
      ]);

      console.log('✅ Test project created successfully');
      console.log(`   Project ID: ${(result as any).insertId}`);
    }

    // Verify project was created/updated correctly
    const verifyProject = await executeQuery(
      'SELECT id, slug, name, api_key_hash FROM projects WHERE slug = ?',
      [appConfig.testing.teknoProjectSlug]
    );

    if (verifyProject.length === 0) {
      throw new Error('Failed to verify test project creation');
    }

    console.log('🎉 Test project verification successful!');
    console.log('   Testing should now work properly');

  } catch (error) {
    console.error('❌ Failed to create test project:');
    console.error(error);
    process.exit(1);
  } finally {
    await closeDatabase();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
if (require.main === module) {
  createTestProject();
}
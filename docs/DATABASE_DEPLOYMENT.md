# Database Deployment with GitHub Actions

This guide explains how to set up and use the manual database deployment workflow.

## 🎯 Overview

The database deployment workflow allows you to:
- **Manually deploy** database schema to staging or production
- **Dry run** migrations to see what would be executed
- **Safety checks** to prevent accidental data loss
- **Verification** that all tables are created correctly

## 🔧 Setup

### 1. Configure GitHub Secrets

You need to add database connection secrets to your GitHub repository:

**For Production Environment:**
- `PROD_DB_HOST` - Production database host (e.g., `mysql.yourdomain.com`)
- `PROD_DB_NAME` - Production database name (e.g., `tekno_logger`)
- `PROD_DB_USER` - Production database username
- `PROD_DB_PASS` - Production database password

**For Staging Environment:**
- `STAGING_DB_HOST` - Staging database host
- `STAGING_DB_NAME` - Staging database name  
- `STAGING_DB_USER` - Staging database username
- `STAGING_DB_PASS` - Staging database password

### 2. Add Secrets to GitHub

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with the exact names above

### 3. Create Environment Protection (Optional)

For production safety, create protected environments:

1. Go to **Settings** → **Environments**
2. Create `production` environment
3. Add protection rules:
   - **Required reviewers** (yourself or team)
   - **Deployment branches** (only `main` or `master`)

## 🚀 Usage

### Running the Workflow

1. Go to **Actions** tab in your GitHub repository
2. Click **Deploy Database Schema** workflow
3. Click **Run workflow**
4. Configure options:
   - **Environment**: `staging` or `production`
   - **Dry run**: `true` (recommended first) or `false`
   - **Force migration**: `false` (safety) or `true`

### Recommended Deployment Process

**Step 1: Dry Run**
```
Environment: staging
Dry run: true
Force migration: false
```
This shows you what would be executed without making changes.

**Step 2: Deploy to Staging**
```
Environment: staging  
Dry run: false
Force migration: false (or true if database has tables)
```

**Step 3: Deploy to Production**
```
Environment: production
Dry run: false
Force migration: false (or true if database has tables)
```

## 🛡️ Safety Features

### Existing Database Protection
- Workflow checks if database has existing tables
- Requires `force_migration: true` to proceed with populated database
- Prevents accidental data loss

### Dry Run Mode
- Shows migration plan without executing
- Lists all migration files to be run
- Displays database connection info (without passwords)

### Verification Steps
- Tests database connection before migration
- Verifies all required tables exist after migration
- Checks migration tracking table

## 📊 What Gets Deployed

The workflow executes all migration files in order:

1. **001_initial_schema.sql** - Core tables (projects, logs, counters)
2. **002_maintenance_state.sql** - Self-maintenance tracking
3. **Future migrations** - Any new schema updates

### Created Tables
- `projects` - Project configuration and API keys
- `logs` - Main log storage with day-based partitioning
- `project_minute_counters` - Rate limiting tracking  
- `fingerprint_trackers` - Log deduplication
- `maintenance_state` - Self-maintenance state
- `schema_migrations` - Migration tracking

## 🔍 Monitoring

### Workflow Outputs
- **Success Summary** - Tables created, migration count
- **Failure Details** - Error logs and troubleshooting info
- **Connection Test** - Database connectivity verification

### Post-Deployment Verification
After successful deployment:

1. **Test Application Connection**
   ```bash
   # Check your Render app health endpoint
   curl https://your-app.render.com/healthz
   ```

2. **Create Initial Project**
   - Access your dashboard admin interface
   - Create first project for testing

3. **Test Log Ingestion**
   ```bash
   # Send test log (replace with actual values)
   curl -X POST https://your-app.render.com/api/log \
     -H "Content-Type: application/json" \
     -H "X-Project-Key: your-key" \
     -H "X-Signature: calculated-signature" \
     -d '[{"level":"info","message":"test"}]'
   ```

## ⚠️ Troubleshooting

### Connection Errors
- Verify database host allows external connections
- Check username/password in GitHub secrets
- Ensure database exists (must be created manually)

### Migration Errors
- Check migration file syntax in `migrations/` folder
- Verify database user has CREATE/ALTER permissions
- Look at workflow logs for detailed error messages

### Permission Issues
```sql
-- Grant necessary permissions to database user
GRANT ALL PRIVILEGES ON your_database.* TO 'your_user'@'%';
FLUSH PRIVILEGES;
```

## 🔄 Re-running Migrations

If you need to re-run migrations:

1. **Add new migration file** with incremented number
2. **Don't modify existing** migration files
3. **Use force_migration: true** if database has existing tables

The workflow tracks executed migrations in `schema_migrations` table and only runs new ones.

## 📈 Best Practices

1. **Always dry run first** on new environments
2. **Test on staging** before production
3. **Use force_migration sparingly** - only when you know what you're doing
4. **Keep migration files simple** - one logical change per file
5. **Backup production data** before major schema changes

This workflow gives you complete control over database deployments while maintaining safety and visibility into the process.
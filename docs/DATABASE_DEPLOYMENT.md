# Database Deployment

## 🎯 Overview
Deploy database schema to production using GitHub Actions workflow.

## 🔧 Setup
Add these secrets to GitHub repository (Settings → Secrets → Actions):
- `PROD_DB_HOST` - Database host (e.g., `mysql.yourdomain.com`)
- `PROD_DB_NAME` - Database name (e.g., `tekno_logger`)
- `PROD_DB_USER` - Database username  
- `PROD_DB_PASSWORD` - Database password

## 🚀 Usage

### Deploy Database Schema
1. Go to **Actions** tab → **Deploy Production Database**
2. Click **Run workflow**
3. **First run**: `dry_run: true` to test configuration
4. **Deploy**: `dry_run: false, force_migration: true`

### Options
- **dry_run**: Show what would be executed without changes
- **force_migration**: Required if database has existing tables

## 🛡️ Safety Features
- **Connection testing** before migration
- **Dry run mode** to preview changes  
- **Table verification** after deployment
- **Force flag** prevents accidental overwrites

## ✅ Expected Result
Creates these tables:
- `projects` - Project management
- `logs` - Log storage
- `project_minute_counters` - Rate limiting
- `maintenance_log` - System maintenance

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
# Setup Guide

## 🎯 Quick Deployment

### 1. Deploy to Render
1. **Connect GitHub repository** to Render
2. **Configure environment variables** (see below)
3. **Deploy** - Render handles build and start automatically

### 2. Required Environment Variables
```bash
# Database (Required)
DB_HOST=mysql.yourdomain.com
DB_NAME=tekno_logger
DB_USER=logger_user
DB_PASS=your_secure_password

# Security Secrets (Required - generate 32+ char strings)
HMAC_SECRET=generate_32_char_random_string_here
ADMIN_TOKEN=generate_32_char_random_token_here
```

**Generate secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Deploy Database Schema
**GitHub Actions Workflow:**
1. **Configure GitHub secrets** (Settings → Secrets → Actions):
   - `PROD_DB_HOST` - Database host (e.g., `mysql.yourdomain.com`)
   - `PROD_DB_NAME` - Database name (e.g., `tekno_logger`) 
   - `PROD_DB_USER` - Database username
   - `PROD_DB_PASSWORD` - Database password

2. **Run deployment workflow**:
   - Go to **Actions** tab → **Deploy Production Database**
   - **First run**: `dry_run: true` to test configuration
   - **Deploy**: `dry_run: false, force_migration: true`

**Creates tables**: `projects`, `logs`, `project_minute_counters`, `maintenance_log`

## 🔧 Local Development

### Setup
```bash
git clone <your-repo-url>
cd tekno-logger
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Database
```bash
# Option 1: Use production database
npm run migrate:dev

# Option 2: Local MySQL
CREATE DATABASE tekno_logger;
CREATE USER 'logger_user'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON tekno_logger.* TO 'logger_user'@'%';
```

### Run
```bash
npm run dev  # Development with hot reload
npm start    # Production mode
```

## 📋 System Limits (Optional)
These have sensible defaults but can be customized:
```bash
DEFAULT_RETENTION_DAYS=3      # Days to keep logs
MAX_PAYLOAD_BYTES=524288      # 512KB max request size  
MAX_EVENTS_PER_POST=250       # Events per request
RATE_LIMIT_PER_MINUTE=5000    # Project rate limit
RATE_LIMIT_PER_IP=100         # IP rate limit
```

## 🔗 Integration
See [INTEGRATION.md](INTEGRATION.md) for adding logging to your applications.

## 🌐 External Services (Optional)
```bash
# Discord alerts for error spikes
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Sentry integration  
SENTRY_DSN=https://...
```
# 1. Configure GitHub secrets for database connection
# 2. Run "Deploy Database Schema" workflow manually
# 3. Start with dry_run: true to verify configuration
```

**Option B: Local Development**
```bash
npm run migrate:dev
```

**Option C: Manual Production Setup**
```bash
# Via Render console or SSH access
npm run migrate
```

### 5. Start Development Server
```bash
npm run dev
```

The service will be available at `http://localhost:3000` with a modern web dashboard.

### 6. Access Dashboard
- **Dashboard**: `http://localhost:3000` - View real-time stats and recent errors
- **Search**: Advanced log filtering and pagination
- **Projects**: Manage API keys and project settings  
- **Admin**: System health, maintenance controls (requires admin token)

## 🔧 External Services (Optional)

### Discord Alerts
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK
```

### Sentry Error Tracking  
```bash
SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

## 🚀 Deployment

### Render.com
1. Connect GitHub repository
2. **Build Command**: `npm ci && npm run build`
3. **Start Command**: `npm start`
4. **Environment**: Add all variables from `.env`

### DreamHost MySQL
1. Create MySQL database in panel
2. Note connection details (host, database, user, password)
3. Update environment variables

## 🧪 Testing Setup

### Local Testing
```bash
# Generate test project secret
npm run dev
curl -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" \
  -H "X-Project-Key: your-project-key" \
  -H "X-Signature: calculated-hmac-signature" \
  -d '{"events":[{"level":"info","message":"test"}]}'
```

### HMAC Signature Calculation
```javascript
const crypto = require('crypto');
const data = JSON.stringify({events:[{level:"info",message:"test"}]});
const secret = "your-project-secret";
const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
console.log('X-Signature:', signature);
```

## ⚡ Production Checklist

- [ ] Database created and accessible
- [ ] Secure secrets generated (32+ characters)
- [ ] Environment variables configured
- [ ] Database migrations executed
- [ ] Test log submission works
- [ ] Web dashboard accessible and functioning
- [ ] Admin interface accessible with token
- [ ] Project management working via dashboard
- [ ] Search functionality tested
- [ ] Mobile responsiveness verified
- [ ] Discord webhook tested (if using)
- [ ] Rate limits configured appropriately

## 🔍 Troubleshooting

**Database connection fails**
- Check host/port accessibility
- Verify credentials and permissions
- Ensure database exists

**Authentication errors**
- Verify HMAC signature calculation
- Check project key exists and is active
- Ensure raw request body used for signature

**Rate limit issues** 
- Check IP extraction in proxy setup
- Verify database counter table exists
- Adjust limits in environment variables

**Dashboard not loading**
- Ensure static file serving is enabled
- Check browser console for JavaScript errors
- Verify API endpoints are accessible

**Admin interface not accessible**
- Verify ADMIN_TOKEN environment variable is set
- Check admin token in browser localStorage
- Ensure admin endpoints are responding
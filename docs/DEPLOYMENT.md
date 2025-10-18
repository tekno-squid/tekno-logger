# Deployment Guide

Quick deployment guide for Tekno Logger on Render + DreamHost MySQL.

## 🚀 Quick Deploy Checklist

### Prerequisites
- [ ] GitHub repository created and code pushed
- [ ] Render account created
- [ ] DreamHost MySQL database created (or local MySQL for development)
- [ ] Discord webhook URL (optional, for alerts)

### 1. Database Setup (DreamHost)

1. **Create MySQL database** in DreamHost panel
2. **Create database user** with full permissions
3. **Note connection details**:
   - Hostname (e.g., `mysql.example.com`)
   - Database name
   - Username and password
4. **Configure host access**: Add "%" or Render IPs to allowable hosts

### 2. Render Deployment

1. **Connect Repository**
   - Go to Render dashboard
   - Create new Web Service
   - Connect your GitHub repository

2. **Configure Build**
   - **Environment**: Node 18+
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/healthz`

3. **Set Environment Variables**
   ```bash
   NODE_ENV=production
   PORT=10000
   DB_HOST=your-mysql-host
   DB_NAME=your-database-name
   DB_USER=your-username
   DB_PASS=your-password
   HMAC_SECRET=generate-32-char-secret
   ADMIN_TOKEN=generate-32-char-token
   DEFAULT_RETENTION_DAYS=3
   MAX_PAYLOAD_BYTES=524288
   MAX_EVENTS_PER_POST=250
   ```

### 3. Initialize Database

After deployment, run migrations:
```bash
# Via Render console or local connection to DreamHost
npm run migrate
npm run seed
```

### 4. Configure Maintenance (Optional)

**Option A: Render Cron Jobs** (if available on your plan)
- Create cron job: `POST /admin/maintain` every 5 minutes
- Create cron job: `POST /admin/purge` daily at 3:10 AM

**Option B: GitHub Actions** (if Render cron not available)
- The repository includes `.github/workflows/scheduled-maintenance.yml`
- Add repository secrets:
  - `SERVICE_URL`: Your Render service URL
  - `ADMIN_TOKEN`: Same token from environment variables

### 5. Verification

1. **Health Check**: Visit `https://your-service.onrender.com/healthz`
2. **Dashboard**: Visit `https://your-service.onrender.com/`
3. **Test Log Ingestion**: Use curl or create a test project

## 🔧 Local Development

```bash
# Clone and setup
git clone <your-repo>
cd tekno-logger
npm install

# Configure environment
cp .env.example .env
# Edit .env with your local MySQL settings

# Initialize database
npm run migrate:dev
npm run seed:dev

# Start development server
npm run dev
```

## 📞 Troubleshooting

### Common Issues
- **Database Connection**: Verify DreamHost allows external connections
- **Environment Variables**: Ensure all required variables are set
- **Health Check Failing**: Check database connectivity and service startup
- **Rate Limiting Issues**: Verify ADMIN_TOKEN matches between service and workflows

### Support Resources
- Check service logs in Render dashboard
- Verify database connectivity from local machine first
- Test API endpoints individually before full integration

---

For detailed technical specifications, see `COPILOT_BRIEF.md`.
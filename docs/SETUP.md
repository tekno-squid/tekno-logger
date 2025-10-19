# Setup Guide

## 🚀 Quick Setup

### 1. Database (Required)
**DreamHost MySQL** or any MySQL 8.0+

```bash
# Create database and user
CREATE DATABASE tekno_logger;
CREATE USER 'logger_user'@'%' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON tekno_logger.* TO 'logger_user'@'%';
```

### 2. Environment Variables
Copy `.env.template` to `.env` and configure:

```bash
# Database (Required)
DB_HOST=mysql.yourdomain.com
DB_NAME=tekno_logger
DB_USER=logger_user
DB_PASS=your_secure_password

# Security Secrets (Required)
HMAC_SECRET=generate_32_char_random_string_here
ADMIN_TOKEN=generate_32_char_random_token_here

# System Limits (Defaults provided)
DEFAULT_RETENTION_DAYS=30
MAX_PAYLOAD_BYTES=524288
MAX_EVENTS_PER_POST=250
RATE_LIMIT_PER_MINUTE=5000
RATE_LIMIT_PER_IP=100
```

### 3. Generate Secrets
```bash
# Generate HMAC secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate admin token  
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Initialize Database
```bash
npm run migrate:dev
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
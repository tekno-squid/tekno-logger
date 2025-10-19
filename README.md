# Tekno Logger

A minimal overflow logging service designed to act as a backup when primary logging providers exceed quota, and as a debugging/alert surface. Built with TypeScript, Fastify, and MySQL.

## 🎯 Purpose

- **Overflow backup** when primary logging services (Sentry, Logtail) hit quotas
- **Debugging surface** for investigating issues with short retention (24-72h)
- **Alert system** with Discord notifications for error spikes
- **Lightweight deployment** on Render free tier with DreamHost MySQL

## 🏗️ Architecture

- **Backend**: Node.js + Fastify + TypeScript
- **Database**: MySQL (DreamHost shared hosting)
- **Frontend**: Modern vanilla JS SPA with responsive design
- **UI Framework**: CSS custom properties, mobile-first responsive design
- **Deployment**: Render web service
- **Monitoring**: Built-in health checks and metrics with web dashboard

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MySQL database (DreamHost recommended)
- Git

### Setup

**📖 See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions including:**
- Database creation and configuration
- Environment variable setup
- Security secret generation
- External service integration (Discord, Sentry)

### Local Development

1. **Clone and setup:**
```bash
git clone <your-repo-url>
cd tekno-logger
npm install
cp .env.template .env
# Edit .env with your configuration
```

2. **Initialize database:**
```bash
npm run migrate:dev
```

3. **Start development server:**
```bash
npm run dev
```

The service will be available at `http://localhost:3000`

## 📦 Deployment

### Render Deployment

1. **Connect repository** to Render
2. **Configure environment variables** in Render dashboard
3. **Deploy** using the provided `render.yaml` configuration

See the deployment section below for setup instructions.

### Environment Variables

Required environment variables:

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DB_HOST=mysql.example.com
DB_NAME=your_database
DB_USER=your_username
DB_PASS=your_password

# Security
HMAC_SECRET=your-32-char-secret
ADMIN_TOKEN=your-admin-token

# Limits
DEFAULT_RETENTION_DAYS=3
MAX_PAYLOAD_BYTES=524288
MAX_EVENTS_PER_POST=250
```

## 🔌 API Reference

### Log Ingestion

```bash
POST /log
Content-Type: application/json
X-Project-Key: your-project-api-key
X-Signature: sha256=hmac-signature

[
  {
    "ts": "2024-01-15T10:30:00.000Z",
    "level": "error",
    "message": "Database connection failed",
    "source": "api.database",
    "env": "production",
    "ctx": {"error": "Connection timeout"},
    "user_id": "user123",
    "request_id": "req-456"
  }
]
```

### Log Query

```bash
GET /logs?project_id=1&level=error&from=2024-01-15T00:00:00Z&limit=100
```

### Health Check

```bash
GET /healthz
# Returns: {"ok": true, "database": "connected", "uptime": 12345}
```

## 🎛️ Dashboard Features

- **🎨 Modern Web Interface**: Clean, responsive dashboard with professional styling
- **📊 Real-time Dashboard**: Live error rates, event counts, top fingerprints, recent errors
- **🔍 Advanced Search**: Filter by project, level, time range, message content with pagination
- **📱 Mobile-first Design**: Responsive interface that works on all screen sizes
- **🎯 Project Management**: Complete CRUD operations with modal dialogs and validation
- **⚙️ Admin Interface**: System health monitoring, maintenance controls, configuration management
- **🎨 Modern UX**: Toast notifications, loading states, smooth transitions, professional styling

## 🔒 Security

- **HMAC signature verification** for all log ingestion
- **API key authentication** per project
- **Rate limiting** per project and per IP
- **Admin token protection** for management endpoints
- **Input validation** and SQL injection prevention

## 📊 Rate Limiting

- **Per project**: 5000 events/minute (configurable)
- **Per IP**: 100 requests/minute
- **Payload size**: Max 512KB per request
- **Batch size**: Max 250 events per request

## � Self-Maintenance

The service maintains itself automatically:

- **Smart Triggering**: Maintenance runs during normal log ingestion (every 5+ minutes)  
- **Non-Blocking**: Maintenance doesn't slow down log responses
- **Manual Fallback**: Admin endpoints available for manual maintenance and purging
- **Zero External Costs**: No scheduled jobs or external services required

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📝 Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run migrate      # Run database migrations
npm run seed         # Seed initial data
npm run purge        # Trigger data purge
npm run maintain     # Trigger maintenance tasks
```

## � Deployment

### Prerequisites
- Render account
- DreamHost MySQL database (or local MySQL for development)
- Discord webhook URL (optional, for alerts)

### Quick Setup

1. **Database Setup (DreamHost)**
   - Create MySQL database and user in DreamHost panel
   - Add "%" to allowable hosts for external connections
   - Note connection details (host, database, username, password)

2. **Render Deployment**
   - Connect GitHub repository to Render
   - Set environment variables (see `.env.example`)
   - Deploy with: Build Command: `npm ci && npm run build`, Start: `npm start`

3. **Initialize**
   ```bash
   # Option 1: GitHub Actions (Recommended)
   # Use "Deploy Database Schema" workflow in GitHub Actions
   # See docs/DATABASE_DEPLOYMENT.md for setup
   
   # Option 2: Manual via Render console
   npm run migrate  # Create database tables
   ```

### Environment Variables
Copy `.env.example` to `.env` and configure:
```bash
DB_HOST=mysql.example.com     # DreamHost MySQL host
DB_NAME=your_database         # Database name
DB_USER=your_username         # Database username  
DB_PASS=your_password         # Database password
HMAC_SECRET=32-char-secret    # Generate random secret
ADMIN_TOKEN=32-char-token     # Generate random token
```

### Maintenance
The service maintains itself automatically during normal operation. Manual admin endpoints available:
- `POST /admin/maintain` - Run maintenance tasks
- `POST /admin/purge` - Clean old log data

## 🗂️ Project Structure

```
tekno-logger/
├── src/
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic  
│   ├── middleware/      # Authentication, rate limiting
│   ├── types/          # TypeScript definitions
│   └── utils/          # Helper functions
├── public/             # Modern web dashboard UI
│   ├── index.html      # Responsive dashboard interface
│   ├── js/app.js       # Complete frontend functionality
│   └── css/styles.css  # Modern responsive styling
├── migrations/         # Database schema files
├── scripts/           # Maintenance and setup scripts
├── docs/              # Documentation
│   └── SETUP.md       # Setup and deployment guide
└── tests/             # Test files
```

## 📋 Development Phases

### ✅ Phase 1: Core Infrastructure (COMPLETED)
**Foundation & Database Layer**
- ✅ Environment configuration with Zod validation (`src/config.ts`)
- ✅ TypeScript foundation with comprehensive types (`src/types/index.ts`)
- ✅ Database service with connection pooling (`src/services/database.ts`)
- ✅ Migration runner with version tracking (`scripts/migrate.ts`)
- ✅ Development environment setup (`.env`, tooling)

### ✅ Phase 2: Core API (COMPLETED)
**HTTP Server & Authentication**
- ✅ Fastify application factory with middleware setup (`src/app.ts`)
- ✅ HMAC authentication middleware (`src/middleware/auth.ts`)
- ✅ Rate limiting middleware (`src/middleware/rateLimit.ts`)
- ✅ Core `/log` endpoint with bulk processing (`src/routes/logs.ts`)
- ✅ System health endpoints (`src/routes/system.ts`)
- ✅ Server entry point with graceful shutdown (`src/index.ts`)

### ✅ Phase 3: System Endpoints (COMPLETED)
**Administration & Monitoring**
- ✅ Admin middleware for protected routes
- ✅ Maintenance endpoints (`/admin/maintain`, `/admin/purge`)
- ✅ Metrics and stats endpoints
- ✅ Project management endpoints

### ⏳ Phase 4: Alert System (SKIPPED - TO BE IMPLEMENTED LATER)
**Discord Integration & Smart Alerts**
- [ ] Discord webhook service (`src/services/discord.ts`)
- [ ] Alert rule engine with spike detection
- [ ] Background alert processing
- [ ] Alert configuration management

### ✅ Phase 5: Web Interface (COMPLETED)
**Modern Frontend Management UI**
- ✅ Responsive HTML5 dashboard with tab navigation (`public/index.html`)
- ✅ Complete JavaScript SPA with API integration (`public/js/app.js`)
- ✅ Modern CSS design system with responsive styling (`public/css/styles.css`)
- ✅ Real-time dashboard with live statistics and monitoring
- ✅ Advanced log search and filtering interface with pagination
- ✅ Project management interface with CRUD operations and validation
- ✅ Admin interface with system health and maintenance controls
- ✅ Mobile-first responsive design with professional UX

### ⏳ Phase 6: Production Readiness
**Testing, Deployment & Optimization**
- [ ] Comprehensive testing suite (unit, integration, e2e)
- [ ] Performance optimization and load testing
- [ ] Production environment setup and deployment
- [ ] Dashboard integration testing with live backend
- [ ] Monitoring and error tracking setup

## 🚀 Roadmap (Future Enhancements)
- [ ] Discord alert system integration (Phase 4)
- [ ] Full-text search on messages
- [ ] Advanced alerting rules (custom conditions)
- [ ] Export capabilities (JSON/CSV)
- [ ] Real-time log streaming with WebSockets
- [ ] Horizontal scaling support
- [ ] GraphQL API option
- [ ] Enhanced dashboard analytics and charts
- [ ] Retention policy automation
- [ ] Advanced filtering and search capabilities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the documentation in `/docs`
2. Review existing GitHub issues
3. Create a new issue with detailed information

---

Built with ❤️ for reliable logging overflow management
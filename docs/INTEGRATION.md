# Tekno Logger Integration Guide

## Quick Setup

### 1. Get Project Credentials
1. Visit your Tekno Logger dashboard: `https://your-logger.onrender.com`
2. Create a new project in the "Projects" tab
3. Note your **Project Key** and **HMAC Secret**

### 2. Install & Configure

#### Node.js/JavaScript
```bash
npm install node-fetch crypto
```

```javascript
// logger.js
const crypto = require('crypto');

class TeknoLogger {
  constructor(projectKey, hmacSecret, baseUrl) {
    this.projectKey = projectKey;
    this.hmacSecret = hmacSecret;
    this.baseUrl = baseUrl;
  }

  generateSignature(body) {
    return crypto.createHmac('sha256', this.hmacSecret).update(body).digest('hex');
  }

  async log(level, message, context = {}) {
    const events = [{
      level,
      message,
      source: context.source || 'app',
      timestamp: new Date().toISOString(),
      context
    }];

    const body = JSON.stringify(events);
    const signature = this.generateSignature(body);

    const response = await fetch(`${this.baseUrl}/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': this.projectKey,
        'X-Signature': signature
      },
      body
    });

    if (!response.ok) throw new Error(`Logging failed: ${response.status}`);
    return response.json();
  }

  error(message, context) { return this.log('error', message, context); }
  warn(message, context) { return this.log('warn', message, context); }
  info(message, context) { return this.log('info', message, context); }
}

module.exports = TeknoLogger;
```

#### Python
```bash
pip install requests
```

```python
# logger.py
import hashlib
import hmac
import json
import requests
from datetime import datetime

class TeknoLogger:
    def __init__(self, project_key, hmac_secret, base_url):
        self.project_key = project_key
        self.hmac_secret = hmac_secret
        self.base_url = base_url

    def log(self, level, message, context=None):
        events = [{
            'level': level,
            'message': message,
            'source': context.get('source', 'app') if context else 'app',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'context': context or {}
        }]
        
        body = json.dumps(events)
        signature = hmac.new(
            self.hmac_secret.encode(),
            body.encode(),
            hashlib.sha256
        ).hexdigest()
        
        response = requests.post(f'{self.base_url}/log', 
            data=body,
            headers={
                'Content-Type': 'application/json',
                'X-Project-Key': self.project_key,
                'X-Signature': signature
            }
        )
        response.raise_for_status()
        return response.json()

    def error(self, message, context=None):
        return self.log('error', message, context)
    
    def warn(self, message, context=None):
        return self.log('warn', message, context)
    
    def info(self, message, context=None):
        return self.log('info', message, context)
```

### 3. Usage

#### Environment Variables
```bash
TEKNO_LOGGER_PROJECT_KEY=your-project-key
TEKNO_LOGGER_HMAC_SECRET=your-hmac-secret  
TEKNO_LOGGER_URL=https://your-logger.onrender.com
```

#### Basic Usage
```javascript
// Node.js
const TeknoLogger = require('./logger');
const logger = new TeknoLogger(
  process.env.TEKNO_LOGGER_PROJECT_KEY,
  process.env.TEKNO_LOGGER_HMAC_SECRET,
  process.env.TEKNO_LOGGER_URL
);

// Log events
await logger.error('Payment failed', { 
  userId: 123, 
  amount: 99.99,
  source: 'payment-api' 
});

await logger.info('User login', { 
  userId: 123, 
  ip: req.ip,
  source: 'auth' 
});
```

```python
# Python
from logger import TeknoLogger
import os

logger = TeknoLogger(
    os.getenv('TEKNO_LOGGER_PROJECT_KEY'),
    os.getenv('TEKNO_LOGGER_HMAC_SECRET'),
    os.getenv('TEKNO_LOGGER_URL')
)

# Log events
logger.error('Payment failed', {
    'userId': 123,
    'amount': 99.99,
    'source': 'payment-api'
})

logger.info('User login', {
    'userId': 123,
    'ip': request.remote_addr,
    'source': 'auth'
})
```

### 4. Advanced Usage

#### Error Handling with Fallbacks
```javascript
async function safeLog(level, message, context) {
  try {
    await logger[level](message, context);
  } catch (error) {
    // Fallback to console if logger fails
    console[level](`[FALLBACK] ${message}`, context);
  }
}
```

#### Batch Logging
```javascript
const events = [
  { level: 'info', message: 'User registered', context: { userId: 123 } },
  { level: 'info', message: 'Email sent', context: { userId: 123, type: 'welcome' } }
];

const body = JSON.stringify(events);
const signature = logger.generateSignature(body);

await fetch(`${logger.baseUrl}/log`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Project-Key': logger.projectKey,
    'X-Signature': signature
  },
  body
});
```

#### Express.js Middleware
```javascript
function loggerMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    
    await safeLog(level, `${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      source: 'api'
    });
  });
  
  next();
}

app.use(loggerMiddleware);
```

## Best Practices

- **Use meaningful context**: Include user IDs, request IDs, and relevant data
- **Set appropriate sources**: Group logs by component (api, auth, payment, etc.)
- **Handle failures gracefully**: Always have console fallbacks
- **Batch when possible**: Send multiple events in one request
- **Use async logging**: Don't block your application flow

## Log Levels

- **error**: Failures that need immediate attention
- **warn**: Issues that should be monitored  
- **info**: General operational information
- **debug**: Detailed debugging information (filtered in production)

## Rate Limits

- **5,000 events/minute** per project
- **100 requests/minute** per IP
- **250 events** per request maximum
- **512KB** maximum payload size

## Troubleshooting

- **401 Unauthorized**: Check project key and HMAC signature
- **429 Too Many Requests**: You've hit rate limits, implement backoff
- **413 Payload Too Large**: Reduce batch size or event data
- **500 Server Error**: Logger service issue, use fallback logging
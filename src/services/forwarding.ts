/**
 * Log forwarding service for Sentry and BetterStack
 * Handles actual forwarding of test logs to external logging services
 */

import { appConfig } from '@/config';

interface ForwardingResult {
  service: string;
  success: boolean;
  status?: number;
  responseTime: number;
  error: string | null;
  response?: any;
}

/**
 * Forward log to Sentry
 */
export async function forwardToSentry(logData: {
  level: string;
  message: string;
  source: string;
  env: string;
  ctx?: Record<string, unknown>;
}): Promise<ForwardingResult> {
  const startTime = Date.now();

  if (!appConfig.testing.sentryDsn) {
    return {
      service: 'Sentry',
      success: false,
      responseTime: 0,
      error: 'Sentry DSN not configured'
    };
  }

  try {
    // Parse Sentry DSN to get project ID and endpoint
    const dsnMatch = appConfig.testing.sentryDsn.match(/https:\/\/(.+)@(.+)\/(\d+)/);
    if (!dsnMatch) {
      throw new Error('Invalid Sentry DSN format');
    }

    const [, publicKey, host, projectId] = dsnMatch;
    const sentryUrl = `https://${host}/api/${projectId}/store/`;

    // Build Sentry event payload
    const sentryEvent = {
      event_id: generateUUID(),
      timestamp: Date.now() / 1000,
      platform: 'node',
      level: mapLevelToSentry(logData.level),
      logger: logData.source,
      message: {
        message: logData.message
      },
      environment: logData.env,
      extra: logData.ctx || {},
      tags: {
        source: 'tekno-logger-test'
      }
    };

    const response = await fetch(sentryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=tekno-logger/1.0`
      },
      body: JSON.stringify(sentryEvent)
    });

    return {
      service: 'Sentry',
      success: response.ok,
      status: response.status,
      responseTime: Date.now() - startTime,
      error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
      response: response.ok ? { event_id: sentryEvent.event_id } : null
    };

  } catch (error) {
    return {
      service: 'Sentry',
      success: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Forward log to BetterStack (Logtail)
 */
export async function forwardToBetterStack(logData: {
  level: string;
  message: string;
  source: string;
  env: string;
  ctx?: Record<string, unknown>;
}): Promise<ForwardingResult> {
  const startTime = Date.now();

  if (!appConfig.testing.betterstackToken || !appConfig.testing.betterstackEndpoint) {
    return {
      service: 'BetterStack',
      success: false,
      responseTime: 0,
      error: 'BetterStack not configured (TEST_BETTERSTACK_TOKEN and TEST_BETTERSTACK_ENDPOINT environment variables required)'
    };
  }

  try {
    // BetterStack endpoint varies by region - use the provided endpoint
    const betterstackUrl = appConfig.testing.betterstackEndpoint;

    // Build payload in BetterStack format
    const payload = {
      dt: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'), // Format: "2025-10-24 12:34:56 UTC"
      message: logData.message,
      level: logData.level.toLowerCase(), // BetterStack uses lowercase
      // Flatten all context fields to root level
      ...logData.ctx,
      // Add metadata fields
      source: logData.source,
      env: logData.env
    };

    // BetterStack uses Bearer token authentication in header
    const response = await fetch(betterstackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appConfig.testing.betterstackToken}`
      },
      body: JSON.stringify(payload)
    });

    let responseText = '';
    try {
      responseText = await response.text();
    } catch (e) {
      // Ignore text parsing errors
    }
    
    return {
      service: 'BetterStack',
      success: response.ok,
      status: response.status,
      responseTime: Date.now() - startTime,
      error: response.ok ? null : `HTTP ${response.status}: ${responseText || response.statusText}`,
      response: response.ok ? { message: 'Log sent to BetterStack' } : null
    };

  } catch (error) {
    return {
      service: 'BetterStack',
      success: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Map log level to Sentry format
 */
function mapLevelToSentry(level: string): string {
  const mapping: Record<string, string> = {
    debug: 'debug',
    info: 'info',
    warn: 'warning',
    error: 'error',
    fatal: 'fatal'
  };
  return mapping[level] || 'info';
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

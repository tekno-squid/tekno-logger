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

  if (!appConfig.testing.betterstackToken) {
    console.log('[BetterStack] Token not configured - check TEST_BETTERSTACK_TOKEN env var');
    return {
      service: 'BetterStack',
      success: false,
      responseTime: 0,
      error: 'BetterStack token not configured (TEST_BETTERSTACK_TOKEN environment variable missing)'
    };
  }

  try {
    // BetterStack Logtail expects source token in the URL as query parameter
    const betterstackUrl = `https://in.logs.betterstack.com/?source_token=${appConfig.testing.betterstackToken}`;

    // Build payload in BetterStack format
    const payload = {
      dt: new Date().toISOString(),
      level: logData.level.toLowerCase(), // BetterStack uses lowercase
      message: logData.message,
      // Flatten all context fields to root level
      ...logData.ctx,
      // Add metadata fields
      source: logData.source,
      env: logData.env
    };

    console.log('[BetterStack] Sending log:', { url: 'in.logs.betterstack.com', level: payload.level, message: payload.message });

    // BetterStack accepts single objects or arrays
    const response = await fetch(betterstackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let responseText = '';
    try {
      responseText = await response.text();
    } catch (e) {
      // Ignore text parsing errors
    }
    
    console.log('[BetterStack] Response:', { status: response.status, ok: response.ok, body: responseText.substring(0, 200) });
    
    return {
      service: 'BetterStack',
      success: response.ok,
      status: response.status,
      responseTime: Date.now() - startTime,
      error: response.ok ? null : `HTTP ${response.status}: ${responseText || response.statusText}`,
      response: response.ok ? { message: 'Log sent to BetterStack' } : null
    };

  } catch (error) {
    console.error('[BetterStack] Error:', error instanceof Error ? error.message : 'Unknown error');
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

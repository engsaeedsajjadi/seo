/**
 * RankForge — Configuration
 * Fail-fast for missing secrets in production
 */

export function getEnv(name: string, required = false, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (required && !value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name} — FAIL FAST in production`);
    }
    console.warn(`Missing env ${name}, using default`);
    return defaultValue || '';
  }
  return value || '';
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: getEnv('NODE_ENV', false, 'development'),
  port: parseInt(getEnv('PORT', false, '3001'), 10),
  appUrl: getEnv('APP_URL', false, 'http://localhost:3000'),
  corsOrigins: getEnv('CORS_ORIGINS', false, 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim()),

  database: {
    url: getEnv('DATABASE_URL', false, ''),
    password: getEnv('DATABASE_PASSWORD', false, ''),
  },

  redis: {
    url: getEnv('REDIS_URL', false, ''),
  },

  auth: {
    jwtSecret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET is required in production — FAIL FAST');
        }
        console.warn('JWT_SECRET not set, using insecure dev fallback — NOT FOR PRODUCTION');
        return 'dev-jwt-secret-min-32-chars-change-in-production-required';
      }
      if (secret.length < 32) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET must be at least 32 characters in production');
        }
        console.warn('JWT_SECRET too short, should be >=32 chars');
      }
      if (secret.includes('change-in-production') && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET contains placeholder value in production — FAIL FAST');
      }
      return secret;
    })(),
    encryptionKey: getEnv('ENCRYPTION_KEY', false, ''),
  },

  providers: {
    dataforseo: {
      login: getEnv('DATAFORSEO_LOGIN', false, ''),
      password: getEnv('DATAFORSEO_PASSWORD', false, ''),
    },
    serpapi: getEnv('SERPAPI_KEY', false, ''),
    openai: getEnv('OPENAI_API_KEY', false, ''),
    anthropic: getEnv('ANTHROPIC_API_KEY', false, ''),
    googleAi: getEnv('GOOGLE_AI_API_KEY', false, ''),
    openrouter: getEnv('OPENROUTER_API_KEY', false, ''),
    perplexity: getEnv('PERPLEXITY_API_KEY', false, ''),
    google: {
      clientId: getEnv('GOOGLE_CLIENT_ID', false, ''),
      clientSecret: getEnv('GOOGLE_CLIENT_SECRET', false, ''),
    },
    pagespeed: getEnv('PAGESPEED_API_KEY', false, ''),
    stripe: {
      secretKey: getEnv('STRIPE_SECRET_KEY', false, ''),
      webhookSecret: getEnv('STRIPE_WEBHOOK_SECRET', false, ''),
      publishableKey: getEnv('STRIPE_PUBLISHABLE_KEY', false, ''),
    },
    s3: {
      endpoint: getEnv('S3_ENDPOINT', false, ''),
      accessKey: getEnv('S3_ACCESS_KEY', false, ''),
      secretKey: getEnv('S3_SECRET_KEY', false, ''),
      bucket: getEnv('S3_BUCKET', false, 'rankforge-storage'),
      region: getEnv('S3_REGION', false, 'us-east-1'),
    },
  },

  worker: {
    concurrency: parseInt(getEnv('WORKER_CONCURRENCY', false, '5'), 10),
    timeout: parseInt(getEnv('WORKER_TIMEOUT', false, '300000'), 10),
  },

  crawler: {
    maxConcurrency: parseInt(getEnv('CRAWLER_MAX_CONCURRENCY', false, '10'), 10),
    defaultDelay: parseInt(getEnv('CRAWLER_DEFAULT_DELAY', false, '1000'), 10),
    userAgent: getEnv('CRAWLER_USER_AGENT', false, 'RankForge/1.0 (+https://rankforge.io/bot)'),
    timeout: parseInt(getEnv('CRAWLER_TIMEOUT', false, '30000'), 10),
  },

  rateLimit: {
    windowMs: parseInt(getEnv('RATE_LIMIT_WINDOW_MS', false, '900000'), 10),
    maxRequests: parseInt(getEnv('RATE_LIMIT_MAX_REQUESTS', false, '100'), 10),
  },

  features: {
    aiEnabled: getEnv('FEATURE_AI_ENABLED', false, 'true') === 'true',
    geoEnabled: getEnv('FEATURE_GEO_ENABLED', false, 'true') === 'true',
    aeoEnabled: getEnv('FEATURE_AEO_ENABLED', false, 'true') === 'true',
    advancedCrawling: getEnv('FEATURE_ADVANCED_CRAWLING', false, 'true') === 'true',
    mcpEnabled: getEnv('FEATURE_MCP_ENABLED', false, 'true') === 'true',
  },

  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
};

export function isProviderConfigured(provider: keyof typeof config.providers): boolean {
  const p = config.providers[provider];
  if (typeof p === 'string') return !!p;
  if (typeof p === 'object') {
    if ('login' in p) return !!(p as any).login && !!(p as any).password;
    if ('clientId' in p) return !!(p as any).clientId && !!(p as any).clientSecret;
    if ('secretKey' in p) return !!(p as any).secretKey;
    if ('accessKey' in p) return !!(p as any).accessKey && !!(p as any).secretKey;
  }
  return false;
}

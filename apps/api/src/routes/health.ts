import { Router } from 'express';
import { getPool, isDatabaseConfigured } from '../lib/db.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  const checks: Record<string, any> = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: isDatabaseConfigured() ? 'configured' : 'memory_fallback',
      redis: process.env.REDIS_URL ? 'configured' : 'not_configured',
      stripe: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured',
      dataforseo: process.env.DATAFORSEO_LOGIN ? 'configured' : 'not_configured',
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
    }
  };

  // Check database connectivity if configured
  if (isDatabaseConfigured()) {
    try {
      const pool = getPool();
      if (pool) {
        await pool.query('SELECT 1');
        checks.services.database = 'healthy';
      }
    } catch (error) {
      checks.services.database = 'unhealthy';
      checks.status = 'degraded';
    }
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(checks);
});

healthRouter.get('/ready', (req, res) => {
  res.json({ ready: true, timestamp: new Date().toISOString() });
});

healthRouter.get('/live', (req, res) => {
  res.json({ alive: true, timestamp: new Date().toISOString() });
});

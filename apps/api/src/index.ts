/**
 * RankForge — Production API Server Bootstrap
 * Real PostgreSQL persistence, no memoryDB in production path
 * 
 * Architecture: Frontend → API → PostgreSQL → Redis/Queue → Workers
 * This file only bootstraps the application — business logic in app.ts
 */

import { createApp } from './app.js';
import { config } from './config/index.js';
import { closePool } from './db/client.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`🚀 RankForge API running on port ${config.port}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔗 CORS: ${config.corsOrigins.join(', ')}`);
  console.log(`💾 Database: ${config.database.url ? 'PostgreSQL configured' : 'NOT CONFIGURED (will fail fast in production)'}`);
  console.log(`🔑 Providers: DataForSEO=${!!config.providers.dataforseo.login}, OpenAI=${!!config.providers.openai}, Stripe=${!!config.providers.stripe.secretKey}`);
});

function gracefulShutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await closePool();
      console.log('Database pool closed');
    } catch (e) {
      console.error('Error closing DB pool:', e);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

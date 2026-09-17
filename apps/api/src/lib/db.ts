/**
 * RankForge — Database Layer (Legacy Compatibility)
 * This file previously exported memoryDB — now it re-exports real client and throws if used
 * memoryDB removed from production path per master prompt
 */

import { getPool, query, isDatabaseConfigured, checkDatabaseHealth } from '../db/client.js';

// For backward compatibility, export real DB functions
export { getPool, query, isDatabaseConfigured, checkDatabaseHealth };

// memoryDB is REMOVED from production path
// If any code tries to use it in production, it will fail fast
export const memoryDB = new Proxy({} as any, {
  get() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('memoryDB is removed from production path — use real PostgreSQL repositories. FAIL FAST.');
    }
    console.warn('memoryDB accessed — this is development fallback only, not for production');
    // Return empty maps for dev without DB
    return new Map();
  },
});

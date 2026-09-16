import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { auditRouter } from './routes/audit.js';
import { keywordsRouter } from './routes/keywords.js';
import { rankingsRouter } from './routes/rankings.js';
import { jobsRouter } from './routes/jobs.js';
import { reportsRouter } from './routes/reports.js';
import { alertsRouter } from './routes/alerts.js';
import { integrationsRouter } from './routes/integrations.js';
import { organizationsRouter } from './routes/organizations.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';
import { requestLogger } from './middleware/logging.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
app.use(pinoHttp());
app.use(requestLogger);

// Health check (no auth required)
app.use('/api/v1/health', healthRouter);

// Auth routes (no auth required for login/signup)
app.use('/api/v1/auth', authRouter);

// Protected routes (auth required)
app.use('/api/v1/organizations', authMiddleware, organizationsRouter);
app.use('/api/v1/projects', authMiddleware, projectsRouter);
app.use('/api/v1/audit', authMiddleware, auditRouter);
app.use('/api/v1/keywords', authMiddleware, keywordsRouter);
app.use('/api/v1/rankings', authMiddleware, rankingsRouter);
app.use('/api/v1/jobs', authMiddleware, jobsRouter);
app.use('/api/v1/reports', authMiddleware, reportsRouter);
app.use('/api/v1/alerts', authMiddleware, alertsRouter);
app.use('/api/v1/integrations', authMiddleware, integrationsRouter);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`RankForge API server running on port ${PORT}`);
});

export default app;

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { aiLimiter } from './src/api/middleware/rateLimit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

// Import routes
import proposalsRouter from './src/api/proposals';
import rulesRouter from './src/api/rules';
import templatesRouter from './src/api/templates';
import auditRouter from './src/api/audit';
import analyzeRouter from './src/api/analyze';
import usersRouter from './src/api/users';
import integrationsRouter from './src/api/integrations';
import authRouter from './src/api/auth';
import oauthRouter from './src/api/oauth';
import filesRouter from './src/api/files';
import analyticsRouter from './src/api/analytics';
import notificationsRouter from './src/api/notifications';

const app = express();
// Render (and most PaaS) inject PORT; fall back to API_PORT for local dev.
const PORT = process.env.PORT || process.env.API_PORT || 3001;

// CORS configuration - restrict to production domain in production
// In development: allows localhost origins for local testing
// In production: only allows PRODUCTION_URL from environment variable
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowedOrigins = isDevelopment
  ? [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
    ]
  : [process.env.PRODUCTION_URL || 'https://your-production-domain.com'];

// Security headers. crossOriginResourcePolicy is relaxed so the SPA/API can
// serve cross-origin assets (e.g. PDF/file downloads) without being blocked.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Don't throw: an unknown origin should just miss the CORS headers, not turn
      // every request into a 500. In production the SPA is served by this same
      // process, so same-origin calls must keep working even if PRODUCTION_URL
      // is unset or misconfigured in the dashboard.
      console.warn(`CORS: origin not in allow list: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
// authLimiter is applied per-route inside the router so the read-only /session
// lookup the SPA makes on every load isn't throttled alongside credential posts.
app.use('/api/auth', authRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/analyze', aiLimiter, analyzeRouter);
app.use('/api/users', usersRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/files', filesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/notifications', notificationsRouter);

// In production, serve the built SPA from dist/ and let client-side routing
// handle any non-API path (Express 5: use a catch-all middleware, not '*').
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handler
// The unused 4th parameter is required: Express only treats 4-arg middleware as an error handler.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎨 Frontend dev server: http://localhost:8080`);
  console.log('✅ Server started successfully');
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please close the other server or use a different port.`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle various termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  // Don't exit in development to allow for debugging
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('uncaughtException');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit in development to allow for debugging
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

export default app;

/**
 * The Express application: middleware, routes, static SPA serving and the error
 * handler. Building it is separate from listening (server.ts) so tests can mount
 * the real thing without opening a port.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

import { aiLimiter } from './middleware/rateLimit';
import { logger } from './lib/logger';

import proposalsRouter from './proposals';
import rulesRouter from './rules';
import templatesRouter from './templates';
import auditRouter from './audit';
import analyzeRouter from './analyze';
import usersRouter from './users';
import integrationsRouter from './integrations';
import authRouter from './auth';
import oauthRouter from './oauth';
import filesRouter from './files';
import analyticsRouter from './analytics';
import notificationsRouter from './notifications';

/**
 * Express "trust proxy" from TRUST_PROXY: a hop count ("1"), "true"/"false", or a
 * subnet list. Behind a platform proxy (Render, Heroku, ...) the client's address
 * arrives in X-Forwarded-For; without trusting exactly one hop every visitor looks
 * like the proxy, so the per-IP rate limits would be shared by everyone — ten
 * failed logins from anywhere would lock all users out. Defaults to one hop in
 * production, off elsewhere.
 */
export function parseTrustProxy(value: string | undefined, isProduction: boolean): boolean | number | string {
  if (value === undefined || value === '') return isProduction ? 1 : false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
}

export interface AppOptions {
  /** Built SPA directory; served (with an index.html fallback) when NODE_ENV=production. */
  distPath?: string;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY, isProduction));

  // CORS configuration - restrict to production domain in production
  // In development: allows localhost origins for local testing
  // In production: only allows PRODUCTION_URL from environment variable
  const allowedOrigins = isProduction
    ? [process.env.PRODUCTION_URL || 'https://your-production-domain.com']
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:8080',
      ];

  // Security headers. crossOriginResourcePolicy is relaxed so the SPA/API can
  // serve cross-origin assets (e.g. PDF/file downloads) without being blocked.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

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
        logger.warn(`CORS: origin not in allow list: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
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

  // Unknown API paths answer in JSON, like every other API response (not an HTML 404).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // In production, serve the built SPA from dist/ and let client-side routing
  // handle any non-API path (Express 5: use a catch-all middleware, not '*').
  if (isProduction && options.distPath) {
    const distPath = options.distPath;
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handler
  // The unused 4th parameter is required: Express only treats 4-arg middleware as an error handler.
  app.use((err: Error & { status?: number; statusCode?: number; expose?: boolean }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status ?? err.statusCode ?? 500;

    // Client errors raised by Express/body-parser (malformed JSON -> 400, body too
    // large -> 413) carry messages that are safe to show.
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: err.expose ? err.message : 'Bad request' });
    }

    logger.error('API Error:', err);
    // Never leak internals (database errors, stack details) from a production server.
    res.status(500).json({ error: isProduction ? 'Internal server error' : err.message || 'Internal server error' });
  });

  return app;
}

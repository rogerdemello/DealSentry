/**
 * Rate limiters for sensitive endpoints.
 * - authLimiter: guards against credential brute-force on auth routes.
 * - aiLimiter: guards against runaway Azure OpenAI cost on AI routes.
 *
 * Limits are relaxed automatically outside production so local dev and tests
 * are not throttled.
 */

import rateLimit from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

/** Strict limiter for login/register/change-password. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

/** Limiter for AI generation/analysis endpoints (cost protection). */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isProduction ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please slow down and try again shortly.' },
});

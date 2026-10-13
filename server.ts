// Load environment variables before anything else reads them.
import 'dotenv/config';

import path from 'path';
import { fileURLToPath } from 'url';

import { createApp } from './src/api/app';
import { checkAuthConfig } from './src/api/lib/authConfig';
import { logger } from './src/api/lib/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Render (and most PaaS) inject PORT; fall back to API_PORT for local dev.
const PORT = process.env.PORT || process.env.API_PORT || 3001;

// Refuse to start with an unsafe auth setup (e.g. AUTH_MODE=login without a real
// NEXTAUTH_SECRET) rather than failing on the first request.
try {
  for (const warning of checkAuthConfig()) logger.warn(`⚠️  ${warning}`);
} catch (err) {
  logger.error(`❌ ${(err as Error).message}`);
  process.exit(1);
}

const app = createApp({ distPath: path.join(__dirname, 'dist') });

// Start server with error handling
const server = app.listen(PORT, () => {
  logger.info(`🚀 API Server running on http://localhost:${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/api/health`);
  if (process.env.NODE_ENV !== 'production') {
    logger.info('🎨 Frontend dev server: http://localhost:8080');
  }
  logger.info('✅ Server started successfully');
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`❌ Port ${PORT} is already in use. Please close the other server or use a different port.`);
  } else {
    logger.error('❌ Server error:', err);
  }
  process.exit(1);
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);
  server.close(() => {
    logger.info('✅ Server closed successfully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle various termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught Exception:', err);
  logger.error('Stack:', err.stack);
  // Don't exit in development to allow for debugging
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('uncaughtException');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise);
  logger.error('Reason:', reason);
  // Don't exit in development to allow for debugging
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

export default app;

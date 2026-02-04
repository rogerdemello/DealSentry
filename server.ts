import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/users', usersRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/files', filesRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎨 Frontend dev server: http://localhost:8080`);
});

export default app;

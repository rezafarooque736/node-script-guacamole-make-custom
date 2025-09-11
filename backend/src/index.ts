import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { securityMiddleware } from './middlewares/security.middlewares';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import logger from './configs/logger.config';
import { errorHandler } from './middlewares/error-handler.middleware';
import { createServer } from 'node:http';
import apiRoutes from './routes';

const app: Application = express();

const PORT = process.env.PORT;

app.use(securityMiddleware);

// --- Rate Limiting ---
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min window
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Logging Middleware ---
app.use(
  morgan('combined', {
    stream: {
      write: (msg: string) => logger.info(msg.trim()),
    },
  })
);

// --- Body Parser ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
app.use('/api', apiRoutes);

// --- Health Check Endpoint ---
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toLocaleString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV,
  });
});

// --- 404 Handler ---
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
  });
});

// --- Global Error Handler ---
app.use(errorHandler);

// --- Start Server ---
async function startServer(): Promise<void> {
  try {
    // Create HTTP server
    const server = createServer(app);

    // Start the server
    server.listen(PORT, () => {
      logger.info(`Security Threat Analysis Platform running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

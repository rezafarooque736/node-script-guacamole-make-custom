import helmet from 'helmet';
import cors from 'cors';
import { RequestHandler } from 'express';

/**
 * Combined security middleware for Express apps.
 * Use this to apply helmet and CORS with your custom config.
 */
export const securityMiddleware: RequestHandler[] = [
  helmet(), // Set secure HTTP headers
  cors({
    origin: process.env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  }),
];

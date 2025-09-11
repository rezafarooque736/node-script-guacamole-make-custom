import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

// User and Authentication Types
export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  department?: string | null;
  isVerified: boolean;
  twoFAEnabled: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  department?: string;
}

export interface TwoFactorRequest {
  email: string;
  otp: string;
}

export interface JWTPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

// Analysis and Job Types
export interface AnalysisJob {
  id: string;
  userId: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  progress: number;
  totalIPs: number;
  processedIPs: number;
  validIPs: number;
  invalidIPs: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  estimatedCompletion?: Date | null;
  errorMessage?: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisResult {
  id: string;
  jobId: string;
  ipAddress: string;
  healthStatus?: string | null;
  responseTime?: number | null;
  healthCheckedAt?: Date | null;
  asn?: number | null;
  organization?: string | null;
  country?: string | null;
  isp?: string | null;
  isRailTel: boolean;
  reputationScore?: number | null;
  riskCategory?: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  threatSources: string[];
  hpsmTicketId?: string | null;
  ticketStatus?: string | null;
  isBlocked: boolean;
  blockReason?: string | null;
  blockedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ASNAnalysisResult {
  asn: number;
  organization: string;
  country: string;
  isp: string;
  isRailTel: boolean;
}

// Report Types
export interface SecurityReport {
  id: string;
  jobId: string;
  userId: string;
  title: string;
  description?: string;
  format: 'pdf' | 'excel' | 'json' | 'csv';
  filePath?: string;
  fileSize?: number;
  summary: ReportSummary;
  findings: ReportFinding[];
  recommendations: string[];
  isPublic: boolean;
  sharedWith: string[];
  generatedAt: Date;
  expiresAt?: Date;
  downloadCount: number;
}

export interface ReportSummary {
  totalIPs: number;
  validIPs: number;
  invalidIPs: number;
  railTelIPs: number;
  externalIPs: number;
}

export interface ReportFinding {
  id: string;
  ipAddress: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  recommendation: string;
  evidence: Record<string, unknown>;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Configuration Types
export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  connectionTimeout: number;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

export interface SecurityConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  bcryptRounds: number;
  encryptionKey: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

// Error Types
export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorCode: string;
}

// Socket.IO Types
export interface SocketData {
  userId: string;
  role: string;
}

export interface ServerToClientEvents {
  jobProgress: (_data: { jobId: string; progress: number; status: string }) => void;
  jobComplete: (_data: { jobId: string; results: AnalysisResult[] }) => void;
  notification: (_data: { type: string; message: string; timestamp: Date }) => void;
}

export interface ClientToServerEvents {
  joinRoom: (_roomId: string) => void;
  leaveRoom: (_roomId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

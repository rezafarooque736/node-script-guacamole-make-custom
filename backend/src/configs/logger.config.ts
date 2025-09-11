import winston, { format } from 'winston';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Custom format for structured logging
const structuredFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  format.errors({ stack: true }),
  format.json(),
  format.printf((info) => {
    const {
      timestamp,
      level,
      message,
      service,
      userId,
      requestId,
      ip,
      userAgent,
      method,
      url,
      statusCode,
      responseTime,
      error,
      ...meta
    } = info;

    const logEntry = {
      timestamp,
      level,
      message,
      service: service || 'security-platform-backend',
      ...(userId && { userId }),
      ...(requestId && { requestId }),
      ...(ip && { ip }),
      ...(userAgent && { userAgent }),
      ...(method && { method }),
      ...(url && { url }),
      ...(statusCode && { statusCode }),
      ...(responseTime && { responseTime }),
      ...(error && { error: (error as Error).stack || error }),
      ...meta,
    };

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  format.colorize({ all: true }),
  format.printf((info) => {
    const {
      timestamp,
      level,
      message,
      service,
      userId,
      requestId,
      method,
      url,
      statusCode,
      responseTime,
      error,
    } = info;

    let logMessage = `${timestamp} [${level}]`;

    if (service) logMessage += ` [${service}]`;
    if (requestId) logMessage += ` [${requestId}]`;
    if (userId) logMessage += ` [user:${userId}]`;

    logMessage += `: ${message}`;

    if (method && url) {
      logMessage += ` ${method} ${url}`;
      if (statusCode) logMessage += ` ${statusCode}`;
      if (responseTime) logMessage += ` ${responseTime}ms`;
    }

    if (error) {
      logMessage += `\n${error}`;
    }

    return logMessage;
  })
);

// Create transports array
const transports: winston.transport[] = [];

// Console transport for development
if (process.env.NODE_ENV === 'development') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat,
    })
  );
} else {
  // Console transport for production (structured)
  transports.push(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
      format: structuredFormat,
    })
  );
}

// File transports for production
if (process.env.NODE_ENV === 'production') {
  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      level: 'info',
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  // Security events log file
  transports.push(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'security.log'),
      level: 'warn',
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    })
  );

  // Audit log file
  transports.push(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'audit.log'),
      level: 'info',
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 20,
    })
  );

  // Performance log file
  transports.push(
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'performance.log'),
      level: 'info',
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  levels,
  format: structuredFormat,
  transports,
  exitOnError: false,
});

// Create specialized loggers
export const securityLogger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.printf((info) => {
      return JSON.stringify({
        ...info,
        service: 'security-platform-security',
        category: 'security',
      });
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'security.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
    ...(process.env.NODE_ENV === 'development'
      ? [new winston.transports.Console({ format: consoleFormat })]
      : []),
  ],
});

export const auditLogger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.printf((info) => {
      return JSON.stringify({
        ...info,
        service: 'security-platform-audit',
        category: 'audit',
      });
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'audit.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 20,
    }),
    ...(process.env.NODE_ENV === 'development'
      ? [new winston.transports.Console({ format: consoleFormat })]
      : []),
  ],
});

export const performanceLogger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.printf((info) => {
      return JSON.stringify({
        ...info,
        service: 'security-platform-performance',
        category: 'performance',
      });
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'performance.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    ...(process.env.NODE_ENV === 'development'
      ? [new winston.transports.Console({ format: consoleFormat })]
      : []),
  ],
});

// HTTP request logging middleware
export const httpLogger = (req: any, res: any, next: any) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.http('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: duration,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      requestId: req.id,
    });
  });

  next();
};

// Error logging helper
export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
};

// Security event logging helper
export const logSecurityEvent = (eventType: string, details: Record<string, any>) => {
  securityLogger.warn(`Security Event: ${eventType}`, {
    event_type: eventType,
    severity: details.severity || 'medium',
    ...details,
  });
};

// Audit event logging helper
export const logAuditEvent = (
  action: string,
  resource: string,
  userId?: string,
  details?: Record<string, any>
) => {
  auditLogger.info(`Audit: ${action} on ${resource}`, {
    action,
    resource,
    user_id: userId,
    timestamp: new Date().toISOString(),
    success: details?.success !== false,
    ...details,
  });
};

// Performance logging helper
export const logPerformance = (operation: string, duration: number, details?: Record<string, any>) => {
  performanceLogger.info(`Performance: ${operation}`, {
    operation,
    duration,
    memory_usage: process.memoryUsage(),
    cpu_usage: process.cpuUsage(),
    ...details,
  });
};

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down logger...');
  logger.end();
  securityLogger.end();
  auditLogger.end();
  performanceLogger.end();
});

export default logger;

import { PrismaClient } from '../generated/prisma/index';
import { logger } from './logger.config.js';
import {
  databaseOptimizationConfig,
  dbPerformanceMonitor,
  monitorConnectionPool,
  DatabaseOptimizer,
  checkDatabaseHealth,
} from './database-optimization';
// Removed encryption middleware import

// Singleton Prisma client instance
let prisma: PrismaClient;
let dbOptimizer: DatabaseOptimizer;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Create optimized Prisma client configuration
const createPrismaClient = () => {
  const config = databaseOptimizationConfig;

  // Build optimized database URL with connection pool parameters
  const dbUrl = new URL(process.env.DATABASE_URL!);

  // Add connection pool parameters to the URL
  const poolParams = new URLSearchParams();
  poolParams.set('connection_limit', config.connectionPool.maxConnections.toString());
  poolParams.set('pool_timeout', Math.floor(config.connectionPool.acquireTimeoutMillis / 1000).toString());
  poolParams.set('connect_timeout', Math.floor(config.connectionPool.createTimeoutMillis / 1000).toString());
  poolParams.set('socket_timeout', Math.floor(config.connectionPool.destroyTimeoutMillis / 1000).toString());

  // Add performance optimization parameters
  poolParams.set('statement_cache_size', '100');
  poolParams.set('prepared_statement_cache_queries', '100');
  poolParams.set('prepared_statement_cache_sql_limit', '2048');

  // Add existing search params
  if (dbUrl.search) {
    const existingParams = new URLSearchParams(dbUrl.search);
    for (const [key, value] of existingParams) {
      if (!poolParams.has(key)) {
        poolParams.set(key, value);
      }
    }
  }

  dbUrl.search = poolParams.toString();

  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? [
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
          ]
        : [
            { level: 'query', emit: 'event' },
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
            { level: 'info', emit: 'event' },
          ],
    datasources: {
      db: {
        url: dbUrl.toString(),
      },
    },
  });
};

if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
}

// Initialize database optimizer
dbOptimizer = new DatabaseOptimizer(prisma);

// Encryption middleware removed

// Log database events and monitor performance FIXME: uncomment these below lines
// prisma.$on('error', (e: any) => {
//   logger.error('Database error:', e);
//   dbPerformanceMonitor.logQueryError(e.target || 'unknown', new Error(e.message));
// });

// prisma.$on('warn', (e: any) => {
//   logger.warn('Database warning:', e);
// });

// prisma.$on('query', (e: any) => {
//   // Log query performance
//   dbPerformanceMonitor.logQuery(e.query, e.duration);

//   if (process.env.NODE_ENV !== 'production') {
//     logger.debug('Database query:', {
//       query: e.query.substring(0, 200),
//       params: e.params,
//       duration: `${e.duration}ms`,
//     });
//   }
// });

// Start connection pool monitoring - COMMENTED OUT TO FIX STARTUP HANG
// monitorConnectionPool(prisma);

// Initialize database optimization tasks
const initializeDatabaseOptimization = async () => {
  try {
    // Check database health on startup
    const health = await checkDatabaseHealth(prisma);
    logger.info('Database health check:', health);

    // Schedule periodic maintenance tasks
    if (databaseOptimizationConfig.indexing.autoCreateIndexes) {
      // Update table statistics daily
      setInterval(async () => {
        try {
          await dbOptimizer.updateTableStatistics();
          logger.info('Database statistics updated');
        } catch (error) {
          logger.error('Failed to update database statistics:', error);
        }
      }, databaseOptimizationConfig.indexing.indexMaintenanceInterval);

      // Analyze missing indexes weekly
      setInterval(async () => {
        try {
          const missingIndexes = await dbOptimizer.findMissingIndexes();
          if (missingIndexes.length > 0) {
            logger.warn('Missing indexes detected:', {
              count: missingIndexes.length,
              tables: missingIndexes.map((idx: any) => idx.tablename),
            });
          }
        } catch (error) {
          logger.error('Failed to analyze missing indexes:', error);
        }
      }, 7 * 24 * 60 * 60 * 1000); // Weekly
    }
  } catch (error) {
    logger.error('Failed to initialize database optimization:', error);
  }
};

// Initialize optimization on startup - COMMENTED OUT TO FIX STARTUP HANG
// initializeDatabaseOptimization();

// Graceful shutdown
process.on('beforeExit', async () => {
  try {
    logger.info('Shutting down database connection...');
    await prisma.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error during database shutdown:', error);
  }
});

// Export instances
export { prisma, dbOptimizer };

// Export database utilities
export const getDatabaseStats = async () => {
  try {
    const [health, performanceStats, tableSizes, indexStats] = await Promise.all([
      checkDatabaseHealth(prisma),
      dbPerformanceMonitor.getStats(),
      dbOptimizer.getTableSizes(),
      dbOptimizer.getIndexUsageStats(),
    ]);

    return {
      health,
      performance: performanceStats,
      tables: tableSizes,
      indexes: indexStats,
    };
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    return null;
  }
};

export const optimizeDatabase = async () => {
  try {
    logger.info('Starting database optimization...');

    // Update statistics
    await dbOptimizer.updateTableStatistics();

    // Vacuum and analyze
    await dbOptimizer.vacuumAnalyze();

    // Get optimization recommendations
    const missingIndexes = await dbOptimizer.findMissingIndexes();

    logger.info('Database optimization completed', {
      missingIndexes: missingIndexes.length,
    });

    return {
      success: true,
      missingIndexes,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Database optimization failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
};

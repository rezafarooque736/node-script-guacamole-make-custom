import { PrismaClient } from '../generated/prisma/index';
import { logger } from './logger.config.js';

export interface DatabaseOptimizationConfig {
  connectionPool: {
    maxConnections: number;
    minConnections: number;
    acquireTimeoutMillis: number;
    createTimeoutMillis: number;
    destroyTimeoutMillis: number;
    idleTimeoutMillis: number;
    reapIntervalMillis: number;
    createRetryIntervalMillis: number;
  };
  queryOptimization: {
    enableQueryLogging: boolean;
    slowQueryThreshold: number;
    enableExplainAnalyze: boolean;
  };
  indexing: {
    autoCreateIndexes: boolean;
    indexMaintenanceInterval: number;
  };
}

export const databaseOptimizationConfig: DatabaseOptimizationConfig = {
  connectionPool: {
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    minConnections: parseInt(process.env.DB_MIN_CONNECTIONS || '5'),
    acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000'),
    createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '30000'),
    destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT || '5000'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '300000'),
    reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || '1000'),
    createRetryIntervalMillis: parseInt(process.env.DB_CREATE_RETRY_INTERVAL || '200'),
  },
  queryOptimization: {
    enableQueryLogging: process.env.NODE_ENV === 'development',
    slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '1000'),
    enableExplainAnalyze: process.env.NODE_ENV === 'development',
  },
  indexing: {
    autoCreateIndexes: process.env.DB_AUTO_CREATE_INDEXES === 'true',
    indexMaintenanceInterval: parseInt(process.env.DB_INDEX_MAINTENANCE_INTERVAL || '86400000'), // 24 hours
  },
};

// Database performance monitoring
export class DatabasePerformanceMonitor {
  private queryStats: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();
  private slowQueries: Array<{ query: string; duration: number; timestamp: Date }> = [];
  private connectionStats = {
    activeConnections: 0,
    totalQueries: 0,
    failedQueries: 0,
  };

  logQuery(query: string, duration: number): void {
    this.connectionStats.totalQueries++;

    // Update query statistics
    const existing = this.queryStats.get(query);
    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.avgTime = existing.totalTime / existing.count;
    } else {
      this.queryStats.set(query, {
        count: 1,
        totalTime: duration,
        avgTime: duration,
      });
    }

    // Log slow queries
    if (duration > databaseOptimizationConfig.queryOptimization.slowQueryThreshold) {
      this.slowQueries.push({
        query,
        duration,
        timestamp: new Date(),
      });

      // Keep only last 100 slow queries
      if (this.slowQueries.length > 100) {
        this.slowQueries = this.slowQueries.slice(-100);
      }

      logger.warn('Slow query detected', {
        query: query.substring(0, 200),
        duration,
        threshold: databaseOptimizationConfig.queryOptimization.slowQueryThreshold,
      });
    }
  }

  logQueryError(query: string, error: Error): void {
    this.connectionStats.failedQueries++;
    logger.error('Database query failed', {
      query: query.substring(0, 200),
      error: error.message,
    });
  }

  getStats() {
    return {
      connectionStats: this.connectionStats,
      queryStats: Object.fromEntries(this.queryStats),
      slowQueries: this.slowQueries.slice(-10), // Last 10 slow queries
      topSlowQueries: this.getTopSlowQueries(5),
    };
  }

  private getTopSlowQueries(limit: number) {
    return Array.from(this.queryStats.entries())
      .sort(([, a], [, b]) => b.avgTime - a.avgTime)
      .slice(0, limit)
      .map(([query, stats]) => ({ query: query.substring(0, 100), ...stats }));
  }

  reset(): void {
    this.queryStats.clear();
    this.slowQueries = [];
    this.connectionStats = {
      activeConnections: 0,
      totalQueries: 0,
      failedQueries: 0,
    };
  }
}

// Create singleton instance
export const dbPerformanceMonitor = new DatabasePerformanceMonitor();

// Database health check
export async function checkDatabaseHealth(prisma: PrismaClient): Promise<{
  status: 'healthy' | 'unhealthy';
  latency?: number;
  connectionCount?: number;
  error?: string;
}> {
  try {
    const start = Date.now();

    // Simple query to test connection
    await prisma.$queryRaw`SELECT 1`;

    const latency = Date.now() - start;

    // Get connection count (PostgreSQL specific)
    const connectionResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'
    `;

    const connectionCount = Number(connectionResult[0]?.count || 0);

    return {
      status: 'healthy',
      latency,
      connectionCount,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Database optimization utilities
export class DatabaseOptimizer {
  constructor(private prisma: PrismaClient) {}

  // Analyze table statistics
  async analyzeTableStats(): Promise<any> {
    try {
      const stats = await this.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation,
          most_common_vals,
          most_common_freqs
        FROM pg_stats 
        WHERE schemaname = 'public'
        ORDER BY tablename, attname
      `;

      return stats;
    } catch (error) {
      logger.error('Failed to analyze table statistics:', error);
      return [];
    }
  }

  // Get index usage statistics
  async getIndexUsageStats(): Promise<any> {
    try {
      const indexStats = await this.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch,
          idx_scan
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
      `;

      return indexStats;
    } catch (error) {
      logger.error('Failed to get index usage statistics:', error);
      return [];
    }
  }

  // Find missing indexes
  async findMissingIndexes(): Promise<any> {
    try {
      const missingIndexes = await this.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          seq_tup_read,
          idx_scan,
          idx_tup_fetch,
          seq_tup_read / seq_scan as avg_seq_read
        FROM pg_stat_user_tables
        WHERE seq_scan > 0 
        AND (idx_scan IS NULL OR seq_scan > idx_scan)
        ORDER BY seq_tup_read DESC
      `;

      return missingIndexes;
    } catch (error) {
      logger.error('Failed to find missing indexes:', error);
      return [];
    }
  }

  // Update table statistics
  async updateTableStatistics(): Promise<void> {
    try {
      await this.prisma.$executeRaw`ANALYZE`;
      logger.info('Table statistics updated successfully');
    } catch (error) {
      logger.error('Failed to update table statistics:', error);
    }
  }

  // Vacuum and analyze tables
  async vacuumAnalyze(): Promise<void> {
    try {
      await this.prisma.$executeRaw`VACUUM ANALYZE`;
      logger.info('Vacuum analyze completed successfully');
    } catch (error) {
      logger.error('Failed to vacuum analyze:', error);
    }
  }

  // Get table sizes
  async getTableSizes(): Promise<any> {
    try {
      const tableSizes = await this.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `;

      return tableSizes;
    } catch (error) {
      logger.error('Failed to get table sizes:', error);
      return [];
    }
  }
}

// Query optimization helpers
export const QueryOptimizations = {
  // Batch operations for better performance
  batchSize: 1000,

  // Common query patterns with optimizations
  findManyWithPagination: {
    take: 50,
    skip: 0,
  },

  // Optimized includes for common queries
  userWithRelations: {
    include: {
      analysisJobs: {
        take: 10,
        orderBy: { createdAt: 'desc' as const },
      },
      reports: {
        take: 5,
        orderBy: { generatedAt: 'desc' as const },
      },
    },
  },

  analysisJobWithResults: {
    include: {
      results: {
        take: 100,
        orderBy: { createdAt: 'desc' as const },
      },
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
};

// Connection pool monitoring
export function monitorConnectionPool(prisma: PrismaClient): void {
  // Monitor connection events FIXME: uncomment these below lines
  // prisma.$on('query', (e: any) => {
  //   dbPerformanceMonitor.logQuery(e.query, e.duration);
  // });

  // Log connection pool stats periodically
  setInterval(async () => {
    try {
      const health = await checkDatabaseHealth(prisma);
      const stats = dbPerformanceMonitor.getStats();

      logger.debug('Database performance stats', {
        health,
        stats: {
          totalQueries: stats.connectionStats.totalQueries,
          failedQueries: stats.connectionStats.failedQueries,
          slowQueriesCount: stats.slowQueries.length,
        },
      });
    } catch (error) {
      logger.error('Failed to monitor connection pool:', error);
    }
  }, 60000); // Every minute
}

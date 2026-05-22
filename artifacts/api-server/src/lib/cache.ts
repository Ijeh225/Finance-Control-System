import { logger } from "./logger";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Lightweight in-memory TTL cache for report data.
 *
 * Cache keys follow the pattern:
 *   report_${userId}_${reportType}_${dateRange}
 *
 * TTLs:
 *   - Dashboard reports: 5 minutes
 *   - Detailed reports:  15 minutes
 *
 * Call invalidateForUser(userId) whenever bills, wallets, or vendors change
 * for that user so stale data is never served.
 */
class ReportCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  /** TTL in milliseconds for dashboard-level summaries. */
  static readonly DASHBOARD_TTL_MS = 5 * 60 * 1000;

  /** TTL in milliseconds for detailed report pages. */
  static readonly DETAILED_TTL_MS = 15 * 60 * 1000;

  /** Hits and misses for operational visibility. */
  private hits = 0;
  private misses = 0;

  /**
   * Build a canonical cache key.
   * @param userId   The requesting user's ID (or "all" for MD global views).
   * @param reportType  e.g. "dashboard", "outstanding-liabilities", "paid-today".
   * @param dateRange   Optional ISO date range string, e.g. "2024-01-01:2024-01-31".
   */
  buildKey(userId: string, reportType: string, dateRange?: string): string {
    return `report_${userId}_${reportType}${dateRange ? `_${dateRange}` : ""}`;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Invalidate all cached entries for a given user.
   * Call this after any write operation (bill create/update/delete,
   * wallet update, vendor update) that affects the user's reports.
   */
  invalidateForUser(userId: string): void {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(`_${userId}_`)) {
        this.store.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.debug({ userId, invalidated: count }, "Cache invalidated for user");
    }
  }

  /**
   * Invalidate all cached entries — useful after bulk operations or
   * when an MD-level change affects all users.
   */
  invalidateAll(): void {
    const count = this.store.size;
    this.store.clear();
    logger.debug({ invalidated: count }, "Full cache invalidation");
  }

  /** Evict all entries whose TTL has expired. */
  evictExpired(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.debug({ evicted }, "Cache eviction run completed");
    }
  }

  /** Return current cache statistics for monitoring/logging. */
  stats(): { size: number; hits: number; misses: number; hitRate: string } {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? "0%" : `${((this.hits / total) * 100).toFixed(1)}%`;
    return { size: this.store.size, hits: this.hits, misses: this.misses, hitRate };
  }
}

export const reportCache = new ReportCache();

// Evict expired entries every 5 minutes to prevent unbounded memory growth.
setInterval(() => {
  reportCache.evictExpired();
  logger.debug({ stats: reportCache.stats() }, "Cache stats");
}, 5 * 60 * 1000).unref();

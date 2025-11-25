/**
 * Simple in-memory job locking mechanism to prevent duplicate cron job executions
 *
 * For production use with multiple server instances, consider using:
 * - Redis-based locking
 * - Database-based locking with row-level locks
 * - Distributed lock service (e.g., Consul, etcd)
 */

interface Lock {
  acquired: Date;
  expiresAt: Date;
}

const locks = new Map<string, Lock>();

// Default lock timeout: 5 minutes
const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000;

export class JobLock {
  /**
   * Attempt to acquire a lock for a specific job
   * @param jobName - Unique identifier for the job
   * @param timeoutMs - Lock timeout in milliseconds (default: 5 minutes)
   * @returns true if lock was acquired, false otherwise
   */
  static acquire(jobName: string, timeoutMs: number = DEFAULT_LOCK_TIMEOUT): boolean {
    const now = new Date();
    const existingLock = locks.get(jobName);

    // Check if an existing lock has expired
    if (existingLock && existingLock.expiresAt > now) {
      // Lock is still held
      return false;
    }

    // Acquire new lock
    const lock: Lock = {
      acquired: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
    };

    locks.set(jobName, lock);
    return true;
  }

  /**
   * Release a lock for a specific job
   * @param jobName - Unique identifier for the job
   */
  static release(jobName: string): void {
    locks.delete(jobName);
  }

  /**
   * Check if a lock is currently held for a specific job
   * @param jobName - Unique identifier for the job
   * @returns true if lock is held, false otherwise
   */
  static isLocked(jobName: string): boolean {
    const now = new Date();
    const lock = locks.get(jobName);

    if (!lock) {
      return false;
    }

    // Check if lock has expired
    if (lock.expiresAt <= now) {
      // Lock has expired, clean it up
      locks.delete(jobName);
      return false;
    }

    return true;
  }

  /**
   * Force release all locks (useful for testing or emergency cleanup)
   */
  static releaseAll(): void {
    locks.clear();
  }

  /**
   * Get information about a specific lock
   * @param jobName - Unique identifier for the job
   * @returns Lock information or null if not locked
   */
  static getLockInfo(jobName: string): Lock | null {
    const now = new Date();
    const lock = locks.get(jobName);

    if (!lock) {
      return null;
    }

    // Check if lock has expired
    if (lock.expiresAt <= now) {
      locks.delete(jobName);
      return null;
    }

    return lock;
  }
}

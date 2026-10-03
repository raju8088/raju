import { ensureDatabaseReady, QueryClient } from '../client';

export interface RateLimitResult {
  allowed: boolean;
  attempts: number;
  remaining: number;
  resetAt: Date;
}

export const rateLimitRepository = {
  /**
   * Consume an attempt for a rate limit key (IP, user email, or action key)
   */
  async checkAndConsume(
    key: string,
    maxAttempts = 5,
    windowSeconds = 900, // 15 minutes default
    client?: QueryClient
  ): Promise<RateLimitResult> {
    const db = client || (await ensureDatabaseReady());
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

    // Upsert atomic attempt tracking
    const sql = `
      INSERT INTO rate_limits (key, attempts, first_attempt_at, expires_at)
      VALUES ($1, 1, NOW(), $2)
      ON CONFLICT (key) DO UPDATE
      SET
        attempts = CASE
          WHEN rate_limits.expires_at < NOW() THEN 1
          ELSE rate_limits.attempts + 1
        END,
        first_attempt_at = CASE
          WHEN rate_limits.expires_at < NOW() THEN NOW()
          ELSE rate_limits.first_attempt_at
        END,
        expires_at = CASE
          WHEN rate_limits.expires_at < NOW() THEN $2
          ELSE rate_limits.expires_at
        END
      RETURNING attempts, expires_at;
    `;

    const row = await db.queryOne<{ attempts: number; expires_at: string }>(sql, [key, expiresAt.toISOString()]);
    if (!row) {
      return { allowed: true, attempts: 1, remaining: maxAttempts - 1, resetAt: expiresAt };
    }

    const resetDate = new Date(row.expires_at);
    const allowed = row.attempts <= maxAttempts;
    const remaining = Math.max(0, maxAttempts - row.attempts);

    return {
      allowed,
      attempts: row.attempts,
      remaining,
      resetAt: resetDate,
    };
  },

  /**
   * Reset rate limit upon successful operation (e.g. valid login)
   */
  async reset(key: string, client?: QueryClient): Promise<void> {
    const db = client || (await ensureDatabaseReady());
    await db.query('DELETE FROM rate_limits WHERE key = $1;', [key]);
  },
};

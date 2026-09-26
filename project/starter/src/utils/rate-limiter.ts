/**
 * Rate Limiter for API requests and token usage
 * Prevents exceeding Anthropic API rate limits
 */

export interface RateLimiterConfig {
  /** Maximum requests per minute */
  maxRequestsPerMinute: number;
  /** Maximum tokens per minute */
  maxTokensPerMinute: number;
  /** Maximum concurrent requests */
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMITS: RateLimiterConfig = {
  maxRequestsPerMinute: 50,
  maxTokensPerMinute: 100000,
  maxConcurrent: 5
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

/**
 * Token bucket rate limiter with sliding window
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests: number = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };
  }

  /**
   * Wait until a request can be made within rate limits
   */
  async acquire(estimatedTokens: number = 1000): Promise<void> {
    // Wait for a concurrent request slot
    while (this.activeRequests >= this.config.maxConcurrent) {
      await this.waitForSlot();
    }

    // Wait for request/token rate limits
    await this.waitForRateLimit(estimatedTokens);

    // Record this request
    this.activeRequests++;

    this.requestHistory.push({
      timestamp: Date.now(),
      tokens: estimatedTokens
    });
  }

  /**
   * Release a request slot after completion
   */
  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Update the most recent request with actual token count
    if (actualTokens !== undefined && this.requestHistory.length > 0) {
      const lastRequest =
        this.requestHistory[this.requestHistory.length - 1];

      if (lastRequest) {
        lastRequest.tokens = actualTokens;
      }
    }

    // Wake up next waiting request
    const next = this.waitQueue.shift();

    if (next) {
      next();
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus(): {
    activeRequests: number;
    requestsInWindow: number;
    tokensInWindow: number;
    availableRequests: number;
    availableTokens: number;
  } {
    this.pruneOldRecords();

    const requestsInWindow = this.requestHistory.length;

    const tokensInWindow = this.requestHistory.reduce(
      (sum, r) => sum + r.tokens,
      0
    );

    return {
      activeRequests: this.activeRequests,
      requestsInWindow,
      tokensInWindow,
      availableRequests: Math.max(
        0,
        this.config.maxRequestsPerMinute - requestsInWindow
      ),
      availableTokens: Math.max(
        0,
        this.config.maxTokensPerMinute - tokensInWindow
      )
    };
  }

  /**
   * Check if request can proceed immediately
   */
  canProceed(estimatedTokens: number = 1000): boolean {
    this.pruneOldRecords();

    // Concurrent request limit
    if (this.activeRequests >= this.config.maxConcurrent) {
      return false;
    }

    // Request-per-minute limit
    const requestsInWindow = this.requestHistory.length;

    if (requestsInWindow >= this.config.maxRequestsPerMinute) {
      return false;
    }

    // Token-per-minute limit
    const tokensInWindow = this.requestHistory.reduce(
      (sum, r) => sum + r.tokens,
      0
    );

    if (
      tokensInWindow + estimatedTokens >
      this.config.maxTokensPerMinute
    ) {
      return false;
    }

    return true;
  }

  /**
   * Wait for a concurrent request slot to become available
   */
  private async waitForSlot(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Wait until rate limits allow the request to proceed
   */
  private async waitForRateLimit(
    estimatedTokens: number
  ): Promise<void> {
    while (!this.canProceed(estimatedTokens)) {
      this.pruneOldRecords();

      if (this.requestHistory.length === 0) {
        break;
      }

      const oldestTimestamp = this.requestHistory[0]?.timestamp;

      if (oldestTimestamp === undefined) {
        break;
      }

      const expirationTime = oldestTimestamp + 60000;
      const now = Date.now();

      let waitTime = expirationTime - now + 100;

      waitTime = Math.max(100, waitTime);
      waitTime = Math.min(waitTime, 5000);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitTime);
      });
    }
  }

  /**
   * Remove request records older than 60 seconds
   */
  private pruneOldRecords(): void {
    const cutoff = Date.now() - 60000;

    this.requestHistory = this.requestHistory.filter(
      (record) => record.timestamp > cutoff
    );
  }
}

/**
 * Wrap an async function with rate limiting
 */
export function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens: number = 1000
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      await rateLimiter.acquire(estimatedTokens);

      const result = await fn();

      rateLimiter.release();

      resolve(result);
    } catch (error) {
      rateLimiter.release();
      reject(error);
    }
  });
}

/**
 * Global rate limiter instance
 */
export const globalRateLimiter = new RateLimiter();
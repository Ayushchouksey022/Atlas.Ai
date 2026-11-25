export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOn?: (err: unknown) => boolean;
}

/**
 * Executes an asynchronous operation with exponential backoff and jitter.
 * Designed for network resilience across Supabase queries and LLM API calls.
 */
export async function fetchWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 300;
  const maxDelay = options.maxDelayMs ?? 4000;
  const multiplier = options.backoffMultiplier ?? 2;

  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await operation();
    } catch (err: unknown) {
      attempt++;
      if (attempt > maxRetries) {
        throw err;
      }

      // Check if error is retryable
      const isRetryable = options.retryOn
        ? options.retryOn(err)
        : defaultIsRetryable(err);

      if (!isRetryable) {
        throw err;
      }

      // Calculate exponential backoff with full jitter
      const jitter = Math.random() * 0.3 * delay;
      const sleepTime = Math.min(delay + jitter, maxDelay);

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          `[fetchWithRetry] Operation failed (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(
            sleepTime,
          )}ms... Error:`,
          (err as Error).message,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, sleepTime));
      delay = Math.min(delay * multiplier, maxDelay);
    }
  }
}

function defaultIsRetryable(err: unknown): boolean {
  if (!err) return false;
  const msg = ((err as Error).message || '').toLowerCase();
  const status = (err as any).status || (err as any).statusCode || 0;

  // Retry on rate limit (429) or transient server errors (5xx)
  if (status === 429 || (status >= 500 && status < 600)) {
    return true;
  }

  // Retry on common network errors
  if (
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset')
  ) {
    return true;
  }

  return false;
}

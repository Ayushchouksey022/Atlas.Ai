interface RateLimitBucket {
  count: number;
  resetTime: number;
}

// In-memory token bucket per instance
const ipRateLimits = new Map<string, RateLimitBucket>();

export interface RateLimitOptions {
  maxRequests?: number; // default: 60 requests
  windowSeconds?: number; // default: 60 seconds
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  errorResponse?: Response;
}

/**
 * Edge Function Rate Limiter (PRD Section 14 & Prompt 16)
 * Defends against spam, denial of service, and excessive LLM cost invocations.
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  const maxRequests = options.maxRequests ?? 60;
  const windowSeconds = options.windowSeconds ?? 60;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  let bucket = ipRateLimits.get(identifier);

  if (!bucket || now >= bucket.resetTime) {
    bucket = {
      count: 1,
      resetTime: now + windowMs,
    };
    ipRateLimits.set(identifier, bucket);
  } else {
    bucket.count++;
  }

  const remaining = Math.max(0, maxRequests - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetTime - now) / 1000));
  const allowed = bucket.count <= maxRequests;

  let errorResponse: Response | undefined;
  if (!allowed) {
    errorResponse = new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowSeconds}s allowed.`,
        retry_after_seconds: resetSeconds,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(resetSeconds),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetSeconds),
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  return {
    allowed,
    limit: maxRequests,
    remaining,
    resetSeconds,
    errorResponse,
  };
}

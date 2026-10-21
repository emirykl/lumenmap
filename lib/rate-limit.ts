import { NextResponse } from "next/server";
import { activeTraceId, createCorrelationId, logInfo } from "@/lib/log";

export type RateLimitConfig = {
  /** Max requests allowed in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (ceil). */
  retryAfterSeconds: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Bucket>();
let nowFn = () => Date.now();

/** Test helper: inject a clock. */
export function setRateLimitClock(clock: () => number): void {
  nowFn = clock;
}

/** Test helper: clear all buckets. */
export function clearRateLimitStore(): void {
  store.clear();
}

export function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

/**
 * Default production-friendly limits. Local/dev can raise via env:
 * - RATE_LIMIT_V1_MAX (default 60)
 * - RATE_LIMIT_V1_WINDOW_MS (default 60000)
 * - RATE_LIMIT_HEALTH_MAX (default 600)
 * - RATE_LIMIT_HEALTH_WINDOW_MS (default 60000)
 * - RATE_LIMIT_DISABLED=true to skip enforcement (tests / local override)
 */
export function getV1RateLimitConfig(): RateLimitConfig {
  return {
    limit: parsePositiveInt(process.env.RATE_LIMIT_V1_MAX, 60),
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_V1_WINDOW_MS, 60_000),
  };
}

export function getHealthRateLimitConfig(): RateLimitConfig {
  return {
    limit: parsePositiveInt(process.env.RATE_LIMIT_HEALTH_MAX, 600),
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_HEALTH_WINDOW_MS,
      60_000,
    ),
  };
}

export function isRateLimitDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === "true";
}

export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "anonymous";
}

/**
 * Fixed-window counter per key. Returns whether the request is allowed.
 */
export function consumeRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = nowFn();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.max(0, config.limit - 1),
      retryAfterSeconds: Math.max(1, Math.ceil(config.windowMs / 1000)),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  if (existing.count > config.limit) {
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - existing.count),
    retryAfterSeconds,
  };
}

export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      code: "RATE_LIMITED",
      message: "Too many requests. Please retry after the suggested delay.",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/**
 * Enforce rate limits for a public route bucket. Returns a 429 response when
 * exceeded, otherwise null. Logs throttles without sensitive headers.
 */
export function enforceRateLimit(
  request: Request,
  bucket: "v1" | "health",
): NextResponse | null {
  if (isRateLimitDisabled()) return null;

  const config =
    bucket === "health" ? getHealthRateLimitConfig() : getV1RateLimitConfig();
  const client = clientKeyFromRequest(request);
  const key = `${bucket}:${client}`;
  const result = consumeRateLimit(key, config);

  if (result.allowed) return null;

  logInfo({
    event: "rate_limit.throttled",
    correlationId: createCorrelationId(),
  });
  const traceId = activeTraceId();
  // Structured throttle details without logging raw IPs or auth headers.
  console.log(
    JSON.stringify({
      event: "rate_limit.throttled.detail",
      bucket,
      clientKeyHash: hashClientKey(client),
      path: new URL(request.url).pathname,
      method: request.method,
      limit: result.limit,
      retryAfterSeconds: result.retryAfterSeconds,
      ...(traceId ? { traceId } : {}),
    }),
  );

  return rateLimitExceededResponse(result);
}

function hashClientKey(value: string): string {
  // Short non-cryptographic fingerprint so logs never store raw IPs.
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

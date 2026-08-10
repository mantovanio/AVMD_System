type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: Math.max(0, maxAttempts - 1), resetAt }
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count += 1
  return { allowed: true, remaining: Math.max(0, maxAttempts - entry.count), resetAt: entry.resetAt }
}

export function cleanupRateLimit(maxAge = 300_000) {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt + maxAge) {
      store.delete(key)
    }
  }
}

setInterval(() => cleanupRateLimit(), 300_000)

import { lru } from 'tiny-lru'

interface CacheEntry<T> {
  value: T
  timestamp: number
  ttl: number
}

class TTLCache<T> {
  private cache: ReturnType<typeof lru>
  private hits = 0
  private misses = 0

  constructor(maxSize = 100) {
    this.cache = lru(maxSize)
  }

  set(key: string, value: T, ttl: number): void {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl,
    }
    this.cache.set(key, entry)
  }

  get(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined

    if (!entry) {
      this.misses++
      this.logMiss(key)
      return null
    }

    const isExpired = Date.now() - entry.timestamp > entry.ttl
    if (isExpired) {
      this.cache.delete(key)
      this.misses++
      this.logMiss(key, 'expired')
      return null
    }

    this.hits++
    this.logHit(key)
    return entry.value
  }

  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  getStats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
    }
  }

  private logHit(key: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 Cache HIT: ${key}`)
    }
  }

  private logMiss(key: string, reason?: string): void {
    if (process.env.NODE_ENV === 'development') {
      const reasonText = reason ? ` (${reason})` : ''
      console.log(`❌ Cache MISS: ${key}${reasonText}`)
    }
  }
}

// Singleton cache instance for Sefaria API calls
export const sefariaCache = new TTLCache<unknown>(50) // 50 entries max

// Helper to generate cache key from URL and options
export function createCacheKey(url: string): string {
  return url
}

// TTL constants
export const CACHE_TTL = {
  TEN_MINUTES: 10 * 60 * 1000, // 10 minutes in milliseconds
  FIVE_MINUTES: 5 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
} as const
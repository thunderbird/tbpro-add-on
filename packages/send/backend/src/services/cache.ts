import { LRUCache } from 'lru-cache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheValue = any;

export interface CacheService {
  get(key: string): Promise<CacheValue>;
  set(key: string, value: CacheValue, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * LRU Cache implementation for backup data
 * This can be easily replaced with Redis in the future by implementing the CacheService interface
 */
class LRUCacheService implements CacheService {
  private cache: LRUCache<string, CacheValue>;

  constructor() {
    this.cache = new LRUCache<string, CacheValue>({
      max: 1000, // Maximum number of items
      ttl: 1000 * 60 * 15, // 15 minutes default TTL
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  async get(key: string): Promise<CacheValue> {
    return this.cache.get(key);
  }

  async set(key: string, value: CacheValue, ttl?: number): Promise<void> {
    const options = ttl ? { ttl } : {};
    this.cache.set(key, value, options);
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  // Additional method to get cache stats (useful for monitoring)
  getStats() {
    return {
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize,
      max: this.cache.max,
    };
  }
}

// Export singleton instance
export const cacheService: CacheService = new LRUCacheService();

// Cache key generators
export const CacheKeys = {
  userBackup: (userId: string) => `user:backup:${userId}`,
  userPublicKey: (userId: string) => `user:publickey:${userId}`,
  userProfile: (userId: string) => `user:profile:${userId}`,
  userByOIDCSubject: (oidcSubject: string) => `user:oidc:${oidcSubject}`,
  userById: (userId: string) => `user:id:${userId}`,
} as const;

import type { LambdaCacheOptions } from './lambda-cache'
import { LambdaCache } from './lambda-cache'
import { MemoryCache } from './memory'
import type { CacheAdapter, CacheOptions, MemoryCacheOptions } from './types'

/**
 * Factory para crear diferentes tipos de cache
 */
export class CacheFactory {
  /**
   * Crear cache en memoria
   */
  static memory<T = any>(options: MemoryCacheOptions = {}): MemoryCache<T> {
    return new MemoryCache<T>(options)
  }

  /**
   * Crear cache para Lambda execution context
   */
  static lambda<T = any>(options: LambdaCacheOptions = {}): LambdaCache<T> {
    return new LambdaCache<T>(options)
  }

  /**
   * Crear cache Redis (placeholder para futura implementación)
   */
  static redis<T = any>(options: any = {}): CacheAdapter<T> {
    throw new Error('Redis cache not implemented yet')
  }

  /**
   * Auto-detectar entorno y crear cache apropiado
   */
  static auto<T = any>(options: any = {}): CacheAdapter<T> {
    // Detectar AWS Lambda
    if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_RUNTIME_DIR) {
      return CacheFactory.lambda<T>(options)
    }

    // Default: memory cache
    return CacheFactory.memory<T>(options)
  }
}

/**
 * Manager de cache multi-layer con fallback
 */
export class CacheManager<T = any> {
  private caches: CacheAdapter<T>[] = []
  private _stats = {
    totalRequests: 0,
    l1Hits: 0,
    l2Hits: 0,
    misses: 0
  }

  constructor (caches: CacheAdapter<T>[]) {
    this.caches = caches
  }

  /**
   * Obtener valor con fallback multi-level
   */
  async get (key: string): Promise<T | null> {
    this._stats.totalRequests++

    for (let i = 0; i < this.caches.length; i++) {
      const cache = this.caches[i]
      const value = await cache.get(key)

      if (value !== null) {
        // Hit! Propagar hacia caches más rápidos
        if (i > 0) {
          await this.propagateUp(key, value, i)
        }

        // Actualizar stats
        if (i === 0) this._stats.l1Hits++
        else if (i === 1) this._stats.l2Hits++

        return value
      }
    }

    this._stats.misses++
    return null
  }

  /**
   * Guardar en todos los niveles
   */
  async set (key: string, value: T, options?: CacheOptions): Promise<void> {
    const promises = this.caches.map(cache =>
      cache.set(key, value, options)
    )

    await Promise.all(promises)
  }

  /**
   * Eliminar de todos los niveles
   */
  async delete (key: string): Promise<boolean> {
    const results = await Promise.all(
      this.caches.map(cache => cache.delete(key))
    )

    return results.some(result => result)
  }

  /**
   * Verificar existencia en cualquier nivel
   */
  async has (key: string): Promise<boolean> {
    for (const cache of this.caches) {
      if (await cache.has(key)) {
        return true
      }
    }
    return false
  }

  /**
   * Limpiar todos los niveles
   */
  async clear (): Promise<void> {
    await Promise.all(
      this.caches.map(cache => cache.clear())
    )
  }

  /**
   * Estadísticas combinadas
   */
  async stats () {
    const cacheStats = await Promise.all(
      this.caches.map(cache => cache.stats())
    )

    const totalRequests = this._stats.totalRequests
    const hitRate = totalRequests > 0
      ? (this._stats.l1Hits + this._stats.l2Hits) / totalRequests
      : 0

    return {
      manager: {
        totalRequests,
        l1HitRate: totalRequests > 0 ? this._stats.l1Hits / totalRequests : 0,
        l2HitRate: totalRequests > 0 ? this._stats.l2Hits / totalRequests : 0,
        missRate: totalRequests > 0 ? this._stats.misses / totalRequests : 0,
        overallHitRate: hitRate
      },
      caches: cacheStats.map((stats, index) => ({
        level: index + 1,
        ...stats
      }))
    }
  }

  /**
   * Propagar valor hacia caches más rápidos
   */
  private async propagateUp (key: string, value: T, fromLevel: number): Promise<void> {
    const promises = []

    for (let i = 0; i < fromLevel; i++) {
      promises.push(this.caches[i].set(key, value))
    }

    await Promise.all(promises)
  }
}

/**
 * Función helper para wrap methods con cache
 */
export function wrapWithCache<T extends (...args: any[]) => any> (
  fn: T,
  cache: CacheAdapter,
  options: {
    ttl?: number
    keyGenerator?: (...args: Parameters<T>) => string
    namespace?: string
  } = {}
): T {
  const wrappedFn = async (...args: Parameters<T>) => {
    // Generar key
    const keyGen = options.keyGenerator || ((...args) =>
      `${options.namespace || 'fn'}:${fn.name}:${JSON.stringify(args)}`
    )
    const cacheKey = keyGen(...args)

    // Intentar obtener del cache
    const cached = await cache.get(cacheKey)
    if (cached !== null) {
      return cached
    }

    // Ejecutar función original
    const result = await fn(...args)

    // Guardar en cache
    if (result !== null && result !== undefined) {
      await cache.set(cacheKey, result, { ttl: options.ttl })
    }

    return result
  }

  return wrappedFn as T
}
export const createCacheConfig = {
  /**
   * Cache rápido para requests frecuentes
   */
  fastMemory: (maxSize = 500): MemoryCacheOptions => ({
    maxSize,
    ttl: 300, // 5 minutos
    evictionPolicy: 'lru',
    autoCleanup: true,
    cleanupInterval: 30000 // 30 segundos
  }),

  /**
   * Cache de larga duración para datos estáticos
   */
  longTerm: (maxSize = 1000): MemoryCacheOptions => ({
    maxSize,
    ttl: 3600, // 1 hora
    evictionPolicy: 'lfu',
    autoCleanup: true,
    cleanupInterval: 300000 // 5 minutos
  }),

  /**
   * Cache para sesiones/auth
   */
  session: (maxSize = 10000): MemoryCacheOptions => ({
    maxSize,
    ttl: 1800, // 30 minutos
    evictionPolicy: 'lru',
    autoCleanup: true,
    cleanupInterval: 60000 // 1 minuto
  })
}

// Exports principales
export { LambdaCache } from './lambda-cache'
export type { LambdaCacheOptions, LambdaStats } from './lambda-cache'
export { MemoryCache } from './memory'
export type { CacheAdapter, CacheOptions, CacheStats, MemoryCacheOptions } from './types'


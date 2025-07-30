import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CacheFactory, CacheManager, MemoryCache, wrapWithCache } from '../src/services/cache'

describe('MemoryCache', () => {
  let cache: MemoryCache<string>

  beforeEach(() => {
    cache = new MemoryCache<string>({
      maxSize: 3,
      ttl: 1, // 1 segundo para tests
      autoCleanup: false // Desactivar para tests
    })
  })

  afterEach(() => {
    cache.destroy()
  })

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1')
    const value = await cache.get('key1')

    expect(value).toBe('value1')
  })

  it('should return null for non-existent keys', async () => {
    const value = await cache.get('nonexistent')
    expect(value).toBeNull()
  })

  it('should respect TTL', async () => {
    await cache.set('key1', 'value1', { ttl: 0.1 }) // 100ms

    let value = await cache.get('key1')
    expect(value).toBe('value1')

    // Esperar que expire
    await new Promise(resolve => setTimeout(resolve, 150))

    value = await cache.get('key1')
    expect(value).toBeNull()
  })

  it('should handle maxSize with LRU eviction', async () => {
    // Llenar cache hasta el límite
    await cache.set('key1', 'value1')
    await cache.set('key2', 'value2')
    await cache.set('key3', 'value3')

    // Acceder a key1 para hacerla más reciente
    await cache.get('key1')

    // Agregar una nueva key, debería evictar key2 (menos recientemente usada)
    await cache.set('key4', 'value4')

    expect(await cache.get('key1')).toBe('value1') // Debe existir
    expect(await cache.get('key2')).toBeNull()     // Debe haber sido evictada
    expect(await cache.get('key3')).toBe('value3') // Debe existir
    expect(await cache.get('key4')).toBe('value4') // Debe existir
  })

  it('should handle multiple operations', async () => {
    const entries = new Map([
      ['key1', 'value1'],
      ['key2', 'value2'],
      ['key3', 'value3']
    ])

    await cache.mset(entries)

    const results = await cache.mget(['key1', 'key2', 'nonexistent'])

    expect(results.get('key1')).toBe('value1')
    expect(results.get('key2')).toBe('value2')
    expect(results.get('nonexistent')).toBeNull()
  })

  it('should provide accurate statistics', async () => {
    await cache.set('key1', 'value1')
    await cache.set('key2', 'value2')

    // Generar hits y misses
    await cache.get('key1') // hit
    await cache.get('key1') // hit
    await cache.get('nonexistent') // miss

    const stats = await cache.stats()

    expect(stats.size).toBe(2)
    expect(stats.hits).toBe(2)
    expect(stats.misses).toBe(1)
    expect(stats.hitRate).toBe(0.67) // 2/3
  })

  it('should delete keys correctly', async () => {
    await cache.set('key1', 'value1')

    expect(await cache.has('key1')).toBe(true)

    const deleted = await cache.delete('key1')
    expect(deleted).toBe(true)
    expect(await cache.has('key1')).toBe(false)

    const deletedAgain = await cache.delete('key1')
    expect(deletedAgain).toBe(false)
  })

  it('should clear all entries', async () => {
    await cache.set('key1', 'value1')
    await cache.set('key2', 'value2')

    await cache.clear()

    const stats = await cache.stats()
    expect(stats.size).toBe(0)
  })
})

describe('CacheFactory', () => {
  it('should create memory cache', () => {
    const cache = CacheFactory.memory({ maxSize: 100 })
    expect(cache).toBeInstanceOf(MemoryCache)
  })

  it('should throw for unimplemented cache types', () => {
    expect(() => CacheFactory.redis()).toThrow('Redis cache not implemented yet')
    expect(() => CacheFactory.lambda()).toThrow('Lambda cache not implemented yet')
  })
})

describe('CacheManager', () => {
  let l1Cache: MemoryCache<string>
  let l2Cache: MemoryCache<string>
  let manager: CacheManager<string>

  beforeEach(() => {
    l1Cache = new MemoryCache<string>({ maxSize: 2 })
    l2Cache = new MemoryCache<string>({ maxSize: 5 })
    manager = new CacheManager([l1Cache, l2Cache])
  })

  afterEach(() => {
    l1Cache.destroy()
    l2Cache.destroy()
  })

  it('should get from L1 cache first', async () => {
    await l1Cache.set('key1', 'l1-value')
    await l2Cache.set('key1', 'l2-value')

    const value = await manager.get('key1')
    expect(value).toBe('l1-value')
  })

  it('should fallback to L2 and propagate up', async () => {
    await l2Cache.set('key1', 'l2-value')

    const value = await manager.get('key1')
    expect(value).toBe('l2-value')

    // Verificar que se propagó a L1
    const l1Value = await l1Cache.get('key1')
    expect(l1Value).toBe('l2-value')
  })

  it('should set in all levels', async () => {
    await manager.set('key1', 'value1')

    expect(await l1Cache.get('key1')).toBe('value1')
    expect(await l2Cache.get('key1')).toBe('value1')
  })

  it('should track statistics correctly', async () => {
    await l2Cache.set('key1', 'value1')

    await manager.get('key1') // L2 hit
    await manager.get('key1') // L1 hit (propagated)
    await manager.get('nonexistent') // miss

    const stats = await manager.stats()
    expect(stats.manager.l1HitRate).toBe(1 / 3) // 1 L1 hit de 3 requests
    expect(stats.manager.l2HitRate).toBe(1 / 3) // 1 L2 hit de 3 requests
    expect(stats.manager.missRate).toBe(1 / 3)  // 1 miss de 3 requests
  })
})

describe('Cache Function Wrapper', () => {
  let cache: MemoryCache<any>

  beforeEach(() => {
    cache = new MemoryCache({ ttl: 10 })
  })

  afterEach(() => {
    cache.destroy()
  })

  it('should cache function results', async () => {
    let callCount = 0

    const expensiveFunction = async (input: string): Promise<string> => {
      callCount++
      return `result-${input}-${callCount}`
    }

    const cachedFunction = wrapWithCache(expensiveFunction, cache, {
      ttl: 5,
      namespace: 'test'
    })

    // Primera llamada
    const result1 = await cachedFunction('test')
    expect(result1).toBe('result-test-1')
    expect(callCount).toBe(1)

    // Segunda llamada - debe usar cache
    const result2 = await cachedFunction('test')
    expect(result2).toBe('result-test-1') // Mismo resultado
    expect(callCount).toBe(1) // No se incrementó

    // Llamada con parámetro diferente
    const result3 = await cachedFunction('other')
    expect(result3).toBe('result-other-2')
    expect(callCount).toBe(2)
  })

  it('should use custom key generator', async () => {
    const testFunction = async (input: string): Promise<string> => {
      return `value-${input}`
    }

    const cachedFunction = wrapWithCache(testFunction, cache, {
      keyGenerator: (input: string) => `custom:${input}`
    })

    await cachedFunction('test')

    // Verificar que la key personalizada se usó
    const cachedValue = await cache.get('custom:test')
    expect(cachedValue).toBe('value-test')
  })

  it('should work with class methods', async () => {
    class UserService {
      callCount = 0

      async getUser (id: string): Promise<string> {
        this.callCount++
        return `user-${id}-${this.callCount}`
      }
    }

    const service = new UserService()

    // Wrap el método
    const cachedGetUser = wrapWithCache(
      service.getUser.bind(service),
      cache,
      {
        ttl: 5,
        namespace: 'user-service'
      }
    )

    // Primera llamada
    const result1 = await cachedGetUser('123')
    expect(result1).toBe('user-123-1')
    expect(service.callCount).toBe(1)

    // Segunda llamada - debe usar cache
    const result2 = await cachedGetUser('123')
    expect(result2).toBe('user-123-1')
    expect(service.callCount).toBe(1)
  })

  it('should handle different return types', async () => {
    const objectFunction = async (id: number) => ({
      id,
      name: `Item ${id}`,
      timestamp: Date.now()
    })

    const cachedFunction = wrapWithCache(objectFunction, cache, {
      namespace: 'objects'
    })

    const result1 = await cachedFunction(1)
    const result2 = await cachedFunction(1)

    expect(result1).toEqual(result2)
    expect(result1.id).toBe(1)
    expect(result1.name).toBe('Item 1')
  })
})

describe('Cache Edge Cases', () => {
  let cache: MemoryCache<any>

  beforeEach(() => {
    cache = new MemoryCache()
  })

  afterEach(() => {
    cache.destroy()
  })

  it('should handle undefined and null values', async () => {
    await cache.set('undefined', undefined)
    await cache.set('null', null)

    expect(await cache.get('undefined')).toBeUndefined()
    expect(await cache.get('null')).toBeNull()
  })

  it('should handle complex objects', async () => {
    const complexObject = {
      nested: { data: [1, 2, 3] },
      date: new Date('2025-01-01'),
      regex: /test/g
    }

    await cache.set('complex', complexObject)
    const retrieved = await cache.get('complex')

    expect(retrieved).toEqual(complexObject)
  })

  it('should handle concurrent access', async () => {
    const promises = []

    // Múltiples operaciones concurrentes
    for (let i = 0; i < 10; i++) {
      promises.push(cache.set(`key${i}`, `value${i}`))
    }

    await Promise.all(promises)

    // Verificar que todas se guardaron
    for (let i = 0; i < 10; i++) {
      expect(await cache.get(`key${i}`)).toBe(`value${i}`)
    }
  })

  it('should handle memory pressure gracefully', async () => {
    const smallCache = new MemoryCache({ maxSize: 5, evictionPolicy: 'lru' })

    // Llenar más allá de la capacidad
    for (let i = 0; i < 10; i++) {
      await smallCache.set(`key${i}`, `value${i}`)
    }

    const stats = await smallCache.stats()
    expect(stats.size).toBeLessThanOrEqual(5)

    smallCache.destroy()
  })
})

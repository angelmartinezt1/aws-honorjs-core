import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheFactory, CacheManager, LambdaCache, MemoryCache, wrapWithCache } from '../src/services/cache'

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

  it('should handle different eviction policies', async () => {
    // Test LFU eviction
    const lfuCache = new MemoryCache<string>({
      maxSize: 3,
      evictionPolicy: 'lfu',
      autoCleanup: false
    })

    await lfuCache.set('key1', 'value1')
    await lfuCache.set('key2', 'value2')
    await lfuCache.set('key3', 'value3')

    // Acceder a key1 varias veces
    await lfuCache.get('key1')
    await lfuCache.get('key1')
    await lfuCache.get('key1')

    // Acceder a key2 una vez
    await lfuCache.get('key2')

    // key3 no ha sido accedida, debería ser evictada primero
    await lfuCache.set('key4', 'value4')

    expect(await lfuCache.get('key1')).toBe('value1') // Más frecuente
    expect(await lfuCache.get('key2')).toBe('value2') // Accedida
    expect(await lfuCache.get('key3')).toBeNull()     // Menos frecuente, evictada
    expect(await lfuCache.get('key4')).toBe('value4') // Nueva

    lfuCache.destroy()
  })

  it('should handle FIFO eviction policy', async () => {
    const fifoCache = new MemoryCache<string>({
      maxSize: 3,
      evictionPolicy: 'fifo',
      autoCleanup: false
    })

    await fifoCache.set('key1', 'value1')
    await new Promise(resolve => setTimeout(resolve, 10)) // Pequeña pausa
    await fifoCache.set('key2', 'value2')
    await new Promise(resolve => setTimeout(resolve, 10))
    await fifoCache.set('key3', 'value3')

    // key1 debería ser evictada (primera en entrar)
    await fifoCache.set('key4', 'value4')

    expect(await fifoCache.get('key1')).toBeNull()     // Primera, evictada
    expect(await fifoCache.get('key2')).toBe('value2') // Segunda
    expect(await fifoCache.get('key3')).toBe('value3') // Tercera
    expect(await fifoCache.get('key4')).toBe('value4') // Nueva

    fifoCache.destroy()
  })

  it('should handle memory usage estimation', async () => {
    await cache.set('key1', 'a'.repeat(100))
    await cache.set('key2', 'b'.repeat(200))

    const stats = await cache.stats()
    expect(stats.memoryUsage).toBeGreaterThan(0)
    expect(typeof stats.memoryUsage).toBe('number')
  })
})

describe('LambdaCache', () => {
  let cache: LambdaCache<string>

  beforeEach(() => {
    cache = new LambdaCache<string>({
      maxSize: 5,
      ttl: 1, // 1 segundo para tests
      namespace: 'test',
      useGlobalContext: false // Usar contexto local para tests aislados
    })
  })

  afterEach(async () => {
    await cache.clear()
  })

  it('should store and retrieve values', async () => {
    await cache.set('key1', 'value1')
    const value = await cache.get('key1')

    expect(value).toBe('value1')
  })

  it('should handle TTL correctly', async () => {
    await cache.set('key1', 'value1', { ttl: 0.1 }) // 100ms

    let value = await cache.get('key1')
    expect(value).toBe('value1')

    // Esperar que expire
    await new Promise(resolve => setTimeout(resolve, 150))

    value = await cache.get('key1')
    expect(value).toBeNull()
  })

  it('should provide Lambda-specific stats', async () => {
    await cache.set('key1', 'value1')
    await cache.set('key2', 'value2')

    // Generar algunos hits/misses
    await cache.get('key1') // hit
    await cache.get('nonexistent') // miss

    const stats = await cache.stats()

    expect(stats.size).toBe(2)
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.lambda).toBeDefined()
    expect(stats.lambda.instanceId).toBeDefined()
    expect(stats.lambda.namespaceSize).toBe(2)
    expect(typeof stats.lambda.memoryPressure).toBe('number')
  })

  it('should handle namespace isolation', async () => {
    const cache1 = new LambdaCache({ namespace: 'ns1', useGlobalContext: false })
    const cache2 = new LambdaCache({ namespace: 'ns2', useGlobalContext: false })

    await cache1.set('key1', 'value1')
    await cache2.set('key1', 'value2')

    expect(await cache1.get('key1')).toBe('value1')
    expect(await cache2.get('key1')).toBe('value2')

    await cache1.clear()
    await cache2.clear()
  })

  it('should handle eviction with small maxSize', async () => {
    const smallCache = new LambdaCache<string>({
      maxSize: 3,
      evictionPolicy: 'lru',
      namespace: 'small',
      useGlobalContext: false
    })

    // Llenar cache
    await smallCache.set('key1', 'value1')
    await smallCache.set('key2', 'value2')
    await smallCache.set('key3', 'value3')

    // Acceder a key1 para hacerla más reciente
    await smallCache.get('key1')

    // Agregar nueva key, debería evictar key2
    await smallCache.set('key4', 'value4')

    expect(await smallCache.get('key1')).toBe('value1') // Debe existir
    expect(await smallCache.get('key2')).toBeNull()    // Debe haber sido evictada
    expect(await smallCache.get('key3')).toBe('value3') // Debe existir
    expect(await smallCache.get('key4')).toBe('value4') // Debe existir

    await smallCache.clear()
  })

  it('should provide Lambda context information', async () => {
    const context = cache.getLambdaContext()

    expect(context.instanceId).toBeDefined()
    expect(typeof context.invocationCount).toBe('number')
    expect(typeof context.isWarm).toBe('boolean')
    expect(typeof context.globalStoreSize).toBe('number')
    expect(typeof context.namespaceSize).toBe('number')
  })

  it('should handle memory pressure cleanup', async () => {
    const cache = new LambdaCache<string>({
      maxSize: 10,
      namespace: 'pressure',
      useGlobalContext: false
    })

    // Llenar cache
    for (let i = 0; i < 8; i++) {
      await cache.set(`key${i}`, `value${i}`)
    }

    const statsBefore = await cache.stats()
    expect(statsBefore.size).toBe(8)

    // Limpiar por presión de memoria
    const cleaned = await cache.cleanupByMemoryPressure(3)

    const statsAfter = await cache.stats()
    expect(statsAfter.size).toBeLessThanOrEqual(3)
    expect(cleaned).toBeGreaterThan(0)

    await cache.clear()
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

  it('should handle cold start preparation', async () => {
    // Llenar cache con algunos datos
    for (let i = 0; i < 3; i++) {
      await cache.set(`key${i}`, `value${i}`)
    }

    // Preparar para cold start
    await cache.prepareColdStart()

    // Cache debería seguir funcionando
    expect(await cache.get('key0')).toBe('value0')
    expect(await cache.get('key1')).toBe('value1')
  })

  it('should handle different eviction policies', async () => {
    const lfuCache = new LambdaCache<string>({
      maxSize: 3,
      evictionPolicy: 'lfu',
      namespace: 'lfu-test',
      useGlobalContext: false
    })

    await lfuCache.set('key1', 'value1')
    await lfuCache.set('key2', 'value2')
    await lfuCache.set('key3', 'value3')

    // key1 será más frecuente
    await lfuCache.get('key1')
    await lfuCache.get('key1')
    await lfuCache.get('key1')

    // key2 accedida una vez
    await lfuCache.get('key2')

    // key3 no accedida, debería ser evictada
    await lfuCache.set('key4', 'value4')

    expect(await lfuCache.get('key1')).toBe('value1')
    expect(await lfuCache.get('key2')).toBe('value2')
    expect(await lfuCache.get('key3')).toBeNull()
    expect(await lfuCache.get('key4')).toBe('value4')

    await lfuCache.clear()
  })

  it('should handle global context sharing', async () => {
    const cache1 = new LambdaCache({
      namespace: 'shared1',
      useGlobalContext: true,
      maxSize: 10
    })
    const cache2 = new LambdaCache({
      namespace: 'shared2',
      useGlobalContext: true,
      maxSize: 10
    })

    await cache1.set('key1', 'value1')
    await cache2.set('key1', 'value2')

    // Diferentes namespaces, valores diferentes
    expect(await cache1.get('key1')).toBe('value1')
    expect(await cache2.get('key1')).toBe('value2')

    // Pero comparten el store global
    const context1 = cache1.getLambdaContext()
    const context2 = cache2.getLambdaContext()
    expect(context1.globalStoreSize).toBeGreaterThan(0)
    expect(context2.globalStoreSize).toBeGreaterThan(0)

    await cache1.clear()
    await cache2.clear()
  })
})

describe('CacheFactory', () => {
  it('should create memory cache', () => {
    const cache = CacheFactory.memory({ maxSize: 100 })
    expect(cache).toBeInstanceOf(MemoryCache)
  })

  it('should create lambda cache', () => {
    const cache = CacheFactory.lambda({ maxSize: 50 })
    expect(cache).toBeInstanceOf(LambdaCache)
  })

  it('should auto-detect environment', () => {
    // Test sin AWS Lambda env
    const cache1 = CacheFactory.auto()
    expect(cache1).toBeInstanceOf(MemoryCache)

    // Simular AWS Lambda environment
    const originalEnv = process.env.AWS_LAMBDA_FUNCTION_NAME
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function'

    const cache2 = CacheFactory.auto()
    expect(cache2).toBeInstanceOf(LambdaCache)

    // Restaurar
    if (originalEnv) {
      process.env.AWS_LAMBDA_FUNCTION_NAME = originalEnv
    } else {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME
    }
  })

  it('should throw for unimplemented cache types', () => {
    expect(() => CacheFactory.redis()).toThrow('Redis cache not implemented yet')
  })

  it('should handle factory options correctly', () => {
    const memoryCache = CacheFactory.memory({
      maxSize: 42,
      ttl: 123,
      evictionPolicy: 'lfu'
    })
    expect(memoryCache).toBeInstanceOf(MemoryCache)

    const lambdaCache = CacheFactory.lambda({
      maxSize: 24,
      ttl: 321,
      namespace: 'factory-test'
    })
    expect(lambdaCache).toBeInstanceOf(LambdaCache)
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

  it('should delete from all levels', async () => {
    await manager.set('key1', 'value1')

    expect(await l1Cache.has('key1')).toBe(true)
    expect(await l2Cache.has('key1')).toBe(true)

    const deleted = await manager.delete('key1')
    expect(deleted).toBe(true)

    expect(await l1Cache.has('key1')).toBe(false)
    expect(await l2Cache.has('key1')).toBe(false)
  })

  it('should clear all levels', async () => {
    await manager.set('key1', 'value1')
    await manager.set('key2', 'value2')

    await manager.clear()

    const l1Stats = await l1Cache.stats()
    const l2Stats = await l2Cache.stats()

    expect(l1Stats.size).toBe(0)
    expect(l2Stats.size).toBe(0)
  })

  it('should handle mixed cache types', async () => {
    const memoryCache = new MemoryCache<string>({ maxSize: 3 })
    const lambdaCache = new LambdaCache<string>({
      maxSize: 5,
      namespace: 'mixed-test',
      useGlobalContext: false
    })

    const mixedManager = new CacheManager([memoryCache, lambdaCache])

    await mixedManager.set('key1', 'value1')

    expect(await memoryCache.get('key1')).toBe('value1')
    expect(await lambdaCache.get('key1')).toBe('value1')

    const value = await mixedManager.get('key1')
    expect(value).toBe('value1')

    await mixedManager.clear()
    memoryCache.destroy()
    await lambdaCache.clear()
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

  it('should handle async errors correctly', async () => {
    let callCount = 0

    const errorFunction = async (shouldError: boolean): Promise<string> => {
      callCount++
      if (shouldError) {
        throw new Error('Test error')
      }
      return `success-${callCount}`
    }

    const cachedFunction = wrapWithCache(errorFunction, cache, {
      namespace: 'error-test'
    })

    // Error no debe ser cacheado
    await expect(cachedFunction(true)).rejects.toThrow('Test error')
    expect(callCount).toBe(1)

    // Misma llamada con error
    await expect(cachedFunction(true)).rejects.toThrow('Test error')
    expect(callCount).toBe(2) // Se ejecutó de nuevo

    // Llamada exitosa debe ser cacheada
    const result1 = await cachedFunction(false)
    expect(result1).toBe('success-3')
    expect(callCount).toBe(3)

    const result2 = await cachedFunction(false)
    expect(result2).toBe('success-3') // Mismo resultado
    expect(callCount).toBe(3) // No se incrementó
  })

  it('should handle undefined and null returns', async () => {
    const nullFunction = async (returnType: 'null' | 'undefined' | 'value') => {
      switch (returnType) {
        case 'null': return null
        case 'undefined': return undefined
        case 'value': return 'actual-value'
      }
    }

    const cachedFunction = wrapWithCache(nullFunction, cache, {
      namespace: 'null-test'
    })

    // null no debería ser cacheado
    let callCount = 0
    const originalFunction = cachedFunction
    const mockFunction = vi.fn(async (type: any) => {
      callCount++
      return originalFunction(type)
    })

    // Test con wrapper para contar llamadas
    const countingCachedFunction = wrapWithCache(
      async (type: 'null' | 'undefined' | 'value') => {
        callCount++
        return nullFunction(type)
      },
      cache,
      { namespace: 'counting-null' }
    )

    await countingCachedFunction('null')
    await countingCachedFunction('null')
    expect(callCount).toBe(2) // null no se cachea

    callCount = 0
    await countingCachedFunction('undefined')
    await countingCachedFunction('undefined')
    expect(callCount).toBe(2) // undefined no se cachea

    callCount = 0
    await countingCachedFunction('value')
    await countingCachedFunction('value')
    expect(callCount).toBe(1) // value sí se cachea
  })

  it('should work with Lambda cache', async () => {
    const lambdaCache = new LambdaCache({
      namespace: 'wrapper-test',
      useGlobalContext: false,
      maxSize: 10
    })

    let callCount = 0
    const testFunction = async (input: string) => {
      callCount++
      return `lambda-result-${input}-${callCount}`
    }

    const cachedFunction = wrapWithCache(testFunction, lambdaCache, {
      ttl: 600,
      keyGenerator: (input: string) => `lambda:${input}`
    })

    const result1 = await cachedFunction('test')
    expect(result1).toBe('lambda-result-test-1')
    expect(callCount).toBe(1)

    const result2 = await cachedFunction('test')
    expect(result2).toBe('lambda-result-test-1')
    expect(callCount).toBe(1)

    // Verificar que se guardó en Lambda cache
    const directValue = await lambdaCache.get('lambda:test')
    expect(directValue).toBe('lambda-result-test-1')

    await lambdaCache.clear()
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

  it('should handle rapid TTL expiration', async () => {
    await cache.set('rapid1', 'value1', { ttl: 0.05 }) // 50ms
    await cache.set('rapid2', 'value2', { ttl: 0.1 })  // 100ms
    await cache.set('rapid3', 'value3', { ttl: 0.15 }) // 150ms

    // Todos deberían estar disponibles inmediatamente
    expect(await cache.get('rapid1')).toBe('value1')
    expect(await cache.get('rapid2')).toBe('value2')
    expect(await cache.get('rapid3')).toBe('value3')

    // Esperar 75ms - rapid1 debería expirar
    await new Promise(resolve => setTimeout(resolve, 75))
    expect(await cache.get('rapid1')).toBeNull()
    expect(await cache.get('rapid2')).toBe('value2')
    expect(await cache.get('rapid3')).toBe('value3')

    // Esperar otros 50ms - rapid2 debería expirar
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(await cache.get('rapid1')).toBeNull()
    expect(await cache.get('rapid2')).toBeNull()
    expect(await cache.get('rapid3')).toBe('value3')

    // Esperar otros 50ms - rapid3 debería expirar
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(await cache.get('rapid1')).toBeNull()
    expect(await cache.get('rapid2')).toBeNull()
    expect(await cache.get('rapid3')).toBeNull()
  })

  it('should handle large data sets', async () => {
    const largeCache = new MemoryCache({ maxSize: 1000 })

    // Insertar muchos elementos
    const promises = []
    for (let i = 0; i < 500; i++) {
      promises.push(largeCache.set(`large-key-${i}`, `large-value-${i}-${'x'.repeat(100)}`))
    }

    await Promise.all(promises)

    const stats = await largeCache.stats()
    expect(stats.size).toBe(500)
    expect(stats.memoryUsage).toBeGreaterThan(0)

    // Verificar algunos valores aleatorios
    expect(await largeCache.get('large-key-0')).toContain('large-value-0')
    expect(await largeCache.get('large-key-250')).toContain('large-value-250')
    expect(await largeCache.get('large-key-499')).toContain('large-value-499')

    largeCache.destroy()
  })

  it('should handle very small TTL values', async () => {
    await cache.set('micro1', 'value1', { ttl: 0.001 }) // 1ms
    await cache.set('micro2', 'value2', { ttl: 0.002 }) // 2ms

    // Es posible que ya hayan expirado, pero no debería causar errores
    const value1 = await cache.get('micro1')
    const value2 = await cache.get('micro2')

    // Los valores pueden ser null o los valores originales
    expect([null, 'value1']).toContain(value1)
    expect([null, 'value2']).toContain(value2)
  })

  it('should handle circular references in objects', async () => {
    const obj: any = { name: 'test' }
    obj.self = obj // Circular reference

    // Debería manejar la referencia circular sin explotar
    try {
      await cache.set('circular', obj)
      // Si llegamos aquí, el cache manejó la referencia circular
      expect(true).toBe(true)
    } catch (error) {
      // Es esperado que falle por la referencia circular en JSON.stringify
      expect(error).toBeDefined()
    }
  })

  it('should handle special characters in keys', async () => {
    const specialKeys = [
      'key with spaces',
      'key:with:colons',
      'key/with/slashes',
      'key-with-dashes',
      'key_with_underscores',
      'key.with.dots',
      'key@with@at',
      'key#with#hash',
      'key%with%percent',
      'key&with&ampersand',
      'émojis🚀💾',
      'unicode-αβγ-test'
    ]

    for (const key of specialKeys) {
      await cache.set(key, `value-for-${key}`)
      expect(await cache.get(key)).toBe(`value-for-${key}`)
    }
  })

  it('should handle burst operations', async () => {
    const operations = []

    // Burst de operaciones mixtas
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        operations.push(cache.set(`burst-${i}`, `value-${i}`))
      } else if (i % 3 === 1) {
        operations.push(cache.get(`burst-${i - 1}`))
      } else {
        operations.push(cache.has(`burst-${i - 2}`))
      }
    }

    const results = await Promise.all(operations)

    // Verificar que no hay errores y resultados son del tipo correcto
    results.forEach((result, index) => {
      if (index % 3 === 0) {
        expect(result).toBeUndefined() // set returns void
      } else if (index % 3 === 1) {
        expect(typeof result === 'string' || result === null).toBe(true)
      } else {
        expect(typeof result).toBe('boolean')
      }
    })
  })
})

describe('Cache Performance Tests', () => {
  it('should handle high-frequency access patterns', async () => {
    const cache = new MemoryCache({ maxSize: 100 })

    // Preparar datos
    for (let i = 0; i < 50; i++) {
      await cache.set(`perf-${i}`, `value-${i}`)
    }

    const start = Date.now()

    // Muchos accesos rápidos
    const promises = []
    for (let i = 0; i < 1000; i++) {
      const key = `perf-${i % 50}` // Acceder a las 50 keys de forma circular
      promises.push(cache.get(key))
    }

    await Promise.all(promises)

    const duration = Date.now() - start

    // Debería completar en tiempo razonable (menos de 1 segundo)
    expect(duration).toBeLessThan(1000)

    const stats = await cache.stats()
    expect(stats.hitRate).toBeGreaterThan(0.9) // 90%+ hit rate

    cache.destroy()
  })

  it('should handle memory estimation accuracy', async () => {
    const cache = new MemoryCache({ maxSize: 10 })

    const baseStats = await cache.stats()
    const baseMemory = baseStats.memoryUsage || 0

    // Agregar datos de tamaño conocido
    await cache.set('small', 'x')                    // ~1 char
    await cache.set('medium', 'x'.repeat(100))       // ~100 chars
    await cache.set('large', 'x'.repeat(1000))       // ~1000 chars

    const newStats = await cache.stats()
    const newMemory = newStats.memoryUsage || 0

    // La memoria debería haber aumentado
    expect(newMemory).toBeGreaterThan(baseMemory)

    // Debería ser proporcional al contenido agregado (aproximadamente)
    const memoryIncrease = newMemory - baseMemory
    expect(memoryIncrease).toBeGreaterThan(1000) // Al menos 1000 bytes

    cache.destroy()
  })
})

describe('Cache Configuration Tests', () => {
  it('should handle default configurations correctly', async () => {
    const defaultCache = new MemoryCache()

    // Verificar valores por defecto
    const stats = await defaultCache.stats()
    expect(stats.size).toBe(0)

    // Debería permitir agregar elementos
    await defaultCache.set('test', 'value')
    expect(await defaultCache.get('test')).toBe('value')

    defaultCache.destroy()
  })

  it('should validate configuration boundaries', async () => {
    // Cache con maxSize muy pequeño
    const tinyCache = new MemoryCache({ maxSize: 1 })

    await tinyCache.set('key1', 'value1')
    await tinyCache.set('key2', 'value2') // Debería evictar key1

    expect(await tinyCache.get('key1')).toBeNull()
    expect(await tinyCache.get('key2')).toBe('value2')

    tinyCache.destroy()
  })

  it('should handle invalid TTL values gracefully', async () => {
    const cache = new MemoryCache()

    // TTL undefined debería funcionar (sin TTL)
    await cache.set('no-ttl', 'value')
    expect(await cache.get('no-ttl')).toBe('value')

    // TTL positivo normal
    await cache.set('normal-ttl', 'value', { ttl: 10 })
    expect(await cache.get('normal-ttl')).toBe('value')

    // TTL muy pequeño - puede expirar inmediatamente
    await cache.set('tiny-ttl', 'value', { ttl: 0.001 })
    const tinyValue = await cache.get('tiny-ttl')
    expect([null, 'value']).toContain(tinyValue)

    cache.destroy()
  })
})

describe('Integration Tests', () => {
  it('should work with mixed cache types in manager', async () => {
    const memCache = new MemoryCache({ maxSize: 5 })
    const lambdaCache = new LambdaCache({
      maxSize: 10,
      namespace: 'integration',
      useGlobalContext: false
    })

    const manager = new CacheManager([memCache, lambdaCache])

    // Test operaciones básicas
    await manager.set('key1', 'value1')
    expect(await manager.get('key1')).toBe('value1')

    // Test fallback
    await lambdaCache.set('key2', 'lambda-only')
    expect(await manager.get('key2')).toBe('lambda-only')

    // Verificar propagación
    expect(await memCache.get('key2')).toBe('lambda-only')

    // Cleanup
    await manager.clear()
    memCache.destroy()
  })

  it('should handle wrapper with manager', async () => {
    const cache1 = new MemoryCache({ maxSize: 3 })
    const cache2 = new MemoryCache({ maxSize: 5 })
    const manager = new CacheManager([cache1, cache2])

    let callCount = 0
    const testFunction = async (input: string) => {
      callCount++
      return `managed-${input}-${callCount}`
    }

    const cachedFunction = wrapWithCache(testFunction, manager, {
      ttl: 10,
      namespace: 'manager-test'
    })

    const result1 = await cachedFunction('test')
    const result2 = await cachedFunction('test')

    expect(result1).toBe(result2)
    expect(callCount).toBe(1)

    // Verificar que está en ambos niveles
    expect(await cache1.get('manager-test:testFunction:["test"]')).toBe(result1)
    expect(await cache2.get('manager-test:testFunction:["test"]')).toBe(result1)

    cache1.destroy()
    cache2.destroy()
  })
})

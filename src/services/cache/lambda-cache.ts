import type {
  CacheAdapter,
  CacheEntry,
  CacheOptions,
  CacheStats
} from './types'

export interface LambdaCacheOptions extends CacheOptions {
  /** Máximo número de entradas (default: 100 para Lambda) */
  maxSize?: number
  /** Limpiar cache cada N invocaciones (default: 100) */
  cleanupInterval?: number
  /** Estrategia de eviction */
  evictionPolicy?: 'lru' | 'fifo' | 'lfu'
  /** Usar contexto global de Lambda */
  useGlobalContext?: boolean
}

/**
 * Cache optimizado para AWS Lambda execution context
 *
 * Características:
 * - Persistente entre invocaciones Lambda
 * - Optimizado para cold/warm starts
 * - Limpieza automática para evitar memory leaks
 * - Tamaño pequeño por defecto (Lambda tiene memory limits)
 */
export class LambdaCache<T = any> implements CacheAdapter<T> {
  private static globalStore = new Map<string, any>()
  private static globalAccessOrder = new Map<string, number>()
  private static globalAccessCounter = 0
  private static invocationCount = 0

  private store: Map<string, CacheEntry<T>>
  private accessOrder: Map<string, number>
  private accessCounter = 0
  private _stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    coldStarts: 0,
    warmStarts: 0
  }

  private readonly instanceId: string
  private lastCleanup = 0

  constructor (private options: LambdaCacheOptions = {}) {
    const {
      maxSize = 100, // Más pequeño que memory cache por default
      cleanupInterval = 100,
      evictionPolicy = 'lru',
      useGlobalContext = true,
      namespace = 'lambda'
    } = options

    this.options = {
      maxSize,
      cleanupInterval,
      evictionPolicy,
      useGlobalContext,
      namespace,
      ...options
    }

    this.instanceId = `${namespace}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    if (useGlobalContext) {
      // Usar contexto global compartido entre invocaciones
      this.store = LambdaCache.globalStore as Map<string, CacheEntry<T>>
      this.accessOrder = LambdaCache.globalAccessOrder
      this.accessCounter = LambdaCache.globalAccessCounter

      // Detectar cold start
      if (LambdaCache.invocationCount === 0) {
        this._stats.coldStarts++
        this.logLambdaEvent('COLD_START', { instanceId: this.instanceId })
      } else {
        this._stats.warmStarts++
        this.logLambdaEvent('WARM_START', {
          instanceId: this.instanceId,
          invocationCount: LambdaCache.invocationCount
        })
      }

      LambdaCache.invocationCount++
    } else {
      // Usar contexto local (se pierde entre invocaciones)
      this.store = new Map()
      this.accessOrder = new Map()
    }

    // Limpiar periódicamente
    this.scheduleCleanup()
  }

  async get (key: string): Promise<T | null> {
    const fullKey = this.buildKey(key)
    const entry = this.store.get(fullKey)

    if (!entry) {
      this._stats.misses++
      return null
    }

    // Verificar TTL
    if (this.isExpired(entry)) {
      this.store.delete(fullKey)
      this.accessOrder.delete(fullKey)
      this._stats.misses++
      return null
    }

    // Actualizar estadísticas de acceso
    entry.accessCount++
    entry.lastAccessAt = Date.now()
    this.accessOrder.set(fullKey, ++this.accessCounter)
    this._stats.hits++

    return entry.value
  }

  async set (key: string, value: T, options: LambdaCacheOptions = {}): Promise<void> {
    const fullKey = this.buildKey(key)
    const now = Date.now()
    const ttl = options.ttl ?? this.options.ttl
    // Si TTL es negativo o 0, tratar como sin TTL (Infinity)
    const expiresAt = ttl && ttl > 0 ? now + (ttl * 1000) : Infinity

    // Verificar límite de tamaño antes de agregar
    if (this.store.size >= (this.options.maxSize || 100) && !this.store.has(fullKey)) {
      await this.evictLeastUsed()
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      createdAt: now,
      accessCount: 0,
      lastAccessAt: now
    }

    this.store.set(fullKey, entry)
    this.accessOrder.set(fullKey, ++this.accessCounter)
    this._stats.sets++

    // Actualizar contador global si usamos contexto global
    if (this.options.useGlobalContext) {
      LambdaCache.globalAccessCounter = this.accessCounter
    }
  }

  async delete (key: string): Promise<boolean> {
    const fullKey = this.buildKey(key)
    const deleted = this.store.delete(fullKey)
    if (deleted) {
      this.accessOrder.delete(fullKey)
      this._stats.deletes++
    }
    return deleted
  }

  async has (key: string): Promise<boolean> {
    const fullKey = this.buildKey(key)
    const entry = this.store.get(fullKey)
    if (!entry) return false

    if (this.isExpired(entry)) {
      this.store.delete(fullKey)
      this.accessOrder.delete(fullKey)
      return false
    }

    return true
  }

  async clear (): Promise<void> {
    if (this.options.useGlobalContext) {
      // Solo limpiar nuestro namespace
      const keysToDelete = Array.from(this.store.keys())
        .filter(key => key.startsWith(`${this.options.namespace}:`))

      for (const key of keysToDelete) {
        this.store.delete(key)
        this.accessOrder.delete(key)
      }
    } else {
      this.store.clear()
      this.accessOrder.clear()
    }

    this.accessCounter = 0
    this._stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      coldStarts: this._stats.coldStarts,
      warmStarts: this._stats.warmStarts
    }
  }

  async stats (): Promise<CacheStats & { lambda: LambdaStats }> {
    await this.cleanupExpired()

    const totalAccess = this._stats.hits + this._stats.misses
    const hitRate = totalAccess > 0 ? this._stats.hits / totalAccess : 0

    return {
      size: this.getNamespaceSize(),
      hits: this._stats.hits,
      misses: this._stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage: this.estimateMemoryUsage(),
      lambda: {
        instanceId: this.instanceId,
        invocationCount: LambdaCache.invocationCount,
        coldStarts: this._stats.coldStarts,
        warmStarts: this._stats.warmStarts,
        isWarm: LambdaCache.invocationCount > 1,
        globalStoreSize: this.store.size,
        namespaceSize: this.getNamespaceSize(),
        lastCleanup: this.lastCleanup,
        memoryPressure: this.calculateMemoryPressure()
      }
    }
  }

  async mget (keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>()

    for (const key of keys) {
      result.set(key, await this.get(key))
    }

    return result
  }

  async mset (entries: Map<string, T>, options: LambdaCacheOptions = {}): Promise<void> {
    const promises = Array.from(entries.entries()).map(([key, value]) =>
      this.set(key, value, options)
    )

    await Promise.all(promises)
  }

  async mdel (keys: string[]): Promise<number> {
    let deletedCount = 0

    for (const key of keys) {
      if (await this.delete(key)) {
        deletedCount++
      }
    }

    return deletedCount
  }

  // Métodos específicos de Lambda

  /**
   * Obtener información del contexto de ejecución Lambda
   */
  getLambdaContext () {
    return {
      instanceId: this.instanceId,
      invocationCount: LambdaCache.invocationCount,
      isWarm: LambdaCache.invocationCount > 1,
      globalStoreSize: this.store.size,
      namespaceSize: this.getNamespaceSize()
    }
  }

  /**
   * Limpiar cache basado en memoria disponible
   */
  async cleanupByMemoryPressure (targetSize?: number): Promise<number> {
    const target = targetSize || Math.floor((this.options.maxSize || 100) * 0.7)
    let cleaned = 0

    while (this.getNamespaceSize() > target) {
      const evicted = await this.evictLeastUsed()
      if (!evicted) break
      cleaned++
    }

    this.logLambdaEvent('MEMORY_CLEANUP', { cleaned, targetSize: target })
    return cleaned
  }

  /**
   * Preparar cache para cold start
   */
  async prepareColdStart (): Promise<void> {
    // Limpiar entradas expiradas antes de cold start
    await this.cleanupExpired()

    // Reducir tamaño si está muy lleno
    if (this.getNamespaceSize() > (this.options.maxSize || 100) * 0.8) {
      await this.cleanupByMemoryPressure()
    }

    this.logLambdaEvent('COLD_START_PREP', {
      size: this.getNamespaceSize(),
      memoryUsage: this.estimateMemoryUsage()
    })
  }

  // Métodos privados
  private buildKey (key: string): string {
    return `${this.options.namespace}:${key}`
  }

  private isExpired (entry: CacheEntry<T>): boolean {
    return entry.expiresAt < Date.now()
  }

  private getNamespaceSize (): number {
    if (!this.options.useGlobalContext) return this.store.size

    let count = 0
    for (const key of this.store.keys()) {
      if (key.startsWith(`${this.options.namespace}:`)) {
        count++
      }
    }
    return count
  }

  private async evictLeastUsed (): Promise<boolean> {
    const policy = this.options.evictionPolicy || 'lru'
    let keyToEvict: string | undefined

    const namespaceKeys = Array.from(this.store.keys())
      .filter(key => key.startsWith(`${this.options.namespace}:`))

    if (namespaceKeys.length === 0) return false

    switch (policy) {
      case 'lru':
        keyToEvict = this.findLRUKey(namespaceKeys)
        break
      case 'lfu':
        keyToEvict = this.findLFUKey(namespaceKeys)
        break
      case 'fifo':
        keyToEvict = this.findFIFOKey(namespaceKeys)
        break
    }

    if (keyToEvict) {
      const originalKey = keyToEvict.replace(`${this.options.namespace}:`, '')
      await this.delete(originalKey)
      this._stats.evictions++
      return true
    }

    return false
  }

  private findLRUKey (keys: string[]): string | undefined {
    let oldestAccess = Infinity
    let lruKey: string | undefined

    for (const key of keys) {
      const accessTime = this.accessOrder.get(key) || 0
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime
        lruKey = key
      }
    }

    return lruKey
  }

  private findLFUKey (keys: string[]): string | undefined {
    let minAccessCount = Infinity
    let lfuKey: string | undefined

    for (const key of keys) {
      const entry = this.store.get(key)
      if (entry && entry.accessCount < minAccessCount) {
        minAccessCount = entry.accessCount
        lfuKey = key
      }
    }

    return lfuKey
  }

  private findFIFOKey (keys: string[]): string | undefined {
    let oldestCreation = Infinity
    let fifoKey: string | undefined

    for (const key of keys) {
      const entry = this.store.get(key)
      if (entry && entry.createdAt < oldestCreation) {
        oldestCreation = entry.createdAt
        fifoKey = key
      }
    }

    return fifoKey
  }

  private async cleanupExpired (): Promise<void> {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.store) {
      if (key.startsWith(`${this.options.namespace}:`) && entry.expiresAt < now) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.store.delete(key)
      this.accessOrder.delete(key)
    }

    this.lastCleanup = now
  }

  private scheduleCleanup (): void {
    const interval = this.options.cleanupInterval || 100

    // Limpiar cada N invocaciones (no usar setInterval en Lambda)
    if (LambdaCache.invocationCount % interval === 0) {
      this.cleanupExpired()
    }
  }

  private estimateMemoryUsage (): number {
    let bytes = 0

    for (const [key, entry] of this.store) {
      if (key.startsWith(`${this.options.namespace}:`)) {
        bytes += key.length * 2 // UTF-16
        bytes += JSON.stringify(entry.value).length * 2
        bytes += 150 // Overhead del objeto entry
      }
    }

    return bytes
  }

  private calculateMemoryPressure (): number {
    const currentSize = this.getNamespaceSize()
    const maxSize = this.options.maxSize || 100
    return currentSize / maxSize
  }

  private logLambdaEvent (event: string, data: any): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[LambdaCache:${event}]`, JSON.stringify({
        timestamp: new Date().toISOString(),
        instanceId: this.instanceId,
        invocationCount: LambdaCache.invocationCount,
        ...data
      }))
    }
  }
}

// Tipos específicos de Lambda
export interface LambdaStats {
  instanceId: string
  invocationCount: number
  coldStarts: number
  warmStarts: number
  isWarm: boolean
  globalStoreSize: number
  namespaceSize: number
  lastCleanup: number
  memoryPressure: number
}

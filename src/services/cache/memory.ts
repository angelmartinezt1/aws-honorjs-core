import type {
  CacheAdapter,
  CacheEntry,
  CacheStats,
  MemoryCacheOptions
} from './types'

/**
 * Cache en memoria con LRU, TTL y limpieza automática
 */
export class MemoryCache<T = any> implements CacheAdapter<T> {
  private store = new Map<string, CacheEntry<T>>()
  private accessOrder = new Map<string, number>() // Para LRU
  private _stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0
  }

  private cleanupTimer?: NodeJS.Timeout
  private accessCounter = 0

  constructor (private options: MemoryCacheOptions = {}) {
    const {
      maxSize = 1000,
      evictionPolicy = 'lru',
      cleanupInterval = 60000, // 1 minuto
      autoCleanup = true
    } = options

    this.options = {
      maxSize,
      evictionPolicy,
      cleanupInterval,
      autoCleanup,
      ...options
    }

    // Iniciar limpieza automática
    if (autoCleanup) {
      this.startCleanupTimer()
    }
  }

  async get (key: string): Promise<T | null> {
    const entry = this.store.get(key)

    if (!entry) {
      this._stats.misses++
      return null
    }

    // Verificar TTL
    if (this.isExpired(entry)) {
      this.store.delete(key)
      this.accessOrder.delete(key)
      this._stats.misses++
      return null
    }

    // Actualizar estadísticas de acceso
    entry.accessCount++
    entry.lastAccessAt = Date.now()
    this.accessOrder.set(key, ++this.accessCounter)
    this._stats.hits++

    return entry.value
  }

  async set (key: string, value: T, options: MemoryCacheOptions = {}): Promise<void> {
    const now = Date.now()
    const ttl = options.ttl ?? this.options.ttl
    const expiresAt = ttl ? now + (ttl * 1000) : Infinity

    // Verificar límite de tamaño antes de agregar
    if (this.store.size >= (this.options.maxSize || 1000) && !this.store.has(key)) {
      await this.evictLeastUsed()
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      createdAt: now,
      accessCount: 0,
      lastAccessAt: now
    }

    this.store.set(key, entry)
    this.accessOrder.set(key, ++this.accessCounter)
    this._stats.sets++
  }

  async delete (key: string): Promise<boolean> {
    const deleted = this.store.delete(key)
    if (deleted) {
      this.accessOrder.delete(key)
      this._stats.deletes++
    }
    return deleted
  }

  async has (key: string): Promise<boolean> {
    const entry = this.store.get(key)
    if (!entry) return false

    if (this.isExpired(entry)) {
      this.store.delete(key)
      this.accessOrder.delete(key)
      return false
    }

    return true
  }

  async clear (): Promise<void> {
    this.store.clear()
    this.accessOrder.clear()
    this.accessCounter = 0
    this._stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    }
  }

  async stats (): Promise<CacheStats> {
    await this.cleanupExpired() // Limpiar antes de calcular stats

    const totalAccess = this._stats.hits + this._stats.misses
    const hitRate = totalAccess > 0 ? this._stats.hits / totalAccess : 0

    return {
      size: this.store.size,
      hits: this._stats.hits,
      misses: this._stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage: this.estimateMemoryUsage()
    }
  }

  async mget (keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>()

    for (const key of keys) {
      result.set(key, await this.get(key))
    }

    return result
  }

  async mset (entries: Map<string, T>, options: MemoryCacheOptions = {}): Promise<void> {
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

  // Métodos privados
  private isExpired (entry: CacheEntry<T>): boolean {
    return entry.expiresAt < Date.now()
  }

  private async evictLeastUsed (): Promise<void> {
    if (this.store.size === 0) return

    const policy = this.options.evictionPolicy || 'lru'
    let keyToEvict: string | undefined

    switch (policy) {
      case 'lru':
        keyToEvict = this.findLRUKey()
        break
      case 'lfu':
        keyToEvict = this.findLFUKey()
        break
      case 'fifo':
        keyToEvict = this.findFIFOKey()
        break
    }

    if (keyToEvict) {
      await this.delete(keyToEvict)
      this._stats.evictions++
    }
  }

  private findLRUKey (): string | undefined {
    let oldestAccess = Infinity
    let lruKey: string | undefined

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime
        lruKey = key
      }
    }

    return lruKey
  }

  private findLFUKey (): string | undefined {
    let minAccessCount = Infinity
    let lfuKey: string | undefined

    for (const [key, entry] of this.store) {
      if (entry.accessCount < minAccessCount) {
        minAccessCount = entry.accessCount
        lfuKey = key
      }
    }

    return lfuKey
  }

  private findFIFOKey (): string | undefined {
    let oldestCreation = Infinity
    let fifoKey: string | undefined

    for (const [key, entry] of this.store) {
      if (entry.createdAt < oldestCreation) {
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
      if (entry.expiresAt < now) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.store.delete(key)
      this.accessOrder.delete(key)
    }
  }

  private startCleanupTimer (): void {
    const interval = this.options.cleanupInterval || 60000

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired()
    }, interval)

    // No bloquear el proceso en Node.js
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref()
    }
  }

  private estimateMemoryUsage (): number {
    let bytes = 0

    for (const [key, entry] of this.store) {
      // Estimación aproximada
      bytes += key.length * 2 // UTF-16
      bytes += JSON.stringify(entry.value).length * 2
      bytes += 100 // Overhead del objeto entry
    }

    return bytes
  }

  // Método para detener limpieza automática
  destroy (): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }
}

/**
 * Tipos base para el sistema de cache
 */

export interface CacheOptions {
  /** Tiempo de vida en segundos (TTL) */
  ttl?: number
  /** Namespace para agrupar keys */
  namespace?: string
  /** Máximo número de entradas (para memory cache) */
  maxSize?: number
  /** Función de serialización personalizada */
  serialize?: (value: any) => string
  /** Función de deserialización personalizada */
  deserialize?: (value: string) => any
}

export interface CacheEntry<T = any> {
  /** Valor almacenado */
  value: T
  /** Timestamp de expiración */
  expiresAt: number
  /** Timestamp de creación */
  createdAt: number
  /** Número de accesos */
  accessCount: number
  /** Último acceso */
  lastAccessAt: number
}

export interface CacheStats {
  /** Número total de entradas */
  size: number
  /** Número de hits */
  hits: number
  /** Número de misses */
  misses: number
  /** Ratio hit/miss */
  hitRate: number
  /** Memoria utilizada estimada (bytes) */
  memoryUsage?: number
  /** Tiempo promedio de acceso */
  avgAccessTime?: number
}

export interface CacheAdapter<T = any> {
  /** Obtener valor del cache */
  get(key: string): Promise<T | null>

  /** Guardar valor en cache */
  set(key: string, value: T, options?: CacheOptions): Promise<void>

  /** Eliminar entrada del cache */
  delete(key: string): Promise<boolean>

  /** Verificar si existe una key */
  has(key: string): Promise<boolean>

  /** Limpiar todo el cache */
  clear(): Promise<void>

  /** Obtener estadísticas */
  stats(): Promise<CacheStats>

  /** Obtener múltiples valores */
  mget(keys: string[]): Promise<Map<string, T | null>>

  /** Guardar múltiples valores */
  mset(entries: Map<string, T>, options?: CacheOptions): Promise<void>

  /** Eliminar múltiples entradas */
  mdel(keys: string[]): Promise<number>
}

export interface MemoryCacheOptions extends CacheOptions {
  /** Máximo número de entradas (default: 1000) */
  maxSize?: number
  /** Estrategia de eviction cuando se alcanza maxSize */
  evictionPolicy?: 'lru' | 'fifo' | 'lfu'
  /** Intervalo de limpieza de entradas expiradas en ms */
  cleanupInterval?: number
  /** Habilitar limpieza automática */
  autoCleanup?: boolean
}

export type CacheKey = string | number
export type CacheValue = any

// Eventos del cache
export interface CacheEvents {
  hit: { key: string; value: any }
  miss: { key: string }
  set: { key: string; value: any; ttl?: number }
  delete: { key: string }
  clear: {}
  evict: { key: string; reason: 'ttl' | 'size' | 'manual' }
}

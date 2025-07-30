/**
 * Convierte una string de camelCase a snake_case
 */
export function camelToSnake (str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

/**
 * Convierte una string de snake_case a camelCase
 */
export function snakeToCamel (str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Transforma las keys de un objeto de camelCase a snake_case recursivamente
 */
export function transformKeysToSnake (obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysToSnake(item))
  }

  const transformed: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key)
    transformed[snakeKey] = transformKeysToSnake(value)
  }

  return transformed
}

/**
 * Transforma las keys de un objeto de snake_case a camelCase recursivamente
 */
export function transformKeysToCamel (obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysToCamel(item))
  }

  const transformed: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key)
    transformed[camelKey] = transformKeysToCamel(value)
  }

  return transformed
}

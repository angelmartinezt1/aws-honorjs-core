import type { Context } from 'hono'
import type {
  ErrorResponseOptions,
  StandardResponse,
  SuccessResponseOptions
} from './response-types'
import { transformKeysToSnake } from './transform'

/**
 * Helper para crear respuestas de éxito estandarizadas
 */
export function createSuccessResponse (
  c: Context,
  options: SuccessResponseOptions = {}
) {
  const startTime = c.get('startTime') as number || Date.now()
  const executionTime = `${Date.now() - startTime}ms`
  const requestId = c.get('requestId')

  const response: StandardResponse = {
    metadata: {
      success: true,
      message: options.message || 'Operation completed successfully',
      timestamp: new Date().toISOString(),
      executionTime,
      requestId,
      httpCode: 200
    },
    data: options.data || null
  }

  // Transformar a snake_case antes de enviar
  const transformedResponse = transformKeysToSnake(response)

  return c.json(transformedResponse, 200 as const)
}

/**
 * Helper para crear respuestas de error estandarizadas
 */
export function createErrorResponse (
  c: Context,
  options: ErrorResponseOptions
) {
  const startTime = c.get('startTime') as number || Date.now()
  const executionTime = `${Date.now() - startTime}ms`
  const requestId = c.get('requestId')
  const httpCode = options.httpCode || 400

  const response: StandardResponse = {
    metadata: {
      success: false,
      message: options.message,
      timestamp: new Date().toISOString(),
      executionTime,
      requestId,
      httpCode
    },
    data: options.data || null
  }

  // Transformar a snake_case antes de enviar
  const transformedResponse = transformKeysToSnake(response)

  return c.json(transformedResponse, httpCode as any)
}

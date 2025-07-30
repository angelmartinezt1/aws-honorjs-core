// Metadata para respuestas en camelCase (uso interno)
export interface ResponseMetadata {
  success: boolean;
  message: string;
  timestamp: string;
  executionTime: string;
  requestId?: string;
  httpCode?: number;
}

// Respuesta estándar en camelCase (uso interno)
export interface StandardResponse<T = any> {
  metadata: ResponseMetadata;
  data: T | null;
}

// Opciones para crear respuesta
export interface ResponseOptions {
  message?: string;
  data?: any;
  success?: boolean;
  httpCode?: number;
}

// Helper para respuestas de éxito
export interface SuccessResponseOptions<T = any> {
  message?: string;
  data?: T;
}

// Helper para respuestas de error
export interface ErrorResponseOptions {
  message: string;
  data?: any;
  httpCode?: number;
}

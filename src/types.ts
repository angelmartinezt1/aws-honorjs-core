// Tipos básicos para el contexto de Hono
export interface HonoContext {
  Variables: {
    // Variables que se pueden setear en el contexto
    userId?: string;
    tenantId?: string;
    user?: any;
  };
}

// Configuración del entorno
export type Environment = 'development' | 'production' | 'test'

// Configuración básica de la aplicación
export interface BaseConfig {
  environment?: Environment;
  debug?: boolean;
}

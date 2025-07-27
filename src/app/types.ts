import type { HonoContext } from '../types';

// Usamos any para evitar problemas de tipos con CORS
// Ya que Hono no exporta el tipo CORSOptions públicamente
export type CorsOptions = any

// Opciones básicas para crear una app
export interface CoreAppOptions {
  // Configuración del entorno
  environment?: 'development' | 'production' | 'test';
  debug?: boolean;

  // Middleware básico
  cors?: boolean | CorsOptions;
  logging?: boolean;
}

// Contexto extendido que tendrán nuestras apps
export interface AppContext extends HonoContext {
  Variables: HonoContext['Variables'] & {
    // Variables adicionales que añadiremos
    requestId?: string;
    startTime?: number;
  };
}

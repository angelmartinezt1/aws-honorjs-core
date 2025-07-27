// Logger básico sin dependencias externas (para empezar)
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, any>;
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'pretty';
}

class Logger {
  private level: LogLevel
  private format: 'json' | 'pretty'

  constructor (options: LoggerOptions = {}) {
    this.level = options.level || 'info'
    this.format = options.format || 'json'
  }

  private shouldLog (level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    }

    return levels[level] >= levels[this.level]
  }

  private formatMessage (level: LogLevel, message: string, data?: Record<string, any>): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data && { data })
    }

    if (this.format === 'pretty') {
      const dataStr = data ? ` ${JSON.stringify(data)}` : ''
      return `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${dataStr}`
    }

    return JSON.stringify(entry)
  }

  debug (message: string, data?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data))
    }
  }

  info (message: string, data?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data))
    }
  }

  warn (message: string, data?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data))
    }
  }

  error (message: string, data?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data))
    }
  }
}

// Instancia por defecto
export const logger = new Logger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: process.env.NODE_ENV === 'development' ? 'pretty' : 'json'
})

// Export de la clase para crear instancias personalizadas
export { Logger };


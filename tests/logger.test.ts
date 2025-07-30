import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../src/utils/logger'

describe('Logger', () => {
  // Mock console methods
  const mockConsole = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  beforeEach(() => {
    mockConsole.log.mockClear()
    mockConsole.warn.mockClear()
    mockConsole.error.mockClear()
  })

  it('should create logger with default options', () => {
    const logger = new Logger()
    expect(logger).toBeInstanceOf(Logger)
  })

  it('should log info messages by default', () => {
    const logger = new Logger()
    logger.info('Test message')

    expect(mockConsole.log).toHaveBeenCalledOnce()
    const loggedMessage = mockConsole.log.mock.calls[0][0]
    expect(loggedMessage).toContain('Test message')
    expect(loggedMessage).toContain('"level":"info"')
  })

  it('should not log debug messages with info level', () => {
    const logger = new Logger({ level: 'info' })
    logger.debug('Debug message')

    expect(mockConsole.log).not.toHaveBeenCalled()
  })

  it('should log debug messages with debug level', () => {
    const logger = new Logger({ level: 'debug' })
    logger.debug('Debug message')

    expect(mockConsole.log).toHaveBeenCalledOnce()
  })

  it('should format pretty messages correctly', () => {
    const logger = new Logger({ format: 'pretty' })
    logger.info('Test message', { key: 'value' })

    const loggedMessage = mockConsole.log.mock.calls[0][0]
    expect(loggedMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(loggedMessage).toContain('INFO: Test message')
    expect(loggedMessage).toContain('{"key":"value"}')
  })

  it('should format JSON messages correctly', () => {
    const logger = new Logger({ format: 'json' })
    logger.info('Test message', { key: 'value' })

    const loggedMessage = mockConsole.log.mock.calls[0][0]
    const parsed = JSON.parse(loggedMessage)

    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('Test message')
    expect(parsed.data).toEqual({ key: 'value' })
    expect(parsed.timestamp).toBeDefined()
  })

  it('should use correct console methods for different levels', () => {
    const logger = new Logger({ level: 'debug' })

    logger.debug('Debug')
    logger.info('Info')
    logger.warn('Warn')
    logger.error('Error')

    expect(mockConsole.log).toHaveBeenCalledTimes(2) // debug and info
    expect(mockConsole.warn).toHaveBeenCalledOnce()
    expect(mockConsole.error).toHaveBeenCalledOnce()
  })
})

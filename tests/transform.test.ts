import { describe, expect, it } from 'vitest'
import {
  camelToSnake,
  snakeToCamel,
  transformKeysToCamel,
  transformKeysToSnake
} from '../src/utils/transform'

describe('Transform utilities', () => {
  describe('camelToSnake', () => {
    it('should convert camelCase to snake_case', () => {
      expect(camelToSnake('firstName')).toBe('first_name')
      expect(camelToSnake('userId')).toBe('user_id')
      expect(camelToSnake('createdAt')).toBe('created_at')
      expect(camelToSnake('httpStatusCode')).toBe('http_status_code')
    })

    it('should handle single words', () => {
      expect(camelToSnake('user')).toBe('user')
      expect(camelToSnake('id')).toBe('id')
    })

    it('should handle empty strings', () => {
      expect(camelToSnake('')).toBe('')
    })
  })

  describe('snakeToCamel', () => {
    it('should convert snake_case to camelCase', () => {
      expect(snakeToCamel('first_name')).toBe('firstName')
      expect(snakeToCamel('user_id')).toBe('userId')
      expect(snakeToCamel('created_at')).toBe('createdAt')
      expect(snakeToCamel('http_status_code')).toBe('httpStatusCode')
    })

    it('should handle single words', () => {
      expect(snakeToCamel('user')).toBe('user')
      expect(snakeToCamel('id')).toBe('id')
    })
  })

  describe('transformKeysToSnake', () => {
    it('should transform object keys to snake_case', () => {
      const input = {
        firstName: 'John',
        lastName: 'Doe',
        userId: 123,
        createdAt: '2025-01-01'
      }

      const expected = {
        first_name: 'John',
        last_name: 'Doe',
        user_id: 123,
        created_at: '2025-01-01'
      }

      expect(transformKeysToSnake(input)).toEqual(expected)
    })

    it('should handle nested objects', () => {
      const input = {
        userData: {
          firstName: 'John',
          profileSettings: {
            emailNotifications: true,
            darkMode: false
          }
        }
      }

      const expected = {
        user_data: {
          first_name: 'John',
          profile_settings: {
            email_notifications: true,
            dark_mode: false
          }
        }
      }

      expect(transformKeysToSnake(input)).toEqual(expected)
    })

    it('should handle arrays', () => {
      const input = {
        userList: [
          { firstName: 'John', userId: 1 },
          { firstName: 'Jane', userId: 2 }
        ]
      }

      const expected = {
        user_list: [
          { first_name: 'John', user_id: 1 },
          { first_name: 'Jane', user_id: 2 }
        ]
      }

      expect(transformKeysToSnake(input)).toEqual(expected)
    })

    it('should handle primitive values', () => {
      expect(transformKeysToSnake('string')).toBe('string')
      expect(transformKeysToSnake(123)).toBe(123)
      expect(transformKeysToSnake(null)).toBe(null)
      expect(transformKeysToSnake(undefined)).toBe(undefined)
    })
  })

  describe('transformKeysToCamel', () => {
    it('should transform object keys to camelCase', () => {
      const input = {
        first_name: 'John',
        last_name: 'Doe',
        user_id: 123,
        created_at: '2025-01-01'
      }

      const expected = {
        firstName: 'John',
        lastName: 'Doe',
        userId: 123,
        createdAt: '2025-01-01'
      }

      expect(transformKeysToCamel(input)).toEqual(expected)
    })

    it('should handle nested objects', () => {
      const input = {
        user_data: {
          first_name: 'John',
          profile_settings: {
            email_notifications: true,
            dark_mode: false
          }
        }
      }

      const expected = {
        userData: {
          firstName: 'John',
          profileSettings: {
            emailNotifications: true,
            darkMode: false
          }
        }
      }

      expect(transformKeysToCamel(input)).toEqual(expected)
    })
  })
})

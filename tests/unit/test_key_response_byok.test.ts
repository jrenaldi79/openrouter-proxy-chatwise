/**
 * Unit tests for KeyResponse BYOK (Bring Your Own Key) functionality
 *
 * OpenRouter tracks BYOK usage separately:
 * - `usage` - Regular OpenRouter credits consumed
 * - `byok_usage` - BYOK credits consumed (tracked separately)
 *
 * For pure BYOK accounts: usage = 0, byok_usage > 0
 */

import { KeyResponse } from '../../src/models/KeyResponse';

describe('KeyResponse BYOK Support', () => {
  describe('BYOK field parsing', () => {
    it('should parse byok_usage from OpenRouter response', () => {
      const response = {
        limit: 100,
        usage: 0,
        byok_usage: 25.5,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.byok_usage).toBe(25.5);
    });

    it('should parse all BYOK period fields', () => {
      const response = {
        limit: 100,
        usage: 0,
        byok_usage: 100.5,
        byok_usage_daily: 10.5,
        byok_usage_weekly: 50.25,
        byok_usage_monthly: 100.5,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.byok_usage).toBe(100.5);
      expect(keyResponse.byok_usage_daily).toBe(10.5);
      expect(keyResponse.byok_usage_weekly).toBe(50.25);
      expect(keyResponse.byok_usage_monthly).toBe(100.5);
    });

    it('should handle missing byok_usage (backwards compatibility)', () => {
      const response = {
        limit: 100,
        usage: 25,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.byok_usage).toBeUndefined();
    });

    it('should parse include_byok_in_limit flag', () => {
      const response = {
        limit: 100,
        usage: 0,
        byok_usage: 25,
        include_byok_in_limit: true,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.include_byok_in_limit).toBe(true);
    });
  });

  describe('isByokAccount()', () => {
    it('should return true when byok_usage > 0 and usage === 0', () => {
      const response = {
        limit: null,
        usage: 0,
        byok_usage: 50.25,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(true);
    });

    it('should return true when byok_usage > 0 and usage is negligible (< $0.01)', () => {
      // Real-world scenario: user has tiny regular usage but significant BYOK usage
      const response = {
        limit: 100,
        usage: 0.0025014, // Negligible amount
        byok_usage: 94.830455235, // Significant BYOK usage
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(true);
      expect(keyResponse.getEffectiveUsage()).toBeCloseTo(94.83, 1);
    });

    it('should return true when byok_usage > usage (BYOK is dominant)', () => {
      const response = {
        limit: 100,
        usage: 5,
        byok_usage: 50, // BYOK is 10x regular usage
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(true);
      expect(keyResponse.getEffectiveUsage()).toBe(50);
    });

    it('should return false when usage > byok_usage (regular credits dominant)', () => {
      const response = {
        limit: 100,
        usage: 25,
        byok_usage: 10, // Regular usage is higher
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(false);
      expect(keyResponse.getEffectiveUsage()).toBe(25);
    });

    it('should return false when byok_usage is 0', () => {
      const response = {
        limit: 100,
        usage: 25,
        byok_usage: 0,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(false);
    });

    it('should return false when byok_usage is undefined', () => {
      const response = {
        limit: 100,
        usage: 25,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(false);
    });

    it('should return false when both usage and byok_usage are 0', () => {
      const response = {
        limit: 100,
        usage: 0,
        byok_usage: 0,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(false);
    });
  });

  describe('getEffectiveUsage()', () => {
    it('should return byok_usage for pure BYOK accounts', () => {
      const response = {
        limit: null,
        usage: 0,
        byok_usage: 125.75,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.getEffectiveUsage()).toBe(125.75);
    });

    it('should return usage for regular accounts', () => {
      const response = {
        limit: 100,
        usage: 45.5,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.getEffectiveUsage()).toBe(45.5);
    });

    it('should return usage for mixed accounts (both usage and byok_usage)', () => {
      const response = {
        limit: 100,
        usage: 30,
        byok_usage: 20,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      // When usage > 0, show regular usage (not BYOK)
      expect(keyResponse.getEffectiveUsage()).toBe(30);
    });

    it('should return 0 for accounts with no usage', () => {
      const response = {
        limit: 100,
        usage: 0,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.getEffectiveUsage()).toBe(0);
    });

    it('should handle edge case: usage = 0 and byok_usage = 0', () => {
      const response = {
        limit: 100,
        usage: 0,
        byok_usage: 0,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.getEffectiveUsage()).toBe(0);
    });
  });

  describe('toJSON() with BYOK fields', () => {
    it('should include byok_usage in JSON output', () => {
      const response = {
        limit: null,
        usage: 0,
        byok_usage: 50.5,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);
      const json = keyResponse.toJSON();

      expect(json.byok_usage).toBe(50.5);
    });

    it('should include all BYOK period fields in JSON output', () => {
      const response = {
        limit: 100,
        usage: 0,
        byok_usage: 100,
        byok_usage_daily: 10,
        byok_usage_weekly: 50,
        byok_usage_monthly: 100,
        include_byok_in_limit: false,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);
      const json = keyResponse.toJSON();

      expect(json.byok_usage).toBe(100);
      expect(json.byok_usage_daily).toBe(10);
      expect(json.byok_usage_weekly).toBe(50);
      expect(json.byok_usage_monthly).toBe(100);
      expect(json.include_byok_in_limit).toBe(false);
    });
  });

  describe('Real-world BYOK scenarios', () => {
    it('should handle pure BYOK user with unlimited account', () => {
      // Typical BYOK user: limit=null (unlimited), usage=0, byok_usage=actual usage
      const response = {
        limit: null,
        usage: 0,
        byok_usage: 234.56,
        byok_usage_daily: 12.34,
        byok_usage_weekly: 56.78,
        byok_usage_monthly: 234.56,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isUnlimitedAccount()).toBe(true);
      expect(keyResponse.isByokAccount()).toBe(true);
      expect(keyResponse.getEffectiveUsage()).toBe(234.56);
    });

    it('should handle user with credit limit using BYOK', () => {
      // User with prepaid credits who also uses BYOK
      const response = {
        limit: 500,
        usage: 100,
        byok_usage: 50,
        include_byok_in_limit: false,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isUnlimitedAccount()).toBe(false);
      expect(keyResponse.isByokAccount()).toBe(false); // usage > byok_usage
      expect(keyResponse.getEffectiveUsage()).toBe(100); // Show regular usage
      expect(keyResponse.getRemainingCredits()).toBe(400); // 500 - 100 = 400
    });

    it('should calculate remaining credits using BYOK usage for BYOK accounts', () => {
      // Real-world BYOK scenario: limit=100, usage=negligible, byok_usage=94.83
      const response = {
        limit: 100,
        usage: 0.0025014,
        byok_usage: 94.830455235,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(true);
      expect(keyResponse.getEffectiveUsage()).toBeCloseTo(94.83, 1);
      // Remaining should be limit - byok_usage, not limit - usage
      expect(keyResponse.getRemainingCredits()).toBeCloseTo(5.17, 1); // 100 - 94.83 ≈ 5.17
    });

    it('should handle new user with no usage', () => {
      const response = {
        limit: 100,
        usage: 0,
      };

      const keyResponse = KeyResponse.fromApiResponse(response);

      expect(keyResponse.isByokAccount()).toBe(false);
      expect(keyResponse.getEffectiveUsage()).toBe(0);
    });
  });
});

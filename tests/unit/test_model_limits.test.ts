import {
  getModelLimits,
  getWarningLevel,
  getWarningPercentage,
  type ModelLimits,
} from '../../src/config/model-limits';

describe('Model Limits', () => {
  describe('getModelLimits', () => {
    describe('Anthropic models', () => {
      it('should detect claude-3-5-sonnet as anthropic with 400k limit', () => {
        const limits = getModelLimits('claude-3-5-sonnet');
        expect(limits.provider).toBe('anthropic');
        expect(limits.maxContextTokens).toBe(400000);
      });

      it('should detect claude-3-opus as anthropic with 400k limit', () => {
        const limits = getModelLimits('claude-3-opus');
        expect(limits.provider).toBe('anthropic');
        expect(limits.maxContextTokens).toBe(400000);
      });

      it('should detect anthropic/claude-3.5-sonnet as anthropic', () => {
        const limits = getModelLimits('anthropic/claude-3.5-sonnet');
        expect(limits.provider).toBe('anthropic');
        expect(limits.maxContextTokens).toBe(400000);
      });
    });

    describe('OpenAI models', () => {
      it('should detect gpt-4o as openai with 128k limit', () => {
        const limits = getModelLimits('gpt-4o');
        expect(limits.provider).toBe('openai');
        expect(limits.maxContextTokens).toBe(128000);
      });

      it('should detect gpt-4-turbo as openai with 128k limit', () => {
        const limits = getModelLimits('gpt-4-turbo');
        expect(limits.provider).toBe('openai');
        expect(limits.maxContextTokens).toBe(128000);
      });

      it('should detect gpt-4 as openai with 32k limit', () => {
        const limits = getModelLimits('gpt-4');
        expect(limits.provider).toBe('openai');
        expect(limits.maxContextTokens).toBe(32000);
      });

      it('should detect gpt-3.5-turbo as openai with 32k limit', () => {
        const limits = getModelLimits('gpt-3.5-turbo');
        expect(limits.provider).toBe('openai');
        expect(limits.maxContextTokens).toBe(32000);
      });

      it('should detect openai/gpt-4o as openai', () => {
        const limits = getModelLimits('openai/gpt-4o');
        expect(limits.provider).toBe('openai');
        expect(limits.maxContextTokens).toBe(128000);
      });
    });

    describe('Gemini models', () => {
      it('should detect gemini-1.5-pro as gemini with 1M limit', () => {
        const limits = getModelLimits('gemini-1.5-pro');
        expect(limits.provider).toBe('gemini');
        expect(limits.maxContextTokens).toBe(1000000);
      });

      it('should detect gemini-2.0-flash as gemini with 1M limit', () => {
        const limits = getModelLimits('gemini-2.0-flash');
        expect(limits.provider).toBe('gemini');
        expect(limits.maxContextTokens).toBe(1000000);
      });

      it('should detect google/gemini-pro as gemini', () => {
        const limits = getModelLimits('google/gemini-pro');
        expect(limits.provider).toBe('gemini');
        expect(limits.maxContextTokens).toBe(1000000);
      });
    });

    describe('Grok models', () => {
      it('should detect grok-2 as grok with 128k limit', () => {
        const limits = getModelLimits('grok-2');
        expect(limits.provider).toBe('grok');
        expect(limits.maxContextTokens).toBe(128000);
      });

      it('should detect x-ai/grok-beta as grok', () => {
        const limits = getModelLimits('x-ai/grok-beta');
        expect(limits.provider).toBe('grok');
        expect(limits.maxContextTokens).toBe(128000);
      });
    });

    describe('Unknown models', () => {
      it('should return unknown provider with default 32k limit for unrecognized models', () => {
        const limits = getModelLimits('some-random-model');
        expect(limits.provider).toBe('unknown');
        expect(limits.maxContextTokens).toBe(32000);
      });
    });

    describe('Case insensitivity', () => {
      it('should detect Claude models regardless of case', () => {
        expect(getModelLimits('CLAUDE-3-OPUS').provider).toBe('anthropic');
        expect(getModelLimits('Claude-3-Sonnet').provider).toBe('anthropic');
      });

      it('should detect GPT models regardless of case', () => {
        expect(getModelLimits('GPT-4O').provider).toBe('openai');
        expect(getModelLimits('Gpt-4-Turbo').provider).toBe('openai');
      });
    });
  });

  describe('getWarningPercentage', () => {
    it('should calculate correct percentage for anthropic model', () => {
      const limits: ModelLimits = { provider: 'anthropic', maxContextTokens: 400000 };
      expect(getWarningPercentage(100000, limits)).toBe(25);
      expect(getWarningPercentage(160000, limits)).toBe(40);
      expect(getWarningPercentage(200000, limits)).toBe(50);
    });

    it('should calculate correct percentage for openai model', () => {
      const limits: ModelLimits = { provider: 'openai', maxContextTokens: 128000 };
      expect(getWarningPercentage(32000, limits)).toBe(25);
      expect(getWarningPercentage(64000, limits)).toBe(50);
    });

    it('should handle edge cases', () => {
      const limits: ModelLimits = { provider: 'anthropic', maxContextTokens: 400000 };
      expect(getWarningPercentage(0, limits)).toBe(0);
      expect(getWarningPercentage(400000, limits)).toBe(100);
    });

    it('should round to 2 decimal places', () => {
      const limits: ModelLimits = { provider: 'anthropic', maxContextTokens: 400000 };
      expect(getWarningPercentage(123456, limits)).toBe(30.86);
    });
  });

  describe('getWarningLevel', () => {
    const anthropicLimits: ModelLimits = {
      provider: 'anthropic',
      maxContextTokens: 400000,
    };

    it('should return "none" for usage below 25%', () => {
      expect(getWarningLevel(50000, anthropicLimits)).toBe('none');
      expect(getWarningLevel(99999, anthropicLimits)).toBe('none');
    });

    it('should return "info" for usage at 25% to <40%', () => {
      expect(getWarningLevel(100000, anthropicLimits)).toBe('info'); // exactly 25%
      expect(getWarningLevel(120000, anthropicLimits)).toBe('info');
      expect(getWarningLevel(159999, anthropicLimits)).toBe('info');
    });

    it('should return "warning" for usage at 40% to <50%', () => {
      expect(getWarningLevel(160000, anthropicLimits)).toBe('warning'); // exactly 40%
      expect(getWarningLevel(180000, anthropicLimits)).toBe('warning');
      expect(getWarningLevel(199999, anthropicLimits)).toBe('warning');
    });

    it('should return "critical" for usage at 50% or above', () => {
      expect(getWarningLevel(200000, anthropicLimits)).toBe('critical'); // exactly 50%
      expect(getWarningLevel(250000, anthropicLimits)).toBe('critical');
      expect(getWarningLevel(400000, anthropicLimits)).toBe('critical');
    });

    it('should work correctly with different model limits', () => {
      const openaiLimits: ModelLimits = {
        provider: 'openai',
        maxContextTokens: 128000,
      };
      expect(getWarningLevel(30000, openaiLimits)).toBe('none'); // <25%
      expect(getWarningLevel(32000, openaiLimits)).toBe('info'); // 25%
      expect(getWarningLevel(51200, openaiLimits)).toBe('warning'); // 40%
      expect(getWarningLevel(64000, openaiLimits)).toBe('critical'); // 50%
    });

    it('should handle edge cases', () => {
      expect(getWarningLevel(0, anthropicLimits)).toBe('none');
      expect(getWarningLevel(1, anthropicLimits)).toBe('none');
    });
  });
});

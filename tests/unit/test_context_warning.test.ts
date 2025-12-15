import {
  generateContextWarning,
  createWarningSSEChunk,
} from '../../src/utils/context-warning';
import type { WarningLevel } from '../../src/config/model-limits';

describe('Context Warning', () => {
  describe('generateContextWarning', () => {
    it('should return null for "none" level', () => {
      const warning = generateContextWarning('none', 50000, 400000);
      expect(warning).toBeNull();
    });

    it('should generate info message for 25% usage', () => {
      const warning = generateContextWarning('info', 100000, 400000);
      expect(warning).toContain('📊 Context:');
      expect(warning).toContain('25%');
      expect(warning).toContain('100k/400k tokens');
      expect(warning).toContain('Your conversation is getting long');
    });

    it('should generate warning message for 40% usage', () => {
      const warning = generateContextWarning('warning', 160000, 400000);
      expect(warning).toContain('⚠️ Context:');
      expect(warning).toContain('40%');
      expect(warning).toContain('160k/400k tokens');
      expect(warning).toContain('Consider summarizing');
      expect(warning).toContain('starting a new chat');
    });

    it('should generate critical message for 50% usage', () => {
      const warning = generateContextWarning('critical', 200000, 400000);
      expect(warning).toContain('🚨 Context:');
      expect(warning).toContain('50%');
      expect(warning).toContain('200k/400k tokens');
      expect(warning).toContain('Approaching limit');
      expect(warning).toContain('response quality may degrade');
    });

    it('should format token numbers with k suffix', () => {
      const warning = generateContextWarning('info', 123456, 400000);
      expect(warning).toContain('123k');
      expect(warning).toContain('400k');
    });

    it('should handle small token counts without k suffix', () => {
      const warning = generateContextWarning('info', 999, 2000);
      expect(warning).toContain('999/2k');
    });

    it('should calculate percentage correctly', () => {
      const warning = generateContextWarning('warning', 51200, 128000);
      expect(warning).toContain('40%');
    });

    it('should round percentages to whole numbers', () => {
      const warning = generateContextWarning('info', 123456, 400000);
      expect(warning).toMatch(/\d+%/); // Should contain percentage
      expect(warning).not.toMatch(/\d+\.\d+%/); // No decimal points in percentage
    });
  });

  describe('createWarningSSEChunk', () => {
    it('should format warning as SSE data chunk', () => {
      const warningText = '⚠️ Test warning';
      const chunk = createWarningSSEChunk(warningText);

      expect(chunk).toContain('data: {');
      expect(chunk).toContain('"choices"');
      expect(chunk).toContain('"delta"');
      expect(chunk).toContain('"content"');
      expect(chunk).toContain('\\n\\n⚠️ Test warning');
      expect(chunk.endsWith('\n\n')).toBe(true);
    });

    it('should prepend newlines to warning text', () => {
      const warningText = '📊 Context warning';
      const chunk = createWarningSSEChunk(warningText);

      expect(chunk).toContain('\\n\\n📊 Context warning');
    });

    it('should create valid JSON in SSE format', () => {
      const warningText = '🚨 Critical';
      const chunk = createWarningSSEChunk(warningText);

      // Extract JSON from "data: {...}"
      const jsonMatch = chunk.match(/data: ({.*})/);
      expect(jsonMatch).not.toBeNull();

      if (jsonMatch && jsonMatch[1]) {
        const json = JSON.parse(jsonMatch[1]);
        expect(json.choices).toBeDefined();
        expect(json.choices[0]).toBeDefined();
        expect(json.choices[0].delta).toBeDefined();
        expect(json.choices[0].delta.content).toContain('🚨 Critical');
      }
    });

    it('should include index:0 in choice', () => {
      const chunk = createWarningSSEChunk('Test');
      const jsonMatch = chunk.match(/data: ({.*})/);

      if (jsonMatch && jsonMatch[1]) {
        const json = JSON.parse(jsonMatch[1]);
        expect(json.choices[0].index).toBe(0);
      }
    });

    it('should escape special characters properly', () => {
      const warningText = 'Test with "quotes" and \\slashes';
      const chunk = createWarningSSEChunk(warningText);

      // Should be valid JSON despite special chars
      const jsonMatch = chunk.match(/data: ({.*})/);
      expect(jsonMatch).not.toBeNull();

      if (jsonMatch && jsonMatch[1]) {
        const json = JSON.parse(jsonMatch[1]);
        expect(json.choices[0].delta.content).toContain('quotes');
      }
    });
  });

  describe('Integration: generateContextWarning + createWarningSSEChunk', () => {
    it('should create valid SSE chunk from generated warning', () => {
      const warning = generateContextWarning('warning', 160000, 400000);
      expect(warning).not.toBeNull();

      if (warning) {
        const chunk = createWarningSSEChunk(warning);
        expect(chunk).toContain('data: {');
        expect(chunk).toContain('⚠️ Context:');
        expect(chunk).toContain('40%');
      }
    });

    it('should handle all warning levels', () => {
      const levels: WarningLevel[] = ['info', 'warning', 'critical'];

      levels.forEach((level) => {
        const warning = generateContextWarning(level, 100000, 200000);
        expect(warning).not.toBeNull();

        if (warning) {
          const chunk = createWarningSSEChunk(warning);
          expect(chunk).toContain('data: {');
          expect(chunk).toContain('"content"');
        }
      });
    });
  });
});

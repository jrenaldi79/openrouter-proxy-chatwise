// Set environment variable BEFORE imports (envConfig loads on first import)
process.env.OPENROUTER_API_KEY = 'test-api-key-12345';

import { ModelDataService } from '../../src/services/ModelDataService';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ModelDataService', () => {
  let service: ModelDataService;

  beforeEach(() => {
    service = new ModelDataService();
    jest.clearAllMocks();
  });

  describe('fetchModels', () => {
    it('should fetch models from OpenRouter API', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'anthropic/claude-3.5-sonnet',
              context_length: 200000,
              per_request_limits: {
                prompt_tokens: 180000,
                completion_tokens: 20000,
              },
            },
            {
              id: 'openai/gpt-4o',
              context_length: 128000,
              per_request_limits: {
                prompt_tokens: 120000,
                completion_tokens: 8000,
              },
            },
          ],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await service.fetchModels();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Bearer /),
          }),
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await service.fetchModels();

      expect(result).toBe(false);
    });

    it('should cache fetched models', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'test-model',
              context_length: 10000,
              per_request_limits: {
                prompt_tokens: 8000,
                completion_tokens: 2000,
              },
            },
          ],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      await service.fetchModels();

      const limits = service.getModelLimits('test-model');
      expect(limits).toEqual({
        maxContextTokens: 10000,
        maxPromptTokens: 8000,
      });
    });
  });

  describe('getModelLimits', () => {
    it('should return cached model limits if available', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'anthropic/claude-3.5-sonnet',
              context_length: 200000,
              per_request_limits: {
                prompt_tokens: 180000,
                completion_tokens: 20000,
              },
            },
          ],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);
      await service.fetchModels();

      const limits = service.getModelLimits('anthropic/claude-3.5-sonnet');
      expect(limits).toEqual({
        maxContextTokens: 200000,
        maxPromptTokens: 180000,
      });
    });

    it('should return null for unknown models', () => {
      const limits = service.getModelLimits('unknown/model');
      expect(limits).toBeNull();
    });

    it('should handle models without per_request_limits', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'test-model',
              context_length: 10000,
              // No per_request_limits field
            },
          ],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);
      await service.fetchModels();

      const limits = service.getModelLimits('test-model');
      expect(limits).toEqual({
        maxContextTokens: 10000,
        maxPromptTokens: 10000, // Fallback to context_length
      });
    });

    it('should handle models with null context_length', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'test-model',
              context_length: null,
              per_request_limits: {
                prompt_tokens: 8000,
                completion_tokens: 2000,
              },
            },
          ],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);
      await service.fetchModels();

      const limits = service.getModelLimits('test-model');
      expect(limits).toEqual({
        maxContextTokens: 8000, // Use prompt_tokens as fallback
        maxPromptTokens: 8000,
      });
    });
  });

  describe('isInitialized', () => {
    it('should return false before fetchModels is called', () => {
      expect(service.isInitialized()).toBe(false);
    });

    it('should return true after successful fetchModels', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'test-model',
              context_length: 10000,
              per_request_limits: {
                prompt_tokens: 8000,
                completion_tokens: 2000,
              },
            },
          ],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);
      await service.fetchModels();

      expect(service.isInitialized()).toBe(true);
    });

    it('should return false after failed fetchModels', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API error'));
      await service.fetchModels();

      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('getModelCount', () => {
    it('should return 0 before fetching models', () => {
      expect(service.getModelCount()).toBe(0);
    });

    it('should return correct count after fetching', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 'model-1', context_length: 10000 },
            { id: 'model-2', context_length: 20000 },
            { id: 'model-3', context_length: 30000 },
          ],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);
      await service.fetchModels();

      expect(service.getModelCount()).toBe(3);
    });
  });
});
